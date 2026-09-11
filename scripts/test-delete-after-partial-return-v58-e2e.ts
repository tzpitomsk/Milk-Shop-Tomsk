import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
if (!condition) {
throw new Error(`ASSERT FAILED: ${message}`);
}
}

async function request(
path: string,
options?: RequestInit
): Promise<{
status: number;
data: any;
}> {
const response = await fetch(`${BASE_URL}${path}`, options);

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

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V58 — DELETE AFTER PARTIAL RETURN ACROSS MULTIPLE BATCHES");
console.log("==============================================================================");
console.log("");

let productId: number | null = null;
let supplierId: number | null = null;
let supplyId1: number | null = null;
let supplyId2: number | null = null;
let batchId1: number | null = null;
let batchId2: number | null = null;
let orderId: number | null = null;
let orderItemId: number | null = null;

try {
// =========================================================================
// 1. CREATE TEST PRODUCT
// =========================================================================


console.log("1. CREATE TEST PRODUCT");
console.log("------------------------------------------------------------------------------");

const timestamp = Date.now();

const createProduct = await request("/api/products", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: `V58 Test Product ${timestamp}`,
    unit: "шт",
    price: 300,
    cost: 0,
    barcode: `V58-${timestamp}`,
  }),
});

console.log(`HTTP ${createProduct.status}`);
console.log(JSON.stringify(createProduct.data, null, 2));

assert(
  createProduct.status === 200,
  `product creation failed: ${JSON.stringify(createProduct.data)}`
);

productId = Number(createProduct.data?.id);

assert(
  Number.isInteger(productId) && productId > 0,
  "created Product has invalid id"
);

console.log(`Product #${productId}`);
console.log(`Price=300`);
console.log(`Initial stock=${createProduct.data?.stock}`);
console.log("");

// =========================================================================
// 2. CREATE TEST SUPPLIER
// =========================================================================

console.log("2. CREATE TEST SUPPLIER");
console.log("------------------------------------------------------------------------------");

const createSupplier = await request("/api/suppliers", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: `V58 Test Supplier ${timestamp}`,
  }),
});

console.log(`HTTP ${createSupplier.status}`);
console.log(JSON.stringify(createSupplier.data, null, 2));

assert(
  createSupplier.status === 200,
  `supplier creation failed: ${JSON.stringify(createSupplier.data)}`
);

supplierId = Number(createSupplier.data?.id);

assert(
  Number.isInteger(supplierId) && supplierId > 0,
  "created Supplier has invalid id"
);

console.log(`Supplier #${supplierId}`);
console.log("");

// =========================================================================
// 3. CREATE FIRST SUPPLY / BATCH
// =========================================================================

console.log("3. CREATE FIRST SUPPLY / BATCH");
console.log("------------------------------------------------------------------------------");

const supply1Response = await request("/api/supplies", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productId,
        quantity: 3,
        cost: 100,
        expiryDate: "2099-12-31",
      },
    ],
  }),
});

console.log(`HTTP ${supply1Response.status}`);
console.log(JSON.stringify(supply1Response.data, null, 2));

assert(
  supply1Response.status === 200,
  `first supply failed: ${JSON.stringify(supply1Response.data)}`
);

/*
 * /api/supplies returns:
 *
 * {
 *   success: true,
 *   supply: {
 *     id: ...
 *   }
 * }
 *
 * This is the same response contract already verified by V43.
 */

supplyId1 = Number(supply1Response.data?.supply?.id);

assert(
  Number.isInteger(supplyId1) && supplyId1 > 0,
  `could not determine first Supply id from response: ${JSON.stringify(
    supply1Response.data
  )}`
);

console.log(`Supply #${supplyId1}`);

const firstBatch = await prisma.batch.findFirst({
  where: {
    productId,
  },
  orderBy: {
    id: "desc",
  },
});

assert(firstBatch, "first Batch was not created");

batchId1 = firstBatch.id;

assert(
  firstBatch.quantity === 3,
  `first Batch quantity must be 3, got ${firstBatch.quantity}`
);

assert(
  firstBatch.purchaseCost === 100,
  `first Batch purchaseCost must be 100, got ${firstBatch.purchaseCost}`
);

console.log(`Batch #${firstBatch.id}`);
console.log(`quantity=${firstBatch.quantity}`);
console.log(`purchaseCost=${firstBatch.purchaseCost}`);
console.log("");

// =========================================================================
// 4. CREATE SECOND SUPPLY / BATCH
// =========================================================================

console.log("4. CREATE SECOND SUPPLY / BATCH");
console.log("------------------------------------------------------------------------------");

const supply2Response = await request("/api/supplies", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productId,
        quantity: 3,
        cost: 120,
        expiryDate: "2099-12-31",
      },
    ],
  }),
});

console.log(`HTTP ${supply2Response.status}`);
console.log(JSON.stringify(supply2Response.data, null, 2));

assert(
  supply2Response.status === 200,
  `second supply failed: ${JSON.stringify(supply2Response.data)}`
);

supplyId2 = Number(supply2Response.data?.supply?.id);

assert(
  Number.isInteger(supplyId2) && supplyId2 > 0,
  `could not determine second Supply id from response: ${JSON.stringify(
    supply2Response.data
  )}`
);

console.log(`Supply #${supplyId2}`);

const secondBatch = await prisma.batch.findFirst({
  where: {
    productId,
    id: {
      not: batchId1!,
    },
  },
  orderBy: {
    id: "desc",
  },
});

assert(secondBatch, "second Batch was not created");

batchId2 = secondBatch.id;

assert(
  secondBatch.quantity === 3,
  `second Batch quantity must be 3, got ${secondBatch.quantity}`
);

assert(
  secondBatch.purchaseCost === 120,
  `second Batch purchaseCost must be 120, got ${secondBatch.purchaseCost}`
);

console.log(`Batch #${secondBatch.id}`);
console.log(`quantity=${secondBatch.quantity}`);
console.log(`purchaseCost=${secondBatch.purchaseCost}`);
console.log("");

// =========================================================================
// 5. VERIFY INITIAL STOCK
// =========================================================================

console.log("5. VERIFY INITIAL STOCK");
console.log("------------------------------------------------------------------------------");

const initialProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(initialProduct, "test Product disappeared");

const initialBatchSumResult = await prisma.batch.aggregate({
  where: {
    productId,
  },
  _sum: {
    quantity: true,
  },
});

const initialBatchSum = initialBatchSumResult._sum.quantity ?? 0;

assert(
  initialProduct.stock === 6,
  `expected Product.stock=6, got ${initialProduct.stock}`
);

assert(
  initialBatchSum === 6,
  `expected SUM(Batch.quantity)=6, got ${initialBatchSum}`
);

assert(
  initialProduct.stock === initialBatchSum,
  `Product.stock ${initialProduct.stock} != batch sum ${initialBatchSum}`
);

console.log(`Product.stock=${initialProduct.stock}`);
console.log(`SUM(Batch.quantity)=${initialBatchSum}`);
console.log("🟢 Initial stock correct");
console.log("");

// =========================================================================
// 6. CREATE ORDER FOR ALL 6 UNITS
// =========================================================================

console.log("6. CREATE ORDER FOR ALL 6 UNITS");
console.log("------------------------------------------------------------------------------");

const orderResponse = await request("/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    items: [
      {
        id: productId,
        quantity: 6,
        price: 300,
      },
    ],
  }),
});

console.log(`HTTP ${orderResponse.status}`);
console.log(JSON.stringify(orderResponse.data, null, 2));

assert(
  orderResponse.status === 201,
  `order creation expected HTTP201, got ${orderResponse.status}: ${JSON.stringify(
    orderResponse.data
  )}`
);

orderId = Number(orderResponse.data?.id);

assert(
  Number.isInteger(orderId) && orderId > 0,
  `created Order has invalid id: ${JSON.stringify(orderResponse.data)}`
);

console.log(`Order #${orderId}`);
console.log(`Gross total=${orderResponse.data?.total}`);
console.log(`Gross profit=${orderResponse.data?.profit}`);
console.log("");

// =========================================================================
// 7. LOAD ORDER AND VERIFY ORDERBATCH ALLOCATION
// =========================================================================

console.log("7. VERIFY ORDERBATCH ALLOCATION");
console.log("------------------------------------------------------------------------------");

const order = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: {
          orderBy: {
            id: "asc",
          },
        },
      },
    },
  },
});

assert(order, `Order #${orderId} not found`);

assert(
  order.items.length === 1,
  `expected exactly 1 OrderItem, got ${order.items.length}`
);

const orderItem = order.items[0];

orderItemId = orderItem.id;

assert(
  orderItem.quantity === 6,
  `expected OrderItem.quantity=6, got ${orderItem.quantity}`
);

assert(
  orderItem.batches.length === 2,
  `expected 2 OrderBatch records, got ${orderItem.batches.length}`
);

const soldByBatch = new Map<number, number>();
const purchaseCostByBatch = new Map<number, number>();

for (const orderBatch of orderItem.batches) {
  soldByBatch.set(
    orderBatch.batchId,
    (soldByBatch.get(orderBatch.batchId) ?? 0) + orderBatch.quantity
  );

  purchaseCostByBatch.set(
    orderBatch.batchId,
    orderBatch.purchaseCost
  );

  console.log(
    `OrderBatch #${orderBatch.id} | ` +
      `Batch #${orderBatch.batchId} | ` +
      `sold=${orderBatch.quantity} | ` +
      `purchaseCost=${orderBatch.purchaseCost}`
  );
}

assert(
  soldByBatch.get(batchId1!) === 3,
  `Batch #${batchId1} must have sold=3`
);

assert(
  soldByBatch.get(batchId2!) === 3,
  `Batch #${batchId2} must have sold=3`
);

assert(
  purchaseCostByBatch.get(batchId1!) === 100,
  `Batch #${batchId1} OrderBatch purchaseCost must be 100`
);

assert(
  purchaseCostByBatch.get(batchId2!) === 120,
  `Batch #${batchId2} OrderBatch purchaseCost must be 120`
);

console.log("");
console.log("🟢 Both batches were sold: 3 + 3 = 6");
console.log("");

// =========================================================================
// 8. VERIFY STOCK AFTER SALE
// =========================================================================

console.log("8. VERIFY STOCK AFTER SALE");
console.log("------------------------------------------------------------------------------");

const afterSaleBatch1 = await prisma.batch.findUnique({
  where: {
    id: batchId1!,
  },
});

const afterSaleBatch2 = await prisma.batch.findUnique({
  where: {
    id: batchId2!,
  },
});

const afterSaleProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(afterSaleBatch1, "first Batch missing after sale");
assert(afterSaleBatch2, "second Batch missing after sale");
assert(afterSaleProduct, "Product missing after sale");

assert(
  afterSaleBatch1.quantity === 0,
  `expected Batch #${batchId1}=0 after sale, got ${afterSaleBatch1.quantity}`
);

assert(
  afterSaleBatch2.quantity === 0,
  `expected Batch #${batchId2}=0 after sale, got ${afterSaleBatch2.quantity}`
);

assert(
  afterSaleProduct.stock === 0,
  `expected Product.stock=0 after sale, got ${afterSaleProduct.stock}`
);

console.log(`Batch #${batchId1} quantity=${afterSaleBatch1.quantity}`);
console.log(`Batch #${batchId2} quantity=${afterSaleBatch2.quantity}`);
console.log(`Product.stock=${afterSaleProduct.stock}`);
console.log("🟢 Stock after sale correct");
console.log("");

// =========================================================================
// 9. PARTIAL RETURN #1 — 2 UNITS
// =========================================================================

console.log("9. PARTIAL RETURN #1 — 2 UNITS");
console.log("------------------------------------------------------------------------------");

const return1 = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      itemId: orderItemId,
      quantity: 2,
    }),
  }
);

console.log(`HTTP ${return1.status}`);
console.log(JSON.stringify(return1.data, null, 2));

assert(
  return1.status === 200,
  `first return expected HTTP200, got ${return1.status}: ${JSON.stringify(
    return1.data
  )}`
);

console.log("");

// =========================================================================
// 10. PARTIAL RETURN #2 — 1 UNIT
// =========================================================================

console.log("10. PARTIAL RETURN #2 — 1 UNIT");
console.log("------------------------------------------------------------------------------");

const return2 = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      itemId: orderItemId,
      quantity: 1,
    }),
  }
);

console.log(`HTTP ${return2.status}`);
console.log(JSON.stringify(return2.data, null, 2));

assert(
  return2.status === 200,
  `second return expected HTTP200, got ${return2.status}: ${JSON.stringify(
    return2.data
  )}`
);

console.log("");

// =========================================================================
// 11. VERIFY PARTIAL RETURN STATE
// =========================================================================

console.log("11. VERIFY PARTIAL RETURN STATE");
console.log("------------------------------------------------------------------------------");

const afterReturns = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: {
          orderBy: {
            id: "asc",
          },
        },
        ReturnBatch: {
          orderBy: {
            id: "asc",
          },
        },
      },
    },
  },
});

assert(afterReturns, "Order missing after returns");

const afterReturnsItem = afterReturns.items[0];

assert(
  afterReturnsItem.returned === 3,
  `expected OrderItem.returned=3, got ${afterReturnsItem.returned}`
);

assert(
  afterReturns.status === "PARTIAL_RETURN",
  `expected status PARTIAL_RETURN, got ${afterReturns.status}`
);

assert(
  afterReturns.total === 900,
  `expected net total=900, got ${afterReturns.total}`
);

assert(
  afterReturns.profit === 600,
  `expected net profit=600, got ${afterReturns.profit}`
);

assert(
  afterReturnsItem.ReturnBatch.length === 2,
  `expected 2 ReturnBatch records, got ${afterReturnsItem.ReturnBatch.length}`
);

let totalReturned = 0;

for (const returnBatch of afterReturnsItem.ReturnBatch) {
  totalReturned += returnBatch.quantity;

  console.log(
    `ReturnBatch #${returnBatch.id} | ` +
      `Batch #${returnBatch.batchId} | ` +
      `returned=${returnBatch.quantity}`
  );
}

assert(
  totalReturned === 3,
  `expected total returned=3, got ${totalReturned}`
);

console.log("");
console.log(`Order.total=${afterReturns.total}`);
console.log(`Order.profit=${afterReturns.profit}`);
console.log(`Order.status=${afterReturns.status}`);
console.log(`OrderItem.returned=${afterReturnsItem.returned}`);
console.log("🟢 Partial return state correct");
console.log("");

// =========================================================================
// 12. VERIFY EXACT RETURN ALLOCATION
// =========================================================================

console.log("12. VERIFY EXACT RETURN ALLOCATION");
console.log("------------------------------------------------------------------------------");

const returnedByBatch = new Map<number, number>();

for (const returnBatch of afterReturnsItem.ReturnBatch) {
  returnedByBatch.set(
    returnBatch.batchId,
    (returnedByBatch.get(returnBatch.batchId) ?? 0) +
      returnBatch.quantity
  );
}

const returnedBatch1 = returnedByBatch.get(batchId1!) ?? 0;
const returnedBatch2 = returnedByBatch.get(batchId2!) ?? 0;

console.log(`Batch #${batchId1} returned=${returnedBatch1}`);
console.log(`Batch #${batchId2} returned=${returnedBatch2}`);

/*
 * Return API works LIFO across OrderBatch.
 *
 * Sale:
 *   Batch 1 = 3
 *   Batch 2 = 3
 *
 * Return 2:
 *   Batch 2 = +2
 *
 * Return 1:
 *   Batch 2 = +1
 *
 * Therefore:
 *   Batch 1 returned = 0
 *   Batch 2 returned = 3
 */

assert(
  returnedBatch1 === 0,
  `expected Batch #${batchId1} returned=0, got ${returnedBatch1}`
);

assert(
  returnedBatch2 === 3,
  `expected Batch #${batchId2} returned=3, got ${returnedBatch2}`
);

console.log("");
console.log("🟢 Return allocation is exactly 0 + 3");
console.log("");

// =========================================================================
// 13. VERIFY STOCK BEFORE DELETE
// =========================================================================

console.log("13. VERIFY STOCK BEFORE DELETE");
console.log("------------------------------------------------------------------------------");

const beforeDeleteBatch1 = await prisma.batch.findUnique({
  where: {
    id: batchId1!,
  },
});

const beforeDeleteBatch2 = await prisma.batch.findUnique({
  where: {
    id: batchId2!,
  },
});

const beforeDeleteProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(beforeDeleteBatch1, "Batch 1 missing before delete");
assert(beforeDeleteBatch2, "Batch 2 missing before delete");
assert(beforeDeleteProduct, "Product missing before delete");

assert(
  beforeDeleteBatch1.quantity === 0,
  `expected Batch #${batchId1}=0 before delete, got ${beforeDeleteBatch1.quantity}`
);

assert(
  beforeDeleteBatch2.quantity === 3,
  `expected Batch #${batchId2}=3 before delete, got ${beforeDeleteBatch2.quantity}`
);

assert(
  beforeDeleteProduct.stock === 3,
  `expected Product.stock=3 before delete, got ${beforeDeleteProduct.stock}`
);

console.log(`Batch #${batchId1} quantity=${beforeDeleteBatch1.quantity}`);
console.log(`Batch #${batchId2} quantity=${beforeDeleteBatch2.quantity}`);
console.log(`Product.stock=${beforeDeleteProduct.stock}`);
console.log("");

// =========================================================================
// 14. MARK SECOND BATCH EXPIRED
// =========================================================================

console.log("14. MARK SECOND BATCH EXPIRED");
console.log("------------------------------------------------------------------------------");

const expiredBatch = await prisma.batch.update({
  where: {
    id: batchId2!,
  },
  data: {
    status: "EXPIRED",
  },
});

assert(
  expiredBatch.status === "EXPIRED",
  `expected Batch #${batchId2} status EXPIRED, got ${expiredBatch.status}`
);

console.log(
  `Batch #${batchId2} status=${expiredBatch.status}`
);
console.log("🟢 Expired status fixture created");
console.log("");

// =========================================================================
// 15. VERIFY STATE IMMEDIATELY BEFORE DELETE
// =========================================================================

console.log("15. VERIFY STATE IMMEDIATELY BEFORE DELETE");
console.log("------------------------------------------------------------------------------");

const preDeleteBatch1 = await prisma.batch.findUnique({
  where: {
    id: batchId1!,
  },
});

const preDeleteBatch2 = await prisma.batch.findUnique({
  where: {
    id: batchId2!,
  },
});

const preDeleteProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(preDeleteBatch1, "Batch 1 missing before delete");
assert(preDeleteBatch2, "Batch 2 missing before delete");
assert(preDeleteProduct, "Product missing before delete");

assert(
  preDeleteBatch1.quantity === 0,
  `Batch #${batchId1} must be 0 before delete`
);

assert(
  preDeleteBatch2.quantity === 3,
  `Batch #${batchId2} must be 3 before delete`
);

assert(
  preDeleteBatch2.status === "EXPIRED",
  `Batch #${batchId2} must be EXPIRED before delete`
);

assert(
  preDeleteProduct.stock === 3,
  `Product.stock must be 3 before delete`
);

console.log(
  `Batch #${batchId1}: quantity=${preDeleteBatch1.quantity}, status=${preDeleteBatch1.status}`
);

console.log(
  `Batch #${batchId2}: quantity=${preDeleteBatch2.quantity}, status=${preDeleteBatch2.status}`
);

console.log(`Product.stock=${preDeleteProduct.stock}`);
console.log("");

// =========================================================================
// 16. CAPTURE MOVEMENTS BEFORE DELETE
// =========================================================================

console.log("16. CAPTURE MOVEMENTS BEFORE DELETE");
console.log("------------------------------------------------------------------------------");

const movementsBeforeDelete = await prisma.movement.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

const movementCountBeforeDelete = movementsBeforeDelete.length;

const supplyNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "SUPPLY")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const saleNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "SALE")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const returnNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "RETURN")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const writeOffNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "WRITE_OFF")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const movementNetBeforeDelete = movementsBeforeDelete.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

console.log(`Movement count=${movementCountBeforeDelete}`);
console.log(`SUPPLY net=${supplyNetBeforeDelete}`);
console.log(`SALE net=${saleNetBeforeDelete}`);
console.log(`RETURN net=${returnNetBeforeDelete}`);
console.log(`WRITE_OFF net=${writeOffNetBeforeDelete}`);
console.log(`NET=${movementNetBeforeDelete}`);
console.log("");

assert(
  supplyNetBeforeDelete === 6,
  `expected SUPPLY net=+6, got ${supplyNetBeforeDelete}`
);

assert(
  saleNetBeforeDelete === -6,
  `expected SALE net=-6, got ${saleNetBeforeDelete}`
);

assert(
  returnNetBeforeDelete === 3,
  `expected customer RETURN net=+3, got ${returnNetBeforeDelete}`
);

assert(
  writeOffNetBeforeDelete === 0,
  `expected WRITE_OFF net=0, got ${writeOffNetBeforeDelete}`
);

assert(
  movementNetBeforeDelete === 3,
  `expected movement NET=+3 before delete, got ${movementNetBeforeDelete}`
);

// =========================================================================
// 17. DELETE ORDER
// =========================================================================

console.log("17. DELETE ORDER");
console.log("------------------------------------------------------------------------------");

const deleteResponse = await request(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${deleteResponse.status}`);
console.log(JSON.stringify(deleteResponse.data, null, 2));

assert(
  deleteResponse.status === 200,
  `DELETE expected HTTP200, got ${deleteResponse.status}: ${JSON.stringify(
    deleteResponse.data
  )}`
);

assert(
  deleteResponse.data?.success === true,
  `DELETE response must contain success=true: ${JSON.stringify(
    deleteResponse.data
  )}`
);

console.log("");

// =========================================================================
// 18. VERIFY ORDER HISTORY REMOVED
// =========================================================================

console.log("18. VERIFY ORDER HISTORY REMOVED");
console.log("------------------------------------------------------------------------------");

const deletedOrder = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
});

const deletedOrderItem = await prisma.orderItem.findUnique({
  where: {
    id: orderItemId,
  },
});

const remainingOrderBatches = await prisma.orderBatch.findMany({
  where: {
    orderItemId: orderItemId,
  },
});

const remainingReturnBatches = await prisma.returnBatch.findMany({
  where: {
    orderItemId: orderItemId,
  },
});

assert(
  deletedOrder === null,
  `Order #${orderId} still exists`
);

assert(
  deletedOrderItem === null,
  `OrderItem #${orderItemId} still exists`
);

assert(
  remainingOrderBatches.length === 0,
  `OrderBatch records remain: ${remainingOrderBatches.length}`
);

assert(
  remainingReturnBatches.length === 0,
  `ReturnBatch records remain: ${remainingReturnBatches.length}`
);

console.log(`Order #${orderId}: removed`);
console.log(`OrderItem #${orderItemId}: removed`);
console.log(`OrderBatch records=${remainingOrderBatches.length}`);
console.log(`ReturnBatch records=${remainingReturnBatches.length}`);
console.log("🟢 Order history completely removed");
console.log("");

// =========================================================================
// 19. VERIFY EXACT PER-BATCH RESTORATION
// =========================================================================

console.log("19. VERIFY EXACT PER-BATCH RESTORATION");
console.log("------------------------------------------------------------------------------");

const afterDeleteBatch1 = await prisma.batch.findUnique({
  where: {
    id: batchId1!,
  },
});

const afterDeleteBatch2 = await prisma.batch.findUnique({
  where: {
    id: batchId2!,
  },
});

assert(afterDeleteBatch1, "Batch 1 missing after delete");
assert(afterDeleteBatch2, "Batch 2 missing after delete");

/*
 * Original sale:
 *
 * Batch 1 sold = 3
 * Batch 2 sold = 3
 *
 * Customer returns:
 *
 * Batch 1 returned = 0
 * Batch 2 returned = 3
 *
 * DELETE must restore:
 *
 * Batch 1: 3 - 0 = +3
 * Batch 2: 3 - 3 = +0
 *
 * Therefore final:
 *
 * Batch 1 quantity = 3
 * Batch 2 quantity = 3
 */

assert(
  afterDeleteBatch1.quantity === 3,
  `expected Batch #${batchId1} quantity=3 after delete, got ${afterDeleteBatch1.quantity}`
);

assert(
  afterDeleteBatch2.quantity === 3,
  `expected Batch #${batchId2} quantity=3 after delete, got ${afterDeleteBatch2.quantity}`
);

assert(
  afterDeleteBatch2.status === "EXPIRED",
  `expected Batch #${batchId2} status EXPIRED after delete, got ${afterDeleteBatch2.status}`
);

console.log(
  `Batch #${batchId1}: 0 → ${afterDeleteBatch1.quantity} ` +
    "(restored +3)"
);

console.log(
  `Batch #${batchId2}: 3 → ${afterDeleteBatch2.quantity} ` +
    "(restored +0)"
);

console.log(
  `Batch #${batchId2} status=${afterDeleteBatch2.status} ` +
    "(preserved)"
);

console.log("");
console.log("🟢 Exact per-batch restoration passed");
console.log("");

// =========================================================================
// 20. VERIFY PRODUCT STOCK
// =========================================================================

console.log("20. VERIFY PRODUCT STOCK");
console.log("------------------------------------------------------------------------------");

const afterDeleteProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(afterDeleteProduct, "Product missing after delete");

const afterDeleteBatchSumResult = await prisma.batch.aggregate({
  where: {
    productId,
  },
  _sum: {
    quantity: true,
  },
});

const afterDeleteBatchSum =
  afterDeleteBatchSumResult._sum.quantity ?? 0;

assert(
  afterDeleteProduct.stock === 6,
  `expected Product.stock=6 after delete, got ${afterDeleteProduct.stock}`
);

assert(
  afterDeleteBatchSum === 6,
  `expected SUM(Batch.quantity)=6 after delete, got ${afterDeleteBatchSum}`
);

assert(
  afterDeleteProduct.stock === afterDeleteBatchSum,
  `Product.stock ${afterDeleteProduct.stock} != batch sum ${afterDeleteBatchSum}`
);

console.log(`Product.stock=${afterDeleteProduct.stock}`);
console.log(`SUM(Batch.quantity)=${afterDeleteBatchSum}`);
console.log("🟢 Product.stock restored correctly");
console.log("");

// =========================================================================
// 21. VERIFY MOVEMENTS AFTER DELETE
// =========================================================================

console.log("21. VERIFY MOVEMENTS AFTER DELETE");
console.log("------------------------------------------------------------------------------");

const movementsAfterDelete = await prisma.movement.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

const supplyMovements = movementsAfterDelete.filter(
  (movement) => movement.type === "SUPPLY"
);

const saleMovements = movementsAfterDelete.filter(
  (movement) => movement.type === "SALE"
);

const returnMovements = movementsAfterDelete.filter(
  (movement) => movement.type === "RETURN"
);

const writeOffMovements = movementsAfterDelete.filter(
  (movement) => movement.type === "WRITE_OFF"
);

const supplyNet = supplyMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const saleNet = saleMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const returnNet = returnMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const writeOffNet = writeOffMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const movementNet = movementsAfterDelete.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

console.log(`Movement count=${movementsAfterDelete.length}`);
console.log(`SUPPLY net=${supplyNet}`);
console.log(`SALE net=${saleNet}`);
console.log(`RETURN net=${returnNet}`);
console.log(`WRITE_OFF net=${writeOffNet}`);
console.log(`NET=${movementNet}`);

assert(
  supplyNet === 6,
  `expected SUPPLY net=+6, got ${supplyNet}`
);

assert(
  saleNet === -6,
  `expected SALE net=-6, got ${saleNet}`
);

/*
 * Customer return:
 *   +3
 *
 * DELETE restoration:
 *   +3
 *
 * Total RETURN:
 *   +6
 */

assert(
  returnNet === 6,
  `expected RETURN net=+6, got ${returnNet}`
);

assert(
  writeOffNet === 0,
  `expected WRITE_OFF net=0, got ${writeOffNet}`
);

assert(
  movementNet === 6,
  `expected final movement NET=+6, got ${movementNet}`
);

assert(
  movementsAfterDelete.length === movementCountBeforeDelete + 1,
  `expected exactly one additional restoration Movement: ` +
    `before=${movementCountBeforeDelete}, after=${movementsAfterDelete.length}`
);

const newMovements = movementsAfterDelete.slice(
  movementCountBeforeDelete
);

assert(
  newMovements.length === 1,
  `expected exactly one new Movement, got ${newMovements.length}`
);

const restorationMovement = newMovements[0];

assert(
  restorationMovement.type === "RETURN",
  `expected restoration Movement type RETURN, got ${restorationMovement.type}`
);

assert(
  restorationMovement.quantity === 3,
  `expected restoration Movement quantity +3, got ${restorationMovement.quantity}`
);

assert(
  restorationMovement.comment ===
    `Возврат после удаления заказа №${orderId}. Партия №${batchId1}`,
  `unexpected restoration Movement comment: ${restorationMovement.comment}`
);

console.log("");
console.log(
  `Restoration Movement #${restorationMovement.id}`
);
console.log(`type=${restorationMovement.type}`);
console.log(`quantity=${restorationMovement.quantity}`);
console.log(`comment=${restorationMovement.comment}`);
console.log("");
console.log("🟢 Movement restoration passed");
console.log("");

// =========================================================================
// 22. VERIFY NO DOUBLE RESTORATION
// =========================================================================

console.log("22. VERIFY NO DOUBLE RESTORATION");
console.log("------------------------------------------------------------------------------");

const productBeforeRepeatedDelete = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(
  productBeforeRepeatedDelete,
  "Product missing before repeated DELETE"
);

const stockBeforeRepeatedDelete =
  productBeforeRepeatedDelete.stock;

const movementCountBeforeRepeatedDelete =
  await prisma.movement.count({
    where: {
      productId,
    },
  });

const repeatedDelete = await request(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${repeatedDelete.status}`);
console.log(JSON.stringify(repeatedDelete.data, null, 2));

assert(
  repeatedDelete.status === 404,
  `repeated DELETE expected HTTP404, got ${repeatedDelete.status}`
);

const productAfterRepeatedDelete = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert(
  productAfterRepeatedDelete,
  "Product missing after repeated DELETE"
);

const movementCountAfterRepeatedDelete =
  await prisma.movement.count({
    where: {
      productId,
    },
  });

assert(
  productAfterRepeatedDelete.stock === stockBeforeRepeatedDelete,
  `Product.stock changed after repeated DELETE: ` +
    `${stockBeforeRepeatedDelete} → ${productAfterRepeatedDelete.stock}`
);

assert(
  movementCountAfterRepeatedDelete ===
    movementCountBeforeRepeatedDelete,
  `Movement count changed after repeated DELETE: ` +
    `${movementCountBeforeRepeatedDelete} → ${movementCountAfterRepeatedDelete}`
);

console.log("");
console.log("🟢 Repeated DELETE produced no side effects");
console.log("");

// =========================================================================
// 23. FINAL RESULT
// =========================================================================

console.log("==============================================================================");
console.log("V58 FINAL RESULT");
console.log("==============================================================================");
console.log("");

console.log("🟢 V58 PASSED");
console.log("");
console.log("Проверено:");
console.log("");
console.log("1. Созданы две реальные партии: 3 + 3.");
console.log("2. Заказ продал обе партии полностью.");
console.log("3. Выполнены два частичных возврата: 2 + 1.");
console.log("4. Оба возврата корректно ушли в последнюю партию.");
console.log("5. Перед DELETE в первой партии было 0, во второй 3.");
console.log("6. DELETE восстановил первую партию на +3.");
console.log("7. DELETE не восстановил вторую партию повторно.");
console.log("8. Статус EXPIRED второй партии сохранился.");
console.log("9. Product.stock восстановился с 3 до 6.");
console.log("10. SUM(Batch.quantity) снова равен Product.stock.");
console.log("11. DELETE создал ровно одно дополнительное RETURN движение +3.");
console.log("12. Повторный DELETE вернул HTTP404.");
console.log("13. Повторный DELETE не изменил stock.");
console.log("14. Повторный DELETE не создал новое движение.");
console.log("");


} finally {
// =========================================================================
// CLEANUP
// =========================================================================


console.log("==============================================================================");
console.log("CLEANUP");
console.log("==============================================================================");
console.log("");

try {
  if (orderId !== null) {
    const existingOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: {
          select: {
            id: true,
          },
        },
      },
    });

    if (existingOrder) {
      const remainingOrderItemIds = existingOrder.items.map(
        (item) => item.id
      );

      if (remainingOrderItemIds.length > 0) {
        await prisma.returnBatch.deleteMany({
          where: {
            orderItemId: {
              in: remainingOrderItemIds,
            },
          },
        });

        await prisma.orderBatch.deleteMany({
          where: {
            orderItemId: {
              in: remainingOrderItemIds,
            },
          },
        });

        await prisma.orderItem.deleteMany({
          where: {
            id: {
              in: remainingOrderItemIds,
            },
          },
        });
      }

      await prisma.order.deleteMany({
        where: {
          id: orderId,
        },
      });
    }
  }

  if (productId !== null) {
    const orphanReturnBatches = await prisma.returnBatch.findMany({
      where: {
        Batch: {
          productId,
        },
      },
      select: {
        id: true,
      },
    });

    if (orphanReturnBatches.length > 0) {
      await prisma.returnBatch.deleteMany({
        where: {
          id: {
            in: orphanReturnBatches.map((item) => item.id),
          },
        },
      });
    }

    const orphanOrderBatches = await prisma.orderBatch.findMany({
      where: {
        batchId: {
          in: (
            await prisma.batch.findMany({
              where: {
                productId,
              },
              select: {
                id: true,
              },
            })
          ).map((batch) => batch.id),
        },
      },
      select: {
        id: true,
      },
    });

    if (orphanOrderBatches.length > 0) {
      await prisma.orderBatch.deleteMany({
        where: {
          id: {
            in: orphanOrderBatches.map((item) => item.id),
          },
        },
      });
    }

    await prisma.movement.deleteMany({
      where: {
        productId,
      },
    });

    await prisma.supplyItem.deleteMany({
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

  if (supplyId1 !== null) {
    await prisma.supply.deleteMany({
      where: {
        id: supplyId1,
      },
    });
  }

  if (supplyId2 !== null) {
    await prisma.supply.deleteMany({
      where: {
        id: supplyId2,
      },
    });
  }

  if (supplierId !== null) {
    await prisma.supply.deleteMany({
      where: {
        supplierId,
      },
    });

    await prisma.supplier.deleteMany({
      where: {
        id: supplierId,
      },
    });
  }

  console.log("🟢 CLEANUP COMPLETED");
  console.log("");
} catch (cleanupError) {
  console.error("");
  console.error("🔴 CLEANUP FAILED");
  console.error(cleanupError);
  console.error("");
  process.exitCode = 1;
}


}
}

main()
.catch((error) => {
console.error("");
console.error("==============================================================================");
console.error("🔴 V58 FAILED");
console.error("==============================================================================");
console.error("");
console.error(error);
console.error("");
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
