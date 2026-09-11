import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/batches/[id]/writeoff/route";

const TEST_PRODUCT_NAME = "V36B_WRITE_OFF_API_TEST";

async function cleanupTestData() {
console.log("");
console.log("🧹 CLEANUP V36-B TEST DATA");
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
console.log("No old V36-B test products found.");
return;
}

const productIds = products.map((product) => product.id);

await prisma.$transaction(async (tx) => {
// OrderBatch relation field is `Batch`.
await tx.orderBatch.deleteMany({
where: {
batch: {
productId: {
in: productIds,
},
},
},
});


// ReturnBatch relation field is `Batch`.
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
`🟢 Removed ${products.length} old V36-B test product(s): ${productIds.join(", ")}`
);
}

async function callWriteOffApi(
batchId: number,
quantity: number,
reason: string
) {
const request = new Request(
`http://localhost/api/batches/${batchId}/writeoff`,
{
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify({
quantity,
reason,
}),
}
);

return POST(request, {
params: Promise.resolve({
id: String(batchId),
}),
});
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V36-B WRITE-OFF API INTEGRATION TEST");
console.log("==============================================================================");
console.log("");

// ===========================================================================
// 1. CLEAN OLD TEST DATA
// ===========================================================================

await cleanupTestData();

// ===========================================================================
// 2. CREATE TEST PRODUCT
// ===========================================================================

console.log("");
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
// 3. CREATE EXPIRED TEST BATCH
// ===========================================================================

console.log("");
console.log("2. CREATE EXPIRED TEST BATCH");
console.log("------------------------------------------------------------------------------");

const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

const batch = await prisma.batch.create({
data: {
productId: product.id,
quantity: 5,
purchaseCost: 100,
receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
expiryDate: expiredDate,
status: "EXPIRED",
},
});

console.log(
`🟢 Batch #${batch.id} created | quantity=${batch.quantity}`
);
console.log(`expiryDate=${batch.expiryDate.toISOString()}`);
console.log(`status=${batch.status}`);

if (batch.status !== "EXPIRED") {
throw new Error(
`Test setup failed: expected EXPIRED, got ${batch.status}`
);
}

// ===========================================================================
// 4. INITIAL INVARIANT
// ===========================================================================

console.log("");
console.log("3. INITIAL STOCK INVARIANT");
console.log("------------------------------------------------------------------------------");

const initialBatchTotal = await prisma.batch.aggregate({
where: {
productId: product.id,
},
_sum: {
quantity: true,
},
});

const initialBatchQuantity = initialBatchTotal._sum.quantity ?? 0;

console.log(`Product.stock=${product.stock}`);
console.log(`SUM(Batch.quantity)=${initialBatchQuantity}`);

if (product.stock !== 5) {
throw new Error(
`Initial Product.stock expected 5, got ${product.stock}`
);
}

if (initialBatchQuantity !== 5) {
throw new Error(
`Initial batch quantity expected 5, got ${initialBatchQuantity}`
);
}

if (product.stock !== initialBatchQuantity) {
throw new Error(
`Initial stock invariant failed: Product.stock=${product.stock}, batches=${initialBatchQuantity}`
);
}

console.log("🟢 Initial invariant PASSED");

// ===========================================================================
// 5. PARTIAL WRITE-OFF THROUGH REAL API
// ===========================================================================

console.log("");
console.log("4. PARTIAL WRITE-OFF THROUGH REAL API");
console.log("------------------------------------------------------------------------------");

const partialResponse = await callWriteOffApi(
batch.id,
2,
"V36-B TEST partial expired write-off"
);

const partialBody = await partialResponse.json();

console.log(`HTTP status=${partialResponse.status}`);
console.log("Response:", partialBody);

if (partialResponse.status !== 200) {
throw new Error(
`Partial write-off API failed: expected HTTP 200, got ${partialResponse.status}`
);
}

if (partialBody.success !== true) {
throw new Error(
`Partial write-off API failed: success expected true`
);
}

if (!partialBody.data) {
throw new Error("Partial write-off API returned no data");
}

if (partialBody.data.oldQuantity !== 5) {
throw new Error(
`Partial API oldQuantity expected 5, got ${partialBody.data.oldQuantity}`
);
}

if (partialBody.data.writeOff !== 2) {
throw new Error(
`Partial API writeOff expected 2, got ${partialBody.data.writeOff}`
);
}

if (partialBody.data.newQuantity !== 3) {
throw new Error(
`Partial API newQuantity expected 3, got ${partialBody.data.newQuantity}`
);
}

if (partialBody.data.stock !== 3) {
throw new Error(
`Partial API stock expected 3, got ${partialBody.data.stock}`
);
}

// ===========================================================================
// 6. VERIFY DATABASE AFTER PARTIAL WRITE-OFF
// ===========================================================================

console.log("");
console.log("5. VERIFY DATABASE AFTER PARTIAL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

const afterPartialBatch = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

const afterPartialProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

if (!afterPartialBatch) {
throw new Error("Batch disappeared after partial write-off");
}

if (!afterPartialProduct) {
throw new Error("Product disappeared after partial write-off");
}

console.log(
`Batch #${afterPartialBatch.id} quantity=${afterPartialBatch.quantity}`
);
console.log(`Batch status=${afterPartialBatch.status}`);
console.log(`Product.stock=${afterPartialProduct.stock}`);

if (afterPartialBatch.quantity !== 3) {
throw new Error(
`Database batch quantity expected 3, got ${afterPartialBatch.quantity}`
);
}

// THIS IS THE KEY V36-B ASSERTION.
if (afterPartialBatch.status !== "EXPIRED") {
throw new Error(
`CRITICAL: expired batch changed status after partial write-off. Expected EXPIRED, got ${afterPartialBatch.status}`
);
}

if (afterPartialProduct.stock !== 3) {
throw new Error(
`Database Product.stock expected 3, got ${afterPartialProduct.stock}`
);
}

console.log(
"🟢 CRITICAL CHECK PASSED: EXPIRED batch remained EXPIRED after partial write-off"
);

// ===========================================================================
// 7. VERIFY FIRST MOVEMENT
// ===========================================================================

console.log("");
console.log("6. VERIFY FIRST WRITE-OFF MOVEMENT");
console.log("------------------------------------------------------------------------------");

const partialMovements = await prisma.movement.findMany({
where: {
productId: product.id,
type: "WRITE_OFF",
},
orderBy: {
id: "asc",
},
});

if (partialMovements.length !== 1) {
throw new Error(
`Expected 1 WRITE_OFF movement after partial write-off, got ${partialMovements.length}`
);
}

const partialMovement = partialMovements[0];

console.log(
`Movement #${partialMovement.id} | quantity=${partialMovement.quantity}`
);
console.log(`comment="${partialMovement.comment}"`);

if (partialMovement.quantity !== -2) {
throw new Error(
`First WRITE_OFF movement expected -2, got ${partialMovement.quantity}`
);
}

if (
!partialMovement.comment?.includes(
`V36-B TEST partial expired write-off`
)
) {
throw new Error(
`First WRITE_OFF movement has unexpected comment: ${partialMovement.comment}`
);
}

console.log("🟢 First movement check PASSED");

// ===========================================================================
// 8. FULL WRITE-OFF THROUGH REAL API
// ===========================================================================

console.log("");
console.log("7. FULL WRITE-OFF THROUGH REAL API");
console.log("------------------------------------------------------------------------------");

const fullResponse = await callWriteOffApi(
batch.id,
3,
"V36-B TEST full expired write-off"
);

const fullBody = await fullResponse.json();

console.log(`HTTP status=${fullResponse.status}`);
console.log("Response:", fullBody);

if (fullResponse.status !== 200) {
throw new Error(
`Full write-off API failed: expected HTTP 200, got ${fullResponse.status}`
);
}

if (fullBody.success !== true) {
throw new Error(
`Full write-off API failed: success expected true`
);
}

if (!fullBody.data) {
throw new Error("Full write-off API returned no data");
}

if (fullBody.data.oldQuantity !== 3) {
throw new Error(
`Full API oldQuantity expected 3, got ${fullBody.data.oldQuantity}`
);
}

if (fullBody.data.writeOff !== 3) {
throw new Error(
`Full API writeOff expected 3, got ${fullBody.data.writeOff}`
);
}

if (fullBody.data.newQuantity !== 0) {
throw new Error(
`Full API newQuantity expected 0, got ${fullBody.data.newQuantity}`
);
}

if (fullBody.data.stock !== 0) {
throw new Error(
`Full API stock expected 0, got ${fullBody.data.stock}`
);
}

if (fullBody.data.status !== "EMPTY") {
throw new Error(
`Full API status expected EMPTY, got ${fullBody.data.status}`
);
}

console.log("🟢 Full API write-off PASSED");

// ===========================================================================
// 9. VERIFY FINAL DATABASE STATE
// ===========================================================================

console.log("");
console.log("8. FINAL DATABASE STATE");
console.log("------------------------------------------------------------------------------");

const finalBatch = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

const finalProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

if (!finalBatch) {
throw new Error("Final batch not found");
}

if (!finalProduct) {
throw new Error("Final product not found");
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

console.log(
`Batch #${finalBatch.id} quantity=${finalBatch.quantity}`
);
console.log(`Batch status=${finalBatch.status}`);
console.log(`Product.stock=${finalProduct.stock}`);
console.log(`SUM(Batch.quantity)=${finalStockFromBatches}`);

if (finalBatch.quantity !== 0) {
throw new Error(
`Final batch quantity expected 0, got ${finalBatch.quantity}`
);
}

if (finalBatch.status !== "EMPTY") {
throw new Error(
`Final batch status expected EMPTY, got ${finalBatch.status}`
);
}

if (finalProduct.stock !== 0) {
throw new Error(
`Final Product.stock expected 0, got ${finalProduct.stock}`
);
}

if (finalStockFromBatches !== 0) {
throw new Error(
`Final SUM(Batch.quantity) expected 0, got ${finalStockFromBatches}`
);
}

if (finalProduct.stock !== finalStockFromBatches) {
throw new Error(
`Final stock invariant failed: Product.stock=${finalProduct.stock}, batches=${finalStockFromBatches}`
);
}

console.log("🟢 Final state PASSED");

// ===========================================================================
// 10. VERIFY ALL WRITE-OFF MOVEMENTS
// ===========================================================================

console.log("");
console.log("9. FINAL WRITE-OFF MOVEMENTS");
console.log("------------------------------------------------------------------------------");

const finalMovements = await prisma.movement.findMany({
where: {
productId: product.id,
type: "WRITE_OFF",
},
orderBy: {
id: "asc",
},
});

for (const movement of finalMovements) {
console.log(
`Movement #${movement.id} | ${movement.quantity} | ${movement.comment}`
);
}

if (finalMovements.length !== 2) {
throw new Error(
`Expected 2 WRITE_OFF movements, got ${finalMovements.length}`
);
}

const totalWriteOff = finalMovements.reduce(
(sum, movement) => sum + movement.quantity,
0
);

console.log("");
console.log(`TOTAL WRITE_OFF=${totalWriteOff}`);

if (totalWriteOff !== -5) {
throw new Error(
`Total WRITE_OFF expected -5, got ${totalWriteOff}`
);
}

if (finalMovements[0].quantity !== -2) {
throw new Error(
`First movement expected -2, got ${finalMovements[0].quantity}`
);
}

if (finalMovements[1].quantity !== -3) {
throw new Error(
`Second movement expected -3, got ${finalMovements[1].quantity}`
);
}

console.log("🟢 Final movement check PASSED");

// ===========================================================================
// 11. ERROR HANDLING TESTS
// ===========================================================================

console.log("");
console.log("10. API VALIDATION CHECKS");
console.log("------------------------------------------------------------------------------");

// Empty batch
const emptyBatchResponse = await callWriteOffApi(
batch.id,
1,
"V36-B TEST should fail"
);

const emptyBatchBody = await emptyBatchResponse.json();

console.log(
`Empty batch test: HTTP ${emptyBatchResponse.status}`,
emptyBatchBody
);

if (emptyBatchResponse.status !== 400) {
throw new Error(
`Empty batch validation expected HTTP 400, got ${emptyBatchResponse.status}`
);
}

if (emptyBatchBody.error !== "Партия уже пустая") {
throw new Error(
`Unexpected empty batch error: ${emptyBatchBody.error}`
);
}

console.log("🟢 Empty batch validation PASSED");

// Invalid quantity
const invalidQuantityResponse = await callWriteOffApi(
batch.id,
0,
"V36-B TEST invalid quantity"
);

const invalidQuantityBody = await invalidQuantityResponse.json();

console.log(
`Invalid quantity test: HTTP ${invalidQuantityResponse.status}`,
invalidQuantityBody
);

if (invalidQuantityResponse.status !== 400) {
throw new Error(
`Invalid quantity validation expected HTTP 400, got ${invalidQuantityResponse.status}`
);
}

console.log("🟢 Invalid quantity validation PASSED");

// ===========================================================================
// 12. SUCCESS
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("🟢 V36-B WRITE-OFF API TEST PASSED");
console.log("==============================================================================");
console.log("");
console.log(`Test Product #${product.id}`);
console.log(`Test Batch #${batch.id}`);
console.log("");
console.log("Verified:");
console.log("✓ Real POST /api/batches/[id]/writeoff executed");
console.log("✓ Partial write-off through API: 5 → 3");
console.log("✓ Expired batch remained EXPIRED after partial write-off");
console.log("✓ Product.stock synchronized to 3");
console.log("✓ WRITE_OFF movement -2 created");
console.log("✓ Full write-off through API: 3 → 0");
console.log("✓ Batch status changed EXPIRED → EMPTY");
console.log("✓ Product.stock synchronized to 0");
console.log("✓ WRITE_OFF movement -3 created");
console.log("✓ Total WRITE_OFF movement = -5");
console.log("✓ Product.stock == SUM(Batch.quantity)");
console.log("✓ Empty batch validation returns HTTP 400");
console.log("✓ Invalid quantity validation returns HTTP 400");
console.log("");
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 V36-B WRITE-OFF API TEST FAILED");
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
console.error("🔴 V36-B CLEANUP FAILED");
console.error("==============================================================================");
console.error("");
console.error(cleanupError);
process.exitCode = 1;
}


await prisma.$disconnect();


});