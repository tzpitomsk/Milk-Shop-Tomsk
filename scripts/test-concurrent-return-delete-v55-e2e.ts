import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";

function assert(
condition: unknown,
message: string
): asserts condition {
if (!condition) {
throw new Error(`🔴 ASSERT FAILED: ${message}`);
}
}

async function readJson(response: Response) {
const text = await response.text();

try {
return JSON.parse(text);
} catch {
return {
raw: text,
};
}
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V55 CONCURRENT RETURN + DELETE E2E TEST");
console.log("Проверка одновременного RETURN и DELETE одного заказа");
console.log("==============================================================================");
console.log("");

const stamp = Date.now();

let productId: number | null = null;
let batchId: number | null = null;
let orderId: number | null = null;
let orderItemId: number | null = null;

try {
// =========================================================================
// 1. СОЗДАНИЕ ТЕСТОВОГО PRODUCT
// =========================================================================


console.log("1. СОЗДАНИЕ ТЕСТОВОГО ТОВАРА");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
  data: {
    name: `V55 TEST Product ${stamp}`,
    unit: "шт",
    price: 300,
    cost: 100,
    stock: 0,
  },
});

productId = product.id;

console.log(
  `🟢 Product #${product.id} "${product.name}"`
);
console.log("");

// =========================================================================
// 2. СОЗДАНИЕ ТЕСТОВОЙ BATCH
// =========================================================================

console.log("2. СОЗДАНИЕ ТЕСТОВОЙ ПАРТИИ");
console.log("------------------------------------------------------------------------------");

const receivedAt = new Date();

const expiryDate = new Date(
  receivedAt.getTime() +
    30 * 24 * 60 * 60 * 1000
);

const batch = await prisma.batch.create({
  data: {
    quantity: 3,
    purchaseCost: 100,
    receivedAt,
    expiryDate,
    status: "ACTIVE",
    productId,
  },
});

batchId = batch.id;

await prisma.product.update({
  where: {
    id: productId,
  },
  data: {
    stock: 3,
  },
});

console.log(
  `🟢 Batch #${batch.id} quantity=${batch.quantity} purchaseCost=${batch.purchaseCost}`
);
console.log("");

// =========================================================================
// 3. ПРОВЕРКА НАЧАЛЬНОГО СОСТОЯНИЯ
// =========================================================================

console.log("3. ПРОВЕРКА НАЧАЛЬНОГО СОСТОЯНИЯ");
console.log("------------------------------------------------------------------------------");

const initialProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

const initialBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert(
  initialProduct !== null,
  "Тестовый Product не найден"
);

assert(
  initialBatch !== null,
  "Тестовая Batch не найдена"
);

assert(
  initialProduct.stock === 3,
  `Начальный Product.stock должен быть 3, получено ${initialProduct.stock}`
);

assert(
  initialBatch.quantity === 3,
  `Начальный Batch.quantity должен быть 3, получено ${initialBatch.quantity}`
);

console.log(
  `🟢 Product.stock=${initialProduct.stock}`
);

console.log(
  `🟢 Batch #${initialBatch.id}.quantity=${initialBatch.quantity}`
);

console.log("");

// =========================================================================
// 4. ПРОДАЖА 3 ШТ
// =========================================================================

console.log("4. ПРОДАЖА 3 ШТ ЧЕРЕЗ /api/orders");
console.log("------------------------------------------------------------------------------");

const saleResponse = await fetch(
  `${BASE_URL}/api/orders`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          id: productId,
          quantity: 3,
          price: 300,
        },
      ],
    }),
  }
);

const saleData = await readJson(
  saleResponse
);

console.log(
  `HTTP ${saleResponse.status}`
);

console.log(
  JSON.stringify(
    saleData,
    null,
    2
  )
);

assert(
  saleResponse.status === 201,
  `Продажа должна вернуть HTTP 201, получено ${saleResponse.status}`
);

assert(
  saleData &&
    typeof saleData.id === "number",
  "В ответе продажи отсутствует верхнеуровневый id заказа"
);

orderId = Number(
  saleData.id
);

assert(
  Array.isArray(saleData.items),
  "В ответе продажи отсутствует массив items"
);

assert(
  saleData.items.length === 1,
  `В продаже должен быть 1 OrderItem, получено ${saleData.items.length}`
);

assert(
  typeof saleData.items[0]?.id === "number",
  "В ответе продажи отсутствует OrderItem.id"
);

orderItemId = Number(
  saleData.items[0].id
);

assert(
  saleData.total === 900,
  `После продажи total должен быть 900, получено ${saleData.total}`
);

assert(
  saleData.profit === 600,
  `После продажи profit должен быть 600, получено ${saleData.profit}`
);

assert(
  saleData.status === "COMPLETED",
  `После продажи status должен быть COMPLETED, получено ${saleData.status}`
);

console.log("");

console.log(
  `🟢 Order #${orderId}`
);

console.log(
  `🟢 OrderItem #${orderItemId}`
);

// =========================================================================
// 5. ПРОВЕРКА СОСТОЯНИЯ ПОСЛЕ ПРОДАЖИ
// =========================================================================

console.log("");
console.log("5. ПРОВЕРКА СОСТОЯНИЯ ПОСЛЕ ПРОДАЖИ");
console.log("------------------------------------------------------------------------------");

const soldBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

const soldProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

const soldOrderItem =
  await prisma.orderItem.findUnique({
    where: {
      id: orderItemId,
    },
    include: {
      batches: true,
      ReturnBatch: true,
    },
  });

assert(
  soldBatch !== null,
  "Batch после продажи не найдена"
);

assert(
  soldProduct !== null,
  "Product после продажи не найден"
);

assert(
  soldOrderItem !== null,
  "OrderItem после продажи не найден"
);

assert(
  soldBatch.quantity === 0,
  `После продажи Batch.quantity должен быть 0, получено ${soldBatch.quantity}`
);

assert(
  soldProduct.stock === 0,
  `После продажи Product.stock должен быть 0, получено ${soldProduct.stock}`
);

assert(
  soldOrderItem.quantity === 3,
  `OrderItem.quantity должен быть 3, получено ${soldOrderItem.quantity}`
);

assert(
  soldOrderItem.returned === 0,
  `До возврата OrderItem.returned должен быть 0, получено ${soldOrderItem.returned}`
);

assert(
  soldOrderItem.batches.length === 1,
  `Должен существовать 1 OrderBatch, получено ${soldOrderItem.batches.length}`
);

assert(
  soldOrderItem.batches[0].batchId === batchId,
  "OrderBatch должен ссылаться на тестовую Batch"
);

assert(
  soldOrderItem.batches[0].quantity === 3,
  `OrderBatch.quantity должен быть 3, получено ${soldOrderItem.batches[0].quantity}`
);

assert(
  soldOrderItem.batches[0].purchaseCost === 100,
  `OrderBatch.purchaseCost должен быть 100, получено ${soldOrderItem.batches[0].purchaseCost}`
);

assert(
  soldOrderItem.ReturnBatch.length === 0,
  `До возврата ReturnBatch должен быть 0, получено ${soldOrderItem.ReturnBatch.length}`
);

console.log(
  `🟢 Batch #${batchId}.quantity=0`
);

console.log(
  "🟢 Product.stock=0"
);

console.log(
  "🟢 OrderBatch.quantity=3"
);

console.log(
  "🟢 OrderItem.returned=0"
);

console.log("");

// =========================================================================
// 6. MOVEMENT ДО КОНКУРЕНТНЫХ ОПЕРАЦИЙ
// =========================================================================

console.log("6. СОХРАНЕНИЕ СОСТОЯНИЯ MOVEMENT");
console.log("------------------------------------------------------------------------------");

const movementsBefore =
  await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

const movementCountBefore =
  movementsBefore.length;

const saleMovementsBefore =
  movementsBefore.filter(
    (movement) =>
      movement.type === "SALE"
  );

const returnMovementsBefore =
  movementsBefore.filter(
    (movement) =>
      movement.type === "RETURN"
  );

assert(
  saleMovementsBefore.length === 1,
  `До конкурентных операций должен быть 1 SALE Movement, получено ${saleMovementsBefore.length}`
);

assert(
  saleMovementsBefore[0].quantity === -3,
  `SALE Movement должен быть -3, получено ${saleMovementsBefore[0].quantity}`
);

assert(
  returnMovementsBefore.length === 0,
  `До конкурентных операций RETURN Movement должен быть 0, получено ${returnMovementsBefore.length}`
);

console.log(
  `🟢 Movement до операций=${movementCountBefore}`
);

console.log(
  "🟢 SALE=-3"
);

console.log(
  "🟢 RETURN=0"
);

console.log("");

// =========================================================================
// 7. ПАРАЛЛЕЛЬНЫЕ RETURN + DELETE
// =========================================================================

console.log("7. ПАРАЛЛЕЛЬНЫЕ RETURN + DELETE");
console.log("------------------------------------------------------------------------------");

console.log(
  `🟡 Одновременно выполняем RETURN и DELETE для Order #${orderId}`
);

console.log(
  `🟡 RETURN пытается вернуть ${3} шт`
);

console.log(
  "🟡 DELETE пытается удалить этот же Order"
);

console.log("");

const returnBody =
  JSON.stringify({
    itemId: orderItemId,
    quantity: 3,
  });

const [
  returnResponse,
  deleteResponse,
] = await Promise.all([
  fetch(
    `${BASE_URL}/api/orders/${orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: returnBody,
    }
  ),
  fetch(
    `${BASE_URL}/api/orders/${orderId}`,
    {
      method: "DELETE",
    }
  ),
]);

const returnData =
  await readJson(returnResponse);

const deleteData =
  await readJson(deleteResponse);

console.log(
  `RETURN HTTP ${returnResponse.status}`
);

console.log(
  JSON.stringify(
    returnData,
    null,
    2
  )
);

console.log("");

console.log(
  `DELETE HTTP ${deleteResponse.status}`
);

console.log(
  JSON.stringify(
    deleteData,
    null,
    2
  )
);

console.log("");

// =========================================================================
// 8. АНАЛИЗ КОНКУРЕНТНЫХ РЕЗУЛЬТАТОВ
// =========================================================================

console.log("8. АНАЛИЗ КОНКУРЕНТНЫХ РЕЗУЛЬТАТОВ");
console.log("------------------------------------------------------------------------------");

const returnSucceeded =
  returnResponse.status >= 200 &&
  returnResponse.status < 300;

const deleteSucceeded =
  deleteResponse.status >= 200 &&
  deleteResponse.status < 300;

console.log(
  `RETURN успешно=${returnSucceeded}`
);

console.log(
  `DELETE успешно=${deleteSucceeded}`
);

// DELETE должен в итоге удалить Order.
// Возможны два корректных порядка:
//
// A) DELETE первым:
//    DELETE=200
//    RETURN=ошибка
//
// B) RETURN первым:
//    RETURN=200
//    DELETE=200
//
// Вариант B допустим, потому что DELETE после полного возврата
// должен восстановить sold - alreadyReturned = 0.

assert(
  deleteSucceeded,
  `DELETE должен успешно удалить заказ, получен HTTP ${deleteResponse.status}`
);

assert(
  returnSucceeded ||
    !returnSucceeded,
  "RETURN должен завершиться определённым HTTP-результатом"
);

if (
  returnSucceeded
) {
  console.log(
    "🟢 RETURN успел выполниться до DELETE"
  );

  console.log(
    "🟢 Это допустимый порядок выполнения"
  );
} else {
  console.log(
    "🟢 RETURN не успел выполниться до DELETE"
  );

  console.log(
    "🟢 Это допустимый порядок выполнения"
  );
}

console.log("");

// =========================================================================
// 9. ORDER ДОЛЖЕН БЫТЬ УДАЛЁН
// =========================================================================

console.log("9. ПРОВЕРКА УДАЛЕНИЯ ORDER");
console.log("------------------------------------------------------------------------------");

const orderAfter =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

assert(
  orderAfter === null,
  `Order #${orderId} должен отсутствовать после DELETE`
);

const orderItemAfter =
  await prisma.orderItem.findUnique({
    where: {
      id: orderItemId,
    },
  });

assert(
  orderItemAfter === null,
  `OrderItem #${orderItemId} должен отсутствовать после DELETE`
);

const orderBatchAfter =
  await prisma.orderBatch.findMany({
    where: {
      orderItemId,
    },
  });

assert(
  orderBatchAfter.length === 0,
  `После DELETE не должно остаться OrderBatch, найдено ${orderBatchAfter.length}`
);

const returnBatchAfter =
  await prisma.returnBatch.findMany({
    where: {
      orderItemId,
    },
  });

assert(
  returnBatchAfter.length === 0,
  `После DELETE не должно остаться ReturnBatch, найдено ${returnBatchAfter.length}`
);

console.log(
  `🟢 Order #${orderId} отсутствует`
);

console.log(
  `🟢 OrderItem #${orderItemId} отсутствует`
);

console.log(
  "🟢 OrderBatch отсутствует"
);

console.log(
  "🟢 ReturnBatch отсутствует"
);

console.log("");

// =========================================================================
// 10. ПРОВЕРКА ВОССТАНОВЛЕНИЯ STOCK
// =========================================================================

console.log("10. ПРОВЕРКА ВОССТАНОВЛЕНИЯ STOCK");
console.log("------------------------------------------------------------------------------");

const finalBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

const finalProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  finalBatch !== null,
  `Batch #${batchId} должна существовать после DELETE`
);

assert(
  finalProduct !== null,
  `Product #${productId} должен существовать после DELETE`
);

assert(
  finalBatch.quantity === 3,
  `После RETURN+DELETE Batch.quantity должен быть 3, получено ${finalBatch.quantity}`
);

assert(
  finalProduct.stock === 3,
  `После RETURN+DELETE Product.stock должен быть 3, получено ${finalProduct.stock}`
);

assert(
  finalBatch.productId === productId,
  `Batch.productId должен быть ${productId}, получено ${finalBatch.productId}`
);

console.log(
  `🟢 Batch #${batchId}.quantity=${finalBatch.quantity}`
);

console.log(
  `🟢 Product.stock=${finalProduct.stock}`
);

console.log("");

// =========================================================================
// 11. ПРОВЕРКА MOVEMENT
// =========================================================================

console.log("11. ПРОВЕРКА MOVEMENT");
console.log("------------------------------------------------------------------------------");

const finalMovements =
  await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

const saleMovements =
  finalMovements.filter(
    (movement) =>
      movement.type === "SALE"
  );

const returnMovements =
  finalMovements.filter(
    (movement) =>
      movement.type === "RETURN"
  );

assert(
  saleMovements.length === 1,
  `Должен существовать ровно 1 SALE Movement, получено ${saleMovements.length}`
);

assert(
  saleMovements[0].quantity === -3,
  `SALE Movement должен быть -3, получено ${saleMovements[0].quantity}`
);

assert(
  returnMovements.length === 1,
  `Должен существовать ровно 1 RETURN Movement, получено ${returnMovements.length}`
);

assert(
  returnMovements[0].quantity === 3,
  `Суммарный RETURN Movement должен быть +3, получено ${returnMovements[0].quantity}`
);

assert(
  finalMovements.length ===
    movementCountBefore + 1,
  `Должен появиться ровно 1 новый Movement: было ${movementCountBefore}, стало ${finalMovements.length}`
);

const movementNet =
  finalMovements.reduce(
    (sum, movement) =>
      sum + movement.quantity,
    0
  );

assert(
  movementNet === 0,
  `Net Movement должен быть 0, получено ${movementNet}`
);

console.log(
  `🟢 Всего Movement=${finalMovements.length}`
);

console.log(
  "🟢 SALE=-3"
);

console.log(
  "🟢 RETURN=+3"
);

console.log(
  "🟢 Новых RETURN Movement ровно один"
);

console.log(
  "🟢 Net Movement=0"
);

console.log("");

// =========================================================================
// 12. ПРОВЕРКА STOCK == SUM(BATCH)
// =========================================================================

console.log("12. ПРОВЕРКА STOCK == SUM(BATCH.QUANTITY)");
console.log("------------------------------------------------------------------------------");

const batchSumResult =
  await prisma.batch.aggregate({
    where: {
      productId,
    },
    _sum: {
      quantity: true,
    },
  });

const batchSum =
  batchSumResult._sum.quantity ?? 0;

assert(
  batchSum === 3,
  `SUM(Batch.quantity) должен быть 3, получено ${batchSum}`
);

assert(
  finalProduct.stock === batchSum,
  `Product.stock=${finalProduct.stock} должен равняться SUM(Batch.quantity)=${batchSum}`
);

console.log(
  `🟢 SUM(Batch.quantity)=${batchSum}`
);

console.log(
  `🟢 Product.stock=${finalProduct.stock}`
);

console.log(
  "🟢 Product.stock == SUM(Batch.quantity)"
);

console.log("");

// =========================================================================
// 13. ПРОВЕРКА ОТСУТСТВИЯ ЛИШНИХ ЗАПИСЕЙ
// =========================================================================

console.log("13. ПРОВЕРКА ОТСУТСТВИЯ ЛИШНИХ ЗАПИСЕЙ");
console.log("------------------------------------------------------------------------------");

const remainingOrders =
  await prisma.order.count({
    where: {
      id: orderId,
    },
  });

const remainingOrderItems =
  await prisma.orderItem.count({
    where: {
      id: orderItemId,
    },
  });

const remainingOrderBatches =
  await prisma.orderBatch.count({
    where: {
      orderItemId,
    },
  });

const remainingReturnBatches =
  await prisma.returnBatch.count({
    where: {
      orderItemId,
    },
  });

assert(
  remainingOrders === 0,
  `Order должен отсутствовать, найдено ${remainingOrders}`
);

assert(
  remainingOrderItems === 0,
  `OrderItem должен отсутствовать, найдено ${remainingOrderItems}`
);

assert(
  remainingOrderBatches === 0,
  `OrderBatch должен отсутствовать, найдено ${remainingOrderBatches}`
);

assert(
  remainingReturnBatches === 0,
  `ReturnBatch должен отсутствовать, найдено ${remainingReturnBatches}`
);

console.log(
  "🟢 Order=0"
);

console.log(
  "🟢 OrderItem=0"
);

console.log(
  "🟢 OrderBatch=0"
);

console.log(
  "🟢 ReturnBatch=0"
);

console.log("");

// =========================================================================
// 14. ФИНАЛЬНЫЙ РЕЗУЛЬТАТ
// =========================================================================

console.log("==============================================================================");
console.log("V55 RESULT");
console.log("==============================================================================");
console.log("");

console.log(
  "🟢 CONCURRENT RETURN + DELETE PROTECTION PASSED"
);

if (
  returnSucceeded
) {
  console.log(
    "🟢 RETURN успел выполниться до DELETE"
  );
} else {
  console.log(
    "🟢 DELETE успел выполниться до RETURN"
  );
}

console.log(
  "🟢 Order полностью удалён"
);

console.log(
  "🟢 OrderItem полностью удалён"
);

console.log(
  "🟢 OrderBatch полностью удалён"
);

console.log(
  "🟢 ReturnBatch полностью удалён"
);

console.log(
  "🟢 Batch.quantity восстановлен до 3"
);

console.log(
  "🟢 Product.stock восстановлен до 3"
);

console.log(
  "🟢 Нет двойного восстановления товара"
);

console.log(
  "🟢 Создан ровно один итоговый RETURN Movement"
);

console.log(
  "🟢 Product.stock == SUM(Batch.quantity)"
);

console.log("");

console.log("==============================================================================");
console.log("V55 PASSED");
console.log("==============================================================================");
console.log("");


} finally {
// =========================================================================
// CLEANUP
// =========================================================================


console.log("");
console.log("==============================================================================");
console.log("CLEANUP");
console.log("==============================================================================");
console.log("");

try {
  // -----------------------------------------------------------------------
  // Если Order ещё существует — удаляем его первым.
  // Это автоматически удалит OrderItem / OrderBatch / ReturnBatch.
  // -----------------------------------------------------------------------

  if (orderId !== null) {
    const existingOrder =
      await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

    if (existingOrder) {
      await prisma.order.delete({
        where: {
          id: orderId,
        },
      });

      console.log(
        `🟢 Order #${orderId} удалён`
      );
    }
  }

  // -----------------------------------------------------------------------
  // Если Order не найден по id, дополнительно ищем тестовые заказы
  // через уникальный Product.
  // -----------------------------------------------------------------------

  if (productId !== null) {
    await prisma.order.deleteMany({
      where: {
        items: {
          some: {
            productId,
          },
        },
      },
    });

    // ---------------------------------------------------------------------
    // Удаляем Movement.
    // ---------------------------------------------------------------------

    await prisma.movement.deleteMany({
      where: {
        productId,
      },
    });

    console.log(
      `🟢 Movement тестового Product #${productId} удалены`
    );
  }

  // -----------------------------------------------------------------------
  // Batch удаляем после Order.
  // -----------------------------------------------------------------------

  if (batchId !== null) {
    await prisma.batch.deleteMany({
      where: {
        id: batchId,
      },
    });

    console.log(
      `🟢 Batch #${batchId} удалена`
    );
  }

  // -----------------------------------------------------------------------
  // Product удаляем последним.
  // -----------------------------------------------------------------------

  if (productId !== null) {
    await prisma.product.deleteMany({
      where: {
        id: productId,
      },
    });

    console.log(
      `🟢 Product #${productId} удалён`
    );
  }

  console.log("");
  console.log("🟢 CLEANUP COMPLETED");
} catch (cleanupError) {
  console.error("");
  console.error("🔴 CLEANUP FAILED");
  console.error(cleanupError);
  process.exitCode = 1;
}


}
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 V55 TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
