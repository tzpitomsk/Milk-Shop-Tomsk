import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function separator(char = "=", length = 78) {
  console.log(char.repeat(length));
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toISOString();
}

function exactOrderNumberPattern(orderId: number) {
  return new RegExp(`Заказ\\s*№\\s*${orderId}(?!\\d)`);
}

async function main() {
  console.log();
  separator();
  console.log("DRY-RUN V25 — EXPIRED ACTIVE BATCH FORENSIC ANALYSIS");
  separator();

  console.log();
  console.log("STRICT READ ONLY");
  console.log();

  console.log("This script WILL NOT:");
  console.log("  - update Batch");
  console.log("  - update Product");
  console.log("  - update Product.stock");
  console.log("  - create/delete/update Movement");
  console.log("  - create/delete/update OrderBatch");
  console.log("  - create/delete/update ReturnBatch");
  console.log("  - modify Supply");
  console.log("  - modify SupplyItem");
  console.log("  - modify Order");
  console.log("  - modify OrderItem");
  console.log();

  console.log("PURPOSE:");
  console.log(
    "Analyze ACTIVE batches whose expiryDate has already passed."
  );
  console.log(
    "Determine whether their current stock can safely be treated as expired stock."
  );
  console.log(
    "No automatic write-off is authorized by this script."
  );
  console.log();

  const now = new Date();

  console.log(`Audit time = ${formatDate(now)}`);

  const expiredActiveBatches = await prisma.batch.findMany({
    where: {
      status: "ACTIVE",
      expiryDate: {
        lt: now,
      },
      quantity: {
        gt: 0,
      },
    },
    include: {
      product: true,
      orderBatches: {
        include: {
          orderItem: {
            include: {
              order: true,
            },
          },
        },
      },
      ReturnBatch: {
        include: {
          OrderItem: {
            include: {
              order: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        productId: "asc",
      },
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
  });

  const allSupplies = await prisma.supply.findMany({
    include: {
      items: {
        include: {
          product: true,
        },
      },
      Supplier: true,
    },
    orderBy: {
      date: "asc",
    },
  });

  const allMovements = await prisma.movement.findMany({
    orderBy: [
      {
        productId: "asc",
      },
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  separator();
  console.log("1. EXPIRED ACTIVE BATCHES");
  separator();

  console.log(
    `Expired ACTIVE batches with quantity > 0 = ${expiredActiveBatches.length}`
  );

  if (expiredActiveBatches.length === 0) {
    console.log();
    console.log("🟢 No expired ACTIVE batches with positive stock.");
    console.log();
    return;
  }

  let totalExpiredStock = 0;

  const results: Array<{
    batchId: number;
    productId: number;
    productName: string;
    quantity: number;
    purchaseCost: number;
    receivedAt: Date;
    expiryDate: Date;
    orderBatchQty: number;
    returnBatchQty: number;
    supplyEvidence: number;
    writeOffMovements: number;
    status: string;
  }> = [];

  for (const batch of expiredActiveBatches) {
    totalExpiredStock += batch.quantity;

    const orderBatchQty = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returnBatchQty = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    /*
     * SupplyItem has no direct batchId relation.
     *
     * Therefore supply matching is forensic only.
     *
     * We first look for exact product + cost + date relationship.
     * We NEVER claim this proves the batch origin.
     */

    const possibleSupplies = allSupplies.filter((supply) => {
      return supply.items.some(
        (item) =>
          item.productId === batch.productId &&
          item.cost === batch.purchaseCost &&
          supply.date <= batch.receivedAt
      );
    });

    const productMovements = allMovements.filter(
      (movement) => movement.productId === batch.productId
    );

    const writeOffMovements = productMovements.filter((movement) => {
      if (movement.type !== "WRITE_OFF") return false;

      const comment = movement.comment ?? "";

      const batchPattern = new RegExp(
        `Batch\\s*#?\\s*${batch.id}(?!\\d)`
      );

      return batchPattern.test(comment);
    });

    results.push({
      batchId: batch.id,
      productId: batch.productId,
      productName: batch.product.name,
      quantity: batch.quantity,
      purchaseCost: batch.purchaseCost,
      receivedAt: batch.receivedAt,
      expiryDate: batch.expiryDate,
      orderBatchQty,
      returnBatchQty,
      supplyEvidence: possibleSupplies.length,
      writeOffMovements: writeOffMovements.length,
      status: batch.status,
    });

    console.log();
    console.log(
      `Batch #${batch.id} | Product #${batch.productId} "${batch.product.name}"`
    );

    console.log(`quantity NOW = ${batch.quantity}`);
    console.log(`purchaseCost = ${batch.purchaseCost}`);
    console.log(`receivedAt   = ${formatDate(batch.receivedAt)}`);
    console.log(`expiryDate   = ${formatDate(batch.expiryDate)}`);
    console.log(`status       = ${batch.status}`);

    console.log();

    const expiredMs = now.getTime() - batch.expiryDate.getTime();
    const expiredDays = expiredMs / (1000 * 60 * 60 * 24);

    console.log(
      `expired approximately ${expiredDays.toFixed(2)} day(s) ago`
    );

    /*
     * Current OrderBatch references
     */

    console.log();
    console.log("ORDERBATCH REFERENCES:");

    if (batch.orderBatches.length === 0) {
      console.log("  — none");
    } else {
      let total = 0;

      for (const link of batch.orderBatches) {
        total += link.quantity;

        console.log(
          `  OrderBatch #${link.id}` +
            ` | Order #${link.orderItem.orderId}` +
            ` | OrderItem #${link.orderItemId}` +
            ` | quantity=${link.quantity}` +
            ` | orderDate=${formatDate(link.orderItem.order.date)}`
        );
      }

      console.log(`  TOTAL SOLD THROUGH THIS BATCH = ${total}`);
    }

    /*
     * Current ReturnBatch references
     */

    console.log();
    console.log("RETURNBATCH REFERENCES:");

    if (batch.ReturnBatch.length === 0) {
      console.log("  — none");
    } else {
      let total = 0;

      for (const link of batch.ReturnBatch) {
        total += link.quantity;

        console.log(
          `  ReturnBatch #${link.id}` +
            ` | Order #${link.OrderItem.orderId}` +
            ` | OrderItem #${link.orderItemId}` +
            ` | quantity=${link.quantity}` +
            ` | orderDate=${formatDate(link.OrderItem.order.date)}`
        );
      }

      console.log(`  TOTAL RETURNED FROM THIS BATCH = ${total}`);
    }

    /*
     * Supply evidence
     */

    console.log();
    console.log("SUPPLY EVIDENCE:");

    if (possibleSupplies.length === 0) {
      console.log("  — no possible supply match found");
    } else {
      console.log(
        `  Possible Supply records = ${possibleSupplies.length}`
      );

      for (const supply of possibleSupplies) {
        const matchingItems = supply.items.filter(
          (item) =>
            item.productId === batch.productId &&
            item.cost === batch.purchaseCost &&
            supply.date <= batch.receivedAt
        );

        for (const item of matchingItems) {
          console.log(
            `  Supply #${supply.id}` +
              ` | date=${formatDate(supply.date)}` +
              ` | SupplyItem #${item.id}` +
              ` | quantity=${item.quantity}` +
              ` | cost=${item.cost}` +
              ` | supplier="${supply.Supplier.name}"`
          );
        }
      }

      console.log(
        "  NOTE: SupplyItem has no batchId, so this is evidence only."
      );
    }

    /*
     * Movement evidence
     */

    console.log();
    console.log("MOVEMENT EVIDENCE:");

    const movementsBeforeOrAtExpiry = allMovements.filter(
      (movement) =>
        movement.productId === batch.productId &&
        movement.createdAt <= now
    );

    if (movementsBeforeOrAtExpiry.length === 0) {
      console.log("  — no movements");
    } else {
      /*
       * Only print movements explicitly mentioning this batch,
       * plus supply/sale/return history for the product.
       */

      const batchSpecific = movementsBeforeOrAtExpiry.filter(
        (movement) => {
          const comment = movement.comment ?? "";

          const batchPattern = new RegExp(
            `Batch\\s*#?\\s*${batch.id}(?!\\d)`
          );

          return batchPattern.test(comment);
        }
      );

      if (batchSpecific.length === 0) {
        console.log(
          "  — no Movement explicitly references this batch"
        );
      } else {
        for (const movement of batchSpecific) {
          console.log(
            `  Movement #${movement.id}` +
              ` | type=${movement.type}` +
              ` | quantity=${movement.quantity}` +
              ` | created=${formatDate(movement.createdAt)}` +
              ` | comment="${movement.comment ?? ""}"`
          );
        }
      }
    }

    /*
     * Historical order chronology
     */

    console.log();
    console.log("ORDER CHRONOLOGY:");

    const beforeExpirySales = batch.orderBatches.filter(
      (ob) =>
        ob.orderItem.order.date <= batch.expiryDate
    );

    if (beforeExpirySales.length === 0) {
      console.log("  — no sales linked to this batch before expiry");
    } else {
      for (const link of beforeExpirySales) {
        console.log(
          `  Order #${link.orderItem.orderId}` +
            ` | OrderItem #${link.orderItemId}` +
            ` | quantity=${link.quantity}` +
            ` | date=${formatDate(link.orderItem.order.date)}`
        );
      }
    }

    /*
     * Safety interpretation
     */

    console.log();
    console.log("INTERPRETATION:");

    if (batch.quantity <= 0) {
      console.log(
        "  🟢 No current stock remains in this batch."
      );
    } else if (batch.ReturnBatch.length > 0) {
      console.log(
        "  🟠 Batch has current stock AND historical returns."
      );
      console.log(
        "  Requires careful review before any write-off."
      );
    } else if (batch.orderBatches.length > 0) {
      console.log(
        "  🟡 Batch has current stock and existing sales."
      );
      console.log(
        "  Current quantity may represent legitimate unsold stock."
      );
      console.log(
        "  Expiry indicates it should no longer be sellable."
      );
    } else {
      console.log(
        "  🟡 Batch has current stock but no OrderBatch references."
      );
      console.log(
        "  It may be unsold supplied stock."
      );
      console.log(
        "  Expiry makes it a strong write-off candidate,"
      );
      console.log(
        "  but no database modification is authorized by this DRY-RUN."
      );
    }

    /*
     * Explicit safety decision.
     */

    console.log();
    console.log("DRY-RUN DECISION:");

    console.log(
      `  Batch #${batch.id} = REVIEW REQUIRED`
    );

    console.log(
      "  No automatic write-off is performed."
    );
  }

  separator();
  console.log("2. SUMMARY");
  separator();

  console.log();
  console.log(
    `Expired ACTIVE batches with stock = ${expiredActiveBatches.length}`
  );

  console.log(
    `Total currently expired stock = ${totalExpiredStock}`
  );

  console.log();

  for (const result of results) {
    console.log(
      `Batch #${result.batchId}` +
        ` | ${result.productName}` +
        ` | stock=${result.quantity}` +
        ` | received=${formatDate(result.receivedAt)}` +
        ` | expiry=${formatDate(result.expiryDate)}` +
        ` | OrderBatch=${result.orderBatchQty}` +
        ` | ReturnBatch=${result.returnBatchQty}` +
        ` | writeOffMovements=${result.writeOffMovements}`
    );
  }

  separator();
  console.log("3. CURRENT PRODUCT STOCK CROSS-CHECK");
  separator();

  const productIds = [
    ...new Set(expiredActiveBatches.map((batch) => batch.productId)),
  ];

  for (const productId of productIds) {
    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        batches: true,
      },
    });

    if (!product) continue;

    const batchTotal = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const expiredTotal = product.batches
      .filter(
        (batch) =>
          batch.status === "ACTIVE" &&
          batch.expiryDate < now &&
          batch.quantity > 0
      )
      .reduce((sum, batch) => sum + batch.quantity, 0);

    const nonExpiredTotal = product.batches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          !(
            batch.status === "ACTIVE" &&
            batch.expiryDate < now
          )
      )
      .reduce((sum, batch) => sum + batch.quantity, 0);

    console.log();
    console.log(
      `Product #${product.id} "${product.name}"`
    );

    console.log(`Product.stock       = ${product.stock}`);
    console.log(`Batch total         = ${batchTotal}`);
    console.log(`Expired ACTIVE      = ${expiredTotal}`);
    console.log(`Non-expired/other   = ${nonExpiredTotal}`);
    console.log(
      `stock difference    = ${product.stock - batchTotal}`
    );

    if (product.stock !== batchTotal) {
      console.log(
        "  🔴 Product.stock does NOT equal Batch total."
      );
    } else {
      console.log(
        "  🟢 Product.stock equals Batch total."
      );
    }

    if (expiredTotal > 0) {
      console.log(
        "  🟠 Current stock includes expired ACTIVE stock."
      );
    }
  }

  separator();
  console.log("4. SAFETY STATUS");
  separator();

  console.log();
  console.log("STRICT READ ONLY:");
  console.log("  Product             — NOT changed");
  console.log("  Product.stock       — NOT changed");
  console.log("  Batch               — NOT changed");
  console.log("  Movement            — NOT changed");
  console.log("  Order                — NOT changed");
  console.log("  OrderItem            — NOT changed");
  console.log("  OrderBatch           — NOT changed");
  console.log("  ReturnBatch           — NOT changed");
  console.log("  Supply               — NOT changed");
  console.log("  SupplyItem            — NOT changed");

  console.log();
  console.log(
    "IMPORTANT: Expired stock identified here is NOT automatically written off."
  );
  console.log(
    "Any APPLY operation must be reviewed separately."
  );

  console.log();
  console.log("🏁 DRY-RUN V25 COMPLETED");
  console.log();
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ DRY-RUN V25 FAILED");
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });