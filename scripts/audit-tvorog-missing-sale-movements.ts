import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

function line() {
  console.log("=".repeat(70));
}

function section(title: string) {
  console.log("");
  line();
  console.log(title);
  line();
}

async function main() {
  console.log("");
  line();
  console.log("🧀 ТВОРОГ — MISSING SALE MOVEMENT AUDIT");
  line();
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");
  console.log(
    "Цель: точно определить, какие текущие продажи Творога отсутствуют в Movement."
  );

  // ------------------------------------------------------------
  // 1. PRODUCT
  // ------------------------------------------------------------

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
  console.log(`stock=${product.stock}`);

  // ------------------------------------------------------------
  // 2. ALL CURRENT ORDER ITEMS
  // ------------------------------------------------------------

  section("2. CURRENT ORDER ITEMS");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
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

  let grossTotal = 0;
  let returnTotal = 0;
  let netTotal = 0;

  for (const item of orderItems) {
    const net = item.quantity - item.returned;

    grossTotal += item.quantity;
    returnTotal += item.returned;
    netTotal += net;

    console.log(
      `Order #${item.order.id} | ` +
        `date=${item.order.date.toISOString()} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${item.quantity} | ` +
        `returned=${item.returned} | ` +
        `net=${net} | ` +
        `status=${item.order.status}`
    );

    if (item.batches.length > 0) {
      console.log(
        `  OrderBatch: ${item.batches
          .map(
            (b) =>
              `#${b.id} batch=${b.batchId} qty=${b.quantity} cost=${b.purchaseCost}`
          )
          .join(", ")}`
      );
    } else {
      console.log("  OrderBatch: НЕТ");
    }

    if (item.ReturnBatch.length > 0) {
      console.log(
        `  ReturnBatch: ${item.ReturnBatch
          .map((r) => `#${r.id} batch=${r.batchId} qty=${r.quantity}`)
          .join(", ")}`
      );
    }
  }

  console.log("");
  console.log(`CURRENT ORDER ITEMS: ${orderItems.length}`);
  console.log(`GROSS: ${grossTotal} шт`);
  console.log(`RETURN: ${returnTotal} шт`);
  console.log(`NET: ${netTotal} шт`);

  // ------------------------------------------------------------
  // 3. MOVEMENTS
  // ------------------------------------------------------------

  section("3. MOVEMENTS");

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

  const saleMovements = movements.filter((m) => m.type === "SALE");
  const returnMovements = movements.filter((m) => m.type === "RETURN");
  const supplyMovements = movements.filter((m) => m.type === "SUPPLY");
  const writeOffMovements = movements.filter((m) => m.type === "WRITE_OFF");
  const otherMovements = movements.filter(
    (m) =>
      !["SALE", "RETURN", "SUPPLY", "WRITE_OFF"].includes(m.type)
  );

  const saleTotal = saleMovements.reduce(
    (sum, movement) => sum + Math.abs(movement.quantity),
    0
  );

  const returnMovementTotal = returnMovements.reduce(
    (sum, movement) => sum + movement.quantity,
    0
  );

  const supplyMovementTotal = supplyMovements.reduce(
    (sum, movement) => sum + movement.quantity,
    0
  );

  const writeOffTotal = writeOffMovements.reduce(
    (sum, movement) => sum + Math.abs(movement.quantity),
    0
  );

  console.log(`SUPPLY: ${supplyMovementTotal} шт`);
  console.log(`SALE: -${saleTotal} шт`);
  console.log(`RETURN: +${returnMovementTotal} шт`);
  console.log(`WRITE_OFF: -${writeOffTotal} шт`);
  console.log(`OTHER: ${otherMovements.length} movements`);

  // ------------------------------------------------------------
  // 4. SALE MOVEMENT → ORDER ID
  // ------------------------------------------------------------

  section("4. SALE MOVEMENT → ORDER");

  type SaleMovementInfo = {
    movementId: number;
    quantity: number;
    createdAt: Date;
    orderId: number | null;
    exists: boolean;
  };

  const saleInfos: SaleMovementInfo[] = saleMovements.map((movement) => {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (!match) {
      return {
        movementId: movement.id,
        quantity: Math.abs(movement.quantity),
        createdAt: movement.createdAt,
        orderId: null,
        exists: false,
      };
    }

    const orderId = Number(match[1]);

    return {
      movementId: movement.id,
      quantity: Math.abs(movement.quantity),
      createdAt: movement.createdAt,
      orderId,
      exists: orderItems.some((item) => item.orderId === orderId),
    };
  });

  let existingSaleTotal = 0;
  let deletedSaleTotal = 0;
  let unknownSaleTotal = 0;

  for (const sale of saleInfos) {
    if (sale.orderId === null) {
      unknownSaleTotal += sale.quantity;

      console.log(
        `⚠️ Movement #${sale.movementId} | ` +
          `SALE=${sale.quantity} | ` +
          `Order ID не найден | ` +
          `${sale.createdAt.toISOString()}`
      );

      continue;
    }

    if (sale.exists) {
      existingSaleTotal += sale.quantity;

      console.log(
        `🟢 Movement #${sale.movementId} | ` +
          `Order #${sale.orderId} существует | ` +
          `SALE=${sale.quantity}`
      );
    } else {
      deletedSaleTotal += sale.quantity;

      console.log(
        `🔴 Movement #${sale.movementId} | ` +
          `Order #${sale.orderId} отсутствует | ` +
          `SALE=${sale.quantity}`
      );
    }
  }

  console.log("");
  console.log(`SALE Movement всего: ${saleTotal} шт`);
  console.log(`SALE существующих заказов: ${existingSaleTotal} шт`);
  console.log(`SALE удалённых заказов: ${deletedSaleTotal} шт`);
  console.log(`SALE без Order ID: ${unknownSaleTotal} шт`);

  // ------------------------------------------------------------
  // 5. EXPECTED SALE FOR EACH CURRENT ORDER
  // ------------------------------------------------------------

  section("5. CURRENT ORDER → EXPECTED SALE MOVEMENT");

  const existingSaleByOrder = new Map<number, number>();

  for (const sale of saleInfos) {
    if (sale.orderId === null) continue;
    if (!sale.exists) continue;

    existingSaleByOrder.set(
      sale.orderId,
      (existingSaleByOrder.get(sale.orderId) ?? 0) + sale.quantity
    );
  }

  let missingSaleTotal = 0;
  let matchedSaleTotal = 0;

  for (const item of orderItems) {
    const expected = item.quantity;
    const actual = existingSaleByOrder.get(item.orderId) ?? 0;

    const missing = expected - actual;

    if (missing > 0) {
      missingSaleTotal += missing;

      console.log(
        `🔴 Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${expected} | ` +
          `SALE Movement=${actual} | ` +
          `MISSING=${missing}`
      );
    } else if (missing === 0) {
      matchedSaleTotal += expected;

      console.log(
        `🟢 Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${expected} | ` +
          `SALE Movement=${actual} | ` +
          `OK`
      );
    } else {
      console.log(
        `🟠 Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${expected} | ` +
          `SALE Movement=${actual} | ` +
          `MOVEMENT EXCESS=${Math.abs(missing)}`
      );
    }
  }

  console.log("");
  console.log(`MATCHED CURRENT ORDER SALE: ${matchedSaleTotal} шт`);
  console.log(`MISSING CURRENT ORDER SALE: ${missingSaleTotal} шт`);

  // ------------------------------------------------------------
  // 6. SPECIFIC EARLY ORDERS
  // ------------------------------------------------------------

  section("6. EARLY ORDERS");

  const firstSupplyItem = await prisma.supplyItem.findFirst({
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

  if (firstSupplyItem) {
    console.log(
      `FIRST REGISTERED SUPPLY: SupplyItem #${firstSupplyItem.id} | ` +
        `Supply #${firstSupplyItem.supplyId} | ` +
        `date=${firstSupplyItem.supply.date.toISOString()} | ` +
        `quantity=${firstSupplyItem.quantity} | ` +
        `cost=${firstSupplyItem.cost}`
    );

    let earlyGross = 0;
    let earlyReturned = 0;
    let earlyNet = 0;

    for (const item of orderItems) {
      if (item.order.date.getTime() < firstSupplyItem.supply.date.getTime()) {
        const net = item.quantity - item.returned;

        earlyGross += item.quantity;
        earlyReturned += item.returned;
        earlyNet += net;

        console.log(
          `🔴 EARLY Order #${item.orderId} | ` +
            `date=${item.order.date.toISOString()} | ` +
            `gross=${item.quantity} | ` +
            `returned=${item.returned} | ` +
            `net=${net}`
        );
      }
    }

    console.log("");
    console.log(`EARLY GROSS: ${earlyGross} шт`);
    console.log(`EARLY RETURN: ${earlyReturned} шт`);
    console.log(`EARLY NET: ${earlyNet} шт`);
  } else {
    console.log("SupplyItem для Творога не найден.");
  }

  // ------------------------------------------------------------
  // 7. SUPPLY GAP
  // ------------------------------------------------------------

  section("7. SUPPLY GAP");

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

  const registeredSupplyTotal = supplyItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  console.log(`Registered SupplyItem: ${registeredSupplyTotal} шт`);
  console.log(`SUPPLY Movement: ${supplyMovementTotal} шт`);
  console.log(
    `SUPPLY GAP: ${registeredSupplyTotal - supplyMovementTotal} шт`
  );

  for (const item of supplyItems) {
    const candidates = supplyMovements.filter((movement) => {
      const diff = Math.abs(
        movement.createdAt.getTime() - item.supply.date.getTime()
      );

      return diff <= 1000 && movement.quantity === item.quantity;
    });

    if (candidates.length === 0) {
      console.log(
        `🔴 SupplyItem #${item.id} | ` +
          `Supply #${item.supplyId} | ` +
          `quantity=${item.quantity} | ` +
          `date=${item.supply.date.toISOString()} | ` +
          `NO MATCH`
      );
    } else {
      console.log(
        `🟢 SupplyItem #${item.id} | ` +
          `Supply #${item.supplyId} | ` +
          `quantity=${item.quantity} | ` +
          `Movement #${candidates[0].id} MATCH`
      );
    }
  }

  // ------------------------------------------------------------
  // 8. WRITE-OFF
  // ------------------------------------------------------------

  section("8. WRITE-OFF");

  for (const movement of writeOffMovements) {
    console.log(
      `Movement #${movement.id} | ` +
        `${movement.createdAt.toISOString()} | ` +
        `quantity=${movement.quantity} | ` +
        `${movement.comment ?? ""}`
    );
  }

  // ------------------------------------------------------------
  // 9. FINAL MATHEMATICS
  // ------------------------------------------------------------

  section("9. FINAL MATHEMATICS");

  console.log(`Current Product.stock: ${product.stock}`);
  console.log("");
  console.log(`Registered Supply: ${registeredSupplyTotal}`);
  console.log(`Current Order gross: ${grossTotal}`);
  console.log(`Current Order returns: ${returnTotal}`);
  console.log(`Existing SALE Movement: ${existingSaleTotal}`);
  console.log(`Missing SALE Movement: ${missingSaleTotal}`);
  console.log(`Deleted-order SALE Movement: ${deletedSaleTotal}`);
  console.log(`RETURN Movement: ${returnMovementTotal}`);
  console.log(`WRITE_OFF: ${writeOffTotal}`);

  const openingByMovement =
    product.stock -
    supplyMovementTotal +
    existingSaleTotal -
    returnMovementTotal +
    writeOffTotal;

  const openingByBusiness =
    product.stock -
    registeredSupplyTotal +
    grossTotal -
    returnTotal +
    writeOffTotal;

  console.log("");
  console.log(`Opening by Movement: ${openingByMovement} шт`);
  console.log(`Opening by Business: ${openingByBusiness} шт`);
  console.log(
    `Difference: ${openingByMovement - openingByBusiness} шт`
  );

  // ------------------------------------------------------------
  // 10. EXPECTED RESOLUTION
  // ------------------------------------------------------------

  section("10. GAP RESOLUTION");

  console.log(
    `Supply gap: ${registeredSupplyTotal - supplyMovementTotal} шт`
  );

  console.log(`Missing SALE Movement: ${missingSaleTotal} шт`);

  console.log("");
  console.log(
    `Expected combined correction: ` +
      `${missingSaleTotal - (registeredSupplyTotal - supplyMovementTotal)} шт`
  );

  if (
    missingSaleTotal === 9 &&
    registeredSupplyTotal - supplyMovementTotal === 1
  ) {
    console.log("");
    console.log(
      "🟢 Подтверждается гипотеза: 9 отсутствующих SALE Movement " +
        "и 1 отсутствующий SUPPLY Movement."
    );

    console.log(
      "🟢 Это объясняет расхождение opening stock в 8 шт."
    );
  } else {
    console.log("");
    console.log(
      "🟠 Гипотеза 9/1 НЕ подтверждена автоматически."
    );
  }

  // ------------------------------------------------------------
  // 11. SAFETY
  // ------------------------------------------------------------

  section("11. SAFETY CHECK");

  const productAfter = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
    select: {
      stock: true,
    },
  });

  console.log(
    `Product.stock: ${product.stock} -> ${productAfter?.stock}`
  );

  if (productAfter?.stock === product.stock) {
    console.log("✅ Product.stock НЕ ИЗМЕНЁН");
  } else {
    console.log("🔴 НЕОЖИДАННОЕ ИЗМЕНЕНИЕ Product.stock");
  }

  console.log("");
  line();
  console.log("🏁 AUDIT ЗАВЕРШЁН");
  line();
  console.log("");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 AUDIT ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });