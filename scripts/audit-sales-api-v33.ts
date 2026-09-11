import { prisma } from "@/lib/prisma";

// ============================================================
// V33 — AUDIT SALES API
//
// STRICT READ-ONLY
//
// Цель:
// проверить фактическую структуру данных после исправления
// app/api/orders/route.ts.
//
// НИЧЕГО НЕ ИЗМЕНЯЕТ В БАЗЕ.
// ============================================================

type Severity = "INFO" | "WARN" | "CRITICAL";

type AuditMessage = {
  severity: Severity;
  message: string;
};

const messages: AuditMessage[] = [];

function info(message: string) {
  messages.push({
    severity: "INFO",
    message,
  });
}

function warn(message: string) {
  messages.push({
    severity: "WARN",
    message,
  });
}

function critical(message: string) {
  messages.push({
    severity: "CRITICAL",
    message,
  });
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function date(value: Date) {
  return value.toISOString();
}

async function main() {
  console.log("");
  console.log("============================================================");
  console.log("V33 — AUDIT SALES API");
  console.log("STRICT READ-ONLY");
  console.log("============================================================");
  console.log("");

  const now = new Date();

  console.log(`Audit time: ${now.toISOString()}`);
  console.log("");

  // ==========================================================
  // LOAD DATA
  // ==========================================================

  const [
    products,
    batches,
    orders,
    orderItems,
    orderBatches,
    returnBatches,
    movements,
  ] = await Promise.all([
    prisma.product.findMany({
      orderBy: {
        id: "asc",
      },
    }),

    prisma.batch.findMany({
      include: {
        product: true,
      },
      orderBy: {
        id: "asc",
      },
    }),

    prisma.order.findMany({
      include: {
        items: {
          include: {
            product: true,
            batches: {
              include: {
                batch: true,
              },
              orderBy: {
                id: "asc",
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
      orderBy: {
        id: "asc",
      },
    }),

    prisma.orderItem.findMany({
      include: {
        product: true,
        order: true,
        batches: {
          include: {
            batch: true,
          },
          orderBy: {
            id: "asc",
          },
        },
        ReturnBatch: {
          include: {
            Batch: true,
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    }),

    prisma.orderBatch.findMany({
      include: {
        orderItem: true,
        batch: true,
      },
      orderBy: {
        id: "asc",
      },
    }),

    prisma.returnBatch.findMany({
      include: {
        OrderItem: true,
        Batch: true,
      },
      orderBy: {
        id: "asc",
      },
    }),

    prisma.movement.findMany({
      orderBy: {
        id: "asc",
      },
    }),
  ]);

  // ==========================================================
  // SUMMARY
  // ==========================================================

  console.log("DATABASE COUNTS");
  console.log("------------------------------------------------------------");
  console.log(`Products:     ${products.length}`);
  console.log(`Batches:      ${batches.length}`);
  console.log(`Orders:       ${orders.length}`);
  console.log(`OrderItems:   ${orderItems.length}`);
  console.log(`OrderBatch:   ${orderBatches.length}`);
  console.log(`ReturnBatch:  ${returnBatches.length}`);
  console.log(`Movements:    ${movements.length}`);
  console.log("");

  // ==========================================================
  // KNOWN HISTORICAL CASES
  //
  // Эти OrderItem известны как продажи до появления
  // соответствующих Batch и поэтому не должны считаться
  // ошибкой нового API.
  // ==========================================================

  const HISTORICAL_SKIP_ORDER_IDS = new Set([
    4,
    5,
    11,
    12,
    16,
    18,
    19,
    20,
    23,
  ]);

  const historicalSkipOrderItems = new Set(
    orderItems
      .filter((item) =>
        HISTORICAL_SKIP_ORDER_IDS.has(item.orderId)
      )
      .map((item) => item.id)
  );

  // ==========================================================
  // 1. PRODUCT STOCK <-> BATCH STOCK
  // ==========================================================

  console.log("1. PRODUCT STOCK <-> BATCH STOCK");
  console.log("------------------------------------------------------------");

  let stockCritical = 0;

  for (const product of products) {
    const batchTotal = batches
      .filter((batch) => batch.productId === product.id)
      .reduce((sum, batch) => sum + batch.quantity, 0);

    if (product.stock !== batchTotal) {
      stockCritical++;

      critical(
        `Product #${product.id} "${product.name}": ` +
          `stock=${product.stock}, batchTotal=${batchTotal}`
      );

      console.log(
        `CRITICAL: Product #${product.id} "${product.name}" ` +
          `stock=${product.stock}, batchTotal=${batchTotal}`
      );
    } else {
      console.log(
        `OK: Product #${product.id} "${product.name}" ` +
          `stock=${product.stock}, batchTotal=${batchTotal}`
      );
    }
  }

  if (stockCritical === 0) {
    console.log("PASS: Product.stock полностью соответствует Batch.");
  }

  console.log("");

  // ==========================================================
  // 2. CURRENT SELLABLE BATCHES
  //
  // Новый API может продавать только:
  //
  // quantity > 0
  // status = ACTIVE
  // receivedAt <= orderDate
  // expiryDate >= orderDate
  // ==========================================================

  console.log("2. CURRENT SELLABLE BATCHES");
  console.log("------------------------------------------------------------");

  const sellableNow = batches.filter(
    (batch) =>
      batch.quantity > 0 &&
      batch.status === "ACTIVE" &&
      batch.receivedAt <= now &&
      batch.expiryDate >= now
  );

  const expiredPositive = batches.filter(
    (batch) =>
      batch.quantity > 0 &&
      batch.expiryDate < now
  );

  const futureReceivedPositive = batches.filter(
    (batch) =>
      batch.quantity > 0 &&
      batch.receivedAt > now
  );

  const nonActivePositive = batches.filter(
    (batch) =>
      batch.quantity > 0 &&
      batch.status !== "ACTIVE"
  );

  console.log(
    `Sellable now: ${sellableNow.length} batches`
  );

  console.log(
    `Expired + positive: ${expiredPositive.length}`
  );

  console.log(
    `Future received + positive: ${futureReceivedPositive.length}`
  );

  console.log(
    `Non-ACTIVE + positive: ${nonActivePositive.length}`
  );

  if (expiredPositive.length > 0) {
    for (const batch of expiredPositive) {
      critical(
        `Expired positive Batch #${batch.id} ` +
          `"${batch.product.name}" qty=${batch.quantity}`
      );

      console.log(
        `CRITICAL: expired Batch #${batch.id} ` +
          `"${batch.product.name}" qty=${batch.quantity}`
      );
    }
  }

  if (futureReceivedPositive.length > 0) {
    warn(
      `Есть ${futureReceivedPositive.length} положительных партий ` +
        `с receivedAt в будущем относительно времени аудита.`
    );
  }

  if (nonActivePositive.length > 0) {
    critical(
      `Есть ${nonActivePositive.length} положительных партий ` +
        `со статусом != ACTIVE.`
    );
  }

  if (
    expiredPositive.length === 0 &&
    nonActivePositive.length === 0
  ) {
    console.log(
      "PASS: нет текущих партий, которые нельзя было бы безопасно продавать."
    );
  }

  console.log("");

  // ==========================================================
  // 3. BATCH SANITY
  // ==========================================================

  console.log("3. BATCH SANITY");
  console.log("------------------------------------------------------------");

  let batchProblems = 0;

  for (const batch of batches) {
    if (batch.quantity < 0) {
      batchProblems++;

      critical(
        `Batch #${batch.id}: negative quantity ${batch.quantity}`
      );
    }

    if (batch.expiryDate < batch.receivedAt) {
      batchProblems++;

      critical(
        `Batch #${batch.id}: expiryDate < receivedAt`
      );
    }

    if (!Number.isInteger(batch.quantity)) {
      batchProblems++;

      critical(
        `Batch #${batch.id}: quantity is not integer`
      );
    }

    if (!Number.isInteger(batch.purchaseCost)) {
      batchProblems++;

      critical(
        `Batch #${batch.id}: purchaseCost is not integer`
      );
    }
  }

  if (batchProblems === 0) {
    console.log("PASS: партии не содержат базовых аномалий.");
  } else {
    console.log(
      `CRITICAL: найдено проблем партий: ${batchProblems}`
    );
  }

  console.log("");

  // ==========================================================
  // 4. ORDER ITEM <-> ORDER BATCH
  //
  // Известные исторические случаи SKIP не проверяем
  // как текущую механику API.
  // ==========================================================

  console.log("4. ORDER ITEM <-> ORDER BATCH");
  console.log("------------------------------------------------------------");

  let completeItems = 0;
  let skippedHistoricalItems = 0;
  let itemCritical = 0;

  for (const item of orderItems) {
    const allocated = item.batches.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    const expected = item.quantity;

    if (historicalSkipOrderItems.has(item.id)) {
      skippedHistoricalItems++;

      console.log(
        `SKIP historical: OrderItem #${item.id} ` +
          `Order #${item.orderId} ` +
          `${item.product.name} ` +
          `gross=${expected}, allocated=${allocated}`
      );

      continue;
    }

    if (allocated !== expected) {
      itemCritical++;

      critical(
        `OrderItem #${item.id}: ` +
          `gross=${expected}, allocated=${allocated}`
      );

      console.log(
        `CRITICAL: OrderItem #${item.id} ` +
          `gross=${expected}, allocated=${allocated}`
      );
    } else {
      completeItems++;
    }
  }

  console.log(
    `Complete items: ${completeItems}`
  );

  console.log(
    `Historical SKIP items: ${skippedHistoricalItems}`
  );

  console.log(
    `Critical incomplete items: ${itemCritical}`
  );

  if (itemCritical === 0) {
    console.log(
      "PASS: все современные OrderItem полностью связаны с OrderBatch."
    );
  }

  console.log("");

  // ==========================================================
  // 5. ORDER BATCH QUANTITY SANITY
  // ==========================================================

  console.log("5. ORDER BATCH QUANTITY SANITY");
  console.log("------------------------------------------------------------");

  let orderBatchProblems = 0;

  for (const link of orderBatches) {
    if (!Number.isInteger(link.quantity)) {
      orderBatchProblems++;

      critical(
        `OrderBatch #${link.id}: quantity не integer`
      );
    }

    if (link.quantity <= 0) {
      orderBatchProblems++;

      critical(
        `OrderBatch #${link.id}: quantity=${link.quantity}`
      );
    }

    if (!Number.isInteger(link.purchaseCost)) {
      orderBatchProblems++;

      critical(
        `OrderBatch #${link.id}: purchaseCost не integer`
      );
    }

    if (link.batchId <= 0) {
      orderBatchProblems++;

      critical(
        `OrderBatch #${link.id}: invalid batchId`
      );
    }

    if (link.orderItemId <= 0) {
      orderBatchProblems++;

      critical(
        `OrderBatch #${link.id}: invalid orderItemId`
      );
    }
  }

  if (orderBatchProblems === 0) {
    console.log(
      "PASS: OrderBatch quantity/purchaseCost корректны."
    );
  }

  console.log("");

  // ==========================================================
  // 6. PURCHASE COST SNAPSHOT
  //
  // ВАЖНО:
  //
  // OrderBatch.purchaseCost сравниваем НЕ с текущим
  // Batch.purchaseCost как требование равенства.
  //
  // Проверяем только:
  // - стоимость не отрицательная;
  // - стоимость соответствует числовому формату;
  // - историческая стоимость сохранена.
  // ==========================================================

  console.log("6. ORDER BATCH PURCHASE COST SNAPSHOT");
  console.log("------------------------------------------------------------");

  let costProblems = 0;

  for (const link of orderBatches) {
    if (link.purchaseCost < 0) {
      costProblems++;

      critical(
        `OrderBatch #${link.id}: negative purchaseCost=${link.purchaseCost}`
      );
    }

    if (!Number.isInteger(link.purchaseCost)) {
      costProblems++;

      critical(
        `OrderBatch #${link.id}: invalid purchaseCost`
      );
    }
  }

  if (costProblems === 0) {
    console.log(
      "PASS: OrderBatch.purchaseCost корректно хранится как snapshot."
    );
  }

  console.log("");

  // ==========================================================
  // 7. PRODUCT CONSISTENCY
  // ==========================================================

  console.log("7. ORDER ITEM / BATCH PRODUCT CONSISTENCY");
  console.log("------------------------------------------------------------");

  let productMismatch = 0;

  for (const link of orderBatches) {
    if (
      link.orderItem.productId !==
      link.batch.productId
    ) {
      productMismatch++;

      critical(
        `OrderBatch #${link.id}: ` +
          `OrderItem product=${link.orderItem.productId}, ` +
          `Batch product=${link.batch.productId}`
      );
    }
  }

  if (productMismatch === 0) {
    console.log(
      "PASS: все OrderBatch связывают правильный товар."
    );
  }

  console.log("");

  // ==========================================================
  // 8. RETURN BATCH INTEGRITY
  // ==========================================================

  console.log("8. RETURN BATCH INTEGRITY");
  console.log("------------------------------------------------------------");

  let returnProblems = 0;

  for (const ret of returnBatches) {
    if (ret.quantity <= 0) {
      returnProblems++;

      critical(
        `ReturnBatch #${ret.id}: quantity=${ret.quantity}`
      );
    }

    if (
      ret.OrderItem.productId !==
      ret.Batch.productId
    ) {
      returnProblems++;

      critical(
        `ReturnBatch #${ret.id}: product mismatch`
      );
    }

    const soldFromBatch = orderBatches
      .filter(
        (link) =>
          link.orderItemId === ret.orderItemId &&
          link.batchId === ret.batchId
      )
      .reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    if (ret.quantity > soldFromBatch) {
      returnProblems++;

      critical(
        `ReturnBatch #${ret.id}: ` +
          `returned=${ret.quantity}, ` +
          `soldFromSameBatch=${soldFromBatch}`
      );
    }
  }

  if (returnProblems === 0) {
    console.log(
      "PASS: ReturnBatch корректно соответствует продажам."
    );
  }

  console.log("");

  // ==========================================================
  // 9. ORDER STATUS
  // ==========================================================

  console.log("9. ORDER STATUS");
  console.log("------------------------------------------------------------");

  let statusProblems = 0;

  for (const order of orders) {
    const gross = order.items.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    );

    const returned = order.items.reduce(
      (sum, item) =>
        sum + item.returned,
      0
    );

    if (returned > gross) {
      statusProblems++;

      critical(
        `Order #${order.id}: returned=${returned} > gross=${gross}`
      );

      continue;
    }

    let expectedStatus:
      | "COMPLETED"
      | "PARTIAL_RETURN"
      | "RETURNED";

    if (returned === 0) {
      expectedStatus = "COMPLETED";
    } else if (returned === gross) {
      expectedStatus = "RETURNED";
    } else {
      expectedStatus = "PARTIAL_RETURN";
    }

    if (order.status !== expectedStatus) {
      statusProblems++;

      critical(
        `Order #${order.id}: ` +
          `stored=${order.status}, ` +
          `expected=${expectedStatus}`
      );
    }
  }

  if (statusProblems === 0) {
    console.log(
      "PASS: статусы заказов соответствуют возвратам."
    );
  }

  console.log("");

  // ==========================================================
  // 10. FIFO / FEFO CHRONOLOGY
  //
  // Проверяем последовательность фактических партий внутри
  // каждого OrderItem.
  //
  // Приоритет:
  // expiryDate
  // receivedAt
  // id
  //
  // Возвраты здесь не учитываются — это отдельный процесс.
  // ==========================================================

  console.log("10. FIFO / FEFO CHRONOLOGY");
  console.log("------------------------------------------------------------");

  let fifoWarnings = 0;

  for (const item of orderItems) {
    if (historicalSkipOrderItems.has(item.id)) {
      continue;
    }

    if (item.batches.length <= 1) {
      continue;
    }

    const sorted = [...item.batches].sort(
      (a, b) => {
        const expiry =
          a.batch.expiryDate.getTime() -
          b.batch.expiryDate.getTime();

        if (expiry !== 0) {
          return expiry;
        }

        const received =
          a.batch.receivedAt.getTime() -
          b.batch.receivedAt.getTime();

        if (received !== 0) {
          return received;
        }

        return a.batch.id - b.batch.id;
      }
    );

    const actualIds =
      item.batches.map(
        (link) => link.batch.id
      );

    const expectedIds =
      sorted.map(
        (link) => link.batch.id
      );

    if (
      actualIds.length !==
      expectedIds.length ||
      actualIds.some(
        (id, index) =>
          id !== expectedIds[index]
      )
    ) {
      fifoWarnings++;

      warn(
        `OrderItem #${item.id}: ` +
          `порядок OrderBatch отличается от FEFO-приоритета. ` +
          `actual=[${actualIds.join(",")}], ` +
          `expected=[${expectedIds.join(",")}]`
      );

      console.log(
        `WARN: OrderItem #${item.id}: ` +
          `actual=[${actualIds.join(",")}], ` +
          `expected=[${expectedIds.join(",")}]`
      );
    }
  }

  if (fifoWarnings === 0) {
    console.log(
      "PASS: последовательность партий соответствует FEFO-приоритету."
    );
  }

  console.log("");

  // ==========================================================
  // 11. MULTI-BATCH SALES
  // ==========================================================

  console.log("11. MULTI-BATCH SALES");
  console.log("------------------------------------------------------------");

  const multiBatchItems =
    orderItems.filter(
      (item) =>
        !historicalSkipOrderItems.has(item.id) &&
        item.batches.length > 1
    );

  console.log(
    `Multi-batch OrderItems: ${multiBatchItems.length}`
  );

  for (const item of multiBatchItems) {
    const allocated = item.batches.reduce(
      (sum, link) =>
        sum + link.quantity,
      0
    );

    console.log(
      `OrderItem #${item.id} ` +
        `Order #${item.orderId} ` +
        `"${item.product.name}" ` +
        `gross=${item.quantity}, ` +
        `batches=${item.batches.length}, ` +
        `allocated=${allocated}`
    );

    for (const link of item.batches) {
      console.log(
        `  Batch #${link.batchId}: ` +
          `${link.quantity} шт., ` +
          `cost=${money(link.purchaseCost)}, ` +
          `expiry=${date(link.batch.expiryDate)}`
      );
    }
  }

  console.log("");

  // ==========================================================
  // 12. RETURN TOTALS
  // ==========================================================

  console.log("12. RETURN TOTALS");
  console.log("------------------------------------------------------------");

  let returnedFromItems = 0;
  let returnedFromBatches = 0;

  for (const item of orderItems) {
    returnedFromItems += item.returned;

    returnedFromBatches +=
      item.ReturnBatch.reduce(
        (sum, ret) =>
          sum + ret.quantity,
        0
      );
  }

  console.log(
    `OrderItem.returned total: ${returnedFromItems}`
  );

  console.log(
    `ReturnBatch.quantity total: ${returnedFromBatches}`
  );

  if (
    returnedFromItems !==
    returnedFromBatches
  ) {
    critical(
      `Return totals mismatch: ` +
        `OrderItem.returned=${returnedFromItems}, ` +
        `ReturnBatch=${returnedFromBatches}`
    );

    console.log(
      "CRITICAL: totals возвратов не совпадают."
    );
  } else {
    console.log(
      "PASS: возвраты полностью синхронизированы."
    );
  }

  console.log("");

  // ==========================================================
  // 13. PROFIT RECONSTRUCTION
  //
  // Только для полностью связанных современных заказов.
  //
  // Формула:
  //
  // netRevenue =
  // grossRevenue - returnedRevenue
  //
  // netCost =
  // grossCost - returnedCost
  //
  // netProfit =
  // netRevenue - netCost
  // ==========================================================

  console.log("13. NET PROFIT RECONSTRUCTION");
  console.log("------------------------------------------------------------");

  let profitChecked = 0;
  let profitMismatch = 0;

  let storedProfitTotal = 0;
  let calculatedProfitTotal = 0;

  for (const order of orders) {
    const hasHistoricalSkip =
      order.items.some((item) =>
        historicalSkipOrderItems.has(item.id)
      );

    if (hasHistoricalSkip) {
      console.log(
        `SKIP historical profit: Order #${order.id}`
      );

      continue;
    }

    let grossRevenue = 0;
    let returnedRevenue = 0;

    let grossCost = 0;
    let returnedCost = 0;

    let complete = true;

    for (const item of order.items) {
      grossRevenue +=
        item.quantity * item.price;

      returnedRevenue +=
        item.returned * item.price;

      const allocated =
        item.batches.reduce(
          (sum, link) =>
            sum + link.quantity,
          0
        );

      if (allocated !== item.quantity) {
        complete = false;
        break;
      }

      grossCost +=
        item.batches.reduce(
          (sum, link) =>
            sum +
            link.quantity *
              link.purchaseCost,
          0
        );

      returnedCost +=
        item.ReturnBatch.reduce(
          (sum, ret) =>
            sum +
            ret.quantity *
              ret.Batch.purchaseCost,
          0
        );
    }

    if (!complete) {
      warn(
        `Order #${order.id}: невозможно полноценно ` +
          `пересчитать profit из-за неполной истории.`
      );

      continue;
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

    profitChecked++;

    storedProfitTotal +=
      order.profit;

    calculatedProfitTotal +=
      netProfit;

    if (order.profit !== netProfit) {
      profitMismatch++;

      critical(
        `Order #${order.id}: ` +
          `stored profit=${order.profit}, ` +
          `calculated NET=${netProfit}`
      );

      console.log(
        `CRITICAL: Order #${order.id}: ` +
          `stored=${money(order.profit)}, ` +
          `calculated=${money(netProfit)}`
      );
    }
  }

  console.log(
    `Profit checked: ${profitChecked}`
  );

  console.log(
    `Stored profit total: ${money(storedProfitTotal)}`
  );

  console.log(
    `Calculated NET profit total: ${money(calculatedProfitTotal)}`
  );

  if (profitMismatch === 0) {
    console.log(
      "PASS: stored profit соответствует NET profit."
    );
  }

  console.log("");

  // ==========================================================
  // 14. CURRENT STOCK SAFETY
  //
  // Проверяем, что OrderBatch не сделал Batch.quantity
  // отрицательным.
  // ==========================================================

  console.log("14. CURRENT STOCK SAFETY");
  console.log("------------------------------------------------------------");

  let stockSafetyProblems = 0;

  for (const batch of batches) {
    if (batch.quantity < 0) {
      stockSafetyProblems++;

      critical(
        `Batch #${batch.id}: quantity=${batch.quantity}`
      );
    }
  }

  if (stockSafetyProblems === 0) {
    console.log(
      "PASS: отрицательных остатков партий нет."
    );
  }

  console.log("");

  // ==========================================================
  // 15. SALE MOVEMENTS
  //
  // НЕ требуем исторического идеального соответствия.
  //
  // Movement — журнал, но не источник текущего stock.
  //
  // Проверяем только структуру современных SALE movements:
  // отрицательное количество.
  // ==========================================================

  console.log("15. SALE MOVEMENTS");
  console.log("------------------------------------------------------------");

  const saleMovements =
    movements.filter(
      (movement) =>
        movement.type === "SALE"
    );

  let saleMovementProblems = 0;

  for (const movement of saleMovements) {
    if (movement.quantity >= 0) {
      saleMovementProblems++;

      critical(
        `SALE Movement #${movement.id}: ` +
          `quantity=${movement.quantity}, expected negative`
      );
    }
  }

  console.log(
    `SALE movements: ${saleMovements.length}`
  );

  if (saleMovementProblems === 0) {
    console.log(
      "PASS: SALE movements имеют корректное направление."
    );
  }

  console.log("");

  // ==========================================================
  // 16. V26 WRITE-OFF
  // ==========================================================

  console.log("16. WRITE-OFF MOVEMENTS");
  console.log("------------------------------------------------------------");

  const writeOffMovements =
    movements.filter(
      (movement) =>
        movement.type === "WRITE_OFF"
    );

  let writeOffProblems = 0;

  for (const movement of writeOffMovements) {
    if (movement.quantity >= 0) {
      writeOffProblems++;

      critical(
        `WRITE_OFF Movement #${movement.id}: ` +
          `quantity=${movement.quantity}, expected negative`
      );
    }
  }

  console.log(
    `WRITE_OFF movements: ${writeOffMovements.length}`
  );

  if (writeOffProblems === 0) {
    console.log(
      "PASS: WRITE_OFF movements корректны."
    );
  }

  console.log("");

  // ==========================================================
  // 17. KNOWN HISTORICAL ORDERS
  // ==========================================================

  console.log("17. HISTORICAL OPENING-STOCK ORDERS");
  console.log("------------------------------------------------------------");

  for (const orderId of [
    ...HISTORICAL_SKIP_ORDER_IDS,
  ].sort((a, b) => a - b)) {
    const order =
      orders.find(
        (item) => item.id === orderId
      );

    if (!order) {
      critical(
        `Expected historical Order #${orderId} not found`
      );

      continue;
    }

    const incomplete =
      order.items.some(
        (item) =>
          !item.batches.length ||
          item.batches.reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          ) !== item.quantity
      );

    if (!incomplete) {
      warn(
        `Historical Order #${orderId} неожиданно полностью связан.`
      );
    } else {
      console.log(
        `OK historical SKIP: Order #${orderId}`
      );
    }
  }

  console.log("");

  // ==========================================================
  // 18. FINAL SUMMARY
  // ==========================================================

  const criticalCount =
    messages.filter(
      (item) =>
        item.severity === "CRITICAL"
    ).length;

  const warningCount =
    messages.filter(
      (item) =>
        item.severity === "WARN"
    ).length;

  const infoCount =
    messages.filter(
      (item) =>
        item.severity === "INFO"
    ).length;

  console.log("============================================================");
  console.log("V33 FINAL SUMMARY");
  console.log("============================================================");
  console.log("");

  console.log(
    `CRITICAL: ${criticalCount}`
  );

  console.log(
    `WARNINGS: ${warningCount}`
  );

  console.log(
    `INFO: ${infoCount}`
  );

  console.log("");

  console.log(
    `Products: ${products.length}`
  );

  console.log(
    `Batches: ${batches.length}`
  );

  console.log(
    `Orders: ${orders.length}`
  );

  console.log(
    `OrderItems: ${orderItems.length}`
  );

  console.log(
    `OrderBatch: ${orderBatches.length}`
  );

  console.log(
    `ReturnBatch: ${returnBatches.length}`
  );

  console.log("");

  console.log(
    `Current sellable batches: ${sellableNow.length}`
  );

  console.log(
    `Expired positive batches: ${expiredPositive.length}`
  );

  console.log(
    `Future positive batches: ${futureReceivedPositive.length}`
  );

  console.log("");

  console.log(
    `Profit checked: ${profitChecked}`
  );

  console.log(
    `Stored profit: ${money(storedProfitTotal)}`
  );

  console.log(
    `Calculated NET profit: ${money(calculatedProfitTotal)}`
  );

  console.log("");

  if (criticalCount === 0) {
    console.log(
      "🎉 V33 AUDIT PASSED — критических проблем не найдено."
    );
  } else {
    console.log(
      "❌ V33 AUDIT FAILED — есть CRITICAL проблемы."
    );
  }

  console.log("");
  console.log("============================================================");

  // ==========================================================
  // STRICT READ-ONLY
  //
  // Никаких create/update/delete здесь нет.
  // ==========================================================

  if (criticalCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error("V33 AUDIT ERROR:");
    console.error(error);
    console.error("");

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });