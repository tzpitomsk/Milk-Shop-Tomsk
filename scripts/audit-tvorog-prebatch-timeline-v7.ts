import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_NAME = "Творог";

type TimelineEvent = {
  date: Date;
  type:
    | "ORDER"
    | "SUPPLY"
    | "MOVEMENT"
    | "BATCH"
    | "HISTORICAL_BATCH_REFERENCE";
  source: string;
  quantity: number;
  comment: string;
  linkedBatch?: number;
  orderId?: number;
};

function line() {
  console.log("=".repeat(70));
}

function formatDate(date: Date) {
  return date.toISOString();
}

function formatQty(quantity: number) {
  return quantity >= 0 ? `+${quantity}` : `${quantity}`;
}

async function main() {
  console.log("");
  line();
  console.log("");
  console.log("🧀 ТВОРОГ — PRE-BATCH TIMELINE AUDIT V7");
  console.log("");
  line();
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");
  console.log(
    "Цель: построить точную временную линию Творога до первой текущей партии."
  );
  console.log("");

  line();
  console.log("");
  console.log("1. PRODUCT");
  console.log("");
  line();
  console.log("");

  const product = await prisma.product.findFirst({
    where: {
      name: PRODUCT_NAME,
    },
  });

  if (!product) {
    throw new Error(`Товар "${PRODUCT_NAME}" не найден`);
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);
  console.log(`cost=${product.cost} ₽`);
  console.log(`price=${product.price} ₽`);

  const batches = await prisma.batch.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      receivedAt: "asc",
    },
  });

  const firstCurrentBatch = batches[0];

  if (!firstCurrentBatch) {
    console.log("");
    console.log("❌ У товара нет Batch.");
    return;
  }

  line();
  console.log("");
  console.log("2. FIRST CURRENT BATCH");
  console.log("");
  line();
  console.log("");

  console.log(`Batch #${firstCurrentBatch.id}`);
  console.log(`received=${formatDate(firstCurrentBatch.receivedAt)}`);
  console.log(`qty=${firstCurrentBatch.quantity}`);
  console.log(`cost=${firstCurrentBatch.purchaseCost} ₽`);
  console.log(`expiry=${formatDate(firstCurrentBatch.expiryDate)}`);
  console.log(`status=${firstCurrentBatch.status}`);

  const cutoffDate = firstCurrentBatch.receivedAt;

  line();
  console.log("");
  console.log("3. PRE-BATCH SUPPLIES");
  console.log("");
  line();
  console.log("");

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: product.id,
      supply: {
        date: {
          lt: cutoffDate,
        },
      },
    },
    include: {
      supply: true,
    },
    orderBy: {
      supplyId: "asc",
    },
  });

  if (supplyItems.length === 0) {
    console.log("Нет SupplyItem до первой текущей Batch.");
  }

  let preBatchSupplyTotal = 0;

  for (const item of supplyItems) {
    preBatchSupplyTotal += item.quantity;

    console.log(
      `SupplyItem #${item.id} | Supply #${item.supplyId} | ` +
        `date=${formatDate(item.supply.date)} | ` +
        `qty=${item.quantity} | cost=${item.cost} ₽`
    );
  }

  console.log("");
  console.log(`PRE-BATCH SUPPLY TOTAL = ${preBatchSupplyTotal} шт`);

  line();
  console.log("");
  console.log("4. PRE-BATCH ORDERS");
  console.log("");
  line();
  console.log("");

  const earlyOrders = await prisma.order.findMany({
    where: {
      date: {
        lt: cutoffDate,
      },
      items: {
        some: {
          productId: product.id,
        },
      },
    },
    include: {
      items: {
        where: {
          productId: product.id,
        },
        include: {
          batches: true,
          ReturnBatch: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  let earlyGross = 0;
  let earlyReturned = 0;
  let earlyNet = 0;

  for (const order of earlyOrders) {
    for (const item of order.items) {
      const gross = item.quantity;
      const returned = item.returned;
      const net = gross - returned;

      earlyGross += gross;
      earlyReturned += returned;
      earlyNet += net;

      const linkedBatchTotal = item.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      const returnBatchTotal = item.ReturnBatch.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      console.log(
        `Order #${order.id} | ` +
          `date=${formatDate(order.date)} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${gross} | returned=${returned} | net=${net} | ` +
          `OrderBatch=${linkedBatchTotal} | ` +
          `ReturnBatch=${returnBatchTotal} | ` +
          `status=${order.status}`
      );
    }
  }

  console.log("");
  console.log(`EARLY GROSS = ${earlyGross} шт`);
  console.log(`EARLY RETURN = ${earlyReturned} шт`);
  console.log(`EARLY NET = ${earlyNet} шт`);

  line();
  console.log("");
  console.log("5. PRE-BATCH MOVEMENTS");
  console.log("");
  line();
  console.log("");

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
      createdAt: {
        lt: cutoffDate,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (movements.length === 0) {
    console.log("Нет Movement до первой текущей Batch.");
  }

  let preBatchMovementNet = 0;

  for (const movement of movements) {
    preBatchMovementNet += movement.quantity;

    console.log(
      `Movement #${movement.id} | ` +
        `${formatDate(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `qty=${formatQty(movement.quantity)} | ` +
        `${movement.comment ?? "-"}`
    );
  }

  console.log("");
  console.log(`PRE-BATCH MOVEMENT NET = ${preBatchMovementNet} шт`);

  line();
  console.log("");
  console.log("6. HISTORICAL BATCH REFERENCES");
  console.log("");
  line();
  console.log("");

  const allMovements = await prisma.movement.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const batchReferenceRegex = /Партия №(\d+)/i;

  const referencedBatchIds = new Map<number, typeof allMovements>();

  for (const movement of allMovements) {
    const match = movement.comment?.match(batchReferenceRegex);

    if (!match) {
      continue;
    }

    const batchId = Number(match[1]);

    if (!referencedBatchIds.has(batchId)) {
      referencedBatchIds.set(batchId, []);
    }

    referencedBatchIds.get(batchId)!.push(movement);
  }

  if (referencedBatchIds.size === 0) {
    console.log("Исторических ссылок на Batch в Movement не найдено.");
  }

  for (const [batchId, batchMovements] of referencedBatchIds) {
    const existingBatch = await prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    const movementNet = batchMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    console.log(
      `${existingBatch ? "🟢" : "🔴"} Batch #${batchId} | ` +
        `exists=${existingBatch ? "true" : "false"} | ` +
        `movement net=${movementNet}`
    );

    for (const movement of batchMovements) {
      console.log(
        `  Movement #${movement.id} | ` +
          `${formatDate(movement.createdAt)} | ` +
          `${movement.type} | qty=${formatQty(movement.quantity)} | ` +
          `${movement.comment ?? "-"}`
      );
    }

    console.log("");
  }

  line();
  console.log("");
  console.log("7. UNIFIED PRE-BATCH TIMELINE");
  console.log("");
  line();
  console.log("");

  const timeline: TimelineEvent[] = [];

  for (const supplyItem of supplyItems) {
    timeline.push({
      date: supplyItem.supply.date,
      type: "SUPPLY",
      source: `Supply #${supplyItem.supplyId} / SupplyItem #${supplyItem.id}`,
      quantity: supplyItem.quantity,
      comment: `Приход ${supplyItem.quantity} шт, cost=${supplyItem.cost} ₽`,
    });
  }

  for (const order of earlyOrders) {
    for (const item of order.items) {
      const net = item.quantity - item.returned;

      timeline.push({
        date: order.date,
        type: "ORDER",
        source: `Order #${order.id} / OrderItem #${item.id}`,
        quantity: -net,
        comment:
          `Продажа gross=${item.quantity}, returned=${item.returned}, ` +
          `net=${net}, status=${order.status}`,
        orderId: order.id,
      });
    }
  }

  for (const movement of movements) {
    timeline.push({
      date: movement.createdAt,
      type: "MOVEMENT",
      source: `Movement #${movement.id}`,
      quantity: movement.quantity,
      comment: `${movement.type}: ${movement.comment ?? "-"}`,
    });
  }

  timeline.push({
    date: firstCurrentBatch.receivedAt,
    type: "BATCH",
    source: `Batch #${firstCurrentBatch.id}`,
    quantity: 0,
    comment:
      "Первая текущая Batch. Это граница исторического pre-batch периода.",
    linkedBatch: firstCurrentBatch.id,
  });

  timeline.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();

    if (dateDiff !== 0) {
      return dateDiff;
    }

    return a.source.localeCompare(b.source);
  });

  let runningMovementBalance = 0;
  let runningBusinessBalance = 0;

  console.log(
    "DATE | TYPE | SOURCE | QTY | MOVEMENT BALANCE | BUSINESS BALANCE"
  );
  console.log("");

  for (const event of timeline) {
    if (event.type === "SUPPLY") {
      runningBusinessBalance += event.quantity;
    }

    if (event.type === "ORDER") {
      runningBusinessBalance += event.quantity;
    }

    if (event.type === "MOVEMENT") {
      runningMovementBalance += event.quantity;
    }

    if (event.type === "BATCH") {
      console.log("");
      console.log("🔵 ------------------------------------------------------------");
      console.log(`🔵 FIRST CURRENT BATCH BOUNDARY: ${event.source}`);
      console.log("🔵 ------------------------------------------------------------");
      console.log("");
    }

    console.log(
      `${formatDate(event.date)} | ` +
        `${event.type.padEnd(9)} | ` +
        `${event.source} | ` +
        `qty=${formatQty(event.quantity)} | ` +
        `movement=${runningMovementBalance} | ` +
        `business=${runningBusinessBalance}`
    );

    console.log(`  ${event.comment}`);
  }

  line();
  console.log("");
  console.log("8. PRE-BATCH BALANCE COMPARISON");
  console.log("");
  line();
  console.log("");

  console.log(`Pre-batch Supply = ${preBatchSupplyTotal} шт`);
  console.log(`Pre-batch Order Net = ${earlyNet} шт`);
  console.log(`Pre-batch Movement Net = ${preBatchMovementNet} шт`);
  console.log("");

  const businessDelta = preBatchSupplyTotal - earlyNet;
  const movementDelta = preBatchMovementNet;

  console.log(`BUSINESS DELTA = ${businessDelta} шт`);
  console.log(`MOVEMENT DELTA = ${movementDelta} шт`);

  const requiredOpeningByBusiness = earlyNet - preBatchSupplyTotal;
  const requiredOpeningByMovement = -preBatchMovementNet;

  console.log("");
  console.log(
    `OPENING REQUIRED BY BUSINESS BEFORE FIRST BATCH = ${requiredOpeningByBusiness} шт`
  );
  console.log(
    `OPENING REQUIRED BY MOVEMENT BEFORE FIRST BATCH = ${requiredOpeningByMovement} шт`
  );

  line();
  console.log("");
  console.log("9. GAP LOCALIZATION");
  console.log("");
  line();
  console.log("");

  console.log(
    `Early net orders: ${earlyNet} шт were sold before Batch #${firstCurrentBatch.id}.`
  );
  console.log(
    `Registered supplies before Batch #${firstCurrentBatch.id}: ${preBatchSupplyTotal} шт.`
  );
  console.log(
    `Movement net before Batch #${firstCurrentBatch.id}: ${preBatchMovementNet} шт.`
  );
  console.log("");

  const businessVsMovementGap =
    requiredOpeningByBusiness - requiredOpeningByMovement;

  console.log(
    `GAP BETWEEN BUSINESS AND MOVEMENT OPENING MODELS = ${businessVsMovementGap} шт`
  );

  if (businessVsMovementGap === 0) {
    console.log("");
    console.log(
      "🟢 Pre-batch business history and Movement history mathematically agree."
    );
  } else {
    console.log("");
    console.log(
      "🔴 Pre-batch period contains missing or inconsistent historical records."
    );
  }

  line();
  console.log("");
  console.log("10. FINAL RESULT");
  console.log("");
  line();
  console.log("");

  console.log(`Product.stock = ${product.stock} шт`);
  console.log(`First current Batch = #${firstCurrentBatch.id}`);
  console.log(`First current Batch date = ${formatDate(cutoffDate)}`);
  console.log(`Pre-batch supply = ${preBatchSupplyTotal} шт`);
  console.log(`Pre-batch gross sales = ${earlyGross} шт`);
  console.log(`Pre-batch returns = ${earlyReturned} шт`);
  console.log(`Pre-batch net sales = ${earlyNet} шт`);
  console.log(`Pre-batch movement net = ${preBatchMovementNet} шт`);
  console.log(
    `Business-model opening required = ${requiredOpeningByBusiness} шт`
  );
  console.log(
    `Movement-model opening required = ${requiredOpeningByMovement} шт`
  );
  console.log(`Model gap = ${businessVsMovementGap} шт`);

  console.log("");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
  console.log("⚠️ Batch НЕ создавались.");
  console.log("⚠️ Movement НЕ создавались.");
  console.log("⚠️ OrderBatch НЕ изменялись.");
  console.log("⚠️ Product.stock НЕ изменялся.");
  console.log("");
  console.log("🏁 AUDIT V7 ЗАВЕРШЁН");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ AUDIT ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });