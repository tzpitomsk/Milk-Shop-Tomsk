import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function logSection(title: string) {
console.log("");
console.log("==============================================================================");
console.log(title);
console.log("==============================================================================");
console.log("");
}

async function requestJson(
path: string,
options: RequestInit = {}
): Promise<{
status: number;
data: any;
}> {
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

async function cleanupTestData(ids: {
orderId: number | null;
supplyIds: number[];
supplierId: number | null;
productIds: number[];
batchIds: number[];
movementIds: number[];
}) {
logSection("CLEANUP");

try {
// =========================================================================
// 1. DELETE ORDER-RELATED RECORDS
// =========================================================================


if (ids.orderId !== null) {
  await prisma.returnBatch.deleteMany({
    where: {
      OrderItem: {
        orderId: ids.orderId,
      },
    },
  });

  await prisma.orderBatch.deleteMany({
    where: {
      orderItem: {
        orderId: ids.orderId,
      },
    },
  });

  await prisma.orderItem.deleteMany({
    where: {
      orderId: ids.orderId,
    },
  });

  await prisma.order.deleteMany({
    where: {
      id: ids.orderId,
    },
  });
}

// =========================================================================
// 2. DELETE ALL MOVEMENTS FOR TEST PRODUCTS
// =========================================================================

if (ids.productIds.length > 0) {
  await prisma.movement.deleteMany({
    where: {
      productId: {
        in: ids.productIds,
      },
    },
  });
}

// =========================================================================
// 3. DELETE EXPLICIT MOVEMENT IDS AS EXTRA SAFETY
// =========================================================================

if (ids.movementIds.length > 0) {
  await prisma.movement.deleteMany({
    where: {
      id: {
        in: ids.movementIds,
      },
    },
  });
}

// =========================================================================
// 4. DISCOVER SUPPLIES CONNECTED TO TEST PRODUCTS
// =========================================================================

const discoveredSupplyItems =
  ids.productIds.length > 0
    ? await prisma.supplyItem.findMany({
        where: {
          productId: {
            in: ids.productIds,
          },
        },
        select: {
          id: true,
          supplyId: true,
        },
      })
    : [];

const allSupplyIds = Array.from(
  new Set([
    ...ids.supplyIds,
    ...discoveredSupplyItems.map((item) => item.supplyId),
  ])
);

// =========================================================================
// 5. DELETE SUPPLY ITEMS
// =========================================================================

if (ids.productIds.length > 0) {
  await prisma.supplyItem.deleteMany({
    where: {
      productId: {
        in: ids.productIds,
      },
    },
  });
}

// =========================================================================
// 6. DELETE SUPPLIES
// =========================================================================

if (allSupplyIds.length > 0) {
  await prisma.supply.deleteMany({
    where: {
      id: {
        in: allSupplyIds,
      },
    },
  });
}

// =========================================================================
// 7. DELETE BATCHES
// =========================================================================

if (ids.productIds.length > 0) {
  await prisma.batch.deleteMany({
    where: {
      productId: {
        in: ids.productIds,
      },
    },
  });
}

if (ids.batchIds.length > 0) {
  await prisma.batch.deleteMany({
    where: {
      id: {
        in: ids.batchIds,
      },
    },
  });
}

// =========================================================================
// 8. DELETE PRODUCTS
// =========================================================================

if (ids.productIds.length > 0) {
  await prisma.product.deleteMany({
    where: {
      id: {
        in: ids.productIds,
      },
    },
  });
}

// =========================================================================
// 9. DELETE SUPPLIER
// =========================================================================

if (ids.supplierId !== null) {
  await prisma.supplier.deleteMany({
    where: {
      id: ids.supplierId,
    },
  });
}

console.log("🟢 CLEANUP COMPLETED");


} catch (error) {
console.error("🔴 CLEANUP FAILED");
console.error(error);
throw error;
}
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V62 — FULL STOCK LIFECYCLE E2E TEST");
console.log("==============================================================================");
console.log("");
console.log("Проверяется полный жизненный цикл:");
console.log("");
console.log("SUPPLY → FEFO/FIFO SALE → PARTIAL RETURN → WRITE-OFF");
console.log("→ STOCK/PROFIT → DELETE → EXACT RESTORATION → REPEATED DELETE");
console.log("");

const ids = {
orderId: null as number | null,
supplyIds: [] as number[],
supplierId: null as number | null,
productIds: [] as number[],
batchIds: [] as number[],
movementIds: [] as number[],
};

try {
// =========================================================================
// 1. CREATE TEST SUPPLIER
// =========================================================================


logSection("1. CREATE TEST SUPPLIER");

const supplier = await prisma.supplier.create({
  data: {
    name: `V62 Test Supplier ${Date.now()}`,
    phone: null,
    address: null,
  },
});

ids.supplierId = supplier.id;

console.log(`Supplier #${supplier.id}`);
console.log("🟢 Test supplier created");

// =========================================================================
// 2. CREATE TEST PRODUCT
// =========================================================================

logSection("2. CREATE TEST PRODUCT");

const product = await prisma.product.create({
  data: {
    name: `V62 Test Product ${Date.now()}`,
    unit: "шт",
    price: 300,
    cost: 0,
    stock: 0,
  },
});

ids.productIds.push(product.id);

console.log(`Product #${product.id}`);
console.log(`Price=${product.price}`);
console.log(`Initial stock=${product.stock}`);

assert.equal(product.stock, 0);

console.log("🟢 Test product created with stock=0");

// =========================================================================
// 3. SUPPLY BATCH A
// =========================================================================

logSection("3. SUPPLY BATCH A");

const supplyAResponse = await requestJson("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId: supplier.id,
    items: [
      {
        id: product.id,
        quantity: 2,
        cost: 100,
        expiryDate: "2099-12-30",
      },
    ],
  }),
});

console.log(`HTTP ${supplyAResponse.status}`);
console.log(JSON.stringify(supplyAResponse.data, null, 2));

assert.equal(supplyAResponse.status, 200);

const supplyAId =
  supplyAResponse.data?.supply?.id ??
  supplyAResponse.data?.data?.supply?.id ??
  supplyAResponse.data?.id ??
  null;

assert.ok(
  typeof supplyAId === "number",
  "Не удалось определить Supply A id"
);

ids.supplyIds.push(supplyAId);

const batchA = await prisma.batch.findFirst({
  where: {
    productId: product.id,
    quantity: 2,
    purchaseCost: 100,
  },
  orderBy: {
    id: "desc",
  },
});

assert.ok(batchA);

ids.batchIds.push(batchA.id);

console.log(`Supply A #${supplyAId}`);
console.log(
  `Batch A #${batchA.id}=${batchA.quantity} @${batchA.purchaseCost}`
);

const productAfterSupplyA = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productAfterSupplyA);
assert.equal(productAfterSupplyA.stock, 2);

console.log(`Product stock=${productAfterSupplyA.stock}`);
console.log("🟢 Supply A created correctly");

// =========================================================================
// 4. SUPPLY B
// =========================================================================

logSection("4. SUPPLY B");

const supplyBResponse = await requestJson("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId: supplier.id,
    items: [
      {
        id: product.id,
        quantity: 3,
        cost: 120,
        expiryDate: "2099-12-29",
      },
    ],
  }),
});

console.log(`HTTP ${supplyBResponse.status}`);
console.log(JSON.stringify(supplyBResponse.data, null, 2));

assert.equal(supplyBResponse.status, 200);

const supplyBId =
  supplyBResponse.data?.supply?.id ??
  supplyBResponse.data?.data?.supply?.id ??
  supplyBResponse.data?.id ??
  null;

assert.ok(
  typeof supplyBId === "number",
  "Не удалось определить Supply B id"
);

ids.supplyIds.push(supplyBId);

const batchB = await prisma.batch.findFirst({
  where: {
    productId: product.id,
    quantity: 3,
    purchaseCost: 120,
  },
  orderBy: {
    id: "desc",
  },
});

assert.ok(batchB);
assert.notEqual(batchB.id, batchA.id);

ids.batchIds.push(batchB.id);

console.log(`Supply B #${supplyBId}`);
console.log(
  `Batch B #${batchB.id}=${batchB.quantity} @${batchB.purchaseCost}`
);

const productAfterSupplyB = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productAfterSupplyB);
assert.equal(productAfterSupplyB.stock, 5);

console.log(`Product stock=${productAfterSupplyB.stock}`);
console.log("🟢 Supply B created correctly");

// =========================================================================
// 5. VERIFY SUPPLY MOVEMENTS
// =========================================================================

logSection("5. VERIFY SUPPLY MOVEMENTS");

const supplyMovements = await prisma.movement.findMany({
  where: {
    productId: product.id,
    type: "SUPPLY",
  },
  orderBy: {
    id: "asc",
  },
});

assert.equal(supplyMovements.length, 2);

const supplyMovementQuantity = supplyMovements.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

assert.equal(supplyMovementQuantity, 5);

ids.movementIds.push(
  ...supplyMovements.map((movement) => movement.id)
);

console.log(`SUPPLY movements=${supplyMovements.length}`);
console.log(`SUPPLY movement net=${supplyMovementQuantity}`);

for (const movement of supplyMovements) {
  console.log(
    `Movement #${movement.id} | type=${movement.type} | quantity=${movement.quantity}`
  );
}

console.log("🟢 Supply movement history verified");

// =========================================================================
// 6. CREATE ORDER — FEFO/FIFO SALE
// =========================================================================

logSection("6. CREATE ORDER — FEFO/FIFO SALE");

const orderResponse = await requestJson("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    items: [
      {
        id: product.id,
        quantity: 4,
        price: 300,
      },
    ],
  }),
});

console.log(`HTTP ${orderResponse.status}`);
console.log(JSON.stringify(orderResponse.data, null, 2));

assert.equal(orderResponse.status, 201);

const orderId =
  orderResponse.data?.id ??
  orderResponse.data?.order?.id ??
  orderResponse.data?.data?.id ??
  null;

assert.ok(typeof orderId === "number");

ids.orderId = orderId;

console.log(`Order #${orderId}`);

// =========================================================================
// 7. VERIFY ORDER / FEFO/FIFO ALLOCATION
// =========================================================================

logSection("7. VERIFY ORDER AND FEFO/FIFO ALLOCATION");

const order = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: {
          include: {
            batch: true,
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    },
  },
});

assert.ok(order);
assert.equal(order.items.length, 1);

const orderItem = order.items[0];

assert.equal(orderItem.productId, product.id);
assert.equal(orderItem.quantity, 4);
assert.equal(orderItem.returned, 0);

/*
 * Sale:
 *
 * Batch B: 3 × 120 = 360
 * Batch A: 1 × 100 = 100
 *
 * Total cost = 460
 * Revenue = 4 × 300 = 1200
 * Profit = 1200 - 460 = 740
 */

assert.equal(order.total, 1200);
assert.equal(order.profit, 740);
assert.equal(order.status, "COMPLETED");

assert.equal(orderItem.batches.length, 2);

const soldFromBatchA = orderItem.batches.find(
  (item) => item.batchId === batchA.id
);

const soldFromBatchB = orderItem.batches.find(
  (item) => item.batchId === batchB.id
);

assert.ok(soldFromBatchA);
assert.ok(soldFromBatchB);

assert.equal(soldFromBatchA.quantity, 1);
assert.equal(soldFromBatchA.purchaseCost, 100);

assert.equal(soldFromBatchB.quantity, 3);
assert.equal(soldFromBatchB.purchaseCost, 120);

console.log(`OrderItem #${orderItem.id}`);
console.log(`Quantity=${orderItem.quantity}`);
console.log(`Gross total=${order.total}`);
console.log(`Gross profit=${order.profit}`);

console.log(
  `OrderBatch #${soldFromBatchB.id} | Batch #${batchB.id} | sold=3 | cost=120`
);

console.log(
  `OrderBatch #${soldFromBatchA.id} | Batch #${batchA.id} | sold=1 | cost=100`
);

console.log(
  "🟢 FEFO/FIFO allocation verified: Batch B=3, Batch A=1"
);

console.log("🟢 Profit calculation verified: 740");

// =========================================================================
// 8. VERIFY STOCK AFTER SALE
// =========================================================================

logSection("8. VERIFY STOCK AFTER SALE");

const batchAAfterSale = await prisma.batch.findUnique({
  where: {
    id: batchA.id,
  },
});

const batchBAfterSale = await prisma.batch.findUnique({
  where: {
    id: batchB.id,
  },
});

assert.ok(batchAAfterSale);
assert.ok(batchBAfterSale);

assert.equal(batchAAfterSale.quantity, 1);
assert.equal(batchBAfterSale.quantity, 0);

const productAfterSale = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productAfterSale);
assert.equal(productAfterSale.stock, 1);

console.log(
  `Batch A #${batchA.id}: 2 → ${batchAAfterSale.quantity}`
);
console.log(
  `Batch B #${batchB.id}: 3 → ${batchBAfterSale.quantity}`
);
console.log(`Product stock=${productAfterSale.stock}`);

console.log("🟢 Stock after sale verified");

// =========================================================================
// 9. VERIFY SALE MOVEMENT
// =========================================================================

logSection("9. VERIFY SALE MOVEMENT");

const saleMovements = await prisma.movement.findMany({
  where: {
    productId: product.id,
    type: "SALE",
  },
  orderBy: {
    id: "asc",
  },
});

assert.equal(saleMovements.length, 1);
assert.equal(saleMovements[0].quantity, -4);

ids.movementIds.push(
  ...saleMovements.map((movement) => movement.id)
);

console.log(
  `SALE Movement #${saleMovements[0].id}: ${saleMovements[0].quantity}`
);

console.log("🟢 SALE movement verified");

// =========================================================================
// 10. PARTIAL RETURN — 2 UNITS
// =========================================================================

logSection("10. PARTIAL RETURN — 2 UNITS");

/*
 * Return uses LIFO across OrderBatch.
 *
 * Batch B sold 3 units and is the last OrderBatch.
 * Therefore the first 2 returned units must come from Batch B.
 */

const firstReturnResponse = await requestJson(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: orderItem.id,
      quantity: 2,
    }),
  }
);

console.log(`HTTP ${firstReturnResponse.status}`);
console.log(JSON.stringify(firstReturnResponse.data, null, 2));

assert.equal(firstReturnResponse.status, 200);

const orderAfterFirstReturn = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        ReturnBatch: true,
      },
    },
  },
});

assert.ok(orderAfterFirstReturn);

const itemAfterFirstReturn = orderAfterFirstReturn.items.find(
  (item) => item.id === orderItem.id
);

assert.ok(itemAfterFirstReturn);

assert.equal(itemAfterFirstReturn.returned, 2);

/*
 * Before return:
 * total = 1200
 * profit = 740
 *
 * Return:
 * revenue = 2 × 300 = 600
 * cost = 2 × 120 = 240
 * profit reduction = 600 - 240 = 360
 *
 * Remaining:
 * total = 600
 * profit = 380
 */

assert.equal(orderAfterFirstReturn.total, 600);
assert.equal(orderAfterFirstReturn.profit, 380);
assert.equal(orderAfterFirstReturn.status, "PARTIAL_RETURN");

const returnBatchesAfterFirstReturn =
  itemAfterFirstReturn.ReturnBatch;

assert.equal(returnBatchesAfterFirstReturn.length, 1);
assert.equal(returnBatchesAfterFirstReturn[0].quantity, 2);
assert.equal(
  returnBatchesAfterFirstReturn[0].batchId,
  batchB.id
);

console.log(`Returned=${itemAfterFirstReturn.returned}`);
console.log(`Order total=${orderAfterFirstReturn.total}`);
console.log(`Order profit=${orderAfterFirstReturn.profit}`);
console.log(`Order status=${orderAfterFirstReturn.status}`);

console.log(
  `ReturnBatch #${returnBatchesAfterFirstReturn[0].id} | Batch #${batchB.id} | quantity=2`
);

console.log("🟢 First partial return verified");
console.log("🟢 Net profit after return verified: 380");

// =========================================================================
// 11. VERIFY STOCK AFTER FIRST RETURN
// =========================================================================

logSection("11. VERIFY STOCK AFTER FIRST RETURN");

const batchAAfterFirstReturn = await prisma.batch.findUnique({
  where: {
    id: batchA.id,
  },
});

const batchBAfterFirstReturn = await prisma.batch.findUnique({
  where: {
    id: batchB.id,
  },
});

assert.ok(batchAAfterFirstReturn);
assert.ok(batchBAfterFirstReturn);

assert.equal(batchAAfterFirstReturn.quantity, 1);
assert.equal(batchBAfterFirstReturn.quantity, 2);

const productAfterFirstReturn = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productAfterFirstReturn);
assert.equal(productAfterFirstReturn.stock, 3);

console.log(
  `Batch A #${batchA.id}: ${batchAAfterFirstReturn.quantity}`
);
console.log(
  `Batch B #${batchB.id}: ${batchBAfterFirstReturn.quantity}`
);
console.log(`Product stock=${productAfterFirstReturn.stock}`);

console.log("🟢 Stock after first return verified");

// =========================================================================
// 12. WRITE OFF ONE UNIT FROM BATCH B
// =========================================================================

logSection("12. WRITE OFF 1 UNIT FROM BATCH B");

/*
 * Batch B currently has:
 *
 * sold = 3
 * returned = 2
 * current physical quantity = 2
 *
 * One unit is now written off:
 *
 * 2 → 1
 *
 * This write-off must remain after DELETE.
 */

const writeoffResponse = await requestJson(
  `/api/batches/${batchB.id}/writeoff`,
  {
    method: "POST",
    body: JSON.stringify({
      quantity: 1,
      reason: "V62 тестовое списание",
    }),
  }
);

console.log(`HTTP ${writeoffResponse.status}`);
console.log(JSON.stringify(writeoffResponse.data, null, 2));

assert.equal(writeoffResponse.status, 200);

const batchBAfterWriteoff = await prisma.batch.findUnique({
  where: {
    id: batchB.id,
  },
});

assert.ok(batchBAfterWriteoff);

assert.equal(batchBAfterWriteoff.quantity, 1);
assert.equal(batchBAfterWriteoff.status, "ACTIVE");

const productAfterWriteoff = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productAfterWriteoff);
assert.equal(productAfterWriteoff.stock, 2);

const writeoffMovement = await prisma.movement.findFirst({
  where: {
    productId: product.id,
    type: "WRITE_OFF",
    comment: `V62 тестовое списание. Партия №${batchB.id}`,
  },
  orderBy: {
    id: "desc",
  },
});

assert.ok(writeoffMovement);
assert.equal(writeoffMovement.quantity, -1);

ids.movementIds.push(writeoffMovement.id);

console.log(
  `Batch B #${batchB.id}: 2 → ${batchBAfterWriteoff.quantity}`
);
console.log(`Product stock=${productAfterWriteoff.stock}`);
console.log(
  `WRITE_OFF Movement #${writeoffMovement.id}: ${writeoffMovement.quantity}`
);

console.log("🟢 Write-off verified");
console.log("🟢 Write-off remains part of physical stock history");

// =========================================================================
// 13. VERIFY COMPLETE LIFECYCLE STATE BEFORE DELETE
// =========================================================================

logSection("13. VERIFY COMPLETE LIFECYCLE STATE BEFORE DELETE");

const stateBeforeDelete = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: {
          include: {
            batch: true,
          },
        },
        ReturnBatch: {
          include: {
            Batch: true,
          },
        },
      },
    },
  },
});

assert.ok(stateBeforeDelete);

const itemBeforeDelete = stateBeforeDelete.items[0];

assert.equal(stateBeforeDelete.total, 600);
assert.equal(stateBeforeDelete.profit, 380);
assert.equal(stateBeforeDelete.status, "PARTIAL_RETURN");

assert.equal(itemBeforeDelete.quantity, 4);
assert.equal(itemBeforeDelete.returned, 2);

const batchAStateBeforeDelete = await prisma.batch.findUnique({
  where: {
    id: batchA.id,
  },
});

const batchBStateBeforeDelete = await prisma.batch.findUnique({
  where: {
    id: batchB.id,
  },
});

assert.ok(batchAStateBeforeDelete);
assert.ok(batchBStateBeforeDelete);

assert.equal(batchAStateBeforeDelete.quantity, 1);
assert.equal(batchBStateBeforeDelete.quantity, 1);

const productStateBeforeDelete = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productStateBeforeDelete);
assert.equal(productStateBeforeDelete.stock, 2);

console.log(`Order #${orderId}`);
console.log(`Order total=${stateBeforeDelete.total}`);
console.log(`Order profit=${stateBeforeDelete.profit}`);
console.log(`Order status=${stateBeforeDelete.status}`);
console.log(`OrderItem returned=${itemBeforeDelete.returned}`);
console.log(`Batch A=${batchAStateBeforeDelete.quantity}`);
console.log(`Batch B=${batchBStateBeforeDelete.quantity}`);
console.log(`Product stock=${productStateBeforeDelete.stock}`);

console.log("🟢 Complete lifecycle state verified");

// =========================================================================
// 14. MOVEMENT SNAPSHOT BEFORE DELETE
// =========================================================================

logSection("14. MOVEMENT SNAPSHOT BEFORE DELETE");

const movementsBeforeDelete = await prisma.movement.findMany({
  where: {
    productId: product.id,
  },
  orderBy: {
    id: "asc",
  },
});

const supplyNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "SUPPLY")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const saleNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "SALE")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const returnNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "RETURN")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const writeoffNetBeforeDelete = movementsBeforeDelete
  .filter((movement) => movement.type === "WRITE_OFF")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const movementNetBeforeDelete = movementsBeforeDelete.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

assert.equal(supplyNetBeforeDelete, 5);
assert.equal(saleNetBeforeDelete, -4);
assert.equal(returnNetBeforeDelete, 2);
assert.equal(writeoffNetBeforeDelete, -1);

/*
 * 5 - 4 + 2 - 1 = 2
 */

assert.equal(movementNetBeforeDelete, 2);

assert.equal(
  productStateBeforeDelete.stock,
  movementNetBeforeDelete
);

console.log(`Movements=${movementsBeforeDelete.length}`);
console.log(`SUPPLY net=${supplyNetBeforeDelete}`);
console.log(`SALE net=${saleNetBeforeDelete}`);
console.log(`RETURN net=${returnNetBeforeDelete}`);
console.log(`WRITE_OFF net=${writeoffNetBeforeDelete}`);
console.log(`MOVEMENT NET=${movementNetBeforeDelete}`);

console.log("🟢 Movement balance before DELETE verified");

// =========================================================================
// 15. DELETE ORDER
// =========================================================================

logSection("15. DELETE ORDER");

const deleteResponse = await requestJson(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${deleteResponse.status}`);
console.log(JSON.stringify(deleteResponse.data, null, 2));

assert.equal(deleteResponse.status, 200);

console.log("🟢 DELETE completed");

// =========================================================================
// 16. VERIFY ORDER RECORDS REMOVED
// =========================================================================

logSection("16. VERIFY ORDER RECORDS REMOVED");

const deletedOrder = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
});

assert.equal(deletedOrder, null);

const deletedOrderItems = await prisma.orderItem.findMany({
  where: {
    orderId,
  },
});

assert.equal(deletedOrderItems.length, 0);

const deletedOrderBatches = await prisma.orderBatch.findMany({
  where: {
    orderItem: {
      orderId,
    },
  },
});

assert.equal(deletedOrderBatches.length, 0);

const deletedReturnBatches = await prisma.returnBatch.findMany({
  where: {
    OrderItem: {
      orderId,
    },
  },
});

assert.equal(deletedReturnBatches.length, 0);

console.log(`Order #${orderId}: absent`);
console.log(`OrderItems=${deletedOrderItems.length}`);
console.log(`OrderBatches=${deletedOrderBatches.length}`);
console.log(`ReturnBatches=${deletedReturnBatches.length}`);

console.log("🟢 All order records removed");

// =========================================================================
// 17. VERIFY EXACT BATCH RESTORATION
// =========================================================================

logSection("17. VERIFY EXACT BATCH RESTORATION");

const batchAAfterDelete = await prisma.batch.findUnique({
  where: {
    id: batchA.id,
  },
});

const batchBAfterDelete = await prisma.batch.findUnique({
  where: {
    id: batchB.id,
  },
});

assert.ok(batchAAfterDelete);
assert.ok(batchBAfterDelete);

/*
 * BEFORE DELETE:
 *
 * Batch A:
 *   original = 2
 *   sold = 1
 *   returned = 0
 *   current = 1
 *
 * DELETE restores:
 *   1 + 1 = 2
 *
 * Batch B:
 *   original = 3
 *   sold = 3
 *   returned = 2
 *   write-off = 1
 *   current = 1
 *
 * Outstanding sold quantity:
 *   3 - 2 = 1
 *
 * DELETE restores:
 *   1 + 1 = 2
 *
 * The write-off remains intact.
 */

assert.equal(batchAAfterDelete.quantity, 2);
assert.equal(batchBAfterDelete.quantity, 2);

console.log(
  `Batch A #${batchA.id}: 1 → ${batchAAfterDelete.quantity}`
);
console.log(
  `Batch B #${batchB.id}: 1 → ${batchBAfterDelete.quantity}`
);

console.log("🟢 Exact batch restoration verified");

// =========================================================================
// 18. VERIFY PRODUCT STOCK AFTER DELETE
// =========================================================================

logSection("18. VERIFY PRODUCT STOCK AFTER DELETE");

const productAfterDelete = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(productAfterDelete);

/*
 * Final physical stock:
 *
 * Batch A = 2
 * Batch B = 2
 *
 * Total = 4
 */

assert.equal(productAfterDelete.stock, 4);

const batchSumAfterDelete = await prisma.batch.aggregate({
  where: {
    productId: product.id,
  },
  _sum: {
    quantity: true,
  },
});

assert.equal(
  batchSumAfterDelete._sum.quantity ?? 0,
  4
);

assert.equal(
  productAfterDelete.stock,
  batchSumAfterDelete._sum.quantity ?? 0
);

console.log(`Product.stock=${productAfterDelete.stock}`);
console.log(
  `SUM(Batch.quantity)=${batchSumAfterDelete._sum.quantity}`
);

console.log("🟢 Product.stock == SUM(Batch.quantity)");

// =========================================================================
// 19. VERIFY WRITE-OFF WAS NOT UNDONE
// =========================================================================

logSection("19. VERIFY WRITE-OFF WAS NOT UNDONE");

const writeoffAfterDelete = await prisma.movement.findUnique({
  where: {
    id: writeoffMovement.id,
  },
});

assert.ok(writeoffAfterDelete);
assert.equal(writeoffAfterDelete.type, "WRITE_OFF");
assert.equal(writeoffAfterDelete.quantity, -1);

console.log(
  `WRITE_OFF Movement #${writeoffAfterDelete.id}: ${writeoffAfterDelete.quantity}`
);

console.log("🟢 Write-off remains intact");

// =========================================================================
// 20. VERIFY DELETE RESTORATION MOVEMENTS
// =========================================================================

logSection("20. VERIFY DELETE RESTORATION MOVEMENTS");

const movementsAfterDelete = await prisma.movement.findMany({
  where: {
    productId: product.id,
  },
  orderBy: {
    id: "asc",
  },
});

const returnMovementsAfterDelete = movementsAfterDelete.filter(
  (movement) => movement.type === "RETURN"
);

/*
 * Customer return:
 *   +2
 *
 * DELETE restoration:
 *   Batch A +1
 *   Batch B +1
 *
 * Total DELETE restoration:
 *   +2
 *
 * Total RETURN:
 *   +2 customer return
 *   +2 DELETE restoration
 *   = +4
 */

const customerReturnMovement = returnMovementsAfterDelete.find(
  (movement) =>
    movement.comment ===
    `Возврат из заказа №${orderId}`
);

assert.ok(
  customerReturnMovement,
  "Не найден Movement клиентского возврата"
);

assert.equal(customerReturnMovement.quantity, 2);

const restorationMovementA =
  returnMovementsAfterDelete.find(
    (movement) =>
      movement.comment ===
        `Возврат после удаления заказа №${orderId}. Партия №${batchA.id}` &&
      movement.quantity === 1
  );

const restorationMovementB =
  returnMovementsAfterDelete.find(
    (movement) =>
      movement.comment ===
        `Возврат после удаления заказа №${orderId}. Партия №${batchB.id}` &&
      movement.quantity === 1
  );

assert.ok(
  restorationMovementA,
  `Не найден DELETE restoration Movement для Batch A #${batchA.id}`
);

assert.ok(
  restorationMovementB,
  `Не найден DELETE restoration Movement для Batch B #${batchB.id}`
);

assert.notEqual(
  restorationMovementA.id,
  restorationMovementB.id
);

const deleteRestorationNet =
  restorationMovementA.quantity +
  restorationMovementB.quantity;

assert.equal(deleteRestorationNet, 2);

const returnNetAfterDelete =
  returnMovementsAfterDelete.reduce(
    (sum, movement) => sum + movement.quantity,
    0
  );

assert.equal(returnNetAfterDelete, 4);

console.log(
  `Customer RETURN Movement #${customerReturnMovement.id}: +${customerReturnMovement.quantity}`
);

console.log(
  `DELETE restoration Movement #${restorationMovementA.id} | Batch A #${batchA.id}: +${restorationMovementA.quantity}`
);

console.log(
  `DELETE restoration Movement #${restorationMovementB.id} | Batch B #${batchB.id}: +${restorationMovementB.quantity}`
);

console.log(
  `DELETE restoration total=+${deleteRestorationNet}`
);

console.log(
  `Total RETURN net=+${returnNetAfterDelete}`
);

console.log("🟢 DELETE restoration movements verified");

// =========================================================================
// 21. VERIFY GLOBAL MOVEMENT BALANCE
// =========================================================================

logSection("21. VERIFY GLOBAL MOVEMENT BALANCE");

const supplyNetAfterDelete = movementsAfterDelete
  .filter((movement) => movement.type === "SUPPLY")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const saleNetAfterDelete = movementsAfterDelete
  .filter((movement) => movement.type === "SALE")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const writeoffNetAfterDelete = movementsAfterDelete
  .filter((movement) => movement.type === "WRITE_OFF")
  .reduce((sum, movement) => sum + movement.quantity, 0);

const movementNetAfterDelete = movementsAfterDelete.reduce(
  (sum, movement) => sum + movement.quantity,
  0
);

assert.equal(supplyNetAfterDelete, 5);
assert.equal(saleNetAfterDelete, -4);
assert.equal(returnNetAfterDelete, 4);
assert.equal(writeoffNetAfterDelete, -1);

/*
 * 5 - 4 + 4 - 1 = 4
 */

assert.equal(movementNetAfterDelete, 4);

assert.equal(
  productAfterDelete.stock,
  movementNetAfterDelete
);

console.log(`SUPPLY net=${supplyNetAfterDelete}`);
console.log(`SALE net=${saleNetAfterDelete}`);
console.log(`RETURN net=${returnNetAfterDelete}`);
console.log(`WRITE_OFF net=${writeoffNetAfterDelete}`);
console.log(`MOVEMENT NET=${movementNetAfterDelete}`);

console.log(
  `Product.stock=${productAfterDelete.stock} == Movement NET=${movementNetAfterDelete}`
);

console.log("🟢 Global movement balance verified");

// =========================================================================
// 22. VERIFY NO DOUBLE RESTORATION
// =========================================================================

logSection("22. VERIFY NO DOUBLE RESTORATION");

const batchAFinalCheck = await prisma.batch.findUnique({
  where: {
    id: batchA.id,
  },
});

const batchBFinalCheck = await prisma.batch.findUnique({
  where: {
    id: batchB.id,
  },
});

assert.ok(batchAFinalCheck);
assert.ok(batchBFinalCheck);

assert.equal(batchAFinalCheck.quantity, 2);
assert.equal(batchBFinalCheck.quantity, 2);

/*
 * If DELETE incorrectly restored the already returned 2 units,
 * Batch B would become 4.
 *
 * Correct result is 2.
 */

assert.notEqual(batchBFinalCheck.quantity, 4);

console.log(`Batch A final=${batchAFinalCheck.quantity}`);
console.log(`Batch B final=${batchBFinalCheck.quantity}`);

console.log(
  "🟢 No double restoration of already returned quantity"
);

// =========================================================================
// 23. VERIFY RETURN HISTORY BEFORE REPEATED DELETE
// =========================================================================

logSection("23. VERIFY RETURN HISTORY");

/*
 * After DELETE the order-related ReturnBatch records are removed.
 *
 * Permanent Movement history must still contain:
 *
 * customer RETURN +2
 * DELETE restoration Batch A +1
 * DELETE restoration Batch B +1
 *
 * Total RETURN +4.
 */

const returnMovementCount =
  returnMovementsAfterDelete.length;

assert.equal(returnMovementCount, 3);

console.log(
  `RETURN movements=${returnMovementCount}`
);

for (const movement of returnMovementsAfterDelete) {
  console.log(
    `Movement #${movement.id} | quantity=${movement.quantity} | comment=${movement.comment}`
  );
}

console.log("🟢 RETURN movement history verified");

// =========================================================================
// 24. REPEATED DELETE
// =========================================================================

logSection("24. REPEATED DELETE");

const movementCountBeforeRepeatedDelete =
  await prisma.movement.count({
    where: {
      productId: product.id,
    },
  });

const stockBeforeRepeatedDelete =
  productAfterDelete.stock;

const repeatedDeleteResponse = await requestJson(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(
  `HTTP ${repeatedDeleteResponse.status}`
);
console.log(
  JSON.stringify(
    repeatedDeleteResponse.data,
    null,
    2
  )
);

assert.equal(
  repeatedDeleteResponse.status,
  404
);

const productAfterRepeatedDelete =
  await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

assert.ok(productAfterRepeatedDelete);

assert.equal(
  productAfterRepeatedDelete.stock,
  stockBeforeRepeatedDelete
);

const movementCountAfterRepeatedDelete =
  await prisma.movement.count({
    where: {
      productId: product.id,
    },
  });

assert.equal(
  movementCountAfterRepeatedDelete,
  movementCountBeforeRepeatedDelete
);

const batchAAfterRepeatedDelete =
  await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

const batchBAfterRepeatedDelete =
  await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

assert.ok(batchAAfterRepeatedDelete);
assert.ok(batchBAfterRepeatedDelete);

assert.equal(
  batchAAfterRepeatedDelete.quantity,
  2
);

assert.equal(
  batchBAfterRepeatedDelete.quantity,
  2
);

console.log(
  "🟢 Repeated DELETE returned 404"
);

console.log(
  `Product stock remained=${productAfterRepeatedDelete.stock}`
);

console.log(
  `Movement count remained=${movementCountAfterRepeatedDelete}`
);

console.log(
  `Batch A remained=${batchAAfterRepeatedDelete.quantity}`
);

console.log(
  `Batch B remained=${batchBAfterRepeatedDelete.quantity}`
);

console.log(
  "🟢 Repeated DELETE produced no side effects"
);

// =========================================================================
// 25. FINAL STOCK / BATCH INTEGRITY
// =========================================================================

logSection("25. FINAL STOCK / BATCH INTEGRITY");

const finalProduct = await prisma.product.findUnique({
  where: {
    id: product.id,
  },
});

assert.ok(finalProduct);

const finalBatches = await prisma.batch.findMany({
  where: {
    productId: product.id,
  },
  orderBy: {
    id: "asc",
  },
});

const finalBatchSum = finalBatches.reduce(
  (sum, batch) => sum + batch.quantity,
  0
);

assert.equal(
  finalProduct.stock,
  finalBatchSum
);

assert.equal(finalProduct.stock, 4);

console.log(
  `Product #${product.id} stock=${finalProduct.stock}`
);

for (const batch of finalBatches) {
  console.log(
    `Batch #${batch.id} | quantity=${batch.quantity} | ` +
      `purchaseCost=${batch.purchaseCost} | status=${batch.status}`
  );
}

console.log(
  `SUM(Batch.quantity)=${finalBatchSum}`
);

console.log(
  "🟢 Final stock integrity passed"
);

// =========================================================================
// 26. FINAL FINANCIAL / MOVEMENT SUMMARY
// =========================================================================

logSection("26. FINAL FINANCIAL / MOVEMENT SUMMARY");

/*
 * Initial supply:
 *   +5
 *
 * Sale:
 *   -4
 *
 * Customer return:
 *   +2
 *
 * Write-off:
 *   -1
 *
 * DELETE restoration:
 *   +1 Batch A
 *   +1 Batch B
 *   = +2
 *
 * Final:
 *   5 - 4 + 2 - 1 + 1 + 1 = 4
 */

assert.equal(supplyNetAfterDelete, 5);
assert.equal(saleNetAfterDelete, -4);
assert.equal(returnNetAfterDelete, 4);
assert.equal(writeoffNetAfterDelete, -1);
assert.equal(movementNetAfterDelete, 4);
assert.equal(finalProduct.stock, 4);

console.log("SUPPLY:             +5");
console.log("SALE:               -4");
console.log("CUSTOMER RETURN:    +2");
console.log("WRITE_OFF:          -1");
console.log("DELETE RETURN A:    +1");
console.log("DELETE RETURN B:    +1");
console.log("-------------------------");
console.log("FINAL STOCK:         4");

console.log("");
console.log(
  "🟢 Final financial/stock movement balance verified"
);

// =========================================================================
// 27. FINAL RESULT
// =========================================================================

logSection("V62 FINAL RESULT");

console.log("🟢 V62 PASSED");
console.log("");
console.log("Проверено:");
console.log("");
console.log("1. Создан тестовый Supplier.");
console.log("2. Создан Product со stock=0.");
console.log("3. Через API создана первая Supply.");
console.log("4. Создана Batch A: 2 шт @100.");
console.log("5. Через API создана вторая Supply.");
console.log("6. Создана Batch B: 3 шт @120.");
console.log("7. Product.stock после поставок = 5.");
console.log("8. Созданы два SUPPLY Movement.");
console.log("9. Через API создан заказ на 4 шт.");
console.log("10. FEFO/FIFO выбрал Batch B=3 и Batch A=1.");
console.log("11. Order.total после продажи = 1200.");
console.log("12. Order.profit после продажи = 740.");
console.log("13. После продажи stock = 1.");
console.log("14. SALE Movement = -4.");
console.log("15. Выполнен частичный возврат 2 шт.");
console.log("16. Возврат выполнен из Batch B.");
console.log("17. После возврата total = 600.");
console.log("18. После возврата profit = 380.");
console.log("19. После возврата stock = 3.");
console.log("20. Выполнено списание 1 шт из Batch B.");
console.log("21. После списания Batch B = 1.");
console.log("22. После списания Product.stock = 2.");
console.log("23. WRITE_OFF Movement = -1.");
console.log("24. DELETE заказа выполнен успешно.");
console.log("25. Order удалён.");
console.log("26. OrderItem удалён.");
console.log("27. OrderBatch удалён.");
console.log("28. ReturnBatch удалён.");
console.log("29. Batch A восстановлена с 1 до 2.");
console.log("30. Batch B восстановлена с 1 до 2.");
console.log("31. Уже возвращённые 2 шт повторно не восстановлены.");
console.log("32. WRITE_OFF -1 не был отменён.");
console.log("33. Product.stock после DELETE = 4.");
console.log("34. Product.stock == SUM(Batch.quantity).");
console.log("35. Customer RETURN +2 сохранён в Movement.");
console.log("36. DELETE restoration Batch A +1 создан.");
console.log("37. DELETE restoration Batch B +1 создан.");
console.log("38. Общий DELETE restoration = +2.");
console.log("39. Общий RETURN net = +4.");
console.log("40. SALE net = -4.");
console.log("41. SUPPLY net = +5.");
console.log("42. WRITE_OFF net = -1.");
console.log("43. Movement NET = +4.");
console.log("44. Product.stock == Movement NET.");
console.log("45. Повторный DELETE вернул HTTP 404.");
console.log("46. Повторный DELETE не изменил stock.");
console.log("47. Повторный DELETE не создал Movement.");
console.log("48. Повторный DELETE не изменил партии.");
console.log("49. Финальная сумма партий = 4.");
console.log("");
console.log("Production-код не изменялся.");
console.log("Тестовые данные удаляются после завершения.");
console.log("");


} finally {
await cleanupTestData(ids);
}
}

main()
.catch((error) => {
console.error("");
console.error("🔴 V62 FAILED");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
