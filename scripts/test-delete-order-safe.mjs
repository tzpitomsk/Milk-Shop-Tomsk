import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_BARCODE = `DELETE_TEST_${Date.now()}`;

let testProductId = null;
let testOrderId = null;
let testMovementIds = [];
let testBatchIds = [];

function assert(condition, message) {
if (!condition) {
throw new Error(`ASSERTION FAILED: ${message}`);
}
}

function log(message) {
console.log(`  ${message}`);
}

async function cleanup() {
console.log("");
console.log("CLEANUP");
console.log("------------------------------------------------------------------------------");

try {
// -------------------------------------------------------------------------
// Delete test movements created by DELETE API.
// -------------------------------------------------------------------------


if (testMovementIds.length > 0) {
  await prisma.movement.deleteMany({
    where: {
      id: {
        in: testMovementIds,
      },
    },
  });

  log(`Deleted test movements: ${testMovementIds.join(", ")}`);
}

// -------------------------------------------------------------------------
// If the order somehow survived, remove it.
// Cascades will remove OrderItem / OrderBatch / ReturnBatch.
// -------------------------------------------------------------------------

if (testOrderId) {
  await prisma.order.deleteMany({
    where: {
      id: testOrderId,
    },
  });

  log(`Deleted test order if still present: #${testOrderId}`);
}

// -------------------------------------------------------------------------
// Delete remaining test batches explicitly.
// -------------------------------------------------------------------------

if (testBatchIds.length > 0) {
  await prisma.batch.deleteMany({
    where: {
      id: {
        in: testBatchIds,
      },
    },
  });

  log(`Deleted test batches: ${testBatchIds.join(", ")}`);
}

// -------------------------------------------------------------------------
// Delete test product.
// -------------------------------------------------------------------------

if (testProductId) {
  await prisma.product.deleteMany({
    where: {
      id: testProductId,
    },
  });

  log(`Deleted test product if still present: #${testProductId}`);
}

// -------------------------------------------------------------------------
// Final safety cleanup by unique barcode.
// -------------------------------------------------------------------------

await prisma.product.deleteMany({
  where: {
    barcode: TEST_BARCODE,
  },
});

log("Final barcode cleanup completed");


} catch (error) {
console.error("");
console.error("🔴 CLEANUP ERROR");
console.error(error);
}
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("SAFE DELETE /api/orders/[id] INTEGRATION TEST V2");
console.log("==============================================================================");
console.log("");
console.log(`API: ${BASE_URL}/api/orders/[id]`);
console.log(`Test barcode: ${TEST_BARCODE}`);
console.log("");
console.log("IMPORTANT:");
console.log("- This test creates isolated temporary records.");
console.log("- It does not use any existing Product.");
console.log("- It does not use any existing Order.");
console.log("- It does not modify real business data.");
console.log("- Test records are removed automatically.");
console.log("");

// ===========================================================================
// 1. CREATE ISOLATED TEST PRODUCT
// ===========================================================================

console.log("1. CREATE ISOLATED TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
data: {
name: "DELETE API INTEGRATION TEST",
unit: "шт",
price: 300,
cost: 100,
stock: 5,
barcode: TEST_BARCODE,
},
});

testProductId = product.id;

log(`Product #${product.id}`);
log(`Barcode=${product.barcode}`);
log(`Initial Product.stock=${product.stock}`);

assert(
product.barcode === TEST_BARCODE,
"test product barcode was not created correctly"
);

console.log("");

// ===========================================================================
// 2. CREATE TEST BATCHES
// ===========================================================================

console.log("2. CREATE TEST BATCHES");
console.log("------------------------------------------------------------------------------");

const now = new Date();

const expiredDate = new Date(now);
expiredDate.setDate(expiredDate.getDate() - 10);

const futureExpiryDate = new Date(now);
futureExpiryDate.setDate(futureExpiryDate.getDate() + 30);

const expiredBatch = await prisma.batch.create({
data: {
quantity: 2,
purchaseCost: 100,
receivedAt: new Date(
now.getTime() - 30 * 24 * 60 * 60 * 1000
),
expiryDate: expiredDate,
status: "EXPIRED",
productId: testProductId,
},
});

const activeBatch = await prisma.batch.create({
data: {
quantity: 0,
purchaseCost: 120,
receivedAt: new Date(
now.getTime() - 5 * 24 * 60 * 60 * 1000
),
expiryDate: futureExpiryDate,
status: "EMPTY",
productId: testProductId,
},
});

testBatchIds = [expiredBatch.id, activeBatch.id];

log(
`Expired Batch #${expiredBatch.id}: current=${expiredBatch.quantity}, status=${expiredBatch.status}`
);

log(
`Active Batch #${activeBatch.id}: current=${activeBatch.quantity}, status=${activeBatch.status}`
);

assert(
expiredBatch.status === "EXPIRED",
"expired test batch must start EXPIRED"
);

assert(
expiredBatch.quantity === 2,
"expired batch must start with quantity 2"
);

assert(
activeBatch.status === "EMPTY",
"active test batch must start EMPTY"
);

assert(
activeBatch.quantity === 0,
"active batch must start with quantity 0"
);

// Product stock represents physical stock.
const initialPhysicalStock =
expiredBatch.quantity + activeBatch.quantity;

await prisma.product.update({
where: {
id: testProductId,
},
data: {
stock: initialPhysicalStock,
},
});

log(`Test Product.stock synchronized to ${initialPhysicalStock}`);

console.log("");

// ===========================================================================
// 3. CREATE TEST ORDER
// ===========================================================================

console.log("3. CREATE TEST ORDER");
console.log("------------------------------------------------------------------------------");

const order = await prisma.order.create({
data: {
total: 1500,
profit: 0,
status: "PARTIAL_RETURN",
items: {
create: {
quantity: 5,
returned: 1,
price: 300,
productId: testProductId,
},
},
},
include: {
items: true,
},
});

testOrderId = order.id;

const orderItem = order.items[0];

assert(orderItem, "test OrderItem was not created");

assert(
orderItem.quantity === 5,
"test OrderItem quantity must be 5"
);

assert(
orderItem.returned === 1,
"test OrderItem returned must be 1"
);

log(`Order #${order.id}`);
log(`OrderItem #${orderItem.id}`);
log(`OrderItem quantity=${orderItem.quantity}`);
log(`OrderItem returned=${orderItem.returned}`);

console.log("");

// ===========================================================================
// 4. CREATE TEST ORDERBATCH LINKS
// ===========================================================================

console.log("4. CREATE TEST ORDERBATCH LINKS");
console.log("------------------------------------------------------------------------------");

/*

* Historical sale:
*
* Expired batch:
* originally sold = 3
* already returned = 1
* current quantity = 2
*
* Active batch:
* originally sold = 2
* already returned = 0
* current quantity = 0
*
* Total sold = 5
* Total returned = 1
*
* DELETE must restore:
*
* Expired batch:
* 2 + (3 - 1) = 4
*
* Active batch:
* 0 + 2 = 2
*
* Final Product.stock = 4 + 2 = 6
  */

const expiredOrderBatch = await prisma.orderBatch.create({
data: {
quantity: 3,
purchaseCost: 100,
orderItemId: orderItem.id,
batchId: expiredBatch.id,
},
});

const activeOrderBatch = await prisma.orderBatch.create({
data: {
quantity: 2,
purchaseCost: 120,
orderItemId: orderItem.id,
batchId: activeBatch.id,
},
});

log(
`OrderBatch #${expiredOrderBatch.id}: Batch #${expiredBatch.id}, quantity=3`
);

log(
`OrderBatch #${activeOrderBatch.id}: Batch #${activeBatch.id}, quantity=2`
);

assert(
expiredOrderBatch.quantity + activeOrderBatch.quantity ===
orderItem.quantity,
"OrderBatch total must equal OrderItem quantity"
);

console.log("");

// ===========================================================================
// 5. CREATE TEST RETURNBATCH
// ===========================================================================

console.log("5. CREATE TEST RETURNBATCH");
console.log("------------------------------------------------------------------------------");

const returnBatch = await prisma.returnBatch.create({
data: {
quantity: 1,
orderItemId: orderItem.id,
batchId: expiredBatch.id,
},
});

log(
`ReturnBatch #${returnBatch.id}: Batch #${expiredBatch.id}, quantity=1`
);

assert(
returnBatch.quantity === orderItem.returned,
"ReturnBatch quantity must equal OrderItem.returned"
);

console.log("");

// ===========================================================================
// 6. VERIFY PRE-DELETE STATE
// ===========================================================================

console.log("6. VERIFY PRE-DELETE STATE");
console.log("------------------------------------------------------------------------------");

const beforeDeleteExpiredBatch = await prisma.batch.findUnique({
where: {
id: expiredBatch.id,
},
});

const beforeDeleteActiveBatch = await prisma.batch.findUnique({
where: {
id: activeBatch.id,
},
});

const beforeDeleteProduct = await prisma.product.findUnique({
where: {
id: testProductId,
},
});

assert(
beforeDeleteExpiredBatch,
"expired batch must exist before DELETE"
);

assert(
beforeDeleteActiveBatch,
"active batch must exist before DELETE"
);

assert(
beforeDeleteProduct,
"test product must exist before DELETE"
);

assert(
beforeDeleteExpiredBatch.quantity === 2,
"expired batch must have current quantity 2 before DELETE"
);

assert(
beforeDeleteExpiredBatch.status === "EXPIRED",
"expired batch must be EXPIRED before DELETE"
);

assert(
beforeDeleteActiveBatch.quantity === 0,
"active batch must have current quantity 0 before DELETE"
);

assert(
beforeDeleteActiveBatch.status === "EMPTY",
"active batch must be EMPTY before DELETE"
);

assert(
beforeDeleteProduct.stock === 2,
"Product.stock must equal physical stock 2 before DELETE"
);

log(
`Expired batch before DELETE: qty=${beforeDeleteExpiredBatch.quantity}`
);

log(
`Expired batch before DELETE: status=${beforeDeleteExpiredBatch.status}`
);

log(
`Active batch before DELETE: qty=${beforeDeleteActiveBatch.quantity}`
);

log(
`Active batch before DELETE: status=${beforeDeleteActiveBatch.status}`
);

log(
`Product.stock before DELETE: ${beforeDeleteProduct.stock}`
);

console.log("");

// ===========================================================================
// 7. CALL REAL DELETE API
// ===========================================================================

console.log("7. CALL REAL DELETE API");
console.log("------------------------------------------------------------------------------");

const deleteUrl = `${BASE_URL}/api/orders/${testOrderId}`;

log(`DELETE ${deleteUrl}`);

let response;

try {
response = await fetch(deleteUrl, {
method: "DELETE",
headers: {
"Content-Type": "application/json",
},
});
} catch (error) {
throw new Error(
`Could not connect to ${deleteUrl}. Make sure Next.js is running with "npm run dev". Original error: ${error.message}`
);
}

const responseText = await response.text();

log(`HTTP ${response.status}`);
log(`Response: ${responseText}`);

assert(
response.ok,
`DELETE API returned HTTP ${response.status}: ${responseText}`
);

console.log("");

// ===========================================================================
// 8. VERIFY ORDER WAS DELETED
// ===========================================================================

console.log("8. VERIFY ORDER WAS DELETED");
console.log("------------------------------------------------------------------------------");

const deletedOrder = await prisma.order.findUnique({
where: {
id: testOrderId,
},
});

assert(
deletedOrder === null,
`Order #${testOrderId} still exists after DELETE`
);

log(`Order #${testOrderId} no longer exists`);

const remainingOrderItems = await prisma.orderItem.findMany({
where: {
orderId: testOrderId,
},
});

assert(
remainingOrderItems.length === 0,
"OrderItems belonging to deleted order must be gone"
);

const remainingOrderBatches = await prisma.orderBatch.findMany({
where: {
OrderItem: {
orderId: testOrderId,
},
},
});

assert(
remainingOrderBatches.length === 0,
"OrderBatch records belonging to deleted order must be gone"
);

const remainingReturnBatches = await prisma.returnBatch.findMany({
where: {
OrderItem: {
orderId: testOrderId,
},
},
});

assert(
remainingReturnBatches.length === 0,
"ReturnBatch records belonging to deleted order must be gone"
);

log("OrderItem records deleted");
log("OrderBatch records deleted");
log("ReturnBatch records deleted");

console.log("");

// ===========================================================================
// 9. VERIFY EXPIRED BATCH RESTORATION
// ===========================================================================

console.log("9. VERIFY EXPIRED BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredExpiredBatch = await prisma.batch.findUnique({
where: {
id: expiredBatch.id,
},
});

assert(
restoredExpiredBatch,
"expired batch must still exist after DELETE"
);

/*

* Current quantity = 2
* Originally sold = 3
* Already returned = 1
*
* Remaining sale quantity to restore = 2
*
* Expected = 4
  */

assert(
restoredExpiredBatch.quantity === 4,
`expired batch quantity must be 4 after DELETE, got ${restoredExpiredBatch.quantity}`
);

assert(
restoredExpiredBatch.status === "EXPIRED",
`expired batch must remain EXPIRED after DELETE, got ${restoredExpiredBatch.status}`
);

assert(
restoredExpiredBatch.productId === testProductId,
"expired batch must still belong to test product"
);

log(
`Batch #${restoredExpiredBatch.id}: quantity restored to ${restoredExpiredBatch.quantity}`
);

log(
`Batch #${restoredExpiredBatch.id}: status remains ${restoredExpiredBatch.status}`
);

console.log("");

// ===========================================================================
// 10. VERIFY ACTIVE BATCH RESTORATION
// ===========================================================================

console.log("10. VERIFY ACTIVE BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredActiveBatch = await prisma.batch.findUnique({
where: {
id: activeBatch.id,
},
});

assert(
restoredActiveBatch,
"active batch must still exist after DELETE"
);

/*

* Current quantity = 0
* Originally sold = 2
* Already returned = 0
*
* Expected = 2
  */

assert(
restoredActiveBatch.quantity === 2,
`active batch quantity must be 2 after DELETE, got ${restoredActiveBatch.quantity}`
);

assert(
restoredActiveBatch.status === "ACTIVE",
`active batch must become ACTIVE after DELETE, got ${restoredActiveBatch.status}`
);

assert(
restoredActiveBatch.productId === testProductId,
"active batch must still belong to test product"
);

log(
`Batch #${restoredActiveBatch.id}: quantity restored to ${restoredActiveBatch.quantity}`
);

log(
`Batch #${restoredActiveBatch.id}: status restored to ${restoredActiveBatch.status}`
);

console.log("");

// ===========================================================================
// 11. VERIFY PRODUCT STOCK
// ===========================================================================

console.log("11. VERIFY PRODUCT STOCK");
console.log("------------------------------------------------------------------------------");

const restoredProduct = await prisma.product.findUnique({
where: {
id: testProductId,
},
include: {
batches: true,
},
});

assert(
restoredProduct,
"test product must still exist after DELETE"
);

const calculatedBatchStock = restoredProduct.batches.reduce(
(sum, batch) => sum + batch.quantity,
0
);

assert(
calculatedBatchStock === 6,
`sum of restored test batches must equal 6, got ${calculatedBatchStock}`
);

assert(
restoredProduct.stock === 6,
`Product.stock must be 6 after DELETE, got ${restoredProduct.stock}`
);

assert(
restoredProduct.stock === calculatedBatchStock,
"Product.stock must equal sum of Batch.quantity after DELETE"
);

log(`Expired batch quantity=${restoredExpiredBatch.quantity}`);
log(`Active batch quantity=${restoredActiveBatch.quantity}`);
log(`Calculated batch stock=${calculatedBatchStock}`);
log(`Product.stock=${restoredProduct.stock}`);

console.log("");

// ===========================================================================
// 12. VERIFY RETURN MOVEMENTS
// ===========================================================================

console.log("12. VERIFY RETURN MOVEMENTS");
console.log("------------------------------------------------------------------------------");

const movements = await prisma.movement.findMany({
where: {
productId: testProductId,
type: "RETURN",
comment: {
contains: `№${testOrderId}`,
},
},
orderBy: {
id: "asc",
},
});

assert(
movements.length === 2,
`DELETE must create exactly 2 RETURN movements, got ${movements.length}`
);

const movementByBatch = new Map(
movements.map((movement) => {
const match = movement.comment?.match(/Партия №(\d+)/);


  assert(
    match,
    `RETURN movement #${movement.id} must contain a batch number`
  );

  return [Number(match[1]), movement];
})


);

const expiredMovement = movementByBatch.get(expiredBatch.id);
const activeMovement = movementByBatch.get(activeBatch.id);

assert(
expiredMovement,
`RETURN movement for expired Batch #${expiredBatch.id} not found`
);

assert(
activeMovement,
`RETURN movement for active Batch #${activeBatch.id} not found`
);

assert(
expiredMovement.quantity === 2,
`expired batch RETURN movement must be 2, got ${expiredMovement.quantity}`
);

assert(
activeMovement.quantity === 2,
`active batch RETURN movement must be 2, got ${activeMovement.quantity}`
);

for (const movement of movements) {
assert(
movement.quantity > 0,
`RETURN movement #${movement.id} must have positive quantity`
);


testMovementIds.push(movement.id);

log(
  `Movement #${movement.id}: type=${movement.type}, quantity=${movement.quantity}, comment="${movement.comment}"`
);


}

const totalReturnMovementQuantity = movements.reduce(
(sum, movement) => sum + movement.quantity,
0
);

assert(
totalReturnMovementQuantity === 4,
`total DELETE RETURN movement quantity must be 4, got ${totalReturnMovementQuantity}`
);

log(
`Total quantity restored through RETURN movements=${totalReturnMovementQuantity}`
);

console.log("");

// ===========================================================================
// 13. VERIFY REPEATED DELETE RETURNS 404
// ===========================================================================

console.log("13. VERIFY REPEATED DELETE");
console.log("------------------------------------------------------------------------------");

let secondDeleteResponse;

try {
secondDeleteResponse = await fetch(deleteUrl, {
method: "DELETE",
headers: {
"Content-Type": "application/json",
},
});
} catch (error) {
throw new Error(
`Could not perform second DELETE request. Original error: ${error.message}`
);
}

const secondDeleteText = await secondDeleteResponse.text();

log(`Second DELETE HTTP ${secondDeleteResponse.status}`);
log(`Second DELETE response: ${secondDeleteText}`);

assert(
secondDeleteResponse.status === 404,
`second DELETE must return HTTP 404, got ${secondDeleteResponse.status}`
);

log("Repeated DELETE correctly returns 404");

console.log("");

// ===========================================================================
// 14. VERIFY NO ORPHANED TEST DATA
// ===========================================================================

console.log("14. VERIFY NO ORPHANED TEST DATA");
console.log("------------------------------------------------------------------------------");

const orphanedOrderItems = await prisma.orderItem.count({
where: {
orderId: testOrderId,
},
});

assert(
orphanedOrderItems === 0,
`found ${orphanedOrderItems} orphaned OrderItem records`
);

const orphanedOrderBatches = await prisma.orderBatch.count({
where: {
OrderItem: {
orderId: testOrderId,
},
},
});

assert(
orphanedOrderBatches === 0,
`found ${orphanedOrderBatches} orphaned OrderBatch records`
);

const orphanedReturnBatches = await prisma.returnBatch.count({
where: {
OrderItem: {
orderId: testOrderId,
},
},
});

assert(
orphanedReturnBatches === 0,
`found ${orphanedReturnBatches} orphaned ReturnBatch records`
);

log("No orphaned OrderItem records");
log("No orphaned OrderBatch records");
log("No orphaned ReturnBatch records");

console.log("");

// ===========================================================================
// 15. FINAL RESULT BEFORE CLEANUP
// ===========================================================================

console.log("15. FINAL TEST RESULT");
console.log("------------------------------------------------------------------------------");

console.log("🟢 DELETE /api/orders/[id] PASSED ALL FUNCTIONAL CHECKS");
console.log("");

console.log("Verified:");
console.log("🟢 Order deleted");
console.log("🟢 OrderItem deleted");
console.log("🟢 OrderBatch deleted");
console.log("🟢 ReturnBatch deleted");
console.log("🟢 Expired batch quantity restored");
console.log("🟢 Expired batch remained EXPIRED");
console.log("🟢 Active batch quantity restored");
console.log("🟢 Active batch became ACTIVE");
console.log("🟢 Product.stock restored");
console.log("🟢 Product.stock equals sum of Batch.quantity");
console.log("🟢 Correct RETURN movement for expired batch");
console.log("🟢 Correct RETURN movement for active batch");
console.log("🟢 Repeated DELETE returns 404");
console.log("🟢 No orphaned order data");
console.log("");
}

main()
.catch((error) => {
console.error("");
console.error("🔴 DELETE API TEST FAILED");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await cleanup();
await prisma.$disconnect();
});