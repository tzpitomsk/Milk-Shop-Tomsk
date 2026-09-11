import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_BARCODE = `DELETE_TEST_V3_${Date.now()}`;

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
console.log("V3 CLEANUP");
console.log("==============================================================================");

try {
// -------------------------------------------------------------------------
// 1. Find test product by unique barcode
// -------------------------------------------------------------------------


const product = await prisma.product.findUnique({
  where: {
    barcode: TEST_BARCODE,
  },
});

if (!product) {
  console.log("No test product found. Nothing to clean.");
  return;
}

console.log(`Found test Product #${product.id}`);

const productId = product.id;

// -------------------------------------------------------------------------
// 2. Find any remaining test orders
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
  console.log(`Deleting remaining test Order #${order.id}`);

  await prisma.order.delete({
    where: {
      id: order.id,
    },
  });
}

// -------------------------------------------------------------------------
// 3. Delete remaining movements for the isolated test product
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
});

if (movements.length > 0) {
  console.log(
    `Deleting ${movements.length} remaining Movement record(s):`
  );

  for (const movement of movements) {
    console.log(
      `  Movement #${movement.id} | ${movement.type} | ` +
        `quantity=${movement.quantity} | ${movement.comment ?? ""}`
    );
  }

  await prisma.movement.deleteMany({
    where: {
      productId,
    },
  });
}

// -------------------------------------------------------------------------
// 4. Delete remaining batches
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
});

if (batches.length > 0) {
  console.log(`Deleting ${batches.length} remaining Batch record(s).`);

  await prisma.batch.deleteMany({
    where: {
      productId,
    },
  });
}

// -------------------------------------------------------------------------
// 5. Delete product
// -------------------------------------------------------------------------

await prisma.product.delete({
  where: {
    id: productId,
  },
});

console.log(`🟢 Test Product #${productId} deleted.`);


} catch (error) {
console.error("");
console.error("🔴 CLEANUP FAILED");
console.error(error);
}
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("DELETE API INTEGRATION TEST V3");
console.log("==============================================================================");
console.log("STRICTLY ISOLATED TEST DATA");
console.log("");

// ===========================================================================
// 1. CREATE TEST PRODUCT
// ===========================================================================

console.log("1. CREATING TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
data: {
name: "DELETE API INTEGRATION TEST V3",
unit: "шт",
price: 300,
cost: 100,
stock: 5,
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
quantity: 3,
purchaseCost: 100,
receivedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
expiryDate: expiredDate,
status: "EXPIRED",
productId: product.id,
},
});

const activeBatch = await prisma.batch.create({
data: {
quantity: 2,
purchaseCost: 120,
receivedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
expiryDate: activeExpiryDate,
status: "ACTIVE",
productId: product.id,
},
});

console.log(
`Expired Batch #${expiredBatch.id} | quantity=${expiredBatch.quantity} | ` +
`status=${expiredBatch.status}`
);

console.log(
`Active Batch #${activeBatch.id} | quantity=${activeBatch.quantity} | ` +
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
console.log("");

// ===========================================================================
// 4. CREATE ORIGINAL ORDERBATCH HISTORY
// ===========================================================================

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
`OrderBatch #${orderBatchExpired.id} → Batch #${expiredBatch.id} qty=3`
);

console.log(
`OrderBatch #${orderBatchActive.id} → Batch #${activeBatch.id} qty=2`
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
`ReturnBatch #${returnBatch.id} → Batch #${expiredBatch.id} qty=1`
);

// ===========================================================================
// 6. VERIFY INITIAL TEST STATE
// ===========================================================================

console.log("");
console.log("6. VERIFYING INITIAL STATE");
console.log("------------------------------------------------------------------------------");

const initialExpired = await prisma.batch.findUnique({
where: {
id: expiredBatch.id,
},
});

const initialActive = await prisma.batch.findUnique({
where: {
id: activeBatch.id,
},
});

assert(
initialExpired?.quantity === 3,
"Expired batch initially has quantity 3"
);

assert(
initialExpired?.status === "EXPIRED",
"Expired batch initially has EXPIRED status"
);

assert(
initialActive?.quantity === 2,
"Active batch initially has quantity 2"
);

assert(
initialActive?.status === "ACTIVE",
"Active batch initially has ACTIVE status"
);

// ===========================================================================
// 7. CALL DELETE API
// ===========================================================================

console.log("");
console.log("7. CALLING DELETE API");
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
// 8. VERIFY ORDER DELETED
// ===========================================================================

console.log("");
console.log("8. VERIFYING ORDER DELETION");
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

// ===========================================================================
// 9. VERIFY ORDERITEM DELETED
// ===========================================================================

const remainingOrderItems = await prisma.orderItem.count({
where: {
orderId: testOrderId,
},
});

assert(
remainingOrderItems === 0,
"All OrderItem records for the deleted order were removed"
);

// ===========================================================================
// 10. VERIFY ORDERBATCH DELETED
// ===========================================================================

const remainingOrderBatches = await prisma.orderBatch.count({
where: {
orderItem: {
orderId: testOrderId,
},
},
});

assert(
remainingOrderBatches === 0,
"All OrderBatch records for the deleted order were removed"
);

// ===========================================================================
// 11. VERIFY RETURNBATCH DELETED
// ===========================================================================

const remainingReturnBatches = await prisma.returnBatch.count({
where: {
OrderItem: {
orderId: testOrderId,
},
},
});

assert(
remainingReturnBatches === 0,
"All ReturnBatch records for the deleted order were removed"
);

// ===========================================================================
// 12. VERIFY EXPIRED BATCH RESTORATION
// ===========================================================================

console.log("");
console.log("9. VERIFYING EXPIRED BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredExpired = await prisma.batch.findUnique({
where: {
id: expiredBatch.id,
},
});

assert(
restoredExpired !== null,
"Expired batch still exists after order deletion"
);

assert(
restoredExpired?.quantity === 2,
`Expired batch quantity restored to 2`
);

assert(
restoredExpired?.status === "EXPIRED",
"Restored expired batch remains EXPIRED"
);

assert(
restoredExpired?.productId === product.id,
"Restored expired batch still belongs to the test product"
);

// ===========================================================================
// 13. VERIFY ACTIVE BATCH RESTORATION
// ===========================================================================

console.log("");
console.log("10. VERIFYING ACTIVE BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const restoredActive = await prisma.batch.findUnique({
where: {
id: activeBatch.id,
},
});

assert(
restoredActive !== null,
"Active batch still exists after order deletion"
);

assert(
restoredActive?.quantity === 2,
"Active batch quantity restored to 2"
);

assert(
restoredActive?.status === "ACTIVE",
"Active batch remains ACTIVE"
);

// ===========================================================================
// 14. VERIFY PRODUCT STOCK
// ===========================================================================

console.log("");
console.log("11. VERIFYING PRODUCT STOCK");
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
"Test product still exists before cleanup"
);

const batchStock = restoredProduct.batches.reduce(
(sum, batch) => sum + batch.quantity,
0
);

console.log(`Product.stock=${restoredProduct.stock}`);
console.log(`Sum(Batch.quantity)=${batchStock}`);

assert(
restoredProduct.stock === 4,
"Product stock restored to 4"
);

assert(
restoredProduct.stock === batchStock,
"Product.stock equals sum of Batch.quantity"
);

// ===========================================================================
// 15. VERIFY RETURN MOVEMENTS
// ===========================================================================

console.log("");
console.log("12. VERIFYING RETURN MOVEMENTS");
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

console.log(`Found ${returnMovements.length} RETURN movement(s)`);

for (const movement of returnMovements) {
console.log(
`Movement #${movement.id} | quantity=${movement.quantity} | ` +
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

// ===========================================================================
// 16. VERIFY EXACT MOVEMENT COMMENTS
// ===========================================================================

assert(
returnMovements.some(
(movement) =>
movement.comment?.includes(`Партия №${expiredBatch.id}`)
),
"RETURN movement exists for expired batch"
);

assert(
returnMovements.some(
(movement) =>
movement.comment?.includes(`Партия №${activeBatch.id}`)
),
"RETURN movement exists for active batch"
);

// ===========================================================================
// 17. REPEATED DELETE MUST RETURN 404
// ===========================================================================

console.log("");
console.log("13. TESTING REPEATED DELETE");
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

console.log(`HTTP ${secondResponse.status}`);
console.log(`Response=${secondResponseText}`);

assert(
secondResponse.status === 404,
"Repeated DELETE returned HTTP 404"
);

// ===========================================================================
// 18. FINAL TEST RESULT
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("V3 TEST PASSED");
console.log("==============================================================================");
console.log("");
console.log("Verified:");
console.log("🟢 Order deleted");
console.log("🟢 OrderItem deleted");
console.log("🟢 OrderBatch deleted");
console.log("🟢 ReturnBatch deleted");
console.log("🟢 Expired batch quantity restored");
console.log("🟢 Expired batch remained EXPIRED");
console.log("🟢 Active batch quantity restored");
console.log("🟢 Active batch remained ACTIVE");
console.log("🟢 Product.stock restored correctly");
console.log("🟢 Product.stock == sum(Batch.quantity)");
console.log("🟢 RETURN movements created");
console.log("🟢 Repeated DELETE returned 404");
console.log("");
console.log("The DELETE API passed the isolated V3 integration test.");
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 V3 TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await cleanup();


// -------------------------------------------------------------------------
// FINAL CLEANUP VERIFICATION
// -------------------------------------------------------------------------

try {
  const leftoverProduct = await prisma.product.findUnique({
    where: {
      barcode: TEST_BARCODE,
    },
    include: {
      batches: true,
      movements: true,
    },
  });

  if (leftoverProduct) {
    console.error("");
    console.error("🔴 FINAL CLEANUP VERIFICATION FAILED");
    console.error(
      `Test Product #${leftoverProduct.id} still exists.`
    );
    console.error(
      `Batches=${leftoverProduct.batches.length}`
    );
    console.error(
      `Movements=${leftoverProduct.movements.length}`
    );
  } else {
    console.log("");
    console.log("🟢 FINAL CLEANUP VERIFIED");
    console.log("Test Product does not exist.");
    console.log("No test batches remain.");
    console.log("No test movements remain.");
  }
} catch (cleanupVerificationError) {
  console.error("");
  console.error("🔴 FINAL CLEANUP VERIFICATION ERROR");
  console.error(cleanupVerificationError);
}

await prisma.$disconnect();


});