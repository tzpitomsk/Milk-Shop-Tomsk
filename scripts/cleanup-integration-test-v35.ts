import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_MARKER = "V35_INTEGRATION_TEST";
const EXPECTED_PRODUCT_NAME = "V35_INTEGRATION_TEST Молоко";

async function main() {
  console.log("🧹 V35-C CLEANUP INTEGRATION TEST");
  console.log("=".repeat(70));

  // ============================================================
  // 1. Находим тестовый товар
  // ============================================================

  const products = await prisma.product.findMany({
    where: {
      name: {
        contains: TEST_MARKER,
      },
    },
    include: {
      batches: true,
      movements: true,
      orderItems: true,
    },
  });

  if (products.length === 0) {
    console.log("");
    console.log("ℹ️ V35 test product not found.");
    console.log("Nothing to clean.");
    return;
  }

  if (products.length !== 1) {
    throw new Error(
      `Найдено ${products.length} тестовых товаров V35. ` +
        "Ожидался ровно 1. Cleanup остановлен."
    );
  }

  const product = products[0];

  console.log("");
  console.log("FOUND TEST PRODUCT:");
  console.log(`  id=${product.id}`);
  console.log(`  name=${product.name}`);
  console.log(`  stock=${product.stock}`);
  console.log(`  batches=${product.batches.length}`);
  console.log(`  movements=${product.movements.length}`);
  console.log(`  orderItems=${product.orderItems.length}`);

  // ============================================================
  // Защитная проверка имени
  // ============================================================

  if (product.name !== EXPECTED_PRODUCT_NAME) {
    throw new Error(
      `Имя товара не совпадает с ожидаемым: "${product.name}". ` +
        "Cleanup остановлен."
    );
  }

  // ============================================================
  // 2. Находим заказы, содержащие тестовый товар
  // ============================================================

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: product.id,
    },
    include: {
      order: true,
      batches: true,
      ReturnBatch: true,
    },
  });

  console.log("");
  console.log(
    `Found ${orderItems.length} OrderItem(s) for test product.`
  );

  const orderIds = [
    ...new Set(
      orderItems.map((item) => item.orderId)
    ),
  ];

  for (const item of orderItems) {
    console.log(
      `  OrderItem #${item.id}: ` +
        `Order #${item.orderId}, ` +
        `quantity=${item.quantity}, ` +
        `returned=${item.returned}`
    );

    console.log(
      `    OrderBatch=${item.batches.length}, ` +
        `ReturnBatch=${item.ReturnBatch.length}`
    );
  }

  // ============================================================
  // 3. Проверяем, что заказы действительно тестовые
  // ============================================================

  if (orderIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: {
        id: {
          in: orderIds,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    for (const order of orders) {
      const hasNonTestProduct = order.items.some(
        (item) =>
          item.productId !== product.id
      );

      if (hasNonTestProduct) {
        throw new Error(
          `Order #${order.id} содержит не тестовые товары. ` +
            "Cleanup этого заказа отменён."
        );
      }

      console.log(
        `  ✅ Order #${order.id} contains only V35 test product`
      );
    }
  }

  // ============================================================
  // 4. Показываем, что именно будет удалено
  // ============================================================

  const movementIds =
    product.movements.map(
      (movement) => movement.id
    );

  const batchIds =
    product.batches.map(
      (batch) => batch.id
    );

  console.log("");
  console.log("CLEANUP PLAN:");
  console.log(
    `  Orders: ${orderIds.join(", ") || "none"}`
  );
  console.log(
    `  Movements: ${movementIds.join(", ") || "none"}`
  );
  console.log(
    `  Batches: ${batchIds.join(", ") || "none"}`
  );
  console.log(
    `  Product: #${product.id}`
  );

  // ============================================================
  // 5. Удаляем всё атомарно
  // ============================================================

  await prisma.$transaction(async (tx) => {
    // ----------------------------------------------------------
    // Сначала удаляем тестовые заказы.
    //
    // Order -> OrderItem имеет onDelete: Cascade,
    // поэтому автоматически удалятся:
    //   OrderItem
    //   OrderBatch
    //   ReturnBatch
    // ----------------------------------------------------------

    if (orderIds.length > 0) {
      const deletedOrders =
        await tx.order.deleteMany({
          where: {
            id: {
              in: orderIds,
            },
          },
        });

      console.log(
        `  🗑 Deleted Orders: ${deletedOrders.count}`
      );
    }

    // ----------------------------------------------------------
    // Удаляем Movement.
    // Product -> Movement не имеет cascade.
    // Поэтому их удаляем явно.
    // ----------------------------------------------------------

    if (movementIds.length > 0) {
      const deletedMovements =
        await tx.movement.deleteMany({
          where: {
            id: {
              in: movementIds,
            },
          },
        });

      console.log(
        `  🗑 Deleted Movements: ${deletedMovements.count}`
      );
    }

    // ----------------------------------------------------------
    // Проверяем, что у партий больше нет зависимостей.
    // ----------------------------------------------------------

    if (batchIds.length > 0) {
      const remainingOrderBatches =
        await tx.orderBatch.count({
          where: {
            batchId: {
              in: batchIds,
            },
          },
        });

      const remainingReturnBatches =
        await tx.returnBatch.count({
          where: {
            batchId: {
              in: batchIds,
            },
          },
        });

      if (
        remainingOrderBatches > 0 ||
        remainingReturnBatches > 0
      ) {
        throw new Error(
          "У тестовых Batch остались OrderBatch/ReturnBatch. " +
            "Удаление остановлено."
        );
      }

      const deletedBatches =
        await tx.batch.deleteMany({
          where: {
            id: {
              in: batchIds,
            },
            productId: product.id,
          },
        });

      console.log(
        `  🗑 Deleted Batches: ${deletedBatches.count}`
      );
    }

    // ----------------------------------------------------------
    // Удаляем тестовый Product.
    // ----------------------------------------------------------

    const remainingItems =
      await tx.orderItem.count({
        where: {
          productId: product.id,
        },
      });

    const remainingMovements =
      await tx.movement.count({
        where: {
          productId: product.id,
        },
      });

    const remainingBatches =
      await tx.batch.count({
        where: {
          productId: product.id,
        },
      });

    if (
      remainingItems > 0 ||
      remainingMovements > 0 ||
      remainingBatches > 0
    ) {
      throw new Error(
        "У тестового Product остались связанные записи. " +
          "Product не удалён."
      );
    }

    await tx.product.delete({
      where: {
        id: product.id,
      },
    });

    console.log(
      `  🗑 Deleted Product #${product.id}`
    );
  });

  // ============================================================
  // 6. Финальная проверка
  // ============================================================

  const remainingProducts =
    await prisma.product.findMany({
      where: {
        name: {
          contains: TEST_MARKER,
        },
      },
    });

  if (remainingProducts.length !== 0) {
    throw new Error(
      `После cleanup остались V35 Products: ${remainingProducts.length}`
    );
  }

  const remainingMovements =
    await prisma.movement.count({
      where: {
        comment: {
          contains: "Заказ №67",
        },
      },
    });

  console.log("");
  console.log("FINAL CHECK:");
  console.log(
    `  V35 products remaining: ${remainingProducts.length}`
  );

  console.log("");
  console.log("=".repeat(70));
  console.log("🎉 V35-C CLEANUP COMPLETED");
  console.log("=".repeat(70));

  console.log("");
  console.log(
    "Тестовые Product/Batch/Order/OrderBatch/ReturnBatch/Movement удалены."
  );

  console.log(
    "Реальные товары и исторические данные не затрагивались."
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("=".repeat(70));
    console.error("❌ V35-C CLEANUP FAILED");
    console.error("=".repeat(70));
    console.error("");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });