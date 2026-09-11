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
console.log("V56 CONCURRENT DELETE E2E TEST");
console.log("Проверка защиты от двойного параллельного удаления заказа");
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
    name: `V56 TEST Product ${stamp}`,
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
  `🟢 Batch #${batchId}.quantity=${initialBatch.quantity}`
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
  `До удаления OrderItem.returned должен быть 0, получено ${soldOrderItem.returned}`
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
  `ReturnBatch до удаления должен быть 0, получено ${soldOrderItem.ReturnBatch.length}`
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
// 6. СОХРАНЕНИЕ MOVEMENT
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
  `До DELETE должен быть 1 SALE Movement, получено ${saleMovementsBefore.length}`
);

assert(
  saleMovementsBefore[0].quantity === -3,
  `SALE Movement должен быть -3, получено ${saleMovementsBefore[0].quantity}`
);

assert(
  returnMovementsBefore.length === 0,
  `До DELETE RETURN Movement должен быть 0, получено ${returnMovementsBefore.length}`
);

console.log(
  `🟢 Movement до DELETE=${movementCountBefore}`
);

console.log(
  "🟢 SALE=-3"
);

console.log(
  "🟢 RETURN=0"
);

console.log("");

// =========================================================================
// 7. ДВА ПАРАЛЛЕЛЬНЫХ DELETE
// =========================================================================

console.log("7. ДВА ПАРАЛЛЕЛЬНЫХ DELETE");
console.log("------------------------------------------------------------------------------");

console.log(
  `🟡 Одновременно отправляем два DELETE для Order #${orderId}`
);

console.log(
  "🟡 Оба запроса пытаются удалить один и тот же заказ"
);

console.log("");

const [
  deleteResponse1,
  deleteResponse2,
] = await Promise.all([
  fetch(
    `${BASE_URL}/api/orders/${orderId}`,
    {
      method: "DELETE",
    }
  ),
  fetch(
    `${BASE_URL}/api/orders/${orderId}`,
    {
      method: "DELETE",
    }
  ),
]);

const deleteData1 =
  await readJson(deleteResponse1);

const deleteData2 =
  await readJson(deleteResponse2);

console.log(
  `DELETE №1 HTTP ${deleteResponse1.status}`
);

console.log(
  JSON.stringify(
    deleteData1,
    null,
    2
  )
);

console.log("");

console.log(
  `DELETE №2 HTTP ${deleteResponse2.status}`
);

console.log(
  JSON.stringify(
    deleteData2,
    null,
    2
  )
);

console.log("");

// =========================================================================
// 8. АНАЛИЗ РЕЗУЛЬТАТОВ
// =========================================================================

console.log("8. АНАЛИЗ РЕЗУЛЬТАТОВ");
console.log("------------------------------------------------------------------------------");

const delete1Succeeded =
  deleteResponse1.status >= 200 &&
  deleteResponse1.status < 300;

const delete2Succeeded =
  deleteResponse2.status >= 200 &&
  deleteResponse2.status < 300;

const successfulDeletes =
  Number(delete1Succeeded) +
  Number(delete2Succeeded);

const failedDeletes =
  Number(!delete1Succeeded) +
  Number(!delete2Succeeded);

console.log(
  `Успешных DELETE=${successfulDeletes}`
);

console.log(
  `Отклонённых DELETE=${failedDeletes}`
);

assert(
  successfulDeletes === 1,
  `Должен успешно выполниться ровно один DELETE, получено ${successfulDeletes}`
);

assert(
  failedDeletes === 1,
  `Второй DELETE должен быть отклонён, получено отклонённых=${failedDeletes}`
);


const statuses = [
  deleteResponse1.status,
  deleteResponse2.status,
].sort(
  (a, b) => a - b
);

assert(
  statuses[0] === 200 &&
    statuses[1] === 404,
  `Ожидались HTTP 200 и HTTP 404, получены ${deleteResponse1.status} и ${deleteResponse2.status}`
);


console.log(
  "🟢 Ровно один DELETE успешно выполнен"
);

console.log(
  "🟢 Второй DELETE отклонён"
);

console.log(
  "🟢 Ответы: один HTTP 200 и один HTTP 404"
);

console.log("");

// =========================================================================
// 9. ПРОВЕРКА УДАЛЕНИЯ ORDER
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

const orderBatchesAfter =
  await prisma.orderBatch.findMany({
    where: {
      orderItemId,
    },
  });

assert(
  orderBatchesAfter.length === 0,
  `После DELETE не должно остаться OrderBatch, найдено ${orderBatchesAfter.length}`
);

const returnBatchesAfter =
  await prisma.returnBatch.findMany({
    where: {
      orderItemId,
    },
  });

assert(
  returnBatchesAfter.length === 0,
  `После DELETE не должно остаться ReturnBatch, найдено ${returnBatchesAfter.length}`
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
// 10. ПРОВЕРКА ВОССТАНОВЛЕНИЯ BATCH
// =========================================================================

console.log("10. ПРОВЕРКА ВОССТАНОВЛЕНИЯ BATCH");
console.log("------------------------------------------------------------------------------");

const finalBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert(
  finalBatch !== null,
  `Batch #${batchId} должна существовать после DELETE`
);

assert(
  finalBatch.quantity === 3,
  `После DELETE Batch.quantity должен быть 3, получено ${finalBatch.quantity}`
);

assert(
  finalBatch.status === "ACTIVE",
  `Batch.status должен остаться ACTIVE, получено ${finalBatch.status}`
);

console.log(
  `🟢 Batch #${batchId}.quantity=${finalBatch.quantity}`
);

console.log(
  `🟢 Batch #${batchId}.status=${finalBatch.status}`
);

console.log("");

// =========================================================================
// 11. ПРОВЕРКА PRODUCT STOCK
// =========================================================================

console.log("11. ПРОВЕРКА PRODUCT STOCK");
console.log("------------------------------------------------------------------------------");

const finalProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  finalProduct !== null,
  `Product #${productId} должен существовать после DELETE`
);

assert(
  finalProduct.stock === 3,
  `После DELETE Product.stock должен быть 3, получено ${finalProduct.stock}`
);

console.log(
  `🟢 Product.stock=${finalProduct.stock}`
);

console.log("");

// =========================================================================
// 12. ПРОВЕРКА MOVEMENT
// =========================================================================

console.log("12. ПРОВЕРКА MOVEMENT");
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
  finalMovements.length ===
    movementCountBefore + 1,
  `Должен появиться ровно один новый Movement: было ${movementCountBefore}, стало ${finalMovements.length}`
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
  `RETURN Movement должен быть +3, получено ${returnMovements[0].quantity}`
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
  "🟢 Новый RETURN Movement ровно один"
);

console.log(
  "🟢 Net Movement=0"
);

console.log("");

// =========================================================================
// 13. ПРОВЕРКА STOCK == SUM(BATCH)
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
// 14. ПОВТОРНЫЙ DELETE
// =========================================================================

console.log("14. ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ПОВТОРНОГО DELETE");
console.log("------------------------------------------------------------------------------");

const movementCountBeforeRepeat =
  finalMovements.length;

const batchQuantityBeforeRepeat =
  finalBatch.quantity;

const stockBeforeRepeat =
  finalProduct.stock;

const repeatDeleteResponse =
  await fetch(
    `${BASE_URL}/api/orders/${orderId}`,
    {
      method: "DELETE",
    }
  );

const repeatDeleteData =
  await readJson(
    repeatDeleteResponse
  );

console.log(
  `Повторный DELETE HTTP ${repeatDeleteResponse.status}`
);

console.log(
  JSON.stringify(
    repeatDeleteData,
    null,
    2
  )
);

assert(
  repeatDeleteResponse.status === 404,
  `Повторный DELETE должен вернуть HTTP 404, получено ${repeatDeleteResponse.status}`
);

const batchAfterRepeat =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

const productAfterRepeat =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

const movementsAfterRepeat =
  await prisma.movement.findMany({
    where: {
      productId,
    },
  });

assert(
  batchAfterRepeat !== null,
  "Batch должна существовать после повторного DELETE"
);

assert(
  productAfterRepeat !== null,
  "Product должен существовать после повторного DELETE"
);

assert(
  batchAfterRepeat.quantity ===
    batchQuantityBeforeRepeat,
  `Повторный DELETE не должен менять Batch.quantity: было ${batchQuantityBeforeRepeat}, стало ${batchAfterRepeat.quantity}`
);

assert(
  productAfterRepeat.stock ===
    stockBeforeRepeat,
  `Повторный DELETE не должен менять Product.stock: было ${stockBeforeRepeat}, стало ${productAfterRepeat.stock}`
);

assert(
  movementsAfterRepeat.length ===
    movementCountBeforeRepeat,
  `Повторный DELETE не должен создавать Movement: было ${movementCountBeforeRepeat}, стало ${movementsAfterRepeat.length}`
);

console.log(
  "🟢 Повторный DELETE → HTTP 404"
);

console.log(
  `🟢 Batch.quantity остался ${batchAfterRepeat.quantity}`
);

console.log(
  `🟢 Product.stock остался ${productAfterRepeat.stock}`
);

console.log(
  `🟢 Количество Movement осталось ${movementsAfterRepeat.length}`
);

console.log("");

// =========================================================================
// 15. ФИНАЛЬНЫЙ РЕЗУЛЬТАТ
// =========================================================================

console.log("==============================================================================");
console.log("V56 RESULT");
console.log("==============================================================================");
console.log("");

console.log(
  "🟢 CONCURRENT DELETE PROTECTION PASSED"
);

console.log(
  "🟢 Из двух параллельных DELETE успешно прошёл только один"
);

console.log(
  "🟢 Второй DELETE вернул HTTP 404"
);

console.log(
  "🟢 Order удалён"
);

console.log(
  "🟢 OrderItem удалён"
);

console.log(
  "🟢 OrderBatch удалён"
);

console.log(
  "🟢 ReturnBatch удалён"
);

console.log(
  "🟢 Batch.quantity восстановлен ровно до 3"
);

console.log(
  "🟢 Product.stock восстановлен ровно до 3"
);

console.log(
  "🟢 Двойного восстановления товара нет"
);

console.log(
  "🟢 RETURN Movement создан ровно один раз"
);

console.log(
  "🟢 Product.stock == SUM(Batch.quantity)"
);

console.log(
  "🟢 Повторный DELETE не изменяет базу"
);

console.log("");

console.log("==============================================================================");
console.log("V56 PASSED");
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
  // Сначала удаляем Order, если он всё ещё существует.
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
  // Дополнительная защита: ищем любые тестовые Order через Product.
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
console.error("🔴 V56 TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
