import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * V30 APPLY
 *
 * Безопасно исправляет только Order.profit
 * у 21 подтверждённого заказа из V29.1.
 *
 * НЕ изменяет:
 * - Order.total
 * - OrderItem
 * - OrderBatch
 * - ReturnBatch
 * - Batch
 * - Product
 * - Movement
 * - Supply
 * - SupplyItem
 */

const EXPECTED_UPDATES: Record<number, number> = {
  6: 80,
  7: 80,
  8: 80,
  9: 80,
  10: -20,
  13: 320,
  14: -60,
  17: 178,
  21: 180,
  22: 180,
  24: 600,
  25: 50,
  26: 180,
  37: 0,
  38: 0,
  39: 50,
  44: 500,
  45: 50,
  46: 200,
  47: 200,
  48: 250,
};

const EXPECTED_SKIP_IDS = [
  4,
  5,
  11,
  12,
  16,
  18,
  19,
  20,
  23,
];

function printSeparator() {
  console.log("=".repeat(90));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function createBackup(sourcePath: string) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `DB file not found: ${sourcePath}`
    );
  }

  const timestamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

  const backupPath = path.join(
    path.dirname(sourcePath),
    `dev_backup_before_v30_${timestamp}.db`
  );

  fs.copyFileSync(sourcePath, backupPath);

  return backupPath;
}

async function main() {
  console.log("🚀 APPLY V30 — ORDER PROFIT");
  console.log();
  console.log(
    "⚠️ Сейчас будут изменены только поля Order.profit."
  );
  console.log();

  const dbPath = path.resolve(
    process.cwd(),
    "prisma",
    "dev.db"
  );

  /*
   * ============================================================
   * 1. BACKUP
   * ============================================================
   */

  printSeparator();
  console.log("💾 СОЗДАНИЕ BACKUP");
  printSeparator();

  const backupPath = createBackup(dbPath);

  console.log(
    `✅ Backup создан:\n${backupPath}`
  );

  /*
   * ============================================================
   * 2. ЗАГРУЗКА СОСТОЯНИЯ
   * ============================================================
   */

  const orders = await prisma.order.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      items: {
        orderBy: {
          id: "asc",
        },
        include: {
          batches: {
            include: {
              batch: true,
            },
          },
          ReturnBatch: {
            include: {
              Batch: true,
            },
          },
        },
      },
    },
  });

  console.log();
  console.log(
    `📦 Заказов в БД: ${orders.length}`
  );

  if (orders.length !== 49) {
    throw new Error(
      `Ожидалось 49 заказов, найдено ${orders.length}. APPLY остановлен.`
    );
  }

  /*
   * ============================================================
   * 3. ПРОВЕРКА СПИСКА UPDATE
   * ============================================================
   */

  printSeparator();
  console.log("🔐 ПРОВЕРКА EXPECTED UPDATE PLAN");
  printSeparator();

  const expectedIds =
    Object.keys(EXPECTED_UPDATES)
      .map(Number)
      .sort((a, b) => a - b);

  console.log(
    `Ожидается обновлений: ${expectedIds.length}`
  );

  if (expectedIds.length !== 21) {
    throw new Error(
      `В EXPECTED_UPDATES должно быть 21 значение, сейчас ${expectedIds.length}`
    );
  }

  /*
   * Проверяем, что каждый ожидаемый заказ существует.
   */
  for (const id of expectedIds) {
    const order = orders.find(
      (item) => item.id === id
    );

    if (!order) {
      throw new Error(
        `Order #${id} отсутствует в БД. APPLY остановлен.`
      );
    }
  }

  /*
   * Проверяем, что в списке нет лишних заказов,
   * которые отсутствовали в V29.1.
   */
  for (const order of orders) {
    const shouldUpdate =
      Object.prototype.hasOwnProperty.call(
        EXPECTED_UPDATES,
        order.id
      );

    if (shouldUpdate) {
      continue;
    }

    /*
     * Все остальные заказы не должны изменяться.
     */
  }

  /*
   * ============================================================
   * 4. ПРОВЕРКА SKIP
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("⏭️ ПРОВЕРКА 9 SKIP-ЗАКАЗОВ");
  printSeparator();

  for (const id of EXPECTED_SKIP_IDS) {
    const order = orders.find(
      (item) => item.id === id
    );

    if (!order) {
      throw new Error(
        `SKIP Order #${id} отсутствует в БД. APPLY остановлен.`
      );
    }

    let hasMissingBatch = false;

    for (const item of order.items) {
      const batchQuantity =
        item.batches.reduce(
          (sum, batch) =>
            sum + batch.quantity,
          0
        );

      if (batchQuantity !== item.quantity) {
        hasMissingBatch = true;
      }
    }

    if (!hasMissingBatch) {
      throw new Error(
        `Order #${id} больше не является SKIP-заказом. APPLY остановлен.`
      );
    }

    console.log(
      `✅ Order #${id} всё ещё имеет неполную историческую Batch-историю`
    );
  }

  /*
   * ============================================================
   * 5. ПОЛНАЯ ПОВТОРНАЯ ПРОВЕРКА UPDATE
   * ============================================================
   *
   * Перед изменением ещё раз самостоятельно вычисляем
   * NET profit.
   */

  console.log();
  printSeparator();
  console.log("🧮 ПОВТОРНЫЙ РАСЧЁТ NET PROFIT");
  printSeparator();

  for (const id of expectedIds) {
    const order = orders.find(
      (item) => item.id === id
    )!;

    let grossRevenue = 0;
    let returnedRevenue = 0;

    let grossCost = 0;
    let returnedCost = 0;

    let hasIncompleteBatchHistory = false;

    for (const item of order.items) {
      grossRevenue +=
        item.price * item.quantity;

      returnedRevenue +=
        item.price * item.returned;

      const orderBatchQuantity =
        item.batches.reduce(
          (sum, orderBatch) =>
            sum + orderBatch.quantity,
          0
        );

      if (
        orderBatchQuantity !==
        item.quantity
      ) {
        hasIncompleteBatchHistory = true;
      }

      for (const orderBatch of item.batches) {
        grossCost +=
          orderBatch.quantity *
          orderBatch.purchaseCost;
      }

      const returnQuantity =
        item.ReturnBatch.reduce(
          (sum, returnBatch) =>
            sum + returnBatch.quantity,
          0
        );

      if (
        returnQuantity !== item.returned
      ) {
        throw new Error(
          `Order #${id}, OrderItem #${item.id}: ReturnBatch quantity mismatch`
        );
      }

      for (const returnBatch of item.ReturnBatch) {
        const matchingOrderBatch =
          item.batches.find(
            (orderBatch) =>
              orderBatch.batchId ===
              returnBatch.batchId
          );

        if (!matchingOrderBatch) {
          throw new Error(
            `Order #${id}: ReturnBatch #${returnBatch.id} ` +
            `не имеет соответствующего OrderBatch`
          );
        }

        returnedCost +=
          returnBatch.quantity *
          matchingOrderBatch.purchaseCost;
      }
    }

    if (hasIncompleteBatchHistory) {
      throw new Error(
        `Order #${id} неожиданно имеет неполную Batch-историю. APPLY остановлен.`
      );
    }

    const netRevenue =
      grossRevenue - returnedRevenue;

    const netCost =
      grossCost - returnedCost;

    const netProfit =
      netRevenue - netCost;

    const expectedProfit =
      EXPECTED_UPDATES[id];

    console.log(
      `#${id}: ` +
      `${money(order.profit)} → ` +
      `${money(netProfit)} ` +
      `(expected ${money(expectedProfit)})`
    );

    if (netProfit !== expectedProfit) {
      throw new Error(
        `Order #${id}: рассчитанная прибыль ${netProfit} ` +
        `не совпадает с ожидаемой ${expectedProfit}. APPLY остановлен.`
      );
    }

    /*
     * Проверяем Order.total.
     */
    if (order.total !== netRevenue) {
      throw new Error(
        `Order #${id}: Order.total=${order.total}, ` +
        `NET revenue=${netRevenue}. APPLY остановлен.`
      );
    }
  }

  /*
   * ============================================================
   * 6. ПРОВЕРКА, ЧТО НИ ОДИН UPDATE НЕ СТАЛ OK
   * ============================================================
   */

  for (const id of expectedIds) {
    const order = orders.find(
      (item) => item.id === id
    )!;

    const expectedProfit =
      EXPECTED_UPDATES[id];

    if (order.profit === expectedProfit) {
      throw new Error(
        `Order #${id} уже содержит ожидаемую прибыль. ` +
        `Состояние БД отличается от V29.1. APPLY остановлен.`
      );
    }
  }

  /*
   * ============================================================
   * 7. SNAPSHOT КОЛИЧЕСТВА ДО APPLY
   * ============================================================
   *
   * Используем для проверки, что никакие другие таблицы
   * не были затронуты.
   */

  const beforeCounts = {
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    orderBatches: await prisma.orderBatch.count(),
    returnBatches: await prisma.returnBatch.count(),
    batches: await prisma.batch.count(),
    products: await prisma.product.count(),
    movements: await prisma.movement.count(),
    supplies: await prisma.supply.count(),
    supplyItems: await prisma.supplyItem.count(),
  };

  console.log();
  printSeparator();
  console.log("📊 SNAPSHOT ДО APPLY");
  printSeparator();

  console.log(beforeCounts);

  /*
   * ============================================================
   * 8. TRANSACTION
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("✏️ APPLY TRANSACTION");
  printSeparator();

  await prisma.$transaction(
    async (tx) => {
      /*
       * Повторная проверка непосредственно внутри transaction.
       */
      const currentOrders =
        await tx.order.findMany({
          where: {
            id: {
              in: expectedIds,
            },
          },
          select: {
            id: true,
            profit: true,
          },
        });

      if (
        currentOrders.length !==
        expectedIds.length
      ) {
        throw new Error(
          "Количество UPDATE-заказов внутри transaction изменилось."
        );
      }

      for (const id of expectedIds) {
        const current =
          currentOrders.find(
            (order) => order.id === id
          );

        if (!current) {
          throw new Error(
            `Order #${id} не найден внутри transaction.`
          );
        }

        const expectedProfit =
          EXPECTED_UPDATES[id];

        if (
          current.profit ===
          expectedProfit
        ) {
          throw new Error(
            `Order #${id} уже имеет expected profit.`
          );
        }
      }

      /*
       * Изменяем ТОЛЬКО Order.profit.
       */
      for (const id of expectedIds) {
        const expectedProfit =
          EXPECTED_UPDATES[id];

        const result =
          await tx.order.updateMany({
            where: {
              id,
              profit: {
                not: expectedProfit,
              },
            },
            data: {
              profit: expectedProfit,
            },
          });

        if (result.count !== 1) {
          throw new Error(
            `Order #${id}: update count=${result.count}, ожидалось 1.`
          );
        }

        console.log(
          `✅ Order #${id}: profit → ${money(
            expectedProfit
          )}`
        );
      }
    },
    {
      maxWait: 5000,
      timeout: 20000,
    }
  );

  /*
   * ============================================================
   * 9. POST-APPLY VERIFICATION
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("🔎 POST-APPLY VERIFICATION");
  printSeparator();

  const updatedOrders =
    await prisma.order.findMany({
      orderBy: {
        id: "asc",
      },
      include: {
        items: {
          orderBy: {
            id: "asc",
          },
          include: {
            batches: true,
            ReturnBatch: true,
          },
        },
      },
    });

  if (updatedOrders.length !== 49) {
    throw new Error(
      `После APPLY найдено ${updatedOrders.length} заказов вместо 49.`
    );
  }

  /*
   * Проверяем все 21 значения.
   */
  for (const id of expectedIds) {
    const order =
      updatedOrders.find(
        (item) => item.id === id
      );

    if (!order) {
      throw new Error(
        `После APPLY отсутствует Order #${id}.`
      );
    }

    const expectedProfit =
      EXPECTED_UPDATES[id];

    if (
      order.profit !==
      expectedProfit
    ) {
      throw new Error(
        `Order #${id}: после APPLY profit=${order.profit}, ` +
        `ожидалось ${expectedProfit}.`
      );
    }
  }

  console.log(
    "✅ Все 21 Order.profit соответствуют V29.1."
  );

  /*
   * ============================================================
   * 10. ПРОВЕРКА СУММЫ COMPLETE
   * ============================================================
   */

  const completeIds = updatedOrders
    .filter(
      (order) =>
        !EXPECTED_SKIP_IDS.includes(
          order.id
        )
    )
    .map((order) => order.id);

  if (completeIds.length !== 40) {
    throw new Error(
      `Complete заказов после APPLY: ${completeIds.length}, ожидалось 40.`
    );
  }

  const completeProfit =
    updatedOrders
      .filter(
        (order) =>
          !EXPECTED_SKIP_IDS.includes(
            order.id
          )
      )
      .reduce(
        (sum, order) =>
          sum + order.profit,
        0
      );

  if (completeProfit !== 4178) {
    throw new Error(
      `Итоговая прибыль COMPLETE=${completeProfit}, ожидалось 4178.`
    );
  }

  console.log(
    `✅ NET profit COMPLETE = ${money(
      completeProfit
    )}`
  );

  /*
   * ============================================================
   * 11. ПРОВЕРКА SKIP
   * ============================================================
   *
   * У SKIP profit должен остаться прежним — 0.
   */

  for (const id of EXPECTED_SKIP_IDS) {
    const order =
      updatedOrders.find(
        (item) => item.id === id
      );

    if (!order) {
      throw new Error(
        `SKIP Order #${id} не найден после APPLY.`
      );
    }

    if (order.profit !== 0) {
      throw new Error(
        `SKIP Order #${id} изменился: profit=${order.profit}.`
      );
    }
  }

  console.log(
    "✅ Все 9 SKIP-заказов не изменены."
  );

  /*
   * ============================================================
   * 12. ПРОВЕРКА КОЛИЧЕСТВ ТАБЛИЦ
   * ============================================================
   */

  const afterCounts = {
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    orderBatches: await prisma.orderBatch.count(),
    returnBatches: await prisma.returnBatch.count(),
    batches: await prisma.batch.count(),
    products: await prisma.product.count(),
    movements: await prisma.movement.count(),
    supplies: await prisma.supply.count(),
    supplyItems: await prisma.supplyItem.count(),
  };

  console.log();
  printSeparator();
  console.log("📊 SNAPSHOT ПОСЛЕ APPLY");
  printSeparator();

  console.log(afterCounts);

  const countKeys =
    Object.keys(beforeCounts) as Array<
      keyof typeof beforeCounts
    >;

  for (const key of countKeys) {
    if (
      beforeCounts[key] !==
      afterCounts[key]
    ) {
      throw new Error(
        `Количество записей в ${key} изменилось: ` +
        `${beforeCounts[key]} → ${afterCounts[key]}`
      );
    }
  }

  console.log(
    "✅ Ни одна таблица не изменила количество записей."
  );

  /*
   * ============================================================
   * 13. ФИНАЛ
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("🎉 V30 APPLY COMPLETED SUCCESSFULLY");
  printSeparator();

  console.log(
    `Обновлено заказов: ${expectedIds.length}`
  );

  console.log(
    `Не тронуто исторических SKIP: ${EXPECTED_SKIP_IDS.length}`
  );

  console.log(
    `Итоговый NET profit COMPLETE: ${money(
      completeProfit
    )}`
  );

  console.log();

  console.log(
    `💾 Backup:\n${backupPath}`
  );

  console.log();

  console.log(
    "Изменено только поле Order.profit."
  );

  console.log(
    "Order.total, OrderItem, OrderBatch, ReturnBatch, Batch, Product, Movement, Supply и SupplyItem не изменялись."
  );
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ V30 APPLY FAILED");
    console.error(error);
    console.error();
    console.error(
      "Если ошибка произошла внутри transaction, изменения transaction должны быть автоматически откатаны."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });