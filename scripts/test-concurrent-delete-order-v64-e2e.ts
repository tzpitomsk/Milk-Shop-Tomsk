import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`🔴 ASSERT FAILED: ${message}`);
  }
}

async function apiRequest(
  path: string,
  options?: RequestInit
): Promise<{
  status: number;
  body: any;
}> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const text = await response.text();

  let body: any;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    body,
  };
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("V64 CONCURRENT DELETE ORDER E2E TEST");
  console.log("==============================================================================");
  console.log("");
  console.log("Цель:");
  console.log("Проверить, что два одновременных DELETE одного заказа");
  console.log("не приводят к двойному восстановлению товара.");
  console.log("");

  let supplierId: number | null = null;
  let productId: number | null = null;
  let batchId: number | null = null;
  let supplyId: number | null = null;
  let orderId: number | null = null;

  try {
    // =========================================================================
    // 1. BASELINE
    // =========================================================================

    console.log("1. BASELINE");
    console.log("------------------------------------------------------------------------------");

    const before = {
      products: await prisma.product.count(),
      supplies: await prisma.supply.count(),
      supplyItems: await prisma.supplyItem.count(),
      batches: await prisma.batch.count(),
      orders: await prisma.order.count(),
      orderItems: await prisma.orderItem.count(),
      orderBatches: await prisma.orderBatch.count(),
      returnBatches: await prisma.returnBatch.count(),
      movements: await prisma.movement.count(),
    };

    console.log(JSON.stringify(before, null, 2));
    console.log("");

    // =========================================================================
    // 2. CREATE SUPPLIER
    // =========================================================================

    console.log("2. CREATE TEST SUPPLIER");
    console.log("------------------------------------------------------------------------------");

    const supplier = await prisma.supplier.create({
      data: {
        name: `V64 Concurrent Delete Supplier ${Date.now()}`,
        phone: null,
        address: null,
      },
    });

    supplierId = supplier.id;

    console.log(`Supplier #${supplier.id}`);
    console.log("");

    // =========================================================================
    // 3. CREATE PRODUCT
    // =========================================================================

    console.log("3. CREATE TEST PRODUCT");
    console.log("------------------------------------------------------------------------------");

    const product = await prisma.product.create({
      data: {
        name: `V64 Concurrent Delete Product ${Date.now()}`,
        unit: "шт",
        price: 300,
        cost: 100,
        stock: 0,
        barcode: null,
      },
    });

    productId = product.id;

    console.log(`Product #${product.id}`);
    console.log(`Price=${product.price}`);
    console.log(`Cost=${product.cost}`);
    console.log(`Stock=${product.stock}`);
    console.log("");

    // =========================================================================
    // 4. SUPPLY 5
    // =========================================================================

    console.log("4. SUPPLY 5 UNITS");
    console.log("------------------------------------------------------------------------------");

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const expiryDateString = [
      expiryDate.getFullYear(),
      String(expiryDate.getMonth() + 1).padStart(2, "0"),
      String(expiryDate.getDate()).padStart(2, "0"),
    ].join("-");

    const supplyResponse = await apiRequest("/api/supplies", {
      method: "POST",
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productId,
            quantity: 5,
            cost: 100,
            expiryDate: expiryDateString,
          },
        ],
      }),
    });

    console.log(`HTTP ${supplyResponse.status}`);
    console.log(JSON.stringify(supplyResponse.body, null, 2));
    console.log("");

    assert(
      supplyResponse.status === 200 ||
        supplyResponse.status === 201,
      `Поставка должна быть успешной, получен HTTP ${supplyResponse.status}`
    );

    const supply = await prisma.supply.findFirst({
      where: {
        supplierId,
        items: {
          some: {
            productId,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      include: {
        items: true,
      },
    });

    assert(supply, "Supply не найден");

    supplyId = supply.id;

    const supplyItem = supply.items.find(
      (item) => item.productId === productId
    );

    assert(supplyItem, "SupplyItem не найден");

    const batch = await prisma.batch.findFirst({
      where: {
        productId,
        quantity: 5,
      },
      orderBy: {
        id: "desc",
      },
    });

    assert(batch, "Batch после поставки не найден");

    batchId = batch.id;

    const suppliedProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(suppliedProduct, "Product после поставки не найден");

    console.log(`Supply #${supply.id}`);
    console.log(`SupplyItem #${supplyItem.id}`);
    console.log(`Batch #${batch.id}`);
    console.log(`Batch.quantity=${batch.quantity}`);
    console.log(`Product.stock=${suppliedProduct.stock}`);
    console.log("");

    assert(
      batch.quantity === 5,
      `Batch должен иметь 5 шт, получено ${batch.quantity}`
    );

    assert(
      suppliedProduct.stock === 5,
      `Product.stock должен быть 5, получено ${suppliedProduct.stock}`
    );

    // =========================================================================
    // 5. CREATE ORDER FOR ALL 5
    // =========================================================================

    console.log("5. CREATE ORDER FOR ALL 5 UNITS");
    console.log("------------------------------------------------------------------------------");

    const orderResponse = await apiRequest("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: productId,
            quantity: 5,
            price: 300,
          },
        ],
      }),
    });

    console.log(`HTTP ${orderResponse.status}`);
    console.log(JSON.stringify(orderResponse.body, null, 2));
    console.log("");

    assert(
      orderResponse.status === 200 ||
        orderResponse.status === 201,
      `Создание заказа должно быть успешным, получен HTTP ${orderResponse.status}`
    );

    assert(
      orderResponse.body?.id,
      "API не вернул ID заказа"
    );

    orderId = Number(orderResponse.body.id);

    const createdOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: {
          include: {
            batches: true,
          },
        },
      },
    });

    assert(
      createdOrder,
      `Заказ #${orderId} не найден`
    );

    assert(
      createdOrder.items.length === 1,
      `Должна быть 1 OrderItem, получено ${createdOrder.items.length}`
    );

    const orderItem = createdOrder.items[0];

    assert(
      orderItem.quantity === 5,
      `OrderItem.quantity должен быть 5, получено ${orderItem.quantity}`
    );

    assert(
      orderItem.returned === 0,
      `OrderItem.returned должен быть 0, получено ${orderItem.returned}`
    );

    assert(
      orderItem.batches.length === 1,
      `Должен быть 1 OrderBatch, получено ${orderItem.batches.length}`
    );

    const orderBatch = orderItem.batches[0];

    assert(
      orderBatch.batchId === batchId,
      `OrderBatch должен ссылаться на Batch #${batchId}, получено #${orderBatch.batchId}`
    );

    assert(
      orderBatch.quantity === 5,
      `OrderBatch.quantity должен быть 5, получено ${orderBatch.quantity}`
    );

    const afterSaleBatch = await prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    const afterSaleProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(afterSaleBatch, "Batch после продажи не найден");
    assert(afterSaleProduct, "Product после продажи не найден");

    console.log(`Order #${orderId}`);
    console.log(`OrderItem #${orderItem.id}`);
    console.log(`OrderBatch #${orderBatch.id}`);
    console.log(`OrderBatch.quantity=${orderBatch.quantity}`);
    console.log(`Batch.quantity=${afterSaleBatch.quantity}`);
    console.log(`Batch.status=${afterSaleBatch.status}`);
    console.log(`Product.stock=${afterSaleProduct.stock}`);
    console.log(`Order.total=${createdOrder.total}`);
    console.log(`Order.profit=${createdOrder.profit}`);
    console.log("");

    assert(
      afterSaleBatch.quantity === 0,
      `После продажи Batch должен быть 0, получено ${afterSaleBatch.quantity}`
    );

    assert(
      afterSaleProduct.stock === 0,
      `После продажи Product.stock должен быть 0, получено ${afterSaleProduct.stock}`
    );

    // =========================================================================
    // 6. MOVEMENT BASELINE
    // =========================================================================

    console.log("6. MOVEMENT BASELINE");
    console.log("------------------------------------------------------------------------------");

    const movementsBeforeDelete =
      await prisma.movement.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    const returnMovementsBeforeDelete =
      movementsBeforeDelete.filter(
        (movement) => movement.type === "RETURN"
      );

    console.log(
      `Product movements=${movementsBeforeDelete.length}`
    );

    console.log(
      `RETURN movements=${returnMovementsBeforeDelete.length}`
    );

    console.log("");

    assert(
      returnMovementsBeforeDelete.length === 0,
      `До DELETE не должно быть RETURN movements, найдено ${returnMovementsBeforeDelete.length}`
    );

    // =========================================================================
    // 7. CONCURRENT DELETE
    // =========================================================================

    console.log("7. TWO CONCURRENT DELETE REQUESTS");
    console.log("------------------------------------------------------------------------------");

    console.log(`DELETE /api/orders/${orderId}`);
    console.log("DELETE /api/orders/" + orderId);
    console.log("");

    console.log(
      "Отправляем оба запроса одновременно."
    );

    console.log(
      "Правильный результат: только один DELETE должен успешно"
    );

    console.log(
      "удалить заказ и восстановить товар."
    );

    console.log("");

    const [deleteA, deleteB] = await Promise.all([
      apiRequest(`/api/orders/${orderId}`, {
        method: "DELETE",
      }),
      apiRequest(`/api/orders/${orderId}`, {
        method: "DELETE",
      }),
    ]);

    console.log("DELETE A:");
    console.log(`HTTP ${deleteA.status}`);
    console.log(
      JSON.stringify(deleteA.body, null, 2)
    );
    console.log("");

    console.log("DELETE B:");
    console.log(`HTTP ${deleteB.status}`);
    console.log(
      JSON.stringify(deleteB.body, null, 2)
    );
    console.log("");

    const successfulDeletes = [
      deleteA,
      deleteB,
    ].filter(
      (response) =>
        response.status >= 200 &&
        response.status < 300
    );

    const failedDeletes = [
      deleteA,
      deleteB,
    ].filter(
      (response) =>
        response.status < 200 ||
        response.status >= 300
    );

    console.log(
      `Успешных DELETE=${successfulDeletes.length}`
    );

    console.log(
      `Неуспешных DELETE=${failedDeletes.length}`
    );

    console.log("");

    assert(
      successfulDeletes.length === 1,
      `Должен успешно пройти ровно один DELETE, успешно=${successfulDeletes.length}`
    );

    assert(
      failedDeletes.length === 1,
      `Второй DELETE должен завершиться ошибкой, ошибок=${failedDeletes.length}`
    );

    // =========================================================================
    // 8. VERIFY ORDER DELETED
    // =========================================================================

    console.log("8. VERIFY ORDER DELETED");
    console.log("------------------------------------------------------------------------------");

    const deletedOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });

    const deletedOrderItems =
      await prisma.orderItem.count({
        where: {
          orderId,
        },
      });

    const deletedOrderBatches =
      await prisma.orderBatch.count({
        where: {
          orderItem: {
            orderId,
          },
        },
      });

    const deletedReturnBatches =
      await prisma.returnBatch.count({
        where: {
          OrderItem: {
            orderId,
          },
        },
      });

    console.log(
      `Order exists=${Boolean(deletedOrder)}`
    );

    console.log(
      `OrderItems remaining=${deletedOrderItems}`
    );

    console.log(
      `OrderBatches remaining=${deletedOrderBatches}`
    );

    console.log(
      `ReturnBatches remaining=${deletedReturnBatches}`
    );

    console.log("");

    assert(
      !deletedOrder,
      `Заказ #${orderId} должен быть удалён`
    );

    assert(
      deletedOrderItems === 0,
      `OrderItems должны быть удалены, осталось ${deletedOrderItems}`
    );

    assert(
      deletedOrderBatches === 0,
      `OrderBatches должны быть удалены, осталось ${deletedOrderBatches}`
    );

    assert(
      deletedReturnBatches === 0,
      `ReturnBatches должны быть удалены, осталось ${deletedReturnBatches}`
    );

    console.log("🟢 Order удалён");
    console.log("🟢 OrderItem удалён");
    console.log("🟢 OrderBatch удалён");
    console.log("🟢 ReturnBatch удалён");
    console.log("");

    // =========================================================================
    // 9. VERIFY EXACT STOCK RESTORATION
    // =========================================================================

    console.log("9. VERIFY EXACT STOCK RESTORATION");
    console.log("------------------------------------------------------------------------------");

    const restoredBatch = await prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    const restoredProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(
      restoredBatch,
      `Batch #${batchId} не найден после DELETE`
    );

    assert(
      restoredProduct,
      `Product #${productId} не найден после DELETE`
    );

    console.log(
      `Batch.quantity=${restoredBatch.quantity}`
    );

    console.log(
      `Batch.status=${restoredBatch.status}`
    );

    console.log(
      `Product.stock=${restoredProduct.stock}`
    );

    console.log("");

    assert(
      restoredBatch.quantity === 5,
      `Batch должен восстановиться ровно до 5, получено ${restoredBatch.quantity}`
    );

    assert(
      restoredProduct.stock === 5,
      `Product.stock должен восстановиться ровно до 5, получено ${restoredProduct.stock}`
    );

    assert(
      restoredProduct.stock === restoredBatch.quantity,
      `Product.stock=${restoredProduct.stock} не совпадает с Batch.quantity=${restoredBatch.quantity}`
    );

    console.log(
      "🟢 Batch восстановлен ровно до 5"
    );

    console.log(
      "🟢 Product.stock восстановлен ровно до 5"
    );

    console.log(
      "🟢 Product.stock == Batch.quantity"
    );

    console.log("");

    // =========================================================================
    // 10. VERIFY RESTORATION MOVEMENT
    // =========================================================================

    console.log("10. VERIFY RESTORATION MOVEMENT");
    console.log("------------------------------------------------------------------------------");

    const movementsAfterDelete =
      await prisma.movement.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    const supplyMovements =
      movementsAfterDelete.filter(
        (movement) => movement.type === "SUPPLY"
      );

    const saleMovements =
      movementsAfterDelete.filter(
        (movement) => movement.type === "SALE"
      );

    const returnMovements =
      movementsAfterDelete.filter(
        (movement) => movement.type === "RETURN"
      );

    const writeOffMovements =
      movementsAfterDelete.filter(
        (movement) => movement.type === "WRITE_OFF"
      );

    console.log(
      `SUPPLY movements=${supplyMovements.length}`
    );

    console.log(
      `SALE movements=${saleMovements.length}`
    );

    console.log(
      `RETURN movements=${returnMovements.length}`
    );

    console.log(
      `WRITE_OFF movements=${writeOffMovements.length}`
    );

    console.log("");

    assert(
      supplyMovements.length === 1,
      `Должен быть 1 SUPPLY movement, найдено ${supplyMovements.length}`
    );

    assert(
      saleMovements.length === 1,
      `Должен быть 1 SALE movement, найдено ${saleMovements.length}`
    );

    assert(
      returnMovements.length === 1,
      `Должен быть ровно 1 RETURN movement после конкурентного DELETE, найдено ${returnMovements.length}`
    );

    assert(
      writeOffMovements.length === 0,
      `WRITE_OFF movements не ожидаются, найдено ${writeOffMovements.length}`
    );

    const supplyNet = supplyMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const saleNet = saleMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const returnNet = returnMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const movementNet =
      supplyNet +
      saleNet +
      returnNet;

    console.log(`SUPPLY net=${supplyNet}`);
    console.log(`SALE net=${saleNet}`);
    console.log(`RETURN net=${returnNet}`);
    console.log(`MOVEMENT NET=${movementNet}`);
    console.log("");

    assert(
      supplyNet === 5,
      `SUPPLY net должен быть +5, получено ${supplyNet}`
    );

    assert(
      saleNet === -5,
      `SALE net должен быть -5, получено ${saleNet}`
    );

    assert(
      returnNet === 5,
      `RETURN net должен быть +5, получено ${returnNet}`
    );

    assert(
      movementNet === 5,
      `Movement NET должен быть +5, получено ${movementNet}`
    );

    assert(
      restoredProduct.stock === movementNet,
      `Product.stock=${restoredProduct.stock} не совпадает с Movement NET=${movementNet}`
    );

    console.log("🟢 SUPPLY +5");
    console.log("🟢 SALE -5");
    console.log("🟢 один RETURN +5");
    console.log("🟢 NET +5");
    console.log("🟢 NET == Product.stock");
    console.log("");

    const restorationMovement = returnMovements[0];

    console.log(
      `Restoration Movement #${restorationMovement.id}`
    );

    console.log(
      `quantity=${restorationMovement.quantity}`
    );

    console.log(
      `comment=${restorationMovement.comment}`
    );

    console.log("");

    assert(
      restorationMovement.quantity === 5,
      `DELETE должен создать RETURN movement +5, получено ${restorationMovement.quantity}`
    );

    assert(
      restorationMovement.comment ===
        `Возврат после удаления заказа №${orderId}. Партия №${batchId}`,
      `Неожиданный comment restoration movement: ${restorationMovement.comment}`
    );

    console.log(
      "🟢 Создано ровно одно restoration RETURN movement"
    );

    console.log(
      "🟢 quantity restoration = +5"
    );

    console.log("");

    // =========================================================================
    // 11. REPEATED DELETE
    // =========================================================================

    console.log("11. REPEATED DELETE");
    console.log("------------------------------------------------------------------------------");

    const movementCountBeforeRepeatedDelete =
      await prisma.movement.count();

    const stockBeforeRepeatedDelete =
      restoredProduct.stock;

    const repeatedDelete =
      await apiRequest(`/api/orders/${orderId}`, {
        method: "DELETE",
      });

    console.log(
      `HTTP ${repeatedDelete.status}`
    );

    console.log(
      JSON.stringify(
        repeatedDelete.body,
        null,
        2
      )
    );

    console.log("");

    assert(
      repeatedDelete.status === 404,
      `Повторный DELETE должен вернуть HTTP404, получен ${repeatedDelete.status}`
    );

    const productAfterRepeatedDelete =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      productAfterRepeatedDelete,
      "Product после повторного DELETE не найден"
    );

    const movementCountAfterRepeatedDelete =
      await prisma.movement.count();

    assert(
      productAfterRepeatedDelete.stock ===
        stockBeforeRepeatedDelete,
      `Повторный DELETE изменил stock: было ${stockBeforeRepeatedDelete}, стало ${productAfterRepeatedDelete.stock}`
    );

    assert(
      movementCountAfterRepeatedDelete ===
        movementCountBeforeRepeatedDelete,
      `Повторный DELETE изменил Movement count: было ${movementCountBeforeRepeatedDelete}, стало ${movementCountAfterRepeatedDelete}`
    );

    console.log(
      "🟢 Повторный DELETE → HTTP404"
    );

    console.log(
      "🟢 Stock не изменился"
    );

    console.log(
      "🟢 Movement count не изменился"
    );

    console.log("");

    // =========================================================================
    // 12. FINAL CONSISTENCY
    // =========================================================================

    console.log("12. FINAL CONSISTENCY");
    console.log("------------------------------------------------------------------------------");

    const finalProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(
      finalProduct,
      "Финальный Product не найден"
    );

    const batchSum =
      (
        await prisma.batch.aggregate({
          where: {
            productId,
          },
          _sum: {
            quantity: true,
          },
        })
      )._sum.quantity ?? 0;

    console.log(
      `Product.stock=${finalProduct.stock}`
    );

    console.log(
      `SUM(Batch.quantity)=${batchSum}`
    );

    console.log("");

    assert(
      finalProduct.stock === batchSum,
      `Product.stock=${finalProduct.stock} не совпадает с SUM(Batch.quantity)=${batchSum}`
    );

    assert(
      finalProduct.stock === 5,
      `Финальный Product.stock должен быть 5, получено ${finalProduct.stock}`
    );

    console.log(
      "🟢 Product.stock == SUM(Batch.quantity)"
    );

    console.log(
      "🟢 Финальный stock = 5"
    );

    console.log("");

    // =========================================================================
    // 13. SUCCESS
    // =========================================================================

    console.log("==============================================================================");
    console.log("V64 RESULT");
    console.log("==============================================================================");
    console.log("");

    console.log(
      "🟢 CONCURRENT DELETE TEST PASSED"
    );

    console.log("");

    console.log(
      "Проверено:"
    );

    console.log(
      "1. Два одновременных DELETE одного заказа."
    );

    console.log(
      "2. Только один DELETE успешно удаляет заказ."
    );

    console.log(
      "3. Второй DELETE не повторяет восстановление."
    );

    console.log(
      "4. Batch восстанавливается ровно на необходимое количество."
    );

    console.log(
      "5. Product.stock восстанавливается корректно."
    );

    console.log(
      "6. Создаётся ровно один restoration RETURN movement."
    );

    console.log(
      "7. Movement NET соответствует Product.stock."
    );

    console.log(
      "8. Повторный DELETE возвращает HTTP404."
    );

    console.log(
      "9. Повторный DELETE не меняет stock."
    );

    console.log(
      "10. Повторный DELETE не создаёт Movement."
    );

    console.log(
      "11. Product.stock == SUM(Batch.quantity)."
    );

    console.log("");
  } catch (error) {
    console.error("");
    console.error("==============================================================================");
    console.error("🔴 V64 FAILED");
    console.error("==============================================================================");
    console.error("");
    console.error(error);
    console.error("");
    process.exitCode = 1;
  } finally {
    // ========================================================================
    // CLEANUP
    // ========================================================================

    console.log("==============================================================================");
    console.log("V64 CLEANUP");
    console.log("==============================================================================");
    console.log("");

    try {
      // На случай частичного выполнения DELETE.
      if (orderId !== null) {
        await prisma.returnBatch.deleteMany({
          where: {
            OrderItem: {
              orderId,
            },
          },
        });

        await prisma.orderBatch.deleteMany({
          where: {
            orderItem: {
              orderId,
            },
          },
        });

        await prisma.orderItem.deleteMany({
          where: {
            orderId,
          },
        });

        await prisma.order.deleteMany({
          where: {
            id: orderId,
          },
        });
      }

      // Удаляем движения тестового продукта.
      if (productId !== null) {
        await prisma.movement.deleteMany({
          where: {
            productId,
          },
        });
      }

      // Удаляем тестовый Batch.
      if (batchId !== null) {
        await prisma.batch.deleteMany({
          where: {
            id: batchId,
          },
        });
      }

      // Дополнительная защита от Batch, созданного тестом,
      // но не записанного в batchId.
      if (productId !== null) {
        await prisma.batch.deleteMany({
          where: {
            productId,
          },
        });
      }

      // Удаляем SupplyItems.
      if (supplyId !== null) {
        await prisma.supplyItem.deleteMany({
          where: {
            supplyId,
          },
        });

        await prisma.supply.deleteMany({
          where: {
            id: supplyId,
          },
        });
      }

      // Дополнительная защита от Supply, созданной тестом.
      if (supplierId !== null) {
        await prisma.supplyItem.deleteMany({
          where: {
            supply: {
              supplierId,
            },
          },
        });

        await prisma.supply.deleteMany({
          where: {
            supplierId,
          },
        });
      }

      // Удаляем Product.
      if (productId !== null) {
        await prisma.product.deleteMany({
          where: {
            id: productId,
          },
        });
      }

      // Удаляем Supplier.
      if (supplierId !== null) {
        await prisma.supplier.deleteMany({
          where: {
            id: supplierId,
          },
        });
      }

      console.log("🟢 Cleanup completed");
      console.log("");
    } catch (cleanupError) {
      console.error("🔴 CLEANUP FAILED");
      console.error(cleanupError);
      console.error("");
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  }
}

main();
