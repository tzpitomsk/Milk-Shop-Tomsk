import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";

const TEST_PRODUCT_NAME = "V38_WRITE_OFF_TEST";
const TEST_REASON = "V38 тестовое списание";

type ApiResponse = {
  status: number;
  body: any;
};

async function apiPost(
  path: string,
  body: unknown
): Promise<ApiResponse> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let parsed: any = null;

  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  return {
    status: response.status,
    body: parsed,
  };
}

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function cleanup() {
  const products = await prisma.product.findMany({
    where: {
      name: TEST_PRODUCT_NAME,
    },
    select: {
      id: true,
    },
  });

  for (const product of products) {
    await prisma.$transaction(async (tx) => {
      await tx.movement.deleteMany({
        where: {
          productId: product.id,
        },
      });


      await tx.batch.deleteMany({
        where: {
          productId: product.id,
        },
      });

      await tx.product.delete({
        where: {
          id: product.id,
        },
      });
    });


  }
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("V38 BATCH WRITE-OFF INTEGRATION TEST");
  console.log("==============================================================================");
  console.log("");

  // ===========================================================================
  // 0. CLEAN OLD TEST DATA
  // ===========================================================================

  console.log("0. CLEANING OLD V38 TEST DATA");
  console.log("------------------------------------------------------------------------------");

  await cleanup();

  console.log("🟢 Old V38 test data removed");
  console.log("");

  // ===========================================================================
  // 1. CREATE ISOLATED TEST PRODUCT
  // ===========================================================================

  console.log("1. CREATING ISOLATED TEST DATA");
  console.log("------------------------------------------------------------------------------");

  const product = await prisma.product.create({
    data: {
      name: TEST_PRODUCT_NAME,
      unit: "шт",
      price: 200,
      cost: 100,
      stock: 10,
    },
  });

  const futureExpiry = new Date();
  futureExpiry.setDate(futureExpiry.getDate() + 10);

  const futureBatch = await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 10,
      purchaseCost: 100,
      receivedAt: new Date(),
      expiryDate: futureExpiry,
      status: "ACTIVE",
    },
  });

  const movementCountBefore =
    await prisma.movement.count({
      where: {
        productId: product.id,
      },
    });

  assert(
    movementCountBefore === 0,
    "Test product must start without movements"
  );

  console.log(
    `Product #${product.id} created`
  );

  console.log(
    `Batch #${futureBatch.id} created with quantity=10`
  );

  console.log("");

  // ===========================================================================
  // 2. FIRST PARTIAL WRITE-OFF
  // ===========================================================================

  console.log("2. PARTIAL WRITE-OFF: 10 → 7");
  console.log("------------------------------------------------------------------------------");

  const firstWriteOff = await apiPost(
    `/api/batches/${futureBatch.id}/writeoff`,
    {
      quantity: 3,
      reason: TEST_REASON,
    }
  );

  console.log(
    `HTTP ${firstWriteOff.status}`
  );

  assert(
    firstWriteOff.status === 200,
    `Expected 200, received ${firstWriteOff.status}`
  );

  assert(
    firstWriteOff.body?.success === true,
    "Successful write-off must return success=true"
  );

  const batchAfterFirst =
    await prisma.batch.findUnique({
      where: {
        id: futureBatch.id,
      },
    });

  assert(
    batchAfterFirst !== null,
    "Batch must still exist after write-off"
  );

  assert(
    batchAfterFirst.quantity === 7,
    `Expected batch quantity 7, received ${batchAfterFirst.quantity}`
  );

  assert(
    batchAfterFirst.status === "ACTIVE",
    `Expected ACTIVE status, received ${batchAfterFirst.status}`
  );

  const productAfterFirst =
    await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

  assert(
    productAfterFirst !== null,
    "Product must still exist"
  );

  assert(
    productAfterFirst.stock === 7,
    `Expected product stock 7, received ${productAfterFirst.stock}`
  );

  const firstMovements =
    await prisma.movement.findMany({
      where: {
        productId: product.id,
        type: "WRITE_OFF",
      },
      orderBy: {
        id: "asc",
      },
    });

  assert(
    firstMovements.length === 1,
    `Expected exactly 1 WRITE_OFF movement, received ${firstMovements.length}`
  );

  assert(
    firstMovements[0].quantity === -3,
    `Expected movement -3, received ${firstMovements[0].quantity}`
  );

  assert(
    firstMovements[0].comment ===
    `${TEST_REASON}. Партия №${futureBatch.id}`,
    "WRITE_OFF comment is incorrect"
  );

  console.log("🟢 Partial write-off passed");
  console.log("");

  // ===========================================================================
  // 3. WRITE-OFF REMAINING QUANTITY
  // ===========================================================================

  console.log("3. FINAL WRITE-OFF: 7 → 0");
  console.log("------------------------------------------------------------------------------");

  const secondWriteOff = await apiPost(
    `/api/batches/${futureBatch.id}/writeoff`,
    {
      quantity: 7,
      reason: "V38 полное списание",
    }
  );

  console.log(
    `HTTP ${secondWriteOff.status}`
  );

  assert(
    secondWriteOff.status === 200,
    `Expected 200, received ${secondWriteOff.status}`
  );

  const batchAfterSecond =
    await prisma.batch.findUnique({
      where: {
        id: futureBatch.id,
      },
    });

  assert(
    batchAfterSecond !== null,
    "Batch must still exist after final write-off"
  );

  assert(
    batchAfterSecond.quantity === 0,
    `Expected batch quantity 0, received ${batchAfterSecond.quantity}`
  );

  assert(
    batchAfterSecond.status === "EMPTY",
    `Expected EMPTY status, received ${batchAfterSecond.status}`
  );

  const productAfterSecond =
    await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

  assert(
    productAfterSecond !== null,
    "Product must still exist"
  );

  assert(
    productAfterSecond.stock === 0,
    `Expected product stock 0, received ${productAfterSecond.stock}`
  );

  const allWriteOffs =
    await prisma.movement.findMany({
      where: {
        productId: product.id,
        type: "WRITE_OFF",
      },
      orderBy: {
        id: "asc",
      },
    });

  assert(
    allWriteOffs.length === 2,
    `Expected exactly 2 WRITE_OFF movements, received ${allWriteOffs.length}`
  );

  assert(
    allWriteOffs[0].quantity === -3,
    "First WRITE_OFF must be -3"
  );

  assert(
    allWriteOffs[1].quantity === -7,
    "Second WRITE_OFF must be -7"
  );

  console.log("🟢 Full write-off passed");
  console.log("");

  // ===========================================================================
  // 4. CANNOT WRITE OFF EMPTY BATCH
  // ===========================================================================

  console.log("4. EMPTY BATCH PROTECTION");
  console.log("------------------------------------------------------------------------------");

  const emptyWriteOff = await apiPost(
    `/api/batches/${futureBatch.id}/writeoff`,
    {
      quantity: 1,
      reason: TEST_REASON,
    }
  );

  console.log(
    `HTTP ${emptyWriteOff.status}`
  );

  assert(
    emptyWriteOff.status === 400,
    `Expected 400, received ${emptyWriteOff.status}`
  );

  const batchAfterEmptyAttempt =
    await prisma.batch.findUnique({
      where: {
        id: futureBatch.id,
      },
    });

  assert(
    batchAfterEmptyAttempt !== null,
    "Batch must exist after rejected empty write-off"
  );

  assert(
    batchAfterEmptyAttempt.quantity === 0,
    "Rejected empty write-off must not change quantity"
  );

  const movementsAfterEmptyAttempt =
    await prisma.movement.count({
      where: {
        productId: product.id,
        type: "WRITE_OFF",
      },
    });

  assert(
    movementsAfterEmptyAttempt === 2,
    "Rejected empty write-off must not create a movement"
  );

  console.log("🟢 Empty batch protection passed");
  console.log("");

  // ===========================================================================
  // 5. CREATE SECOND BATCH FOR VALIDATION TESTS
  // ===========================================================================

  console.log("5. CREATING SECOND TEST BATCH");
  console.log("------------------------------------------------------------------------------");

  const secondExpiry = new Date();
  secondExpiry.setDate(secondExpiry.getDate() + 20);

  const secondBatch = await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 5,
      purchaseCost: 110,
      receivedAt: new Date(),
      expiryDate: secondExpiry,
      status: "ACTIVE",
    },
  });

  await prisma.product.update({
    where: {
      id: product.id,
    },
    data: {
      stock: 5,
    },
  });

  console.log(
    `Batch #${secondBatch.id} created with quantity=5`
  );

  console.log("");

  // ===========================================================================
  // 6. CANNOT WRITE OFF MORE THAN AVAILABLE
  // ===========================================================================

  console.log("6. OVER-WRITE-OFF PROTECTION");
  console.log("------------------------------------------------------------------------------");

  const tooMuch = await apiPost(
    `/api/batches/${secondBatch.id}/writeoff`,
    {
      quantity: 6,
      reason: TEST_REASON,
    }
  );

  console.log(`HTTP ${tooMuch.status}`);

  assert(
    tooMuch.status === 400,
    `Expected 400, received ${tooMuch.status}`
  );

  const batchAfterTooMuch =
    await prisma.batch.findUnique({
      where: {
        id: secondBatch.id,
      },
    });

  assert(
    batchAfterTooMuch !== null,
    "Second batch must exist"
  );

  assert(
    batchAfterTooMuch.quantity === 5,
    "Over-write-off must not change quantity"
  );

  console.log("🟢 Over-write-off protection passed");
  console.log("");

  // ===========================================================================
  // 7. INVALID QUANTITIES
  // ===========================================================================

  console.log("7. INVALID QUANTITY VALIDATION");
  console.log("------------------------------------------------------------------------------");

  const invalidQuantities = [
    {
      name: "zero",
      value: 0,
    },
    {
      name: "negative",
      value: -1,
    },
    {
      name: "fractional",
      value: 1.5,
    },
    {
      name: "string",
      value: "2",
    },
    {
      name: "null",
      value: null,
    },
  ];

  for (const test of invalidQuantities) {
    const response = await apiPost(
      `/api/batches/${secondBatch.id}/writeoff`,
      {
        quantity: test.value,
        reason: TEST_REASON,
      }
    );


    console.log(
      `${test.name}: HTTP ${response.status}`
    );

    assert(
      response.status === 400,
      `Invalid quantity "${test.name}" must return 400`
    );


  }

  const batchAfterInvalidQuantities =
    await prisma.batch.findUnique({
      where: {
        id: secondBatch.id,
      },
    });

  assert(
    batchAfterInvalidQuantities !== null,
    "Second batch must exist"
  );

  assert(
    batchAfterInvalidQuantities.quantity === 5,
    "Invalid quantities must not change batch quantity"
  );

  console.log("🟢 Invalid quantity validation passed");
  console.log("");

  // ===========================================================================
  // 8. INVALID BATCH ID
  // ===========================================================================

  console.log("8. NON-EXISTENT BATCH");
  console.log("------------------------------------------------------------------------------");

  const nonexistent = await apiPost(
    "/api/batches/999999999/writeoff",
    {
      quantity: 1,
      reason: TEST_REASON,
    }
  );

  console.log(
    `HTTP ${nonexistent.status}`
  );

  assert(
    nonexistent.status === 404,
    `Expected 404, received ${nonexistent.status}`
  );

  console.log("🟢 Non-existent batch protection passed");
  console.log("");

  // ===========================================================================
  // 9. EXPIRED BATCH PARTIAL WRITE-OFF
  // ===========================================================================

  console.log("9. EXPIRED BATCH STATUS");
  console.log("------------------------------------------------------------------------------");

  const pastExpiry = new Date();
  pastExpiry.setDate(pastExpiry.getDate() - 5);

  const expiredBatch = await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 4,
      purchaseCost: 90,
      receivedAt: new Date(
        pastExpiry.getTime() - 24 * 60 * 60 * 1000
      ),
      expiryDate: pastExpiry,
      status: "EXPIRED",
    },
  });

  await prisma.product.update({
    where: {
      id: product.id,
    },
    data: {
      stock: 9,
    },
  });

  const expiredWriteOff = await apiPost(
    `/api/batches/${expiredBatch.id}/writeoff`,
    {
      quantity: 1,
      reason: "V38 списание просроченной партии",
    }
  );

  console.log(
    `HTTP ${expiredWriteOff.status}`
  );

  assert(
    expiredWriteOff.status === 200,
    `Expected 200, received ${expiredWriteOff.status}`
  );

  const expiredAfter =
    await prisma.batch.findUnique({
      where: {
        id: expiredBatch.id,
      },
    });

  assert(
    expiredAfter !== null,
    "Expired batch must exist"
  );

  assert(
    expiredAfter.quantity === 3,
    `Expected expired batch quantity 3, received ${expiredAfter.quantity}`
  );

  assert(
    expiredAfter.status === "EXPIRED",
    `Expected EXPIRED status, received ${expiredAfter.status}`
  );

  console.log(
    "🟢 Partial write-off preserved EXPIRED status"
  );

  // ---------------------------------------------------------------------------
  // Write off remaining expired quantity
  // ---------------------------------------------------------------------------

  const expiredFinalWriteOff = await apiPost(
    `/api/batches/${expiredBatch.id}/writeoff`,
    {
      quantity: 3,
      reason: "V38 полное списание просроченной партии",
    }
  );

  assert(
    expiredFinalWriteOff.status === 200,
    `Expected 200, received ${expiredFinalWriteOff.status}`
  );

  const expiredFinal =
    await prisma.batch.findUnique({
      where: {
        id: expiredBatch.id,
      },
    });

  assert(
    expiredFinal !== null,
    "Expired batch must exist after final write-off"
  );

  assert(
    expiredFinal.quantity === 0,
    "Expired batch final quantity must be 0"
  );

  assert(
    expiredFinal.status === "EMPTY",
    "Expired batch with zero quantity must become EMPTY"
  );

  console.log(
    "🟢 Final expired-batch write-off passed"
  );

  console.log("");

  // ===========================================================================
  // 10. GLOBAL STOCK INTEGRITY
  // ===========================================================================

  console.log("10. STOCK INTEGRITY");
  console.log("------------------------------------------------------------------------------");

  const batches =
    await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
    });

  const batchStock = batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  const currentProduct =
    await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

  assert(
    currentProduct !== null,
    "Test product must exist"
  );

  assert(
    currentProduct.stock === batchStock,
    `Product.stock ${currentProduct.stock} must equal batch sum ${batchStock}`
  );

  console.log(
    `Product.stock=${currentProduct.stock}`
  );

  console.log(
    `SUM(Batch.quantity)=${batchStock}`
  );

  console.log("🟢 Product stock integrity passed");
  console.log("");

  // ===========================================================================
  // 11. MOVEMENT INTEGRITY
  // ===========================================================================

  console.log("11. MOVEMENT INTEGRITY");
  console.log("------------------------------------------------------------------------------");

  const movements =
    await prisma.movement.findMany({
      where: {
        productId: product.id,
        type: "WRITE_OFF",
      },
      orderBy: {
        id: "asc",
      },
    });

  const totalWrittenOff =
    movements.reduce(
      (sum, movement) =>
        sum + Math.abs(movement.quantity),
      0
    );

  assert(
    movements.length === 4,
    `Expected 4 WRITE_OFF movements, received ${movements.length}`
  );

  assert(
    totalWrittenOff === 14,
    `Expected total written off 14, received ${totalWrittenOff}`
  );

  for (const movement of movements) {
    assert(
      movement.quantity < 0,
      `WRITE_OFF movement #${movement.id} must have negative quantity`
    );


    assert(
      movement.comment?.includes("Партия №") ?? false,
      `WRITE_OFF movement #${movement.id} must contain batch number`
    );


  }

  console.log(
    `WRITE_OFF movements=${movements.length}`
  );

  console.log(
    `Total written off=${totalWrittenOff}`
  );

  console.log("🟢 Movement integrity passed");
  console.log("");

  // ===========================================================================
  // 12. FINAL RESULT
  // ===========================================================================

  console.log("==============================================================================");
  console.log("V38 RESULT");
  console.log("==============================================================================");
  console.log("");

  console.log("🟢 V38 PASSED");

  console.log("");
  console.log("Verified:");
  console.log("✔ Partial write-off decreases Batch.quantity");
  console.log("✔ Product.stock is recalculated");
  console.log("✔ WRITE_OFF movement is created");
  console.log("✔ WRITE_OFF quantity is negative");
  console.log("✔ Write-off reason is stored");
  console.log("✔ Full write-off changes Batch.status to EMPTY");
  console.log("✔ Empty batch cannot be written off");
  console.log("✔ Cannot write off more than available quantity");
  console.log("✔ Zero quantity is rejected");
  console.log("✔ Negative quantity is rejected");
  console.log("✔ Fractional quantity is rejected");
  console.log("✔ String quantity is rejected");
  console.log("✔ Null quantity is rejected");
  console.log("✔ Non-existent Batch returns 404");
  console.log("✔ Expired batch remains EXPIRED after partial write-off");
  console.log("✔ Expired batch becomes EMPTY when fully written off");
  console.log("✔ Product.stock == SUM(Batch.quantity)");
  console.log("✔ Invalid requests do not create WRITE_OFF movements");
  console.log("");

  // ===========================================================================
  // 13. CLEANUP
  // ===========================================================================

  console.log("13. CLEANUP");
  console.log("------------------------------------------------------------------------------");

  await cleanup();

  const remainingProducts =
    await prisma.product.count({
      where: {
        name: TEST_PRODUCT_NAME,
      },
    });

  assert(
    remainingProducts === 0,
    "V38 test product must be completely removed"
  );

  console.log("🟢 Test data removed");
  console.log("");

  console.log("==============================================================================");
  console.log("V38 COMPLETED");
  console.log("==============================================================================");
  console.log("");
  console.log("DATABASE WAS RESTORED TO ITS PRE-TEST STATE.");
  console.log("");
}

main()
  .catch(async (error) => {
    console.error("");
    console.error("🔴 V38 FAILED");
    console.error(error);
    console.error("");


    try {
      await cleanup();
      console.log("🟢 Cleanup after failure completed");
    } catch (cleanupError) {
      console.error("🔴 Cleanup after failure failed");
      console.error(cleanupError);
    }

    process.exitCode = 1;


  })
  .finally(async () => {
    await prisma.$disconnect();
  });