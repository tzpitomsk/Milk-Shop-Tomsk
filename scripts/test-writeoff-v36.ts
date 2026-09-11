import { prisma } from "@/lib/prisma";

const TEST_PRODUCT_NAME = "V36_WRITE_OFF_TEST";

async function cleanupTestData() {
console.log("");
console.log("🧹 CLEANUP OLD V36 TEST DATA");
console.log("------------------------------------------------------------------------------");

const products = await prisma.product.findMany({
where: {
name: TEST_PRODUCT_NAME,
},
select: {
id: true,
},
});

if (products.length === 0) {
console.log("No old V36 test products found.");
return;
}

const productIds = products.map((product) => product.id);

await prisma.$transaction(async (tx) => {
// OrderBatch uses relation field `Batch`, not `batch`.
await tx.orderBatch.deleteMany({
where: {
batch: {
productId: {
in: productIds,
},
},
},
});


// ReturnBatch uses relation field `Batch`, not `batch`.
await tx.returnBatch.deleteMany({
  where: {
    Batch: {
      productId: {
        in: productIds,
      },
    },
  },
});

await tx.movement.deleteMany({
  where: {
    productId: {
      in: productIds,
    },
  },
});

await tx.batch.deleteMany({
  where: {
    productId: {
      in: productIds,
    },
  },
});

await tx.product.deleteMany({
  where: {
    id: {
      in: productIds,
    },
  },
});


});

console.log(
`🟢 Removed ${products.length} old V36 test product(s): ${productIds.join(", ")}`
);
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V36 WRITE-OFF INTEGRATION TEST");
console.log("==============================================================================");
console.log("");

// ===========================================================================
// 1. CLEAN OLD TEST DATA
// ===========================================================================

await cleanupTestData();

console.log("");

// ===========================================================================
// 2. CREATE TEST PRODUCT
// ===========================================================================

console.log("1. CREATE TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
data: {
name: TEST_PRODUCT_NAME,
unit: "шт",
price: 200,
cost: 100,
stock: 5,
},
});

console.log(
`🟢 Product #${product.id} created | stock=${product.stock}`
);

// ===========================================================================
// 3. CREATE TEST BATCH
// ===========================================================================

console.log("");
console.log("2. CREATE TEST BATCH");
console.log("------------------------------------------------------------------------------");

const batch = await prisma.batch.create({
data: {
productId: product.id,
quantity: 5,
purchaseCost: 100,
receivedAt: new Date(),
expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
status: "ACTIVE",
},
});

console.log(
`🟢 Batch #${batch.id} created | quantity=${batch.quantity} | status=${batch.status}`
);

// ===========================================================================
// 4. SYNC PRODUCT STOCK
// ===========================================================================

console.log("");
console.log("3. INITIAL STOCK CHECK");
console.log("------------------------------------------------------------------------------");

const initialBatchTotal = await prisma.batch.aggregate({
where: {
productId: product.id,
},
_sum: {
quantity: true,
},
});

const initialStock = initialBatchTotal._sum.quantity ?? 0;

console.log(`Product.stock=${product.stock}`);
console.log(`SUM(Batch.quantity)=${initialStock}`);

if (product.stock !== initialStock) {
throw new Error(
`Initial stock mismatch: Product.stock=${product.stock}, batch total=${initialStock}`
);
}

if (initialStock !== 5) {
throw new Error(
`Unexpected initial batch quantity: expected 5, got ${initialStock}`
);
}

console.log("🟢 Initial stock check PASSED");

// ===========================================================================
// 5. PARTIAL WRITE-OFF
// ===========================================================================

console.log("");
console.log("4. PARTIAL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

const partialQuantity = 2;

const partialResult = await prisma.$transaction(async (tx) => {
const currentBatch = await tx.batch.findUnique({
where: {
id: batch.id,
},
});


if (!currentBatch) {
  throw new Error("Test batch not found");
}

if (currentBatch.quantity < partialQuantity) {
  throw new Error(
    `Not enough quantity for partial write-off: ${currentBatch.quantity}`
  );
}

const newQuantity = currentBatch.quantity - partialQuantity;

const updatedBatch = await tx.batch.update({
  where: {
    id: currentBatch.id,
  },
  data: {
    quantity: newQuantity,
    status: newQuantity === 0 ? "EMPTY" : "ACTIVE",
  },
});

const movement = await tx.movement.create({
  data: {
    type: "WRITE_OFF",
    quantity: -partialQuantity,
    comment: `V36 TEST partial write-off. Партия №${currentBatch.id}`,
    productId: currentBatch.productId,
  },
});

const total = await tx.batch.aggregate({
  where: {
    productId: currentBatch.productId,
  },
  _sum: {
    quantity: true,
  },
});

const newStock = total._sum.quantity ?? 0;

await tx.product.update({
  where: {
    id: currentBatch.productId,
  },
  data: {
    stock: newStock,
  },
});

return {
  updatedBatch,
  movement,
  newStock,
};


});

console.log(
`Batch #${batch.id}: 5 → ${partialResult.updatedBatch.quantity}`
);
console.log(`Batch status: ${partialResult.updatedBatch.status}`);
console.log(`Product.stock=${partialResult.newStock}`);
console.log(
`Movement #${partialResult.movement.id}: ${partialResult.movement.quantity}`
);

if (partialResult.updatedBatch.quantity !== 3) {
throw new Error(
`Partial write-off failed: expected batch quantity 3, got ${partialResult.updatedBatch.quantity}`
);
}

if (partialResult.updatedBatch.status !== "ACTIVE") {
throw new Error(
`Partial write-off failed: expected ACTIVE, got ${partialResult.updatedBatch.status}`
);
}

if (partialResult.newStock !== 3) {
throw new Error(
`Partial write-off failed: expected Product.stock=3, got ${partialResult.newStock}`
);
}

if (partialResult.movement.quantity !== -2) {
throw new Error(
`Partial write-off movement failed: expected -2, got ${partialResult.movement.quantity}`
);
}

console.log("🟢 Partial write-off PASSED");

// ===========================================================================
// 6. FULL WRITE-OFF
// ===========================================================================

console.log("");
console.log("5. FULL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

const fullQuantity = 3;

const fullResult = await prisma.$transaction(async (tx) => {
const currentBatch = await tx.batch.findUnique({
where: {
id: batch.id,
},
});


if (!currentBatch) {
  throw new Error("Test batch not found");
}

if (currentBatch.quantity < fullQuantity) {
  throw new Error(
    `Not enough quantity for full write-off: ${currentBatch.quantity}`
  );
}

const newQuantity = currentBatch.quantity - fullQuantity;

const updatedBatch = await tx.batch.update({
  where: {
    id: currentBatch.id,
  },
  data: {
    quantity: newQuantity,
    status: newQuantity === 0 ? "EMPTY" : "ACTIVE",
  },
});

const movement = await tx.movement.create({
  data: {
    type: "WRITE_OFF",
    quantity: -fullQuantity,
    comment: `V36 TEST full write-off. Партия №${currentBatch.id}`,
    productId: currentBatch.productId,
  },
});

const total = await tx.batch.aggregate({
  where: {
    productId: currentBatch.productId,
  },
  _sum: {
    quantity: true,
  },
});

const newStock = total._sum.quantity ?? 0;

await tx.product.update({
  where: {
    id: currentBatch.productId,
  },
  data: {
    stock: newStock,
  },
});

return {
  updatedBatch,
  movement,
  newStock,
};


});

console.log(
`Batch #${batch.id}: 3 → ${fullResult.updatedBatch.quantity}`
);
console.log(`Batch status: ${fullResult.updatedBatch.status}`);
console.log(`Product.stock=${fullResult.newStock}`);
console.log(
`Movement #${fullResult.movement.id}: ${fullResult.movement.quantity}`
);

if (fullResult.updatedBatch.quantity !== 0) {
throw new Error(
`Full write-off failed: expected batch quantity 0, got ${fullResult.updatedBatch.quantity}`
);
}

if (fullResult.updatedBatch.status !== "EMPTY") {
throw new Error(
`Full write-off failed: expected EMPTY, got ${fullResult.updatedBatch.status}`
);
}

if (fullResult.newStock !== 0) {
throw new Error(
`Full write-off failed: expected Product.stock=0, got ${fullResult.newStock}`
);
}

if (fullResult.movement.quantity !== -3) {
throw new Error(
`Full write-off movement failed: expected -3, got ${fullResult.movement.quantity}`
);
}

console.log("🟢 Full write-off PASSED");

// ===========================================================================
// 7. VERIFY MOVEMENTS
// ===========================================================================

console.log("");
console.log("6. WRITE-OFF MOVEMENT CHECK");
console.log("------------------------------------------------------------------------------");

const movements = await prisma.movement.findMany({
where: {
productId: product.id,
type: "WRITE_OFF",
},
orderBy: {
id: "asc",
},
});

for (const movement of movements) {
console.log(
`Movement #${movement.id} | type=${movement.type} | quantity=${movement.quantity} | comment="${movement.comment}"`
);
}

const totalWriteOff = movements.reduce(
(sum, movement) => sum + movement.quantity,
0
);

console.log("");
console.log(`TOTAL WRITE_OFF=${totalWriteOff}`);

if (totalWriteOff !== -5) {
throw new Error(
`Total write-off mismatch: expected -5, got ${totalWriteOff}`
);
}

if (movements.length !== 2) {
throw new Error(
`Unexpected WRITE_OFF movement count: expected 2, got ${movements.length}`
);
}

console.log("🟢 Movement check PASSED");

// ===========================================================================
// 8. FINAL DATABASE STATE
// ===========================================================================

console.log("");
console.log("7. FINAL STATE CHECK");
console.log("------------------------------------------------------------------------------");

const finalProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

const finalBatch = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

if (!finalProduct) {
throw new Error("Final Product not found");
}

if (!finalBatch) {
throw new Error("Final Batch not found");
}

const finalBatchTotal = await prisma.batch.aggregate({
where: {
productId: product.id,
},
_sum: {
quantity: true,
},
});

const finalStockFromBatches = finalBatchTotal._sum.quantity ?? 0;

console.log(`Product #${finalProduct.id} stock=${finalProduct.stock}`);
console.log(
`Batch #${finalBatch.id} quantity=${finalBatch.quantity} status=${finalBatch.status}`
);
console.log(`SUM(Batch.quantity)=${finalStockFromBatches}`);

if (finalProduct.stock !== 0) {
throw new Error(
`Final Product.stock mismatch: expected 0, got ${finalProduct.stock}`
);
}

if (finalBatch.quantity !== 0) {
throw new Error(
`Final Batch.quantity mismatch: expected 0, got ${finalBatch.quantity}`
);
}

if (finalBatch.status !== "EMPTY") {
throw new Error(
`Final Batch.status mismatch: expected EMPTY, got ${finalBatch.status}`
);
}

if (finalStockFromBatches !== 0) {
throw new Error(
`Final batch total mismatch: expected 0, got ${finalStockFromBatches}`
);
}

if (finalProduct.stock !== finalStockFromBatches) {
throw new Error(
`Final stock invariant failed: Product.stock=${finalProduct.stock}, batches=${finalStockFromBatches}`
);
}

console.log("🟢 Final state check PASSED");

// ===========================================================================
// 9. SUCCESS
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("🟢 V36 WRITE-OFF TEST PASSED");
console.log("==============================================================================");
console.log("");
console.log(`Test Product #${product.id}`);
console.log(`Test Batch #${batch.id}`);
console.log("");
console.log("Verified:");
console.log("✓ Partial write-off 5 → 3");
console.log("✓ Partial WRITE_OFF movement -2");
console.log("✓ Product.stock synchronized to 3");
console.log("✓ Full write-off 3 → 0");
console.log("✓ Full WRITE_OFF movement -3");
console.log("✓ Batch status became EMPTY");
console.log("✓ Product.stock synchronized to 0");
console.log("✓ Total WRITE_OFF movement = -5");
console.log("✓ Product.stock == SUM(Batch.quantity)");
console.log("");
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 V36 WRITE-OFF TEST FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
try {
await cleanupTestData();
} catch (cleanupError) {
console.error("");
console.error("==============================================================================");
console.error("🔴 V36 CLEANUP FAILED");
console.error("==============================================================================");
console.error("");
console.error(cleanupError);
process.exitCode = 1;
}


await prisma.$disconnect();


});