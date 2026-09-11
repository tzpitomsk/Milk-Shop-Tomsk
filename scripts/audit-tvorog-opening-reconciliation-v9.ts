import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

function line() {
  console.log("\n======================================================================\n");
}

function fmtDate(date: Date | null | undefined) {
  return date ? date.toISOString() : "-";
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

type TimelineEvent = {
  date: Date;
  type: string;
  source: string;
  quantity: number;
  note: string;
};

async function main() {
  console.log("\n======================================================================");
  console.log("\n🧀 ТВОРОГ — OPENING RECONCILIATION AUDIT V9");
  console.log("\n======================================================================");
  console.log("\n⚠️ READ ONLY");
  console.log("\n⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log(
    "\nЦель: разделить исторический opening stock, потерянные Batch и отсутствующие Movement."
  );

  line();

  // -------------------------------------------------------------------
  // 1. PRODUCT
  // -------------------------------------------------------------------

  console.log("1. PRODUCT");
  line();

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!product) {
    throw new Error(
      `Product #${PRODUCT_ID} (${PRODUCT_NAME}) не найден`
    );
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);
  console.log(`cost=${product.cost} ₽`);
  console.log(`price=${product.price} ₽`);

  line();

  // -------------------------------------------------------------------
  // 2. ALL BATCHES
  // -------------------------------------------------------------------

  console.log("2. ALL CURRENT BATCHES");
  line();

  const batches = await prisma.batch.findMany({
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
  });

  if (batches.length === 0) {
    console.log("🔴 Batch для Творога не найдено");
  }

  for (const batch of batches) {
    console.log(
      `Batch #${batch.id} | ` +
        `qty=${batch.quantity} | ` +
        `cost=${batch.purchaseCost} ₽ | ` +
        `received=${fmtDate(batch.receivedAt)} | ` +
        `expiry=${fmtDate(batch.expiryDate)} | ` +
        `status=${batch.status}`
    );
  }

  const currentBatchTotal = batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  console.log(`\nCURRENT BATCH TOTAL = ${currentBatchTotal} шт`);

  const firstBatch = batches[0] ?? null;

  if (!firstBatch) {
    throw new Error("Невозможно определить границу первого Batch");
  }

  console.log(`FIRST CURRENT BATCH = #${firstBatch.id}`);
  console.log(
    `FIRST CURRENT BATCH DATE = ${fmtDate(firstBatch.receivedAt)}`
  );

  line();

  // -------------------------------------------------------------------
  // 3. ALL SUPPLIES
  // -------------------------------------------------------------------

  console.log("3. ALL SUPPLIES");
  line();

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

  let supplyTotal = 0;
  let preBatchSupplyTotal = 0;

  for (const item of supplyItems) {
    supplyTotal += item.quantity;

    const isPreBatch =
      item.supply.date <= firstBatch.receivedAt;

    if (isPreBatch) {
      preBatchSupplyTotal += item.quantity;
    }

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `date=${fmtDate(item.supply.date)} | ` +
        `qty=${item.quantity} | ` +
        `cost=${item.cost} ₽ | ` +
        `${isPreBatch ? "PRE-BATCH" : "POST-BATCH"}`
    );
  }

  console.log(`\nSUPPLY TOTAL = ${supplyTotal} шт`);
  console.log(`PRE-BATCH SUPPLY TOTAL = ${preBatchSupplyTotal} шт`);

  line();

  // -------------------------------------------------------------------
  // 4. ALL ORDER ITEMS
  // -------------------------------------------------------------------

  console.log("4. ALL TVOROG ORDERS");
  line();

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
  let orderBatchTotal = 0;

  let earlyGrossOrders = 0;
  let earlyReturnedField = 0;
  let earlyReturnBatch = 0;
  let earlyNetOrders = 0;
  let earlyOrderBatchCoverage = 0;

  for (const item of orderItems) {
    const returnedByBatches = item.ReturnBatch.reduce(
      (sum, returnBatch) => sum + returnBatch.quantity,
      0
    );

    const linkedBatchQuantity = item.batches.reduce(
      (sum, orderBatch) => sum + orderBatch.quantity,
      0
    );

    const net = item.quantity - item.returned;

    grossOrders += item.quantity;
    returnedFieldTotal += item.returned;
    returnBatchTotal += returnedByBatches;
    netOrders += net;
    orderBatchTotal += linkedBatchQuantity;

    const isEarly =
      item.order.date < firstBatch.receivedAt;

    if (isEarly) {
      earlyGrossOrders += item.quantity;
      earlyReturnedField += item.returned;
      earlyReturnBatch += returnedByBatches;
      earlyNetOrders += net;
      earlyOrderBatchCoverage += linkedBatchQuantity;
    }

    console.log(
      `Order #${item.orderId} | ` +
        `date=${fmtDate(item.order.date)} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${item.quantity} | ` +
        `returned field=${item.returned} | ` +
        `ReturnBatch=${returnedByBatches} | ` +
        `net=${net} | ` +
        `OrderBatch=${linkedBatchQuantity} | ` +
        `status=${item.order.status} | ` +
        `${isEarly ? "PRE-BATCH" : "POST-BATCH"}`
    );
  }

  console.log("\n--- ORDER TOTALS ---\n");

  console.log(`GROSS ORDERS = ${grossOrders} шт`);
  console.log(`RETURNED FIELD = ${returnedFieldTotal} шт`);
  console.log(`RETURNBATCH TOTAL = ${returnBatchTotal} шт`);
  console.log(`NET ORDERS = ${netOrders} шт`);
  console.log(`ORDERBATCH COVERAGE = ${orderBatchTotal} шт`);

  console.log("\n--- EARLY ORDER TOTALS ---\n");

  console.log(`EARLY GROSS = ${earlyGrossOrders} шт`);
  console.log(`EARLY RETURNED FIELD = ${earlyReturnedField} шт`);
  console.log(`EARLY RETURNBATCH TOTAL = ${earlyReturnBatch} шт`);
  console.log(`EARLY NET = ${earlyNetOrders} шт`);
  console.log(
    `EARLY ORDERBATCH COVERAGE = ${earlyOrderBatchCoverage} шт`
  );

  line();

  // -------------------------------------------------------------------
  // 5. ALL MOVEMENTS
  // -------------------------------------------------------------------

  console.log("5. ALL MOVEMENTS");
  line();

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

  let movementNet = 0;
  let saleMovementNet = 0;
  let returnMovementTotal = 0;
  let supplyMovementTotal = 0;
  let writeOffMovementTotal = 0;

  let earlyMovementNet = 0;
  let earlySaleMovementNet = 0;
  let earlySupplyMovementNet = 0;
  let earlyReturnMovementNet = 0;
  let earlyWriteOffMovementNet = 0;

  for (const movement of movements) {
    movementNet += movement.quantity;

    if (movement.type === "SALE") {
      saleMovementNet += movement.quantity;
    }

    if (movement.type === "RETURN") {
      returnMovementTotal += movement.quantity;
    }

    if (movement.type === "SUPPLY") {
      supplyMovementTotal += movement.quantity;
    }

    if (movement.type === "WRITE_OFF") {
      writeOffMovementTotal += movement.quantity;
    }

    const isEarly =
      movement.createdAt < firstBatch.receivedAt;

    if (isEarly) {
      earlyMovementNet += movement.quantity;

      if (movement.type === "SALE") {
        earlySaleMovementNet += movement.quantity;
      }

      if (movement.type === "SUPPLY") {
        earlySupplyMovementNet += movement.quantity;
      }

      if (movement.type === "RETURN") {
        earlyReturnMovementNet += movement.quantity;
      }

      if (movement.type === "WRITE_OFF") {
        earlyWriteOffMovementNet += movement.quantity;
      }
    }

    console.log(
      `Movement #${movement.id} | ` +
        `date=${fmtDate(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `qty=${signed(movement.quantity)} | ` +
        `comment=${movement.comment ?? "-"} | ` +
        `${isEarly ? "PRE-BATCH" : "POST-BATCH"}`
    );
  }

  console.log("\n--- MOVEMENT TOTALS ---\n");

  console.log(`MOVEMENT NET = ${movementNet} шт`);
  console.log(`SALE MOVEMENT NET = ${saleMovementNet} шт`);
  console.log(`RETURN MOVEMENT TOTAL = ${returnMovementTotal} шт`);
  console.log(`SUPPLY MOVEMENT TOTAL = ${supplyMovementTotal} шт`);
  console.log(`WRITE-OFF MOVEMENT TOTAL = ${writeOffMovementTotal} шт`);

  console.log("\n--- EARLY MOVEMENT TOTALS ---\n");

  console.log(`EARLY MOVEMENT NET = ${earlyMovementNet} шт`);
  console.log(`EARLY SALE MOVEMENT NET = ${earlySaleMovementNet} шт`);
  console.log(`EARLY SUPPLY MOVEMENT NET = ${earlySupplyMovementNet} шт`);
  console.log(`EARLY RETURN MOVEMENT NET = ${earlyReturnMovementNet} шт`);
  console.log(
    `EARLY WRITE-OFF MOVEMENT NET = ${earlyWriteOffMovementNet} шт`
  );

  line();

  // -------------------------------------------------------------------
  // 6. MISSING SALE MOVEMENT ANALYSIS
  // -------------------------------------------------------------------

  console.log("6. EARLY ORDER ↔ SALE MOVEMENT RECONCILIATION");
  line();

  const earlyItems = orderItems.filter(
    (item) => item.order.date < firstBatch.receivedAt
  );

  const movementByOrderId = new Map<number, number[]>();

  const orderNumberRegex = /заказ\s*№?\s*(\d+)/i;

  for (const movement of movements) {
    if (movement.type !== "SALE") {
      continue;
    }

    if (!movement.comment) {
      continue;
    }

    const match = movement.comment.match(orderNumberRegex);

    if (!match) {
      continue;
    }

    const orderId = Number(match[1]);

    const existing =
      movementByOrderId.get(orderId) ?? [];

    existing.push(movement.quantity);

    movementByOrderId.set(orderId, existing);
  }

  let missingSaleMovementQuantity = 0;
  let ordersWithMissingMovement = 0;

  for (const item of earlyItems) {
    const expected = -item.quantity;

    const quantities =
      movementByOrderId.get(item.orderId) ?? [];

    const actual = quantities.reduce(
      (sum, quantity) => sum + quantity,
      0
    );

    const gap = expected - actual;

    console.log(
      `Order #${item.orderId} | ` +
        `OrderItem #${item.id} | ` +
        `expected=${expected} | ` +
        `actual=${actual} | ` +
        `gap=${gap}`
    );

    if (gap !== 0) {
      ordersWithMissingMovement += 1;
      missingSaleMovementQuantity += gap;
      console.log("  🔴 SALE Movement отсутствует или неполный");
    } else {
      console.log("  🟢 SALE Movement coverage OK");
    }
  }

  console.log("\n--- RESULT ---\n");

  console.log(
    `ORDERS WITH MISSING / INCORRECT SALE MOVEMENT = ${ordersWithMissingMovement}`
  );

  console.log(
    `TOTAL MISSING SALE MOVEMENT QUANTITY = ${missingSaleMovementQuantity} шт`
  );

  line();

  // -------------------------------------------------------------------
  // 7. MISSING BATCH REFERENCES
  // -------------------------------------------------------------------

  console.log("7. HISTORICAL BATCH REFERENCES");
  line();

  const batchReferenceRegex = /партия\s*№?\s*(\d+)/i;

  const referencedBatchIds = new Map<number, typeof movements>();

  for (const movement of movements) {
    if (!movement.comment) {
      continue;
    }

    const match = movement.comment.match(batchReferenceRegex);

    if (!match) {
      continue;
    }

    const batchId = Number(match[1]);

    const existing =
      referencedBatchIds.get(batchId) ?? [];

    existing.push(movement);

    referencedBatchIds.set(batchId, existing);
  }

  let confirmedMissingBatchQuantity = 0;

  for (const [batchId, batchMovements] of referencedBatchIds.entries()) {
    const batchExists = batches.some(
      (batch) => batch.id === batchId
    );

    const net = batchMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    console.log(
      `${batchExists ? "🟢" : "🔴"} Batch #${batchId} | ` +
        `exists=${batchExists} | ` +
        `movement net=${net}`
    );

    for (const movement of batchMovements) {
      console.log(
        `  Movement #${movement.id} | ` +
          `${movement.type} | ` +
          `qty=${movement.quantity} | ` +
          `${fmtDate(movement.createdAt)}`
      );
    }

    if (!batchExists) {
      const minimumHistoricalQuantity =
        Math.abs(
          batchMovements
            .filter(
              (movement) =>
                movement.type === "WRITE_OFF" &&
                movement.quantity < 0
            )
            .reduce(
              (sum, movement) =>
                sum + movement.quantity,
              0
            )
        );

      confirmedMissingBatchQuantity +=
        minimumHistoricalQuantity;

      console.log(
        `  🔴 MINIMUM CONFIRMED HISTORICAL QUANTITY = ${minimumHistoricalQuantity} шт`
      );
    }
  }

  line();

  // -------------------------------------------------------------------
  // 8. GLOBAL BUSINESS OPENING MODEL
  // -------------------------------------------------------------------

  console.log("8. GLOBAL BUSINESS OPENING MODEL");
  line();

  const writeOffAbsolute =
    Math.abs(writeOffMovementTotal);

  const openingRequiredByBusiness =
    product.stock -
    supplyTotal +
    grossOrders -
    returnedFieldTotal +
    writeOffAbsolute;

  console.log(`Current stock = ${product.stock} шт`);
  console.log(`Registered supply = ${supplyTotal} шт`);
  console.log(`Gross orders = ${grossOrders} шт`);
  console.log(`Returned field = ${returnedFieldTotal} шт`);
  console.log(`Write-offs = ${writeOffAbsolute} шт`);

  console.log(
    "\nOPENING = current stock - supply + gross orders - returns + write-offs"
  );

  console.log(
    `OPENING REQUIRED BY BUSINESS = ${openingRequiredByBusiness} шт`
  );

  line();

  // -------------------------------------------------------------------
  // 9. GLOBAL MOVEMENT OPENING MODEL
  // -------------------------------------------------------------------

  console.log("9. GLOBAL MOVEMENT OPENING MODEL");
  line();

  const openingRequiredByMovement =
    product.stock - movementNet;

  console.log(`Current stock = ${product.stock} шт`);
  console.log(`Movement net = ${movementNet} шт`);

  console.log(
    "\nOPENING = current stock - movement net"
  );

  console.log(
    `OPENING REQUIRED BY MOVEMENT = ${openingRequiredByMovement} шт`
  );

  const globalModelGap =
    openingRequiredByBusiness -
    openingRequiredByMovement;

  console.log(
    `\nBUSINESS ↔ MOVEMENT MODEL GAP = ${globalModelGap} шт`
  );

  line();

  // -------------------------------------------------------------------
  // 10. PRE-BATCH OPENING MODEL
  // -------------------------------------------------------------------

  console.log("10. PRE-BATCH OPENING MODEL");
  line();

  const preBatchBusinessDelta =
    preBatchSupplyTotal - earlyNetOrders;

  const preBatchOpeningByBusiness =
    -preBatchBusinessDelta;

  const preBatchOpeningByMovement =
    -earlyMovementNet;

  const preBatchModelGap =
    preBatchOpeningByBusiness -
    preBatchOpeningByMovement;

  console.log(
    `Pre-batch supply = ${preBatchSupplyTotal} шт`
  );

  console.log(
    `Pre-batch net orders = ${earlyNetOrders} шт`
  );

  console.log(
    `Pre-batch business delta = ${preBatchBusinessDelta} шт`
  );

  console.log(
    `Opening required by business = ${preBatchOpeningByBusiness} шт`
  );

  console.log(
    `Pre-batch movement net = ${earlyMovementNet} шт`
  );

  console.log(
    `Opening required by movement = ${preBatchOpeningByMovement} шт`
  );

  console.log(
    `Pre-batch model gap = ${preBatchModelGap} шт`
  );

  line();

  // -------------------------------------------------------------------
  // 11. RECONCILIATION MATRIX
  // -------------------------------------------------------------------

  console.log("11. RECONCILIATION MATRIX");
  line();

  const unexplainedAfterMissingBatch =
    openingRequiredByBusiness -
    confirmedMissingBatchQuantity;

  const missingSaleMovementAbsolute =
    Math.abs(missingSaleMovementQuantity);

  console.log(
    `A. REQUIRED HISTORICAL OPENING = ${openingRequiredByBusiness} шт`
  );

  console.log(
    `B. CONFIRMED MISSING HISTORICAL BATCH MINIMUM = ${confirmedMissingBatchQuantity} шт`
  );

  console.log(
    `C. OPENING NOT EXPLAINED BY CONFIRMED MISSING BATCH = ${unexplainedAfterMissingBatch} шт`
  );

  console.log(
    `D. MISSING SALE MOVEMENT QUANTITY = ${missingSaleMovementAbsolute} шт`
  );

  console.log(
    `E. BUSINESS ↔ MOVEMENT GLOBAL GAP = ${globalModelGap} шт`
  );

  console.log(
    `F. PRE-BATCH BUSINESS ↔ MOVEMENT GAP = ${preBatchModelGap} шт`
  );

  console.log("\n--- COMPARISON ---\n");

  if (
    unexplainedAfterMissingBatch ===
    missingSaleMovementAbsolute
  ) {
    console.log(
      `🟠 NUMERICAL COINCIDENCE: unexplained opening (${unexplainedAfterMissingBatch}) ` +
        `equals missing SALE Movement (${missingSaleMovementAbsolute})`
    );

    console.log(
      "⚠️ Это НЕ доказывает, что обе величины относятся к одному и тому же товару."
    );

    console.log(
      "⚠️ Автоматический repair на основании этого совпадения делать нельзя."
    );
  } else {
    console.log(
      "🟢 Unexplained opening и missing SALE Movement количественно различаются."
    );
  }

  line();

  // -------------------------------------------------------------------
  // 12. CATEGORY SEPARATION
  // -------------------------------------------------------------------

  console.log("12. PROBLEM CATEGORY SEPARATION");
  line();

  console.log(
    `A. Historical opening requirement: ${openingRequiredByBusiness} шт`
  );

  console.log(
    `B. Missing historical Batch minimum: ${confirmedMissingBatchQuantity} шт`
  );

  console.log(
    `C. Missing SALE Movement accounting gap: ${missingSaleMovementAbsolute} шт`
  );

  console.log(
    `D. Global business/movement mismatch: ${globalModelGap} шт`
  );

  console.log(
    `E. Early OrderBatch coverage: ${earlyOrderBatchCoverage} шт`
  );

  console.log(
    "\n⚠️ Эти категории нельзя автоматически суммировать."
  );

  console.log(
    "⚠️ Одна историческая проблема может проявляться одновременно в нескольких таблицах."
  );

  console.log(
    "⚠️ Сначала требуется установить причинную связь, затем строить repair plan."
  );

  line();

  // -------------------------------------------------------------------
  // 13. FINAL DECISION
  // -------------------------------------------------------------------

  console.log("13. FINAL RESULT");
  line();

  console.log(`Product = ${product.name}`);
  console.log(`Product ID = ${product.id}`);
  console.log(`Current Product.stock = ${product.stock} шт`);
  console.log(`Current Batch total = ${currentBatchTotal} шт`);

  console.log(
    `\nRequired historical opening = ${openingRequiredByBusiness} шт`
  );

  console.log(
    `Confirmed missing historical Batch minimum = ${confirmedMissingBatchQuantity} шт`
  );

  console.log(
    `Opening still unexplained by missing Batch = ${unexplainedAfterMissingBatch} шт`
  );

  console.log(
    `Missing SALE Movement quantity = ${missingSaleMovementAbsolute} шт`
  );

  console.log(
    `Global business/movement gap = ${globalModelGap} шт`
  );

  console.log(
    `Pre-batch business/movement gap = ${preBatchModelGap} шт`
  );

  console.log("\n⚠️ FINAL SAFETY STATUS");

  console.log(
    "READ ONLY AUDIT COMPLETED."
  );

  console.log(
    "Batch НЕ создавались."
  );

  console.log(
    "Movement НЕ создавались."
  );

  console.log(
    "OrderBatch НЕ изменялись."
  );

  console.log(
    "ReturnBatch НЕ изменялись."
  );

  console.log(
    "Product.stock НЕ изменялся."
  );

  console.log(
    "\n🏁 AUDIT V9 ЗАВЕРШЁН"
  );
}

main()
  .catch((error) => {
    console.error("\n🔴 AUDIT FAILED\n");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });