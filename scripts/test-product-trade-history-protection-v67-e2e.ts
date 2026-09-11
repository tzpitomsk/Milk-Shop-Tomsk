import assert from "node:assert/strict";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

type ApiResponse<T = any> = {
status: number;
data: T;
};

async function request(
path: string,
options?: RequestInit
): Promise<ApiResponse> {
const response = await fetch(`${BASE_URL}${path}`, {
...options,
headers: {
"Content-Type": "application/json",
...(options?.headers ?? {}),
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
result: ApiResponse,
expected: number,
message: string
) {
assert.equal(
result.status,
expected,
`${message}. Ожидался HTTP ${expected}, получен HTTP ${result.status}. Ответ: ${JSON.stringify(result.data)}`
);
}

function getId(data: any, entityName: string): number {
const id = Number(data?.id);

assert.ok(
Number.isInteger(id) && id > 0,
`${entityName}: API не вернул корректный id. Ответ: ${JSON.stringify(data)}`
);

return id;
}

async function cleanup(
productId: number | null,
supplierId: number | null,
supplyId: number | null,
orderId: number | null
) {
console.log("");
console.log("CLEANUP");
console.log("------------------------------------------------------------------------------");

try {
// ==================================================
// 1. Удаляем заказ и его зависимости
// ==================================================


if (orderId) {
  const orderItems = await prisma.orderItem.findMany({
    where: {
      orderId,
    },
    select: {
      id: true,
    },
  });

  const orderItemIds = orderItems.map((item) => item.id);

  if (orderItemIds.length > 0) {
    await prisma.returnBatch.deleteMany({
      where: {
        orderItemId: {
          in: orderItemIds,
        },
      },
    });

    await prisma.orderBatch.deleteMany({
      where: {
        orderItemId: {
          in: orderItemIds,
        },
      },
    });

    await prisma.orderItem.deleteMany({
      where: {
        id: {
          in: orderItemIds,
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

// ==================================================
// 2. Удаляем поставку
//
// SupplyItem содержит FK на Product и Supply,
// поэтому сначала удаляем SupplyItem.
// ==================================================

if (supplyId) {
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

// ==================================================
// 3. Удаляем складскую историю товара
// ==================================================

if (productId) {
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

// ==================================================
// 4. Supplier удаляем последним
// ==================================================

if (supplierId) {
  await prisma.supplier.deleteMany({
    where: {
      id: supplierId,
    },
  });
}

console.log("🟢 Cleanup completed");


} catch (error) {
console.error("🔴 CLEANUP FAILED");
console.error(error);
}
}

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V67 PRODUCT TRADE HISTORY PROTECTION E2E TEST");
console.log("==============================================================================");
console.log("");

console.log("Проверяем:");
console.log("Product нельзя удалить после появления торговой истории.");
console.log("");

console.log("Production code НЕ изменяется.");
console.log("");

let productId: number | null = null;
let supplierId: number | null = null;
let supplyId: number | null = null;
let orderId: number | null = null;

try {
// ==================================================
// 1. CREATE PRODUCT
// ==================================================


console.log("1. CREATE PRODUCT");
console.log("------------------------------------------------------------------------------");

const productResponse = await request("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: `V67 Trade History Product ${Date.now()}`,
    unit: "шт",
    price: 200,
    cost: 100,
    barcode: null,
  }),
});

assertStatus(
  productResponse,
  200,
  "Создание Product должно завершиться успешно"
);

productId = getId(productResponse.data, "Product");

console.log(`🟢 Product #${productId} created`);
console.log("");

// ==================================================
// 2. CREATE SUPPLIER
// ==================================================

console.log("2. CREATE SUPPLIER");
console.log("------------------------------------------------------------------------------");

const supplierResponse = await request("/api/suppliers", {
  method: "POST",
  body: JSON.stringify({
    name: `V67 Supplier ${Date.now()}`,
  }),
});

assertStatus(
  supplierResponse,
  200,
  "Создание Supplier должно завершиться успешно"
);

supplierId = getId(supplierResponse.data, "Supplier");

console.log(`🟢 Supplier #${supplierId} created`);
console.log("");

// ==================================================
// 3. CREATE SUPPLY
// ==================================================

console.log("3. CREATE SUPPLY");
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
        expiryDate: "2035-12-31",
      },
    ],
  }),
});

assertStatus(
  supplyResponse,
  200,
  "Создание Supply должно завершиться успешно"
);

supplyId = getId(
  supplyResponse.data?.supply,
  "Supply"
);

console.log(`🟢 Supply #${supplyId} created`);
console.log("");

// ==================================================
// 4. VERIFY SUPPLY
// ==================================================

console.log("4. VERIFY SUPPLY");
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
  `Supply #${supplyId} должен существовать`
);

assert.equal(
  supply.items.length,
  1,
  "Supply должен содержать один SupplyItem"
);

assert.equal(
  supply.items[0].productId,
  productId,
  "SupplyItem должен ссылаться на созданный Product"
);

assert.equal(
  supply.items[0].quantity,
  5,
  "SupplyItem quantity должен быть 5"
);

console.log("🟢 Supply/SupplyItem verified");
console.log("");

// ==================================================
// 5. VERIFY BATCH
// ==================================================

console.log("5. VERIFY BATCH");
console.log("------------------------------------------------------------------------------");

const batch = await prisma.batch.findFirst({
  where: {
    productId,
  },
  orderBy: {
    id: "desc",
  },
});

assert.ok(
  batch,
  "После поставки должна существовать Batch"
);

assert.equal(
  batch.quantity,
  5,
  "Batch quantity должен быть 5"
);

assert.equal(
  batch.purchaseCost,
  100,
  "Batch purchaseCost должен быть 100"
);

assert.equal(
  batch.status,
  "ACTIVE",
  "Batch должен быть ACTIVE"
);

console.log(
  `🟢 Batch #${batch.id} | quantity=${batch.quantity} | purchaseCost=${batch.purchaseCost}`
);

console.log("");

// ==================================================
// 6. VERIFY INITIAL STOCK
// ==================================================

console.log("6. VERIFY INITIAL PRODUCT STOCK");
console.log("------------------------------------------------------------------------------");

let product = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.ok(
  product,
  `Product #${productId} должен существовать`
);

assert.equal(
  product.stock,
  5,
  "После поставки Product.stock должен быть 5"
);

console.log(
  `🟢 Product #${productId} stock=${product.stock}`
);

console.log("");

// ==================================================
// 7. CREATE ORDER
//
// ВАЖНО:
// POST /api/orders ожидает item.id,
// а НЕ item.productId.
// ==================================================

console.log("7. CREATE ORDER");
console.log("------------------------------------------------------------------------------");

const orderResponse = await request("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    items: [
      {
        id: productId,
        quantity: 2,
      },
    ],
  }),
});

assertStatus(
  orderResponse,
  201,
  "Создание заказа должно завершиться успешно"
);

orderId = getId(
  orderResponse.data,
  "Order"
);

console.log(`🟢 Order #${orderId} created`);
console.log("");

// ==================================================
// 8. VERIFY ORDER
// ==================================================

console.log("8. VERIFY ORDER");
console.log("------------------------------------------------------------------------------");

const order = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: true,
      },
    },
  },
});

assert.ok(
  order,
  `Order #${orderId} должен существовать`
);

assert.equal(
  order.items.length,
  1,
  "Заказ должен содержать одну OrderItem"
);

const orderItem = order.items[0];

assert.equal(
  orderItem.productId,
  productId,
  "OrderItem должен ссылаться на созданный Product"
);

assert.equal(
  orderItem.quantity,
  2,
  "OrderItem quantity должен быть 2"
);

assert.equal(
  orderItem.batches.length,
  1,
  "OrderItem должен иметь один OrderBatch"
);

assert.equal(
  orderItem.batches[0].batchId,
  batch.id,
  "OrderBatch должен ссылаться на созданную Batch"
);

assert.equal(
  orderItem.batches[0].quantity,
  2,
  "OrderBatch quantity должен быть 2"
);

assert.equal(
  orderItem.batches[0].purchaseCost,
  100,
  "OrderBatch purchaseCost должен быть 100"
);

console.log(
  `🟢 Order #${orderId} | OrderItem #${orderItem.id} | OrderBatch #${orderItem.batches[0].id}`
);

console.log("");

// ==================================================
// 9. VERIFY STOCK AFTER SALE
// ==================================================

console.log("9. VERIFY STOCK AFTER SALE");
console.log("------------------------------------------------------------------------------");

product = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.ok(
  product,
  `Product #${productId} должен существовать`
);

assert.equal(
  product.stock,
  3,
  "После продажи 2 шт Product.stock должен быть 3"
);

const batchAfterSale = await prisma.batch.findUnique({
  where: {
    id: batch.id,
  },
});

assert.ok(
  batchAfterSale,
  `Batch #${batch.id} должна существовать`
);

assert.equal(
  batchAfterSale.quantity,
  3,
  "После продажи Batch.quantity должен быть 3"
);

console.log(
  `🟢 Product.stock=${product.stock}`
);

console.log(
  `🟢 Batch #${batch.id} quantity=${batchAfterSale.quantity}`
);

console.log("");

// ==================================================
// 10. VERIFY SALE MOVEMENT
// ==================================================

console.log("10. VERIFY SALE MOVEMENT");
console.log("------------------------------------------------------------------------------");

const saleMovement = await prisma.movement.findFirst({
  where: {
    productId,
    type: "SALE",
    comment: `Продажа. Заказ №${orderId}`,
  },
  orderBy: {
    id: "desc",
  },
});

assert.ok(
  saleMovement,
  "После продажи должен существовать SALE Movement"
);

assert.equal(
  saleMovement.quantity,
  -2,
  "SALE Movement quantity должен быть -2"
);

console.log(
  `🟢 Movement #${saleMovement.id} | type=${saleMovement.type} | quantity=${saleMovement.quantity}`
);

console.log("");

// ==================================================
// 11. CAPTURE PRE-DELETE STATE
// ==================================================

console.log("11. CAPTURE PRE-DELETE STATE");
console.log("------------------------------------------------------------------------------");

const beforeDeleteProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

const beforeDeleteSupply = await prisma.supply.findUnique({
  where: {
    id: supplyId,
  },
  include: {
    items: true,
  },
});

const beforeDeleteOrder = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: true,
      },
    },
  },
});

const beforeDeleteBatch = await prisma.batch.findUnique({
  where: {
    id: batch.id,
  },
});

const beforeDeleteMovements = await prisma.movement.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

assert.ok(
  beforeDeleteProduct,
  "Product должен существовать до попытки удаления"
);

assert.ok(
  beforeDeleteSupply,
  "Supply должен существовать до попытки удаления"
);

assert.ok(
  beforeDeleteOrder,
  "Order должен существовать до попытки удаления"
);

assert.ok(
  beforeDeleteBatch,
  "Batch должен существовать до попытки удаления"
);

console.log(
  `Product #${productId} stock=${beforeDeleteProduct.stock}`
);

console.log(
  `Supply #${supplyId} items=${beforeDeleteSupply.items.length}`
);

console.log(
  `Order #${orderId} items=${beforeDeleteOrder.items.length}`
);

console.log(
  `Batch #${batch.id} quantity=${beforeDeleteBatch.quantity}`
);

console.log(
  `Movements=${beforeDeleteMovements.length}`
);

console.log("");

// ==================================================
// 12. CAPTURE GLOBAL COUNTS
// ==================================================

console.log("12. CAPTURE GLOBAL COUNTS");
console.log("------------------------------------------------------------------------------");

const countsBefore = {
  products: await prisma.product.count(),
  supplies: await prisma.supply.count(),
  supplyItems: await prisma.supplyItem.count(),
  batches: await prisma.batch.count(),
  orders: await prisma.order.count(),
  orderItems: await prisma.orderItem.count(),
  orderBatches: await prisma.orderBatch.count(),
  returnBatches: await prisma.returnBatch.count(),
  movements: await prisma.movement.count(),
  suppliers: await prisma.supplier.count(),
};

console.log(
  JSON.stringify(countsBefore, null, 2)
);

console.log("");

// ==================================================
// 13. ATTEMPT PRODUCT DELETE
// ==================================================

console.log("13. ATTEMPT PRODUCT DELETE");
console.log("------------------------------------------------------------------------------");

const deleteResponse = await request(
  `/api/products/${productId}`,
  {
    method: "DELETE",
  }
);

assert.notEqual(
  deleteResponse.status,
  200,
  "Product с торговой историей НЕ должен удаляться"
);

assert.equal(
  deleteResponse.status,
  400,
  "Удаление Product с торговой историей должно вернуть HTTP 400"
);

console.log(
  `🟢 DELETE returned HTTP ${deleteResponse.status}`
);

console.log(
  `Ответ: ${JSON.stringify(deleteResponse.data)}`
);

console.log("");

// ==================================================
// 14. VERIFY PRODUCT UNCHANGED
// ==================================================

console.log("14. VERIFY PRODUCT UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteProduct = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.deepEqual(
  afterDeleteProduct,
  beforeDeleteProduct,
  "Product не должен измениться после неудачной попытки удаления"
);

console.log("🟢 Product unchanged");
console.log("");

// ==================================================
// 15. VERIFY SUPPLY UNCHANGED
// ==================================================

console.log("15. VERIFY SUPPLY UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteSupply = await prisma.supply.findUnique({
  where: {
    id: supplyId,
  },
  include: {
    items: true,
  },
});

assert.deepEqual(
  afterDeleteSupply,
  beforeDeleteSupply,
  "Supply/SupplyItem не должны измениться"
);

console.log("🟢 Supply/SupplyItem unchanged");
console.log("");

// ==================================================
// 16. VERIFY ORDER UNCHANGED
// ==================================================

console.log("16. VERIFY ORDER UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteOrder = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  include: {
    items: {
      include: {
        batches: true,
      },
    },
  },
});

assert.deepEqual(
  afterDeleteOrder,
  beforeDeleteOrder,
  "Order/OrderItem/OrderBatch не должны измениться"
);

console.log("🟢 Order/OrderItem/OrderBatch unchanged");
console.log("");

// ==================================================
// 17. VERIFY BATCH UNCHANGED
// ==================================================

console.log("17. VERIFY BATCH UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteBatch = await prisma.batch.findUnique({
  where: {
    id: batch.id,
  },
});

assert.deepEqual(
  afterDeleteBatch,
  beforeDeleteBatch,
  "Batch не должна измениться"
);

console.log("🟢 Batch unchanged");
console.log("");

// ==================================================
// 18. VERIFY MOVEMENTS UNCHANGED
// ==================================================

console.log("18. VERIFY MOVEMENTS UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteMovements = await prisma.movement.findMany({
  where: {
    productId,
  },
  orderBy: {
    id: "asc",
  },
});

assert.deepEqual(
  afterDeleteMovements,
  beforeDeleteMovements,
  "Movements не должны измениться"
);

console.log("🟢 Movements unchanged");
console.log("");

// ==================================================
// 19. VERIFY STOCK UNCHANGED
// ==================================================

console.log("19. VERIFY STOCK UNCHANGED");
console.log("------------------------------------------------------------------------------");

const productAfterDelete = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.ok(
  productAfterDelete,
  "Product должен существовать после неудачной попытки удаления"
);

const batchesAfterDelete = await prisma.batch.findMany({
  where: {
    productId,
  },
});

const batchStockAfterDelete = batchesAfterDelete.reduce(
  (sum, item) => sum + item.quantity,
  0
);

assert.equal(
  productAfterDelete.stock,
  batchStockAfterDelete,
  "Product.stock должен совпадать с суммой Batch.quantity"
);

assert.equal(
  productAfterDelete.stock,
  3,
  "Product.stock должен остаться равным 3"
);

console.log(
  `🟢 Product.stock=${productAfterDelete.stock}`
);

console.log(
  `🟢 SUM(Batch.quantity)=${batchStockAfterDelete}`
);

console.log("");

// ==================================================
// 20. VERIFY GLOBAL COUNTS
// ==================================================

console.log("20. VERIFY GLOBAL COUNTS");
console.log("------------------------------------------------------------------------------");

const countsAfter = {
  products: await prisma.product.count(),
  supplies: await prisma.supply.count(),
  supplyItems: await prisma.supplyItem.count(),
  batches: await prisma.batch.count(),
  orders: await prisma.order.count(),
  orderItems: await prisma.orderItem.count(),
  orderBatches: await prisma.orderBatch.count(),
  returnBatches: await prisma.returnBatch.count(),
  movements: await prisma.movement.count(),
  suppliers: await prisma.supplier.count(),
};

assert.deepEqual(
  countsAfter,
  countsBefore,
  "Глобальные количества записей не должны измениться"
);

console.log("🟢 Global counts unchanged");
console.log("");

// ==================================================
// 21. FINAL RESULT
// ==================================================

console.log("==============================================================================");
console.log("V67 FINAL RESULT");
console.log("==============================================================================");
console.log("");

console.log("🟢 V67 TEST PASSED");
console.log("");

console.log(
  "Product с торговой историей не удалён."
);

console.log(
  "Order/OrderItem/OrderBatch сохранены."
);

console.log(
  "Supply/SupplyItem сохранены."
);

console.log(
  "Batch сохранена."
);

console.log(
  "Movement сохранены."
);

console.log(
  "Product.stock не изменился."
);

console.log(
  "Глобальные количества записей не изменились."
);

console.log("");


} catch (error) {
console.error("");
console.error("🔴 V67 TEST FAILED");
console.error("");
console.error(error);
console.error("");


process.exitCode = 1;


} finally {
await cleanup(
productId,
supplierId,
supplyId,
orderId
);


await prisma.$disconnect();


}
}

main();
