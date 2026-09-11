import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function separator() {
  console.log("========================================");
}

function money(value: number) {
  return `${value} ₽`;
}

function date(value: Date) {
  return value.toISOString();
}

async function main() {
  console.log("");
  separator();
  console.log("🧀 ИСТОРИЯ ТВOРОГА");
  separator();
  console.log("");

  const product = await prisma.product.findFirst({
    where: {
      name: {
        contains: "Творог",
      },
    },
  });

  if (!product) {
    console.log("❌ Творог не найден");
    return;
  }

  console.log(`Product #${product.id}: ${product.name}`);
  console.log(`Цена продажи: ${money(product.price)}`);
  console.log(`Текущий stock: ${product.stock}`);
  console.log("");

  // ==========================================================
  // BATCHES
  // ==========================================================

  separator();
  console.log("📦 BATCH ТВОРОГА");
  separator();
  console.log("");

  const batches = await prisma.batch.findMany({
    where: {
      productId: product.id,
    },
    orderBy: [
      {
        receivedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    include: {
      orderBatches: {
        include: {
          orderItem: {
            include: {
              order: true,
            },
          },
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
      },
    },
  });

  for (const batch of batches) {
    const sold = batch.orderBatches.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    console.log(`Batch #${batch.id}`);
    console.log(`  quantity: ${batch.quantity}`);
    console.log(`  purchaseCost: ${money(batch.purchaseCost)}`);
    console.log(`  receivedAt: ${date(batch.receivedAt)}`);
    console.log(`  expiryDate: ${date(batch.expiryDate)}`);
    console.log(`  status: ${batch.status}`);
    console.log(`  productId: ${batch.productId}`);
    console.log(`  OrderBatch sold: ${sold}`);
    console.log(`  ReturnBatch returned: ${returned}`);

    console.log("");
    console.log("  🔗 Продажи:");

    if (batch.orderBatches.length === 0) {
      console.log("    нет");
    }

    for (const link of batch.orderBatches) {
      console.log(
        `    Order #${link.orderItem.orderId}, ` +
          `OrderItem #${link.orderItemId}: ` +
          `${link.quantity} шт × ${money(link.purchaseCost)}`
      );

      console.log(
        `      дата заказа: ${date(link.orderItem.order.date)}`
      );

      console.log(
        `      статус: ${link.orderItem.order.status}`
      );
    }

    console.log("");
    console.log("  ↩ Возвраты:");

    if (batch.ReturnBatch.length === 0) {
      console.log("    нет");
    }

    for (const link of batch.ReturnBatch) {
      console.log(
        `    ReturnBatch #${link.id}: ` +
          `Order #${link.OrderItem.orderId}, ` +
          `OrderItem #${link.orderItemId}: ` +
          `${link.quantity} шт`
      );

      console.log(
        `      дата заказа: ${date(link.OrderItem.order.date)}`
      );
    }

    console.log("");
    separator();
    console.log("");
  }

  // ==========================================================
  // SUPPLIES
  // ==========================================================

  separator();
  console.log("🚚 ПОСТАВКИ ТВOРОГА");
  separator();
  console.log("");

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: product.id,
    },
    orderBy: [
      {
        supply: {
          date: "asc",
        },
      },
      {
        id: "asc",
      },
    ],
    include: {
      supply: {
        include: {
          Supplier: true,
        },
      },
    },
  });

  if (supplyItems.length === 0) {
    console.log("❌ Поставок Творога не найдено");
  }

  for (const item of supplyItems) {
    console.log(`SupplyItem #${item.id}`);

    console.log(`  Supply #${item.supplyId}`);

    console.log(
      `  дата поставки: ${date(item.supply.date)}`
    );

    console.log(
      `  Supplier #${item.supply.supplierId}: ` +
        `${item.supply.Supplier.name}`
    );

    console.log(`  quantity: ${item.quantity}`);

    console.log(
      `  cost: ${money(item.cost)}`
    );

    console.log(
      `  total поставки: ${money(item.supply.total)}`
    );

    console.log("");
  }

  // ==========================================================
  // ORDERS
  // ==========================================================

  separator();
  console.log("🛒 ВСЕ ЗАКАЗЫ ТВOРОГА");
  separator();
  console.log("");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: product.id,
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
    include: {
      order: true,
      batches: true,
      ReturnBatch: true,
    },
  });

  let totalSold = 0;
  let totalReturned = 0;
  let totalLinked = 0;

  for (const item of orderItems) {
    const linked = item.batches.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    const returned = item.ReturnBatch.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    totalSold += item.quantity;
    totalReturned += item.returned;
    totalLinked += linked;

    console.log(
      `Order #${item.orderId}, OrderItem #${item.id}`
    );

    console.log(
      `  date: ${date(item.order.date)}`
    );

    console.log(
      `  status: ${item.order.status}`
    );

    console.log(
      `  sold: ${item.quantity}`
    );

    console.log(
      `  returned field: ${item.returned}`
    );

    console.log(
      `  ReturnBatch: ${returned}`
    );

    console.log(
      `  OrderBatch: ${linked}`
    );

    console.log(
      `  unlinked: ${Math.max(0, item.quantity - linked)}`
    );

    console.log("");
  }

  // ==========================================================
  // TOTALS
  // ==========================================================

  separator();
  console.log("📊 ИТОГ");
  separator();
  console.log("");

  console.log(`Всего SupplyItem: ${supplyItems.length}`);
  console.log(`Всего Batch: ${batches.length}`);
  console.log(`Всего OrderItem: ${orderItems.length}`);
  console.log("");

  console.log(`Продано по OrderItem: ${totalSold} шт`);
  console.log(`Возвращено по OrderItem.returned: ${totalReturned} шт`);
  console.log(`Связано через OrderBatch: ${totalLinked} шт`);
  console.log(
    `Отсутствует OrderBatch: ${Math.max(
      0,
      totalSold - totalLinked
    )} шт`
  );

  console.log("");

  separator();
  console.log("🛡️ DRY-RUN");
  separator();
  console.log("");

  console.log("✅ Только SELECT-запросы");
  console.log("✅ Batch не изменяются");
  console.log("✅ OrderBatch не изменяются");
  console.log("✅ ReturnBatch не изменяются");
  console.log("✅ Supply не изменяются");
  console.log("✅ Product не изменяется");
  console.log("");

  console.log("🏁 АНАЛИЗ ЗАВЕРШЁН");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ ОШИБКА:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });