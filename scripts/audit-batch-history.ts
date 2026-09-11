import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("========================================");
  console.log("🔎 ДЕТАЛЬНЫЙ АУДИТ ИСТОРИИ ПАРТИЙ");
  console.log("========================================");
  console.log();
  console.log("⚠️ ТОЛЬКО ДИАГНОСТИКА");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  await prisma.$connect();

  console.log("✅ Prisma работает");
  console.log();

  // ============================================================
  // ВСЕ ПАРТИИ
  // ============================================================

  const batches = await prisma.batch.findMany({
    orderBy: [
      {
        productId: "asc",
      },
      {
        expiryDate: "asc",
      },
      {
        receivedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    include: {
      product: true,

      orderBatches: {
        orderBy: {
          id: "asc",
        },
        include: {
          orderItem: {
            include: {
              order: true,
              product: true,
            },
          },
        },
      },

      ReturnBatch: {
        orderBy: {
          id: "asc",
        },
        include: {
          OrderItem: {
            include: {
              order: true,
              product: true,
            },
          },
        },
      },
    },
  });

  console.log(`📦 Всего партий: ${batches.length}`);
  console.log();

  // ============================================================
  // АУДИТ КАЖДОЙ ПАРТИИ
  // ============================================================

  for (const batch of batches) {
    console.log("========================================");
    console.log(`📦 BATCH #${batch.id}`);
    console.log("========================================");

    console.log(`Товар: ${batch.product.name}`);
    console.log(`Product ID: ${batch.productId}`);
    console.log(`Quantity сейчас: ${batch.quantity}`);
    console.log(`PurchaseCost: ${batch.purchaseCost}`);
    console.log(`Status: ${batch.status}`);
    console.log(`Получена: ${batch.receivedAt.toISOString()}`);
    console.log(`Срок годности: ${batch.expiryDate.toISOString()}`);
    console.log();

    // ==========================================================
    // ORDER BATCH
    // ==========================================================

    console.log("🛒 ORDER BATCH");
    console.log();

    if (batch.orderBatches.length === 0) {
      console.log("  OrderBatch нет");
    }

    let soldFromBatch = 0;

    for (const orderBatch of batch.orderBatches) {
      soldFromBatch += orderBatch.quantity;

      console.log(
        `  OrderBatch #${orderBatch.id}: ` +
          `Order #${orderBatch.orderItem.orderId}, ` +
          `OrderItem #${orderBatch.orderItemId}, ` +
          `quantity=${orderBatch.quantity}, ` +
          `purchaseCost=${orderBatch.purchaseCost}`
      );

      console.log(
        `      дата заказа: ${orderBatch.orderItem.order.date.toISOString()}`
      );

      console.log(
        `      товар: ${orderBatch.orderItem.product.name}`
      );
    }

    console.log();
    console.log(`  ИТОГО ПРОДАНО ИЗ ПАРТИИ: ${soldFromBatch}`);
    console.log();

    // ==========================================================
    // RETURN BATCH
    // ==========================================================

    console.log("↩️ RETURN BATCH");
    console.log();

    if (batch.ReturnBatch.length === 0) {
      console.log("  ReturnBatch нет");
    }

    let returnedToBatch = 0;

    for (const returnBatch of batch.ReturnBatch) {
      returnedToBatch += returnBatch.quantity;

      console.log(
        `  ReturnBatch #${returnBatch.id}: ` +
          `Order #${returnBatch.OrderItem.orderId}, ` +
          `OrderItem #${returnBatch.orderItemId}, ` +
          `quantity=${returnBatch.quantity}`
      );

      console.log(
        `      дата заказа: ${returnBatch.OrderItem.order.date.toISOString()}`
      );
    }

    console.log();
    console.log(`  ИТОГО ВОЗВРАЩЕНО В ПАРТИЮ: ${returnedToBatch}`);
    console.log();

    // ==========================================================
    // РАСЧЁТ
    // ==========================================================

    const theoreticalRemaining =
      soldFromBatch === 0
        ? batch.quantity
        : batch.quantity;

    const historicalNetSold =
      soldFromBatch - returnedToBatch;

    console.log("📊 ИСТОРИЯ ПАРТИИ");
    console.log();

    console.log(
      `  OrderBatch всего:       ${soldFromBatch}`
    );

    console.log(
      `  ReturnBatch всего:      ${returnedToBatch}`
    );

    console.log(
      `  Чистая продажа:         ${historicalNetSold}`
    );

    console.log(
      `  Quantity сейчас:        ${batch.quantity}`
    );

    console.log();

    if (soldFromBatch > 0) {
      console.log(
        "  ℹ️ У партии есть история продаж."
      );
    }

    if (returnedToBatch > 0) {
      console.log(
        "  ℹ️ У партии есть история возвратов."
      );
    }

    console.log();
  }

  // ============================================================
  // ОСОБАЯ ПРОВЕРКА ORDER ITEM #36
  // ============================================================

  console.log("========================================");
  console.log("🔍 ОСОБАЯ ПРОВЕРКА ORDER ITEM #36");
  console.log("========================================");
  console.log();

  const orderItem36 = await prisma.orderItem.findUnique({
    where: {
      id: 36,
    },
    include: {
      product: true,
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
  });

  if (!orderItem36) {
    console.log("❌ OrderItem #36 не найден");
  } else {
    console.log(`Товар: ${orderItem36.product.name}`);
    console.log(`Order: #${orderItem36.orderId}`);
    console.log(`Продано: ${orderItem36.quantity}`);
    console.log(`Возвращено: ${orderItem36.returned}`);
    console.log(
      `Реально продано: ${
        orderItem36.quantity - orderItem36.returned
      }`
    );

    console.log();

    console.log("OrderBatch:");

    if (orderItem36.batches.length === 0) {
      console.log("  нет");
    }

    let totalOrderBatch36 = 0;

    for (const link of orderItem36.batches) {
      totalOrderBatch36 += link.quantity;

      console.log(
        `  OrderBatch #${link.id}: ` +
          `Batch #${link.batchId}, ` +
          `${link.quantity} шт, ` +
          `purchaseCost=${link.purchaseCost}`
      );
    }

    console.log(
      `  ИТОГО: ${totalOrderBatch36}`
    );

    console.log();

    console.log("ReturnBatch:");

    if (orderItem36.ReturnBatch.length === 0) {
      console.log("  нет");
    }

    let totalReturnBatch36 = 0;

    for (const link of orderItem36.ReturnBatch) {
      totalReturnBatch36 += link.quantity;

      console.log(
        `  ReturnBatch #${link.id}: ` +
          `Batch #${link.batchId}, ` +
          `${link.quantity} шт`
      );
    }

    console.log(
      `  ИТОГО: ${totalReturnBatch36}`
    );

    console.log();

    console.log("📌 ОЖИДАНИЕ:");

    console.log(
      `  OrderItem.quantity: ${orderItem36.quantity}`
    );

    console.log(
      `  OrderBatch quantity: ${totalOrderBatch36}`
    );

    console.log(
      `  ReturnBatch quantity: ${totalReturnBatch36}`
    );

    console.log();

    if (
      totalOrderBatch36 !== orderItem36.quantity
    ) {
      console.log(
        `⚠️ Не хватает ${
          orderItem36.quantity - totalOrderBatch36
        } шт OrderBatch`
      );
    } else {
      console.log(
        "✅ OrderBatch полностью покрывает OrderItem"
      );
    }
  }

  // ============================================================
  // ОСОБАЯ ПРОВЕРКА ТВОРOГА
  // ============================================================

  console.log();
  console.log("========================================");
  console.log("🧀 ПОЛНАЯ ИСТОРИЯ ТВOРОГА");
  console.log("========================================");
  console.log();

  const tvorog = await prisma.product.findUnique({
    where: {
      id: 2,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },

      supplyItems: {
        orderBy: {
          id: "asc",
        },
        include: {
          supply: true,
        },
      },

      orderItems: {
        orderBy: {
          id: "asc",
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
      },
    },
  });

  if (!tvorog) {
    console.log("❌ Творог не найден");
  } else {
    console.log(`Товар: ${tvorog.name}`);
    console.log();

    console.log("🚚 ПОСТАВКИ:");

    let totalSupply = 0;

    for (const item of tvorog.supplyItems) {
      totalSupply += item.quantity;

      console.log(
        `  SupplyItem #${item.id}: ` +
          `${item.quantity} шт, ` +
          `cost=${item.cost}, ` +
          `date=${item.supply.date.toISOString()}`
      );
    }

    console.log();
    console.log(`  ИТОГО ПОСТАВЛЕНО: ${totalSupply}`);
    console.log();

    console.log("📦 ПАРТИИ:");

    let totalBatchQuantity = 0;

    for (const batch of tvorog.batches) {
      totalBatchQuantity += batch.quantity;

      console.log(
        `  Batch #${batch.id}: ` +
          `quantity=${batch.quantity}, ` +
          `purchaseCost=${batch.purchaseCost}, ` +
          `received=${batch.receivedAt.toISOString()}, ` +
          `expiry=${batch.expiryDate.toISOString()}`
      );
    }

    console.log();
    console.log(
      `  ИТОГО В BATCH: ${totalBatchQuantity}`
    );

    console.log();

    console.log("🛒 ЗАКАЗЫ ТВOРОГА:");

    let totalSold = 0;
    let totalReturned = 0;
    let totalOrderBatch = 0;
    let totalReturnBatch = 0;

    for (const item of tvorog.orderItems) {
      totalSold += item.quantity;
      totalReturned += item.returned;

      const itemOrderBatch = item.batches.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      const itemReturnBatch = item.ReturnBatch.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      totalOrderBatch += itemOrderBatch;
      totalReturnBatch += itemReturnBatch;

      console.log(
        `  Order #${item.orderId}, ` +
          `OrderItem #${item.id}: ` +
          `sold=${item.quantity}, ` +
          `returned=${item.returned}, ` +
          `OrderBatch=${itemOrderBatch}, ` +
          `ReturnBatch=${itemReturnBatch}`
      );
    }

    console.log();

    console.log("📊 ИТОГО ТВOРОГ:");

    console.log(
      `  Поставлено:       ${totalSupply}`
    );

    console.log(
      `  Продано:          ${totalSold}`
    );

    console.log(
      `  Возвращено:       ${totalReturned}`
    );

    console.log(
      `  Реально продано:  ${
        totalSold - totalReturned
      }`
    );

    console.log(
      `  OrderBatch:       ${totalOrderBatch}`
    );

    console.log(
      `  ReturnBatch:      ${totalReturnBatch}`
    );

    console.log(
      `  Batch.quantity:   ${totalBatchQuantity}`
    );

    console.log(
      `  Product.stock:    ${tvorog.stock}`
    );

    console.log();

    console.log(
      `  Теория остатка: ${
        totalSupply -
        (totalSold - totalReturned)
      }`
    );
  }

  // ============================================================
  // ОСОБАЯ ПРОВЕРКА СМЕТАНЫ
  // ============================================================

  console.log();
  console.log("========================================");
  console.log("🥛 ПОЛНАЯ ПРОВЕРКА СМЕТАНЫ");
  console.log("========================================");
  console.log();

  const smetana = await prisma.product.findUnique({
    where: {
      id: 3,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },

      supplyItems: {
        orderBy: {
          id: "asc",
        },
        include: {
          supply: true,
        },
      },

      orderItems: {
        orderBy: {
          id: "asc",
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
      },
    },
  });

  if (!smetana) {
    console.log("❌ Сметана не найдена");
  } else {
    console.log(`Товар: ${smetana.name}`);
    console.log(`Product.stock: ${smetana.stock}`);
    console.log();

    console.log("🚚 ПОСТАВКИ:");

    if (smetana.supplyItems.length === 0) {
      console.log("  ❌ Поставок нет");
    }

    let smetanaSupply = 0;

    for (const item of smetana.supplyItems) {
      smetanaSupply += item.quantity;

      console.log(
        `  SupplyItem #${item.id}: ` +
          `${item.quantity} шт × ${item.cost} ₽`
      );

      console.log(
        `      Supply #${item.supplyId}: ` +
          `${item.supply.date.toISOString()}`
      );
    }

    console.log();
    console.log(`  ИТОГО ПОСТАВЛЕНО: ${smetanaSupply}`);
    console.log();

    console.log("📦 ПАРТИИ:");

    if (smetana.batches.length === 0) {
      console.log(
        "  ❌ У Сметаны вообще нет Batch"
      );
    }

    for (const batch of smetana.batches) {
      console.log(
        `  Batch #${batch.id}: ` +
          `quantity=${batch.quantity}, ` +
          `purchaseCost=${batch.purchaseCost}, ` +
          `status=${batch.status}`
      );

      console.log(
        `      received=${batch.receivedAt.toISOString()}`
      );

      console.log(
        `      expiry=${batch.expiryDate.toISOString()}`
      );
    }

    console.log();

    console.log("🛒 ПРОДАЖИ:");

    let smetanaSold = 0;
    let smetanaReturned = 0;

    for (const item of smetana.orderItems) {
      smetanaSold += item.quantity;
      smetanaReturned += item.returned;

      console.log(
        `  Order #${item.orderId}, ` +
          `OrderItem #${item.id}: ` +
          `sold=${item.quantity}, ` +
          `returned=${item.returned}, ` +
          `status=${item.order.status}`
      );
    }

    console.log();

    console.log(
      `  Продано: ${smetanaSold}`
    );

    console.log(
      `  Возвращено: ${smetanaReturned}`
    );

    console.log(
      `  Реально продано: ${
        smetanaSold - smetanaReturned
      }`
    );

    console.log();

    console.log("📊 ТЕОРЕТИЧЕСКИЙ БАЛАНС:");

    console.log(
      `  Поставлено: ${smetanaSupply}`
    );

    console.log(
      `  Реально продано: ${
        smetanaSold - smetanaReturned
      }`
    );

    console.log(
      `  Теоретический остаток: ${
        smetanaSupply -
        (smetanaSold - smetanaReturned)
      }`
    );

    console.log(
      `  Product.stock: ${smetana.stock}`
    );

    console.log();
  }

  // ============================================================
  // ФИНАЛ
  // ============================================================

  console.log("========================================");
  console.log("🛡️ АУДИТ ЗАВЕРШЁН");
  console.log("========================================");
  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ");
  console.log();
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ ОШИБКА АУДИТА:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });