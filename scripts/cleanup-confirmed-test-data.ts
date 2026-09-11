import { strict as assert } from "node:assert";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPECTED_PRODUCTS = [
  {
    id: 59,
    name: "V45-1788949046204 Партия",
    stock: 0,
  },
  {
    id: 80,
    name: "V58 Test Product 1789010036960",
    stock: 3,
  },
  {
    id: 82,
    name: "V59 Test Product A 1789010567278",
    stock: 5,
  },
  {
    id: 83,
    name: "V59 Test Product B 1789010567278",
    stock: 3,
  },
  {
    id: 84,
    name: "V59 Test Product A 1789010920360",
    stock: 5,
  },
  {
    id: 85,
    name: "V59 Test Product B 1789010920360",
    stock: 3,
  },
] as const;

const EXPECTED_SUPPLIERS = [
  {
    id: 21,
    name: "V45-1788949046204 Supplier",
    supplyIds: [51],
  },
  {
    id: 32,
    name: "V58 Test Supplier 1789010036976",
    supplyIds: [67],
  },
  {
    id: 34,
    name: "V59 Test Supplier 1789010567278",
    supplyIds: [70, 71, 72, 73],
  },
  {
    id: 35,
    name: "V59 Test Supplier 1789010920360",
    supplyIds: [74, 75, 76, 77],
  },
] as const;

const EXPECTED_SUPPLIES = [
  {
    id: 51,
    supplierId: 21,
    productId: 59,
    supplyItemId: 61,
    quantity: 5,
    cost: 100,
  },
  {
    id: 67,
    supplierId: 32,
    productId: 80,
    supplyItemId: 77,
    quantity: 3,
    cost: 100,
  },
  {
    id: 70,
    supplierId: 34,
    productId: 82,
    supplyItemId: 80,
    quantity: 2,
    cost: 100,
  },
  {
    id: 71,
    supplierId: 34,
    productId: 82,
    supplyItemId: 81,
    quantity: 3,
    cost: 120,
  },
  {
    id: 72,
    supplierId: 34,
    productId: 83,
    supplyItemId: 82,
    quantity: 1,
    cost: 200,
  },
  {
    id: 73,
    supplierId: 34,
    productId: 83,
    supplyItemId: 83,
    quantity: 2,
    cost: 220,
  },
  {
    id: 74,
    supplierId: 35,
    productId: 84,
    supplyItemId: 84,
    quantity: 2,
    cost: 100,
  },
  {
    id: 75,
    supplierId: 35,
    productId: 84,
    supplyItemId: 85,
    quantity: 3,
    cost: 120,
  },
  {
    id: 76,
    supplierId: 35,
    productId: 85,
    supplyItemId: 86,
    quantity: 1,
    cost: 200,
  },
  {
    id: 77,
    supplierId: 35,
    productId: 85,
    supplyItemId: 87,
    quantity: 2,
    cost: 220,
  },
] as const;

const EXPECTED_BATCHES = [
  {
    id: 102,
    productId: 59,
    quantity: 0,
  },
  {
    id: 132,
    productId: 80,
    quantity: 3,
  },
  {
    id: 135,
    productId: 82,
    quantity: 2,
  },
  {
    id: 136,
    productId: 82,
    quantity: 3,
  },
  {
    id: 137,
    productId: 83,
    quantity: 1,
  },
  {
    id: 138,
    productId: 83,
    quantity: 2,
  },
  {
    id: 139,
    productId: 84,
    quantity: 2,
  },
  {
    id: 140,
    productId: 84,
    quantity: 3,
  },
  {
    id: 141,
    productId: 85,
    quantity: 1,
  },
  {
    id: 142,
    productId: 85,
    quantity: 2,
  },
] as const;

const EXPECTED_MOVEMENTS = [
  236,
  237,
  238,
  299,
  306,
  307,
  308,
  309,
  310,
  311,
  312,
  313,
  314,
  315,
  316,
  317,
  318,
  319,
  320,
  321,
  322,
  323,
  324,
  325,
  326,
] as const;

const TEST_PRODUCT_IDS = EXPECTED_PRODUCTS.map(
  (product) => product.id
);

const TEST_SUPPLIER_IDS = EXPECTED_SUPPLIERS.map(
  (supplier) => supplier.id
);

const TEST_SUPPLY_IDS = EXPECTED_SUPPLIES.map(
  (supply) => supply.id
);

const TEST_SUPPLY_ITEM_IDS = EXPECTED_SUPPLIES.map(
  (supply) => supply.supplyItemId
);

const TEST_BATCH_IDS = EXPECTED_BATCHES.map(
  (batch) => batch.id
);

function sortedNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function assertExactIds(
  actual: number[],
  expected: readonly number[],
  label: string
): void {
  assert.deepEqual(
    sortedNumbers(actual),
    sortedNumbers([...expected]),
    `${label}: набор ID не совпадает`
  );
}

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=============================================================================="
  );
  console.log("CONFIRMED TEST DATA CLEANUP");
  console.log("STRICT SAFETY CHECKS");
  console.log(
    "=============================================================================="
  );
  console.log("");

  console.log(
    "⚠️ DATABASE WILL BE MODIFIED ONLY AFTER ALL SAFETY CHECKS PASS"
  );
  console.log("");

  // ===========================================================================
  // 1. VERIFY PRODUCTS
  // ===========================================================================

  console.log("1. VERIFY PRODUCTS");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const products = await prisma.product.findMany({
    where: {
      id: {
        in: TEST_PRODUCT_IDS,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assertExactIds(
    products.map((product) => product.id),
    TEST_PRODUCT_IDS,
    "Products"
  );

  for (const expected of EXPECTED_PRODUCTS) {
    const product = products.find(
      (item) => item.id === expected.id
    );

    if (!product) {
      throw new Error(
        `Product #${expected.id} отсутствует`
      );
    }

    assert.equal(
      product.name,
      expected.name,
      `Product #${expected.id}: неожиданное имя`
    );

    assert.equal(
      product.stock,
      expected.stock,
      `Product #${expected.id}: неожиданный stock`
    );
  }

  console.log("✅ Exact test products confirmed");
  console.log("");

  // ===========================================================================
  // 2. VERIFY NO ORDER HISTORY
  // ===========================================================================

  console.log("2. VERIFY NO ORDER HISTORY");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: {
        in: TEST_PRODUCT_IDS,
      },
    },
    select: {
      id: true,
      orderId: true,
      productId: true,
    },
  });

  assert.equal(
    orderItems.length,
    0,
    `Найдены OrderItem для тестовых товаров: ${JSON.stringify(
      orderItems
    )}`
  );

  const orderBatches = await prisma.orderBatch.findMany({
    where: {
      OR: [
        {
          orderItem: {
            productId: {
              in: TEST_PRODUCT_IDS,
            },
          },
        },
        {
          batchId: {
            in: TEST_BATCH_IDS,
          },
        },
      ],
    },
    select: {
      id: true,
      orderItemId: true,
      batchId: true,
    },
  });

  assert.equal(
    orderBatches.length,
    0,
    `Найдены OrderBatch для тестовых данных: ${JSON.stringify(
      orderBatches
    )}`
  );

  const returnBatches = await prisma.returnBatch.findMany({
    where: {
      OR: [
        {
          OrderItem: {
            productId: {
              in: TEST_PRODUCT_IDS,
            },
          },
        },
        {
          batchId: {
            in: TEST_BATCH_IDS,
          },
        },
      ],
    },
    select: {
      id: true,
      orderItemId: true,
      batchId: true,
    },
  });

  assert.equal(
    returnBatches.length,
    0,
    `Найдены ReturnBatch для тестовых данных: ${JSON.stringify(
      returnBatches
    )}`
  );

  console.log(
    "✅ No OrderItem / OrderBatch / ReturnBatch"
  );
  console.log("");

  // ===========================================================================
  // 3. VERIFY BATCHES
  // ===========================================================================

  console.log("3. VERIFY BATCHES");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const batches = await prisma.batch.findMany({
    where: {
      id: {
        in: TEST_BATCH_IDS,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assertExactIds(
    batches.map((batch) => batch.id),
    TEST_BATCH_IDS,
    "Batches"
  );

  for (const expected of EXPECTED_BATCHES) {
    const batch = batches.find(
      (item) => item.id === expected.id
    );

    if (!batch) {
      throw new Error(
        `Batch #${expected.id} отсутствует`
      );
    }

    assert.equal(
      batch.productId,
      expected.productId,
      `Batch #${expected.id}: неверный productId`
    );

    assert.equal(
      batch.quantity,
      expected.quantity,
      `Batch #${expected.id}: неверный quantity`
    );
  }

  console.log("✅ Exact test batches confirmed");
  console.log("");

  // ===========================================================================
  // 4. VERIFY SUPPLY ITEMS
  // ===========================================================================

  console.log("4. VERIFY SUPPLY ITEMS");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      id: {
        in: TEST_SUPPLY_ITEM_IDS,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assertExactIds(
    supplyItems.map((item) => item.id),
    TEST_SUPPLY_ITEM_IDS,
    "SupplyItems"
  );

  for (const expected of EXPECTED_SUPPLIES) {
    const item = supplyItems.find(
      (candidate) =>
        candidate.id === expected.supplyItemId
    );

    if (!item) {
      throw new Error(
        `SupplyItem #${expected.supplyItemId} отсутствует`
      );
    }

    assert.equal(
      item.supplyId,
      expected.id,
      `SupplyItem #${expected.supplyItemId}: неверный supplyId`
    );

    assert.equal(
      item.productId,
      expected.productId,
      `SupplyItem #${expected.supplyItemId}: неверный productId`
    );

    assert.equal(
      item.quantity,
      expected.quantity,
      `SupplyItem #${expected.supplyItemId}: неверный quantity`
    );

    assert.equal(
      item.cost,
      expected.cost,
      `SupplyItem #${expected.supplyItemId}: неверный cost`
    );
  }

  console.log("✅ Exact test SupplyItems confirmed");
  console.log("");

  // ===========================================================================
  // 5. VERIFY SUPPLIES
  // ===========================================================================

  console.log("5. VERIFY SUPPLIES");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const supplies = await prisma.supply.findMany({
    where: {
      id: {
        in: TEST_SUPPLY_IDS,
      },
    },
    include: {
      items: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  assertExactIds(
    supplies.map((supply) => supply.id),
    TEST_SUPPLY_IDS,
    "Supplies"
  );

  for (const expected of EXPECTED_SUPPLIES) {
    const supply = supplies.find(
      (item) => item.id === expected.id
    );

    if (!supply) {
      throw new Error(
        `Supply #${expected.id} отсутствует`
      );
    }

    assert.equal(
      supply.supplierId,
      expected.supplierId,
      `Supply #${expected.id}: неверный supplierId`
    );

    assert.equal(
      supply.items.length,
      1,
      `Supply #${expected.id}: ожидался ровно один SupplyItem`
    );

    assert.equal(
      supply.items[0].id,
      expected.supplyItemId,
      `Supply #${expected.id}: неверный SupplyItem`
    );
  }

  console.log("✅ Exact test supplies confirmed");
  console.log("");

  // ===========================================================================
  // 6. VERIFY SUPPLIER ISOLATION
  // ===========================================================================

  console.log("6. VERIFY SUPPLIER ISOLATION");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const suppliers = await prisma.supplier.findMany({
    where: {
      id: {
        in: TEST_SUPPLIER_IDS,
      },
    },
    include: {
      Supply: {
        orderBy: {
          id: "asc",
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assertExactIds(
    suppliers.map((supplier) => supplier.id),
    TEST_SUPPLIER_IDS,
    "Suppliers"
  );

  for (const expected of EXPECTED_SUPPLIERS) {
    const supplier = suppliers.find(
      (item) => item.id === expected.id
    );

    if (!supplier) {
      throw new Error(
        `Supplier #${expected.id} отсутствует`
      );
    }

    assert.equal(
      supplier.name,
      expected.name,
      `Supplier #${expected.id}: неожиданное имя`
    );

    assertExactIds(
      supplier.Supply.map((supply) => supply.id),
      expected.supplyIds,
      `Supplier #${expected.id} supplies`
    );
  }

  console.log(
    "✅ Test suppliers have no unrelated supplies"
  );
  console.log("");

  // ===========================================================================
  // 7. VERIFY MOVEMENT ISOLATION
  // ===========================================================================

  console.log("7. VERIFY MOVEMENT ISOLATION");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const movements = await prisma.movement.findMany({
    where: {
      productId: {
        in: TEST_PRODUCT_IDS,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assertExactIds(
    movements.map((movement) => movement.id),
    EXPECTED_MOVEMENTS,
    "Movements"
  );

  for (const movement of movements) {
    assert.ok(
      (TEST_PRODUCT_IDS as number[]).includes(
        movement.productId
      ),
      `Movement #${movement.id}: неожиданный productId`
    );
  }

  console.log("✅ Exact test movements confirmed");
  console.log("");

  // ===========================================================================
  // 8. CROSS-CHECK PRODUCT STOCK
  // ===========================================================================

  console.log("8. CROSS-CHECK PRODUCT STOCK");
  console.log(
    "------------------------------------------------------------------------------"
  );

  for (const product of products) {
    const productBatches = batches.filter(
      (batch) => batch.productId === product.id
    );

    const batchTotal = productBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    assert.equal(
      product.stock,
      batchTotal,
      `Product #${product.id}: stock != batchTotal`
    );
  }

  console.log(
    "✅ Test product stock matches batch quantities"
  );
  console.log("");

  // ===========================================================================
  // 9. VERIFY GLOBAL ORDER HISTORY IS EMPTY
  // ===========================================================================

  console.log("9. VERIFY GLOBAL ORDER HISTORY");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const totalOrders = await prisma.order.count();
  const totalOrderItems = await prisma.orderItem.count();
  const totalOrderBatches = await prisma.orderBatch.count();
  const totalReturnBatches = await prisma.returnBatch.count();

  assert.equal(
    totalOrders,
    0,
    `В базе неожиданно есть Order: ${totalOrders}`
  );

  assert.equal(
    totalOrderItems,
    0,
    `В базе неожиданно есть OrderItem: ${totalOrderItems}`
  );

  assert.equal(
    totalOrderBatches,
    0,
    `В базе неожиданно есть OrderBatch: ${totalOrderBatches}`
  );

  assert.equal(
    totalReturnBatches,
    0,
    `В базе неожиданно есть ReturnBatch: ${totalReturnBatches}`
  );

  console.log("Orders=0");
  console.log("OrderItems=0");
  console.log("OrderBatches=0");
  console.log("ReturnBatches=0");
  console.log("");

  // ===========================================================================
  // 10. FINAL SAFETY SUMMARY
  // ===========================================================================

  console.log("10. FINAL SAFETY CHECK");
  console.log(
    "------------------------------------------------------------------------------"
  );

  console.log(
    `Products to delete: ${TEST_PRODUCT_IDS.join(", ")}`
  );

  console.log(
    `Batches to delete: ${TEST_BATCH_IDS.join(", ")}`
  );

  console.log(
    `SupplyItems to delete: ${TEST_SUPPLY_ITEM_IDS.join(", ")}`
  );

  console.log(
    `Supplies to delete: ${TEST_SUPPLY_IDS.join(", ")}`
  );

  console.log(
    `Suppliers to delete: ${TEST_SUPPLIER_IDS.join(", ")}`
  );

  console.log(
    `Movements to delete: ${EXPECTED_MOVEMENTS.join(", ")}`
  );

  console.log("");

  console.log("🟢 ALL SAFETY CHECKS PASSED");
  console.log("");

  // ===========================================================================
  // 11. DELETE IN ONE TRANSACTION
  // ===========================================================================

  console.log("11. DELETE CONFIRMED TEST DATA");
  console.log(
    "------------------------------------------------------------------------------"
  );

  await prisma.$transaction(async (tx) => {
    const movementDelete = await tx.movement.deleteMany({
      where: {
        id: {
          in: [...EXPECTED_MOVEMENTS],
        },
      },
    });

    assert.equal(
      movementDelete.count,
      EXPECTED_MOVEMENTS.length,
      "Количество удалённых Movement не совпало"
    );

    const batchDelete = await tx.batch.deleteMany({
      where: {
        id: {
          in: [...TEST_BATCH_IDS],
        },
      },
    });

    assert.equal(
      batchDelete.count,
      TEST_BATCH_IDS.length,
      "Количество удалённых Batch не совпало"
    );

    const supplyItemDelete =
      await tx.supplyItem.deleteMany({
        where: {
          id: {
            in: [...TEST_SUPPLY_ITEM_IDS],
          },
        },
      });

    assert.equal(
      supplyItemDelete.count,
      TEST_SUPPLY_ITEM_IDS.length,
      "Количество удалённых SupplyItem не совпало"
    );

    const supplyDelete = await tx.supply.deleteMany({
      where: {
        id: {
          in: [...TEST_SUPPLY_IDS],
        },
      },
    });

    assert.equal(
      supplyDelete.count,
      TEST_SUPPLY_IDS.length,
      "Количество удалённых Supply не совпало"
    );

    const productDelete = await tx.product.deleteMany({
      where: {
        id: {
          in: [...TEST_PRODUCT_IDS],
        },
      },
    });

    assert.equal(
      productDelete.count,
      TEST_PRODUCT_IDS.length,
      "Количество удалённых Product не совпало"
    );

    const supplierDelete = await tx.supplier.deleteMany({
      where: {
        id: {
          in: [...TEST_SUPPLIER_IDS],
        },
      },
    });

    assert.equal(
      supplierDelete.count,
      TEST_SUPPLIER_IDS.length,
      "Количество удалённых Supplier не совпало"
    );
  });

  console.log("🟢 TRANSACTION COMMITTED");
  console.log("");

  // ===========================================================================
  // 12. VERIFY EVERYTHING WAS DELETED
  // ===========================================================================

  console.log("12. VERIFY DELETION");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const remainingProducts = await prisma.product.count({
    where: {
      id: {
        in: TEST_PRODUCT_IDS,
      },
    },
  });

  const remainingBatches = await prisma.batch.count({
    where: {
      id: {
        in: TEST_BATCH_IDS,
      },
    },
  });

  const remainingSupplyItems =
    await prisma.supplyItem.count({
      where: {
        id: {
          in: TEST_SUPPLY_ITEM_IDS,
        },
      },
    });

  const remainingSupplies = await prisma.supply.count({
    where: {
      id: {
        in: TEST_SUPPLY_IDS,
      },
    },
  });

  const remainingSuppliers =
    await prisma.supplier.count({
      where: {
        id: {
          in: TEST_SUPPLIER_IDS,
        },
      },
    });

  const remainingMovements =
    await prisma.movement.count({
      where: {
        id: {
          in: [...EXPECTED_MOVEMENTS],
        },
      },
    });

  assert.equal(remainingProducts, 0);
  assert.equal(remainingBatches, 0);
  assert.equal(remainingSupplyItems, 0);
  assert.equal(remainingSupplies, 0);
  assert.equal(remainingSuppliers, 0);
  assert.equal(remainingMovements, 0);

  console.log("Products remaining: 0");
  console.log("Batches remaining: 0");
  console.log("SupplyItems remaining: 0");
  console.log("Supplies remaining: 0");
  console.log("Suppliers remaining: 0");
  console.log("Movements remaining: 0");
  console.log("");

  // ===========================================================================
  // 13. VERIFY REAL PRODUCTS
  // ===========================================================================

  console.log("13. VERIFY REAL PRODUCTS WERE NOT TOUCHED");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const realProducts = await prisma.product.findMany({
    where: {
      id: {
        in: [1, 2, 3, 4],
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assert.equal(
    realProducts.length,
    4,
    "Ожидались все 4 реальных товара"
  );

  const expectedRealProducts = [
    {
      id: 1,
      name: "Молоко",
      stock: 4,
    },
    {
      id: 2,
      name: "Творог",
      stock: 0,
    },
    {
      id: 3,
      name: "Сметана",
      stock: 0,
    },
    {
      id: 4,
      name: "Кефир",
      stock: 0,
    },
  ] as const;

  for (const expected of expectedRealProducts) {
    const product = realProducts.find(
      (item) => item.id === expected.id
    );

    if (!product) {
      throw new Error(
        `Реальный Product #${expected.id} отсутствует`
      );
    }

    assert.equal(
      product.name,
      expected.name,
      `Реальный Product #${expected.id}: изменилось имя`
    );

    assert.equal(
      product.stock,
      expected.stock,
      `Реальный Product #${expected.id}: изменился stock`
    );
  }

  console.log("🟢 Real products remain unchanged");
  console.log("");

  // ===========================================================================
  // 14. FINAL RESULT
  // ===========================================================================

  console.log(
    "=============================================================================="
  );
  console.log("CLEANUP COMPLETED SUCCESSFULLY");
  console.log(
    "=============================================================================="
  );
  console.log("");

  console.log(
    "Deleted only confirmed V45/V58/V59 test data."
  );

  console.log(
    "Real products were not modified."
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "🔴 CLEANUP FAILED"
    );
    console.error("");
    console.error(
      "Если ошибка произошла до TRANSACTION COMMITTED,"
    );
    console.error(
      "удаление не должно было быть выполнено."
    );
    console.error("");
    console.error(error);
    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });