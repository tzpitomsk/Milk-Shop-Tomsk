import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toISOString();
}

function extractOrderId(comment: string | null | undefined): number | null {
  if (!comment) return null;

  const match = comment.match(/заказ(?:а)?\s*№\s*(\d+)/i);

  if (!match) return null;

  return Number(match[1]);
}

async function main() {
  console.log();
  line();
  console.log("🧀 ТВОРОГ — FINAL OPENING STOCK AUDIT");
  line();
  console.log();

  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  console.log(
    "Цель: окончательно проверить математическую реконструкцию " +
      "opening stock Творога перед восстановлением исторических Batch.",
  );

  // ============================================================
  // 1. PRODUCT
  // ============================================================

  console.log();
  line();
  console.log("1. PRODUCT");
  line();
  console.log();

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

  if (product.name !== PRODUCT_NAME) {
    console.log(
      `⚠️ Ожидалось название "${PRODUCT_NAME}", получено "${product.name}"`,
    );
  }

  // ============================================================
  // 2. SUPPLIES
  // ============================================================

  console.log();
  line();
  console.log("2. SUPPLIES");
  line();
  console.log();

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
  });

  supplyItems.sort(
    (a, b) =>
      new Date(a.supply.date).getTime() -
      new Date(b.supply.date).getTime(),
  );

  let totalSupplied = 0;

  for (const item of supplyItems) {
    totalSupplied += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `${date(item.supply.date)} | ` +
        `+${item.quantity} шт | ` +
        `cost=${money(item.cost)}`,
    );
  }

  console.log();
  console.log(`REGISTERED SUPPLY TOTAL: ${totalSupplied} шт`);

  // ============================================================
  // 3. BATCHES
  // ============================================================

  console.log();
  line();
  console.log("3. CURRENT BATCHES");
  line();
  console.log();

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
        `quantity=${batch.quantity} | ` +
        `cost=${money(batch.purchaseCost)} | ` +
        `received=${date(batch.receivedAt)} | ` +
        `expiry=${date(batch.expiryDate)} | ` +
        `status=${batch.status}`,
    );
  }

  console.log();
  console.log(`SUM CURRENT BATCH.quantity: ${currentBatchQuantity} шт`);
  console.log(`Product.stock: ${product.stock} шт`);

  if (currentBatchQuantity === product.stock) {
    console.log("🟢 Current Batch total = Product.stock");
  } else {
    console.log(
      `🔴 Current Batch total != Product.stock. Difference=${
        currentBatchQuantity - product.stock
      }`,
    );
  }

  // ============================================================
  // 4. CHECK BATCH #4
  // ============================================================

  console.log();
  line();
  console.log("4. HISTORICAL BATCH #4");
  line();
  console.log();

  const batch4 = await prisma.batch.findUnique({
    where: {
      id: 4,
    },
  });

  if (batch4) {
    console.log("🟢 Batch #4 существует");
    console.log(`quantity=${batch4.quantity}`);
    console.log(`cost=${money(batch4.purchaseCost)}`);
    console.log(`receivedAt=${date(batch4.receivedAt)}`);
    console.log(`expiryDate=${date(batch4.expiryDate)}`);
    console.log(`status=${batch4.status}`);
  } else {
    console.log("🔴 Batch #4 отсутствует в текущей БД");
    console.log(
      "Однако далее проверяем, существует ли исторический WRITE_OFF " +
        "с указанием Batch #4.",
    );
  }

  // ============================================================
  // 5. ORDERS
  // ============================================================

  console.log();
  line();
  console.log("5. CURRENT ORDERS");
  line();
  console.log();

  const orders = await prisma.order.findMany({
    include: {
      items: {
        where: {
          productId: PRODUCT_ID,
        },
        include: {
          ReturnBatch: true,
          batches: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  let grossOrderItems = 0;
  let returnedOrderItems = 0;
  let netOrderItems = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const returned = item.ReturnBatch.reduce(
        (sum: number, ret: { quantity: number }) =>
          sum + ret.quantity,
        0,
      );

      const net = Math.max(0, item.quantity - returned);

      grossOrderItems += item.quantity;
      returnedOrderItems += returned;
      netOrderItems += net;

      console.log(
        `Order #${order.id} | ` +
          `date=${date(order.date)} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${item.quantity} | ` +
          `returned=${returned} | ` +
          `net=${net} | ` +
          `status=${order.status}`,
      );
    }
  }

  console.log();
  console.log(`CURRENT ORDER GROSS: ${grossOrderItems} шт`);
  console.log(`CURRENT ORDER RETURN: ${returnedOrderItems} шт`);
  console.log(`CURRENT ORDER NET: ${netOrderItems} шт`);

  // ============================================================
  // 6. MOVEMENTS
  // ============================================================

  console.log();
  line();
  console.log("6. MOVEMENTS");
  line();
  console.log();

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

  const deletedOrderSaleMovements: Array<{
    movementId: number;
    orderId: number;
    quantity: number;
    createdAt: Date;
  }> = [];

  const existingOrderSaleMovements: Array<{
    movementId: number;
    orderId: number;
    quantity: number;
    createdAt: Date;
  }> = [];

  const deletedOrderReturnMovements: Array<{
    movementId: number;
    orderId: number;
    quantity: number;
    createdAt: Date;
  }> = [];

  const existingOrderReturnMovements: Array<{
    movementId: number;
    orderId: number;
    quantity: number;
    createdAt: Date;
  }> = [];

  let batch4WriteOff = 0;

  for (const movement of movements) {
    const quantity = movement.quantity;

    if (movement.type === "SUPPLY") {
      supplyMovement += quantity;
    } else if (movement.type === "SALE") {
      saleMovement += quantity;
    } else if (movement.type === "RETURN") {
      returnMovement += quantity;
    } else if (movement.type === "WRITE_OFF") {
      writeOffMovement += quantity;
    } else {
      otherMovement += quantity;
    }

    const orderId = extractOrderId(movement.comment);

    if (
      movement.type === "WRITE_OFF" &&
      movement.comment?.includes("Партия №4")
    ) {
      batch4WriteOff += Math.abs(quantity);
    }

    if (
      (movement.type === "SALE" || movement.type === "RETURN") &&
      orderId !== null
    ) {
      const orderExists = orders.some((order) => order.id === orderId);

      if (movement.type === "SALE") {
        if (orderExists) {
          existingOrderSaleMovements.push({
            movementId: movement.id,
            orderId,
            quantity,
            createdAt: movement.createdAt,
          });
        } else {
          deletedOrderSaleMovements.push({
            movementId: movement.id,
            orderId,
            quantity,
            createdAt: movement.createdAt,
          });
        }
      }

      if (movement.type === "RETURN") {
        if (orderExists) {
          existingOrderReturnMovements.push({
            movementId: movement.id,
            orderId,
            quantity,
            createdAt: movement.createdAt,
          });
        } else {
          deletedOrderReturnMovements.push({
            movementId: movement.id,
            orderId,
            quantity,
            createdAt: movement.createdAt,
          });
        }
      }
    }
  }

  console.log(`SUPPLY Movement: ${supplyMovement} шт`);
  console.log(`SALE Movement: ${saleMovement} шт`);
  console.log(`RETURN Movement: ${returnMovement} шт`);
  console.log(`WRITE_OFF Movement: ${writeOffMovement} шт`);
  console.log(`OTHER Movement: ${otherMovement} шт`);

  console.log();
  console.log(
    `SALE existing orders: ${Math.abs(
      existingOrderSaleMovements.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
    )} шт`,
  );

  console.log(
    `SALE deleted orders: ${Math.abs(
      deletedOrderSaleMovements.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
    )} шт`,
  );

  console.log(
    `RETURN existing orders: ${existingOrderReturnMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    )} шт`,
  );

  console.log(
    `RETURN deleted orders: ${deletedOrderReturnMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    )} шт`,
  );

  // ============================================================
  // 7. DELETED ORDER NET
  // ============================================================

  console.log();
  line();
  console.log("7. DELETED ORDER NET EFFECT");
  line();
  console.log();

  const deletedSales = Math.abs(
    deletedOrderSaleMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
  );

  const deletedReturns = deletedOrderReturnMovements.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  console.log(`Deleted order SALE: ${deletedSales} шт`);
  console.log(`Deleted order RETURN: ${deletedReturns} шт`);
  console.log(
    `Deleted order NET: ${deletedSales - deletedReturns} шт`,
  );

  if (deletedSales === deletedReturns) {
    console.log(
      "🟢 Удалённые заказы имеют нулевой NET-эффект.",
    );
  } else {
    console.log(
      `🔴 Удалённые заказы имеют ненулевой NET-эффект: ${
        deletedSales - deletedReturns
      } шт`,
    );
  }

  // ============================================================
  // 8. BATCH #4 WRITE-OFF
  // ============================================================

  console.log();
  line();
  console.log("8. BATCH #4 WRITE-OFF");
  line();
  console.log();

  console.log(`Batch #4 write-off: ${batch4WriteOff} шт`);

  if (batch4WriteOff === 26) {
    console.log(
      "🟢 Movement подтверждает списание ровно 26 шт Batch #4.",
    );
  } else {
    console.log(
      "🟠 Количество списания Batch #4 отличается от ожидаемых 26 шт.",
    );
  }

  // ============================================================
  // 9. EARLY SALES
  // ============================================================

  console.log();
  line();
  console.log("9. SALES BEFORE FIRST REGISTERED SUPPLY");
  line();
  console.log();

  let firstSupplyDate: Date | null = null;

  if (supplyItems.length > 0) {
    firstSupplyDate = new Date(supplyItems[0].supply.date);
  }

  let earlySales = 0;

  if (firstSupplyDate) {
    for (const order of orders) {
      const orderDate = new Date(order.date);

      if (orderDate >= firstSupplyDate) {
        continue;
      }

      for (const item of order.items) {
        const returned = item.ReturnBatch.reduce(
          (sum: number, ret: { quantity: number }) =>
            sum + ret.quantity,
          0,
        );

        const net = Math.max(0, item.quantity - returned);

        if (net > 0) {
          earlySales += net;

          console.log(
            `Order #${order.id} | ` +
              `date=${date(order.date)} | ` +
              `OrderItem #${item.id} | ` +
              `net=${net}`,
          );
        }
      }
    }
  }

  console.log();
  console.log(`EARLY NET SALES: ${earlySales} шт`);

  // ============================================================
  // 10. OPENING BALANCE
  // ============================================================

  console.log();
  line();
  console.log("10. FINAL OPENING BALANCE");
  line();
  console.log();

  const existingSales = Math.abs(
    existingOrderSaleMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
  );

  const existingReturns = existingOrderReturnMovements.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  /*
   * Opening stock is calculated from the surviving historical
   * business ledger:
   *
   * opening =
   * current stock
   * - registered supplies
   * + existing order sales
   * - existing order returns
   * + write-offs
   *
   * Deleted orders are deliberately excluded because their
   * sale/return pair should have zero final effect.
   */

  const openingByBusinessLedger =
    product.stock -
    totalSupplied +
    existingSales -
    existingReturns +
    Math.abs(writeOffMovement);

  console.log(`Current stock:              ${product.stock} шт`);
  console.log(`- Registered supplies:      ${totalSupplied} шт`);
  console.log(`+ Existing order sales:     ${existingSales} шт`);
  console.log(`- Existing order returns:   ${existingReturns} шт`);
  console.log(`+ Write-offs:               ${Math.abs(writeOffMovement)} шт`);
  console.log();

  console.log(
    `OPENING STOCK = ${openingByBusinessLedger} шт`,
  );

  // ============================================================
  // 11. CROSS CHECK
  // ============================================================

  console.log();
  line();
  console.log("11. CROSS CHECKS");
  line();
  console.log();

  const movementWithoutDeletedOrders =
    supplyMovement +
    existingOrderSaleMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ) +
    existingOrderReturnMovements.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ) +
    writeOffMovement +
    otherMovement;

  const openingByMovement =
    product.stock - movementWithoutDeletedOrders;

  console.log(
    `Opening by corrected Movement: ${openingByMovement} шт`,
  );

  console.log(
    `Opening by business ledger:     ${openingByBusinessLedger} шт`,
  );

  const openingDifference =
    openingByMovement - openingByBusinessLedger;

  console.log(`Difference: ${openingDifference} шт`);

  if (openingDifference === 0) {
    console.log(
      "🟢 Opening stock calculations agree.",
    );
  } else {
    console.log(
      "🔴 Opening stock calculations DO NOT agree.",
    );
  }

  // ============================================================
  // 12. BATCH #4 HYPOTHESIS
  // ============================================================

  console.log();
  line();
  console.log("12. BATCH #4 RECONSTRUCTION HYPOTHESIS");
  line();
  console.log();

  console.log(
    `Historical Batch #4 write-off: ${batch4WriteOff} шт`,
  );

  console.log(
    `Calculated opening stock: ${openingByBusinessLedger} шт`,
  );

  if (!batch4) {
    console.log();
    console.log(
      "Batch #4 отсутствует в БД, поэтому параметры Batch нельзя " +
        "считать полностью подтверждёнными.",
    );

    console.log();
    console.log("Предполагаемая историческая информация:");

    console.log(`quantity written off: ${batch4WriteOff} шт`);

    console.log(
      "cost: НЕ ПОДТВЕРЖДЕНО этим аудитом",
    );

    console.log(
      "receivedAt: НЕ ПОДТВЕРЖДЕНО этим аудитом",
    );

    console.log(
      "expiryDate: НЕ ПОДТВЕРЖДЕНО этим аудитом",
    );
  }

  // ============================================================
  // 13. EARLY SALE SAFETY
  // ============================================================

  console.log();
  line();
  console.log("13. EARLY SALE SAFETY");
  line();
  console.log();

  console.log(
    `Minimum stock required for early sales: ${earlySales} шт`,
  );

  console.log(
    `Calculated opening stock: ${openingByBusinessLedger} шт`,
  );

  if (openingByBusinessLedger >= earlySales) {
    console.log(
      "🟢 Opening stock достаточно для ранних продаж.",
    );
  } else {
    console.log(
      "🔴 Opening stock недостаточно для ранних продаж.",
    );
  }

  // ============================================================
  // 14. FINAL DECISION
  // ============================================================

  console.log();
  line();
  console.log("14. FINAL DECISION");
  line();
  console.log();

  const checks = {
    currentBatchMatchesStock:
      currentBatchQuantity === product.stock,

    deletedOrdersNetZero:
      deletedSales === deletedReturns,

    batch4WriteOffConfirmed:
      batch4WriteOff === 26,

    openingCalculationsAgree:
      openingDifference === 0,

    openingCoversEarlySales:
      openingByBusinessLedger >= earlySales,
  };

  console.log(
    `Current Batch = Product.stock: ${
      checks.currentBatchMatchesStock ? "PASS" : "FAIL"
    }`,
  );

  console.log(
    `Deleted orders NET = 0: ${
      checks.deletedOrdersNetZero ? "PASS" : "FAIL"
    }`,
  );

  console.log(
    `Batch #4 write-off = 26: ${
      checks.batch4WriteOffConfirmed ? "PASS" : "FAIL"
    }`,
  );

  console.log(
    `Opening calculations agree: ${
      checks.openingCalculationsAgree ? "PASS" : "FAIL"
    }`,
  );

  console.log(
    `Opening covers early sales: ${
      checks.openingCoversEarlySales ? "PASS" : "FAIL"
    }`,
  );

  const allChecksPassed = Object.values(checks).every(Boolean);

  console.log();

  if (allChecksPassed) {
    console.log(
      "🟢 FINAL AUDIT: МАТЕМАТИЧЕСКАЯ МОДЕЛЬ СОГЛАСОВАНА.",
    );
    console.log();
    console.log(
      "⚠️ Это ещё НЕ разрешение автоматически менять БД.",
    );
    console.log(
      "Следующим шагом нужно отдельно определить происхождение " +
        "Batch #4: cost / receivedAt / expiryDate.",
    );
  } else {
    console.log(
      "🔴 FINAL AUDIT: МОДЕЛЬ ЕЩЁ НЕ СОГЛАСОВАНА.",
    );
    console.log(
      "❗ Никакое восстановление Batch пока выполнять нельзя.",
    );
  }

  // ============================================================
  // 15. SAFETY CHECK
  // ============================================================

  console.log();
  line();
  console.log("15. SAFETY CHECK");
  line();
  console.log();

  const productAfter = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!productAfter) {
    throw new Error(
      "Product не найден во время финальной проверки",
    );
  }

  console.log(
    `Product.stock: ${product.stock} -> ${productAfter.stock}`,
  );

  if (productAfter.stock !== product.stock) {
    throw new Error(
      "❌ Product.stock неожиданно изменился",
    );
  }

  console.log("✅ Product.stock не изменился");

  console.log();
  line();
  console.log("🏁 FINAL AUDIT ЗАВЕРШЁН");
  line();
  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
  console.log();
}

main()
  .catch((error) => {
    console.error();
    line();
    console.error("❌ ОШИБКА");
    line();
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });