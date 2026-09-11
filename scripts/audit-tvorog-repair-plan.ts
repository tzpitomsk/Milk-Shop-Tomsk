import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ============================================================
 * AUDIT TVOROG REPAIR PLAN
 * ============================================================
 *
 * READ ONLY
 *
 * Цель:
 *
 * 1. Восстановить историческую ёмкость Творога
 *    из SupplyItem.
 *
 * 2. Построить исторический FIFO по времени поставок.
 *
 * 3. НЕ доверять текущим Batch.receivedAt как источнику
 *    исторического происхождения.
 *
 * 4. Сравнить восстановленный FIFO с существующими
 *    OrderBatch.
 *
 * 5. Учесть ReturnBatch как подтверждение партии,
 *    но НЕ изменять БД.
 *
 * 6. Показать:
 *
 *      - что должно было быть продано из каждой
 *        исторической партии;
 *      - что сейчас записано;
 *      - какие OrderBatch явно невозможны;
 *      - какие продажи можно восстановить однозначно;
 *      - где остаётся неоднозначность.
 *
 * НИКАКИХ:
 *
 * prisma.create()
 * prisma.update()
 * prisma.delete()
 *
 * ============================================================
 */

const PRODUCT_ID = 2;

type HistoricalBatch = {
  key: string;

  supplyItemId: number;

  supplyId: number;

  productId: number;

  quantity: number;

  remaining: number;

  purchaseCost: number;

  supplyDate: Date;

  source: "SUPPLY";

  linkedCurrentBatchId: number | null;
};

type ExistingOrderBatch = {
  id: number;
  orderId: number;
  orderItemId: number;
  batchId: number;
  quantity: number;
  purchaseCost: number;
  orderDate: Date;
  batchReceivedAt: Date;
};

type PlannedAllocation = {
  orderId: number;
  orderItemId: number;
  orderDate: Date;
  quantity: number;
  historicalBatchKey: string;
  supplyItemId: number;
  purchaseCost: number;
  reason: string;
};

type ReturnInfo = {
  id: number;
  orderId: number;
  orderItemId: number;
  batchId: number;
  quantity: number;
  createdAt: Date;
};

const problems: string[] = [];
const warnings: string[] = [];

function critical(message: string) {
  problems.push(message);
  console.log(`🔴 ${message}`);
}

function warning(message: string) {
  warnings.push(message);
  console.log(`🟡 ${message}`);
}

function money(value: number) {
  return `${value} ₽`;
}

function date(value: Date) {
  return value.toISOString();
}

function separator() {
  console.log("----------------------------------------");
}

function sum<T extends { quantity: number }>(items: T[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function hoursBetween(a: Date, b: Date) {
  return Math.abs(
    a.getTime() - b.getTime()
  ) /
    1000 /
    60 /
    60;
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("🧀 ТВOРОГ — ПЛАН РЕКОНСТРУКЦИИ FIFO");
  console.log("========================================");
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  await prisma.$connect();

  console.log("✅ Prisma подключен");
  console.log("");

  /**
   * ==========================================================
   * 1. ЗАГРУЗКА ДАННЫХ
   * ==========================================================
   */

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
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
        include: {
          orderBatches: {
            include: {
              orderItem: {
                include: {
                  order: true,
                },
              },
            },
          },
          ReturnBatch: {
            include: {
              OrderItem: {
                include: {
                  order: true,
                },
              },
            },
          },
        },
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

  if (!product) {
    throw new Error(
      `Product #${PRODUCT_ID} не найден`
    );
  }

  console.log(
    `Товар: #${product.id} ${product.name}`
  );

  console.log(
    `Product.stock: ${product.stock}`
  );

  /**
   * ==========================================================
   * 2. SUPPLY HISTORY
   * ==========================================================
   */

  separator();

  console.log("🚚 ИСТОРИЯ ПОСТАВОК");
  separator();

  let totalSupplied = 0;

  const historicalBatches: HistoricalBatch[] =
    [];

  for (const supplyItem of product.supplyItems) {
    const quantity = supplyItem.quantity;

    totalSupplied += quantity;

    console.log(
      `SupplyItem #${supplyItem.id} | ` +
        `Supply #${supplyItem.supplyId} | ` +
        `${date(supplyItem.supply.date)} | ` +
        `+${quantity} шт × ${money(
          supplyItem.cost
        )}`
    );

    historicalBatches.push({
      key: `SUPPLY_ITEM_${supplyItem.id}`,

      supplyItemId: supplyItem.id,

      supplyId: supplyItem.supplyId,

      productId: product.id,

      quantity,

      remaining: quantity,

      purchaseCost: supplyItem.cost,

      supplyDate: supplyItem.supply.date,

      source: "SUPPLY",

      linkedCurrentBatchId: null,
    });
  }

  console.log("");

  console.log(
    `ИТОГО ПОСТАВЛЕНО: ${totalSupplied} шт`
  );

  /**
   * ==========================================================
   * 3. CURRENT BATCHES
   * ==========================================================
   */

  separator();

  console.log("📦 ТЕКУЩИЕ BATCH");
  separator();

  let currentBatchStock = 0;

  for (const batch of product.batches) {
    currentBatchStock += batch.quantity;

    console.log(
      `Batch #${batch.id} | ` +
        `current=${batch.quantity} | ` +
        `cost=${money(batch.purchaseCost)} | ` +
        `received=${date(batch.receivedAt)} | ` +
        `expiry=${date(batch.expiryDate)} | ` +
        `status=${batch.status}`
    );

    const sold = sum(batch.orderBatches);

    const returned = sum(batch.ReturnBatch);

    console.log(
      `   sold linked: ${sold}`
    );

    console.log(
      `   returned: ${returned}`
    );

    /**
     * Текущая Batch должна хотя бы приблизительно
     * соответствовать какой-либо поставке.
     *
     * Пока только ищем ближайшую поставку.
     * Ничего не связываем в БД.
     */

    const closestSupply =
      historicalBatches
        .map((historical) => ({
          historical,

          distance: hoursBetween(
            historical.supplyDate,
            batch.receivedAt
          ),
        }))
        .sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance;
          }

          return (
            a.historical.supplyItemId -
            b.historical.supplyItemId
          );
        })[0];

    if (closestSupply) {
      console.log(
        `   ближайший SupplyItem: #${closestSupply.historical.supplyItemId} ` +
          `Δ=${closestSupply.distance.toFixed(3)} ч`
      );

      if (
        closestSupply.historical.purchaseCost !==
        batch.purchaseCost
      ) {
        warning(
          `Batch #${batch.id}: ` +
            `cost=${money(batch.purchaseCost)}, ` +
            `ближайшая поставка #${closestSupply.historical.supplyItemId} ` +
            `cost=${money(
              closestSupply.historical.purchaseCost
            )}`
        );
      }
    }

    console.log("");
  }

  console.log(
    `SUM Batch.quantity: ${currentBatchStock}`
  );

  /**
   * ==========================================================
   * 4. СУММАРНАЯ ИСТОРИЧЕСКАЯ ЁМКОСТЬ
   * ==========================================================
   */

  separator();

  console.log("📊 ИСТОРИЧЕСКАЯ ЁМКОСТЬ");
  separator();

  console.log(
    `Supply capacity: ${totalSupplied} шт`
  );

  console.log(
    `Current Batch stock: ${currentBatchStock} шт`
  );

  console.log(
    `Product.stock: ${product.stock} шт`
  );

  const allOrderQuantity = sum(
    product.orderItems
  );

  const allReturnedQuantity =
    product.orderItems.reduce(
      (total, item) =>
        total + item.returned,
      0
    );

  console.log(
    `OrderItem quantity: ${allOrderQuantity} шт`
  );

  console.log(
    `OrderItem returned: ${allReturnedQuantity} шт`
  );

  const expectedStock =
    totalSupplied -
    allOrderQuantity +
    allReturnedQuantity;

  console.log(
    `Supply - Sales + Returns: ${expectedStock} шт`
  );

  if (
    expectedStock !==
    product.stock
  ) {
    critical(
      `Supply - Sales + Returns = ${expectedStock}, ` +
        `но Product.stock = ${product.stock}`
    );
  }

  /**
   * ==========================================================
   * 5. EXISTING ORDERBATCH
   * ==========================================================
   */

  separator();

  console.log("🔗 СУЩЕСТВУЮЩИЕ ORDERBATCH");
  separator();

  const existingOrderBatches: ExistingOrderBatch[] =
    [];

  for (const item of product.orderItems) {
    for (const link of item.batches) {
      existingOrderBatches.push({
        id: link.id,

        orderId: item.orderId,

        orderItemId: item.id,

        batchId: link.batchId,

        quantity: link.quantity,

        purchaseCost: link.purchaseCost,

        orderDate: item.order.date,

        batchReceivedAt:
          link.batch.receivedAt,
      });

      console.log(
        `OrderBatch #${link.id} | ` +
          `Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `Batch #${link.batchId} | ` +
          `${link.quantity} шт | ` +
          `order=${date(item.order.date)} | ` +
          `batch=${date(
            link.batch.receivedAt
          )} | ` +
          `cost=${money(
            link.purchaseCost
          )}`
      );

      if (
        link.batch.receivedAt.getTime() >
        item.order.date.getTime()
      ) {
        critical(
          `OrderBatch #${link.id}: ` +
            `Batch #${link.batchId} появился ПОСЛЕ заказа`
        );
      }

      if (
        link.purchaseCost !==
        link.batch.purchaseCost
      ) {
        warning(
          `OrderBatch #${link.id}: ` +
            `OrderBatch cost=${money(
              link.purchaseCost
            )}, Batch cost=${money(
              link.batch.purchaseCost
            )}`
        );
      }
    }
  }

  /**
   * ==========================================================
   * 6. RETURN BATCH
   * ==========================================================
   */

  separator();

  console.log("↩️ RETURN BATCH");
  separator();

  const returns: ReturnInfo[] = [];

  for (const item of product.orderItems) {
    for (const returnBatch of item.ReturnBatch) {
      returns.push({
        id: returnBatch.id,

        orderId: item.orderId,

        orderItemId: item.id,

        batchId: returnBatch.batchId,

        quantity: returnBatch.quantity,

        createdAt:
          returnBatch.createdAt,
      });

      console.log(
        `ReturnBatch #${returnBatch.id} | ` +
          `Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `Batch #${returnBatch.batchId} | ` +
          `${returnBatch.quantity} шт | ` +
          `${date(returnBatch.createdAt)}`
      );
    }
  }

  /**
   * ==========================================================
   * 7. ИСТОРИЧЕСКИЙ FIFO
   * ==========================================================
   *
   * ВАЖНО:
   *
   * Здесь FIFO строится НЕ по текущим Batch.
   *
   * Здесь партии = SupplyItem.
   *
   * Каждая поставка получает свою виртуальную
   * историческую ёмкость.
   *
   * Порядок:
   *
   * supplyDate ASC
   * supplyItemId ASC
   *
   * Продажа может использовать только поставки,
   * которые уже существовали на дату заказа.
   */

  separator();

  console.log("🧮 РЕКОНСТРУКЦИЯ ИСТОРИЧЕСКОГО FIFO");
  separator();

  const plannedAllocations: PlannedAllocation[] =
    [];

  let totalPlannedSales = 0;

  for (const item of product.orderItems) {
    let remaining = item.quantity;

    console.log("");

    console.log(
      `Order #${item.orderId} | ` +
        `OrderItem #${item.id} | ` +
        `date=${date(item.order.date)} | ` +
        `quantity=${item.quantity}`
    );

    /**
     * Сначала показываем SupplyItem,
     * доступные на дату заказа.
     */

    const availableHistoricalBatches =
      historicalBatches
        .filter(
          (historical) =>
            historical.supplyDate.getTime() <=
            item.order.date.getTime()
        )
        .filter(
          (historical) =>
            historical.remaining > 0
        );

    if (
      availableHistoricalBatches.length === 0
    ) {
      critical(
        `Order #${item.orderId}, ` +
          `OrderItem #${item.id}: ` +
          `на дату заказа нет ни одной поставки`
      );

      continue;
    }

    /**
     * FIFO:
     *
     * самая ранняя поставка первой.
     */

    for (const historical of availableHistoricalBatches) {
      if (remaining <= 0) {
        break;
      }

      if (
        historical.remaining <= 0
      ) {
        continue;
      }

      const take = Math.min(
        remaining,
        historical.remaining
      );

      plannedAllocations.push({
        orderId: item.orderId,

        orderItemId: item.id,

        orderDate: item.order.date,

        quantity: take,

        historicalBatchKey:
          historical.key,

        supplyItemId:
          historical.supplyItemId,

        purchaseCost:
          historical.purchaseCost,

        reason:
          "Исторический FIFO по SupplyItem",
      });

      historical.remaining -= take;

      remaining -= take;

      totalPlannedSales += take;

      console.log(
        `   → SupplyItem #${historical.supplyItemId}: ` +
          `${take} шт × ` +
          `${money(
            historical.purchaseCost
          )}`
      );
    }

    if (remaining > 0) {
      critical(
        `Order #${item.orderId}, ` +
          `OrderItem #${item.id}: ` +
          `невозможно объяснить ${remaining} шт ` +
          `историческими поставками`
      );
    }
  }

  /**
   * ==========================================================
   * 8. ИТОГ ИСТОРИЧЕСКОГО FIFO
   * ==========================================================
   */

  separator();

  console.log("📋 ИТОГ РЕКОНСТРУКЦИИ");
  separator();

  console.log(
    `Всего продаж по OrderItem: ${allOrderQuantity}`
  );

  console.log(
    `Успешно распределено FIFO: ${totalPlannedSales}`
  );

  console.log(
    `Не распределено: ${
      allOrderQuantity -
      totalPlannedSales
    }`
  );

  /**
   * ==========================================================
   * 9. ОСТАТОК ИСТОРИЧЕСКИХ ПОСТАВОК
   * ==========================================================
   */

  separator();

  console.log(
    "📦 ОСТАТОК ПО ИСТОРИЧЕСКИМ ПОСТАВКАМ"
  );

  separator();

  let historicalRemaining = 0;

  for (const historical of historicalBatches) {
    historicalRemaining +=
      historical.remaining;

    console.log(
      `SupplyItem #${historical.supplyItemId}: ` +
        `остаток=${historical.remaining} шт | ` +
        `cost=${money(
          historical.purchaseCost
        )} | ` +
        `date=${date(
          historical.supplyDate
        )}`
    );
  }

  console.log("");

  console.log(
    `Исторический остаток: ${historicalRemaining} шт`
  );

  /**
   * ==========================================================
   * 10. СРАВНЕНИЕ С ТЕКУЩИМ BATCH
   * ==========================================================
   */

  separator();

  console.log(
    "⚖️ ИСТОРИЧЕСКИЙ FIFO VS CURRENT BATCH"
  );

  separator();

  console.log(
    `Исторический остаток: ${historicalRemaining}`
  );

  console.log(
    `Current Batch stock: ${currentBatchStock}`
  );

  if (
    historicalRemaining !==
    currentBatchStock
  ) {
    critical(
      `Исторический остаток ${historicalRemaining} ` +
        `не совпадает с текущим Batch stock ${currentBatchStock}`
    );
  }

  /**
   * ==========================================================
   * 11. СРАВНЕНИЕ ORDERBATCH
   * ==========================================================
   *
   * Для каждого OrderItem:
   *
   * historical FIFO
   * VS
   * existing OrderBatch
   */

  separator();

  console.log(
    "🔎 ORDERITEM: HISTORICAL FIFO VS EXISTING"
  );

  separator();

  for (const item of product.orderItems) {
    const planned =
      plannedAllocations.filter(
        (allocation) =>
          allocation.orderItemId ===
          item.id
      );

    const existing =
      item.batches;

    const plannedQuantity = sum(
      planned
    );

    const existingQuantity = sum(
      existing
    );

    console.log("");

    console.log(
      `Order #${item.orderId}, ` +
        `OrderItem #${item.id}`
    );

    console.log(
      `  Продано: ${item.quantity}`
    );

    console.log(
      `  Исторический FIFO: ${plannedQuantity}`
    );

    console.log(
      `  Existing OrderBatch: ${existingQuantity}`
    );

    if (
      plannedQuantity !==
      existingQuantity
    ) {
      warning(
        `OrderItem #${item.id}: ` +
          `historical FIFO=${plannedQuantity}, ` +
          `existing OrderBatch=${existingQuantity}`
      );
    }

    if (planned.length > 0) {
      console.log(
        "  Историческое распределение:"
      );

      for (const allocation of planned) {
        console.log(
          `    → SupplyItem #${allocation.supplyItemId}: ` +
            `${allocation.quantity} шт × ` +
            `${money(
              allocation.purchaseCost
            )}`
        );
      }
    }

    if (existing.length > 0) {
      console.log(
        "  Существующее распределение:"
      );

      for (const link of existing) {
        console.log(
          `    → Batch #${link.batchId}: ` +
            `${link.quantity} шт × ` +
            `${money(
              link.purchaseCost
            )}`
        );
      }
    }
  }

  /**
   * ==========================================================
   * 12. RETURNBATCH — ПРОВЕРКА СВЯЗИ С FIFO
   * ==========================================================
   */

  separator();

  console.log(
    "↩️ RETURNBATCH VS ИСТОРИЧЕСКИЙ FIFO"
  );

  separator();

  for (const returnInfo of returns) {
    const planned =
      plannedAllocations.filter(
        (allocation) =>
          allocation.orderItemId ===
          returnInfo.orderItemId
      );

    console.log("");

    console.log(
      `ReturnBatch #${returnInfo.id} | ` +
        `Order #${returnInfo.orderId} | ` +
        `Batch #${returnInfo.batchId} | ` +
        `${returnInfo.quantity} шт`
    );

    /**
     * Ищем историческую поставку,
     * максимально соответствующую существующей
     * Batch по времени.
     *
     * Только диагностически.
     */

    const currentBatch =
      product.batches.find(
        (batch) =>
          batch.id ===
          returnInfo.batchId
      );

    if (!currentBatch) {
      critical(
        `ReturnBatch #${returnInfo.id}: ` +
          `Batch #${returnInfo.batchId} отсутствует`
      );

      continue;
    }

    const closestHistorical =
      historicalBatches
        .map((historical) => ({
          historical,

          distance:
            hoursBetween(
              historical.supplyDate,
              currentBatch.receivedAt
            ),
        }))
        .sort(
          (a, b) =>
            a.distance -
            b.distance
        )[0];

    if (closestHistorical) {
      console.log(
        `  Ближайшая историческая поставка: ` +
          `SupplyItem #${closestHistorical.historical.supplyItemId}`
      );

      console.log(
        `  cost: ${money(
          closestHistorical.historical.purchaseCost
        )}`
      );

      console.log(
        `  distance: ` +
          `${closestHistorical.distance.toFixed(
            3
          )} ч`
      );
    }

    if (planned.length > 0) {
      console.log(
        "  Продажа этого OrderItem по историческому FIFO:"
      );

      for (const allocation of planned) {
        console.log(
          `    → SupplyItem #${allocation.supplyItemId}: ` +
            `${allocation.quantity} шт`
        );
      }
    }
  }

  /**
   * ==========================================================
   * 13. РЕКОМЕНДУЕМЫЕ ИЗМЕНЕНИЯ
   * ==========================================================
   *
   * Пока НЕ выполняются.
   */

  separator();

  console.log(
    "🛠️ ПОТЕНЦИАЛЬНЫЙ ПЛАН ИЗМЕНЕНИЙ"
  );

  separator();

  console.log(
    "Этот раздел только показывает направления."
  );

  console.log(
    "База данных НЕ изменяется."
  );

  console.log("");

  console.log(
    "1. Необходимо определить правильное " +
      "соответствие SupplyItem → существующий Batch."
  );

  console.log(
    "2. Неверные OrderBatch #79–#86 нельзя " +
      "считать историческим источником истины."
  );

  console.log(
    "3. После подтверждения Supply → Batch " +
      "можно перестроить OrderBatch по историческому FIFO."
  );

  console.log(
    "4. ReturnBatch необходимо сохранить как " +
      "доказательство конкретной партии."
  );

  console.log(
    "5. Product.stock после ремонта должен " +
      "соответствовать сумме Batch.quantity."
  );

  console.log(
    "6. Movement пока не использовать для " +
      "автоматического восстановления."
  );

  /**
   * ==========================================================
   * 14. ФИНАЛ
   * ==========================================================
   */

  separator();

  console.log("🏁 ФИНАЛ");
  separator();

  console.log(
    `Supply: ${totalSupplied}`
  );

  console.log(
    `Sales: ${allOrderQuantity}`
  );

  console.log(
    `Returns: ${allReturnedQuantity}`
  );

  console.log(
    `Expected stock: ${expectedStock}`
  );

  console.log(
    `Product.stock: ${product.stock}`
  );

  console.log(
    `Current Batch stock: ${currentBatchStock}`
  );

  console.log(
    `Historical remaining: ${historicalRemaining}`
  );

  console.log("");

  console.log(
    `🔴 CRITICAL: ${problems.length}`
  );

  console.log(
    `🟡 WARNINGS: ${warnings.length}`
  );

  console.log("");

  if (problems.length > 0) {
    console.log(
      "⚠️ Автоматическое исправление НЕБЕЗОПАСНО."
    );
  } else {
    console.log(
      "🟢 Критических противоречий не обнаружено."
    );
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "❌ ОШИБКА:"
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });