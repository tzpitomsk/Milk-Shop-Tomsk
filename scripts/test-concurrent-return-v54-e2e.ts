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
console.log("V54 CONCURRENT RETURN E2E TEST");
console.log("Проверка защиты от двойного параллельного возврата");
console.log("==============================================================================");
console.log("");

const stamp = Date.now();

let productId: number | null = null;
let batchId: number | null = null;
let orderId: number | null = null;
let orderItemId: number | null = null;

try {
// =========================================================================
// 1. СОЗДАНИЕ ТЕСТОВОГО ТОВАРА
// =========================================================================


console.log("1. СОЗДАНИЕ ТЕСТОВОГО ТОВАРА");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
  data: {
    name: `V54 TEST Product ${stamp}`,
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
// 2. СОЗДАНИЕ ТЕСТОВОЙ ПАРТИИ
// =========================================================================

console.log("2. СОЗДАНИЕ ТЕСТОВОЙ ПАРТИИ");
console.log("------------------------------------------------------------------------------");

const receivedAt = new Date();
const expiryDate = new Date(
  receivedAt.getTime() + 30 * 24 * 60 * 60 * 1000
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

const initialProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

const initialBatch = await prisma.batch.findUnique({
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
// 4. ПРОДАЖА 3 ШТ ЧЕРЕЗ /api/orders
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

const saleData = await readJson(saleResponse);

console.log(`HTTP ${saleResponse.status}`);

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

// ВАЖНО:
// /api/orders возвращает сам Order на верхнем уровне.
// Поэтому нужен saleData.id, а не saleData.order.id.

assert(
  saleData &&
    typeof saleData.id === "number",
  "В ответе продажи отсутствует верхнеуровневый order.id"
);

orderId = Number(saleData.id);

assert(
  Array.isArray(saleData.items),
  "В ответе продажи отсутствует массив items"
);

assert(
  saleData.items.length === 1,
  `В тестовой продаже должен быть 1 OrderItem, получено ${saleData.items.length}`
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
  `После продажи статус должен быть COMPLETED, получено ${saleData.status}`
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

const soldBatch = await prisma.batch.findUnique({
  where: {
    id: batchId,
  },
});

const soldProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

const soldOrderItem = await prisma.orderItem.findUnique({
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
  `🟢 Product.stock=0`
);

console.log(
  `🟢 OrderBatch.quantity=3`
);

console.log(
  `🟢 OrderItem.returned=0`
);

console.log("");

// =========================================================================
// 6. СОХРАНЯЕМ КОЛИЧЕСТВО MOVEMENT ДО ВОЗВРАТОВ
// =========================================================================

console.log("6. СОХРАНЕНИЕ СОСТОЯНИЯ MOVEMENT");
console.log("------------------------------------------------------------------------------");

const movementsBefore = await prisma.movement.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

const movementCountBefore = movementsBefore.length;

const saleMovementsBefore = movementsBefore.filter(
  (movement) =>
    movement.type === "SALE"
);

const returnMovementsBefore = movementsBefore.filter(
  (movement) =>
    movement.type === "RETURN"
);

assert(
  saleMovementsBefore.length === 1,
  `До возврата должен быть 1 SALE Movement, получено ${saleMovementsBefore.length}`
);

assert(
  saleMovementsBefore[0].quantity === -3,
  `SALE Movement.quantity должен быть -3, получено ${saleMovementsBefore[0].quantity}`
);

assert(
  returnMovementsBefore.length === 0,
  `До возврата RETURN Movement должен быть 0, получено ${returnMovementsBefore.length}`
);

console.log(
  `🟢 Movement до возврата=${movementCountBefore}`
);

console.log(
  "🟢 SALE movement=-3"
);

console.log(
  "🟢 RETURN movements=0"
);

console.log("");

// =========================================================================
// 7. ДВА ПАРАЛЛЕЛЬНЫХ ВОЗВРАТА
// =========================================================================

console.log("7. ДВА ПАРАЛЛЕЛЬНЫХ ВОЗВРАТА");
console.log("------------------------------------------------------------------------------");

console.log(
  "🟡 Одновременно отправляем два запроса на возврат 3 шт"
);

console.log(
  `🟡 Order #${orderId}`
);

console.log(
  `🟡 OrderItem #${orderItemId}`
);

console.log(
  "🟡 Каждый запрос пытается вернуть ВСЕ 3 шт"
);

console.log("");

const returnBody = JSON.stringify({
  itemId: orderItemId,
  quantity: 3,
});

const [returnResponse1, returnResponse2] =
  await Promise.all([
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
      `${BASE_URL}/api/orders/${orderId}/return`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: returnBody,
      }
    ),
  ]);

const returnData1 =
  await readJson(returnResponse1);

const returnData2 =
  await readJson(returnResponse2);

console.log(
  `Запрос №1 HTTP ${returnResponse1.status}`
);

console.log(
  JSON.stringify(
    returnData1,
    null,
    2
  )
);

console.log("");

console.log(
  `Запрос №2 HTTP ${returnResponse2.status}`
);

console.log(
  JSON.stringify(
    returnData2,
    null,
    2
  )
);

console.log("");

// =========================================================================
// 8. ОПРЕДЕЛЯЕМ РЕЗУЛЬТАТЫ
// =========================================================================

console.log("8. АНАЛИЗ РЕЗУЛЬТАТОВ ПАРАЛЛЕЛЬНЫХ ЗАПРОСОВ");
console.log("------------------------------------------------------------------------------");

const successfulReturns = [
  returnResponse1,
  returnResponse2,
].filter(
  (response) =>
    response.status >= 200 &&
    response.status < 300
);

const failedReturns = [
  returnResponse1,
  returnResponse2,
].filter(
  (response) =>
    response.status < 200 ||
    response.status >= 300
);

console.log(
  `Успешных возвратов=${successfulReturns.length}`
);

console.log(
  `Отклонённых возвратов=${failedReturns.length}`
);

assert(
  successfulReturns.length === 1,
  `При двух параллельных возвратах должен пройти ровно 1 запрос, успешно прошло ${successfulReturns.length}`
);

assert(
  failedReturns.length === 1,
  `При двух параллельных возвратах ровно 1 запрос должен быть отклонён, отклонено ${failedReturns.length}`
);

console.log(
  "🟢 Ровно один возврат успешно выполнен"
);

console.log(
  "🟢 Второй параллельный возврат отклонён"
);

console.log("");

// =========================================================================
// 9. ПРОВЕРКА ФИНАЛЬНОГО СОСТОЯНИЯ ORDER
// =========================================================================

console.log("9. ПРОВЕРКА ФИНАЛЬНОГО СОСТОЯНИЯ ORDER");
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
  finalOrder !== null,
  `Order #${orderId} не найден после возврата`
);

assert(
  finalOrder.items.length === 1,
  `У Order должен быть 1 OrderItem, получено ${finalOrder.items.length}`
);

const finalItem = finalOrder.items[0];

assert(
  finalItem.id === orderItemId,
  `Найден неправильный OrderItem: ожидался #${orderItemId}, получен #${finalItem.id}`
);

assert(
  finalItem.quantity === 3,
  `OrderItem.quantity должен быть 3, получено ${finalItem.quantity}`
);

assert(
  finalItem.returned === 3,
  `OrderItem.returned должен быть 3, получено ${finalItem.returned}`
);

assert(
  finalOrder.total === 0,
  `После полного возврата Order.total должен быть 0, получено ${finalOrder.total}`
);

assert(
  finalOrder.profit === 0,
  `После полного возврата Order.profit должен быть 0, получено ${finalOrder.profit}`
);

assert(
  finalOrder.status === "RETURNED",
  `После полного возврата Order.status должен быть RETURNED, получено ${finalOrder.status}`
);

assert(
  finalItem.ReturnBatch.length === 1,
  `Должен существовать ровно 1 ReturnBatch, получено ${finalItem.ReturnBatch.length}`
);

assert(
  finalItem.ReturnBatch[0].quantity === 3,
  `ReturnBatch.quantity должен быть 3, получено ${finalItem.ReturnBatch[0].quantity}`
);

assert(
  finalItem.ReturnBatch[0].batchId === batchId,
  `ReturnBatch должен ссылаться на Batch #${batchId}, получено Batch #${finalItem.ReturnBatch[0].batchId}`
);

console.log(
  `🟢 Order #${finalOrder.id}`
);

console.log(
  `🟢 Order.total=${finalOrder.total}`
);

console.log(
  `🟢 Order.profit=${finalOrder.profit}`
);

console.log(
  `🟢 Order.status=${finalOrder.status}`
);

console.log(
  `🟢 OrderItem.returned=${finalItem.returned}`
);

console.log(
  `🟢 ReturnBatch.quantity=${finalItem.ReturnBatch[0].quantity}`
);

console.log("");

// =========================================================================
// 10. ПРОВЕРКА ФИНАЛЬНОГО СОСТОЯНИЯ BATCH / PRODUCT
// =========================================================================

console.log("10. ПРОВЕРКА ФИНАЛЬНОГО СОСТОЯНИЯ BATCH / PRODUCT");
console.log("------------------------------------------------------------------------------");

const finalBatch = await prisma.batch.findUnique({
  where: {
    id: batchId,
  },
});

const finalProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(
  finalBatch !== null,
  `Batch #${batchId} не найдена после возврата`
);

assert(
  finalProduct !== null,
  `Product #${productId} не найден после возврата`
);

assert(
  finalBatch.quantity === 3,
  `После успешного возврата Batch.quantity должен быть 3, получено ${finalBatch.quantity}`
);

assert(
  finalProduct.stock === 3,
  `После успешного возврата Product.stock должен быть 3, получено ${finalProduct.stock}`
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

const finalMovements = await prisma.movement.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

const saleMovements = finalMovements.filter(
  (movement) =>
    movement.type === "SALE"
);

const returnMovements = finalMovements.filter(
  (movement) =>
    movement.type === "RETURN"
);

assert(
  finalMovements.length === movementCountBefore + 1,
  `После успешного возврата должен появиться ровно 1 новый Movement: было ${movementCountBefore}, стало ${finalMovements.length}`
);

assert(
  saleMovements.length === 1,
  `Должен остаться 1 SALE Movement, получено ${saleMovements.length}`
);

assert(
  saleMovements[0].quantity === -3,
  `SALE Movement.quantity должен быть -3, получено ${saleMovements[0].quantity}`
);

assert(
  returnMovements.length === 1,
  `Должен появиться ровно 1 RETURN Movement, получено ${returnMovements.length}`
);

assert(
  returnMovements[0].quantity === 3,
  `RETURN Movement.quantity должен быть +3, получено ${returnMovements[0].quantity}`
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
  "🟢 Новый RETURN Movement ровно один"
);

console.log("");

// =========================================================================
// 12. ПРОВЕРКА ИТОГОВОЙ МАТЕМАТИКИ STOCK
// =========================================================================

console.log("12. ПРОВЕРКА ИТОГОВОЙ МАТЕМАТИКИ STOCK");
console.log("------------------------------------------------------------------------------");

const batchSumResult = await prisma.batch.aggregate({
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
// 13. ИТОГ V54
// =========================================================================

console.log("==============================================================================");
console.log("V54 RESULT");
console.log("==============================================================================");
console.log("");

console.log(
  "🟢 CONCURRENT RETURN PROTECTION PASSED"
);

console.log(
  "🟢 Из двух параллельных возвратов успешно прошёл только один"
);

console.log(
  "🟢 Повторный возврат не создал лишний ReturnBatch"
);

console.log(
  "🟢 OrderItem.returned=3"
);

console.log(
  "🟢 Batch.quantity=3"
);

console.log(
  "🟢 Product.stock=3"
);

console.log(
  "🟢 Order.total=0"
);

console.log(
  "🟢 Order.profit=0"
);

console.log(
  "🟢 Order.status=RETURNED"
);

console.log(
  "🟢 RETURN Movement создан ровно один раз"
);

console.log("");

console.log("==============================================================================");
console.log("V54 PASSED");
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
  // Если orderId по какой-либо причине ещё не был получен,
  // ищем тестовый Order через уникальный Product.
  if (orderId === null && productId !== null) {
    const discoveredOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            productId,
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        id: "desc",
      },
    });

    if (discoveredOrders.length > 0) {
      orderId = discoveredOrders[0].id;

      console.log(
        `🟡 Найден тестовый Order #${orderId} по Product #${productId}`
      );
    }
  }

  // -----------------------------------------------------------------------
  // СНАЧАЛА удаляем Order.
  //
  // OrderItem удалится через onDelete: Cascade.
  // Вместе с ним удалятся OrderBatch и ReturnBatch.
  // -----------------------------------------------------------------------

  if (orderId !== null) {
    await prisma.order.deleteMany({
      where: {
        id: orderId,
      },
    });

    console.log(
      `🟢 Order #${orderId} удалён`
    );
  }

  // -----------------------------------------------------------------------
  // Дополнительная страховка:
  // если по какой-либо причине остались тестовые Order,
  // удаляем их через связь с Product.
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
  // Последним удаляем Product.
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
console.error("🔴 V54 TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
