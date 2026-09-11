// scripts/diagnose-returnbatch-1.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RETURN_BATCH_ID = 1;

type SoldBatchInfo = {
  batchId: number;
  sold: number;
  returned: number;
  remainingReturnCapacity: number;
  purchaseCost: number;
  expiryDate: Date;
  receivedAt: Date;
  status: string;
};

function line(char = "-", length = 78) {
  console.log(char.repeat(length));
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "null";

  return date.toISOString();
}

async function main() {
  console.log("");
  line("=");
  console.log("RETURNBATCH #1 DIAGNOSTIC");
  console.log("STRICT DRY-RUN / READ ONLY");
  line("=");

  console.log("");
  console.log(`Target ReturnBatch ID: #${RETURN_BATCH_ID}`);
  console.log("");
  console.log("IMPORTANT:");
  console.log("This script performs NO database modifications.");
  console.log("");

  // ============================================================
  // 1. LOAD RETURNBATCH
  // ============================================================

  line("=");
  console.log("1. LOAD TARGET RETURNBATCH");
  line("=");

  const returnBatch = await prisma.returnBatch.findUnique({
    where: {
      id: RETURN_BATCH_ID,
    },
    include: {
      OrderItem: {
        include: {
          product: true,
          order: {
            include: {
              customer: true,
            },
          },
          batches: {
            include: {
              batch: {
                include: {
                  product: true,
                },
              },
            },
          },
          ReturnBatch: {
            include: {
              Batch: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      },
      Batch: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!returnBatch) {
    console.log("");
    console.log(`❌ ReturnBatch #${RETURN_BATCH_ID} NOT FOUND`);
    console.log("");
    return;
  }

  console.log("");
  console.log(`ReturnBatch #${returnBatch.id}`);
  console.log(`quantity=${returnBatch.quantity}`);
  console.log(`createdAt=${formatDate(returnBatch.createdAt)}`);
  console.log(`orderItemId=${returnBatch.orderItemId}`);
  console.log(`batchId=${returnBatch.batchId}`);

  console.log("");

  console.log("ReturnBatch Batch:");
  console.log(`  Batch #${returnBatch.Batch.id}`);
  console.log(`  Product #${returnBatch.Batch.product.id}`);
  console.log(`  Product="${returnBatch.Batch.product.name}"`);
  console.log(`  quantity=${returnBatch.Batch.quantity}`);
  console.log(`  purchaseCost=${returnBatch.Batch.purchaseCost}`);
  console.log(`  receivedAt=${formatDate(returnBatch.Batch.receivedAt)}`);
  console.log(`  expiryDate=${formatDate(returnBatch.Batch.expiryDate)}`);
  console.log(`  status=${returnBatch.Batch.status}`);

  // ============================================================
  // 2. LOAD ORDERITEM CONTEXT
  // ============================================================

  line("=");
  console.log("2. ORDERITEM CONTEXT");
  line("=");

  const orderItem = returnBatch.OrderItem;

  console.log("");
  console.log(`OrderItem #${orderItem.id}`);
  console.log(`Order #${orderItem.order.id}`);
  console.log(`Product #${orderItem.product.id}`);
  console.log(`Product="${orderItem.product.name}"`);
  console.log(`quantity sold=${orderItem.quantity}`);
  console.log(`returned field=${orderItem.returned}`);
  console.log(`price=${orderItem.price}`);

  console.log("");

  console.log("Order:");
  console.log(`  Order #${orderItem.order.id}`);
  console.log(`  date=${formatDate(orderItem.order.date)}`);
  console.log(`  total=${orderItem.order.total}`);
  console.log(`  profit=${orderItem.order.profit}`);
  console.log(`  status=${orderItem.order.status}`);

  if (orderItem.order.customer) {
    console.log("");
    console.log("Customer:");
    console.log(`  Customer #${orderItem.order.customer.id}`);
    console.log(`  name="${orderItem.order.customer.name}"`);
  }

  // ============================================================
  // 3. ORDERBATCH ANALYSIS
  // ============================================================

  line("=");
  console.log("3. ORDERBATCH ANALYSIS");
  line("=");

  console.log("");

  if (orderItem.batches.length === 0) {
    console.log("🔴 CRITICAL: OrderItem has NO OrderBatch records.");
  } else {
    console.log(
      `OrderItem #${orderItem.id} has ${orderItem.batches.length} OrderBatch record(s):`
    );

    for (const orderBatch of orderItem.batches) {
      console.log("");
      console.log(
        `OrderBatch #${orderBatch.id} | Batch #${orderBatch.batch.id}`
      );
      console.log(`  sold quantity=${orderBatch.quantity}`);
      console.log(`  purchaseCost=${orderBatch.purchaseCost}`);
      console.log(`  Batch product="${orderBatch.batch.product.name}"`);
      console.log(`  Batch productId=${orderBatch.batch.productId}`);
      console.log(`  Batch receivedAt=${formatDate(orderBatch.batch.receivedAt)}`);
      console.log(`  Batch expiryDate=${formatDate(orderBatch.batch.expiryDate)}`);
      console.log(`  Batch status=${orderBatch.batch.status}`);
      console.log(`  Batch current quantity=${orderBatch.batch.quantity}`);

      if (orderBatch.batch.productId !== orderItem.productId) {
        console.log("");
        console.log(
          "🔴 CRITICAL: OrderBatch batch belongs to a different product!"
        );
      }
    }
  }

  // ============================================================
  // 4. SUM SOLD QUANTITY
  // ============================================================

  line("=");
  console.log("4. ORDERBATCH QUANTITY INTEGRITY");
  line("=");

  const totalSoldFromOrderBatches = orderItem.batches.reduce(
    (sum, orderBatch) => sum + orderBatch.quantity,
    0
  );

  console.log("");
  console.log(`OrderItem.quantity=${orderItem.quantity}`);
  console.log(`SUM(OrderBatch.quantity)=${totalSoldFromOrderBatches}`);

  if (totalSoldFromOrderBatches === orderItem.quantity) {
    console.log("");
    console.log("🟢 PASS: OrderBatch total matches OrderItem.quantity");
  } else {
    console.log("");
    console.log(
      "🔴 CRITICAL: OrderBatch total DOES NOT match OrderItem.quantity"
    );
  }

  // ============================================================
  // 5. LOAD ALL RETURNBATCH RECORDS FOR THIS ORDERITEM
  // ============================================================

  line("=");
  console.log("5. ALL RETURNS FOR THIS ORDERITEM");
  line("=");

  const allReturnsForOrderItem = await prisma.returnBatch.findMany({
    where: {
      orderItemId: orderItem.id,
    },
    include: {
      Batch: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("");

  if (allReturnsForOrderItem.length === 0) {
    console.log("No ReturnBatch records found.");
  } else {
    console.log(
      `Found ${allReturnsForOrderItem.length} ReturnBatch record(s):`
    );

    for (const rb of allReturnsForOrderItem) {
      console.log("");
      console.log(
        `ReturnBatch #${rb.id} | Batch #${rb.batchId} | quantity=${rb.quantity}`
      );
      console.log(`  createdAt=${formatDate(rb.createdAt)}`);
      console.log(`  Batch product="${rb.Batch.product.name}"`);
      console.log(`  Batch productId=${rb.Batch.productId}`);
    }
  }

  const totalReturnedFromReturnBatches = allReturnsForOrderItem.reduce(
    (sum, rb) => sum + rb.quantity,
    0
  );

  console.log("");
  console.log(
    `SUM(ReturnBatch.quantity)=${totalReturnedFromReturnBatches}`
  );
  console.log(`OrderItem.returned=${orderItem.returned}`);

  if (totalReturnedFromReturnBatches === orderItem.returned) {
    console.log("");
    console.log(
      "🟢 PASS: SUM(ReturnBatch.quantity) matches OrderItem.returned"
    );
  } else {
    console.log("");
    console.log(
      "🔴 CRITICAL: ReturnBatch total DOES NOT match OrderItem.returned"
    );
  }

  if (totalReturnedFromReturnBatches <= orderItem.quantity) {
    console.log("");
    console.log(
      "🟢 PASS: Total returned quantity does not exceed sold quantity"
    );
  } else {
    console.log("");
    console.log(
      "🔴 CRITICAL: Total returned quantity exceeds OrderItem.quantity"
    );
  }

  // ============================================================
  // 6. CHECK RETURNED BATCH AGAINST SOLD BATCHES
  // ============================================================

  line("=");
  console.log("6. RETURNBATCH BATCH ↔ ORDERBATCH BATCH INTEGRITY");
  line("=");

  const soldBatchIds = new Set(
    orderItem.batches.map((orderBatch) => orderBatch.batchId)
  );

  console.log("");
  console.log(`ReturnBatch #${returnBatch.id}`);
  console.log(`Returned Batch #${returnBatch.batchId}`);

  console.log("");

  console.log(
    `Sold Batch IDs: ${
      soldBatchIds.size > 0
        ? Array.from(soldBatchIds)
            .sort((a, b) => a - b)
            .map((id) => `#${id}`)
            .join(", ")
        : "NONE"
    }`
  );

  console.log("");

  if (soldBatchIds.has(returnBatch.batchId)) {
    console.log(
      "🟢 PASS: ReturnBatch refers to a batch that was actually sold."
    );
  } else {
    console.log(
      "🔴 CRITICAL: ReturnBatch refers to a batch that was NOT sold in this OrderItem."
    );
    console.log("");
    console.log(
      `ReturnBatch #${returnBatch.id} → Batch #${returnBatch.batchId}`
    );
    console.log(
      `OrderItem #${orderItem.id} was sold from different batch(es).`
    );
  }

  // ============================================================
  // 7. PER-BATCH SOLD ↔ RETURNED ANALYSIS
  // ============================================================

  line("=");
  console.log("7. RETURNED QUANTITY ≤ SOLD QUANTITY PER BATCH");
  line("=");

  const soldByBatch = new Map<number, SoldBatchInfo>();

  for (const orderBatch of orderItem.batches) {
    const existing = soldByBatch.get(orderBatch.batchId);

    if (existing) {
      existing.sold += orderBatch.quantity;
    } else {
      soldByBatch.set(orderBatch.batchId, {
        batchId: orderBatch.batchId,
        sold: orderBatch.quantity,
        returned: 0,
        remainingReturnCapacity: orderBatch.quantity,
        purchaseCost: orderBatch.purchaseCost,
        expiryDate: orderBatch.batch.expiryDate,
        receivedAt: orderBatch.batch.receivedAt,
        status: orderBatch.batch.status,
      });
    }
  }

  for (const rb of allReturnsForOrderItem) {
    const soldInfo = soldByBatch.get(rb.batchId);

    if (soldInfo) {
      soldInfo.returned += rb.quantity;
    }
  }

  // Add batches that exist in ReturnBatch but not in OrderBatch
  for (const rb of allReturnsForOrderItem) {
    if (!soldByBatch.has(rb.batchId)) {
      soldByBatch.set(rb.batchId, {
        batchId: rb.batchId,
        sold: 0,
        returned: rb.quantity,
        remainingReturnCapacity: -rb.quantity,
        purchaseCost: 0,
        expiryDate: rb.Batch.expiryDate,
        receivedAt: rb.Batch.receivedAt,
        status: rb.Batch.status,
      });
    }
  }

  console.log("");

  const sortedBatchAnalysis = Array.from(soldByBatch.values()).sort(
    (a, b) => a.batchId - b.batchId
  );

  let criticalBatchFailures = 0;

  for (const info of sortedBatchAnalysis) {
    info.remainingReturnCapacity = info.sold - info.returned;

    console.log(
      `Batch #${info.batchId} | sold=${info.sold} | returned=${info.returned}`
    );

    console.log(
      `  remaining return capacity=${info.remainingReturnCapacity}`
    );

    if (info.returned <= info.sold) {
      console.log("  🟢 PASS");
    } else {
      criticalBatchFailures++;

      console.log(
        "  🔴 CRITICAL: returned quantity exceeds sold quantity"
      );
    }

    console.log("");
  }

  // ============================================================
  // 8. TARGET RETURNBATCH #1 SPECIFIC ANALYSIS
  // ============================================================

  line("=");
  console.log("8. TARGET RETURNBATCH #1 SPECIFIC ANALYSIS");
  line("=");

  console.log("");

  const targetSoldInfo = soldByBatch.get(returnBatch.batchId);

  if (!targetSoldInfo) {
    console.log(
      `🔴 CRITICAL: Batch #${returnBatch.batchId} was not found in OrderBatch data.`
    );
  } else {
    console.log(`ReturnBatch #${returnBatch.id}`);
    console.log(`Batch #${returnBatch.batchId}`);
    console.log(`sold=${targetSoldInfo.sold}`);
    console.log(`returned=${targetSoldInfo.returned}`);

    if (targetSoldInfo.returned > targetSoldInfo.sold) {
      console.log("");
      console.log(
        "🔴 CRITICAL: ReturnBatch allocation is impossible for this batch."
      );
    }
  }

  // ============================================================
  // 9. FIND POSSIBLE CORRECT BATCH FOR THE RETURN
  // ============================================================

  line("=");
  console.log("9. POSSIBLE VALID RETURN BATCHES");
  line("=");

  console.log("");
  console.log(
    "The following batches were actually sold and may have remaining return capacity:"
  );
  console.log("");

  const candidates = Array.from(soldByBatch.values())
    .filter((info) => info.sold > info.returned)
    .sort((a, b) => {
      const expiryCompare =
        a.expiryDate.getTime() - b.expiryDate.getTime();

      if (expiryCompare !== 0) {
        return expiryCompare;
      }

      const receivedCompare =
        a.receivedAt.getTime() - b.receivedAt.getTime();

      if (receivedCompare !== 0) {
        return receivedCompare;
      }

      return a.batchId - b.batchId;
    });

  if (candidates.length === 0) {
    console.log(
      "⚠️ No sold batches have remaining return capacity."
    );
  } else {
    for (const candidate of candidates) {
      console.log(
        `Batch #${candidate.batchId} | sold=${candidate.sold} | returned=${candidate.returned} | available=${candidate.remainingReturnCapacity}`
      );

      console.log(
        `  receivedAt=${formatDate(candidate.receivedAt)}`
      );

      console.log(
        `  expiryDate=${formatDate(candidate.expiryDate)}`
      );

      console.log(`  status=${candidate.status}`);
      console.log("");
    }
  }

  // ============================================================
  // 10. PRODUCT CONSISTENCY
  // ============================================================

  line("=");
  console.log("10. PRODUCT CONSISTENCY");
  line("=");

  console.log("");

  console.log(
    `OrderItem Product #${orderItem.productId} "${orderItem.product.name}"`
  );

  console.log(
    `ReturnBatch Batch Product #${returnBatch.Batch.productId} "${returnBatch.Batch.product.name}"`
  );

  if (
    orderItem.productId === returnBatch.Batch.productId
  ) {
    console.log("");
    console.log(
      "🟢 PASS: ReturnBatch batch belongs to the same product."
    );
  } else {
    console.log("");
    console.log(
      "🔴 CRITICAL: ReturnBatch batch belongs to another product!"
    );
  }

  // ============================================================
  // 11. DIAGNOSTIC CONCLUSION
  // ============================================================

  line("=");
  console.log("11. DIAGNOSTIC CONCLUSION");
  line("=");

  console.log("");

  console.log(`Target ReturnBatch: #${returnBatch.id}`);
  console.log(`OrderItem: #${orderItem.id}`);
  console.log(`Order: #${orderItem.orderId}`);
  console.log(`Product: "${orderItem.product.name}"`);
  console.log("");

  console.log(`ReturnBatch batch: #${returnBatch.batchId}`);
  console.log(
    `Actually sold batches: ${
      Array.from(soldBatchIds)
        .sort((a, b) => a - b)
        .map((id) => `#${id}`)
        .join(", ") || "NONE"
    }`
  );

  console.log("");

  let hasCriticalIssue = false;

  if (!soldBatchIds.has(returnBatch.batchId)) {
    hasCriticalIssue = true;

    console.log(
      "🔴 CRITICAL ISSUE CONFIRMED:"
    );

    console.log(
      `ReturnBatch #${returnBatch.id} points to Batch #${returnBatch.batchId},`
    );

    console.log(
      "but that batch is not present among the OrderBatch records"
    );

    console.log(
      `for OrderItem #${orderItem.id}.`
    );

    console.log("");
  }

  if (
    targetSoldInfo &&
    targetSoldInfo.returned > targetSoldInfo.sold
  ) {
    hasCriticalIssue = true;

    console.log(
      "🔴 PER-BATCH RETURN LIMIT FAILURE CONFIRMED:"
    );

    console.log(
      `Batch #${returnBatch.batchId}: sold=${targetSoldInfo.sold}, returned=${targetSoldInfo.returned}`
    );

    console.log("");
  }

  if (criticalBatchFailures > 0) {
    hasCriticalIssue = true;

    console.log(
      `🔴 Batch integrity failures detected: ${criticalBatchFailures}`
    );

    console.log("");
  }

  if (!hasCriticalIssue) {
    console.log(
      "🟢 No critical ReturnBatch allocation problem detected."
    );
  }

  console.log("");

  line("=");
  console.log("FINAL DRY-RUN STATUS");
  line("=");

  console.log("");

  console.log("NO DATABASE CHANGES WERE MADE.");
  console.log("NO ReturnBatch UPDATED.");
  console.log("NO ReturnBatch DELETED.");
  console.log("NO OrderBatch UPDATED.");
  console.log("NO OrderItem UPDATED.");
  console.log("NO Batch UPDATED.");
  console.log("NO Product UPDATED.");
  console.log("NO Movement CREATED.");
  console.log("");

  if (hasCriticalIssue) {
    console.log(
      "🔴 RETURNBATCH #1 REQUIRES A SEPARATE REPAIR PLAN."
    );
    console.log(
      "This diagnostic script DOES NOT authorize automatic repair."
    );
  } else {
    console.log(
      "🟢 RETURNBATCH #1 PASSED THE CHECKS PERFORMED BY THIS SCRIPT."
    );
  }

  console.log("");
  console.log("🏁 RETURNBATCH #1 DIAGNOSTIC COMPLETED");
}

main()
  .catch((error) => {
    console.error("");
    line("=");
    console.error("❌ DIAGNOSTIC ERROR");
    line("=");

    console.error("");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });