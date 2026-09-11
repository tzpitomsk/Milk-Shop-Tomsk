import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function section(title: string) {
  console.log("");
  line();
  console.log(title);
  line();
}

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toISOString();
}

function money(value: number) {
  return `${value} ₽`;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function pct(value: number, total: number) {
  if (!total) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

async function main() {
  console.log("");
  line();
  console.log("🧀 ТВОРОГ — HISTORICAL RECONSTRUCTION AUDIT V9");
  line();
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");
  console.log(
    "Цель: построить единую реконструкцию исторического состояния Творога."
  );

  // ---------------------------------------------------------------------------
  // 1. PRODUCT
  // ---------------------------------------------------------------------------

  section("1. PRODUCT");

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`unit=${product.unit}`);
  console.log(`stock=${product.stock}`);
  console.log(`cost=${money(product.cost)}`);
  console.log(`price=${money(product.price)}`);

  // ---------------------------------------------------------------------------
  // 2. ALL BATCHES
  // ---------------------------------------------------------------------------

  section("2. ALL BATCHES");

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
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
    orderBy: {
      receivedAt: "asc",
    },
  });

  if (batches.length === 0) {
    console.log("Batch отсутствуют.");
  }

  let totalCurrentBatchQty = 0;
  let totalBatchSold = 0;
  let totalBatchReturned = 0;

  for (const batch of batches) {
    const sold = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    totalCurrentBatchQty += batch.quantity;
    totalBatchSold += sold;
    totalBatchReturned += returned;

    console.log("");
    console.log(
      `Batch #${batch.id} | qty=${batch.quantity} | cost=${money(
        batch.purchaseCost
      )} | status=${batch.status}`
    );
    console.log(`received=${fmtDate(batch.receivedAt)}`);
    console.log(`expiry=${fmtDate(batch.expiryDate)}`);
    console.log(`sold=${sold}`);
    console.log(`returned=${returned}`);
    console.log(
      `business remaining = ${batch.quantity} шт`
    );

    if (batch.orderBatches.length === 0) {
      console.log("  OrderBatch: НЕТ");
    } else {
      for (const link of batch.orderBatches) {
        console.log(
          `  SALE | Order #${link.orderItem.orderId} | ` +
            `OrderItem #${link.orderItemId} | ` +
            `qty=${link.quantity} | ` +
            `date=${fmtDate(link.orderItem.order.date)} | ` +
            `purchaseCost=${money(link.purchaseCost)}`
        );
      }
    }

    if (batch.ReturnBatch.length === 0) {
      console.log("  ReturnBatch: НЕТ");
    } else {
      for (const ret of batch.ReturnBatch) {
        console.log(
          `  RETURN | Order #${ret.OrderItem.orderId} | ` +
            `OrderItem #${ret.orderItemId} | ` +
            `qty=${ret.quantity} | ` +
            `date=${fmtDate(ret.createdAt)}`
        );
      }
    }
  }

  console.log("");
  console.log(`CURRENT BATCH QUANTITY = ${totalCurrentBatchQty} шт`);
  console.log(`TOTAL ORDERBATCH SOLD = ${totalBatchSold} шт`);
  console.log(`TOTAL RETURNBATCH = ${totalBatchReturned} шт`);

  const firstBatch = batches.length > 0 ? batches[0] : null;

  if (firstBatch) {
    console.log("");
    console.log(`FIRST BATCH = #${firstBatch.id}`);
    console.log(`FIRST BATCH DATE = ${fmtDate(firstBatch.receivedAt)}`);
  } else {
    console.log("");
    console.log("FIRST BATCH = НЕТ");
  }

  // ---------------------------------------------------------------------------
  // 3. SUPPLY HISTORY
  // ---------------------------------------------------------------------------

  section("3. SUPPLY HISTORY");

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
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
  });

  let totalSupply = 0;
  let preBatchSupply = 0;
  let postBatchSupply = 0;

  for (const item of supplyItems) {
    const date = item.supply.date;

    totalSupply += item.quantity;

    const isPreBatch =
      firstBatch && date < firstBatch.receivedAt;

    if (isPreBatch) {
      preBatchSupply += item.quantity;
    } else {
      postBatchSupply += item.quantity;
    }

    console.log(
      `SupplyItem #${item.id} | Supply #${item.supplyId} | ` +
        `date=${fmtDate(date)} | qty=${item.quantity} | ` +
        `cost=${money(item.cost)}`
    );
  }

  console.log("");
  console.log(`SUPPLY TOTAL = ${totalSupply} шт`);
  console.log(`PRE-BATCH SUPPLY = ${preBatchSupply} шт`);
  console.log(`POST-BATCH SUPPLY = ${postBatchSupply} шт`);

  // ---------------------------------------------------------------------------
  // 4. ALL ORDER ITEMS
  // ---------------------------------------------------------------------------

  section("4. ALL ORDER ITEMS");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
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
  });

  let grossOrders = 0;
  let returnedFieldTotal = 0;
  let returnBatchTotal = 0;
  let netOrders = 0;

  let preBatchGrossOrders = 0;
  let preBatchReturned = 0;
  let preBatchNetOrders = 0;

  let postBatchGrossOrders = 0;
  let postBatchReturned = 0;
  let postBatchNetOrders = 0;

  let linkedOrderBatchQty = 0;
  let unlinkedOrderQty = 0;

  const preBatchOrderItems: typeof orderItems = [];
  const postBatchOrderItems: typeof orderItems = [];

  for (const item of orderItems) {
    const returnBatchQty = item.ReturnBatch.reduce(
      (sum, ret) => sum + ret.quantity,
      0
    );

    const linkedQty = item.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const returned =
      Math.max(item.returned, returnBatchQty);

    const net = Math.max(item.quantity - returned, 0);

    grossOrders += item.quantity;
    returnedFieldTotal += item.returned;
    returnBatchTotal += returnBatchQty;
    netOrders += net;

    linkedOrderBatchQty += linkedQty;

    if (linkedQty < item.quantity) {
      unlinkedOrderQty += item.quantity - linkedQty;
    }

    const isPreBatch =
      firstBatch && item.order.date < firstBatch.receivedAt;

    if (isPreBatch) {
      preBatchOrderItems.push(item);
      preBatchGrossOrders += item.quantity;
      preBatchReturned += returned;
      preBatchNetOrders += net;
    } else {
      postBatchOrderItems.push(item);
      postBatchGrossOrders += item.quantity;
      postBatchReturned += returned;
      postBatchNetOrders += net;
    }
  }

  console.log(`TOTAL ORDER ITEMS = ${orderItems.length}`);
  console.log(`GROSS ORDERS = ${grossOrders} шт`);
  console.log(`RETURNED FIELD = ${returnedFieldTotal} шт`);
  console.log(`RETURNBATCH TOTAL = ${returnBatchTotal} шт`);
  console.log(`NET ORDERS = ${netOrders} шт`);
  console.log(`ORDERBATCH LINKED QTY = ${linkedOrderBatchQty} шт`);
  console.log(`ORDER QTY WITHOUT BATCH LINK = ${unlinkedOrderQty} шт`);

  // ---------------------------------------------------------------------------
  // 5. PRE-BATCH ORDERS
  // ---------------------------------------------------------------------------

  section("5. PRE-BATCH ORDERS");

  if (!firstBatch) {
    console.log("Нет первой Batch — невозможно определить pre-batch период.");
  } else if (preBatchOrderItems.length === 0) {
    console.log("Pre-batch заказов нет.");
  } else {
    for (const item of preBatchOrderItems) {
      const returnBatchQty = item.ReturnBatch.reduce(
        (sum, ret) => sum + ret.quantity,
        0
      );

      const returned = Math.max(
        item.returned,
        returnBatchQty
      );

      const net = Math.max(
        item.quantity - returned,
        0
      );

      const linkedQty = item.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      console.log("");
      console.log(
        `Order #${item.orderId} | ` +
          `date=${fmtDate(item.order.date)} | ` +
          `OrderItem #${item.id}`
      );

      console.log(`  gross=${item.quantity}`);
      console.log(`  returned field=${item.returned}`);
      console.log(`  ReturnBatch=${returnBatchQty}`);
      console.log(`  net=${net}`);
      console.log(`  OrderBatch=${linkedQty}`);
      console.log(`  status=${item.order.status}`);

      if (item.batches.length === 0) {
        console.log("  🔴 OrderBatch: НЕТ");
      } else {
        for (const link of item.batches) {
          console.log(
            `  OrderBatch -> Batch #${link.batchId} | qty=${link.quantity}`
          );
        }
      }

      if (item.ReturnBatch.length === 0) {
        console.log("  ReturnBatch: НЕТ");
      } else {
        for (const ret of item.ReturnBatch) {
          console.log(
            `  ReturnBatch -> Batch #${ret.batchId} | qty=${ret.quantity}`
          );
        }
      }
    }
  }

  console.log("");
  console.log(`PRE-BATCH GROSS = ${preBatchGrossOrders} шт`);
  console.log(`PRE-BATCH RETURN = ${preBatchReturned} шт`);
  console.log(`PRE-BATCH NET = ${preBatchNetOrders} шт`);

  // ---------------------------------------------------------------------------
  // 6. MOVEMENTS
  // ---------------------------------------------------------------------------

  section("6. MOVEMENT HISTORY");

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  let movementSupply = 0;
  let movementSale = 0;
  let movementReturn = 0;
  let movementWriteOff = 0;
  let movementOther = 0;

  let preBatchMovementNet = 0;
  let preBatchSaleMovement = 0;
  let preBatchSupplyMovement = 0;
  let preBatchReturnMovement = 0;
  let preBatchWriteOffMovement = 0;

  let runningMovementBalance = 0;

  for (const movement of movements) {
    runningMovementBalance += movement.quantity;

    const type = movement.type.toUpperCase();

    if (type === "SUPPLY") {
      movementSupply += movement.quantity;
    } else if (type === "SALE") {
      movementSale += movement.quantity;
    } else if (type === "RETURN") {
      movementReturn += movement.quantity;
    } else if (type === "WRITE_OFF") {
      movementWriteOff += movement.quantity;
    } else {
      movementOther += movement.quantity;
    }

    const isPreBatch =
      firstBatch && movement.createdAt < firstBatch.receivedAt;

    if (isPreBatch) {
      preBatchMovementNet += movement.quantity;

      if (type === "SALE") {
        preBatchSaleMovement += movement.quantity;
      } else if (type === "SUPPLY") {
        preBatchSupplyMovement += movement.quantity;
      } else if (type === "RETURN") {
        preBatchReturnMovement += movement.quantity;
      } else if (type === "WRITE_OFF") {
        preBatchWriteOffMovement += movement.quantity;
      }
    }

    console.log(
      `Movement #${movement.id} | ` +
        `${fmtDate(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `qty=${signed(movement.quantity)} | ` +
        `${movement.comment ?? ""}`
    );
  }

  console.log("");
  console.log(`MOVEMENT SUPPLY = ${movementSupply} шт`);
  console.log(`MOVEMENT SALE = ${movementSale} шт`);
  console.log(`MOVEMENT RETURN = ${movementReturn} шт`);
  console.log(`MOVEMENT WRITE_OFF = ${movementWriteOff} шт`);
  console.log(`MOVEMENT OTHER = ${movementOther} шт`);
  console.log(`MOVEMENT NET = ${runningMovementBalance} шт`);

  console.log("");
  console.log(`PRE-BATCH MOVEMENT NET = ${preBatchMovementNet} шт`);
  console.log(`PRE-BATCH SALE MOVEMENT = ${preBatchSaleMovement} шт`);
  console.log(`PRE-BATCH SUPPLY MOVEMENT = ${preBatchSupplyMovement} шт`);
  console.log(`PRE-BATCH RETURN MOVEMENT = ${preBatchReturnMovement} шт`);
  console.log(
    `PRE-BATCH WRITE_OFF MOVEMENT = ${preBatchWriteOffMovement} шт`
  );

  // ---------------------------------------------------------------------------
  // 7. BATCH-REFERENCED MOVEMENTS
  // ---------------------------------------------------------------------------

  section("7. BATCH REFERENCES INSIDE MOVEMENT COMMENTS");

  const batchReferenceRegex = /парт(?:ия|ии)\s*№\s*(\d+)/i;

  const referencedBatchIds = new Set<number>();

  for (const movement of movements) {
    const match = movement.comment?.match(
      batchReferenceRegex
    );

    if (!match) continue;

    const batchId = Number(match[1]);

    referencedBatchIds.add(batchId);

    const exists = batches.some(
      (batch) => batch.id === batchId
    );

    console.log(
      `${exists ? "🟢" : "🔴"} Batch #${batchId} | ` +
        `Movement #${movement.id} | ` +
        `type=${movement.type} | ` +
        `qty=${movement.quantity} | ` +
        `date=${fmtDate(movement.createdAt)}`
    );

    console.log(
      `  comment=${movement.comment ?? "-"}`
    );
  }

  if (referencedBatchIds.size === 0) {
    console.log("Batch references в Movement не найдены.");
  }

  const missingBatchIds = [...referencedBatchIds].filter(
    (id) => !batches.some((batch) => batch.id === id)
  );

  // ---------------------------------------------------------------------------
  // 8. MISSING BATCH ANALYSIS
  // ---------------------------------------------------------------------------

  section("8. MISSING HISTORICAL BATCH ANALYSIS");

  if (missingBatchIds.length === 0) {
    console.log("🔵 Потерянные Batch по комментариям Movement не обнаружены.");
  } else {
    for (const batchId of missingBatchIds) {
      const relatedMovements = movements.filter(
        (movement) => {
          const match = movement.comment?.match(
            batchReferenceRegex
          );

          return match && Number(match[1]) === batchId;
        }
      );

      const writeOff = relatedMovements
        .filter(
          (movement) =>
            movement.type.toUpperCase() === "WRITE_OFF"
        )
        .reduce(
          (sum, movement) =>
            sum + Math.abs(movement.quantity),
          0
        );

      const sale = relatedMovements
        .filter(
          (movement) =>
            movement.type.toUpperCase() === "SALE"
        )
        .reduce(
          (sum, movement) =>
            sum + Math.abs(movement.quantity),
          0
        );

      const returns = relatedMovements
        .filter(
          (movement) =>
            movement.type.toUpperCase() === "RETURN"
        )
        .reduce(
          (sum, movement) =>
            sum + movement.quantity,
          0
        );

      console.log("");
      console.log(`🔴 MISSING BATCH #${batchId}`);
      console.log(`Referenced movements=${relatedMovements.length}`);
      console.log(`Confirmed WRITE_OFF=${writeOff} шт`);
      console.log(`SALE references=${sale} шт`);
      console.log(`RETURN references=${returns} шт`);

      const minimumQuantity =
        writeOff + sale - returns;

      console.log(
        `MINIMUM HISTORICAL QUANTITY = ${minimumQuantity} шт`
      );

      for (const movement of relatedMovements) {
        console.log(
          `  Movement #${movement.id} | ` +
            `${movement.type} | ` +
            `qty=${movement.quantity} | ` +
            `${fmtDate(movement.createdAt)}`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 9. PRE-BATCH RECONSTRUCTION
  // ---------------------------------------------------------------------------

  section("9. PRE-BATCH HISTORICAL RECONSTRUCTION");

  console.log(
    "Реконструкция выполняется только математически."
  );
  console.log(
    "Она НЕ означает, что соответствующие Batch действительно существовали."
  );

  const businessPreBatchOpening =
    preBatchNetOrders - preBatchSupply;

  const movementPreBatchOpening =
    -preBatchMovementNet;

  const preBatchMissingSaleMovement =
    -preBatchNetOrders - preBatchSaleMovement;

  console.log("");
  console.log(
    `Pre-batch supply = ${preBatchSupply} шт`
  );
  console.log(
    `Pre-batch net sales = ${preBatchNetOrders} шт`
  );
  console.log(
    `Pre-batch movement net = ${preBatchMovementNet} шт`
  );

  console.log("");
  console.log(
    `BUSINESS OPENING REQUIREMENT = ${businessPreBatchOpening} шт`
  );

  console.log(
    `MOVEMENT OPENING REQUIREMENT = ${movementPreBatchOpening} шт`
  );

  console.log(
    `MISSING PRE-BATCH SALE MOVEMENT = ${preBatchMissingSaleMovement} шт`
  );

  // ---------------------------------------------------------------------------
  // 10. GLOBAL STOCK EQUATIONS
  // ---------------------------------------------------------------------------

  section("10. GLOBAL STOCK EQUATIONS");

  const currentStock = product.stock;

  const grossSales = grossOrders;
  const returns = returnBatchTotal;
  const writeOffs = Math.abs(movementWriteOff);

  const businessOpening =
    currentStock -
    totalSupply +
    grossSales -
    returns +
    writeOffs;

  const movementOpening =
    currentStock -
    runningMovementBalance;

  const batchKnownStock =
    totalCurrentBatchQty;

  const batchSold =
    totalBatchSold;

  const batchReturned =
    totalBatchReturned;

  const batchNetConsumption =
    batchSold - batchReturned;

  console.log(`CURRENT PRODUCT.STOCK = ${currentStock} шт`);
  console.log(`TOTAL SUPPLY = ${totalSupply} шт`);
  console.log(`GROSS SALES = ${grossSales} шт`);
  console.log(`RETURNBATCH = ${returns} шт`);
  console.log(`WRITE-OFF = ${writeOffs} шт`);

  console.log("");
  console.log(
    `BUSINESS OPENING = ${currentStock} - ${totalSupply} + ` +
      `${grossSales} - ${returns} + ${writeOffs}`
  );

  console.log(
    `BUSINESS OPENING REQUIRED = ${businessOpening} шт`
  );

  console.log("");
  console.log(
    `MOVEMENT NET = ${runningMovementBalance} шт`
  );

  console.log(
    `MOVEMENT OPENING REQUIRED = ${movementOpening} шт`
  );

  console.log("");
  console.log(
    `CURRENT BATCH STOCK = ${batchKnownStock} шт`
  );

  console.log(
    `CURRENT BATCH SOLD = ${batchSold} шт`
  );

  console.log(
    `CURRENT BATCH RETURNED = ${batchReturned} шт`
  );

  console.log(
    `CURRENT BATCH NET CONSUMPTION = ${batchNetConsumption} шт`
  );

  // ---------------------------------------------------------------------------
  // 11. MODEL COMPARISON
  // ---------------------------------------------------------------------------

  section("11. MODEL COMPARISON");

  const modelGap =
    businessOpening - movementOpening;

  const batchVsProductGap =
    currentStock - batchKnownStock;

  console.log(
    `Business opening = ${businessOpening} шт`
  );

  console.log(
    `Movement opening = ${movementOpening} шт`
  );

  console.log(
    `Business ↔ Movement gap = ${modelGap} шт`
  );

  console.log(
    `Product.stock = ${currentStock} шт`
  );

  console.log(
    `Batch total = ${batchKnownStock} шт`
  );

  console.log(
    `Product.stock ↔ Batch gap = ${batchVsProductGap} шт`
  );

  // ---------------------------------------------------------------------------
  // 12. HISTORICAL UNKNOWN STOCK
  // ---------------------------------------------------------------------------

  section("12. KNOWN VS UNKNOWN HISTORICAL STOCK");

  let confirmedMissingBatchQty = 0;

  for (const batchId of missingBatchIds) {
    const relatedMovements = movements.filter(
      (movement) => {
        const match = movement.comment?.match(
          batchReferenceRegex
        );

        return match && Number(match[1]) === batchId;
      }
    );

    const writeOff = relatedMovements
      .filter(
        (movement) =>
          movement.type.toUpperCase() === "WRITE_OFF"
      )
      .reduce(
        (sum, movement) =>
          sum + Math.abs(movement.quantity),
        0
      );

    const sale = relatedMovements
      .filter(
        (movement) =>
          movement.type.toUpperCase() === "SALE"
      )
      .reduce(
        (sum, movement) =>
          sum + Math.abs(movement.quantity),
        0
      );

    const ret = relatedMovements
      .filter(
        (movement) =>
          movement.type.toUpperCase() === "RETURN"
      )
      .reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    confirmedMissingBatchQty +=
      writeOff + sale - ret;
  }

  const unknownHistoricalStock =
    Math.max(
      businessOpening - confirmedMissingBatchQty,
      0
    );

  console.log(
    `Required opening = ${businessOpening} шт`
  );

  console.log(
    `Confirmed missing Batch quantity = ${confirmedMissingBatchQty} шт`
  );

  console.log(
    `UNKNOWN HISTORICAL STOCK = ${unknownHistoricalStock} шт`
  );

  // ---------------------------------------------------------------------------
  // 13. PRE-BATCH ORDER / MOVEMENT GAP
  // ---------------------------------------------------------------------------

  section("13. PRE-BATCH ORDER ↔ MOVEMENT GAP");

  let ordersWithMissingMovement = 0;
  let totalOrderMovementGap = 0;

  for (const item of preBatchOrderItems) {
    const returnBatchQty = item.ReturnBatch.reduce(
      (sum, ret) => sum + ret.quantity,
      0
    );

    const returned = Math.max(
      item.returned,
      returnBatchQty
    );

    const net = Math.max(
      item.quantity - returned,
      0
    );

    /*
     * В Movement нет orderId/orderItemId.
     * Поэтому здесь не пытаемся ложно привязать Movement
     * к конкретному OrderItem.
     *
     * Сравниваем только общий pre-batch SALE movement.
     */
    const expected = net;

    if (expected > 0) {
      ordersWithMissingMovement++;
      totalOrderMovementGap += expected;
    }
  }

  const actualPreBatchSaleAbs =
    Math.abs(preBatchSaleMovement);

  const expectedPreBatchSale =
    preBatchNetOrders;

  const missingPreBatchSale =
    Math.max(
      expectedPreBatchSale -
        actualPreBatchSaleAbs,
      0
    );

  console.log(
    `Pre-batch orders requiring SALE movements = ${ordersWithMissingMovement}`
  );

  console.log(
    `Expected pre-batch SALE movements = ${expectedPreBatchSale} шт`
  );

  console.log(
    `Actual pre-batch SALE movement ABS = ${actualPreBatchSaleAbs} шт`
  );

  console.log(
    `Missing pre-batch SALE movements = ${missingPreBatchSale} шт`
  );

  console.log(
    `Sum of pre-batch order net quantities = ${totalOrderMovementGap} шт`
  );

  // ---------------------------------------------------------------------------
  // 14. COST / VALUE VIEW
  // ---------------------------------------------------------------------------

  section("14. HISTORICAL COST VIEW");

  const preBatchSupplyValue = supplyItems
    .filter(
      (item) =>
        firstBatch &&
        item.supply.date < firstBatch.receivedAt
    )
    .reduce(
      (sum, item) =>
        sum + item.quantity * item.cost,
      0
    );

  const currentBatchValue = batches.reduce(
    (sum, batch) =>
      sum + batch.quantity * batch.purchaseCost,
    0
  );

  const missingBatchCostKnown =
    26 * 200;

  console.log(
    `PRE-BATCH REGISTERED SUPPLY VALUE = ${money(
      preBatchSupplyValue
    )}`
  );

  console.log(
    `CURRENT BATCH STOCK VALUE = ${money(
      currentBatchValue
    )}`
  );

  if (missingBatchIds.includes(4)) {
    console.log(
      `IF missing Batch #4 cost assumed 200 ₽ -> ${money(
        missingBatchCostKnown
      )}`
    );
    console.log(
      "⚠️ Это НЕ подтверждённая стоимость Batch #4."
    );
  }

  // ---------------------------------------------------------------------------
  // 15. RECONSTRUCTION TIMELINE
  // ---------------------------------------------------------------------------

  section("15. HISTORICAL RECONSTRUCTION TIMELINE");

  type TimelineRow = {
    date: Date;
    type: string;
    source: string;
    quantity: number;
    note: string;
  };

  const timeline: TimelineRow[] = [];

  for (const item of supplyItems) {
    timeline.push({
      date: item.supply.date,
      type: "SUPPLY",
      source: `Supply #${item.supplyId} / SupplyItem #${item.id}`,
      quantity: item.quantity,
      note: `Приход ${item.quantity} шт, cost=${money(item.cost)}`,
    });
  }

  for (const item of orderItems) {
    const returned = Math.max(
      item.returned,
      item.ReturnBatch.reduce(
        (sum, ret) => sum + ret.quantity,
        0
      )
    );

    const net = Math.max(
      item.quantity - returned,
      0
    );

    timeline.push({
      date: item.order.date,
      type: "ORDER",
      source: `Order #${item.orderId} / OrderItem #${item.id}`,
      quantity: -net,
      note:
        `Продажа gross=${item.quantity}, ` +
        `returned=${returned}, net=${net}`,
    });
  }

  for (const movement of movements) {
    timeline.push({
      date: movement.createdAt,
      type: "MOVEMENT",
      source: `Movement #${movement.id}`,
      quantity: movement.quantity,
      note: `${movement.type}: ${movement.comment ?? ""}`,
    });
  }

  for (const batch of batches) {
    timeline.push({
      date: batch.receivedAt,
      type: "BATCH",
      source: `Batch #${batch.id}`,
      quantity: batch.quantity,
      note:
        `Batch received, current qty=${batch.quantity}, ` +
        `cost=${money(batch.purchaseCost)}`,
    });
  }

  timeline.sort((a, b) => {
    const dateDiff =
      a.date.getTime() -
      b.date.getTime();

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return a.type.localeCompare(b.type);
  });

  let businessBalance = 0;
  let movementBalance = 0;

  for (const row of timeline) {
    if (row.type === "ORDER") {
      businessBalance += row.quantity;
    } else if (row.type === "SUPPLY") {
      businessBalance += row.quantity;
    }

    movementBalance +=
      row.type === "MOVEMENT"
        ? row.quantity
        : 0;

    console.log("");
    console.log(
      `${fmtDate(row.date)} | ` +
        `${row.type.padEnd(9)} | ` +
        `${row.source} | ` +
        `qty=${signed(row.quantity)} | ` +
        `business=${businessBalance} | ` +
        `movement=${movementBalance}`
    );

    console.log(`  ${row.note}`);
  }

  // ---------------------------------------------------------------------------
  // 16. FINAL DIAGNOSTIC FLAGS
  // ---------------------------------------------------------------------------

  section("16. DIAGNOSTIC FLAGS");

  const flags: string[] = [];

  if (preBatchOrderItems.length > 0) {
    flags.push(
      `🔴 Есть ${preBatchOrderItems.length} pre-batch OrderItem без полноценной batch-истории.`
    );
  }

  if (missingPreBatchSale > 0) {
    flags.push(
      `🔴 До первой Batch отсутствует минимум ${missingPreBatchSale} шт SALE Movement.`
    );
  }

  if (missingBatchIds.length > 0) {
    flags.push(
      `🔴 Найдены ссылки на отсутствующие Batch: ${missingBatchIds
        .map((id) => `#${id}`)
        .join(", ")}.`
    );
  }

  if (unknownHistoricalStock > 0) {
    flags.push(
      `🟠 После подтверждённых missing Batch остаётся ${unknownHistoricalStock} шт исторического stock без однозначного происхождения.`
    );
  }

  if (batchVsProductGap !== 0) {
    flags.push(
      `🔴 Product.stock и сумма Batch расходятся на ${batchVsProductGap} шт.`
    );
  } else {
    flags.push(
      "🟢 Product.stock совпадает с суммой текущих Batch."
    );
  }

  if (modelGap !== 0) {
    flags.push(
      `🟠 Business и Movement модели расходятся на ${modelGap} шт.`
    );
  } else {
    flags.push(
      "🟢 Business и Movement модели совпадают."
    );
  }

  if (flags.length === 0) {
    console.log("🟢 Критических диагностических флагов нет.");
  } else {
    for (const flag of flags) {
      console.log(flag);
    }
  }

  // ---------------------------------------------------------------------------
  // 17. FINAL RESULT
  // ---------------------------------------------------------------------------

  section("17. FINAL RESULT");

  console.log(`Product = ${product.name}`);
  console.log(`Product ID = ${product.id}`);
  console.log(`Product.stock = ${product.stock} шт`);

  if (firstBatch) {
    console.log(`First current Batch = #${firstBatch.id}`);
    console.log(
      `First Batch date = ${fmtDate(firstBatch.receivedAt)}`
    );
  } else {
    console.log("First current Batch = НЕТ");
  }

  console.log("");
  console.log(`Total supplies = ${totalSupply} шт`);
  console.log(`Gross orders = ${grossOrders} шт`);
  console.log(`Returns = ${returns} шт`);
  console.log(`Write-offs = ${writeOffs} шт`);

  console.log("");
  console.log(
    `Business opening required = ${businessOpening} шт`
  );

  console.log(
    `Movement opening required = ${movementOpening} шт`
  );

  console.log(
    `Business ↔ Movement gap = ${modelGap} шт`
  );

  console.log("");
  console.log(
    `Confirmed missing Batch quantity = ${confirmedMissingBatchQty} шт`
  );

  console.log(
    `Unknown historical stock = ${unknownHistoricalStock} шт`
  );

  console.log("");
  console.log(
    `Pre-batch supply = ${preBatchSupply} шт`
  );

  console.log(
    `Pre-batch net orders = ${preBatchNetOrders} шт`
  );

  console.log(
    `Pre-batch SALE Movement = ${preBatchSaleMovement} шт`
  );

  console.log(
    `Missing pre-batch SALE Movement = ${missingPreBatchSale} шт`
  );

  console.log("");
  console.log(
    `OrderBatch linked quantity = ${linkedOrderBatchQty} шт`
  );

  console.log(
    `Order quantity without Batch links = ${unlinkedOrderQty} шт`
  );

  console.log("");
  console.log("⚠️ ЭТО READ-ONLY АУДИТ.");

  console.log("");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
  console.log("⚠️ Batch НЕ создавались.");
  console.log("⚠️ Movement НЕ создавались.");
  console.log("⚠️ OrderBatch НЕ изменялись.");
  console.log("⚠️ ReturnBatch НЕ изменялись.");
  console.log("⚠️ Product.stock НЕ изменялся.");

  console.log("");
  console.log(
    "🏁 HISTORICAL RECONSTRUCTION AUDIT V9 ЗАВЕРШЁН"
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ AUDIT V9 ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });