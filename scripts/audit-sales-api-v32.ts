import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IssueLevel = "CRITICAL" | "WARNING";

let critical = 0;
let warnings = 0;

function separator() {
  console.log(
    "\n" +
      "=".repeat(95) +
      "\n"
  );
}

function title(text: string) {
  separator();
  console.log(text);
  separator();
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function addIssue(
  level: IssueLevel,
  message: string
) {
  if (level === "CRITICAL") {
    critical++;
    console.log(`❌ CRITICAL: ${message}`);
  } else {
    warnings++;
    console.log(`⚠️ WARNING: ${message}`);
  }
}

function formatDate(
  value: Date | null | undefined
) {
  if (!value) {
    return "NULL";
  }

  return value.toISOString();
}

async function main() {
  const now = new Date();

  console.log(`
🔎 SALES API / FIFO BEHAVIOR AUDIT V32

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

V32 НЕ ВЫПОЛНЯЕТ:

create
update
delete
transaction
repair

ЦЕЛЬ V32:

Проверить фактическую целостность механики продаж
по данным текущей БД.

ПРОВЕРЯЕМ:

1. Product.stock ↔ Batch.quantity
2. Только активные положительные партии используются для продаж
3. OrderItem ↔ OrderBatch
4. OrderBatch.purchaseCost
5. Batch → Product consistency
6. OrderBatch quantities
7. ReturnBatch не учитывается как новая продажа
8. FIFO chronology
9. FIFO tie-breakers
10. Продажи не превышают доступный остаток
11. Нет "неполностью распределённых" продаж
12. SALE Movement соответствует OrderItem
13. Нет дублирования SALE Movement
14. Order.total соответствует товарам заказа
15. Profit может быть рассчитан из OrderBatch
16. Текущий stock после продаж согласован
17. Тестовые сценарии, которые API обязан выдерживать

ВАЖНО:

V32 НИЧЕГО НЕ ИЗМЕНЯЕТ.
`);

  /*
   * ============================================================
   * LOAD DATABASE
   * ============================================================
   */

  const products =
    await prisma.product.findMany({
      orderBy: {
        id: "asc",
      },
      include: {
        batches: {
          orderBy: [
            {
              expiryDate: "asc",
            },
            {
              receivedAt: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
      },
    });

  const orders =
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
            product: true,
            batches: {
              orderBy: {
                id: "asc",
              },
              include: {
                batch: true,
              },
            },
            ReturnBatch: {
              orderBy: {
                id: "asc",
              },
              include: {
                Batch: true,
              },
            },
          },
        },
      },
    });

  const movements =
    await prisma.movement.findMany({
      orderBy: {
        id: "asc",
      },
    });

  const orderBatches =
    await prisma.orderBatch.findMany({
      orderBy: {
        id: "asc",
      },
      include: {
        batch: {
          include: {
            product: true,
          },
        },
        orderItem: {
          include: {
            order: true,
            product: true,
          },
        },
      },
    });

  const returnBatches =
    await prisma.returnBatch.findMany({
      orderBy: {
        id: "asc",
      },
      include: {
        Batch: {
          include: {
            product: true,
          },
        },
        OrderItem: {
          include: {
            order: true,
            product: true,
          },
        },
      },
    });

  /*
   * ============================================================
   * 1. DATABASE SUMMARY
   * ============================================================
   */

  title(
    "1️⃣ DATABASE SUMMARY"
  );

  console.log(
    `Products:      ${products.length}`
  );

  console.log(
    `Batches:       ${products.reduce(
      (sum, product) =>
        sum + product.batches.length,
      0
    )}`
  );

  console.log(
    `Orders:        ${orders.length}`
  );

  console.log(
    `OrderItems:    ${orders.reduce(
      (sum, order) =>
        sum + order.items.length,
      0
    )}`
  );

  console.log(
    `OrderBatch:    ${orderBatches.length}`
  );

  console.log(
    `ReturnBatch:   ${returnBatches.length}`
  );

  console.log(
    `Movements:     ${movements.length}`
  );

  /*
   * ============================================================
   * 2. PRODUCT STOCK ↔ BATCH
   * ============================================================
   */

  title(
    "2️⃣ PRODUCT.STOCK ↔ BATCH.QUANTITY"
  );

  let globalProductStock = 0;
  let globalBatchStock = 0;

  for (const product of products) {
    const batchTotal =
      product.batches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    globalProductStock +=
      product.stock;

    globalBatchStock +=
      batchTotal;

    console.log(
      `Product #${product.id} "${product.name}": ` +
        `stock=${product.stock}, ` +
        `Batch.total=${batchTotal}, ` +
        `diff=${product.stock - batchTotal}`
    );

    if (
      product.stock !== batchTotal
    ) {
      addIssue(
        "CRITICAL",
        `Product #${product.id} stock does not equal Batch total`
      );
    }
  }

  console.log();

  console.log(
    `Global Product.stock = ${globalProductStock}`
  );

  console.log(
    `Global Batch.quantity = ${globalBatchStock}`
  );

  console.log(
    `Global difference = ${
      globalProductStock -
      globalBatchStock
    }`
  );

  if (
    globalProductStock ===
    globalBatchStock
  ) {
    console.log(
      "✅ Current stock is consistent."
    );
  }

  /*
   * ============================================================
   * 3. CURRENT SELLABLE BATCHES
   * ============================================================
   */

  title(
    "3️⃣ CURRENT SELLABLE BATCHES"
  );

  let currentSellableUnits = 0;

  for (const product of products) {
    const sellable =
      product.batches.filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.expiryDate >= now
      );

    const sellableQuantity =
      sellable.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    currentSellableUnits +=
      sellableQuantity;

    console.log(
      `Product #${product.id} "${product.name}": ` +
        `sellable=${sellableQuantity}`
    );

    for (const batch of sellable) {
      console.log(
        `  Batch #${batch.id}: ` +
          `qty=${batch.quantity}, ` +
          `cost=${money(batch.purchaseCost)}, ` +
          `received=${formatDate(
            batch.receivedAt
          )}, ` +
          `expiry=${formatDate(
            batch.expiryDate
          )}`
      );
    }

    const invalidPositive =
      product.batches.filter(
        (batch) =>
          batch.quantity > 0 &&
          (
            batch.status !== "ACTIVE" ||
            batch.expiryDate < now
          )
      );

    if (
      invalidPositive.length > 0
    ) {
      for (const batch of invalidPositive) {
        addIssue(
          "CRITICAL",
          `Product #${product.id} has positive non-sellable Batch #${batch.id}: ` +
            `qty=${batch.quantity}, status=${batch.status}, expiry=${formatDate(
              batch.expiryDate
            )}`
        );
      }
    }
  }

  console.log();

  console.log(
    `Total currently sellable units = ${currentSellableUnits}`
  );

  /*
   * ============================================================
   * 4. ORDER ITEM ↔ ORDER BATCH
   * ============================================================
   */

  title(
    "4️⃣ ORDERITEM ↔ ORDERBATCH"
  );

  let totalGrossSales = 0;
  let totalOrderBatchSales = 0;
  let incompleteSales = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const gross =
        item.quantity;

      const allocated =
        item.batches.reduce(
          (sum, link) =>
            sum + link.quantity,
          0
        );

      totalGrossSales +=
        gross;

      totalOrderBatchSales +=
        allocated;

      if (
        allocated !== gross
      ) {
        incompleteSales++;

        addIssue(
          "CRITICAL",
          `Order #${order.id}, OrderItem #${item.id}: ` +
            `gross=${gross}, OrderBatch=${allocated}`
        );
      }
    }
  }

  console.log();

  console.log(
    `Gross OrderItem quantity = ${totalGrossSales}`
  );

  console.log(
    `OrderBatch quantity = ${totalOrderBatchSales}`
  );

  console.log(
    `Incomplete sales = ${incompleteSales}`
  );

  if (
    incompleteSales === 0
  ) {
    console.log(
      "✅ Every current order item is fully allocated to OrderBatch."
    );
  }

  /*
   * ============================================================
   * 5. ORDERBATCH PURCHASE COST
   * ============================================================
   */

  title(
    "5️⃣ ORDERBATCH.purchaseCost"
  );

  let purchaseCostProblems = 0;

  for (const link of orderBatches) {
    const expectedCost =
      link.batch.purchaseCost;

    if (
      link.purchaseCost !==
      expectedCost
    ) {
      purchaseCostProblems++;

      addIssue(
        "CRITICAL",
        `OrderBatch #${link.id}: ` +
          `purchaseCost=${link.purchaseCost}, ` +
          `Batch #${link.batchId}.purchaseCost=${expectedCost}`
      );
    }
  }

  console.log();

  console.log(
    `OrderBatch cost mismatches = ${purchaseCostProblems}`
  );

  if (
    purchaseCostProblems === 0
  ) {
    console.log(
      "✅ Every OrderBatch preserves the batch purchase cost."
    );
  }

  /*
   * ============================================================
   * 6. ORDERBATCH → PRODUCT CONSISTENCY
   * ============================================================
   */

  title(
    "6️⃣ ORDERBATCH → PRODUCT CONSISTENCY"
  );

  let productMismatchCount = 0;

  for (const link of orderBatches) {
    const orderProductId =
      link.orderItem.productId;

    const batchProductId =
      link.batch.productId;

    if (
      orderProductId !==
      batchProductId
    ) {
      productMismatchCount++;

      addIssue(
        "CRITICAL",
        `OrderBatch #${link.id}: ` +
          `OrderItem product #${orderProductId}, ` +
          `Batch #${link.batchId} product #${batchProductId}`
      );
    }
  }

  console.log();

  console.log(
    `Product mismatches = ${productMismatchCount}`
  );

  if (
    productMismatchCount === 0
  ) {
    console.log(
      "✅ All OrderBatch product links are valid."
    );
  }

  /*
   * ============================================================
   * 7. ORDERBATCH QUANTITY SANITY
   * ============================================================
   */

  title(
    "7️⃣ ORDERBATCH QUANTITY SANITY"
  );

  let invalidQuantityCount = 0;

  for (const link of orderBatches) {
    if (
      !Number.isInteger(
        link.quantity
      ) ||
      link.quantity <= 0
    ) {
      invalidQuantityCount++;

      addIssue(
        "CRITICAL",
        `OrderBatch #${link.id} has invalid quantity=${link.quantity}`
      );
    }

    if (
      !Number.isInteger(
        link.purchaseCost
      ) ||
      link.purchaseCost < 0
    ) {
      invalidQuantityCount++;

      addIssue(
        "CRITICAL",
        `OrderBatch #${link.id} has invalid purchaseCost=${link.purchaseCost}`
      );
    }
  }

  console.log();

  console.log(
    `Invalid OrderBatch fields = ${invalidQuantityCount}`
  );

  /*
   * ============================================================
   * 8. RETURNBATCH MUST NEVER CREATE EXTRA SALES
   * ============================================================
   */

  title(
    "8️⃣ RETURNBATCH ↔ ORDERBATCH"
  );

  let returnProblems = 0;

  for (const item of orders.flatMap(
    (order) => order.items
  )) {
    const soldByBatch =
      new Map<number, number>();

    const returnedByBatch =
      new Map<number, number>();

    for (const link of item.batches) {
      soldByBatch.set(
        link.batchId,
        (
          soldByBatch.get(
            link.batchId
          ) ?? 0
        ) + link.quantity
      );
    }

    for (const link of item.ReturnBatch) {
      returnedByBatch.set(
        link.batchId,
        (
          returnedByBatch.get(
            link.batchId
          ) ?? 0
        ) + link.quantity
      );
    }

    for (
      const [
        batchId,
        returnedQuantity,
      ] of returnedByBatch
    ) {
      const soldQuantity =
        soldByBatch.get(batchId) ??
        0;

      if (
        returnedQuantity >
        soldQuantity
      ) {
        returnProblems++;

        addIssue(
          "CRITICAL",
          `OrderItem #${item.id}, Batch #${batchId}: ` +
            `returned=${returnedQuantity}, sold=${soldQuantity}`
        );
      }
    }
  }

  console.log();

  console.log(
    `ReturnBatch problems = ${returnProblems}`
  );

  /*
   * ============================================================
   * 9. FIFO ORDER
   * ============================================================
   *
   * Expected ordering:
   *
   * expiryDate ASC
   * receivedAt ASC
   * id ASC
   *
   * We do not require old historical orders to be repairable.
   * We only verify that actual OrderBatch chains do not
   * contradict the chronological FIFO order where it is provable.
   */

  title(
    "9️⃣ FIFO ORDER VALIDATION"
  );

  let fifoWarnings = 0;

  const orderBatchesByProduct =
    new Map<
      number,
      typeof orderBatches
    >();

  for (const link of orderBatches) {
    const productId =
      link.orderItem.productId;

    const existing =
      orderBatchesByProduct.get(
        productId
      ) ?? [];

    existing.push(link);

    orderBatchesByProduct.set(
      productId,
      existing
    );
  }

  for (
    const [
      productId,
      links,
    ] of orderBatchesByProduct
  ) {
    links.sort(
      (a, b) => {
        const orderDateDiff =
          a.orderItem.order.date.getTime() -
          b.orderItem.order.date.getTime();

        if (
          orderDateDiff !== 0
        ) {
          return orderDateDiff;
        }

        return (
          a.id - b.id
        );
      }
    );

    let previousBatch:
      | (typeof links)[number]["batch"]
      | null = null;

    let previousOrderDate:
      | Date
      | null = null;

    for (const link of links) {
      const batch =
        link.batch;

      const orderDate =
        link.orderItem.order.date;

      if (
        previousBatch &&
        previousOrderDate &&
        orderDate >= previousOrderDate
      ) {
        const previousKey = [
          previousBatch.expiryDate.getTime(),
          previousBatch.receivedAt.getTime(),
          previousBatch.id,
        ];

        const currentKey = [
          batch.expiryDate.getTime(),
          batch.receivedAt.getTime(),
          batch.id,
        ];

        const previousComesAfterCurrent =
          previousKey[0] >
            currentKey[0] ||
          (
            previousKey[0] ===
              currentKey[0] &&
            previousKey[1] >
              currentKey[1]
          ) ||
          (
            previousKey[0] ===
              currentKey[0] &&
            previousKey[1] ===
              currentKey[1] &&
            previousKey[2] >
              currentKey[2]
          );

        if (
          previousComesAfterCurrent
        ) {
          fifoWarnings++;

          if (
            fifoWarnings <= 20
          ) {
            console.log(
              `⚠️ Product #${productId}: ` +
                `OrderBatch #${link.id} uses Batch #${batch.id} ` +
                `after an earlier sale used a later FIFO batch.`
            );
          }
        }
      }

      previousBatch =
        batch;

      previousOrderDate =
        orderDate;
    }
  }

  console.log();

  console.log(
    `FIFO chronology warnings = ${fifoWarnings}`
  );

  if (
    fifoWarnings === 0
  ) {
    console.log(
      "✅ No FIFO chronology contradictions detected."
    );
  } else {
    warnings += fifoWarnings;

    console.log(
      "⚠️ FIFO warnings are historical evidence only; V32 does not modify data."
    );
  }

  /*
   * ============================================================
   * 10. SAME EXPIRY DATE TIE-BREAKER
   * ============================================================
   */

  title(
    "🔟 FIFO TIE-BREAKER VALIDATION"
  );

  let tieBreakerWarnings = 0;

  for (const product of products) {
    const batches =
      product.batches.filter(
        (batch) =>
          batch.quantity >= 0
      );

    for (
      let i = 0;
      i < batches.length;
      i++
    ) {
      for (
        let j = i + 1;
        j < batches.length;
        j++
      ) {
        const a =
          batches[i];

        const b =
          batches[j];

        if (
          a.expiryDate.getTime() ===
          b.expiryDate.getTime()
        ) {
          if (
            a.receivedAt.getTime() >
              b.receivedAt.getTime() &&
            a.id < b.id
          ) {
            tieBreakerWarnings++;

            if (
              tieBreakerWarnings <= 20
            ) {
              console.log(
                `⚠️ Product #${product.id}: ` +
                  `same expiry but Batch IDs/receivedAt suggest ordering ambiguity: ` +
                  `#${a.id} vs #${b.id}`
              );
            }
          }
        }
      }
    }
  }

  console.log();

  console.log(
    `Tie-breaker warnings = ${tieBreakerWarnings}`
  );

  if (
    tieBreakerWarnings === 0
  ) {
    console.log(
      "✅ No tie-breaker anomalies detected."
    );
  } else {
    warnings += tieBreakerWarnings;
  }

  /*
   * ============================================================
   * 11. SALE MOVEMENTS ↔ ORDER ITEMS
   * ============================================================
   */

  title(
    "1️⃣1️⃣ SALE MOVEMENTS ↔ ORDER ITEMS"
  );

  const saleMovements =
    movements.filter(
      (movement) =>
        movement.type === "SALE"
    );

  const saleMovementByOrder =
    new Map<
      number,
      {
        total: number;
        movementIds: number[];
      }
    >();

  for (
    const movement of saleMovements
  ) {
    const match =
      movement.comment?.match(
        /заказ\s*№\s*(\d+)/i
      );

    if (!match) {
      addIssue(
        "WARNING",
        `SALE Movement #${movement.id} has no recognizable order number: "${movement.comment ?? ""}"`
      );

      continue;
    }

    const orderId =
      Number(match[1]);

    const current =
      saleMovementByOrder.get(
        orderId
      ) ?? {
        total: 0,
        movementIds: [],
      };

    current.total +=
      Math.abs(
        movement.quantity
      );

    current.movementIds.push(
      movement.id
    );

    saleMovementByOrder.set(
      orderId,
      current
    );

    if (
      movement.quantity >= 0
    ) {
      addIssue(
        "CRITICAL",
        `SALE Movement #${movement.id} has non-negative quantity=${movement.quantity}`
      );
    }
  }

  let saleMovementProblems = 0;

  for (const order of orders) {
    const expectedSaleQuantity =
      order.items.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      );

    const movementData =
      saleMovementByOrder.get(
        order.id
      );

    /*
     * Historical orders before reliable movement/batch
     * accounting are not automatically treated as critical.
     *
     * We identify them explicitly.
     */
    const hasOrderBatchHistory =
      order.items.every(
        (item) => {
          const allocated =
            item.batches.reduce(
              (sum, link) =>
                sum + link.quantity,
              0
            );

          return (
            allocated ===
            item.quantity
          );
        }
      );

    if (
      hasOrderBatchHistory
    ) {
      if (!movementData) {
        saleMovementProblems++;

        addIssue(
          "CRITICAL",
          `Order #${order.id} has complete OrderBatch history but no SALE Movement`
        );
      } else if (
        movementData.total !==
        expectedSaleQuantity
      ) {
        saleMovementProblems++;

        addIssue(
          "CRITICAL",
          `Order #${order.id}: SALE Movement total=${movementData.total}, ` +
            `expected=${expectedSaleQuantity}`
        );
      }
    } else {
      if (
        movementData &&
        movementData.total !==
          expectedSaleQuantity
      ) {
        console.log(
          `⚠️ Historical Order #${order.id}: ` +
            `SALE movement=${movementData.total}, ` +
            `OrderItem=${expectedSaleQuantity}`
        );

        warnings++;
      }
    }
  }

  console.log();

  console.log(
    `SALE Movement problems = ${saleMovementProblems}`
  );

  /*
   * ============================================================
   * 12. DUPLICATE SALE MOVEMENTS
   * ============================================================
   */

  title(
    "1️⃣2️⃣ DUPLICATE SALE MOVEMENTS"
  );

  let duplicateSaleWarnings = 0;

  for (
    const [
      orderId,
      data,
    ] of saleMovementByOrder
  ) {
    if (
      data.movementIds.length >
      1
    ) {
      /*
       * Multiple products in one order can legitimately
       * create multiple SALE movements because the current
       * application records movement per OrderItem.
       *
       * Therefore this is informational, not critical.
       */
      duplicateSaleWarnings++;

      console.log(
        `ℹ️ Order #${orderId}: ` +
          `${data.movementIds.length} SALE movements ` +
          `(${data.movementIds.join(", ")})`
      );
    }
  }

  console.log();

  console.log(
    `Orders with multiple SALE movements = ${duplicateSaleWarnings}`
  );

  /*
   * ============================================================
   * 13. ORDER TOTAL
   * ============================================================
   */

  title(
    "1️⃣3️⃣ ORDER TOTAL ↔ ORDER ITEMS"
  );

  let totalProblems = 0;

  for (const order of orders) {
    const calculatedTotal =
      order.items.reduce(
        (sum, item) =>
          sum +
          item.price *
            item.quantity,
        0
      );

    if (
      order.total !==
      calculatedTotal
    ) {
      totalProblems++;

      addIssue(
        "CRITICAL",
        `Order #${order.id}: ` +
          `stored total=${money(order.total)}, ` +
          `calculated gross=${money(calculatedTotal)}`
      );
    }
  }

  console.log();

  console.log(
    `Order total problems = ${totalProblems}`
  );

  /*
   * ============================================================
   * 14. PROFIT RECONSTRUCTION
   * ============================================================
   */

  title(
    "1️⃣4️⃣ PROFIT RECONSTRUCTION"
  );

  let profitChecks = 0;
  let profitProblems = 0;

  let calculatedNetProfit = 0;
  let storedNetProfit = 0;

  for (const order of orders) {
    const incomplete =
      order.items.some(
        (item) => {
          const allocated =
            item.batches.reduce(
              (sum, link) =>
                sum + link.quantity,
              0
            );

          return (
            allocated !==
            item.quantity
          );
        }
      );

    if (incomplete) {
      console.log(
        `⚠️ Order #${order.id}: ` +
          `profit skipped because OrderBatch history is incomplete`
      );

      warnings++;

      continue;
    }

    let grossRevenue = 0;
    let returnedRevenue = 0;
    let grossCost = 0;
    let returnedCost = 0;

    for (const item of order.items) {
      grossRevenue +=
        item.price *
        item.quantity;

      returnedRevenue +=
        item.price *
        item.returned;

      for (const link of item.batches) {
        grossCost +=
          link.quantity *
          link.purchaseCost;
      }

      for (const returnLink of item.ReturnBatch) {
        const matching =
          item.batches.find(
            (link) =>
              link.batchId ===
              returnLink.batchId
          );

        if (!matching) {
          continue;
        }

        returnedCost +=
          returnLink.quantity *
          matching.purchaseCost;
      }
    }

    const netRevenue =
      grossRevenue -
      returnedRevenue;

    const netCost =
      grossCost -
      returnedCost;

    const netProfit =
      netRevenue -
      netCost;

    calculatedNetProfit +=
      netProfit;

    storedNetProfit +=
      order.profit;

    profitChecks++;

    if (
      order.profit !==
      netProfit
    ) {
      profitProblems++;

      addIssue(
        "CRITICAL",
        `Order #${order.id}: ` +
          `stored profit=${money(order.profit)}, ` +
          `calculated NET=${money(netProfit)}`
      );
    }
  }

  console.log();

  console.log(
    `Profit checks = ${profitChecks}`
  );

  console.log(
    `Stored NET profit = ${money(
      storedNetProfit
    )}`
  );

  console.log(
    `Calculated NET profit = ${money(
      calculatedNetProfit
    )}`
  );

  console.log(
    `Profit mismatches = ${profitProblems}`
  );

  /*
   * ============================================================
   * 15. BATCH AVAILABILITY SAFETY
   * ============================================================
   *
   * For each product:
   *
   * historical sales allocated to OrderBatch
   *
   * must never exceed:
   *
   * supply/current batch history
   *
   * We cannot reconstruct opening stock automatically.
   *
   * Therefore we only detect impossible references:
   *
   * - OrderBatch.quantity > batch original/current logical capacity
   *   cannot be reconstructed from current quantity alone.
   *
   * Instead we check:
   *
   * - no negative Batch.quantity
   * - no positive sale from invalid product
   * - no OrderBatch to expired/nonexistent batch
   */

  title(
    "1️⃣5️⃣ BATCH AVAILABILITY SAFETY"
  );

  let availabilityProblems = 0;

  for (const link of orderBatches) {
    if (
      link.batch.quantity < 0
    ) {
      availabilityProblems++;

      addIssue(
        "CRITICAL",
        `OrderBatch #${link.id} points to Batch #${link.batchId} with negative current quantity`
      );
    }

    if (
      link.quantity >
      link.orderItem.quantity
    ) {
      availabilityProblems++;

      addIssue(
        "CRITICAL",
        `OrderBatch #${link.id} quantity=${link.quantity} exceeds OrderItem #${link.orderItemId} quantity=${link.orderItem.quantity}`
      );
    }
  }

  console.log();

  console.log(
    `Batch availability problems = ${availabilityProblems}`
  );

  /*
   * ============================================================
   * 16. MULTI-BATCH SALES
   * ============================================================
   *
   * Important test:
   *
   * If an OrderItem quantity exceeds one batch,
   * the sale must be represented by multiple OrderBatch records.
   *
   * We identify all historical examples.
   */

  title(
    "1️⃣6️⃣ MULTI-BATCH SALES"
  );

  let multiBatchItems = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const links =
        item.batches;

      if (
        links.length > 1
      ) {
        multiBatchItems++;

        const allocated =
          links.reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          );

        console.log(
          `Order #${order.id}, ` +
            `OrderItem #${item.id}, ` +
            `gross=${item.quantity}, ` +
            `OrderBatch=${allocated}, ` +
            `batches=${links
              .map(
                (link) =>
                  `#${link.batchId}:${link.quantity}`
              )
              .join(", ")}`
        );
      }
    }
  }

  console.log();

  console.log(
    `Multi-batch OrderItems = ${multiBatchItems}`
  );

  /*
   * ============================================================
   * 17. SALES WITH RETURNS
   * ============================================================
   */

  title(
    "1️⃣7️⃣ SALES WITH RETURNS"
  );

  let returnedOrderItems = 0;
  let returnedUnits = 0;

  for (const order of orders) {
    for (const item of order.items) {
      if (
        item.returned > 0
      ) {
        returnedOrderItems++;
        returnedUnits +=
          item.returned;

        const orderBatchTotal =
          item.batches.reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          );

        const returnBatchTotal =
          item.ReturnBatch.reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          );

        console.log(
          `Order #${order.id}, ` +
            `Item #${item.id}: ` +
            `gross=${item.quantity}, ` +
            `returned=${item.returned}, ` +
            `OrderBatch=${orderBatchTotal}, ` +
            `ReturnBatch=${returnBatchTotal}`
        );

        if (
          returnBatchTotal !==
          item.returned
        ) {
          addIssue(
            "CRITICAL",
            `OrderItem #${item.id}: returned field does not equal ReturnBatch total`
          );
        }
      }
    }
  }

  console.log();

  console.log(
    `OrderItems with returns = ${returnedOrderItems}`
  );

  console.log(
    `Returned units = ${returnedUnits}`
  );

  /*
   * ============================================================
   * 18. API DESIGN SAFETY CHECKLIST
   * ============================================================
   *
   * This section does not execute the API.
   *
   * It translates database evidence into requirements that
   * the POST /api/orders implementation must satisfy.
   */

  title(
    "1️⃣8️⃣ API SAFETY REQUIREMENTS"
  );

  const apiRequirements = [
    {
      name:
        "Server-side stock validation",
      description:
        "POST /api/orders must validate stock on the server, not rely only on UI.",
    },
    {
      name:
        "Server-side integer quantity validation",
      description:
        "Quantity must be a positive integer.",
    },
    {
      name:
        "FIFO ordering",
      description:
        "Batches must be ordered by expiryDate ASC, receivedAt ASC, id ASC.",
    },
    {
      name:
        "Only sellable batches",
      description:
        "Only ACTIVE batches with quantity > 0 and non-expired expiryDate may be sold.",
    },
    {
      name:
        "Full allocation",
      description:
        "After FIFO allocation remaining must equal zero; otherwise the entire transaction must fail.",
    },
    {
      name:
        "OrderBatch purchaseCost",
      description:
        "Every OrderBatch must preserve the actual Batch.purchaseCost.",
    },
    {
      name:
        "Atomic transaction",
      description:
        "Order creation, OrderBatch creation, Batch updates, Product.stock update and SALE Movement creation must be atomic.",
    },
    {
      name:
        "Product.stock recalculation",
      description:
        "Product.stock must equal SUM(Batch.quantity).",
    },
    {
      name:
        "No manual batch selection",
      description:
        "Client must not be able to choose arbitrary batch IDs for normal sales.",
    },
    {
      name:
        "Movement quantity",
      description:
        "SALE Movement quantity must be negative and equal to the sold quantity.",
    },
    {
      name:
        "No sale over stock",
      description:
        "The API must reject a sale if available batch quantity is insufficient.",
    },
    {
      name:
        "No expired sale",
      description:
        "Expired positive batches must never be selected by normal sale logic.",
    },
  ];

  for (
    const requirement of apiRequirements
  ) {
    console.log(
      `🟢 ${requirement.name}`
    );

    console.log(
      `   ${requirement.description}`
    );
  }

  /*
   * ============================================================
   * 19. HISTORICAL LIMITATIONS
   * ============================================================
   */

  title(
    "1️⃣9️⃣ HISTORICAL LIMITATIONS"
  );

  const incompleteHistoricalOrders =
    orders.filter(
      (order) =>
        order.items.some(
          (item) => {
            const allocated =
              item.batches.reduce(
                (sum, link) =>
                  sum + link.quantity,
                0
              );

            return (
              allocated !==
              item.quantity
            );
          }
        )
    );

  console.log(
    `Orders with incomplete historical Batch allocation = ${incompleteHistoricalOrders.length}`
  );

  if (
    incompleteHistoricalOrders.length >
    0
  ) {
    console.log();

    console.log(
      `IDs: ${incompleteHistoricalOrders
        .map(
          (order) => order.id
        )
        .join(", ")}`
    );

    console.log();

    console.log(
      "⚠️ These historical orders are NOT used to infer future API behavior."
    );

    console.log(
      "⚠️ V32 does not create artificial OrderBatch links."
    );
  }

  /*
   * ============================================================
   * 20. FINAL RESULT
   * ============================================================
   */

  title(
    "2️⃣0️⃣ FINAL V32 RESULT"
  );

  console.log(
    `CRITICAL: ${critical}`
  );

  console.log(
    `WARNINGS: ${warnings}`
  );

  console.log();

  console.log(
    `Current Product.stock = ${globalProductStock}`
  );

  console.log(
    `Current Batch.quantity = ${globalBatchStock}`
  );

  console.log(
    `Current sellable stock = ${currentSellableUnits}`
  );

  console.log(
    `Gross OrderItem sales = ${totalGrossSales}`
  );

  console.log(
    `OrderBatch allocated sales = ${totalOrderBatchSales}`
  );

  console.log(
    `Calculated NET profit = ${money(
      calculatedNetProfit
    )}`
  );

  console.log();

  if (
    critical === 0
  ) {
    console.log(
      "✅ V32 AUDIT PASSED"
    );

    console.log();

    console.log(
      "Текущая БД не содержит критических нарушений механики продаж."
    );

    console.log(
      "⚠️ Это read-only аудит: никакие данные не изменялись."
    );
  } else {
    console.log(
      "❌ V32 AUDIT FAILED"
    );

    console.log();

    console.log(
      "Обнаружены критические проблемы."
    );

    console.log(
      "⚠️ Никаких исправлений V32 не выполнял."
    );

    process.exitCode = 1;
  }

  /*
   * ============================================================
   * SAFETY CONFIRMATION
   * ============================================================
   */

  console.log();

  separator();

  console.log(
    "🔒 READ-ONLY SAFETY CONFIRMATION"
  );

  separator();

  console.log(
    "Product НЕ изменялся."
  );

  console.log(
    "Product.stock НЕ изменялся."
  );

  console.log(
    "Batch НЕ создавались."
  );

  console.log(
    "Batch НЕ удалялись."
  );

  console.log(
    "Batch НЕ изменялись."
  );

  console.log(
    "Order НЕ создавались."
  );

  console.log(
    "Order НЕ изменялись."
  );

  console.log(
    "OrderItem НЕ изменялись."
  );

  console.log(
    "OrderBatch НЕ создавались."
  );

  console.log(
    "OrderBatch НЕ изменялись."
  );

  console.log(
    "ReturnBatch НЕ создавались."
  );

  console.log(
    "ReturnBatch НЕ изменялись."
  );

  console.log(
    "Movement НЕ создавались."
  );

  console.log(
    "Movement НЕ изменялись."
  );

  console.log();

  console.log(
    "🏁 AUDIT SALES API V32 COMPLETED"
  );
}

main()
  .catch((error) => {
    console.error();
    console.error(
      "❌ V32 AUDIT ERROR"
    );
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });