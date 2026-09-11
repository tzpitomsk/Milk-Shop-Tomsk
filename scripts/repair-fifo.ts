import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = true;

type VirtualBatch = {
  id: number;
  supplyItemId: number | null;
  productId: number;
  originalQuantity: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
};

type PlannedOrderBatch = {
  orderItemId: number;
  orderId: number;
  batchId: number;
  quantity: number;
  purchaseCost: number;
};

type Problem = {
  level: "CRITICAL" | "WARNING";
  message: string;
};

const problems: Problem[] = [];

function critical(message: string) {
  problems.push({
    level: "CRITICAL",
    message,
  });

  console.log(`  🔴 ${message}`);
}

function warning(message: string) {
  problems.push({
    level: "WARNING",
    message,
  });

  console.log(`  🟡 ${message}`);
}

function formatDate(date: Date) {
  return date.toISOString();
}

function hoursBetween(a: Date, b: Date) {
  return Math.abs(
    a.getTime() - b.getTime()
  ) / 1000 / 60 / 60;
}

async function main() {
  console.log("========================================");
  console.log("🔧 REPAIR FIFO");
  console.log("========================================");
  console.log("");
  console.log("⚠️ РЕЖИМ DRY RUN");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");
  console.log("DRY_RUN =", DRY_RUN);
  console.log("");

  if (!DRY_RUN) {
    throw new Error(
      "Этот файл предназначен только для DRY RUN"
    );
  }

  /*
   * ==========================================================
   * Загружаем все необходимые данные.
   *
   * НИКАКИХ create/update/delete здесь нет.
   * ==========================================================
   */

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },

    include: {
      batches: {
        orderBy: [
          {
            receivedAt: "asc",
          },
          {
            id: "asc",
          },
        ],
      },

      supplyItems: {
        orderBy: [
          {
            supply: {
              date: "asc",
            },
          },
          {
            id: "asc",
          },
        ],

        include: {
          supply: true,
        },
      },

      orderItems: {
        orderBy: [
          {
            order: {
              date: "asc",
            },
          },
          {
            id: "asc",
          },
        ],

        include: {
          order: true,
          batches: true,
          ReturnBatch: true,
        },
      },
    },
  });

  /*
   * ==========================================================
   * Общая статистика
   * ==========================================================
   */

  let totalSupply = 0;
  let totalOrders = 0;
  let totalReturns = 0;

  let totalPlannedOrderBatches = 0;

  const allPlannedOrderBatches: PlannedOrderBatch[] = [];

  /*
   * ==========================================================
   * Обрабатываем товары
   * ==========================================================
   */

  for (const product of products) {
    console.log("");
    console.log("========================================");
    console.log(
      `🥛 ТОВАР #${product.id}: ${product.name}`
    );
    console.log("========================================");

    /*
     * --------------------------------------------------------
     * 1. SupplyItem
     * --------------------------------------------------------
     */

    const supplyItems = product.supplyItems.map(
      (item) => ({
        id: item.id,
        quantity: item.quantity,
        cost: item.cost,
        date: item.supply.date,
      })
    );

    const suppliedQuantity = supplyItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    totalSupply += suppliedQuantity;

    console.log("");
    console.log("📦 ПОСТАВКИ");
    console.log(
      `  Всего поставлено: ${suppliedQuantity} шт`
    );

    /*
     * --------------------------------------------------------
     * 2. Сопоставление SupplyItem → Batch
     *
     * ВАЖНО:
     *
     * Мы НЕ изменяем реальные Batch.
     *
     * Создаем только виртуальное представление.
     *
     * Для каждой поставки ищем ближайшую по времени
     * еще не использованную Batch.
     * --------------------------------------------------------
     */

    const usedBatchIds = new Set<number>();

    const virtualBatches: VirtualBatch[] = [];

    for (const supply of supplyItems) {
      const candidates = product.batches
        .filter(
          (batch) =>
            !usedBatchIds.has(batch.id)
        )
        .map((batch) => ({
          batch,
          distance: hoursBetween(
            batch.receivedAt,
            supply.date
          ),
        }))
        .sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance;
          }

          return a.batch.id - b.batch.id;
        });

      if (candidates.length === 0) {
        critical(
          `SupplyItem #${supply.id}: ${supply.quantity} шт × ${supply.cost} ₽ → Batch не найдена`
        );

        continue;
      }

      const selected = candidates[0];

      const batch = selected.batch;

      usedBatchIds.add(batch.id);

      virtualBatches.push({
        id: batch.id,

        supplyItemId: supply.id,

        productId: product.id,

        originalQuantity: supply.quantity,

        quantity: supply.quantity,

        purchaseCost: supply.cost,

        receivedAt: batch.receivedAt,

        expiryDate: batch.expiryDate,
      });

      console.log(
        `  SupplyItem #${supply.id} → Batch #${batch.id}: ` +
          `${supply.quantity} шт × ${supply.cost} ₽`
      );

      if (selected.distance > 24) {
        warning(
          `SupplyItem #${supply.id} → Batch #${batch.id}: ` +
            `разница ${selected.distance.toFixed(2)} ч`
        );
      }

      if (
        batch.purchaseCost !== supply.cost
      ) {
        warning(
          `Batch #${batch.id}: текущая purchaseCost=${batch.purchaseCost}, ` +
            `SupplyItem cost=${supply.cost}`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * Batch без SupplyItem
     * --------------------------------------------------------
     */

    for (const batch of product.batches) {
      if (!usedBatchIds.has(batch.id)) {
        warning(
          `Batch #${batch.id}: не удалось сопоставить с SupplyItem ` +
            `(текущий остаток ${batch.quantity} шт, cost ${batch.purchaseCost} ₽)`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 3. FIFO порядок
     *
     * Сначала expiryDate.
     * Затем receivedAt.
     * Затем id.
     * --------------------------------------------------------
     */

    virtualBatches.sort((a, b) => {
      const expiryDiff =
        a.expiryDate.getTime() -
        b.expiryDate.getTime();

      if (expiryDiff !== 0) {
        return expiryDiff;
      }

      const receivedDiff =
        a.receivedAt.getTime() -
        b.receivedAt.getTime();

      if (receivedDiff !== 0) {
        return receivedDiff;
      }

      return a.id - b.id;
    });

    console.log("");
    console.log("🔄 FIFO ПОРЯДОК");

    for (const batch of virtualBatches) {
      console.log(
        `  Batch #${batch.id}: ` +
          `expiry=${formatDate(batch.expiryDate)}, ` +
          `received=${formatDate(batch.receivedAt)}, ` +
          `вирт. остаток=${batch.quantity}, ` +
          `cost=${batch.purchaseCost} ₽`
      );
    }

    /*
     * --------------------------------------------------------
     * 4. Проверяем реальные OrderBatch
     * --------------------------------------------------------
     */

    console.log("");
    console.log("🛒 ТЕКУЩИЕ ORDERBATCH");

    for (const item of product.orderItems) {
      const existingQuantity =
        item.batches.reduce(
          (sum, batch) =>
            sum + batch.quantity,
          0
        );

      if (
        existingQuantity !== item.quantity
      ) {
        critical(
          `Order #${item.orderId}, OrderItem #${item.id}: ` +
            `продано=${item.quantity}, ` +
            `существующий OrderBatch=${existingQuantity}`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 5. Строим новое виртуальное FIFO распределение
     *
     * НИЧЕГО НЕ СОЗДАЕМ В БД.
     * --------------------------------------------------------
     */

    console.log("");
    console.log("🧮 ПЛАНИРУЕМОЕ FIFO РАСПРЕДЕЛЕНИЕ");

    for (const item of product.orderItems) {
      let remaining = item.quantity;

      totalOrders += item.quantity;

      if (remaining <= 0) {
        continue;
      }

      console.log("");
      console.log(
        `  Order #${item.orderId}, OrderItem #${item.id}: ` +
          `${item.quantity} шт`
      );

      for (const batch of virtualBatches) {
        if (remaining <= 0) {
          break;
        }

        if (batch.quantity <= 0) {
          continue;
        }

        const take = Math.min(
          batch.quantity,
          remaining
        );

        allPlannedOrderBatches.push({
          orderItemId: item.id,

          orderId: item.orderId,

          batchId: batch.id,

          quantity: take,

          purchaseCost:
            batch.purchaseCost,
        });

        totalPlannedOrderBatches += take;

        batch.quantity -= take;

        remaining -= take;

        console.log(
          `    → Batch #${batch.id}: ` +
            `${take} шт × ${batch.purchaseCost} ₽`
        );
      }

      if (remaining > 0) {
        critical(
          `Order #${item.orderId}, OrderItem #${item.id}: ` +
            `не удалось распределить ${remaining} шт`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 6. Возвраты
     *
     * Возврат НЕ участвует в первоначальном распределении
     * продаж.
     *
     * После распределения продаж возвращаем товар
     * в соответствующую виртуальную партию.
     * --------------------------------------------------------
     */

    console.log("");
    console.log("↩️ ВОЗВРАТЫ");

    for (const item of product.orderItems) {
      if (item.returned <= 0) {
        continue;
      }

      totalReturns += item.returned;

      console.log(
        `  Order #${item.orderId}, OrderItem #${item.id}: ` +
          `returned=${item.returned}`
      );

      const returnBatches = item.ReturnBatch;

      const recordedReturnQuantity =
        returnBatches.reduce(
          (sum, item) =>
            sum + item.quantity,
          0
        );

      if (
        recordedReturnQuantity !==
        item.returned
      ) {
        critical(
          `Order #${item.orderId}, OrderItem #${item.id}: ` +
            `returned=${item.returned}, ` +
            `ReturnBatch=${recordedReturnQuantity}`
        );
      }

      for (const returnBatch of returnBatches) {
        const virtualBatch =
          virtualBatches.find(
            (batch) =>
              batch.id ===
              returnBatch.batchId
          );

        if (!virtualBatch) {
          critical(
            `ReturnBatch #${returnBatch.id}: ` +
              `Batch #${returnBatch.batchId} отсутствует среди ` +
              `сопоставленных партий`
          );

          continue;
        }

        virtualBatch.quantity +=
          returnBatch.quantity;

        console.log(
          `    ReturnBatch #${returnBatch.id}: ` +
            `Batch #${returnBatch.batchId} +${returnBatch.quantity} шт`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 7. Финальные виртуальные остатки партий
     * --------------------------------------------------------
     */

    console.log("");
    console.log("📦 ВИРТУАЛЬНЫЕ ОСТАТКИ ПОСЛЕ ПРОДАЖ И ВОЗВРАТОВ");

    let virtualStock = 0;

    for (const batch of virtualBatches) {
      virtualStock += batch.quantity;

      const realBatch =
        product.batches.find(
          (item) =>
            item.id === batch.id
        );

      console.log(
        `  Batch #${batch.id}: ` +
          `вирт=${batch.quantity}, ` +
          `реал=${realBatch?.quantity ?? "N/A"}`
      );

      if (
        realBatch &&
        realBatch.quantity !==
          batch.quantity
      ) {
        warning(
          `Batch #${batch.id}: ` +
            `виртуальный остаток=${batch.quantity}, ` +
            `текущий Batch.quantity=${realBatch.quantity}`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 8. Проверка Product.stock
     * --------------------------------------------------------
     */

    const realBatchStock =
      product.batches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    console.log("");
    console.log("📊 ОСТАТОК");

    console.log(
      `  Product.stock: ${product.stock}`
    );

    console.log(
      `  Сумма Batch.quantity: ${realBatchStock}`
    );

    console.log(
      `  Виртуальный остаток: ${virtualStock}`
    );

    if (
      product.stock !== realBatchStock
    ) {
      critical(
        `Product.stock=${product.stock}, ` +
          `но сумма Batch=${realBatchStock}`
      );
    }

    /*
     * --------------------------------------------------------
     * 9. Проверка формулы:
     *
     * поставлено - продано + возвращено
     * --------------------------------------------------------
     */

    const expectedStock =
      suppliedQuantity -
      product.orderItems.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      ) +
      product.orderItems.reduce(
        (sum, item) =>
          sum + item.returned,
        0
      );

    console.log("");
    console.log("🧮 БАЛАНС");

    console.log(
      `  Поставлено: ${suppliedQuantity}`
    );

    console.log(
      `  Продано: ${product.orderItems.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      )}`
    );

    console.log(
      `  Возвращено: ${product.orderItems.reduce(
        (sum, item) =>
          sum + item.returned,
        0
      )}`
    );

    console.log(
      `  Теоретический остаток: ${expectedStock}`
    );

    console.log(
      `  Реальный Batch.stock: ${realBatchStock}`
    );

    if (
      expectedStock !== realBatchStock
    ) {
      critical(
        `Баланс не сходится: ` +
          `ожидалось=${expectedStock}, ` +
          `Batch=${realBatchStock}, ` +
          `разница=${realBatchStock - expectedStock}`
      );
    }
  }

  /*
   * ==========================================================
   * ГЛОБАЛЬНЫЙ ИТОГ
   * ==========================================================
   */

  console.log("");
  console.log("========================================");
  console.log("📈 ИТОГ DRY RUN");
  console.log("========================================");

  console.log(
    `📦 Поставлено: ${totalSupply}`
  );

  console.log(
    `🛒 Продано: ${totalOrders}`
  );

  console.log(
    `↩️ Возвращено: ${totalReturns}`
  );

  console.log(
    `🔗 Планируемое количество OrderBatch: ${totalPlannedOrderBatches}`
  );

  console.log(
    `📋 Планируемых записей OrderBatch: ${allPlannedOrderBatches.length}`
  );

  console.log("");

  console.log(
    `🔴 CRITICAL: ${
      problems.filter(
        (problem) =>
          problem.level === "CRITICAL"
      ).length
    }`
  );

  console.log(
    `🟡 WARNING: ${
      problems.filter(
        (problem) =>
          problem.level === "WARNING"
      ).length
    }`
  );

  /*
   * ==========================================================
   * Список критических проблем
   * ==========================================================
   */

  const criticalProblems =
    problems.filter(
      (problem) =>
        problem.level === "CRITICAL"
    );

  if (criticalProblems.length > 0) {
    console.log("");
    console.log("========================================");
    console.log("🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ");
    console.log("========================================");

    for (const problem of criticalProblems) {
      console.log(
        `🔴 ${problem.message}`
      );
    }
  }

  /*
   * ==========================================================
   * Список предупреждений
   * ==========================================================
   */

  const warningProblems =
    problems.filter(
      (problem) =>
        problem.level === "WARNING"
    );

  if (warningProblems.length > 0) {
    console.log("");
    console.log("========================================");
    console.log("⚠️ ПРЕДУПРЕЖДЕНИЯ");
    console.log("========================================");

    for (const problem of warningProblems) {
      console.log(
        `🟡 ${problem.message}`
      );
    }
  }

  /*
   * ==========================================================
   * Финальная информация
   * ==========================================================
   */

  console.log("");
  console.log("========================================");
  console.log("🛡️ DRY RUN ЗАВЕРШЕН");
  console.log("========================================");
  console.log("");
  console.log("⚠️ НИЧЕГО НЕ ИЗМЕНЕНО В БАЗЕ ДАННЫХ.");
  console.log("");
  console.log("Проверено:");
  console.log("  ✓ SupplyItem → Batch");
  console.log("  ✓ FIFO порядок");
  console.log("  ✓ OrderItem → виртуальный OrderBatch");
  console.log("  ✓ ReturnBatch");
  console.log("  ✓ Остатки Batch");
  console.log("  ✓ Product.stock");
  console.log("  ✓ Общий баланс");
  console.log("");
  console.log(
    "Следующий этап — анализ этого отчёта перед реальным repair."
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("========================================");
    console.error("❌ ОШИБКА DRY RUN");
    console.error("========================================");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });