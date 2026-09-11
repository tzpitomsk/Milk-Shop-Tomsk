import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const FIRST_BATCH_ID = 13;

function line(char = "=") {
  console.log(char.repeat(70));
}

function fmtDate(date: Date | null | undefined) {
  if (!date) return "-";
  return date.toISOString();
}

function fmtSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

type TimelineRow = {
  date: Date;
  type: string;
  source: string;
  quantity: number;
  details: string;
};

async function main() {
  line();

  console.log("🧀 ТВОРОГ — HISTORICAL RECONSTRUCTION AUDIT V8");

  line();

  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();
  console.log(
    "Цель: объединить historical opening stock, ранние продажи,"
  );
  console.log(
    "Movement и потерянные Batch в единую математическую реконструкцию."
  );

  line();

  // =====================================================================
  // 1. PRODUCT
  // =====================================================================

  console.log();
  console.log("1. PRODUCT");
  console.log();
  line();

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log();
  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);
  console.log(`cost=${product.cost} ₽`);
  console.log(`price=${product.price} ₽`);

  // =====================================================================
  // 2. FIRST CURRENT BATCH
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("2. FIRST CURRENT BATCH");
  console.log();
  line();

  const firstBatch = await prisma.batch.findUnique({
    where: {
      id: FIRST_BATCH_ID,
    },
  });

  if (!firstBatch) {
    throw new Error(`Batch #${FIRST_BATCH_ID} не найден`);
  }

  const boundaryDate = firstBatch.receivedAt;

  console.log();
  console.log(`Batch #${firstBatch.id}`);
  console.log(`received=${fmtDate(firstBatch.receivedAt)}`);
  console.log(`qty=${firstBatch.quantity}`);
  console.log(`cost=${firstBatch.purchaseCost} ₽`);
  console.log(`expiry=${fmtDate(firstBatch.expiryDate)}`);
  console.log(`status=${firstBatch.status}`);

  // =====================================================================
  // 3. EARLY ORDERS
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("3. EARLY ORDERS BEFORE FIRST CURRENT BATCH");
  console.log();
  line();

  const earlyOrderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
      order: {
        date: {
          lt: boundaryDate,
        },
      },
    },
    include: {
      order: true,
      batches: true,
      ReturnBatch: true,
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

  let earlyGross = 0;
  let earlyReturned = 0;
  let earlyNet = 0;
  let earlyLinkedBatchQty = 0;
  let earlyReturnBatchQty = 0;

  for (const item of earlyOrderItems) {
    const returned = item.ReturnBatch.reduce(
      (sum, returnBatch) => sum + returnBatch.quantity,
      0
    );

    const linkedBatchQty = item.batches.reduce(
      (sum, orderBatch) => sum + orderBatch.quantity,
      0
    );

    const net = item.quantity - returned;

    earlyGross += item.quantity;
    earlyReturned += returned;
    earlyNet += net;
    earlyLinkedBatchQty += linkedBatchQty;
    earlyReturnBatchQty += returned;

    console.log();
    console.log(
      `Order #${item.order.id} | ` +
        `date=${fmtDate(item.order.date)} | ` +
        `OrderItem #${item.id}`
    );

    console.log(
      `gross=${item.quantity} | ` +
        `returned=${returned} | ` +
        `net=${net}`
    );

    console.log(
      `OrderBatch=${linkedBatchQty} | ` +
        `ReturnBatch=${returned} | ` +
        `status=${item.order.status}`
    );
  }

  console.log();
  console.log(`EARLY GROSS = ${earlyGross} шт`);
  console.log(`EARLY RETURN = ${earlyReturned} шт`);
  console.log(`EARLY NET = ${earlyNet} шт`);
  console.log(`EARLY ORDERBATCH = ${earlyLinkedBatchQty} шт`);
  console.log(`EARLY RETURNBATCH = ${earlyReturnBatchQty} шт`);

  // =====================================================================
  // 4. EARLY MOVEMENTS
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("4. EARLY MOVEMENTS BEFORE FIRST CURRENT BATCH");
  console.log();
  line();

  const earlyMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      createdAt: {
        lt: boundaryDate,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let earlyMovementNet = 0;
  let earlySaleMovementQty = 0;
  let earlySupplyMovementQty = 0;
  let earlyReturnMovementQty = 0;
  let earlyWriteOffMovementQty = 0;

  for (const movement of earlyMovements) {
    earlyMovementNet += movement.quantity;

    if (movement.type === "SALE") {
      earlySaleMovementQty += Math.abs(movement.quantity);
    }

    if (movement.type === "SUPPLY") {
      earlySupplyMovementQty += movement.quantity;
    }

    if (movement.type === "RETURN") {
      earlyReturnMovementQty += movement.quantity;
    }

    if (movement.type === "WRITE_OFF") {
      earlyWriteOffMovementQty += Math.abs(movement.quantity);
    }

    console.log();
    console.log(
      `Movement #${movement.id} | ` +
        `${fmtDate(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `qty=${fmtSigned(movement.quantity)}`
    );

    console.log(`comment=${movement.comment ?? "-"}`);
  }

  console.log();
  console.log(`EARLY MOVEMENT NET = ${earlyMovementNet} шт`);
  console.log(`EARLY SALE MOVEMENT = ${earlySaleMovementQty} шт`);
  console.log(`EARLY SUPPLY MOVEMENT = ${earlySupplyMovementQty} шт`);
  console.log(`EARLY RETURN MOVEMENT = ${earlyReturnMovementQty} шт`);
  console.log(`EARLY WRITE_OFF MOVEMENT = ${earlyWriteOffMovementQty} шт`);

  // =====================================================================
  // 5. EARLY SUPPLIES
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("5. EARLY SUPPLIES BEFORE FIRST CURRENT BATCH");
  console.log();
  line();

  const earlySupplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
      supply: {
        date: {
          lt: boundaryDate,
        },
      },
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

  let earlySupplyQty = 0;

  for (const item of earlySupplyItems) {
    earlySupplyQty += item.quantity;

    console.log();
    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supply.id} | ` +
        `date=${fmtDate(item.supply.date)} | ` +
        `qty=${item.quantity} | ` +
        `cost=${item.cost} ₽`
    );
  }

  console.log();
  console.log(`EARLY SUPPLY TOTAL = ${earlySupplyQty} шт`);

  // =====================================================================
  // 6. MISSING EARLY SALE MOVEMENTS
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("6. EARLY SALES / MOVEMENT COVERAGE");
  console.log();
  line();

  const movementSaleOrders = new Set<number>();

  for (const movement of earlyMovements) {
    if (movement.type !== "SALE") {
      continue;
    }

    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (match) {
      movementSaleOrders.add(Number(match[1]));
    }
  }

  let coveredOrderSales = 0;
  let missingMovementSales = 0;
  let missingMovementOrderCount = 0;

  for (const item of earlyOrderItems) {
    const orderId = item.order.id;
    const net = item.quantity - item.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0
    );

    const hasSaleMovement = movementSaleOrders.has(orderId);

    if (hasSaleMovement) {
      coveredOrderSales += net;

      console.log(
        `🟢 Order #${orderId} | OrderItem #${item.id} | ` +
          `net=${net} | SALE Movement найден`
      );
    } else {
      missingMovementSales += net;
      missingMovementOrderCount += 1;

      console.log(
        `🔴 Order #${orderId} | OrderItem #${item.id} | ` +
          `net=${net} | SALE Movement НЕ НАЙДЕН`
      );
    }
  }

  console.log();
  console.log(`COVERED EARLY SALES = ${coveredOrderSales} шт`);
  console.log(`MISSING EARLY SALES = ${missingMovementSales} шт`);
  console.log(`ORDERS WITHOUT SALE MOVEMENT = ${missingMovementOrderCount}`);

  // =====================================================================
  // 7. HISTORICAL MISSING BATCH REFERENCES
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("7. HISTORICAL MISSING BATCH REFERENCES");
  console.log();
  line();

  const allMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const batchRefs = new Map<
    number,
    {
      movements: typeof allMovements;
      net: number;
      writeOff: number;
    }
  >();

  for (const movement of allMovements) {
    const match = movement.comment?.match(/Партия №(\d+)/);

    if (!match) {
      continue;
    }

    const batchId = Number(match[1]);

    if (!batchRefs.has(batchId)) {
      batchRefs.set(batchId, {
        movements: [],
        net: 0,
        writeOff: 0,
      });
    }

    const ref = batchRefs.get(batchId)!;

    ref.movements.push(movement);
    ref.net += movement.quantity;

    if (movement.type === "WRITE_OFF") {
      ref.writeOff += Math.abs(movement.quantity);
    }
  }

  let confirmedMissingHistoricalBatchQty = 0;

  for (const [batchId, ref] of batchRefs) {
    const batch = await prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    if (!batch) {
      const minimumQty = ref.writeOff;

      confirmedMissingHistoricalBatchQty += minimumQty;

      console.log();
      console.log(`🔴 MISSING Batch #${batchId}`);
      console.log(`confirmed WRITE_OFF=${ref.writeOff} шт`);
      console.log(`minimum historical quantity=${minimumQty} шт`);

      for (const movement of ref.movements) {
        console.log(
          `  Movement #${movement.id} | ` +
            `${movement.type} | ` +
            `qty=${fmtSigned(movement.quantity)} | ` +
            `${fmtDate(movement.createdAt)}`
        );
      }
    }
  }

  console.log();
  console.log(
    `CONFIRMED MISSING HISTORICAL BATCH QUANTITY = ` +
      `${confirmedMissingHistoricalBatchQty} шт`
  );

  // =====================================================================
  // 8. FULL OPENING STOCK MODEL
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("8. FULL OPENING STOCK MODEL");
  console.log();
  line();

  const allSupplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
  });

  const allOrderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      ReturnBatch: true,
    },
  });

  const allSupplyQty = allSupplyItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const allOrderGross = allOrderItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const allOrderReturned = allOrderItems.reduce(
    (sum, item) =>
      sum +
      item.ReturnBatch.reduce(
        (returnSum, rb) => returnSum + rb.quantity,
        0
      ),
    0
  );

  const allWriteOffQty = allMovements
    .filter((movement) => movement.type === "WRITE_OFF")
    .reduce(
      (sum, movement) => sum + Math.abs(movement.quantity),
      0
    );

  const openingRequired =
    product.stock -
    allSupplyQty +
    allOrderGross -
    allOrderReturned +
    allWriteOffQty;

  console.log();
  console.log(`Current stock = ${product.stock} шт`);
  console.log(`Registered supply = ${allSupplyQty} шт`);
  console.log(`Gross orders = ${allOrderGross} шт`);
  console.log(`Returns = ${allOrderReturned} шт`);
  console.log(`Write-offs = ${allWriteOffQty} шт`);

  console.log();
  console.log(
    `OPENING REQUIRED = ${product.stock} - ${allSupplyQty} + ` +
      `${allOrderGross} - ${allOrderReturned} + ${allWriteOffQty}`
  );

  console.log();
  console.log(`OPENING REQUIRED = ${openingRequired} шт`);

  // =====================================================================
  // 9. HISTORICAL RECONSTRUCTION
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("9. HISTORICAL RECONSTRUCTION");
  console.log();
  line();

  const unexplainedOpening =
    openingRequired - confirmedMissingHistoricalBatchQty;

  console.log();
  console.log(`Required historical opening = ${openingRequired} шт`);
  console.log(
    `Confirmed missing Batch quantity = ` +
      `${confirmedMissingHistoricalBatchQty} шт`
  );
  console.log(
    `Remaining unexplained opening = ${unexplainedOpening} шт`
  );

  console.log();
  console.log(
    `Early sales without SALE Movement = ${missingMovementSales} шт`
  );

  console.log();

  if (unexplainedOpening === missingMovementSales) {
    console.log("🟢 EXACT MATCH");
    console.log();
    console.log(
      "Необъяснённый historical opening stock математически"
    );
    console.log(
      "точно совпадает с количеством ранних продаж,"
    );
    console.log(
      "для которых отсутствуют SALE Movement."
    );
  } else {
    console.log("🟠 NO EXACT MATCH");
    console.log();
    console.log(
      "Необъяснённый opening stock и ранние продажи"
    );
    console.log(
      "без Movement пока не совпадают полностью."
    );
  }

  // =====================================================================
  // 10. PRE-BATCH UNIFIED TIMELINE
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("10. PRE-BATCH UNIFIED TIMELINE");
  console.log();
  line();

  const timeline: TimelineRow[] = [];

  for (const item of earlyOrderItems) {
    const returned = item.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0
    );

    const net = item.quantity - returned;

    timeline.push({
      date: item.order.date,
      type: "ORDER",
      source: `Order #${item.order.id} / OrderItem #${item.id}`,
      quantity: -net,
      details:
        `gross=${item.quantity}, returned=${returned}, ` +
        `net=${net}, status=${item.order.status}`,
    });
  }

  for (const item of earlySupplyItems) {
    timeline.push({
      date: item.supply.date,
      type: "SUPPLY",
      source: `Supply #${item.supply.id} / SupplyItem #${item.id}`,
      quantity: item.quantity,
      details: `cost=${item.cost} ₽`,
    });
  }

  for (const movement of earlyMovements) {
    timeline.push({
      date: movement.createdAt,
      type: "MOVEMENT",
      source: `Movement #${movement.id}`,
      quantity: movement.quantity,
      details:
        `${movement.type}: ${movement.comment ?? "-"}`,
    });
  }

  timeline.sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  let businessBalance = 0;
  let movementBalance = 0;

  console.log();
  console.log(
    "DATE | TYPE | SOURCE | QTY | BUSINESS BALANCE | MOVEMENT BALANCE"
  );

  for (const row of timeline) {
    if (row.type === "ORDER" || row.type === "SUPPLY") {
      businessBalance += row.quantity;
    }

    if (row.type === "MOVEMENT") {
      movementBalance += row.quantity;
    }

    console.log();
    console.log(
      `${fmtDate(row.date)} | ` +
        `${row.type.padEnd(8)} | ` +
        `${row.source} | ` +
        `qty=${fmtSigned(row.quantity)} | ` +
        `business=${businessBalance} | ` +
        `movement=${movementBalance}`
    );

    console.log(`  ${row.details}`);
  }

  // =====================================================================
  // 11. FINAL RESULT
  // =====================================================================

  console.log();
  line();
  console.log();
  console.log("11. FINAL RESULT");
  console.log();
  line();

  console.log();
  console.log(`Product.stock = ${product.stock} шт`);
  console.log(`Opening required = ${openingRequired} шт`);
  console.log(
    `Confirmed missing historical Batch = ` +
      `${confirmedMissingHistoricalBatchQty} шт`
  );
  console.log(
    `Unexplained historical opening = ${unexplainedOpening} шт`
  );
  console.log(
    `Early sales without SALE Movement = ${missingMovementSales} шт`
  );
  console.log();

  if (unexplainedOpening === missingMovementSales) {
    console.log("🟢 HISTORICAL MODEL MATCHES");
    console.log();
    console.log(
      `${unexplainedOpening} шт unexplained historical stock`
    );
    console.log(
      "совпадают с ранними продажами без SALE Movement."
    );
  } else {
    console.log("🟠 HISTORICAL MODEL REQUIRES MORE ANALYSIS");
  }

  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
  console.log("⚠️ Batch НЕ создавались.");
  console.log("⚠️ Movement НЕ создавались.");
  console.log("⚠️ OrderBatch НЕ изменялись.");
  console.log("⚠️ Product.stock НЕ изменялся.");
  console.log();

  console.log("🏁 AUDIT V8 ЗАВЕРШЁН");

  line();
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ AUDIT V8 FAILED");
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });