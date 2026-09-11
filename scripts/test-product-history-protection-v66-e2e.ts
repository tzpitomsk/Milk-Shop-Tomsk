import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

type ApiResponse = {
status: number;
data: any;
};

async function request(
path: string,
options: RequestInit = {}
): Promise<ApiResponse> {
const response = await fetch(`${BASE_URL}${path}`, {
...options,
headers: {
"Content-Type": "application/json",
...(options.headers ?? {}),
},
});

let data: any = null;

try {
data = await response.json();
} catch {
data = null;
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
): void {
assert.equal(
actual,
expected,
`${message}: expected HTTP ${expected}, received HTTP ${actual}`
);
}

function getId(data: any, entityName: string): number {
const id =
data?.id ??
data?.product?.id ??
data?.data?.id ??
data?.data?.product?.id;

const numericId = Number(id);

assert.ok(
Number.isInteger(numericId) && numericId > 0,
`Could not determine ${entityName} id`
);

return numericId;
}

async function cleanup(
productId: number | null,
supplierId: number | null,
supplyId: number | null
): Promise<void> {
try {
if (supplyId !== null) {
await prisma.supplyItem.deleteMany({
where: {
supplyId,
},
});


  await prisma.supply.deleteMany({
    where: {
      id: supplyId,
    },
  });
}

if (productId !== null) {
  await prisma.movement.deleteMany({
    where: {
      productId,
    },
  });

  await prisma.batch.deleteMany({
    where: {
      productId,
    },
  });

  await prisma.product.deleteMany({
    where: {
      id: productId,
    },
  });
}

if (supplierId !== null) {
  await prisma.supplier.deleteMany({
    where: {
      id: supplierId,
    },
  });
}


} catch (error) {
console.error("");
console.error("🔴 CLEANUP ERROR");


if (error instanceof Error) {
  console.error(error.message);
} else {
  console.error(error);
}

throw error;


}
}

async function main(): Promise<void> {
console.log("");
console.log("==============================================================================");
console.log("V66 PRODUCT HISTORY PROTECTION E2E TEST");
console.log("==============================================================================");
console.log("");

const suffix = Date.now();

let productId: number | null = null;
let supplierId: number | null = null;
let supplyId: number | null = null;

try {
// =========================================================================
// 1. CREATE TEST PRODUCT
// =========================================================================


console.log("1. CREATE TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const productResponse = await request("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: `V66_PRODUCT_HISTORY_TEST_${suffix}`,
    unit: "шт",
    price: 300,
    cost: 100,
    barcode: `V66-${suffix}`,
  }),
});

console.log(`HTTP ${productResponse.status}`);
console.log(
  JSON.stringify(productResponse.data, null, 2)
);

assertStatus(
  productResponse.status,
  200,
  "Product creation"
);

productId = getId(
  productResponse.data,
  "Product"
);

console.log(`Product #${productId} created`);
console.log("");

// =========================================================================
// 2. CREATE TEST SUPPLIER
// =========================================================================

console.log("2. CREATE TEST SUPPLIER");
console.log("------------------------------------------------------------------------------");

const supplierResponse = await request("/api/suppliers", {
  method: "POST",
  body: JSON.stringify({
    name: `V66_PRODUCT_HISTORY_SUPPLIER_${suffix}`,
  }),
});

console.log(`HTTP ${supplierResponse.status}`);
console.log(
  JSON.stringify(supplierResponse.data, null, 2)
);

assertStatus(
  supplierResponse.status,
  200,
  "Supplier creation"
);

supplierId = getId(
  supplierResponse.data,
  "Supplier"
);

console.log(`Supplier #${supplierId} created`);
console.log("");

// =========================================================================
// 3. CREATE SUPPLY THROUGH REAL API
// =========================================================================

console.log("3. CREATE SUPPLY THROUGH API");
console.log("------------------------------------------------------------------------------");

const supplyResponse = await request("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productId,
        quantity: 5,
        cost: 100,
        expiryDate: "2026-10-10",
      },
    ],
  }),
});

console.log(`HTTP ${supplyResponse.status}`);
console.log(
  JSON.stringify(supplyResponse.data, null, 2)
);

assertStatus(
  supplyResponse.status,
  200,
  "Supply creation"
);

supplyId = getId(
  supplyResponse.data?.supply ?? supplyResponse.data,
  "Supply"
);

console.log(`Supply #${supplyId} created`);
console.log("");

// =========================================================================
// 4. VERIFY SUPPLY HISTORY
// =========================================================================

console.log("4. VERIFY SUPPLY HISTORY");
console.log("------------------------------------------------------------------------------");

const supply = await prisma.supply.findUnique({
  where: {
    id: supplyId,
  },
  include: {
    items: true,
  },
});

assert.ok(
  supply,
  `Supply #${supplyId} must exist`
);

assert.equal(
  supply.supplierId,
  supplierId,
  "Supply supplierId must match"
);

assert.equal(
  supply.total,
  500,
  "Supply total must equal 500"
);

assert.equal(
  supply.items.length,
  1,
  "Supply must contain exactly one SupplyItem"
);

const supplyItem = supply.items[0];

assert.equal(
  supplyItem.productId,
  productId,
  "SupplyItem productId must match test Product"
);

assert.equal(
  supplyItem.quantity,
  5,
  "SupplyItem quantity must equal 5"
);

assert.equal(
  supplyItem.cost,
  100,
  "SupplyItem cost must equal 100"
);

console.log(
  `Supply #${supply.id} total=${supply.total}`
);

console.log(
  `SupplyItem #${supplyItem.id} quantity=${supplyItem.quantity}`
);

console.log(
  `SupplyItem #${supplyItem.id} cost=${supplyItem.cost}`
);

console.log("");
console.log("🟢 Supply history created correctly");
console.log("");

// =========================================================================
// 5. VERIFY CREATED BATCH
// =========================================================================

console.log("5. VERIFY CREATED BATCH");
console.log("------------------------------------------------------------------------------");

const batches = await prisma.batch.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

assert.equal(
  batches.length,
  1,
  "Test Product must have exactly one Batch"
);

const batch = batches[0];

assert.equal(
  batch.quantity,
  5,
  "Batch quantity must equal 5"
);

assert.equal(
  batch.purchaseCost,
  100,
  "Batch purchaseCost must equal 100"
);

assert.equal(
  batch.status,
  "ACTIVE",
  "Batch status must be ACTIVE"
);

assert.equal(
  batch.productId,
  productId,
  "Batch productId must match test Product"
);

console.log(`Batch #${batch.id} quantity=${batch.quantity}`);
console.log(
  `Batch #${batch.id} purchaseCost=${batch.purchaseCost}`
);
console.log(`Batch #${batch.id} status=${batch.status}`);

console.log("");
console.log("🟢 Batch history created correctly");
console.log("");

// =========================================================================
// 6. VERIFY PRODUCT STOCK
// =========================================================================

console.log("6. VERIFY PRODUCT STOCK");
console.log("------------------------------------------------------------------------------");

const productBeforeDelete = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.ok(
  productBeforeDelete,
  `Product #${productId} must exist`
);

const batchSumBeforeDelete = batches.reduce(
  (sum, currentBatch) => sum + currentBatch.quantity,
  0
);

assert.equal(
  productBeforeDelete.stock,
  5,
  "Product.stock must equal 5"
);

assert.equal(
  batchSumBeforeDelete,
  5,
  "SUM(Batch.quantity) must equal 5"
);

assert.equal(
  productBeforeDelete.stock,
  batchSumBeforeDelete,
  "Product.stock must equal SUM(Batch.quantity)"
);

console.log(
  `Product.stock=${productBeforeDelete.stock}`
);

console.log(
  `SUM(Batch.quantity)=${batchSumBeforeDelete}`
);

console.log("");
console.log("🟢 Initial stock state correct");
console.log("");

// =========================================================================
// 7. VERIFY SUPPLY MOVEMENT
// =========================================================================

console.log("7. VERIFY SUPPLY MOVEMENT");
console.log("------------------------------------------------------------------------------");

const supplyMovement = await prisma.movement.findFirst({
  where: {
    productId,
    type: "SUPPLY",
  },
  orderBy: {
    id: "desc",
  },
});

assert.ok(
  supplyMovement,
  "SUPPLY movement must exist"
);

assert.equal(
  supplyMovement.quantity,
  5,
  "SUPPLY movement quantity must equal 5"
);

assert.equal(
  supplyMovement.comment,
  `Приход поставка №${supplyId}`,
  "SUPPLY movement comment must reference the created Supply"
);

console.log(
  `Movement #${supplyMovement.id} type=${supplyMovement.type}`
);

console.log(
  `Movement quantity=${supplyMovement.quantity}`
);

console.log(
  `Movement comment="${supplyMovement.comment}"`
);

console.log("");
console.log("🟢 Supply movement created correctly");
console.log("");

// =========================================================================
// 8. CAPTURE COMPLETE PRE-DELETE STATE
// =========================================================================

console.log("8. CAPTURE COMPLETE PRE-DELETE STATE");
console.log("------------------------------------------------------------------------------");

const supplyDateBeforeDelete = supply.date.getTime();
const supplyTotalBeforeDelete = supply.total;
const supplyItemId = supplyItem.id;
const supplyItemQuantityBeforeDelete = supplyItem.quantity;
const supplyItemCostBeforeDelete = supplyItem.cost;

const batchId = batch.id;
const batchQuantityBeforeDelete = batch.quantity;
const batchPurchaseCostBeforeDelete = batch.purchaseCost;
const batchStatusBeforeDelete = batch.status;

const movementId = supplyMovement.id;
const movementQuantityBeforeDelete =
  supplyMovement.quantity;
const movementCommentBeforeDelete =
  supplyMovement.comment;

const productStockBeforeDelete =
  productBeforeDelete.stock;

const productNameBeforeDelete =
  productBeforeDelete.name;

const productBarcodeBeforeDelete =
  productBeforeDelete.barcode;

console.log(
  `Supply #${supplyId}: total=${supplyTotalBeforeDelete}`
);

console.log(
  `SupplyItem #${supplyItemId}: quantity=${supplyItemQuantityBeforeDelete}, cost=${supplyItemCostBeforeDelete}`
);

console.log(
  `Batch #${batchId}: quantity=${batchQuantityBeforeDelete}, purchaseCost=${batchPurchaseCostBeforeDelete}, status=${batchStatusBeforeDelete}`
);

console.log(
  `Movement #${movementId}: quantity=${movementQuantityBeforeDelete}`
);

console.log(
  `Product #${productId}: stock=${productStockBeforeDelete}`
);

console.log("");
console.log("🟢 Complete pre-delete state captured");
console.log("");

// =========================================================================
// 9. CAPTURE GLOBAL COUNTS
// =========================================================================

console.log("9. CAPTURE GLOBAL COUNTS");
console.log("------------------------------------------------------------------------------");

const countsBefore = {
  product: await prisma.product.count(),
  supplier: await prisma.supplier.count(),
  supply: await prisma.supply.count(),
  supplyItem: await prisma.supplyItem.count(),
  batch: await prisma.batch.count(),
  movement: await prisma.movement.count(),
};

console.log(`Product count=${countsBefore.product}`);
console.log(`Supplier count=${countsBefore.supplier}`);
console.log(`Supply count=${countsBefore.supply}`);
console.log(`SupplyItem count=${countsBefore.supplyItem}`);
console.log(`Batch count=${countsBefore.batch}`);
console.log(`Movement count=${countsBefore.movement}`);

console.log("");

// =========================================================================
// 10. ATTEMPT PRODUCT DELETE
// =========================================================================

console.log("10. ATTEMPT DELETE PRODUCT WITH HISTORY");
console.log("------------------------------------------------------------------------------");

const deleteResponse = await request(
  `/api/products/${productId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${deleteResponse.status}`);
console.log(
  JSON.stringify(deleteResponse.data, null, 2)
);

assert.notEqual(
  deleteResponse.status,
  200,
  "Product with history must not be deleted"
);

console.log("");
console.log(
  "🟢 DELETE Product with history was correctly rejected"
);
console.log("");

// =========================================================================
// 11. VERIFY PRODUCT STILL EXISTS
// =========================================================================

console.log("11. VERIFY PRODUCT STILL EXISTS");
console.log("------------------------------------------------------------------------------");

const productAfterDeleteAttempt =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert.ok(
  productAfterDeleteAttempt,
  "Product must still exist after rejected DELETE"
);

assert.equal(
  productAfterDeleteAttempt.name,
  productNameBeforeDelete,
  "Product name must remain unchanged"
);

assert.equal(
  productAfterDeleteAttempt.barcode,
  productBarcodeBeforeDelete,
  "Product barcode must remain unchanged"
);

assert.equal(
  productAfterDeleteAttempt.stock,
  productStockBeforeDelete,
  "Product.stock must remain unchanged"
);

console.log(
  `Product #${productId} still exists`
);

console.log(
  `Product.stock=${productAfterDeleteAttempt.stock}`
);

console.log("");
console.log("🟢 Product remained unchanged");
console.log("");

// =========================================================================
// 12. VERIFY SUPPLY STILL EXISTS
// =========================================================================

console.log("12. VERIFY SUPPLY STILL EXISTS");
console.log("------------------------------------------------------------------------------");

const supplyAfterDeleteAttempt =
  await prisma.supply.findUnique({
    where: {
      id: supplyId,
    },
    include: {
      items: true,
    },
  });

assert.ok(
  supplyAfterDeleteAttempt,
  "Supply must still exist after rejected Product DELETE"
);

assert.equal(
  supplyAfterDeleteAttempt.supplierId,
  supplierId,
  "Supply supplierId must remain unchanged"
);

assert.equal(
  supplyAfterDeleteAttempt.total,
  supplyTotalBeforeDelete,
  "Supply total must remain unchanged"
);

assert.equal(
  supplyAfterDeleteAttempt.date.getTime(),
  supplyDateBeforeDelete,
  "Supply date must remain unchanged"
);

assert.equal(
  supplyAfterDeleteAttempt.items.length,
  1,
  "Supply must still contain one SupplyItem"
);

const supplyItemAfterDelete =
  supplyAfterDeleteAttempt.items[0];

assert.equal(
  supplyItemAfterDelete.id,
  supplyItemId,
  "SupplyItem id must remain unchanged"
);

assert.equal(
  supplyItemAfterDelete.quantity,
  supplyItemQuantityBeforeDelete,
  "SupplyItem quantity must remain unchanged"
);

assert.equal(
  supplyItemAfterDelete.cost,
  supplyItemCostBeforeDelete,
  "SupplyItem cost must remain unchanged"
);

console.log(
  `Supply #${supplyId} still exists`
);

console.log(
  `SupplyItem #${supplyItemId} still exists`
);

console.log("");
console.log("🟢 Supply history remained unchanged");
console.log("");

// =========================================================================
// 13. VERIFY BATCH STILL EXISTS
// =========================================================================

console.log("13. VERIFY BATCH STILL EXISTS");
console.log("------------------------------------------------------------------------------");

const batchAfterDeleteAttempt =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert.ok(
  batchAfterDeleteAttempt,
  "Batch must still exist after rejected Product DELETE"
);

assert.equal(
  batchAfterDeleteAttempt.productId,
  productId,
  "Batch productId must remain unchanged"
);

assert.equal(
  batchAfterDeleteAttempt.quantity,
  batchQuantityBeforeDelete,
  "Batch quantity must remain unchanged"
);

assert.equal(
  batchAfterDeleteAttempt.purchaseCost,
  batchPurchaseCostBeforeDelete,
  "Batch purchaseCost must remain unchanged"
);

assert.equal(
  batchAfterDeleteAttempt.status,
  batchStatusBeforeDelete,
  "Batch status must remain unchanged"
);

console.log(
  `Batch #${batchId} still exists`
);

console.log(
  `Batch quantity=${batchAfterDeleteAttempt.quantity}`
);

console.log(
  `Batch purchaseCost=${batchAfterDeleteAttempt.purchaseCost}`
);

console.log(
  `Batch status=${batchAfterDeleteAttempt.status}`
);

console.log("");
console.log("🟢 Batch remained unchanged");
console.log("");

// =========================================================================
// 14. VERIFY MOVEMENT STILL EXISTS
// =========================================================================

console.log("14. VERIFY MOVEMENT STILL EXISTS");
console.log("------------------------------------------------------------------------------");

const movementAfterDeleteAttempt =
  await prisma.movement.findUnique({
    where: {
      id: movementId,
    },
  });

assert.ok(
  movementAfterDeleteAttempt,
  "SUPPLY movement must still exist after rejected Product DELETE"
);

assert.equal(
  movementAfterDeleteAttempt.productId,
  productId,
  "Movement productId must remain unchanged"
);

assert.equal(
  movementAfterDeleteAttempt.type,
  "SUPPLY",
  "Movement type must remain SUPPLY"
);

assert.equal(
  movementAfterDeleteAttempt.quantity,
  movementQuantityBeforeDelete,
  "Movement quantity must remain unchanged"
);

assert.equal(
  movementAfterDeleteAttempt.comment,
  movementCommentBeforeDelete,
  "Movement comment must remain unchanged"
);

console.log(
  `Movement #${movementId} still exists`
);

console.log(
  `Movement type=${movementAfterDeleteAttempt.type}`
);

console.log(
  `Movement quantity=${movementAfterDeleteAttempt.quantity}`
);

console.log("");
console.log("🟢 Movement history remained unchanged");
console.log("");

// =========================================================================
// 15. VERIFY PRODUCT STOCK == BATCH SUM
// =========================================================================

console.log("15. VERIFY PRODUCT STOCK AFTER REJECTED DELETE");
console.log("------------------------------------------------------------------------------");

const finalProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert.ok(
  finalProduct,
  "Product must still exist"
);

const finalBatches =
  await prisma.batch.findMany({
    where: {
      productId,
    },
  });

const finalBatchSum =
  finalBatches.reduce(
    (sum, currentBatch) =>
      sum + currentBatch.quantity,
    0
  );

assert.equal(
  finalProduct.stock,
  productStockBeforeDelete,
  "Product.stock must remain unchanged"
);

assert.equal(
  finalBatchSum,
  batchQuantityBeforeDelete,
  "SUM(Batch.quantity) must remain unchanged"
);

assert.equal(
  finalProduct.stock,
  finalBatchSum,
  "Product.stock must equal SUM(Batch.quantity)"
);

console.log(
  `Product.stock=${finalProduct.stock}`
);

console.log(
  `SUM(Batch.quantity)=${finalBatchSum}`
);

console.log("");
console.log("🟢 Product stock remained consistent");
console.log("");

// =========================================================================
// 16. VERIFY GLOBAL COUNTS
// =========================================================================

console.log("16. VERIFY GLOBAL COUNTS");
console.log("------------------------------------------------------------------------------");

const countsAfter = {
  product: await prisma.product.count(),
  supplier: await prisma.supplier.count(),
  supply: await prisma.supply.count(),
  supplyItem: await prisma.supplyItem.count(),
  batch: await prisma.batch.count(),
  movement: await prisma.movement.count(),
};

console.log(`Product count=${countsAfter.product}`);
console.log(`Supplier count=${countsAfter.supplier}`);
console.log(`Supply count=${countsAfter.supply}`);
console.log(`SupplyItem count=${countsAfter.supplyItem}`);
console.log(`Batch count=${countsAfter.batch}`);
console.log(`Movement count=${countsAfter.movement}`);

assert.equal(
  countsAfter.product,
  countsBefore.product,
  "Product count must remain unchanged"
);

assert.equal(
  countsAfter.supplier,
  countsBefore.supplier,
  "Supplier count must remain unchanged"
);

assert.equal(
  countsAfter.supply,
  countsBefore.supply,
  "Supply count must remain unchanged"
);

assert.equal(
  countsAfter.supplyItem,
  countsBefore.supplyItem,
  "SupplyItem count must remain unchanged"
);

assert.equal(
  countsAfter.batch,
  countsBefore.batch,
  "Batch count must remain unchanged"
);

assert.equal(
  countsAfter.movement,
  countsBefore.movement,
  "Movement count must remain unchanged"
);

console.log("");
console.log("🟢 Global database counts unchanged");
console.log("");

// =========================================================================
// 17. FINAL RESULT
// =========================================================================

console.log("==============================================================================");
console.log("V66 RESULT");
console.log("==============================================================================");
console.log("");

console.log("🟢 Product creation: PASSED");
console.log("🟢 Supply creation: PASSED");
console.log("🟢 Supply history creation: PASSED");
console.log("🟢 Batch creation: PASSED");
console.log("🟢 Product.stock synchronization: PASSED");
console.log("🟢 Supply Movement creation: PASSED");
console.log("🟢 DELETE Product with history → rejected");
console.log("🟢 Product remained unchanged");
console.log("🟢 Supply remained unchanged");
console.log("🟢 SupplyItem remained unchanged");
console.log("🟢 Batch remained unchanged");
console.log("🟢 Movement remained unchanged");
console.log("🟢 Product.stock remained unchanged");
console.log("🟢 SUM(Batch.quantity) remained unchanged");
console.log("🟢 Global database counts remained unchanged");
console.log("");
console.log("V66 TEST PASSED");
console.log("");


} finally {
// =========================================================================
// CLEANUP
// =========================================================================


console.log("==============================================================================");
console.log("CLEANUP");
console.log("==============================================================================");
console.log("");

await cleanup(
  productId,
  supplierId,
  supplyId
);

console.log("🟢 Old V66 test data removed");
console.log("");


}
}

main()
.catch((error) => {
console.error("");
console.error("🔴 V66 TEST FAILED");
console.error("");


if (error instanceof Error) {
  console.error(error.message);
  console.error("");
  console.error(error.stack);
} else {
  console.error(error);
}

process.exitCode = 1;


})
.finally(async () => {
await prisma.$disconnect();
});
