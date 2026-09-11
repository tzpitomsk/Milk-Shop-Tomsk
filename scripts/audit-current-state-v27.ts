import { PrismaClient, OrderStatus } from "@prisma/client";

const prisma = new PrismaClient();

type IssueLevel = "CRITICAL" | "WARNING" | "INFO";

interface Issue {
  level: IssueLevel;
  message: string;
}

const issues: Issue[] = [];

function issue(level: IssueLevel, message: string) {
  issues.push({ level, message });
}

function divider(title: string) {
  console.log("\n" + "═".repeat(90));
  console.log(` ${title}`);
  console.log("═".repeat(90));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function date(value: Date | string) {
  return new Date(value).toISOString();
}

function daysBetween(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

async function main() {
  const now = new Date();

  console.log("🔎 AUDIT CURRENT STATE V27");
  console.log(`Audit time: ${now.toISOString()}`);
  console.log("MODE: READ-ONLY");
  console.log("⚠️ Никаких create/update/delete операций не выполняется.");

  // ---------------------------------------------------------------------------
  // LOAD DATA
  // ---------------------------------------------------------------------------

  const [
    products,
    batches,
    orderItems,
    orderBatches,
    returnBatches,
    orders,
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
        orderBatches: true,
        ReturnBatch: true,
      },
      orderBy: [{ productId: "asc" }, { expiryDate: "asc" }, { id: "asc" }],
    }),

    prisma.orderItem.findMany({
      include: {
        product: true,
        order: true,
        batches: true,
        ReturnBatch: true,
      },
      orderBy: [{ orderId: "asc" }, { id: "asc" }],
    }),

    prisma.orderBatch.findMany({
      include: {
        batch: true,
        orderItem: {
          include: {
            product: true,
            order: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),

    prisma.returnBatch.findMany({
      include: {
        Batch: true,
        OrderItem: {
          include: {
            product: true,
            order: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),

    prisma.order.findMany({
      include: {
        items: true,
      },
      orderBy: { id: "asc" },
    }),

    prisma.movement.findMany({
      include: {
        product: true,
      },
      orderBy: { id: "asc" },
    }),

    prisma.supply.findMany({
      include: {
        items: true,
      },
      orderBy: { id: "asc" },
    }),

    prisma.supplyItem.findMany({
      include: {
        product: true,
        supply: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  console.log(
    `\nLoaded: ${products.length} products, ${batches.length} batches, ` +
      `${orders.length} orders, ${orderItems.length} order items, ` +
      `${orderBatches.length} OrderBatch, ${returnBatches.length} ReturnBatch, ` +
      `${movements.length} movements.`
  );

  // ===========================================================================
  // 1. PRODUCT STOCK ↔ BATCH STOCK
  // ===========================================================================

  divider("1. PRODUCT STOCK ↔ BATCH TOTAL");

  let globalProductBatchDiff = 0;

  for (const product of products) {
    const productBatches = batches.filter(
      (batch) => batch.productId === product.id
    );

    const batchTotal = productBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    const diff = product.stock - batchTotal;

    globalProductBatchDiff += Math.abs(diff);

    console.log(
      `#${product.id} ${product.name}: ` +
        `Product.stock=${product.stock}, ` +
        `Batch.total=${batchTotal}, ` +
        `diff=${diff}`
    );

    if (diff !== 0) {
      issue(
        "CRITICAL",
        `Product #${product.id} "${product.name}" stock mismatch: ` +
          `Product.stock=${product.stock}, Batch.total=${batchTotal}, diff=${diff}`
      );
    }

    if (product.stock < 0) {
      issue(
        "CRITICAL",
        `Product #${product.id} "${product.name}" has negative stock=${product.stock}`
      );
    }
  }

  if (globalProductBatchDiff === 0) {
    console.log("\n✅ Product.stock полностью соответствует сумме Batch.quantity.");
  }

  // ===========================================================================
  // 2. BATCH SANITY
  // ===========================================================================

  divider("2. BATCH SANITY CHECK");

  const activePositive = batches.filter(
    (batch) => batch.status === "ACTIVE" && batch.quantity > 0
  );

  const activeZero = batches.filter(
    (batch) => batch.status === "ACTIVE" && batch.quantity === 0
  );

  const expiredPositive = batches.filter(
    (batch) => batch.expiryDate < now && batch.quantity > 0
  );

  const expiredNotMarked = batches.filter(
    (batch) => batch.expiryDate < now && batch.status !== "EXPIRED"
  );

  const negativeBatches = batches.filter((batch) => batch.quantity < 0);

  console.log(`ACTIVE + quantity > 0: ${activePositive.length}`);
  console.log(`ACTIVE + quantity = 0: ${activeZero.length}`);
  console.log(`Expired + quantity > 0: ${expiredPositive.length}`);
  console.log(`Expired but status != EXPIRED: ${expiredNotMarked.length}`);
  console.log(`Negative quantity batches: ${negativeBatches.length}`);

  if (activePositive.length > 0) {
    console.log("\n📦 Текущие ACTIVE партии:");

    for (const batch of activePositive) {
      console.log(
        `  Batch #${batch.id} | ${batch.product.name} | ` +
          `qty=${batch.quantity} | cost=${money(batch.purchaseCost)} | ` +
          `received=${date(batch.receivedAt)} | expiry=${date(batch.expiryDate)}`
      );

      if (batch.expiryDate < now) {
        issue(
          "CRITICAL",
          `Batch #${batch.id} "${batch.product.name}" is ACTIVE with ` +
            `quantity=${batch.quantity}, but expired at ${date(batch.expiryDate)}`
        );
      }
    }
  } else {
    console.log("\n✅ ACTIVE партий с положительным остатком нет.");
  }

  if (expiredNotMarked.length > 0) {
    console.log("\n⚠️ Просроченные партии без EXPIRED:");

    for (const batch of expiredNotMarked) {
      const expiredDays = daysBetween(now, batch.expiryDate);

      console.log(
        `  Batch #${batch.id} | ${batch.product.name} | ` +
          `qty=${batch.quantity} | status=${batch.status} | ` +
          `expired=${expiredDays.toFixed(2)} days`
      );

      issue(
        batch.quantity > 0 ? "CRITICAL" : "WARNING",
        `Expired Batch #${batch.id} has status=${batch.status}, ` +
          `quantity=${batch.quantity}`
      );
    }
  } else {
    console.log("✅ Все просроченные партии имеют status=EXPIRED.");
  }

  if (negativeBatches.length > 0) {
    for (const batch of negativeBatches) {
      issue(
        "CRITICAL",
        `Batch #${batch.id} "${batch.product.name}" has negative quantity=${batch.quantity}`
      );
    }
  }

  // ===========================================================================
  // 3. ORDERBATCH INTEGRITY
  // ===========================================================================

  divider("3. ORDERBATCH INTEGRITY");

  let orderBatchQuantityMismatch = 0;
  let orderBatchProductMismatch = 0;
  let orderBatchNegative = 0;

  const orderBatchByItem = new Map<number, number>();

  for (const ob of orderBatches) {
    const current = orderBatchByItem.get(ob.orderItemId) ?? 0;
    orderBatchByItem.set(ob.orderItemId, current + ob.quantity);

    if (ob.quantity <= 0) {
      orderBatchNegative++;
      issue(
        "CRITICAL",
        `OrderBatch #${ob.id} has invalid quantity=${ob.quantity}`
      );
    }

    if (ob.batch.productId !== ob.orderItem.productId) {
      orderBatchProductMismatch++;

      issue(
        "CRITICAL",
        `OrderBatch #${ob.id} product mismatch: ` +
          `Batch #${ob.batchId} belongs to Product #${ob.batch.productId}, ` +
          `OrderItem #${ob.orderItemId} belongs to Product #${ob.orderItem.productId}`
      );
    }
  }

  for (const item of orderItems) {
    const linkedQuantity = orderBatchByItem.get(item.id) ?? 0;

    if (linkedQuantity !== item.quantity) {
      orderBatchQuantityMismatch++;

      issue(
        "WARNING",
        `OrderItem #${item.id} quantity mismatch: ` +
          `gross=${item.quantity}, OrderBatch.total=${linkedQuantity}, ` +
          `product="${item.product.name}", order=#${item.orderId}`
      );
    }
  }

  const missingOrderBatchItems = orderItems.filter(
    (item) => !orderBatchByItem.has(item.id)
  );

  console.log(`OrderBatch records: ${orderBatches.length}`);
  console.log(`OrderItems: ${orderItems.length}`);
  console.log(
    `OrderItems without OrderBatch: ${missingOrderBatchItems.length}`
  );
  console.log(`Gross quantity mismatches: ${orderBatchQuantityMismatch}`);
  console.log(`Product mismatches: ${orderBatchProductMismatch}`);
  console.log(`Invalid/negative quantities: ${orderBatchNegative}`);

  if (missingOrderBatchItems.length > 0) {
    console.log("\n📋 OrderItems без OrderBatch:");

    for (const item of missingOrderBatchItems) {
      console.log(
        `  OrderItem #${item.id} | Order #${item.orderId} | ` +
          `${item.product.name} | gross=${item.quantity} | ` +
          `returned=${item.returned} | net=${item.quantity - item.returned} | ` +
          `date=${date(item.order.date)}`
      );
    }

    console.log(
      "\nℹ️ Эти записи НЕ восстанавливаются автоматически. " +
        "Исторические продажи могут относиться к отсутствующему opening stock."
    );
  }

  // ===========================================================================
  // 4. FIFO / CHRONOLOGY
  // ===========================================================================

  divider("4. FIFO / BATCH CHRONOLOGY");

  let fifoChecked = 0;
  let fifoWarnings = 0;

  const orderBatchByProduct = new Map<number, typeof orderBatches>();

  for (const ob of orderBatches) {
    const productId = ob.orderItem.productId;

    if (!orderBatchByProduct.has(productId)) {
      orderBatchByProduct.set(productId, []);
    }

    orderBatchByProduct.get(productId)!.push(ob);
  }

  for (const [productId, links] of orderBatchByProduct.entries()) {
    const product = products.find((p) => p.id === productId);

    if (!product) {
      issue(
        "CRITICAL",
        `OrderBatch references unknown Product #${productId}`
      );
      continue;
    }

    const sorted = [...links].sort((a, b) => {
      const dateA = new Date(a.orderItem.order.date).getTime();
      const dateB = new Date(b.orderItem.order.date).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return a.id - b.id;
    });

    let previousBatchReceivedAt: number | null = null;

    for (const ob of sorted) {
      fifoChecked++;

      const receivedAt = new Date(ob.batch.receivedAt).getTime();

      if (
        previousBatchReceivedAt !== null &&
        receivedAt < previousBatchReceivedAt
      ) {
        fifoWarnings++;

        issue(
          "WARNING",
          `Possible FIFO chronology issue for Product #${productId} "${product.name}": ` +
            `OrderBatch #${ob.id} uses Batch #${ob.batchId} received earlier ` +
            `than previous chronological allocation`
        );
      }

      previousBatchReceivedAt = Math.max(
        previousBatchReceivedAt ?? receivedAt,
        receivedAt
      );
    }
  }

  console.log(`FIFO links checked: ${fifoChecked}`);
  console.log(`FIFO chronology warnings: ${fifoWarnings}`);

  if (fifoWarnings === 0) {
    console.log("✅ Явных FIFO-хронологических нарушений не найдено.");
  }

  // ===========================================================================
  // 5. RETURN INTEGRITY
  // ===========================================================================

  divider("5. RETURN / RETURNBATCH INTEGRITY");

  let returnOverGross = 0;
  let returnBatchOverSold = 0;
  let returnProductMismatch = 0;

  const returnByOrderItem = new Map<number, number>();
  const soldByOrderItemBatch = new Map<string, number>();

  for (const ob of orderBatches) {
    const key = `${ob.orderItemId}:${ob.batchId}`;
    soldByOrderItemBatch.set(
      key,
      (soldByOrderItemBatch.get(key) ?? 0) + ob.quantity
    );
  }

  for (const rb of returnBatches) {
    returnByOrderItem.set(
      rb.orderItemId,
      (returnByOrderItem.get(rb.orderItemId) ?? 0) + rb.quantity
    );

    if (rb.quantity <= 0) {
      issue(
        "CRITICAL",
        `ReturnBatch #${rb.id} has invalid quantity=${rb.quantity}`
      );
    }

    if (rb.Batch.productId !== rb.OrderItem.productId) {
      returnProductMismatch++;

      issue(
        "CRITICAL",
        `ReturnBatch #${rb.id} product mismatch: ` +
          `Batch #${rb.batchId} product=${rb.Batch.productId}, ` +
          `OrderItem #${rb.orderItemId} product=${rb.OrderItem.productId}`
      );
    }

    const soldKey = `${rb.orderItemId}:${rb.batchId}`;
    const soldFromBatch = soldByOrderItemBatch.get(soldKey) ?? 0;

    const returnedFromSameBatch = returnBatches
      .filter(
        (other) =>
          other.orderItemId === rb.orderItemId &&
          other.batchId === rb.batchId
      )
      .reduce((sum, other) => sum + other.quantity, 0);

    if (returnedFromSameBatch > soldFromBatch) {
      returnBatchOverSold++;

      issue(
        "CRITICAL",
        `ReturnBatch over-return: OrderItem #${rb.orderItemId}, ` +
          `Batch #${rb.batchId}: returned=${returnedFromSameBatch}, ` +
          `sold=${soldFromBatch}`
      );
    }
  }

  for (const item of orderItems) {
    const returnTotal = returnByOrderItem.get(item.id) ?? 0;

    if (item.returned !== returnTotal) {
      issue(
        "CRITICAL",
        `OrderItem #${item.id} returned mismatch: ` +
          `OrderItem.returned=${item.returned}, ` +
          `ReturnBatch.total=${returnTotal}`
      );
    }

    if (item.returned > item.quantity) {
      returnOverGross++;

      issue(
        "CRITICAL",
        `OrderItem #${item.id} returned=${item.returned} exceeds gross quantity=${item.quantity}`
      );
    }

    if (item.returned < 0) {
      issue(
        "CRITICAL",
        `OrderItem #${item.id} has negative returned=${item.returned}`
      );
    }
  }

  console.log(`ReturnBatch records: ${returnBatches.length}`);
  console.log(`OrderItems with returns: ${returnByOrderItem.size}`);
  console.log(`Returned > gross: ${returnOverGross}`);
  console.log(`ReturnBatch > sold from same batch: ${returnBatchOverSold}`);
  console.log(`Return product mismatches: ${returnProductMismatch}`);

  if (
    returnOverGross === 0 &&
    returnBatchOverSold === 0 &&
    returnProductMismatch === 0
  ) {
    console.log("✅ Возвраты соответствуют проданным количествам.");
  }

  // ===========================================================================
  // 6. ORDER STATUS INTEGRITY
  // ===========================================================================

  divider("6. ORDER STATUS INTEGRITY");

  let statusMismatch = 0;

  for (const order of orders) {
    const gross = order.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const returned = order.items.reduce(
      (sum, item) => sum + item.returned,
      0
    );

    let expectedStatus: OrderStatus;

    if (gross > 0 && returned === 0) {
      expectedStatus = OrderStatus.COMPLETED;
    } else if (gross > 0 && returned >= gross) {
      expectedStatus = OrderStatus.RETURNED;
    } else if (returned > 0) {
      expectedStatus = OrderStatus.PARTIAL_RETURN;
    } else {
      expectedStatus = OrderStatus.COMPLETED;
    }

    if (order.status !== expectedStatus) {
      statusMismatch++;

      issue(
        "CRITICAL",
        `Order #${order.id} status mismatch: ` +
          `actual=${order.status}, expected=${expectedStatus}, ` +
          `gross=${gross}, returned=${returned}`
      );
    }

    console.log(
      `Order #${order.id}: status=${order.status}, ` +
        `expected=${expectedStatus}, gross=${gross}, returned=${returned}`
    );
  }

  if (statusMismatch === 0) {
    console.log("\n✅ Все статусы заказов соответствуют возвратам.");
  }

  // ===========================================================================
  // 7. ORDER PROFIT SANITY
  // ===========================================================================

  divider("7. ORDER PROFIT SANITY");

  let profitWarnings = 0;

  const purchaseCostByItem = new Map<number, number>();

  for (const ob of orderBatches) {
    purchaseCostByItem.set(
      ob.orderItemId,
      (purchaseCostByItem.get(ob.orderItemId) ?? 0) +
        ob.quantity * ob.purchaseCost
    );
  }

  for (const order of orders) {
    const calculatedCost = order.items.reduce(
      (sum, item) => sum + (purchaseCostByItem.get(item.id) ?? 0),
      0
    );

    const calculatedProfit = order.total - calculatedCost;

    /*
     * Важный момент:
     * для исторических OrderItem без OrderBatch невозможно доказать
     * себестоимость. Поэтому проверяем profit только там, где
     * себестоимость полностью покрыта OrderBatch.
     */
    const hasMissingBatch = order.items.some(
      (item) => !orderBatchByItem.has(item.id)
    );

    if (!hasMissingBatch) {
      if (order.profit !== calculatedProfit) {
        profitWarnings++;

        issue(
          "WARNING",
          `Order #${order.id} profit mismatch: ` +
            `stored=${money(order.profit)}, ` +
            `calculated=${money(calculatedProfit)}, ` +
            `total=${money(order.total)}, ` +
            `cost=${money(calculatedCost)}`
        );
      }

      console.log(
        `Order #${order.id}: total=${money(order.total)}, ` +
          `profit=${money(order.profit)}, ` +
          `calculatedProfit=${money(calculatedProfit)}`
      );
    } else {
      console.log(
        `Order #${order.id}: profit=${money(order.profit)} ` +
          `(⚠️ historical OrderItem without OrderBatch — exact cost unavailable)`
      );
    }
  }

  console.log(`Profit mismatches on fully linked orders: ${profitWarnings}`);

  // ===========================================================================
  // 8. WRITE-OFF MOVEMENTS V26
  // ===========================================================================

  divider("8. V26 WRITE-OFF MOVEMENTS");

  const writeOffMovements = movements.filter(
    (movement) => movement.type === "WRITE_OFF"
  );

  console.log(`WRITE_OFF movements: ${writeOffMovements.length}`);

  let writeOffWarnings = 0;

  for (const movement of writeOffMovements) {
    console.log(
      `Movement #${movement.id} | product=${movement.product.name} | ` +
        `quantity=${movement.quantity} | created=${date(movement.createdAt)} | ` +
        `comment=${movement.comment ?? ""}`
    );

    if (movement.quantity >= 0) {
      writeOffWarnings++;

      issue(
        "WARNING",
        `WRITE_OFF Movement #${movement.id} has non-negative quantity=${movement.quantity}`
      );
    }
  }

  if (writeOffWarnings === 0) {
    console.log("✅ Все WRITE_OFF движения имеют отрицательное количество.");
  }

  // ===========================================================================
  // 9. V26 TARGET VERIFICATION
  // ===========================================================================

  divider("9. V26 EXPIRED BATCH VERIFICATION");

  const v26BatchIds = [28, 29, 30, 31];

  for (const batchId of v26BatchIds) {
    const batch = batches.find((b) => b.id === batchId);

    if (!batch) {
      issue(
        "CRITICAL",
        `Expected V26 Batch #${batchId} not found`
      );
      continue;
    }

    const orderBatchCount = orderBatches.filter(
      (ob) => ob.batchId === batch.id
    ).length;

    const returnBatchCount = returnBatches.filter(
      (rb) => rb.batchId === batch.id
    ).length;

    console.log(
      `Batch #${batch.id} | ${batch.product.name} | ` +
        `qty=${batch.quantity} | status=${batch.status} | ` +
        `OrderBatch=${orderBatchCount} | ReturnBatch=${returnBatchCount}`
    );

    if (batch.quantity !== 0) {
      issue(
        "CRITICAL",
        `V26 Batch #${batch.id} expected quantity=0, actual=${batch.quantity}`
      );
    }

    if (batch.status !== "EXPIRED") {
      issue(
        "CRITICAL",
        `V26 Batch #${batch.id} expected status=EXPIRED, actual=${batch.status}`
      );
    }

    if (orderBatchCount !== 0) {
      issue(
        "CRITICAL",
        `V26 Batch #${batch.id} unexpectedly has ${orderBatchCount} OrderBatch links`
      );
    }

    if (returnBatchCount !== 0) {
      issue(
        "CRITICAL",
        `V26 Batch #${batch.id} unexpectedly has ${returnBatchCount} ReturnBatch links`
      );
    }
  }

  // ===========================================================================
  // 10. MOVEMENT STOCK SIGNAL
  // ===========================================================================

  divider("10. MOVEMENT HISTORY — INFORMATIONAL ONLY");

  const negativeMovements = movements.filter(
    (movement) => movement.quantity < 0
  );

  const positiveMovements = movements.filter(
    (movement) => movement.quantity > 0
  );

  console.log(`Total movements: ${movements.length}`);
  console.log(`Positive movements: ${positiveMovements.length}`);
  console.log(`Negative movements: ${negativeMovements.length}`);

  console.log(
    "\nℹ️ Movement history НЕ используется как источник истины текущего stock."
  );
  console.log(
    "Current stock определяется Product.stock ↔ SUM(Batch.quantity)."
  );

  // ===========================================================================
  // 11. SUPPLY / BATCH FORENSICS
  // ===========================================================================

  divider("11. SUPPLY → BATCH FORENSICS");

  console.log(
    "SupplyItem не имеет прямого FK на Batch, поэтому это только forensic-проверка."
  );

  let supplyEvidenceCount = 0;

  for (const batch of batches) {
    const candidates = supplyItems.filter(
      (item) =>
        item.productId === batch.productId &&
        item.cost === batch.purchaseCost &&
        Math.abs(
          new Date(item.supply.date).getTime() -
            new Date(batch.receivedAt).getTime()
        ) <
          5 * 60 * 1000
    );

    if (candidates.length > 0) {
      supplyEvidenceCount++;

      console.log(
        `Batch #${batch.id} ${batch.product.name}: ` +
          `possible SupplyItem matches=${candidates.length}`
      );
    }
  }

  console.log(
    `Batches with nearby SupplyItem evidence: ${supplyEvidenceCount}/${batches.length}`
  );

  // ===========================================================================
  // 12. CURRENT STOCK SUMMARY
  // ===========================================================================

  divider("12. CURRENT STOCK SUMMARY");

  let totalCurrentUnits = 0;

  for (const product of products) {
    const total = batches
      .filter((batch) => batch.productId === product.id)
      .reduce((sum, batch) => sum + batch.quantity, 0);

    totalCurrentUnits += total;

    console.log(
      `#${product.id} ${product.name}: ${total} ${product.unit}`
    );
  }

  console.log(`\nTOTAL CURRENT UNITS: ${totalCurrentUnits}`);

  // ===========================================================================
  // 13. SUMMARY
  // ===========================================================================

  divider("13. FINAL V27 SUMMARY");

  const critical = issues.filter((x) => x.level === "CRITICAL");
  const warnings = issues.filter((x) => x.level === "WARNING");
  const info = issues.filter((x) => x.level === "INFO");

  console.log(`CRITICAL: ${critical.length}`);
  console.log(`WARNING:  ${warnings.length}`);
  console.log(`INFO:     ${info.length}`);

  if (critical.length > 0) {
    console.log("\n🚨 CRITICAL ISSUES:");

    for (const item of critical) {
      console.log(`  ❌ ${item.message}`);
    }
  }

  if (warnings.length > 0) {
    console.log("\n⚠️ WARNINGS:");

    for (const item of warnings) {
      console.log(`  ⚠️ ${item.message}`);
    }
  }

  if (critical.length === 0 && warnings.length === 0) {
    console.log("\n🎉 V27 PASSED.");
    console.log("Все проверенные инварианты находятся в согласованном состоянии.");
  } else if (critical.length === 0) {
    console.log(
      "\n✅ Критических нарушений нет. Остались только предупреждения/исторические ограничения."
    );
  } else {
    console.log(
      "\n🚨 Обнаружены критические нарушения. Ничего автоматически не исправляем."
    );
  }

  console.log("\n" + "═".repeat(90));
  console.log(" V27 FINISHED — READ-ONLY");
  console.log("═".repeat(90));
}

main()
  .catch((error) => {
    console.error("\n❌ V27 FAILED:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });