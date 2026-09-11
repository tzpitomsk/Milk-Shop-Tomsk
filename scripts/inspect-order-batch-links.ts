import { prisma } from "../lib/prisma";

async function main() {
  console.log("========================================");
  console.log("🧪 INSPECT ORDER → BATCH LINKS");
  console.log("========================================");
  console.log()
  console.log("⚠️ ТОЛЬКО ДИАГНОСТИКА");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  console.log("🔌 Проверяем подключение к Prisma...");

  await prisma.$connect();

  console.log("✅ Prisma работает");
  console.log();

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },
  });

  console.log(`📦 Товаров в базе: ${products.length}`);
  console.log();

  let totalProblems = 0;

  for (const product of products) {
    console.log("========================================");
    console.log(
      `🥛 ТОВАР #${product.id}: ${product.name}`
    );
    console.log("========================================");
    console.log();

    console.log("📊 ОСНОВНАЯ ИНФОРМАЦИЯ");
    console.log(`  Product.stock: ${product.stock}`);
    console.log();

    // =========================================
    // SUPPLY ITEMS
    // =========================================

    const supplies = await prisma.supplyItem.findMany({
      where: {
        productId: product.id,
      },
      include: {
        supply: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log("📦 SUPPLY ITEMS");
    console.log();

    if (supplies.length === 0) {
      console.log("  Поставок нет");
    } else {
      for (const item of supplies) {
        console.log(
          `  SupplyItem #${item.id}: ${item.quantity} шт × ${item.cost} ₽`
        );

        console.log(
          `    Supply #${item.supplyId}`
        );

        console.log(
          `    date=${item.supply.date.toISOString()}`
        );
      }
    }

    console.log();

    // =========================================
    // BATCHES
    // =========================================

    const batches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
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

      orderBy: [
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
    });

    console.log("🧱 BATCH");
    console.log();

    if (batches.length === 0) {
      console.log("  🔴 Batch отсутствуют");
      totalProblems++;
    } else {
      for (const batch of batches) {
        console.log(
          `  Batch #${batch.id}: quantity=${batch.quantity}, purchaseCost=${batch.purchaseCost} ₽, status=${batch.status}`
        );

        console.log(
          `    receivedAt=${batch.receivedAt.toISOString()}`
        );

        console.log(
          `    expiryDate=${batch.expiryDate.toISOString()}`
        );

        console.log(
          `    OrderBatch links=${batch.orderBatches.length}`
        );

        console.log(
          `    ReturnBatch links=${batch.ReturnBatch.length}`
        );

        if (batch.quantity < 0) {
          console.log(
            "    🔴 ОШИБКА: Batch.quantity отрицательный"
          );

          totalProblems++;
        }

        if (
          batch.quantity > 0 &&
          batch.status === "EMPTY"
        ) {
          console.log(
            "    🔴 ОШИБКА: quantity > 0, но status=EMPTY"
          );

          totalProblems++;
        }

        if (
          batch.quantity === 0 &&
          batch.status === "ACTIVE"
        ) {
          console.log(
            "    🟡 ACTIVE batch с quantity=0"
          );
        }
      }
    }

    console.log();

    // =========================================
    // ORDER ITEMS
    // =========================================

    const orderItems = await prisma.orderItem.findMany({
      where: {
        productId: product.id,
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

      orderBy: {
        id: "asc",
      },
    });

    console.log("🛒 ORDER ITEMS");
    console.log();

    if (orderItems.length === 0) {
      console.log("  Продаж нет");
    } else {
      for (const item of orderItems) {
        const sold = item.quantity;
        const returned = item.returned;

        const orderBatchQuantity = item.batches.reduce(
          (sum, link) => sum + link.quantity,
          0
        );

        const returnBatchQuantity =
          item.ReturnBatch.reduce(
            (sum, link) => sum + link.quantity,
            0
          );

        const remaining = sold - returned;

        console.log(
          `  Order #${item.orderId}, OrderItem #${item.id}`
        );

        console.log(
          `    status=${item.order.status}`
        );

        console.log(
          `    sold=${sold}, returned=${returned}, remaining=${remaining}`
        );

        console.log(
          `    OrderBatch=${orderBatchQuantity}`
        );

        console.log(
          `    ReturnBatch=${returnBatchQuantity}`
        );

        // -------------------------------
        // Проверка OrderBatch
        // -------------------------------

        if (orderBatchQuantity !== sold) {
          console.log(
            `    🔴 OrderBatch НЕ СООТВЕТСТВУЕТ продаже: ожидалось=${sold}, есть=${orderBatchQuantity}`
          );

          totalProblems++;
        }

        // -------------------------------
        // Проверка ReturnBatch
        // -------------------------------

        if (returnBatchQuantity !== returned) {
          console.log(
            `    🔴 ReturnBatch НЕ СООТВЕТСТВУЕТ возврату: ожидалось=${returned}, есть=${returnBatchQuantity}`
          );

          totalProblems++;
        }

        // -------------------------------
        // Проверка returned
        // -------------------------------

        if (returned > sold) {
          console.log(
            "    🔴 ОШИБКА: returned больше quantity"
          );

          totalProblems++;
        }

        // -------------------------------
        // Проверка остатка
        // -------------------------------

        if (remaining < 0) {
          console.log(
            "    🔴 ОШИБКА: остаток продажи отрицательный"
          );

          totalProblems++;
        }

        // -------------------------------
        // OrderBatch подробности
        // -------------------------------

        if (item.batches.length > 0) {
          for (const link of item.batches) {
            console.log(
              `      OrderBatch #${link.id}: Batch #${link.batchId}, ${link.quantity} шт × ${link.purchaseCost} ₽`
            );
          }
        }

        // -------------------------------
        // ReturnBatch подробности
        // -------------------------------

        if (item.ReturnBatch.length > 0) {
          for (const link of item.ReturnBatch) {
            console.log(
              `      ReturnBatch #${link.id}: Batch #${link.batchId}, +${link.quantity} шт`
            );
          }
        }

        console.log();
      }
    }

    // =========================================
    // BALANCE
    // =========================================

    console.log("🧮 БАЛАНС");
    console.log();

    let supplied = 0;
    let sold = 0;
    let returned = 0;
    let batchStock = 0;

    for (const item of supplies) {
      supplied += item.quantity;
    }

    for (const item of orderItems) {
      sold += item.quantity;
      returned += item.returned;
    }

    for (const batch of batches) {
      batchStock += batch.quantity;
    }

    const theoreticalStock =
      supplied - sold + returned;

    console.log(`  Поставлено: ${supplied}`);
    console.log(`  Продано: ${sold}`);
    console.log(`  Возвращено: ${returned}`);
    console.log(
      `  Теоретический остаток: ${theoreticalStock}`
    );
    console.log(
      `  Batch.quantity: ${batchStock}`
    );
    console.log(
      `  Product.stock: ${product.stock}`
    );

    // -------------------------------
    // Теоретический остаток vs Batch
    // -------------------------------

    if (theoreticalStock !== batchStock) {
      console.log(
        `  🔴 Баланс НЕ сходится: разница=${batchStock - theoreticalStock}`
      );

      totalProblems++;
    } else {
      console.log(
        "  ✅ Теоретический остаток совпадает с Batch.quantity"
      );
    }

    // -------------------------------
    // Batch vs Product.stock
    // -------------------------------

    if (batchStock !== product.stock) {
      console.log(
        `  🔴 Product.stock НЕ соответствует Batch.quantity: разница=${product.stock - batchStock}`
      );

      totalProblems++;
    } else {
      console.log(
        "  ✅ Product.stock соответствует Batch.quantity"
      );
    }

    console.log();
  }

  // =========================================
  // ИТОГ
  // =========================================

  console.log("========================================");
  console.log("📊 ИТОГ");
  console.log("========================================");
  console.log();

  console.log(
    `Товаров проверено: ${products.length}`
  );

  console.log(
    `Проблем найдено: ${totalProblems}`
  );

  console.log();

  if (totalProblems === 0) {
    console.log(
      "🎉 ПРОБЛЕМ С ORDER/BATCH СВЯЗЯМИ НЕ НАЙДЕНО"
    );
  } else {
    console.log(
      "🔴 НАЙДЕНЫ ПРОБЛЕМЫ"
    );

    console.log(
      "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ"
    );
  }

  console.log();

  console.log("========================================");
  console.log("🛡️ ДИАГНОСТИКА ЗАВЕРШЕНА");
  console.log("========================================");
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ ОШИБКА ДИАГНОСТИКИ");
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });