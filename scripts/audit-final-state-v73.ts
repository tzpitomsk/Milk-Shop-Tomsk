import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = new Date();

type Severity = "CRITICAL" | "WARNING";

const criticals: string[] = [];
const warnings: string[] = [];

function critical(message: string): void {
  criticals.push(message);
  console.log(`🔴 CRITICAL: ${message}`);
}

function warning(message: string): void {
  warnings.push(message);
  console.log(`🟡 WARNING: ${message}`);
}

function ok(message: string): void {
  console.log(`🟢 ${message}`);
}

function money(value: number): string {
  return value.toLocaleString("ru-RU");
}

async function main(): Promise<void> {
  console.log("");
  console.log("==============================================================================");
  console.log("V73 — FINAL READ-ONLY DATABASE INTEGRITY AUDIT");
  console.log("==============================================================================");
  console.log("");
  console.log("STRICT READ ONLY");
  console.log("DATABASE WILL NOT BE MODIFIED");
  console.log(`Audit time=${now.toISOString()}`);
  console.log("");

  // ===========================================================================
  // 1. LOAD DATABASE
  // ===========================================================================

  console.log("1. DATABASE COUNTS");
  console.log("------------------------------------------------------------------------------");

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },
  });

  const batches = await prisma.batch.findMany({
    orderBy: {
      id: "asc",
    },
  });

  const orders = await prisma.order.findMany({
    include: {
      items: {
        include: {
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
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const movements = await prisma.movement.findMany({
    orderBy: {
      id: "asc",
    },
  });

  const supplies = await prisma.supply.findMany({
    include: {
      items: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(`Products=${products.length}`);
  console.log(`Batches=${batches.length}`);
  console.log(`Orders=${orders.length}`);
  console.log(
    `OrderItems=${orders.reduce((sum, order) => sum + order.items.length, 0)}`
  );
  console.log(
    `OrderBatches=${orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.batches.length,
          0
        ),
      0
    )}`
  );
  console.log(
    `ReturnBatches=${orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + item.ReturnBatch.length,
          0
        ),
      0
    )}`
  );
  console.log(`Movements=${movements.length}`);
  console.log(`Supplies=${supplies.length}`);
  console.log(
    `SupplyItems=${supplies.reduce((sum, supply) => sum + supply.items.length, 0)}`
  );
  console.log("");

  // ===========================================================================
  // 2. PRODUCT STOCK VS BATCH STOCK
  // ===========================================================================

  console.log("2. PRODUCT.STOCK VS SUM(BATCH.QUANTITY)");
  console.log("------------------------------------------------------------------------------");

  const batchesByProduct = new Map<number, typeof batches>();

  for (const batch of batches) {
    const list = batchesByProduct.get(batch.productId) ?? [];
    list.push(batch);
    batchesByProduct.set(batch.productId, list);
  }

  for (const product of products) {
    const productBatches = batchesByProduct.get(product.id) ?? [];

    const batchSum = productBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `stock=${product.stock} | batchSum=${batchSum}`
    );

    if (product.stock !== batchSum) {
      critical(
        `Product #${product.id} stock=${product.stock} does not equal SUM(Batch.quantity)=${batchSum}`
      );
    }
  }

  if (
    products.length > 0 &&
    products.every(
      (product) =>
        product.stock ===
        (batchesByProduct.get(product.id) ?? []).reduce(
          (sum, batch) => sum + batch.quantity,
          0
        )
    )
  ) {
    ok("Product.stock matches SUM(Batch.quantity) for every product");
  }

  console.log("");

  // ===========================================================================
  // 3. BATCH QUANTITY / STATUS SANITY
  // ===========================================================================

  console.log("3. BATCH QUANTITY / STATUS SANITY");
  console.log("------------------------------------------------------------------------------");

  let positiveBatches = 0;
  let positiveExpired = 0;
  let positiveFuture = 0;
  let positiveNonActive = 0;
  let emptyBatches = 0;

  for (const batch of batches) {
    if (batch.quantity < 0) {
      critical(`Batch #${batch.id} has negative quantity=${batch.quantity}`);
    }

    if (batch.quantity > 0) {
      positiveBatches++;

      if (batch.expiryDate < now) {
        positiveExpired++;
        critical(
          `Batch #${batch.id} has positive expired stock=${batch.quantity}`
        );
      }

      if (batch.receivedAt > now) {
        positiveFuture++;
        critical(
          `Batch #${batch.id} has positive stock but receivedAt is in the future`
        );
      }

      if (batch.status !== "ACTIVE") {
        positiveNonActive++;
        critical(
          `Batch #${batch.id} has positive stock with status=${batch.status}`
        );
      }
    } else if (batch.quantity === 0) {
      emptyBatches++;

      if (batch.status !== "EMPTY") {
        warning(
          `Batch #${batch.id} is empty but status=${batch.status}`
        );
      }
    }

    if (batch.expiryDate < batch.receivedAt && batch.quantity > 0) {
      critical(
        `Batch #${batch.id} has expiryDate before receivedAt while still holding positive stock`
      );
    }

    if (batch.expiryDate < batch.receivedAt && batch.quantity === 0) {
      warning(
        `Historical empty Batch #${batch.id} has expiryDate before receivedAt`
      );
    }
  }

  console.log(`Positive batches=${positiveBatches}`);
  console.log(`Positive expired=${positiveExpired}`);
  console.log(`Positive future=${positiveFuture}`);
  console.log(`Positive non-ACTIVE=${positiveNonActive}`);
  console.log(`Empty batches=${emptyBatches}`);

  if (positiveExpired === 0) {
    ok("No positive expired stock");
  }

  if (positiveFuture === 0) {
    ok("No positive future stock");
  }

  if (positiveNonActive === 0) {
    ok("No positive non-ACTIVE stock");
  }

  console.log("");

  // ===========================================================================
  // 4. CURRENT SELLABLE STOCK
  // ===========================================================================

  console.log("4. CURRENT SELLABLE STOCK");
  console.log("------------------------------------------------------------------------------");

  for (const product of products) {
    const productBatches = batchesByProduct.get(product.id) ?? [];

    const physicalStock = productBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const sellableStock = productBatches
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
        `physical=${physicalStock} | sellable=${sellableStock} | ` +
        `Product.stock=${product.stock}`
    );

    if (physicalStock !== product.stock) {
      critical(
        `Product #${product.id} physical stock does not match Product.stock`
      );
    }

    if (sellableStock > product.stock) {
      critical(
        `Product #${product.id} sellable stock exceeds Product.stock`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 5. CURRENT FEFO ORDER
  // ===========================================================================

  console.log("5. CURRENT FEFO ORDER");
  console.log("------------------------------------------------------------------------------");

  for (const product of products) {
    const sellable = (batchesByProduct.get(product.id) ?? [])
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.receivedAt <= now &&
          batch.expiryDate >= now
      )
      .sort((a, b) => {
        const expiry = a.expiryDate.getTime() - b.expiryDate.getTime();

        if (expiry !== 0) {
          return expiry;
        }

        const received =
          a.receivedAt.getTime() - b.receivedAt.getTime();

        if (received !== 0) {
          return received;
        }

        return a.id - b.id;
      });

    for (let index = 1; index < sellable.length; index++) {
      const previous = sellable[index - 1];
      const current = sellable[index];

      if (
        previous.expiryDate.getTime() > current.expiryDate.getTime() ||
        (previous.expiryDate.getTime() === current.expiryDate.getTime() &&
          previous.receivedAt.getTime() > current.receivedAt.getTime()) ||
        (previous.expiryDate.getTime() === current.expiryDate.getTime() &&
          previous.receivedAt.getTime() === current.receivedAt.getTime() &&
          previous.id > current.id)
      ) {
        critical(
          `FEFO order violation for Product #${product.id}: Batch #${previous.id} appears before Batch #${current.id}`
        );
      }
    }

    if (sellable.length > 0) {
      console.log(
        `Product #${product.id}: ` +
          sellable.map((batch) => `Batch #${batch.id}`).join(" → ")
      );
    }
  }

  ok("Current sellable batches were checked in FEFO order");
  console.log("");

  // ===========================================================================
  // 6. ORDERBATCH INTEGRITY
  // ===========================================================================

  console.log("6. ORDERBATCH INTEGRITY");
  console.log("------------------------------------------------------------------------------");

  let orderBatchCount = 0;
  let returnBatchCount = 0;

  for (const order of orders) {
    for (const item of order.items) {
      orderBatchCount += item.batches.length;
      returnBatchCount += item.ReturnBatch.length;

      const soldTotal = item.batches.reduce(
        (sum, orderBatch) => sum + orderBatch.quantity,
        0
      );

      if (soldTotal !== item.quantity) {
        critical(
          `OrderItem #${item.id}: OrderBatch total=${soldTotal}, expected=${item.quantity}`
        );
      }

      for (const orderBatch of item.batches) {
        if (orderBatch.quantity <= 0) {
          critical(
            `OrderBatch #${orderBatch.id} has invalid quantity=${orderBatch.quantity}`
          );
        }

        if (orderBatch.purchaseCost < 0) {
          critical(
            `OrderBatch #${orderBatch.id} has negative purchaseCost=${orderBatch.purchaseCost}`
          );
        }

        if (orderBatch.batch.productId !== item.productId) {
          critical(
            `OrderBatch #${orderBatch.id} links OrderItem #${item.id} to Batch #${orderBatch.batchId} belonging to Product #${orderBatch.batch.productId}, expected Product #${item.productId}`
          );
        }
      }

      const returnedTotal = item.ReturnBatch.reduce(
        (sum, returnBatch) => sum + returnBatch.quantity,
        0
      );

      if (returnedTotal !== item.returned) {
        critical(
          `OrderItem #${item.id}: ReturnBatch total=${returnedTotal}, OrderItem.returned=${item.returned}`
        );
      }

      if (item.returned < 0 || item.returned > item.quantity) {
        critical(
          `OrderItem #${item.id}: returned=${item.returned}, quantity=${item.quantity}`
        );
      }

      for (const returnBatch of item.ReturnBatch) {
        if (returnBatch.quantity <= 0) {
          critical(
            `ReturnBatch #${returnBatch.id} has invalid quantity=${returnBatch.quantity}`
          );
        }

        if (returnBatch.Batch.productId !== item.productId) {
          critical(
            `ReturnBatch #${returnBatch.id} links OrderItem #${item.id} to Batch #${returnBatch.batchId} belonging to Product #${returnBatch.Batch.productId}, expected Product #${item.productId}`
          );
        }
      }
    }
  }

  console.log(`OrderBatches checked=${orderBatchCount}`);
  console.log(`ReturnBatches checked=${returnBatchCount}`);

  if (criticals.length === 0) {
    ok("OrderBatch and ReturnBatch integrity checks passed");
  }

  console.log("");

  // ===========================================================================
  // 7. RETURNED QUANTITY PER BATCH
  // ===========================================================================

  console.log("7. RETURNED QUANTITY DOES NOT EXCEED SOLD QUANTITY");
  console.log("------------------------------------------------------------------------------");

  const soldByOrderItemBatch = new Map<string, number>();
  const returnedByOrderItemBatch = new Map<string, number>();

  for (const order of orders) {
    for (const item of order.items) {
      for (const orderBatch of item.batches) {
        const key = `${item.id}:${orderBatch.batchId}`;

        soldByOrderItemBatch.set(
          key,
          (soldByOrderItemBatch.get(key) ?? 0) + orderBatch.quantity
        );
      }

      for (const returnBatch of item.ReturnBatch) {
        const key = `${item.id}:${returnBatch.batchId}`;

        returnedByOrderItemBatch.set(
          key,
          (returnedByOrderItemBatch.get(key) ?? 0) + returnBatch.quantity
        );
      }
    }
  }

  for (const [key, returned] of returnedByOrderItemBatch) {
    const sold = soldByOrderItemBatch.get(key) ?? 0;

    if (returned > sold) {
      critical(
        `OrderItem/Batch ${key}: returned=${returned} exceeds sold=${sold}`
      );
    }
  }

  ok("Return quantities do not exceed sold quantities");
  console.log("");

  // ===========================================================================
  // 8. ORDER STATUS / TOTAL / PROFIT RECONSTRUCTION
  // ===========================================================================

  console.log("8. ORDER STATUS / TOTAL / PROFIT RECONSTRUCTION");
  console.log("------------------------------------------------------------------------------");

  for (const order of orders) {
    let expectedTotal = 0;
    let expectedProfit = 0;
    let allReturned = true;

    for (const item of order.items) {
      const netQuantity = item.quantity - item.returned;

      expectedTotal += netQuantity * item.price;

      const originalCost = item.batches.reduce(
        (sum, orderBatch) =>
          sum + orderBatch.quantity * orderBatch.purchaseCost,
        0
      );

      const returnedCost = item.ReturnBatch.reduce(
        (sum, returnBatch) =>
          sum + returnBatch.quantity * returnBatch.Batch.purchaseCost,
        0
      );

      expectedProfit +=
        netQuantity * item.price -
        (originalCost - returnedCost);

      if (item.returned < item.quantity) {
        allReturned = false;
      }
    }

    const expectedStatus = allReturned
      ? "RETURNED"
      : order.items.some((item) => item.returned > 0)
        ? "PARTIAL_RETURN"
        : "COMPLETED";

    console.log(
      `Order #${order.id} | actual total=${money(order.total)} | ` +
        `expected total=${money(expectedTotal)} | ` +
        `actual profit=${money(order.profit)} | ` +
        `expected profit=${money(expectedProfit)} | ` +
        `status=${order.status}`
    );

    if (order.total !== expectedTotal) {
      critical(
        `Order #${order.id} total=${order.total}, expected=${expectedTotal}`
      );
    }

    if (order.profit !== expectedProfit) {
      critical(
        `Order #${order.id} profit=${order.profit}, expected=${expectedProfit}`
      );
    }

    if (order.status !== expectedStatus) {
      critical(
        `Order #${order.id} status=${order.status}, expected=${expectedStatus}`
      );
    }
  }

  ok("Order total, profit and status reconstruction completed");
  console.log("");

  // ===========================================================================
  // 9. FIFO / FEFO HISTORICAL SALE SEQUENCE
  // ===========================================================================

  console.log("9. HISTORICAL ORDERBATCH CHRONOLOGY");
  console.log("------------------------------------------------------------------------------");

  for (const order of orders) {
    for (const item of order.items) {
      const chronology = [...item.batches].sort((a, b) => {
        const expiry =
          a.batch.expiryDate.getTime() - b.batch.expiryDate.getTime();

        if (expiry !== 0) {
          return expiry;
        }

        const received =
          a.batch.receivedAt.getTime() - b.batch.receivedAt.getTime();

        if (received !== 0) {
          return received;
        }

        return a.batchId - b.batchId;
      });

      for (let index = 1; index < chronology.length; index++) {
        const previous = chronology[index - 1];
        const current = chronology[index];

        if (
          previous.batch.expiryDate.getTime() >
          current.batch.expiryDate.getTime()
        ) {
          warning(
            `Order #${order.id} / OrderItem #${item.id}: historical OrderBatch chronology is not FEFO by expiryDate`
          );
          break;
        }
      }
    }
  }

  ok("Historical OrderBatch chronology checked");
  console.log("");

  // ===========================================================================
  // 10. DUPLICATE ORDERITEM + BATCH GROUPS
  // ===========================================================================

  console.log("10. DUPLICATE ORDERITEM + BATCH GROUPS");
  console.log("------------------------------------------------------------------------------");

  const duplicateGroups = new Map<
    string,
    {
      orderItemId: number;
      batchId: number;
      count: number;
      returnQuantity: number;
    }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      for (const orderBatch of item.batches) {
        const key = `${item.id}:${orderBatch.batchId}`;

        const current = duplicateGroups.get(key) ?? {
          orderItemId: item.id,
          batchId: orderBatch.batchId,
          count: 0,
          returnQuantity: 0,
        };

        current.count += 1;

        current.returnQuantity =
          returnedByOrderItemBatch.get(key) ?? 0;

        duplicateGroups.set(key, current);
      }
    }
  }

  let duplicateCount = 0;

  for (const group of duplicateGroups.values()) {
    if (group.count > 1) {
      duplicateCount++;

      if (group.returnQuantity > 0) {
        warning(
          `OrderItem #${group.orderItemId} has ${group.count} OrderBatch rows for Batch #${group.batchId} and also has returned quantity=${group.returnQuantity}`
        );
      } else {
        warning(
          `OrderItem #${group.orderItemId} has ${group.count} OrderBatch rows for Batch #${group.batchId}`
        );
      }
    }
  }

  console.log(`Duplicate OrderItem+Batch groups=${duplicateCount}`);

  if (duplicateCount === 0) {
    ok("No duplicate OrderItem+Batch groups");
  }

  console.log("");

  // ===========================================================================
  // 11. MOVEMENT TYPE / SIGN AUDIT
  // ===========================================================================

  console.log("11. MOVEMENT TYPE / SIGN AUDIT");
  console.log("------------------------------------------------------------------------------");

  const movementCounts = new Map<string, number>();

  for (const movement of movements) {
    movementCounts.set(
      movement.type,
      (movementCounts.get(movement.type) ?? 0) + 1
    );

    if (
      (movement.type === "SUPPLY" || movement.type === "RETURN") &&
      movement.quantity <= 0
    ) {
      critical(
        `Movement #${movement.id} type=${movement.type} has invalid quantity=${movement.quantity}`
      );
    }

    if (
      (movement.type === "SALE" || movement.type === "WRITE_OFF") &&
      movement.quantity >= 0
    ) {
      critical(
        `Movement #${movement.id} type=${movement.type} has invalid quantity=${movement.quantity}`
      );
    }
  }

  for (const [type, count] of movementCounts) {
    console.log(`${type}=${count}`);
  }

  ok("Movement types and signs checked");
  console.log("");

  // ===========================================================================
  // 12. CURRENT POSITIVE BATCHES
  // ===========================================================================

  console.log("12. CURRENT POSITIVE BATCHES");
  console.log("------------------------------------------------------------------------------");

  const positive = batches.filter((batch) => batch.quantity > 0);

  if (positive.length === 0) {
    console.log("No positive stock batches.");
  } else {
    for (const batch of positive) {
      const product = products.find(
        (item) => item.id === batch.productId
      );

      console.log(
        `Product #${batch.productId} "${product?.name ?? "UNKNOWN"}" | ` +
          `Batch #${batch.id} | quantity=${batch.quantity} | ` +
          `status=${batch.status} | ` +
          `received=${batch.receivedAt.toISOString()} | ` +
          `expiry=${batch.expiryDate.toISOString()}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 13. CURRENT PRODUCT SUMMARY
  // ===========================================================================

  console.log("13. CURRENT PRODUCT SUMMARY");
  console.log("------------------------------------------------------------------------------");

  let totalPhysicalStock = 0;
  let totalSellableStock = 0;

  for (const product of products) {
    const productBatches = batchesByProduct.get(product.id) ?? [];

    const physical = productBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const sellable = productBatches
      .filter(
        (batch) =>
          batch.quantity > 0 &&
          batch.status === "ACTIVE" &&
          batch.receivedAt <= now &&
          batch.expiryDate >= now
      )
      .reduce((sum, batch) => sum + batch.quantity, 0);

    totalPhysicalStock += physical;
    totalSellableStock += sellable;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `stock=${product.stock} | physical=${physical} | sellable=${sellable}`
    );
  }

  console.log("");
  console.log(`TOTAL physical stock=${totalPhysicalStock}`);
  console.log(`TOTAL sellable stock=${totalSellableStock}`);
  console.log("");

  // ===========================================================================
  // 14. HISTORICAL MOVEMENT RECONCILIATION — WARNING ONLY
  // ===========================================================================

  console.log("14. HISTORICAL MOVEMENT RECONCILIATION");
  console.log("------------------------------------------------------------------------------");
  console.log(
    "This section is informational because Movement contains historical operations."
  );
  console.log(
    "It does not treat historical opening-balance differences as current-state corruption."
  );
  console.log("");

  const movementNetByProduct = new Map<number, number>();

  for (const movement of movements) {
    movementNetByProduct.set(
      movement.productId,
      (movementNetByProduct.get(movement.productId) ?? 0) +
        movement.quantity
    );
  }

  for (const product of products) {
    const movementNet =
      movementNetByProduct.get(product.id) ?? 0;

    const impliedOpening =
      product.stock - movementNet;

    console.log(
      `Product #${product.id} "${product.name}" | ` +
        `movementNet=${movementNet} | ` +
        `currentStock=${product.stock} | ` +
        `impliedOpening=${impliedOpening}`
    );
  }

  console.log("");
  console.log(
    "🟢 Historical movement differences are reported as informational only"
  );
  console.log("");

  // ===========================================================================
  // 15. FINAL RESULT
  // ===========================================================================

  console.log("==============================================================================");
  console.log("V73 FINAL RESULT");
  console.log("==============================================================================");
  console.log("");

  console.log(`Critical=${criticals.length}`);
  console.log(`Warnings=${warnings.length}`);
  console.log("");

  if (criticals.length === 0) {
    console.log("🟢 V73 FINAL READ-ONLY AUDIT PASSED");
  } else {
    console.log("🔴 V73 FINAL READ-ONLY AUDIT FAILED");
    console.log("");
    console.log("Critical issues:");

    for (const issue of criticals) {
      console.log(`- ${issue}`);
    }
  }

  console.log("");

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const issue of warnings) {
      console.log(`- ${issue}`);
    }
    console.log("");
  }

  console.log("DATABASE WAS NOT MODIFIED.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 V73 AUDIT FAILED TO EXECUTE");
    console.error("");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
