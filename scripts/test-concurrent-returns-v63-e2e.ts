import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`🔴 ASSERT FAILED: ${message}`);
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
  console.log("V63 CONCURRENT RETURNS E2E TEST");
  console.log("==============================================================================");
  console.log("");
  console.log("Цель:");
  console.log("Проверить, что два одновременных возврата не позволяют");
  console.log("вернуть больше товара, чем было реально продано.");
  console.log("");

  let supplierId: number | null = null;
  let productId: number | null = null;
  let supplyIds: number[] = [];
  let batchIds: number[] = [];
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
    // 2. CREATE TEST SUPPLIER
    // =========================================================================

    console.log("2. CREATE TEST SUPPLIER");
    console.log("------------------------------------------------------------------------------");

    const supplier = await prisma.supplier.create({
      data: {
        name: `V63 Concurrent Return Supplier ${Date.now()}`,
        phone: null,
        address: null,
      },
    });

    supplierId = supplier.id;

    console.log(`Supplier #${supplier.id}`);
    console.log("");

    // =========================================================================
    // 3. CREATE TEST PRODUCT
    // =========================================================================

    console.log("3. CREATE TEST PRODUCT");
    console.log("------------------------------------------------------------------------------");

    const product = await prisma.product.create({
      data: {
        name: `V63 Concurrent Return Product ${Date.now()}`,
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
    // 4. SUPPLY 5 UNITS
    // =========================================================================

    console.log("4. SUPPLY 5 UNITS");
    console.log("------------------------------------------------------------------------------");

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const supplyResponse = await apiRequest("/api/supplies", {
      method: "POST",
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productId,
            quantity: 5,
            cost: 100,
            expiryDate: formatLocalDate(expiryDate),
          },
        ],
      }),
    });

    console.log(`HTTP ${supplyResponse.status}`);
    console.log(JSON.stringify(supplyResponse.body, null, 2));
    console.log("");

    assert(
      supplyResponse.status === 200 || supplyResponse.status === 201,
      `Поставка должна завершиться успешно, получен HTTP ${supplyResponse.status}`
    );

    const supplyRecord = await prisma.supply.findFirst({
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

    assert(supplyRecord, "Созданная поставка не найдена");

    supplyIds.push(supplyRecord.id);

    const supplyItem = supplyRecord.items.find(
      (item) => item.productId === productId
    );

    assert(supplyItem, "SupplyItem тестового товара не найден");

    const suppliedBatch = await prisma.batch.findFirst({
      where: {
        productId,
        quantity: 5,
      },
      orderBy: {
        id: "desc",
      },
    });

    assert(suppliedBatch, "Batch после поставки не найден");

    batchIds.push(suppliedBatch.id);

    const suppliedProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(suppliedProduct, "Product после поставки не найден");

    console.log(`Supply #${supplyRecord.id}`);
    console.log(`SupplyItem #${supplyItem.id}`);
    console.log(`Batch #${suppliedBatch.id}`);
    console.log(`Batch quantity=${suppliedBatch.quantity}`);
    console.log(`Product.stock=${suppliedProduct.stock}`);
    console.log("");

    assert(
      suppliedBatch.quantity === 5,
      `После поставки Batch должен содержать 5, получено ${suppliedBatch.quantity}`
    );

    assert(
      suppliedProduct.stock === 5,
      `После поставки Product.stock должен быть 5, получено ${suppliedProduct.stock}`
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
      orderResponse.status === 200 || orderResponse.status === 201,
      `Заказ должен быть создан, получен HTTP ${orderResponse.status}`
    );

    assert(
      orderResponse.body?.id,
      "API не вернул ID созданного заказа"
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

    assert(createdOrder, `Заказ #${orderId} не найден после создания`);

    assert(
      createdOrder.items.length === 1,
      `В заказе должна быть 1 позиция, получено ${createdOrder.items.length}`
    );

    const orderItem = createdOrder.items[0];

    assert(
      orderItem.quantity === 5,
      `OrderItem.quantity должен быть 5, получено ${orderItem.quantity}`
    );

    assert(
      orderItem.returned === 0,
      `Перед возвратами returned должен быть 0, получено ${orderItem.returned}`
    );

    assert(
      orderItem.batches.length === 1,
      `Для одной партии должен быть один OrderBatch, получено ${orderItem.batches.length}`
    );

    const orderBatch = orderItem.batches[0];

    assert(
      orderBatch.quantity === 5,
      `OrderBatch.quantity должен быть 5, получено ${orderBatch.quantity}`
    );

    const afterSaleBatch = await prisma.batch.findUnique({
      where: {
        id: suppliedBatch.id,
      },
    });

    const afterSaleProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(afterSaleBatch, "Batch после продажи не найден");
    assert(afterSaleProduct, "Product после продажи не найден");

    console.log(`Order #${createdOrder.id}`);
    console.log(`OrderItem #${orderItem.id}`);
    console.log(`OrderBatch #${orderBatch.id}`);
    console.log(`OrderBatch quantity=${orderBatch.quantity}`);
    console.log(`Batch quantity after sale=${afterSaleBatch.quantity}`);
    console.log(`Product.stock after sale=${afterSaleProduct.stock}`);
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
    // 6. BASELINE BEFORE CONCURRENT RETURNS
    // =========================================================================

    console.log("6. BASELINE BEFORE CONCURRENT RETURNS");
    console.log("------------------------------------------------------------------------------");

    const beforeConcurrentReturnOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: true,
      },
    });

    assert(
      beforeConcurrentReturnOrder,
      "Заказ перед конкурентными возвратами не найден"
    );

    const beforeConcurrentReturnItem = beforeConcurrentReturnOrder.items[0];

    const beforeConcurrentReturnBatch = await prisma.batch.findUnique({
      where: {
        id: suppliedBatch.id,
      },
    });

    const beforeConcurrentReturnProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(
      beforeConcurrentReturnBatch,
      "Batch перед конкурентными возвратами не найден"
    );

    assert(
      beforeConcurrentReturnProduct,
      "Product перед конкурентными возвратами не найден"
    );

    const returnBatchesBefore =
      await prisma.returnBatch.count({
        where: {
          OrderItem: {
            orderId,
          },
        },
      });

    const returnMovementsBefore =
      await prisma.movement.count({
        where: {
          productId,
          type: "RETURN",
        },
      });

    console.log(
      `OrderItem.quantity=${beforeConcurrentReturnItem.quantity}`
    );
    console.log(
      `OrderItem.returned=${beforeConcurrentReturnItem.returned}`
    );
    console.log(
      `Batch.quantity=${beforeConcurrentReturnBatch.quantity}`
    );
    console.log(
      `Product.stock=${beforeConcurrentReturnProduct.stock}`
    );
    console.log(`ReturnBatch count=${returnBatchesBefore}`);
    console.log(`RETURN Movement count=${returnMovementsBefore}`);
    console.log("");

    assert(
      beforeConcurrentReturnItem.returned === 0,
      "До возвратов returned должен быть 0"
    );

    assert(
      beforeConcurrentReturnBatch.quantity === 0,
      "До возвратов Batch должен быть 0"
    );

    assert(
      beforeConcurrentReturnProduct.stock === 0,
      "До возвратов Product.stock должен быть 0"
    );

    // =========================================================================
    // 7. TWO CONCURRENT RETURNS OF 3 EACH
    // =========================================================================

    console.log("7. TWO CONCURRENT RETURNS OF 3 EACH");
    console.log("------------------------------------------------------------------------------");

    console.log("Отправляем одновременно:");
    console.log("  Return A = 3 шт");
    console.log("  Return B = 3 шт");
    console.log("");
    console.log("Продано всего = 5 шт");
    console.log("Следовательно, успешно вернуть одновременно можно");
    console.log("не более 5 шт суммарно.");
    console.log("");

    const returnBody = JSON.stringify({
      itemId: beforeConcurrentReturnItem.id,
      quantity: 3,
    });

    const [returnA, returnB] = await Promise.all([
      apiRequest(`/api/orders/${orderId}/return`, {
        method: "POST",
        body: returnBody,
      }),
      apiRequest(`/api/orders/${orderId}/return`, {
        method: "POST",
        body: returnBody,
      }),
    ]);

    console.log("RETURN A:");
    console.log(`HTTP ${returnA.status}`);
    console.log(JSON.stringify(returnA.body, null, 2));
    console.log("");

    console.log("RETURN B:");
    console.log(`HTTP ${returnB.status}`);
    console.log(JSON.stringify(returnB.body, null, 2));
    console.log("");

    const successfulReturns = [returnA, returnB].filter(
      (response) =>
        response.status >= 200 &&
        response.status < 300
    );

    const failedReturns = [returnA, returnB].filter(
      (response) =>
        response.status < 200 ||
        response.status >= 300
    );

    console.log(
      `Успешных возвратов=${successfulReturns.length}`
    );
    console.log(
      `Неуспешных возвратов=${failedReturns.length}`
    );
    console.log("");

    // =========================================================================
    // 8. READ FINAL ORDER STATE
    // =========================================================================

    console.log("8. FINAL ORDER STATE AFTER CONCURRENT RETURNS");
    console.log("------------------------------------------------------------------------------");

    const finalOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: {
          include: {
            batches: {
              orderBy: {
                id: "asc",
              },
            },
            ReturnBatch: {
              orderBy: {
                id: "asc",
              },
            },
          },
        },
      },
    });

    assert(
      finalOrder,
      `Заказ #${orderId} не найден после конкурентных возвратов`
    );

    const finalItem = finalOrder.items.find(
      (item) => item.id === beforeConcurrentReturnItem.id
    );

    assert(
      finalItem,
      `OrderItem #${beforeConcurrentReturnItem.id} не найден`
    );

    const finalBatch = await prisma.batch.findUnique({
      where: {
        id: suppliedBatch.id,
      },
    });

    const finalProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(finalBatch, "Финальный Batch не найден");
    assert(finalProduct, "Финальный Product не найден");

    const finalReturnBatches =
      await prisma.returnBatch.findMany({
        where: {
          OrderItem: {
            orderId,
          },
        },
        orderBy: {
          id: "asc",
        },
      });

    const finalReturnMovements =
      await prisma.movement.findMany({
        where: {
          productId,
          type: "RETURN",
        },
        orderBy: {
          id: "asc",
        },
      });

    const totalReturnedInHistory =
      finalReturnBatches.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

    const totalReturnMovementQuantity =
      finalReturnMovements.reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    console.log(`Order #${finalOrder.id}`);
    console.log(`Order.total=${finalOrder.total}`);
    console.log(`Order.profit=${finalOrder.profit}`);
    console.log(`Order.status=${finalOrder.status}`);
    console.log(`OrderItem.quantity=${finalItem.quantity}`);
    console.log(`OrderItem.returned=${finalItem.returned}`);
    console.log(`Batch.quantity=${finalBatch.quantity}`);
    console.log(`Batch.status=${finalBatch.status}`);
    console.log(`Product.stock=${finalProduct.stock}`);
    console.log(
      `SUM(Batch.quantity) for product=${(
        await prisma.batch.aggregate({
          where: {
            productId,
          },
          _sum: {
            quantity: true,
          },
        })
      )._sum.quantity ?? 0}`
    );
    console.log(
      `ReturnBatch count=${finalReturnBatches.length}`
    );
    console.log(
      `ReturnBatch total=${totalReturnedInHistory}`
    );
    console.log(
      `RETURN Movement count=${finalReturnMovements.length}`
    );
    console.log(
      `RETURN Movement total=${totalReturnMovementQuantity}`
    );
    console.log("");

    // =========================================================================
    // 9. CONCURRENCY INVARIANTS
    // =========================================================================

    console.log("9. CONCURRENCY INVARIANTS");
    console.log("------------------------------------------------------------------------------");

    assert(
      finalItem.returned <= finalItem.quantity,
      `КРИТИЧЕСКАЯ ОШИБКА: returned=${finalItem.returned} > quantity=${finalItem.quantity}`
    );

    assert(
      totalReturnedInHistory === finalItem.returned,
      `ReturnBatch total=${totalReturnedInHistory} не совпадает с returned=${finalItem.returned}`
    );

    assert(
      finalItem.returned <= 5,
      `КРИТИЧЕСКАЯ ОШИБКА: возвращено ${finalItem.returned}, хотя продано только 5`
    );

    assert(
      finalBatch.quantity === finalItem.returned,
      `Batch.quantity=${finalBatch.quantity} должен совпадать с возвращённым количеством=${finalItem.returned}`
    );

    assert(
      finalProduct.stock === finalItem.returned,
      `Product.stock=${finalProduct.stock} должен совпадать с возвращённым количеством=${finalItem.returned}`
    );

    assert(
      totalReturnMovementQuantity === finalItem.returned,
      `RETURN movements=${totalReturnMovementQuantity} не совпадают с returned=${finalItem.returned}`
    );

    assert(
      finalReturnMovements.length === finalReturnBatches.length,
      `Количество RETURN movements=${finalReturnMovements.length} должно совпадать с ReturnBatch=${finalReturnBatches.length}`
    );

    assert(
      finalOrder.total ===
        (finalItem.quantity - finalItem.returned) *
          finalItem.price,
      `Order.total=${finalOrder.total} не соответствует NET quantity`
    );

    const expectedProfit =
      (finalItem.quantity - finalItem.returned) *
        finalItem.price -
      (finalItem.quantity - finalItem.returned) *
        orderBatch.purchaseCost;

    assert(
      finalOrder.profit === expectedProfit,
      `Order.profit=${finalOrder.profit}, ожидалось ${expectedProfit}`
    );

    if (finalItem.returned === 5) {
      assert(
        finalOrder.status === "RETURNED",
        `При полном возврате статус должен быть RETURNED, получен ${finalOrder.status}`
      );
    } else if (finalItem.returned > 0) {
      assert(
        finalOrder.status === "PARTIAL_RETURN",
        `При частичном возврате статус должен быть PARTIAL_RETURN, получен ${finalOrder.status}`
      );
    }

    console.log("🟢 returned <= quantity");
    console.log("🟢 ReturnBatch total == OrderItem.returned");
    console.log("🟢 returned <= реально проданного количества");
    console.log("🟢 Batch.quantity соответствует возвратам");
    console.log("🟢 Product.stock соответствует возвратам");
    console.log("🟢 RETURN movements соответствуют возвратам");
    console.log("🟢 Order.total соответствует NET quantity");
    console.log("🟢 Order.profit соответствует NET quantity");
    console.log("🟢 Order.status соответствует возвратам");
    console.log("");

    // =========================================================================
    // 10. IMPORTANT RESULT
    // =========================================================================

    console.log("10. CONCURRENT RETURN RESULT");
    console.log("------------------------------------------------------------------------------");

    if (
      successfulReturns.length === 1 &&
      failedReturns.length === 1
    ) {
      console.log(
        "🟢 ИДЕАЛЬНЫЙ РЕЗУЛЬТАТ: один конкурентный возврат прошёл,"
      );
      console.log(
        "а второй был отклонён из-за недостаточного остатка возврата."
      );
    } else if (
      successfulReturns.length === 2 &&
      finalItem.returned <= finalItem.quantity
    ) {
      console.log(
        "🟢 ОБА ЗАПРОСА ПРОШЛИ, НО СУММАРНЫЙ РЕЗУЛЬТАТ ОСТАЛСЯ В ПРЕДЕЛАХ ПРОДАННОГО."
      );
      console.log(
        "Это допустимо только если транзакционная логика корректно распределила остаток."
      );
    } else {
      throw new Error(
        `Неожиданный результат конкурентных возвратов: successful=${successfulReturns.length}, failed=${failedReturns.length}, returned=${finalItem.returned}`
      );
    }

    console.log("");

    // =========================================================================
    // 11. DELETE ORDER AFTER RETURNS
    // =========================================================================

    console.log("11. DELETE ORDER AFTER CONCURRENT RETURNS");
    console.log("------------------------------------------------------------------------------");

    const stockBeforeDelete = finalProduct.stock;

    const batchBeforeDelete = await prisma.batch.findUnique({
      where: {
        id: suppliedBatch.id,
      },
    });

    assert(
      batchBeforeDelete,
      "Batch перед DELETE не найден"
    );

    const quantityBeforeDelete =
      batchBeforeDelete.quantity;

    console.log(
      `Product.stock before DELETE=${stockBeforeDelete}`
    );
    console.log(
      `Batch #${batchBeforeDelete.id} quantity before DELETE=${quantityBeforeDelete}`
    );
    console.log(
      `OrderItem.returned before DELETE=${finalItem.returned}`
    );
    console.log("");

    const deleteResponse = await apiRequest(
      `/api/orders/${orderId}`,
      {
        method: "DELETE",
      }
    );

    console.log(`HTTP ${deleteResponse.status}`);
    console.log(
      JSON.stringify(deleteResponse.body, null, 2)
    );
    console.log("");

    assert(
      deleteResponse.status === 200,
      `DELETE заказа должен завершиться HTTP200, получен ${deleteResponse.status}`
    );

    // =========================================================================
    // 12. VERIFY DELETE RESTORATION
    // =========================================================================

    console.log("12. VERIFY DELETE RESTORATION");
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

    const afterDeleteBatch = await prisma.batch.findUnique({
      where: {
        id: suppliedBatch.id,
      },
    });

    const afterDeleteProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    assert(
      !deletedOrder,
      `Заказ #${orderId} должен быть удалён`
    );

    assert(
      deletedOrderItems === 0,
      `OrderItems заказа должны быть удалены, осталось ${deletedOrderItems}`
    );

    assert(
      deletedOrderBatches === 0,
      `OrderBatches заказа должны быть удалены, осталось ${deletedOrderBatches}`
    );

    assert(
      deletedReturnBatches === 0,
      `ReturnBatches заказа должны быть удалены, осталось ${deletedReturnBatches}`
    );

    assert(
      afterDeleteBatch,
      "Batch после DELETE не найден"
    );

    assert(
      afterDeleteProduct,
      "Product после DELETE не найден"
    );

    console.log(
      `Batch quantity after DELETE=${afterDeleteBatch.quantity}`
    );
    console.log(
      `Product.stock after DELETE=${afterDeleteProduct.stock}`
    );
    console.log(
      `Batch status after DELETE=${afterDeleteBatch.status}`
    );
    console.log("");

    // =========================================================================
    // 13. VERIFY NO DOUBLE RESTORATION
    // =========================================================================

    console.log("13. VERIFY NO DOUBLE RESTORATION");
    console.log("------------------------------------------------------------------------------");

    const expectedRestoredQuantity =
      5 - quantityBeforeDelete;

    assert(
      afterDeleteBatch.quantity ===
        quantityBeforeDelete +
          expectedRestoredQuantity,
      `После DELETE Batch должен восстановиться на ${expectedRestoredQuantity}. Получено ${afterDeleteBatch.quantity}`
    );

    assert(
      afterDeleteProduct.stock ===
        afterDeleteBatch.quantity,
      `Product.stock=${afterDeleteProduct.stock} должен совпадать с Batch.quantity=${afterDeleteBatch.quantity}`
    );

    assert(
      afterDeleteBatch.quantity === 5,
      `После DELETE конечное количество Batch должно быть 5, получено ${afterDeleteBatch.quantity}`
    );

    assert(
      afterDeleteProduct.stock === 5,
      `После DELETE Product.stock должен быть 5, получено ${afterDeleteProduct.stock}`
    );

    console.log(
      `🟢 Восстановлено DELETE=${expectedRestoredQuantity} шт`
    );
    console.log(
      "🟢 Конечный Batch quantity=5"
    );
    console.log(
      "🟢 Конечный Product.stock=5"
    );
    console.log(
      "🟢 Двойного восстановления нет"
    );
    console.log("");

    // =========================================================================
    // 14. CHECK RESTORATION MOVEMENTS
    // =========================================================================

    console.log("14. CHECK RESTORATION MOVEMENTS");
    console.log("------------------------------------------------------------------------------");

    const allProductMovements =
      await prisma.movement.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    const supplyMovements =
      allProductMovements.filter(
        (movement) => movement.type === "SUPPLY"
      );

    const saleMovements =
      allProductMovements.filter(
        (movement) => movement.type === "SALE"
      );

    const returnMovements =
      allProductMovements.filter(
        (movement) => movement.type === "RETURN"
      );

    const writeOffMovements =
      allProductMovements.filter(
        (movement) => movement.type === "WRITE_OFF"
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

    const writeOffNet = writeOffMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const movementNet =
      supplyNet +
      saleNet +
      returnNet +
      writeOffNet;

    console.log(`SUPPLY net=${supplyNet}`);
    console.log(`SALE net=${saleNet}`);
    console.log(`RETURN net=${returnNet}`);
    console.log(`WRITE_OFF net=${writeOffNet}`);
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
      writeOffNet === 0,
      `WRITE_OFF net должен быть 0, получено ${writeOffNet}`
    );

    assert(
      movementNet === 5,
      `Общий movement NET должен быть +5, получено ${movementNet}`
    );

    assert(
      afterDeleteProduct.stock === movementNet,
      `Product.stock=${afterDeleteProduct.stock} должен совпадать с movement NET=${movementNet}`
    );

    console.log("🟢 SUPPLY +5");
    console.log("🟢 SALE -5");
    console.log("🟢 RETURN +5");
    console.log("🟢 WRITE_OFF 0");
    console.log("🟢 NET +5");
    console.log("🟢 NET совпадает с Product.stock");
    console.log("");

    // =========================================================================
    // 15. REPEATED DELETE MUST BE 404
    // =========================================================================

    console.log("15. REPEATED DELETE MUST BE 404");
    console.log("------------------------------------------------------------------------------");

    const movementCountBeforeRepeatedDelete =
      await prisma.movement.count();

    const stockBeforeRepeatedDelete =
      afterDeleteProduct.stock;

    const repeatedDeleteResponse =
      await apiRequest(`/api/orders/${orderId}`, {
        method: "DELETE",
      });

    console.log(
      `HTTP ${repeatedDeleteResponse.status}`
    );
    console.log(
      JSON.stringify(
        repeatedDeleteResponse.body,
        null,
        2
      )
    );
    console.log("");

    assert(
      repeatedDeleteResponse.status === 404,
      `Повторный DELETE должен вернуть HTTP404, получен ${repeatedDeleteResponse.status}`
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
      `Повторный DELETE изменил количество Movement: было ${movementCountBeforeRepeatedDelete}, стало ${movementCountAfterRepeatedDelete}`
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
    // 16. FINAL PRODUCT/BATCH CONSISTENCY
    // =========================================================================

    console.log("16. FINAL PRODUCT/BATCH CONSISTENCY");
    console.log("------------------------------------------------------------------------------");

    const finalConsistencyProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      finalConsistencyProduct,
      "Финальный Product не найден"
    );

    const finalBatchSum =
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
      `Product.stock=${finalConsistencyProduct.stock}`
    );
    console.log(
      `SUM(Batch.quantity)=${finalBatchSum}`
    );
    console.log("");

    assert(
      finalConsistencyProduct.stock === finalBatchSum,
      `Product.stock=${finalConsistencyProduct.stock} не совпадает с SUM(Batch.quantity)=${finalBatchSum}`
    );

    assert(
      finalConsistencyProduct.stock === 5,
      `Финальный stock должен быть 5, получено ${finalConsistencyProduct.stock}`
    );

    console.log(
      "🟢 Product.stock == SUM(Batch.quantity)"
    );
    console.log(
      "🟢 Финальный stock = 5"
    );
    console.log("");

    // =========================================================================
    // 17. SUCCESS
    // =========================================================================

    console.log("==============================================================================");
    console.log("V63 RESULT");
    console.log("==============================================================================");
    console.log("");

    console.log(
      "🟢 CONCURRENT RETURN TEST PASSED"
    );
    console.log("");
    console.log(
      "Проверено:"
    );
    console.log(
      "1. Два одновременных возврата."
    );
    console.log(
      "2. Нельзя вернуть больше реально проданного количества."
    );
    console.log(
      "3. OrderItem.returned не превышает quantity."
    );
    console.log(
      "4. ReturnBatch соответствует фактическому возврату."
    );
    console.log(
      "5. Batch.quantity соответствует возврату."
    );
    console.log(
      "6. Product.stock соответствует Batch."
    );
    console.log(
      "7. Order.total пересчитывается корректно."
    );
    console.log(
      "8. Order.profit пересчитывается корректно."
    );
    console.log(
      "9. Order.status соответствует возврату."
    );
    console.log(
      "10. DELETE корректно восстанавливает непроданное количество."
    );
    console.log(
      "11. DELETE не делает двойного восстановления."
    );
    console.log(
      "12. Повторный DELETE не меняет базу."
    );
    console.log(
      "13. Movement history остаётся согласованной."
    );
    console.log("");
  } catch (error) {
    console.error("");
    console.error("==============================================================================");
    console.error("🔴 V63 FAILED");
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
    console.log("V63 CLEANUP");
    console.log("==============================================================================");
    console.log("");

    try {
      // Удаляем тестовый заказ, если он каким-либо образом остался.
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

      // Удаляем движения тестового товара.
      if (productId !== null) {
        await prisma.movement.deleteMany({
          where: {
            productId,
          },
        });
      }

      // Удаляем партии тестового товара.
      if (batchIds.length > 0) {
        await prisma.batch.deleteMany({
          where: {
            id: {
              in: batchIds,
            },
          },
        });
      }

      // На случай, если Batch был создан, но его ID не попал
      // в batchIds из-за ошибки теста.
      if (productId !== null) {
        await prisma.batch.deleteMany({
          where: {
            productId,
          },
        });
      }

      // Удаляем SupplyItems и Supplies тестового поставщика.
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

      // Удаляем тестовый продукт.
      if (productId !== null) {
        await prisma.product.deleteMany({
          where: {
            id: productId,
          },
        });
      }

      // Удаляем тестового поставщика.
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
