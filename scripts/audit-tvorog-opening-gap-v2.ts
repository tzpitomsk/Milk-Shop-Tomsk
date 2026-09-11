import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2; // Творог

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function section(title: string) {
  console.log();
  line();
  console.log(title);
  line();
}

async function main() {
  console.log();
  line();
  console.log("🧀 ТВОРОГ — OPENING GAP AUDIT V2");
  line();
  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();
  console.log(
    "Цель: точно разложить opening stock по хронологии, OrderItem, Movement и Batch."
  );

  // ============================================================
  // 1. PRODUCT
  // ============================================================

  section("1. PRODUCT");

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
  // 2. SUPPLIES
  // ============================================================

  section("2. SUPPLIES");

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

  const firstSupplyItem = supplyItems[0];

  if (!firstSupplyItem) {
    throw new Error("У Творога нет ни одной SupplyItem");
  }

  const firstSupplyDate = firstSupplyItem.supply.date;

  console.log(
    `FIRST REGISTERED SUPPLY = ${firstSupplyDate.toISOString()}`
  );

  // ============================================================
  // 3. CURRENT BATCHES
  // ============================================================

  section("3. CURRENT BATCHES");

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      receivedAt: "asc",
    },
  });

  let currentBatchQuantity = 0;

  for (const batch of batches) {
    currentBatchQuantity += batch.quantity;

    console.log(
      `Batch #${batch.id} | ` +
        `qty=${batch.quantity} | ` +
        `cost=${batch.purchaseCost} ₽ | ` +
        `received=${batch.receivedAt.toISOString()} | ` +
        `expiry=${batch.expiryDate.toISOString()} | ` +
        `status=${batch.status}`
    );
  }

  console.log();
  console.log(`CURRENT BATCH QUANTITY = ${currentBatchQuantity} шт`);
  console.log(`PRODUCT.stock = ${product.stock} шт`);

  // ============================================================
  // 4. ALL CURRENT ORDER ITEMS
  // ============================================================

  section("4. CURRENT ORDER ITEMS — ХРОНОЛОГИЯ");

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
      ReturnBatch: true,
    },
    orderBy: {
      order: {
        date: "asc",
      },
    },
  });

  let grossTotal = 0;
  let returnedTotal = 0;
  let netTotal = 0;

  for (const item of orderItems) {
    const gross = item.quantity;
    const returned = item.returned;
    const net = gross - returned;

    grossTotal += gross;
    returnedTotal += returned;
    netTotal += net;

    const early = item.order.date < firstSupplyDate;

    console.log(
      `${early ? "🔴 EARLY" : "🟢"} ` +
        `Order #${item.orderId} | ` +
        `date=${item.order.date.toISOString()} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${gross} | ` +
        `returned=${returned} | ` +
        `net=${net} | ` +
        `status=${item.order.status}`
    );

    if (item.batches.length === 0) {
      console.log("   OrderBatch: НЕТ");
    } else {
      for (const ob of item.batches) {
        console.log(
          `   OrderBatch #${ob.id} | ` +
            `batch=${ob.batchId} | ` +
            `qty=${ob.quantity} | ` +
            `cost=${ob.purchaseCost}`
        );
      }
    }

    if (item.ReturnBatch.length === 0) {
      console.log("   ReturnBatch: НЕТ");
    } else {
      for (const rb of item.ReturnBatch) {
        console.log(
          `   ReturnBatch #${rb.id} | ` +
            `batch=${rb.batchId} | ` +
            `qty=${rb.quantity}`
        );
      }
    }
  }

  console.log();
  console.log(`ORDER GROSS = ${grossTotal} шт`);
  console.log(`ORDER RETURN = ${returnedTotal} шт`);
  console.log(`ORDER NET = ${netTotal} шт`);

  // ============================================================
  // 5. MOVEMENTS
  // ============================================================

  section("5. MOVEMENTS");

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      createdAt: "asc",
    },
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
    }
  }

  console.log(`SUPPLY    = ${supplyMovement}`);
  console.log(`SALE      = ${saleMovement}`);
  console.log(`RETURN    = ${returnMovement}`);
  console.log(`WRITE_OFF = ${writeOffMovement}`);
  console.log(`OTHER     = ${otherMovement}`);

  const movementNet =
    supplyMovement +
    saleMovement +
    returnMovement +
    writeOffMovement +
    otherMovement;

  console.log();
  console.log(`NET MOVEMENT = ${movementNet}`);

  // ============================================================
  // 6. SALE MOVEMENT MAP
  // ============================================================

  section("6. SALE MOVEMENT → ORDER");

  const saleMovements = movements.filter(
    (movement) => movement.type === "SALE"
  );

  let saleExisting = 0;
  let saleDeleted = 0;

  for (const movement of saleMovements) {
    const comment = movement.comment ?? "";

    const match = comment.match(/Заказ №(\d+)/);

    const orderId = match ? Number(match[1]) : null;

    if (!orderId) {
      console.log(
        `🟠 Movement #${movement.id} | ` +
          `SALE=${Math.abs(movement.quantity)} | ` +
          `Order ID НЕ ОПРЕДЕЛЁН | ` +
          `${comment}`
      );

      continue;
    }

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });

    if (order) {
      saleExisting += Math.abs(movement.quantity);

      console.log(
        `🟢 Movement #${movement.id} | ` +
          `Order #${orderId} существует | ` +
          `SALE=${Math.abs(movement.quantity)}`
      );
    } else {
      saleDeleted += Math.abs(movement.quantity);

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `Order #${orderId} УДАЛЁН | ` +
          `SALE=${Math.abs(movement.quantity)}`
      );
    }
  }

  console.log();
  console.log(`SALE EXISTING = ${saleExisting} шт`);
  console.log(`SALE DELETED = ${saleDeleted} шт`);

  // ============================================================
  // 7. CURRENT ORDER → SALE MOVEMENT
  // ============================================================

  section("7. CURRENT ORDER → EXPECTED SALE MOVEMENT");

  let matchedCurrentSales = 0;
  let missingCurrentSales = 0;

  for (const item of orderItems) {
    const expected = item.quantity;

    const relatedMovements = saleMovements.filter((movement) => {
      const comment = movement.comment ?? "";
      return comment.includes(`Заказ №${item.orderId}`);
    });

    const actual = relatedMovements.reduce(
      (sum, movement) => sum + Math.abs(movement.quantity),
      0
    );

    const missing = expected - actual;

    if (missing > 0) {
      missingCurrentSales += missing;

      console.log(
        `🔴 Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${expected} | ` +
          `SALE Movement=${actual} | ` +
          `MISSING=${missing}`
      );
    } else {
      matchedCurrentSales += expected;

      console.log(
        `🟢 Order #${item.orderId} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${expected} | ` +
          `SALE Movement=${actual} | OK`
      );
    }
  }

  console.log();
  console.log(`MATCHED CURRENT SALE = ${matchedCurrentSales} шт`);
  console.log(`MISSING CURRENT SALE = ${missingCurrentSales} шт`);

  // ============================================================
  // 8. MISSING SALES BY PERIOD
  // ============================================================

  section("8. MISSING SALE — ПО ХРОНОЛОГИИ");

  let missingBeforeSupply = 0;
  let missingAfterSupply = 0;

  for (const item of orderItems) {
    const relatedMovements = saleMovements.filter((movement) => {
      const comment = movement.comment ?? "";
      return comment.includes(`Заказ №${item.orderId}`);
    });

    const actual = relatedMovements.reduce(
      (sum, movement) => sum + Math.abs(movement.quantity),
      0
    );

    const missing = item.quantity - actual;

    if (missing <= 0) continue;

    if (item.order.date < firstSupplyDate) {
      missingBeforeSupply += missing;

      console.log(
        `🔴 ДО ПЕРВОЙ ПОСТАВКИ | ` +
          `Order #${item.orderId} | ` +
          `date=${item.order.date.toISOString()} | ` +
          `missing=${missing}`
      );
    } else {
      missingAfterSupply += missing;

      console.log(
        `🟠 ПОСЛЕ ПЕРВОЙ ПОСТАВКИ | ` +
          `Order #${item.orderId} | ` +
          `date=${item.order.date.toISOString()} | ` +
          `missing=${missing}`
      );
    }
  }

  console.log();
  console.log(`MISSING BEFORE FIRST SUPPLY = ${missingBeforeSupply} шт`);
  console.log(`MISSING AFTER FIRST SUPPLY = ${missingAfterSupply} шт`);

  // ============================================================
  // 9. ORDER BATCH COVERAGE
  // ============================================================

  section("9. ORDERBATCH COVERAGE");

  let orderBatchQuantity = 0;
  let orderBatchReturned = 0;

  for (const item of orderItems) {
    const batchQty = item.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const returnQty = item.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0
    );

    orderBatchQuantity += batchQty;
    orderBatchReturned += returnQty;

    console.log(
      `Order #${item.orderId} | ` +
        `OrderItem #${item.id} | ` +
        `gross=${item.quantity} | ` +
        `OrderBatch=${batchQty} | ` +
        `ReturnBatch=${returnQty} | ` +
        `net=${item.quantity - item.returned}`
    );
  }

  console.log();
  console.log(`ORDERBATCH TOTAL = ${orderBatchQuantity} шт`);
  console.log(`RETURNBATCH TOTAL = ${orderBatchReturned} шт`);

  // ============================================================
  // 10. WRITE OFFS
  // ============================================================

  section("10. WRITE-OFFS");

  const writeOffs = movements.filter(
    (movement) => movement.type === "WRITE_OFF"
  );

  let totalWriteOff = 0;

  for (const movement of writeOffs) {
    const quantity = Math.abs(movement.quantity);

    totalWriteOff += quantity;

    console.log(
      `Movement #${movement.id} | ` +
        `date=${movement.createdAt.toISOString()} | ` +
        `qty=${quantity} | ` +
        `${movement.comment ?? ""}`
    );
  }

  console.log();
  console.log(`TOTAL WRITE-OFF = ${totalWriteOff} шт`);

  // ============================================================
  // 11. BATCH #4
  // ============================================================

  section("11. HISTORICAL BATCH #4");

  const batch4 = await prisma.batch.findUnique({
    where: {
      id: 4,
    },
  });

  if (batch4) {
    console.log(
      `🟢 Batch #4 существует | ` +
        `qty=${batch4.quantity} | ` +
        `cost=${batch4.purchaseCost} | ` +
        `received=${batch4.receivedAt.toISOString()} | ` +
        `expiry=${batch4.expiryDate.toISOString()}`
    );
  } else {
    console.log("🔴 Batch #4 отсутствует в текущей БД");
  }

  const batch4Movements = movements.filter((movement) =>
    (movement.comment ?? "").includes("Партия №4")
  );

  let batch4WriteOff = 0;

  for (const movement of batch4Movements) {
    if (movement.type === "WRITE_OFF") {
      batch4WriteOff += Math.abs(movement.quantity);

      console.log(
        `Movement #${movement.id} | ` +
          `type=${movement.type} | ` +
          `qty=${Math.abs(movement.quantity)} | ` +
          `date=${movement.createdAt.toISOString()}`
      );
    }
  }

  console.log();
  console.log(`BATCH #4 WRITE-OFF = ${batch4WriteOff} шт`);

  // ============================================================
  // 12. EXACT BALANCE — MOVEMENT
  // ============================================================

  section("12. BALANCE BY MOVEMENT");

  const openingByMovement =
    product.stock -
    supplyMovement -
    saleMovement -
    returnMovement -
    writeOffMovement -
    otherMovement;

  console.log(`Current stock = ${product.stock}`);
  console.log(`SUPPLY = ${supplyMovement}`);
  console.log(`SALE = ${saleMovement}`);
  console.log(`RETURN = ${returnMovement}`);
  console.log(`WRITE_OFF = ${writeOffMovement}`);
  console.log(`OTHER = ${otherMovement}`);
  console.log();
  console.log(`OPENING BY MOVEMENT = ${openingByMovement} шт`);

  // ============================================================
  // 13. BALANCE — BUSINESS LEDGER
  // ============================================================

  section("13. BALANCE BY BUSINESS LEDGER");

  const openingByBusiness =
    product.stock -
    registeredSupply +
    grossTotal -
    returnedTotal +
    totalWriteOff;

  console.log(`Current stock = ${product.stock}`);
  console.log(`Registered supply = ${registeredSupply}`);
  console.log(`Gross orders = ${grossTotal}`);
  console.log(`Returns = ${returnedTotal}`);
  console.log(`Write-offs = ${totalWriteOff}`);
  console.log();
  console.log(`OPENING BY BUSINESS = ${openingByBusiness} шт`);

  // ============================================================
  // 14. BALANCE USING EXISTING SALE MOVEMENTS
  // ============================================================

  section("14. BALANCE USING EXISTING ORDER MOVEMENTS");

  const correctedSale =
    saleExisting;

  const correctedReturn = returnMovement;

  const openingUsingExistingMovements =
    product.stock -
    supplyMovement -
    correctedSale -
    correctedReturn -
    writeOffMovement -
    otherMovement;

  console.log(`Current stock = ${product.stock}`);
  console.log(`SUPPLY Movement = ${supplyMovement}`);
  console.log(`Existing SALE Movement = ${correctedSale}`);
  console.log(`RETURN Movement = ${correctedReturn}`);
  console.log(`WRITE_OFF = ${writeOffMovement}`);
  console.log();
  console.log(
    `OPENING USING EXISTING ORDER MOVEMENTS = ${openingUsingExistingMovements} шт`
  );

  // ============================================================
  // 15. THEORETICAL MISSING MOVEMENTS
  // ============================================================

  section("15. THEORETICAL MISSING MOVEMENTS");

  console.log(
    `Missing SALE Movement = ${missingCurrentSales} шт`
  );

  console.log(
    `Missing SUPPLY Movement = ${
      registeredSupply - supplyMovement
    } шт`
  );

  console.log(
    `Early missing SALE = ${missingBeforeSupply} шт`
  );

  console.log(
    `Post-supply missing SALE = ${missingAfterSupply} шт`
  );

  // ============================================================
  // 16. MATHEMATICAL TEST
  // ============================================================

  section("16. MATHEMATICAL TEST");

  const missingSupply =
    registeredSupply - supplyMovement;

  const expectedMovementCorrection =
    missingSupply - missingCurrentSales;

  const movementOpeningCorrected =
    openingByMovement + expectedMovementCorrection;

  console.log(
    `Opening by Movement = ${openingByMovement}`
  );

  console.log(
    `Missing supply = +${missingSupply}`
  );

  console.log(
    `Missing sale = -${missingCurrentSales}`
  );

  console.log(
    `Expected correction = ${expectedMovementCorrection}`
  );

  console.log(
    `Corrected opening = ${movementOpeningCorrected}`
  );

  console.log();
  console.log(
    `Business opening = ${openingByBusiness}`
  );

  console.log(
    `Difference after correction = ${
      movementOpeningCorrected - openingByBusiness
    }`
  );

  // ============================================================
  // 17. FINAL INTERPRETATION
  // ============================================================

  section("17. FINAL INTERPRETATION");

  if (
    movementOpeningCorrected === openingByBusiness
  ) {
    console.log(
      "🟢 После учёта отсутствующих Movement обе модели математически сходятся."
    );
  } else {
    console.log(
      "🔴 Даже после учёта missing SALE/SUPPLY Movement модели НЕ сходятся."
    );
  }

  console.log();

  if (missingBeforeSupply > 0) {
    console.log(
      `🟠 Есть ${missingBeforeSupply} шт продаж ДО первой зарегистрированной поставки.`
    );
  } else {
    console.log(
      "🟢 Продаж до первой зарегистрированной поставки нет."
    );
  }

  console.log();

  if (batch4WriteOff > 0) {
    console.log(
      `🟠 Batch #4 подтверждается историческим WRITE_OFF на ${batch4WriteOff} шт.`
    );
  } else {
    console.log(
      "🔴 WRITE_OFF Batch #4 не найден."
    );
  }

  console.log();

  console.log(
    "⚠️ Batch пока НЕ восстанавливаем."
  );

  console.log(
    "⚠️ Этот скрипт только анализирует данные."
  );

  // ============================================================
  // 18. SAFETY
  // ============================================================

  section("18. SAFETY CHECK");

  const productAfter = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  console.log(
    `Product.stock: ${product.stock} -> ${productAfter?.stock}`
  );

  if (productAfter?.stock === product.stock) {
    console.log("✅ Product.stock НЕ ИЗМЕНЁН");
  } else {
    console.log("🔴 ВНИМАНИЕ: Product.stock изменился!");
  }

  console.log();
  line();
  console.log("🏁 AUDIT V2 ЗАВЕРШЁН");
  line();
  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
}

main()
  .catch((error) => {
    console.error();
    console.error("🔴 ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });