import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const TEST_PREFIX = "V40_INTEGRATION_TEST";

type JsonValue = unknown;

type RequestResult = {
  response: Response;
  data: JsonValue;
};

let createdProductId: number | null = null;
let maliciousProductId: number | null = null;
let createdSupplierId: number | null = null;
let createdSupplyId: number | null = null;
let createdBatchId: number | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`🔴 ASSERTION FAILED: ${message}`);
  }
}

function isObject(
  value: JsonValue
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function requestJson(
  url: string,
  options?: RequestInit
): Promise<RequestResult> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  let data: JsonValue = null;

  const text = await response.text();

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    response,
    data,
  };
}

function printResponse(
  label: string,
  response: Response,
  data: JsonValue
) {
  console.log(`${label}`);
  console.log(`HTTP ${response.status}`);

  if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }

  console.log("");
}

function localDateOnly(daysFromNow: number): string {
  const date = new Date();

  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function cleanup() {
  console.log("");
  console.log("==============================================================================");
  console.log("V40 CLEANUP");
  console.log("==============================================================================");
  console.log("");

  try {
    /*
     * Удаляем в правильном порядке:
     *
     * Movement
     * SupplyItem
     * Supply
     * Batch
     * Product
     * Supplier
     *
     * Тест не создаёт Order / OrderItem / ReturnBatch,
     * поэтому их удалять здесь не требуется.
     */

    const productIds = [
      createdProductId,
      maliciousProductId,
    ].filter(
      (id): id is number => id !== null
    );

    if (productIds.length > 0) {
      const deletedMovements =
        await prisma.movement.deleteMany({
          where: {
            productId: {
              in: productIds,
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
              in: productIds,
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
              in: productIds,
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
              in: productIds,
            },
          },
        });

      console.log(
        `Deleted products=${deletedProducts.count}`
      );
    }

    if (createdSupplyId !== null) {
      const deletedSupplies =
        await prisma.supply.deleteMany({
          where: {
            id: createdSupplyId,
          },
        });

      console.log(
        `Deleted supplies=${deletedSupplies.count}`
      );
    }

    if (createdSupplierId !== null) {
      const deletedSuppliers =
        await prisma.supplier.deleteMany({
          where: {
            id: createdSupplierId,
          },
        });

      console.log(
        `Deleted suppliers=${deletedSuppliers.count}`
      );
    }

    console.log("");
    console.log("🟢 CLEANUP COMPLETED");
    console.log("");
  } catch (error) {
    console.error("");
    console.error("🔴 CLEANUP FAILED");
    console.error(error);
    console.error("");
  }
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("V40 PRODUCT STOCK INTEGRITY E2E TEST");
  console.log("==============================================================================");
  console.log("");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log("");
  console.log("TEST PURPOSE:");
  console.log(
    "Product.stock must be derived from Batch.quantity."
  );
  console.log(
    "Initial stock must NOT be manually writable through Product creation."
  );
  console.log(
    "Supply must increase Batch.quantity and Product.stock."
  );
  console.log(
    "Write-off must decrease Batch.quantity and Product.stock."
  );
  console.log("");
  console.log("==============================================================================");
  console.log("");

  /*
   * ===========================================================================
   * 1. CREATE PRODUCT WITHOUT STOCK
   * ===========================================================================
   */

  console.log("1. CREATE PRODUCT WITHOUT INITIAL STOCK");
  console.log("------------------------------------------------------------------------------");

  const productName =
    `${TEST_PREFIX} Товар ${Date.now()}`;

  const createProductResult = await requestJson(
    `${BASE_URL}/api/products`,
    {
      method: "POST",
      body: JSON.stringify({
        name: productName,
        barcode: `V40-${Date.now()}`,
        unit: "шт",
        price: 300,
        cost: 100,
      }),
    }
  );

  printResponse(
    "POST /api/products",
    createProductResult.response,
    createProductResult.data
  );

  assert(
    createProductResult.response.ok,
    "Product creation without stock must succeed"
  );

  assert(
    isObject(createProductResult.data),
    "Product creation response must be an object"
  );

  assert(
    typeof createProductResult.data.id === "number",
    "Created product must contain numeric id"
  );

  createdProductId =
    createProductResult.data.id as number;

  console.log(
    `Created Product #${createdProductId}`
  );

  /*
   * Проверяем БД, а не только HTTP response.
   */

  const productAfterCreation =
    await prisma.product.findUnique({
      where: {
        id: createdProductId,
      },
    });

  assert(
    productAfterCreation !== null,
    "Created product must exist in database"
  );

  assert(
    productAfterCreation.stock === 0,
    `New Product.stock must be 0, got ${productAfterCreation.stock}`
  );

  const batchesAfterCreation =
    await prisma.batch.findMany({
      where: {
        productId: createdProductId,
      },
    });

  assert(
    batchesAfterCreation.length === 0,
    `New product must have no batches, got ${batchesAfterCreation.length}`
  );

  console.log(
    "🟢 New product stock=0"
  );

  console.log(
    "🟢 New product has no batches"
  );

  console.log("");

  /*
   * ===========================================================================
   * 2. ATTEMPT TO INJECT INITIAL STOCK
   * ===========================================================================
   */

  console.log("2. PROTECTION AGAINST MANUAL PRODUCT STOCK");
  console.log("------------------------------------------------------------------------------");

  const maliciousProductResult = await requestJson(
    `${BASE_URL}/api/products`,
    {
      method: "POST",
      body: JSON.stringify({
        name: `${TEST_PREFIX} MALICIOUS STOCK ${Date.now()}`,
        barcode: `V40-MAL-${Date.now()}`,
        unit: "шт",
        price: 500,
        cost: 200,

        /*
         * Это намеренная попытка нарушить инвариант:
         *
         * Product.stock = 100
         * Batch.quantity = 0
         *
         * Такое состояние существовать не должно.
         */
        stock: 100,
      }),
    }
  );

  printResponse(
    "POST /api/products with stock=100",
    maliciousProductResult.response,
    maliciousProductResult.data
  );

  /*
   * Правильное поведение V40:
   *
   * API должен отвергнуть ручную запись stock.
   *
   * Если текущий API ещё старый, этот тест ожидаемо упадёт здесь
   * с сообщением о том, что API позволил создать товар с stock=100.
   */

  assert(
    maliciousProductResult.response.status === 400,
    `POST /api/products with manual stock must return 400, got ${maliciousProductResult.response.status}`
  );

  console.log(
    "🟢 Manual Product.stock injection rejected"
  );

  console.log("");

  /*
   * ===========================================================================
   * 3. CREATE SUPPLIER
   * ===========================================================================
   */

  console.log("3. CREATE TEST SUPPLIER");
  console.log("------------------------------------------------------------------------------");

  const supplierResult = await requestJson(
    `${BASE_URL}/api/suppliers`,
    {
      method: "POST",
      body: JSON.stringify({
        name: `${TEST_PREFIX} Поставщик ${Date.now()}`,
        phone: "",
        address: "",
      }),
    }
  );

  printResponse(
    "POST /api/suppliers",
    supplierResult.response,
    supplierResult.data
  );

  assert(
    supplierResult.response.ok,
    "Supplier creation must succeed"
  );

  assert(
    isObject(supplierResult.data),
    "Supplier response must be an object"
  );

  assert(
    typeof supplierResult.data.id === "number",
    "Supplier must contain numeric id"
  );

  createdSupplierId =
    supplierResult.data.id as number;

  console.log(
    `Created Supplier #${createdSupplierId}`
  );

  console.log("");

  /*
   * ===========================================================================
   * 4. VERIFY STOCK BEFORE SUPPLY
   * ===========================================================================
   */

  console.log("4. VERIFY STOCK BEFORE SUPPLY");
  console.log("------------------------------------------------------------------------------");

  const beforeSupply =
    await prisma.product.findUnique({
      where: {
        id: createdProductId,
      },
    });

  assert(
    beforeSupply !== null,
    "Product must exist before supply"
  );

  assert(
    beforeSupply.stock === 0,
    `Product.stock before supply must be 0, got ${beforeSupply.stock}`
  );

  console.log(
    `Product #${createdProductId} stock=${beforeSupply.stock}`
  );

  console.log(
    "🟢 Product has zero physical stock before supply"
  );

  console.log("");

  /*
   * ===========================================================================
   * 5. CREATE SUPPLY
   * ===========================================================================
   */

  console.log("5. CREATE SUPPLY");
  console.log("------------------------------------------------------------------------------");

  const expiryDate =
    localDateOnly(30);

  const supplyResult = await requestJson(
    `${BASE_URL}/api/supplies`,
    {
      method: "POST",
      body: JSON.stringify({
        supplierId: createdSupplierId,
        total: 500,
        items: [
          {
            id: createdProductId,
            quantity: 5,
            cost: 100,
            expiryDate,
          },
        ],
      }),
    }
  );

  printResponse(
    "POST /api/supplies",
    supplyResult.response,
    supplyResult.data
  );

  assert(
    supplyResult.response.ok,
    "Supply creation must succeed"
  );

  assert(
    isObject(supplyResult.data),
    "Supply response must be an object"
  );

  assert(
    isObject(supplyResult.data.supply),
    "Supply response must contain supply"
  );

  assert(
    typeof supplyResult.data.supply.id === "number",
    "Created supply must contain numeric id"
  );

  createdSupplyId =
    supplyResult.data.supply.id as number;

  console.log(
    `Created Supply #${createdSupplyId}`
  );

  console.log("");

  /*
   * ===========================================================================
   * 6. VERIFY BATCH CREATED BY SUPPLY
   * ===========================================================================
   */

  console.log("6. VERIFY BATCH AFTER SUPPLY");
  console.log("------------------------------------------------------------------------------");

  const batchesAfterSupply =
    await prisma.batch.findMany({
      where: {
        productId: createdProductId,
      },
      orderBy: {
        id: "asc",
      },
    });

  assert(
    batchesAfterSupply.length === 1,
    `Expected exactly 1 batch after supply, got ${batchesAfterSupply.length}`
  );

  const supplyBatch =
    batchesAfterSupply[0];

  createdBatchId =
    supplyBatch.id;

  assert(
    supplyBatch.quantity === 5,
    `Batch.quantity after supply must be 5, got ${supplyBatch.quantity}`
  );

  assert(
    supplyBatch.purchaseCost === 100,
    `Batch.purchaseCost must be 100, got ${supplyBatch.purchaseCost}`
  );

  assert(
    supplyBatch.status === "ACTIVE",
    `New supplied batch must be ACTIVE, got ${supplyBatch.status}`
  );

  assert(
    supplyBatch.productId === createdProductId,
    "Batch must belong to test product"
  );

  console.log(
    `Batch #${supplyBatch.id}`
  );

  console.log(
    `quantity=${supplyBatch.quantity}`
  );

  console.log(
    `purchaseCost=${supplyBatch.purchaseCost}`
  );

  console.log(
    `status=${supplyBatch.status}`
  );

  console.log(
    "🟢 Supply created exactly one ACTIVE batch"
  );

  console.log("");

  /*
   * ===========================================================================
   * 7. VERIFY PRODUCT STOCK SYNCHRONIZATION AFTER SUPPLY
   * ===========================================================================
   */

  console.log("7. VERIFY PRODUCT STOCK AFTER SUPPLY");
  console.log("------------------------------------------------------------------------------");

  const afterSupply =
    await prisma.product.findUnique({
      where: {
        id: createdProductId,
      },
    });

  assert(
    afterSupply !== null,
    "Product must exist after supply"
  );

  assert(
    afterSupply.stock === 5,
    `Product.stock after supply must be 5, got ${afterSupply.stock}`
  );

  const batchSumAfterSupply =
    await prisma.batch.aggregate({
      where: {
        productId: createdProductId,
      },
      _sum: {
        quantity: true,
      },
    });

  const expectedStockAfterSupply =
    batchSumAfterSupply._sum.quantity ?? 0;

  assert(
    afterSupply.stock === expectedStockAfterSupply,
    `Product.stock=${afterSupply.stock} must equal SUM(Batch.quantity)=${expectedStockAfterSupply}`
  );

  console.log(
    `Product.stock=${afterSupply.stock}`
  );

  console.log(
    `SUM(Batch.quantity)=${expectedStockAfterSupply}`
  );

  console.log(
    "🟢 Product.stock synchronized with Batch.quantity"
  );

  console.log("");

  /*
   * ===========================================================================
   * 8. VERIFY SUPPLY MOVEMENT
   * ===========================================================================
   */

  console.log("8. VERIFY SUPPLY MOVEMENT");
  console.log("------------------------------------------------------------------------------");

  const supplyMovements =
    await prisma.movement.findMany({
      where: {
        productId: createdProductId,
        type: "SUPPLY",
      },
      orderBy: {
        id: "desc",
      },
    });

  assert(
    supplyMovements.length === 1,
    `Expected exactly 1 SUPPLY movement, got ${supplyMovements.length}`
  );

  const supplyMovement =
    supplyMovements[0];

  assert(
    supplyMovement.quantity === 5,
    `SUPPLY movement quantity must be +5, got ${supplyMovement.quantity}`
  );

  assert(
    supplyMovement.productId === createdProductId,
    "SUPPLY movement must belong to test product"
  );

  console.log(
    `Movement #${supplyMovement.id}`
  );

  console.log(
    `type=${supplyMovement.type}`
  );

  console.log(
    `quantity=${supplyMovement.quantity}`
  );

  console.log(
    `comment=${supplyMovement.comment ?? "null"}`
  );

  console.log(
    "🟢 SUPPLY movement is correct"
  );

  console.log("");

  /*
   * ===========================================================================
   * 9. WRITE OFF PART OF THE BATCH
   * ===========================================================================
   */

  console.log("9. PARTIAL WRITE-OFF");
  console.log("------------------------------------------------------------------------------");

  assert(
    createdBatchId !== null,
    "Batch id must exist before write-off"
  );

  const writeoffResult = await requestJson(
    `${BASE_URL}/api/batches/${createdBatchId}/writeoff`,
    {
      method: "POST",
      body: JSON.stringify({
        quantity: 2,
        reason: `${TEST_PREFIX} partial write-off`,
      }),
    }
  );

  printResponse(
    "POST /api/batches/:id/writeoff",
    writeoffResult.response,
    writeoffResult.data
  );

  assert(
    writeoffResult.response.ok,
    "Partial write-off must succeed"
  );

  console.log(
    "🟢 Partial write-off succeeded"
  );

  console.log("");

  /*
   * ===========================================================================
   * 10. VERIFY BATCH AFTER WRITE-OFF
   * ===========================================================================
   */

  console.log("10. VERIFY BATCH AFTER WRITE-OFF");
  console.log("------------------------------------------------------------------------------");

  const batchAfterWriteoff =
    await prisma.batch.findUnique({
      where: {
        id: createdBatchId,
      },
    });

  assert(
    batchAfterWriteoff !== null,
    "Batch must still exist after partial write-off"
  );

  assert(
    batchAfterWriteoff.quantity === 3,
    `Batch.quantity after writing off 2 from 5 must be 3, got ${batchAfterWriteoff.quantity}`
  );

  assert(
    batchAfterWriteoff.status === "ACTIVE",
    `Batch must remain ACTIVE with positive non-expired quantity, got ${batchAfterWriteoff.status}`
  );

  console.log(
    `Batch #${batchAfterWriteoff.id}`
  );

  console.log(
    `quantity=${batchAfterWriteoff.quantity}`
  );

  console.log(
    `status=${batchAfterWriteoff.status}`
  );

  console.log(
    "🟢 Batch quantity decreased correctly"
  );

  console.log("");

  /*
   * ===========================================================================
   * 11. VERIFY PRODUCT STOCK AFTER WRITE-OFF
   * ===========================================================================
   */

  console.log("11. VERIFY PRODUCT STOCK AFTER WRITE-OFF");
  console.log("------------------------------------------------------------------------------");

  const afterWriteoff =
    await prisma.product.findUnique({
      where: {
        id: createdProductId,
      },
    });

  assert(
    afterWriteoff !== null,
    "Product must exist after write-off"
  );

  assert(
    afterWriteoff.stock === 3,
    `Product.stock after write-off must be 3, got ${afterWriteoff.stock}`
  );

  const batchSumAfterWriteoff =
    await prisma.batch.aggregate({
      where: {
        productId: createdProductId,
      },
      _sum: {
        quantity: true,
      },
    });

  const expectedStockAfterWriteoff =
    batchSumAfterWriteoff._sum.quantity ?? 0;

  assert(
    afterWriteoff.stock === expectedStockAfterWriteoff,
    `Product.stock=${afterWriteoff.stock} must equal SUM(Batch.quantity)=${expectedStockAfterWriteoff}`
  );

  console.log(
    `Product.stock=${afterWriteoff.stock}`
  );

  console.log(
    `SUM(Batch.quantity)=${expectedStockAfterWriteoff}`
  );

  console.log(
    "🟢 Product.stock remained synchronized after write-off"
  );

  console.log("");

  /*
   * ===========================================================================
   * 12. VERIFY WRITE-OFF MOVEMENT
   * ===========================================================================
   */

  console.log("12. VERIFY WRITE-OFF MOVEMENT");
  console.log("------------------------------------------------------------------------------");

  const writeoffMovements =
    await prisma.movement.findMany({
      where: {
        productId: createdProductId,
        type: "WRITE_OFF",
      },
      orderBy: {
        id: "desc",
      },
    });

  assert(
    writeoffMovements.length === 1,
    `Expected exactly 1 WRITE_OFF movement, got ${writeoffMovements.length}`
  );

  const writeoffMovement =
    writeoffMovements[0];

  assert(
    writeoffMovement.quantity === -2,
    `WRITE_OFF movement quantity must be -2, got ${writeoffMovement.quantity}`
  );

  assert(
    writeoffMovement.productId === createdProductId,
    "WRITE_OFF movement must belong to test product"
  );

  assert(
    writeoffMovement.comment?.includes(
      `Партия №${createdBatchId}`
    ) ?? false,
    "WRITE_OFF movement must reference the correct batch"
  );

  console.log(
    `Movement #${writeoffMovement.id}`
  );

  console.log(
    `type=${writeoffMovement.type}`
  );

  console.log(
    `quantity=${writeoffMovement.quantity}`
  );

  console.log(
    `comment=${writeoffMovement.comment ?? "null"}`
  );

  console.log(
    "🟢 WRITE_OFF movement is correct"
  );

  console.log("");

  /*
   * ===========================================================================
   * 13. FINAL STOCK INTEGRITY CHECK
   * ===========================================================================
   */

  console.log("13. FINAL STOCK INTEGRITY CHECK");
  console.log("------------------------------------------------------------------------------");

  const finalProduct =
    await prisma.product.findUnique({
      where: {
        id: createdProductId,
      },
    });

  assert(
    finalProduct !== null,
    "Final product must exist"
  );

  const finalBatchAggregate =
    await prisma.batch.aggregate({
      where: {
        productId: createdProductId,
      },
      _sum: {
        quantity: true,
      },
    });

  const finalBatchStock =
    finalBatchAggregate._sum.quantity ?? 0;

  assert(
    finalProduct.stock === finalBatchStock,
    `FINAL INTEGRITY FAILURE: Product.stock=${finalProduct.stock}, SUM(Batch.quantity)=${finalBatchStock}`
  );

  assert(
    finalProduct.stock === 3,
    `Final Product.stock must be 3, got ${finalProduct.stock}`
  );

  console.log(
    `Product.stock=${finalProduct.stock}`
  );

  console.log(
    `SUM(Batch.quantity)=${finalBatchStock}`
  );

  console.log(
    "🟢 FINAL STOCK INVARIANT PASSED"
  );

  console.log("");

  /*
   * ===========================================================================
   * 14. VERIFY NO SECOND BATCH WAS CREATED
   * ===========================================================================
   */

  console.log("14. VERIFY BATCH COUNT");
  console.log("------------------------------------------------------------------------------");

  const finalBatches =
    await prisma.batch.findMany({
      where: {
        productId: createdProductId,
      },
    });

  assert(
    finalBatches.length === 1,
    `Expected exactly 1 test batch, got ${finalBatches.length}`
  );

  assert(
    finalBatches[0].quantity === 3,
    `The only test batch must contain 3 units, got ${finalBatches[0].quantity}`
  );

  console.log(
    `Batch count=${finalBatches.length}`
  );

  console.log(
    `Batch #${finalBatches[0].id} quantity=${finalBatches[0].quantity}`
  );

  console.log(
    "🟢 Batch structure is correct"
  );

  console.log("");

  /*
   * ===========================================================================
   * 15. FINAL MOVEMENT CHECK
   * ===========================================================================
   */

  console.log("15. FINAL MOVEMENT CHECK");
  console.log("------------------------------------------------------------------------------");

  const finalMovements =
    await prisma.movement.findMany({
      where: {
        productId: createdProductId,
      },
      orderBy: {
        id: "asc",
      },
    });

  assert(
    finalMovements.length === 2,
    `Expected exactly 2 movements (SUPPLY + WRITE_OFF), got ${finalMovements.length}`
  );

  const movementTypes =
    finalMovements.map(
      (movement) => movement.type
    );

  assert(
    movementTypes.includes("SUPPLY"),
    "SUPPLY movement must exist"
  );

  assert(
    movementTypes.includes("WRITE_OFF"),
    "WRITE_OFF movement must exist"
  );

  const movementSum =
    finalMovements.reduce(
      (sum, movement) =>
        sum + movement.quantity,
      0
    );

  assert(
    movementSum === 3,
    `Movement net quantity must be +3, got ${movementSum}`
  );

  console.log(
    `Movement count=${finalMovements.length}`
  );

  console.log(
    `Net movement quantity=${movementSum}`
  );

  console.log(
    "🟢 Movement history is consistent"
  );

  console.log("");

  /*
   * ===========================================================================
   * 16. SUCCESS
   * ===========================================================================
   */

  console.log("==============================================================================");
  console.log("V40 FINAL RESULT");
  console.log("==============================================================================");
  console.log("");

  console.log("🟢 V40 PASSED");
  console.log("");

  console.log("Verified:");
  console.log("🟢 New Product.stock starts at 0");
  console.log("🟢 Product without batches has stock 0");
  console.log("🟢 Manual Product.stock injection is rejected");
  console.log("🟢 Supply creates Batch");
  console.log("🟢 Supply increases Product.stock");
  console.log("🟢 Product.stock = SUM(Batch.quantity)");
  console.log("🟢 SUPPLY Movement is created");
  console.log("🟢 Partial write-off decreases Batch.quantity");
  console.log("🟢 Partial write-off decreases Product.stock");
  console.log("🟢 WRITE_OFF Movement is created");
  console.log("🟢 Movement history is consistent");
  console.log("🟢 Final stock invariant passed");
  console.log("");

  console.log("==============================================================================");
  console.log("NO PRODUCTION DATA SHOULD REMAIN AFTER CLEANUP");
  console.log("==============================================================================");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("==============================================================================");
    console.error("🔴 V40 FAILED");
    console.error("==============================================================================");
    console.error("");

    console.error(error);

    console.error("");
    console.error(
      "The failure above identifies the first violated V40 invariant."
    );
    console.error("");
    console.error("==============================================================================");

    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });