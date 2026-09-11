import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_NAME = "Творог";

function line() {
  console.log(
    "======================================================================",
  );
}

function fmtDate(date: Date | null | undefined) {
  if (!date) return "-";
  return date.toISOString();
}

function fmtQty(quantity: number) {
  return quantity >= 0 ? `+${quantity}` : `${quantity}`;
}

type NormalizedRow = {
  date: Date;
  type: string;
  source: string;
  businessDelta: number;
  movementDelta: number;
  normalizedDelta: number;
  details: string;
};

async function main() {
  line();
  console.log("");
  console.log("🧀 ТВОРОГ — LEDGER NORMALIZATION AUDIT V12");
  console.log("");
  line();
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");
  console.log(
    "Цель: нормализовать Business records и Movements без двойного учёта.",
  );
  console.log("");

  line();
  console.log("");
  console.log("1. PRODUCT");
  console.log("");
  line();
  console.log("");

  const product = await prisma.product.findFirst({
    where: {
      name: PRODUCT_NAME,
    },
    include: {
      batches: {
        orderBy: {
          receivedAt: "asc",
        },
      },
    },
  });

  if (!product) {
    console.log(`🔴 Product "${PRODUCT_NAME}" не найден.`);
    return;
  }

  console.log(`Product #${product.id}`);
  console.log("");
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);
  console.log(`cost=${product.cost}`);
  console.log(`price=${product.price}`);

  line();
  console.log("");
  console.log("2. LOAD DATA");
  console.log("");
  line();
  console.log("");

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: product.id,
    },
    include: {
      order: true,
      batches: true,
      ReturnBatch: true,
    },
    orderBy: {
      order: {
        date: "asc",
      },
    },
  });

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: product.id,
    },
    include: {
      supply: true,
    },
    orderBy: {
      supply: {
        date: "asc",
      },
    },
  });

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`OrderItems = ${orderItems.length}`);
  console.log(`SupplyItems = ${supplyItems.length}`);
  console.log(`Movements = ${movements.length}`);

  line();
  console.log("");
  console.log("3. BUILD NORMALIZED BUSINESS EVENTS");
  console.log("");
  line();
  console.log("");

  const normalizedRows: NormalizedRow[] = [];

  const usedMovementIds = new Set<number>();

  let matchedSales = 0;
  let missingSales = 0;
  let saleMismatch = 0;

  let matchedSupplies = 0;
  let missingSupplies = 0;
  let supplyMismatch = 0;

  line();
  console.log("");
  console.log("3A. ORDERS ↔ SALE MOVEMENTS");
  console.log("");
  line();
  console.log("");

  for (const item of orderItems) {
    const returnBatchTotal = item.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0,
    );

    const returned = Math.max(
      item.returned,
      returnBatchTotal,
    );

    const netQuantity =
      item.quantity - returned;

    const expectedSaleMovement =
      -item.quantity;

    const expectedReturnMovement =
      returned;

    const saleMovements = movements.filter((movement) => {
      if (movement.type !== "SALE") return false;

      if (!movement.comment) return false;

      return movement.comment.includes(
        `Заказ №${item.order.id}`,
      );
    });

    const saleMovementTotal =
      saleMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0,
      );

    const returnMovements = movements.filter((movement) => {
      if (movement.type !== "RETURN") return false;

      if (!movement.comment) return false;

      return movement.comment.includes(
        `заказа №${item.order.id}`,
      );
    });

    const returnMovementTotal =
      returnMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0,
      );

    for (const movement of saleMovements) {
      usedMovementIds.add(movement.id);
    }

    for (const movement of returnMovements) {
      usedMovementIds.add(movement.id);
    }

    const saleMatched =
      saleMovements.length > 0 &&
      saleMovementTotal === expectedSaleMovement;

    const returnMatched =
      returned === 0 ||
      returnMovementTotal === expectedReturnMovement;

    if (saleMatched) {
      matchedSales += 1;
    } else {
      missingSales += Math.abs(
        expectedSaleMovement -
          saleMovementTotal,
      );
    }

    if (
      saleMovements.length > 0 &&
      saleMovementTotal !==
        expectedSaleMovement
    ) {
      saleMismatch += Math.abs(
        expectedSaleMovement -
          saleMovementTotal,
      );
    }

    console.log(
      `Order #${item.order.id} | ` +
        `OrderItem #${item.id} | ` +
        `date=${fmtDate(item.order.date)}`,
    );

    console.log(
      `  gross=${item.quantity} | ` +
        `returned=${returned} | ` +
        `net=${netQuantity}`,
    );

    console.log(
      `  expected SALE=${expectedSaleMovement} | ` +
        `actual SALE=${saleMovementTotal}`,
    );

    console.log(
      `  expected RETURN=${expectedReturnMovement} | ` +
        `actual RETURN=${returnMovementTotal}`,
    );

    if (
      saleMatched &&
      returnMatched
    ) {
      console.log(
        "  🟢 ORDER EVENT FULLY MATCHED",
      );
    } else {
      console.log(
        "  🔴 ORDER EVENT HAS MOVEMENT GAP",
      );
    }

    normalizedRows.push({
      date: item.order.date,
      type: "ORDER",
      source:
        `Order #${item.order.id} / ` +
        `OrderItem #${item.id}`,
      businessDelta: -netQuantity,
      movementDelta:
        saleMovementTotal +
        returnMovementTotal,
      normalizedDelta: -netQuantity,
      details:
        `gross=${item.quantity}, ` +
        `returned=${returned}, ` +
        `net=${netQuantity}`,
    });

    console.log("");
  }

  line();
  console.log("");
  console.log("3B. SUPPLIES ↔ SUPPLY MOVEMENTS");
  console.log("");
  line();
  console.log("");

  for (const item of supplyItems) {
    const supplyMovements = movements.filter(
      (movement) => {
        if (
          movement.type !== "SUPPLY"
        ) {
          return false;
        }

        if (!movement.comment) {
          return false;
        }

        return (
          movement.comment.includes(
            `Поставка №${item.supply.id}`,
          ) ||
          movement.comment.includes(
            `поставка №${item.supply.id}`,
          )
        );
      },
    );

    const movementTotal =
      supplyMovements.reduce(
        (sum, movement) =>
          sum + movement.quantity,
        0,
      );

    for (
      const movement of supplyMovements
    ) {
      usedMovementIds.add(movement.id);
    }

    const matched =
      supplyMovements.length > 0 &&
      movementTotal === item.quantity;

    if (matched) {
      matchedSupplies += 1;
    } else {
      missingSupplies += Math.abs(
        item.quantity -
          movementTotal,
      );
    }

    if (
      supplyMovements.length > 0 &&
      movementTotal !==
        item.quantity
    ) {
      supplyMismatch += Math.abs(
        item.quantity -
          movementTotal,
      );
    }

    console.log(
      `Supply #${item.supply.id} | ` +
        `SupplyItem #${item.id} | ` +
        `date=${fmtDate(item.supply.date)}`,
    );

    console.log(
      `  expected SUPPLY=+${item.quantity} | ` +
        `actual=${movementTotal}`,
    );

    if (matched) {
      console.log(
        "  🟢 SUPPLY EVENT MATCHED",
      );
    } else {
      console.log(
        "  🔴 SUPPLY EVENT HAS MOVEMENT GAP",
      );
    }

    normalizedRows.push({
      date: item.supply.date,
      type: "SUPPLY",
      source:
        `Supply #${item.supply.id} / ` +
        `SupplyItem #${item.id}`,
      businessDelta: item.quantity,
      movementDelta:
        movementTotal,
      normalizedDelta:
        item.quantity,
      details:
        `qty=${item.quantity}, ` +
        `cost=${item.cost}`,
    });

    console.log("");
  }

  line();
  console.log("");
  console.log("4. UNMATCHED MOVEMENTS");
  console.log("");
  line();
  console.log("");

  let unmatchedMovementNet = 0;

  let unmatchedWriteOff = 0;
  let unmatchedSale = 0;
  let unmatchedReturn = 0;
  let unmatchedSupply = 0;

  const batchReferenceRegex =
    /Партия\s*№(\d+)/i;

  for (const movement of movements) {
    if (
      usedMovementIds.has(
        movement.id,
      )
    ) {
      continue;
    }

    unmatchedMovementNet +=
      movement.quantity;

    if (
      movement.type ===
      "WRITE_OFF"
    ) {
      unmatchedWriteOff +=
        movement.quantity;
    }

    if (
      movement.type ===
      "SALE"
    ) {
      unmatchedSale +=
        movement.quantity;
    }

    if (
      movement.type ===
      "RETURN"
    ) {
      unmatchedReturn +=
        movement.quantity;
    }

    if (
      movement.type ===
      "SUPPLY"
    ) {
      unmatchedSupply +=
        movement.quantity;
    }

    let batchStatus =
      "";

    if (
      movement.comment
    ) {
      const match =
        movement.comment.match(
          batchReferenceRegex,
        );

      if (match) {
        const batchId =
          Number(match[1]);

        const batch =
          await prisma.batch.findUnique(
            {
              where: {
                id: batchId,
              },
            },
          );

        batchStatus = batch
          ? ` | Batch #${batchId}=EXISTS`
          : ` | 🔴 Batch #${batchId}=MISSING`;
      }
    }

    console.log(
      `Movement #${movement.id} | ` +
        `${movement.type} | ` +
        `qty=${fmtQty(movement.quantity)} | ` +
        `date=${fmtDate(movement.createdAt)}`,
    );

    console.log(
      `  comment=${movement.comment ?? "-"}` +
        batchStatus,
    );

    normalizedRows.push({
      date: movement.createdAt,
      type:
        `UNMATCHED_MOVEMENT:${movement.type}`,
      source:
        `Movement #${movement.id}`,
      businessDelta: 0,
      movementDelta:
        movement.quantity,
      normalizedDelta:
        movement.quantity,
      details:
        movement.comment ?? "-",
    });

    console.log("");
  }

  line();
  console.log("");
  console.log("5. NORMALIZED TIMELINE");
  console.log("");
  line();
  console.log("");

  normalizedRows.sort(
    (a, b) =>
      a.date.getTime() -
      b.date.getTime(),
  );

  let businessBalance = 0;
  let movementBalance = 0;
  let normalizedBalance = 0;

  for (
    const row of normalizedRows
  ) {
    businessBalance +=
      row.businessDelta;

    movementBalance +=
      row.movementDelta;

    normalizedBalance +=
      row.normalizedDelta;

    console.log(
      `${fmtDate(row.date)} | ` +
        `${row.type.padEnd(28)} | ` +
        `${row.source}`,
    );

    console.log(
      `  business=${fmtQty(row.businessDelta)} | ` +
        `movement=${fmtQty(row.movementDelta)} | ` +
        `normalized=${fmtQty(row.normalizedDelta)}`,
    );

    console.log(
      `  B=${businessBalance} | ` +
        `M=${movementBalance} | ` +
        `N=${normalizedBalance}`,
    );

    console.log(
      `  ${row.details}`,
    );

    console.log("");
  }

  line();
  console.log("");
  console.log("6. NORMALIZED TOTALS");
  console.log("");
  line();
  console.log("");

  const currentStock =
    product.stock;

  const businessOpening =
    currentStock -
    businessBalance;

  const movementOpening =
    currentStock -
    movementBalance;

  const normalizedOpening =
    currentStock -
    normalizedBalance;

  console.log(
    `Current stock = ${currentStock}`,
  );

  console.log("");

  console.log(
    `Business ledger delta = ${businessBalance}`,
  );

  console.log(
    `Movement ledger delta = ${movementBalance}`,
  );

  console.log(
    `Normalized ledger delta = ${normalizedBalance}`,
  );

  console.log("");

  console.log(
    `BUSINESS OPENING REQUIRED = ${businessOpening}`,
  );

  console.log(
    `MOVEMENT OPENING REQUIRED = ${movementOpening}`,
  );

  console.log(
    `NORMALIZED OPENING REQUIRED = ${normalizedOpening}`,
  );

  line();
  console.log("");
  console.log("7. MOVEMENT MATCH SUMMARY");
  console.log("");
  line();
  console.log("");

  console.log(
    `Matched sales = ${matchedSales}`,
  );

  console.log(
    `Missing SALE quantity = ${missingSales}`,
  );

  console.log(
    `SALE mismatch quantity = ${saleMismatch}`,
  );

  console.log("");

  console.log(
    `Matched supplies = ${matchedSupplies}`,
  );

  console.log(
    `Missing SUPPLY quantity = ${missingSupplies}`,
  );

  console.log(
    `SUPPLY mismatch quantity = ${supplyMismatch}`,
  );

  console.log("");

  console.log(
    `Unmatched Movement net = ${unmatchedMovementNet}`,
  );

  console.log(
    `Unmatched WRITE_OFF = ${unmatchedWriteOff}`,
  );

  console.log(
    `Unmatched SALE = ${unmatchedSale}`,
  );

  console.log(
    `Unmatched RETURN = ${unmatchedReturn}`,
  );

  console.log(
    `Unmatched SUPPLY = ${unmatchedSupply}`,
  );

  line();
  console.log("");
  console.log("8. MISSING BATCH #4 ANALYSIS");
  console.log("");
  line();
  console.log("");

  const batch4 =
    await prisma.batch.findUnique({
      where: {
        id: 4,
      },
    });

  console.log(
    `Batch #4 exists = ${Boolean(batch4)}`,
  );

  const batch4Movements =
    movements.filter(
      (movement) =>
        movement.comment?.match(
          /Партия\s*№4/i,
        ),
    );

  const batch4MovementTotal =
    batch4Movements.reduce(
      (sum, movement) =>
        sum + movement.quantity,
      0,
    );

  console.log(
    `Referenced movements = ${batch4Movements.length}`,
  );

  console.log(
    `Movement net = ${batch4MovementTotal}`,
  );

  for (
    const movement of batch4Movements
  ) {
    console.log(
      `Movement #${movement.id} | ` +
        `${movement.type} | ` +
        `${fmtQty(movement.quantity)} | ` +
        `${fmtDate(movement.createdAt)}`,
    );

    console.log(
      `  ${movement.comment}`,
    );
  }

  line();
  console.log("");
  console.log("9. FORENSIC RESULT");
  console.log("");
  line();
  console.log("");

  console.log(
    `Current stock = ${currentStock}`,
  );

  console.log("");

  console.log(
    `Business opening required = ${businessOpening}`,
  );

  console.log(
    `Movement opening required = ${movementOpening}`,
  );

  console.log(
    `Normalized opening required = ${normalizedOpening}`,
  );

  console.log("");

  console.log(
    `Missing SALE quantity = ${missingSales}`,
  );

  console.log(
    `Missing Batch #4 movement quantity = ${Math.abs(
      batch4MovementTotal,
    )}`,
  );

  console.log("");

  const normalizedVsMovementGap =
    normalizedOpening -
    movementOpening;

  console.log(
    `NORMALIZED vs MOVEMENT OPENING GAP = ${normalizedVsMovementGap}`,
  );

  if (
    normalizedOpening ===
    movementOpening
  ) {
    console.log(
      "🟢 NORMALIZED AND MOVEMENT MODELS AGREE",
    );
  } else {
    console.log(
      "🟠 NORMALIZED AND MOVEMENT MODELS STILL DIFFER",
    );
  }

  console.log("");

  console.log(
    "⚠️ IMPORTANT:",
  );

  console.log(
    "Этот аудит НЕ создаёт исторический Batch автоматически.",
  );

  console.log(
    "Этот аудит НЕ создаёт отсутствующие Movements.",
  );

  console.log(
    "Сначала фиксируется точная структура расхождений.",
  );

  line();
  console.log("");
  console.log("10. FINAL SAFETY STATUS");
  console.log("");
  line();
  console.log("");

  console.log(
    "READ ONLY AUDIT COMPLETED.",
  );

  console.log("");

  console.log(
    "Batch НЕ создавались.",
  );

  console.log(
    "Movement НЕ создавались.",
  );

  console.log(
    "OrderBatch НЕ изменялись.",
  );

  console.log(
    "ReturnBatch НЕ изменялись.",
  );

  console.log(
    "Product.stock НЕ изменялся.",
  );

  console.log("");

  console.log(
    "🏁 AUDIT V12 ЗАВЕРШЁН",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "🔴 AUDIT FAILED",
    );
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });