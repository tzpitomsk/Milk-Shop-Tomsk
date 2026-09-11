import { strict as assert } from "node:assert";
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
const id = data?.id ?? data?.product?.id ?? data?.data?.product?.id;

assert.equal(
typeof id,
"number",
`Не удалось определить Product ID из ответа: ${JSON.stringify(data)}`
);

return id;
}

function getSupplyId(data: JsonValue): number {
const id =
data?.supply?.id ??
data?.data?.supply?.id ??
data?.id ??
data?.data?.id;

assert.equal(
typeof id,
"number",
`Не удалось определить Supply ID из ответа: ${JSON.stringify(data)}`
);

return id;
}

function getOrderId(data: JsonValue): number {
const id = data?.id ?? data?.order?.id ?? data?.data?.order?.id;

assert.equal(
typeof id,
"number",
`Не удалось определить Order ID из ответа: ${JSON.stringify(data)}`
);

return id;
}

function getOrderItemId(
order: JsonValue,
productId: number
): number {
const items =
order?.items ??
order?.order?.items ??
order?.data?.items ??
order?.data?.order?.items;

assert.ok(
Array.isArray(items),
`В ответе отсутствует массив items: ${JSON.stringify(order)}`
);

const item = items.find(
(candidate: JsonValue) => candidate.productId === productId
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

function getBatchIdFromSupplyResponse(
data: JsonValue,
productId: number
): number | null {
const directCandidates = [
data?.batch?.id,
data?.data?.batch?.id,
data?.supply?.batch?.id,
data?.data?.supply?.batch?.id,
];

for (const candidate of directCandidates) {
if (typeof candidate === "number") {
return candidate;
}
}

const items =
data?.supply?.items ??
data?.data?.supply?.items ??
data?.items ??
data?.data?.items;

if (Array.isArray(items)) {
const item = items.find(
(candidate: JsonValue) =>
candidate.productId === productId
);


const batchId =
  item?.batch?.id ??
  item?.Batch?.id ??
  item?.batchId;

if (typeof batchId === "number") {
  return batchId;
}


}

return null;
}

async function loadBatchesForProduct(
productId: number
): Promise<
Array<{
id: number;
quantity: number;
purchaseCost: number;
receivedAt: Date;
expiryDate: Date;
status: string;
productId: number;
}>> {
const batches = await prisma.batch.findMany({
where: {
productId,
},
orderBy: {
id: "asc",
},
});

return batches;
}

async function main(): Promise<void> {
console.log("");
console.log(
"=============================================================================="
);
console.log(
"V60 — MULTI-RETURN + MULTI-PRODUCT DELETE INTEGRATION TEST"
);
console.log(
"=============================================================================="
);
console.log("");

let productAId: number | null = null;
let productBId: number | null = null;
let supplierId: number | null = null;

let supplyA1Id: number | null = null;
let supplyA2Id: number | null = null;
let supplyB1Id: number | null = null;
let supplyB2Id: number | null = null;

let batchA1Id: number | null = null;
let batchA2Id: number | null = null;
let batchB1Id: number | null = null;
let batchB2Id: number | null = null;

let orderId: number | null = null;
let orderItemAId: number | null = null;
let orderItemBId: number | null = null;

try {
// =========================================================================
// 1. CREATE TWO TEST PRODUCTS
// =========================================================================


console.log("1. CREATE TWO TEST PRODUCTS");
console.log(
  "------------------------------------------------------------------------------"
);

const productAResponse = await request("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: `V60 Test Product A ${TEST_TOKEN}`,
    unit: "шт",
    price: 300,
    cost: 0,
    barcode: `V60-A-${TEST_TOKEN}`,
  }),
});

expectStatus(
  productAResponse.status,
  200,
  "Создание Product A"
);

productAId = getProductId(productAResponse.data);

console.log(`Product A #${productAId}`);
console.log("");

const productBResponse = await request("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: `V60 Test Product B ${TEST_TOKEN}`,
    unit: "шт",
    price: 500,
    cost: 0,
    barcode: `V60-B-${TEST_TOKEN}`,
  }),
});

expectStatus(
  productBResponse.status,
  200,
  "Создание Product B"
);

productBId = getProductId(productBResponse.data);

console.log(`Product B #${productBId}`);
console.log("");

// =========================================================================
// 2. CREATE TEST SUPPLIER
// =========================================================================

console.log("2. CREATE TEST SUPPLIER");
console.log(
  "------------------------------------------------------------------------------"
);

const supplierResponse = await request("/api/suppliers", {
  method: "POST",
  body: JSON.stringify({
    name: `V60 Test Supplier ${TEST_TOKEN}`,
  }),
});

expectStatus(
  supplierResponse.status,
  200,
  "Создание Supplier"
);

supplierId =
  supplierResponse.data?.id ??
  supplierResponse.data?.supplier?.id ??
  supplierResponse.data?.data?.supplier?.id;

assert.equal(
  typeof supplierId,
  "number",
  "Не удалось определить Supplier ID"
);

console.log(`Supplier #${supplierId}`);
console.log("");

// =========================================================================
// 3. SUPPLY PRODUCT A — BATCH A1
// =========================================================================

console.log("3. SUPPLY PRODUCT A — BATCH A1");
console.log(
  "------------------------------------------------------------------------------"
);

const supplyA1Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productAId,
        quantity: 2,
        cost: 100,
        expiryDate: "2026-09-19",
      },
    ],
  }),
});

expectStatus(
  supplyA1Response.status,
  200,
  "Supply Product A / Batch A1"
);

supplyA1Id = getSupplyId(supplyA1Response.data);

console.log(`Supply A1 #${supplyA1Id}`);
console.log("");

// =========================================================================
// 4. SUPPLY PRODUCT A — BATCH A2
// =========================================================================

console.log("4. SUPPLY PRODUCT A — BATCH A2");
console.log(
  "------------------------------------------------------------------------------"
);

const supplyA2Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productAId,
        quantity: 3,
        cost: 120,
        expiryDate: "2026-10-19",
      },
    ],
  }),
});

expectStatus(
  supplyA2Response.status,
  200,
  "Supply Product A / Batch A2"
);

supplyA2Id = getSupplyId(supplyA2Response.data);

console.log(`Supply A2 #${supplyA2Id}`);
console.log("");

// =========================================================================
// 5. SUPPLY PRODUCT B — BATCH B1
// =========================================================================

console.log("5. SUPPLY PRODUCT B — BATCH B1");
console.log(
  "------------------------------------------------------------------------------"
);

const supplyB1Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productBId,
        quantity: 2,
        cost: 200,
        expiryDate: "2026-09-24",
      },
    ],
  }),
});

expectStatus(
  supplyB1Response.status,
  200,
  "Supply Product B / Batch B1"
);

supplyB1Id = getSupplyId(supplyB1Response.data);

console.log(`Supply B1 #${supplyB1Id}`);
console.log("");

// =========================================================================
// 6. SUPPLY PRODUCT B — BATCH B2
// =========================================================================

console.log("6. SUPPLY PRODUCT B — BATCH B2");
console.log(
  "------------------------------------------------------------------------------"
);

const supplyB2Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productBId,
        quantity: 3,
        cost: 220,
        expiryDate: "2026-10-24",
      },
    ],
  }),
});

expectStatus(
  supplyB2Response.status,
  200,
  "Supply Product B / Batch B2"
);

supplyB2Id = getSupplyId(supplyB2Response.data);

console.log(`Supply B2 #${supplyB2Id}`);
console.log("");

// =========================================================================
// 7. LOAD CREATED BATCHES
// =========================================================================

console.log("7. LOAD CREATED BATCHES");
console.log(
  "------------------------------------------------------------------------------"
);

const batchesA = await loadBatchesForProduct(productAId);
const batchesB = await loadBatchesForProduct(productBId);

assert.equal(
  batchesA.length,
  2,
  `Для Product A ожидалось 2 партии, найдено ${batchesA.length}`
);

assert.equal(
  batchesB.length,
  2,
  `Для Product B ожидалось 2 партии, найдено ${batchesB.length}`
);

const aByCost = new Map(
  batchesA.map((batch) => [batch.purchaseCost, batch])
);

const bByCost = new Map(
  batchesB.map((batch) => [batch.purchaseCost, batch])
);

const batchA1 = aByCost.get(100);
const batchA2 = aByCost.get(120);
const batchB1 = bByCost.get(200);
const batchB2 = bByCost.get(220);

assert.ok(batchA1, "Batch A1 не найден");
assert.ok(batchA2, "Batch A2 не найден");
assert.ok(batchB1, "Batch B1 не найден");
assert.ok(batchB2, "Batch B2 не найден");

batchA1Id = batchA1.id;
batchA2Id = batchA2.id;
batchB1Id = batchB1.id;
batchB2Id = batchB2.id;

console.log(
  `Product A: Batch #${batchA1Id}=2 @100, Batch #${batchA2Id}=3 @120`
);

console.log(
  `Product B: Batch #${batchB1Id}=2 @200, Batch #${batchB2Id}=3 @220`
);

console.log("");

// =========================================================================
// 8. VERIFY INITIAL STOCK
// =========================================================================

console.log("8. VERIFY INITIAL STOCK");
console.log(
  "------------------------------------------------------------------------------"
);

const productAInitial = await request(
  `/api/products/${productAId}`
);

const productBInitial = await request(
  `/api/products/${productBId}`
);

expectStatus(
  productAInitial.status,
  200,
  "Получение Product A"
);

expectStatus(
  productBInitial.status,
  200,
  "Получение Product B"
);

const initialStockA =
  productAInitial.data?.stock ??
  productAInitial.data?.product?.stock ??
  productAInitial.data?.data?.stock;

const initialStockB =
  productBInitial.data?.stock ??
  productBInitial.data?.product?.stock ??
  productBInitial.data?.data?.stock;

assert.equal(initialStockA, 5);
assert.equal(initialStockB, 5);

console.log(`Product A stock=${initialStockA}`);
console.log(`Product B stock=${initialStockB}`);
console.log("");
console.log("🟢 Initial stock correct");
console.log("");

// =========================================================================
// 9. CREATE MULTI-PRODUCT ORDER
// =========================================================================

console.log("9. CREATE MULTI-PRODUCT ORDER");
console.log(
  "------------------------------------------------------------------------------"
);

const orderResponse = await request("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    items: [
      {
        id: productAId,
        quantity: 5,
        price: 300,
      },
      {
        id: productBId,
        quantity: 4,
        price: 500,
      },
    ],
  }),
});

expectStatus(
  orderResponse.status,
  201,
  "Создание многотоварного заказа"
);

orderId = getOrderId(orderResponse.data);

const createdOrder =
  orderResponse.data?.order ??
  orderResponse.data?.data?.order ??
  orderResponse.data;

assert.equal(
  createdOrder.total,
  3500,
  "Gross total должен быть 3500"
);

assert.equal(
  createdOrder.profit,
  2100,
  "Gross profit должен быть 2100"
);

assert.equal(
  createdOrder.status,
  "COMPLETED",
  "Новый заказ должен иметь COMPLETED"
);

orderItemAId = getOrderItemId(
  createdOrder,
  productAId
);

orderItemBId = getOrderItemId(
  createdOrder,
  productBId
);

console.log(`Order #${orderId}`);
console.log(`Gross total=${createdOrder.total}`);
console.log(`Gross profit=${createdOrder.profit}`);
console.log(`OrderItem A #${orderItemAId}`);
console.log(`OrderItem B #${orderItemBId}`);
console.log("");

// =========================================================================
// 10. VERIFY ORDERBATCH ALLOCATION
// =========================================================================

console.log("10. VERIFY ORDERBATCH ALLOCATION");
console.log(
  "------------------------------------------------------------------------------"
);

const orderBatches = await prisma.orderBatch.findMany({
  where: {
    orderItemId: {
      in: [orderItemAId, orderItemBId],
    },
  },
  include: {
    batch: true,
  },
  orderBy: {
    id: "asc",
  },
});

const orderBatchA = orderBatches.filter(
  (item) => item.orderItemId === orderItemAId
);

const orderBatchB = orderBatches.filter(
  (item) => item.orderItemId === orderItemBId
);

assert.equal(orderBatchA.length, 2);
assert.equal(orderBatchB.length, 2);

const allocationA1 = orderBatchA.find(
  (item) => item.batchId === batchA1Id
);

const allocationA2 = orderBatchA.find(
  (item) => item.batchId === batchA2Id
);

const allocationB1 = orderBatchB.find(
  (item) => item.batchId === batchB1Id
);

const allocationB2 = orderBatchB.find(
  (item) => item.batchId === batchB2Id
);

assert.ok(allocationA1);
assert.ok(allocationA2);
assert.ok(allocationB1);
assert.ok(allocationB2);

assert.equal(allocationA1.quantity, 2);
assert.equal(allocationA1.purchaseCost, 100);

assert.equal(allocationA2.quantity, 3);
assert.equal(allocationA2.purchaseCost, 120);

assert.equal(allocationB1.quantity, 2);
assert.equal(allocationB1.purchaseCost, 200);

assert.equal(allocationB2.quantity, 2);
assert.equal(allocationB2.purchaseCost, 220);

console.log(
  `Product A: Batch #${batchA1Id}=2 @100, Batch #${batchA2Id}=3 @120`
);

console.log(
  `Product B: Batch #${batchB1Id}=2 @200, Batch #${batchB2Id}=2 @220`
);

console.log("");
console.log("🟢 OrderBatch allocation correct");
console.log("");

// =========================================================================
// 11. VERIFY STOCK AFTER SALE
// =========================================================================

console.log("11. VERIFY STOCK AFTER SALE");
console.log(
  "------------------------------------------------------------------------------"
);

const afterSaleA = await prisma.batch.findMany({
  where: {
    id: {
      in: [
        batchA1Id,
        batchA2Id,
        batchB1Id,
        batchB2Id,
      ],
    },
  },
  orderBy: {
    id: "asc",
  },
});

const afterSaleMap = new Map(
  afterSaleA.map((batch) => [batch.id, batch])
);

assert.equal(
  afterSaleMap.get(batchA1Id)?.quantity,
  0
);

assert.equal(
  afterSaleMap.get(batchA2Id)?.quantity,
  0
);

assert.equal(
  afterSaleMap.get(batchB1Id)?.quantity,
  0
);

assert.equal(
  afterSaleMap.get(batchB2Id)?.quantity,
  1
);

const stockAfterSaleAResponse = await request(
  `/api/products/${productAId}`
);

const stockAfterSaleBResponse = await request(
  `/api/products/${productBId}`
);

expectStatus(
  stockAfterSaleAResponse.status,
  200,
  "Получение Product A после продажи"
);

expectStatus(
  stockAfterSaleBResponse.status,
  200,
  "Получение Product B после продажи"
);

const stockAfterSaleA =
  stockAfterSaleAResponse.data?.stock ??
  stockAfterSaleAResponse.data?.product?.stock ??
  stockAfterSaleAResponse.data?.data?.stock;

const stockAfterSaleB =
  stockAfterSaleBResponse.data?.stock ??
  stockAfterSaleBResponse.data?.product?.stock ??
  stockAfterSaleBResponse.data?.data?.stock;

assert.equal(stockAfterSaleA, 0);
assert.equal(stockAfterSaleB, 1);

console.log(
  `Product A: Batch #${batchA1Id}=0, Batch #${batchA2Id}=0`
);

console.log(
  `Product B: Batch #${batchB1Id}=0, Batch #${batchB2Id}=1`
);

console.log(`Product A stock=${stockAfterSaleA}`);
console.log(`Product B stock=${stockAfterSaleB}`);
console.log("");

console.log("🟢 Stock after sale correct");
console.log("");

// =========================================================================
// 12. FIRST PARTIAL RETURN — PRODUCT A, 2 UNITS
// =========================================================================

console.log("12. FIRST PARTIAL RETURN — PRODUCT A, 2 UNITS");
console.log(
  "------------------------------------------------------------------------------"
);

const returnA1Response = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: orderItemAId,
      quantity: 2,
    }),
  }
);

expectStatus(
  returnA1Response.status,
  200,
  "Первый возврат Product A"
);

const returnA1Order =
  returnA1Response.data?.order ??
  returnA1Response.data?.data?.order;

assert.equal(
  returnA1Order.total,
  2900,
  "После возврата A=2 total должен быть 2900"
);

assert.equal(
  returnA1Order.profit,
  1740,
  "После возврата A=2 profit должен быть 1740"
);

assert.equal(
  returnA1Order.status,
  "PARTIAL_RETURN"
);

assert.equal(
  returnA1Response.data?.returnedQuantity ??
    returnA1Response.data?.data?.returnedQuantity,
  2
);

console.log(
  `Order total=${returnA1Order.total}`
);

console.log(
  `Order profit=${returnA1Order.profit}`
);

console.log(
  `Order status=${returnA1Order.status}`
);

console.log("");
console.log("🟢 First partial return correct");
console.log("");

// =========================================================================
// 13. SECOND PARTIAL RETURN — PRODUCT A, 1 UNIT
// =========================================================================

console.log("13. SECOND PARTIAL RETURN — PRODUCT A, 1 UNIT");
console.log(
  "------------------------------------------------------------------------------"
);

const returnA2Response = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: orderItemAId,
      quantity: 1,
    }),
  }
);

expectStatus(
  returnA2Response.status,
  200,
  "Второй возврат Product A"
);

const returnA2Order =
  returnA2Response.data?.order ??
  returnA2Response.data?.data?.order;

assert.equal(
  returnA2Order.total,
  2600,
  "После возврата A=3 total должен быть 2600"
);

assert.equal(
  returnA2Order.profit,
  1560,
  "После возврата A=3 profit должен быть 1560"
);

assert.equal(
  returnA2Order.status,
  "PARTIAL_RETURN"
);

console.log(
  `Order total=${returnA2Order.total}`
);

console.log(
  `Order profit=${returnA2Order.profit}`
);

console.log(
  `Order status=${returnA2Order.status}`
);

console.log("");
console.log("🟢 Second partial return correct");
console.log("");

// =========================================================================
// 14. RETURN PRODUCT B, 1 UNIT
// =========================================================================

console.log("14. RETURN PRODUCT B, 1 UNIT");
console.log(
  "------------------------------------------------------------------------------"
);

const returnBResponse = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: orderItemBId,
      quantity: 1,
    }),
  }
);

expectStatus(
  returnBResponse.status,
  200,
  "Возврат Product B"
);

const returnBOrder =
  returnBResponse.data?.order ??
  returnBResponse.data?.data?.order;

assert.equal(
  returnBOrder.total,
  2100,
  "После возврата B=1 total должен быть 2100"
);

assert.equal(
  returnBOrder.profit,
  1280,
  "После возврата B=1 profit должен быть 1280"
);

assert.equal(
  returnBOrder.status,
  "PARTIAL_RETURN"
);

console.log(
  `Order total=${returnBOrder.total}`
);

console.log(
  `Order profit=${returnBOrder.profit}`
);

console.log(
  `Order status=${returnBOrder.status}`
);

console.log("");
console.log("🟢 Product B return correct");
console.log("");

// =========================================================================
// 15. VERIFY RETURNBATCH HISTORY
// =========================================================================

console.log("15. VERIFY RETURNBATCH HISTORY");
console.log(
  "------------------------------------------------------------------------------"
);

const returnBatches = await prisma.returnBatch.findMany({
  where: {
    OrderItem: {
      orderId,
    },
  },
  include: {
    Batch: true,
  },
  orderBy: {
    id: "asc",
  },
});

assert.equal(
  returnBatches.length,
  3,
  "Ожидалось 3 ReturnBatch записи"
);

const returnedByBatch = new Map<number, number>();

for (const item of returnBatches) {
  returnedByBatch.set(
    item.batchId,
    (returnedByBatch.get(item.batchId) ?? 0) +
      item.quantity
  );
}

/*
 * Product A:
 * продажа A1=2, A2=3
 * возврат идёт LIFO:
 * сначала A2 -> 2
 * затем A2 -> 1
 *
 * Итого A2 returned=3.
 *
 * Product B:
 * продажа B1=2, B2=2
 * возврат LIFO:
 * B2 -> 1
 */

assert.equal(
  returnedByBatch.get(batchA1Id) ?? 0,
  0
);

assert.equal(
  returnedByBatch.get(batchA2Id) ?? 0,
  3
);

assert.equal(
  returnedByBatch.get(batchB1Id) ?? 0,
  0
);

assert.equal(
  returnedByBatch.get(batchB2Id) ?? 0,
  1
);

console.log(
  `Batch #${batchA1Id}: returned=${
    returnedByBatch.get(batchA1Id) ?? 0
  }`
);

console.log(
  `Batch #${batchA2Id}: returned=${
    returnedByBatch.get(batchA2Id) ?? 0
  }`
);

console.log(
  `Batch #${batchB1Id}: returned=${
    returnedByBatch.get(batchB1Id) ?? 0
  }`
);

console.log(
  `Batch #${batchB2Id}: returned=${
    returnedByBatch.get(batchB2Id) ?? 0
  }`
);

console.log("");
console.log("🟢 ReturnBatch history correct");
console.log("");

// =========================================================================
// 16. VERIFY STOCK AFTER MULTIPLE RETURNS
// =========================================================================

console.log("16. VERIFY STOCK AFTER MULTIPLE RETURNS");
console.log(
  "------------------------------------------------------------------------------"
);

const afterReturns = await prisma.batch.findMany({
  where: {
    id: {
      in: [
        batchA1Id,
        batchA2Id,
        batchB1Id,
        batchB2Id,
      ],
    },
  },
  orderBy: {
    id: "asc",
  },
});

const afterReturnsMap = new Map(
  afterReturns.map((batch) => [batch.id, batch])
);

/*
 * A:
 * A1 sold 2, returned 0 => 0
 * A2 sold 3, returned 3 => 3
 *
 * B:
 * B1 sold 2, returned 0 => 0
 * B2 sold 2, returned 1 => 1
 */

assert.equal(
  afterReturnsMap.get(batchA1Id)?.quantity,
  0
);

assert.equal(
  afterReturnsMap.get(batchA2Id)?.quantity,
  3
);

assert.equal(
  afterReturnsMap.get(batchB1Id)?.quantity,
  0
);

assert.equal(
  afterReturnsMap.get(batchB2Id)?.quantity,
  2
);

const productAAfterReturns =
  await prisma.product.findUnique({
    where: {
      id: productAId,
    },
  });

const productBAfterReturns =
  await prisma.product.findUnique({
    where: {
      id: productBId,
    },
  });

assert.ok(productAAfterReturns);
assert.ok(productBAfterReturns);

assert.equal(
  productAAfterReturns.stock,
  3
);

assert.equal(
  productBAfterReturns.stock,
  2
);

console.log(
  `Product A: Batch #${batchA1Id}=0, Batch #${batchA2Id}=3, stock=3`
);

console.log(
  `Product B: Batch #${batchB1Id}=0, Batch #${batchB2Id}=2, stock=2`
);

console.log("");
console.log("🟢 Stock after multiple returns correct");
console.log("");

// =========================================================================
// 17. VERIFY ORDER STATE
// =========================================================================

console.log("17. VERIFY ORDER STATE");
console.log(
  "------------------------------------------------------------------------------"
);

const orderBeforeDelete =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: true,
    },
  });

assert.ok(orderBeforeDelete);

const itemA = orderBeforeDelete.items.find(
  (item) => item.id === orderItemAId
);

const itemB = orderBeforeDelete.items.find(
  (item) => item.id === orderItemBId
);

assert.ok(itemA);
assert.ok(itemB);

assert.equal(itemA.quantity, 5);
assert.equal(itemA.returned, 3);

assert.equal(itemB.quantity, 4);
assert.equal(itemB.returned, 1);

assert.equal(
  orderBeforeDelete.total,
  2100
);

assert.equal(
  orderBeforeDelete.profit,
  1280
);

assert.equal(
  orderBeforeDelete.status,
  "PARTIAL_RETURN"
);

console.log(
  `Order #${orderId}`
);

console.log(
  `Product A returned=${itemA.returned}/${itemA.quantity}`
);

console.log(
  `Product B returned=${itemB.returned}/${itemB.quantity}`
);

console.log(
  `Order total=${orderBeforeDelete.total}`
);

console.log(
  `Order profit=${orderBeforeDelete.profit}`
);

console.log(
  `Order status=${orderBeforeDelete.status}`
);

console.log("");
console.log("🟢 Order state correct");
console.log("");

// =========================================================================
// 18. CAPTURE EXACT STATE BEFORE DELETE
// =========================================================================

console.log("18. CAPTURE EXACT STATE BEFORE DELETE");
console.log(
  "------------------------------------------------------------------------------"
);

const beforeDeleteBatches =
  await prisma.batch.findMany({
    where: {
      id: {
        in: [
          batchA1Id,
          batchA2Id,
          batchB1Id,
          batchB2Id,
        ],
      },
    },
  });

const beforeDeleteStockA =
  productAAfterReturns.stock;

const beforeDeleteStockB =
  productBAfterReturns.stock;

const beforeDeleteMovementCount =
  await prisma.movement.count({
    where: {
      productId: {
        in: [
          productAId,
          productBId,
        ],
      },
    },
  });

console.log(
  `Movement count before DELETE=${beforeDeleteMovementCount}`
);

for (const batch of beforeDeleteBatches) {
  console.log(
    `Batch #${batch.id}: quantity=${batch.quantity}, status=${batch.status}`
  );
}

console.log(
  `Product A stock before DELETE=${beforeDeleteStockA}`
);

console.log(
  `Product B stock before DELETE=${beforeDeleteStockB}`
);

console.log("");

// =========================================================================
// 19. DELETE MULTI-PRODUCT ORDER
// =========================================================================

console.log("19. DELETE MULTI-PRODUCT ORDER");
console.log(
  "------------------------------------------------------------------------------"
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
  "DELETE многотоварного заказа"
);

assert.equal(
  deleteResponse.data?.success,
  true
);

console.log("");
console.log("🟢 Order DELETE succeeded");
console.log("");

// =========================================================================
// 20. VERIFY ORDER HISTORY REMOVED
// =========================================================================

console.log("20. VERIFY ORDER HISTORY REMOVED");
console.log(
  "------------------------------------------------------------------------------"
);

const deletedOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

const deletedOrderItems =
  await prisma.orderItem.findMany({
    where: {
      orderId,
    },
  });

const deletedOrderBatches =
  await prisma.orderBatch.findMany({
    where: {
      orderItemId: {
        in: [
          orderItemAId,
          orderItemBId,
        ],
      },
    },
  });

const deletedReturnBatches =
  await prisma.returnBatch.findMany({
    where: {
      OrderItem: {
        orderId,
      },
    },
  });

assert.equal(deletedOrder, null);
assert.equal(deletedOrderItems.length, 0);
assert.equal(deletedOrderBatches.length, 0);
assert.equal(deletedReturnBatches.length, 0);

console.log(
  `Order #${orderId}: removed`
);

console.log(
  `OrderItems: ${deletedOrderItems.length}`
);

console.log(
  `OrderBatches: ${deletedOrderBatches.length}`
);

console.log(
  `ReturnBatches: ${deletedReturnBatches.length}`
);

console.log("");
console.log("🟢 Order history removed");
console.log("");

// =========================================================================
// 21. VERIFY EXACT RESTORATION — PRODUCT A
// =========================================================================

console.log("21. VERIFY EXACT RESTORATION — PRODUCT A");
console.log(
  "------------------------------------------------------------------------------"
);

const restoredA1 =
  await prisma.batch.findUnique({
    where: {
      id: batchA1Id,
    },
  });

const restoredA2 =
  await prisma.batch.findUnique({
    where: {
      id: batchA2Id,
    },
  });

assert.ok(restoredA1);
assert.ok(restoredA2);

/*
 * До продажи:
 * A1=2
 * A2=3
 *
 * После продажи:
 * A1=0
 * A2=0
 *
 * Возвращено клиентом:
 * A2=3
 *
 * Перед DELETE:
 * A1=0
 * A2=3
 *
 * DELETE должен вернуть только:
 * A1 +2
 * A2 +(3 - 3) = +0
 *
 * То есть:
 * A1 0 -> 2
 * A2 3 -> 3
 */

assert.equal(restoredA1.quantity, 2);
assert.equal(restoredA2.quantity, 3);

console.log(
  `Batch #${batchA1Id}: 0 → ${restoredA1.quantity} (+2)`
);

console.log(
  `Batch #${batchA2Id}: 3 → ${restoredA2.quantity} (+0)`
);

console.log("");
console.log("🟢 Product A exact restoration passed");
console.log("");

// =========================================================================
// 22. VERIFY EXACT RESTORATION — PRODUCT B
// =========================================================================

console.log("22. VERIFY EXACT RESTORATION — PRODUCT B");
console.log(
  "------------------------------------------------------------------------------"
);

const restoredB1 =
  await prisma.batch.findUnique({
    where: {
      id: batchB1Id,
    },
  });

const restoredB2 =
  await prisma.batch.findUnique({
    where: {
      id: batchB2Id,
    },
  });

assert.ok(restoredB1);
assert.ok(restoredB2);

/*
 * До продажи:
 * B1=2
 * B2=3
 *
 * После продажи:
 * B1=0
 * B2=1
 *
 * Возврат клиента:
 * B2 +1
 *
 * Перед DELETE:
 * B1=0
 * B2=2
 *
 * Остаток проданного количества:
 * B1: 2
 * B2: 2 - 1 = 1
 *
 * DELETE:
 * B1 +2
 * B2 +1
 *
 * Финал:
 * B1=2
 * B2=3
 */

assert.equal(restoredB1.quantity, 2);
assert.equal(restoredB2.quantity, 3);

console.log(
  `Batch #${batchB1Id}: 0 → ${restoredB1.quantity} (+2)`
);

console.log(
  `Batch #${batchB2Id}: 2 → ${restoredB2.quantity} (+1)`
);

console.log("");
console.log("🟢 Product B exact restoration passed");
console.log("");

// =========================================================================
// 23. VERIFY PRODUCT STOCK AFTER DELETE
// =========================================================================

console.log("23. VERIFY PRODUCT STOCK AFTER DELETE");
console.log(
  "------------------------------------------------------------------------------"
);

const restoredProductA =
  await prisma.product.findUnique({
    where: {
      id: productAId,
    },
  });

const restoredProductB =
  await prisma.product.findUnique({
    where: {
      id: productBId,
    },
  });

assert.ok(restoredProductA);
assert.ok(restoredProductB);

const finalBatchesA =
  await prisma.batch.findMany({
    where: {
      productId: productAId,
    },
  });

const finalBatchesB =
  await prisma.batch.findMany({
    where: {
      productId: productBId,
    },
  });

const finalBatchSumA =
  finalBatchesA.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

const finalBatchSumB =
  finalBatchesB.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

assert.equal(restoredProductA.stock, 5);
assert.equal(restoredProductB.stock, 5);

assert.equal(finalBatchSumA, 5);
assert.equal(finalBatchSumB, 5);

assert.equal(
  restoredProductA.stock,
  finalBatchSumA
);

assert.equal(
  restoredProductB.stock,
  finalBatchSumB
);

console.log(
  `Product A stock=${restoredProductA.stock}`
);

console.log(
  `Product A SUM(Batch.quantity)=${finalBatchSumA}`
);

console.log(
  `Product B stock=${restoredProductB.stock}`
);

console.log(
  `Product B SUM(Batch.quantity)=${finalBatchSumB}`
);

console.log("");
console.log("🟢 Product stock restoration passed");
console.log("");

// =========================================================================
// 24. VERIFY NO DOUBLE RESTORATION THROUGH MOVEMENTS
// =========================================================================

console.log("24. VERIFY NO DOUBLE RESTORATION THROUGH MOVEMENTS");
console.log(
  "------------------------------------------------------------------------------"
);

const movementsAfterDelete =
  await prisma.movement.findMany({
    where: {
      productId: {
        in: [
          productAId,
          productBId,
        ],
      },
    },
    orderBy: {
      id: "asc",
    },
  });

const saleMovements =
  movementsAfterDelete.filter(
    (movement) => movement.type === "SALE"
  );

const returnMovements =
  movementsAfterDelete.filter(
    (movement) => movement.type === "RETURN"
  );

const supplyMovements =
  movementsAfterDelete.filter(
    (movement) => movement.type === "SUPPLY"
  );

assert.equal(
  supplyMovements.length,
  4,
  "Ожидалось 4 SUPPLY movement"
);

assert.equal(
  saleMovements.length,
  2,
  "Ожидалось 2 SALE movement"
);

/*
 * До DELETE:
 *
 * клиентские возвраты:
 * A +3
 * B +1
 *
 * DELETE должен дополнительно вернуть:
 * A +2
 * B +3
 *
 * Поэтому RETURN movements после DELETE:
 *
 * A total +5
 * B total +4
 */

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

assert.equal(
  supplyNet,
  10,
  "SUPPLY net должен быть +10"
);

assert.equal(
  saleNet,
  -9,
  "SALE net должен быть -9"
);

assert.equal(
  returnNet,
  9,
  "RETURN net должен быть +9"
);

const movementNet =
  supplyNet +
  saleNet +
  returnNet;

assert.equal(
  movementNet,
  10,
  "Общий net movement должен быть +10"
);

console.log(
  `SUPPLY movements=${supplyMovements.length}, net=${supplyNet}`
);

console.log(
  `SALE movements=${saleMovements.length}, net=${saleNet}`
);

console.log(
  `RETURN movements=${returnMovements.length}, net=${returnNet}`
);

console.log(
  `Movement NET=${movementNet}`
);

console.log("");
console.log("🟢 Movement restoration passed");
console.log("");

// =========================================================================
// 25. VERIFY RETURN MOVEMENT QUANTITIES
// =========================================================================

console.log("25. VERIFY RETURN MOVEMENT QUANTITIES");
console.log(
  "------------------------------------------------------------------------------"
);

const productAReturnMovements =
  returnMovements.filter(
    (movement) =>
      movement.productId === productAId
  );

const productBReturnMovements =
  returnMovements.filter(
    (movement) =>
      movement.productId === productBId
  );

const productAReturnNet =
  productAReturnMovements.reduce(
    (sum, movement) => sum + movement.quantity,
    0
  );

const productBReturnNet =
  productBReturnMovements.reduce(
    (sum, movement) => sum + movement.quantity,
    0
  );

assert.equal(
  productAReturnNet,
  5
);

assert.equal(
  productBReturnNet,
  4
);

console.log(
  `Product A RETURN net=${productAReturnNet}`
);

console.log(
  `Product B RETURN net=${productBReturnNet}`
);

console.log("");
console.log(
  "🟢 Return movement quantities are exact"
);
console.log("");

// =========================================================================
// 26. REPEATED DELETE
// =========================================================================

console.log("26. REPEATED DELETE");
console.log(
  "------------------------------------------------------------------------------"
);

const stockBeforeRepeatedDeleteA =
  restoredProductA.stock;

const stockBeforeRepeatedDeleteB =
  restoredProductB.stock;

const movementCountBeforeRepeatedDelete =
  await prisma.movement.count({
    where: {
      productId: {
        in: [
          productAId,
          productBId,
        ],
      },
    },
  });

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

const stockAfterRepeatedDeleteA =
  (
    await prisma.product.findUnique({
      where: {
        id: productAId,
      },
    })
  )?.stock;

const stockAfterRepeatedDeleteB =
  (
    await prisma.product.findUnique({
      where: {
        id: productBId,
      },
    })
  )?.stock;

const movementCountAfterRepeatedDelete =
  await prisma.movement.count({
    where: {
      productId: {
        in: [
          productAId,
          productBId,
        ],
      },
    },
  });

assert.equal(
  stockAfterRepeatedDeleteA,
  stockBeforeRepeatedDeleteA
);

assert.equal(
  stockAfterRepeatedDeleteB,
  stockBeforeRepeatedDeleteB
);

assert.equal(
  movementCountAfterRepeatedDelete,
  movementCountBeforeRepeatedDelete
);

console.log("");
console.log(
  "🟢 Repeated DELETE produced no stock or movement changes"
);
console.log("");

// =========================================================================
// 27. FINAL DATABASE INTEGRITY CHECK
// =========================================================================

console.log("27. FINAL DATABASE INTEGRITY CHECK");
console.log(
  "------------------------------------------------------------------------------"
);

const finalOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

const finalOrderItems =
  await prisma.orderItem.findMany({
    where: {
      orderId,
    },
  });

const finalOrderBatches =
  await prisma.orderBatch.findMany({
    where: {
      orderItemId: {
        in: [
          orderItemAId,
          orderItemBId,
        ],
      },
    },
  });

const finalReturnBatches =
  await prisma.returnBatch.findMany({
    where: {
      OrderItem: {
        orderId,
      },
    },
  });

assert.equal(finalOrder, null);
assert.equal(finalOrderItems.length, 0);
assert.equal(finalOrderBatches.length, 0);
assert.equal(finalReturnBatches.length, 0);

assert.equal(
  restoredProductA.stock,
  5
);

assert.equal(
  restoredProductB.stock,
  5
);

assert.equal(
  finalBatchSumA,
  restoredProductA.stock
);

assert.equal(
  finalBatchSumB,
  restoredProductB.stock
);

console.log("Order: removed");
console.log("OrderItems: removed");
console.log("OrderBatches: removed");
console.log("ReturnBatches: removed");
console.log(
  `Product A stock=${restoredProductA.stock}`
);
console.log(
  `Product A batch sum=${finalBatchSumA}`
);
console.log(
  `Product B stock=${restoredProductB.stock}`
);
console.log(
  `Product B batch sum=${finalBatchSumB}`
);

console.log("");
console.log(
  "🟢 Final database integrity check passed"
);
console.log("");

// =========================================================================
// 28. FINAL RESULT
// =========================================================================

console.log(
  "=============================================================================="
);
console.log("V60 FINAL RESULT");
console.log(
  "=============================================================================="
);
console.log("");

console.log("🟢 V60 PASSED");
console.log("");

console.log("Проверено:");
console.log("");
console.log(
  "1. Один заказ содержит два разных товара."
);
console.log(
  "2. Каждый товар использует две реальные партии."
);
console.log(
  "3. FEFO/FIFO корректно распределяет продажу."
);
console.log(
  "4. OrderBatch хранит фактические purchaseCost."
);
console.log(
  "5. Выполнены несколько частичных возвратов."
);
console.log(
  "6. Возвраты распределяются LIFO по исходным OrderBatch."
);
console.log(
  "7. ReturnBatch хранит фактические исходные партии."
);
console.log(
  "8. Order.total пересчитывается после каждого возврата."
);
console.log(
  "9. Order.profit пересчитывается по NET-формуле."
);
console.log(
  "10. DELETE удаляет весь многотоварный заказ."
);
console.log(
  "11. Уже возвращённые количества не восстанавливаются повторно."
);
console.log(
  "12. Product A восстанавливается точно по каждой партии."
);
console.log(
  "13. Product B восстанавливается точно по каждой партии."
);
console.log(
  "14. Product.stock восстанавливается для обоих товаров."
);
console.log(
  "15. SUM(Batch.quantity) совпадает с Product.stock."
);
console.log(
  "16. RETURN movements соответствуют фактическому восстановлению."
);
console.log(
  "17. Повторный DELETE возвращает HTTP404."
);
console.log(
  "18. Повторный DELETE не меняет stock."
);
console.log(
  "19. Повторный DELETE не создаёт новые Movement."
);
console.log("");

console.log(
  "=============================================================================="
);
console.log("CLEANUP");
console.log(
  "=============================================================================="
);
console.log("");

console.log(
  "🟢 TEST DATA WILL BE CLEANED UP"
);
console.log("");


} catch (error) {
console.error("");
console.error(
"🔴 V60 FAILED"
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

  if (
    productAId !== null ||
    productBId !== null
  ) {
    const productIds = [
      productAId,
      productBId,
    ].filter(
      (id): id is number => id !== null
    );

    if (productIds.length > 0) {
      await prisma.movement.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      await prisma.batch.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      await prisma.supplyItem.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      await prisma.product.deleteMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });
    }
  }

  if (supplyA1Id !== null) {
    await prisma.supplyItem.deleteMany({
      where: {
        supplyId: supplyA1Id,
      },
    });

    await prisma.supply.deleteMany({
      where: {
        id: supplyA1Id,
      },
    });
  }

  if (supplyA2Id !== null) {
    await prisma.supplyItem.deleteMany({
      where: {
        supplyId: supplyA2Id,
      },
    });

    await prisma.supply.deleteMany({
      where: {
        id: supplyA2Id,
      },
    });
  }

  if (supplyB1Id !== null) {
    await prisma.supplyItem.deleteMany({
      where: {
        supplyId: supplyB1Id,
      },
    });

    await prisma.supply.deleteMany({
      where: {
        id: supplyB1Id,
      },
    });
  }

  if (supplyB2Id !== null) {
    await prisma.supplyItem.deleteMany({
      where: {
        supplyId: supplyB2Id,
      },
    });

    await prisma.supply.deleteMany({
      where: {
        id: supplyB2Id,
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
