import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function printTitle(title: string) {
  line();
  console.log(title);
  line();
}

async function main() {
  console.log();
  printTitle("🧀 ТВОРОГ — BATCH LEDGER AUDIT V3");
  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();
  console.log(
    "Цель: восстановить математический ledger Творога по каждому Batch."
  );
  console.log();

  // ============================================================
  // 1. PRODUCT
  // ============================================================

  printTitle("1. PRODUCT");

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);

  // ============================================================
  // 2. BATCHES
  // ============================================================

  printTitle("2. BATCHES");

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      id: "asc",
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
        orderBy: {
          id: "asc",
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  for (const batch of batches) {
    console.log();
    console.log(
      `Batch #${batch.id} | qty=${batch.quantity} | cost=${batch.purchaseCost} ₽`
    );
    console.log(
      `  received=${batch.receivedAt.toISOString()}`
    );
    console.log(
      `  expiry=${batch.expiryDate.toISOString()}`
    );
    console.log(`  status=${batch.status}`);

    const soldGross = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    console.log(`  OrderBatch gross=${soldGross}`);
    console.log(`  ReturnBatch=${returned}`);
    console.log(
      `  theoretical remaining=${batch.quantity + soldGross - returned}`
    );

    if (batch.orderBatches.length === 0) {
      console.log("  OrderBatch: НЕТ");
    } else {
      for (const link of batch.orderBatches) {
        const order = link.orderItem.order;

        console.log(
          `  SALE Order #${order.id} | ` +
            `OrderItem #${link.orderItemId} | ` +
            `date=${order.date.toISOString()} | ` +
            `qty=${link.quantity} | ` +
            `returned=${link.orderItem.returned}`
        );
      }
    }

    if (batch.ReturnBatch.length === 0) {
      console.log("  ReturnBatch: НЕТ");
    } else {
      for (const ret of batch.ReturnBatch) {
        const order = ret.OrderItem.order;

        console.log(
          `  RETURN Order #${order.id} | ` +
            `OrderItem #${ret.orderItemId} | ` +
            `date=${ret.createdAt.toISOString()} | ` +
            `qty=${ret.quantity}`
        );
      }
    }
  }

  // ============================================================
  // 3. SUPPLIES
  // ============================================================

  printTitle("3. SUPPLIES");

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

  let registeredSupply = 0;

  for (const item of supplyItems) {
    registeredSupply += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `date=${item.supply.date.toISOString()} | ` +
        `qty=${item.quantity} | ` +
        `cost=${item.cost} ₽`
    );
  }

  console.log();
  console.log(`REGISTERED SUPPLY TOTAL = ${registeredSupply} шт`);

  // ============================================================
  // 4. MOVEMENTS
  // ============================================================

  printTitle("4. MOVEMENTS");

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

  let supplyMovement = 0;
  let saleMovement = 0;
  let returnMovement = 0;
  let writeOffMovement = 0;
  let otherMovement = 0;

  for (const movement of movements) {
    if (movement.type === "SUPPLY") {
      supplyMovement += movement.quantity;
    } else if (movement.type === "SALE") {
      saleMovement += movement.quantity;
    } else if (movement.type === "RETURN") {
      returnMovement += movement.quantity;
    } else if (movement.type === "WRITE_OFF") {
      writeOffMovement += movement.quantity;
    } else {
      otherMovement += movement.quantity;
    }

    console.log(
      `Movement #${movement.id} | ` +
        `${movement.createdAt.toISOString()} | ` +
        `type=${movement.type} | ` +
        `qty=${movement.quantity} | ` +
        `comment=${movement.comment ?? ""}`
    );
  }

  console.log();
  console.log(`SUPPLY=${supplyMovement}`);
  console.log(`SALE=${saleMovement}`);
  console.log(`RETURN=${returnMovement}`);
  console.log(`WRITE_OFF=${writeOffMovement}`);
  console.log(`OTHER=${otherMovement}`);

  // ============================================================
  // 5. ORDER LEDGER
  // ============================================================

  printTitle("5. ORDER LEDGER");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
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

  let grossOrders = 0;
  let returnedOrders = 0;
  let netOrders = 0;

  for (const item of orderItems) {
    const gross = item.quantity;
    const returned = item.returned;
    const net = gross - returned;

    grossOrders += gross;
    returnedOrders += returned;
    netOrders += net;

    const batchQty = item.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const returnBatchQty = item.ReturnBatch.reduce(
      (sum, ret) => sum + ret.quantity,
      0
    );

    console.log(
      `Order #${item.orderId} | ` +
        `date=${item.order.date.toISOString()} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${gross} | ` +
        `returned=${returned} | ` +
        `net=${net} | ` +
        `OrderBatch=${batchQty} | ` +
        `ReturnBatch=${returnBatchQty} | ` +
        `status=${item.order.status}`
    );
  }

  console.log();
  console.log(`ORDER GROSS = ${grossOrders}`);
  console.log(`ORDER RETURN = ${returnedOrders}`);
  console.log(`ORDER NET = ${netOrders}`);

  // ============================================================
  // 6. BATCH TOTALS
  // ============================================================

  printTitle("6. BATCH TOTALS");

  let batchCurrent = 0;
  let batchSold = 0;
  let batchReturned = 0;

  for (const batch of batches) {
    const sold = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    batchCurrent += batch.quantity;
    batchSold += sold;
    batchReturned += returned;

    console.log(
      `Batch #${batch.id} | ` +
        `current=${batch.quantity} | ` +
        `sold=${sold} | ` +
        `returned=${returned} | ` +
        `ledger=${batch.quantity + sold - returned}`
    );
  }

  console.log();
  console.log(`BATCH CURRENT TOTAL = ${batchCurrent}`);
  console.log(`BATCH SOLD TOTAL = ${batchSold}`);
  console.log(`BATCH RETURNED TOTAL = ${batchReturned}`);

  // ============================================================
  // 7. WRITE-OFF BY BATCH NUMBER
  // ============================================================

  printTitle("7. WRITE-OFF BY BATCH");

  const writeOffs = movements.filter(
    (movement) => movement.type === "WRITE_OFF"
  );

  const writeOffByBatch = new Map<number, number>();

  for (const movement of writeOffs) {
    const match = movement.comment?.match(/партия №(\d+)/i);

    if (!match) {
      console.log(
        `⚠️ Movement #${movement.id} не содержит номер Batch`
      );
      continue;
    }

    const batchId = Number(match[1]);

    const previous = writeOffByBatch.get(batchId) ?? 0;

    writeOffByBatch.set(
      batchId,
      previous + Math.abs(movement.quantity)
    );

    console.log(
      `Batch #${batchId} | ` +
        `Movement #${movement.id} | ` +
        `write-off=${Math.abs(movement.quantity)}`
    );
  }

  console.log();

  for (const [batchId, qty] of writeOffByBatch.entries()) {
    console.log(`Batch #${batchId} WRITE_OFF TOTAL = ${qty} шт`);
  }

  // ============================================================
  // 8. HISTORICAL BATCHES REFERENCED BY MOVEMENTS
  // ============================================================

  printTitle("8. HISTORICAL BATCH REFERENCES");

  const currentBatchIds = new Set(batches.map((batch) => batch.id));

  const historicalBatchIds = new Set<number>();

  for (const movement of writeOffs) {
    const match = movement.comment?.match(/партия №(\d+)/i);

    if (!match) {
      continue;
    }

    historicalBatchIds.add(Number(match[1]));
  }

  for (const batchId of [...historicalBatchIds].sort((a, b) => a - b)) {
    if (currentBatchIds.has(batchId)) {
      console.log(
        `🟢 Batch #${batchId} существует в текущей БД`
      );
    } else {
      console.log(
        `🔴 Batch #${batchId} упоминается исторически, ` +
          `но отсутствует в текущей БД`
      );
    }
  }

  // ============================================================
  // 9. BALANCE
  // ============================================================

  printTitle("9. BALANCE");

  const movementNet =
    supplyMovement +
    saleMovement +
    returnMovement +
    writeOffMovement +
    otherMovement;

  const openingByMovement = product.stock - movementNet;

  console.log(`Product.stock = ${product.stock}`);
  console.log(`Movement net = ${movementNet}`);
  console.log(`Opening by Movement = ${openingByMovement}`);

  console.log();

  console.log(`Registered supplies = ${registeredSupply}`);
  console.log(`Gross orders = ${grossOrders}`);
  console.log(`Returns = ${returnedOrders}`);
  console.log(
    `Write-offs = ${Math.abs(writeOffMovement)}`
  );

  const openingByBusiness =
    product.stock -
    registeredSupply +
    grossOrders -
    returnedOrders +
    Math.abs(writeOffMovement);

  console.log(
    `Opening by Business = ${openingByBusiness}`
  );

  console.log();

  const gap =
    openingByMovement -
    openingByBusiness;

  console.log(`GAP = ${gap}`);

  // ============================================================
  // 10. BATCH #4
  // ============================================================

  printTitle("10. BATCH #4");

  const batch4WriteOff =
    writeOffByBatch.get(4) ?? 0;

  console.log(
    `Historical Batch #4 write-off = ${batch4WriteOff} шт`
  );

  const batch4Exists = batches.some(
    (batch) => batch.id === 4
  );

  console.log(
    `Batch #4 exists = ${batch4Exists ? "YES" : "NO"}`
  );

  if (batch4WriteOff === 26 && !batch4Exists) {
    console.log();
    console.log(
      "🟠 Batch #4 имеет подтверждённое историческое списание 26 шт."
    );
    console.log(
      "⚠️ Но параметров receivedAt / expiryDate / purchaseCost пока нет."
    );
  }

  // ============================================================
  // 11. FINAL
  // ============================================================

  printTitle("11. FINAL RESULT");

  console.log(`Product.stock = ${product.stock}`);
  console.log(`Current batches = ${batchCurrent}`);
  console.log(`Registered supplies = ${registeredSupply}`);
  console.log(`Order gross = ${grossOrders}`);
  console.log(`Order returns = ${returnedOrders}`);
  console.log(`Order net = ${netOrders}`);
  console.log(`Batch OrderBatch total = ${batchSold}`);
  console.log(`Batch ReturnBatch total = ${batchReturned}`);
  console.log(`Write-offs = ${Math.abs(writeOffMovement)}`);

  console.log();

  if (batchCurrent === product.stock) {
    console.log("🟢 Current Batch = Product.stock");
  } else {
    console.log("🔴 Current Batch != Product.stock");
  }

  if (batchSold === grossOrders - 9) {
    console.log(
      "🟠 Batch OrderBatch пока покрывает только позднюю часть истории."
    );
  }

  console.log();

  console.log(
    "⚠️ ВАЖНО: этот аудит READ ONLY."
  );
  console.log(
    "⚠️ Никаких Batch, Movement или OrderBatch он не создаёт."
  );

  console.log();
  printTitle("🏁 AUDIT V3 ЗАВЕРШЁН");
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ ERROR");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });