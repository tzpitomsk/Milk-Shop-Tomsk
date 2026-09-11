import { prisma } from "../lib/prisma";

const BASE_URL = "http://localhost:3000";

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V53 — ORDER CONCURRENCY / DOUBLE SALE TEST");
console.log("==============================================================================");
console.log("");
console.log("Проверяем защиту Batch.quantity от двух одновременных продаж.");
console.log("Production API и schema не изменяются.");
console.log("");

let productId: number | null = null;
let batchId: number | null = null;

try {
// =========================================================================
// 1. СОЗДАЁМ ТЕСТОВЫЙ ТОВАР
// =========================================================================


console.log("1. СОЗДАНИЕ ТЕСТОВОГО ТОВАРА");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
  data: {
    name: `V53 TEST Product ${Date.now()}`,
    unit: "шт",
    price: 300,
    cost: 100,
    stock: 0,
  },
});

productId = product.id;

console.log(`Product #${productId}`);
console.log(`Цена=${product.price}`);
console.log(`Себестоимость=${product.cost}`);
console.log("");

// =========================================================================
// 2. СОЗДАЁМ ПАРТИЮ 3 ШТ.
// =========================================================================

console.log("2. СОЗДАНИЕ ТЕСТОВОЙ ПАРТИИ");
console.log("------------------------------------------------------------------------------");

const now = new Date();

const expiryDate = new Date(
  now.getTime() + 7 * 24 * 60 * 60 * 1000
);

const batch = await prisma.batch.create({
  data: {
    productId,
    quantity: 3,
    purchaseCost: 100,
    receivedAt: new Date(now.getTime() - 60 * 1000),
    expiryDate,
    status: "ACTIVE",
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

console.log(`Batch #${batchId}`);
console.log(`Количество=${batch.quantity}`);
console.log(`PurchaseCost=${batch.purchaseCost}`);
console.log(`Status=${batch.status}`);
console.log(`Product.stock=3`);
console.log("");

// =========================================================================
// 3. ПРОВЕРЯЕМ ИСХОДНОЕ СОСТОЯНИЕ
// =========================================================================

console.log("3. ИСХОДНОЕ СОСТОЯНИЕ");
console.log("------------------------------------------------------------------------------");

const beforeProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

const beforeBatch = await prisma.batch.findUnique({
  where: {
    id: batchId,
  },
});

if (!beforeProduct || !beforeBatch) {
  throw new Error(
    "Не удалось загрузить тестовые Product/Batch"
  );
}

if (beforeProduct.stock !== 3) {
  throw new Error(
    `Ожидался Product.stock=3, получено ${beforeProduct.stock}`
  );
}

if (beforeBatch.quantity !== 3) {
  throw new Error(
    `Ожидался Batch.quantity=3, получено ${beforeBatch.quantity}`
  );
}

console.log(`Product.stock=${beforeProduct.stock}`);
console.log(`Batch.quantity=${beforeBatch.quantity}`);
console.log("");

// =========================================================================
// 4. СОХРАНЯЕМ ИСХОДНЫЕ СЧЁТЧИКИ
// =========================================================================

console.log("4. ИСХОДНЫЕ СЧЁТЧИКИ");
console.log("------------------------------------------------------------------------------");

const beforeOrderCount = await prisma.order.count();

const beforeOrderItemCount =
  await prisma.orderItem.count();

const beforeOrderBatchCount =
  await prisma.orderBatch.count();

const beforeSaleMovementCount =
  await prisma.movement.count({
    where: {
      type: "SALE",
    },
  });

console.log(`Order=${beforeOrderCount}`);
console.log(`OrderItem=${beforeOrderItemCount}`);
console.log(`OrderBatch=${beforeOrderBatchCount}`);
console.log(`SALE Movement=${beforeSaleMovementCount}`);
console.log("");

// =========================================================================
// 5. ПАРАЛЛЕЛЬНО ОТПРАВЛЯЕМ ДВА ОДИНАКОВЫХ ЗАКАЗА
// =========================================================================

console.log("5. КОНКУРЕНТНАЯ ПРОДАЖА");
console.log("------------------------------------------------------------------------------");

console.log(
  "Партия содержит 3 шт."
);

console.log(
  "Запускаем одновременно два заказа по 3 шт."
);

console.log(
  "Ожидаемый результат: только один заказ должен пройти."
);

console.log("");

const requestBody = JSON.stringify({
  items: [
    {
      id: productId,
      quantity: 3,
      price: 300,
    },
  ],
});

const requestHeaders = {
  "Content-Type": "application/json",
};

const request1 = fetch(
  `${BASE_URL}/api/orders`,
  {
    method: "POST",
    headers: requestHeaders,
    body: requestBody,
  }
);

const request2 = fetch(
  `${BASE_URL}/api/orders`,
  {
    method: "POST",
    headers: requestHeaders,
    body: requestBody,
  }
);

const [response1, response2] =
  await Promise.all([
    request1,
    request2,
  ]);

const text1 = await response1.text();
const text2 = await response2.text();

let body1: unknown = null;
let body2: unknown = null;

try {
  body1 = JSON.parse(text1);
} catch {
  body1 = text1;
}

try {
  body2 = JSON.parse(text2);
} catch {
  body2 = text2;
}

console.log(
  `Запрос #1 HTTP ${response1.status}`
);

console.log(
  `Ответ #1: ${JSON.stringify(body1)}`
);

console.log("");

console.log(
  `Запрос #2 HTTP ${response2.status}`
);

console.log(
  `Ответ #2: ${JSON.stringify(body2)}`
);

console.log("");

const statuses = [
  response1.status,
  response2.status,
].sort((a, b) => a - b);

console.log(
  `HTTP статусы: ${statuses.join(", ")}`
);

// =========================================================================
// 6. ПРОВЕРЯЕМ, ЧТО РОВНО ОДИН ЗАПРОС УСПЕШЕН
// =========================================================================

console.log("6. ПРОВЕРКА РЕЗУЛЬТАТОВ ЗАПРОСОВ");
console.log("------------------------------------------------------------------------------");

const successCount = [
  response1,
  response2,
].filter(
  (response) =>
    response.status === 201
).length;

const failedCount = [
  response1,
  response2,
].filter(
  (response) =>
    response.status !== 201
).length;

console.log(
  `Успешных заказов=${successCount}`
);

console.log(
  `Неуспешных запросов=${failedCount}`
);

if (successCount !== 1) {
  throw new Error(
    `Ожидался ровно 1 успешный заказ, получено ${successCount}`
  );
}

if (failedCount !== 1) {
  throw new Error(
    `Ожидался ровно 1 неуспешный запрос, получено ${failedCount}`
  );
}

console.log(
  "🟢 Ровно один заказ успешно создан"
);

console.log(
  "🟢 Второй заказ не смог продать уже занятый остаток"
);

console.log("");

// =========================================================================
// 7. ПРОВЕРЯЕМ PRODUCT.STOCK
// =========================================================================

console.log("7. ПРОВЕРКА PRODUCT.STOCK");
console.log("------------------------------------------------------------------------------");

const afterProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

if (!afterProduct) {
  throw new Error(
    "Тестовый Product исчез"
  );
}

console.log(
  `Product.stock: ${beforeProduct.stock} → ${afterProduct.stock}`
);

if (afterProduct.stock !== 0) {
  throw new Error(
    `Ожидался Product.stock=0, получено ${afterProduct.stock}`
  );
}

console.log(
  "🟢 Product.stock корректно равен 0"
);

console.log("");

// =========================================================================
// 8. ПРОВЕРЯЕМ BATCH
// =========================================================================

console.log("8. ПРОВЕРКА BATCH");
console.log("------------------------------------------------------------------------------");

const afterBatch = await prisma.batch.findUnique({
  where: {
    id: batchId,
  },
});

if (!afterBatch) {
  throw new Error(
    "Тестовый Batch исчез"
  );
}

console.log(
  `Batch.quantity: ${beforeBatch.quantity} → ${afterBatch.quantity}`
);

console.log(
  `Batch.status=${afterBatch.status}`
);

if (afterBatch.quantity !== 0) {
  throw new Error(
    `Ожидался Batch.quantity=0, получено ${afterBatch.quantity}`
  );
}

if (afterBatch.status !== "EMPTY") {
  throw new Error(
    `Ожидался Batch.status=EMPTY, получено ${afterBatch.status}`
  );
}

if (afterBatch.quantity < 0) {
  throw new Error(
    `КРИТИЧЕСКАЯ ОШИБКА: Batch.quantity ушёл в отрицательное значение: ${afterBatch.quantity}`
  );
}

console.log(
  "🟢 Batch.quantity не ушёл в минус"
);

console.log(
  "🟢 Batch полностью продан ровно один раз"
);

console.log("");

// =========================================================================
// 9. ПРОВЕРЯЕМ КОЛИЧЕСТВО ЗАКАЗОВ
// =========================================================================

console.log("9. ПРОВЕРКА ORDER");
console.log("------------------------------------------------------------------------------");

const afterOrderCount =
  await prisma.order.count();

const createdOrders =
  await prisma.order.findMany({
    where: {
      items: {
        some: {
          productId,
        },
      },
    },
    include: {
      items: {
        include: {
          batches: {
            include: {
              batch: true,
            },
          },
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

console.log(
  `Order count: ${beforeOrderCount} → ${afterOrderCount}`
);

console.log(
  `Заказов для тестового Product=${createdOrders.length}`
);

if (createdOrders.length !== 1) {
  throw new Error(
    `Ожидался ровно 1 заказ для тестового товара, найдено ${createdOrders.length}`
  );
}

const createdOrder = createdOrders[0];

console.log(
  `Успешный Order #${createdOrder.id}`
);

console.log(
  `Order.total=${createdOrder.total}`
);

console.log(
  `Order.profit=${createdOrder.profit}`
);

console.log(
  `Order.status=${createdOrder.status}`
);

if (createdOrder.total !== 900) {
  throw new Error(
    `Ожидался Order.total=900, получено ${createdOrder.total}`
  );
}

if (createdOrder.profit !== 600) {
  throw new Error(
    `Ожидался Order.profit=600, получено ${createdOrder.profit}`
  );
}

console.log(
  "🟢 Сумма и прибыль успешного заказа корректны"
);

console.log("");

// =========================================================================
// 10. ПРОВЕРЯЕМ ORDER ITEM
// =========================================================================

console.log("10. ПРОВЕРКА ORDERITEM");
console.log("------------------------------------------------------------------------------");

if (createdOrder.items.length !== 1) {
  throw new Error(
    `Ожидалась 1 позиция заказа, найдено ${createdOrder.items.length}`
  );
}

const orderItem = createdOrder.items[0];

console.log(
  `OrderItem #${orderItem.id}`
);

console.log(
  `quantity=${orderItem.quantity}`
);

console.log(
  `price=${orderItem.price}`
);

if (orderItem.quantity !== 3) {
  throw new Error(
    `Ожидалось quantity=3, получено ${orderItem.quantity}`
  );
}

if (orderItem.price !== 300) {
  throw new Error(
    `Ожидалась price=300, получено ${orderItem.price}`
  );
}

console.log(
  "🟢 OrderItem содержит ровно проданные 3 шт."
);

console.log("");

// =========================================================================
// 11. ПРОВЕРЯЕМ ORDERBATCH
// =========================================================================

console.log("11. ПРОВЕРКА ORDERBATCH");
console.log("------------------------------------------------------------------------------");

const orderBatches =
  await prisma.orderBatch.findMany({
    where: {
      orderItemId: orderItem.id,
    },
    orderBy: {
      id: "asc",
    },
  });

console.log(
  `OrderBatch для успешного заказа=${orderBatches.length}`
);

if (orderBatches.length !== 1) {
  throw new Error(
    `Ожидался ровно 1 OrderBatch, найдено ${orderBatches.length}`
  );
}

const orderBatch = orderBatches[0];

console.log(
  `OrderBatch #${orderBatch.id}`
);

console.log(
  `Batch #${orderBatch.batchId}`
);

console.log(
  `quantity=${orderBatch.quantity}`
);

console.log(
  `purchaseCost=${orderBatch.purchaseCost}`
);

if (orderBatch.batchId !== batchId) {
  throw new Error(
    `OrderBatch указывает не на тестовый Batch: ${orderBatch.batchId}`
  );
}

if (orderBatch.quantity !== 3) {
  throw new Error(
    `Ожидался OrderBatch.quantity=3, получено ${orderBatch.quantity}`
  );
}

if (orderBatch.purchaseCost !== 100) {
  throw new Error(
    `Ожидался purchaseCost=100, получено ${orderBatch.purchaseCost}`
  );
}

console.log(
  "🟢 OrderBatch отражает ровно одну продажу 3 шт."
);

console.log("");

// =========================================================================
// 12. ПРОВЕРЯЕМ SALE MOVEMENT
// =========================================================================

console.log("12. ПРОВЕРКА SALE MOVEMENT");
console.log("------------------------------------------------------------------------------");

const testSaleMovements =
  await prisma.movement.findMany({
    where: {
      productId,
      type: "SALE",
    },
    orderBy: {
      id: "asc",
    },
  });

console.log(
  `SALE Movement для тестового товара=${testSaleMovements.length}`
);

if (testSaleMovements.length !== 1) {
  throw new Error(
    `Ожидался ровно 1 SALE Movement, найдено ${testSaleMovements.length}`
  );
}

const saleMovement =
  testSaleMovements[0];

console.log(
  `Movement #${saleMovement.id}`
);

console.log(
  `quantity=${saleMovement.quantity}`
);

console.log(
  `comment=${saleMovement.comment}`
);

if (saleMovement.quantity !== -3) {
  throw new Error(
    `Ожидался SALE quantity=-3, получено ${saleMovement.quantity}`
  );
}

console.log(
  "🟢 Создан ровно один SALE Movement на -3"
);

console.log("");

// =========================================================================
// 13. ПРОВЕРЯЕМ ОБЩИЕ СЧЁТЧИКИ
// =========================================================================

console.log("13. ПРОВЕРКА ОБЩИХ СЧЁТЧИКОВ");
console.log("------------------------------------------------------------------------------");

const afterOrderItemCount =
  await prisma.orderItem.count();

const afterOrderBatchCount =
  await prisma.orderBatch.count();

const afterSaleMovementCount =
  await prisma.movement.count({
    where: {
      type: "SALE",
    },
  });

console.log(
  `OrderItem: ${beforeOrderItemCount} → ${afterOrderItemCount}`
);

console.log(
  `OrderBatch: ${beforeOrderBatchCount} → ${afterOrderBatchCount}`
);

console.log(
  `SALE Movement: ${beforeSaleMovementCount} → ${afterSaleMovementCount}`
);

if (
  afterOrderItemCount !==
  beforeOrderItemCount + 1
) {
  throw new Error(
    "Количество OrderItem изменилось не на 1"
  );
}

if (
  afterOrderBatchCount !==
  beforeOrderBatchCount + 1
) {
  throw new Error(
    "Количество OrderBatch изменилось не на 1"
  );
}

if (
  afterSaleMovementCount !==
  beforeSaleMovementCount + 1
) {
  throw new Error(
    "Количество SALE Movement изменилось не на 1"
  );
}

console.log(
  "🟢 Вторая неудачная транзакция не оставила записей"
);

console.log("");

// =========================================================================
// 14. ФИНАЛЬНАЯ ПРОВЕРКА STOCK = SUM(BATCH)
// =========================================================================

console.log("14. STOCK = SUM(BATCH)");
console.log("------------------------------------------------------------------------------");

const batchSum =
  await prisma.batch.aggregate({
    where: {
      productId,
    },
    _sum: {
      quantity: true,
    },
  });

const totalBatchQuantity =
  batchSum._sum.quantity ?? 0;

console.log(
  `SUM(Batch.quantity)=${totalBatchQuantity}`
);

console.log(
  `Product.stock=${afterProduct.stock}`
);

if (
  totalBatchQuantity !==
  afterProduct.stock
) {
  throw new Error(
    `Нарушено равенство Product.stock = SUM(Batch.quantity): ${afterProduct.stock} !== ${totalBatchQuantity}`
  );
}

console.log(
  "🟢 Product.stock = SUM(Batch.quantity)"
);

console.log("");

// =========================================================================
// 15. ИТОГ
// =========================================================================

console.log("==============================================================================");
console.log("V53 RESULT");
console.log("==============================================================================");
console.log("");
console.log("🟢 CONCURRENT DOUBLE-SALE TEST PASSED");
console.log("");
console.log("Подтверждено:");
console.log("  🟢 Из двух одновременных продаж прошла только одна");
console.log("  🟢 Batch.quantity не ушёл в отрицательное значение");
console.log("  🟢 Batch был списан ровно на 3 шт.");
console.log("  🟢 Product.stock стал 0");
console.log("  🟢 Создан только один Order");
console.log("  🟢 Создан только один OrderBatch");
console.log("  🟢 Создан только один SALE Movement");
console.log("  🟢 Неудачная транзакция не оставила частичного заказа");
console.log("  🟢 Product.stock = SUM(Batch.quantity)");
console.log("");
console.log(
  "Защита Batch.quantity от двойной продажи работает."
);
console.log("");


} finally {
// =========================================================================
// CLEANUP
// =========================================================================


console.log("==============================================================================");
console.log("CLEANUP");
console.log("==============================================================================");
console.log("");

if (productId !== null) {
  // -----------------------------------------------------------------------
  // Сначала удаляем заказы.
  //
  // Order -> OrderItem -> OrderBatch удаляются через cascade.
  // ReturnBatch здесь отсутствует, поскольку тест возвратов не выполняет.
  // -----------------------------------------------------------------------

  await prisma.order.deleteMany({
    where: {
      items: {
        some: {
          productId,
        },
      },
    },
  });

  // -----------------------------------------------------------------------
  // Удаляем движения тестового товара.
  // -----------------------------------------------------------------------

  await prisma.movement.deleteMany({
    where: {
      productId,
    },
  });

  // -----------------------------------------------------------------------
  // Удаляем Batch.
  // -----------------------------------------------------------------------

  await prisma.batch.deleteMany({
    where: {
      productId,
    },
  });

  // -----------------------------------------------------------------------
  // Удаляем Product.
  // -----------------------------------------------------------------------

  await prisma.product.delete({
    where: {
      id: productId,
    },
  });
}

console.log("🟢 Cleanup завершён");
console.log("");


}
}

main()
.catch((error: unknown) => {
console.error("");
console.error("🔴 V53 FAILED");
console.error("");


if (error instanceof Error) {
  console.error(error.message);
  console.error(error.stack);
} else {
  console.error(error);
}

process.exitCode = 1;


})
.finally(async () => {
await prisma.$disconnect();
});