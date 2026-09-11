import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function section(title: string) {
  console.log("\n");
  line();
  console.log(title);
  line();
}

async function main() {
  section("🧀 ТВОРОГ — OPENING TIMELINE AUDIT V4");

  console.log("\n⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log(
    "\nЦель: восстановить полную хронологию движения Творога и определить"
  );
  console.log(
    "математически необходимый opening stock перед первой зарегистрированной поставкой."
  );

  // -------------------------------------------------------------------
  // 1. PRODUCT
  // -------------------------------------------------------------------

  section("1. PRODUCT");

  const product = await prisma.product.findFirst({
    where: {
      name: "Творог",
    },
  });

  if (!product) {
    throw new Error("❌ Product Творог не найден");
  }

  console.log(`\nProduct #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);

  // -------------------------------------------------------------------
  // 2. SUPPLIES
  // -------------------------------------------------------------------

  section("2. SUPPLIES");

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: product.id,
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
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `date=${item.supply.date.toISOString()} | ` +
        `qty=+${item.quantity} | ` +
        `cost=${item.cost} ₽`
    );
  }

  console.log(`\nREGISTERED SUPPLY TOTAL = ${supplyTotal} шт`);

  const firstSupply = supplyItems[0];

  if (!firstSupply) {
    throw new Error("❌ У Творога нет SupplyItem");
  }

  console.log(
    `FIRST REGISTERED SUPPLY = ${firstSupply.supply.date.toISOString()}`
  );

  // -------------------------------------------------------------------
  // 3. ORDERS
  // -------------------------------------------------------------------

  section("3. CURRENT ORDER ITEMS");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: product.id,
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
    orderBy: {
      order: {
        date: "asc",
      },
    },
  });

  let grossOrders = 0;
  let returnedOrders = 0;

  for (const item of orderItems) {
    const net = item.quantity - item.returned;

    grossOrders += item.quantity;
    returnedOrders += item.returned;

    console.log(
      `Order #${item.orderId} | ` +
        `date=${item.order.date.toISOString()} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${item.quantity} | ` +
        `returned=${item.returned} | ` +
        `net=${net} | ` +
        `status=${item.order.status}`
    );
  }

  console.log(`\nORDER GROSS = ${grossOrders} шт`);
  console.log(`ORDER RETURN = ${returnedOrders} шт`);
  console.log(`ORDER NET = ${grossOrders - returnedOrders} шт`);

  // -------------------------------------------------------------------
  // 4. MOVEMENTS
  // -------------------------------------------------------------------

  section("4. MOVEMENTS");

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const movement of movements) {
    console.log(
      `Movement #${movement.id} | ` +
        `date=${movement.createdAt.toISOString()} | ` +
        `type=${movement.type} | ` +
        `qty=${movement.quantity} | ` +
        `comment=${movement.comment ?? "-"}`
    );
  }

  // -------------------------------------------------------------------
  // 5. HISTORICAL EVENT TIMELINE
  // -------------------------------------------------------------------

  section("5. BUSINESS TIMELINE");

  type TimelineEvent = {
    date: Date;
    type: string;
    quantity: number;
    source: string;
    details: string;
  };

  const events: TimelineEvent[] = [];

  // Opening balance is unknown and intentionally not added here.

  for (const item of supplyItems) {
    events.push({
      date: item.supply.date,
      type: "SUPPLY",
      quantity: item.quantity,
      source: `SupplyItem #${item.id}`,
      details: `Supply #${item.supplyId} | cost=${item.cost} ₽`,
    });
  }

  for (const item of orderItems) {
    events.push({
      date: item.order.date,
      type: "SALE",
      quantity: -item.quantity,
      source: `OrderItem #${item.id}`,
      details: `Order #${item.orderId}`,
    });

    if (item.returned > 0) {
      // ReturnBatch has the actual timestamp.
      for (const returnBatch of item.ReturnBatch) {
        events.push({
          date: returnBatch.createdAt,
          type: "RETURN",
          quantity: returnBatch.quantity,
          source: `ReturnBatch #${returnBatch.id}`,
          details:
            `Order #${item.orderId} | ` +
            `Batch #${returnBatch.batchId}`,
        });
      }
    }
  }

  // Write-offs are represented only by Movement.
  for (const movement of movements) {
    if (movement.type === "WRITE_OFF") {
      events.push({
        date: movement.createdAt,
        type: "WRITE_OFF",
        quantity: movement.quantity,
        source: `Movement #${movement.id}`,
        details: movement.comment ?? "",
      });
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningWithoutOpening = 0;
  let minRunningWithoutOpening = 0;
  let earliestMinimumDate: Date | null = null;

  for (const event of events) {
    runningWithoutOpening += event.quantity;

    if (runningWithoutOpening < minRunningWithoutOpening) {
      minRunningWithoutOpening = runningWithoutOpening;
      earliestMinimumDate = event.date;
    }

    const marker =
      event.date.getTime() < firstSupply.supply.date.getTime()
        ? "🔴 BEFORE FIRST SUPPLY"
        : "🟢";

    console.log(
      `${marker} | ` +
        `${event.date.toISOString()} | ` +
        `${event.type.padEnd(10)} | ` +
        `${String(event.quantity).padStart(4)} | ` +
        `BALANCE=${runningWithoutOpening} | ` +
        `${event.source} | ${event.details}`
    );
  }

  // -------------------------------------------------------------------
  // 6. OPENING STOCK REQUIREMENT
  // -------------------------------------------------------------------

  section("6. MINIMUM OPENING STOCK REQUIRED BY TIMELINE");

  const minimumOpeningRequired = Math.abs(
    Math.min(0, minRunningWithoutOpening)
  );

  console.log(
    `\nMinimum running balance without opening = ${minRunningWithoutOpening} шт`
  );

  console.log(
    `Minimum opening stock required = ${minimumOpeningRequired} шт`
  );

  if (earliestMinimumDate) {
    console.log(
      `Minimum balance reached at = ${earliestMinimumDate.toISOString()}`
    );
  }

  // -------------------------------------------------------------------
  // 7. BALANCE BEFORE FIRST SUPPLY
  // -------------------------------------------------------------------

  section("7. PERIOD BEFORE FIRST REGISTERED SUPPLY");

  const eventsBeforeFirstSupply = events.filter(
    (event) => event.date.getTime() < firstSupply.supply.date.getTime()
  );

  let beforeFirstSupplyBalance = 0;

  for (const event of eventsBeforeFirstSupply) {
    beforeFirstSupplyBalance += event.quantity;

    console.log(
      `${event.date.toISOString()} | ` +
        `${event.type} | ${event.quantity} | ` +
        `BALANCE=${beforeFirstSupplyBalance} | ` +
        `${event.source}`
    );
  }

  console.log(
    `\nNET BEFORE FIRST REGISTERED SUPPLY = ${beforeFirstSupplyBalance} шт`
  );

  console.log(
    `OPENING REQUIRED BEFORE FIRST SUPPLY = ${Math.abs(
      Math.min(0, beforeFirstSupplyBalance)
    )} шт`
  );

  // -------------------------------------------------------------------
  // 8. PERIOD BETWEEN SUPPLY #1 AND BATCH #13
  // -------------------------------------------------------------------

  section("8. PERIOD BETWEEN SUPPLY #1 AND FIRST CURRENT BATCH");

  const firstCurrentBatch = await prisma.batch.findFirst({
    where: {
      productId: product.id,
    },
    orderBy: {
      receivedAt: "asc",
    },
  });

  if (!firstCurrentBatch) {
    throw new Error("❌ Current Batch для Творога не найден");
  }

  console.log(
    `\nFIRST CURRENT BATCH = #${firstCurrentBatch.id}`
  );

  console.log(
    `receivedAt=${firstCurrentBatch.receivedAt.toISOString()}`
  );

  const betweenEvents = events.filter(
    (event) =>
      event.date.getTime() >= firstSupply.supply.date.getTime() &&
      event.date.getTime() < firstCurrentBatch.receivedAt.getTime()
  );

  let betweenBalance = 0;

  for (const event of betweenEvents) {
    betweenBalance += event.quantity;

    console.log(
      `${event.date.toISOString()} | ` +
        `${event.type.padEnd(10)} | ` +
        `${String(event.quantity).padStart(4)} | ` +
        `NET=${betweenBalance} | ` +
        `${event.source}`
    );
  }

  console.log(
    `\nNET BETWEEN FIRST SUPPLY AND FIRST CURRENT BATCH = ${betweenBalance} шт`
  );

  // -------------------------------------------------------------------
  // 9. FULL BUSINESS OPENING CALCULATION
  // -------------------------------------------------------------------

  section("9. FULL BUSINESS BALANCE");

  const writeOffTotal = movements
    .filter((movement) => movement.type === "WRITE_OFF")
    .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);

  console.log(`\nCurrent Product.stock = ${product.stock}`);
  console.log(`Registered Supply = ${supplyTotal}`);
  console.log(`Gross Orders = ${grossOrders}`);
  console.log(`Returned Orders = ${returnedOrders}`);
  console.log(`Write-offs = ${writeOffTotal}`);

  const openingByBusiness =
    product.stock -
    supplyTotal +
    grossOrders -
    returnedOrders +
    writeOffTotal;

  console.log(
    `\nOPENING BY BUSINESS = ` +
      `${product.stock} - ${supplyTotal} + ${grossOrders} - ` +
      `${returnedOrders} + ${writeOffTotal}`
  );

  console.log(`OPENING BY BUSINESS = ${openingByBusiness} шт`);

  // -------------------------------------------------------------------
  // 10. BATCH #4 HYPOTHESIS
  // -------------------------------------------------------------------

  section("10. BATCH #4 HYPOTHESIS");

  const batch4WriteOff = movements
    .filter(
      (movement) =>
        movement.type === "WRITE_OFF" &&
        movement.comment?.includes("Партия №4")
    )
    .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);

  console.log(`\nHistorical Batch #4 write-off = ${batch4WriteOff} шт`);

  console.log(
    `Timeline minimum opening required = ${minimumOpeningRequired} шт`
  );

  console.log(`Business opening calculation = ${openingByBusiness} шт`);

  if (batch4WriteOff > 0) {
    console.log(
      "\n⚠️ ВАЖНО: write-off Batch #4 подтверждает, что исторически"
    );
    console.log(
      `существовало минимум ${batch4WriteOff} шт, списанных из Batch #4.`
    );
  }

  // -------------------------------------------------------------------
  // 11. RECONCILIATION
  // -------------------------------------------------------------------

  section("11. RECONCILIATION");

  const finalBalanceFromTimeline =
    minimumOpeningRequired + runningWithoutOpening;

  console.log(
    `\nFinal timeline balance with MINIMUM opening = ${finalBalanceFromTimeline} шт`
  );

  console.log(`Actual Product.stock = ${product.stock} шт`);

  console.log(
    `Difference = ${finalBalanceFromTimeline - product.stock} шт`
  );

  console.log(
    "\nПроверка business opening:"
  );

  console.log(
    `Opening by business = ${openingByBusiness} шт`
  );

  const finalWithBusinessOpening =
    openingByBusiness + runningWithoutOpening;

  console.log(
    `Final balance using business opening = ${finalWithBusinessOpening} шт`
  );

  console.log(
    `Actual Product.stock = ${product.stock} шт`
  );

  console.log(
    `Difference = ${finalWithBusinessOpening - product.stock} шт`
  );

  // -------------------------------------------------------------------
  // 12. FINAL DECISION
  // -------------------------------------------------------------------

  section("12. FINAL DECISION");

  const batchTotal = await prisma.batch.aggregate({
    where: {
      productId: product.id,
    },
    _sum: {
      quantity: true,
    },
  });

  const currentBatchTotal = batchTotal._sum.quantity ?? 0;

  console.log(
    `\nCurrent Batch total = ${currentBatchTotal} шт`
  );

  console.log(
    `Product.stock = ${product.stock} шт`
  );

  if (currentBatchTotal === product.stock) {
    console.log("\n🟢 Current Batch total = Product.stock");
  } else {
    console.log("\n🔴 Current Batch total ≠ Product.stock");
  }

  if (finalWithBusinessOpening === product.stock) {
    console.log(
      "\n🟢 BUSINESS OPENING ПОЛНОСТЬЮ СОГЛАСУЕТСЯ С TIMELINE."
    );
  } else {
    console.log(
      "\n🔴 BUSINESS OPENING И TIMELINE ЕЩЁ НЕ СОГЛАСУЮТСЯ."
    );
  }

  console.log(
    "\n⚠️ Этот скрипт ничего не создаёт, не удаляет и не изменяет."
  );

  section("13. SAFETY CHECK");

  const productAfter = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  console.log(
    `\nProduct.stock: ${product.stock} -> ${productAfter?.stock}`
  );

  if (productAfter?.stock === product.stock) {
    console.log("✅ Product.stock НЕ ИЗМЕНЁН");
  } else {
    console.log("🔴 Product.stock ИЗМЕНИЛСЯ — ОШИБКА!");
  }

  section("🏁 AUDIT V4 ЗАВЕРШЁН");

  console.log("\n⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
}

main()
  .catch((error) => {
    console.error("\n❌ AUDIT FAILED:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });