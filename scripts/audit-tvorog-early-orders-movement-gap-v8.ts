// scripts/audit-tvorog-early-orders-movement-gap-v8.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function fmtDate(date: Date | null | undefined) {
  if (!date) return "-";
  return date.toISOString();
}

async function main() {
  line();
  console.log("🧀 ТВОРОГ — EARLY ORDERS / MOVEMENT GAP AUDIT V8");
  line();

  console.log("\n⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log(
    "\nЦель: найти расхождение между ранними продажами Творога и Movement."
  );

  const product = await prisma.product.findFirst({
    where: {
      name: "Творог",
    },
  });

  if (!product) {
    throw new Error('Продукт "Творог" не найден');
  }

  line();
  console.log("\n1. PRODUCT");
  line();

  console.log(`\nProduct #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);
  console.log(`cost=${product.cost} ₽`);
  console.log(`price=${product.price} ₽`);

  // ------------------------------------------------------------
  // FIRST CURRENT BATCH
  // ------------------------------------------------------------

  const firstBatch = await prisma.batch.findFirst({
    where: {
      productId: product.id,
    },
    orderBy: {
      receivedAt: "asc",
    },
  });

  if (!firstBatch) {
    throw new Error("Для Творога не найдено ни одной Batch");
  }

  const boundary = firstBatch.receivedAt;

  line();
  console.log("\n2. FIRST CURRENT BATCH BOUNDARY");
  line();

  console.log(`\nBatch #${firstBatch.id}`);
  console.log(`received=${fmtDate(firstBatch.receivedAt)}`);
  console.log(`quantity=${firstBatch.quantity}`);
  console.log(`purchaseCost=${firstBatch.purchaseCost} ₽`);
  console.log(`expiry=${fmtDate(firstBatch.expiryDate)}`);
  console.log(`status=${firstBatch.status}`);

  // ------------------------------------------------------------
  // EARLY ORDER ITEMS
  // ------------------------------------------------------------

  const earlyOrderItems = await prisma.orderItem.findMany({
    where: {
      productId: product.id,
      order: {
        date: {
          lt: boundary,
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

  line();
  console.log("\n3. EARLY ORDERS BEFORE FIRST BATCH");
  line();

  let earlyGross = 0;
  let earlyReturnedField = 0;
  let earlyReturnedByRecords = 0;
  let earlyNet = 0;
  let earlyLinkedBatchQty = 0;

  if (earlyOrderItems.length === 0) {
    console.log("\nНет ранних OrderItem.");
  }

  for (const item of earlyOrderItems) {
    const returnBatchQty = item.ReturnBatch.reduce(
      (sum, returnBatch) => sum + returnBatch.quantity,
      0
    );

    const linkedBatchQty = item.batches.reduce(
      (sum, orderBatch) => sum + orderBatch.quantity,
      0
    );

    const net = item.quantity - item.returned;

    earlyGross += item.quantity;
    earlyReturnedField += item.returned;
    earlyReturnedByRecords += returnBatchQty;
    earlyNet += net;
    earlyLinkedBatchQty += linkedBatchQty;

    console.log(
      `\nOrder #${item.order.id} | ` +
        `date=${fmtDate(item.order.date)} | ` +
        `OrderItem #${item.id}`
    );

    console.log(`gross=${item.quantity}`);
    console.log(`returned field=${item.returned}`);
    console.log(`ReturnBatch total=${returnBatchQty}`);
    console.log(`net=${net}`);
    console.log(`OrderBatch total=${linkedBatchQty}`);
    console.log(`status=${item.order.status}`);

    if (item.batches.length > 0) {
      for (const orderBatch of item.batches) {
        console.log(
          `  OrderBatch #${orderBatch.id} | ` +
            `batch=${orderBatch.batchId} | ` +
            `qty=${orderBatch.quantity} | ` +
            `cost=${orderBatch.purchaseCost} ₽`
        );
      }
    } else {
      console.log("  OrderBatch: НЕТ");
    }

    if (item.ReturnBatch.length > 0) {
      for (const returnBatch of item.ReturnBatch) {
        console.log(
          `  ReturnBatch #${returnBatch.id} | ` +
            `batch=${returnBatch.batchId} | ` +
            `qty=${returnBatch.quantity}`
        );
      }
    } else {
      console.log("  ReturnBatch: НЕТ");
    }
  }

  console.log("\n--- EARLY ORDER TOTALS ---");
  console.log(`EARLY GROSS = ${earlyGross} шт`);
  console.log(`EARLY RETURNED FIELD = ${earlyReturnedField} шт`);
  console.log(`EARLY RETURNBATCH TOTAL = ${earlyReturnedByRecords} шт`);
  console.log(`EARLY NET = ${earlyNet} шт`);
  console.log(`EARLY ORDERBATCH COVERAGE = ${earlyLinkedBatchQty} шт`);

  // ------------------------------------------------------------
  // EARLY SALE MOVEMENTS
  // ------------------------------------------------------------

  const earlySaleMovements = await prisma.movement.findMany({
    where: {
      productId: product.id,
      createdAt: {
        lt: boundary,
      },
      type: "SALE",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  line();
  console.log("\n4. EARLY SALE MOVEMENTS BEFORE FIRST BATCH");
  line();

  let movementSaleNet = 0;

  if (earlySaleMovements.length === 0) {
    console.log("\nSALE Movement не найдено.");
  }

  for (const movement of earlySaleMovements) {
    movementSaleNet += movement.quantity;

    console.log(
      `\nMovement #${movement.id} | ` +
        `date=${fmtDate(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `qty=${movement.quantity} | ` +
        `comment=${movement.comment ?? "-"}`
    );
  }

  console.log(`\nEARLY SALE MOVEMENT NET = ${movementSaleNet} шт`);
  console.log(
    `EARLY SALE MOVEMENT ABS = ${Math.abs(movementSaleNet)} шт`
  );

  // ------------------------------------------------------------
  // EARLY SUPPLIES
  // ------------------------------------------------------------

  const earlySupplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: product.id,
      supply: {
        date: {
          lt: boundary,
        },
      },
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

  line();
  console.log("\n5. EARLY SUPPLIES BEFORE FIRST BATCH");
  line();

  let earlySupplyQty = 0;

  if (earlySupplyItems.length === 0) {
    console.log("\nРанние SupplyItem не найдены.");
  }

  for (const item of earlySupplyItems) {
    earlySupplyQty += item.quantity;

    console.log(
      `\nSupplyItem #${item.id} | ` +
        `Supply #${item.supply.id} | ` +
        `date=${fmtDate(item.supply.date)} | ` +
        `qty=${item.quantity} | ` +
        `cost=${item.cost} ₽`
    );
  }

  console.log(`\nEARLY SUPPLY TOTAL = ${earlySupplyQty} шт`);

  // ------------------------------------------------------------
  // MATCH EARLY ORDERS TO MOVEMENTS
  // ------------------------------------------------------------

  line();
  console.log("\n6. EARLY ORDER ↔ MOVEMENT COVERAGE");
  line();

  console.log("\nOrders:");

  for (const item of earlyOrderItems) {
    const orderCommentPart = `Заказ №${item.order.id}`;

    const relatedMovements = earlySaleMovements.filter(
      (movement) =>
        movement.comment?.includes(orderCommentPart) ?? false
    );

    const movementQty = relatedMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const net = item.quantity - item.returned;

    console.log(
      `\nOrder #${item.order.id} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${item.quantity} | ` +
        `returned=${item.returned} | ` +
        `net=${net}`
    );

    if (relatedMovements.length === 0) {
      console.log("  🔴 SALE Movement: НЕТ");
    } else {
      console.log(
        `  🟢 SALE Movement count=${relatedMovements.length}`
      );

      for (const movement of relatedMovements) {
        console.log(
          `    Movement #${movement.id} | ` +
            `date=${fmtDate(movement.createdAt)} | ` +
            `qty=${movement.quantity}`
        );
      }

      console.log(`  Movement total=${movementQty}`);
    }

    const expectedMovement = -net;

    if (movementQty === expectedMovement) {
      console.log("  🟢 Coverage OK");
    } else {
      console.log(
        `  🔴 GAP = ${expectedMovement - movementQty} шт`
      );
    }
  }

  // ------------------------------------------------------------
  // TIMELINE
  // ------------------------------------------------------------

  line();
  console.log("\n7. UNIFIED EARLY TIMELINE");
  line();

  type TimelineEvent = {
    date: Date;
    type: "ORDER" | "RETURN" | "SUPPLY" | "MOVEMENT";
    qty: number;
    source: string;
    description: string;
  };

  const events: TimelineEvent[] = [];

  for (const item of earlyOrderItems) {
    const net = item.quantity - item.returned;

    events.push({
      date: item.order.date,
      type: "ORDER",
      qty: -net,
      source: `Order #${item.order.id} / OrderItem #${item.id}`,
      description:
        `Продажа gross=${item.quantity}, ` +
        `returned=${item.returned}, net=${net}`,
    });
  }

  for (const item of earlySupplyItems) {
    events.push({
      date: item.supply.date,
      type: "SUPPLY",
      qty: item.quantity,
      source: `Supply #${item.supply.id} / SupplyItem #${item.id}`,
      description:
        `Приход ${item.quantity} шт, cost=${item.cost} ₽`,
    });
  }

  for (const movement of earlySaleMovements) {
    events.push({
      date: movement.createdAt,
      type: "MOVEMENT",
      qty: movement.quantity,
      source: `Movement #${movement.id}`,
      description:
        `${movement.type}: ${movement.comment ?? "-"}`,
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  let businessBalance = 0;
  let movementBalance = 0;

  console.log(
    "\nDATE | TYPE | SOURCE | QTY | BUSINESS BALANCE | MOVEMENT BALANCE"
  );

  for (const event of events) {
    if (event.type === "ORDER" || event.type === "RETURN") {
      businessBalance += event.qty;
    }

    if (event.type === "SUPPLY") {
      businessBalance += event.qty;
    }

    if (event.type === "MOVEMENT") {
      movementBalance += event.qty;
    }

    console.log(
      `\n${fmtDate(event.date)} | ` +
        `${event.type.padEnd(8)} | ` +
        `${event.source} | ` +
        `qty=${event.qty >= 0 ? "+" : ""}${event.qty} | ` +
        `business=${businessBalance} | ` +
        `movement=${movementBalance}`
    );

    console.log(`  ${event.description}`);
  }

  // ------------------------------------------------------------
  // GAP CALCULATION
  // ------------------------------------------------------------

  line();
  console.log("\n8. GAP CALCULATION");
  line();

  const expectedSaleMovement = -earlyNet;
  const missingSaleMovementQty =
    expectedSaleMovement - movementSaleNet;

  const businessDelta = earlySupplyQty - earlyNet;
  const movementDelta = movementSaleNet;

  const openingByBusiness = -businessDelta;
  const openingByMovement = -movementDelta;

  console.log(`\nEARLY SUPPLY = ${earlySupplyQty} шт`);
  console.log(`EARLY ORDER NET = ${earlyNet} шт`);

  console.log(
    `\nExpected SALE Movement total = ${expectedSaleMovement} шт`
  );

  console.log(
    `Actual SALE Movement total = ${movementSaleNet} шт`
  );

  console.log(
    `MISSING SALE MOVEMENT QUANTITY = ${missingSaleMovementQty} шт`
  );

  console.log(`\nBUSINESS DELTA = ${businessDelta} шт`);
  console.log(`MOVEMENT DELTA = ${movementDelta} шт`);

  console.log(
    `\nOPENING REQUIRED BY BUSINESS = ${openingByBusiness} шт`
  );

  console.log(
    `OPENING REQUIRED BY MOVEMENT = ${openingByMovement} шт`
  );

  console.log(
    `MODEL GAP = ${openingByBusiness - openingByMovement} шт`
  );

  // ------------------------------------------------------------
  // MISSING ORDER MOVEMENTS
  // ------------------------------------------------------------

  line();
  console.log("\n9. MISSING SALE MOVEMENTS BY ORDER");
  line();

  let missingOrdersCount = 0;
  let missingOrdersQty = 0;

  for (const item of earlyOrderItems) {
    const relatedMovements = earlySaleMovements.filter(
      (movement) =>
        movement.comment?.includes(`Заказ №${item.order.id}`) ??
        false
    );

    const actualQty = relatedMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const expectedQty = -(item.quantity - item.returned);

    const gap = expectedQty - actualQty;

    if (gap !== 0) {
      missingOrdersCount += 1;
      missingOrdersQty += gap;

      console.log(
        `\n🔴 Order #${item.order.id} | ` +
          `OrderItem #${item.id}`
      );

      console.log(
        `expected SALE Movement=${expectedQty} | ` +
          `actual=${actualQty} | ` +
          `gap=${gap}`
      );
    }
  }

  if (missingOrdersCount === 0) {
    console.log("\n🟢 Все ранние заказы имеют корректный SALE Movement.");
  } else {
    console.log(
      `\n🔴 ORDERS WITH MISSING / INCORRECT MOVEMENTS = ${missingOrdersCount}`
    );

    console.log(
      `🔴 TOTAL ORDER/MOVEMENT GAP = ${missingOrdersQty} шт`
    );
  }

  // ------------------------------------------------------------
  // FINAL RESULT
  // ------------------------------------------------------------

  line();
  console.log("\n10. FINAL RESULT");
  line();

  console.log(`\nProduct = ${product.name}`);
  console.log(`Product ID = ${product.id}`);

  console.log(
    `\nFirst current Batch = #${firstBatch.id}`
  );

  console.log(
    `First Batch boundary = ${fmtDate(boundary)}`
  );

  console.log(`\nEarly supply = ${earlySupplyQty} шт`);
  console.log(`Early gross orders = ${earlyGross} шт`);
  console.log(`Early returned = ${earlyReturnedField} шт`);
  console.log(`Early net orders = ${earlyNet} шт`);

  console.log(
    `\nActual early SALE Movement = ${movementSaleNet} шт`
  );

  console.log(
    `Expected early SALE Movement = ${expectedSaleMovement} шт`
  );

  console.log(
    `Missing SALE Movement gap = ${missingSaleMovementQty} шт`
  );

  console.log(
    `\nOpening by business = ${openingByBusiness} шт`
  );

  console.log(
    `Opening by movement = ${openingByMovement} шт`
  );

  console.log(
    `Model gap = ${openingByBusiness - openingByMovement} шт`
  );

  console.log("\n⚠️ ВАЖНО");
  console.log("Этот скрипт READ ONLY.");
  console.log("База данных НЕ изменяется.");
  console.log("Batch НЕ создаются.");
  console.log("Movement НЕ создаются.");
  console.log("OrderBatch НЕ изменяются.");
  console.log("ReturnBatch НЕ изменяются.");
  console.log("Product.stock НЕ изменяется.");

  console.log("\n🏁 AUDIT V8 ЗАВЕРШЁН");
}

main()
  .catch((error) => {
    console.error("\n❌ AUDIT FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });