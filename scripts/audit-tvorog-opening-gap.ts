import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

function line() {
  console.log("=".repeat(70));
}

async function main() {
  console.log();
  line();
  console.log("🧀 ТВОРОГ — OPENING GAP AUDIT");
  line();
  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();
  console.log(
    "Цель: точно найти источник расхождения между opening stock."
  );
  console.log();

  // ============================================================
  // 1. PRODUCT
  // ============================================================

  line();
  console.log("1. PRODUCT");
  line();

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

  // ============================================================
  // 2. SUPPLY ITEMS
  // ============================================================

  line();
  console.log("2. SUPPLY ITEMS");
  line();

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
    orderBy: {
      supplyId: "asc",
    },
  });

  let registeredSupply = 0;

  for (const item of supplyItems) {
    registeredSupply += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `${item.supply.date.toISOString()} | ` +
        `+${item.quantity} шт | ` +
        `cost=${item.cost} ₽`
    );
  }

  console.log();
  console.log(`REGISTERED SUPPLY TOTAL: ${registeredSupply} шт`);

  // ============================================================
  // 3. MOVEMENTS
  // ============================================================

  line();
  console.log("3. MOVEMENTS");
  line();

  // В текущей Prisma-схеме модель Movement доступна как prisma.movement
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
    switch (movement.type) {
      case "SUPPLY":
        supplyMovement += movement.quantity;
        break;

      case "SALE":
        saleMovement += movement.quantity;
        break;

      case "RETURN":
        returnMovement += movement.quantity;
        break;

      case "WRITE_OFF":
        writeOffMovement += movement.quantity;
        break;

      default:
        otherMovement += movement.quantity;
        break;
    }
  }

  console.log(`SUPPLY    = ${supplyMovement}`);
  console.log(`SALE      = ${saleMovement}`);
  console.log(`RETURN    = ${returnMovement}`);
  console.log(`WRITE_OFF = ${writeOffMovement}`);
  console.log(`OTHER     = ${otherMovement}`);

  const netMovement =
    supplyMovement +
    saleMovement +
    returnMovement +
    writeOffMovement +
    otherMovement;

  console.log();
  console.log(`NET MOVEMENT = ${netMovement}`);

  const openingByMovement = product.stock - netMovement;

  console.log(
    `OPENING BY MOVEMENT = ${openingByMovement}`
  );

  // ============================================================
  // 4. SUPPLY ↔ MOVEMENT
  // ============================================================

  line();
  console.log("4. SUPPLY ↔ MOVEMENT");
  line();

  console.log(
    `Registered SupplyItem quantity = ${registeredSupply}`
  );

  console.log(
    `SUPPLY Movement quantity        = ${supplyMovement}`
  );

  console.log(
    `DIFFERENCE                      = ${
      registeredSupply - supplyMovement
    }`
  );

  if (registeredSupply !== supplyMovement) {
    console.log();
    console.log(
      "🔴 SupplyItem и SUPPLY Movement НЕ совпадают."
    );
  } else {
    console.log();
    console.log("🟢 SupplyItem и SUPPLY Movement совпадают.");
  }

  // ============================================================
  // 5. КАЖДАЯ ПОСТАВКА — ПОИСК MOVEMENT
  // ============================================================

  line();
  console.log("5. КАЖДАЯ ПОСТАВКА — ПОИСК SUPPLY MOVEMENT");
  line();

  for (const item of supplyItems) {
    const supplyDate = item.supply.date;

    const nearest = movements
      .filter((movement) => movement.type === "SUPPLY")
      .map((movement) => ({
        movement,
        diff: Math.abs(
          movement.createdAt.getTime() - supplyDate.getTime()
        ),
      }))
      .sort((a, b) => a.diff - b.diff);

    const candidate = nearest[0];

    console.log();
    console.log(
      `SupplyItem #${item.id} | Supply #${item.supplyId}`
    );

    console.log(
      `date=${supplyDate.toISOString()}`
    );

    console.log(`quantity=${item.quantity}`);

    if (!candidate) {
      console.log("🔴 SUPPLY MOVEMENT НЕ НАЙДЕН");
      continue;
    }

    console.log(
      `Ближайший Movement #${candidate.movement.id} | ` +
        `${candidate.movement.createdAt.toISOString()} | ` +
        `quantity=${candidate.movement.quantity}`
    );

    console.log(
      `временная разница=${candidate.diff} ms`
    );

    if (
      candidate.movement.quantity === item.quantity &&
      candidate.diff <= 10_000
    ) {
      console.log("🟢 Поставка подтверждается Movement");
    } else {
      console.log(
        "🔴 Надёжного соответствия SupplyItem ↔ Movement нет"
      );
    }
  }

  // ============================================================
  // 6. ПЕРВАЯ ПОСТАВКА
  // ============================================================

  line();
  console.log("6. ПЕРВАЯ ЗАРЕГИСТРИРОВАННАЯ ПОСТАВКА");
  line();

  const firstSupply = [...supplyItems].sort(
    (a, b) =>
      a.supply.date.getTime() -
      b.supply.date.getTime()
  )[0];

  if (!firstSupply) {
    throw new Error("SupplyItem не найден");
  }

  console.log(
    `SupplyItem #${firstSupply.id}`
  );

  console.log(
    `Supply #${firstSupply.supplyId}`
  );

  console.log(
    `date=${firstSupply.supply.date.toISOString()}`
  );

  console.log(
    `quantity=${firstSupply.quantity}`
  );

  console.log(
    `cost=${firstSupply.cost} ₽`
  );

  // ============================================================
  // 7. РАННЯЯ ПРОДАЖА
  // ============================================================

  line();
  console.log("7. РАННЯЯ ПРОДАЖА ДО ПЕРВОЙ ПОСТАВКИ");
  line();

  /*
   * В этой схеме OrderItem содержит orderId,
   * поэтому сначала получаем OrderItem,
   * затем отдельно загружаем Order.
   */

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      orderId: "asc",
    },
  });

  let earlyGross = 0;
  let earlyReturned = 0;

  for (const item of orderItems) {
    const order = await prisma.order.findUnique({
      where: {
        id: item.orderId,
      },
    });

    if (!order) {
      continue;
    }

    if (
      order.date.getTime() <
      firstSupply.supply.date.getTime()
    ) {
      earlyGross += item.quantity;
      earlyReturned += item.returned;

      console.log(
        `Order #${order.id} | ` +
          `order.date.toISOString()} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${item.quantity} | ` +
          `returned=${item.returned} | ` +
          `net=${item.quantity - item.returned}`
      );
    }
  }

  console.log();
  console.log(`EARLY GROSS = ${earlyGross} шт`);
  console.log(`EARLY RETURN = ${earlyReturned} шт`);
  console.log(
    `EARLY NET = ${earlyGross - earlyReturned} шт`
  );

  // ============================================================
  // 8. CURRENT ORDER BUSINESS BALANCE
  // ============================================================

  line();
  console.log("8. BUSINESS BALANCE");
  line();

  let grossSales = 0;
  let orderReturns = 0;

  for (const item of orderItems) {
    grossSales += item.quantity;
    orderReturns += item.returned;
  }

  console.log(
    `CURRENT ORDER GROSS = ${grossSales}`
  );

  console.log(
    `CURRENT ORDER RETURNS = ${orderReturns}`
  );

  console.log(
    `CURRENT ORDER NET = ${grossSales - orderReturns}`
  );

  const totalWriteOff = Math.abs(writeOffMovement);

  const openingByBusiness =
    product.stock -
    registeredSupply +
    grossSales -
    orderReturns +
    totalWriteOff;

  console.log();
  console.log(`Current stock     = ${product.stock}`);
  console.log(`Supply            = ${registeredSupply}`);
  console.log(`Gross sales       = ${grossSales}`);
  console.log(`Returns           = ${orderReturns}`);
  console.log(`Write-offs        = ${totalWriteOff}`);

  console.log();
  console.log(
    `OPENING BY BUSINESS = ${openingByBusiness}`
  );

  // ============================================================
  // 9. EXACT GAP
  // ============================================================

  line();
  console.log("9. EXACT GAP");
  line();

  const gap =
    openingByMovement -
    openingByBusiness;

  console.log(
    `Opening by Movement = ${openingByMovement}`
  );

  console.log(
    `Opening by Business = ${openingByBusiness}`
  );

  console.log(
    `GAP = ${gap} шт`
  );

  if (gap === 0) {
    console.log();
    console.log("🟢 OPENING СОГЛАСОВАН");
  } else {
    console.log();
    console.log(
      `🔴 OPENING НЕ СОГЛАСОВАН. Осталось ${gap} шт.`
    );
  }

  // ============================================================
  // 10. ОСНОВНОЙ КАНДИДАТ
  // ============================================================

  line();
  console.log("10. КАНДИДАТ НА РАСХОЖДЕНИЕ");
  line();

  const missingSupply =
    registeredSupply - supplyMovement;

  if (missingSupply === 1) {
    console.log(
      "🟢 Обнаружена ровно 1 шт зарегистрированной поставки,"
    );

    console.log(
      "которая отсутствует в SUPPLY Movement."
    );

    console.log();

    console.log(
      `SupplyItem #${firstSupply.id}`
    );

    console.log(
      `Supply #${firstSupply.supplyId}`
    );

    console.log(
      `quantity=${firstSupply.quantity}`
    );

    console.log(
      `date=${firstSupply.supply.date.toISOString()}`
    );

    console.log(
      `cost=${firstSupply.cost} ₽`
    );

    console.log();

    console.log(
      "Это кандидат №1 на объяснение gap в 1 шт."
    );
  } else {
    console.log(
      `Supply gap = ${missingSupply} шт`
    );
  }

  // ============================================================
  // 11. BATCH #4
  // ============================================================

  line();
  console.log("11. HISTORICAL BATCH #4");
  line();

  const batch4WriteOff = movements.filter(
    (movement) =>
      movement.type === "WRITE_OFF" &&
      movement.comment?.includes("Партия №4")
  );

  if (batch4WriteOff.length === 0) {
    console.log(
      "🔴 Movement со списанием Партии №4 не найден."
    );
  } else {
    let totalBatch4WriteOff = 0;

    for (const movement of batch4WriteOff) {
      totalBatch4WriteOff += Math.abs(movement.quantity);

      console.log(
        `Movement #${movement.id} | ` +
          `${movement.createdAt.toISOString()} | ` +
          `quantity=${movement.quantity} | ` +
          `comment=${movement.comment ?? ""}`
      );
    }

    console.log();
    console.log(
      `BATCH #4 WRITE-OFF TOTAL = ${totalBatch4WriteOff} шт`
    );
  }

  // ============================================================
  // 12. FINAL
  // ============================================================

  line();
  console.log("12. FINAL RESULT");
  line();

  console.log(
    `Current stock: ${product.stock}`
  );

  console.log(
    `Registered supply: ${registeredSupply}`
  );

  console.log(
    `Supply Movement: ${supplyMovement}`
  );

  console.log(
    `Supply gap: ${registeredSupply - supplyMovement}`
  );

  console.log(
    `Opening by Movement: ${openingByMovement}`
  );

  console.log(
    `Opening by Business: ${openingByBusiness}`
  );

  console.log(
    `Opening gap: ${gap}`
  );

  console.log();

  if (gap === 0) {
    console.log(
      "🟢 OPENING STOCK СОГЛАСОВАН."
    );

    console.log(
      "Следующим шагом можно будет отдельно проверить"
    );

    console.log(
      "параметры исторического Batch #4."
    );
  } else {
    console.log(
      "🔴 OPENING STOCK ЕЩЁ НЕ СОГЛАСОВАН."
    );

    console.log(
      "Batch пока НЕ восстанавливаем."
    );
  }

  // ============================================================
  // 13. SAFETY CHECK
  // ============================================================

  line();
  console.log("13. SAFETY CHECK");
  line();

  const productAfter = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  console.log(
    `Product.stock: ${product.stock} -> ${productAfter?.stock}`
  );

  if (productAfter?.stock === product.stock) {
    console.log(
      "✅ Product.stock НЕ ИЗМЕНЁН"
    );
  } else {
    console.log(
      "🔴 Product.stock ИЗМЕНИЛСЯ"
    );
  }

  line();
  console.log("🏁 АУДИТ ЗАВЕРШЁН");
  line();
  console.log();
  console.log(
    "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ."
  );
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ AUDIT ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });