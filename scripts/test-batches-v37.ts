import { PrismaClient } from "@prisma/client";
import { PUT } from "@/app/api/batches/[id]/route";

const prisma = new PrismaClient();

const TEST_PRODUCT_NAME = "V37_BATCH_EDIT_TEST";

function assert(condition: unknown, message: string) {
if (!condition) {
throw new Error(`❌ ASSERT FAILED: ${message}`);
}

console.log(`🟢 ${message}`);
}

async function cleanup() {
const products = await prisma.product.findMany({
where: {
name: TEST_PRODUCT_NAME,
},
select: {
id: true,
},
});

for (const product of products) {
await prisma.returnBatch.deleteMany({
where: {
Batch: {
productId: product.id,
},
},
});


await prisma.orderBatch.deleteMany({
  where: {
    batch: {
      productId: product.id,
    },
  },
});

await prisma.batch.deleteMany({
  where: {
    productId: product.id,
  },
});

await prisma.movement.deleteMany({
  where: {
    productId: product.id,
  },
});

await prisma.supplyItem.deleteMany({
  where: {
    productId: product.id,
  },
});

await prisma.orderItem.deleteMany({
  where: {
    productId: product.id,
  },
});

await prisma.product.delete({
  where: {
    id: product.id,
  },
});


}
}

async function callPut(batchId: number, body: unknown) {
const request = new Request(`http://localhost/api/batches/${batchId}`, {
method: "PUT",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify(body),
});

const response = await PUT(request, {
params: Promise.resolve({
id: String(batchId),
}),
});

let json: unknown = null;

try {
json = await response.json();
} catch {
// Ignore empty response body.
}

return {
response,
json,
};
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V37 BATCH EDIT INTEGRATION TEST");
console.log("SAFE BATCH EDIT / QUANTITY IMMUTABILITY");
console.log("==============================================================================");
console.log("");

// ===========================================================================
// 1. CLEANUP OLD TEST DATA
// ===========================================================================

console.log("1. CLEANUP OLD TEST DATA");
console.log("------------------------------------------------------------------------------");

await cleanup();

console.log("🟢 Old V37 test data removed");
console.log("");

// ===========================================================================
// 2. CREATE ISOLATED TEST PRODUCT + BATCH
// ===========================================================================

console.log("2. CREATE TEST PRODUCT AND BATCH");
console.log("------------------------------------------------------------------------------");

const product = await prisma.product.create({
data: {
name: TEST_PRODUCT_NAME,
unit: "шт",
price: 300,
cost: 100,
stock: 5,
},
});

const originalExpiry = new Date("2030-01-10T12:00:00.000Z");
const editedExpiry = new Date("2030-02-10T12:00:00.000Z");
const expiredExpiry = new Date("2020-01-01T12:00:00.000Z");

const batch = await prisma.batch.create({
data: {
productId: product.id,
quantity: 5,
purchaseCost: 100,
receivedAt: new Date("2029-12-01T12:00:00.000Z"),
expiryDate: originalExpiry,
status: "ACTIVE",
},
});

await prisma.movement.create({
data: {
productId: product.id,
type: "TEST",
quantity: 5,
comment: "V37 initial test stock",
},
});

console.log(`Product #${product.id}`);
console.log(`Batch #${batch.id}`);
console.log(`Initial quantity=${batch.quantity}`);
console.log(`Initial expiry=${batch.expiryDate.toISOString()}`);
console.log(`Initial status=${batch.status}`);
console.log("");

// ===========================================================================
// 3. VERIFY INITIAL STATE
// ===========================================================================

console.log("3. VERIFY INITIAL STATE");
console.log("------------------------------------------------------------------------------");

const initialProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

const initialBatch = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

assert(initialProduct !== null, "Test Product exists");
assert(initialBatch !== null, "Test Batch exists");

assert(
initialProduct!.stock === 5,
`Initial Product.stock is 5`
);

assert(
initialBatch!.quantity === 5,
`Initial Batch.quantity is 5`
);

assert(
initialBatch!.status === "ACTIVE",
`Initial Batch.status is ACTIVE`
);

console.log("");

// ===========================================================================
// 4. EDIT EXPIRY DATE WITH SAME QUANTITY
// ===========================================================================

console.log("4. EDIT EXPIRY DATE — SAME QUANTITY");
console.log("------------------------------------------------------------------------------");

const editResult = await callPut(batch.id, {
quantity: 5,
expiryDate: editedExpiry.toISOString(),
});

console.log(`HTTP ${editResult.response.status}`);
console.log(editResult.json);
console.log("");

assert(
editResult.response.status === 200,
"Changing expiry with unchanged quantity returns HTTP 200"
);

const afterExpiryEdit = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

const afterExpiryEditProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

assert(
afterExpiryEdit !== null,
"Batch still exists after expiry edit"
);

assert(
afterExpiryEdit!.quantity === 5,
"Batch quantity remains 5 after expiry edit"
);

assert(
afterExpiryEdit!.expiryDate.getTime() === editedExpiry.getTime(),
"Expiry date was changed"
);

assert(
afterExpiryEdit!.status === "ACTIVE",
"Future expiry keeps Batch ACTIVE"
);

assert(
afterExpiryEditProduct!.stock === 5,
"Product.stock remains 5"
);

console.log("");

// ===========================================================================
// 5. TRY TO INCREASE QUANTITY
// ===========================================================================

console.log("5. TRY TO CHANGE QUANTITY 5 → 10");
console.log("------------------------------------------------------------------------------");

const increaseResult = await callPut(batch.id, {
quantity: 10,
expiryDate: editedExpiry.toISOString(),
});

console.log(`HTTP ${increaseResult.response.status}`);
console.log(increaseResult.json);
console.log("");

assert(
increaseResult.response.status === 400,
"Increasing Batch.quantity is rejected with HTTP 400"
);

const afterIncreaseAttempt = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

const afterIncreaseAttemptProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

assert(
afterIncreaseAttempt!.quantity === 5,
"Quantity remains 5 after rejected increase"
);

assert(
afterIncreaseAttempt!.expiryDate.getTime() === editedExpiry.getTime(),
"Expiry date remains unchanged after rejected increase"
);

assert(
afterIncreaseAttemptProduct!.stock === 5,
"Product.stock remains 5 after rejected increase"
);

console.log("");

// ===========================================================================
// 6. TRY TO DECREASE QUANTITY
// ===========================================================================

console.log("6. TRY TO CHANGE QUANTITY 5 → 3");
console.log("------------------------------------------------------------------------------");

const decreaseResult = await callPut(batch.id, {
quantity: 3,
expiryDate: editedExpiry.toISOString(),
});

console.log(`HTTP ${decreaseResult.response.status}`);
console.log(decreaseResult.json);
console.log("");

assert(
decreaseResult.response.status === 400,
"Decreasing Batch.quantity is rejected with HTTP 400"
);

const afterDecreaseAttempt = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

const afterDecreaseAttemptProduct = await prisma.product.findUnique({
where: {
id: product.id,
},
});

assert(
afterDecreaseAttempt!.quantity === 5,
"Quantity remains 5 after rejected decrease"
);

assert(
afterDecreaseAttemptProduct!.stock === 5,
"Product.stock remains 5 after rejected decrease"
);

console.log("");

// ===========================================================================
// 7. CHANGE EXPIRY TO PAST
// ===========================================================================

console.log("7. CHANGE EXPIRY TO PAST DATE");
console.log("------------------------------------------------------------------------------");

const expiredResult = await callPut(batch.id, {
quantity: 5,
expiryDate: expiredExpiry.toISOString(),
});

console.log(`HTTP ${expiredResult.response.status}`);
console.log(expiredResult.json);
console.log("");

assert(
expiredResult.response.status === 200,
"Changing expiry to past date returns HTTP 200"
);

const afterExpiredEdit = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

assert(
afterExpiredEdit!.quantity === 5,
"Expired Batch still contains 5 units"
);

assert(
afterExpiredEdit!.status === "EXPIRED",
"Past expiry automatically changes status to EXPIRED"
);

console.log("");

// ===========================================================================
// 8. CHANGE EXPIRED BATCH BACK TO FUTURE
// ===========================================================================

console.log("8. CHANGE EXPIRED BATCH BACK TO FUTURE");
console.log("------------------------------------------------------------------------------");

const reactivateResult = await callPut(batch.id, {
quantity: 5,
expiryDate: editedExpiry.toISOString(),
});

console.log(`HTTP ${reactivateResult.response.status}`);
console.log(reactivateResult.json);
console.log("");

assert(
reactivateResult.response.status === 200,
"Changing expiry back to future returns HTTP 200"
);

const afterReactivate = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

assert(
afterReactivate!.quantity === 5,
"Quantity remains 5"
);

assert(
afterReactivate!.status === "ACTIVE",
"Future expiry changes status back to ACTIVE"
);

console.log("");

// ===========================================================================
// 9. TEST INVALID QUANTITY
// ===========================================================================

console.log("9. INVALID QUANTITY VALIDATION");
console.log("------------------------------------------------------------------------------");

const invalidQuantityTests = [
{
name: "negative quantity",
quantity: -1,
},
{
name: "fractional quantity",
quantity: 2.5,
},
{
name: "string quantity",
quantity: "5",
},
];

for (const test of invalidQuantityTests) {
const result = await callPut(batch.id, {
quantity: test.quantity,
expiryDate: editedExpiry.toISOString(),
});


console.log(
  `${test.name}: HTTP ${result.response.status}`
);

assert(
  result.response.status === 400,
  `${test.name} is rejected`
);


}

console.log("");

// ===========================================================================
// 10. INVALID EXPIRY DATE
// ===========================================================================

console.log("10. INVALID EXPIRY DATE VALIDATION");
console.log("------------------------------------------------------------------------------");

const invalidExpiryResult = await callPut(batch.id, {
quantity: 5,
expiryDate: "not-a-date",
});

console.log(`HTTP ${invalidExpiryResult.response.status}`);
console.log(invalidExpiryResult.json);
console.log("");

assert(
invalidExpiryResult.response.status === 400,
"Invalid expiry date is rejected"
);

const afterInvalidExpiry = await prisma.batch.findUnique({
where: {
id: batch.id,
},
});

assert(
afterInvalidExpiry!.quantity === 5,
"Quantity remains unchanged after invalid expiry"
);

assert(
afterInvalidExpiry!.expiryDate.getTime() === editedExpiry.getTime(),
"Expiry remains unchanged after invalid expiry"
);

console.log("");

// ===========================================================================
// 11. INVALID BATCH ID
// ===========================================================================

console.log("11. INVALID BATCH ID");
console.log("------------------------------------------------------------------------------");

const invalidIdResult = await callPut(999999999, {
quantity: 5,
expiryDate: editedExpiry.toISOString(),
});

console.log(`HTTP ${invalidIdResult.response.status}`);
console.log(invalidIdResult.json);
console.log("");

assert(
invalidIdResult.response.status === 404,
"Non-existing Batch returns HTTP 404"
);

console.log("");

// ===========================================================================
// 12. MOVEMENT INTEGRITY
// ===========================================================================

console.log("12. MOVEMENT INTEGRITY");
console.log("------------------------------------------------------------------------------");

const movements = await prisma.movement.findMany({
where: {
productId: product.id,
},
orderBy: {
id: "asc",
},
});

console.log(`Movement count=${movements.length}`);

for (const movement of movements) {
console.log(
`Movement #${movement.id} | ` +
`type=${movement.type} | ` +
`quantity=${movement.quantity} | ` +
`comment=${movement.comment ?? ""}`
);
}

console.log("");

assert(
movements.length === 1,
"Batch editing created no additional Movement records"
);

assert(
movements[0].type === "TEST",
"Only the initial test Movement exists"
);

console.log("");

// ===========================================================================
// 13. STOCK INTEGRITY
// ===========================================================================

console.log("13. STOCK INTEGRITY");
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

const batchAggregate = await prisma.batch.aggregate({
where: {
productId: product.id,
},
_sum: {
quantity: true,
},
});

console.log(`Product.stock=${finalProduct!.stock}`);
console.log(
`SUM(Batch.quantity)=${batchAggregate._sum.quantity ?? 0}`
);
console.log(`Batch.quantity=${finalBatch!.quantity}`);
console.log(`Batch.status=${finalBatch!.status}`);
console.log("");

assert(
finalProduct!.stock === 5,
"Product.stock remains 5"
);

assert(
(batchAggregate._sum.quantity ?? 0) === 5,
"Sum of Batch.quantity remains 5"
);

assert(
finalProduct!.stock === (batchAggregate._sum.quantity ?? 0),
"Product.stock equals sum of Batch.quantity"
);

console.log("");

// ===========================================================================
// 14. CLEANUP
// ===========================================================================

console.log("14. CLEANUP");
console.log("------------------------------------------------------------------------------");

await cleanup();

const remainingProducts = await prisma.product.count({
where: {
name: TEST_PRODUCT_NAME,
},
});

assert(
remainingProducts === 0,
"V37 test Product removed"
);

console.log("");

// ===========================================================================
// 15. FINAL RESULT
// ===========================================================================

console.log("==============================================================================");
console.log("V37 FINAL RESULT");
console.log("==============================================================================");
console.log("");
console.log("🟢 V37 PASSED");
console.log("");
console.log("Verified:");
console.log("✔ Expiry date can be edited");
console.log("✔ Future expiry => ACTIVE");
console.log("✔ Past expiry => EXPIRED");
console.log("✔ Quantity cannot be increased");
console.log("✔ Quantity cannot be decreased");
console.log("✔ Invalid quantity is rejected");
console.log("✔ Invalid expiry date is rejected");
console.log("✔ Non-existing Batch returns 404");
console.log("✔ Product.stock is preserved");
console.log("✔ Batch.quantity is preserved");
console.log("✔ No Movement is created by editing a Batch");
console.log("✔ Product.stock == SUM(Batch.quantity)");
console.log("✔ Test data was removed");
console.log("");
console.log("SAFE BATCH EDIT BEHAVIOR VERIFIED.");
console.log("");
}

main()
.catch((error) => {
console.error("");
console.error("🔴 V37 FAILED");
console.error("");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});