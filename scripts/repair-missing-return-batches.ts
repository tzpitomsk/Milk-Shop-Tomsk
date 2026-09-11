import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type PlannedReturn = {
  orderItemId: number;
  orderId: number;
  productId: number;
  productName: string;
  batchId: number;
  quantity: number;
};

async function main() {
  console.log("======================================================================");
  console.log(" REPAIR MISSING RETURNBATCHES — DRY RUN");
  console.log("======================================================================");
  console.log("");
  console.log("⚠️  DRY RUN MODE");
  console.log("⚠️  DATABASE WILL NOT BE MODIFIED");
  console.log("");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      returned: {
        gt: 0,
      },
    },

    include: {
      order: true,

      product: true,

      batches: {
        include: {
          batch: true,
        },

        orderBy: {
          id: "asc",
        },
      },

      ReturnBatch: {
        include: {
          Batch: true,
        },

        orderBy: {
          id: "asc",
        },
      },
    },

    orderBy: {
      id: "asc",
    },
  });

  console.log(`OrderItems with returned > 0: ${orderItems.length}`);
  console.log("");

  const plans: PlannedReturn[] = [];

  let checked = 0;
  let alreadyConsistent = 0;
  let repairable = 0;
  let ambiguous = 0;
  let impossible = 0;

  for (const item of orderItems) {
    checked++;

    const returnedTotal = item.ReturnBatch.reduce(
      (sum, returnBatch) => sum + returnBatch.quantity,
      0
    );

    const missingQuantity = item.returned - returnedTotal;

    console.log("----------------------------------------------------------------------");
    console.log(
      `OrderItem #${item.id} | Order #${item.orderId} | "${item.product.name}"`
    );

    console.log(`Sold quantity: ${item.quantity}`);
    console.log(`OrderItem.returned: ${item.returned}`);
    console.log(`ReturnBatch total: ${returnedTotal}`);
    console.log(`Missing ReturnBatch quantity: ${missingQuantity}`);

    if (missingQuantity === 0) {
      alreadyConsistent++;

      console.log("🟢 CONSISTENT");
      console.log("");

      continue;
    }

    if (missingQuantity < 0) {
      impossible++;

      console.log("🔴 INVALID STATE");
      console.log(
        "ReturnBatch total is GREATER than OrderItem.returned."
      );
      console.log("❌ NO REPAIR PLAN CREATED");
      console.log("");

      continue;
    }

    if (item.batches.length === 0) {
      impossible++;

      console.log("🔴 IMPOSSIBLE TO REPAIR SAFELY");
      console.log(
        "OrderItem has no OrderBatch records, so the original sold batch is unknown."
      );
      console.log("❌ NO REPAIR PLAN CREATED");
      console.log("");

      continue;
    }

    console.log("");
    console.log("OrderBatch distribution:");

    for (const orderBatch of item.batches) {
      console.log(
        `  Batch #${orderBatch.batchId} | sold=${orderBatch.quantity} | purchaseCost=${orderBatch.purchaseCost}`
      );
    }

    console.log("");
    console.log("Existing ReturnBatch distribution:");

    if (item.ReturnBatch.length === 0) {
      console.log("  (none)");
    } else {
      for (const returnBatch of item.ReturnBatch) {
        console.log(
          `  Batch #${returnBatch.batchId} | returned=${returnBatch.quantity}`
        );
      }
    }

    /*
     * Calculate:
     *
     * availableToReturnFromBatch =
     * OrderBatch.quantity - already returned from this Batch
     */

    const existingReturnsByBatch = new Map<number, number>();

    for (const returnBatch of item.ReturnBatch) {
      const current =
        existingReturnsByBatch.get(returnBatch.batchId) ?? 0;

      existingReturnsByBatch.set(
        returnBatch.batchId,
        current + returnBatch.quantity
      );
    }

    const candidates = item.batches.map((orderBatch) => {
      const alreadyReturnedFromBatch =
        existingReturnsByBatch.get(orderBatch.batchId) ?? 0;

      const remainingSoldFromBatch =
        orderBatch.quantity - alreadyReturnedFromBatch;

      return {
        batchId: orderBatch.batchId,
        soldQuantity: orderBatch.quantity,
        alreadyReturned: alreadyReturnedFromBatch,
        available: remainingSoldFromBatch,
        expiryDate: orderBatch.batch.expiryDate,
        receivedAt: orderBatch.batch.receivedAt,
      };
    });

    console.log("");
    console.log("Available sold quantity per batch:");

    for (const candidate of candidates) {
      console.log(
        `  Batch #${candidate.batchId} | sold=${candidate.soldQuantity} | alreadyReturned=${candidate.alreadyReturned} | available=${candidate.available}`
      );
    }

    const totalAvailable = candidates.reduce(
      (sum, candidate) => sum + Math.max(candidate.available, 0),
      0
    );

    if (totalAvailable < missingQuantity) {
      impossible++;

      console.log("");
      console.log("🔴 IMPOSSIBLE TO REPAIR SAFELY");
      console.log(
        `Missing=${missingQuantity}, but only ${totalAvailable} sold units remain available for batch-level return allocation.`
      );
      console.log("❌ NO REPAIR PLAN CREATED");
      console.log("");

      continue;
    }

    /*
     * SAFE RULE:
     *
     * If there is only one sold Batch, the missing return
     * can be assigned unambiguously.
     *
     * If there are multiple Batches:
     *
     * allocate using FIFO order of the ORIGINAL OrderBatch links:
     * expiryDate → receivedAt → batchId
     *
     * But only create an automatic plan when the allocation
     * is deterministic.
     */

    const sortedCandidates = [...candidates]
      .filter((candidate) => candidate.available > 0)
      .sort((a, b) => {
        const expiryDifference =
          a.expiryDate.getTime() - b.expiryDate.getTime();

        if (expiryDifference !== 0) {
          return expiryDifference;
        }

        const receivedDifference =
          a.receivedAt.getTime() - b.receivedAt.getTime();

        if (receivedDifference !== 0) {
          return receivedDifference;
        }

        return a.batchId - b.batchId;
      });

    /*
     * For historical returns we cannot always know the exact
     * original batch without ReturnBatch records.
     *
     * Therefore:
     *
     * - One available Batch → safe automatic repair
     * - Multiple available Batches → mark for review
     */

    if (sortedCandidates.length > 1) {
      ambiguous++;

      console.log("");
      console.log("🟠 AMBIGUOUS — MANUAL REVIEW REQUIRED");
      console.log(
        "More than one original Batch is still available for the missing returned quantity."
      );

      console.log("");
      console.log("Possible FIFO allocation:");

      let previewRemaining = missingQuantity;

      for (const candidate of sortedCandidates) {
        if (previewRemaining <= 0) {
          break;
        }

        const allocation = Math.min(
          candidate.available,
          previewRemaining
        );

        console.log(
          `  Batch #${candidate.batchId} → planned return ${allocation}`
        );

        previewRemaining -= allocation;
      }

      console.log("");
      console.log("❌ AUTOMATIC REPAIR NOT PLANNED");
      console.log("");

      continue;
    }

    const candidate = sortedCandidates[0];

    if (!candidate) {
      impossible++;

      console.log("");
      console.log("🔴 IMPOSSIBLE TO REPAIR");
      console.log("No batch is available for return allocation.");
      console.log("");

      continue;
    }

    if (candidate.available < missingQuantity) {
      impossible++;

      console.log("");
      console.log("🔴 IMPOSSIBLE TO REPAIR");
      console.log(
        `Batch #${candidate.batchId} has available=${candidate.available}, but missing=${missingQuantity}.`
      );
      console.log("");

      continue;
    }

    repairable++;

    plans.push({
      orderItemId: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productName: item.product.name,
      batchId: candidate.batchId,
      quantity: missingQuantity,
    });

    console.log("");
    console.log("🟢 SAFE AUTOMATIC REPAIR PLAN");
    console.log(
      `CREATE ReturnBatch → Batch #${candidate.batchId} | quantity=${missingQuantity}`
    );
    console.log("");
  }

  console.log("======================================================================");
  console.log(" FINAL DRY RUN SUMMARY");
  console.log("======================================================================");
  console.log("");

  console.log(`OrderItems checked: ${checked}`);
  console.log(`Already consistent: ${alreadyConsistent}`);
  console.log(`Safe automatic repairs: ${repairable}`);
  console.log(`Ambiguous cases: ${ambiguous}`);
  console.log(`Impossible cases: ${impossible}`);

  console.log("");
  console.log("----------------------------------------------------------------------");
  console.log(" PLANNED RETURNBATCH CREATIONS");
  console.log("----------------------------------------------------------------------");

  if (plans.length === 0) {
    console.log("No safe automatic repairs found.");
  } else {
    for (const plan of plans) {
      console.log(
        `Order #${plan.orderId} | ` +
          `OrderItem #${plan.orderItemId} | ` +
          `Product="${plan.productName}" | ` +
          `Batch #${plan.batchId} | ` +
          `CREATE ReturnBatch quantity=${plan.quantity}`
      );
    }
  }

  console.log("");
  console.log("======================================================================");
  console.log(" DRY RUN COMPLETE");
  console.log("======================================================================");
  console.log("");
  console.log("NO DATABASE RECORDS WERE MODIFIED.");
  console.log("NO ReturnBatch RECORDS WERE CREATED.");
  console.log("NO Product STOCK WAS CHANGED.");
  console.log("NO Batch QUANTITY WAS CHANGED.");
  console.log("NO Movement RECORDS WERE CHANGED.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ SCRIPT FAILED");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });