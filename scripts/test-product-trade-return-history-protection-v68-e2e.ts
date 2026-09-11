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
// 1. Удаляем заказ и все его зависимости
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

  const orderItemIds = orderItems.map(
    (item) => item.id
  );

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
// 3. Удаляем движения, партии и товар
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
// 4. Удаляем поставщика
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
console.log("V68 PRODUCT TRADE + RETURN HISTORY PROTECTION E2E TEST");
console.log("==============================================================================");
console.log("");
console.log("Проверяем:");
console.log("поставка → продажа → полный возврат → попытка удаления Product");
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

const productResponse = await request(
  "/api/products",
  {
    method: "POST",
    body: JSON.stringify({
      name: `V68 Trade Return Product ${Date.now()}`,
      unit: "шт",
      price: 200,
      cost: 100,
      barcode: null,
    }),
  }
);

assertStatus(
  productResponse,
  200,
  "Создание Product должно завершиться успешно"
);

productId = getId(
  productResponse.data,
  "Product"
);

console.log(
  `🟢 Product #${productId} created`
);
console.log("");

// ==================================================
// 2. CREATE SUPPLIER
// ==================================================

console.log("2. CREATE SUPPLIER");
console.log("------------------------------------------------------------------------------");

const supplierResponse = await request(
  "/api/suppliers",
  {
    method: "POST",
    body: JSON.stringify({
      name: `V68 Supplier ${Date.now()}`,
    }),
  }
);

assertStatus(
  supplierResponse,
  200,
  "Создание Supplier должно завершиться успешно"
);

supplierId = getId(
  supplierResponse.data,
  "Supplier"
);

console.log(
  `🟢 Supplier #${supplierId} created`
);
console.log("");

// ==================================================
// 3. CREATE SUPPLY
// ==================================================

console.log("3. CREATE SUPPLY");
console.log("------------------------------------------------------------------------------");

const supplyResponse = await request(
  "/api/supplies",
  {
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
  }
);

assertStatus(
  supplyResponse,
  200,
  "Создание Supply должно завершиться успешно"
);

supplyId = getId(
  supplyResponse.data?.supply,
  "Supply"
);

console.log(
  `🟢 Supply #${supplyId} created`
);
console.log("");

// ==================================================
// 4. VERIFY BATCH
// ==================================================

console.log("4. VERIFY BATCH");
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
// 5. VERIFY INITIAL STOCK
// ==================================================

console.log("5. VERIFY INITIAL STOCK");
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
  `🟢 Product.stock=${product.stock}`
);
console.log("");

// ==================================================
// 6. CREATE ORDER
// ==================================================

console.log("6. CREATE ORDER");
console.log("------------------------------------------------------------------------------");

const orderResponse = await request(
  "/api/orders",
  {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          id: productId,
          quantity: 2,
        },
      ],
    }),
  }
);

assertStatus(
  orderResponse,
  201,
  "Создание заказа должно завершиться успешно"
);

orderId = getId(
  orderResponse.data,
  "Order"
);

console.log(
  `🟢 Order #${orderId} created`
);
console.log("");

// ==================================================
// 7. VERIFY SALE
// ==================================================

console.log("7. VERIFY SALE");
console.log("------------------------------------------------------------------------------");

const orderAfterSale =
  await prisma.order.findUnique({
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

assert.ok(
  orderAfterSale,
  `Order #${orderId} должен существовать`
);

assert.equal(
  orderAfterSale.items.length,
  1,
  "Заказ должен содержать одну OrderItem"
);

const orderItemId =
  orderAfterSale.items[0].id;

assert.equal(
  orderAfterSale.items[0].productId,
  productId,
  "OrderItem должен ссылаться на Product"
);

assert.equal(
  orderAfterSale.items[0].quantity,
  2,
  "OrderItem quantity должен быть 2"
);

assert.equal(
  orderAfterSale.items[0].returned,
  0,
  "До возврата returned должен быть 0"
);

assert.equal(
  orderAfterSale.items[0].batches.length,
  1,
  "OrderItem должен иметь один OrderBatch"
);

assert.equal(
  orderAfterSale.items[0].batches[0].batchId,
  batch.id,
  "OrderBatch должен ссылаться на созданную Batch"
);

assert.equal(
  orderAfterSale.items[0].batches[0].quantity,
  2,
  "OrderBatch quantity должен быть 2"
);

assert.equal(
  orderAfterSale.items[0].batches[0].purchaseCost,
  100,
  "OrderBatch purchaseCost должен быть 100"
);

console.log(
  `🟢 Order #${orderId} | OrderItem #${orderItemId}`
);

console.log(
  `🟢 OrderBatch #${orderAfterSale.items[0].batches[0].id}`
);

console.log("");

// ==================================================
// 8. VERIFY STOCK AFTER SALE
// ==================================================

console.log("8. VERIFY STOCK AFTER SALE");
console.log("------------------------------------------------------------------------------");

product = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.ok(product);

assert.equal(
  product.stock,
  3,
  "После продажи 2 шт Product.stock должен быть 3"
);

const batchAfterSale =
  await prisma.batch.findUnique({
    where: {
      id: batch.id,
    },
  });

assert.ok(batchAfterSale);

assert.equal(
  batchAfterSale.quantity,
  3,
  "После продажи Batch.quantity должен быть 3"
);

console.log(
  `🟢 Product.stock=${product.stock}`
);

console.log(
  `🟢 Batch.quantity=${batchAfterSale.quantity}`
);

console.log("");

// ==================================================
// 9. VERIFY ORDER FINANCIALS BEFORE RETURN
// ==================================================

console.log("9. VERIFY ORDER FINANCIALS BEFORE RETURN");
console.log("------------------------------------------------------------------------------");

const orderFinancialsBeforeReturn =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      total: true,
      profit: true,
      status: true,
    },
  });

assert.ok(
  orderFinancialsBeforeReturn,
  `Order #${orderId} должен существовать`
);

assert.equal(
  orderFinancialsBeforeReturn.total,
  400,
  "До возврата Order.total должен быть 400"
);

assert.equal(
  orderFinancialsBeforeReturn.profit,
  200,
  "До возврата Order.profit должен быть 200"
);

assert.equal(
  orderFinancialsBeforeReturn.status,
  "COMPLETED",
  "До возврата Order.status должен быть COMPLETED"
);

console.log(
  `🟢 Order.total=${orderFinancialsBeforeReturn.total}`
);

console.log(
  `🟢 Order.profit=${orderFinancialsBeforeReturn.profit}`
);

console.log(
  `🟢 Order.status=${orderFinancialsBeforeReturn.status}`
);

console.log("");

// ==================================================
// 10. RETURN ALL SOLD UNITS
// ==================================================

console.log("10. RETURN ALL SOLD UNITS");
console.log("------------------------------------------------------------------------------");

const returnResponse = await request(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: orderItemId,
      quantity: 2,
    }),
  }
);

assertStatus(
  returnResponse,
  200,
  "Полный возврат должен завершиться успешно"
);

console.log(
  `🟢 Return completed for OrderItem #${orderItemId}`
);
console.log("");

// ==================================================
// 11. VERIFY RETURNED ORDER
// ==================================================

console.log("11. VERIFY RETURNED ORDER");
console.log("------------------------------------------------------------------------------");

const orderAfterReturn =
  await prisma.order.findUnique({
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

assert.ok(
  orderAfterReturn,
  `Order #${orderId} должен существовать после возврата`
);

assert.equal(
  orderAfterReturn.items.length,
  1,
  "После возврата должна сохраниться одна OrderItem"
);

assert.equal(
  orderAfterReturn.items[0].returned,
  2,
  "OrderItem.returned должен быть 2"
);

assert.equal(
  orderAfterReturn.items[0].ReturnBatch.length,
  1,
  "Должен существовать один ReturnBatch"
);

assert.equal(
  orderAfterReturn.items[0].ReturnBatch[0].quantity,
  2,
  "ReturnBatch quantity должен быть 2"
);

assert.equal(
  orderAfterReturn.items[0].ReturnBatch[0].batchId,
  batch.id,
  "ReturnBatch должен ссылаться на исходную Batch"
);

assert.equal(
  orderAfterReturn.total,
  0,
  "После полного возврата Order.total должен быть 0"
);

assert.equal(
  orderAfterReturn.profit,
  0,
  "После полного возврата Order.profit должен быть 0"
);

assert.equal(
  orderAfterReturn.status,
  "RETURNED",
  "После полного возврата Order.status должен быть RETURNED"
);

console.log(
  `🟢 Order.total=${orderAfterReturn.total}`
);

console.log(
  `🟢 Order.profit=${orderAfterReturn.profit}`
);

console.log(
  `🟢 Order.status=${orderAfterReturn.status}`
);

console.log(
  `🟢 returned=${orderAfterReturn.items[0].returned}`
);

console.log(
  `🟢 ReturnBatch #${orderAfterReturn.items[0].ReturnBatch[0].id}`
);

console.log("");

// ==================================================
// 12. VERIFY STOCK AFTER RETURN
// ==================================================

console.log("12. VERIFY STOCK AFTER RETURN");
console.log("------------------------------------------------------------------------------");

product = await prisma.product.findUnique({
  where: {
    id: productId,
  },
});

assert.ok(product);

assert.equal(
  product.stock,
  5,
  "После полного возврата Product.stock должен снова стать 5"
);

const batchAfterReturn =
  await prisma.batch.findUnique({
    where: {
      id: batch.id,
    },
  });

assert.ok(batchAfterReturn);

assert.equal(
  batchAfterReturn.quantity,
  5,
  "После полного возврата Batch.quantity должен снова стать 5"
);

assert.equal(
  batchAfterReturn.status,
  "ACTIVE",
  "После возврата Batch должна быть ACTIVE"
);

console.log(
  `🟢 Product.stock=${product.stock}`
);

console.log(
  `🟢 Batch.quantity=${batchAfterReturn.quantity}`
);

console.log(
  `🟢 Batch.status=${batchAfterReturn.status}`
);

console.log("");

// ==================================================
// 13. VERIFY MOVEMENTS
// ==================================================

console.log("13. VERIFY MOVEMENTS");
console.log("------------------------------------------------------------------------------");

const movementsBeforeDelete =
  await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

assert.equal(
  movementsBeforeDelete.length,
  3,
  "Должно быть 3 движения: SUPPLY, SALE, RETURN"
);

const supplyMovement =
  movementsBeforeDelete.find(
    (movement) =>
      movement.type === "SUPPLY"
  );

const saleMovement =
  movementsBeforeDelete.find(
    (movement) =>
      movement.type === "SALE"
  );

const returnMovement =
  movementsBeforeDelete.find(
    (movement) =>
      movement.type === "RETURN"
  );

assert.ok(
  supplyMovement,
  "Должно существовать SUPPLY движение"
);

assert.ok(
  saleMovement,
  "Должно существовать SALE движение"
);

assert.ok(
  returnMovement,
  "Должно существовать RETURN движение"
);

assert.equal(
  supplyMovement.quantity,
  5,
  "SUPPLY quantity должен быть 5"
);

assert.equal(
  saleMovement.quantity,
  -2,
  "SALE quantity должен быть -2"
);

assert.equal(
  returnMovement.quantity,
  2,
  "RETURN quantity должен быть 2"
);

console.log(
  `🟢 SUPPLY=${supplyMovement.quantity}`
);

console.log(
  `🟢 SALE=${saleMovement.quantity}`
);

console.log(
  `🟢 RETURN=${returnMovement.quantity}`
);

console.log("");

// ==================================================
// 14. CAPTURE COMPLETE PRE-DELETE STATE
// ==================================================

console.log("14. CAPTURE COMPLETE PRE-DELETE STATE");
console.log("------------------------------------------------------------------------------");

const beforeDeleteProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

const beforeDeleteSupply =
  await prisma.supply.findUnique({
    where: {
      id: supplyId,
    },
    include: {
      items: true,
    },
  });

const beforeDeleteOrder =
  await prisma.order.findUnique({
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

const beforeDeleteBatch =
  await prisma.batch.findUnique({
    where: {
      id: batch.id,
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
  "Batch должна существовать до попытки удаления"
);

console.log(
  `Product #${productId} stock=${beforeDeleteProduct.stock}`
);

console.log(
  `Supply #${supplyId} items=${beforeDeleteSupply.items.length}`
);

console.log(
  `Order #${orderId} status=${beforeDeleteOrder.status}`
);

console.log(
  `Batch #${batch.id} quantity=${beforeDeleteBatch.quantity}`
);

console.log(
  `Movements=${movementsBeforeDelete.length}`
);

console.log("");

// ==================================================
// 15. CAPTURE GLOBAL COUNTS
// ==================================================

console.log("15. CAPTURE GLOBAL COUNTS");
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
  JSON.stringify(
    countsBefore,
    null,
    2
  )
);

console.log("");

// ==================================================
// 16. ATTEMPT PRODUCT DELETE
// ==================================================

console.log("16. ATTEMPT PRODUCT DELETE");
console.log("------------------------------------------------------------------------------");

const deleteResponse = await request(
  `/api/products/${productId}`,
  {
    method: "DELETE",
  }
);

assert.equal(
  deleteResponse.status,
  400,
  "Product с торговой историей после возврата должен вернуть HTTP 400"
);

console.log(
  `🟢 DELETE returned HTTP ${deleteResponse.status}`
);

console.log(
  `Ответ: ${JSON.stringify(deleteResponse.data)}`
);

console.log("");

// ==================================================
// 17. VERIFY PRODUCT UNCHANGED
// ==================================================

console.log("17. VERIFY PRODUCT UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert.deepEqual(
  afterDeleteProduct,
  beforeDeleteProduct,
  "Product не должен измениться"
);

console.log(
  "🟢 Product unchanged"
);

console.log("");

// ==================================================
// 18. VERIFY SUPPLY UNCHANGED
// ==================================================

console.log("18. VERIFY SUPPLY UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteSupply =
  await prisma.supply.findUnique({
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

console.log(
  "🟢 Supply/SupplyItem unchanged"
);

console.log("");

// ==================================================
// 19. VERIFY ORDER AND RETURN UNCHANGED
// ==================================================

console.log("19. VERIFY ORDER AND RETURN UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteOrder =
  await prisma.order.findUnique({
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

assert.deepEqual(
  afterDeleteOrder,
  beforeDeleteOrder,
  "Order/OrderItem/OrderBatch/ReturnBatch не должны измениться"
);

console.log(
  "🟢 Order/OrderItem/OrderBatch/ReturnBatch unchanged"
);

console.log("");

// ==================================================
// 20. VERIFY BATCH UNCHANGED
// ==================================================

console.log("20. VERIFY BATCH UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteBatch =
  await prisma.batch.findUnique({
    where: {
      id: batch.id,
    },
  });

assert.deepEqual(
  afterDeleteBatch,
  beforeDeleteBatch,
  "Batch не должна измениться"
);

console.log(
  "🟢 Batch unchanged"
);

console.log("");

// ==================================================
// 21. VERIFY MOVEMENTS UNCHANGED
// ==================================================

console.log("21. VERIFY MOVEMENTS UNCHANGED");
console.log("------------------------------------------------------------------------------");

const afterDeleteMovements =
  await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

assert.deepEqual(
  afterDeleteMovements,
  movementsBeforeDelete,
  "Movements не должны измениться"
);

console.log(
  "🟢 Movements unchanged"
);

console.log("");

// ==================================================
// 22. VERIFY STOCK CONSISTENCY
// ==================================================

console.log("22. VERIFY STOCK CONSISTENCY");
console.log("------------------------------------------------------------------------------");

const finalProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert.ok(
  finalProduct,
  "Product должен существовать"
);

const finalBatches =
  await prisma.batch.findMany({
    where: {
      productId,
    },
  });

const finalBatchStock =
  finalBatches.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );

assert.equal(
  finalProduct.stock,
  5,
  "Product.stock должен остаться равным 5"
);

assert.equal(
  finalBatchStock,
  5,
  "Сумма Batch.quantity должна остаться равной 5"
);

assert.equal(
  finalProduct.stock,
  finalBatchStock,
  "Product.stock должен совпадать с суммой Batch.quantity"
);

console.log(
  `🟢 Product.stock=${finalProduct.stock}`
);

console.log(
  `🟢 SUM(Batch.quantity)=${finalBatchStock}`
);

console.log("");

// ==================================================
// 23. VERIFY GLOBAL COUNTS
// ==================================================

console.log("23. VERIFY GLOBAL COUNTS");
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

console.log(
  "🟢 Global counts unchanged"
);

console.log("");

// ==================================================
// 24. FINAL RESULT
// ==================================================

console.log("==============================================================================");
console.log("V68 FINAL RESULT");
console.log("==============================================================================");
console.log("");

console.log(
  "🟢 V68 TEST PASSED"
);

console.log("");

console.log(
  "Product с историей продажи и возврата не удалён."
);

console.log(
  "Order сохранён."
);

console.log(
  "OrderItem сохранён."
);

console.log(
  "OrderBatch сохранён."
);

console.log(
  "ReturnBatch сохранён."
);

console.log(
  "Supply/SupplyItem сохранены."
);

console.log(
  "Batch сохранена."
);

console.log(
  "Все движения сохранены."
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
console.error("🔴 V68 TEST FAILED");
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
