import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_BARCODE = `DELETE_TEST_V4_${Date.now()}`;

let testProductId = null;
let testOrderId = null;

function assert(condition, message) {
if (!condition) {
throw new Error(`ASSERTION FAILED: ${message}`);
}

console.log(`🟢 ${message}`);
}

async function cleanup() {
console.log("");
console.log("==============================================================================");
console.log("V4 CLEANUP");
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

const productId = product.id;

console.log(
  `Found test Product #${productId}`
);

// -------------------------------------------------------------------------
// Delete any remaining orders belonging to this isolated test product.
// -------------------------------------------------------------------------

const orders = await prisma.order.findMany({
  where: {
    items: {
      some: {
        productId,
      },
    },
  },
  select: {
    id: true,
  },
});

for (const order of orders) {
  console.log(
    `Deleting remaining test Order #${order.id}`
  );

  await prisma.order.delete({
    where: {
      id: order.id,
    },
  });
}

// -------------------------------------------------------------------------
// Delete movements before deleting Product because Movement has FK.
// -------------------------------------------------------------------------

const movements = await prisma.movement.findMany({
  where: {
    productId,
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
  console.log(
    `Deleting ${movements.length} remaining Movement record(s):`
  );

  for (const movement of movements) {
    console.log(
      `  Movement #${movement.id} | ${movement.type} | ` +
        `quantity=${movement.quantity} | ` +
        `${movement.comment ?? ""}`
    );
  }

  await prisma.movement.deleteMany({
    where: {
      productId,
    },
  });
}

// -------------------------------------------------------------------------
// Delete any remaining batches.
// -------------------------------------------------------------------------

const batches = await prisma.batch.findMany({
  where: {
    productId,
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
  console.log(
    `Deleting ${batches.length} remaining Batch record(s):`
  );

  for (const batch of batches) {
    console.log(
      `  Batch #${batch.id} | quantity=${batch.quantity} | ` +
        `status=${batch.status}`
    );
  }

  await prisma.batch.deleteMany({
    where: {
      productId,
    },
  });
}

// -------------------------------------------------------------------------
// Delete the isolated test product.
// -------------------------------------------------------------------------

await prisma.product.delete({
  where: {
    id: productId,
  },
});

console.log(
  `🟢 Test Product #${productId} deleted.`
);


} catch (error) {
console.error("");
console.error("🔴 CLEANUP FAILED");
console.error(error);
}
}

async function verifyNoTestData() {
const product = await prisma.product.findUnique({
where: {
barcode: TEST_BARCODE,
},
include: {
batches: true,
movements: true,
},
});

if (product) {
throw new Error(
`FINAL CLEANUP FAILED: Product #${product.id} still exists`
);
}

console.log("");
console.log("🟢 FINAL CLEANUP VERIFIED");
console.log("Test Product does not exist.");
console.log("No test batches remain.");
console.log("No test movements remain.");
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("DELETE API INTEGRATION TEST V4");
console.log("==============================================================================");
console.log("REALISTIC SALE + RETURN HISTORY");
console.log("STRICTLY ISOLATED TEST DATA");
console.log("");

// ===========================================================================
// 1. CREATE TEST PRODUCT
// ===========================================================================

console.log("1. CREATING TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
data: {
name: "DELETE API INTEGRATION TEST V4",
unit: "шт",
price: 300,
cost: 100,
stock: 1,
barcode: TEST_BARCODE,
},
});

testProductId = product.id;

console.log(`Product #${product.id}`);
console.log(`Barcode=${TEST_BARCODE}`);
console.log("");

// ===========================================================================
// 2. CREATE TEST BATCHES
// ===========================================================================

console.log("2. CREATING TEST BATCHES");
console.log("------------------------------------------------------------------------------");

const now = new Date();

const expiredDate = new Date(now);
expiredDate.setDate(expiredDate.getDate() - 1);

const activeExpiryDate = new Date(now);
activeExpiryDate.setDate(activeExpiryDate.getDate() + 30);

const expiredBatch = await prisma.batch.create({
data: {
quantity: 1,
purchaseCost: 100,
receivedAt: new Date(
now.getTime() - 7 * 24 * 60 * 60 * 1000
),
expiryDate: expiredDate,
status: "EXPIRED",
productId: product.id,
},
});

const activeBatch = await prisma.batch.create({
data: {
quantity: 0,
purchaseCost: 120,
receivedAt: new Date(
now.getTime() - 2 * 24 * 60 * 60 * 1000
),
expiryDate: activeExpiryDate,
status: "EMPTY",
productId: product.id,
},
});

console.log(
`Expired Batch #${expiredBatch.id} | ` +
`quantity=${expiredBatch.quantity} | ` +
`status=${expiredBatch.status}`
);

console.log(
`Active Batch #${activeBatch.id} | ` +
`quantity=${activeBatch.quantity} | ` +
`status=${activeBatch.status}`
);

// ===========================================================================
// 3. CREATE TEST ORDER
// ===========================================================================

console.log("");
console.log("3. CREATING TEST ORDER");
console.log("------------------------------------------------------------------------------");

const order = await prisma.order.create({
data: {
total: 1500,
profit: 900,
status: "PARTIAL_RETURN",
items: {
create: {
quantity: 5,
returned: 1,
price: 300,
productId: product.id,
},
},
},
include: {
items: true,
},
});

testOrderId = order.id;

const orderItem = order.items[0];

console.log(`Order #${order.id}`);
console.log(`OrderItem #${orderItem.id}`);

// ===========================================================================
// 4. CREATE ORIGINAL ORDERBATCH HISTORY
// ===========================================================================

console.log("");
console.log("4. CREATING ORIGINAL ORDERBATCH HISTORY");
console.log("------------------------------------------------------------------------------");

const orderBatchExpired = await prisma.orderBatch.create({
data: {
quantity: 3,
purchaseCost: 100,
orderItemId: orderItem.id,
batchId: expiredBatch.id,
},
});

const orderBatchActive = await prisma.orderBatch.create({
data: {
quantity: 2,
purchaseCost: 120,
orderItemId: orderItem.id,
batchId: activeBatch.id,
},
});

console.log(
`OrderBatch #${orderBatchExpired.id} → ` +
`Batch #${expiredBatch.id} qty=3`
);

console.log(
`OrderBatch #${orderBatchActive.id} → ` +
`Batch #${activeBatch.id} qty=2`
);

// ===========================================================================
// 5. CREATE RETURN HISTORY
// ===========================================================================

console.log("");
console.log("5. CREATING RETURN HISTORY");
console.log("------------------------------------------------------------------------------");

const returnBatch = await prisma.returnBatch.create({
data: {
quantity: 1,
orderItemId: orderItem.id,
batchId: expiredBatch.id,
},
});

console.log(
`ReturnBatch #${returnBatch.id} → ` +
`Batch #${expiredBatch.id} qty=1`
);

// ===========================================================================
// 6. SIMULATE CURRENT PHYSICAL STATE
// ===========================================================================

console.log("");
console.log("6. SIMULATING CURRENT PHYSICAL STATE");
console.log("------------------------------------------------------------------------------");

/*

* Historical sale:
*
* Batch #expired:
* original = 3
* sold     = 3
* returned = 1
* current  = 1
*
* Batch #active:
* original = 2
* sold     = 2
* returned = 0
* current  = 0
*
* Product stock:
* 1 + 0 = 1
*
* This is the state that must exist immediately BEFORE deleting
* the historical order.
  */

await prisma.batch.update({
where: {
id: expiredBatch.id,
},
data: {
quantity: 1,
status: "EXPIRED",
},
});

await prisma.batch.update({
where: {
id: activeBatch.id,
},
data: {
quantity: 0,
status: "EMPTY",
},
});

await prisma.product.update({
where: {
id: product.id,
},
data: {
stock: 1,
},
});

const currentExpired = await prisma.batch.findUnique({
where: {
id: expiredBatch.id,
},
});

const currentActive = await prisma.batch.findUnique({
where: {
id: activeBatch.id,
},
});

const currentProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

assert(
currentExpired?.quantity === 1,
"Current expired batch quantity is 1 before DELETE"
);

assert(
currentExpired?.status === "EXPIRED",
"Current expired batch status is EXPIRED before DELETE"
);

assert(
currentActive?.quantity === 0,
"Current active batch quantity is 0 before DELETE"
);

assert(
currentActive?.status === "EMPTY",
"Current active batch status is EMPTY before DELETE"
);

assert(
currentProduct?.stock === 1,
"Current Product.stock is 1 before DELETE"
);

// ===========================================================================
// 7. VERIFY HISTORICAL QUANTITIES
// ===========================================================================

console.log("");
console.log("7. VERIFYING HISTORICAL QUANTITIES");
console.log("------------------------------------------------------------------------------");

const orderBatchTotal =
orderBatchExpired.quantity +
orderBatchActive.quantity;

const returnBatchTotal = returnBatch.quantity;

assert(
orderBatchTotal === orderItem.quantity,
"OrderBatch quantities equal original OrderItem quantity"
);

assert(
returnBatchTotal === orderItem.returned,
"ReturnBatch quantities equal OrderItem.returned"
);

/*

* Current physical quantity after the historical sale + return:
*
* Expired batch:
* original stock = 3
* sold           = 3
* returned       = 1
* current        = 1
*
* Active batch:
* original stock = 2
* sold           = 2
* returned       = 0
* current        = 0
  */

const expectedExpiredCurrent =
orderBatchExpired.quantity -
orderBatchExpired.quantity +
returnBatch.quantity;

const expectedActiveCurrent =
orderBatchActive.quantity -
orderBatchActive.quantity;

assert(
currentExpired.quantity === expectedExpiredCurrent,
`Expired batch current quantity matches sale + return history (${expectedExpiredCurrent})`
);

assert(
currentActive.quantity === expectedActiveCurrent,
`Active batch current quantity matches sale history (${expectedActiveCurrent})`
);

assert(
currentProduct.stock ===
expectedExpiredCurrent + expectedActiveCurrent,
"Product.stock matches current physical batch quantities"
);


// ===========================================================================
// 8. CALL DELETE API
// ===========================================================================

console.log("");
console.log("8. CALLING DELETE API");
console.log("------------------------------------------------------------------------------");

const response = await fetch(
`http://localhost:3000/api/orders/${testOrderId}`,
{
method: "DELETE",
headers: {
"Content-Type": "application/json",
},
}
);

const responseText = await response.text();

console.log(`HTTP ${response.status}`);
console.log(`Response=${responseText}`);

assert(
response.status === 200,
"DELETE API returned HTTP 200"
);

// ===========================================================================
// 9. VERIFY ORDER REMOVAL
// ===========================================================================

console.log("");
console.log("9. VERIFYING ORDER REMOVAL");
console.log("------------------------------------------------------------------------------");

const deletedOrder = await prisma.order.findUnique({
where: {
id: testOrderId,
},
});

assert(
deletedOrder === null,
`Order #${testOrderId} was deleted`
);

const remainingOrderItems = await prisma.orderItem.count({
where: {
orderId: testOrderId,
},
});

assert(
remainingOrderItems === 0,
"All OrderItem records were removed"
);

const remainingOrderBatches = await prisma.orderBatch.count({
where: {
orderItem: {
orderId: testOrderId,
},
},
});

assert(
remainingOrderBatches === 0,
"All OrderBatch records were removed"
);

const remainingReturnBatches = await prisma.returnBatch.count({
where: {
OrderItem: {
orderId: testOrderId,
},
},
});

assert(
remainingReturnBatches === 0,
"All ReturnBatch records were removed"
);

// ===========================================================================
// 10. VERIFY EXPIRED BATCH RESTORATION
// ===========================================================================

console.log("");
console.log("10. VERIFYING EXPIRED BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredExpired = await prisma.batch.findUnique({
where: {
id: expiredBatch.id,
},
});

assert(
restoredExpired !== null,
"Expired batch still exists"
);

assert(
restoredExpired?.quantity === 3,
"Expired batch quantity restored to original 3"
);

assert(
restoredExpired?.status === "EXPIRED",
"Restored expired batch remains EXPIRED"
);

assert(
restoredExpired?.productId === product.id,
"Restored expired batch belongs to test product"
);

// ===========================================================================
// 11. VERIFY ACTIVE BATCH RESTORATION
// ===========================================================================

console.log("");
console.log("11. VERIFYING ACTIVE BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredActive = await prisma.batch.findUnique({
where: {
id: activeBatch.id,
},
});

assert(
restoredActive !== null,
"Active batch still exists"
);

assert(
restoredActive?.quantity === 2,
"Active batch quantity restored to original 2"
);

assert(
restoredActive?.status === "ACTIVE",
"Restored active batch is ACTIVE"
);

assert(
restoredActive?.productId === product.id,
"Restored active batch belongs to test product"
);

// ===========================================================================
// 12. VERIFY PRODUCT STOCK
// ===========================================================================

console.log("");
console.log("12. VERIFYING PRODUCT STOCK");
console.log("------------------------------------------------------------------------------");

const restoredProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
include: {
batches: true,
},
});

assert(
restoredProduct !== null,
"Test product exists before cleanup"
);

const batchStock = restoredProduct.batches.reduce(
(sum, batch) => sum + batch.quantity,
0
);

console.log(
`Product.stock=${restoredProduct.stock}`
);

console.log(
`Sum(Batch.quantity)=${batchStock}`
);

assert(
restoredProduct.stock === 5,
"Product.stock restored to original 5"
);

assert(
restoredProduct.stock === batchStock,
"Product.stock equals sum of Batch.quantity"
);

// ===========================================================================
// 13. VERIFY RETURN MOVEMENTS
// ===========================================================================

console.log("");
console.log("13. VERIFYING RETURN MOVEMENTS");
console.log("------------------------------------------------------------------------------");

const returnMovements = await prisma.movement.findMany({
where: {
productId: product.id,
type: "RETURN",
comment: {
contains: `заказа №${testOrderId}`,
},
},
orderBy: {
id: "asc",
},
});

console.log(
`Found ${returnMovements.length} RETURN movement(s)`
);

for (const movement of returnMovements) {
console.log(
`Movement #${movement.id} | ` +
`quantity=${movement.quantity} | ` +
`${movement.comment}`
);
}

assert(
returnMovements.length === 2,
"DELETE API created two RETURN movements"
);

const movementQuantity = returnMovements.reduce(
(sum, movement) => sum + movement.quantity,
0
);

assert(
movementQuantity === 4,
"RETURN movement quantities total 4"
);

const expiredMovement = returnMovements.find(
(movement) =>
movement.comment?.includes(
`Партия №${expiredBatch.id}`
)
);

const activeMovement = returnMovements.find(
(movement) =>
movement.comment?.includes(
`Партия №${activeBatch.id}`
)
);

assert(
expiredMovement?.quantity === 2,
"Expired batch RETURN movement quantity is 2"
);

assert(
activeMovement?.quantity === 2,
"Active batch RETURN movement quantity is 2"
);

// ===========================================================================
// 14. VERIFY REPEATED DELETE
// ===========================================================================

console.log("");
console.log("14. TESTING REPEATED DELETE");
console.log("------------------------------------------------------------------------------");

const secondResponse = await fetch(
`http://localhost:3000/api/orders/${testOrderId}`,
{
method: "DELETE",
headers: {
"Content-Type": "application/json",
},
}
);

const secondResponseText = await secondResponse.text();

console.log(
`HTTP ${secondResponse.status}`
);

console.log(
`Response=${secondResponseText}`
);

assert(
secondResponse.status === 404,
"Repeated DELETE returned HTTP 404"
);

// ===========================================================================
// 15. FINAL RESULT
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("V4 TEST PASSED");
console.log("==============================================================================");
console.log("");
console.log("Verified:");
console.log("🟢 Realistic sale state");
console.log("🟢 Existing historical return");
console.log("🟢 Order deleted");
console.log("🟢 OrderItem deleted");
console.log("🟢 OrderBatch deleted");
console.log("🟢 ReturnBatch deleted");
console.log("🟢 Expired batch restored to original quantity");
console.log("🟢 Expired batch remained EXPIRED");
console.log("🟢 Active batch restored to original quantity");
console.log("🟢 Active batch became ACTIVE");
console.log("🟢 Product.stock restored");
console.log("🟢 Product.stock == sum(Batch.quantity)");
console.log("🟢 RETURN movements created correctly");
console.log("🟢 Repeated DELETE returned 404");
console.log("");
console.log("DELETE API V4 integration test passed.");
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 V4 TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await cleanup();


try {
  await verifyNoTestData();
} catch (error) {
  console.error("");
  console.error("🔴 FINAL CLEANUP VERIFICATION FAILED");
  console.error(error);
  process.exitCode = 1;
}

await prisma.$disconnect();


});