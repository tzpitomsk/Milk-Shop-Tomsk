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
console.log("V57 CONCURRENT PARTIAL-RETURN E2E TEST");
console.log("Проверка конкурентного возврата оставшегося количества");
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
    name: `V57 TEST Product ${stamp}`,
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
// 2. СОЗДАНИЕ ПАРТИИ 5 ШТ
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
    quantity: 5,
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
    stock: 5,
  },
});

console.log(
  `🟢 Batch #${batch.id} quantity=${batch.quantity} purchaseCost=${batch.purchaseCost}`
);
console.log("");

// =========================================================================
// 3. НАЧАЛЬНАЯ ПРОВЕРКА
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
  initialProduct.stock === 5,
  `Начальный Product.stock должен быть 5, получено ${initialProduct.stock}`
);

assert(
  initialBatch.quantity === 5,
  `Начальный Batch.quantity должен быть 5, получено ${initialBatch.quantity}`
);

console.log(
  `🟢 Product.stock=${initialProduct.stock}`
);

console.log(
  `🟢 Batch #${batchId}.quantity=${initialBatch.quantity}`
);

console.log("");

// =========================================================================
// 4. ПРОДАЖА 5 ШТ
// =========================================================================

console.log("4. ПРОДАЖА 5 ШТ");
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
          quantity: 5,
          price: 300,
        },
      ],
    }),
  }
);

const saleData =
  await readJson(saleResponse);

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
  typeof saleData.id === "number",
  "В ответе продажи отсутствует Order.id"
);

assert(
  Array.isArray(saleData.items),
  "В ответе продажи отсутствует items"
);

assert(
  saleData.items.length === 1,
  `Должен быть один OrderItem, получено ${saleData.items.length}`
);

assert(
  typeof saleData.items[0]?.id === "number",
  "В ответе продажи отсутствует OrderItem.id"
);

orderId = Number(
  saleData.id
);

orderItemId = Number(
  saleData.items[0].id
);

assert(
  saleData.total === 1500,
  `После продажи total должен быть 1500, получено ${saleData.total}`
);

assert(
  saleData.profit === 1000,
  `После продажи profit должен быть 1000, получено ${saleData.profit}`
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
// 5. ПРОВЕРКА ПОСЛЕ ПРОДАЖИ
// =========================================================================

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

const soldItem =
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
  soldItem !== null,
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
  soldItem.quantity === 5,
  `OrderItem.quantity должен быть 5, получено ${soldItem.quantity}`
);

assert(
  soldItem.returned === 0,
  `До возврата OrderItem.returned должен быть 0, получено ${soldItem.returned}`
);

assert(
  soldItem.batches.length === 1,
  `Должен быть один OrderBatch, получено ${soldItem.batches.length}`
);

assert(
  soldItem.batches[0].batchId === batchId,
  "OrderBatch должен ссылаться на тестовую Batch"
);

assert(
  soldItem.batches[0].quantity === 5,
  `OrderBatch.quantity должен быть 5, получено ${soldItem.batches[0].quantity}`
);

assert(
  soldItem.batches[0].purchaseCost === 100,
  `OrderBatch.purchaseCost должен быть 100, получено ${soldItem.batches[0].purchaseCost}`
);

assert(
  soldItem.ReturnBatch.length === 0,
  `До первого возврата ReturnBatch должен быть 0, получено ${soldItem.ReturnBatch.length}`
);

console.log(
  "🟢 Batch.quantity=0"
);

console.log(
  "🟢 Product.stock=0"
);

console.log(
  "🟢 OrderItem.quantity=5"
);

console.log(
  "🟢 OrderItem.returned=0"
);

console.log("");

// =========================================================================
// 6. ПЕРВЫЙ ОБЫЧНЫЙ ВОЗВРАТ 2 ШТ
// =========================================================================

console.log("6. ПЕРВЫЙ ВОЗВРАТ 2 ШТ");
console.log("------------------------------------------------------------------------------");

const firstReturnResponse =
  await fetch(
    `${BASE_URL}/api/orders/${orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: orderItemId,
        quantity: 2,
      }),
    }
  );

const firstReturnData =
  await readJson(
    firstReturnResponse
  );

console.log(
  `HTTP ${firstReturnResponse.status}`
);

console.log(
  JSON.stringify(
    firstReturnData,
    null,
    2
  )
);

assert(
  firstReturnResponse.status === 200,
  `Первый возврат должен вернуть HTTP 200, получено ${firstReturnResponse.status}`
);

assert(
  firstReturnData.success === true,
  "Первый возврат должен вернуть success=true"
);

console.log("");

// =========================================================================
// 7. ПРОВЕРКА ПОСЛЕ ПЕРВОГО ВОЗВРАТА
// =========================================================================

console.log("7. ПРОВЕРКА ПОСЛЕ ПЕРВОГО ВОЗВРАТА");
console.log("------------------------------------------------------------------------------");

const partialOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: {
        include: {
          batches: true,
          ReturnBatch: true,
        },
      },
    },
  });

const partialBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

const partialProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  partialOrder !== null,
  "Order после первого возврата не найден"
);

assert(
  partialOrder.items.length === 1,
  `После первого возврата должен быть один OrderItem, получено ${partialOrder.items.length}`
);

const partialItem =
  partialOrder.items[0];

assert(
  partialItem.returned === 2,
  `После первого возврата returned должен быть 2, получено ${partialItem.returned}`
);

assert(
  partialItem.quantity === 5,
  `OrderItem.quantity должен оставаться 5, получено ${partialItem.quantity}`
);

assert(
  partialItem.ReturnBatch.length === 1,
  `После первого возврата должен быть 1 ReturnBatch, получено ${partialItem.ReturnBatch.length}`
);

assert(
  partialItem.ReturnBatch[0].quantity === 2,
  `Первый ReturnBatch должен содержать 2 шт., получено ${partialItem.ReturnBatch[0].quantity}`
);

assert(
  partialItem.ReturnBatch[0].batchId === batchId,
  "Первый ReturnBatch должен ссылаться на тестовую Batch"
);

assert(
  partialBatch !== null,
  "Batch после первого возврата не найдена"
);

assert(
  partialBatch.quantity === 2,
  `После первого возврата Batch.quantity должен быть 2, получено ${partialBatch.quantity}`
);

assert(
  partialProduct !== null,
  "Product после первого возврата не найден"
);

assert(
  partialProduct.stock === 2,
  `После первого возврата Product.stock должен быть 2, получено ${partialProduct.stock}`
);

assert(
  partialOrder.total === 900,
  `После первого возврата Order.total должен быть 900, получено ${partialOrder.total}`
);

assert(
  partialOrder.profit === 600,
  `После первого возврата Order.profit должен быть 600, получено ${partialOrder.profit}`
);

assert(
  partialOrder.status === "PARTIAL_RETURN",
  `После первого возврата status должен быть PARTIAL_RETURN, получено ${partialOrder.status}`
);

console.log(
  "🟢 OrderItem.returned=2"
);

console.log(
  "🟢 ReturnBatch.quantity=2"
);

console.log(
  "🟢 Batch.quantity=2"
);

console.log(
  "🟢 Product.stock=2"
);

console.log(
  "🟢 Order.total=900"
);

console.log(
  "🟢 Order.profit=600"
);

console.log(
  "🟢 Order.status=PARTIAL_RETURN"
);

console.log("");

// =========================================================================
// 8. СОХРАНЯЕМ MOVEMENT ДО КОНКУРЕНТНЫХ ВОЗВРАТОВ
// =========================================================================

console.log("8. СОСТОЯНИЕ MOVEMENT ПЕРЕД КОНКУРЕНТНЫМИ ВОЗВРАТАМИ");
console.log("------------------------------------------------------------------------------");

const movementsBeforeConcurrent =
  await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

const saleMovementsBefore =
  movementsBeforeConcurrent.filter(
    (movement) =>
      movement.type === "SALE"
  );

const returnMovementsBefore =
  movementsBeforeConcurrent.filter(
    (movement) =>
      movement.type === "RETURN"
  );

assert(
  saleMovementsBefore.length === 1,
  `До конкурентных возвратов должен быть 1 SALE Movement, получено ${saleMovementsBefore.length}`
);

assert(
  saleMovementsBefore[0].quantity === -5,
  `SALE Movement должен быть -5, получено ${saleMovementsBefore[0].quantity}`
);

assert(
  returnMovementsBefore.length === 1,
  `До конкурентных возвратов должен быть 1 RETURN Movement, получено ${returnMovementsBefore.length}`
);

assert(
  returnMovementsBefore[0].quantity === 2,
  `Первый RETURN Movement должен быть +2, получено ${returnMovementsBefore[0].quantity}`
);

console.log(
  `🟢 Movement count=${movementsBeforeConcurrent.length}`
);

console.log(
  "🟢 SALE=-5"
);

console.log(
  "🟢 Первый RETURN=+2"
);

console.log("");

// =========================================================================
// 9. ДВА ПАРАЛЛЕЛЬНЫХ ВОЗВРАТА ОСТАВШИХСЯ 3 ШТ
// =========================================================================

console.log("9. ДВА ПАРАЛЛЕЛЬНЫХ ВОЗВРАТА ОСТАВШИХСЯ 3 ШТ");
console.log("------------------------------------------------------------------------------");

console.log(
  `🟡 Order #${orderId}`
);

console.log(
  `🟡 OrderItem #${orderItemId}`
);

console.log(
  "🟡 До запросов можно вернуть ровно 3 шт."
);

console.log(
  "🟡 Одновременно отправляем два запроса quantity=3"
);

console.log("");

const [
  concurrentReturnResponse1,
  concurrentReturnResponse2,
] = await Promise.all([
  fetch(
    `${BASE_URL}/api/orders/${orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: orderItemId,
        quantity: 3,
      }),
    }
  ),
  fetch(
    `${BASE_URL}/api/orders/${orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: orderItemId,
        quantity: 3,
      }),
    }
  ),
]);

const concurrentReturnData1 =
  await readJson(
    concurrentReturnResponse1
  );

const concurrentReturnData2 =
  await readJson(
    concurrentReturnResponse2
  );

console.log(
  `RETURN №1 HTTP ${concurrentReturnResponse1.status}`
);

console.log(
  JSON.stringify(
    concurrentReturnData1,
    null,
    2
  )
);

console.log("");

console.log(
  `RETURN №2 HTTP ${concurrentReturnResponse2.status}`
);

console.log(
  JSON.stringify(
    concurrentReturnData2,
    null,
    2
  )
);

console.log("");

// =========================================================================
// 10. АНАЛИЗ КОНКУРЕНТНЫХ ЗАПРОСОВ
// =========================================================================

console.log("10. АНАЛИЗ КОНКУРЕНТНЫХ ЗАПРОСОВ");
console.log("------------------------------------------------------------------------------");

const concurrentStatuses = [
  concurrentReturnResponse1.status,
  concurrentReturnResponse2.status,
];

const successfulConcurrentReturns =
  concurrentStatuses.filter(
    (status) =>
      status === 200
  ).length;

const failedConcurrentReturns =
  concurrentStatuses.filter(
    (status) =>
      status !== 200
  ).length;

assert(
  successfulConcurrentReturns === 1,
  `Должен успешно пройти ровно один конкурентный возврат, получено ${successfulConcurrentReturns}`
);

assert(
  failedConcurrentReturns === 1,
  `Один конкурентный возврат должен быть отклонён, получено ${failedConcurrentReturns}`
);

console.log(
  "🟢 Ровно один конкурентный возврат успешен"
);

console.log(
  "🟢 Второй конкурентный возврат отклонён"
);

console.log("");

// =========================================================================
// 11. ПРОВЕРКА ФИНАЛЬНОГО ORDER
// =========================================================================

console.log("11. ПРОВЕРКА ФИНАЛЬНОГО ORDER");
console.log("------------------------------------------------------------------------------");

const finalOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: {
        include: {
          batches: true,
          ReturnBatch: {
            include: {
              Batch: true,
            },
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
  `Order #${orderId} должен существовать`
);

assert(
  finalOrder.items.length === 1,
  `Должен существовать один OrderItem, получено ${finalOrder.items.length}`
);

const finalItem =
  finalOrder.items[0];

assert(
  finalItem.quantity === 5,
  `OrderItem.quantity должен быть 5, получено ${finalItem.quantity}`
);

assert(
  finalItem.returned === 5,
  `OrderItem.returned должен быть 5, получено ${finalItem.returned}`
);

assert(
  finalItem.ReturnBatch.length === 2,
  `Должно быть ровно 2 ReturnBatch, получено ${finalItem.ReturnBatch.length}`
);

const totalReturned =
  finalItem.ReturnBatch.reduce(
    (sum, itemReturn) =>
      sum + itemReturn.quantity,
    0
  );

assert(
  totalReturned === 5,
  `Общее количество ReturnBatch должно быть 5, получено ${totalReturned}`
);

const returnBatchQuantities =
  finalItem.ReturnBatch
    .map(
      (itemReturn) =>
        itemReturn.quantity
    )
    .sort(
      (a, b) =>
        a - b
    );

assert(
  returnBatchQuantities[0] === 2 &&
    returnBatchQuantities[1] === 3,
  `ReturnBatch должны быть 2 и 3, получено ${returnBatchQuantities.join(", ")}`
);

for (const itemReturn of finalItem.ReturnBatch) {
  assert(
    itemReturn.batchId === batchId,
    `ReturnBatch #${itemReturn.id} должен ссылаться на Batch #${batchId}`
  );
}

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
  `После полного возврата status должен быть RETURNED, получено ${finalOrder.status}`
);

console.log(
  "🟢 OrderItem.quantity=5"
);

console.log(
  "🟢 OrderItem.returned=5"
);

console.log(
  "🟢 ReturnBatch: 2 + 3 = 5"
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

console.log("");

// =========================================================================
// 12. ПРОВЕРКА BATCH И STOCK
// =========================================================================

console.log("12. ПРОВЕРКА BATCH И PRODUCT STOCK");
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
  `Batch #${batchId} должна существовать`
);

assert(
  finalProduct !== null,
  `Product #${productId} должен существовать`
);

assert(
  finalBatch.quantity === 5,
  `После полного возврата Batch.quantity должен быть 5, получено ${finalBatch.quantity}`
);

assert(
  finalBatch.status === "ACTIVE",
  `Batch.status должен быть ACTIVE, получено ${finalBatch.status}`
);

assert(
  finalProduct.stock === 5,
  `После полного возврата Product.stock должен быть 5, получено ${finalProduct.stock}`
);

console.log(
  `🟢 Batch #${batchId}.quantity=5`
);

console.log(
  `🟢 Batch #${batchId}.status=${finalBatch.status}`
);

console.log(
  `🟢 Product.stock=${finalProduct.stock}`
);

console.log("");

// =========================================================================
// 13. STOCK == SUM(BATCH)
// =========================================================================

console.log("13. ПРОВЕРКА STOCK == SUM(BATCH.QUANTITY)");
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
  batchSum === 5,
  `SUM(Batch.quantity) должен быть 5, получено ${batchSum}`
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
// 14. ПРОВЕРКА MOVEMENT
// =========================================================================

console.log("14. ПРОВЕРКА MOVEMENT");
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
  `Должен быть 1 SALE Movement, получено ${saleMovements.length}`
);

assert(
  saleMovements[0].quantity === -5,
  `SALE Movement должен быть -5, получено ${saleMovements[0].quantity}`
);

assert(
  returnMovements.length === 2,
  `Должно быть 2 RETURN Movement, получено ${returnMovements.length}`
);

const totalReturnMovementQuantity =
  returnMovements.reduce(
    (sum, movement) =>
      sum + movement.quantity,
    0
  );

assert(
  totalReturnMovementQuantity === 5,
  `Сумма RETURN Movement должна быть +5, получено ${totalReturnMovementQuantity}`
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
  `🟢 Movement count=${finalMovements.length}`
);

console.log(
  "🟢 SALE=-5"
);

console.log(
  "🟢 RETURN: +2 и +3"
);

console.log(
  "🟢 Сумма RETURN=+5"
);

console.log(
  "🟢 Net Movement=0"
);

console.log("");

// =========================================================================
// 15. ПОПЫТКА ШЕСТОГО ВОЗВРАТА
// =========================================================================

console.log("15. ПРОВЕРКА ЗАПРЕТА ШЕСТОГО ВОЗВРАТА");
console.log("------------------------------------------------------------------------------");

const movementCountBeforeExtraReturn =
  finalMovements.length;

const extraReturnResponse =
  await fetch(
    `${BASE_URL}/api/orders/${orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: orderItemId,
        quantity: 1,
      }),
    }
  );

const extraReturnData =
  await readJson(
    extraReturnResponse
  );

console.log(
  `Шестой возврат HTTP ${extraReturnResponse.status}`
);

console.log(
  JSON.stringify(
    extraReturnData,
    null,
    2
  )
);

assert(
  extraReturnResponse.status !== 200,
  `Шестой возврат не должен быть успешным, получено HTTP ${extraReturnResponse.status}`
);

const unchangedItem =
  await prisma.orderItem.findUnique({
    where: {
      id: orderItemId,
    },
  });

const unchangedBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

const unchangedProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

const movementsAfterExtraReturn =
  await prisma.movement.findMany({
    where: {
      productId,
    },
  });

assert(
  unchangedItem !== null,
  "OrderItem должен существовать после отклонённого шестого возврата"
);

assert(
  unchangedBatch !== null,
  "Batch должна существовать после отклонённого шестого возврата"
);

assert(
  unchangedProduct !== null,
  "Product должен существовать после отклонённого шестого возврата"
);

assert(
  unchangedItem.returned === 5,
  `После отклонённого возврата returned должен остаться 5, получено ${unchangedItem.returned}`
);

assert(
  unchangedBatch.quantity === 5,
  `После отклонённого возврата Batch.quantity должен остаться 5, получено ${unchangedBatch.quantity}`
);

assert(
  unchangedProduct.stock === 5,
  `После отклонённого возврата Product.stock должен остаться 5, получено ${unchangedProduct.stock}`
);

assert(
  movementsAfterExtraReturn.length ===
    movementCountBeforeExtraReturn,
  `После отклонённого возврата количество Movement не должно измениться: было ${movementCountBeforeExtraReturn}, стало ${movementsAfterExtraReturn.length}`
);

console.log(
  "🟢 Шестой возврат отклонён"
);

console.log(
  "🟢 OrderItem.returned остался 5"
);

console.log(
  "🟢 Batch.quantity остался 5"
);

console.log(
  "🟢 Product.stock остался 5"
);

console.log(
  "🟢 Новый Movement не создан"
);

console.log("");

// =========================================================================
// 16. ФИНАЛЬНЫЙ РЕЗУЛЬТАТ
// =========================================================================

console.log("==============================================================================");
console.log("V57 RESULT");
console.log("==============================================================================");
console.log("");

console.log(
  "🟢 CONCURRENT REMAINING-RETURN PROTECTION PASSED"
);

console.log(
  "🟢 После частичного возврата можно было вернуть ровно 3 шт."
);

console.log(
  "🟢 Из двух параллельных возвратов по 3 шт. прошёл только один"
);

console.log(
  "🟢 Второй конкурентный возврат отклонён"
);

console.log(
  "🟢 OrderItem.returned=5"
);

console.log(
  "🟢 ReturnBatch total=5"
);

console.log(
  "🟢 Batch.quantity=5"
);

console.log(
  "🟢 Product.stock=5"
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
  "🟢 Двойного возврата нет"
);

console.log(
  "🟢 Движения: SALE=-5, RETURN=+5"
);

console.log(
  "🟢 Product.stock == SUM(Batch.quantity)"
);

console.log(
  "🟢 Шестой возврат не изменяет базу"
);

console.log("");

console.log("==============================================================================");
console.log("V57 PASSED");
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
  // Если Order каким-либо образом остался, удаляем его.
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
  // Удаляем остаточные тестовые movements.
  // -----------------------------------------------------------------------

  if (productId !== null) {
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
  // Удаляем Batch.
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
  // Удаляем Product.
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
console.error("🔴 V57 TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
