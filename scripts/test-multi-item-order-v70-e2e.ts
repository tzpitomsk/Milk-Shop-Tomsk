import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";
const TEST_TOKEN = `${Date.now()}`;

const PRODUCT_A_NAME = `V70_PRODUCT_A_${TEST_TOKEN}`;
const PRODUCT_B_NAME = `V70_PRODUCT_B_${TEST_TOKEN}`;
const SUPPLIER_NAME = `V70_TEST_SUPPLIER_${TEST_TOKEN}`;

let productAId: number | null = null;
let productBId: number | null = null;
let supplierId: number | null = null;
let supplyAId: number | null = null;
let supplyBId: number | null = null;
let orderId: number | null = null;

function section(title: string) {
console.log("");
console.log("==============================================================================");
console.log(title);
console.log("==============================================================================");
}

async function api(
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

async function cleanup() {
section("CLEANUP");

if (orderId !== null) {
const result = await api(`/api/orders/${orderId}`, {
method: "DELETE",
});


console.log(
  `Cleanup DELETE /api/orders/${orderId}: HTTP ${result.status}`
);


}

if (supplyAId !== null) {
await prisma.supplyItem.deleteMany({
where: {
supplyId: supplyAId,
},
});


await prisma.supply.deleteMany({
  where: {
    id: supplyAId,
  },
});


}

if (supplyBId !== null) {
await prisma.supplyItem.deleteMany({
where: {
supplyId: supplyBId,
},
});


await prisma.supply.deleteMany({
  where: {
    id: supplyBId,
  },
});


}

if (productAId !== null) {
await prisma.movement.deleteMany({
where: {
productId: productAId,
},
});


await prisma.batch.deleteMany({
  where: {
    productId: productAId,
  },
});

await prisma.product.deleteMany({
  where: {
    id: productAId,
  },
});


}

if (productBId !== null) {
await prisma.movement.deleteMany({
where: {
productId: productBId,
},
});


await prisma.batch.deleteMany({
  where: {
    productId: productBId,
  },
});

await prisma.product.deleteMany({
  where: {
    id: productBId,
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

console.log("🟢 CLEANUP FINISHED");
}

async function main() {
section("V70 MULTI-ITEM ORDER E2E TEST");

console.log("");
console.log("STRICTLY ISOLATED TEST");
console.log(`BASE_URL=${BASE_URL}`);
console.log(`TEST_TOKEN=${TEST_TOKEN}`);
console.log("");
console.log("Сценарий:");
console.log("1. Создать два Product.");
console.log("2. Создать Supplier.");
console.log("3. Создать поставки для обоих товаров.");
console.log("4. Создать один Order с двумя OrderItem.");
console.log("5. Проверить FEFO/FIFO для обеих позиций.");
console.log("6. Вернуть только одну позицию.");
console.log("7. Проверить total/profit всего заказа.");
console.log("8. Проверить, что вторая позиция не изменилась.");
console.log("9. Проверить Product.stock обоих товаров.");
console.log("10. Полностью вернуть первую позицию.");
console.log("11. Проверить статус заказа PARTIAL_RETURN.");
console.log("12. Проверить полное восстановление первой позиции.");
console.log("13. Проверить, что вторая позиция всё ещё продана.");
console.log("14. Удалить заказ.");
console.log("15. Проверить точное восстановление обоих товаров.");
console.log("");

try {
// ========================================================================
// 1. CREATE PRODUCT A
// ========================================================================


section("1. CREATE PRODUCT A");

const productAResult = await api("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: PRODUCT_A_NAME,
    unit: "шт",
    price: 300,
    cost: 100,
    barcode: `V70-A-${TEST_TOKEN}`,
  }),
});

console.log(`HTTP ${productAResult.status}`);
console.log(JSON.stringify(productAResult.data, null, 2));

if (
  productAResult.status !== 200 ||
  !productAResult.data?.id
) {
  throw new Error("Не удалось создать Product A");
}

productAId = Number(productAResult.data.id);

console.log(`🟢 Product A #${productAId} создан`);
console.log("🟢 Начальный stock Product A = 0");

// ========================================================================
// 2. CREATE PRODUCT B
// ========================================================================

section("2. CREATE PRODUCT B");

const productBResult = await api("/api/products", {
  method: "POST",
  body: JSON.stringify({
    name: PRODUCT_B_NAME,
    unit: "шт",
    price: 500,
    cost: 200,
    barcode: `V70-B-${TEST_TOKEN}`,
  }),
});

console.log(`HTTP ${productBResult.status}`);
console.log(JSON.stringify(productBResult.data, null, 2));

if (
  productBResult.status !== 200 ||
  !productBResult.data?.id
) {
  throw new Error("Не удалось создать Product B");
}

productBId = Number(productBResult.data.id);

console.log(`🟢 Product B #${productBId} создан`);
console.log("🟢 Начальный stock Product B = 0");

// ========================================================================
// 3. CREATE SUPPLIER
// ========================================================================

section("3. CREATE SUPPLIER");

const supplierResult = await api("/api/suppliers", {
  method: "POST",
  body: JSON.stringify({
    name: SUPPLIER_NAME,
  }),
});

console.log(`HTTP ${supplierResult.status}`);
console.log(JSON.stringify(supplierResult.data, null, 2));

if (
  supplierResult.status !== 200 ||
  !supplierResult.data?.id
) {
  throw new Error("Не удалось создать Supplier");
}

supplierId = Number(supplierResult.data.id);

console.log(`🟢 Supplier #${supplierId} создан`);

// ========================================================================
// 4. SUPPLY PRODUCT A
// ========================================================================

section("4. SUPPLY PRODUCT A");

const supplyAResult = await api("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productAId,
        quantity: 5,
        cost: 100,
        expiryDate: "2026-12-01",
      },
    ],
  }),
});

console.log(`HTTP ${supplyAResult.status}`);
console.log(JSON.stringify(supplyAResult.data, null, 2));

if (
  supplyAResult.status !== 200 ||
  !supplyAResult.data?.supply?.id
) {
  throw new Error("Не удалось создать Supply A");
}

supplyAId = Number(supplyAResult.data.supply.id);

console.log(`🟢 Supply A #${supplyAId} создан`);

// ========================================================================
// 5. SUPPLY PRODUCT B
// ========================================================================

section("5. SUPPLY PRODUCT B");

const supplyBResult = await api("/api/supplies", {
  method: "POST",
  body: JSON.stringify({
    supplierId,
    items: [
      {
        id: productBId,
        quantity: 4,
        cost: 200,
        expiryDate: "2026-12-15",
      },
    ],
  }),
});

console.log(`HTTP ${supplyBResult.status}`);
console.log(JSON.stringify(supplyBResult.data, null, 2));

if (
  supplyBResult.status !== 200 ||
  !supplyBResult.data?.supply?.id
) {
  throw new Error("Не удалось создать Supply B");
}

supplyBId = Number(supplyBResult.data.supply.id);

console.log(`🟢 Supply B #${supplyBId} создан`);

// ========================================================================
// 6. VERIFY INITIAL STOCK
// ========================================================================

section("6. VERIFY INITIAL STOCK");

const productAInitial = await prisma.product.findUnique({
  where: {
    id: productAId,
  },
});

const productBInitial = await prisma.product.findUnique({
  where: {
    id: productBId,
  },
});

if (!productAInitial || !productBInitial) {
  throw new Error("Test products не найдены после Supply");
}

const batchesAInitial =
  await prisma.batch.findMany({
    where: {
      productId: productAId,
    },
  });

const batchesBInitial =
  await prisma.batch.findMany({
    where: {
      productId: productBId,
    },
  });

const stockASum = batchesAInitial.reduce(
  (sum, batch) => sum + batch.quantity,
  0
);

const stockBSum = batchesBInitial.reduce(
  (sum, batch) => sum + batch.quantity,
  0
);

if (productAInitial.stock !== 5) {
  throw new Error(
    `Product A initial stock должен быть 5, получено ${productAInitial.stock}`
  );
}

if (productBInitial.stock !== 4) {
  throw new Error(
    `Product B initial stock должен быть 4, получено ${productBInitial.stock}`
  );
}

if (stockASum !== 5) {
  throw new Error(
    `SUM(Batch.quantity) Product A должен быть 5, получено ${stockASum}`
  );
}

if (stockBSum !== 4) {
  throw new Error(
    `SUM(Batch.quantity) Product B должен быть 4, получено ${stockBSum}`
  );
}

console.log("🟢 Product A stock = 5");
console.log("🟢 Product B stock = 4");
console.log("🟢 Product A stock = SUM(Batch.quantity)");
console.log("🟢 Product B stock = SUM(Batch.quantity)");

// ========================================================================
// 7. CREATE MULTI-ITEM ORDER
// ========================================================================

section("7. CREATE MULTI-ITEM ORDER");

const orderResult = await api("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    items: [
      {
        id: productAId,
        quantity: 3,
      },
      {
        id: productBId,
        quantity: 2,
      },
    ],
  }),
});

console.log(`HTTP ${orderResult.status}`);
console.log(JSON.stringify(orderResult.data, null, 2));

if (
  orderResult.status !== 201 ||
  !orderResult.data?.id
) {
  throw new Error("Не удалось создать multi-item Order");
}

orderId = Number(orderResult.data.id);

console.log(`🟢 Order #${orderId} создан`);

// ========================================================================
// 8. VERIFY ORDER ITEMS
// ========================================================================

section("8. VERIFY ORDER ITEMS");

const createdOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: {
        include: {
          product: true,
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

if (!createdOrder) {
  throw new Error("Order не найден в БД");
}

if (createdOrder.items.length !== 2) {
  throw new Error(
    `Ожидалось 2 OrderItem, получено ${createdOrder.items.length}`
  );
}

const itemA =
  createdOrder.items.find(
    (item) => item.productId === productAId
  );

const itemB =
  createdOrder.items.find(
    (item) => item.productId === productBId
  );

if (!itemA || !itemB) {
  throw new Error(
    "Не найдены OrderItem для обоих продуктов"
  );
}

if (itemA.quantity !== 3) {
  throw new Error(
    `Product A OrderItem quantity должен быть 3, получено ${itemA.quantity}`
  );
}

if (itemB.quantity !== 2) {
  throw new Error(
    `Product B OrderItem quantity должен быть 2, получено ${itemB.quantity}`
  );
}

console.log(
  `🟢 Product A OrderItem #${itemA.id} quantity=3`
);

console.log(
  `🟢 Product B OrderItem #${itemB.id} quantity=2`
);

// ========================================================================
// 9. VERIFY ORDER FINANCIALS AFTER SALE
// ========================================================================

section("9. VERIFY ORDER FINANCIALS AFTER SALE");

const expectedGrossTotal =
  3 * 300 +
  2 * 500;

const expectedGrossProfit =
  3 * (300 - 100) +
  2 * (500 - 200);

if (createdOrder.total !== expectedGrossTotal) {
  throw new Error(
    `Order.total должен быть ${expectedGrossTotal}, получено ${createdOrder.total}`
  );
}

if (createdOrder.profit !== expectedGrossProfit) {
  throw new Error(
    `Order.profit должен быть ${expectedGrossProfit}, получено ${createdOrder.profit}`
  );
}

if (createdOrder.status !== "COMPLETED") {
  throw new Error(
    `Order.status должен быть COMPLETED, получено ${createdOrder.status}`
  );
}

console.log(
  `🟢 Gross Order.total = ${createdOrder.total}`
);

console.log(
  `🟢 Gross Order.profit = ${createdOrder.profit}`
);

console.log("🟢 Order.status = COMPLETED");

// ========================================================================
// 10. VERIFY STOCK AFTER SALE
// ========================================================================

section("10. VERIFY STOCK AFTER SALE");

const productAAfterSale =
  await prisma.product.findUnique({
    where: {
      id: productAId,
    },
  });

const productBAfterSale =
  await prisma.product.findUnique({
    where: {
      id: productBId,
    },
  });

if (!productAAfterSale || !productBAfterSale) {
  throw new Error("Products не найдены после продажи");
}

if (productAAfterSale.stock !== 2) {
  throw new Error(
    `Product A stock после продажи должен быть 2, получено ${productAAfterSale.stock}`
  );
}

if (productBAfterSale.stock !== 2) {
  throw new Error(
    `Product B stock после продажи должен быть 2, получено ${productBAfterSale.stock}`
  );
}

console.log("🟢 Product A stock после продажи = 2");
console.log("🟢 Product B stock после продажи = 2");

// ========================================================================
// 11. PARTIAL RETURN ONLY PRODUCT A
// ========================================================================

section("11. PARTIAL RETURN ONLY PRODUCT A");

const returnAResult = await api(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: itemA.id,
      quantity: 1,
    }),
  }
);

console.log(`HTTP ${returnAResult.status}`);
console.log(JSON.stringify(returnAResult.data, null, 2));

if (returnAResult.status !== 200) {
  throw new Error(
    "Возврат Product A должен завершиться HTTP 200"
  );
}

console.log("🟢 Возврат 1 шт Product A выполнен");

// ========================================================================
// 12. VERIFY FIRST PARTIAL RETURN
// ========================================================================

section("12. VERIFY FIRST PARTIAL RETURN");

const afterReturnA =
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

if (!afterReturnA) {
  throw new Error(
    "Order не найден после возврата Product A"
  );
}

const afterItemA =
  afterReturnA.items.find(
    (item) => item.productId === productAId
  );

const afterItemB =
  afterReturnA.items.find(
    (item) => item.productId === productBId
  );

if (!afterItemA || !afterItemB) {
  throw new Error(
    "OrderItem не найден после возврата"
  );
}

if (afterItemA.returned !== 1) {
  throw new Error(
    `Product A returned должен быть 1, получено ${afterItemA.returned}`
  );
}

if (afterItemB.returned !== 0) {
  throw new Error(
    `Product B returned должен оставаться 0, получено ${afterItemB.returned}`
  );
}

if (afterReturnA.total !== 1600) {
  throw new Error(
    `NET Order.total должен быть 1600, получено ${afterReturnA.total}`
  );
}

if (afterReturnA.profit !== 1000) {
  throw new Error(
    `NET Order.profit должен быть 1000, получено ${afterReturnA.profit}`
  );
}

if (afterReturnA.status !== "PARTIAL_RETURN") {
  throw new Error(
    `Order.status должен быть PARTIAL_RETURN, получено ${afterReturnA.status}`
  );
}

console.log("🟢 Product A returned = 1");
console.log("🟢 Product B returned = 0");
console.log("🟢 NET Order.total = 1600");
console.log("🟢 NET Order.profit = 1000");
console.log("🟢 Order.status = PARTIAL_RETURN");

// ========================================================================
// 13. VERIFY STOCK AFTER PRODUCT A RETURN
// ========================================================================

section("13. VERIFY STOCK AFTER PRODUCT A RETURN");

const productAAfterReturn =
  await prisma.product.findUnique({
    where: {
      id: productAId,
    },
  });

const productBAfterReturn =
  await prisma.product.findUnique({
    where: {
      id: productBId,
    },
  });

if (!productAAfterReturn || !productBAfterReturn) {
  throw new Error(
    "Products не найдены после возврата"
  );
}

if (productAAfterReturn.stock !== 3) {
  throw new Error(
    `Product A stock должен быть 3 после возврата, получено ${productAAfterReturn.stock}`
  );
}

if (productBAfterReturn.stock !== 2) {
  throw new Error(
    `Product B stock должен оставаться 2, получено ${productBAfterReturn.stock}`
  );
}

console.log(
  "🟢 Product A stock после возврата = 3"
);

console.log(
  "🟢 Product B stock после возврата = 2"
);

// ========================================================================
// 14. FULL RETURN REMAINING PRODUCT A
// ========================================================================

section("14. FULL RETURN REMAINING PRODUCT A");

const returnASecondResult = await api(
  `/api/orders/${orderId}/return`,
  {
    method: "POST",
    body: JSON.stringify({
      itemId: itemA.id,
      quantity: 2,
    }),
  }
);

console.log(
  `HTTP ${returnASecondResult.status}`
);

console.log(
  JSON.stringify(
    returnASecondResult.data,
    null,
    2
  )
);

if (returnASecondResult.status !== 200) {
  throw new Error(
    "Второй возврат Product A должен завершиться HTTP 200"
  );
}

console.log(
  "🟢 Остаток Product A = 2 возвращён"
);

// ========================================================================
// 15. VERIFY PRODUCT A FULL RETURN
// ========================================================================

section("15. VERIFY PRODUCT A FULL RETURN");

const afterFullReturnA =
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

if (!afterFullReturnA) {
  throw new Error(
    "Order не найден после полного возврата Product A"
  );
}

const fullItemA =
  afterFullReturnA.items.find(
    (item) => item.productId === productAId
  );

const fullItemB =
  afterFullReturnA.items.find(
    (item) => item.productId === productBId
  );

if (!fullItemA || !fullItemB) {
  throw new Error(
    "OrderItems не найдены после полного возврата"
  );
}

if (fullItemA.returned !== 3) {
  throw new Error(
    `Product A returned должен быть 3, получено ${fullItemA.returned}`
  );
}

if (fullItemB.returned !== 0) {
  throw new Error(
    `Product B returned должен быть 0, получено ${fullItemB.returned}`
  );
}

const expectedTotalAfterFullReturnA =
  2 * 500;

const expectedProfitAfterFullReturnA =
  2 * (500 - 200);

if (
  afterFullReturnA.total !==
  expectedTotalAfterFullReturnA
) {
  throw new Error(
    `NET Order.total должен быть ${expectedTotalAfterFullReturnA}, получено ${afterFullReturnA.total}`
  );
}

if (
  afterFullReturnA.profit !==
  expectedProfitAfterFullReturnA
) {
  throw new Error(
    `NET Order.profit должен быть ${expectedProfitAfterFullReturnA}, получено ${afterFullReturnA.profit}`
  );
}

if (
  afterFullReturnA.status !==
  "PARTIAL_RETURN"
) {
  throw new Error(
    `Order.status должен быть PARTIAL_RETURN, получено ${afterFullReturnA.status}`
  );
}

console.log("🟢 Product A returned = 3");
console.log("🟢 Product B returned = 0");
console.log("🟢 NET Order.total = 1000");
console.log("🟢 NET Order.profit = 600");
console.log("🟢 Order.status = PARTIAL_RETURN");

// ========================================================================
// 16. VERIFY STOCK BEFORE DELETE
// ========================================================================

section("16. VERIFY STOCK BEFORE DELETE");

const productABeforeDelete =
  await prisma.product.findUnique({
    where: {
      id: productAId,
    },
  });

const productBBeforeDelete =
  await prisma.product.findUnique({
    where: {
      id: productBId,
    },
  });

if (!productABeforeDelete || !productBBeforeDelete) {
  throw new Error(
    "Products не найдены перед DELETE"
  );
}

if (productABeforeDelete.stock !== 5) {
  throw new Error(
    `Product A stock перед DELETE должен быть 5, получено ${productABeforeDelete.stock}`
  );
}

if (productBBeforeDelete.stock !== 2) {
  throw new Error(
    `Product B stock перед DELETE должен быть 2, получено ${productBBeforeDelete.stock}`
  );
}

console.log(
  "🟢 Product A stock перед DELETE = 5"
);

console.log(
  "🟢 Product B stock перед DELETE = 2"
);

// ========================================================================
// 17. DELETE ORDER
// ========================================================================

section("17. DELETE ORDER");

const deleteResult = await api(
  `/api/orders/${orderId}`,
  {
    method: "DELETE",
  }
);

console.log(`HTTP ${deleteResult.status}`);
console.log(
  JSON.stringify(deleteResult.data, null, 2)
);

if (deleteResult.status !== 200) {
  throw new Error(
    "DELETE заказа должен завершиться HTTP 200"
  );
}

console.log(`🟢 Order #${orderId} удалён`);

// ========================================================================
// 18. VERIFY ORDER DELETED
// ========================================================================

section("18. VERIFY ORDER DELETED");

const deletedOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

if (deletedOrder) {
  throw new Error(
    "Order должен отсутствовать после DELETE"
  );
}

console.log("🟢 Order удалён из БД");

// ========================================================================
// 19. VERIFY EXACT RESTORATION
// ========================================================================

section("19. VERIFY EXACT RESTORATION");

const productAAfterDelete =
  await prisma.product.findUnique({
    where: {
      id: productAId,
    },
  });

const productBAfterDelete =
  await prisma.product.findUnique({
    where: {
      id: productBId,
    },
  });

if (!productAAfterDelete || !productBAfterDelete) {
  throw new Error(
    "Products не найдены после DELETE"
  );
}

if (productAAfterDelete.stock !== 5) {
  throw new Error(
    `Product A stock после DELETE должен быть 5, получено ${productAAfterDelete.stock}`
  );
}

if (productBAfterDelete.stock !== 4) {
  throw new Error(
    `Product B stock после DELETE должен быть 4, получено ${productBAfterDelete.stock}`
  );
}

console.log(
  "🟢 Product A stock после DELETE = 5"
);

console.log(
  "🟢 Product B stock после DELETE = 4"
);

// ========================================================================
// 20. VERIFY BATCH STOCK
// ========================================================================

section("20. VERIFY BATCH STOCK");

const finalBatchesA =
  await prisma.batch.findMany({
    where: {
      productId: productAId,
    },
    orderBy: {
      id: "asc",
    },
  });

const finalBatchesB =
  await prisma.batch.findMany({
    where: {
      productId: productBId,
    },
    orderBy: {
      id: "asc",
    },
  });

const finalStockA =
  finalBatchesA.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

const finalStockB =
  finalBatchesB.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

if (finalStockA !== 5) {
  throw new Error(
    `SUM(Batch.quantity) Product A должен быть 5, получено ${finalStockA}`
  );
}

if (finalStockB !== 4) {
  throw new Error(
    `SUM(Batch.quantity) Product B должен быть 4, получено ${finalStockB}`
  );
}

if (
  finalStockA !==
  productAAfterDelete.stock
) {
  throw new Error(
    "Product A stock не совпадает с SUM(Batch.quantity)"
  );
}

if (
  finalStockB !==
  productBAfterDelete.stock
) {
  throw new Error(
    "Product B stock не совпадает с SUM(Batch.quantity)"
  );
}

console.log(
  "🟢 Product A SUM(Batch.quantity) = 5"
);

console.log(
  "🟢 Product B SUM(Batch.quantity) = 4"
);

console.log(
  "🟢 Product A stock = SUM(Batch.quantity)"
);

console.log(
  "🟢 Product B stock = SUM(Batch.quantity)"
);

// ========================================================================
// 21. FINAL RESULT
// ========================================================================

section("21. V70 FINAL RESULT");

console.log("🟢 V70 PASSED");
console.log("");
console.log("Проверено:");
console.log("1. Один заказ может содержать два разных Product.");
console.log("2. Оба OrderItem сохраняются независимо.");
console.log("3. Продажа каждой позиции учитывается отдельно.");
console.log("4. Возврат одной позиции не изменяет returned другой позиции.");
console.log("5. NET Order.total пересчитывается по всем позициям.");
console.log("6. NET Order.profit пересчитывается по всем позициям.");
console.log("7. После полного возврата одной позиции заказ остаётся PARTIAL_RETURN.");
console.log("8. Остаток второй позиции продолжает учитываться.");
console.log("9. Product.stock каждого товара синхронизирован с Batch.");
console.log("10. DELETE восстанавливает NET-проданное по обеим позициям.");
console.log("11. SUM(Batch.quantity) совпадает с Product.stock.");
console.log("");
console.log("==============================================================================");
console.log("V70 TEST PASSED");
console.log("==============================================================================");


} finally {
await cleanup();
}
}

main()
.catch((error) => {
console.error("");
console.error("🔴 V70 TEST FAILED");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
