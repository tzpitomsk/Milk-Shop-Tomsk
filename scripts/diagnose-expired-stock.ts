import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function formatDate(date: Date) {
  return date.toISOString();
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("EXPIRED STOCK — DIAGNOSTIC");
  console.log("STRICT READ ONLY / DRY-RUN");
  console.log("==============================================================================");
  console.log("");

  const now = new Date();

  console.log(`Current time=${formatDate(now)}`);
  console.log("");

  // ===========================================================================
  // 1. LOAD ALL PRODUCTS
  // ===========================================================================

  console.log("1. PRODUCTS");
  console.log("------------------------------------------------------------------------------");

  const products = await prisma.product.findMany({
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(`Products found=${products.length}`);
  console.log("");

  if (products.length === 0) {
    console.log("No products found.");
    console.log("");
    return;
  }

  // ===========================================================================
  // 2. PRODUCT STOCK CONSISTENCY
  // ===========================================================================

  console.log("2. PRODUCT STOCK CONSISTENCY");
  console.log("------------------------------------------------------------------------------");

  let stockConsistencyProblems = 0;

  for (const product of products) {
    const batchTotal = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const sellableTotal = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.receivedAt <= now &&
          batch.expiryDate >= now
      )
      .reduce((sum, batch) => sum + batch.quantity, 0);

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `Product.stock=${product.stock} | ` +
        `SUM(Batch.quantity)=${batchTotal} | ` +
        `sellable=${sellableTotal}`
    );

    if (product.stock !== batchTotal) {
      stockConsistencyProblems++;

      console.log(
        `  🔴 CRITICAL: Product.stock=${product.stock} ` +
          `but SUM(Batch.quantity)=${batchTotal}`
      );
    } else {
      console.log("  🟢 Stock consistency passed");
    }
  }

  console.log("");

  // ===========================================================================
  // 3. EXPIRED POSITIVE BATCHES
  // ===========================================================================

  console.log("3. EXPIRED BATCHES WITH POSITIVE QUANTITY");
  console.log("------------------------------------------------------------------------------");

  const expiredPositiveBatches = products.flatMap((product) =>
    product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.expiryDate < now
      )
      .map((batch) => ({
        product,
        batch,
      }))
  );

  if (expiredPositiveBatches.length === 0) {
    console.log("🟢 No expired batches with positive quantity.");
    console.log("");
  } else {
    console.log(
      `🔴 FOUND ${expiredPositiveBatches.length} EXPIRED POSITIVE BATCH(ES)`
    );
    console.log("");

    for (const { product, batch } of expiredPositiveBatches) {
      console.log(
        `Product #${product.id} "${product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `status=${batch.status} | ` +
          `purchaseCost=${batch.purchaseCost} | ` +
          `received=${formatDate(batch.receivedAt)} | ` +
          `expiry=${formatDate(batch.expiryDate)}`
      );

      if (batch.status !== "EXPIRED") {
        console.log(
          `  🟡 WARNING: expiryDate is past but status="${batch.status}"`
        );
      }

      console.log("");
    }
  }

  // ===========================================================================
  // 4. EXPIRED BATCHES BY PRODUCT
  // ===========================================================================

  console.log("4. EXPIRED STOCK SUMMARY BY PRODUCT");
  console.log("------------------------------------------------------------------------------");

  for (const product of products) {
    const expiredQuantity = product.batches
      .filter((batch) => batch.expiryDate < now && batch.quantity > 0)
      .reduce((sum, batch) => sum + batch.quantity, 0);

    const expiredBatchCount = product.batches.filter(
      (batch) =>
        batch.expiryDate < now &&
        batch.quantity > 0
    ).length;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `expiredPositiveBatches=${expiredBatchCount} | ` +
        `expiredQuantity=${expiredQuantity}`
    );
  }

  console.log("");

  // ===========================================================================
  // 5. POSITIVE BATCHES WITH NON-ACTIVE STATUS
  // ===========================================================================

  console.log("5. POSITIVE BATCHES WITH NON-ACTIVE STATUS");
  console.log("------------------------------------------------------------------------------");

  const positiveNonActive = products.flatMap((product) =>
    product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status !== "ACTIVE"
      )
      .map((batch) => ({
        product,
        batch,
      }))
  );

  if (positiveNonActive.length === 0) {
    console.log("🟢 No positive batches with non-ACTIVE status.");
  } else {
    console.log(
      `Found ${positiveNonActive.length} positive non-ACTIVE batch(es).`
    );
    console.log("");

    for (const { product, batch } of positiveNonActive) {
      console.log(
        `Product #${product.id} "${product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `status=${batch.status} | ` +
          `expiry=${formatDate(batch.expiryDate)}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 6. FUTURE-DATED POSITIVE BATCHES
  // ===========================================================================

  console.log("6. FUTURE-DATED POSITIVE BATCHES");
  console.log("------------------------------------------------------------------------------");

  const futurePositive = products.flatMap((product) =>
    product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.receivedAt > now
      )
      .map((batch) => ({
        product,
        batch,
      }))
  );

  if (futurePositive.length === 0) {
    console.log("🟢 No positive batches received in the future.");
  } else {
    console.log(
      `🟡 WARNING: ${futurePositive.length} future-dated positive batch(es)`
    );
    console.log("");

    for (const { product, batch } of futurePositive) {
      console.log(
        `Product #${product.id} "${product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `received=${formatDate(batch.receivedAt)} | ` +
          `expiry=${formatDate(batch.expiryDate)}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 7. EXPIRED BATCHES WITH STATUS ACTIVE
  // ===========================================================================

  console.log("7. EXPIRED DATE + ACTIVE STATUS");
  console.log("------------------------------------------------------------------------------");

  const expiredButActive = products.flatMap((product) =>
    product.batches
      .filter(
        (batch) =>
          batch.expiryDate < now &&
          batch.status === "ACTIVE"
      )
      .map((batch) => ({
        product,
        batch,
      }))
  );

  if (expiredButActive.length === 0) {
    console.log("🟢 No expired batches incorrectly marked ACTIVE.");
  } else {
    console.log(
      `🟡 WARNING: ${expiredButActive.length} expired ACTIVE batch(es)`
    );
    console.log("");

    for (const { product, batch } of expiredButActive) {
      console.log(
        `Product #${product.id} "${product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `status=${batch.status} | ` +
          `expiry=${formatDate(batch.expiryDate)}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 8. EXPIRED BATCHES THAT ALREADY HAVE ZERO QUANTITY
  // ===========================================================================

  console.log("8. ZERO-QUANTITY EXPIRED BATCHES");
  console.log("------------------------------------------------------------------------------");

  const zeroExpired = products.flatMap((product) =>
    product.batches
      .filter(
        (batch) =>
          batch.quantity === 0 &&
          batch.status === "EXPIRED"
      )
      .map((batch) => ({
        product,
        batch,
      }))
  );

  if (zeroExpired.length === 0) {
    console.log("No zero-quantity EXPIRED batches.");
  } else {
    console.log(
      `Found ${zeroExpired.length} zero-quantity EXPIRED batch(es).`
    );

    for (const { product, batch } of zeroExpired) {
      console.log(
        `Product #${product.id} "${product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `status=${batch.status} | ` +
          `expiry=${formatDate(batch.expiryDate)}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 9. WRITE-OFF MOVEMENTS
  // ===========================================================================

  console.log("9. WRITE-OFF MOVEMENTS");
  console.log("------------------------------------------------------------------------------");

  const writeOffMovements = await prisma.movement.findMany({
    where: {
      type: "WRITE_OFF",
    },
    include: {
      product: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(
    `WRITE_OFF movements found=${writeOffMovements.length}`
  );

  if (writeOffMovements.length === 0) {
    console.log("No WRITE_OFF movements found.");
  } else {
    for (const movement of writeOffMovements) {
      console.log(
        `Movement #${movement.id} | ` +
          `Product #${movement.productId} "${movement.product.name}" | ` +
          `quantity=${movement.quantity} | ` +
          `comment=${movement.comment ?? ""} | ` +
          `created=${formatDate(movement.createdAt)}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 10. EXPIRED POSITIVE STOCK VS WRITE-OFF HISTORY
  // ===========================================================================

  console.log("10. EXPIRED POSITIVE STOCK VS WRITE-OFF HISTORY");
  console.log("------------------------------------------------------------------------------");

  const writeOffByProduct = new Map<number, number>();

  for (const movement of writeOffMovements) {
    const current =
      writeOffByProduct.get(movement.productId) ?? 0;

    writeOffByProduct.set(
      movement.productId,
      current + Math.abs(movement.quantity)
    );
  }

  for (const product of products) {
    const expiredQuantity = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.expiryDate < now
      )
      .reduce((sum, batch) => sum + batch.quantity, 0);

    const writtenOffQuantity =
      writeOffByProduct.get(product.id) ?? 0;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `currentExpiredPositive=${expiredQuantity} | ` +
        `historicalWRITE_OFF=${writtenOffQuantity}`
    );

    if (expiredQuantity > 0) {
      console.log(
        `  🟡 ACTION CANDIDATE: ${expiredQuantity} шт. ` +
          `currently expired and may require write-off`
      );
    } else {
      console.log(
        "  🟢 No current expired positive stock"
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 11. DETAILED WRITE-OFF CANDIDATES
  // ===========================================================================

  console.log("11. WRITE-OFF CANDIDATES");
  console.log("------------------------------------------------------------------------------");

  if (expiredPositiveBatches.length === 0) {
    console.log(
      "🟢 No write-off candidates found."
    );
  } else {
    console.log(
      `Potential write-off candidates=${expiredPositiveBatches.length}`
    );
    console.log("");

    for (const { product, batch } of expiredPositiveBatches) {
      console.log(
        `Product #${product.id} "${product.name}" | ` +
          `Batch #${batch.id} | ` +
          `writeOffQuantity=${batch.quantity} | ` +
          `currentStatus=${batch.status} | ` +
          `expiry=${formatDate(batch.expiryDate)}`
      );

      console.log(
        `  Potential action: Batch #${batch.id} quantity ` +
          `${batch.quantity} → 0, status → EXPIRED`
      );

      console.log(
        `  Potential Movement: WRITE_OFF quantity=-${batch.quantity}`
      );

      console.log("");
    }
  }

  // ===========================================================================
  // 12. FINAL RESULT
  // ===========================================================================

  console.log("12. FINAL RESULT");
  console.log("------------------------------------------------------------------------------");

  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  if (stockConsistencyProblems > 0) {
    criticalIssues.push(
      `${stockConsistencyProblems} Product.stock / Batch total mismatch(es)`
    );
  }

  for (const { product, batch } of expiredPositiveBatches) {
    warnings.push(
      `Product #${product.id} "${product.name}", Batch #${batch.id} ` +
        `has ${batch.quantity} expired unit(s)`
    );
  }

  for (const { product, batch } of expiredButActive) {
    warnings.push(
      `Product #${product.id} "${product.name}", Batch #${batch.id} ` +
        `is expired but status is ACTIVE`
    );
  }

  for (const { product, batch } of futurePositive) {
    warnings.push(
      `Product #${product.id} "${product.name}", Batch #${batch.id} ` +
        `has future receivedAt`
    );
  }

  if (criticalIssues.length === 0) {
    console.log("🟢 CRITICAL INTEGRITY CHECKS PASSED");
  } else {
    console.log(
      `🔴 CRITICAL ISSUES: ${criticalIssues.length}`
    );

    for (const issue of criticalIssues) {
      console.log(`- ${issue}`);
    }
  }

  console.log("");

  if (warnings.length === 0) {
    console.log("🟢 NO WARNINGS");
  } else {
    console.log(`🟡 WARNINGS: ${warnings.length}`);

    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("");

  // ===========================================================================
  // 13. DATABASE SAFETY
  // ===========================================================================

  console.log("==============================================================================");
  console.log("DRY-RUN COMPLETED");
  console.log("==============================================================================");
  console.log("");

  console.log("NO Product changed.");
  console.log("NO Batch changed.");
  console.log("NO Order changed.");
  console.log("NO OrderItem changed.");
  console.log("NO OrderBatch changed.");
  console.log("NO ReturnBatch changed.");
  console.log("NO Movement changed.");
  console.log("");

  console.log("DATABASE WAS NOT MODIFIED.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 DIAGNOSTIC FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });