import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPECTED_SKIP_IDS = new Set([
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

const EXPECTED_V26_WRITE_OFFS = new Map<
  number,
  {
    batchId: number;
    productId: number;
    quantity: number;
  }
>([
  [1, { batchId: 28, productId: 1, quantity: 10 }],
  [2, { batchId: 29, productId: 2, quantity: 10 }],
  [3, { batchId: 30, productId: 3, quantity: 10 }],
  [4, { batchId: 31, productId: 4, quantity: 10 }],
]);

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function separator() {
  console.log("=".repeat(95));
}

function daysExpired(expiryDate: Date, now: Date) {
  return (
    (now.getTime() - expiryDate.getTime()) /
    (1000 * 60 * 60 * 24)
  );
}

async function main() {
  const now = new Date();

  console.log("🔎 FINAL READ-ONLY AUDIT V31");
  console.log();
  console.log("⚠️ БД НЕ ИЗМЕНЯЕТСЯ");
  console.log(
    `🕐 Audit time: ${now.toISOString()}`
  );
  console.log();

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
    },
  });

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

  const movements = await prisma.movement.findMany({
    orderBy: {
      id: "asc",
    },
  });

  const batches = await prisma.batch.findMany({
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
  });

  const supplies = await prisma.supply.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  const orderBatchCount =
    await prisma.orderBatch.count();

  const returnBatchCount =
    await prisma.returnBatch.count();

  const orderItemCount =
    await prisma.orderItem.count();

  /*
   * ============================================================
   * SUMMARY
   * ============================================================
   */

  separator();
  console.log("📦 DATABASE SUMMARY");
  separator();

  console.log(
    `Products:       ${products.length}`
  );

  console.log(
    `Batches:        ${batches.length}`
  );

  console.log(
    `Orders:         ${orders.length}`
  );

  console.log(
    `OrderItems:     ${orderItemCount}`
  );

  console.log(
    `OrderBatch:     ${orderBatchCount}`
  );

  console.log(
    `ReturnBatch:    ${returnBatchCount}`
  );

  console.log(
    `Movements:      ${movements.length}`
  );

  console.log(
    `Supplies:       ${supplies.length}`
  );

  /*
   * ============================================================
   * CRITICAL / WARNING COUNTERS
   * ============================================================
   */

  let critical = 0;
  let warnings = 0;

  /*
   * ============================================================
   * 1. PRODUCT STOCK ↔ BATCH STOCK
   * ============================================================
   */

  console.log();
  separator();
  console.log("1️⃣ PRODUCT STOCK ↔ BATCH STOCK");
  separator();

  let globalProductStock = 0;
  let globalBatchStock = 0;

  for (const product of products) {
    const batchTotal = product.batches.reduce(
      (sum, batch) =>
        sum + batch.quantity,
      0
    );

    globalProductStock += product.stock;
    globalBatchStock += batchTotal;

    const diff =
      product.stock - batchTotal;

    console.log(
      `#${product.id} ${product.name}: ` +
      `Product.stock=${product.stock}, ` +
      `Batch.total=${batchTotal}, ` +
      `diff=${diff}`
    );

    if (diff !== 0) {
      console.log(
        `❌ CRITICAL: Product #${product.id} stock mismatch`
      );
      critical++;
    }
  }

  console.log();

  console.log(
    `Global Product.stock: ${globalProductStock}`
  );

  console.log(
    `Global Batch.quantity: ${globalBatchStock}`
  );

  console.log(
    `Global diff: ${globalProductStock - globalBatchStock}`
  );

  if (
    globalProductStock !==
    globalBatchStock
  ) {
    critical++;
  } else {
    console.log(
      "✅ Product.stock полностью соответствует Batch.quantity"
    );
  }

  /*
   * ============================================================
   * 2. BATCH SANITY
   * ============================================================
   */

  console.log();
  separator();
  console.log("2️⃣ BATCH SANITY");
  separator();

  let positiveActive = 0;
  let positiveExpired = 0;
  let negativeBatches = 0;
  let zeroActive = 0;
  let zeroExpired = 0;

  for (const batch of batches) {
    if (batch.quantity < 0) {
      negativeBatches++;

      console.log(
        `❌ CRITICAL: Batch #${batch.id} ` +
        `negative quantity=${batch.quantity}`
      );

      critical++;
    }

    if (
      batch.quantity > 0 &&
      batch.status === "ACTIVE"
    ) {
      positiveActive++;
    }

    if (
      batch.quantity > 0 &&
      batch.expiryDate < now
    ) {
      positiveExpired++;

      console.log(
        `❌ CRITICAL: expired positive Batch #${batch.id}, ` +
        `${batch.product.name}, qty=${batch.quantity}, ` +
        `expired ${daysExpired(
          batch.expiryDate,
          now
        ).toFixed(2)} days ago`
      );

      critical++;
    }

    if (
      batch.quantity === 0 &&
      batch.status === "ACTIVE"
    ) {
      zeroActive++;
    }

    if (
      batch.quantity === 0 &&
      batch.status === "EXPIRED"
    ) {
      zeroExpired++;
    }
  }

  console.log();
  console.log(
    `ACTIVE + positive: ${positiveActive}`
  );

  console.log(
    `EXPIRED + positive: ${positiveExpired}`
  );

  console.log(
    `Negative batches: ${negativeBatches}`
  );

  console.log(
    `Zero ACTIVE batches: ${zeroActive}`
  );

  console.log(
    `Zero EXPIRED batches: ${zeroExpired}`
  );

  if (positiveActive === 0) {
    console.log(
      "✅ Нет активных партий с положительным остатком."
    );
  }

  if (positiveExpired === 0) {
    console.log(
      "✅ Нет просроченных партий с положительным остатком."
    );
  }

  if (zeroActive > 0) {
    warnings++;

    console.log(
      `⚠️ ${zeroActive} старых ACTIVE-партий имеют qty=0.`
    );

    console.log(
      "   Это исторические пустые партии; автоматически не меняем."
    );
  }

  /*
   * ============================================================
   * 3. ORDERBATCH INTEGRITY
   * ============================================================
   */

  console.log();
  separator();
  console.log("3️⃣ ORDERBATCH INTEGRITY");
  separator();

  let missingOrderBatchItems = 0;
  let mismatchedOrderBatchItems = 0;
  let invalidOrderBatches = 0;

  let totalGrossItems = 0;
  let totalOrderBatchItems = 0;

  for (const order of orders) {
    for (const item of order.items) {
      totalGrossItems += item.quantity;

      const batchQuantity =
        item.batches.reduce(
          (sum, orderBatch) =>
            sum + orderBatch.quantity,
          0
        );

      totalOrderBatchItems +=
        batchQuantity;

      if (
        batchQuantity !== item.quantity
      ) {
        if (
          EXPECTED_SKIP_IDS.has(order.id)
        ) {
          continue;
        }

        if (
          batchQuantity <
          item.quantity
        ) {
          missingOrderBatchItems++;
        } else {
          mismatchedOrderBatchItems++;
        }

        console.log(
          `⚠️ Order #${order.id}, ` +
          `OrderItem #${item.id}: ` +
          `gross=${item.quantity}, ` +
          `OrderBatch=${batchQuantity}`
        );
      }

      for (const orderBatch of item.batches) {
        if (
          orderBatch.quantity <= 0 ||
          !Number.isInteger(
            orderBatch.quantity
          ) ||
          orderBatch.purchaseCost < 0
        ) {
          invalidOrderBatches++;

          console.log(
            `❌ CRITICAL: invalid OrderBatch #${orderBatch.id}`
          );

          critical++;
        }

        if (
          orderBatch.batch.productId !==
          item.productId
        ) {
          invalidOrderBatches++;

          console.log(
            `❌ CRITICAL: OrderBatch #${orderBatch.id} ` +
            `product mismatch`
          );

          critical++;
        }
      }
    }
  }

  console.log();
  console.log(
    `Gross OrderItem quantity: ${totalGrossItems}`
  );

  console.log(
    `OrderBatch quantity: ${totalOrderBatchItems}`
  );

  console.log(
    `Missing OrderBatch items: ${missingOrderBatchItems}`
  );

  console.log(
    `Mismatched OrderBatch items: ${mismatchedOrderBatchItems}`
  );

  console.log(
    `Invalid OrderBatch records: ${invalidOrderBatches}`
  );

  /*
   * ============================================================
   * 4. RETURNBATCH INTEGRITY
   * ============================================================
   */

  console.log();
  separator();
  console.log("4️⃣ RETURNBATCH INTEGRITY");
  separator();

  let returnProblems = 0;
  let totalReturnedFromItems = 0;
  let totalReturnBatchQuantity = 0;

  for (const order of orders) {
    for (const item of order.items) {
      totalReturnedFromItems +=
        item.returned;

      const itemReturnBatchQuantity =
        item.ReturnBatch.reduce(
          (sum, returnBatch) =>
            sum + returnBatch.quantity,
          0
        );

      totalReturnBatchQuantity +=
        itemReturnBatchQuantity;

      if (
        item.returned !==
        itemReturnBatchQuantity
      ) {
        returnProblems++;

        console.log(
          `❌ CRITICAL: OrderItem #${item.id}: ` +
          `returned=${item.returned}, ` +
          `ReturnBatch=${itemReturnBatchQuantity}`
        );

        critical++;
      }

      if (
        item.returned < 0 ||
        item.returned > item.quantity
      ) {
        returnProblems++;

        console.log(
          `❌ CRITICAL: OrderItem #${item.id}: ` +
          `invalid returned=${item.returned}, ` +
          `quantity=${item.quantity}`
        );

        critical++;
      }

      const returnedByBatch =
        new Map<number, number>();

      for (const returnBatch of item.ReturnBatch) {
        if (
          returnBatch.quantity <= 0
        ) {
          returnProblems++;

          console.log(
            `❌ CRITICAL: ReturnBatch #${returnBatch.id} ` +
            `invalid quantity=${returnBatch.quantity}`
          );

          critical++;
        }

        const current =
          returnedByBatch.get(
            returnBatch.batchId
          ) ?? 0;

        returnedByBatch.set(
          returnBatch.batchId,
          current + returnBatch.quantity
        );

        const matchingOrderBatch =
          item.batches.find(
            (orderBatch) =>
              orderBatch.batchId ===
              returnBatch.batchId
          );

        if (!matchingOrderBatch) {
          returnProblems++;

          console.log(
            `❌ CRITICAL: ReturnBatch #${returnBatch.id} ` +
            `has no matching OrderBatch`
          );

          critical++;
        }
      }

      for (const [
        batchId,
        returnedQuantity,
      ] of returnedByBatch) {
        const matchingOrderBatch =
          item.batches.find(
            (orderBatch) =>
              orderBatch.batchId ===
              batchId
          );

        if (!matchingOrderBatch) {
          continue;
        }

        if (
          returnedQuantity >
          matchingOrderBatch.quantity
        ) {
          returnProblems++;

          console.log(
            `❌ CRITICAL: OrderItem #${item.id}, ` +
            `Batch #${batchId}: ` +
            `returned=${returnedQuantity}, ` +
            `sold=${matchingOrderBatch.quantity}`
          );

          critical++;
        }
      }
    }
  }

  console.log(
    `OrderItem.returned total: ${totalReturnedFromItems}`
  );

  console.log(
    `ReturnBatch quantity total: ${totalReturnBatchQuantity}`
  );

  console.log(
    `Return problems: ${returnProblems}`
  );

  if (returnProblems === 0) {
    console.log(
      "✅ ReturnBatch integrity OK."
    );
  }

  /*
   * ============================================================
   * 5. ORDER STATUS
   * ============================================================
   */

  console.log();
  separator();
  console.log("5️⃣ ORDER STATUS");
  separator();

  const statusCounts = {
    COMPLETED: 0,
    PARTIAL_RETURN: 0,
    RETURNED: 0,
  };

  let statusProblems = 0;

  for (const order of orders) {
    if (
      order.status === "COMPLETED"
    ) {
      statusCounts.COMPLETED++;
    } else if (
      order.status === "PARTIAL_RETURN"
    ) {
      statusCounts.PARTIAL_RETURN++;
    } else if (
      order.status === "RETURNED"
    ) {
      statusCounts.RETURNED++;
    } else {
      statusProblems++;

      console.log(
        `❌ CRITICAL: Order #${order.id} ` +
        `unknown status=${order.status}`
      );

      critical++;
    }

    const grossQuantity =
      order.items.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      );

    const returnedQuantity =
      order.items.reduce(
        (sum, item) =>
          sum + item.returned,
        0
      );

    let expectedStatus:
      | "COMPLETED"
      | "PARTIAL_RETURN"
      | "RETURNED";

    if (returnedQuantity === 0) {
      expectedStatus = "COMPLETED";
    } else if (
      returnedQuantity === grossQuantity
    ) {
      expectedStatus = "RETURNED";
    } else {
      expectedStatus = "PARTIAL_RETURN";
    }

    if (
      order.status !== expectedStatus
    ) {
      statusProblems++;

      console.log(
        `❌ CRITICAL: Order #${order.id}: ` +
        `status=${order.status}, ` +
        `expected=${expectedStatus}`
      );

      critical++;
    }
  }

  console.log(
    `COMPLETED: ${statusCounts.COMPLETED}`
  );

  console.log(
    `PARTIAL_RETURN: ${statusCounts.PARTIAL_RETURN}`
  );

  console.log(
    `RETURNED: ${statusCounts.RETURNED}`
  );

  if (statusProblems === 0) {
    console.log(
      "✅ Все статусы заказов соответствуют возвратам."
    );
  }

  /*
   * ============================================================
   * 6. PROFIT AUDIT AFTER V30
   * ============================================================
   */

  console.log();
  separator();
  console.log("6️⃣ ORDER PROFIT — POST V30");
  separator();

  let completeOrders = 0;
  let skipOrders = 0;
  let profitMismatches = 0;

  let storedCompleteProfit = 0;
  let calculatedCompleteProfit = 0;

  let completeStoredRevenue = 0;
  let completeCalculatedRevenue = 0;

  let grossRevenueAllComplete = 0;
  let returnedRevenueAllComplete = 0;
  let grossCostAllComplete = 0;
  let returnedCostAllComplete = 0;

  for (const order of orders) {
    const isSkip =
      EXPECTED_SKIP_IDS.has(order.id);

    if (isSkip) {
      skipOrders++;
      continue;
    }

    completeOrders++;

    let grossRevenue = 0;
    let returnedRevenue = 0;

    let grossCost = 0;
    let returnedCost = 0;

    let incomplete = false;

    for (const item of order.items) {
      grossRevenue +=
        item.price * item.quantity;

      returnedRevenue +=
        item.price * item.returned;

      const orderBatchQuantity =
        item.batches.reduce(
          (sum, orderBatch) =>
            sum + orderBatch.quantity,
          0
        );

      if (
        orderBatchQuantity !==
        item.quantity
      ) {
        incomplete = true;
      }

      for (const orderBatch of item.batches) {
        grossCost +=
          orderBatch.quantity *
          orderBatch.purchaseCost;
      }

      for (const returnBatch of item.ReturnBatch) {
        const matchingOrderBatch =
          item.batches.find(
            (orderBatch) =>
              orderBatch.batchId ===
              returnBatch.batchId
          );

        if (!matchingOrderBatch) {
          incomplete = true;
          continue;
        }

        returnedCost +=
          returnBatch.quantity *
          matchingOrderBatch.purchaseCost;
      }
    }

    if (incomplete) {
      console.log(
        `❌ CRITICAL: Order #${order.id} ` +
        `unexpectedly has incomplete history`
      );

      critical++;
      continue;
    }

    const netRevenue =
      grossRevenue - returnedRevenue;

    const netCost =
      grossCost - returnedCost;

    const netProfit =
      netRevenue - netCost;

    storedCompleteProfit +=
      order.profit;

    calculatedCompleteProfit +=
      netProfit;

    completeStoredRevenue +=
      order.total;

    completeCalculatedRevenue +=
      netRevenue;

    grossRevenueAllComplete +=
      grossRevenue;

    returnedRevenueAllComplete +=
      returnedRevenue;

    grossCostAllComplete +=
      grossCost;

    returnedCostAllComplete +=
      returnedCost;

    if (order.profit !== netProfit) {
      profitMismatches++;

      console.log(
        `❌ CRITICAL: Order #${order.id}: ` +
        `stored profit=${money(order.profit)}, ` +
        `calculated=${money(netProfit)}`
      );

      critical++;
    }
  }

  console.log();
  console.log(
    `Complete orders: ${completeOrders}`
  );

  console.log(
    `Expected Skip orders: ${skipOrders}`
  );

  console.log(
    `Stored COMPLETE profit: ${money(
      storedCompleteProfit
    )}`
  );

  console.log(
    `Calculated COMPLETE NET profit: ${money(
      calculatedCompleteProfit
    )}`
  );

  console.log(
    `Profit mismatches: ${profitMismatches}`
  );

  console.log();

  console.log(
    `Stored COMPLETE total: ${money(
      completeStoredRevenue
    )}`
  );

  console.log(
    `Calculated COMPLETE NET revenue: ${money(
      completeCalculatedRevenue
    )}`
  );

  if (
    storedCompleteProfit ===
      calculatedCompleteProfit &&
    completeStoredRevenue ===
      completeCalculatedRevenue &&
    profitMismatches === 0
  ) {
    console.log(
      "✅ Финансовая модель COMPLETE-заказов согласована."
    );
  }

  /*
   * ============================================================
   * 7. FINANCIAL SUMMARY
   * ============================================================
   */

  console.log();
  separator();
  console.log("7️⃣ FINANCIAL SUMMARY — COMPLETE");
  separator();

  const netRevenue =
    grossRevenueAllComplete -
    returnedRevenueAllComplete;

  const netCost =
    grossCostAllComplete -
    returnedCostAllComplete;

  const grossProfit =
    grossRevenueAllComplete -
    grossCostAllComplete;

  const netProfit =
    netRevenue - netCost;

  console.log(
    `Gross revenue:    ${money(
      grossRevenueAllComplete
    )}`
  );

  console.log(
    `Returned revenue: ${money(
      returnedRevenueAllComplete
    )}`
  );

  console.log(
    `NET revenue:      ${money(netRevenue)}`
  );

  console.log();

  console.log(
    `Gross cost:       ${money(
      grossCostAllComplete
    )}`
  );

  console.log(
    `Returned cost:    ${money(
      returnedCostAllComplete
    )}`
  );

  console.log(
    `NET cost:         ${money(netCost)}`
  );

  console.log();

  console.log(
    `Gross profit:     ${money(grossProfit)}`
  );

  console.log(
    `NET profit:       ${money(netProfit)}`
  );

  /*
   * ============================================================
   * 8. V26 WRITE-OFF AUDIT
   * ============================================================
   */

  console.log();
  separator();
  console.log("8️⃣ V26 WRITE-OFF AUDIT");
  separator();

  let writeOffProblems = 0;
  let writeOffQuantity = 0;

  for (const [
    productId,
    expected,
  ] of EXPECTED_V26_WRITE_OFFS) {
    const batch =
      batches.find(
        (item) =>
          item.id === expected.batchId
      );

    if (!batch) {
      console.log(
        `❌ CRITICAL: Batch #${expected.batchId} not found`
      );

      critical++;
      writeOffProblems++;
      continue;
    }

    console.log(
      `Batch #${batch.id} / ` +
      `${batch.product.name}: ` +
      `qty=${batch.quantity}, ` +
      `status=${batch.status}`
    );

    if (batch.quantity !== 0) {
      console.log(
        `❌ CRITICAL: Batch #${batch.id} quantity != 0`
      );

      critical++;
      writeOffProblems++;
    }

    if (batch.status !== "EXPIRED") {
      console.log(
        `❌ CRITICAL: Batch #${batch.id} status != EXPIRED`
      );

      critical++;
      writeOffProblems++;
    }

    if (
      batch.orderBatches.length !== 0
    ) {
      console.log(
        `❌ CRITICAL: Batch #${batch.id} has OrderBatch links`
      );

      critical++;
      writeOffProblems++;
    }

    if (
      batch.ReturnBatch.length !== 0
    ) {
      console.log(
        `❌ CRITICAL: Batch #${batch.id} has ReturnBatch links`
      );

      critical++;
      writeOffProblems++;
    }

    const movementsForBatch =
      movements.filter(
        (movement) =>
          movement.type ===
            "WRITE_OFF" &&
          movement.comment?.includes(
            `Batch #${batch.id}`
          )
      );

    const quantityWrittenOff =
      movementsForBatch.reduce(
        (sum, movement) =>
          sum + Math.abs(movement.quantity),
        0
      );

    if (
      movementsForBatch.length !== 1 ||
      quantityWrittenOff !==
        expected.quantity
    ) {
      console.log(
        `❌ CRITICAL: WRITE_OFF for Batch #${batch.id}: ` +
        `records=${movementsForBatch.length}, ` +
        `quantity=${quantityWrittenOff}`
      );

      critical++;
      writeOffProblems++;
    } else {
      writeOffQuantity +=
        expected.quantity;

      console.log(
        `✅ WRITE_OFF ${expected.quantity} шт. подтверждён`
      );
    }

    if (
      batch.productId !== productId
    ) {
      console.log(
        `❌ CRITICAL: Batch #${batch.id} product mismatch`
      );

      critical++;
      writeOffProblems++;
    }
  }

  console.log();
  console.log(
    `V26 write-off quantity: ${writeOffQuantity}`
  );

  console.log(
    `V26 write-off problems: ${writeOffProblems}`
  );

  if (writeOffProblems === 0) {
    console.log(
      "✅ Все 4 V26 списания подтверждены."
    );
  }

  /*
   * ============================================================
   * 9. CURRENT STOCK SUMMARY
   * ============================================================
   */

  console.log();
  separator();
  console.log("9️⃣ CURRENT STOCK");
  separator();

  for (const product of products) {
    const positiveBatches =
      product.batches.filter(
        (batch) =>
          batch.quantity > 0
      );

    console.log();
    console.log(
      `#${product.id} ${product.name}`
    );

    console.log(
      `  stock: ${product.stock}`
    );

    console.log(
      `  batches: ${product.batches.length}`
    );

    console.log(
      `  positive batches: ${positiveBatches.length}`
    );

    if (
      positiveBatches.length > 0
    ) {
      for (const batch of positiveBatches) {
        console.log(
          `  Batch #${batch.id}: ` +
          `${batch.quantity} шт., ` +
          `status=${batch.status}, ` +
          `expiry=${batch.expiryDate.toISOString()}`
        );
      }
    } else {
      console.log(
        "  Остаток: 0 шт."
      );
    }
  }

  /*
   * ============================================================
   * 10. FIFO CHRONOLOGY
   * ============================================================
   *
   * Проверяем только те OrderBatch, которые существуют.
   *
   * Сравниваем продажи одного продукта по дате заказа
   * с партией по expiryDate / receivedAt.
   *
   * Это не пытается реконструировать исторические отсутствующие
   * OrderBatch.
   */

  console.log();
  separator();
  console.log("🔟 FIFO / BATCH CHRONOLOGY");
  separator();

  let fifoWarnings = 0;

  const allOrderBatches =
    await prisma.orderBatch.findMany({
      orderBy: {
        id: "asc",
      },
      include: {
        batch: true,
        orderItem: {
          include: {
            order: true,
            product: true,
          },
        },
      },
    });

  for (
    let i = 0;
    i < allOrderBatches.length;
    i++
  ) {
    const current =
      allOrderBatches[i];

    const currentProductId =
      current.orderItem.productId;

    const currentOrderDate =
      current.orderItem.order.date;

    for (
      let j = i + 1;
      j < allOrderBatches.length;
      j++
    ) {
      const later =
        allOrderBatches[j];

      if (
        later.orderItem.productId !==
        currentProductId
      ) {
        continue;
      }

      const laterOrderDate =
        later.orderItem.order.date;

      /*
       * Нас интересуют только фактические продажи
       * в хронологическом порядке.
       */
      if (
        laterOrderDate <
        currentOrderDate
      ) {
        continue;
      }

      /*
       * Если более ранняя продажа использовала партию
       * с более поздним expiry, чем последующая продажа,
       * это потенциальное нарушение FIFO.
       *
       * Но одинаковые даты допускаются.
       */
      const currentExpiry =
        current.batch.expiryDate.getTime();

      const laterExpiry =
        later.batch.expiryDate.getTime();

      if (
        currentExpiry >
        laterExpiry
      ) {
        /*
         * Не считаем это автоматически CRITICAL,
         * потому что исторические даты могут иметь
         * одинаковые/неполные данные.
         */
        fifoWarnings++;

        if (fifoWarnings <= 20) {
          console.log(
            `⚠️ FIFO warning: ` +
            `OrderBatch #${current.id} ` +
            `Batch #${current.batchId} → ` +
            `Order #${current.orderItem.orderId}; ` +
            `later OrderBatch #${later.id} ` +
            `Batch #${later.batchId}`
          );
        }

        break;
      }
    }
  }

  console.log();

  console.log(
    `FIFO chronology warnings: ${fifoWarnings}`
  );

  if (fifoWarnings === 0) {
    console.log(
      "✅ FIFO chronology без предупреждений."
    );
  } else {
    warnings += fifoWarnings;

    console.log(
      "⚠️ FIFO warnings требуют интерпретации как исторические/хронологические."
    );
  }

  /*
   * ============================================================
   * 11. HISTORICAL SKIP ORDERS
   * ============================================================
   */

  console.log();
  separator();
  console.log("1️⃣1️⃣ HISTORICAL SKIP ORDERS");
  separator();

  for (const id of EXPECTED_SKIP_IDS) {
    const order =
      orders.find(
        (item) => item.id === id
      );

    if (!order) {
      console.log(
        `❌ CRITICAL: expected SKIP Order #${id} отсутствует`
      );

      critical++;
      continue;
    }

    let incomplete = false;

    for (const item of order.items) {
      const batchQuantity =
        item.batches.reduce(
          (sum, orderBatch) =>
            sum + orderBatch.quantity,
          0
        );

      if (
        batchQuantity !== item.quantity
      ) {
        incomplete = true;
      }
    }

    if (!incomplete) {
      console.log(
        `❌ CRITICAL: Order #${id} больше не является историческим SKIP`
      );

      critical++;
    } else {
      console.log(
        `✅ Order #${id}: историческая неполная Batch-история, оставлен без изменений`
      );
    }
  }

  /*
   * ============================================================
   * 12. FINAL COUNTS
   * ============================================================
   */

  console.log();
  separator();
  console.log("1️⃣2️⃣ FINAL AUDIT RESULT");
  separator();

  console.log(
    `CRITICAL: ${critical}`
  );

  console.log(
    `WARNINGS: ${warnings}`
  );

  console.log();

  if (critical === 0) {
    console.log(
      "✅ CRITICAL = 0"
    );
  } else {
    console.log(
      "❌ Обнаружены CRITICAL проблемы."
    );
  }

  console.log();

  if (critical === 0) {
    console.log(
      "🎉 V31 FINAL AUDIT PASSED"
    );

    console.log();
    console.log(
      "Текущее состояние БД прошло контроль после V30."
    );

    console.log(
      `Подтверждённая NET прибыль: ${money(
        calculatedCompleteProfit
      )}`
    );

    console.log(
      `Текущий складской остаток: ${globalBatchStock} шт.`
    );

    console.log(
      `V26 списано: ${writeOffQuantity} шт.`
    );

    console.log();
    console.log(
      "⛔ V31 ничего не изменял."
    );
  } else {
    console.log(
      "❌ V31 FINAL AUDIT FAILED"
    );

    console.log();
    console.log(
      "⛔ Никаких изменений V31 не производил."
    );

    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ V31 AUDIT ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });