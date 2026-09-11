import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function section(title: string): void {
  console.log("");
  console.log("==============================================================================");
  console.log(title);
  console.log("==============================================================================");
  console.log("");
}

async function main(): Promise<void> {
  section("V38 — CURRENT BATCH / FEFO / FIFO AUDIT");

  console.log("STRICT READ ONLY");
  console.log("DATABASE WILL NOT BE MODIFIED");
  console.log("");

  let critical = 0;
  let warnings = 0;

  const now = new Date();

  console.log(`Audit time=${now.toISOString()}`);
  console.log("");

  // ===========================================================================
  // 1. LOAD CURRENT DATA
  // ===========================================================================

  section("1. LOADING CURRENT PRODUCTS AND BATCHES");

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      batches: {
        orderBy: [
          {
            expiryDate: "asc",
          },
          {
            receivedAt: "asc",
          },
          {
            id: "asc",
          },
        ],
      },
    },
  });

  console.log(`Products found=${products.length}`);

  const allBatches = products.flatMap((product) =>
    product.batches.map((batch) => ({
      ...batch,
      product,
    }))
  );

  console.log(`Batches found=${allBatches.length}`);

  // ===========================================================================
  // 2. CURRENT POSITIVE STOCK
  // ===========================================================================

  section("2. CURRENT POSITIVE BATCHES");

  const positiveBatches = allBatches.filter(
    (batch) => batch.quantity > 0
  );

  console.log(`Positive batches=${positiveBatches.length}`);

  if (positiveBatches.length === 0) {
    console.log("No positive stock batches found.");
  }

  for (const batch of positiveBatches) {
    console.log(
      `Product #${batch.product.id} "${batch.product.name}" | ` +
        `Batch #${batch.id} | ` +
        `quantity=${batch.quantity} | ` +
        `status=${batch.status} | ` +
        `received=${batch.receivedAt.toISOString()} | ` +
        `expiry=${batch.expiryDate.toISOString()}`
    );
  }

  // ===========================================================================
  // 3. POSITIVE EXPIRED STOCK
  // ===========================================================================

  section("3. POSITIVE EXPIRED STOCK");

  const positiveExpiredBatches = positiveBatches.filter(
    (batch) => batch.expiryDate < now
  );

  if (positiveExpiredBatches.length === 0) {
    console.log(
      "🟢 No positive expired batches"
    );
  } else {
    for (const batch of positiveExpiredBatches) {
      critical++;

      console.log(
        `🔴 CRITICAL: Product #${batch.product.id} "${batch.product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `expiry=${batch.expiryDate.toISOString()}`
      );
    }
  }

  // ===========================================================================
  // 4. POSITIVE FUTURE BATCHES
  // ===========================================================================

  section("4. POSITIVE FUTURE BATCHES");

  const positiveFutureBatches = positiveBatches.filter(
    (batch) => batch.receivedAt > now
  );

  if (positiveFutureBatches.length === 0) {
    console.log(
      "🟢 No positive batches with receivedAt in the future"
    );
  } else {
    for (const batch of positiveFutureBatches) {
      critical++;

      console.log(
        `🔴 CRITICAL: Product #${batch.product.id} "${batch.product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `received=${batch.receivedAt.toISOString()}`
      );
    }
  }

  // ===========================================================================
  // 5. POSITIVE NON-ACTIVE BATCHES
  // ===========================================================================

  section("5. POSITIVE NON-ACTIVE BATCHES");

  const positiveNonActiveBatches = positiveBatches.filter(
    (batch) => batch.status !== "ACTIVE"
  );

  if (positiveNonActiveBatches.length === 0) {
    console.log(
      "🟢 No positive non-ACTIVE batches"
    );
  } else {
    for (const batch of positiveNonActiveBatches) {
      critical++;

      console.log(
        `🔴 CRITICAL: Product #${batch.product.id} "${batch.product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `status=${batch.status}`
      );
    }
  }

  // ===========================================================================
  // 6. EMPTY BATCH STATUS
  // ===========================================================================

  section("6. EMPTY BATCH STATUS");

  let emptyStatusWarnings = 0;
  let positiveEmptyCriticals = 0;

  for (const batch of allBatches) {
    if (batch.quantity === 0 && batch.status === "ACTIVE") {
      emptyStatusWarnings++;

      warnings++;

      console.log(
        `🟠 WARNING: Product #${batch.product.id} "${batch.product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=0 | ` +
          `status=ACTIVE`
      );
    }

    if (batch.quantity > 0 && batch.status === "EMPTY") {
      positiveEmptyCriticals++;

      critical++;

      console.log(
        `🔴 CRITICAL: Product #${batch.product.id} "${batch.product.name}" | ` +
          `Batch #${batch.id} | ` +
          `quantity=${batch.quantity} | ` +
          `status=EMPTY`
      );
    }
  }

  if (
    emptyStatusWarnings === 0 &&
    positiveEmptyCriticals === 0
  ) {
    console.log(
      "🟢 Empty/positive status relationships are consistent"
    );
  }

  // ===========================================================================
  // 7. EXPIRY / RECEIVED DATE SANITY
  // ===========================================================================

  section("7. BATCH DATE SANITY");

  let invalidDateRanges = 0;

  for (const batch of allBatches) {
    if (batch.expiryDate < batch.receivedAt) {
      invalidDateRanges++;

      if (batch.quantity > 0) {
        critical++;
      } else {
        warnings++;
      }

      console.log(
        `${
          batch.quantity > 0 ? "🔴" : "🟠"
        } ${
          batch.quantity > 0
            ? "CRITICAL"
            : "WARNING"
        }: Product #${batch.product.id} "${batch.product.name}" | ` +
          `Batch #${batch.id} | ` +
          `received=${batch.receivedAt.toISOString()} | ` +
          `expiry=${batch.expiryDate.toISOString()} | ` +
          `quantity=${batch.quantity}`
      );
    }
  }

  if (invalidDateRanges === 0) {
    console.log(
      "🟢 All Batch expiryDate values are >= receivedAt"
    );
  }

  // ===========================================================================
  // 8. CURRENT SELLABLE BATCHES
  // ===========================================================================

  section("8. CURRENT SELLABLE BATCHES");

  const sellableBatches = positiveBatches.filter(
    (batch) =>
      batch.status === "ACTIVE" &&
      batch.receivedAt <= now &&
      batch.expiryDate >= now
  );

  console.log(
    `Sellable positive batches=${sellableBatches.length}`
  );

  for (const batch of sellableBatches) {
    console.log(
      `Product #${batch.product.id} "${batch.product.name}" | ` +
        `Batch #${batch.id} | ` +
        `quantity=${batch.quantity} | ` +
        `expiry=${batch.expiryDate.toISOString()}`
    );
  }

  // ===========================================================================
  // 9. PRODUCT STOCK VS SELLABLE STOCK
  // ===========================================================================

  section("9. PRODUCT STOCK VS SELLABLE STOCK");

  for (const product of products) {
    const sellableQuantity = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.receivedAt <= now &&
          batch.expiryDate >= now
      )
      .reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

    const physicalQuantity = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `Product.stock=${product.stock} | ` +
        `physical=${physicalQuantity} | ` +
        `sellable=${sellableQuantity}`
    );

    if (product.stock !== physicalQuantity) {
      critical++;

      console.log(
        "  🔴 CRITICAL: Product.stock != physical batch quantity"
      );
    }

    if (sellableQuantity > product.stock) {
      critical++;

      console.log(
        "  🔴 CRITICAL: Sellable quantity exceeds Product.stock"
      );
    }
  }

  // ===========================================================================
  // 10. FEFO ORDER
  // ===========================================================================

  section("10. FEFO ORDER OF CURRENT SELLABLE STOCK");

  for (const product of products) {
    const productSellable = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.receivedAt <= now &&
          batch.expiryDate >= now
      )
      .sort((a, b) => {
        const expiryCompare =
          a.expiryDate.getTime() -
          b.expiryDate.getTime();

        if (expiryCompare !== 0) {
          return expiryCompare;
        }

        const receivedCompare =
          a.receivedAt.getTime() -
          b.receivedAt.getTime();

        if (receivedCompare !== 0) {
          return receivedCompare;
        }

        return a.id - b.id;
      });

    if (productSellable.length === 0) {
      console.log(
        `Product #${product.id} "${product.name}" | no sellable batches`
      );

      continue;
    }

    console.log(
      `Product #${product.id} "${product.name}"`
    );

    productSellable.forEach(
      (batch, index) => {
        console.log(
          `  ${index + 1}. Batch #${batch.id} | ` +
            `quantity=${batch.quantity} | ` +
            `expiry=${batch.expiryDate.toISOString()} | ` +
            `received=${batch.receivedAt.toISOString()}`
        );
      }
    );

    for (let i = 1; i < productSellable.length; i++) {
      const previous = productSellable[i - 1];
      const current = productSellable[i];

      const previousKey = [
        previous.expiryDate.getTime(),
        previous.receivedAt.getTime(),
        previous.id,
      ];

      const currentKey = [
        current.expiryDate.getTime(),
        current.receivedAt.getTime(),
        current.id,
      ];

      const isCorrectOrder =
        previousKey[0] < currentKey[0] ||
        (
          previousKey[0] === currentKey[0] &&
          previousKey[1] < currentKey[1]
        ) ||
        (
          previousKey[0] === currentKey[0] &&
          previousKey[1] === currentKey[1] &&
          previousKey[2] < currentKey[2]
        );

      if (!isCorrectOrder) {
        critical++;

        console.log(
          `  🔴 CRITICAL: FEFO/FIFO ordering violation between ` +
            `Batch #${previous.id} and Batch #${current.id}`
        );
      }
    }
  }

  // ===========================================================================
  // 11. CURRENT STOCK SUMMARY
  // ===========================================================================

  section("11. CURRENT STOCK SUMMARY");

  let totalPhysicalStock = 0;
  let totalSellableStock = 0;
  let totalExpiredPositiveStock = 0;
  let totalFuturePositiveStock = 0;

  for (const product of products) {
    const physical = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const sellable = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.receivedAt <= now &&
          batch.expiryDate >= now
      )
      .reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

    const expired = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.expiryDate < now
      )
      .reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

    const future = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.receivedAt > now
      )
      .reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

    totalPhysicalStock += physical;
    totalSellableStock += sellable;
    totalExpiredPositiveStock += expired;
    totalFuturePositiveStock += future;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `physical=${physical} | ` +
        `sellable=${sellable} | ` +
        `expiredPositive=${expired} | ` +
        `futurePositive=${future}`
    );
  }

  console.log("");

  console.log(
    `TOTAL physical stock=${totalPhysicalStock}`
  );

  console.log(
    `TOTAL sellable stock=${totalSellableStock}`
  );

  console.log(
    `TOTAL expired positive stock=${totalExpiredPositiveStock}`
  );

  console.log(
    `TOTAL future positive stock=${totalFuturePositiveStock}`
  );

  // ===========================================================================
  // 12. FINAL RESULT
  // ===========================================================================

  section("12. V38 FINAL RESULT");

  console.log(
    `Products=${products.length}`
  );

  console.log(
    `Batches=${allBatches.length}`
  );

  console.log(
    `Positive batches=${positiveBatches.length}`
  );

  console.log(
    `Sellable batches=${sellableBatches.length}`
  );

  console.log(
    `Physical stock=${totalPhysicalStock}`
  );

  console.log(
    `Sellable stock=${totalSellableStock}`
  );

  console.log(
    `Expired positive stock=${totalExpiredPositiveStock}`
  );

  console.log(
    `Future positive stock=${totalFuturePositiveStock}`
  );

  console.log("");

  console.log(
    `Critical=${critical}`
  );

  console.log(
    `Warnings=${warnings}`
  );

  console.log("");

  if (critical === 0) {
    console.log(
      "🟢 V38 CURRENT BATCH / FEFO / FIFO AUDIT PASSED"
    );
  } else {
    console.log(
      "🔴 V38 CURRENT BATCH / FEFO / FIFO AUDIT FAILED"
    );
  }

  console.log("");

  console.log(
    "Current stock source of truth:"
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
    console.error("🔴 V38 AUDIT FAILED TO EXECUTE");
    console.error("");
    console.error(error);
    console.error("");

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });