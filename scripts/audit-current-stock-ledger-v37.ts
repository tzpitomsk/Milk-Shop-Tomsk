import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type MovementType = "SUPPLY" | "SALE" | "RETURN" | "WRITE_OFF";

const KNOWN_MOVEMENT_TYPES = new Set<MovementType>([
  "SUPPLY",
  "SALE",
  "RETURN",
  "WRITE_OFF",
]);

function section(title: string): void {
  console.log("");
  console.log("==============================================================================");
  console.log(title);
  console.log("==============================================================================");
  console.log("");
}

async function main(): Promise<void> {
  section("V37 — CURRENT STOCK / HISTORICAL LEDGER AUDIT");

  console.log("STRICT READ ONLY");
  console.log("DATABASE WILL NOT BE MODIFIED");
  console.log("");

  let critical = 0;
  let warnings = 0;

  // ===========================================================================
  // 1. LOAD PRODUCTS
  // ===========================================================================

  section("1. LOADING PRODUCTS");

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
      movements: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  console.log(`Products found=${products.length}`);

  // ===========================================================================
  // 2. GLOBAL COUNTS
  // ===========================================================================

  section("2. GLOBAL COUNTS");

  const totalBatches = products.reduce(
    (sum, product) => sum + product.batches.length,
    0
  );

  const totalMovements = products.reduce(
    (sum, product) => sum + product.movements.length,
    0
  );

  console.log(`Products=${products.length}`);
  console.log(`Batches=${totalBatches}`);
  console.log(`Movements=${totalMovements}`);

  // ===========================================================================
  // 3. CURRENT STOCK VS CURRENT BATCHES
  // ===========================================================================

  section("3. CURRENT STOCK VS CURRENT BATCHES");

  let globalProductStock = 0;
  let globalBatchStock = 0;

  for (const product of products) {
    const batchSum = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    globalProductStock += product.stock;
    globalBatchStock += batchSum;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `Product.stock=${product.stock} | ` +
        `SUM(Batch.quantity)=${batchSum}`
    );

    if (product.stock !== batchSum) {
      critical++;

      console.log(
        "  🔴 CRITICAL: Product.stock does not match SUM(Batch.quantity)"
      );
    }
  }

  console.log("");

  if (globalProductStock === globalBatchStock) {
    console.log(
      "🟢 Global Product.stock matches global SUM(Batch.quantity)"
    );
  } else {
    critical++;

    console.log(
      `🔴 GLOBAL MISMATCH: Product.stock=${globalProductStock}, ` +
        `Batch sum=${globalBatchStock}`
    );
  }

  // ===========================================================================
  // 4. BATCH QUANTITY SANITY
  // ===========================================================================

  section("4. BATCH QUANTITY SANITY");

  let negativeBatchCount = 0;

  for (const product of products) {
    for (const batch of product.batches) {
      if (batch.quantity < 0) {
        negativeBatchCount++;

        critical++;

        console.log(
          `🔴 Product #${product.id} "${product.name}" | ` +
            `Batch #${batch.id} | quantity=${batch.quantity}`
        );
      }
    }
  }

  if (negativeBatchCount === 0) {
    console.log("🟢 No Batch has negative quantity");
  }

  // ===========================================================================
  // 5. MOVEMENT TYPE / SIGN AUDIT
  // ===========================================================================

  section("5. MOVEMENT TYPE / SIGN AUDIT");

  let unknownMovementTypes = 0;
  let wrongMovementSigns = 0;

  for (const product of products) {
    for (const movement of product.movements) {
      const type = movement.type as MovementType;

      if (!KNOWN_MOVEMENT_TYPES.has(type)) {
        unknownMovementTypes++;

        critical++;

        console.log(
          `🔴 UNKNOWN Movement type | ` +
            `Movement #${movement.id} | ` +
            `Product #${product.id} | ` +
            `type=${movement.type} | ` +
            `quantity=${movement.quantity}`
        );

        continue;
      }

      const shouldBePositive =
        type === "SUPPLY" || type === "RETURN";

      const shouldBeNegative =
        type === "SALE" || type === "WRITE_OFF";

      if (shouldBePositive && movement.quantity <= 0) {
        wrongMovementSigns++;

        critical++;

        console.log(
          `🔴 WRONG SIGN | Movement #${movement.id} | ` +
            `Product #${product.id} | ` +
            `type=${movement.type} | ` +
            `quantity=${movement.quantity}`
        );
      }

      if (shouldBeNegative && movement.quantity >= 0) {
        wrongMovementSigns++;

        critical++;

        console.log(
          `🔴 WRONG SIGN | Movement #${movement.id} | ` +
            `Product #${product.id} | ` +
            `type=${movement.type} | ` +
            `quantity=${movement.quantity}`
        );
      }
    }
  }

  if (unknownMovementTypes === 0) {
    console.log("🟢 All Movement types are known");
  }

  if (wrongMovementSigns === 0) {
    console.log("🟢 All Movement signs are correct");
  }

  // ===========================================================================
  // 6. MOVEMENT LEDGER BY PRODUCT
  // ===========================================================================

  section("6. HISTORICAL MOVEMENT LEDGER");

  let globalMovementNet = 0;

  for (const product of products) {
    let supply = 0;
    let sale = 0;
    let returned = 0;
    let writeOff = 0;

    for (const movement of product.movements) {
      switch (movement.type) {
        case "SUPPLY":
          supply += movement.quantity;
          break;

        case "SALE":
          sale += movement.quantity;
          break;

        case "RETURN":
          returned += movement.quantity;
          break;

        case "WRITE_OFF":
          writeOff += movement.quantity;
          break;
      }
    }

    const movementNet =
      supply +
      sale +
      returned +
      writeOff;

    globalMovementNet += movementNet;

    console.log(
      `Product #${product.id} "${product.name}"`
    );

    console.log(
      `  SUPPLY=${supply}`
    );

    console.log(
      `  SALE=${sale}`
    );

    console.log(
      `  RETURN=${returned}`
    );

    console.log(
      `  WRITE_OFF=${writeOff}`
    );

    console.log(
      `  HISTORICAL MOVEMENT NET=${movementNet}`
    );

    console.log(
      `  CURRENT Product.stock=${product.stock}`
    );

    console.log("");
  }

  // ===========================================================================
  // 7. IMPLIED OPENING BALANCE
  // ===========================================================================

  section("7. IMPLIED HISTORICAL OPENING BALANCE");

  console.log(
    "IMPORTANT:"
  );

  console.log(
    "Historical Movement NET is not expected to equal current Product.stock."
  );

  console.log(
    "The difference represents the stock balance that existed before the"
  );

  console.log(
    "recorded Movement history began, plus any historical ledger gaps."
  );

  console.log("");

  let globalImpliedOpeningBalance = 0;

  for (const product of products) {
    let movementNet = 0;

    for (const movement of product.movements) {
      movementNet += movement.quantity;
    }

    const impliedOpeningBalance =
      product.stock - movementNet;

    globalImpliedOpeningBalance += impliedOpeningBalance;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `Current stock=${product.stock} | ` +
        `Movement NET=${movementNet} | ` +
        `Implied opening balance=${impliedOpeningBalance}`
    );
  }

  console.log("");

  console.log(
    `GLOBAL current stock=${globalProductStock}`
  );

  console.log(
    `GLOBAL historical Movement NET=${globalMovementNet}`
  );

  console.log(
    `GLOBAL implied opening balance=${globalImpliedOpeningBalance}`
  );

  const reconstructedGlobalStock =
    globalMovementNet +
    globalImpliedOpeningBalance;

  if (reconstructedGlobalStock !== globalProductStock) {
    critical++;

    console.log(
      `🔴 Internal arithmetic reconstruction failed: ` +
        `${globalMovementNet} + ${globalImpliedOpeningBalance} ` +
        `!= ${globalProductStock}`
    );
  } else {
    console.log(
      "🟢 Historical ledger + implied opening balance reconstructs current stock"
    );
  }

  // ===========================================================================
  // 8. CURRENT POSITIVE STOCK
  // ===========================================================================

  section("8. CURRENT POSITIVE STOCK");

  let positiveBatchCount = 0;
  let positiveBatchQuantity = 0;

  for (const product of products) {
    for (const batch of product.batches) {
      if (batch.quantity > 0) {
        positiveBatchCount++;
        positiveBatchQuantity += batch.quantity;

        console.log(
          `Product #${product.id} "${product.name}" | ` +
            `Batch #${batch.id} | ` +
            `quantity=${batch.quantity} | ` +
            `status=${batch.status} | ` +
            `received=${batch.receivedAt.toISOString()} | ` +
            `expiry=${batch.expiryDate.toISOString()}`
        );
      }
    }
  }

  console.log("");

  console.log(
    `Positive batches=${positiveBatchCount}`
  );

  console.log(
    `Positive batch quantity=${positiveBatchQuantity}`
  );

  if (positiveBatchQuantity !== globalProductStock) {
    critical++;

    console.log(
      `🔴 Positive batch quantity ${positiveBatchQuantity} ` +
        `does not equal Product stock ${globalProductStock}`
    );
  } else {
    console.log(
      "🟢 Positive Batch quantity equals total Product.stock"
    );
  }

  // ===========================================================================
  // 9. EMPTY BATCH SANITY
  // ===========================================================================

  section("9. EMPTY BATCH SANITY");

  let emptyQuantityProblems = 0;

  for (const product of products) {
    for (const batch of product.batches) {
      if (batch.quantity === 0 && batch.status !== "EMPTY") {
        emptyQuantityProblems++;

        warnings++;

        console.log(
          `🟠 WARNING: Batch #${batch.id} has quantity=0 ` +
            `but status=${batch.status}`
        );
      }

      if (batch.quantity > 0 && batch.status === "EMPTY") {
        emptyQuantityProblems++;

        critical++;

        console.log(
          `🔴 CRITICAL: Batch #${batch.id} has positive quantity ` +
            `but status=EMPTY`
        );
      }
    }
  }

  if (emptyQuantityProblems === 0) {
    console.log(
      "🟢 Empty/positive Batch status relationships are consistent"
    );
  }

  // ===========================================================================
  // 10. FINAL CURRENT STATE
  // ===========================================================================

  section("10. FINAL CURRENT STATE");

  console.log(
    `Products=${products.length}`
  );

  console.log(
    `Batches=${totalBatches}`
  );

  console.log(
    `Movements=${totalMovements}`
  );

  console.log(
    `Product stock total=${globalProductStock}`
  );

  console.log(
    `Batch quantity total=${globalBatchStock}`
  );

  console.log(
    `Historical Movement NET=${globalMovementNet}`
  );

  console.log(
    `Implied opening balance=${globalImpliedOpeningBalance}`
  );

  console.log("");

  console.log(
    `Critical=${critical}`
  );

  console.log(
    `Warnings=${warnings}`
  );

  // ===========================================================================
  // 11. FINAL RESULT
  // ===========================================================================

  section("V37 FINAL RESULT");

  if (critical === 0) {
    console.log(
      "🟢 V37 CURRENT STOCK AUDIT PASSED"
    );
  } else {
    console.log(
      "🔴 V37 CURRENT STOCK AUDIT FAILED"
    );
  }

  console.log("");

  console.log(
    "Historical Movement NET was NOT compared directly to current Product.stock."
  );

  console.log(
    "Current stock source of truth remains:"
  );

  console.log(
    "Product.stock ↔ SUM(Batch.quantity)"
  );

  console.log("");

  console.log(
    "NO Product changed."
  );

  console.log(
    "NO Product.stock changed."
  );

  console.log(
    "NO Batch changed."
  );

  console.log(
    "NO Movement changed."
  );

  console.log(
    "NO Order changed."
  );

  console.log(
    "NO OrderItem changed."
  );

  console.log(
    "NO OrderBatch changed."
  );

  console.log(
    "NO ReturnBatch changed."
  );

  console.log("");

  console.log(
    "DATABASE WAS NOT MODIFIED."
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 V37 AUDIT FAILED TO EXECUTE");
    console.error("");
    console.error(error);
    console.error("");

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });