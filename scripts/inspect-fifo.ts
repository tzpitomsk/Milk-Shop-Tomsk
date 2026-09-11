import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔎 ПРОВЕРКА ДАННЫХ ДЛЯ ВОССТАНОВЛЕНИЯ FIFO\n");

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },
  });

  for (const product of products) {
    console.log("\n========================================");
    console.log(`🥛 ТОВАР №${product.id}: ${product.name}`);
    console.log("========================================");

    console.log("\n📦 BATCHES:");

    const batches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        receivedAt: "asc",
      },
    });

    if (batches.length === 0) {
      console.log("  Нет партий");
    }

    for (const batch of batches) {
      console.log(
        `  Партия №${batch.id}: ` +
          `остаток=${batch.quantity}, ` +
          `закупка=${batch.purchaseCost}, ` +
          `получена=${batch.receivedAt.toISOString()}, ` +
          `срок=${batch.expiryDate.toISOString()}, ` +
          `status=${batch.status}`
      );
    }

    console.log("\n🚚 SUPPLIES:");

    const supplyItems = await prisma.supplyItem.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        supply: {
          date: "asc",
        },
      },
      include: {
        supply: true,
      },
    });

    if (supplyItems.length === 0) {
      console.log("  Нет поставок");
    }

    let totalSupplied = 0;

    for (const item of supplyItems) {
      totalSupplied += item.quantity;

      console.log(
        `  Поставка №${item.supplyId}: ` +
          `количество=${item.quantity}, ` +
          `цена=${item.cost}, ` +
          `дата=${item.supply.date.toISOString()}`
      );
    }

    console.log(`\n  📊 Всего поставлено: ${totalSupplied} шт`);

    console.log("\n🛒 ORDER ITEMS:");

    const orderItems = await prisma.orderItem.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        order: {
          date: "asc",
        },
      },
      include: {
        order: true,
      },
    });

    if (orderItems.length === 0) {
      console.log("  Продаж нет");
    }

    let totalSold = 0;
    let totalReturned = 0;
    let totalRealSold = 0;

    for (const item of orderItems) {
      const realSold = item.quantity - item.returned;

      totalSold += item.quantity;
      totalReturned += item.returned;
      totalRealSold += realSold;

      console.log(
        `  Заказ №${item.orderId}: ` +
          `продано=${item.quantity}, ` +
          `возвращено=${item.returned}, ` +
          `реально=${realSold}, ` +
          `цена=${item.price}, ` +
          `дата=${item.order.date.toISOString()}`
      );
    }

    console.log(`\n  🛒 Всего продано: ${totalSold} шт`);
    console.log(`  ↩️ Всего возвращено: ${totalReturned} шт`);
    console.log(`  ✅ Реально продано: ${totalRealSold} шт`);

    console.log("\n↩️ RETURN BATCH:");

    const returns = await prisma.returnBatch.findMany({
      where: {
        OrderItem: {
          productId: product.id,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (returns.length === 0) {
      console.log("  Возвратов по партиям нет");
    }

    for (const ret of returns) {
      console.log(
        `  ReturnBatch №${ret.id}: ` +
          `количество=${ret.quantity}, ` +
          `orderItem=${ret.orderItemId}, ` +
          `batch=${ret.batchId}, ` +
          `дата=${ret.createdAt.toISOString()}`
      );
    }

    console.log("\n📈 ИТОГ:");

    const currentStock = batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(`  Текущий остаток Product.stock: ${product.stock}`);
    console.log(`  Сумма остатков Batch.quantity: ${currentStock}`);
    console.log(`  Всего поставлено: ${totalSupplied}`);
    console.log(`  Реально продано: ${totalRealSold}`);
    console.log(
      `  Поставлено - реально продано: ${
        totalSupplied - totalRealSold
      }`
    );
  }
}

main()
  .catch((error) => {
    console.error("\n❌ ОШИБКА:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });