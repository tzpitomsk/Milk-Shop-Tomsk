import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IssueLevel = "CRITICAL" | "WARNING";

interface Issue {
  level: IssueLevel;
  message: string;
}

function money(value: number): string {
  return `${value} ₽`;
}

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

async function main(): Promise<void> {
  console.log("");
  console.log(
    "=============================================================================="
  );
  console.log(
    "V35 — RETURNBATCH AMBIGUITY / NET PROFIT READ-ONLY AUDIT"
  );
  console.log(
    "STRICT READ ONLY — DATABASE WILL NOT BE MODIFIED"
  );
  console.log(
    "=============================================================================="
  );
  console.log("");

  const issues: Issue[] = [];

  // ===========================================================================
  // 1. LOAD ALL ORDERS
  // ===========================================================================

  console.log("1. LOADING ORDERS");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const orders = await prisma.order.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      items: {
        orderBy: {
          id: "asc",
        },
        include: {
          product: true,
          batches: {
            orderBy: {
              id: "asc",
            },
            include: {
              batch: true,
            },
          },
          ReturnBatch: {
            orderBy: {
              id: "asc",
            },
            include: {
              Batch: true,
            },
          },
        },
      },
    },
  });

  console.log(`Orders found=${orders.length}`);
  console.log("");

  if (orders.length === 0) {
    console.log("ℹ️ No orders currently exist.");
    console.log(
      "V35 will still verify the database-level OrderBatch/ReturnBatch structures."
    );
    console.log("");
  }

  // ===========================================================================
  // 2. GLOBAL COUNTS
  // ===========================================================================

  console.log("2. GLOBAL COUNTS");
  console.log(
    "------------------------------------------------------------------------------"
  );

  const [
    productCount,
    batchCount,
    orderItemCount,
    orderBatchCount,
    returnBatchCount,
    movementCount,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.batch.count(),
    prisma.orderItem.count(),
    prisma.orderBatch.count(),
    prisma.returnBatch.count(),
    prisma.movement.count(),
  ]);

  console.log(`Products=${productCount}`);
  console.log(`Batches=${batchCount}`);
  console.log(`OrderItems=${orderItemCount}`);
  console.log(`OrderBatches=${orderBatchCount}`);
  console.log(`ReturnBatches=${returnBatchCount}`);
  console.log(`Movements=${movementCount}`);
  console.log("");

  // ===========================================================================
  // 3. ORDERITEM → ORDERBATCH DUPLICATE ANALYSIS
  // ===========================================================================

  console.log("3. ORDERITEM → ORDERBATCH DUPLICATE ANALYSIS");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let duplicateOrderBatchGroups = 0;
  let duplicateOrderBatchRows = 0;
  let ambiguousReturnedGroups = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const byBatch = new Map<number, typeof item.batches>();

      for (const orderBatch of item.batches) {
        const rows = byBatch.get(orderBatch.batchId) ?? [];
        rows.push(orderBatch);
        byBatch.set(orderBatch.batchId, rows);
      }

      for (const [batchId, rows] of byBatch.entries()) {
        if (rows.length <= 1) {
          continue;
        }

        duplicateOrderBatchGroups += 1;
        duplicateOrderBatchRows += rows.length;

        const soldQuantity = rows.reduce(
          (sum, row) => sum + row.quantity,
          0
        );

        const purchaseCosts = Array.from(
          new Set(rows.map((row) => row.purchaseCost))
        );

        const returnedQuantity = item.ReturnBatch
          .filter((itemReturn) => itemReturn.batchId === batchId)
          .reduce(
            (sum, itemReturn) => sum + itemReturn.quantity,
            0
          );

        console.log(
          `Order #${order.id} | OrderItem #${item.id} | ` +
            `Batch #${batchId} | duplicate OrderBatch rows=${rows.length} | ` +
            `sold=${soldQuantity} | returned=${returnedQuantity} | ` +
            `purchaseCosts=[${purchaseCosts.join(", ")}]`
        );

        if (returnedQuantity > 0) {
          ambiguousReturnedGroups += 1;

          if (purchaseCosts.length > 1) {
            addIssue(
              issues,
              "CRITICAL",
              `Order #${order.id}, OrderItem #${item.id}, Batch #${batchId}: ` +
                `multiple OrderBatch rows have different purchaseCost snapshots ` +
                `(${purchaseCosts.join(", ")}), while ReturnBatch quantity=${returnedQuantity}. ` +
                `ReturnBatch has no orderBatchId, so exact historical cost attribution is ambiguous.`
            );
          } else {
            addIssue(
              issues,
              "CRITICAL",
              `Order #${order.id}, OrderItem #${item.id}, Batch #${batchId}: ` +
                `multiple OrderBatch rows reference the same Batch and a return exists. ` +
                `Current return-profit calculation can subtract the returned quantity ` +
                `once per duplicate OrderBatch row.`
            );
          }
        } else {
          addIssue(
            issues,
            "WARNING",
            `Order #${order.id}, OrderItem #${item.id}, Batch #${batchId}: ` +
              `multiple OrderBatch rows reference the same Batch, but no return currently uses this Batch.`
          );
        }
      }
    }
  }

  console.log("");
  console.log(
    `Duplicate OrderItem+Batch groups=${duplicateOrderBatchGroups}`
  );
  console.log(
    `Rows participating in duplicate groups=${duplicateOrderBatchRows}`
  );
  console.log(
    `Duplicate groups with ReturnBatch=${ambiguousReturnedGroups}`
  );
  console.log("");

  if (duplicateOrderBatchGroups === 0) {
    console.log("🟢 No duplicate OrderItem → Batch references found");
  } else {
    console.log(
      "⚠️ Duplicate OrderItem → Batch references require attention"
    );
  }

  console.log("");

  // ===========================================================================
  // 4. ORDERBATCH QUANTITY CONSISTENCY
  // ===========================================================================

  console.log("4. ORDERBATCH QUANTITY CONSISTENCY");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let orderBatchQuantityCritical = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const soldFromOrderBatch = item.batches.reduce(
        (sum, orderBatch) => sum + orderBatch.quantity,
        0
      );

      if (soldFromOrderBatch !== item.quantity) {
        orderBatchQuantityCritical += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Order #${order.id}, OrderItem #${item.id}: ` +
            `SUM(OrderBatch.quantity)=${soldFromOrderBatch}, ` +
            `OrderItem.quantity=${item.quantity}.`
        );

        console.log(
          `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
            `OrderBatch total=${soldFromOrderBatch} | ` +
            `OrderItem quantity=${item.quantity}`
        );
      }
    }
  }

  if (orderBatchQuantityCritical === 0) {
    console.log(
      "🟢 All OrderItem quantities equal SUM(OrderBatch.quantity)"
    );
  }

  console.log("");

  // ===========================================================================
  // 5. RETURNBATCH QUANTITY CONSISTENCY
  // ===========================================================================

  console.log("5. RETURNBATCH QUANTITY CONSISTENCY");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let returnQuantityCritical = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const returnedFromHistory = item.ReturnBatch.reduce(
        (sum, itemReturn) => sum + itemReturn.quantity,
        0
      );

      if (returnedFromHistory !== item.returned) {
        returnQuantityCritical += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Order #${order.id}, OrderItem #${item.id}: ` +
            `SUM(ReturnBatch.quantity)=${returnedFromHistory}, ` +
            `OrderItem.returned=${item.returned}.`
        );

        console.log(
          `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
            `ReturnBatch total=${returnedFromHistory} | ` +
            `returned=${item.returned}`
        );
      }

      if (item.returned > item.quantity) {
        returnQuantityCritical += 1;

        addIssue(
          issues,
          "CRITICAL",
          `Order #${order.id}, OrderItem #${item.id}: ` +
            `returned=${item.returned} exceeds quantity=${item.quantity}.`
        );

        console.log(
          `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
            `returned=${item.returned} > quantity=${item.quantity}`
        );
      }
    }
  }

  if (returnQuantityCritical === 0) {
    console.log(
      "🟢 All OrderItem.returned values match ReturnBatch history"
    );
  }

  console.log("");

  // ===========================================================================
  // 6. RETURNED QUANTITY PER BATCH
  // ===========================================================================

  console.log("6. RETURNED QUANTITY PER BATCH");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let batchReturnCritical = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const soldByBatch = new Map<number, number>();
      const returnedByBatch = new Map<number, number>();

      for (const orderBatch of item.batches) {
        soldByBatch.set(
          orderBatch.batchId,
          (soldByBatch.get(orderBatch.batchId) ?? 0) +
            orderBatch.quantity
        );
      }

      for (const itemReturn of item.ReturnBatch) {
        returnedByBatch.set(
          itemReturn.batchId,
          (returnedByBatch.get(itemReturn.batchId) ?? 0) +
            itemReturn.quantity
        );
      }

      const allBatchIds = new Set<number>([
        ...soldByBatch.keys(),
        ...returnedByBatch.keys(),
      ]);

      for (const batchId of allBatchIds) {
        const sold = soldByBatch.get(batchId) ?? 0;
        const returned = returnedByBatch.get(batchId) ?? 0;

        if (returned > sold) {
          batchReturnCritical += 1;

          addIssue(
            issues,
            "CRITICAL",
            `Order #${order.id}, OrderItem #${item.id}, Batch #${batchId}: ` +
              `returned=${returned} exceeds sold=${sold}.`
          );

          console.log(
            `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
              `Batch #${batchId} | sold=${sold} | returned=${returned}`
          );
        }
      }
    }
  }

  if (batchReturnCritical === 0) {
    console.log(
      "🟢 No Batch has returned quantity greater than sold quantity"
    );
  }

  console.log("");

  // ===========================================================================
  // 7. ROBUST NET COST / PROFIT RECONSTRUCTION
  // ===========================================================================

  console.log("7. ROBUST NET COST / PROFIT RECONSTRUCTION");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let profitMismatchCount = 0;
  let profitAmbiguityCount = 0;

  for (const order of orders) {
    let expectedOrderTotal = 0;
    let expectedOrderProfit = 0;

    console.log(`Order #${order.id}`);

    for (const item of order.items) {
      const revenue =
        (item.quantity - item.returned) * item.price;

      const originalCost = item.batches.reduce(
        (sum, orderBatch) =>
          sum +
          orderBatch.quantity * orderBatch.purchaseCost,
        0
      );

      const returnedCost = item.ReturnBatch.reduce(
        (sum, itemReturn) =>
          sum +
          itemReturn.quantity * itemReturn.Batch.purchaseCost,
        0
      );

      const netCost = originalCost - returnedCost;
      const itemProfit = revenue - netCost;

      expectedOrderTotal += revenue;
      expectedOrderProfit += itemProfit;

      const batchIds = new Map<number, number>();

      for (const orderBatch of item.batches) {
        batchIds.set(
          orderBatch.batchId,
          (batchIds.get(orderBatch.batchId) ?? 0) + 1
        );
      }

      const duplicateBatchIds = Array.from(
        batchIds.entries()
      ).filter(([, count]) => count > 1);

      if (duplicateBatchIds.length > 0) {
        for (const [batchId] of duplicateBatchIds) {
          const costs = Array.from(
            new Set(
              item.batches
                .filter(
                  (orderBatch) =>
                    orderBatch.batchId === batchId
                )
                .map(
                  (orderBatch) =>
                    orderBatch.purchaseCost
                )
            )
          );

          const returnedQuantityForBatch =
            item.ReturnBatch
              .filter(
                (itemReturn) =>
                  itemReturn.batchId === batchId
              )
              .reduce(
                (sum, itemReturn) =>
                  sum + itemReturn.quantity,
                0
              );

          if (
            returnedQuantityForBatch > 0 &&
            costs.length > 1
          ) {
            profitAmbiguityCount += 1;
          }
        }
      }

      console.log(
        `  OrderItem #${item.id} | ` +
          `qty=${item.quantity} | returned=${item.returned} | ` +
          `revenue=${money(revenue)} | ` +
          `originalCost=${money(originalCost)} | ` +
          `returnedCost=${money(returnedCost)} | ` +
          `netCost=${money(netCost)} | ` +
          `profit=${money(itemProfit)}`
      );
    }

    console.log(
      `  Expected total=${money(expectedOrderTotal)} | ` +
        `Stored total=${money(order.total)}`
    );

    console.log(
      `  Expected profit=${money(expectedOrderProfit)} | ` +
        `Stored profit=${money(order.profit)}`
    );

    if (expectedOrderTotal !== order.total) {
      profitMismatchCount += 1;

      addIssue(
        issues,
        "CRITICAL",
        `Order #${order.id}: stored total=${order.total}, ` +
          `but reconstructed NET total=${expectedOrderTotal}.`
      );

      console.log("  🔴 ORDER TOTAL MISMATCH");
    }

    if (expectedOrderProfit !== order.profit) {
      profitMismatchCount += 1;

      addIssue(
        issues,
        "CRITICAL",
        `Order #${order.id}: stored profit=${order.profit}, ` +
          `but reconstructed NET profit=${expectedOrderProfit}.`
      );

      console.log("  🔴 ORDER PROFIT MISMATCH");
    }

    console.log("");
  }

  if (profitAmbiguityCount > 0) {
    console.log(
      `🔴 Historical cost ambiguity cases=${profitAmbiguityCount}`
    );
  }

  if (profitMismatchCount === 0) {
    console.log(
      "🟢 Stored Order.total / Order.profit match robust NET reconstruction"
    );
  }

  console.log("");

  // ===========================================================================
  // 8. CURRENT RETURN ROUTE DOUBLE-SUBTRACTION RISK
  // ===========================================================================

  console.log("8. CURRENT RETURN PROFIT DOUBLE-SUBTRACTION RISK");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let doubleSubtractionRiskCount = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const duplicateBatchIds = new Set<number>();

      const countByBatch = new Map<number, number>();

      for (const orderBatch of item.batches) {
        countByBatch.set(
          orderBatch.batchId,
          (countByBatch.get(orderBatch.batchId) ?? 0) + 1
        );
      }

      for (const [batchId, count] of countByBatch.entries()) {
        if (count > 1) {
          duplicateBatchIds.add(batchId);
        }
      }

      for (const batchId of duplicateBatchIds) {
        const returnedQuantity =
          item.ReturnBatch
            .filter(
              (itemReturn) =>
                itemReturn.batchId === batchId
            )
            .reduce(
              (sum, itemReturn) =>
                sum + itemReturn.quantity,
              0
            );

        if (returnedQuantity <= 0) {
          continue;
        }

        const currentRouteSubtraction =
          item.batches
            .filter(
              (orderBatch) =>
                orderBatch.batchId === batchId
            )
            .reduce(
              (sum) =>
                sum + returnedQuantity,
              0
            );

        if (currentRouteSubtraction > returnedQuantity) {
          doubleSubtractionRiskCount += 1;

          addIssue(
            issues,
            "CRITICAL",
            `Order #${order.id}, OrderItem #${item.id}, Batch #${batchId}: ` +
              `ReturnBatch quantity=${returnedQuantity}, but the current ` +
              `per-OrderBatch profit loop would subtract that returned quantity ` +
              `${item.batches.filter((b) => b.batchId === batchId).length} times ` +
              `from cost.`
          );

          console.log(
            `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
              `Batch #${batchId} | actual returned=${returnedQuantity} | ` +
              `current-loop subtraction units=${currentRouteSubtraction}`
          );
        }
      }
    }
  }

  if (doubleSubtractionRiskCount === 0) {
    console.log(
      "🟢 No active double-subtraction case detected"
    );
  }

  console.log("");

  // ===========================================================================
  // 9. RETURNBATCH PRODUCT / BATCH CONSISTENCY
  // ===========================================================================

  console.log("9. RETURNBATCH PRODUCT / BATCH CONSISTENCY");
  console.log(
    "------------------------------------------------------------------------------"
  );

  let returnBatchProductCritical = 0;

  for (const order of orders) {
    for (const item of order.items) {
      for (const itemReturn of item.ReturnBatch) {
        const matchingOrderBatch = item.batches.filter(
          (orderBatch) =>
            orderBatch.batchId === itemReturn.batchId
        );

        if (matchingOrderBatch.length === 0) {
          returnBatchProductCritical += 1;

          addIssue(
            issues,
            "CRITICAL",
            `Order #${order.id}, OrderItem #${item.id}: ` +
              `ReturnBatch #${itemReturn.id} references Batch #${itemReturn.batchId}, ` +
              `but this Batch was never present in OrderBatch history for this OrderItem.`
          );

          console.log(
            `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
              `ReturnBatch #${itemReturn.id} | Batch #${itemReturn.batchId} ` +
              `is not present in original OrderBatch history`
          );

          continue;
        }

        if (item.productId !== itemReturn.Batch.productId) {
          returnBatchProductCritical += 1;

          addIssue(
            issues,
            "CRITICAL",
            `Order #${order.id}, OrderItem #${item.id}: ` +
              `ReturnBatch #${itemReturn.id} references Batch #${itemReturn.batchId} ` +
              `belonging to Product #${itemReturn.Batch.productId}, ` +
              `while OrderItem belongs to Product #${item.productId}.`
          );

          console.log(
            `🔴 Order #${order.id} | OrderItem #${item.id} | ` +
              `ReturnBatch #${itemReturn.id}: product mismatch`
          );
        }
      }
    }
  }

  if (returnBatchProductCritical === 0) {
    console.log(
      "🟢 All ReturnBatch records point to the correct product"
    );
  }

  console.log("");

  // ===========================================================================
  // 10. SUMMARY
  // ===========================================================================

  console.log(
    "=============================================================================="
  );
  console.log("V35 FINAL RESULT");
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

  console.log(`Orders=${orders.length}`);
  console.log(`OrderItems=${orderItemCount}`);
  console.log(`OrderBatches=${orderBatchCount}`);
  console.log(`ReturnBatches=${returnBatchCount}`);
  console.log("");

  console.log(`Critical=${criticalCount}`);
  console.log(`Warnings=${warningCount}`);
  console.log("");

  if (issues.length > 0) {
    console.log("ISSUES:");
    console.log("");

    for (const issue of issues) {
      const prefix =
        issue.level === "CRITICAL" ? "🔴" : "🟡";

      console.log(`${prefix} ${issue.message}`);
    }

    console.log("");
  }

  if (criticalCount === 0) {
    console.log("🟢 V35 READ-ONLY AUDIT PASSED");
  } else {
    console.log("🔴 V35 READ-ONLY AUDIT FAILED");
  }

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
  console.log(
    "NO Movement changed."
  );
  console.log("");

  console.log(
    "DATABASE WAS NOT MODIFIED."
  );
  console.log("");

  console.log(
    "=============================================================================="
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 V35 AUDIT FAILED TO EXECUTE");
    console.error("");
    console.error(error);
    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });