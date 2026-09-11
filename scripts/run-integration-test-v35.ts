import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

const TEST_PRODUCT_ID = 6;
const TEST_BATCH_A_ID = 32;
const TEST_BATCH_B_ID = 33;

async function assertCondition(
  condition: boolean,
  message: string
) {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }

  console.log(`✅ ${message}`);
}

async function main() {
  console.log("🧪 V35-B REAL API INTEGRATION TEST");
  console.log("=".repeat(70));

  // ============================================================
  // Проверяем тестовый товар
  // ============================================================

  const productBefore = await prisma.product.findUnique({
    where: {
      id: TEST_PRODUCT_ID,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (!productBefore) {
    throw new Error(
      `Тестовый Product #${TEST_PRODUCT_ID} не найден`
    );
  }

  if (
    productBefore.name !==
    "V35_INTEGRATION_TEST Молоко"
  ) {
    throw new Error(
      `Product #${TEST_PRODUCT_ID} не является V35 тестовым товаром`
    );
  }

  console.log("");
  console.log("TEST PRODUCT:");
  console.log(`  id=${productBefore.id}`);
  console.log(`  name=${productBefore.name}`);
  console.log(`  price=${productBefore.price}`);
  console.log(`  stock=${productBefore.stock}`);

  await assertCondition(
    productBefore.stock === 4,
    "Initial Product.stock = 4"
  );

  const batchA = productBefore.batches.find(
    (batch) => batch.id === TEST_BATCH_A_ID
  );

  const batchB = productBefore.batches.find(
    (batch) => batch.id === TEST_BATCH_B_ID
  );

  if (!batchA || !batchB) {
    throw new Error(
      `Не найдены ожидаемые Batch #${TEST_BATCH_A_ID} и #${TEST_BATCH_B_ID}`
    );
  }

  await assertCondition(
    batchA.quantity === 2,
    "Batch A initial quantity = 2"
  );

  await assertCondition(
    batchB.quantity === 2,
    "Batch B initial quantity = 2"
  );

  await assertCondition(
    batchA.purchaseCost === 100,
    "Batch A purchaseCost = 100"
  );

  await assertCondition(
    batchB.purchaseCost === 120,
    "Batch B purchaseCost = 120"
  );

  await assertCondition(
    batchA.expiryDate < batchB.expiryDate,
    "Batch A expires before Batch B"
  );

  // ============================================================
  // 1. РЕАЛЬНАЯ ПРОДАЖА ЧЕРЕЗ API
  // ============================================================

  console.log("");
  console.log("=".repeat(70));
  console.log("STEP 1 — REAL API SALE");
  console.log("=".repeat(70));

  console.log("");
  console.log("POST /api/orders");
  console.log("Selling 3 units...");

  /*
   * ВАЖНО:
   * Текущий API /api/orders ожидает:
   *
   * {
   *   items: [
   *     {
   *       id,
   *       quantity,
   *       price
   *     }
   *   ]
   * }
   *
   * Сервер всё равно использует реальную цену Product,
   * поэтому price здесь только соответствует контракту API.
   */

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
            id: TEST_PRODUCT_ID,
            quantity: 3,
            price: productBefore.price,
          },
        ],
      }),
    }
  );

  const saleText = await saleResponse.text();

  let saleData: any;

  try {
    saleData = JSON.parse(saleText);
  } catch {
    console.error("Response:");
    console.error(saleText);

    throw new Error(
      `API вернул не JSON. HTTP ${saleResponse.status}`
    );
  }

  console.log("");
  console.log(
    `HTTP ${saleResponse.status}`
  );

  console.log(
    JSON.stringify(saleData, null, 2)
  );

  if (!saleResponse.ok) {
    throw new Error(
      `Ошибка создания заказа: HTTP ${saleResponse.status}`
    );
  }

  const orderId = Number(
    saleData?.order?.id ?? saleData?.id
  );

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error(
      "API не вернул корректный ID созданного заказа"
    );
  }

  console.log("");
  console.log(`✅ Created Order #${orderId}`);

  // ============================================================
  // Проверяем состояние после продажи
  // ============================================================

  const afterSaleProduct =
    await prisma.product.findUnique({
      where: {
        id: TEST_PRODUCT_ID,
      },
      include: {
        batches: {
          orderBy: {
            id: "asc",
          },
        },
      },
    });

  if (!afterSaleProduct) {
    throw new Error(
      "Product исчез после продажи"
    );
  }

  const afterSaleA =
    afterSaleProduct.batches.find(
      (batch) => batch.id === TEST_BATCH_A_ID
    );

  const afterSaleB =
    afterSaleProduct.batches.find(
      (batch) => batch.id === TEST_BATCH_B_ID
    );

  if (!afterSaleA || !afterSaleB) {
    throw new Error(
      "Batch A/B отсутствует после продажи"
    );
  }

  console.log("");
  console.log("AFTER SALE:");
  console.log(
    `  Batch A #${TEST_BATCH_A_ID}: ${afterSaleA.quantity}`
  );
  console.log(
    `  Batch B #${TEST_BATCH_B_ID}: ${afterSaleB.quantity}`
  );
  console.log(
    `  Product.stock: ${afterSaleProduct.stock}`
  );

  await assertCondition(
    afterSaleA.quantity === 0,
    "FEFO/FIFO sold 2 units from Batch A"
  );

  await assertCondition(
    afterSaleB.quantity === 1,
    "FEFO/FIFO sold 1 unit from Batch B"
  );

  await assertCondition(
    afterSaleProduct.stock === 1,
    "Product.stock after sale = 1"
  );

  // ============================================================
  // Проверяем OrderBatch
  // ============================================================

  const orderAfterSale =
    await prisma.order.findUnique({
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
          },
        },
      },
    });

  if (!orderAfterSale) {
    throw new Error(
      "Созданный Order не найден"
    );
  }

  const orderItem =
    orderAfterSale.items.find(
      (item) =>
        item.productId === TEST_PRODUCT_ID
    );

  if (!orderItem) {
    throw new Error(
      "OrderItem тестового товара не найден"
    );
  }

  console.log("");
  console.log("ORDER BATCHES:");

  for (const link of orderItem.batches) {
    console.log(
      `  OrderBatch #${link.id}: ` +
        `batch=${link.batchId}, ` +
        `quantity=${link.quantity}, ` +
        `purchaseCost=${link.purchaseCost}`
    );
  }

  const orderBatchA =
    orderItem.batches.find(
      (link) =>
        link.batchId === TEST_BATCH_A_ID
    );

  const orderBatchB =
    orderItem.batches.find(
      (link) =>
        link.batchId === TEST_BATCH_B_ID
    );

  if (!orderBatchA || !orderBatchB) {
    throw new Error(
      "OrderBatch не распределился по обеим партиям"
    );
  }

  await assertCondition(
    orderBatchA.quantity === 2,
    "OrderBatch A quantity = 2"
  );

  await assertCondition(
    orderBatchA.purchaseCost === 100,
    "OrderBatch A purchaseCost snapshot = 100"
  );

  await assertCondition(
    orderBatchB.quantity === 1,
    "OrderBatch B quantity = 1"
  );

  await assertCondition(
    orderBatchB.purchaseCost === 120,
    "OrderBatch B purchaseCost snapshot = 120"
  );

  await assertCondition(
    orderAfterSale.total === 900,
    "Gross order total = 900"
  );

  await assertCondition(
    orderAfterSale.profit === 580,
    "Gross order profit = 580"
  );

  await assertCondition(
    orderAfterSale.status === "COMPLETED",
    "Order status = COMPLETED"
  );

  // ============================================================
  // 2. РЕАЛЬНЫЙ ВОЗВРАТ ЧЕРЕЗ API
  // ============================================================

  console.log("");
  console.log("=".repeat(70));
  console.log("STEP 2 — REAL API RETURN");
  console.log("=".repeat(70));

  console.log("");
  console.log(
    `POST /api/orders/${orderId}/return`
  );

  console.log(
    "Returning 1 unit..."
  );

  const returnResponse = await fetch(
    `${BASE_URL}/api/orders/${orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: orderItem.id,
        quantity: 1,
      }),
    }
  );

  const returnText =
    await returnResponse.text();

  let returnData: any;

  try {
    returnData = JSON.parse(returnText);
  } catch {
    console.error("Response:");
    console.error(returnText);

    throw new Error(
      `API возврата вернул не JSON. HTTP ${returnResponse.status}`
    );
  }

  console.log("");
  console.log(
    `HTTP ${returnResponse.status}`
  );

  console.log(
    JSON.stringify(returnData, null, 2)
  );

  if (!returnResponse.ok) {
    throw new Error(
      `Ошибка возврата: HTTP ${returnResponse.status}`
    );
  }

  console.log("");
  console.log("✅ Return API succeeded");

  // ============================================================
  // Проверяем состояние после возврата
  // ============================================================

  const afterReturnProduct =
    await prisma.product.findUnique({
      where: {
        id: TEST_PRODUCT_ID,
      },
      include: {
        batches: {
          orderBy: {
            id: "asc",
          },
        },
      },
    });

  if (!afterReturnProduct) {
    throw new Error(
      "Product исчез после возврата"
    );
  }

  const afterReturnA =
    afterReturnProduct.batches.find(
      (batch) => batch.id === TEST_BATCH_A_ID
    );

  const afterReturnB =
    afterReturnProduct.batches.find(
      (batch) => batch.id === TEST_BATCH_B_ID
    );

  if (!afterReturnA || !afterReturnB) {
    throw new Error(
      "Batch A/B отсутствует после возврата"
    );
  }

  console.log("");
  console.log("AFTER RETURN:");
  console.log(
    `  Batch A #${TEST_BATCH_A_ID}: ${afterReturnA.quantity}`
  );
  console.log(
    `  Batch B #${TEST_BATCH_B_ID}: ${afterReturnB.quantity}`
  );
  console.log(
    `  Product.stock: ${afterReturnProduct.stock}`
  );

  await assertCondition(
    afterReturnA.quantity === 0,
    "Batch A remains 0 after LIFO return"
  );

  await assertCondition(
    afterReturnB.quantity === 2,
    "LIFO return restored Batch B to 2"
  );

  await assertCondition(
    afterReturnProduct.stock === 2,
    "Product.stock after return = 2"
  );

  // ============================================================
  // Проверяем ReturnBatch
  // ============================================================

  const orderAfterReturn =
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

  if (!orderAfterReturn) {
    throw new Error(
      "Order не найден после возврата"
    );
  }

  const itemAfterReturn =
    orderAfterReturn.items.find(
      (item) =>
        item.id === orderItem.id
    );

  if (!itemAfterReturn) {
    throw new Error(
      "OrderItem не найден после возврата"
    );
  }

  console.log("");
  console.log("RETURN BATCHES:");

  for (const rb of itemAfterReturn.ReturnBatch) {
    console.log(
      `  ReturnBatch #${rb.id}: ` +
        `batch=${rb.batchId}, ` +
        `quantity=${rb.quantity}`
    );
  }

  const returnedB =
    itemAfterReturn.ReturnBatch
      .filter(
        (rb) =>
          rb.batchId === TEST_BATCH_B_ID
      )
      .reduce(
        (sum, rb) =>
          sum + rb.quantity,
        0
      );

  const returnedA =
    itemAfterReturn.ReturnBatch
      .filter(
        (rb) =>
          rb.batchId === TEST_BATCH_A_ID
      )
      .reduce(
        (sum, rb) =>
          sum + rb.quantity,
        0
      );

  await assertCondition(
    returnedB === 1,
    "ReturnBatch recorded 1 unit from Batch B"
  );

  await assertCondition(
    returnedA === 0,
    "No return was taken from Batch A"
  );

  await assertCondition(
    itemAfterReturn.returned === 1,
    "OrderItem.returned = 1"
  );

  await assertCondition(
    orderAfterReturn.total === 600,
    "Net order total = 600"
  );

  await assertCondition(
    orderAfterReturn.profit === 400,
    "Net order profit = 400"
  );

  await assertCondition(
    orderAfterReturn.status ===
      "PARTIAL_RETURN",
    "Order status = PARTIAL_RETURN"
  );

  // ============================================================
  // Проверяем движения
  // ============================================================

  const movements =
    await prisma.movement.findMany({
      where: {
        productId: TEST_PRODUCT_ID,
      },
      orderBy: {
        id: "asc",
      },
    });

  console.log("");
  console.log("MOVEMENTS:");

  for (const movement of movements) {
    console.log(
      `  #${movement.id} ` +
        `${movement.type} ` +
        `${movement.quantity} ` +
        `${movement.comment ?? ""}`
    );
  }

  const saleMovements =
    movements.filter(
      (movement) =>
        movement.type === "SALE"
    );

  const returnMovements =
    movements.filter(
      (movement) =>
        movement.type === "RETURN"
    );

  await assertCondition(
    saleMovements.length === 1,
    "Exactly 1 SALE movement created"
  );

  await assertCondition(
    saleMovements[0].quantity === -3,
    "SALE movement quantity = -3"
  );

  await assertCondition(
    returnMovements.length === 1,
    "Exactly 1 RETURN movement created"
  );

  await assertCondition(
    returnMovements[0].quantity === 1,
    "RETURN movement quantity = 1"
  );

  // ============================================================
  // Финальный вывод
  // ============================================================

  console.log("");
  console.log("=".repeat(70));
  console.log("🎉 V35-B INTEGRATION TEST PASSED");
  console.log("=".repeat(70));

  console.log("");
  console.log("Verified:");

  console.log("  ✅ Real POST /api/orders");
  console.log("  ✅ FEFO/FIFO batch allocation");
  console.log("  ✅ OrderBatch creation");
  console.log("  ✅ purchaseCost snapshot");
  console.log("  ✅ Product.stock synchronization");
  console.log("  ✅ Real POST /api/orders/[id]/return");
  console.log("  ✅ LIFO return allocation");
  console.log("  ✅ ReturnBatch creation");
  console.log("  ✅ Net order total");
  console.log("  ✅ Net order profit");
  console.log("  ✅ PARTIAL_RETURN status");
  console.log("  ✅ SALE movement");
  console.log("  ✅ RETURN movement");

  console.log("");
  console.log(`Test Order ID: ${orderId}`);
  console.log(`Test Product ID: ${TEST_PRODUCT_ID}`);

  console.log("");
  console.log(
    "⚠️ Тестовые записи пока НЕ удаляются."
  );
  console.log(
    "Следующим шагом сделаем отдельный безопасный cleanup."
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("=".repeat(70));
    console.error("❌ V35-B INTEGRATION TEST FAILED");
    console.error("=".repeat(70));
    console.error("");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });