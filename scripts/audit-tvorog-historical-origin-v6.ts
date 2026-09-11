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

function parseOrderId(comment: string | null) {
  if (!comment) return null;

  const match = comment.match(/заказ(?:а)? №(\d+)/i);

  return match ? Number(match[1]) : null;
}

function parseBatchId(comment: string | null) {
  if (!comment) return null;

  const match = comment.match(/Партия №(\d+)/i);

  return match ? Number(match[1]) : null;
}

async function main() {
  console.log("\n🧀 ТВОРОГ — HISTORICAL ORIGIN AUDIT V6\n");

  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");

  console.log(
    "\nЦель: найти происхождение historical opening stock и " +
      "все следы потерянных Batch."
  );

  // ------------------------------------------------------------
  // 1. PRODUCT
  // ------------------------------------------------------------

  title("1. PRODUCT");

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
  console.log(`stock=${product.stock}`);
  console.log(`current cost=${product.cost} ₽`);
  console.log(`price=${product.price} ₽`);

  // ------------------------------------------------------------
  // 2. ALL BATCHES
  // ------------------------------------------------------------

  title("2. ALL CURRENT BATCHES");

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      id: "asc",
    },
  });

  for (const batch of batches) {
    console.log(
      `Batch #${batch.id}` +
        ` | qty=${batch.quantity}` +
        ` | cost=${batch.purchaseCost} ₽` +
        ` | received=${formatDate(batch.receivedAt)}` +
        ` | expiry=${formatDate(batch.expiryDate)}` +
        ` | status=${batch.status}`
    );
  }

  const firstCurrentBatchDate =
    batches.length > 0
      ? [...batches].sort(
          (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
        )[0].receivedAt
      : null;

  console.log(
    `\nFirst current Batch date = ${formatDate(firstCurrentBatchDate)}`
  );

  // ------------------------------------------------------------
  // 3. ALL MOVEMENTS — FULL HISTORY
  // ------------------------------------------------------------

  title("3. FULL MOVEMENT HISTORY");

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Total movements = ${movements.length}`);

  for (const movement of movements) {
    const orderId = parseOrderId(movement.comment);
    const batchId = parseBatchId(movement.comment);

    console.log(
      `Movement #${movement.id}` +
        ` | ${formatDate(movement.createdAt)}` +
        ` | ${movement.type}` +
        ` | qty=${movement.quantity}` +
        ` | order=${orderId ?? "-"}` +
        ` | batch=${batchId ?? "-"}` +
        ` | ${movement.comment ?? ""}`
    );
  }

  // ------------------------------------------------------------
  // 4. MOVEMENTS BEFORE FIRST CURRENT BATCH
  // ------------------------------------------------------------

  title("4. MOVEMENTS BEFORE FIRST CURRENT BATCH");

  if (!firstCurrentBatchDate) {
    console.log("⚠️ Current Batch отсутствуют");
  } else {
    const oldMovements = movements.filter(
      (movement) =>
        movement.createdAt.getTime() < firstCurrentBatchDate.getTime()
    );

    if (oldMovements.length === 0) {
      console.log("🔴 Movement до первой текущей Batch не найдено");
    }

    let net = 0;

    for (const movement of oldMovements) {
      net += movement.quantity;

      console.log(
        `Movement #${movement.id}` +
          ` | ${formatDate(movement.createdAt)}` +
          ` | ${movement.type}` +
          ` | qty=${movement.quantity}` +
          ` | ${movement.comment ?? ""}`
      );
    }

    console.log(`\nPRE-CURRENT-BATCH NET = ${net} шт`);
  }

  // ------------------------------------------------------------
  // 5. ORDERS BEFORE FIRST CURRENT BATCH
  // ------------------------------------------------------------

  title("5. ORDERS BEFORE FIRST CURRENT BATCH");

  if (!firstCurrentBatchDate) {
    console.log("⚠️ Невозможно определить границу");
  } else {
    const earlyItems = await prisma.orderItem.findMany({
      where: {
        productId: PRODUCT_ID,
        order: {
          date: {
            lt: firstCurrentBatchDate,
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

    let gross = 0;
    let returned = 0;

    for (const item of earlyItems) {
      gross += item.quantity;
      returned += item.returned;

      const linkedBatch = item.batches.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      console.log(
        `Order #${item.order.id}` +
          ` | date=${formatDate(item.order.date)}` +
          ` | OrderItem #${item.id}` +
          ` | gross=${item.quantity}` +
          ` | returned=${item.returned}` +
          ` | net=${item.quantity - item.returned}` +
          ` | OrderBatch=${linkedBatch}`
      );
    }

    console.log(`\nEARLY GROSS = ${gross}`);
    console.log(`EARLY RETURN = ${returned}`);
    console.log(`EARLY NET = ${gross - returned}`);
  }

  // ------------------------------------------------------------
  // 6. SUPPLIES
  // ------------------------------------------------------------

  title("6. SUPPLY HISTORY");

  const supplies = await prisma.supplyItem.findMany({
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

  for (const item of supplies) {
    supplyTotal += item.quantity;

    console.log(
      `SupplyItem #${item.id}` +
        ` | Supply #${item.supply.id}` +
        ` | date=${formatDate(item.supply.date)}` +
        ` | qty=${item.quantity}` +
        ` | cost=${item.cost} ₽`
    );
  }

  console.log(`\nSUPPLY TOTAL = ${supplyTotal} шт`);

  // ------------------------------------------------------------
  // 7. BATCH REFERENCE ANALYSIS
  // ------------------------------------------------------------

  title("7. ALL BATCH REFERENCES IN MOVEMENTS");

  const batchReferences = new Map<
    number,
    {
      movements: typeof movements;
      total: number;
    }
  >();

  for (const movement of movements) {
    const batchId = parseBatchId(movement.comment);

    if (!batchId) continue;

    if (!batchReferences.has(batchId)) {
      batchReferences.set(batchId, {
        movements: [],
        total: 0,
      });
    }

    const entry = batchReferences.get(batchId)!;

    entry.movements.push(movement);
    entry.total += movement.quantity;
  }

  const currentBatchIds = new Set(batches.map((batch) => batch.id));

  for (const [batchId, data] of batchReferences) {
    const exists = currentBatchIds.has(batchId);

    console.log(
      `${exists ? "🟢" : "🔴"} Batch #${batchId}` +
        ` | exists=${exists}` +
        ` | referenced movements=${data.movements.length}` +
        ` | movement net=${data.total}`
    );

    for (const movement of data.movements) {
      console.log(
        `  Movement #${movement.id}` +
          ` | ${movement.type}` +
          ` | qty=${movement.quantity}` +
          ` | ${formatDate(movement.createdAt)}`
      );
    }
  }

  // ------------------------------------------------------------
  // 8. HISTORICAL BATCH CANDIDATES
  // ------------------------------------------------------------

  title("8. HISTORICAL BATCH CANDIDATES");

  const missingBatchIds = [...batchReferences.keys()].filter(
    (id) => !currentBatchIds.has(id)
  );

  if (missingBatchIds.length === 0) {
    console.log("🟢 Missing Batch references не найдено");
  }

  for (const batchId of missingBatchIds) {
    const data = batchReferences.get(batchId)!;

    const writeOff = data.movements
      .filter((movement) => movement.type === "WRITE_OFF")
      .reduce(
        (sum, movement) => sum + Math.abs(movement.quantity),
        0
      );

    const sale = data.movements
      .filter((movement) => movement.type === "SALE")
      .reduce(
        (sum, movement) => sum + Math.abs(movement.quantity),
        0
      );

    const returns = data.movements
      .filter((movement) => movement.type === "RETURN")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    console.log(`\n🔴 MISSING BATCH #${batchId}`);
    console.log(`WRITE_OFF = ${writeOff}`);
    console.log(`SALE = ${sale}`);
    console.log(`RETURN = ${returns}`);

    console.log(
      `MINIMUM HISTORICAL QUANTITY = ${writeOff + sale - returns}`
    );
  }

  // ------------------------------------------------------------
  // 9. OPENING STOCK CALCULATION
  // ------------------------------------------------------------

  title("9. OPENING STOCK CALCULATION");

  const allOrderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
  });

  const grossOrders = allOrderItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const returnedOrders = allOrderItems.reduce(
    (sum, item) => sum + item.returned,
    0
  );

  const writeOffTotal = movements
    .filter((movement) => movement.type === "WRITE_OFF")
    .reduce(
      (sum, movement) => sum + Math.abs(movement.quantity),
      0
    );

  const opening =
    product.stock -
    supplyTotal +
    grossOrders -
    returnedOrders +
    writeOffTotal;

  console.log(`Current stock = ${product.stock}`);
  console.log(`Supply = ${supplyTotal}`);
  console.log(`Gross orders = ${grossOrders}`);
  console.log(`Returns = ${returnedOrders}`);
  console.log(`Write-offs = ${writeOffTotal}`);

  console.log(
    `\nOPENING REQUIRED = ${product.stock} - ${supplyTotal} + ${grossOrders} - ${returnedOrders} + ${writeOffTotal}`
  );

  console.log(`OPENING REQUIRED = ${opening} шт`);

  // ------------------------------------------------------------
  // 10. KNOWN VS UNKNOWN OPENING
  // ------------------------------------------------------------

  title("10. KNOWN VS UNKNOWN HISTORICAL STOCK");

  let confirmedMissingBatchQuantity = 0;

  for (const batchId of missingBatchIds) {
    const data = batchReferences.get(batchId)!;

    const writeOff = data.movements
      .filter((movement) => movement.type === "WRITE_OFF")
      .reduce(
        (sum, movement) => sum + Math.abs(movement.quantity),
        0
      );

    const sale = data.movements
      .filter((movement) => movement.type === "SALE")
      .reduce(
        (sum, movement) => sum + Math.abs(movement.quantity),
        0
      );

    const returns = data.movements
      .filter((movement) => movement.type === "RETURN")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const minimum = writeOff + sale - returns;

    confirmedMissingBatchQuantity += minimum;

    console.log(
      `Batch #${batchId}: minimum confirmed quantity = ${minimum}`
    );
  }

  const unknownOpening =
    opening - confirmedMissingBatchQuantity;

  console.log(
    `\nConfirmed missing Batch quantity = ${confirmedMissingBatchQuantity}`
  );

  console.log(`Total opening required = ${opening}`);

  console.log(`UNKNOWN HISTORICAL STOCK = ${unknownOpening}`);

  // ------------------------------------------------------------
  // 11. FINAL RESULT
  // ------------------------------------------------------------

  title("11. FINAL RESULT");

  console.log(`Current Product.stock = ${product.stock}`);
  console.log(`Current Batch total = ${batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  )}`);

  console.log(`Required opening = ${opening}`);

  console.log(
    `Confirmed missing historical Batch stock = ${confirmedMissingBatchQuantity}`
  );

  console.log(
    `Still unexplained historical stock = ${unknownOpening}`
  );

  console.log("\n⚠️ ВАЖНО");

  console.log("Этот скрипт ничего не изменяет.");
  console.log("Batch НЕ создаются.");
  console.log("Movement НЕ создаются.");
  console.log("OrderBatch НЕ создаются.");
  console.log("Product.stock НЕ изменяется.");

  console.log("\n🏁 AUDIT V6 ЗАВЕРШЁН\n");
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