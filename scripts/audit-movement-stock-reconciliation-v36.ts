import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IssueLevel = "CRITICAL" | "WARNING";

interface Issue {
  level: IssueLevel;
  message: string;
}

const KNOWN_MOVEMENT_TYPES = new Set([
  "SUPPLY",
  "SALE",
  "RETURN",
  "WRITE_OFF",
]);

function addIssue(
  issues: Issue[],
  level: IssueLevel,
  message: string
): void {
  issues.push({
    level,
    message,
  });
}

function expectedMovementSign(type: string): "positive" | "negative" | "any" {
  if (type === "SUPPLY" || type === "RETURN") {
    return "positive";
  }

  if (type === "SALE" || type === "WRITE_OFF") {
    return "negative";
  }

  return "any";
}

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=============================================================================="
  );
  console.log("V36 — MOVEMENT / STOCK RECONCILIATION AUDIT");
  console.log("STRICT READ ONLY — DATABASE WILL NOT BE MODIFIED");
  console.log(
    "=============================================================================="
  );
  console.log("");

  const issues: Issue[] = [];

  // ===========================================================================
  // 1. LOAD PRODUCTS
  // ===========================================================================

  console.log("1. LOADING PRODUCTS");
  console.log(
    "------------------------------------------------------------------------------"
  );

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
          id: "asc",
        },
      },
    },
  });

  console.log(`Products found=${products.length}`);
  console.log("");

  // ===========================================================================
  // 2. GLOBAL COUNTS
  // ===========================================================================

  console.log("2. GLOBAL COUNTS");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const [
    batchCount,
    movementCount,
    supplyMovementCount,
    saleMovementCount,
    returnMovementCount,
    writeOffMovementCount,
  ] = await Promise.all([
    prisma.batch.count(),
    prisma.movement.count(),
    prisma.movement.count({
      where: {
        type: "SUPPLY",
      },
    }),
    prisma.movement.count({
      where: {
        type: "SALE",
      },
    }),
    prisma.movement.count({
      where: {
        type: "RETURN",
      },
    }),
    prisma.movement.count({
      where: {
        type: "WRITE_OFF",
      },
    }),
  ]);

  console.log(`Batches=${batchCount}`);
  console.log(`Movements=${movementCount}`);
  console.log(`SUPPLY movements=${supplyMovementCount}`);
  console.log(`SALE movements=${saleMovementCount}`);
  console.log(`RETURN movements=${returnMovementCount}`);
  console.log(`WRITE_OFF movements=${writeOffMovementCount}`);
  console.log("");

  // ===========================================================================
  // 3. MOVEMENT TYPE / SIGN AUDIT
  // ===========================================================================

  console.log("3. MOVEMENT TYPE / SIGN AUDIT");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let unknownMovementTypes = 0;
  let movementSignProblems = 0;

  for (const product of products) {
    for (const movement of product.movements) {
      if (!KNOWN_MOVEMENT_TYPES.has(movement.type)) {
        unknownMovementTypes += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Product #${product.id} "${product.name}": ` +
            `Movement #${movement.id} has unknown type "${movement.type}".`
        );

        console.log(
          `🔴 Movement #${movement.id} | Product #${product.id} | ` +
            `unknown type=${movement.type} | quantity=${movement.quantity}`
        );

        continue;
      }

      const sign = expectedMovementSign(movement.type);

      if (
        sign === "positive" &&
        movement.quantity <= 0
      ) {
        movementSignProblems += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Movement #${movement.id}: type=${movement.type} ` +
            `must have positive quantity, got ${movement.quantity}.`
        );

        console.log(
          `🔴 Movement #${movement.id} | type=${movement.type} | ` +
            `quantity=${movement.quantity}`
        );
      }

      if (
        sign === "negative" &&
        movement.quantity >= 0
      ) {
        movementSignProblems += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Movement #${movement.id}: type=${movement.type} ` +
            `must have negative quantity, got ${movement.quantity}.`
        );

        console.log(
          `🔴 Movement #${movement.id} | type=${movement.type} | ` +
            `quantity=${movement.quantity}`
        );
      }
    }
  }

  if (unknownMovementTypes === 0) {
    console.log("🟢 All Movement types are known");
  }

  if (movementSignProblems === 0) {
    console.log("🟢 All Movement signs are correct");
  }

  console.log("");

  // ===========================================================================
  // 4. PRODUCT STOCK VS SUM OF BATCHES
  // ===========================================================================

  console.log("4. PRODUCT STOCK VS SUM OF BATCHES");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let batchStockMismatchCount = 0;

  for (const product of products) {
    const batchSum = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `Product.stock=${product.stock} | ` +
        `SUM(Batch.quantity)=${batchSum}`
    );

    if (product.stock !== batchSum) {
      batchStockMismatchCount += 1;

      addIssue(
        issues,
        "CRITICAL",
        `Product #${product.id} "${product.name}": ` +
          `Product.stock=${product.stock}, ` +
          `SUM(Batch.quantity)=${batchSum}.`
      );

      console.log("  🔴 STOCK / BATCH MISMATCH");
    }
  }

  if (batchStockMismatchCount === 0) {
    console.log("");
    console.log(
      "🟢 Product.stock matches SUM(Batch.quantity) for every product"
    );
  }

  console.log("");

  // ===========================================================================
  // 5. MOVEMENT NET VS PRODUCT STOCK
  // ===========================================================================

  console.log("5. MOVEMENT NET VS PRODUCT STOCK");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let movementStockMismatchCount = 0;

  for (const product of products) {
    const movementNet = product.movements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `Movement NET=${movementNet} | ` +
        `Product.stock=${product.stock}`
    );

    if (movementNet !== product.stock) {
      movementStockMismatchCount += 1;

      addIssue(
        issues,
        "CRITICAL",
        `Product #${product.id} "${product.name}": ` +
          `Movement NET=${movementNet}, ` +
          `Product.stock=${product.stock}.`
      );

      console.log("  🔴 MOVEMENT / STOCK MISMATCH");
    }
  }

  if (movementStockMismatchCount === 0) {
    console.log("");
    console.log(
      "🟢 Movement NET matches Product.stock for every product"
    );
  }

  console.log("");

  // ===========================================================================
  // 6. MOVEMENT NET BY TYPE
  // ===========================================================================

  console.log("6. MOVEMENT NET BY TYPE");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let globalSupplyNet = 0;
  let globalSaleNet = 0;
  let globalReturnNet = 0;
  let globalWriteOffNet = 0;

  for (const product of products) {
    const supplyNet = product.movements
      .filter((movement) => movement.type === "SUPPLY")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const saleNet = product.movements
      .filter((movement) => movement.type === "SALE")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const returnNet = product.movements
      .filter((movement) => movement.type === "RETURN")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const writeOffNet = product.movements
      .filter((movement) => movement.type === "WRITE_OFF")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    globalSupplyNet += supplyNet;
    globalSaleNet += saleNet;
    globalReturnNet += returnNet;
    globalWriteOffNet += writeOffNet;

    const calculatedStock =
      supplyNet +
      saleNet +
      returnNet +
      writeOffNet;

    console.log(
      `Product #${product.id} "${product.name}": ` +
        `SUPPLY=${supplyNet}, ` +
        `SALE=${saleNet}, ` +
        `RETURN=${returnNet}, ` +
        `WRITE_OFF=${writeOffNet}, ` +
        `calculated=${calculatedStock}, ` +
        `stock=${product.stock}`
    );

    if (calculatedStock !== product.stock) {
      addIssue(
        issues,
        "CRITICAL",
        `Product #${product.id} "${product.name}": ` +
          `SUPPLY + SALE + RETURN + WRITE_OFF=${calculatedStock}, ` +
          `Product.stock=${product.stock}.`
      );

      console.log("  🔴 TYPE-BY-TYPE STOCK RECONCILIATION FAILED");
    }
  }

  console.log("");
  console.log(`GLOBAL SUPPLY NET=${globalSupplyNet}`);
  console.log(`GLOBAL SALE NET=${globalSaleNet}`);
  console.log(`GLOBAL RETURN NET=${globalReturnNet}`);
  console.log(`GLOBAL WRITE_OFF NET=${globalWriteOffNet}`);

  const globalMovementNet =
    globalSupplyNet +
    globalSaleNet +
    globalReturnNet +
    globalWriteOffNet;

  const globalStock =
    products.reduce(
      (sum, product) => sum + product.stock,
      0
    );

  console.log(`GLOBAL MOVEMENT NET=${globalMovementNet}`);
  console.log(`GLOBAL PRODUCT STOCK=${globalStock}`);

  if (globalMovementNet !== globalStock) {
    addIssue(
      issues,
      "CRITICAL",
      `Global reconciliation failed: ` +
        `Movement NET=${globalMovementNet}, ` +
        `Product stock=${globalStock}.`
    );

    console.log(
      "🔴 GLOBAL MOVEMENT / STOCK RECONCILIATION FAILED"
    );
  } else {
    console.log(
      "🟢 Global movement reconciliation passed"
    );
  }

  console.log("");

  // ===========================================================================
  // 7. BATCH QUANTITY SANITY
  // ===========================================================================

  console.log("7. BATCH QUANTITY SANITY");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let negativeBatchCount = 0;

  for (const product of products) {
    for (const batch of product.batches) {
      if (batch.quantity < 0) {
        negativeBatchCount += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Batch #${batch.id} for Product #${product.id} ` +
            `has negative quantity=${batch.quantity}.`
        );

        console.log(
          `🔴 Batch #${batch.id} | Product #${product.id} | ` +
            `quantity=${batch.quantity}`
        );
      }
    }
  }

  if (negativeBatchCount === 0) {
    console.log("🟢 No Batch has negative quantity");
  }

  console.log("");

  // ===========================================================================
  // 8. POSITIVE STOCK AND MOVEMENT RECONCILIATION PER PRODUCT
  // ===========================================================================

  console.log("8. POSITIVE STOCK / MOVEMENT DETAIL");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let detailMismatchCount = 0;

  for (const product of products) {
    const supply = product.movements
      .filter((movement) => movement.type === "SUPPLY")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const sale = product.movements
      .filter((movement) => movement.type === "SALE")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const returns = product.movements
      .filter((movement) => movement.type === "RETURN")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const writeOff = product.movements
      .filter((movement) => movement.type === "WRITE_OFF")
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0
      );

    const reconstructed =
      supply +
      sale +
      returns +
      writeOff;

    const batchSum = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const matchesStock =
      reconstructed === product.stock;

    const matchesBatches =
      batchSum === product.stock;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `movement=${reconstructed} | ` +
        `batches=${batchSum} | ` +
        `stock=${product.stock} | ` +
        `movementOK=${matchesStock} | ` +
        `batchesOK=${matchesBatches}`
    );

    if (!matchesStock || !matchesBatches) {
      detailMismatchCount += 1;

      addIssue(
        issues,
        "CRITICAL",
        `Product #${product.id} "${product.name}": ` +
          `independent stock reconciliation failed.`
      );
    }
  }

  if (detailMismatchCount === 0) {
    console.log("");
    console.log(
      "🟢 Independent per-product reconciliation passed"
    );
  }

  console.log("");

  // ===========================================================================
  // 9. FINAL SUMMARY
  // ===========================================================================

  console.log(
    "=============================================================================="
  );
  console.log("V36 FINAL RESULT");
  console.log(
    "=============================================================================="
  );
  console.log("");

  const criticalCount = issues.filter(
    (issue) => issue.level === "CRITICAL"
  ).length;

  const warningCount = issues.filter(
    (issue) => issue.level === "WARNING"
  ).length;

  console.log(`Products=${products.length}`);
  console.log(`Batches=${batchCount}`);
  console.log(`Movements=${movementCount}`);
  console.log("");

  console.log(`Critical=${criticalCount}`);
  console.log(`Warnings=${warningCount}`);
  console.log("");

  if (issues.length > 0) {
    console.log("ISSUES:");
    console.log("");

    for (const issue of issues) {
      const prefix =
        issue.level === "CRITICAL"
          ? "🔴"
          : "🟡";

      console.log(
        `${prefix} ${issue.message}`
      );
    }

    console.log("");
  }

  if (criticalCount === 0) {
    console.log(
      "🟢 V36 READ-ONLY AUDIT PASSED"
    );
  } else {
    console.log(
      "🔴 V36 READ-ONLY AUDIT FAILED"
    );
  }

  console.log("");
  console.log("NO Product changed.");
  console.log("NO Product.stock changed.");
  console.log("NO Batch changed.");
  console.log("NO Movement changed.");
  console.log("NO Order changed.");
  console.log("NO OrderItem changed.");
  console.log("NO OrderBatch changed.");
  console.log("NO ReturnBatch changed.");
  console.log("");
  console.log("DATABASE WAS NOT MODIFIED.");
  console.log("");

  console.log(
    "=============================================================================="
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "🔴 V36 AUDIT FAILED TO EXECUTE"
    );
    console.error("");
    console.error(error);
    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });