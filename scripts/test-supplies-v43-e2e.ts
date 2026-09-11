import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function section(title: string) {
  console.log("");
  console.log("==============================================================================");
  console.log(title);
  console.log("------------------------------------------------------------------------------");
}

function fail(message: string): never {
  throw new Error(`🔴 ${message}`);
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

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("V43 SUPPLY / STOCK INTEGRITY E2E TEST");
  console.log("==============================================================================");
  console.log("");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log("");
  console.log("TEST PURPOSE:");
  console.log("");
  console.log("Supply must create valid Supply and SupplyItem records.");
  console.log("Each supplied item must create its own Batch.");
  console.log("Product.stock must equal SUM(Batch.quantity).");
  console.log("SUPPLY Movement must be created for every supplied product.");
  console.log("Supply total must be calculated by the server.");
  console.log("Invalid supplies must be rejected atomically.");
  console.log("No partial database state may remain after failed requests.");
  console.log("");

  const timestamp = Date.now();

  let productAId: number | null = null;
  let productBId: number | null = null;

  let supplierId: number | null = null;
  let supplyId: number | null = null;

  let productABatchId: number | null = null;
  let productBBatchId: number | null = null;

  try {
    // =========================================================================
    // 1. CREATE TEST PRODUCTS
    // =========================================================================

    section("1. CREATE TEST PRODUCTS");

    const createProductA = await request("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `V43_INTEGRATION_TEST Молоко ${timestamp}`,
        unit: "шт",
        price: 300,
        cost: 100,
        barcode: `V43-A-${timestamp}`,
      }),
    });

    console.log("POST /api/products A");
    console.log(`HTTP ${createProductA.status}`);
    console.log(JSON.stringify(createProductA.data, null, 2));

    if (createProductA.status !== 200) {
      fail("Не удалось создать тестовый Product A");
    }

    productAId = Number(createProductA.data?.id);

    if (!Number.isInteger(productAId) || productAId <= 0) {
      fail("Product A имеет некорректный id");
    }

    if (createProductA.data?.stock !== 0) {
      fail("Product A должен начинаться с stock=0");
    }

    console.log(`Created Product A #${productAId}`);
    console.log("🟢 Product A created");

    const createProductB = await request("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `V43_INTEGRATION_TEST Творог ${timestamp}`,
        unit: "шт",
        price: 500,
        cost: 180,
        barcode: `V43-B-${timestamp}`,
      }),
    });

    console.log("POST /api/products B");
    console.log(`HTTP ${createProductB.status}`);
    console.log(JSON.stringify(createProductB.data, null, 2));

    if (createProductB.status !== 200) {
      fail("Не удалось создать тестовый Product B");
    }

    productBId = Number(createProductB.data?.id);

    if (!Number.isInteger(productBId) || productBId <= 0) {
      fail("Product B имеет некорректный id");
    }

    if (createProductB.data?.stock !== 0) {
      fail("Product B должен начинаться с stock=0");
    }

    console.log(`Created Product B #${productBId}`);
    console.log("🟢 Product B created");

    // =========================================================================
    // 2. VERIFY PRODUCTS ARE CLEAN
    // =========================================================================

    section("2. VERIFY INITIAL PRODUCT STATE");

    const initialProducts = await prisma.product.findMany({
      where: {
        id: {
          in: [productAId, productBId],
        },
      },
      include: {
        batches: true,
        movements: true,
        supplyItems: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (initialProducts.length !== 2) {
      fail(
        `Ожидалось 2 тестовых Product, найдено ${initialProducts.length}`
      );
    }

    for (const product of initialProducts) {
      console.log(
        `Product #${product.id} | stock=${product.stock} | ` +
          `batches=${product.batches.length} | ` +
          `movements=${product.movements.length} | ` +
          `supplyItems=${product.supplyItems.length}`
      );

      if (product.stock !== 0) {
        fail(`Product #${product.id} должен иметь stock=0`);
      }

      if (product.batches.length !== 0) {
        fail(`Product #${product.id} неожиданно имеет Batch`);
      }

      if (product.movements.length !== 0) {
        fail(`Product #${product.id} неожиданно имеет Movement`);
      }

      if (product.supplyItems.length !== 0) {
        fail(`Product #${product.id} неожиданно имеет SupplyItem`);
      }
    }

    console.log("🟢 Initial product state is clean");

    // =========================================================================
    // 3. CREATE TEST SUPPLIER
    // =========================================================================

    section("3. CREATE TEST SUPPLIER");

    const createSupplier = await request("/api/suppliers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `V43_INTEGRATION_TEST Supplier ${timestamp}`,
      }),
    });

    console.log("POST /api/suppliers");
    console.log(`HTTP ${createSupplier.status}`);
    console.log(JSON.stringify(createSupplier.data, null, 2));

    if (createSupplier.status !== 200) {
      fail("Не удалось создать тестового Supplier");
    }

    supplierId = Number(createSupplier.data?.id);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      fail("Supplier имеет некорректный id");
    }

    console.log(`Created Supplier #${supplierId}`);
    console.log("🟢 Supplier created");

    // =========================================================================
    // 4. CREATE MULTI-ITEM SUPPLY
    // =========================================================================

    section("4. CREATE MULTI-ITEM SUPPLY");

    const expiryA = "2026-12-31";
    const expiryB = "2027-01-15";

    const expectedTotal = 3 * 100 + 5 * 180;

    const createSupply = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        // Deliberately wrong total.
        // Server must calculate total from items.
        total: 1,
        items: [
          {
            id: productAId,
            quantity: 3,
            cost: 100,
            expiryDate: expiryA,
          },
          {
            id: productBId,
            quantity: 5,
            cost: 180,
            expiryDate: expiryB,
          },
        ],
      }),
    });

    console.log("POST /api/supplies");
    console.log(`HTTP ${createSupply.status}`);
    console.log(JSON.stringify(createSupply.data, null, 2));

    if (createSupply.status !== 200) {
      fail("Multi-item Supply не был создан");
    }

    if (createSupply.data?.success !== true) {
      fail("Supply API должен вернуть success=true");
    }

    supplyId = Number(createSupply.data?.supply?.id);

    if (!Number.isInteger(supplyId) || supplyId <= 0) {
      fail("Supply имеет некорректный id");
    }

    console.log(`Created Supply #${supplyId}`);
    console.log("🟢 Multi-item supply created");

    // =========================================================================
    // 5. VERIFY SERVER-CALCULATED TOTAL
    // =========================================================================

    section("5. VERIFY SUPPLY TOTAL");

    const returnedTotal = createSupply.data?.supply?.total;

    console.log(`Expected total=${expectedTotal}`);
    console.log(`Returned total=${returnedTotal}`);

    if (returnedTotal !== expectedTotal) {
      fail(
        `Supply.total должен быть ${expectedTotal}, получено ${returnedTotal}`
      );
    }

    if (returnedTotal === 1) {
      fail("Supply.total не должен использовать client-provided total");
    }

    console.log("🟢 Supply total is calculated by server");

    // =========================================================================
    // 6. VERIFY SUPPLY ITEMS
    // =========================================================================

    section("6. VERIFY SUPPLY ITEMS");

    const supply = await prisma.supply.findUnique({
      where: {
        id: supplyId,
      },
      include: {
        items: {
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    if (!supply) {
      fail(`Supply #${supplyId} не найден в БД`);
    }

    console.log(`Supply #${supply.id}`);
    console.log(`Supplier #${supply.supplierId}`);
    console.log(`Total=${supply.total}`);
    console.log(`SupplyItems=${supply.items.length}`);

    if (supply.supplierId !== supplierId) {
      fail(
        `Supply.supplierId=${supply.supplierId}, ожидался ${supplierId}`
      );
    }

    if (supply.total !== expectedTotal) {
      fail(
        `Supply.total=${supply.total}, ожидался ${expectedTotal}`
      );
    }

    if (supply.items.length !== 2) {
      fail(
        `Ожидалось 2 SupplyItem, найдено ${supply.items.length}`
      );
    }

    const itemA = supply.items.find(
      (item) => item.productId === productAId
    );

    const itemB = supply.items.find(
      (item) => item.productId === productBId
    );

    if (!itemA) {
      fail("SupplyItem для Product A не найден");
    }

    if (!itemB) {
      fail("SupplyItem для Product B не найден");
    }

    console.log(
      `Product A SupplyItem #${itemA.id} | quantity=${itemA.quantity} | cost=${itemA.cost}`
    );

    console.log(
      `Product B SupplyItem #${itemB.id} | quantity=${itemB.quantity} | cost=${itemB.cost}`
    );

    if (itemA.quantity !== 3 || itemA.cost !== 100) {
      fail("SupplyItem Product A содержит неправильные quantity/cost");
    }

    if (itemB.quantity !== 5 || itemB.cost !== 180) {
      fail("SupplyItem Product B содержит неправильные quantity/cost");
    }

    console.log("🟢 SupplyItems are correct");

    // =========================================================================
    // 7. VERIFY BATCHES
    // =========================================================================

    section("7. VERIFY BATCH CREATION");

    const batches = await prisma.batch.findMany({
      where: {
        productId: {
          in: [productAId, productBId],
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(`Created test batches=${batches.length}`);

    if (batches.length !== 2) {
      fail(
        `Ожидалось 2 Batch, найдено ${batches.length}`
      );
    }

    const batchA = batches.find(
      (batch) => batch.productId === productAId
    );

    const batchB = batches.find(
      (batch) => batch.productId === productBId
    );

    if (!batchA) {
      fail("Batch для Product A не найден");
    }

    if (!batchB) {
      fail("Batch для Product B не найден");
    }

    productABatchId = batchA.id;
    productBBatchId = batchB.id;

    console.log(
      `Batch A #${batchA.id} | product=${batchA.productId} | ` +
        `quantity=${batchA.quantity} | purchaseCost=${batchA.purchaseCost} | ` +
        `expiry=${batchA.expiryDate.toISOString()} | status=${batchA.status}`
    );

    console.log(
      `Batch B #${batchB.id} | product=${batchB.productId} | ` +
        `quantity=${batchB.quantity} | purchaseCost=${batchB.purchaseCost} | ` +
        `expiry=${batchB.expiryDate.toISOString()} | status=${batchB.status}`
    );

    if (batchA.quantity !== 3) {
      fail(`Batch A quantity должен быть 3, получено ${batchA.quantity}`);
    }

    if (batchA.purchaseCost !== 100) {
      fail(
        `Batch A purchaseCost должен быть 100, получено ${batchA.purchaseCost}`
      );
    }

    if (batchA.status !== "ACTIVE") {
      fail(
        `Batch A должен иметь status=ACTIVE, получено ${batchA.status}`
      );
    }

    const batchAExpiryLocal = formatLocalDate(batchA.expiryDate);

    console.log(`Batch A expiry local=${batchAExpiryLocal}`);

    if (batchAExpiryLocal !== expiryA) {
      fail(
        `Batch A expiryDate должен быть ${expiryA}, получено ${batchAExpiryLocal}`
      );
    }

    if (batchB.quantity !== 5) {
      fail(`Batch B quantity должен быть 5, получено ${batchB.quantity}`);
    }

    if (batchB.purchaseCost !== 180) {
      fail(
        `Batch B purchaseCost должен быть 180, получено ${batchB.purchaseCost}`
      );
    }

    if (batchB.status !== "ACTIVE") {
      fail(
        `Batch B должен иметь status=ACTIVE, получено ${batchB.status}`
      );
    }

    const batchBExpiryLocal = formatLocalDate(batchB.expiryDate);

    console.log(`Batch B expiry local=${batchBExpiryLocal}`);

    if (batchBExpiryLocal !== expiryB) {
      fail(
        `Batch B expiryDate должен быть ${expiryB}, получено ${batchBExpiryLocal}`
      );
    }

    console.log("🟢 Batches are correct");

    // =========================================================================
    // 8. VERIFY PRODUCT STOCK
    // =========================================================================

    section("8. VERIFY PRODUCT STOCK INVARIANT");

    const productsAfterSupply = await prisma.product.findMany({
      where: {
        id: {
          in: [productAId, productBId],
        },
      },
      include: {
        batches: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (productsAfterSupply.length !== 2) {
      fail("После Supply должны существовать оба тестовых Product");
    }

    for (const product of productsAfterSupply) {
      const batchTotal = product.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      console.log(
        `Product #${product.id} | stock=${product.stock} | ` +
          `SUM(Batch.quantity)=${batchTotal}`
      );

      if (product.stock !== batchTotal) {
        fail(
          `Product #${product.id}: stock=${product.stock}, batchTotal=${batchTotal}`
        );
      }
    }

    const productAAfterSupply = productsAfterSupply.find(
      (product) => product.id === productAId
    );

    const productBAfterSupply = productsAfterSupply.find(
      (product) => product.id === productBId
    );

    if (!productAAfterSupply || !productBAfterSupply) {
      fail("Тестовые Product не найдены после Supply");
    }

    if (productAAfterSupply.stock !== 3) {
      fail(
        `Product A stock должен быть 3, получено ${productAAfterSupply.stock}`
      );
    }

    if (productBAfterSupply.stock !== 5) {
      fail(
        `Product B stock должен быть 5, получено ${productBAfterSupply.stock}`
      );
    }

    console.log("🟢 Product.stock invariant passed");

    // =========================================================================
    // 9. VERIFY SUPPLY MOVEMENTS
    // =========================================================================

    section("9. VERIFY SUPPLY MOVEMENTS");

    const movements = await prisma.movement.findMany({
      where: {
        productId: {
          in: [productAId, productBId],
        },
        type: "SUPPLY",
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(`SUPPLY movements=${movements.length}`);

    if (movements.length !== 2) {
      fail(
        `Ожидалось 2 SUPPLY Movement, найдено ${movements.length}`
      );
    }

    const movementA = movements.find(
      (movement) => movement.productId === productAId
    );

    const movementB = movements.find(
      (movement) => movement.productId === productBId
    );

    if (!movementA) {
      fail("SUPPLY Movement для Product A не найден");
    }

    if (!movementB) {
      fail("SUPPLY Movement для Product B не найден");
    }

    console.log(
      `Movement A #${movementA.id} | quantity=${movementA.quantity} | type=${movementA.type} | comment=${movementA.comment}`
    );

    console.log(
      `Movement B #${movementB.id} | quantity=${movementB.quantity} | type=${movementB.type} | comment=${movementB.comment}`
    );

    if (movementA.quantity !== 3) {
      fail(
        `Movement A quantity должен быть +3, получено ${movementA.quantity}`
      );
    }

    if (movementB.quantity !== 5) {
      fail(
        `Movement B quantity должен быть +5, получено ${movementB.quantity}`
      );
    }

    if (movementA.type !== "SUPPLY" || movementB.type !== "SUPPLY") {
      fail("Supply movements должны иметь type=SUPPLY");
    }

    if (
      typeof movementA.comment !== "string" ||
      !movementA.comment.includes(`поставка №${supplyId}`)
    ) {
      fail("Movement A имеет неправильный comment");
    }

    if (
      typeof movementB.comment !== "string" ||
      !movementB.comment.includes(`поставка №${supplyId}`)
    ) {
      fail("Movement B имеет неправильный comment");
    }

    console.log("🟢 SUPPLY movements are correct");

    // =========================================================================
    // 10. VERIFY TOTAL MOVEMENT QUANTITY
    // =========================================================================

    section("10. VERIFY NET SUPPLY MOVEMENT QUANTITY");

    const productAMovements = await prisma.movement.findMany({
      where: {
        productId: productAId,
      },
    });

    const productBMovements = await prisma.movement.findMany({
      where: {
        productId: productBId,
      },
    });

    const productANetMovement = productAMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const productBNetMovement = productBMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    console.log(
      `Product A net movement=${productANetMovement}`
    );

    console.log(
      `Product B net movement=${productBNetMovement}`
    );

    if (productANetMovement !== 3) {
      fail(
        `Product A net movement должен быть +3, получено ${productANetMovement}`
      );
    }

    if (productBNetMovement !== 5) {
      fail(
        `Product B net movement должен быть +5, получено ${productBNetMovement}`
      );
    }

    console.log("🟢 Net movement quantities are correct");

    // =========================================================================
    // 11. INVALID SUPPLY — UNKNOWN SUPPLIER
    // =========================================================================

    section("11. INVALID SUPPLY — UNKNOWN SUPPLIER");

    const beforeUnknownSupplierSupplyCount =
      await prisma.supply.count();

    const beforeUnknownSupplierItemCount =
      await prisma.supplyItem.count();

    const unknownSupplierId = 999999999;

    const invalidSupplierResponse = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId: unknownSupplierId,
        items: [
          {
            id: productAId,
            quantity: 1,
            cost: 100,
            expiryDate: "2027-02-01",
          },
        ],
      }),
    });

    console.log("POST /api/supplies with unknown supplier");
    console.log(`HTTP ${invalidSupplierResponse.status}`);
    console.log(
      JSON.stringify(invalidSupplierResponse.data, null, 2)
    );

    if (invalidSupplierResponse.status !== 404) {
      fail(
        `Unknown supplier должен вернуть HTTP 404, получено ${invalidSupplierResponse.status}`
      );
    }

    const afterUnknownSupplierSupplyCount =
      await prisma.supply.count();

    const afterUnknownSupplierItemCount =
      await prisma.supplyItem.count();

    if (
      afterUnknownSupplierSupplyCount !==
      beforeUnknownSupplierSupplyCount
    ) {
      fail(
        "Unknown supplier создал Supply несмотря на ошибку"
      );
    }

    if (
      afterUnknownSupplierItemCount !==
      beforeUnknownSupplierItemCount
    ) {
      fail(
        "Unknown supplier создал SupplyItem несмотря на ошибку"
      );
    }

    console.log("🟢 Unknown supplier rejected atomically");

    // =========================================================================
    // 12. INVALID SUPPLY — EMPTY ITEMS
    // =========================================================================

    section("12. INVALID SUPPLY — EMPTY ITEMS");

    const beforeEmptyItemsSupplyCount =
      await prisma.supply.count();

    const emptyItemsResponse = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        items: [],
      }),
    });

    console.log("POST /api/supplies with empty items");
    console.log(`HTTP ${emptyItemsResponse.status}`);
    console.log(
      JSON.stringify(emptyItemsResponse.data, null, 2)
    );

    if (emptyItemsResponse.status !== 400) {
      fail(
        `Empty items должен вернуть HTTP 400, получено ${emptyItemsResponse.status}`
      );
    }

    const afterEmptyItemsSupplyCount =
      await prisma.supply.count();

    if (
      afterEmptyItemsSupplyCount !==
      beforeEmptyItemsSupplyCount
    ) {
      fail(
        "Empty items неожиданно создал Supply"
      );
    }

    console.log("🟢 Empty items rejected");

    // =========================================================================
    // 13. INVALID SUPPLY — ZERO QUANTITY
    // =========================================================================

    section("13. INVALID SUPPLY — ZERO QUANTITY");

    const beforeZeroQuantitySupplyCount =
      await prisma.supply.count();

    const beforeZeroQuantityBatchCount =
      await prisma.batch.count({
        where: {
          productId: productAId,
        },
      });

    const zeroQuantityResponse = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productAId,
            quantity: 0,
            cost: 100,
            expiryDate: "2027-02-01",
          },
        ],
      }),
    });

    console.log("POST /api/supplies with quantity=0");
    console.log(`HTTP ${zeroQuantityResponse.status}`);
    console.log(
      JSON.stringify(zeroQuantityResponse.data, null, 2)
    );

    if (zeroQuantityResponse.status !== 400) {
      fail(
        `quantity=0 должен вернуть HTTP 400, получено ${zeroQuantityResponse.status}`
      );
    }

    const afterZeroQuantitySupplyCount =
      await prisma.supply.count();

    const afterZeroQuantityBatchCount =
      await prisma.batch.count({
        where: {
          productId: productAId,
        },
      });

    if (
      afterZeroQuantitySupplyCount !==
      beforeZeroQuantitySupplyCount
    ) {
      fail(
        "quantity=0 неожиданно создал Supply"
      );
    }

    if (
      afterZeroQuantityBatchCount !==
      beforeZeroQuantityBatchCount
    ) {
      fail(
        "quantity=0 неожиданно создал Batch"
      );
    }

    console.log("🟢 Zero quantity rejected");

    // =========================================================================
    // 14. INVALID SUPPLY — NEGATIVE COST
    // =========================================================================

    section("14. INVALID SUPPLY — NEGATIVE COST");

    const beforeNegativeCostSupplyCount =
      await prisma.supply.count();

    const beforeNegativeCostBatchCount =
      await prisma.batch.count({
        where: {
          productId: productBId,
        },
      });

    const negativeCostResponse = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productBId,
            quantity: 2,
            cost: -1,
            expiryDate: "2027-02-01",
          },
        ],
      }),
    });

    console.log("POST /api/supplies with cost=-1");
    console.log(`HTTP ${negativeCostResponse.status}`);
    console.log(
      JSON.stringify(negativeCostResponse.data, null, 2)
    );

    if (negativeCostResponse.status !== 400) {
      fail(
        `cost=-1 должен вернуть HTTP 400, получено ${negativeCostResponse.status}`
      );
    }

    const afterNegativeCostSupplyCount =
      await prisma.supply.count();

    const afterNegativeCostBatchCount =
      await prisma.batch.count({
        where: {
          productId: productBId,
        },
      });

    if (
      afterNegativeCostSupplyCount !==
      beforeNegativeCostSupplyCount
    ) {
      fail(
        "Negative cost неожиданно создал Supply"
      );
    }

    if (
      afterNegativeCostBatchCount !==
      beforeNegativeCostBatchCount
    ) {
      fail(
        "Negative cost неожиданно создал Batch"
      );
    }

    console.log("🟢 Negative cost rejected");

    // =========================================================================
    // 15. INVALID SUPPLY — UNKNOWN PRODUCT
    // =========================================================================

    section("15. INVALID SUPPLY — UNKNOWN PRODUCT");

    const beforeUnknownProductSupplyCount =
      await prisma.supply.count();

    const beforeUnknownProductBatchCount =
      await prisma.batch.count();

    const unknownProductResponse = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: 999999999,
            quantity: 2,
            cost: 100,
            expiryDate: "2027-02-01",
          },
        ],
      }),
    });

    console.log("POST /api/supplies with unknown product");
    console.log(`HTTP ${unknownProductResponse.status}`);
    console.log(
      JSON.stringify(unknownProductResponse.data, null, 2)
    );

    if (unknownProductResponse.status !== 404) {
      fail(
        `Unknown product должен вернуть HTTP 404, получено ${unknownProductResponse.status}`
      );
    }

    const afterUnknownProductSupplyCount =
      await prisma.supply.count();

    const afterUnknownProductBatchCount =
      await prisma.batch.count();

    if (
      afterUnknownProductSupplyCount !==
      beforeUnknownProductSupplyCount
    ) {
      fail(
        "Unknown product неожиданно создал Supply"
      );
    }

    if (
      afterUnknownProductBatchCount !==
      beforeUnknownProductBatchCount
    ) {
      fail(
        "Unknown product неожиданно создал Batch"
      );
    }

    console.log("🟢 Unknown product rejected atomically");

    // =========================================================================
    // 16. INVALID SUPPLY — INVALID EXPIRY DATE
    // =========================================================================

    section("16. INVALID SUPPLY — INVALID EXPIRY DATE");

    const beforeInvalidDateSupplyCount =
      await prisma.supply.count();

    const beforeInvalidDateBatchCount =
      await prisma.batch.count();

    const invalidDateResponse = await request("/api/supplies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productAId,
            quantity: 1,
            cost: 100,
            expiryDate: "NOT-A-DATE",
          },
        ],
      }),
    });

    console.log("POST /api/supplies with invalid expiryDate");
    console.log(`HTTP ${invalidDateResponse.status}`);
    console.log(
      JSON.stringify(invalidDateResponse.data, null, 2)
    );

    if (invalidDateResponse.status !== 400) {
      fail(
        `Invalid expiryDate должен вернуть HTTP 400, получено ${invalidDateResponse.status}`
      );
    }

    const afterInvalidDateSupplyCount =
      await prisma.supply.count();

    const afterInvalidDateBatchCount =
      await prisma.batch.count();

    if (
      afterInvalidDateSupplyCount !==
      beforeInvalidDateSupplyCount
    ) {
      fail(
        "Invalid expiryDate неожиданно создал Supply"
      );
    }

    if (
      afterInvalidDateBatchCount !==
      beforeInvalidDateBatchCount
    ) {
      fail(
        "Invalid expiryDate неожиданно создал Batch"
      );
    }

    console.log("🟢 Invalid expiry date rejected");

    // =========================================================================
    // 17. VERIFY NO EXTRA TEST INVENTORY WAS CREATED
    // =========================================================================

    section("17. VERIFY NO EXTRA INVENTORY FROM FAILED REQUESTS");

    const finalTestBatches = await prisma.batch.findMany({
      where: {
        productId: {
          in: [productAId, productBId],
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    const finalTestMovements = await prisma.movement.findMany({
      where: {
        productId: {
          in: [productAId, productBId],
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    const finalTestSupplyItems =
      await prisma.supplyItem.findMany({
        where: {
          productId: {
            in: [productAId, productBId],
          },
        },
        orderBy: {
          id: "asc",
        },
      });

    console.log(`Test Batches=${finalTestBatches.length}`);
    console.log(`Test Movements=${finalTestMovements.length}`);
    console.log(`Test SupplyItems=${finalTestSupplyItems.length}`);

    if (finalTestBatches.length !== 2) {
      fail(
        `После невалидных запросов должно остаться ровно 2 Batch, найдено ${finalTestBatches.length}`
      );
    }

    if (finalTestMovements.length !== 2) {
      fail(
        `После невалидных запросов должно остаться ровно 2 Movement, найдено ${finalTestMovements.length}`
      );
    }

    if (finalTestSupplyItems.length !== 2) {
      fail(
        `После невалидных запросов должно остаться ровно 2 SupplyItem, найдено ${finalTestSupplyItems.length}`
      );
    }

    console.log("🟢 Failed requests did not create extra inventory");

    // =========================================================================
    // 18. FINAL STOCK / SUPPLY INTEGRITY
    // =========================================================================

    section("18. FINAL SUPPLY/STOCK INTEGRITY");

    const finalProducts = await prisma.product.findMany({
      where: {
        id: {
          in: [productAId, productBId],
        },
      },
      include: {
        batches: true,
        movements: true,
        supplyItems: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (finalProducts.length !== 2) {
      fail("Не все тестовые Product существуют в финальной проверке");
    }

    for (const product of finalProducts) {
      const batchTotal = product.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      const supplyQuantity = product.supplyItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      const supplyMovementQuantity = product.movements
        .filter((movement) => movement.type === "SUPPLY")
        .reduce(
          (sum, movement) => sum + movement.quantity,
          0
        );

      console.log("");
      console.log(`Product #${product.id}`);
      console.log(`stock=${product.stock}`);
      console.log(`SUM(Batch.quantity)=${batchTotal}`);
      console.log(`SUM(SupplyItem.quantity)=${supplyQuantity}`);
      console.log(
        `SUM(SUPPLY Movement.quantity)=${supplyMovementQuantity}`
      );

      if (product.stock !== batchTotal) {
        fail(
          `Product #${product.id}: stock != SUM(Batch.quantity)`
        );
      }

      if (product.stock !== supplyQuantity) {
        fail(
          `Product #${product.id}: stock != SUM(SupplyItem.quantity)`
        );
      }

      if (product.stock !== supplyMovementQuantity) {
        fail(
          `Product #${product.id}: stock != SUPPLY movement quantity`
        );
      }
    }

    const finalProductA = finalProducts.find(
      (product) => product.id === productAId
    );

    const finalProductB = finalProducts.find(
      (product) => product.id === productBId
    );

    if (!finalProductA || !finalProductB) {
      fail("Финальные тестовые Product не найдены");
    }

    if (finalProductA.stock !== 3) {
      fail(
        `Final Product A stock должен быть 3, получено ${finalProductA.stock}`
      );
    }

    if (finalProductB.stock !== 5) {
      fail(
        `Final Product B stock должен быть 5, получено ${finalProductB.stock}`
      );
    }

    console.log("");
    console.log("🟢 FINAL STOCK INVARIANT PASSED");
    console.log("🟢 SUPPLY QUANTITY INVARIANT PASSED");
    console.log("🟢 MOVEMENT QUANTITY INVARIANT PASSED");

    // =========================================================================
    // 19. FINAL RESULT
    // =========================================================================

    console.log("");
    console.log("==============================================================================");
    console.log("V43 FINAL RESULT");
    console.log("==============================================================================");
    console.log("");
    console.log("🟢 V43 PASSED");
    console.log("");
    console.log("Verified:");
    console.log("");
    console.log("🟢 Product A creation");
    console.log("🟢 Product B creation");
    console.log("🟢 Supplier creation");
    console.log("🟢 Multi-item Supply creation");
    console.log("🟢 Server-calculated Supply.total");
    console.log("🟢 SupplyItem quantities and costs");
    console.log("🟢 One Batch per supplied item");
    console.log("🟢 Batch purchaseCost");
    console.log("🟢 Batch expiryDate");
    console.log("🟢 Batch ACTIVE status");
    console.log("🟢 Product.stock = SUM(Batch.quantity)");
    console.log("🟢 SUPPLY Movement for every product");
    console.log("🟢 SUPPLY Movement quantities");
    console.log("🟢 Unknown supplier rejected");
    console.log("🟢 Empty items rejected");
    console.log("🟢 Zero quantity rejected");
    console.log("🟢 Negative cost rejected");
    console.log("🟢 Unknown product rejected");
    console.log("🟢 Invalid expiry date rejected");
    console.log("🟢 Failed requests create no partial Supply");
    console.log("🟢 Failed requests create no partial Batch");
    console.log("🟢 Failed requests create no partial Movement");
    console.log("🟢 Failed requests create no partial SupplyItem");
    console.log("🟢 Final stock invariant passed");
    console.log("");
    console.log("==============================================================================");
    console.log("V43 COMPLETED");
    console.log("==============================================================================");
  } finally {
    // ========================================================================
    // CLEANUP
    // ========================================================================

    console.log("");
    console.log("==============================================================================");
    console.log("V43 CLEANUP");
    console.log("==============================================================================");
    console.log("");

    if (productAId !== null || productBId !== null) {
      const testProductIds = [
        productAId,
        productBId,
      ].filter(
        (id): id is number => id !== null
      );

      const testOrderItems = await prisma.orderItem.findMany({
        where: {
          productId: {
            in: testProductIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (testOrderItems.length > 0) {
        const orderItemIds = testOrderItems.map(
          (item) => item.id
        );

        const deletedReturnBatches =
          await prisma.returnBatch.deleteMany({
            where: {
              orderItemId: {
                in: orderItemIds,
              },
            },
          });

        console.log(
          `Deleted return batches=${deletedReturnBatches.count}`
        );

        const deletedOrderBatches =
          await prisma.orderBatch.deleteMany({
            where: {
              orderItemId: {
                in: orderItemIds,
              },
            },
          });

        console.log(
          `Deleted order batches=${deletedOrderBatches.count}`
        );

        const deletedOrderItems =
          await prisma.orderItem.deleteMany({
            where: {
              id: {
                in: orderItemIds,
              },
            },
          });

        console.log(
          `Deleted order items=${deletedOrderItems.count}`
        );
      } else {
        console.log("Deleted return batches=0");
        console.log("Deleted order batches=0");
        console.log("Deleted order items=0");
      }

      const deletedMovements =
        await prisma.movement.deleteMany({
          where: {
            productId: {
              in: testProductIds,
            },
          },
        });

      console.log(
        `Deleted movements=${deletedMovements.count}`
      );

      const deletedSupplyItems =
        await prisma.supplyItem.deleteMany({
          where: {
            productId: {
              in: testProductIds,
            },
          },
        });

      console.log(
        `Deleted supply items=${deletedSupplyItems.count}`
      );

      const deletedBatches =
        await prisma.batch.deleteMany({
          where: {
            productId: {
              in: testProductIds,
            },
          },
        });

      console.log(
        `Deleted batches=${deletedBatches.count}`
      );

      const deletedProducts =
        await prisma.product.deleteMany({
          where: {
            id: {
              in: testProductIds,
            },
          },
        });

      console.log(
        `Deleted products=${deletedProducts.count}`
      );
    }

    if (supplyId !== null) {
      const deletedSupply =
        await prisma.supply.deleteMany({
          where: {
            id: supplyId,
          },
        });

      console.log(
        `Deleted supplies=${deletedSupply.count}`
      );
    }

    if (supplierId !== null) {
      const deletedSupplier =
        await prisma.supplier.deleteMany({
          where: {
            id: supplierId,
          },
        });

      console.log(
        `Deleted suppliers=${deletedSupplier.count}`
      );
    }

    console.log("");
    console.log("🟢 CLEANUP COMPLETED");
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 V43 TEST FAILED");
    console.error("");
    console.error(error);
    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });