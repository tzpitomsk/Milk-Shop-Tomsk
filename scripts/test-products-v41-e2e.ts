import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL =
process.env.BASE_URL ?? "http://localhost:3000";

const TEST_PREFIX = "V41_INTEGRATION_TEST";

type JsonValue = unknown;

type RequestResult = {
response: Response;
data: JsonValue;
};

let createdProductId: number | null = null;
let validationProductId: number | null = null;
let createdSupplierId: number | null = null;
let createdSupplyId: number | null = null;
let createdBatchId: number | null = null;
let createdOrderId: number | null = null;

function assert(
condition: unknown,
message: string
): asserts condition {
if (!condition) {
throw new Error(
`🔴 ASSERTION FAILED: ${message}`
);
}
}

function isObject(
value: JsonValue
): value is Record<string, unknown> {
return (
typeof value === "object" &&
value !== null &&
!Array.isArray(value)
);
}

async function requestJson(
url: string,
options?: RequestInit
): Promise<RequestResult> {
const response = await fetch(url, {
...options,
headers: {
"Content-Type": "application/json",
...(options?.headers ?? {}),
},
});

let data: JsonValue = null;

const text = await response.text();

if (text.trim()) {
try {
data = JSON.parse(text);
} catch {
data = text;
}
}

return {
response,
data,
};
}

function printResponse(
label: string,
response: Response,
data: JsonValue
) {
console.log(label);
console.log(`HTTP ${response.status}`);

if (typeof data === "string") {
console.log(data);
} else {
console.log(
JSON.stringify(data, null, 2)
);
}

console.log("");
}

async function cleanup() {
console.log("");
console.log(
"=============================================================================="
);
console.log("V41 CLEANUP");
console.log(
"=============================================================================="
);
console.log("");

try {
// ------------------------------------------------------------------------
// Orders created by the test
//
// Delete dependent records first.
// ------------------------------------------------------------------------


if (createdOrderId !== null) {
  const orderItems =
    await prisma.orderItem.findMany({
      where: {
        orderId: createdOrderId,
      },
      select: {
        id: true,
      },
    });

  const orderItemIds =
    orderItems.map(
      (item) => item.id
    );

  if (orderItemIds.length > 0) {
    const deletedReturns =
      await prisma.returnBatch.deleteMany({
        where: {
          orderItemId: {
            in: orderItemIds,
          },
        },
      });

    console.log(
      `Deleted return batches=${deletedReturns.count}`
    );

    const deletedOrderBatches =
      await prisma.orderBatch.deleteMany({
        where: {
          orderItemId: {
            in: orderItemIds,
          },
        },
      });

    console.log(
      `Deleted order batches=${deletedOrderBatches.count}`
    );
  }

  const deletedOrderItems =
    await prisma.orderItem.deleteMany({
      where: {
        orderId: createdOrderId,
      },
    });

  console.log(
    `Deleted order items=${deletedOrderItems.count}`
  );

  const deletedOrders =
    await prisma.order.deleteMany({
      where: {
        id: createdOrderId,
      },
    });

  console.log(
    `Deleted orders=${deletedOrders.count}`
  );
}

// ------------------------------------------------------------------------
// Product-related dependent records
// ------------------------------------------------------------------------

const productIds = [
  createdProductId,
  validationProductId,
].filter(
  (id): id is number =>
    id !== null
);

if (productIds.length > 0) {
  const deletedReturns =
    await prisma.returnBatch.deleteMany({
      where: {
        Batch: {
          productId: {
            in: productIds,
          },
        },
      },
    });

  console.log(
    `Deleted return batches=${deletedReturns.count}`
  );

  const deletedOrderBatches =
    await prisma.orderBatch.deleteMany({
      where: {
        batch: {
          productId: {
            in: productIds,
          },
        },
      },
    });

  console.log(
    `Deleted order batches=${deletedOrderBatches.count}`
  );

  const deletedOrderItems =
    await prisma.orderItem.deleteMany({
      where: {
        productId: {
          in: productIds,
        },
      },
    });

  console.log(
    `Deleted order items=${deletedOrderItems.count}`
  );

  const deletedMovements =
    await prisma.movement.deleteMany({
      where: {
        productId: {
          in: productIds,
        },
      },
    });

  console.log(
    `Deleted movements=${deletedMovements.count}`
  );

  const deletedSupplyItems =
    await prisma.supplyItem.deleteMany({
      where: {
        productId: {
          in: productIds,
        },
      },
    });

  console.log(
    `Deleted supply items=${deletedSupplyItems.count}`
  );

  const deletedBatches =
    await prisma.batch.deleteMany({
      where: {
        productId: {
          in: productIds,
        },
      },
    });

  console.log(
    `Deleted batches=${deletedBatches.count}`
  );

  const deletedProducts =
    await prisma.product.deleteMany({
      where: {
        id: {
          in: productIds,
        },
      },
    });

  console.log(
    `Deleted products=${deletedProducts.count}`
  );
}

// ------------------------------------------------------------------------
// Supply
// ------------------------------------------------------------------------

if (createdSupplyId !== null) {
  const deletedSupplies =
    await prisma.supply.deleteMany({
      where: {
        id: createdSupplyId,
      },
    });

  console.log(
    `Deleted supplies=${deletedSupplies.count}`
  );
}

// ------------------------------------------------------------------------
// Supplier
// ------------------------------------------------------------------------

if (createdSupplierId !== null) {
  const deletedSuppliers =
    await prisma.supplier.deleteMany({
      where: {
        id: createdSupplierId,
      },
    });

  console.log(
    `Deleted suppliers=${deletedSuppliers.count}`
  );
}

console.log("");
console.log(
  "🟢 CLEANUP COMPLETED"
);
console.log("");


} catch (error) {
console.error("");
console.error(
"🔴 CLEANUP FAILED"
);
console.error(error);
console.error("");
}
}

async function main() {
console.log("");
console.log(
"=============================================================================="
);
console.log(
"V41 PRODUCT CRUD INTEGRITY E2E TEST"
);
console.log(
"=============================================================================="
);
console.log("");

console.log(
`BASE_URL=${BASE_URL}`
);

console.log("");

console.log(
"TEST PURPOSE:"
);

console.log(
"Product creation must establish a valid zero-stock product."
);

console.log(
"Product.stock must not be manually writable."
);

console.log(
"Product editing must not change stock."
);

console.log(
"Invalid product data must be rejected."
);

console.log(
"Products with inventory/history must not be silently deleted."
);

console.log(
"Empty products must be safely deletable."
);

console.log("");

console.log(
"=============================================================================="
);
console.log("");

// ===========================================================================
// 1. CREATE PRODUCT
// ===========================================================================

console.log(
"1. CREATE PRODUCT"
);

console.log(
"------------------------------------------------------------------------------"
);

const timestamp =
Date.now();

const productName =
`${TEST_PREFIX} Товар ${timestamp}`;

const barcode =
`V41-${timestamp}`;

const createProductResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: productName,
barcode,
unit: "шт",
price: 300,
cost: 100,
}),
}
);

printResponse(
"POST /api/products",
createProductResult.response,
createProductResult.data
);

assert(
createProductResult.response.ok,
"Valid product creation must succeed"
);

assert(
isObject(
createProductResult.data
),
"Product creation response must be an object"
);

assert(
typeof createProductResult.data.id ===
"number",
"Created product must contain numeric id"
);

createdProductId =
createProductResult.data.id as number;

assert(
createProductResult.data.name ===
productName,
"Created product name must match"
);

assert(
createProductResult.data.barcode ===
barcode,
"Created product barcode must match"
);

assert(
createProductResult.data.unit ===
"шт",
"Created product unit must match"
);

assert(
createProductResult.data.price ===
300,
"Created product price must match"
);

assert(
createProductResult.data.cost ===
100,
"Created product cost must match"
);

assert(
createProductResult.data.stock ===
0,
`New product stock must be 0, got ${createProductResult.data.stock}`
);

console.log(
`Created Product #${createdProductId}`
);

console.log(
"🟢 Valid product created"
);

console.log(
"🟢 Initial stock is 0"
);

console.log("");

// ===========================================================================
// 2. VERIFY DATABASE STATE
// ===========================================================================

console.log(
"2. VERIFY DATABASE STATE AFTER CREATE"
);

console.log(
"------------------------------------------------------------------------------"
);

assert(
createdProductId !== null,
"Product id must exist"
);

const productAfterCreate =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
include: {
batches: true,
movements: true,
supplyItems: true,
orderItems: true,
},
});

assert(
productAfterCreate !== null,
"Created product must exist in database"
);

assert(
productAfterCreate.stock ===
0,
`Database stock must be 0, got ${productAfterCreate.stock}`
);

assert(
productAfterCreate.batches.length ===
0,
`New product must have 0 batches, got ${productAfterCreate.batches.length}`
);

assert(
productAfterCreate.movements.length ===
0,
`New product must have 0 movements, got ${productAfterCreate.movements.length}`
);

assert(
productAfterCreate.supplyItems.length ===
0,
`New product must have 0 supply items, got ${productAfterCreate.supplyItems.length}`
);

assert(
productAfterCreate.orderItems.length ===
0,
`New product must have 0 order items, got ${productAfterCreate.orderItems.length}`
);

console.log(
`Product.stock=${productAfterCreate.stock}`
);

console.log(
`Batches=${productAfterCreate.batches.length}`
);

console.log(
`Movements=${productAfterCreate.movements.length}`
);

console.log(
`SupplyItems=${productAfterCreate.supplyItems.length}`
);

console.log(
`OrderItems=${productAfterCreate.orderItems.length}`
);

console.log(
"🟢 Database state is clean"
);

console.log("");

// ===========================================================================
// 3. MANUAL STOCK INJECTION
// ===========================================================================

console.log(
"3. PROTECTION AGAINST MANUAL STOCK INJECTION"
);

console.log(
"------------------------------------------------------------------------------"
);

const maliciousName =
`${TEST_PREFIX} MALICIOUS ${Date.now()}`;

const maliciousResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: maliciousName,
barcode: `V41-MAL-${Date.now()}`,
unit: "шт",
price: 500,
cost: 200,
stock: 100,
}),
}
);

printResponse(
"POST /api/products with stock=100",
maliciousResult.response,
maliciousResult.data
);

// ------------------------------------------------------------------------
// Important:
//
// If a broken API still creates the product, capture it immediately so
// cleanup can remove it.
// ------------------------------------------------------------------------

if (
maliciousResult.response.ok &&
isObject(
maliciousResult.data
) &&
typeof maliciousResult.data.id ===
"number"
) {
validationProductId =
maliciousResult.data.id as number;


console.log(
  `⚠️ API unexpectedly created Product #${validationProductId}`
);


}

assert(
maliciousResult.response.status ===
400,
`Manual stock injection must return HTTP 400, got ${maliciousResult.response.status}`
);

console.log(
"🟢 Manual stock injection rejected"
);

// ------------------------------------------------------------------------
// Verify that no malicious product was created.
// ------------------------------------------------------------------------

const maliciousProducts =
await prisma.product.findMany({
where: {
name: maliciousName,
},
});

assert(
maliciousProducts.length ===
0,
`Product with forbidden stock input must not be created, found ${maliciousProducts.length}`
);

console.log(
"🟢 No malicious product exists in database"
);

console.log("");

// ===========================================================================
// 4. INVALID NAME
// ===========================================================================

console.log(
"4. VALIDATION — EMPTY NAME"
);

console.log(
"------------------------------------------------------------------------------"
);

const emptyNameResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: "",
unit: "шт",
price: 300,
cost: 100,
}),
}
);

printResponse(
"POST /api/products with empty name",
emptyNameResult.response,
emptyNameResult.data
);

assert(
emptyNameResult.response.status ===
400,
`Empty name must return HTTP 400, got ${emptyNameResult.response.status}`
);

console.log(
"🟢 Empty name rejected"
);

console.log("");

// ===========================================================================
// 5. INVALID UNIT
// ===========================================================================

console.log(
"5. VALIDATION — EMPTY UNIT"
);

console.log(
"------------------------------------------------------------------------------"
);

const emptyUnitResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: `${TEST_PREFIX} invalid unit ${Date.now()}`,
unit: "",
price: 300,
cost: 100,
}),
}
);

printResponse(
"POST /api/products with empty unit",
emptyUnitResult.response,
emptyUnitResult.data
);

assert(
emptyUnitResult.response.status ===
400,
`Empty unit must return HTTP 400, got ${emptyUnitResult.response.status}`
);

console.log(
"🟢 Empty unit rejected"
);

console.log("");

// ===========================================================================
// 6. INVALID PRICE
// ===========================================================================

console.log(
"6. VALIDATION — NEGATIVE PRICE"
);

console.log(
"------------------------------------------------------------------------------"
);

const negativePriceResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: `${TEST_PREFIX} invalid price ${Date.now()}`,
unit: "шт",
price: -1,
cost: 100,
}),
}
);

printResponse(
"POST /api/products with price=-1",
negativePriceResult.response,
negativePriceResult.data
);

assert(
negativePriceResult.response.status ===
400,
`Negative price must return HTTP 400, got ${negativePriceResult.response.status}`
);

console.log(
"🟢 Negative price rejected"
);

console.log("");

// ===========================================================================
// 7. INVALID COST
// ===========================================================================

console.log(
"7. VALIDATION — NEGATIVE COST"
);

console.log(
"------------------------------------------------------------------------------"
);

const negativeCostResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: `${TEST_PREFIX} invalid cost ${Date.now()}`,
unit: "шт",
price: 300,
cost: -1,
}),
}
);

printResponse(
"POST /api/products with cost=-1",
negativeCostResult.response,
negativeCostResult.data
);

assert(
negativeCostResult.response.status ===
400,
`Negative cost must return HTTP 400, got ${negativeCostResult.response.status}`
);

console.log(
"🟢 Negative cost rejected"
);

console.log("");

// ===========================================================================
// 8. EDIT PRODUCT
// ===========================================================================

console.log(
"8. EDIT PRODUCT"
);

console.log(
"------------------------------------------------------------------------------"
);

assert(
createdProductId !== null,
"Product id must exist before PUT"
);

const updateResult =
await requestJson(
`${BASE_URL}/api/products/${createdProductId}`,
{
method: "PUT",
body: JSON.stringify({
name: `${TEST_PREFIX} Товар UPDATED`,
barcode: `V41-UPD-${Date.now()}`,
unit: "кг",
price: 450,
cost: 150,
}),
}
);

printResponse(
"PUT /api/products/:id",
updateResult.response,
updateResult.data
);

assert(
updateResult.response.ok,
"Valid product update must succeed"
);

assert(
isObject(
updateResult.data
),
"Product update response must be an object"
);

console.log(
"🟢 Product update succeeded"
);

console.log("");

// ===========================================================================
// 9. VERIFY EDITED DATA AND STOCK
// ===========================================================================

console.log(
"9. VERIFY PRODUCT UPDATE"
);

console.log(
"------------------------------------------------------------------------------"
);

const productAfterUpdate =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
});

assert(
productAfterUpdate !== null,
"Product must exist after update"
);

assert(
productAfterUpdate.name ===
`${TEST_PREFIX} Товар UPDATED`,
"Updated product name must be saved"
);

assert(
productAfterUpdate.unit ===
"кг",
"Updated product unit must be saved"
);

assert(
productAfterUpdate.price ===
450,
"Updated product price must be saved"
);

assert(
productAfterUpdate.cost ===
150,
"Updated product cost must be saved"
);

assert(
productAfterUpdate.stock ===
0,
`PUT must not alter stock; expected 0, got ${productAfterUpdate.stock}`
);

console.log(
`name=${productAfterUpdate.name}`
);

console.log(
`unit=${productAfterUpdate.unit}`
);

console.log(
`price=${productAfterUpdate.price}`
);

console.log(
`cost=${productAfterUpdate.cost}`
);

console.log(
`stock=${productAfterUpdate.stock}`
);

console.log(
"🟢 Product fields updated"
);

console.log(
"🟢 Product.stock remained 0"
);

console.log("");

// ===========================================================================
// 10. TRY TO CHANGE STOCK THROUGH PUT
// ===========================================================================

console.log(
"10. PROTECTION AGAINST STOCK CHANGE THROUGH PUT"
);

console.log(
"------------------------------------------------------------------------------"
);

const stockPutResult =
await requestJson(
`${BASE_URL}/api/products/${createdProductId}`,
{
method: "PUT",
body: JSON.stringify({
name: `${TEST_PREFIX} Товар UPDATED AGAIN`,
barcode: `V41-UPD2-${Date.now()}`,
unit: "кг",
price: 500,
cost: 160,
stock: 999,
}),
}
);

printResponse(
"PUT /api/products/:id with stock=999",
stockPutResult.response,
stockPutResult.data
);

// ------------------------------------------------------------------------
// The existing PUT route currently ignores stock.
//
// V41 accepts either:
//
//   400 — explicit rejection
//
// OR
//
//   200 — stock ignored and remains unchanged
//
// Both preserve the critical invariant.
// ------------------------------------------------------------------------

assert(
stockPutResult.response.ok ||
stockPutResult.response.status ===
400,
`PUT with stock must either succeed while ignoring stock or reject with 400; got ${stockPutResult.response.status}`
);

const productAfterStockPut =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
});

assert(
productAfterStockPut !== null,
"Product must exist after stock PUT test"
);

assert(
productAfterStockPut.stock ===
0,
`PUT must never change Product.stock directly; got ${productAfterStockPut.stock}`
);

console.log(
`HTTP ${stockPutResult.response.status}`
);

console.log(
`Product.stock=${productAfterStockPut.stock}`
);

console.log(
"🟢 PUT cannot modify Product.stock"
);

console.log("");

// ===========================================================================
// 11. CREATE SUPPLIER
// ===========================================================================

console.log(
"11. CREATE TEST SUPPLIER"
);

console.log(
"------------------------------------------------------------------------------"
);

const supplierResult =
await requestJson(
`${BASE_URL}/api/suppliers`,
{
method: "POST",
body: JSON.stringify({
name: `${TEST_PREFIX} Supplier ${Date.now()}`,
phone: "",
address: "",
}),
}
);

printResponse(
"POST /api/suppliers",
supplierResult.response,
supplierResult.data
);

assert(
supplierResult.response.ok,
"Supplier creation must succeed"
);

assert(
isObject(
supplierResult.data
),
"Supplier response must be an object"
);

assert(
typeof supplierResult.data.id ===
"number",
"Supplier must contain numeric id"
);

createdSupplierId =
supplierResult.data.id as number;

console.log(
`Created Supplier #${createdSupplierId}`
);

console.log(
"🟢 Supplier created"
);

console.log("");

// ===========================================================================
// 12. CREATE SUPPLY
// ===========================================================================

console.log(
"12. CREATE SUPPLY FOR TEST PRODUCT"
);

console.log(
"------------------------------------------------------------------------------"
);

const expiryDate =
localDateOnly(30);

const supplyResult =
await requestJson(
`${BASE_URL}/api/supplies`,
{
method: "POST",
body: JSON.stringify({
supplierId:
createdSupplierId,
total: 1000,
items: [
{
id: createdProductId,
quantity: 5,
cost: 100,
expiryDate,
},
],
}),
}
);

printResponse(
"POST /api/supplies",
supplyResult.response,
supplyResult.data
);

assert(
supplyResult.response.ok,
"Supply creation must succeed"
);

assert(
isObject(
supplyResult.data
),
"Supply response must be an object"
);

assert(
isObject(
supplyResult.data.supply
),
"Supply response must contain supply"
);

assert(
typeof supplyResult.data.supply.id ===
"number",
"Supply must contain numeric id"
);

createdSupplyId =
supplyResult.data.supply.id as number;

console.log(
`Created Supply #${createdSupplyId}`
);

console.log(
"🟢 Supply created"
);

console.log("");

// ===========================================================================
// 13. VERIFY INVENTORY CREATED THROUGH BATCH
// ===========================================================================

console.log(
"13. VERIFY INVENTORY AFTER SUPPLY"
);

console.log(
"------------------------------------------------------------------------------"
);

const productWithBatch =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
include: {
batches: {
orderBy: {
id: "asc",
},
},
},
});

assert(
productWithBatch !== null,
"Product must exist after supply"
);

assert(
productWithBatch.batches.length ===
1,
`Expected exactly 1 batch, got ${productWithBatch.batches.length}`
);

const batch =
productWithBatch.batches[0];

createdBatchId =
batch.id;

assert(
batch.quantity ===
5,
`Batch quantity must be 5, got ${batch.quantity}`
);

assert(
productWithBatch.stock ===
5,
`Product.stock must be 5 after supply, got ${productWithBatch.stock}`
);

const batchAggregate =
await prisma.batch.aggregate({
where: {
productId:
createdProductId,
},
_sum: {
quantity: true,
},
});

const batchStock =
batchAggregate._sum.quantity ??
0;

assert(
productWithBatch.stock ===
batchStock,
`Product.stock=${productWithBatch.stock} must equal SUM(Batch.quantity)=${batchStock}`
);

console.log(
`Batch #${batch.id}`
);

console.log(
`Batch.quantity=${batch.quantity}`
);

console.log(
`Product.stock=${productWithBatch.stock}`
);

console.log(
`SUM(Batch.quantity)=${batchStock}`
);

console.log(
"🟢 Inventory exists only through Batch"
);

console.log(
"🟢 Product.stock invariant passed"
);

console.log("");

// ===========================================================================
// 14. TRY TO DELETE PRODUCT WITH BATCH
// ===========================================================================

console.log(
"14. DELETE PRODUCT WITH INVENTORY"
);

console.log(
"------------------------------------------------------------------------------"
);

assert(
createdProductId !== null,
"Product id must exist before delete test"
);

const deleteWithBatchResult =
await requestJson(
`${BASE_URL}/api/products/${createdProductId}`,
{
method: "DELETE",
}
);

printResponse(
"DELETE /api/products/:id with existing batch",
deleteWithBatchResult.response,
deleteWithBatchResult.data
);

// ------------------------------------------------------------------------
// Current business expectation:
//
// A product with inventory must NOT be silently deleted.
//
// We expect HTTP 400.
// ------------------------------------------------------------------------

assert(
deleteWithBatchResult.response.status ===
400,
`Deleting product with inventory must return HTTP 400, got ${deleteWithBatchResult.response.status}`
);

console.log(
"🟢 Product with inventory was protected from deletion"
);

console.log("");

// ===========================================================================
// 15. VERIFY PRODUCT STILL EXISTS
// ===========================================================================

console.log(
"15. VERIFY PRODUCT AFTER PROTECTED DELETE"
);

console.log(
"------------------------------------------------------------------------------"
);

const productAfterFailedDelete =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
include: {
batches: true,
},
});

assert(
productAfterFailedDelete !==
null,
"Product must still exist after rejected delete"
);

assert(
productAfterFailedDelete.stock ===
5,
`Product.stock must remain 5, got ${productAfterFailedDelete.stock}`
);

assert(
productAfterFailedDelete.batches.length ===
1,
`Product must still have 1 batch, got ${productAfterFailedDelete.batches.length}`
);

assert(
productAfterFailedDelete.batches[0].quantity ===
5,
`Batch quantity must remain 5, got ${productAfterFailedDelete.batches[0].quantity}`
);

console.log(
`Product #${productAfterFailedDelete.id} still exists`
);

console.log(
`Product.stock=${productAfterFailedDelete.stock}`
);

console.log(
`Batch.quantity=${productAfterFailedDelete.batches[0].quantity}`
);

console.log(
"🟢 Inventory was not damaged by rejected delete"
);

console.log("");

// ===========================================================================
// 16. DELETE PRODUCT WITH HISTORY
//
// The current product has SupplyItem and Movement history.
// Even if the batch were empty, deleting the product would destroy history.
//
// V41 therefore verifies that the product remains protected.
// ===========================================================================

console.log(
"16. VERIFY PRODUCT HISTORY PROTECTION"
);

console.log(
"------------------------------------------------------------------------------"
);

const historyProduct =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
include: {
movements: true,
supplyItems: true,
},
});

assert(
historyProduct !==
null,
"Product must exist for history protection test"
);

assert(
historyProduct.movements.length >=
1,
"Product must have movement history after supply"
);

assert(
historyProduct.supplyItems.length >=
1,
"Product must have supply history after supply"
);

console.log(
`Movements=${historyProduct.movements.length}`
);

console.log(
`SupplyItems=${historyProduct.supplyItems.length}`
);

console.log(
"🟢 Product history exists"
);

console.log("");

// ===========================================================================
// 17. EMPTY PRODUCT DELETE
//
// Create a second completely empty product and verify it can be deleted.
// ===========================================================================

console.log(
"17. CREATE EMPTY PRODUCT FOR DELETE TEST"
);

console.log(
"------------------------------------------------------------------------------"
);

const emptyProductResult =
await requestJson(
`${BASE_URL}/api/products`,
{
method: "POST",
body: JSON.stringify({
name: `${TEST_PREFIX} EMPTY ${Date.now()}`,
barcode: `V41-EMPTY-${Date.now()}`,
unit: "шт",
price: 200,
cost: 80,
}),
}
);

printResponse(
"POST /api/products empty product",
emptyProductResult.response,
emptyProductResult.data
);

assert(
emptyProductResult.response.ok,
"Empty product creation must succeed"
);

assert(
isObject(
emptyProductResult.data
),
"Empty product response must be an object"
);

assert(
typeof emptyProductResult.data.id ===
"number",
"Empty product must contain numeric id"
);

const emptyProductId =
emptyProductResult.data.id as number;

assert(
emptyProductResult.data.stock ===
0,
`Empty product stock must be 0, got ${emptyProductResult.data.stock}`
);

console.log(
`Created empty Product #${emptyProductId}`
);

console.log(
"🟢 Empty product created with stock 0"
);

console.log("");

// ===========================================================================
// 18. DELETE EMPTY PRODUCT
// ===========================================================================

console.log(
"18. DELETE EMPTY PRODUCT"
);

console.log(
"------------------------------------------------------------------------------"
);

const deleteEmptyResult =
await requestJson(
`${BASE_URL}/api/products/${emptyProductId}`,
{
method: "DELETE",
}
);

printResponse(
"DELETE /api/products/:id empty product",
deleteEmptyResult.response,
deleteEmptyResult.data
);

assert(
deleteEmptyResult.response.ok,
"Completely empty product should be deletable"
);

console.log(
"🟢 Empty product deletion succeeded"
);

console.log("");

// ===========================================================================
// 19. VERIFY EMPTY PRODUCT IS GONE
// ===========================================================================

console.log(
"19. VERIFY EMPTY PRODUCT IS DELETED"
);

console.log(
"------------------------------------------------------------------------------"
);

const deletedEmptyProduct =
await prisma.product.findUnique({
where: {
id: emptyProductId,
},
});

assert(
deletedEmptyProduct ===
null,
"Deleted empty product must no longer exist"
);

console.log(
`Product #${emptyProductId} not found`
);

console.log(
"🟢 Empty product was deleted completely"
);

console.log("");

// ===========================================================================
// 20. FINAL STOCK INTEGRITY
// ===========================================================================

console.log(
"20. FINAL PRODUCT STOCK INTEGRITY"
);

console.log(
"------------------------------------------------------------------------------"
);

assert(
createdProductId !== null,
"Product id must exist for final check"
);

const finalProduct =
await prisma.product.findUnique({
where: {
id: createdProductId,
},
});

assert(
finalProduct !==
null,
"Main test product must still exist"
);

const finalBatchAggregate =
await prisma.batch.aggregate({
where: {
productId:
createdProductId,
},
_sum: {
quantity: true,
},
});

const finalBatchStock =
finalBatchAggregate._sum.quantity ??
0;

assert(
finalProduct.stock ===
finalBatchStock,
`FINAL STOCK INTEGRITY FAILURE: Product.stock=${finalProduct.stock}, SUM(Batch.quantity)=${finalBatchStock}`
);

assert(
finalProduct.stock ===
5,
`Final Product.stock must be 5, got ${finalProduct.stock}`
);

console.log(
`Product.stock=${finalProduct.stock}`
);

console.log(
`SUM(Batch.quantity)=${finalBatchStock}`
);

console.log(
"🟢 FINAL STOCK INVARIANT PASSED"
);

console.log("");

// ===========================================================================
// 21. FINAL RESULT
// ===========================================================================

console.log(
"=============================================================================="
);

console.log(
"V41 FINAL RESULT"
);

console.log(
"=============================================================================="
);

console.log("");

console.log(
"🟢 V41 PASSED"
);

console.log("");

console.log(
"Verified:"
);

console.log(
"🟢 Valid Product creation"
);

console.log(
"🟢 New Product.stock = 0"
);

console.log(
"🟢 Product without batches has stock 0"
);

console.log(
"🟢 Manual Product.stock injection rejected"
);

console.log(
"🟢 Empty product name rejected"
);

console.log(
"🟢 Empty unit rejected"
);

console.log(
"🟢 Negative price rejected"
);

console.log(
"🟢 Negative cost rejected"
);

console.log(
"🟢 Product editing works"
);

console.log(
"🟢 Product.stock cannot be changed through PUT"
);

console.log(
"🟢 Supply creates inventory through Batch"
);

console.log(
"🟢 Product.stock = SUM(Batch.quantity)"
);

console.log(
"🟢 Product with inventory is protected from deletion"
);

console.log(
"🟢 Product history remains protected"
);

console.log(
"🟢 Empty product can be deleted"
);

console.log(
"🟢 Final stock invariant passed"
);

console.log("");

console.log(
"=============================================================================="
);

console.log(
"V41 COMPLETED"
);

console.log(
"=============================================================================="
);

console.log("");
}

function localDateOnly(
daysFromNow: number
): string {
const date =
new Date();

date.setHours(
12,
0,
0,
0
);

date.setDate(
date.getDate() +
daysFromNow
);

const year =
date.getFullYear();

const month =
String(
date.getMonth() + 1
).padStart(
2,
"0"
);

const day =
String(
date.getDate()
).padStart(
2,
"0"
);

return `${year}-${month}-${day}`;
}

main()
.catch((error) => {
console.error("");
console.error(
"=============================================================================="
);
console.error(
"🔴 V41 FAILED"
);
console.error(
"=============================================================================="
);
console.error("");


console.error(error);

console.error("");

console.error(
  "The failure above identifies the first violated V41 invariant."
);

console.error("");

console.error(
  "=============================================================================="
);

process.exitCode = 1;


})
.finally(async () => {
await cleanup();
await prisma.$disconnect();
});
