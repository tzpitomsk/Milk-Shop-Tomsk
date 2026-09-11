import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";
const marker = `V45-${Date.now()}`;

let productId: number | null = null;
let supplierId: number | null = null;
let supplyId: number | null = null;
let batchId: number | null = null;

async function api(
path: string,
options: RequestInit = {}
): Promise<{ status: number; data: any }> {
const response = await fetch(`${BASE_URL}${path}`, {
...options,
headers: {
"Content-Type": "application/json",
...(options.headers ?? {}),
},
});

const text = await response.text();

let data: any;

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

function assert(condition: boolean, message: string): asserts condition {
if (!condition) {
throw new Error(`🔴 ASSERTION FAILED: ${message}`);
}
}

function requireId(value: number | null, name: string): number {
assert(value !== null, `${name} must be initialized`);
return value;
}

async function cleanup() {
console.log("");
console.log("==============================================================================");
console.log("V45 CLEANUP");
console.log("==============================================================================");

if (batchId !== null) {
const deletedReturnBatches = await prisma.returnBatch.deleteMany({
where: {
batchId,
},
});


console.log(
  `Deleted return batches=${deletedReturnBatches.count}`
);

const deletedOrderBatches = await prisma.orderBatch.deleteMany({
  where: {
    batchId,
  },
});

console.log(
  `Deleted order batches=${deletedOrderBatches.count}`
);


}

if (productId !== null) {
const deletedOrderItems = await prisma.orderItem.deleteMany({
where: {
productId,
},
});


console.log(
  `Deleted order items=${deletedOrderItems.count}`
);

const deletedMovements = await prisma.movement.deleteMany({
  where: {
    productId,
  },
});

console.log(
  `Deleted movements=${deletedMovements.count}`
);

const deletedSupplyItems = await prisma.supplyItem.deleteMany({
  where: {
    productId,
  },
});

console.log(
  `Deleted supply items=${deletedSupplyItems.count}`
);

const deletedBatches = await prisma.batch.deleteMany({
  where: {
    productId,
  },
});

console.log(
  `Deleted batches=${deletedBatches.count}`
);

const deletedProducts = await prisma.product.deleteMany({
  where: {
    id: productId,
  },
});

console.log(
  `Deleted products=${deletedProducts.count}`
);


}

if (supplyId !== null) {
const deletedSupplies = await prisma.supply.deleteMany({
where: {
id: supplyId,
},
});


console.log(
  `Deleted supplies=${deletedSupplies.count}`
);


}

if (supplierId !== null) {
const deletedSuppliers = await prisma.supplier.deleteMany({
where: {
id: supplierId,
},
});


console.log(
  `Deleted suppliers=${deletedSuppliers.count}`
);


}

console.log("🟢 CLEANUP COMPLETED");
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V45 WRITE-OFF / STOCK INTEGRITY E2E TEST");
console.log("==============================================================================");
console.log("");
console.log(`BASE_URL=[${BASE_URL}]`);
console.log("");
console.log("TEST PURPOSE:");
console.log("");
console.log("Write-off decreases Batch.quantity.");
console.log("Write-off decreases Product.stock.");
console.log("Write-off creates a negative WRITE_OFF Movement.");
console.log("Partial write-off keeps the batch active when it is not expired.");
console.log("Full write-off changes the batch status to EMPTY.");
console.log("Write-off cannot exceed current Batch.quantity.");
console.log("Invalid requests must not modify the database.");
console.log("");

// ===========================================================================
// 1. CREATE TEST PRODUCT
// ===========================================================================

console.log("==============================================================================");
console.log("1. CREATE TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const productResponse = await api("/api/products", {
method: "POST",
body: JSON.stringify({
name: `${marker} Партия`,
unit: "шт",
price: 300,
cost: 100,
barcode: marker,
}),
});

console.log(
`POST /api/products\nHTTP ${productResponse.status}`
);
console.log(
JSON.stringify(productResponse.data, null, 2)
);

assert(
productResponse.status === 200,
"Product creation must return HTTP 200"
);

productId = productResponse.data.id;

assert(
Number.isInteger(productId),
"Created product must have integer id"
);

assert(
productResponse.data.stock === 0,
"New product stock must be 0"
);

console.log(`Created Product #${productId}`);
console.log("🟢 Product created");

const pid = requireId(productId, "productId");

// ===========================================================================
// 2. CREATE TEST SUPPLIER
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("2. CREATE TEST SUPPLIER");
console.log("------------------------------------------------------------------------------");

const supplierResponse = await api("/api/suppliers", {
method: "POST",
body: JSON.stringify({
name: `${marker} Supplier`,
}),
});

console.log(
`POST /api/suppliers\nHTTP ${supplierResponse.status}`
);
console.log(
JSON.stringify(supplierResponse.data, null, 2)
);

assert(
supplierResponse.status === 200,
"Supplier creation must return HTTP 200"
);

supplierId = supplierResponse.data.id;

assert(
Number.isInteger(supplierId),
"Created supplier must have integer id"
);

console.log(`Created Supplier #${supplierId}`);
console.log("🟢 Supplier created");

const sid = requireId(supplierId, "supplierId");

// ===========================================================================
// 3. CREATE TEST SUPPLY
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("3. CREATE TEST SUPPLY");
console.log("------------------------------------------------------------------------------");

const supplyResponse = await api("/api/supplies", {
method: "POST",
body: JSON.stringify({
supplierId: sid,
items: [
{
id: pid,
quantity: 5,
cost: 100,
expiryDate: "2099-12-31",
},
],
}),
});

console.log(
`POST /api/supplies\nHTTP ${supplyResponse.status}`
);
console.log(
JSON.stringify(supplyResponse.data, null, 2)
);

assert(
supplyResponse.status === 200,
"Supply creation must return HTTP 200"
);

supplyId = supplyResponse.data.supply.id;

assert(
Number.isInteger(supplyId),
"Created supply must have integer id"
);

console.log(`Created Supply #${supplyId}`);
console.log("🟢 Supply created");

// ===========================================================================
// 4. LOAD INITIAL BATCH
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("4. LOAD INITIAL BATCH");
console.log("------------------------------------------------------------------------------");

const initialBatch = await prisma.batch.findFirst({
where: {
productId: pid,
},
orderBy: {
id: "desc",
},
});

if (!initialBatch) {
throw new Error("🔴 Initial test batch was not created");
}

batchId = initialBatch.id;

console.log(
`Batch #${initialBatch.id} | ` +
`quantity=${initialBatch.quantity} | ` +
`purchaseCost=${initialBatch.purchaseCost} | ` +
`status=${initialBatch.status}`
);

assert(
initialBatch.quantity === 5,
"Initial batch quantity must be 5"
);

assert(
initialBatch.purchaseCost === 100,
"Initial purchase cost must be 100"
);

assert(
initialBatch.status === "ACTIVE",
"Initial batch must be ACTIVE"
);

console.log("🟢 Initial Batch is correct");

const bid = requireId(batchId, "batchId");

// ===========================================================================
// 5. VERIFY INITIAL STOCK
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("5. VERIFY INITIAL STOCK");
console.log("------------------------------------------------------------------------------");

const initialProduct = await prisma.product.findUnique({
where: {
id: pid,
},
});

if (!initialProduct) {
throw new Error("🔴 Initial test product was not found");
}

const initialBatchSum = await prisma.batch.aggregate({
where: {
productId: pid,
},
_sum: {
quantity: true,
},
});

const initialStock = initialProduct.stock;
const initialBatchQuantity =
initialBatchSum._sum?.quantity ?? 0;

const initialMovementCount = await prisma.movement.count({
where: {
productId: pid,
},
});

console.log(
`Product #${pid} | ` +
`stock=${initialStock} | ` +
`SUM(Batch.quantity)=${initialBatchQuantity}`
);

console.log(
`Initial movement count=${initialMovementCount}`
);

assert(
initialStock === 5,
"Initial Product.stock must be 5"
);

assert(
initialBatchQuantity === 5,
"Initial SUM(Batch.quantity) must be 5"
);

assert(
initialStock === initialBatchQuantity,
"Initial stock invariant must hold"
);

assert(
initialMovementCount === 1,
"Initial movement count must be exactly 1"
);

console.log("🟢 Initial stock invariant passed");

// ===========================================================================
// 6. PARTIAL WRITE-OFF
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("6. PARTIAL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

const partialWriteOff = await api(
`/api/batches/${bid}/writeoff`,
{
method: "POST",
body: JSON.stringify({
quantity: 2,
reason: "V45 частичное списание",
}),
}
);

console.log(
`POST /api/batches/${bid}/writeoff quantity=2\n` +
`HTTP ${partialWriteOff.status}`
);

console.log(
JSON.stringify(partialWriteOff.data, null, 2)
);

assert(
partialWriteOff.status === 200,
"Partial write-off must return HTTP 200"
);

assert(
partialWriteOff.data.success === true,
"Partial write-off must return success=true"
);

assert(
partialWriteOff.data.data.batchId === bid,
"Partial write-off response must contain the correct batchId"
);

assert(
partialWriteOff.data.data.oldQuantity === 5,
"Partial write-off oldQuantity must be 5"
);

assert(
partialWriteOff.data.data.writeOff === 2,
"Partial write-off amount must be 2"
);

assert(
partialWriteOff.data.data.newQuantity === 3,
"Batch quantity must become 3 after writing off 2"
);

assert(
partialWriteOff.data.data.stock === 3,
"Stock must become 3 after partial write-off"
);

assert(
partialWriteOff.data.data.status === "ACTIVE",
"Batch must remain ACTIVE after partial write-off"
);

console.log("🟢 Partial write-off accepted");

// ===========================================================================
// 7. VERIFY PARTIAL WRITE-OFF
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("7. VERIFY PARTIAL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

const afterPartialBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!afterPartialBatch) {
throw new Error(
"🔴 Batch disappeared after partial write-off"
);
}

const afterPartialProduct = await prisma.product.findUnique({
where: {
id: pid,
},
});

if (!afterPartialProduct) {
throw new Error(
"🔴 Product disappeared after partial write-off"
);
}

const afterPartialBatchSum = await prisma.batch.aggregate({
where: {
productId: pid,
},
_sum: {
quantity: true,
},
});

const movementsAfterPartial = await prisma.movement.findMany({
where: {
productId: pid,
},
orderBy: {
id: "asc",
},
});

const partialBatchSum =
afterPartialBatchSum._sum?.quantity ?? 0;

console.log(
`Batch #${bid} | ` +
`quantity=${afterPartialBatch.quantity} | ` +
`status=${afterPartialBatch.status}`
);

console.log(
`Product.stock=${afterPartialProduct.stock}`
);

console.log(
`SUM(Batch.quantity)=${partialBatchSum}`
);

console.log(
`Movement count=${movementsAfterPartial.length}`
);

assert(
afterPartialBatch.quantity === 3,
"Batch quantity must be 3"
);

assert(
afterPartialBatch.status === "ACTIVE",
"Batch status must be ACTIVE"
);

assert(
afterPartialProduct.stock === 3,
"Product.stock must be 3"
);

assert(
partialBatchSum === 3,
"SUM(Batch.quantity) must be 3"
);

assert(
afterPartialProduct.stock === partialBatchSum,
"Stock invariant must hold after partial write-off"
);

assert(
movementsAfterPartial.length === 2,
"Exactly one new Movement must be created"
);

const partialMovement = movementsAfterPartial[1];

assert(
partialMovement.type === "WRITE_OFF",
"Partial write-off movement type must be WRITE_OFF"
);

assert(
partialMovement.quantity === -2,
"Partial write-off movement quantity must be -2"
);

assert(
partialMovement.comment ===
`V45 частичное списание. Партия №${bid}`,
"Partial write-off movement comment is incorrect"
);

console.log("🟢 Partial write-off integrity passed");

// ===========================================================================
// 8. FULL WRITE-OFF
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("8. FULL WRITE-OFF OF REMAINING QUANTITY");
console.log("------------------------------------------------------------------------------");

const fullWriteOff = await api(
`/api/batches/${bid}/writeoff`,
{
method: "POST",
body: JSON.stringify({
quantity: 3,
reason: "V45 полное списание",
}),
}
);

console.log(
`POST /api/batches/${bid}/writeoff quantity=3\n` +
`HTTP ${fullWriteOff.status}`
);

console.log(
JSON.stringify(fullWriteOff.data, null, 2)
);

assert(
fullWriteOff.status === 200,
"Full write-off must return HTTP 200"
);

assert(
fullWriteOff.data.success === true,
"Full write-off must return success=true"
);

assert(
fullWriteOff.data.data.batchId === bid,
"Full write-off response must contain the correct batchId"
);

assert(
fullWriteOff.data.data.oldQuantity === 3,
"Full write-off oldQuantity must be 3"
);

assert(
fullWriteOff.data.data.writeOff === 3,
"Full write-off amount must be 3"
);

assert(
fullWriteOff.data.data.newQuantity === 0,
"Batch quantity must become 0"
);

assert(
fullWriteOff.data.data.stock === 0,
"Product stock must become 0"
);

assert(
fullWriteOff.data.data.status === "EMPTY",
"Full write-off must set EMPTY status"
);

console.log("🟢 Full write-off accepted");

// ===========================================================================
// 9. VERIFY FULL WRITE-OFF
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("9. VERIFY FULL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

const afterFullBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!afterFullBatch) {
throw new Error(
"🔴 Batch disappeared after full write-off"
);
}

const afterFullProduct = await prisma.product.findUnique({
where: {
id: pid,
},
});

if (!afterFullProduct) {
throw new Error(
"🔴 Product disappeared after full write-off"
);
}

const afterFullBatchSum = await prisma.batch.aggregate({
where: {
productId: pid,
},
_sum: {
quantity: true,
},
});

const movementsAfterFull = await prisma.movement.findMany({
where: {
productId: pid,
},
orderBy: {
id: "asc",
},
});

const fullBatchSum =
afterFullBatchSum._sum?.quantity ?? 0;

console.log(
`Batch #${bid} | ` +
`quantity=${afterFullBatch.quantity} | ` +
`status=${afterFullBatch.status}`
);

console.log(
`Product.stock=${afterFullProduct.stock}`
);

console.log(
`SUM(Batch.quantity)=${fullBatchSum}`
);

console.log(
`Movement count=${movementsAfterFull.length}`
);

assert(
afterFullBatch.quantity === 0,
"Batch quantity must be 0"
);

assert(
afterFullBatch.status === "EMPTY",
"Batch status must be EMPTY"
);

assert(
afterFullProduct.stock === 0,
"Product.stock must be 0"
);

assert(
fullBatchSum === 0,
"SUM(Batch.quantity) must be 0"
);

assert(
afterFullProduct.stock === fullBatchSum,
"Final stock invariant must hold"
);

assert(
movementsAfterFull.length === 3,
"Exactly two WRITE_OFF movements must exist"
);

const fullMovement = movementsAfterFull[2];

assert(
fullMovement.type === "WRITE_OFF",
"Full write-off movement type must be WRITE_OFF"
);

assert(
fullMovement.quantity === -3,
"Full write-off movement quantity must be -3"
);

assert(
fullMovement.comment ===
`V45 полное списание. Партия №${bid}`,
"Full write-off movement comment is incorrect"
);

console.log("🟢 Full write-off integrity passed");

// ===========================================================================
// 10. EXCESSIVE WRITE-OFF
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("10. WRITE OFF MORE THAN CURRENT QUANTITY");
console.log("------------------------------------------------------------------------------");

const beforeExcessiveBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

const beforeExcessiveProduct = await prisma.product.findUnique({
where: {
id: pid,
},
});

if (!beforeExcessiveBatch) {
throw new Error(
"🔴 Batch missing before excessive write-off test"
);
}

if (!beforeExcessiveProduct) {
throw new Error(
"🔴 Product missing before excessive write-off test"
);
}

const beforeExcessiveMovements =
await prisma.movement.count({
where: {
productId: pid,
},
});

const excessiveWriteOff = await api(
`/api/batches/${bid}/writeoff`,
{
method: "POST",
body: JSON.stringify({
quantity: 1,
reason: "V45 excessive write-off",
}),
}
);

console.log(
`POST /api/batches/${bid}/writeoff quantity=1\n` +
`HTTP ${excessiveWriteOff.status}`
);

console.log(
JSON.stringify(excessiveWriteOff.data, null, 2)
);

assert(
excessiveWriteOff.status === 400,
"Excessive write-off must return HTTP 400"
);

console.log("🟢 Excessive write-off correctly rejected");

const afterExcessiveBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

const afterExcessiveProduct = await prisma.product.findUnique({
where: {
id: pid,
},
});

if (!afterExcessiveBatch) {
throw new Error(
"🔴 Batch disappeared after rejected write-off"
);
}

if (!afterExcessiveProduct) {
throw new Error(
"🔴 Product disappeared after rejected write-off"
);
}

const afterExcessiveMovements =
await prisma.movement.count({
where: {
productId: pid,
},
});

assert(
afterExcessiveBatch.quantity ===
beforeExcessiveBatch.quantity,
"Rejected excessive write-off must not change quantity"
);

assert(
afterExcessiveBatch.status ===
beforeExcessiveBatch.status,
"Rejected excessive write-off must not change status"
);

assert(
afterExcessiveProduct.stock ===
beforeExcessiveProduct.stock,
"Rejected excessive write-off must not change stock"
);

assert(
afterExcessiveMovements ===
beforeExcessiveMovements,
"Rejected excessive write-off must not create Movement"
);

console.log("🟢 Excessive write-off caused no mutation");

// ===========================================================================
// 11. ZERO QUANTITY
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("11. ZERO QUANTITY");
console.log("------------------------------------------------------------------------------");

const beforeZeroBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!beforeZeroBatch) {
throw new Error(
"🔴 Batch missing before zero quantity test"
);
}

const beforeZeroMovements = await prisma.movement.count({
where: {
productId: pid,
},
});

const zeroWriteOff = await api(
`/api/batches/${bid}/writeoff`,
{
method: "POST",
body: JSON.stringify({
quantity: 0,
reason: "V45 zero write-off",
}),
}
);

console.log(
`POST /api/batches/${bid}/writeoff quantity=0\n` +
`HTTP ${zeroWriteOff.status}`
);

console.log(
JSON.stringify(zeroWriteOff.data, null, 2)
);

assert(
zeroWriteOff.status === 400,
"Zero quantity must return HTTP 400"
);

const afterZeroBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!afterZeroBatch) {
throw new Error(
"🔴 Batch disappeared after zero quantity rejection"
);
}

const afterZeroMovements = await prisma.movement.count({
where: {
productId: pid,
},
});

assert(
afterZeroBatch.quantity ===
beforeZeroBatch.quantity,
"Zero quantity must not change Batch.quantity"
);

assert(
afterZeroMovements === beforeZeroMovements,
"Zero quantity must not create Movement"
);

console.log("🟢 Zero quantity correctly rejected");
console.log("🟢 Zero quantity caused no mutation");

// ===========================================================================
// 12. NEGATIVE QUANTITY
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("12. NEGATIVE QUANTITY");
console.log("------------------------------------------------------------------------------");

const beforeNegativeBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!beforeNegativeBatch) {
throw new Error(
"🔴 Batch missing before negative quantity test"
);
}

const beforeNegativeMovements =
await prisma.movement.count({
where: {
productId: pid,
},
});

const negativeWriteOff = await api(
`/api/batches/${bid}/writeoff`,
{
method: "POST",
body: JSON.stringify({
quantity: -1,
reason: "V45 negative write-off",
}),
}
);

console.log(
`POST /api/batches/${bid}/writeoff quantity=-1\n` +
`HTTP ${negativeWriteOff.status}`
);

console.log(
JSON.stringify(negativeWriteOff.data, null, 2)
);

assert(
negativeWriteOff.status === 400,
"Negative quantity must return HTTP 400"
);

const afterNegativeBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!afterNegativeBatch) {
throw new Error(
"🔴 Batch disappeared after negative quantity rejection"
);
}

const afterNegativeMovements =
await prisma.movement.count({
where: {
productId: pid,
},
});

assert(
afterNegativeBatch.quantity ===
beforeNegativeBatch.quantity,
"Negative quantity must not change Batch.quantity"
);

assert(
afterNegativeMovements ===
beforeNegativeMovements,
"Negative quantity must not create Movement"
);

console.log("🟢 Negative quantity correctly rejected");
console.log("🟢 Negative quantity caused no mutation");

// ===========================================================================
// 13. INVALID QUANTITY TYPE
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("13. INVALID QUANTITY TYPE");
console.log("------------------------------------------------------------------------------");

const beforeTypeBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!beforeTypeBatch) {
throw new Error(
"🔴 Batch missing before invalid quantity type test"
);
}

const beforeTypeMovements = await prisma.movement.count({
where: {
productId: pid,
},
});

const invalidTypeWriteOff = await api(
`/api/batches/${bid}/writeoff`,
{
method: "POST",
body: JSON.stringify({
quantity: "five",
reason: "V45 invalid quantity type",
}),
}
);

console.log(
`POST /api/batches/${bid}/writeoff quantity="five"\n` +
`HTTP ${invalidTypeWriteOff.status}`
);

console.log(
JSON.stringify(invalidTypeWriteOff.data, null, 2)
);

assert(
invalidTypeWriteOff.status === 400,
"Invalid quantity type must return HTTP 400"
);

const afterTypeBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!afterTypeBatch) {
throw new Error(
"🔴 Batch disappeared after invalid quantity type rejection"
);
}

const afterTypeMovements = await prisma.movement.count({
where: {
productId: pid,
},
});

assert(
afterTypeBatch.quantity ===
beforeTypeBatch.quantity,
"Invalid quantity type must not change Batch.quantity"
);

assert(
afterTypeMovements ===
beforeTypeMovements,
"Invalid quantity type must not create Movement"
);

console.log("🟢 Invalid quantity type correctly rejected");
console.log("🟢 Invalid quantity type caused no mutation");

// ===========================================================================
// 14. UNKNOWN BATCH
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("14. UNKNOWN BATCH");
console.log("------------------------------------------------------------------------------");

const unknownBatchResponse = await api(
"/api/batches/999999999/writeoff",
{
method: "POST",
body: JSON.stringify({
quantity: 1,
reason: "V45 unknown batch",
}),
}
);

console.log(
`POST /api/batches/999999999/writeoff\n` +
`HTTP ${unknownBatchResponse.status}`
);

console.log(
JSON.stringify(
unknownBatchResponse.data,
null,
2
)
);

assert(
unknownBatchResponse.status === 404,
"Unknown batch must return HTTP 404"
);

console.log("🟢 Unknown Batch correctly rejected");

// ===========================================================================
// 15. FINAL INTEGRITY
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("15. FINAL WRITE-OFF / STOCK INTEGRITY");
console.log("------------------------------------------------------------------------------");

const finalBatch = await prisma.batch.findUnique({
where: {
id: bid,
},
});

if (!finalBatch) {
throw new Error(
"🔴 Final test batch was not found"
);
}

const finalProduct = await prisma.product.findUnique({
where: {
id: pid,
},
});

if (!finalProduct) {
throw new Error(
"🔴 Final test product was not found"
);
}

const finalBatchSum = await prisma.batch.aggregate({
where: {
productId: pid,
},
_sum: {
quantity: true,
},
});

const finalSupplyItems = await prisma.supplyItem.aggregate({
where: {
productId: pid,
},
_sum: {
quantity: true,
},
});

const finalWriteOffMovements =
await prisma.movement.findMany({
where: {
productId: pid,
type: "WRITE_OFF",
},
orderBy: {
id: "asc",
},
});

const finalAllMovements = await prisma.movement.findMany({
where: {
productId: pid,
},
orderBy: {
id: "asc",
},
});

const finalBatchQuantity =
finalBatchSum._sum?.quantity ?? 0;

const finalSupplyQuantity =
finalSupplyItems._sum?.quantity ?? 0;

const totalWriteOff =
finalWriteOffMovements.reduce(
(sum, movement) =>
sum + movement.quantity,
0
);

console.log(
`Batch #${bid} | ` +
`quantity=${finalBatch.quantity} | ` +
`purchaseCost=${finalBatch.purchaseCost} | ` +
`status=${finalBatch.status}`
);

console.log(
`Product.stock=${finalProduct.stock}`
);

console.log(
`SUM(Batch.quantity)=${finalBatchQuantity}`
);

console.log(
`SUM(SupplyItem.quantity)=${finalSupplyQuantity}`
);

console.log(
`SUM(WRITE_OFF Movement.quantity)=${totalWriteOff}`
);

console.log(
`Movement count=${finalAllMovements.length}`
);

assert(
finalBatch.quantity === 0,
"Final batch quantity must be 0"
);

assert(
finalBatch.status === "EMPTY",
"Final batch status must be EMPTY"
);

assert(
finalProduct.stock === 0,
"Final Product.stock must be 0"
);

assert(
finalBatchQuantity === 0,
"Final SUM(Batch.quantity) must be 0"
);

assert(
finalSupplyQuantity === 5,
"SupplyItem quantity must remain 5"
);

assert(
finalWriteOffMovements.length === 2,
"Exactly two WRITE_OFF movements must exist"
);

assert(
finalWriteOffMovements[0].quantity === -2,
"First WRITE_OFF movement must be -2"
);

assert(
finalWriteOffMovements[1].quantity === -3,
"Second WRITE_OFF movement must be -3"
);

assert(
totalWriteOff === -5,
"Total WRITE_OFF quantity must be -5"
);

assert(
finalAllMovements.length === 3,
"There must be one SUPPLY and two WRITE_OFF movements"
);

assert(
finalAllMovements[0].type === "SUPPLY",
"First movement must be SUPPLY"
);

assert(
finalAllMovements[0].quantity === 5,
"SUPPLY movement quantity must be +5"
);

assert(
finalProduct.stock === finalBatchQuantity,
"Product.stock must equal SUM(Batch.quantity)"
);

console.log("🟢 FINAL WRITE-OFF INTEGRITY PASSED");
console.log("🟢 FINAL STOCK INVARIANT PASSED");
console.log("🟢 WRITE_OFF MOVEMENTS PASSED");
console.log("🟢 INVALID REQUESTS CAUSED NO MUTATION");

// ===========================================================================
// 16. FINAL RESULT
// ===========================================================================

console.log("");
console.log("==============================================================================");
console.log("V45 FINAL RESULT");
console.log("==============================================================================");
console.log("");
console.log("🟢 V45 PASSED");
console.log("");
console.log("Verified:");
console.log("");
console.log("🟢 Product creation");
console.log("🟢 Supplier creation");
console.log("🟢 Supply creation");
console.log("🟢 Batch creation");
console.log("🟢 Partial write-off");
console.log("🟢 Full write-off");
console.log("🟢 Batch quantity decreases correctly");
console.log("🟢 Product.stock decreases correctly");
console.log("🟢 Partial write-off keeps ACTIVE status");
console.log("🟢 Full write-off sets EMPTY status");
console.log("🟢 WRITE_OFF movements");
console.log("🟢 Excessive write-off rejected");
console.log("🟢 Zero quantity rejected");
console.log("🟢 Negative quantity rejected");
console.log("🟢 Invalid quantity type rejected");
console.log("🟢 Unknown batch rejected");
console.log("🟢 Invalid requests do not mutate data");
console.log("🟢 Final stock invariant");
console.log("🟢 Final batch integrity");
console.log("");

console.log("==============================================================================");
console.log("V45 COMPLETED");
console.log("==============================================================================");
}

async function run() {
try {
await main();
} catch (error) {
console.error("");
console.error("🔴 V45 TEST FAILED");
console.error(error);
console.error("");


try {
  await cleanup();
} catch (cleanupError) {
  console.error("🔴 CLEANUP FAILED");
  console.error(cleanupError);
}

process.exitCode = 1;


} finally {
await prisma.$disconnect();
}
}

run();
