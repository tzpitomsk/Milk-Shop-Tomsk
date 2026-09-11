import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

const TEST_TOKEN = Date.now();

const PRODUCT_NAME = `V69_FULL_STOCK_LIFECYCLE_${TEST_TOKEN}`;
const SUPPLIER_NAME = `V69_TEST_SUPPLIER_${TEST_TOKEN}`;
const BARCODE = `V69-${TEST_TOKEN}`;

const PRODUCT_PRICE = 300;

const BATCH_1_QUANTITY = 3;
const BATCH_1_COST = 100;

const BATCH_2_QUANTITY = 4;
const BATCH_2_COST = 120;

const BATCH_3_QUANTITY = 2;
const BATCH_3_COST = 140;

const ORDER_QUANTITY = 6;
const RETURN_QUANTITY = 2;
const WRITE_OFF_QUANTITY = 1;

function section(title: string) {
  console.log("");
  console.log("==============================================================================");
  console.log(title);
  console.log("------------------------------------------------------------------------------");
}

function fail(message: string): never {
  throw new Error(`🔴 ${message}`);
}

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function ok(message: string) {
  console.log(`🟢 ${message}`);
}

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{
  status: number;
  data: any;
}> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function futureDate(days: number): string {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return formatLocalDate(date);
}

function getProductId(data: any): number {
  const id =
    data?.id ??
    data?.product?.id ??
    data?.data?.id ??
    data?.data?.product?.id;

  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    fail(
      `Не удалось определить Product ID из ответа API: ${JSON.stringify(
        data
      )}`
    );
  }

  return productId;
}

function getSupplierId(data: any): number {
  const id =
    data?.id ??
    data?.supplier?.id ??
    data?.data?.id ??
    data?.data?.supplier?.id;

  const supplierId = Number(id);

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    fail(
      `Не удалось определить Supplier ID из ответа API: ${JSON.stringify(
        data
      )}`
    );
  }

  return supplierId;
}

function getOrderId(data: any): number {
  const id =
    data?.id ??
    data?.order?.id ??
    data?.data?.id ??
    data?.data?.order?.id;

  const orderId = Number(id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    fail(
      `Не удалось определить Order ID из ответа API: ${JSON.stringify(
        data
      )}`
    );
  }

  return orderId;
}

/**
 * Находит Batch, созданную конкретным вызовом /api/supplies.
 *
 * Мы НЕ используем expiryDate для идентификации Batch.
 *
 * Причина:
 * API принимает expiryDate как строку, а реальное хранение DateTime
 * может зависеть от преобразования даты/часового пояса.
 *
 * Надёжнее:
 * 1. запомнить время непосредственно перед POST;
 * 2. после успешной поставки искать Batch по:
 *    - productId
 *    - purchaseCost
 *    - quantity
 *    - receivedAt >= времени начала запроса
 * 3. исключить уже найденные Batch.
 */
async function findJustCreatedBatch(
  productId: number,
  purchaseCost: number,
  quantity: number,
  startedAt: Date,
  excludedBatchIds: number[]
): Promise<{
  id: number;
  quantity: number;
  purchaseCost: number;
  expiryDate: Date;
  receivedAt: Date;
  productId: number;
  status: string;
}> {
  const batches = await prisma.batch.findMany({
    where: {
      productId,
      purchaseCost,
      quantity,
      receivedAt: {
        gte: startedAt,
      },
    },
    orderBy: {
      id: "desc",
    },
  });

  const batch = batches.find(
    (item) => !excludedBatchIds.includes(item.id)
  );

  if (!batch) {
    fail(
      `Не найдена Batch, созданная текущей поставкой: ` +
        `productId=${productId}, cost=${purchaseCost}, ` +
        `quantity=${quantity}, startedAt=${startedAt.toISOString()}`
    );
  }

  return batch;
}

async function cleanup(
  productId: number | null,
  supplierId: number | null,
  orderId: number | null
) {
  section("CLEANUP");

  /*
   * Сначала пробуем удалить заказ через реальный API.
   *
   * Если основной тест упал до DELETE заказа, API удалит его
   * и корректно восстановит остатки.
   */
  if (orderId !== null) {
    try {
      const response = await request(`/api/orders/${orderId}`, {
        method: "DELETE",
      });

      console.log(
        `Cleanup DELETE /api/orders/${orderId}: HTTP ${response.status}`
      );
    } catch (error) {
      console.log(
        `Cleanup DELETE order error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /*
   * После API cleanup удаляем оставшиеся тестовые записи напрямую
   * через Prisma в правильном порядке зависимостей.
   *
   * Это НЕ рабочий API и НЕ часть бизнес-логики приложения.
   * Это только аварийная уборка изолированных тестовых данных.
   */
  if (productId !== null) {
    try {
      await prisma.$transaction(async (tx) => {
        /*
         * 1. Находим все OrderItems тестового Product.
         */
        const orderItems = await tx.orderItem.findMany({
          where: {
            productId,
          },
          select: {
            id: true,
            orderId: true,
          },
        });

        const orderItemIds = orderItems.map(
          (item) => item.id
        );

        const orderIds = Array.from(
          new Set(orderItems.map((item) => item.orderId))
        );

        /*
         * 2. Удаляем ReturnBatch.
         */
        if (orderItemIds.length > 0) {
          await tx.returnBatch.deleteMany({
            where: {
              orderItemId: {
                in: orderItemIds,
              },
            },
          });

          /*
           * 3. Удаляем OrderBatch.
           */
          await tx.orderBatch.deleteMany({
            where: {
              orderItemId: {
                in: orderItemIds,
              },
            },
          });

          /*
           * 4. Удаляем OrderItem.
           */
          await tx.orderItem.deleteMany({
            where: {
              id: {
                in: orderItemIds,
              },
            },
          });
        }

        /*
         * 5. Удаляем тестовые Orders.
         */
        if (orderIds.length > 0) {
          await tx.order.deleteMany({
            where: {
              id: {
                in: orderIds,
              },
            },
          });
        }

        /*
         * 6. На всякий случай удаляем ReturnBatch,
         *    связанные с тестовыми Batch.
         */
        await tx.returnBatch.deleteMany({
          where: {
            Batch: {
              productId,
            },
          },
        });

        /*
         * 7. На всякий случай удаляем OrderBatch,
         *    связанные с тестовыми Batch.
         */
        await tx.orderBatch.deleteMany({
          where: {
            batch: {
              productId,
            },
          },
        });

        /*
         * 8. Удаляем SupplyItem тестового Product.
         */
        await tx.supplyItem.deleteMany({
          where: {
            productId,
          },
        });

        /*
         * 9. Удаляем Movement тестового Product.
         */
        await tx.movement.deleteMany({
          where: {
            productId,
          },
        });

        /*
         * 10. Удаляем Batch тестового Product.
         */
        await tx.batch.deleteMany({
          where: {
            productId,
          },
        });

        /*
         * 11. Удаляем Product.
         */
        await tx.product.delete({
          where: {
            id: productId,
          },
        });
      });

      console.log(
        `🟢 Test Product #${productId} removed`
      );
    } catch (error) {
      console.log(
        `🟡 Product cleanup error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /*
   * Supplier удаляем отдельно после Supply.
   */
  if (supplierId !== null) {
    try {
      await prisma.supply.deleteMany({
        where: {
          supplierId,
        },
      });

      await prisma.supplier.delete({
        where: {
          id: supplierId,
        },
      });

      console.log(
        `🟢 Test Supplier #${supplierId} removed`
      );
    } catch (error) {
      console.log(
        `🟡 Supplier cleanup error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log("");
  console.log("🟢 CLEANUP FINISHED");
}

async function main() {
  section("V69 FULL STOCK LIFECYCLE E2E TEST");

  console.log("STRICTLY ISOLATED TEST");
  console.log("");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`TEST_TOKEN=${TEST_TOKEN}`);
  console.log("");

  console.log("Сценарий:");
  console.log("");
  console.log("1. Создать Product.");
  console.log("2. Создать Supplier.");
  console.log("3. Создать три реальные Batch через /api/supplies.");
  console.log("4. Проверить Product.stock.");
  console.log("5. Создать Order через /api/orders.");
  console.log("6. Проверить FEFO/FIFO OrderBatch.");
  console.log("7. Сделать частичный Return через API.");
  console.log("8. Проверить LIFO ReturnBatch.");
  console.log("9. Сделать WRITE_OFF через API.");
  console.log("10. Проверить stock и историю Movement.");
  console.log("11. DELETE заказа.");
  console.log("12. Проверить точное восстановление только NET-проданного.");
  console.log("13. Проверить повторный DELETE.");
  console.log("14. Проверить финальный stock = SUM(Batch.quantity).");
  console.log("");

  let productId: number | null = null;
  let supplierId: number | null = null;
  let orderId: number | null = null;

  let batch1Id: number | null = null;
  let batch2Id: number | null = null;
  let batch3Id: number | null = null;

  const expiry1 = futureDate(10);
  const expiry2 = futureDate(20);
  const expiry3 = futureDate(30);

  try {
    // =========================================================================
    // 1. CREATE PRODUCT
    // =========================================================================

    section("1. CREATE TEST PRODUCT");

    const productResponse = await request(
      "/api/products",
      {
        method: "POST",
        body: JSON.stringify({
          name: PRODUCT_NAME,
          unit: "шт",
          price: PRODUCT_PRICE,
          cost: BATCH_1_COST,
          barcode: BARCODE,
        }),
      }
    );

    console.log(
      `HTTP ${productResponse.status}`
    );

    console.log(
      JSON.stringify(
        productResponse.data,
        null,
        2
      )
    );

    assert(
      productResponse.status === 200,
      `Создание Product ожидало HTTP 200, получено ${productResponse.status}`
    );

    productId = getProductId(
      productResponse.data
    );

    const createdProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      createdProduct !== null,
      `Product #${productId} не найден в БД`
    );

    assert(
      createdProduct.stock === 0,
      `Новый Product должен иметь stock=0, получено ${createdProduct.stock}`
    );

    assert(
      createdProduct.price === PRODUCT_PRICE,
      `Product.price должен быть ${PRODUCT_PRICE}, получено ${createdProduct.price}`
    );

    ok(
      `Product #${productId} создан`
    );

    ok(
      "Начальный Product.stock = 0"
    );

    // =========================================================================
    // 2. CREATE SUPPLIER
    // =========================================================================

    section("2. CREATE TEST SUPPLIER");

    const supplierResponse =
      await request(
        "/api/suppliers",
        {
          method: "POST",
          body: JSON.stringify({
            name: SUPPLIER_NAME,
          }),
        }
      );

    console.log(
      `HTTP ${supplierResponse.status}`
    );

    console.log(
      JSON.stringify(
        supplierResponse.data,
        null,
        2
      )
    );

    assert(
      supplierResponse.status === 200,
      `Создание Supplier ожидало HTTP 200, получено ${supplierResponse.status}`
    );

    supplierId = getSupplierId(
      supplierResponse.data
    );

    const createdSupplier =
      await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });

    assert(
      createdSupplier !== null,
      `Supplier #${supplierId} не найден в БД`
    );

    ok(
      `Supplier #${supplierId} создан`
    );

    // =========================================================================
    // 3. SUPPLY BATCH 1
    // =========================================================================

    section("3. SUPPLY BATCH #1");

    assert(
      productId !== null,
      "Product ID должен существовать"
    );

    assert(
      supplierId !== null,
      "Supplier ID должен существовать"
    );

    const supply1StartedAt =
      new Date();

    const supply1Response =
      await request(
        "/api/supplies",
        {
          method: "POST",
          body: JSON.stringify({
            supplierId,
            items: [
              {
                id: productId,
                quantity: BATCH_1_QUANTITY,
                cost: BATCH_1_COST,
                expiryDate: expiry1,
              },
            ],
          }),
        }
      );

    console.log(
      `HTTP ${supply1Response.status}`
    );

    console.log(
      JSON.stringify(
        supply1Response.data,
        null,
        2
      )
    );

    assert(
      supply1Response.status === 200,
      `Supply #1 ожидала HTTP 200, получено ${supply1Response.status}`
    );

    assert(
      supply1Response.data?.success === true,
      "Supply #1 должна вернуть success=true"
    );

    const supply1Batch =
      await findJustCreatedBatch(
        productId,
        BATCH_1_COST,
        BATCH_1_QUANTITY,
        supply1StartedAt,
        []
      );

    batch1Id =
      supply1Batch.id;

    assert(
      supply1Batch.status === "ACTIVE",
      `Batch #${batch1Id} после поставки должна быть ACTIVE`
    );

    ok(
      `Supply #1 создана через реальный /api/supplies`
    );

    ok(
      `Batch #${batch1Id} найдена по фактической записи БД`
    );

    console.log(
      `Batch #${batch1Id} | quantity=${supply1Batch.quantity} | cost=${supply1Batch.purchaseCost} | expiry=${supply1Batch.expiryDate.toISOString()}`
    );

    // =========================================================================
    // 4. SUPPLY BATCH 2
    // =========================================================================

    section("4. SUPPLY BATCH #2");

    const supply2StartedAt =
      new Date();

    const supply2Response =
      await request(
        "/api/supplies",
        {
          method: "POST",
          body: JSON.stringify({
            supplierId,
            items: [
              {
                id: productId,
                quantity: BATCH_2_QUANTITY,
                cost: BATCH_2_COST,
                expiryDate: expiry2,
              },
            ],
          }),
        }
      );

    console.log(
      `HTTP ${supply2Response.status}`
    );

    console.log(
      JSON.stringify(
        supply2Response.data,
        null,
        2
      )
    );

    assert(
      supply2Response.status === 200,
      `Supply #2 ожидала HTTP 200, получено ${supply2Response.status}`
    );

    assert(
      supply2Response.data?.success === true,
      "Supply #2 должна вернуть success=true"
    );

    assert(
      batch1Id !== null,
      "Batch #1 ID должен существовать"
    );

    const supply2Batch =
      await findJustCreatedBatch(
        productId,
        BATCH_2_COST,
        BATCH_2_QUANTITY,
        supply2StartedAt,
        [batch1Id]
      );

    batch2Id =
      supply2Batch.id;

    assert(
      supply2Batch.status === "ACTIVE",
      `Batch #${batch2Id} после поставки должна быть ACTIVE`
    );

    ok(
      "Supply #2 создана через реальный /api/supplies"
    );

    ok(
      `Batch #${batch2Id} найдена по фактической записи БД`
    );

    console.log(
      `Batch #${batch2Id} | quantity=${supply2Batch.quantity} | cost=${supply2Batch.purchaseCost} | expiry=${supply2Batch.expiryDate.toISOString()}`
    );

    // =========================================================================
    // 5. SUPPLY BATCH 3
    // =========================================================================

    section("5. SUPPLY BATCH #3");

    const supply3StartedAt =
      new Date();

    const supply3Response =
      await request(
        "/api/supplies",
        {
          method: "POST",
          body: JSON.stringify({
            supplierId,
            items: [
              {
                id: productId,
                quantity: BATCH_3_QUANTITY,
                cost: BATCH_3_COST,
                expiryDate: expiry3,
              },
            ],
          }),
        }
      );

    console.log(
      `HTTP ${supply3Response.status}`
    );

    console.log(
      JSON.stringify(
        supply3Response.data,
        null,
        2
      )
    );

    assert(
      supply3Response.status === 200,
      `Supply #3 ожидала HTTP 200, получено ${supply3Response.status}`
    );

    assert(
      supply3Response.data?.success === true,
      "Supply #3 должна вернуть success=true"
    );

    assert(
      batch1Id !== null,
      "Batch #1 ID должен существовать"
    );

    assert(
      batch2Id !== null,
      "Batch #2 ID должен существовать"
    );

    const supply3Batch =
      await findJustCreatedBatch(
        productId,
        BATCH_3_COST,
        BATCH_3_QUANTITY,
        supply3StartedAt,
        [
          batch1Id,
          batch2Id,
        ]
      );

    batch3Id =
      supply3Batch.id;

    assert(
      supply3Batch.status === "ACTIVE",
      `Batch #${batch3Id} после поставки должна быть ACTIVE`
    );

    ok(
      "Supply #3 создана через реальный /api/supplies"
    );

    ok(
      `Batch #${batch3Id} найдена по фактической записи БД`
    );

    console.log(
      `Batch #${batch3Id} | quantity=${supply3Batch.quantity} | cost=${supply3Batch.purchaseCost} | expiry=${supply3Batch.expiryDate.toISOString()}`
    );

    // =========================================================================
    // 6. LOAD AND VERIFY TEST BATCHES
    // =========================================================================

    section(
      "6. LOAD AND VERIFY TEST BATCHES"
    );

    assert(
      productId !== null,
      "Product ID должен существовать"
    );

    assert(
      batch1Id !== null,
      "Batch #1 ID должен существовать"
    );

    assert(
      batch2Id !== null,
      "Batch #2 ID должен существовать"
    );

    assert(
      batch3Id !== null,
      "Batch #3 ID должен существовать"
    );

    const createdBatches =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
        orderBy: {
          id: "asc",
        },
      });

    assert(
      createdBatches.length === 3,
      `Ожидалось ровно 3 тестовые Batch, получено ${createdBatches.length}`
    );

    const batch1 =
      createdBatches.find(
        (batch) =>
          batch.id === batch1Id
      );

    const batch2 =
      createdBatches.find(
        (batch) =>
          batch.id === batch2Id
      );

    const batch3 =
      createdBatches.find(
        (batch) =>
          batch.id === batch3Id
      );

    assert(
      batch1 !== undefined,
      `Batch #${batch1Id} не найдена`
    );

    assert(
      batch2 !== undefined,
      `Batch #${batch2Id} не найдена`
    );

    assert(
      batch3 !== undefined,
      `Batch #${batch3Id} не найдена`
    );

    assert(
      batch1.quantity === BATCH_1_QUANTITY,
      `Batch #${batch1Id} quantity должен быть ${BATCH_1_QUANTITY}, получено ${batch1.quantity}`
    );

    assert(
      batch1.purchaseCost === BATCH_1_COST,
      `Batch #${batch1Id} purchaseCost должен быть ${BATCH_1_COST}, получено ${batch1.purchaseCost}`
    );

    assert(
      batch2.quantity === BATCH_2_QUANTITY,
      `Batch #${batch2Id} quantity должен быть ${BATCH_2_QUANTITY}, получено ${batch2.quantity}`
    );

    assert(
      batch2.purchaseCost === BATCH_2_COST,
      `Batch #${batch2Id} purchaseCost должен быть ${BATCH_2_COST}, получено ${batch2.purchaseCost}`
    );

    assert(
      batch3.quantity === BATCH_3_QUANTITY,
      `Batch #${batch3Id} quantity должен быть ${BATCH_3_QUANTITY}, получено ${batch3.quantity}`
    );

    assert(
      batch3.purchaseCost === BATCH_3_COST,
      `Batch #${batch3Id} purchaseCost должен быть ${BATCH_3_COST}, получено ${batch3.purchaseCost}`
    );

    assert(
      batch1.productId === productId &&
        batch2.productId === productId &&
        batch3.productId === productId,
      "Все три Batch должны принадлежать тестовому Product"
    );

    ok("Все три реальные Batch найдены");
    ok(
      "Идентификация Batch больше не зависит от преобразования expiryDate"
    );

    // =========================================================================
    // 7. INITIAL STOCK
    // =========================================================================

    section("7. VERIFY INITIAL STOCK");

    const initialProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      initialProduct !== null,
      "Тестовый Product должен существовать"
    );

    const initialBatches =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
      });

    const initialBatchSum =
      initialBatches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    const expectedInitialStock =
      BATCH_1_QUANTITY +
      BATCH_2_QUANTITY +
      BATCH_3_QUANTITY;

    assert(
      expectedInitialStock === 9,
      `Внутренняя ошибка теста: ожидался initial stock 9, получено ${expectedInitialStock}`
    );

    assert(
      initialProduct.stock ===
        expectedInitialStock,
      `Initial Product.stock должен быть ${expectedInitialStock}, получено ${initialProduct.stock}`
    );

    assert(
      initialBatchSum ===
        expectedInitialStock,
      `SUM(Batch.quantity) должен быть ${expectedInitialStock}, получено ${initialBatchSum}`
    );

    assert(
      initialProduct.stock ===
        initialBatchSum,
      "Product.stock должен совпадать с SUM(Batch.quantity)"
    );

    assert(
      initialBatches.every(
        (batch) =>
          batch.status === "ACTIVE"
      ),
      "Все три тестовые Batch должны быть ACTIVE"
    );

    ok(
      "Initial Product.stock = 9"
    );

    ok(
      "Initial SUM(Batch.quantity) = 9"
    );

    ok(
      "Product.stock = SUM(Batch.quantity)"
    );

    // =========================================================================
    // 8. VERIFY SUPPLY MOVEMENTS
    // =========================================================================

    section("8. VERIFY SUPPLY MOVEMENTS");

    const supplyMovements =
      await prisma.movement.findMany({
        where: {
          productId,
          type: "SUPPLY",
        },
        orderBy: {
          id: "asc",
        },
      });

    assert(
      supplyMovements.length === 3,
      `Ожидалось 3 SUPPLY movements, получено ${supplyMovements.length}`
    );

    const supplyMovementTotal =
      supplyMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    assert(
      supplyMovementTotal ===
        expectedInitialStock,
      `Сумма SUPPLY movements должна быть ${expectedInitialStock}, получено ${supplyMovementTotal}`
    );

    assert(
      supplyMovements.every(
        (movement) =>
          movement.quantity > 0
      ),
      "Все SUPPLY movements должны быть положительными"
    );

    ok(
      "Созданы ровно 3 SUPPLY movement"
    );

    ok(
      `Сумма SUPPLY movements = ${expectedInitialStock}`
    );

    // =========================================================================
    // 9. CREATE ORDER
    // =========================================================================

    section(
      "9. CREATE ORDER THROUGH /api/orders"
    );

    const orderResponse =
      await request(
        "/api/orders",
        {
          method: "POST",
          body: JSON.stringify({
            items: [
              {
                id: productId,
                quantity:
                  ORDER_QUANTITY,
              },
            ],
          }),
        }
      );

    console.log(
      `HTTP ${orderResponse.status}`
    );

    console.log(
      JSON.stringify(
        orderResponse.data,
        null,
        2
      )
    );

    assert(
      orderResponse.status === 201,
      `Создание заказа ожидало HTTP 201, получено ${orderResponse.status}`
    );

    orderId = getOrderId(
      orderResponse.data
    );

    ok(
      `Order #${orderId} создан`
    );

    // =========================================================================
    // 10. VERIFY ORDER / FEFO
    // =========================================================================

    section(
      "10. VERIFY FEFO/FIFO ORDERBATCH ALLOCATION"
    );

    assert(
      orderId !== null,
      "Order ID должен существовать"
    );

    const createdOrder =
      await prisma.order.findUnique({
        where: {
          id: orderId,
        },
        include: {
          items: {
            include: {
              batches: {
                include: {
                  batch: true,
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
      createdOrder !== null,
      `Order #${orderId} не найден`
    );

    assert(
      createdOrder.items.length === 1,
      "Заказ должен содержать ровно один OrderItem"
    );

    const orderItem =
      createdOrder.items[0];

    assert(
      orderItem.quantity ===
        ORDER_QUANTITY,
      `OrderItem quantity должен быть ${ORDER_QUANTITY}, получено ${orderItem.quantity}`
    );

    assert(
      orderItem.price ===
        PRODUCT_PRICE,
      `OrderItem price должен быть ${PRODUCT_PRICE}, получено ${orderItem.price}`
    );

    assert(
      orderItem.batches.length === 2,
      `Продажа 6 шт должна использовать 2 партии, получено ${orderItem.batches.length}`
    );

    const firstOrderBatch =
      orderItem.batches[0];

    const secondOrderBatch =
      orderItem.batches[1];

    assert(
      firstOrderBatch.batchId ===
        batch1Id,
      `Первой должна использоваться Batch #${batch1Id}, использована Batch #${firstOrderBatch.batchId}`
    );

    assert(
      firstOrderBatch.quantity === 3,
      `Из Batch #${batch1Id} должно быть продано 3 шт, продано ${firstOrderBatch.quantity}`
    );

    assert(
      firstOrderBatch.purchaseCost ===
        BATCH_1_COST,
      `OrderBatch purchaseCost первой партии должен быть ${BATCH_1_COST}, получено ${firstOrderBatch.purchaseCost}`
    );

    assert(
      secondOrderBatch.batchId ===
        batch2Id,
      `Второй должна использоваться Batch #${batch2Id}, использована Batch #${secondOrderBatch.batchId}`
    );

    assert(
      secondOrderBatch.quantity === 3,
      `Из Batch #${batch2Id} должно быть продано 3 шт, продано ${secondOrderBatch.quantity}`
    );

    assert(
      secondOrderBatch.purchaseCost ===
        BATCH_2_COST,
      `OrderBatch purchaseCost второй партии должен быть ${BATCH_2_COST}, получено ${secondOrderBatch.purchaseCost}`
    );

    assert(
      !orderItem.batches.some(
        (item) =>
          item.batchId ===
          batch3Id
      ),
      `Batch #${batch3Id} не должна использоваться при продаже 6 шт`
    );

    ok(
      `FEFO/FIFO: Batch #${batch1Id} → 3 шт`
    );

    ok(
      `FEFO/FIFO: Batch #${batch2Id} → 3 шт`
    );

    ok(
      `FEFO/FIFO: Batch #${batch3Id} не использована`
    );

    // =========================================================================
    // 11. VERIFY STOCK AFTER SALE
    // =========================================================================

    section(
      "11. VERIFY STOCK AFTER SALE"
    );

    const afterSaleBatches =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
      });

    const afterSaleProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      afterSaleProduct !== null,
      "Product должен существовать после продажи"
    );

    const afterSaleBatchMap =
      new Map(
        afterSaleBatches.map(
          (batch) => [
            batch.id,
            batch,
          ]
        )
      );

    assert(
      afterSaleBatchMap.get(
        batch1Id
      )?.quantity === 0,
      `Batch #${batch1Id} после продажи должна иметь 0`
    );

    assert(
      afterSaleBatchMap.get(
        batch1Id
      )?.status === "EMPTY",
      `Batch #${batch1Id} после полной продажи должна быть EMPTY`
    );

    assert(
      afterSaleBatchMap.get(
        batch2Id
      )?.quantity === 1,
      `Batch #${batch2Id} после продажи должна иметь 1`
    );

    assert(
      afterSaleBatchMap.get(
        batch2Id
      )?.status === "ACTIVE",
      `Batch #${batch2Id} после продажи должна быть ACTIVE`
    );

    assert(
      afterSaleBatchMap.get(
        batch3Id
      )?.quantity === 2,
      `Batch #${batch3Id} должна остаться 2`
    );

    const afterSaleBatchSum =
      afterSaleBatches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    assert(
      afterSaleProduct.stock === 3,
      `Product.stock после продажи должен быть 3, получено ${afterSaleProduct.stock}`
    );

    assert(
      afterSaleBatchSum === 3,
      `SUM(Batch.quantity) после продажи должен быть 3, получено ${afterSaleBatchSum}`
    );

    assert(
      afterSaleProduct.stock ===
        afterSaleBatchSum,
      "Product.stock должен совпадать с SUM(Batch.quantity) после продажи"
    );

    ok(
      "После продажи Product.stock = 3"
    );

    ok(
      "После продажи SUM(Batch.quantity) = 3"
    );

    ok(
      "Проданные партии имеют правильные остатки"
    );

    // =========================================================================
    // 12. VERIFY SALE MOVEMENT
    // =========================================================================

    section(
      "12. VERIFY SALE MOVEMENT"
    );

    const saleMovements =
      await prisma.movement.findMany({
        where: {
          productId,
          type: "SALE",
        },
        orderBy: {
          id: "asc",
        },
      });

    assert(
      saleMovements.length === 1,
      `Ожидался 1 SALE movement, получено ${saleMovements.length}`
    );

    assert(
      saleMovements[0].quantity ===
        -ORDER_QUANTITY,
      `SALE movement должен быть -${ORDER_QUANTITY}, получено ${saleMovements[0].quantity}`
    );

    ok(
      `SALE movement = ${saleMovements[0].quantity}`
    );

    // =========================================================================
    // 13. PARTIAL RETURN
    // =========================================================================

    section("13. PARTIAL RETURN");

    const returnResponse =
      await request(
        `/api/orders/${orderId}/return`,
        {
          method: "POST",
          body: JSON.stringify({
            itemId: orderItem.id,
            quantity:
              RETURN_QUANTITY,
          }),
        }
      );

    console.log(
      `HTTP ${returnResponse.status}`
    );

    console.log(
      JSON.stringify(
        returnResponse.data,
        null,
        2
      )
    );

    assert(
      returnResponse.status === 200,
      `Возврат ожидал HTTP 200, получено ${returnResponse.status}`
    );

    ok(
      `Возвращено ${RETURN_QUANTITY} шт`
    );

    // =========================================================================
    // 14. VERIFY LIFO RETURN
    // =========================================================================

    section(
      "14. VERIFY LIFO RETURN"
    );

    const afterReturnOrderItem =
      await prisma.orderItem.findUnique({
        where: {
          id: orderItem.id,
        },
        include: {
          ReturnBatch: true,
          batches: true,
        },
      });

    assert(
      afterReturnOrderItem !== null,
      "OrderItem должен существовать после возврата"
    );

    assert(
      afterReturnOrderItem.returned ===
        RETURN_QUANTITY,
      `OrderItem.returned должен быть ${RETURN_QUANTITY}, получено ${afterReturnOrderItem.returned}`
    );

    assert(
      afterReturnOrderItem.ReturnBatch.length ===
        1,
      `Должен существовать 1 ReturnBatch, получено ${afterReturnOrderItem.ReturnBatch.length}`
    );

    const returnBatch =
      afterReturnOrderItem.ReturnBatch[0];

    assert(
      returnBatch.batchId ===
        batch2Id,
      `LIFO возврат должен идти в Batch #${batch2Id}, фактически Batch #${returnBatch.batchId}`
    );

    assert(
      returnBatch.quantity ===
        RETURN_QUANTITY,
      `ReturnBatch quantity должен быть ${RETURN_QUANTITY}, получено ${returnBatch.quantity}`
    );

    ok(
      `LIFO: возврат ${RETURN_QUANTITY} шт вернулся в Batch #${batch2Id}`
    );

    // =========================================================================
    // 15. VERIFY NET ORDER FINANCIALS
    // =========================================================================

    section(
      "15. VERIFY NET ORDER TOTAL / PROFIT"
    );

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

    assert(
      orderAfterReturn !== null,
      "Order должен существовать после возврата"
    );

    const expectedNetQuantity =
      ORDER_QUANTITY -
      RETURN_QUANTITY;

    const expectedNetTotal =
      expectedNetQuantity *
      PRODUCT_PRICE;

    /*
     * Продажа:
     *
     * Batch #1:
     * 3 × 100 = 300
     *
     * Batch #2:
     * 3 × 120 = 360
     *
     * Gross cost = 660
     *
     * Возврат:
     * 2 × 120 = 240
     *
     * Net cost = 420
     *
     * Net revenue:
     * 4 × 300 = 1200
     *
     * Net profit:
     * 1200 - 420 = 780
     */

    const expectedGrossCost =
      BATCH_1_QUANTITY *
        BATCH_1_COST +
      3 * BATCH_2_COST;

    const expectedReturnedCost =
      RETURN_QUANTITY *
      BATCH_2_COST;

    const expectedNetCost =
      expectedGrossCost -
      expectedReturnedCost;

    const expectedNetProfit =
      expectedNetTotal -
      expectedNetCost;

    assert(
      expectedGrossCost === 660,
      `Внутренняя ошибка теста: expectedGrossCost=${expectedGrossCost}`
    );

    assert(
      expectedReturnedCost === 240,
      `Внутренняя ошибка теста: expectedReturnedCost=${expectedReturnedCost}`
    );

    assert(
      expectedNetCost === 420,
      `Внутренняя ошибка теста: expectedNetCost=${expectedNetCost}`
    );

    assert(
      expectedNetTotal === 1200,
      `Внутренняя ошибка теста: expectedNetTotal=${expectedNetTotal}`
    );

    assert(
      expectedNetProfit === 780,
      `Внутренняя ошибка теста: expectedNetProfit=${expectedNetProfit}`
    );

    assert(
      orderAfterReturn.total ===
        expectedNetTotal,
      `Order.total должен быть ${expectedNetTotal}, получено ${orderAfterReturn.total}`
    );

    assert(
      orderAfterReturn.profit ===
        expectedNetProfit,
      `Order.profit должен быть ${expectedNetProfit}, получено ${orderAfterReturn.profit}`
    );

    assert(
      orderAfterReturn.status ===
        "PARTIAL_RETURN",
      `Order.status должен быть PARTIAL_RETURN, получено ${orderAfterReturn.status}`
    );

    ok(
      `NET Order.total = ${orderAfterReturn.total}`
    );

    ok(
      `NET Order.profit = ${orderAfterReturn.profit}`
    );

    ok(
      "Order.status = PARTIAL_RETURN"
    );

    // =========================================================================
    // 16. VERIFY STOCK AFTER RETURN
    // =========================================================================

    section(
      "16. VERIFY STOCK AFTER RETURN"
    );

    const afterReturnBatches =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
      });

    const afterReturnProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      afterReturnProduct !== null,
      "Product должен существовать после возврата"
    );

    const afterReturnMap =
      new Map(
        afterReturnBatches.map(
          (batch) => [
            batch.id,
            batch,
          ]
        )
      );

    assert(
      afterReturnMap.get(
        batch1Id
      )?.quantity === 0,
      `Batch #${batch1Id} должна остаться 0`
    );

    assert(
      afterReturnMap.get(
        batch2Id
      )?.quantity === 3,
      `Batch #${batch2Id} после возврата должна иметь 3, получено ${afterReturnMap.get(batch2Id)?.quantity}`
    );

    assert(
      afterReturnMap.get(
        batch3Id
      )?.quantity === 2,
      `Batch #${batch3Id} должна остаться 2`
    );

    const afterReturnBatchSum =
      afterReturnBatches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    assert(
      afterReturnProduct.stock === 5,
      `Product.stock после возврата должен быть 5, получено ${afterReturnProduct.stock}`
    );

    assert(
      afterReturnBatchSum === 5,
      `SUM(Batch.quantity) после возврата должен быть 5, получено ${afterReturnBatchSum}`
    );

    assert(
      afterReturnProduct.stock ===
        afterReturnBatchSum,
      "Product.stock должен совпадать с SUM(Batch.quantity) после возврата"
    );

    ok(
      "После возврата Product.stock = 5"
    );

    ok(
      "После возврата SUM(Batch.quantity) = 5"
    );

    // =========================================================================
    // 17. WRITE OFF
    // =========================================================================

    section(
      "17. WRITE OFF ONE UNIT"
    );

    assert(
      batch2Id !== null,
      "Batch #2 ID должен существовать"
    );

    const writeOffResponse =
      await request(
        `/api/batches/${batch2Id}/writeoff`,
        {
          method: "POST",
          body: JSON.stringify({
            quantity:
              WRITE_OFF_QUANTITY,
            reason:
              "V69 тестовое списание",
          }),
        }
      );

    console.log(
      `HTTP ${writeOffResponse.status}`
    );

    console.log(
      JSON.stringify(
        writeOffResponse.data,
        null,
        2
      )
    );

    assert(
      writeOffResponse.status === 200,
      `Write-off ожидал HTTP 200, получено ${writeOffResponse.status}`
    );

    assert(
      writeOffResponse.data?.success ===
        true,
      "Write-off должен вернуть success=true"
    );

    assert(
      writeOffResponse.data?.data
        ?.writeOff ===
        WRITE_OFF_QUANTITY,
      `Write-off response.data.writeOff должен быть ${WRITE_OFF_QUANTITY}`
    );

    ok(
      `Списано ${WRITE_OFF_QUANTITY} шт из Batch #${batch2Id}`
    );

    // =========================================================================
    // 18. VERIFY STOCK AFTER WRITE-OFF
    // =========================================================================

    section(
      "18. VERIFY STOCK AFTER WRITE-OFF"
    );

    const afterWriteOffBatch =
      await prisma.batch.findUnique({
        where: {
          id: batch2Id,
        },
      });

    const afterWriteOffProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      afterWriteOffBatch !== null,
      "Batch #2 должна существовать после списания"
    );

    assert(
      afterWriteOffProduct !== null,
      "Product должен существовать после списания"
    );

    assert(
      afterWriteOffBatch.quantity === 2,
      `Batch #${batch2Id} после списания должна иметь 2, получено ${afterWriteOffBatch.quantity}`
    );

    assert(
      afterWriteOffBatch.status ===
        "ACTIVE",
      `Batch #${batch2Id} после списания должна быть ACTIVE, получено ${afterWriteOffBatch.status}`
    );

    const afterWriteOffBatches =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
      });

    const afterWriteOffBatchSum =
      afterWriteOffBatches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    assert(
      afterWriteOffProduct.stock === 4,
      `Product.stock после списания должен быть 4, получено ${afterWriteOffProduct.stock}`
    );

    assert(
      afterWriteOffBatchSum === 4,
      `SUM(Batch.quantity) после списания должен быть 4, получено ${afterWriteOffBatchSum}`
    );

    assert(
      afterWriteOffProduct.stock ===
        afterWriteOffBatchSum,
      "Product.stock должен совпадать с SUM(Batch.quantity) после списания"
    );

    ok(
      "После списания Product.stock = 4"
    );

    ok(
      "После списания SUM(Batch.quantity) = 4"
    );

    // =========================================================================
    // 19. VERIFY WRITE-OFF MOVEMENT
    // =========================================================================

    section(
      "19. VERIFY WRITE-OFF MOVEMENT"
    );

    const writeOffMovements =
      await prisma.movement.findMany({
        where: {
          productId,
          type: "WRITE_OFF",
        },
        orderBy: {
          id: "asc",
        },
      });

    assert(
      writeOffMovements.length === 1,
      `Ожидался 1 WRITE_OFF movement, получено ${writeOffMovements.length}`
    );

    assert(
      writeOffMovements[0].quantity ===
        -WRITE_OFF_QUANTITY,
      `WRITE_OFF movement должен быть -${WRITE_OFF_QUANTITY}, получено ${writeOffMovements[0].quantity}`
    );

    assert(
      writeOffMovements[0].comment?.includes(
        `Партия №${batch2Id}`
      ),
      "WRITE_OFF comment должен содержать номер партии"
    );

    ok(
      `WRITE_OFF movement = ${writeOffMovements[0].quantity}`
    );

    // =========================================================================
    // 20. DELETE ORDER
    // =========================================================================

    section("20. DELETE ORDER");

    assert(
      orderId !== null,
      "Order ID должен существовать"
    );

    const deleteResponse =
      await request(
        `/api/orders/${orderId}`,
        {
          method: "DELETE",
        }
      );

    console.log(
      `HTTP ${deleteResponse.status}`
    );

    console.log(
      JSON.stringify(
        deleteResponse.data,
        null,
        2
      )
    );

    assert(
      deleteResponse.status === 200,
      `DELETE заказа ожидал HTTP 200, получено ${deleteResponse.status}`
    );

    ok(
      `Order #${orderId} удалён`
    );

    // =========================================================================
    // 21. VERIFY ORDER REALLY DELETED
    // =========================================================================

    section(
      "21. VERIFY ORDER DELETED"
    );

    const deletedOrder =
      await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

    assert(
      deletedOrder === null,
      `Order #${orderId} должен отсутствовать после DELETE`
    );

    const remainingOrderItems =
      await prisma.orderItem.count({
        where: {
          orderId,
        },
      });

    assert(
      remainingOrderItems === 0,
      `OrderItems заказа #${orderId} должны быть удалены, осталось ${remainingOrderItems}`
    );

    ok(
      "Order удалён из БД"
    );

    ok(
      "OrderItems удалены из БД"
    );

    // =========================================================================
    // 22. VERIFY EXACT STOCK RESTORATION
    // =========================================================================

    section(
      "22. VERIFY EXACT STOCK RESTORATION"
    );

    /*
     * До продажи:
     *
     * Batch 1 = 3
     * Batch 2 = 4
     * Batch 3 = 2
     *
     * Продажа:
     *
     * Batch 1: -3
     * Batch 2: -3
     *
     * Возврат:
     *
     * Batch 2: +2
     *
     * Списание:
     *
     * Batch 2: -1
     *
     * DELETE:
     *
     * восстанавливает только NET-проданное:
     *
     * Batch 1: +3
     * Batch 2: +1
     * Batch 3: +0
     *
     * Поэтому:
     *
     * Batch 1 = 3
     * Batch 2 = 3
     * Batch 3 = 2
     *
     * Итого stock = 8.
     *
     * Списанная единица НЕ должна восстановиться.
     */

    const finalBatches =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
        orderBy: {
          id: "asc",
        },
      });

    const finalProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      finalProduct !== null,
      "Product должен существовать после DELETE заказа"
    );

    const finalBatchMap =
      new Map(
        finalBatches.map(
          (batch) => [
            batch.id,
            batch,
          ]
        )
      );

    assert(
      finalBatchMap.get(
        batch1Id
      )?.quantity === 3,
      `Batch #${batch1Id} после DELETE должна восстановиться до 3, получено ${finalBatchMap.get(batch1Id)?.quantity}`
    );

    assert(
      finalBatchMap.get(
        batch2Id
      )?.quantity === 3,
      `Batch #${batch2Id} после DELETE должна иметь 3, получено ${finalBatchMap.get(batch2Id)?.quantity}`
    );

    assert(
      finalBatchMap.get(
        batch3Id
      )?.quantity === 2,
      `Batch #${batch3Id} после DELETE должна иметь 2, получено ${finalBatchMap.get(batch3Id)?.quantity}`
    );

    const finalBatchSum =
      finalBatches.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    assert(
      finalProduct.stock === 8,
      `Product.stock после DELETE должен быть 8, получено ${finalProduct.stock}`
    );

    assert(
      finalBatchSum === 8,
      `SUM(Batch.quantity) после DELETE должен быть 8, получено ${finalBatchSum}`
    );

    assert(
      finalProduct.stock ===
        finalBatchSum,
      "Product.stock должен совпадать с SUM(Batch.quantity) после DELETE"
    );

    ok(
      "Batch #1 восстановлена до 3"
    );

    ok(
      "Batch #2 восстановлена до 3"
    );

    ok(
      "Batch #3 осталась 2"
    );

    ok(
      "Product.stock после DELETE = 8"
    );

    ok(
      "SUM(Batch.quantity) после DELETE = 8"
    );

    ok(
      "Списанная единица НЕ была ошибочно восстановлена DELETE"
    );

    // =========================================================================
    // 23. VERIFY MOVEMENT LEDGER
    // =========================================================================

    section(
      "23. VERIFY FINAL MOVEMENT LEDGER"
    );

    const finalMovements =
      await prisma.movement.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    const finalSupplyMovements =
      finalMovements.filter(
        (movement) =>
          movement.type ===
          "SUPPLY"
      );

    const finalSaleMovements =
      finalMovements.filter(
        (movement) =>
          movement.type ===
          "SALE"
      );

    const finalReturnMovements =
      finalMovements.filter(
        (movement) =>
          movement.type ===
          "RETURN"
      );

    const finalWriteOffMovements =
      finalMovements.filter(
        (movement) =>
          movement.type ===
          "WRITE_OFF"
      );

    assert(
      finalSupplyMovements.length ===
        3,
      `Должно быть 3 SUPPLY movements, получено ${finalSupplyMovements.length}`
    );

    assert(
      finalSaleMovements.length ===
        1,
      `Должен быть 1 SALE movement, получено ${finalSaleMovements.length}`
    );

    assert(
      finalWriteOffMovements.length ===
        1,
      `Должен быть 1 WRITE_OFF movement, получено ${finalWriteOffMovements.length}`
    );

    /*
     * RETURN movements:
     *
     * +2 клиентский возврат
     * +4 восстановление NET-проданного при DELETE
     *
     * Итого +6.
     */
    assert(
      finalReturnMovements.length >=
        1,
      `После DELETE должен существовать минимум 1 RETURN movement, получено ${finalReturnMovements.length}`
    );

    const supplyNet =
      finalSupplyMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    const saleNet =
      finalSaleMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    const returnNet =
      finalReturnMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    const writeOffNet =
      finalWriteOffMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    const ledgerNet =
      supplyNet +
      saleNet +
      returnNet +
      writeOffNet;

    assert(
      supplyNet === 9,
      `SUPPLY net должен быть 9, получено ${supplyNet}`
    );

    assert(
      saleNet === -6,
      `SALE net должен быть -6, получено ${saleNet}`
    );

    assert(
      returnNet === 6,
      `RETURN net должен быть 6 после клиентского возврата + DELETE восстановления NET-проданного, получено ${returnNet}`
    );

    assert(
      writeOffNet === -1,
      `WRITE_OFF net должен быть -1, получено ${writeOffNet}`
    );

    assert(
      ledgerNet === 8,
      `Итоговый ledger net должен быть 8, получено ${ledgerNet}`
    );

    assert(
      finalProduct.stock ===
        ledgerNet,
      `Product.stock=${finalProduct.stock} должен совпадать с ledger net=${ledgerNet}`
    );

    ok(
      `SUPPLY net = ${supplyNet}`
    );

    ok(
      `SALE net = ${saleNet}`
    );

    ok(
      `RETURN net = ${returnNet}`
    );

    ok(
      `WRITE_OFF net = ${writeOffNet}`
    );

    ok(
      `FINAL ledger net = ${ledgerNet}`
    );

    ok(
      "Ledger net совпадает с Product.stock"
    );

    // =========================================================================
    // 24. REPEATED DELETE
    // =========================================================================

    section(
      "24. VERIFY REPEATED DELETE"
    );

    const stockBeforeSecondDelete =
      finalProduct.stock;

    const batchStateBeforeSecondDelete =
      finalBatches.map(
        (batch) => ({
          id: batch.id,
          quantity: batch.quantity,
          status: batch.status,
        })
      );

    const movementCountBeforeSecondDelete =
      finalMovements.length;

    const movementNetBeforeSecondDelete =
      finalMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    const secondDeleteResponse =
      await request(
        `/api/orders/${orderId}`,
        {
          method: "DELETE",
        }
      );

    console.log(
      `Second DELETE HTTP ${secondDeleteResponse.status}`
    );

    console.log(
      JSON.stringify(
        secondDeleteResponse.data,
        null,
        2
      )
    );

    assert(
      secondDeleteResponse.status ===
        404,
      `Повторный DELETE должен вернуть HTTP 404, получено ${secondDeleteResponse.status}`
    );

    const productAfterSecondDelete =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      productAfterSecondDelete !==
        null,
      "Product должен существовать после повторного DELETE"
    );

    assert(
      productAfterSecondDelete.stock ===
        stockBeforeSecondDelete,
      `Повторный DELETE не должен менять stock: было ${stockBeforeSecondDelete}, стало ${productAfterSecondDelete.stock}`
    );

    const batchesAfterSecondDelete =
      await prisma.batch.findMany({
        where: {
          id: {
            in: [
              batch1Id,
              batch2Id,
              batch3Id,
            ],
          },
        },
        orderBy: {
          id: "asc",
        },
      });

    const batchSumAfterSecondDelete =
      batchesAfterSecondDelete.reduce(
        (sum, batch) =>
          sum + batch.quantity,
        0
      );

    assert(
      batchSumAfterSecondDelete ===
        8,
      `Повторный DELETE не должен менять Batch stock: ожидалось 8, получено ${batchSumAfterSecondDelete}`
    );

    assert(
      productAfterSecondDelete.stock ===
        batchSumAfterSecondDelete,
      "После повторного DELETE Product.stock должен совпадать с SUM(Batch.quantity)"
    );

    for (const before of batchStateBeforeSecondDelete) {
      const after =
        batchesAfterSecondDelete.find(
          (batch) =>
            batch.id ===
            before.id
        );

      assert(
        after !== undefined,
        `Batch #${before.id} должна существовать после повторного DELETE`
      );

      assert(
        after.quantity ===
          before.quantity,
        `Повторный DELETE изменил quantity Batch #${before.id}: было ${before.quantity}, стало ${after.quantity}`
      );

      assert(
        after.status ===
          before.status,
        `Повторный DELETE изменил status Batch #${before.id}: было ${before.status}, стало ${after.status}`
      );
    }

    const movementsAfterSecondDelete =
      await prisma.movement.findMany({
        where: {
          productId,
        },
      });

    const movementNetAfterSecondDelete =
      movementsAfterSecondDelete.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0
      );

    assert(
      movementsAfterSecondDelete.length ===
        movementCountBeforeSecondDelete,
      `Повторный DELETE не должен создавать Movement: было ${movementCountBeforeSecondDelete}, стало ${movementsAfterSecondDelete.length}`
    );

    assert(
      movementNetAfterSecondDelete ===
        movementNetBeforeSecondDelete,
      `Повторный DELETE не должен менять ledger net: было ${movementNetBeforeSecondDelete}, стало ${movementNetAfterSecondDelete}`
    );

    ok(
      "Повторный DELETE вернул HTTP 404"
    );

    ok(
      "Повторный DELETE не изменил Product.stock"
    );

    ok(
      "Повторный DELETE не изменил Batch stock"
    );

    ok(
      "Повторный DELETE не создал Movement"
    );

    // =========================================================================
    // 25. FINAL RESULT
    // =========================================================================

    section(
      "25. V69 FINAL RESULT"
    );

    console.log("🟢 V69 PASSED");
    console.log("");

    console.log("Проверено:");
    console.log("");

    console.log(
      "1. Product создаётся через реальный /api/products."
    );

    console.log(
      "2. Supplier создаётся через реальный /api/suppliers."
    );

    console.log(
      "3. Три Batch создаются через реальный /api/supplies."
    );

    console.log(
      "4. Product.stock синхронизирован с Batch."
    );

    console.log(
      "5. Продажа использует FEFO/FIFO по expiryDate."
    );

    console.log(
      "6. OrderBatch сохраняет фактический purchaseCost."
    );

    console.log(
      "7. Возврат использует LIFO."
    );

    console.log(
      "8. ReturnBatch указывает на последнюю проданную Batch."
    );

    console.log(
      "9. Order.total пересчитывается в NET."
    );

    console.log(
      "10. Order.profit пересчитывается в NET."
    );

    console.log(
      "11. WRITE_OFF уменьшает Batch и Product.stock."
    );

    console.log(
      "12. WRITE_OFF создаёт отрицательный Movement."
    );

    console.log(
      "13. DELETE заказа восстанавливает только NET-проданное."
    );

    console.log(
      "14. Уже возвращённый товар не восстанавливается повторно."
    );

    console.log(
      "15. Уже списанный товар не восстанавливается DELETE заказа."
    );

    console.log(
      "16. Product.stock совпадает с SUM(Batch.quantity)."
    );

    console.log(
      "17. Итоговый Movement ledger совпадает с физическим stock."
    );

    console.log(
      "18. Повторный DELETE возвращает HTTP 404."
    );

    console.log(
      "19. Повторный DELETE не изменяет stock."
    );

    console.log(
      "20. Повторный DELETE не создаёт дополнительный Movement."
    );

    console.log("");
    console.log(
      "=============================================================================="
    );
    console.log(
      "V69 TEST PASSED"
    );
    console.log(
      "=============================================================================="
    );
    console.log("");
  } finally {
    await cleanup(
      productId,
      supplierId,
      orderId
    );
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "=============================================================================="
    );
    console.error(
      "🔴 V69 TEST FAILED"
    );
    console.error(
      "=============================================================================="
    );
    console.error("");

    if (error instanceof Error) {
      console.error(error.message);
      console.error("");
      console.error(error.stack);
    } else {
      console.error(error);
    }

    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });