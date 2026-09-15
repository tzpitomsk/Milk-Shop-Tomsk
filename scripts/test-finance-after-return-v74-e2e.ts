import assert from "assert";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";
const TEST_TOKEN = Date.now().toString();

type JsonValue = any;

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{
  status: number;
  data: JsonValue;
}> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();

  let data: JsonValue = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  console.log(`HTTP ${response.status}`);

  if (data !== null) {
    console.log(JSON.stringify(data, null, 2));
  }

  return {
    status: response.status,
    data,
  };
}

function expectStatus(
  actual: number,
  expected: number,
  message: string
): void {
  assert.equal(
    actual,
    expected,
    `${message}: ожидался HTTP ${expected}, получен HTTP ${actual}`
  );
}

function getProductId(data: JsonValue): number {
  const id =
    data?.id ??
    data?.product?.id ??
    data?.data?.product?.id;

  assert.equal(
    typeof id,
    "number",
    `Не удалось определить Product ID: ${JSON.stringify(data)}`
  );

  return id;
}

function getOrderId(data: JsonValue): number {
  const id =
    data?.id ??
    data?.order?.id ??
    data?.data?.order?.id;

  assert.equal(
    typeof id,
    "number",
    `Не удалось определить Order ID: ${JSON.stringify(data)}`
  );

  return id;
}

function getOrderItemId(
  data: JsonValue,
  productId: number
): number {
  const order =
    data?.order ??
    data?.data?.order ??
    data;

  const items =
    order?.items ??
    order?.order?.items ??
    order?.data?.items;

  assert.ok(
    Array.isArray(items),
    `В ответе отсутствует массив items: ${JSON.stringify(data)}`
  );

  const item = items.find(
    (candidate: JsonValue) =>
      candidate.productId === productId
  );

  assert.ok(
    item,
    `OrderItem для Product #${productId} не найден`
  );

  assert.equal(
    typeof item.id,
    "number",
    `OrderItem ID имеет неверный формат: ${JSON.stringify(item)}`
  );

  return item.id;
}

function getFinanceValue(
  data: JsonValue,
  field: string
): number {
  const value = data?.[field];

  assert.equal(
    typeof value,
    "number",
    `Finance.${field} имеет неверный формат: ${JSON.stringify(data)}`
  );

  return value;
}

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=============================================================================="
  );
  console.log(
    "V74 — FINANCE AFTER PARTIAL RETURN E2E TEST"
  );
  console.log(
    "=============================================================================="
  );
  console.log("");

  let productId: number | null = null;
  let supplierId: number | null = null;
  let supply1Id: number | null = null;
  let supply2Id: number | null = null;
  let batch1Id: number | null = null;
  let batch2Id: number | null = null;
  let orderId: number | null = null;
  let orderItemId: number | null = null;

  try {
    // =========================================================================
    // 1. CREATE TEST PRODUCT
    // =========================================================================

    console.log("1. CREATE TEST PRODUCT");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const productResponse = await request("/api/products", {
      method: "POST",
      body: JSON.stringify({
        name: `V74 Finance Test Product ${TEST_TOKEN}`,
        unit: "шт",
        price: 300,
        cost: 0,
        barcode: `V74-${TEST_TOKEN}`,
      }),
    });

    expectStatus(
      productResponse.status,
      200,
      "Создание V74 Product"
    );

    productId = getProductId(
      productResponse.data
    );

    console.log(`Product #${productId}`);
    console.log("");

    // =========================================================================
    // 2. CREATE TEST SUPPLIER
    // =========================================================================

    console.log("2. CREATE TEST SUPPLIER");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const supplierResponse = await request(
      "/api/suppliers",
      {
        method: "POST",
        body: JSON.stringify({
          name: `V74 Finance Test Supplier ${TEST_TOKEN}`,
        }),
      }
    );

    expectStatus(
      supplierResponse.status,
      200,
      "Создание V74 Supplier"
    );

    supplierId =
      supplierResponse.data?.id ??
      supplierResponse.data?.supplier?.id ??
      supplierResponse.data?.data?.supplier?.id;

    assert.equal(
      typeof supplierId,
      "number",
      `Не удалось определить Supplier ID: ${JSON.stringify(
        supplierResponse.data
      )}`
    );

    console.log(`Supplier #${supplierId}`);
    console.log("");

    // =========================================================================
    // 3. SUPPLY BATCH 1 — 2 UNITS @ 100
    // =========================================================================

    console.log("3. SUPPLY BATCH 1 — 2 UNITS @ 100");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const supply1Response = await request(
      "/api/supplies",
      {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          items: [
            {
              id: productId,
              quantity: 2,
              cost: 100,
              expiryDate: "2026-10-01",
            },
          ],
        }),
      }
    );

    expectStatus(
      supply1Response.status,
      200,
      "Создание первой партии"
    );

    supply1Id =
      supply1Response.data?.supply?.id ??
      supply1Response.data?.data?.supply?.id ??
      supply1Response.data?.id ??
      supply1Response.data?.data?.id;

    assert.equal(
      typeof supply1Id,
      "number",
      `Не удалось определить Supply #1 ID: ${JSON.stringify(
        supply1Response.data
      )}`
    );

    console.log(`Supply #${supply1Id}`);
    console.log("");

    // =========================================================================
    // 4. SUPPLY BATCH 2 — 3 UNITS @ 120
    // =========================================================================

    console.log("4. SUPPLY BATCH 2 — 3 UNITS @ 120");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const supply2Response = await request(
      "/api/supplies",
      {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          items: [
            {
              id: productId,
              quantity: 3,
              cost: 120,
              expiryDate: "2026-11-01",
            },
          ],
        }),
      }
    );

    expectStatus(
      supply2Response.status,
      200,
      "Создание второй партии"
    );

    supply2Id =
      supply2Response.data?.supply?.id ??
      supply2Response.data?.data?.supply?.id ??
      supply2Response.data?.id ??
      supply2Response.data?.data?.id;

    assert.equal(
      typeof supply2Id,
      "number",
      `Не удалось определить Supply #2 ID: ${JSON.stringify(
        supply2Response.data
      )}`
    );

    console.log(`Supply #${supply2Id}`);
    console.log("");

    // =========================================================================
    // 5. LOAD EXACT TEST BATCHES
    // =========================================================================

    console.log("5. LOAD EXACT TEST BATCHES");
    console.log(
      "------------------------------------------------------------------------------"
    );

    assert.notEqual(
      productId,
      null,
      "Product ID отсутствует"
    );

    const batches =
      await prisma.batch.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    assert.equal(
      batches.length,
      2,
      `Для V74 Product ожидалось 2 Batch, найдено ${batches.length}`
    );

    const batch1 = batches.find(
      (batch) => batch.purchaseCost === 100
    );

    const batch2 = batches.find(
      (batch) => batch.purchaseCost === 120
    );

    assert.ok(
      batch1,
      "Batch с purchaseCost=100 не найден"
    );

    assert.ok(
      batch2,
      "Batch с purchaseCost=120 не найден"
    );

    assert.equal(
      batch1.quantity,
      2,
      "Первая партия должна содержать 2 единицы"
    );

    assert.equal(
      batch2.quantity,
      3,
      "Вторая партия должна содержать 3 единицы"
    );

    batch1Id = batch1.id;
    batch2Id = batch2.id;

    console.log(
      `Batch #${batch1Id}: quantity=2, purchaseCost=100`
    );

    console.log(
      `Batch #${batch2Id}: quantity=3, purchaseCost=120`
    );

    console.log("");

    // =========================================================================
    // 6. VERIFY INITIAL STOCK
    // =========================================================================

    console.log("6. VERIFY INITIAL STOCK");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const initialProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert.ok(
      initialProduct,
      "V74 Product не найден"
    );

    assert.equal(
      initialProduct.stock,
      5,
      "Начальный Product.stock должен быть 5"
    );

    const initialBatchSum =
      batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

    assert.equal(
      initialBatchSum,
      5,
      "Начальная сумма Batch.quantity должна быть 5"
    );

    assert.equal(
      initialProduct.stock,
      initialBatchSum,
      "Product.stock должен совпадать с SUM(Batch.quantity)"
    );

    console.log(
      `Product #${productId} stock=${initialProduct.stock}`
    );

    console.log(
      `SUM(Batch.quantity)=${initialBatchSum}`
    );

    console.log("");
    console.log("🟢 Initial stock correct");
    console.log("");

    // =========================================================================
    // 7. CREATE ORDER FOR ALL 5 UNITS
    // =========================================================================

    console.log("7. CREATE ORDER FOR ALL 5 UNITS");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const orderResponse = await request(
      "/api/orders",
      {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              id: productId,
              quantity: 5,
            },
          ],
        }),
      }
    );

    expectStatus(
      orderResponse.status,
      201,
      "Создание V74 заказа"
    );

    orderId = getOrderId(
      orderResponse.data
    );

    orderItemId = getOrderItemId(
      orderResponse.data,
      productId
    );

    const createdOrder =
      orderResponse.data?.order ??
      orderResponse.data?.data?.order ??
      orderResponse.data;

    assert.equal(
      createdOrder.total,
      1500,
      "Order.total должен быть 1500"
    );

    assert.equal(
      createdOrder.profit,
      940,
      "Order.profit должен быть 940"
    );

    assert.equal(
      createdOrder.status,
      "COMPLETED",
      "Новый заказ должен иметь COMPLETED"
    );

    console.log(`Order #${orderId}`);
    console.log(`OrderItem #${orderItemId}`);
    console.log(
      `Order total=${createdOrder.total}`
    );
    console.log(
      `Order profit=${createdOrder.profit}`
    );
    console.log(
      `Order status=${createdOrder.status}`
    );

    console.log("");

    // =========================================================================
    // 8. VERIFY FINANCE AFTER SALE
    // =========================================================================

    console.log("8. VERIFY FINANCE AFTER SALE");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const financeAfterSale =
      await request("/api/finance");

    expectStatus(
      financeAfterSale.status,
      200,
      "Получение Finance после продажи"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "revenueToday"
      ),
      1500,
      "Finance revenueToday после продажи должен быть 1500"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "profitToday"
      ),
      940,
      "Finance profitToday после продажи должен быть 940"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "ordersToday"
      ),
      1,
      "Finance ordersToday после продажи должен быть 1"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "revenueTotal"
      ),
      1500,
      "Finance revenueTotal после продажи должен быть 1500"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "profitTotal"
      ),
      940,
      "Finance profitTotal после продажи должен быть 940"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "ordersTotal"
      ),
      1,
      "Finance ordersTotal после продажи должен быть 1"
    );

    assert.equal(
      getFinanceValue(
        financeAfterSale.data,
        "averageCheck"
      ),
      1500,
      "Finance averageCheck после продажи должен быть 1500"
    );

    console.log("");
    console.log(
      "🟢 Finance after sale is correct"
    );
    console.log("");

    // =========================================================================
    // 9. PARTIAL RETURN — 2 UNITS
    // =========================================================================

    console.log("9. PARTIAL RETURN — 2 UNITS");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const returnResponse = await request(
      `/api/orders/${orderId}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItemId,
          quantity: 2,
        }),
      }
    );

    expectStatus(
      returnResponse.status,
      200,
      "Частичный возврат V74"
    );

    const returnedOrder =
      returnResponse.data?.order ??
      returnResponse.data?.data?.order;

    assert.ok(
      returnedOrder,
      "После возврата отсутствует Order в ответе"
    );

    assert.equal(
      returnedOrder.total,
      900,
      "После возврата Order.total должен быть 900"
    );

    assert.equal(
      returnedOrder.profit,
      580,
      "После возврата Order.profit должен быть 580"
    );

    assert.equal(
      returnedOrder.status,
      "PARTIAL_RETURN",
      "После возврата статус должен быть PARTIAL_RETURN"
    );

    assert.equal(
      returnResponse.data?.returnedQuantity ??
        returnResponse.data?.data?.returnedQuantity,
      2,
      "returnedQuantity должен быть 2"
    );

    console.log(
      `Order total=${returnedOrder.total}`
    );

    console.log(
      `Order profit=${returnedOrder.profit}`
    );

    console.log(
      `Order status=${returnedOrder.status}`
    );

    console.log("");

    // =========================================================================
    // 10. VERIFY RETURNBATCH COST
    // =========================================================================

    console.log("10. VERIFY RETURNBATCH COST");
    console.log(
      "------------------------------------------------------------------------------"
    );

    assert.notEqual(
      orderItemId,
      null,
      "OrderItem ID отсутствует"
    );

    const returnBatches =
      await prisma.returnBatch.findMany({
        where: {
          orderItemId,
        },
        include: {
          Batch: true,
        },
      });

    assert.equal(
      returnBatches.length,
      1,
      "После одного возврата должна быть одна ReturnBatch запись"
    );

    assert.equal(
      returnBatches[0].quantity,
      2,
      "ReturnBatch.quantity должен быть 2"
    );

    assert.equal(
      returnBatches[0].Batch.purchaseCost,
      120,
      "LIFO возврат должен идти из Batch с purchaseCost=120"
    );

    console.log(
      `ReturnBatch #${returnBatches[0].id}: quantity=${returnBatches[0].quantity}`
    );

    console.log(
      `Returned Batch #${returnBatches[0].batchId}: purchaseCost=${returnBatches[0].Batch.purchaseCost}`
    );

    console.log("");
    console.log(
      "🟢 ReturnBatch cost is correct"
    );
    console.log("");

    // =========================================================================
    // 11. VERIFY FINANCE AFTER RETURN
    // =========================================================================

    console.log("11. VERIFY FINANCE AFTER RETURN");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const financeAfterReturn =
      await request("/api/finance");

    expectStatus(
      financeAfterReturn.status,
      200,
      "Получение Finance после возврата"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "revenueToday"
      ),
      900,
      "Finance revenueToday после возврата должен быть 900"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "profitToday"
      ),
      580,
      "Finance profitToday после возврата должен быть 580"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "ordersToday"
      ),
      1,
      "Finance ordersToday после возврата должен оставаться 1"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "revenueTotal"
      ),
      900,
      "Finance revenueTotal после возврата должен быть 900"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "profitTotal"
      ),
      580,
      "Finance profitTotal после возврата должен быть 580"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "ordersTotal"
      ),
      1,
      "Finance ordersTotal после возврата должен оставаться 1"
    );

    assert.equal(
      getFinanceValue(
        financeAfterReturn.data,
        "averageCheck"
      ),
      900,
      "Finance averageCheck после возврата должен быть 900"
    );

    console.log("");
    console.log(
      "🟢 Finance after return is correct"
    );
    console.log("");

    // =========================================================================
    // 12. VERIFY DATABASE FINANCIAL STATE
    // =========================================================================

    console.log("12. VERIFY DATABASE FINANCIAL STATE");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const databaseOrder =
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
              },
            },
          },
        },
      });

    assert.ok(
      databaseOrder,
      "Order не найден в базе"
    );

    assert.equal(
      databaseOrder.total,
      900,
      "DB Order.total должен быть 900"
    );

    assert.equal(
      databaseOrder.profit,
      580,
      "DB Order.profit должен быть 580"
    );

    assert.equal(
      databaseOrder.status,
      "PARTIAL_RETURN",
      "DB Order.status должен быть PARTIAL_RETURN"
    );

    assert.equal(
      databaseOrder.items.length,
      1,
      "В заказе должен быть один OrderItem"
    );

    assert.equal(
      databaseOrder.items[0].quantity,
      5,
      "OrderItem.quantity должен оставаться 5"
    );

    assert.equal(
      databaseOrder.items[0].returned,
      2,
      "OrderItem.returned должен быть 2"
    );

    const orderBatchCost =
      databaseOrder.items[0].batches.reduce(
        (sum, batch) =>
          sum +
          batch.quantity *
            batch.purchaseCost,
        0
      );

    const returnedBatchCost =
      databaseOrder.items[0].ReturnBatch.reduce(
        (sum, itemReturn) =>
          sum +
          itemReturn.quantity *
            itemReturn.Batch.purchaseCost,
        0
      );

    const netCost =
      orderBatchCost -
      returnedBatchCost;

    const netRevenue =
      databaseOrder.items[0].price *
      (
        databaseOrder.items[0].quantity -
        databaseOrder.items[0].returned
      );

    const netProfit =
      netRevenue -
      netCost;

    assert.equal(
      orderBatchCost,
      560,
      "Original OrderBatch cost должен быть 560"
    );

    assert.equal(
      returnedBatchCost,
      240,
      "Returned Batch cost должен быть 240"
    );

    assert.equal(
      netCost,
      320,
      "NET cost должен быть 320"
    );

    assert.equal(
      netRevenue,
      900,
      "NET revenue должен быть 900"
    );

    assert.equal(
      netProfit,
      580,
      "NET profit должен быть 580"
    );

    assert.equal(
      databaseOrder.total,
      netRevenue,
      "Order.total должен совпадать с NET revenue"
    );

    assert.equal(
      databaseOrder.profit,
      netProfit,
      "Order.profit должен совпадать с NET profit"
    );

    console.log(
      `Original cost=${orderBatchCost}`
    );

    console.log(
      `Returned cost=${returnedBatchCost}`
    );

    console.log(
      `NET cost=${netCost}`
    );

    console.log(
      `NET revenue=${netRevenue}`
    );

    console.log(
      `NET profit=${netProfit}`
    );

    console.log("");
    console.log(
      "🟢 Database financial state is correct"
    );
    console.log("");

    // =========================================================================
    // 13. VERIFY STOCK AFTER RETURN
    // =========================================================================

    console.log("13. VERIFY STOCK AFTER RETURN");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const afterReturnBatches =
      await prisma.batch.findMany({
        where: {
          productId,
        },
        orderBy: {
          id: "asc",
        },
      });

    const afterReturnBatch1 =
      afterReturnBatches.find(
        (batch) => batch.id === batch1Id
      );

    const afterReturnBatch2 =
      afterReturnBatches.find(
        (batch) => batch.id === batch2Id
      );

    assert.ok(
      afterReturnBatch1,
      "Batch #1 не найден после возврата"
    );

    assert.ok(
      afterReturnBatch2,
      "Batch #2 не найден после возврата"
    );

    assert.equal(
      afterReturnBatch1.quantity,
      0,
      "Batch #1 после продажи должен быть 0"
    );

    assert.equal(
      afterReturnBatch2.quantity,
      2,
      "Batch #2 после возврата 2 единиц должен быть 2"
    );

    const productAfterReturn =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert.ok(
      productAfterReturn,
      "Product не найден после возврата"
    );

    assert.equal(
      productAfterReturn.stock,
      2,
      "Product.stock после возврата должен быть 2"
    );

    console.log(
      `Batch #${batch1Id}: quantity=${afterReturnBatch1.quantity}`
    );

    console.log(
      `Batch #${batch2Id}: quantity=${afterReturnBatch2.quantity}`
    );

    console.log(
      `Product stock=${productAfterReturn.stock}`
    );

    console.log("");
    console.log(
      "🟢 Stock after return is correct"
    );
    console.log("");

    // =========================================================================
    // 14. DELETE ORDER
    // =========================================================================

    console.log("14. DELETE ORDER");
    console.log(
      "------------------------------------------------------------------------------"
    );

    assert.notEqual(
      orderId,
      null,
      "Order ID отсутствует"
    );

    const deleteResponse = await request(
      `/api/orders/${orderId}`,
      {
        method: "DELETE",
      }
    );

    expectStatus(
      deleteResponse.status,
      200,
      "DELETE V74 заказа"
    );

    assert.equal(
      deleteResponse.data?.success,
      true,
      "DELETE должен вернуть success=true"
    );

    console.log("");
    console.log(
      "🟢 Order DELETE succeeded"
    );
    console.log("");

    // =========================================================================
    // 15. VERIFY DELETE RESTORATION
    // =========================================================================

    console.log("15. VERIFY DELETE RESTORATION");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const deletedOrder =
      await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

    assert.equal(
      deletedOrder,
      null,
      "Order должен быть удалён"
    );

    const restoredBatch1 =
      await prisma.batch.findUnique({
        where: {
          id: batch1Id,
        },
      });

    const restoredBatch2 =
      await prisma.batch.findUnique({
        where: {
          id: batch2Id,
        },
      });

    assert.ok(
      restoredBatch1,
      "Batch #1 отсутствует после DELETE"
    );

    assert.ok(
      restoredBatch2,
      "Batch #2 отсутствует после DELETE"
    );

    assert.equal(
      restoredBatch1.quantity,
      2,
      "Batch #1 должен восстановиться до 2"
    );

    assert.equal(
      restoredBatch2.quantity,
      3,
      "Batch #2 должен восстановиться до 3"
    );

    const restoredProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert.ok(
      restoredProduct,
      "Product отсутствует после DELETE"
    );

    assert.equal(
      restoredProduct.stock,
      5,
      "Product.stock должен восстановиться до 5"
    );

    console.log(
      `Batch #${batch1Id}: quantity=${restoredBatch1.quantity}`
    );

    console.log(
      `Batch #${batch2Id}: quantity=${restoredBatch2.quantity}`
    );

    console.log(
      `Product stock=${restoredProduct.stock}`
    );

    console.log("");
    console.log(
      "🟢 DELETE restoration is correct"
    );
    console.log("");

    // =========================================================================
    // 16. REPEATED DELETE
    // =========================================================================

    console.log("16. REPEATED DELETE");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const repeatedDeleteResponse =
      await request(
        `/api/orders/${orderId}`,
        {
          method: "DELETE",
        }
      );

    expectStatus(
      repeatedDeleteResponse.status,
      404,
      "Повторный DELETE"
    );

    assert.equal(
      repeatedDeleteResponse.data?.error,
      "Заказ не найден"
    );

    console.log("");
    console.log(
      "🟢 Repeated DELETE correctly returned 404"
    );
    console.log("");

    // =========================================================================
    // 17. VERIFY FINAL FINANCE AFTER DELETE
    // =========================================================================

    console.log("17. VERIFY FINAL FINANCE AFTER DELETE");
    console.log(
      "------------------------------------------------------------------------------"
    );

    const financeAfterDelete =
      await request("/api/finance");

    expectStatus(
      financeAfterDelete.status,
      200,
      "Получение Finance после DELETE"
    );

    assert.equal(
      getFinanceValue(
        financeAfterDelete.data,
        "revenueTotal"
      ),
      0,
      "Finance revenueTotal после DELETE должен быть 0"
    );

    assert.equal(
      getFinanceValue(
        financeAfterDelete.data,
        "profitTotal"
      ),
      0,
      "Finance profitTotal после DELETE должен быть 0"
    );

    assert.equal(
      getFinanceValue(
        financeAfterDelete.data,
        "ordersTotal"
      ),
      0,
      "Finance ordersTotal после DELETE должен быть 0"
    );

    console.log("");
    console.log(
      "🟢 Finance after DELETE is clean"
    );
    console.log("");

    // =========================================================================
    // 18. FINAL RESULT
    // =========================================================================

    console.log(
      "=============================================================================="
    );
    console.log("V74 FINAL RESULT");
    console.log(
      "=============================================================================="
    );
    console.log("");

    console.log("🟢 V74 PASSED");
    console.log("");

    console.log(
      "Проверено:"
    );

    console.log(
      "1. Finance после обычной продажи."
    );

    console.log(
      "2. Finance после частичного возврата."
    );

    console.log(
      "3. NET revenue после возврата."
    );

    console.log(
      "4. NET profit после возврата."
    );

    console.log(
      "5. Order.total соответствует NET revenue."
    );

    console.log(
      "6. Order.profit соответствует NET profit."
    );

    console.log(
      "7. ReturnBatch использует LIFO Batch."
    );

    console.log(
      "8. ReturnBatch использует правильную purchaseCost."
    );

    console.log(
      "9. Product.stock восстанавливается."
    );

    console.log(
      "10. DELETE восстанавливает партии."
    );

    console.log(
      "11. Повторный DELETE безопасен."
    );

    console.log(
      "12. Finance очищается после DELETE."
    );

    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "🔴 V74 FAILED"
    );
    console.error("");
    console.error(error);
    console.error("");

    throw error;
  } finally {
    // =========================================================================
    // CLEANUP
    // =========================================================================

    console.log("");
    console.log(
      "=============================================================================="
    );
    console.log("CLEANUP");
    console.log(
      "=============================================================================="
    );
    console.log("");

    try {
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

      if (productId !== null) {
        await prisma.movement.deleteMany({
          where: {
            productId,
          },
        });

        await prisma.batch.deleteMany({
          where: {
            productId,
          },
        });

        await prisma.supplyItem.deleteMany({
          where: {
            productId,
          },
        });

        await prisma.product.deleteMany({
          where: {
            id: productId,
          },
        });
      }

      if (supply1Id !== null) {
        await prisma.supplyItem.deleteMany({
          where: {
            supplyId: supply1Id,
          },
        });

        await prisma.supply.deleteMany({
          where: {
            id: supply1Id,
          },
        });
      }

      if (supply2Id !== null) {
        await prisma.supplyItem.deleteMany({
          where: {
            supplyId: supply2Id,
          },
        });

        await prisma.supply.deleteMany({
          where: {
            id: supply2Id,
          },
        });
      }

      if (supplierId !== null) {
        await prisma.supplier.deleteMany({
          where: {
            id: supplierId,
          },
        });
      }

      console.log("");
      console.log(
        "🟢 CLEANUP COMPLETED"
      );
      console.log("");
    } catch (cleanupError) {
      console.error("");
      console.error(
        "🔴 CLEANUP FAILED"
      );
      console.error("");
      console.error(cleanupError);
      console.error("");
    }

    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
