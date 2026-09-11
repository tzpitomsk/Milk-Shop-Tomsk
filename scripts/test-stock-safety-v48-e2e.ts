import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL =
process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const TEST_PRODUCT_NAME = "V48_INTEGRATION_TEST Молоко";
const TEST_SUPPLIER_NAME = "V48_INTEGRATION_TEST Поставщик";

type JsonResponse = {
status: number;
body: any;
};

function assert(condition: unknown, message: string): asserts condition {
if (!condition) {
throw new Error(`🔴 ASSERTION FAILED: ${message}`);
}
}

function requireId(value: unknown, name: string): number {
assert(
typeof value === "number" &&
Number.isInteger(value) &&
value > 0,
`${name} must be a positive integer`
);

return value;
}

async function requestJson(
path: string,
options: RequestInit
): Promise<JsonResponse> {
let response: Response;

try {
response = await fetch(`${BASE_URL}${path}`, options);
} catch (error) {
throw new Error(
`🔴 Cannot connect to ${BASE_URL}. Is the Next.js server running?\n${String(
        error
      )}`
);
}

const text = await response.text();

let body: any;

try {
body = text ? JSON.parse(text) : null;
} catch {
body = text;
}

return {
status: response.status,
body,
};
}

async function getState(productId: number, batchIds: number[]) {
const product = await prisma.product.findUnique({
where: {
id: productId,
},
});

const batches = await prisma.batch.findMany({
where: {
id: {
in: batchIds,
},
},
orderBy: {
id: "asc",
},
});

const orders = await prisma.order.count({
where: {
items: {
some: {
productId,
},
},
},
});

const orderBatches = await prisma.orderBatch.count({
where: {
orderItem: {
productId,
},
},
});

// IMPORTANT:
// Prisma relation in ReturnBatch is named `OrderItem`,
// not `orderItem`.
const returnBatches = await prisma.returnBatch.count({
where: {
OrderItem: {
productId,
},
},
});

const movements = await prisma.movement.count({
where: {
productId,
},
});

return {
product,
batches,
orders,
orderBatches,
returnBatches,
movements,
};
}

function assertStateUnchanged(
before: Awaited<ReturnType<typeof getState>>,
after: Awaited<ReturnType<typeof getState>>,
context: string
) {
assert(
before.product,
`${context}: baseline Product missing`
);

assert(
after.product,
`${context}: Product missing after operation`
);

assert(
after.product.stock === before.product.stock,
`${context}: Product.stock changed ${before.product.stock} → ${after.product.stock}`
);

assert(
after.batches.length === before.batches.length,
`${context}: number of tracked batches changed ${before.batches.length} → ${after.batches.length}`
);

for (const beforeBatch of before.batches) {
const afterBatch = after.batches.find(
(batch) => batch.id === beforeBatch.id
);


assert(
  afterBatch,
  `${context}: Batch #${beforeBatch.id} disappeared`
);

assert(
  afterBatch.quantity === beforeBatch.quantity,
  `${context}: Batch #${beforeBatch.id} quantity changed ${beforeBatch.quantity} → ${afterBatch.quantity}`
);

assert(
  afterBatch.status === beforeBatch.status,
  `${context}: Batch #${beforeBatch.id} status changed ${beforeBatch.status} → ${afterBatch.status}`
);

assert(
  afterBatch.productId === beforeBatch.productId,
  `${context}: Batch #${beforeBatch.id} productId changed`
);


}

assert(
after.orders === before.orders,
`${context}: Order count changed ${before.orders} → ${after.orders}`
);

assert(
after.orderBatches === before.orderBatches,
`${context}: OrderBatch count changed ${before.orderBatches} → ${after.orderBatches}`
);

assert(
after.returnBatches === before.returnBatches,
`${context}: ReturnBatch count changed ${before.returnBatches} → ${after.returnBatches}`
);

assert(
after.movements === before.movements,
`${context}: Movement count changed ${before.movements} → ${after.movements}`
);
}

async function main() {
console.log("");
console.log("======================================================================");
console.log("V48 — STOCK SAFETY / NEGATIVE LIFECYCLE E2E");
console.log("======================================================================");
console.log("");

console.log("0. SAFETY TEST PLAN");
console.log("----------------------------------------------------------------------");
console.log("");
console.log("Initial supply:");
console.log("  Batch = 5");
console.log("  Product.stock = 5");
console.log("");
console.log("Rejected operations:");
console.log("  1. Sell more than available stock");
console.log("  2. Sell using expired stock");
console.log("  3. Sell using future stock");
console.log("  4. Return more than sold");
console.log("  5. Write-off more than batch quantity");
console.log("  6. Write-off zero");
console.log("  7. Write-off negative quantity");
console.log("");
console.log("Every rejected operation must leave the database unchanged.");
console.log("");

let supplierId: number | null = null;
let productId: number | null = null;
let batchId: number | null = null;
let expiredBatchId: number | null = null;
let futureBatchId: number | null = null;
let supplyId: number | null = null;
let orderId: number | null = null;
let orderItemId: number | null = null;

let testError: unknown = null;

try {
// ========================================================================
// 1. CREATE ISOLATED TEST DATA
// ========================================================================


console.log("1. CREATE TEST DATA");
console.log("----------------------------------------------------------------------");

const supplier = await prisma.supplier.create({
  data: {
    name: TEST_SUPPLIER_NAME,
  },
});

supplierId = supplier.id;

const product = await prisma.product.create({
  data: {
    name: TEST_PRODUCT_NAME,
    unit: "шт",
    price: 300,
    cost: 100,
    stock: 0,
  },
});

productId = product.id;

console.log(`Supplier #${supplier.id} created`);
console.log(
  `Product #${product.id} "${product.name}" created`
);
console.log("🟢 Isolated test data created");
console.log("");

// ========================================================================
// 2. SUPPLY +5
// ========================================================================

console.log("2. SUPPLY +5");
console.log("----------------------------------------------------------------------");

const supplyResponse = await requestJson("/api/supplies", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    supplierId: supplier.id,
    items: [
      {
        id: product.id,
        quantity: 5,
        cost: 100,
        expiryDate: "2030-12-31",
      },
    ],
  }),
});

console.log(`HTTP ${supplyResponse.status}`);

assert(
  supplyResponse.status === 200,
  `Supply must return HTTP 200, got ${supplyResponse.status}: ${JSON.stringify(
    supplyResponse.body
  )}`
);

supplyId = requireId(
  supplyResponse.body?.supply?.id,
  "supply.id"
);

const batch = await prisma.batch.findFirst({
  where: {
    productId: product.id,
    quantity: 5,
  },
  orderBy: {
    id: "desc",
  },
});

assert(batch, "Test batch was not created");

batchId = batch.id;

const productAfterSupply = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert(
  productAfterSupply,
  "Product disappeared after supply"
);

assert(
  productAfterSupply.stock === 5,
  `Product.stock must be 5 after supply, got ${productAfterSupply.stock}`
);

assert(
  batch.quantity === 5,
  `Batch.quantity must be 5 after supply, got ${batch.quantity}`
);

assert(
  batch.status === "ACTIVE",
  `Batch.status must be ACTIVE after supply, got ${batch.status}`
);

console.log(`Supply #${supplyId}`);
console.log(`Batch #${batch.id} quantity=${batch.quantity}`);
console.log(`Product.stock=${productAfterSupply.stock}`);
console.log("🟢 Initial stock state passed");
console.log("");

// ========================================================================
// 3. BASELINE
// ========================================================================

console.log("3. CREATE BASELINE SNAPSHOT");
console.log("----------------------------------------------------------------------");

const baseline = await getState(product.id, [batch.id]);

assert(
  baseline.product?.stock === 5,
  `Baseline Product.stock must be 5, got ${baseline.product?.stock}`
);

assert(
  baseline.batches.length === 1,
  `Baseline must contain exactly one tracked batch, got ${baseline.batches.length}`
);

console.log(`Product.stock=${baseline.product?.stock}`);
console.log(`Batch #${batch.id} quantity=${batch.quantity}`);
console.log(`Orders=${baseline.orders}`);
console.log(`OrderBatch=${baseline.orderBatches}`);
console.log(`ReturnBatch=${baseline.returnBatches}`);
console.log(`Movements=${baseline.movements}`);
console.log("");
console.log("🟢 Baseline snapshot passed");
console.log("");

// ========================================================================
// 4. REJECT OVERSALE
// ========================================================================

console.log("4. REJECT SALE > AVAILABLE STOCK");
console.log("----------------------------------------------------------------------");

const beforeOversale = await getState(product.id, [
  batch.id,
]);

const oversaleResponse = await requestJson("/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    items: [
      {
        id: product.id,
        quantity: 6,
        price: 9999,
      },
    ],
  }),
});

console.log(`HTTP ${oversaleResponse.status}`);
console.log(
  `Response: ${JSON.stringify(oversaleResponse.body)}`
);

assert(
  oversaleResponse.status >= 400,
  "Oversale must be rejected"
);

const afterOversale = await getState(product.id, [
  batch.id,
]);

assertStateUnchanged(
  beforeOversale,
  afterOversale,
  "Oversale rejection"
);

console.log("Product.stock unchanged=5");
console.log("Batch.quantity unchanged=5");
console.log("No Order created");
console.log("No OrderBatch created");
console.log("No ReturnBatch created");
console.log("No Movement created");
console.log("🟢 Oversale protection passed");
console.log("");

// ========================================================================
// 5. CREATE EXPIRED BATCH
// ========================================================================

console.log("5. CREATE EXPIRED BATCH");
console.log("----------------------------------------------------------------------");

const expiredBatch = await prisma.batch.create({
  data: {
    quantity: 3,
    purchaseCost: 100,
    receivedAt: new Date("2026-01-01T00:00:00"),
    expiryDate: new Date("2020-01-01T00:00:00"),
    status: "EXPIRED",
    productId: product.id,
  },
});

expiredBatchId = expiredBatch.id;

await prisma.product.update({
  where: {
    id: product.id,
  },
  data: {
    stock: {
      increment: expiredBatch.quantity,
    },
  },
});

const productWithExpired = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert(
  productWithExpired,
  "Product missing after expired batch"
);

assert(
  productWithExpired.stock === 8,
  `Product.stock must be 8 after expired batch, got ${productWithExpired.stock}`
);

console.log(
  `Expired Batch #${expiredBatch.id} quantity=${expiredBatch.quantity}`
);
console.log(`Product.stock=${productWithExpired.stock}`);
console.log("🟢 Expired batch fixture passed");
console.log("");

// ========================================================================
// 6. REJECT SALE USING EXPIRED STOCK
// ========================================================================

console.log("6. REJECT SALE USING EXPIRED STOCK");
console.log("----------------------------------------------------------------------");

const beforeExpiredSale = await getState(product.id, [
  batch.id,
  expiredBatch.id,
]);

const expiredSaleResponse = await requestJson("/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    items: [
      {
        id: product.id,
        quantity: 6,
        price: 9999,
      },
    ],
  }),
});

console.log(`HTTP ${expiredSaleResponse.status}`);
console.log(
  `Response: ${JSON.stringify(expiredSaleResponse.body)}`
);

assert(
  expiredSaleResponse.status >= 400,
  "Sale requiring expired stock must be rejected"
);

const afterExpiredSale = await getState(product.id, [
  batch.id,
  expiredBatch.id,
]);

assertStateUnchanged(
  beforeExpiredSale,
  afterExpiredSale,
  "Expired-stock sale rejection"
);

console.log(`Active Batch #${batch.id} quantity=5`);
console.log(
  `Expired Batch #${expiredBatch.id} quantity=3`
);
console.log("Product.stock unchanged=8");
console.log("No Order created");
console.log("No Movement created");
console.log("🟢 Expired-batch protection passed");
console.log("");

// ========================================================================
// 7. CREATE FUTURE BATCH
// ========================================================================

console.log("7. CREATE FUTURE BATCH");
console.log("----------------------------------------------------------------------");

const futureBatch = await prisma.batch.create({
  data: {
    quantity: 4,
    purchaseCost: 100,
    receivedAt: new Date("2099-01-01T00:00:00"),
    expiryDate: new Date("2099-12-31T00:00:00"),
    status: "ACTIVE",
    productId: product.id,
  },
});

futureBatchId = futureBatch.id;

await prisma.product.update({
  where: {
    id: product.id,
  },
  data: {
    stock: {
      increment: futureBatch.quantity,
    },
  },
});

const productWithFuture = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert(
  productWithFuture,
  "Product missing after future batch"
);

assert(
  productWithFuture.stock === 12,
  `Product.stock must be 12 after future batch, got ${productWithFuture.stock}`
);

console.log(
  `Future Batch #${futureBatch.id} quantity=${futureBatch.quantity}`
);
console.log(`Product.stock=${productWithFuture.stock}`);
console.log("🟢 Future batch fixture passed");
console.log("");

// ========================================================================
// 8. REJECT SALE REQUIRING FUTURE STOCK
// ========================================================================

console.log("8. REJECT SALE REQUIRING FUTURE STOCK");
console.log("----------------------------------------------------------------------");

const beforeFutureSale = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

const futureSaleResponse = await requestJson("/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    items: [
      {
        id: product.id,
        quantity: 9,
        price: 9999,
      },
    ],
  }),
});

console.log(`HTTP ${futureSaleResponse.status}`);
console.log(
  `Response: ${JSON.stringify(futureSaleResponse.body)}`
);

assert(
  futureSaleResponse.status >= 400,
  "Sale requiring future stock must be rejected"
);

const afterFutureSale = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

assertStateUnchanged(
  beforeFutureSale,
  afterFutureSale,
  "Future-stock sale rejection"
);

console.log("Current sellable stock=5");
console.log("Future batch=4");
console.log("Product.stock unchanged=12");
console.log("No Order created");
console.log("No Movement created");
console.log("🟢 Future-batch protection passed");
console.log("");

// ========================================================================
// 9. VALID SALE -2
// ========================================================================

console.log("9. VALID SALE -2");
console.log("----------------------------------------------------------------------");

const validSaleResponse = await requestJson("/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    items: [
      {
        id: product.id,
        quantity: 2,
        price: 9999,
      },
    ],
  }),
});

console.log(`HTTP ${validSaleResponse.status}`);
console.log(
  `Response: ${JSON.stringify(validSaleResponse.body)}`
);

assert(
  validSaleResponse.status === 201,
  `Valid sale must return HTTP 201, got ${validSaleResponse.status}`
);

orderId = requireId(
  validSaleResponse.body?.id,
  "order.id"
);

const createdOrderItem = await prisma.orderItem.findFirst({
  where: {
    orderId,
    productId: product.id,
  },
});

assert(
  createdOrderItem,
  "OrderItem not found after valid sale"
);

orderItemId = createdOrderItem.id;

const productAfterValidSale =
  await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

const batchAfterValidSale =
  await prisma.batch.findUnique({
    where: {
      id: batch.id,
    },
  });

assert(
  productAfterValidSale,
  "Product missing after valid sale"
);

assert(
  batchAfterValidSale,
  "Batch missing after valid sale"
);

assert(
  productAfterValidSale.stock === 10,
  `Product.stock must be 10 after valid sale, got ${productAfterValidSale.stock}`
);

assert(
  batchAfterValidSale.quantity === 3,
  `Batch.quantity must be 3 after valid sale, got ${batchAfterValidSale.quantity}`
);

console.log(`Order #${orderId}`);
console.log(`OrderItem #${orderItemId}`);
console.log(`Batch #${batch.id} quantity=3`);
console.log(`Product.stock=${productAfterValidSale.stock}`);
console.log("🟢 Valid sale passed");
console.log("");

// ========================================================================
// 10. REJECT RETURN > SOLD
// ========================================================================

console.log("10. REJECT RETURN > SOLD");
console.log("----------------------------------------------------------------------");

const beforeOversReturn = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

const oversReturnResponse = await requestJson(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      itemId: orderItemId,
      quantity: 3,
    }),
  }
);

console.log(`HTTP ${oversReturnResponse.status}`);
console.log(
  `Response: ${JSON.stringify(oversReturnResponse.body)}`
);

assert(
  oversReturnResponse.status >= 400,
  "Return greater than sold quantity must be rejected"
);

const afterOversReturn = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

assertStateUnchanged(
  beforeOversReturn,
  afterOversReturn,
  "Excess-return rejection"
);

const itemAfterRejectedReturn =
  await prisma.orderItem.findUnique({
    where: {
      id: orderItemId,
    },
  });

assert(
  itemAfterRejectedReturn,
  "OrderItem disappeared after rejected return"
);

assert(
  itemAfterRejectedReturn.returned === 0,
  `OrderItem.returned must remain 0, got ${itemAfterRejectedReturn.returned}`
);

console.log("OrderItem.returned=0");
console.log("Batch.quantity unchanged=3");
console.log("Product.stock unchanged=10");
console.log("No ReturnBatch created");
console.log("No RETURN Movement created");
console.log("🟢 Excess-return protection passed");
console.log("");

// ========================================================================
// 11. REJECT WRITE-OFF > QUANTITY
// ========================================================================

console.log("11. REJECT WRITE-OFF > BATCH QUANTITY");
console.log("----------------------------------------------------------------------");

const beforeExcessiveWriteoff = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

const excessiveWriteoffResponse = await requestJson(
  `/api/batches/${batch.id}/writeoff`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quantity: 4,
      reason: "V48 excessive write-off test",
    }),
  }
);

console.log(`HTTP ${excessiveWriteoffResponse.status}`);
console.log(
  `Response: ${JSON.stringify(
    excessiveWriteoffResponse.body
  )}`
);

assert(
  excessiveWriteoffResponse.status >= 400,
  "Write-off greater than batch quantity must be rejected"
);

const afterExcessiveWriteoff = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

assertStateUnchanged(
  beforeExcessiveWriteoff,
  afterExcessiveWriteoff,
  "Excessive write-off rejection"
);

console.log("Batch.quantity unchanged=3");
console.log("Product.stock unchanged=10");
console.log("No WRITE_OFF Movement created");
console.log("🟢 Excessive write-off protection passed");
console.log("");

// ========================================================================
// 12. REJECT ZERO WRITE-OFF
// ========================================================================

console.log("12. REJECT ZERO WRITE-OFF");
console.log("----------------------------------------------------------------------");

const beforeZeroWriteoff = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

const zeroWriteoffResponse = await requestJson(
  `/api/batches/${batch.id}/writeoff`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quantity: 0,
      reason: "V48 zero write-off test",
    }),
  }
);

console.log(`HTTP ${zeroWriteoffResponse.status}`);
console.log(
  `Response: ${JSON.stringify(zeroWriteoffResponse.body)}`
);

assert(
  zeroWriteoffResponse.status >= 400,
  "Zero write-off must be rejected"
);

const afterZeroWriteoff = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

assertStateUnchanged(
  beforeZeroWriteoff,
  afterZeroWriteoff,
  "Zero write-off rejection"
);

console.log("Batch.quantity unchanged=3");
console.log("Product.stock unchanged=10");
console.log("No WRITE_OFF Movement created");
console.log("🟢 Zero write-off protection passed");
console.log("");

// ========================================================================
// 13. REJECT NEGATIVE WRITE-OFF
// ========================================================================

console.log("13. REJECT NEGATIVE WRITE-OFF");
console.log("----------------------------------------------------------------------");

const beforeNegativeWriteoff = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

const negativeWriteoffResponse = await requestJson(
  `/api/batches/${batch.id}/writeoff`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quantity: -1,
      reason: "V48 negative write-off test",
    }),
  }
);

console.log(`HTTP ${negativeWriteoffResponse.status}`);
console.log(
  `Response: ${JSON.stringify(
    negativeWriteoffResponse.body
  )}`
);

assert(
  negativeWriteoffResponse.status >= 400,
  "Negative write-off must be rejected"
);

const afterNegativeWriteoff = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

assertStateUnchanged(
  beforeNegativeWriteoff,
  afterNegativeWriteoff,
  "Negative write-off rejection"
);

console.log("Batch.quantity unchanged=3");
console.log("Product.stock unchanged=10");
console.log("No WRITE_OFF Movement created");
console.log("🟢 Negative write-off protection passed");
console.log("");

// ========================================================================
// 14. VERIFY FINAL DATABASE STATE
// ========================================================================

console.log("14. FINAL DATABASE STATE");
console.log("----------------------------------------------------------------------");

const finalState = await getState(product.id, [
  batch.id,
  expiredBatch.id,
  futureBatch.id,
]);

assert(
  finalState.product,
  "Final Product not found"
);

assert(
  finalState.product.stock === 10,
  `Final Product.stock must be 10, got ${finalState.product.stock}`
);

const finalBatch = finalState.batches.find(
  (item) => item.id === batch.id
);

const finalExpiredBatch = finalState.batches.find(
  (item) => item.id === expiredBatch.id
);

const finalFutureBatch = finalState.batches.find(
  (item) => item.id === futureBatch.id
);

assert(
  finalBatch,
  "Original batch missing"
);

assert(
  finalExpiredBatch,
  "Expired batch missing"
);

assert(
  finalFutureBatch,
  "Future batch missing"
);

assert(
  finalBatch.quantity === 3,
  `Original batch quantity must be 3, got ${finalBatch.quantity}`
);

assert(
  finalExpiredBatch.quantity === 3,
  `Expired batch quantity must be 3, got ${finalExpiredBatch.quantity}`
);

assert(
  finalFutureBatch.quantity === 4,
  `Future batch quantity must be 4, got ${finalFutureBatch.quantity}`
);

const batchTotal = finalState.batches.reduce(
  (sum, item) => sum + item.quantity,
  0
);

assert(
  batchTotal === 10,
  `SUM(Batch.quantity) must be 10, got ${batchTotal}`
);

assert(
  finalState.product.stock === batchTotal,
  `Product.stock ${finalState.product.stock} != batch total ${batchTotal}`
);

console.log(`Product.stock=${finalState.product.stock}`);
console.log(`Original Batch #${batch.id}=3`);
console.log(
  `Expired Batch #${expiredBatch.id}=3`
);
console.log(
  `Future Batch #${futureBatch.id}=4`
);
console.log(`SUM(Batch.quantity)=${batchTotal}`);
console.log("🟢 Physical stock invariant passed");
console.log("");

// ========================================================================
// 15. VERIFY SELLABLE STOCK
// ========================================================================

console.log("15. VERIFY SELLABLE STOCK");
console.log("----------------------------------------------------------------------");

const now = new Date();

const sellableBatches = finalState.batches.filter(
  (item) =>
    item.quantity > 0 &&
    item.status === "ACTIVE" &&
    item.receivedAt <= now &&
    item.expiryDate >= now
);

const sellableStock = sellableBatches.reduce(
  (sum, item) => sum + item.quantity,
  0
);

assert(
  sellableStock === 3,
  `Sellable stock must be 3, got ${sellableStock}`
);

console.log(`Sellable stock=${sellableStock}`);
console.log(
  `Expired excluded=${finalExpiredBatch.quantity}`
);
console.log(
  `Future excluded=${finalFutureBatch.quantity}`
);
console.log("🟢 Sellable stock safety passed");
console.log("");

// ========================================================================
// 16. VERIFY MOVEMENTS
// ========================================================================

console.log("16. VERIFY MOVEMENT HISTORY");
console.log("----------------------------------------------------------------------");

const movements = await prisma.movement.findMany({
  where: {
    productId: product.id,
  },
  orderBy: {
    id: "asc",
  },
});

const supplyMovements = movements.filter(
  (movement) => movement.type === "SUPPLY"
);

const saleMovements = movements.filter(
  (movement) => movement.type === "SALE"
);

const returnMovements = movements.filter(
  (movement) => movement.type === "RETURN"
);

const writeoffMovements = movements.filter(
  (movement) => movement.type === "WRITE_OFF"
);

const supplyQuantity = supplyMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const saleQuantity = saleMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const returnQuantity = returnMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

const writeoffQuantity = writeoffMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

console.log(`SUPPLY=${supplyQuantity}`);
console.log(`SALE=${saleQuantity}`);
console.log(`RETURN=${returnQuantity}`);
console.log(`WRITE_OFF=${writeoffQuantity}`);

assert(
  supplyQuantity === 5,
  `SUPPLY movement must equal +5, got ${supplyQuantity}`
);

assert(
  saleQuantity === -2,
  `SALE movement must equal -2, got ${saleQuantity}`
);

assert(
  returnQuantity === 0,
  `No RETURN movement expected, got ${returnQuantity}`
);

assert(
  writeoffQuantity === 0,
  `No WRITE_OFF movement expected, got ${writeoffQuantity}`
);

assert(
  movements.length === 2,
  `Expected exactly 2 API-generated movements, got ${movements.length}`
);

const movementNet =
  supplyQuantity +
  saleQuantity +
  returnQuantity +
  writeoffQuantity;

assert(
  movementNet === 3,
  `Movement net must equal +3, got ${movementNet}`
);

console.log("Movement count=2");
console.log("SUPPLY +5");
console.log("SALE -2");
console.log("No RETURN");
console.log("No WRITE_OFF");
console.log("NET=+3");
console.log("🟢 Movement safety passed");
console.log("");

// ========================================================================
// 17. VERIFY VALID ORDER
// ========================================================================

console.log("17. VERIFY VALID ORDER");
console.log("----------------------------------------------------------------------");

assert(
  orderId !== null,
  "orderId is missing"
);

assert(
  orderItemId !== null,
  "orderItemId is missing"
);

const order = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: true,
        ReturnBatch: true,
      },
    },
  },
});

assert(
  order,
  "Valid order disappeared"
);

assert(
  order.total === 600,
  `Order.total must be 600, got ${order.total}`
);

assert(
  order.profit === 400,
  `Order.profit must be 400, got ${order.profit}`
);

assert(
  order.status === "COMPLETED",
  `Order.status must be COMPLETED, got ${order.status}`
);

const orderItem = order.items.find(
  (item) => item.id === orderItemId
);

assert(
  orderItem,
  "Valid OrderItem disappeared"
);

assert(
  orderItem.quantity === 2,
  `OrderItem.quantity must be 2, got ${orderItem.quantity}`
);

assert(
  orderItem.returned === 0,
  `OrderItem.returned must be 0, got ${orderItem.returned}`
);

assert(
  orderItem.batches.length === 1,
  `OrderItem must have exactly one OrderBatch, got ${orderItem.batches.length}`
);

assert(
  orderItem.ReturnBatch.length === 0,
  `OrderItem must have no ReturnBatch, got ${orderItem.ReturnBatch.length}`
);

assert(
  orderItem.batches[0].batchId === batch.id,
  `OrderBatch must point to Batch #${batch.id}, got Batch #${orderItem.batches[0].batchId}`
);

assert(
  orderItem.batches[0].quantity === 2,
  `OrderBatch.quantity must be 2, got ${orderItem.batches[0].quantity}`
);

assert(
  orderItem.batches[0].purchaseCost === 100,
  `OrderBatch.purchaseCost must be 100, got ${orderItem.batches[0].purchaseCost}`
);

console.log(`Order #${order.id}`);
console.log(`Total=${order.total}`);
console.log(`Profit=${order.profit}`);
console.log(`Status=${order.status}`);
console.log(
  `OrderItem.quantity=${orderItem.quantity}`
);
console.log(
  `OrderItem.returned=${orderItem.returned}`
);
console.log(
  `OrderBatch → Batch #${orderItem.batches[0].batchId}`
);
console.log(
  `OrderBatch.quantity=${orderItem.batches[0].quantity}`
);
console.log(
  `OrderBatch.purchaseCost=${orderItem.batches[0].purchaseCost}`
);
console.log("🟢 Valid order integrity passed");
console.log("");

// ========================================================================
// 18. PASS
// ========================================================================

console.log("======================================================================");
console.log("V48 PASSED");
console.log("======================================================================");
console.log("");
console.log("Rejected operations:");
console.log("  Oversale                         ✓");
console.log("  Expired-batch sale              ✓");
console.log("  Future-batch sale               ✓");
console.log("  Excess return                   ✓");
console.log("  Excessive write-off             ✓");
console.log("  Zero write-off                  ✓");
console.log("  Negative write-off              ✓");
console.log("");
console.log("Database protection:");
console.log("  No unexpected Order             ✓");
console.log("  No unexpected OrderBatch        ✓");
console.log("  No unexpected ReturnBatch       ✓");
console.log("  No unexpected Movement          ✓");
console.log("  Product.stock unchanged on reject ✓");
console.log("  Batch.quantity unchanged on reject ✓");
console.log("");
console.log("Final state:");
console.log("  Product.stock = 10              ✓");
console.log("  Batch total = 10                ✓");
console.log("  Sellable stock = 3              ✓");
console.log("  Valid Order = 1                 ✓");
console.log("  Valid OrderBatch = 1            ✓");
console.log("");
console.log("🟢 V48 STOCK SAFETY TEST PASSED");
console.log("");


} catch (error) {
testError = error;
throw error;
} finally {
// ========================================================================
// CLEANUP
// ========================================================================


console.log("======================================================================");
console.log("V48 CLEANUP");
console.log("======================================================================");
console.log("");

let cleanupError: unknown = null;

try {
  await prisma.$transaction(async (tx) => {
    // Order deletion cascades:
    // Order -> OrderItem -> OrderBatch / ReturnBatch
    if (orderId !== null) {
      await tx.order.deleteMany({
        where: {
          id: orderId,
        },
      });
    }

    if (productId !== null) {
      await tx.movement.deleteMany({
        where: {
          productId,
        },
      });
    }

    if (supplyId !== null) {
      await tx.supply.deleteMany({
        where: {
          id: supplyId,
        },
      });
    }

    if (productId !== null) {
      await tx.batch.deleteMany({
        where: {
          productId,
        },
      });

      await tx.product.deleteMany({
        where: {
          id: productId,
        },
      });
    }

    if (supplierId !== null) {
      await tx.supplier.deleteMany({
        where: {
          id: supplierId,
        },
      });
    }
  });

  console.log("Orders cleaned");
  console.log("Supplies cleaned");
  console.log("Movements cleaned");
  console.log("Batches cleaned");
  console.log("Product cleaned");
  console.log("Supplier cleaned");

  // ----------------------------------------------------------------------
  // Cleanup verification
  // ----------------------------------------------------------------------

  if (productId !== null) {
    const productExists = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    const remainingBatches = await prisma.batch.count({
      where: {
        productId,
      },
    });

    const remainingMovements = await prisma.movement.count({
      where: {
        productId,
      },
    });

    const remainingOrders = await prisma.order.count({
      where: {
        items: {
          some: {
            productId,
          },
        },
      },
    });

    const remainingOrderBatches =
      await prisma.orderBatch.count({
        where: {
          orderItem: {
            productId,
          },
        },
      });

    // IMPORTANT:
    // Relation is `OrderItem`, not `orderItem`.
    const remainingReturnBatches =
      await prisma.returnBatch.count({
        where: {
          OrderItem: {
            productId,
          },
        },
      });

    assert(
      productExists === null,
      "V48 Product still exists after cleanup"
    );

    assert(
      remainingBatches === 0,
      `V48 Batches remain after cleanup: ${remainingBatches}`
    );

    assert(
      remainingMovements === 0,
      `V48 Movements remain after cleanup: ${remainingMovements}`
    );

    assert(
      remainingOrders === 0,
      `V48 Orders remain after cleanup: ${remainingOrders}`
    );

    assert(
      remainingOrderBatches === 0,
      `V48 OrderBatches remain after cleanup: ${remainingOrderBatches}`
    );

    assert(
      remainingReturnBatches === 0,
      `V48 ReturnBatches remain after cleanup: ${remainingReturnBatches}`
    );
  }

  if (supplierId !== null) {
    const supplierExists = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    const remainingSupplies = await prisma.supply.count({
      where: {
        supplierId,
      },
    });

    assert(
      supplierExists === null,
      "V48 Supplier still exists after cleanup"
    );

    assert(
      remainingSupplies === 0,
      `V48 Supplies remain after cleanup: ${remainingSupplies}`
    );
  }

  console.log("🟢 Cleanup verification passed");
  console.log("🟢 No V48 test data remains");
  console.log("");
} catch (error) {
  cleanupError = error;

  console.error("");
  console.error("🔴 CLEANUP FAILED");
  console.error("");
  console.error(error);
  console.error("");
}

// If the test itself failed, preserve that failure.
// Cleanup errors are reported separately above.
if (testError !== null && cleanupError !== null) {
  console.error(
    "🔴 Both V48 test and cleanup failed."
  );
}


}
}

main()
.catch((error) => {
console.error("");
console.error("======================================================================");
console.error("🔴 V48 FAILED");
console.error("======================================================================");
console.error("");
console.error(error);
console.error("");
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
