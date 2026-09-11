import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toISOString();
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

async function main() {
  console.log();
  line();
  console.log(`🧀 ${PRODUCT_NAME} — АУДИТ УДАЛЁННЫХ ЗАКАЗОВ И BATCH #4`);
  line();
  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  // ============================================================
  // 1. PRODUCT
  // ============================================================

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
  console.log(`current stock=${product.stock} шт`);

  // ============================================================
  // 2. ALL BATCHES / SEARCH BATCH #4
  // ============================================================

  console.log();
  line();
  console.log("2. BATCH #4");
  line();
  console.log();

  const batch4 = await prisma.batch.findUnique({
    where: {
      id: 4,
    },
  });

  if (!batch4) {
    console.log("🔴 Batch #4 НЕ СУЩЕСТВУЕТ В ТЕКУЩЕЙ БД.");
  } else {
    console.log(`Batch #4 существует`);
    console.log(`productId=${batch4.productId}`);
    console.log(`quantity=${batch4.quantity}`);
    console.log(`purchaseCost=${money(batch4.purchaseCost)}`);
    console.log(`receivedAt=${date(batch4.receivedAt)}`);
    console.log(`expiryDate=${date(batch4.expiryDate)}`);
    console.log(`status=${batch4.status}`);
  }

  // ============================================================
  // 3. ALL BATCHES OF PRODUCT
  // ============================================================

  console.log();
  line();
  console.log("3. ВСЕ ТЕКУЩИЕ BATCH ТВОРОГА");
  line();
  console.log();

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      id: "asc",
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
  console.log(`SUM Batch.quantity=${currentBatchQuantity} шт`);
  console.log(`Product.stock=${product.stock} шт`);

  if (currentBatchQuantity === product.stock) {
    console.log("🟢 Batch.quantity совпадает с Product.stock");
  } else {
    console.log(
      `🔴 Batch.quantity НЕ совпадает с Product.stock: ` +
        `${currentBatchQuantity} != ${product.stock}`,
    );
  }

  // ============================================================
  // 4. SUPPLIES BEFORE / AROUND BATCH #4
  // ============================================================

  console.log();
  line();
  console.log("4. ПОСТАВКИ ТВОРОГА");
  line();
  console.log();

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  let totalSupplied = 0;

  for (const item of supplyItems) {
    totalSupplied += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `date=${date(item.supply.date)} | ` +
        `quantity=${item.quantity} | ` +
        `cost=${money(item.cost)}`,
    );
  }

  console.log();
  console.log(`Всего зарегистрировано поставок: ${totalSupplied} шт`);

  // ============================================================
  // 5. MOVEMENT #85
  // ============================================================

  console.log();
  line();
  console.log("5. MOVEMENT #85");
  line();
  console.log();

  const movement85 = await prisma.movement.findUnique({
    where: {
      id: 85,
    },
  });

  if (!movement85) {
    console.log("🔴 Movement #85 не найден.");
  } else {
    console.log(`Movement #${movement85.id}`);
    console.log(`productId=${movement85.productId}`);
    console.log(`type=${movement85.type}`);
    console.log(`quantity=${movement85.quantity}`);
    console.log(`createdAt=${date(movement85.createdAt)}`);
    console.log(`comment=${movement85.comment ?? "—"}`);
  }

  // ============================================================
  // 6. ALL WRITE-OFF MOVEMENTS
  // ============================================================

  console.log();
  line();
  console.log("6. ВСЕ WRITE_OFF ТВОРОГА");
  line();
  console.log();

  const writeOffs = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      type: "WRITE_OFF",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let totalWriteOff = 0;

  for (const movement of writeOffs) {
    totalWriteOff += Math.abs(movement.quantity);

    console.log(
      `Movement #${movement.id} | ` +
        `${date(movement.createdAt)} | ` +
        `quantity=${movement.quantity} | ` +
        `comment=${movement.comment ?? "—"}`,
    );
  }

  console.log();
  console.log(`Всего списано по Movement: ${totalWriteOff} шт`);

  // ============================================================
  // 7. DELETED ORDER REFERENCES IN MOVEMENT
  // ============================================================

  console.log();
  line();
  console.log("7. ПРОДАЖИ ИЗ УДАЛЁННЫХ ЗАКАЗОВ");
  line();
  console.log();

  const saleMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      type: "SALE",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let saleExistingOrders = 0;
  let saleDeletedOrders = 0;

  const deletedSaleMovements: Array<{
    movementId: number;
    orderId: number;
    quantity: number;
    createdAt: Date;
    comment: string | null;
  }> = [];

  for (const movement of saleMovements) {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (!match) {
      console.log(
        `🟠 Movement #${movement.id} | ` +
          `SALE=${movement.quantity} | ` +
          `Order ID не удалось определить | ` +
          `${movement.comment ?? "—"}`,
      );
      continue;
    }

    const orderId = Number(match[1]);

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      select: {
        id: true,
      },
    });

    if (order) {
      saleExistingOrders += Math.abs(movement.quantity);

      console.log(
        `🟢 Movement #${movement.id} | ` +
          `Order #${orderId} существует | ` +
          `quantity=${movement.quantity}`,
      );
    } else {
      saleDeletedOrders += Math.abs(movement.quantity);

      deletedSaleMovements.push({
        movementId: movement.id,
        orderId,
        quantity: movement.quantity,
        createdAt: movement.createdAt,
        comment: movement.comment,
      });

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `Order #${orderId} УДАЛЁН | ` +
          `quantity=${movement.quantity} | ` +
          `${date(movement.createdAt)}`,
      );
    }
  }

  console.log();
  console.log(`SALE existing orders: ${saleExistingOrders} шт`);
  console.log(`SALE deleted orders: ${saleDeletedOrders} шт`);

  // ============================================================
  // 8. RETURN REFERENCES IN MOVEMENT
  // ============================================================

  console.log();
  line();
  console.log("8. RETURN ИЗ УДАЛЁННЫХ ЗАКАЗОВ");
  line();
  console.log();

  const returnMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      type: "RETURN",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let returnExistingOrders = 0;
  let returnDeletedOrders = 0;

  for (const movement of returnMovements) {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (!match) {
      console.log(
        `🟠 Movement #${movement.id} | ` +
          `RETURN=${movement.quantity} | ` +
          `Order ID не определён | ` +
          `${movement.comment ?? "—"}`,
      );
      continue;
    }

    const orderId = Number(match[1]);

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      select: {
        id: true,
      },
    });

    if (order) {
      returnExistingOrders += movement.quantity;

      console.log(
        `🟢 Movement #${movement.id} | ` +
          `Order #${orderId} существует | ` +
          `RETURN=${movement.quantity}`,
      );
    } else {
      returnDeletedOrders += movement.quantity;

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `Order #${orderId} УДАЛЁН | ` +
          `RETURN=${movement.quantity} | ` +
          `${date(movement.createdAt)}`,
      );
    }
  }

  console.log();
  console.log(
    `RETURN existing orders: ${returnExistingOrders} шт`,
  );
  console.log(
    `RETURN deleted orders: ${returnDeletedOrders} шт`,
  );

  // ============================================================
  // 9. EXISTING ORDERS — EARLY HISTORY
  // ============================================================

  console.log();
  line();
  console.log("9. РАННИЕ ПРОДАЖИ ДО ПЕРВОЙ ПОСТАВКИ");
  line();
  console.log();

  const orders = await prisma.order.findMany({
    where: {
      items: {
        some: {
          productId: PRODUCT_ID,
        },
      },
    },
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

  const firstSupplyDate =
    supplyItems.length > 0
      ? new Date(supplyItems[0].supply.date)
      : null;

  let earlyNetSales = 0;

  for (const order of orders) {
    if (!firstSupplyDate) {
      break;
    }

    if (new Date(order.date) >= firstSupplyDate) {
      break;
    }

    for (const item of order.items) {
      const returned = item.ReturnBatch.reduce(
        (sum, ret) => sum + ret.quantity,
        0,
      );

      const net = Math.max(0, item.quantity - returned);

      earlyNetSales += net;

      console.log(
        `Order #${order.id} | ` +
          `date=${date(order.date)} | ` +
          `OrderItem #${item.id} | ` +
          `gross=${item.quantity} | ` +
          `returned=${returned} | ` +
          `net=${net}`,
      );
    }
  }

  console.log();
  console.log(
    `NET продаж до первой поставки: ${earlyNetSales} шт`,
  );

  // ============================================================
  // 10. ORDERBATCH FOR EXISTING ORDERS
  // ============================================================

  console.log();
  line();
  console.log("10. ORDERBATCH");
  line();
  console.log();

  let orderBatchExisting = 0;
  let orderBatchDeleted = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const linked = item.batches.reduce(
        (sum, link) => sum + link.quantity,
        0,
      );

      if (linked === 0) {
        continue;
      }

      const returned = item.ReturnBatch.reduce(
        (sum, ret) => sum + ret.quantity,
        0,
      );

      const net = Math.max(0, item.quantity - returned);

      if (new Date(order.date) >= new Date("2026-08-12T00:00:00.000Z")) {
        orderBatchDeleted += linked;
      } else {
        orderBatchExisting += linked;
      }

      console.log(
        `Order #${order.id} | ` +
          `date=${date(order.date)} | ` +
          `OrderItem #${item.id} | ` +
          `OrderBatch=${linked} | ` +
          `net=${net}`,
      );
    }
  }

  console.log();
  console.log(
    `OrderBatch до 12 августа: ${orderBatchExisting} шт`,
  );
  console.log(
    `OrderBatch после 12 августа: ${orderBatchDeleted} шт`,
  );

  // ============================================================
  // 11. MATHEMATICAL RECONCILIATION
  // ============================================================

  console.log();
  line();
  console.log("11. МАТЕМАТИЧЕСКАЯ СВЕРКА");
  line();
  console.log();

  const saleMovementTotal = saleMovements.reduce(
    (sum, movement) => sum + Math.abs(movement.quantity),
    0,
  );

  const returnMovementTotal = returnMovements.reduce(
    (sum, movement) => sum + movement.quantity,
    0,
  );

  console.log(`Все SALE Movement: ${saleMovementTotal} шт`);
  console.log(`Из них deleted orders: ${saleDeletedOrders} шт`);
  console.log(
    `SALE Movement существующих заказов: ` +
      `${saleMovementTotal - saleDeletedOrders} шт`,
  );

  console.log();

  console.log(`Все RETURN Movement: ${returnMovementTotal} шт`);
  console.log(`Из них deleted orders: ${returnDeletedOrders} шт`);
  console.log(
    `RETURN Movement существующих заказов: ` +
      `${returnMovementTotal - returnDeletedOrders} шт`,
  );

  console.log();

  const correctedSaleMovement =
    saleMovementTotal - saleDeletedOrders;

  const correctedReturnMovement =
    returnMovementTotal - returnDeletedOrders;

  const correctedNetMovement =
    correctedSaleMovement - correctedReturnMovement;

  console.log(
    `Исправленный SALE после исключения deleted orders: ` +
      `${correctedSaleMovement} шт`,
  );

  console.log(
    `Исправленный RETURN после исключения deleted orders: ` +
      `${correctedReturnMovement} шт`,
  );

  console.log(
    `Исправленный NET продажи: ${correctedNetMovement} шт`,
  );

  // ============================================================
  // 12. OPENING STOCK FROM CORRECTED MOVEMENT
  // ============================================================

  console.log();
  line();
  console.log("12. OPENING STOCK ПО ИСПРАВЛЕННОМУ MOVEMENT");
  line();
  console.log();

  const correctedMovementNet =
    50 -
    correctedSaleMovement +
    correctedReturnMovement -
    totalWriteOff;

  const correctedOpening =
    product.stock - correctedMovementNet;

  console.log(
    `SUPPLY Movement: 50 шт`,
  );

  console.log(
    `SALE после удаления исторических заказов: ` +
      `-${correctedSaleMovement} шт`,
  );

  console.log(
    `RETURN после удаления исторических заказов: ` +
      `+${correctedReturnMovement} шт`,
  );

  console.log(
    `WRITE_OFF: -${totalWriteOff} шт`,
  );

  console.log();

  console.log(
    `Исправленный NET Movement: ${correctedMovementNet} шт`,
  );

  console.log(
    `Current Product.stock: ${product.stock} шт`,
  );

  console.log(
    `Расчётный opening stock: ${correctedOpening} шт`,
  );

  // ============================================================
  // 13. BATCH #4 HYPOTHESIS
  // ============================================================

  console.log();
  line();
  console.log("13. ГИПОТЕЗА BATCH #4");
  line();
  console.log();

  const batch4WriteOff = writeOffs.find(
    (movement) =>
      movement.comment?.includes("Партия №4") &&
      movement.quantity < 0,
  );

  if (batch4WriteOff) {
    console.log(
      `Найдено списание Batch #4: Movement #${batch4WriteOff.id}`,
    );

    console.log(
      `Количество списания: ${Math.abs(batch4WriteOff.quantity)} шт`,
    );

    console.log(
      `Дата списания: ${date(batch4WriteOff.createdAt)}`,
    );

    console.log(
      `Комментарий: ${batch4WriteOff.comment ?? "—"}`,
    );

    console.log();

    if (!batch4) {
      console.log(
        "🔴 Batch #4 отсутствует, но Movement содержит " +
          "списание этой партии.",
      );

      console.log(
        "Это означает, что историческая информация о Batch " +
          "была удалена/утрачена, а Movement сохранился.",
      );
    }

    console.log();

    console.log(
      `Batch #4 write-off quantity: ` +
        `${Math.abs(batch4WriteOff.quantity)} шт`,
    );

    console.log(
      `Corrected opening stock: ${correctedOpening} шт`,
    );

    console.log(
      `Difference: ` +
        `${correctedOpening - Math.abs(batch4WriteOff.quantity)} шт`,
    );
  } else {
    console.log(
      "🔴 Movement со ссылкой на Batch #4 не найден.",
    );
  }

  // ============================================================
  // 14. FINAL CONCLUSION
  // ============================================================

  console.log();
  line();
  console.log("14. ИТОГ");
  line();
  console.log();

  console.log(
    `Current stock: ${product.stock} шт`,
  );

  console.log(
    `Supply registered: ${totalSupplied} шт`,
  );

  console.log(
    `SALE Movement total: ${saleMovementTotal} шт`,
  );

  console.log(
    `SALE from deleted orders: ${saleDeletedOrders} шт`,
  );

  console.log(
    `RETURN Movement total: ${returnMovementTotal} шт`,
  );

  console.log(
    `RETURN from deleted orders: ${returnDeletedOrders} шт`,
  );

  console.log(
    `WRITE_OFF total: ${totalWriteOff} шт`,
  );

  console.log(
    `Early sales before first supply: ${earlyNetSales} шт`,
  );

  console.log();

  console.log(
    `Calculated opening stock after excluding deleted orders: ` +
      `${correctedOpening} шт`,
  );

  console.log();

  if (batch4WriteOff && !batch4) {
    console.log(
      "🔴 Batch #4 отсутствует, но её списание сохранилось в Movement.",
    );
  }

  if (saleDeletedOrders > 0) {
    console.log(
      "🟠 В Movement сохранены продажи удалённых заказов.",
    );
  }

  if (returnDeletedOrders > 0) {
    console.log(
      "🟠 В Movement сохранены возвраты удалённых заказов.",
    );
  }

  if (earlyNetSales > 0) {
    console.log(
      "🟠 До первой зарегистрированной поставки уже были продажи.",
    );
  }

  console.log();

  console.log(
    "⚠️ Этот аудит НЕ определяет автоматически, " +
      "какие Batch нужно создавать.",
  );

  console.log(
    "⚠️ База данных НЕ изменялась.",
  );

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
      "Product не найден при финальной проверке",
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
  console.log("🏁 АУДИТ ЗАВЕРШЁН");
  line();
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