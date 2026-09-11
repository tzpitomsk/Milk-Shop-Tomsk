import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CandidateStatus =
  | "PROVABLE"
  | "STRONG_CANDIDATE"
  | "AMBIGUOUS"
  | "NO_ELIGIBLE_BATCH";

type BatchInfo = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
  status: string;
};

function formatDate(date: Date | null | undefined) {
  if (!date) return "—";

  return date.toISOString();
}

function separator(char = "=", length = 78) {
  console.log(char.repeat(length));
}

function printHeader(title: string) {
  console.log();
  separator();
  console.log(title);
  separator();
}

async function main() {
  console.log();
  console.log("======================================================================");
  console.log("DRY-RUN V24 — MISSING ORDERBATCH FORENSIC ANALYSIS");
  console.log("======================================================================");
  console.log();
  console.log("STRICT READ ONLY");
  console.log();
  console.log("This script WILL NOT:");
  console.log("  - create OrderBatch");
  console.log("  - update OrderItem");
  console.log("  - update Batch");
  console.log("  - update Product.stock");
  console.log("  - create/update/delete ReturnBatch");
  console.log("  - create/update/delete Movement");
  console.log("  - modify Order");
  console.log();
  console.log(
    "IMPORTANT: current Batch.quantity is NOT used as historical initial stock."
  );
  console.log(
    "Historical batch capacity cannot be safely reconstructed from current quantity alone."
  );
  console.log();

  const orderItems = await prisma.orderItem.findMany({
    include: {
      order: true,
      product: true,
      batches: {
        include: {
          batch: true,
        },
      },
      ReturnBatch: {
        include: {
          Batch: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const missing = orderItems.filter((item) => item.batches.length === 0);

  printHeader(`1. MISSING ORDERBATCH ITEMS: ${missing.length}`);

  if (missing.length === 0) {
    console.log("🟢 No OrderItems without OrderBatch.");
    return;
  }

  const allBatches = await prisma.batch.findMany({
    orderBy: [
      { productId: "asc" },
      { expiryDate: "asc" },
      { receivedAt: "asc" },
      { id: "asc" },
    ],
  });

  const allOrderBatches = await prisma.orderBatch.findMany({
    include: {
      orderItem: {
        include: {
          order: true,
          product: true,
        },
      },
      batch: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  const allReturnBatches = await prisma.returnBatch.findMany({
    include: {
      OrderItem: {
        include: {
          order: true,
          product: true,
        },
      },
      Batch: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  const movements = await prisma.movement.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  let provable = 0;
  let strongCandidates = 0;
  let ambiguous = 0;
  let noEligible = 0;

  const report: Array<{
    orderItemId: number;
    orderId: number;
    productId: number;
    productName: string;
    quantity: number;
    returned: number;
    net: number;
    orderDate: Date;
    eligible: BatchInfo[];
    later: BatchInfo[];
    status: CandidateStatus;
  }> = [];

  for (const item of missing) {
    const orderDate = item.order.date;

    const productBatches = allBatches.filter(
      (batch) => batch.productId === item.productId
    );

    const eligible = productBatches
      .filter((batch) => batch.receivedAt <= orderDate)
      .sort((a, b) => {
        const expiryDiff =
          a.expiryDate.getTime() - b.expiryDate.getTime();

        if (expiryDiff !== 0) return expiryDiff;

        const receivedDiff =
          a.receivedAt.getTime() - b.receivedAt.getTime();

        if (receivedDiff !== 0) return receivedDiff;

        return a.id - b.id;
      });

    const later = productBatches
      .filter((batch) => batch.receivedAt > orderDate)
      .sort((a, b) => {
        const receivedDiff =
          a.receivedAt.getTime() - b.receivedAt.getTime();

        if (receivedDiff !== 0) return receivedDiff;

        return a.id - b.id;
      });

    const returned = item.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0
    );

    const net = Math.max(item.quantity - returned, 0);

    let status: CandidateStatus;

    /*
     * IMPORTANT:
     *
     * We deliberately do NOT say that a batch is proven merely because
     * it existed before the order.
     *
     * A historical sale can also have originated from opening stock that
     * was not represented correctly in the database.
     *
     * Therefore:
     *
     * 0 eligible       -> NO_ELIGIBLE_BATCH
     * 1 eligible       -> STRONG_CANDIDATE
     * >1 eligible      -> AMBIGUOUS
     *
     * A true PROVABLE repair requires stronger historical evidence and
     * is therefore not automatically produced by this script.
     */

    if (eligible.length === 0) {
      status = "NO_ELIGIBLE_BATCH";
      noEligible++;
    } else if (eligible.length === 1) {
      status = "STRONG_CANDIDATE";
      strongCandidates++;
    } else {
      status = "AMBIGUOUS";
      ambiguous++;
    }

    report.push({
      orderItemId: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      returned,
      net,
      orderDate,
      eligible,
      later,
      status,
    });
  }

  printHeader("2. ITEM-BY-ITEM FORENSIC ANALYSIS");

  for (const row of report) {
    console.log();
    console.log(
      `OrderItem #${row.orderItemId} | Order #${row.orderId} | ` +
        `Product #${row.productId} "${row.productName}"`
    );

    console.log(
      `gross=${row.quantity} | returned=${row.returned} | net=${row.net}`
    );

    console.log(`orderDate=${formatDate(row.orderDate)}`);

    console.log(`STATUS=${row.status}`);

    console.log();

    console.log(
      `Eligible batches received BEFORE/AT order: ${row.eligible.length}`
    );

    if (row.eligible.length === 0) {
      console.log("  — none");
    }

    for (const batch of row.eligible) {
      console.log(
        `  Batch #${batch.id}` +
          ` | quantity NOW=${batch.quantity}` +
          ` | purchaseCost=${batch.purchaseCost}` +
          ` | received=${formatDate(batch.receivedAt)}` +
          ` | expiry=${formatDate(batch.expiryDate)}` +
          ` | status=${batch.status}`
      );
    }

    if (row.later.length > 0) {
      console.log();
      console.log(
        `Batches received AFTER order: ${row.later.length}`
      );

      for (const batch of row.later) {
        console.log(
          `  Batch #${batch.id}` +
            ` | quantity NOW=${batch.quantity}` +
            ` | purchaseCost=${batch.purchaseCost}` +
            ` | received=${formatDate(batch.receivedAt)}` +
            ` | expiry=${formatDate(batch.expiryDate)}` +
            ` | status=${batch.status}`
        );
      }
    }

    /*
     * Existing OrderBatch history for the same product and batches.
     * This is diagnostic only.
     */

    console.log();
    console.log("Existing OrderBatch activity for eligible batches:");

    let foundActivity = false;

    for (const batch of row.eligible) {
      const links = allOrderBatches.filter(
        (ob) =>
          ob.batchId === batch.id &&
          ob.orderItem.productId === row.productId
      );

      if (links.length === 0) continue;

      foundActivity = true;

      const totalSold = links.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      console.log(
        `  Batch #${batch.id} | total linked sales=${totalSold}`
      );

      for (const link of links) {
        console.log(
          `    OrderBatch #${link.id}` +
            ` | Order #${link.orderItem.orderId}` +
            ` | OrderItem #${link.orderItemId}` +
            ` | quantity=${link.quantity}` +
            ` | orderDate=${formatDate(link.orderItem.order.date)}`
        );
      }
    }

    if (!foundActivity) {
      console.log("  — no existing OrderBatch activity");
    }

    /*
     * ReturnBatch history.
     */

    console.log();
    console.log("Existing ReturnBatch activity for eligible batches:");

    let foundReturns = false;

    for (const batch of row.eligible) {
      const links = allReturnBatches.filter(
        (rb) =>
          rb.batchId === batch.id &&
          rb.OrderItem.productId === row.productId
      );

      if (links.length === 0) continue;

      foundReturns = true;

      const totalReturned = links.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      console.log(
        `  Batch #${batch.id} | total linked returns=${totalReturned}`
      );

      for (const link of links) {
        console.log(
          `    ReturnBatch #${link.id}` +
            ` | Order #${link.OrderItem.orderId}` +
            ` | OrderItem #${link.orderItemId}` +
            ` | quantity=${link.quantity}` +
            ` | orderDate=${formatDate(link.OrderItem.order.date)}`
        );
      }
    }

    if (!foundReturns) {
      console.log("  — no existing ReturnBatch activity");
    }

    /*
     * Movement diagnostics.
     *
     * We do NOT use these movements to authorize a repair.
     * They are only displayed as additional evidence.
     */

    console.log();
    console.log("Related Movement evidence:");

    const relatedMovements = movements.filter((movement) => {
      if (movement.productId !== row.productId) return false;

      const comment = movement.comment ?? "";

      const orderPattern = new RegExp(
        `Заказ\\s*№\\s*${row.orderId}(?!\\d)`
      );

      return orderPattern.test(comment);
    });

    if (relatedMovements.length === 0) {
      console.log("  — no movement explicitly linked to this order");
    } else {
      for (const movement of relatedMovements) {
        console.log(
          `  Movement #${movement.id}` +
            ` | ${movement.type}` +
            ` | quantity=${movement.quantity}` +
            ` | created=${formatDate(movement.createdAt)}` +
            ` | comment="${movement.comment ?? ""}"`
        );
      }
    }

    /*
     * Interpretation.
     */

    console.log();
    console.log("INTERPRETATION:");

    if (row.status === "NO_ELIGIBLE_BATCH") {
      console.log(
        "  🔴 No batch existed in the database by the order date."
      );
      console.log(
        "  Historical opening stock / missing supply history is likely."
      );
      console.log(
        "  DO NOT create an OrderBatch automatically."
      );
    } else if (row.status === "STRONG_CANDIDATE") {
      const batch = row.eligible[0];

      console.log(
        `  🟡 Exactly one historical batch exists before the order: Batch #${batch.id}.`
      );
      console.log(
        "  This is a STRONG CANDIDATE, but not mathematically proven."
      );
      console.log(
        "  Current Batch.quantity must NOT be interpreted as historical capacity."
      );
      console.log(
        "  A later APPLY should be targeted and manually reviewed."
      );
    } else {
      console.log(
        "  🟠 Multiple historical batches existed before the order."
      );
      console.log(
        "  FIFO chronology alone does not prove which batch supplied the sale."
      );
      console.log(
        "  This item remains AMBIGUOUS."
      );
      console.log(
        "  DO NOT automatically repair it."
      );
    }
  }

  printHeader("3. SUMMARY");

  console.log(`Total OrderItems without OrderBatch = ${missing.length}`);
  console.log(`PROVABLE = ${provable}`);
  console.log(`STRONG_CANDIDATE = ${strongCandidates}`);
  console.log(`AMBIGUOUS = ${ambiguous}`);
  console.log(`NO_ELIGIBLE_BATCH = ${noEligible}`);

  console.log();

  if (provable === 0) {
    console.log(
      "🟢 No automatically PROVABLE repairs were identified."
    );
  }

  if (strongCandidates > 0) {
    console.log(
      `🟡 ${strongCandidates} item(s) have exactly one eligible historical batch.`
    );
    console.log(
      "   These require targeted review before APPLY."
    );
  }

  if (ambiguous > 0) {
    console.log(
      `🟠 ${ambiguous} item(s) have multiple eligible historical batches.`
    );
    console.log(
      "   These must NOT be repaired using FIFO alone."
    );
  }

  if (noEligible > 0) {
    console.log(
      `🔴 ${noEligible} item(s) have no batch existing by the order date.`
    );
    console.log(
      "   These are opening-stock / missing-history cases unless additional evidence exists."
    );
  }

  printHeader("4. SAFETY CHECK");

  console.log("STRICT READ ONLY:");
  console.log("  Product               — NOT changed");
  console.log("  Product.stock         — NOT changed");
  console.log("  Batch                 — NOT changed");
  console.log("  Order                 — NOT changed");
  console.log("  OrderItem             — NOT changed");
  console.log("  OrderBatch            — NOT changed");
  console.log("  ReturnBatch           — NOT changed");
  console.log("  Movement              — NOT changed");
  console.log("  Supply                — NOT changed");
  console.log("  SupplyItem            — NOT changed");

  console.log();
  console.log("🏁 DRY-RUN V24 COMPLETED");
  console.log();
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ DRY-RUN V24 FAILED");
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });