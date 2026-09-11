import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const BASE_URL = "http://localhost:3000";
const prisma = new PrismaClient();

type JsonResponse = {
status: number;
data: any;
};

async function request(
path: string,
options: RequestInit = {}
): Promise<JsonResponse> {
const response = await fetch(`${BASE_URL}${path}`, {
...options,
headers: {
"Content-Type": "application/json",
...(options.headers ?? {}),
},
});

const text = await response.text();

let data: any = null;

try {
data = text ? JSON.parse(text) : null;
} catch {
data = text;
}

return {
status: response.status,
data,
};
}

function assertStatus(
actual: number,
expected: number,
message: string
) {
assert.equal(
actual,
expected,
`${message}: expected HTTP ${expected}, got HTTP ${actual}`
);
}

function getProductId(data: any): number {
const id = Number(data?.id ?? data?.data?.id);

assert.ok(
Number.isInteger(id) && id > 0,
"could not determine Product id"
);

return id;
}

function getSupplierId(data: any): number {
const id = Number(data?.id ?? data?.data?.id);

assert.ok(
Number.isInteger(id) && id > 0,
"could not determine Supplier id"
);

return id;
}

function getSupplyId(data: any): number {
const id = Number(data?.supply?.id ?? data?.data?.supply?.id);

assert.ok(
Number.isInteger(id) && id > 0,
"could not determine Supply id"
);

return id;
}

function getOrderId(data: any): number {
const id = Number(data?.id ?? data?.data?.id ?? data?.order?.id);

assert.ok(
Number.isInteger(id) && id > 0,
"could not determine Order id"
);

return id;
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V59 — COMPLEX FEFO/FIFO + MULTI-PRODUCT RETURN + DELETE");
console.log("==============================================================================");
console.log("");

const suffix = Date.now();

let productAId: number | null = null;
let productBId: number | null = null;
let supplierId: number | null = null;

let supplyA1Id: number | null = null;
let supplyA2Id: number | null = null;
let supplyB1Id: number | null = null;
let supplyB2Id: number | null = null;

let orderId: number | null = null;
let orderItemAId: number | null = null;
let orderItemBId: number | null = null;

const createdMovementIds: number[] = [];

try {
// =========================================================================
// 1. CREATE PRODUCTS
// =========================================================================


console.log("1. CREATE TWO TEST PRODUCTS");
console.log("------------------------------------------------------------------------------");

const productAResponse = await request("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: `V59 Test Product A ${suffix}`,
    unit: "шт",
    price: 300,
    cost: 0,
    barcode: `V59-A-${suffix}`,
  }),
});

console.log(`HTTP ${productAResponse.status}`);
console.log(JSON.stringify(productAResponse.data, null, 2));

assertStatus(productAResponse.status, 200, "Product A creation");

productAId = getProductId(productAResponse.data);

console.log(`Product A #${productAId}`);
console.log("");

const productBResponse = await request("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: `V59 Test Product B ${suffix}`,
    unit: "шт",
    price: 500,
    cost: 0,
    barcode: `V59-B-${suffix}`,
  }),
});

console.log(`HTTP ${productBResponse.status}`);
console.log(JSON.stringify(productBResponse.data, null, 2));

assertStatus(productBResponse.status, 200, "Product B creation");

productBId = getProductId(productBResponse.data);

console.log(`Product B #${productBId}`);
console.log("");

// =========================================================================
// 2. CREATE SUPPLIER
// =========================================================================

console.log("2. CREATE TEST SUPPLIER");
console.log("------------------------------------------------------------------------------");

const supplierResponse = await request("/api/suppliers", {
  method: "POST",
  body: JSON.stringify({
    name: `V59 Test Supplier ${suffix}`,
  }),
});

console.log(`HTTP ${supplierResponse.status}`);
console.log(JSON.stringify(supplierResponse.data, null, 2));

assertStatus(supplierResponse.status, 200, "Supplier creation");

supplierId = getSupplierId(supplierResponse.data);

console.log(`Supplier #${supplierId}`);
console.log("");

// =========================================================================
// 3. SUPPLY PRODUCT A — OLDER / CHEAPER BATCH
// =========================================================================

console.log("3. SUPPLY PRODUCT A — BATCH A1");
console.log("------------------------------------------------------------------------------");

const supplyA1Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productAId,
        quantity: 2,
        cost: 100,
        expiryDate: "2026-09-20",
      },
    ],
  }),
});

console.log(`HTTP ${supplyA1Response.status}`);
console.log(JSON.stringify(supplyA1Response.data, null, 2));

assertStatus(supplyA1Response.status, 200, "Supply A1 creation");

supplyA1Id = getSupplyId(supplyA1Response.data);

console.log(`Supply A1 #${supplyA1Id}`);
console.log("");

// =========================================================================
// 4. SUPPLY PRODUCT A — NEWER / MORE EXPENSIVE BATCH
// =========================================================================

console.log("4. SUPPLY PRODUCT A — BATCH A2");
console.log("------------------------------------------------------------------------------");

const supplyA2Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productAId,
        quantity: 3,
        cost: 120,
        expiryDate: "2026-10-20",
      },
    ],
  }),
});

console.log(`HTTP ${supplyA2Response.status}`);
console.log(JSON.stringify(supplyA2Response.data, null, 2));

assertStatus(supplyA2Response.status, 200, "Supply A2 creation");

supplyA2Id = getSupplyId(supplyA2Response.data);

console.log(`Supply A2 #${supplyA2Id}`);
console.log("");

// =========================================================================
// 5. SUPPLY PRODUCT B — TWO BATCHES
// =========================================================================

console.log("5. SUPPLY PRODUCT B — BATCH B1");
console.log("------------------------------------------------------------------------------");

const supplyB1Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productBId,
        quantity: 1,
        cost: 200,
        expiryDate: "2026-09-25",
      },
    ],
  }),
});

console.log(`HTTP ${supplyB1Response.status}`);
console.log(JSON.stringify(supplyB1Response.data, null, 2));

assertStatus(supplyB1Response.status, 200, "Supply B1 creation");

supplyB1Id = getSupplyId(supplyB1Response.data);

console.log(`Supply B1 #${supplyB1Id}`);
console.log("");

console.log("6. SUPPLY PRODUCT B — BATCH B2");
console.log("------------------------------------------------------------------------------");

const supplyB2Response = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productBId,
        quantity: 2,
        cost: 220,
        expiryDate: "2026-10-25",
      },
    ],
  }),
});

console.log(`HTTP ${supplyB2Response.status}`);
console.log(JSON.stringify(supplyB2Response.data, null, 2));

assertStatus(supplyB2Response.status, 200, "Supply B2 creation");

supplyB2Id = getSupplyId(supplyB2Response.data);

console.log(`Supply B2 #${supplyB2Id}`);
console.log("");

// =========================================================================
// 7. LOAD BATCHES FROM DATABASE THROUGH API
// =========================================================================

console.log("7. LOAD CREATED BATCHES");
console.log("------------------------------------------------------------------------------");

const batchesResponse = await request("/api/batches");

console.log(`HTTP ${batchesResponse.status}`);

assertStatus(batchesResponse.status, 200, "Batch list");

const batches = Array.isArray(batchesResponse.data)
  ? batchesResponse.data
  : batchesResponse.data?.data;

assert.ok(Array.isArray(batches), "Batch list is not an array");

const productABatches = batches.filter(
  (batch: any) => Number(batch.productId) === productAId
);

const productBBatches = batches.filter(
  (batch: any) => Number(batch.productId) === productBId
);

assert.equal(
  productABatches.length,
  2,
  "Product A must have exactly two test batches"
);

assert.equal(
  productBBatches.length,
  2,
  "Product B must have exactly two test batches"
);

const batchA1 = productABatches.find(
  (batch: any) => Number(batch.quantity) === 2 &&
    Number(batch.purchaseCost) === 100
);

const batchA2 = productABatches.find(
  (batch: any) => Number(batch.quantity) === 3 &&
    Number(batch.purchaseCost) === 120
);

const batchB1 = productBBatches.find(
  (batch: any) => Number(batch.quantity) === 1 &&
    Number(batch.purchaseCost) === 200
);

const batchB2 = productBBatches.find(
  (batch: any) => Number(batch.quantity) === 2 &&
    Number(batch.purchaseCost) === 220
);

assert.ok(batchA1, "Batch A1 not found");
assert.ok(batchA2, "Batch A2 not found");
assert.ok(batchB1, "Batch B1 not found");
assert.ok(batchB2, "Batch B2 not found");

const batchA1Id = Number(batchA1.id);
const batchA2Id = Number(batchA2.id);
const batchB1Id = Number(batchB1.id);
const batchB2Id = Number(batchB2.id);

console.log(
  `Product A: Batch #${batchA1Id}=2 @100, Batch #${batchA2Id}=3 @120`
);

console.log(
  `Product B: Batch #${batchB1Id}=1 @200, Batch #${batchB2Id}=2 @220`
);

console.log("");

// =========================================================================
// 8. VERIFY INITIAL STOCK
// =========================================================================

console.log("8. VERIFY INITIAL STOCK");
console.log("------------------------------------------------------------------------------");

const productAGet = await request(`/api/products/${productAId}`);
const productBGet = await request(`/api/products/${productBId}`);

assertStatus(productAGet.status, 200, "Product A GET");
assertStatus(productBGet.status, 200, "Product B GET");

const productA =
  productAGet.data?.data ?? productAGet.data;

const productB =
  productBGet.data?.data ?? productBGet.data;

const stockA = Number(productA.stock);
const stockB = Number(productB.stock);

console.log(`Product A stock=${stockA}`);
console.log(`Product B stock=${stockB}`);

assert.equal(stockA, 5, "Product A initial stock must be 5");
assert.equal(stockB, 3, "Product B initial stock must be 3");

console.log("🟢 Initial stock correct");
console.log("");

// =========================================================================
// 9. CREATE MULTI-PRODUCT ORDER
// =========================================================================

console.log("9. CREATE MULTI-PRODUCT ORDER");
console.log("------------------------------------------------------------------------------");

const orderResponse = await request("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    items: [
      {
        id: productAId,
        quantity: 4,
        price: 300,
      },
      {
        id: productBId,
        quantity: 2,
        price: 500,
      },
    ],
  }),
});

console.log(`HTTP ${orderResponse.status}`);
console.log(JSON.stringify(orderResponse.data, null, 2));

assertStatus(orderResponse.status, 201, "Order creation");

orderId = getOrderId(orderResponse.data);

const createdOrder =
  orderResponse.data?.data ?? orderResponse.data;

console.log(`Order #${orderId}`);
console.log(`Gross total=${createdOrder.total}`);
console.log(`Gross profit=${createdOrder.profit}`);

assert.equal(
  Number(createdOrder.total),
  2200,
  "Gross order total must be 2200"
);

// A: 4 × 300 = 1200
// A cost: 2 × 100 + 2 × 120 = 440
// A profit = 760
//
// B: 2 × 500 = 1000
// B cost: 1 × 200 + 1 × 220 = 420
// B profit = 580
//
// Total profit = 1340

assert.equal(
  Number(createdOrder.profit),
  1340,
  "Gross order profit must be 1340"
);

const orderItems = Array.isArray(createdOrder.items)
  ? createdOrder.items
  : [];

assert.equal(
  orderItems.length,
  2,
  "Order must contain exactly two OrderItems"
);

const itemA = orderItems.find(
  (item: any) => Number(item.productId) === productAId
);

const itemB = orderItems.find(
  (item: any) => Number(item.productId) === productBId
);

assert.ok(itemA, "OrderItem for Product A not found");
assert.ok(itemB, "OrderItem for Product B not found");

orderItemAId = Number(itemA.id);
orderItemBId = Number(itemB.id);

console.log(`OrderItem A #${orderItemAId}`);
console.log(`OrderItem B #${orderItemBId}`);
console.log("");

// =========================================================================
// 10. VERIFY FEFO/FIFO ORDERBATCH ALLOCATION
// =========================================================================

console.log("10. VERIFY FEFO/FIFO ORDERBATCH ALLOCATION");
console.log("------------------------------------------------------------------------------");

const batchesA = Array.isArray(itemA.batches)
  ? itemA.batches
  : [];

const batchesB = Array.isArray(itemB.batches)
  ? itemB.batches
  : [];

assert.equal(
  batchesA.length,
  2,
  "Product A must use two OrderBatch records"
);

assert.equal(
  batchesB.length,
  2,
  "Product B must use two OrderBatch records"
);

const orderBatchA1 = batchesA.find(
  (row: any) => Number(row.batchId) === batchA1Id
);

const orderBatchA2 = batchesA.find(
  (row: any) => Number(row.batchId) === batchA2Id
);

const orderBatchB1 = batchesB.find(
  (row: any) => Number(row.batchId) === batchB1Id
);

const orderBatchB2 = batchesB.find(
  (row: any) => Number(row.batchId) === batchB2Id
);

assert.ok(orderBatchA1, "OrderBatch A1 not found");
assert.ok(orderBatchA2, "OrderBatch A2 not found");
assert.ok(orderBatchB1, "OrderBatch B1 not found");
assert.ok(orderBatchB2, "OrderBatch B2 not found");

assert.equal(
  Number(orderBatchA1.quantity),
  2,
  "Batch A1 must sell 2"
);

assert.equal(
  Number(orderBatchA2.quantity),
  2,
  "Batch A2 must sell 2"
);

assert.equal(
  Number(orderBatchB1.quantity),
  1,
  "Batch B1 must sell 1"
);

assert.equal(
  Number(orderBatchB2.quantity),
  1,
  "Batch B2 must sell 1"
);

assert.equal(
  Number(orderBatchA1.purchaseCost),
  100,
  "OrderBatch A1 purchaseCost must be 100"
);

assert.equal(
  Number(orderBatchA2.purchaseCost),
  120,
  "OrderBatch A2 purchaseCost must be 120"
);

assert.equal(
  Number(orderBatchB1.purchaseCost),
  200,
  "OrderBatch B1 purchaseCost must be 200"
);

assert.equal(
  Number(orderBatchB2.purchaseCost),
  220,
  "OrderBatch B2 purchaseCost must be 220"
);

console.log("Product A:");
console.log(`Batch #${batchA1Id}: sold 2 @100`);
console.log(`Batch #${batchA2Id}: sold 2 @120`);

console.log("Product B:");
console.log(`Batch #${batchB1Id}: sold 1 @200`);
console.log(`Batch #${batchB2Id}: sold 1 @220`);

console.log("🟢 FEFO/FIFO allocation correct");
console.log("");

// =========================================================================
// 11. VERIFY STOCK AFTER SALE
// =========================================================================

console.log("11. VERIFY STOCK AFTER SALE");
console.log("------------------------------------------------------------------------------");

// /api/batches intentionally hides zero-quantity batches. Therefore exact
// zero-stock batch states are verified directly in the database.
const batchesAfterSaleDb = await prisma.batch.findMany({
  where: { id: { in: [batchA1Id, batchA2Id, batchB1Id, batchB2Id] } },
  orderBy: { id: "asc" },
});

assert.equal(batchesAfterSaleDb.length, 4, "All four test batches must still exist after sale");

const afterA1 = batchesAfterSaleDb.find((batch) => batch.id === batchA1Id);
const afterA2 = batchesAfterSaleDb.find((batch) => batch.id === batchA2Id);
const afterB1 = batchesAfterSaleDb.find((batch) => batch.id === batchB1Id);
const afterB2 = batchesAfterSaleDb.find((batch) => batch.id === batchB2Id);

assert.ok(afterA1, "Batch A1 not found after sale");
assert.ok(afterA2, "Batch A2 not found after sale");
assert.ok(afterB1, "Batch B1 not found after sale");
assert.ok(afterB2, "Batch B2 not found after sale");

assert.equal(afterA1.quantity, 0);
assert.equal(afterA2.quantity, 1);
assert.equal(afterB1.quantity, 0);
assert.equal(afterB2.quantity, 1);

const productAAfterSaleResponse = await request(`/api/products/${productAId}`);
const productBAfterSaleResponse = await request(`/api/products/${productBId}`);

assertStatus(productAAfterSaleResponse.status, 200, "Product A after sale");
assertStatus(productBAfterSaleResponse.status, 200, "Product B after sale");

const productAAfterSale = productAAfterSaleResponse.data?.data ?? productAAfterSaleResponse.data;
const productBAfterSale = productBAfterSaleResponse.data?.data ?? productBAfterSaleResponse.data;

assert.equal(Number(productAAfterSale.stock), 1);
assert.equal(Number(productBAfterSale.stock), 1);

console.log(`Product A: Batch #${batchA1Id}=0, Batch #${batchA2Id}=1`);
console.log(`Product B: Batch #${batchB1Id}=0, Batch #${batchB2Id}=1`);
console.log(`Product A stock=${productAAfterSale.stock}`);
console.log(`Product B stock=${productBAfterSale.stock}`);
console.log("🟢 Stock after sale correct");
console.log("");

// =========================================================================
// 12. PARTIAL RETURN — PRODUCT A ONLY
// =========================================================================

console.log("12. PARTIAL RETURN — PRODUCT A, 1 UNIT");
console.log("------------------------------------------------------------------------------");

const returnResponse = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: orderItemAId,
      quantity: 1,
    }),
  }
);

console.log(`HTTP ${returnResponse.status}`);
console.log(JSON.stringify(returnResponse.data, null, 2));

assertStatus(
  returnResponse.status,
  200,
  "Product A partial return"
);

const returnData =
  returnResponse.data?.data ??
  returnResponse.data;

console.log("");

// Net revenue:
// A remaining 3 × 300 = 900
// B remaining 2 × 500 = 1000
// Total = 1900
//
// Net cost:
// A remaining sold costs 2×100 + 1×120 = 320
// B cost = 1×200 + 1×220 = 420
// Total = 740
//
// Net profit = 1900 - 740 = 1160

assert.equal(
  Number(returnData.order?.total),
  1900,
  "Order total after A return must be 1900"
);

assert.equal(
  Number(returnData.order?.profit),
  1160,
  "Order profit after A return must be 1160"
);

assert.equal(
  returnData.order?.status,
  "PARTIAL_RETURN",
  "Order status must be PARTIAL_RETURN"
);

console.log("🟢 Partial return recalculation correct");
console.log("");

// =========================================================================
// 13. VERIFY RETURNBATCH ALLOCATION
// =========================================================================

console.log("13. VERIFY RETURNBATCH ALLOCATION");
console.log("------------------------------------------------------------------------------");

const orderAfterReturnResponse = await request(
  `/api/orders/${orderId}`
);

assertStatus(
  orderAfterReturnResponse.status,
  200,
  "Order GET after return"
);

const orderAfterReturn =
  orderAfterReturnResponse.data?.data ??
  orderAfterReturnResponse.data;

const returnedItemA = orderAfterReturn.items.find(
  (item: any) => Number(item.id) === orderItemAId
);

const returnedItemB = orderAfterReturn.items.find(
  (item: any) => Number(item.id) === orderItemBId
);

assert.ok(returnedItemA, "Returned Product A item not found");
assert.ok(returnedItemB, "Product B item not found");

assert.equal(
  Number(returnedItemA.returned),
  1,
  "Product A returned must be 1"
);

assert.equal(
  Number(returnedItemB.returned),
  0,
  "Product B returned must remain 0"
);

const returnBatchesA = Array.isArray(returnedItemA.ReturnBatch)
  ? returnedItemA.ReturnBatch
  : [];

assert.equal(
  returnBatchesA.length,
  1,
  "Product A must have one ReturnBatch"
);

assert.equal(
  Number(returnBatchesA[0].batchId),
  batchA2Id,
  "Return must use the latest sold Product A batch"
);

assert.equal(
  Number(returnBatchesA[0].quantity),
  1,
  "ReturnBatch quantity must be 1"
);

console.log(
  `ReturnBatch #${returnBatchesA[0].id} → Batch #${batchA2Id}, quantity=1`
);

console.log("🟢 ReturnBatch allocation correct");
console.log("");

// =========================================================================
// 14. VERIFY STOCK AFTER RETURN
// =========================================================================

console.log("14. VERIFY STOCK AFTER RETURN");
console.log("------------------------------------------------------------------------------");

// /api/batches hides zero-quantity batches, so exact batch quantities are
// verified directly in the database here.
const batchesAfterReturnDb = await prisma.batch.findMany({
  where: { id: { in: [batchA1Id, batchA2Id, batchB1Id, batchB2Id] } },
  orderBy: { id: "asc" },
});

assert.equal(batchesAfterReturnDb.length, 4, "All four test batches must still exist after return");

const a1AfterReturn = batchesAfterReturnDb.find((batch) => batch.id === batchA1Id);
const a2AfterReturn = batchesAfterReturnDb.find((batch) => batch.id === batchA2Id);
const b1AfterReturn = batchesAfterReturnDb.find((batch) => batch.id === batchB1Id);
const b2AfterReturn = batchesAfterReturnDb.find((batch) => batch.id === batchB2Id);

assert.ok(a1AfterReturn, "Batch A1 not found after return");
assert.ok(a2AfterReturn, "Batch A2 not found after return");
assert.ok(b1AfterReturn, "Batch B1 not found after return");
assert.ok(b2AfterReturn, "Batch B2 not found after return");

assert.equal(a1AfterReturn.quantity, 0);
assert.equal(a2AfterReturn.quantity, 2);
assert.equal(b1AfterReturn.quantity, 0);
assert.equal(b2AfterReturn.quantity, 1);

const productAAfterReturnResponse = await request(`/api/products/${productAId}`);
const productBAfterReturnResponse = await request(`/api/products/${productBId}`);

assertStatus(productAAfterReturnResponse.status, 200, "Product A after return");
assertStatus(productBAfterReturnResponse.status, 200, "Product B after return");

const productAAfterReturn = productAAfterReturnResponse.data?.data ?? productAAfterReturnResponse.data;
const productBAfterReturn = productBAfterReturnResponse.data?.data ?? productBAfterReturnResponse.data;

assert.equal(Number(productAAfterReturn.stock), 2);
assert.equal(Number(productBAfterReturn.stock), 1);

console.log(`Product A: Batch #${batchA1Id}=0, Batch #${batchA2Id}=2, stock=2`);
console.log(`Product B: Batch #${batchB1Id}=0, Batch #${batchB2Id}=1, stock=1`);
console.log("🟢 Stock after partial return correct");
console.log("");

// =========================================================================
// 15. CAPTURE MOVEMENT STATE BEFORE DELETE
// =========================================================================

console.log("15. CAPTURE MOVEMENTS BEFORE DELETE");
console.log("------------------------------------------------------------------------------");

const movementsBeforeResponse = await request(
  `/api/movements?productId=${productAId}`
);

console.log(
  `Movement endpoint HTTP ${movementsBeforeResponse.status}`
);

// We do not depend on the exact movement API shape here.
// The DELETE verification below uses the database-visible effects
// through the application endpoints.

console.log("Movement baseline captured");
console.log("");

// =========================================================================
// 16. DELETE ORDER
// =========================================================================

console.log("16. DELETE MULTI-PRODUCT ORDER");
console.log("------------------------------------------------------------------------------");

const deleteResponse = await request(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${deleteResponse.status}`);
console.log(JSON.stringify(deleteResponse.data, null, 2));

assertStatus(
  deleteResponse.status,
  200,
  "Multi-product order DELETE"
);

assert.equal(
  deleteResponse.data?.success,
  true,
  "DELETE response must report success"
);

console.log("🟢 Order DELETE succeeded");
console.log("");

// =========================================================================
// 17. VERIFY ORDER HISTORY REMOVED
// =========================================================================

console.log("17. VERIFY ORDER HISTORY REMOVED");
console.log("------------------------------------------------------------------------------");

const deletedOrderResponse = await request(
  `/api/orders/${orderId}`
);

assertStatus(
  deletedOrderResponse.status,
  404,
  "Deleted order GET"
);

console.log(`Order #${orderId}: removed`);
console.log("🟢 Order history removed");
console.log("");

// =========================================================================
// 18. VERIFY EXACT RESTORATION OF PRODUCT A
// =========================================================================

console.log("18. VERIFY EXACT RESTORATION — PRODUCT A");
console.log("------------------------------------------------------------------------------");

const batchesAfterDeleteResponse = await request("/api/batches");

assertStatus(
  batchesAfterDeleteResponse.status,
  200,
  "Batch list after delete"
);

const batchesAfterDelete = Array.isArray(
  batchesAfterDeleteResponse.data
)
  ? batchesAfterDeleteResponse.data
  : batchesAfterDeleteResponse.data?.data;

const a1AfterDelete = batchesAfterDelete.find(
  (batch: any) => Number(batch.id) === batchA1Id
);

const a2AfterDelete = batchesAfterDelete.find(
  (batch: any) => Number(batch.id) === batchA2Id
);

assert.equal(
  Number(a1AfterDelete.quantity),
  2,
  "Product A Batch A1 must be restored to 2"
);

assert.equal(
  Number(a2AfterDelete.quantity),
  3,
  "Product A Batch A2 must be restored to 3"
);

console.log(`Batch #${batchA1Id}: 0 → 2 (+2)`);
console.log(`Batch #${batchA2Id}: 2 → 3 (+1)`);

console.log("🟢 Product A exact restoration passed");
console.log("");

// =========================================================================
// 19. VERIFY EXACT RESTORATION OF PRODUCT B
// =========================================================================

console.log("19. VERIFY EXACT RESTORATION — PRODUCT B");
console.log("------------------------------------------------------------------------------");

const b1AfterDelete = batchesAfterDelete.find(
  (batch: any) => Number(batch.id) === batchB1Id
);

const b2AfterDelete = batchesAfterDelete.find(
  (batch: any) => Number(batch.id) === batchB2Id
);

assert.equal(
  Number(b1AfterDelete.quantity),
  1,
  "Product B Batch B1 must be restored to 1"
);

assert.equal(
  Number(b2AfterDelete.quantity),
  2,
  "Product B Batch B2 must be restored to 2"
);

console.log(`Batch #${batchB1Id}: 0 → 1 (+1)`);
console.log(`Batch #${batchB2Id}: 1 → 2 (+1)`);

console.log("🟢 Product B exact restoration passed");
console.log("");

// =========================================================================
// 20. VERIFY PRODUCT STOCK
// =========================================================================

console.log("20. VERIFY PRODUCT STOCK AFTER DELETE");
console.log("------------------------------------------------------------------------------");

const productAAfterDeleteResponse = await request(
  `/api/products/${productAId}`
);

const productBAfterDeleteResponse = await request(
  `/api/products/${productBId}`
);

assertStatus(
  productAAfterDeleteResponse.status,
  200,
  "Product A after delete"
);

assertStatus(
  productBAfterDeleteResponse.status,
  200,
  "Product B after delete"
);

const productAAfterDelete =
  productAAfterDeleteResponse.data?.data ??
  productAAfterDeleteResponse.data;

const productBAfterDelete =
  productBAfterDeleteResponse.data?.data ??
  productBAfterDeleteResponse.data;

assert.equal(
  Number(productAAfterDelete.stock),
  5,
  "Product A stock must be restored to 5"
);

assert.equal(
  Number(productBAfterDelete.stock),
  3,
  "Product B stock must be restored to 3"
);

const sumA =
  Number(a1AfterDelete.quantity) +
  Number(a2AfterDelete.quantity);

const sumB =
  Number(b1AfterDelete.quantity) +
  Number(b2AfterDelete.quantity);

assert.equal(sumA, 5);
assert.equal(sumB, 3);

assert.equal(
  Number(productAAfterDelete.stock),
  sumA,
  "Product A stock must equal batch sum"
);

assert.equal(
  Number(productBAfterDelete.stock),
  sumB,
  "Product B stock must equal batch sum"
);

console.log(`Product A stock=${productAAfterDelete.stock}`);
console.log(`Product A SUM(Batch.quantity)=${sumA}`);

console.log(`Product B stock=${productBAfterDelete.stock}`);
console.log(`Product B SUM(Batch.quantity)=${sumB}`);

console.log("🟢 Product stock restoration passed");
console.log("");

// =========================================================================
// 21. REPEATED DELETE
// =========================================================================

console.log("21. VERIFY NO DOUBLE RESTORATION");
console.log("------------------------------------------------------------------------------");

const stockABeforeSecondDelete = Number(
  productAAfterDelete.stock
);

const stockBBeforeSecondDelete = Number(
  productBAfterDelete.stock
);

const secondDeleteResponse = await request(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${secondDeleteResponse.status}`);
console.log(
  JSON.stringify(secondDeleteResponse.data, null, 2)
);

assertStatus(
  secondDeleteResponse.status,
  404,
  "Repeated DELETE"
);

const productAAfterSecondDeleteResponse = await request(
  `/api/products/${productAId}`
);

const productBAfterSecondDeleteResponse = await request(
  `/api/products/${productBId}`
);

const productAAfterSecondDelete =
  productAAfterSecondDeleteResponse.data?.data ??
  productAAfterSecondDeleteResponse.data;

const productBAfterSecondDelete =
  productBAfterSecondDeleteResponse.data?.data ??
  productBAfterSecondDeleteResponse.data;

assert.equal(
  Number(productAAfterSecondDelete.stock),
  stockABeforeSecondDelete,
  "Second DELETE must not change Product A stock"
);

assert.equal(
  Number(productBAfterSecondDelete.stock),
  stockBBeforeSecondDelete,
  "Second DELETE must not change Product B stock"
);

console.log("🟢 Repeated DELETE produced no stock changes");
console.log("");

// =========================================================================
// 22. FINAL RESULT
// =========================================================================

console.log("==============================================================================");
console.log("V59 FINAL RESULT");
console.log("==============================================================================");
console.log("");

console.log("🟢 V59 PASSED");
console.log("");

console.log("Проверено:");
console.log("");
console.log("1. Один заказ содержит два разных товара.");
console.log("2. Каждый товар использует две реальные партии.");
console.log("3. Продажа корректно распределилась по FEFO/FIFO.");
console.log("4. OrderBatch сохранил фактические purchaseCost.");
console.log("5. Проданы все необходимые партии в правильном порядке.");
console.log("6. Выполнен частичный возврат только одного товара.");
console.log("7. ReturnBatch создан на правильную исходную партию.");
console.log("8. Order.total пересчитан после возврата.");
console.log("9. Order.profit пересчитан по NET-формуле.");
console.log("10. DELETE удалил весь заказ.");
console.log("11. Product A восстановлен точно по партиям.");
console.log("12. Product B восстановлен точно по партиям.");
console.log("13. Уже возвращённая единица не восстановлена повторно.");
console.log("14. Product.stock восстановлен для обоих товаров.");
console.log("15. SUM(Batch.quantity) совпадает с Product.stock.");
console.log("16. Повторный DELETE вернул HTTP404.");
console.log("17. Повторный DELETE не изменил stock.");

console.log("");
console.log("==============================================================================");
console.log("CLEANUP");
console.log("==============================================================================");
console.log("");

console.log("🟢 TEST DATA WILL BE CLEANED UP");


} finally {
// =========================================================================
// CLEANUP
// =========================================================================


// The order has already been deleted in the successful scenario.
// If a failure happened before DELETE, try to remove the order now.
if (orderId !== null) {
  try {
    await request(`/api/orders/${orderId}`, {
      method: "DELETE",
    });
  } catch {
    // Ignore cleanup errors.
  }
}

// Remove created movements associated with the test products if the
// application exposes the movement DELETE endpoint. The production
// lifecycle tests already prove order-related movements are removed
// through order deletion, so we do not depend on a movement API here.

// Delete supplies first through the API if available.
const supplyIds = [
  supplyA1Id,
  supplyA2Id,
  supplyB1Id,
  supplyB2Id,
].filter(
  (id): id is number => id !== null
);

for (const supplyId of supplyIds.reverse()) {
  try {
    await request(`/api/supplies/${supplyId}`, {
      method: "DELETE",
    });
  } catch {
    // Ignore cleanup errors.
  }
}

// Delete products. Product DELETE is expected to reject products with
// history, so if supply cleanup is insufficient we leave the failure
// visible rather than performing direct database mutation.
const productIds = [
  productAId,
  productBId,
].filter(
  (id): id is number => id !== null
);

for (const productId of productIds.reverse()) {
  try {
    await request(`/api/products/${productId}`, {
      method: "DELETE",
    });
  } catch {
    // Ignore cleanup errors.
  }
}

if (supplierId !== null) {
  try {
    await request(`/api/suppliers/${supplierId}`, {
      method: "DELETE",
    });
  } catch {
    // Ignore cleanup errors.
  }
}

console.log("🟢 CLEANUP COMPLETED");
console.log("");


}
}

main()
.catch((error) => {
  console.error("");
  console.error("🔴 V59 FAILED");
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
