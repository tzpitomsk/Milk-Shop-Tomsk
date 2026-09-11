import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔎 АУДИТ ОСТАТКОВ И ИСТОРИИ\n");

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
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

      movements: {
        orderBy: {
          id: "asc",
        },
      },

      orderItems: {
        orderBy: {
          id: "asc",
        },
        include: {
          order: true,
          ReturnBatch: true,
          batches: true,
        },
      },
    },
  });

  for (const product of products) {
    console.log("\n");
    console.log("=".repeat(70));
    console.log(`🥛 ТОВАР №${product.id}: ${product.name}`);
    console.log("=".repeat(70));

    // --------------------------------------------------
    // Поставки
    // --------------------------------------------------

    const supplied = product.supplyItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    console.log("\n🚚 ПОСТАВКИ:");

    for (const item of product.supplyItems) {
      console.log(
        `  Поставка №${item.supplyId}: ` +
          `${item.quantity} шт × ${item.cost} ₽`
      );
    }

    console.log(`  ИТОГО ПОСТАВЛЕНО: ${supplied} шт`);

    // --------------------------------------------------
    // Партии
    // --------------------------------------------------

    const batchStock = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log("\n📦 ПАРТИИ:");

    if (product.batches.length === 0) {
      console.log("  ❌ Партий нет");
    }

    for (const batch of product.batches) {
      console.log(
        `  Партия №${batch.id}: ` +
          `остаток=${batch.quantity}, ` +
          `закупка=${batch.purchaseCost}, ` +
          `получена=${batch.receivedAt.toISOString()}, ` +
          `срок=${batch.expiryDate.toISOString()}, ` +
          `status=${batch.status}`
      );
    }

    console.log(`  ИТОГО В ПАРТИЯХ: ${batchStock} шт`);

    // --------------------------------------------------
    // Продажи
    // --------------------------------------------------

    const sold = product.orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returned = product.orderItems.reduce(
      (sum, item) => sum + item.returned,
      0
    );

    const realSold = sold - returned;

    console.log("\n🛒 ПРОДАЖИ:");

    for (const item of product.orderItems) {
      console.log(
        `  Заказ №${item.orderId}: ` +
          `продано=${item.quantity}, ` +
          `возвращено=${item.returned}, ` +
          `реально=${item.quantity - item.returned}, ` +
          `дата=${item.order.date.toISOString()}`
      );

      if (item.batches.length > 0) {
        for (const ob of item.batches) {
          console.log(
            `      ↳ OrderBatch №${ob.id}: ` +
              `партия=${ob.batchId}, ` +
              `количество=${ob.quantity}, ` +
              `себестоимость=${ob.purchaseCost}`
          );
        }
      }

      if (item.ReturnBatch.length > 0) {
        for (const rb of item.ReturnBatch) {
          console.log(
            `      ↩ ReturnBatch №${rb.id}: ` +
              `партия=${rb.batchId}, ` +
              `количество=${rb.quantity}`
          );
        }
      }
    }

    console.log(`  ПРОДАНО: ${sold} шт`);
    console.log(`  ВОЗВРАЩЕНО: ${returned} шт`);
    console.log(`  РЕАЛЬНО ПРОДАНО: ${realSold} шт`);

    // --------------------------------------------------
    // Движения
    // --------------------------------------------------

    console.log("\n📜 ДВИЖЕНИЯ:");

    if (product.movements.length === 0) {
      console.log("  Движений нет");
    }

    let movementTotal = 0;

    for (const movement of product.movements) {
      console.log(
        `  Movement №${movement.id}: ` +
          `type=${movement.type}, ` +
          `quantity=${movement.quantity}, ` +
          `comment=${movement.comment ?? "-"}` +
          `, date=${movement.createdAt.toISOString()}`
      );

      movementTotal += movement.quantity;
    }

    console.log(`  СУММА quantity движений: ${movementTotal}`);

    // --------------------------------------------------
    // Баланс
    // --------------------------------------------------

    const theoreticalStock = supplied - realSold;

    const differenceFromStock =
      theoreticalStock - product.stock;

    const differenceFromBatches =
      theoreticalStock - batchStock;

    console.log("\n📊 БАЛАНС:");

    console.log(
      `  Поставлено:             ${supplied}`
    );

    console.log(
      `  Реально продано:        ${realSold}`
    );

    console.log(
      `  Теоретический остаток:  ${theoreticalStock}`
    );

    console.log(
      `  Product.stock:           ${product.stock}`
    );

    console.log(
      `  Batch.quantity:          ${batchStock}`
    );

    console.log(
      `  Разница с Product.stock: ${differenceFromStock}`
    );

    console.log(
      `  Разница с Batch:         ${differenceFromBatches}`
    );

    if (
      theoreticalStock !== product.stock ||
      theoreticalStock !== batchStock
    ) {
      console.log(
        "  ⚠️ ОБНАРУЖЕНО НЕСООТВЕТСТВИЕ"
      );
    } else {
      console.log(
        "  ✅ Баланс сходится"
      );
    }
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