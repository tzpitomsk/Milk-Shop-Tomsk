import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

function line() {
  console.log("\n" + "=".repeat(70));
}

function title(text: string) {
  line();
  console.log(text);
  line();
}

function formatDate(date: Date | null | undefined) {
  return date ? date.toISOString() : "N/A";
}

async function main() {
  console.log("\n🧀 ТВОРОГ — OPENING BATCH RECONSTRUCTION AUDIT V5\n");

  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log(
    "\nЦель: определить структуру исторического opening stock " +
      "и найти потерянные Batch до текущих партий."
  );

  title("1. PRODUCT");

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);

  title("2. CURRENT BATCHES");

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      receivedAt: "asc",
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
  });

  if (batches.length === 0) {
    console.log("⚠️ Current Batch не найдено");
  }

  for (const batch of batches) {
    console.log(
      `\nBatch #${batch.id}` +
        ` | qty=${batch.quantity}` +
        ` | cost=${batch.purchaseCost} ₽` +
        ` | status=${batch.status}`
    );

    console.log(`received=${formatDate(batch.receivedAt)}`);
    console.log(`expiry=${formatDate(batch.expiryDate)}`);

    const sold = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    console.log(`OrderBatch sold=${sold}`);
    console.log(`ReturnBatch returned=${returned}`);

    console.log(`\nOrder history:`);

    if (batch.orderBatches.length === 0) {
      console.log("  OrderBatch: НЕТ");
    }

    for (const link of batch.orderBatches) {
      console.log(
        `  SALE | Order #${link.orderItem.order.id}` +
          ` | OrderItem #${link.orderItem.id}` +
          ` | date=${formatDate(link.orderItem.order.date)}` +
          ` | qty=${link.quantity}`
      );
    }

    if (batch.ReturnBatch.length === 0) {
      console.log("  ReturnBatch: НЕТ");
    }

    for (const link of batch.ReturnBatch) {
      console.log(
        `  RETURN | Order #${link.OrderItem.order.id}` +
          ` | OrderItem #${link.OrderItem.id}` +
          ` | date=${formatDate(link.createdAt)}` +
          ` | qty=${link.quantity}`
      );
    }
  }

  title("3. HISTORICAL MOVEMENTS WITH BATCH REFERENCES");

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      comment: {
        contains: "Партия",
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const referencedBatchIds = new Set<number>();

  for (const movement of movements) {
    console.log(
      `Movement #${movement.id}` +
        ` | ${formatDate(movement.createdAt)}` +
        ` | type=${movement.type}` +
        ` | qty=${movement.quantity}` +
        ` | ${movement.comment ?? ""}`
    );

    const match = movement.comment?.match(/Партия №(\d+)/);

    if (match) {
      referencedBatchIds.add(Number(match[1]));
    }
  }

  title("4. REFERENCED BATCHES CHECK");

  if (referencedBatchIds.size === 0) {
    console.log("Batch references в Movement не найдены");
  }

  const currentBatchIds = new Set(batches.map((batch) => batch.id));

  const missingBatchIds = [...referencedBatchIds].filter(
    (id) => !currentBatchIds.has(id)
  );

  for (const batchId of referencedBatchIds) {
    if (currentBatchIds.has(batchId)) {
      console.log(`🟢 Batch #${batchId} существует`);
    } else {
      console.log(`🔴 Batch #${batchId} отсутствует`);
    }
  }

  title("5. MISSING HISTORICAL BATCHES");

  if (missingBatchIds.length === 0) {
    console.log("🟢 Потерянных Batch по Movement reference не найдено");
  }

  for (const batchId of missingBatchIds) {
    const relatedMovements = movements.filter((movement) =>
      movement.comment?.includes(`Партия №${batchId}`)
    );

    const writeOffTotal = relatedMovements
      .filter((movement) => movement.type === "WRITE_OFF")
      .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);

    console.log(`\n🔴 HISTORICAL BATCH #${batchId}`);
    console.log(`Referenced movements: ${relatedMovements.length}`);
    console.log(`Confirmed WRITE_OFF: ${writeOffTotal} шт`);

    for (const movement of relatedMovements) {
      console.log(
        `  Movement #${movement.id}` +
          ` | ${formatDate(movement.createdAt)}` +
          ` | ${movement.type}` +
          ` | qty=${movement.quantity}` +
          ` | ${movement.comment ?? ""}`
      );
    }
  }

  title("6. ALL SUPPLIES");

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
    orderBy: {
      supply: {
        date: "asc",
      },
    },
  });

  let supplyTotal = 0;

  for (const item of supplyItems) {
    supplyTotal += item.quantity;

    console.log(
      `SupplyItem #${item.id}` +
        ` | Supply #${item.supply.id}` +
        ` | date=${formatDate(item.supply.date)}` +
        ` | qty=${item.quantity}` +
        ` | cost=${item.cost} ₽`
    );
  }

  console.log(`\nREGISTERED SUPPLY TOTAL = ${supplyTotal} шт`);

  title("7. CURRENT ORDERS BEFORE FIRST CURRENT BATCH");

  const firstCurrentBatch = batches[0];

  if (!firstCurrentBatch) {
    console.log("⚠️ Невозможно определить первую текущую Batch");
  } else {
    console.log(
      `First current Batch #${firstCurrentBatch.id}` +
        ` | received=${formatDate(firstCurrentBatch.receivedAt)}`
    );

    const earlyItems = await prisma.orderItem.findMany({
      where: {
        productId: PRODUCT_ID,
        order: {
          date: {
            lt: firstCurrentBatch.receivedAt,
          },
        },
      },
      include: {
        order: true,
        batches: true,
        ReturnBatch: true,
      },
      orderBy: {
        order: {
          date: "asc",
        },
      },
    });

    let earlyGross = 0;
    let earlyReturned = 0;
    let earlyOrderBatch = 0;

    for (const item of earlyItems) {
      const linked = item.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      const returned = item.ReturnBatch.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      earlyGross += item.quantity;
      earlyReturned += item.returned;
      earlyOrderBatch += linked;

      console.log(
        `Order #${item.order.id}` +
          ` | date=${formatDate(item.order.date)}` +
          ` | OrderItem #${item.id}` +
          ` | gross=${item.quantity}` +
          ` | returned=${item.returned}` +
          ` | linkedBatch=${linked}` +
          ` | ReturnBatch=${returned}`
      );
    }

    console.log(`\nEARLY GROSS = ${earlyGross}`);
    console.log(`EARLY RETURNED = ${earlyReturned}`);
    console.log(`EARLY NET = ${earlyGross - earlyReturned}`);
    console.log(`EARLY ORDERBATCH COVERAGE = ${earlyOrderBatch}`);
  }

  title("8. OPENING STOCK MODEL");

  const orders = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
  });

  const grossOrders = orders.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const returnedOrders = orders.reduce(
    (sum, item) => sum + item.returned,
    0
  );

  const writeOffMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      type: "WRITE_OFF",
    },
  });

  const writeOffTotal = writeOffMovements.reduce(
    (sum, movement) => sum + Math.abs(movement.quantity),
    0
  );

  const openingRequired =
    product.stock -
    supplyTotal +
    grossOrders -
    returnedOrders +
    writeOffTotal;

  console.log(`Current stock = ${product.stock}`);
  console.log(`Registered supply = ${supplyTotal}`);
  console.log(`Gross orders = ${grossOrders}`);
  console.log(`Returned orders = ${returnedOrders}`);
  console.log(`Write-offs = ${writeOffTotal}`);

  console.log(
    `\nOPENING = ${product.stock} - ${supplyTotal} + ${grossOrders} - ${returnedOrders} + ${writeOffTotal}`
  );

  console.log(`OPENING REQUIRED = ${openingRequired} шт`);

  title("9. HISTORICAL BATCH #4 TEST");

  const batch4Movements = movements.filter((movement) =>
    movement.comment?.includes("Партия №4")
  );

  const batch4WriteOff = batch4Movements
    .filter((movement) => movement.type === "WRITE_OFF")
    .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);

  console.log(`Historical Batch #4 confirmed write-off = ${batch4WriteOff} шт`);

  console.log(`Total opening required = ${openingRequired} шт`);

  const unexplainedOpening = openingRequired - batch4WriteOff;

  console.log(`Opening not explained by Batch #4 = ${unexplainedOpening} шт`);

  if (unexplainedOpening === 0) {
    console.log(
      "\n🟢 Batch #4 alone theoretically explains the full opening stock."
    );
  } else if (unexplainedOpening > 0) {
    console.log(
      `\n🟠 Помимо Batch #4 математически остаётся ещё ${unexplainedOpening} шт исторического товара.`
    );
  } else {
    console.log(
      "\n🔴 Write-off Batch #4 больше необходимого opening stock — требуется отдельная проверка."
    );
  }

  title("10. FINAL DECISION");

  console.log(`Current Product.stock = ${product.stock} шт`);

  console.log(
    `Current Batch quantity = ${batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    )} шт`
  );

  console.log(`Required historical opening = ${openingRequired} шт`);

  console.log(`Missing referenced Batch IDs = ${missingBatchIds.join(", ") || "нет"}`);

  console.log(
    "\n⚠️ Аудит завершён."
  );

  console.log(
    "⚠️ Batch НЕ создавались."
  );

  console.log(
    "⚠️ OrderBatch НЕ изменялись."
  );

  console.log(
    "⚠️ Movement НЕ изменялись."
  );

  console.log(
    "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ."
  );

  console.log("\n🏁 AUDIT V5 ЗАВЕРШЁН\n");
}

main()
  .catch((error) => {
    console.error("\n❌ ERROR");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });