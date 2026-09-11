import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const productName = "Творог";

  console.log("");
  console.log("==============================================================================");
  console.log("ТВОРОГ — ДИАГНОСТИКА СКЛАДА ПОСЛЕ ВОЗВРАТОВ");
  console.log("STRICT READ ONLY / DRY-RUN");
  console.log("==============================================================================");
  console.log("");

  // ===========================================================================
  // 1. PRODUCT
  // ===========================================================================

  console.log("1. PRODUCT");
  console.log("------------------------------------------------------------------------------");

  const product = await prisma.product.findFirst({
    where: {
      name: productName,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (!product) {
    console.error(`🔴 Product "${productName}" NOT FOUND`);
    process.exitCode = 1;
    return;
  }

  console.log(`Product #${product.id}`);
  console.log(`Name="${product.name}"`);
  console.log(`Unit="${product.unit}"`);
  console.log(`Price=${product.price}`);
  console.log(`Cost=${product.cost}`);
  console.log(`Product.stock=${product.stock}`);
  console.log("");

  // ===========================================================================
  // 2. ALL BATCHES
  // ===========================================================================

  console.log("2. ALL BATCHES");
  console.log("------------------------------------------------------------------------------");

  let batchTotal = 0;

  if (product.batches.length === 0) {
    console.log("No batches found.");
  }

  for (const batch of product.batches) {
    batchTotal += batch.quantity;

    console.log(
      `Batch #${batch.id} | ` +
        `quantity=${batch.quantity} | ` +
        `purchaseCost=${batch.purchaseCost} | ` +
        `status=${batch.status} | ` +
        `received=${batch.receivedAt.toISOString()} | ` +
        `expiry=${batch.expiryDate.toISOString()}`
    );
  }

  console.log("");
  console.log(`SUM(Batch.quantity)=${batchTotal}`);
  console.log(`Product.stock=${product.stock}`);

  if (batchTotal === product.stock) {
    console.log("🟢 Product.stock == SUM(Batch.quantity)");
  } else {
    console.log("🔴 CRITICAL: Product.stock != SUM(Batch.quantity)");
  }

  console.log("");

  // ===========================================================================
  // 3. SELLABLE STOCK
  // ===========================================================================

  console.log("3. SELLABLE STOCK");
  console.log("------------------------------------------------------------------------------");

  const now = new Date();

  const sellableBatches = product.batches.filter(
    (batch) =>
      batch.quantity > 0 &&
      batch.status === "ACTIVE" &&
      batch.receivedAt <= now &&
      batch.expiryDate >= now
  );

  const sellableStock = sellableBatches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  console.log(`Current time=${now.toISOString()}`);
  console.log(`Sellable batches=${sellableBatches.length}`);
  console.log(`Sellable stock=${sellableStock}`);

  if (sellableBatches.length === 0) {
    console.log("No currently sellable batches.");
  } else {
    console.log("");

    for (const batch of sellableBatches) {
      console.log(
        `Batch #${batch.id} | ` +
          `sellable=${batch.quantity} | ` +
          `expiry=${batch.expiryDate.toISOString()} | ` +
          `received=${batch.receivedAt.toISOString()}`
      );
    }
  }

  console.log("");

  // ===========================================================================
  // 4. RETURNBATCH RECORDS
  // ===========================================================================

  console.log("4. RETURNBATCH RECORDS");
  console.log("------------------------------------------------------------------------------");

  const returnBatches = await prisma.returnBatch.findMany({
    where: {
      OrderItem: {
        productId: product.id,
      },
    },
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

  let totalReturned = 0;

  if (returnBatches.length === 0) {
    console.log("No ReturnBatch records found.");
  }

  for (const item of returnBatches) {
    totalReturned += item.quantity;

    console.log(
      `ReturnBatch #${item.id} | ` +
        `Order #${item.OrderItem.orderId} | ` +
        `OrderItem #${item.orderItemId} | ` +
        `Batch #${item.batchId} | ` +
        `quantity=${item.quantity} | ` +
        `created=${item.createdAt.toISOString()}`
    );
  }

  console.log("");
  console.log(`TOTAL RETURNED FOR ${productName}=${totalReturned}`);
  console.log("");

  // ===========================================================================
  // 5. ORDERS #57 AND #59
  // ===========================================================================

  console.log("5. ORDERS #57 AND #59");
  console.log("------------------------------------------------------------------------------");

  const orders = await prisma.order.findMany({
    where: {
      id: {
        in: [57, 59],
      },
    },
    include: {
      items: {
        where: {
          productId: product.id,
        },
        include: {
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
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  if (orders.length === 0) {
    console.log("Neither order #57 nor #59 was found.");
  }

  for (const order of orders) {
    console.log("");
    console.log(`Order #${order.id}`);
    console.log(`Date=${order.date.toISOString()}`);
    console.log(`Total=${order.total}`);
    console.log(`Profit=${order.profit}`);
    console.log(`Status=${order.status}`);

    for (const item of order.items) {
      console.log("");
      console.log(
        `OrderItem #${item.id} | ` +
          `quantity=${item.quantity} | ` +
          `returned=${item.returned} | ` +
          `remaining=${item.quantity - item.returned}`
      );

      console.log("");
      console.log("Original OrderBatch links:");

      if (item.batches.length === 0) {
        console.log("  NONE");
      }

      for (const orderBatch of item.batches) {
        console.log(
          `  OrderBatch #${orderBatch.id} | ` +
            `Batch #${orderBatch.batchId} | ` +
            `quantity=${orderBatch.quantity} | ` +
            `purchaseCost=${orderBatch.purchaseCost} | ` +
            `currentBatchQuantity=${orderBatch.batch.quantity} | ` +
            `currentStatus=${orderBatch.batch.status}`
        );
      }

      console.log("");
      console.log("ReturnBatch links:");

      if (item.ReturnBatch.length === 0) {
        console.log("  NONE");
      }

      for (const itemReturn of item.ReturnBatch) {
        console.log(
          `  ReturnBatch #${itemReturn.id} | ` +
            `Batch #${itemReturn.batchId} | ` +
            `quantity=${itemReturn.quantity} | ` +
            `created=${itemReturn.createdAt.toISOString()}`
        );
      }
    }
  }

  console.log("");

  // ===========================================================================
  // 6. RETURNED QUANTITY BY BATCH
  // ===========================================================================

  console.log("6. RETURNED QUANTITY BY BATCH");
  console.log("------------------------------------------------------------------------------");

  const returnedByBatch = new Map<number, number>();

  for (const item of returnBatches) {
    returnedByBatch.set(
      item.batchId,
      (returnedByBatch.get(item.batchId) ?? 0) + item.quantity
    );
  }

  const returnedBatchIds = Array.from(returnedByBatch.keys()).sort(
    (a, b) => a - b
  );

  if (returnedBatchIds.length === 0) {
    console.log("No returned batches.");
  }

  for (const batchId of returnedBatchIds) {
    const returned = returnedByBatch.get(batchId) ?? 0;

    const batch = product.batches.find(
      (item) => item.id === batchId
    );

    console.log(
      `Batch #${batchId} | ` +
        `returned=${returned} | ` +
        `currentQuantity=${batch?.quantity ?? "NOT FOUND"} | ` +
        `status=${batch?.status ?? "NOT FOUND"}`
    );
  }

  console.log("");

  // ===========================================================================
  // 7. MOVEMENTS
  // ===========================================================================

  console.log("7. RETURN / SALE MOVEMENTS FOR ТВOРОГ");
  console.log("------------------------------------------------------------------------------");

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
      type: {
        in: ["SALE", "RETURN"],
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  let saleTotal = 0;
  let returnMovementTotal = 0;

  for (const movement of movements) {
    if (movement.type === "SALE") {
      saleTotal += movement.quantity;
    }

    if (movement.type === "RETURN") {
      returnMovementTotal += movement.quantity;
    }

    console.log(
      `Movement #${movement.id} | ` +
        `type=${movement.type} | ` +
        `quantity=${movement.quantity} | ` +
        `comment=${movement.comment ?? ""} | ` +
        `created=${movement.createdAt.toISOString()}`
    );
  }

  console.log("");
  console.log(`SALE movement total=${saleTotal}`);
  console.log(`RETURN movement total=${returnMovementTotal}`);
  console.log("");

  // ===========================================================================
  // 8. FINAL CHECKS
  // ===========================================================================

  console.log("8. FINAL CHECKS");
  console.log("------------------------------------------------------------------------------");

  const criticalIssues: string[] = [];

  if (product.stock !== batchTotal) {
    criticalIssues.push(
      `Product.stock=${product.stock} but SUM(Batch.quantity)=${batchTotal}`
    );
  }

  for (const item of returnBatches) {
    const batch = product.batches.find(
      (batch) => batch.id === item.batchId
    );

    if (!batch) {
      criticalIssues.push(
        `ReturnBatch #${item.id} points to missing Batch #${item.batchId}`
      );
      continue;
    }

    if (batch.productId !== product.id) {
      criticalIssues.push(
        `ReturnBatch #${item.id} points to Batch #${batch.id} belonging to Product #${batch.productId}`
      );
    }
  }

  for (const order of orders) {
    for (const item of order.items) {
      const returned = item.ReturnBatch.reduce(
        (sum, itemReturn) => sum + itemReturn.quantity,
        0
      );

      if (returned !== item.returned) {
        criticalIssues.push(
          `OrderItem #${item.id}: returned=${item.returned}, ` +
            `but ReturnBatch total=${returned}`
        );
      }

      if (item.returned > item.quantity) {
        criticalIssues.push(
          `OrderItem #${item.id}: returned=${item.returned} > quantity=${item.quantity}`
        );
      }

      for (const orderBatch of item.batches) {
        const returnedFromBatch = item.ReturnBatch
          .filter(
            (itemReturn) =>
              itemReturn.batchId === orderBatch.batchId
          )
          .reduce(
            (sum, itemReturn) => sum + itemReturn.quantity,
            0
          );

        if (returnedFromBatch > orderBatch.quantity) {
          criticalIssues.push(
            `OrderItem #${item.id}, Batch #${orderBatch.batchId}: ` +
              `returned=${returnedFromBatch} > sold=${orderBatch.quantity}`
          );
        }
      }
    }
  }

  if (criticalIssues.length === 0) {
    console.log("🟢 ALL CURRENT STOCK CHECKS PASSED");
  } else {
    console.log(
      `🔴 CRITICAL ISSUES FOUND: ${criticalIssues.length}`
    );

    console.log("");

    for (const issue of criticalIssues) {
      console.log(`- ${issue}`);
    }
  }

  console.log("");
  console.log("==============================================================================");
  console.log("DIAGNOSTIC COMPLETED");
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