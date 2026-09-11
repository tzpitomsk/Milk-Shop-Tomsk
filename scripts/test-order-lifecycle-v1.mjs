import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_BARCODE = `LIFECYCLE_TEST_V1_${Date.now()}`;

let productId = null;
let orderId = null;

function assert(condition, message) {
if (!condition) {
throw new Error(`ASSERTION FAILED: ${message}`);
}

console.log(`🟢 ${message}`);
}

async function apiJson(url, options = {}) {
const response = await fetch(url, {
...options,
headers: {
"Content-Type": "application/json",
...(options.headers ?? {}),
},
});

const text = await response.text();

let data = null;

try {
data = text ? JSON.parse(text) : null;
} catch {
data = text;
}

return {
response,
data,
text,
};
}

async function cleanup() {
console.log("");
console.log("==============================================================================");
console.log("LIFECYCLE V1 CLEANUP");
console.log("==============================================================================");

try {
const product = await prisma.product.findUnique({
where: {
barcode: TEST_BARCODE,
},
});


if (!product) {
  console.log("No test product found. Nothing to clean.");
  return;
}

const id = product.id;

console.log(`Found test Product #${id}`);

// -------------------------------------------------------------------------
// Delete remaining orders for this isolated test product.
// -------------------------------------------------------------------------

const orders = await prisma.order.findMany({
  where: {
    items: {
      some: {
        productId: id,
      },
    },
  },
  select: {
    id: true,
  },
});

for (const order of orders) {
  console.log(`Deleting remaining test Order #${order.id}`);

  await prisma.order.delete({
    where: {
      id: order.id,
    },
  });
}

// -------------------------------------------------------------------------
// Delete movements.
// -------------------------------------------------------------------------

const movements = await prisma.movement.findMany({
  where: {
    productId: id,
  },
  select: {
    id: true,
    type: true,
    quantity: true,
    comment: true,
  },
  orderBy: {
    id: "asc",
  },
});

if (movements.length > 0) {
  console.log(`Deleting ${movements.length} Movement record(s)`);

  for (const movement of movements) {
    console.log(
      `  Movement #${movement.id} | ` +
        `${movement.type} | ` +
        `quantity=${movement.quantity} | ` +
        `${movement.comment ?? ""}`
    );
  }

  await prisma.movement.deleteMany({
    where: {
      productId: id,
    },
  });
}

// -------------------------------------------------------------------------
// Delete remaining batches.
// -------------------------------------------------------------------------

const batches = await prisma.batch.findMany({
  where: {
    productId: id,
  },
  select: {
    id: true,
    quantity: true,
    status: true,
  },
  orderBy: {
    id: "asc",
  },
});

if (batches.length > 0) {
  console.log(`Deleting ${batches.length} Batch record(s)`);

  for (const batch of batches) {
    console.log(
      `  Batch #${batch.id} | ` +
        `quantity=${batch.quantity} | ` +
        `status=${batch.status}`
    );
  }

  await prisma.batch.deleteMany({
    where: {
      productId: id,
    },
  });
}

// -------------------------------------------------------------------------
// Delete product.
// -------------------------------------------------------------------------

await prisma.product.delete({
  where: {
    id,
  },
});

console.log(`🟢 Test Product #${id} deleted.`);


} catch (error) {
console.error("");
console.error("🔴 CLEANUP FAILED");
console.error(error);
}
}

async function verifyCleanup() {
const product = await prisma.product.findUnique({
where: {
barcode: TEST_BARCODE,
},
include: {
batches: true,
movements: true,
},
});

assert(
product === null,
"Final cleanup: test product does not exist"
);
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("ORDER LIFECYCLE INTEGRATION TEST V1");
console.log("==============================================================================");
console.log("POST ORDER → RETURN → DELETE");
console.log("STRICTLY ISOLATED TEST DATA");
console.log("");

// ===========================================================================
// 1. CREATE TEST PRODUCT
// ===========================================================================

console.log("1. CREATING TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
data: {
name: "ORDER LIFECYCLE INTEGRATION TEST V1",
unit: "шт",
price: 300,
cost: 100,
stock: 5,
barcode: TEST_BARCODE,
},
});

productId = product.id;

console.log(`Product #${product.id}`);
console.log(`Barcode=${TEST_BARCODE}`);

// ===========================================================================
// 2. CREATE BATCHES
// ===========================================================================

console.log("");
console.log("2. CREATING TEST BATCHES");
console.log("------------------------------------------------------------------------------");

const now = new Date();

const earlierExpiry = new Date(now);
earlierExpiry.setDate(
earlierExpiry.getDate() + 10
);

const laterExpiry = new Date(now);
laterExpiry.setDate(
laterExpiry.getDate() + 30
);

const batchA = await prisma.batch.create({
data: {
quantity: 2,
purchaseCost: 100,
receivedAt: new Date(
now.getTime() - 2 * 24 * 60 * 60 * 1000
),
expiryDate: earlierExpiry,
status: "ACTIVE",
productId,
},
});

const batchB = await prisma.batch.create({
data: {
quantity: 3,
purchaseCost: 120,
receivedAt: new Date(
now.getTime() - 1 * 24 * 60 * 60 * 1000
),
expiryDate: laterExpiry,
status: "ACTIVE",
productId,
},
});

await prisma.product.update({
where: {
id: productId,
},
data: {
stock: 5,
},
});

console.log(
`Batch #${batchA.id} | qty=2 | cost=100 | earlier expiry`
);

console.log(
`Batch #${batchB.id} | qty=3 | cost=120 | later expiry`
);

// ===========================================================================
// 3. VERIFY INITIAL STOCK
// ===========================================================================

console.log("");
console.log("3. VERIFYING INITIAL STOCK");
console.log("------------------------------------------------------------------------------");

const initialProduct = await prisma.product.findUnique({
where: {
id: productId,
},
include: {
batches: true,
},
});

const initialBatchStock =
initialProduct.batches.reduce(
(sum, batch) => sum + batch.quantity,
0
);

assert(
initialProduct.stock === 5,
"Initial Product.stock is 5"
);

assert(
initialBatchStock === 5,
"Initial batch stock is 5"
);

assert(
initialProduct.stock === initialBatchStock,
"Initial Product.stock equals batch total"
);

// ===========================================================================
// 4. CREATE ORDER THROUGH REAL API
// ===========================================================================

console.log("");
console.log("4. CREATING ORDER THROUGH POST /api/orders");
console.log("------------------------------------------------------------------------------");

const createOrder = await apiJson(
"http://localhost:3000/api/orders",
{
method: "POST",
body: JSON.stringify({
items: [
{
id: productId,
quantity: 4,
price: 300,
},
],
}),
}
);

console.log(
`HTTP ${createOrder.response.status}`
);

console.log(
`Response=${JSON.stringify(createOrder.data)}`
);

assert(
createOrder.response.status >= 200 &&
createOrder.response.status < 300,
"POST /api/orders succeeded"
);

assert(
createOrder.data?.id != null,
"POST /api/orders returned an order id"
);

orderId = createOrder.data.id;

// ===========================================================================
// 5. LOAD ORDER FROM DATABASE
// ===========================================================================

console.log("");
console.log("5. VERIFYING CREATED ORDER");
console.log("------------------------------------------------------------------------------");

const createdOrder = await prisma.order.findUnique({
where: {
id: orderId,
},
include: {
items: {
include: {
product: true,
batches: {
include: {
batch: true,
},
orderBy: {
id: "asc",
},
},
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
createdOrder !== null,
"Order exists in database"
);

assert(
createdOrder.items.length === 1,
"Order contains one OrderItem"
);

const createdItem = createdOrder.items[0];

assert(
createdItem.quantity === 4,
"OrderItem quantity is 4"
);

assert(
createdItem.returned === 0,
"OrderItem returned quantity is initially 0"
);

assert(
createdOrder.total === 1200,
"Order gross total is 1200"
);

// ===========================================================================
// 6. VERIFY FEFO/FIFO ALLOCATION
// ===========================================================================

console.log("");
console.log("6. VERIFYING FEFO/FIFO ALLOCATION");
console.log("------------------------------------------------------------------------------");

console.log(
`OrderBatch count=${createdItem.batches.length}`
);

for (const orderBatch of createdItem.batches) {
console.log(
`OrderBatch #${orderBatch.id} | ` +
`Batch #${orderBatch.batchId} | ` +
`qty=${orderBatch.quantity} | ` +
`purchaseCost=${orderBatch.purchaseCost}`
);
}

assert(
createdItem.batches.length === 2,
"Sale was split across two batches"
);

const firstOrderBatch = createdItem.batches[0];
const secondOrderBatch = createdItem.batches[1];

assert(
firstOrderBatch.batchId === batchA.id,
"Earlier-expiry batch was consumed first"
);

assert(
firstOrderBatch.quantity === 2,
"Earlier-expiry batch supplied 2 units"
);

assert(
firstOrderBatch.purchaseCost === 100,
"First OrderBatch preserved purchase cost 100"
);

assert(
secondOrderBatch.batchId === batchB.id,
"Later-expiry batch was consumed second"
);

assert(
secondOrderBatch.quantity === 2,
"Later-expiry batch supplied remaining 2 units"
);

assert(
secondOrderBatch.purchaseCost === 120,
"Second OrderBatch preserved purchase cost 120"
);

const allocatedQuantity =
firstOrderBatch.quantity +
secondOrderBatch.quantity;

assert(
allocatedQuantity === 4,
"OrderBatch quantities equal sold quantity"
);

// ===========================================================================
// 7. VERIFY STOCK AFTER SALE
// ===========================================================================

console.log("");
console.log("7. VERIFYING STOCK AFTER SALE");
console.log("------------------------------------------------------------------------------");

const afterSaleProduct = await prisma.product.findUnique({
where: {
id: productId,
},
include: {
batches: {
orderBy: {
id: "asc",
},
},
},
});

const afterSaleBatchA = afterSaleProduct.batches.find(
(batch) => batch.id === batchA.id
);

const afterSaleBatchB = afterSaleProduct.batches.find(
(batch) => batch.id === batchB.id
);

assert(
afterSaleBatchA?.quantity === 0,
"Batch A quantity became 0 after sale"
);

assert(
afterSaleBatchA?.status === "EMPTY",
"Batch A status became EMPTY"
);

assert(
afterSaleBatchB?.quantity === 1,
"Batch B quantity became 1 after sale"
);

assert(
afterSaleBatchB?.status === "ACTIVE",
"Batch B remains ACTIVE"
);

assert(
afterSaleProduct.stock === 1,
"Product.stock became 1 after sale"
);

// ===========================================================================
// 8. VERIFY SALE MOVEMENT
// ===========================================================================

console.log("");
console.log("8. VERIFYING SALE MOVEMENT");
console.log("------------------------------------------------------------------------------");

const saleMovements = await prisma.movement.findMany({
where: {
productId,
type: "SALE",
comment: {
contains: `Продажа. Заказ №${orderId}`,
},
},
orderBy: {
id: "asc",
},
});

console.log(
`SALE movements found=${saleMovements.length}`
);

for (const movement of saleMovements) {
console.log(
`Movement #${movement.id} | ` +
`quantity=${movement.quantity} | ` +
`${movement.comment ?? ""}`
);
}

assert(
saleMovements.length === 1,
"Exactly one SALE movement was created"
);

assert(
saleMovements[0].quantity === -4,
"SALE movement quantity is -4"
);

// ===========================================================================
// 9. VERIFY PROFIT
// ===========================================================================

console.log("");
console.log("9. VERIFYING PROFIT");
console.log("------------------------------------------------------------------------------");

/*

* Revenue:
* 4 × 300 = 1200
*
* Purchase cost:
* 2 × 100 = 200
* 2 × 120 = 240
*
* Profit:
* 1200 - 440 = 760
  */

assert(
createdOrder.profit === 760,
"Order profit is correctly calculated as 760"
);

// ===========================================================================
// 10. RETURN ONE UNIT THROUGH REAL API
// ===========================================================================

console.log("");
console.log("10. RETURNING ONE UNIT THROUGH POST /return");
console.log("------------------------------------------------------------------------------");

const returnResult = await apiJson(
`http://localhost:3000/api/orders/${orderId}/return`,
{
method: "POST",
body: JSON.stringify({
itemId: createdItem.id,
quantity: 1,
}),
}
);

console.log(
`HTTP ${returnResult.response.status}`
);

console.log(
`Response=${JSON.stringify(returnResult.data)}`
);

assert(
returnResult.response.status >= 200 &&
returnResult.response.status < 300,
"POST /return succeeded"
);

// ===========================================================================
// 11. VERIFY RETURN / LIFO
// ===========================================================================

console.log("");
console.log("11. VERIFYING RETURN ALLOCATION");
console.log("------------------------------------------------------------------------------");

const afterReturnOrder = await prisma.order.findUnique({
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
},
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
afterReturnOrder !== null,
"Order still exists after return"
);

const returnedItem = afterReturnOrder.items[0];

assert(
returnedItem.returned === 1,
"OrderItem returned quantity became 1"
);

assert(
returnedItem.ReturnBatch.length === 1,
"Exactly one ReturnBatch was created"
);

const createdReturn = returnedItem.ReturnBatch[0];

assert(
createdReturn.quantity === 1,
"ReturnBatch quantity is 1"
);

assert(
createdReturn.batchId === batchB.id,
"Return used the latest sold batch (LIFO)"
);

// ===========================================================================
// 12. VERIFY STOCK AFTER RETURN
// ===========================================================================

console.log("");
console.log("12. VERIFYING STOCK AFTER RETURN");
console.log("------------------------------------------------------------------------------");

const afterReturnProduct = await prisma.product.findUnique({
where: {
id: productId,
},
include: {
batches: true,
},
});

const returnedBatchA = afterReturnProduct.batches.find(
(batch) => batch.id === batchA.id
);

const returnedBatchB = afterReturnProduct.batches.find(
(batch) => batch.id === batchB.id
);

assert(
returnedBatchA?.quantity === 0,
"Batch A remains at 0 after return"
);

assert(
returnedBatchB?.quantity === 2,
"Batch B increased to 2 after return"
);

assert(
returnedBatchB?.status === "ACTIVE",
"Batch B remains ACTIVE after return"
);

assert(
afterReturnProduct.stock === 2,
"Product.stock became 2 after return"
);

// ===========================================================================
// 13. VERIFY NET TOTAL AND PROFIT
// ===========================================================================

console.log("");
console.log("13. VERIFYING NET ORDER TOTAL AND PROFIT");
console.log("------------------------------------------------------------------------------");

/*

* Gross:
* 4 × 300 = 1200
*
* One unit returned:
* Net revenue = 900
*
* Net cost:
* 2 × 100 + 1 × 120 = 320
*
* Net profit:
* 900 - 320 = 580
  */

assert(
afterReturnOrder.total === 900,
"Net order total became 900"
);

assert(
afterReturnOrder.profit === 580,
"Net order profit became 580"
);

assert(
afterReturnOrder.status === "PARTIAL_RETURN",
"Order status became PARTIAL_RETURN"
);

// ===========================================================================
// 14. VERIFY RETURN MOVEMENT
// ===========================================================================

console.log("");
console.log("14. VERIFYING RETURN MOVEMENT");
console.log("------------------------------------------------------------------------------");

const returnMovements = await prisma.movement.findMany({
where: {
productId,
type: "RETURN",
},
orderBy: {
id: "asc",
},
});

console.log(
`RETURN movements found=${returnMovements.length}`
);

for (const movement of returnMovements) {
console.log(
`Movement #${movement.id} | ` +
`quantity=${movement.quantity} | ` +
`${movement.comment ?? ""}`
);
}

assert(
returnMovements.length === 1,
"Exactly one RETURN movement was created"
);

assert(
returnMovements[0].quantity === 1,
"RETURN movement quantity is +1"
);

assert(
returnMovements[0].comment === `Возврат из заказа №${orderId}`,
"RETURN movement comment matches the API format"
);

// ===========================================================================
// 15. DELETE ORDER THROUGH REAL API
// ===========================================================================

console.log("");
console.log("15. DELETING ORDER THROUGH DELETE API");
console.log("------------------------------------------------------------------------------");

const deleteResult = await apiJson(
`http://localhost:3000/api/orders/${orderId}`,
{
method: "DELETE",
}
);

console.log(
`HTTP ${deleteResult.response.status}`
);

console.log(
`Response=${JSON.stringify(deleteResult.data)}`
);

assert(
deleteResult.response.status === 200,
"DELETE /api/orders/:id returned HTTP 200"
);

// ===========================================================================
// 16. VERIFY ORDER COMPLETELY DELETED
// ===========================================================================

console.log("");
console.log("16. VERIFYING COMPLETE ORDER DELETION");
console.log("------------------------------------------------------------------------------");

const deletedOrder = await prisma.order.findUnique({
where: {
id: orderId,
},
});

assert(
deletedOrder === null,
"Order was completely deleted"
);

const remainingItems = await prisma.orderItem.count({
where: {
orderId,
},
});

assert(
remainingItems === 0,
"No OrderItem remains"
);

const remainingOrderBatches = await prisma.orderBatch.count({
where: {
orderItem: {
orderId,
},
},
});

assert(
remainingOrderBatches === 0,
"No OrderBatch remains"
);

const remainingReturnBatches = await prisma.returnBatch.count({
where: {
OrderItem: {
orderId,
},
},
});

assert(
remainingReturnBatches === 0,
"No ReturnBatch remains"
);

// ===========================================================================
// 17. VERIFY COMPLETE STOCK RESTORATION
// ===========================================================================

console.log("");
console.log("17. VERIFYING COMPLETE STOCK RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredProduct = await prisma.product.findUnique({
where: {
id: productId,
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
restoredProduct !== null,
"Test product still exists"
);

const restoredA = restoredProduct.batches.find(
(batch) => batch.id === batchA.id
);

const restoredB = restoredProduct.batches.find(
(batch) => batch.id === batchB.id
);

assert(
restoredA?.quantity === 2,
"Batch A restored to original quantity 2"
);

assert(
restoredA?.status === "ACTIVE",
"Batch A restored to ACTIVE"
);

assert(
restoredB?.quantity === 3,
"Batch B restored to original quantity 3"
);

assert(
restoredB?.status === "ACTIVE",
"Batch B restored to ACTIVE"
);

assert(
restoredProduct.stock === 5,
"Product.stock restored to 5"
);

const restoredBatchStock =
restoredProduct.batches.reduce(
(sum, batch) => sum + batch.quantity,
0
);

assert(
restoredBatchStock === 5,
"Restored batch total is 5"
);

assert(
restoredProduct.stock === restoredBatchStock,
"Restored Product.stock equals batch total"
);

// ===========================================================================
// 18. VERIFY DELETE RESTORATION MOVEMENTS
// ===========================================================================

console.log("");
console.log("18. VERIFYING DELETE RESTORATION MOVEMENTS");
console.log("------------------------------------------------------------------------------");

const deleteReturnMovements = await prisma.movement.findMany({
where: {
productId,
type: "RETURN",
comment: {
contains: `Возврат после удаления заказа №${orderId}`,
},
},
orderBy: {
id: "asc",
},
});

console.log(
`DELETE RETURN movements found=${deleteReturnMovements.length}`
);

for (const movement of deleteReturnMovements) {
console.log(
`Movement #${movement.id} | ` +
`quantity=${movement.quantity} | ` +
`${movement.comment ?? ""}`
);
}

assert(
deleteReturnMovements.length === 2,
"DELETE created two restoration RETURN movements"
);

const deleteReturnQuantity =
deleteReturnMovements.reduce(
(sum, movement) => sum + movement.quantity,
0
);

/*

* IMPORTANT:
*
* The original sale was 4 units.
* One unit was already returned before DELETE.
*
* Therefore DELETE must restore only:
*
* 4 sold - 1 already returned = 3 units
*
* The expected restoration is:
*
* Batch A = +2
* Batch B = +1
* Total   = +3
  */

const soldQuantity = createdItem.quantity;
const alreadyReturnedQuantity = returnedItem.returned;
const expectedDeleteRestoration =
soldQuantity - alreadyReturnedQuantity;

console.log("");
console.log(`Sold quantity=${soldQuantity}`);
console.log(
`Already returned before DELETE=${alreadyReturnedQuantity}`
);
console.log(
`Expected DELETE restoration=${expectedDeleteRestoration}`
);
console.log(
`Actual DELETE restoration=${deleteReturnQuantity}`
);

assert(
deleteReturnQuantity === expectedDeleteRestoration,
`DELETE restoration quantity is ${expectedDeleteRestoration}`
);

// ---------------------------------------------------------------------------
// Verify each restoration movement.
// ---------------------------------------------------------------------------

const restoredByBatch = new Map();

for (const movement of deleteReturnMovements) {
const match = movement.comment?.match(
/Партия №(\d+)$/
);


assert(
  match !== null,
  `DELETE restoration movement #${movement.id} contains batch id`
);

const movementBatchId = Number(match[1]);

restoredByBatch.set(
  movementBatchId,
  (restoredByBatch.get(movementBatchId) ?? 0) +
    movement.quantity
);


}

assert(
restoredByBatch.get(batchA.id) === 2,
`DELETE restored 2 units to Batch #${batchA.id}`
);

assert(
restoredByBatch.get(batchB.id) === 1,
`DELETE restored 1 unit to Batch #${batchB.id}`
);

// ===========================================================================
// 19. VERIFY TOTAL MOVEMENT BALANCE
// ===========================================================================

console.log("");
console.log("19. VERIFYING TEST MOVEMENT BALANCE");
console.log("------------------------------------------------------------------------------");

const testMovements = await prisma.movement.findMany({
where: {
productId,
},
orderBy: {
id: "asc",
},
});

for (const movement of testMovements) {
console.log(
`Movement #${movement.id} | ` +
`${movement.type} | ` +
`quantity=${movement.quantity} | ` +
`${movement.comment ?? ""}`
);
}

const movementBalance = testMovements.reduce(
(sum, movement) => sum + movement.quantity,
0
);

/*

* Movement sequence:
*
* SALE:
* -4
*
* RETURN:
* +1
*
* DELETE restoration:
* +3
*
* Total:
* 0
*
* This is the correct final movement balance for the isolated
* lifecycle test because the product returned to its original
* physical stock of 5.
  */

assert(
movementBalance === 0,
"Test movement net balance is 0"
);

// ===========================================================================
// 20. VERIFY REPEATED DELETE
// ===========================================================================

console.log("");
console.log("20. VERIFYING REPEATED DELETE");
console.log("------------------------------------------------------------------------------");

const secondDelete = await apiJson(
`http://localhost:3000/api/orders/${orderId}`,
{
method: "DELETE",
}
);

console.log(
`HTTP ${secondDelete.response.status}`
);

console.log(
`Response=${JSON.stringify(secondDelete.data)}`
);

assert(
secondDelete.response.status === 404,
"Repeated DELETE returned HTTP 404"
);

// ===========================================================================
// 21. FINAL RESULT
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("ORDER LIFECYCLE V1 PASSED");
console.log("==============================================================================");
console.log("");
console.log("Verified:");
console.log("🟢 Real POST /api/orders");
console.log("🟢 FEFO/FIFO batch allocation");
console.log("🟢 OrderBatch creation");
console.log("🟢 Purchase cost snapshots");
console.log("🟢 Product.stock after sale");
console.log("🟢 SALE movement");
console.log("🟢 Gross profit");
console.log("🟢 Real POST /return");
console.log("🟢 LIFO return allocation");
console.log("🟢 ReturnBatch creation");
console.log("🟢 Product.stock after return");
console.log("🟢 NET order total");
console.log("🟢 NET order profit");
console.log("🟢 PARTIAL_RETURN status");
console.log("🟢 RETURN movement");
console.log("🟢 Real DELETE /api/orders/:id");
console.log("🟢 Complete order cleanup");
console.log("🟢 Complete batch restoration");
console.log("🟢 Product.stock restoration");
console.log("🟢 DELETE restoration movements");
console.log("🟢 Correct restoration quantity after prior return");
console.log("🟢 Movement balance returns to zero");
console.log("🟢 Repeated DELETE → 404");
console.log("");
console.log("The complete order lifecycle passed.");
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 ORDER LIFECYCLE V1 FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await cleanup();


try {
  await verifyCleanup();
} catch (error) {
  console.error("");
  console.error("🔴 FINAL CLEANUP VERIFICATION FAILED");
  console.error(error);
  process.exitCode = 1;
}

await prisma.$disconnect();


});
