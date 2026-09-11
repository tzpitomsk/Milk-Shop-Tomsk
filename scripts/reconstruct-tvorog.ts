import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

/**
 * ============================================================
 * ТВОРОГ — ИСТОРИЧЕСКАЯ РЕКОНСТРУКЦИЯ FIFO
 * ============================================================
 *
 * STRICT READ ONLY
 *
 * НИКАКИХ create/update/delete.
 *
 * Главный источник исторической ёмкости:
 *   SupplyItem
 *
 * Текущие Batch используются только для сравнения.
 *
 * OrderBatch НЕ считается источником истины, если:
 *   Batch.created/receivedAt > Order.date
 *
 * ReturnBatch сохраняется как сильное доказательство
 * факта возврата из конкретной Batch.
 *
 * ============================================================
 */

type VirtualLot = {
  supplyItemId: number;
  supplyId: number;
  productId: number;
  originalQuantity: number;
  remaining: number;
  purchaseCost: number;
  receivedAt: Date;
};

type Allocation = {
  orderId: number;
  orderItemId: number;
  supplyItemId: number;
  quantity: number;
  purchaseCost: number;
  reason: string;
};

type ReturnInfo = {
  returnBatchId: number;
  orderId: number;
  orderItemId: number;
  batchId: number;
  quantity: number;
  createdAt: Date;
};

type MovementInfo = {
  id: number;
  date: Date;
  type: string;
  quantity: number;
  balance: number;
  reason: string | null;
  batchId: number | null;
};

function separator() {
  console.log("----------------------------------------");
}

function money(value: number) {
  return `${value} ₽`;
}

function formatDate(value: Date) {
  return value.toISOString();
}

function hoursBetween(a: Date, b: Date) {
  return Math.abs(
    a.getTime() - b.getTime()
  ) / 1000 / 60 / 60;
}

function sum(values: number[]) {
  return values.reduce(
    (total, value) => total + value,
    0
  );
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("🧀 ТВОРОГ — ИСТОРИЧЕСКАЯ РЕКОНСТРУКЦИЯ FIFO");
  console.log("========================================");
  console.log("");
  console.log("⚠️ STRICT READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  await prisma.$connect();

  console.log("✅ Prisma подключен");
  console.log("");

  /**
   * ==========================================================
   * 1. PRODUCT
   * ==========================================================
   */

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
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
   * 2. SUPPLIES
   * ==========================================================
   */

  const supplyItems =
    await prisma.supplyItem.findMany({
      where: {
        productId: PRODUCT_ID,
      },
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
    });

  console.log("");
  separator();
  console.log("🚚 ИСТОРИЧЕСКИЕ ПОСТАВКИ");
  separator();

  let totalSupply = 0;

  const virtualLots: VirtualLot[] =
    supplyItems.map((item) => {
      totalSupply += item.quantity;

      console.log(
        `SupplyItem #${item.id} | ` +
          `Supply #${item.supplyId} | ` +
          `${formatDate(item.supply.date)} | ` +
          `+${item.quantity} шт × ${money(item.cost)}`
      );

      return {
        supplyItemId: item.id,
        supplyId: item.supplyId,
        productId: PRODUCT_ID,
        originalQuantity: item.quantity,
        remaining: item.quantity,
        purchaseCost: item.cost,
        receivedAt: item.supply.date,
      };
    });

  console.log("");
  console.log(
    `ИТОГО ПОСТАВЛЕНО: ${totalSupply} шт`
  );

  /**
   * ==========================================================
   * 3. CURRENT BATCH
   * ==========================================================
   */

  const currentBatches =
    await prisma.batch.findMany({
      where: {
        productId: PRODUCT_ID,
      },
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
    });

  console.log("");
  separator();
  console.log("📦 ТЕКУЩИЕ BATCH");
  separator();

  for (const batch of currentBatches) {
    const sold = sum(
      batch.orderBatches.map(
        (link) => link.quantity
      )
    );

    const returned = sum(
      batch.ReturnBatch.map(
        (link) => link.quantity
      )
    );

    console.log("");
    console.log(`Batch #${batch.id}`);
    console.log(
      `  current: ${batch.quantity}`
    );
    console.log(
      `  cost: ${money(batch.purchaseCost)}`
    );
    console.log(
      `  received: ${formatDate(batch.receivedAt)}`
    );
    console.log(
      `  expiry: ${formatDate(batch.expiryDate)}`
    );
    console.log(
      `  status: ${batch.status}`
    );
    console.log(
      `  sold linked: ${sold}`
    );
    console.log(
      `  returned: ${returned}`
    );

    const nearest = supplyItems
      .map((item) => ({
        item,
        distance: hoursBetween(
          item.supply.date,
          batch.receivedAt
        ),
      }))
      .sort(
        (a, b) =>
          a.distance - b.distance
      )[0];

    if (nearest) {
      console.log(
        `  nearest SupplyItem: #${nearest.item.id} ` +
          `Δ=${nearest.distance.toFixed(3)} ч`
      );

      console.log(
        `  nearest cost: ${money(nearest.item.cost)}`
      );

      if (
        batch.purchaseCost !==
        nearest.item.cost
      ) {
        console.log(
          `  🟡 COST MISMATCH`
        );
      }
    }
  }

  /**
   * ==========================================================
   * 4. ORDER ITEMS
   * ==========================================================
   */

  const orderItems =
    await prisma.orderItem.findMany({
      where: {
        productId: PRODUCT_ID,
      },
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
    });

  console.log("");
  separator();
  console.log("🛒 ИСТОРИЯ ПРОДАЖ");
  separator();

  const totalSales = sum(
    orderItems.map(
      (item) => item.quantity
    )
  );

  const totalReturned = sum(
    orderItems.map(
      (item) => item.returned
    )
  );

  console.log(
    `Всего OrderItem: ${orderItems.length}`
  );

  console.log(
    `Всего продано: ${totalSales} шт`
  );

  console.log(
    `Всего возвращено: ${totalReturned} шт`
  );

  /**
   * ==========================================================
   * 5. HISTORICAL FIFO
   * ==========================================================
   *
   * Ключевое отличие:
   *
   * Мы используем SupplyItem напрямую.
   *
   * Никакие существующие Batch не расходуются.
   *
   * ==========================================================
   */

  console.log("");
  separator();
  console.log("🧮 ИСТОРИЧЕСКИЙ FIFO ПО SUPPLYITEM");
  separator();

  const allocations: Allocation[] = [];

  let unresolvedSales = 0;

  for (const item of orderItems) {
    let remaining = item.quantity;

    console.log("");
    console.log(
      `Order #${item.orderId} | ` +
        `OrderItem #${item.id} | ` +
        `${formatDate(item.order.date)} | ` +
        `quantity=${item.quantity} | ` +
        `returned=${item.returned}`
    );

    /**
     * Supply, существующие ДО заказа.
     */

    const candidates = virtualLots.filter(
      (lot) =>
        lot.receivedAt.getTime() <=
        item.order.date.getTime() &&
        lot.remaining > 0
    );

    if (candidates.length === 0) {
      console.log(
        "  🔴 На дату заказа доступных поставок нет"
      );

      unresolvedSales += remaining;

      continue;
    }

    /**
     * FIFO:
     *
     * самая ранняя поставка сначала.
     */

    for (const lot of candidates) {
      if (remaining <= 0) {
        break;
      }

      if (lot.remaining <= 0) {
        continue;
      }

      const take = Math.min(
        lot.remaining,
        remaining
      );

      lot.remaining -= take;
      remaining -= take;

      allocations.push({
        orderId: item.orderId,
        orderItemId: item.id,
        supplyItemId: lot.supplyItemId,
        quantity: take,
        purchaseCost:
          lot.purchaseCost,
        reason:
          "Исторический FIFO по SupplyItem",
      });

      console.log(
        `  → SupplyItem #${lot.supplyItemId}: ` +
          `${take} шт × ${money(
            lot.purchaseCost
          )}`
      );
    }

    if (remaining > 0) {
      unresolvedSales += remaining;

      console.log(
        `  🔴 НЕ РАСПРЕДЕЛЕНО: ${remaining} шт`
      );
    }
  }

  /**
   * ==========================================================
   * 6. RETURNBATCH
   * ==========================================================
   */

  const returnInfos: ReturnInfo[] = [];

  for (const item of orderItems) {
    for (const ret of item.ReturnBatch) {
      returnInfos.push({
        returnBatchId: ret.id,
        orderId: item.orderId,
        orderItemId: item.id,
        batchId: ret.batchId,
        quantity: ret.quantity,
        createdAt: ret.createdAt,
      });
    }
  }

  console.log("");
  separator();
  console.log("↩️ RETURNBATCH");
  separator();

  if (returnInfos.length === 0) {
    console.log("ReturnBatch отсутствуют");
  }

  for (const ret of returnInfos) {
    console.log(
      `ReturnBatch #${ret.returnBatchId} | ` +
        `Order #${ret.orderId} | ` +
        `OrderItem #${ret.orderItemId} | ` +
        `Batch #${ret.batchId} | ` +
        `${ret.quantity} шт | ` +
        `${formatDate(ret.createdAt)}`
    );

    /**
     * Найдём историческое распределение
     * соответствующего OrderItem.
     */

    const itemAllocations =
      allocations.filter(
        (allocation) =>
          allocation.orderItemId ===
          ret.orderItemId
      );

    if (
      itemAllocations.length === 0
    ) {
      console.log(
        "  🔴 Исторического FIFO для этого OrderItem нет"
      );
      continue;
    }

    console.log(
      "  Историческое FIFO продажи:"
    );

    for (const allocation of itemAllocations) {
      console.log(
        `    → SupplyItem #${allocation.supplyItemId}: ` +
          `${allocation.quantity} шт × ` +
          `${money(allocation.purchaseCost)}`
      );
    }

    /**
     * Проверяем стоимость.
     *
     * ReturnBatch → Batch → purchaseCost
     */

    const currentBatch =
      currentBatches.find(
        (batch) =>
          batch.id === ret.batchId
      );

    if (currentBatch) {
      const nearestSupply =
        supplyItems
          .map((supply) => ({
            supply,
            distance:
              hoursBetween(
                supply.supply.date,
                currentBatch.receivedAt
              ),
          }))
          .sort(
            (a, b) =>
              a.distance -
              b.distance
          )[0];

      if (nearestSupply) {
        console.log(
          `  Batch #${ret.batchId} ` +
            `ближайшая поставка: ` +
            `SupplyItem #${nearestSupply.supply.id}`
        );
      }
    }
  }

  /**
   * ==========================================================
   * 7. SUPPLY REMAINING
   * ==========================================================
   */

  console.log("");
  separator();
  console.log("📦 ОСТАТОК ПО ИСТОРИЧЕСКИМ ПОСТАВКАМ");
  separator();

  let historicalRemaining = 0;

  for (const lot of virtualLots) {
    historicalRemaining +=
      lot.remaining;

    console.log(
      `SupplyItem #${lot.supplyItemId}: ` +
        `остаток=${lot.remaining} шт | ` +
        `cost=${money(lot.purchaseCost)} | ` +
        `date=${formatDate(lot.receivedAt)}`
    );
  }

  /**
   * ==========================================================
   * 8. CURRENT BATCH STOCK
   * ==========================================================
   */

  const currentBatchStock = sum(
    currentBatches.map(
      (batch) => batch.quantity
    )
  );

  /**
   * ==========================================================
   * 9. EXISTING VS HISTORICAL
   * ==========================================================
   */

  console.log("");
  separator();
  console.log(
    "🔎 EXISTING ORDERBATCH VS HISTORICAL FIFO"
  );
  separator();

  for (const item of orderItems) {
    const existingQuantity = sum(
      item.batches.map(
        (link) => link.quantity
      )
    );

    const historicalQuantity = sum(
      allocations
        .filter(
          (allocation) =>
            allocation.orderItemId ===
            item.id
        )
        .map(
          (allocation) =>
            allocation.quantity
        )
    );

    if (
      existingQuantity !==
        historicalQuantity ||
      existingQuantity !==
        item.quantity
    ) {
      console.log("");
      console.log(
        `Order #${item.orderId}, ` +
          `OrderItem #${item.id}`
      );

      console.log(
        `  Продано: ${item.quantity}`
      );

      console.log(
        `  Historical FIFO: ${historicalQuantity}`
      );

      console.log(
        `  Existing OrderBatch: ${existingQuantity}`
      );

      if (item.batches.length > 0) {
        console.log(
          "  Existing:"
        );

        for (const link of item.batches) {
          console.log(
            `    → Batch #${link.batchId}: ` +
              `${link.quantity} шт × ` +
              `${money(link.purchaseCost)}`
          );
        }
      }
    }
  }

  /**
   * ==========================================================
   * 10. SUMMARY
   * ==========================================================
   */

  const historicalAllocated =
    sum(
      allocations.map(
        (allocation) =>
          allocation.quantity
      )
    );

  const expectedStockFromSupply =
    totalSupply -
    totalSales +
    totalReturned;

  console.log("");
  console.log("========================================");
  console.log("🏁 ИТОГ РЕКОНСТРУКЦИИ");
  console.log("========================================");

  console.log(
    `Supply:                 ${totalSupply}`
  );

  console.log(
    `Sales:                  ${totalSales}`
  );

  console.log(
    `Returns:                ${totalReturned}`
  );

  console.log(
    `FIFO allocated:         ${historicalAllocated}`
  );

  console.log(
    `Unresolved sales:       ${unresolvedSales}`
  );

  console.log(
    `Historical remaining:   ${historicalRemaining}`
  );

  console.log(
    `Supply-Sales+Returns:   ${expectedStockFromSupply}`
  );

  console.log(
    `Current Batch stock:    ${currentBatchStock}`
  );

  console.log(
    `Product.stock:          ${product.stock}`
  );

  console.log("");

  if (
    expectedStockFromSupply !==
    product.stock
  ) {
    console.log(
      `🔴 Supply - Sales + Returns = ` +
        `${expectedStockFromSupply}, ` +
        `но Product.stock = ${product.stock}`
    );
  }

  if (
    historicalRemaining !==
    currentBatchStock
  ) {
    console.log(
      `🔴 Historical remaining ${historicalRemaining} ` +
        `≠ Current Batch stock ${currentBatchStock}`
    );
  }

  if (
    currentBatchStock !==
    product.stock
  ) {
    console.log(
      `🔴 Current Batch stock ${currentBatchStock} ` +
        `≠ Product.stock ${product.stock}`
    );
  }

  /**
   * ==========================================================
   * 11. COST SUMMARY
   * ==========================================================
   */

  console.log("");
  separator();
  console.log("💰 ИСТОРИЧЕСКАЯ СЕБЕСТОИМОСТЬ");
  separator();

  let totalHistoricalCost = 0;

  for (const allocation of allocations) {
    totalHistoricalCost +=
      allocation.quantity *
      allocation.purchaseCost;
  }

  console.log(
    `Историческая себестоимость всех ` +
      `распределённых продаж: ` +
      `${money(totalHistoricalCost)}`
  );

  /**
   * ==========================================================
   * 12. SAFETY
   * ==========================================================
   */

  console.log("");
  separator();
  console.log("🛡️ БЕЗОПАСНОСТЬ");
  separator();

  console.log(
    "Ни один объект БД не изменён."
  );

  console.log(
    "Ни один OrderBatch не создан."
  );

  console.log(
    "Ни один OrderBatch не удалён."
  );

  console.log(
    "Ни один Batch не изменён."
  );

  console.log(
    "Ни один ReturnBatch не изменён."
  );

  console.log(
    "Product.stock не изменён."
  );

  console.log(
    "Movement не изменён."
  );

  console.log("");
  console.log(
    "✅ РЕКОНСТРУКЦИЯ ЗАВЕРШЕНА"
  );
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "❌ ОШИБКА РЕКОНСТРУКЦИИ"
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });