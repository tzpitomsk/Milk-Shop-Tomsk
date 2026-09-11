import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HISTORICAL_SKIP_ORDERS = new Set([
  4,
  5,
  11,
  12,
  16,
  18,
  19,
  20,
  23,
]);

function money(value: number) {
  return `${value} ₽`;
}

function fmtDate(date: Date) {
  return date.toISOString();
}

function section(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

async function main() {
  const auditAt = new Date();

  console.log("🔎 V34 FINAL READ-ONLY AUDIT");
  console.log(`Audit time: ${fmtDate(auditAt)}`);
  console.log("⚠️ DATABASE WILL NOT BE MODIFIED");

  let critical = 0;
  let warnings = 0;

  // ---------------------------------------------------------------------------
  // LOAD
  // ---------------------------------------------------------------------------

  const [
    products,
    batches,
    orders,
    orderItems,
    orderBatches,
    returnBatches,
    movements,
    supplies,
    supplyItems,
  ] = await Promise.all([
    prisma.product.findMany({
      orderBy: { id: "asc" },
    }),

    prisma.batch.findMany({
      include: {
        product: true,
        orderBatches: {
          orderBy: { id: "asc" },
        },
        ReturnBatch: {
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),

    prisma.order.findMany({
      include: {
        items: {
          include: {
            product: true,
            batches: {
              orderBy: { id: "asc" },
            },
            ReturnBatch: {
              orderBy: { id: "asc" },
              include: {
                Batch: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),

    prisma.orderItem.findMany({
      orderBy: { id: "asc" },
    }),

    prisma.orderBatch.findMany({
      orderBy: { id: "asc" },
    }),

    prisma.returnBatch.findMany({
      orderBy: { id: "asc" },
    }),

    prisma.movement.findMany({
      orderBy: { id: "asc" },
    }),

    prisma.supply.findMany({
      orderBy: { id: "asc" },
    }),

    prisma.supplyItem.findMany({
      orderBy: { id: "asc" },
    }),
  ]);

  console.log(
    `Products=${products.length}, Batches=${batches.length}, Orders=${orders.length}, ` +
      `OrderItems=${orderItems.length}, OrderBatch=${orderBatches.length}, ` +
      `ReturnBatch=${returnBatches.length}, Movements=${movements.length}, ` +
      `Supplies=${supplies.length}, SupplyItems=${supplyItems.length}`
  );

  // ---------------------------------------------------------------------------
  // 1. PRODUCT STOCK <-> BATCH TOTAL
  // ---------------------------------------------------------------------------

  section("1. PRODUCT STOCK <-> BATCH TOTAL");

  let stockDiffCount = 0;

  for (const product of products) {
    const batchTotal = batches
      .filter((b) => b.productId === product.id)
      .reduce((sum, b) => sum + b.quantity, 0);

    const diff = product.stock - batchTotal;

    console.log(
      `Product #${product.id} ${product.name}: ` +
        `stock=${product.stock}, batchTotal=${batchTotal}, diff=${diff}`
    );

    if (diff !== 0) {
      stockDiffCount++;
      critical++;
      console.log("  ❌ CRITICAL: stock != batch total");
    }
  }

  if (stockDiffCount === 0) {
    console.log("✅ Product.stock == sum(Batch.quantity) for all products");
  }

  // ---------------------------------------------------------------------------
  // 2. CURRENT SELLABLE STOCK
  // ---------------------------------------------------------------------------

  section("2. CURRENT SELLABLE STOCK");

  let sellablePositive = 0;
  let expiredPositive = 0;
  let futurePositive = 0;
  let nonActivePositive = 0;

  for (const batch of batches) {
    if (batch.quantity <= 0) continue;

    if (batch.status !== "ACTIVE") {
      nonActivePositive++;

      console.log(
        `❌ Positive non-ACTIVE batch #${batch.id}: ` +
          `${batch.quantity} units, status=${batch.status}`
      );

      critical++;
      continue;
    }

    if (batch.expiryDate < auditAt) {
      expiredPositive++;

      console.log(
        `❌ Positive expired ACTIVE batch #${batch.id}: ` +
          `${batch.quantity} units, expiry=${fmtDate(batch.expiryDate)}`
      );

      critical++;
      continue;
    }

    if (batch.receivedAt > auditAt) {
      futurePositive++;

      console.log(
        `❌ Future-received positive batch #${batch.id}: ` +
          `received=${fmtDate(batch.receivedAt)}`
      );

      critical++;
      continue;
    }

    sellablePositive += batch.quantity;
  }

  console.log(`Sellable positive stock: ${sellablePositive}`);
  console.log(`Expired positive stock: ${expiredPositive}`);
  console.log(`Future positive stock: ${futurePositive}`);
  console.log(`Positive non-ACTIVE stock: ${nonActivePositive}`);

  if (
    expiredPositive === 0 &&
    futurePositive === 0 &&
    nonActivePositive === 0
  ) {
    console.log("✅ No invalid positive stock");
  }

  // ---------------------------------------------------------------------------
  // 3. BATCH DATE SANITY
  // ---------------------------------------------------------------------------

  section("3. BATCH DATE SANITY");

  let batchDateAnomalies = 0;

  for (const batch of batches) {
    if (batch.expiryDate < batch.receivedAt) {
      batchDateAnomalies++;

      const severity =
        batch.quantity > 0 ? "CRITICAL" : "WARN";

      console.log(
        `${severity}: Batch #${batch.id} | ` +
          `Product #${batch.productId} ${batch.product.name} | ` +
          `qty=${batch.quantity} | ` +
          `received=${fmtDate(batch.receivedAt)} | ` +
          `expiry=${fmtDate(batch.expiryDate)} | ` +
          `status=${batch.status}`
      );

      if (batch.quantity > 0) {
        critical++;
      } else {
        warnings++;
      }
    }
  }

  if (batchDateAnomalies === 0) {
    console.log("✅ No batch expiryDate < receivedAt anomalies");
  } else {
    console.log(
      `⚠️ Found ${batchDateAnomalies} historical batch date anomalies`
    );
    console.log(
      "   Empty historical batches are warnings only and are not modified by V34."
    );
  }

  // ---------------------------------------------------------------------------
  // 4. ORDER ITEM <-> ORDER BATCH
  // ---------------------------------------------------------------------------

  section("4. ORDER ITEM <-> ORDER BATCH");

  let completeOrderItems = 0;
  let historicalSkippedItems = 0;
  let missingOrderBatchCritical = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const linkedQuantity = item.batches.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      const expected = item.quantity;

      if (linkedQuantity === expected) {
        completeOrderItems++;
        continue;
      }

      if (HISTORICAL_SKIP_ORDERS.has(order.id)) {
        historicalSkippedItems++;

        console.log(
          `SKIP historical OrderItem #${item.id}: ` +
            `Order #${order.id}, Product=${item.product.name}, ` +
            `gross=${item.quantity}, OrderBatch=${linkedQuantity}`
        );

        continue;
      }

      missingOrderBatchCritical++;

      console.log(
        `❌ CRITICAL OrderItem #${item.id}: ` +
          `Order #${order.id}, Product=${item.product.name}, ` +
          `gross=${item.quantity}, OrderBatch=${linkedQuantity}`
      );

      critical++;
    }
  }

  console.log(`Complete OrderItems: ${completeOrderItems}`);
  console.log(`Historical skipped OrderItems: ${historicalSkippedItems}`);
  console.log(
    `Unexpected incomplete OrderItems: ${missingOrderBatchCritical}`
  );

  if (missingOrderBatchCritical === 0) {
    console.log("✅ No unexpected OrderItem -> OrderBatch gaps");
  }

  // ---------------------------------------------------------------------------
  // 5. ORDER BATCH QUANTITY SANITY
  // ---------------------------------------------------------------------------

  section("5. ORDER BATCH QUANTITY SANITY");

  let orderBatchQuantityProblems = 0;

  for (const link of orderBatches) {
    if (link.quantity <= 0) {
      orderBatchQuantityProblems++;

      console.log(
        `❌ OrderBatch #${link.id}: invalid quantity=${link.quantity}`
      );

      critical++;
    }

    if (link.purchaseCost < 0) {
      orderBatchQuantityProblems++;

      console.log(
        `❌ OrderBatch #${link.id}: invalid purchaseCost=${link.purchaseCost}`
      );

      critical++;
    }
  }

  if (orderBatchQuantityProblems === 0) {
    console.log("✅ All OrderBatch quantities and purchaseCost values valid");
  }

  // ---------------------------------------------------------------------------
  // 6. ORDERBATCH PURCHASE COST SNAPSHOT
  // ---------------------------------------------------------------------------

  section("6. ORDERBATCH PURCHASE COST SNAPSHOT");

  let snapshotProblems = 0;

  for (const link of orderBatches) {
    const batch = batches.find((b) => b.id === link.batchId);

    if (!batch) {
      snapshotProblems++;

      console.log(
        `❌ OrderBatch #${link.id}: Batch #${link.batchId} does not exist`
      );

      critical++;
      continue;
    }

    if (link.purchaseCost !== batch.purchaseCost) {
      console.log(
        `ℹ️ OrderBatch #${link.id}: snapshot=${link.purchaseCost}, ` +
          `current Batch.purchaseCost=${batch.purchaseCost}`
      );
    }
  }

  if (snapshotProblems === 0) {
    console.log(
      "✅ All OrderBatch links reference existing batches"
    );
    console.log(
      "ℹ️ Differences between snapshot cost and current batch cost are allowed."
    );
  }

  // ---------------------------------------------------------------------------
  // 7. RETURNBATCH INTEGRITY
  // ---------------------------------------------------------------------------

  section("7. RETURNBATCH INTEGRITY");

  let returnProblems = 0;

  for (const ret of returnBatches) {
    const item = orderItems.find((x) => x.id === ret.orderItemId);
    const batch = batches.find((x) => x.id === ret.batchId);

    if (!item) {
      returnProblems++;

      console.log(
        `❌ ReturnBatch #${ret.id}: missing OrderItem #${ret.orderItemId}`
      );

      critical++;
      continue;
    }

    if (!batch) {
      returnProblems++;

      console.log(
        `❌ ReturnBatch #${ret.id}: missing Batch #${ret.batchId}`
      );

      critical++;
      continue;
    }

    if (ret.quantity <= 0) {
      returnProblems++;

      console.log(
        `❌ ReturnBatch #${ret.id}: invalid quantity=${ret.quantity}`
      );

      critical++;
    }
  }

  if (returnProblems === 0) {
    console.log("✅ ReturnBatch structural integrity passed");
  }

  // ---------------------------------------------------------------------------
  // 8. RETURNED QUANTITY VS ORDER ITEM
  // ---------------------------------------------------------------------------

  section("8. RETURNED QUANTITY VS ORDER ITEM");

  let returnedQuantityProblems = 0;

  for (const item of orderItems) {
    const returns = returnBatches
      .filter((r) => r.orderItemId === item.id)
      .reduce((sum, r) => sum + r.quantity, 0);

    if (returns !== item.returned) {
      returnedQuantityProblems++;

      console.log(
        `❌ OrderItem #${item.id}: ` +
          `stored returned=${item.returned}, ReturnBatch total=${returns}`
      );

      critical++;
    }

    if (item.returned > item.quantity) {
      returnedQuantityProblems++;

      console.log(
        `❌ OrderItem #${item.id}: returned ${item.returned} > gross ${item.quantity}`
      );

      critical++;
    }
  }

  if (returnedQuantityProblems === 0) {
    const totalReturned = orderItems.reduce(
      (sum, item) => sum + item.returned,
      0
    );

    const totalReturnBatch = returnBatches.reduce(
      (sum, ret) => sum + ret.quantity,
      0
    );

    console.log(
      `✅ Returned quantities consistent: ${totalReturned} = ${totalReturnBatch}`
    );
  }

  // ---------------------------------------------------------------------------
  // 9. ORDER STATUS
  // ---------------------------------------------------------------------------

  section("9. ORDER STATUS");

  let statusProblems = 0;

  for (const order of orders) {
    let gross = 0;
    let returned = 0;

    for (const item of order.items) {
      gross += item.quantity;
      returned += item.returned;
    }

    let expectedStatus:
      | "COMPLETED"
      | "PARTIAL_RETURN"
      | "RETURNED";

    if (returned === 0) {
      expectedStatus = "COMPLETED";
    } else if (returned === gross) {
      expectedStatus = "RETURNED";
    } else {
      expectedStatus = "PARTIAL_RETURN";
    }

    if (order.status !== expectedStatus) {
      statusProblems++;

      console.log(
        `❌ Order #${order.id}: stored=${order.status}, ` +
          `expected=${expectedStatus}, gross=${gross}, returned=${returned}`
      );

      critical++;
    }
  }

  if (statusProblems === 0) {
    console.log("✅ All order statuses are consistent");
  }

  // ---------------------------------------------------------------------------
  // 10. FIFO CHRONOLOGY
  // ---------------------------------------------------------------------------

  section("10. FIFO / FEFO CHRONOLOGY");

  let fifoWarnings = 0;

  for (const order of orders) {
    if (HISTORICAL_SKIP_ORDERS.has(order.id)) {
      continue;
    }

    for (const item of order.items) {
      if (item.batches.length <= 1) continue;

      const links = item.batches
        .map((link) => {
          const batch = batches.find((b) => b.id === link.batchId);

          return {
            link,
            batch,
          };
        })
        .filter(
          (
            x
          ): x is {
            link: (typeof item.batches)[number];
            batch: (typeof batches)[number];
          } => Boolean(x.batch)
        );

      for (let i = 0; i < links.length - 1; i++) {
        const current = links[i].batch;
        const next = links[i + 1].batch;

        const currentKey = [
          current.expiryDate.getTime(),
          current.receivedAt.getTime(),
          current.id,
        ];

        const nextKey = [
          next.expiryDate.getTime(),
          next.receivedAt.getTime(),
          next.id,
        ];

        const invalid =
          currentKey[0] > nextKey[0] ||
          (currentKey[0] === nextKey[0] &&
            currentKey[1] > nextKey[1]) ||
          (currentKey[0] === nextKey[0] &&
            currentKey[1] === nextKey[1] &&
            currentKey[2] > nextKey[2]);

        if (invalid) {
          fifoWarnings++;

          console.log(
            `⚠️ FIFO warning: OrderItem #${item.id}, ` +
              `Batch #${current.id} appears after #${next.id}`
          );

          console.log(
            `   #${current.id}: expiry=${fmtDate(current.expiryDate)}, ` +
              `received=${fmtDate(current.receivedAt)}`
          );

          console.log(
            `   #${next.id}: expiry=${fmtDate(next.expiryDate)}, ` +
              `received=${fmtDate(next.receivedAt)}`
          );
        }
      }
    }
  }

  if (fifoWarnings === 0) {
    console.log("✅ FIFO / FEFO chronology passed");
  }

  // ---------------------------------------------------------------------------
  // 11. MULTI-BATCH SALES
  // ---------------------------------------------------------------------------

  section("11. MULTI-BATCH SALES");

  for (const order of orders) {
    for (const item of order.items) {
      if (item.batches.length <= 1) continue;

      console.log(
        `OrderItem #${item.id} | Order #${order.id} | ` +
          `${item.product.name} | gross=${item.quantity}`
      );

      for (const link of item.batches) {
        const batch = batches.find((b) => b.id === link.batchId);

        if (!batch) continue;

        console.log(
          `  Batch #${batch.id}: qty=${link.quantity}, ` +
            `purchaseCost=${money(link.purchaseCost)}, ` +
            `expiry=${fmtDate(batch.expiryDate)}, ` +
            `received=${fmtDate(batch.receivedAt)}`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 12. PROFIT RECONSTRUCTION
  // ---------------------------------------------------------------------------

  section("12. ORDER PROFIT RECONSTRUCTION");

  let profitCompleteCount = 0;
  let profitSkipCount = 0;
  let profitMismatchCount = 0;

  let storedCompleteProfit = 0;
  let calculatedCompleteProfit = 0;

  let storedCompleteTotal = 0;
  let calculatedCompleteNetRevenue = 0;

  /**
   * Important:
   *
   * Returned cost MUST be reconstructed from OrderBatch.purchaseCost,
   * matching:
   *
   *   ReturnBatch.orderItemId
   *   ReturnBatch.batchId
   *
   * Never use current Batch.purchaseCost for historical profit.
   */

  for (const order of orders) {
    if (HISTORICAL_SKIP_ORDERS.has(order.id)) {
      profitSkipCount++;

      console.log(
        `SKIP profit reconstruction for historical Order #${order.id}`
      );

      continue;
    }

    let grossRevenue = 0;
    let returnedRevenue = 0;

    let grossCost = 0;
    let returnedCost = 0;

    for (const item of order.items) {
      grossRevenue += item.quantity * item.price;
      returnedRevenue += item.returned * item.price;

      // -----------------------------------------------------------------------
      // Gross cost from OrderBatch snapshots
      // -----------------------------------------------------------------------

      for (const link of item.batches) {
        grossCost += link.quantity * link.purchaseCost;
      }

      // -----------------------------------------------------------------------
      // Returned cost from OrderBatch snapshots
      // -----------------------------------------------------------------------

      const itemReturns = returnBatches.filter(
        (ret) => ret.orderItemId === item.id
      );

      for (const ret of itemReturns) {
        let remainingReturn = ret.quantity;

        const matchingOrderBatches = orderBatches
          .filter(
            (link) =>
              link.orderItemId === item.id &&
              link.batchId === ret.batchId
          )
          .sort((a, b) => a.id - b.id);

        if (matchingOrderBatches.length === 0) {
          console.log(
            `❌ Order #${order.id}, OrderItem #${item.id}, ` +
              `ReturnBatch #${ret.id}: no matching OrderBatch for Batch #${ret.batchId}`
          );

          critical++;
          continue;
        }

        for (const link of matchingOrderBatches) {
          if (remainingReturn <= 0) break;

          const take = Math.min(remainingReturn, link.quantity);

          returnedCost += take * link.purchaseCost;
          remainingReturn -= take;
        }

        if (remainingReturn > 0) {
          console.log(
            `❌ Order #${order.id}, OrderItem #${item.id}, ` +
              `ReturnBatch #${ret.id}: returned quantity ${ret.quantity} ` +
              `exceeds matching OrderBatch quantity by ${remainingReturn}`
          );

          critical++;
        }
      }
    }

    const netRevenue = grossRevenue - returnedRevenue;
    const netCost = grossCost - returnedCost;
    const grossProfit = grossRevenue - grossCost;
    const netProfit = netRevenue - netCost;

    const storedTotal = order.total;
    const storedProfit = order.profit;

    const totalMismatch = storedTotal !== netRevenue;
    const profitMismatch = storedProfit !== netProfit;

    if (totalMismatch || profitMismatch) {
      profitMismatchCount++;

      console.log(`❌ Order #${order.id} PROFIT/TOTAL MISMATCH`);

      console.log(
        `   Revenue: gross=${money(grossRevenue)}, ` +
          `returned=${money(returnedRevenue)}, ` +
          `net=${money(netRevenue)}`
      );

      console.log(
        `   Cost: gross=${money(grossCost)}, ` +
          `returned=${money(returnedCost)}, ` +
          `net=${money(netCost)}`
      );

      console.log(
        `   Profit: gross=${money(grossProfit)}, ` +
          `net=${money(netProfit)}, ` +
          `stored=${money(storedProfit)}`
      );

      console.log(
        `   Total: stored=${money(storedTotal)}, ` +
          `expectedNet=${money(netRevenue)}`
      );

      critical++;
    } else {
      profitCompleteCount++;
    }

    storedCompleteProfit += storedProfit;
    calculatedCompleteProfit += netProfit;

    storedCompleteTotal += storedTotal;
    calculatedCompleteNetRevenue += netRevenue;
  }

  console.log(`Complete orders checked: ${profitCompleteCount}`);
  console.log(`Historical skipped orders: ${profitSkipCount}`);
  console.log(`Profit/total mismatches: ${profitMismatchCount}`);

  console.log(
    `Stored complete profit: ${money(storedCompleteProfit)}`
  );

  console.log(
    `Calculated complete NET profit: ${money(calculatedCompleteProfit)}`
  );

  console.log(
    `Stored complete total: ${money(storedCompleteTotal)}`
  );

  console.log(
    `Calculated complete NET revenue: ${money(calculatedCompleteNetRevenue)}`
  );

  if (profitMismatchCount === 0) {
    console.log(
      "✅ Order.total and Order.profit match reconstructed NET values"
    );
  }

  // ---------------------------------------------------------------------------
  // 13. MOVEMENT SALE SANITY
  // ---------------------------------------------------------------------------

  section("13. SALE MOVEMENT SANITY");

  const saleMovements = movements.filter((m) => m.type === "SALE");

  let saleMovementProblems = 0;

  for (const movement of saleMovements) {
    if (movement.quantity >= 0) {
      saleMovementProblems++;

      console.log(
        `❌ SALE Movement #${movement.id}: quantity=${movement.quantity}`
      );

      critical++;
    }
  }

  console.log(`SALE movements: ${saleMovements.length}`);

  if (saleMovementProblems === 0) {
    console.log("✅ All SALE movements are negative");
  }

  // ---------------------------------------------------------------------------
  // 14. WRITE-OFF MOVEMENT SANITY
  // ---------------------------------------------------------------------------

  section("14. WRITE-OFF MOVEMENT SANITY");

  const writeOffMovements = movements.filter(
    (m) => m.type === "WRITE_OFF"
  );

  let writeOffProblems = 0;

  for (const movement of writeOffMovements) {
    if (movement.quantity >= 0) {
      writeOffProblems++;

      console.log(
        `❌ WRITE_OFF Movement #${movement.id}: ` +
          `quantity=${movement.quantity}`
      );

      critical++;
    }
  }

  console.log(`WRITE_OFF movements: ${writeOffMovements.length}`);

  if (writeOffProblems === 0) {
    console.log("✅ All WRITE_OFF movements are negative");
  }

  // ---------------------------------------------------------------------------
  // 15. CURRENT EXPIRED / ACTIVE EMPTY BATCHES
  // ---------------------------------------------------------------------------

  section("15. EMPTY HISTORICAL BATCHES");

  const emptyActive = batches.filter(
    (b) => b.quantity === 0 && b.status === "ACTIVE"
  );

  const emptyExpired = batches.filter(
    (b) => b.quantity === 0 && b.status === "EXPIRED"
  );

  console.log(`Zero ACTIVE batches: ${emptyActive.length}`);
  console.log(`Zero EXPIRED batches: ${emptyExpired.length}`);

  if (emptyActive.length > 0) {
    warnings++;

    for (const batch of emptyActive) {
      console.log(
        `⚠️ Empty ACTIVE Batch #${batch.id}: ` +
          `Product=${batch.product.name}, ` +
          `received=${fmtDate(batch.receivedAt)}, ` +
          `expiry=${fmtDate(batch.expiryDate)}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 16. FINAL SUMMARY
  // ---------------------------------------------------------------------------

  section("16. V34 FINAL SUMMARY");

  console.log(`Products: ${products.length}`);
  console.log(`Batches: ${batches.length}`);
  console.log(`Orders: ${orders.length}`);
  console.log(`OrderItems: ${orderItems.length}`);
  console.log(`OrderBatch: ${orderBatches.length}`);
  console.log(`ReturnBatch: ${returnBatches.length}`);
  console.log(`Movements: ${movements.length}`);
  console.log(`Supplies: ${supplies.length}`);
  console.log(`SupplyItems: ${supplyItems.length}`);

  console.log("");
  console.log(`Critical: ${critical}`);
  console.log(`Warnings: ${warnings}`);

  if (critical === 0) {
    console.log("");
    console.log("✅ V34 READ-ONLY AUDIT PASSED");
    console.log("✅ No critical current-state integrity problems found");
  } else {
    console.log("");
    console.log("❌ V34 READ-ONLY AUDIT FAILED");
    console.log(
      "❗ Do not modify the database automatically. Review the critical findings first."
    );
  }

  console.log("");
  console.log("ℹ️ V34 DID NOT MODIFY THE DATABASE.");
}

main()
  .catch((error) => {
    console.error("\n❌ V34 AUDIT ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });