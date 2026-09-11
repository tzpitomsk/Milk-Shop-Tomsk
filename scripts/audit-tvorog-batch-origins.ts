import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

type SupplyRow = {
  id: number;
  supplyId: number;
  date: Date;
  quantity: number;
  cost: number;
};

type BatchRow = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
  status: string;
};

function money(value: number) {
  return `${value} ₽`;
}

function date(value: Date) {
  return value.toISOString();
}

async function main() {
  console.log("========================================");
  console.log("🧀 ТВОРОГ — АУДИТ ПРОИСХОЖДЕНИЯ BATCH");
  console.log("========================================");
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Продукт: #${product.id} ${product.name}`);
  console.log(`Product.stock: ${product.stock}`);
  console.log("");

  // ============================================================
  // SUPPLIES
  // ============================================================

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
    orderBy: [
      {
        supply: {
          date: "asc",
        },
      },
      {
        id: "asc",
      },
    ],
  });

  const supplies: SupplyRow[] = supplyItems.map((item) => ({
    id: item.id,
    supplyId: item.supplyId,
    date: item.supply.date,
    quantity: item.quantity,
    cost: item.cost,
  }));

  console.log("========================================");
  console.log("🚚 ПОСТАВКИ");
  console.log("========================================");
  console.log("");

  let totalSupplied = 0;

  for (const supply of supplies) {
    totalSupplied += supply.quantity;

    console.log(
      `SupplyItem #${supply.id} | ` +
        `Supply #${supply.supplyId} | ` +
        `${date(supply.date)} | ` +
        `+${supply.quantity} шт × ${money(supply.cost)}`,
    );
  }

  console.log("");
  console.log(`ИТОГО ПОСТАВЛЕНО: ${totalSupplied} шт`);
  console.log("");

  // ============================================================
  // BATCHES
  // ============================================================

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      orderBatches: {
        include: {
          orderItem: {
            include: {
              order: true,
            },
          },
        },
        orderBy: {
          id: "asc",
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
        orderBy: {
          id: "asc",
        },
      },
    },
    orderBy: [
      {
        receivedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  console.log("========================================");
  console.log("📦 ВСЕ BATCH ПРОДУКТА");
  console.log("========================================");
  console.log("");

  let totalCurrentBatch = 0;

  for (const batch of batches) {
    totalCurrentBatch += batch.quantity;

    const sold = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const historicalCapacity =
      batch.quantity + sold - returned;

    console.log(`Batch #${batch.id}`);
    console.log(`  productId:     ${batch.productId}`);
    console.log(`  current:       ${batch.quantity}`);
    console.log(`  purchaseCost:  ${money(batch.purchaseCost)}`);
    console.log(`  receivedAt:    ${date(batch.receivedAt)}`);
    console.log(`  expiryDate:    ${date(batch.expiryDate)}`);
    console.log(`  status:        ${batch.status}`);
    console.log(`  sold linked:   ${sold}`);
    console.log(`  returned:      ${returned}`);
    console.log(`  capacity:      ${historicalCapacity}`);

    console.log("");

    if (batch.orderBatches.length > 0) {
      console.log("  OrderBatch:");

      for (const ob of batch.orderBatches) {
        console.log(
          `    #${ob.id} | ` +
            `Order #${ob.orderItem.orderId} | ` +
            `OrderItem #${ob.orderItemId} | ` +
            `${ob.quantity} шт | ` +
            `${date(ob.orderItem.order.date)} | ` +
            `cost=${money(ob.purchaseCost)}`,
        );
      }
    } else {
      console.log("  OrderBatch: НЕТ");
    }

    if (batch.ReturnBatch.length > 0) {
      console.log("  ReturnBatch:");

      for (const rb of batch.ReturnBatch) {
        console.log(
          `    #${rb.id} | ` +
            `Order #${rb.OrderItem.orderId} | ` +
            `OrderItem #${rb.orderItemId} | ` +
            `${rb.quantity} шт | ` +
            `created=${date(rb.createdAt)}`,
        );
      }
    } else {
      console.log("  ReturnBatch: НЕТ");
    }

    console.log("");
    console.log("----------------------------------------");
    console.log("");
  }

  console.log(`SUM Batch.current: ${totalCurrentBatch}`);
  console.log("");

  // ============================================================
  // MOVEMENTS
  // ============================================================

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  console.log("========================================");
  console.log("📜 MOVEMENT — ВСЯ ИСТОРИЯ");
  console.log("========================================");
  console.log("");

  let movementBalance = 0;

  for (const movement of movements) {
    movementBalance += movement.quantity;

    console.log(
      `#${movement.id} | ` +
        `${date(movement.createdAt)} | ` +
        `${movement.type.padEnd(18)} | ` +
        `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
        `balance=${movementBalance} | ` +
        `${movement.comment ?? ""}`,
    );
  }

  console.log("");
  console.log(`FINAL MOVEMENT BALANCE: ${movementBalance}`);
  console.log("");

  // ============================================================
  // MOVEMENTS MENTIONING BATCH
  // ============================================================

  console.log("========================================");
  console.log("🔎 MOVEMENT → BATCH");
  console.log("========================================");
  console.log("");

  const batchMentionRegex = /парт(?:ия|ии|ию|ий|иях)?\s*№?\s*(\d+)/i;

  const batchMovementMap = new Map<
    number,
    {
      id: number;
      type: string;
      quantity: number;
      createdAt: Date;
      comment: string | null;
    }[]
  >();

  for (const movement of movements) {
    const comment = movement.comment ?? "";

    const match = comment.match(batchMentionRegex);

    if (!match) {
      continue;
    }

    const batchId = Number(match[1]);

    const existing = batchMovementMap.get(batchId) ?? [];

    existing.push({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      createdAt: movement.createdAt,
      comment: movement.comment,
    });

    batchMovementMap.set(batchId, existing);
  }

  if (batchMovementMap.size === 0) {
    console.log("Нет Movement с явно указанным Batch.");
  } else {
    for (const [batchId, rows] of batchMovementMap.entries()) {
      console.log(`Batch #${batchId}`);

      for (const row of rows) {
        console.log(
          `  Movement #${row.id} | ` +
            `${date(row.createdAt)} | ` +
            `${row.type} | ` +
            `${row.quantity >= 0 ? "+" : ""}${row.quantity} | ` +
            `${row.comment ?? ""}`,
        );
      }

      const exists = batches.some(
        (batch) => batch.id === batchId,
      );

      if (!exists) {
        console.log(
          "  🔴 ЭТОЙ ПАРТИИ НЕТ СРЕДИ ТЕКУЩИХ BATCH ПРОДУКТА",
        );
      }

      console.log("");
    }
  }

  // ============================================================
  // BATCH ID GAPS
  // ============================================================

  console.log("========================================");
  console.log("🧩 ПРОВЕРКА ID BATCH");
  console.log("========================================");
  console.log("");

  const allBatchIds = await prisma.batch.findMany({
    select: {
      id: true,
      productId: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("Все Batch в базе:");

  for (const batch of allBatchIds) {
    console.log(
      `  Batch #${batch.id} | productId=${batch.productId}` +
        (batch.productId === PRODUCT_ID
          ? " ← ТВОРОГ"
          : ""),
    );
  }

  console.log("");

  // ============================================================
  // COST ANALYSIS
  // ============================================================

  console.log("========================================");
  console.log("💰 АНАЛИЗ СЕБЕСТОИМОСТИ");
  console.log("========================================");
  console.log("");

  console.log("SupplyItem:");

  for (const supply of supplies) {
    console.log(
      `  SupplyItem #${supply.id}: ` +
        `${supply.quantity} шт × ${money(supply.cost)} ` +
        `= ${money(supply.quantity * supply.cost)}`,
    );
  }

  console.log("");

  console.log("Batch:");

  for (const batch of batches) {
    const sold = batch.orderBatches.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const capacity =
      batch.quantity + sold - returned;

    console.log(
      `  Batch #${batch.id}: ` +
        `capacity=${capacity} × ${money(batch.purchaseCost)} ` +
        `= ${money(capacity * batch.purchaseCost)}`,
    );
  }

  console.log("");

  // ============================================================
  // DATE / COST CANDIDATES
  // ============================================================

  console.log("========================================");
  console.log("🧠 ВОЗМОЖНЫЕ SUPPLY → BATCH СООТВЕТСТВИЯ");
  console.log("========================================");
  console.log("");

  console.log(
    "⚠️ Это ТОЛЬКО аналитическая подсказка.",
  );
  console.log(
    "⚠️ Никакие связи в БД здесь не создаются.",
  );
  console.log("");

  for (const batch of batches) {
    console.log(`Batch #${batch.id}:`);
    console.log(
      `  received=${date(batch.receivedAt)}`,
    );
    console.log(
      `  expiry=${date(batch.expiryDate)}`,
    );
    console.log(
      `  purchaseCost=${money(batch.purchaseCost)}`,
    );

    const candidates = supplies
      .map((supply) => {
        const costDifference =
          Math.abs(supply.cost - batch.purchaseCost);

        const dateDifference =
          batch.receivedAt.getTime() -
          supply.date.getTime();

        const absDateDifference =
          Math.abs(dateDifference);

        return {
          supply,
          costDifference,
          dateDifference,
          absDateDifference,
        };
      })
      .sort(
        (a, b) =>
          a.costDifference - b.costDifference ||
          a.absDateDifference - b.absDateDifference,
      );

    if (candidates.length === 0) {
      console.log("  Кандидатов нет");
    } else {
      for (const candidate of candidates.slice(0, 5)) {
        const direction =
          candidate.dateDifference >= 0
            ? "после поставки"
            : "ДО поставки";

        console.log(
          `  → SupplyItem #${candidate.supply.id} | ` +
            `Supply #${candidate.supply.supplyId} | ` +
            `${candidate.supply.quantity} шт | ` +
            `${money(candidate.supply.cost)} | ` +
            `${date(candidate.supply.date)} | ` +
            `${direction} | ` +
            `Δ=${Math.abs(
              candidate.dateDifference,
            )} ms`,
        );
      }
    }

    console.log("");
  }

  // ============================================================
  // ORDERBATCH DATE VIOLATIONS
  // ============================================================

  console.log("========================================");
  console.log("🚨 ORDERBATCH ДО ПОСТУПЛЕНИЯ BATCH");
  console.log("========================================");
  console.log("");

  let chronologyViolations = 0;

  for (const batch of batches) {
    for (const ob of batch.orderBatches) {
      const orderDate = ob.orderItem.order.date;
      const batchDate = batch.receivedAt;

      if (orderDate < batchDate) {
        chronologyViolations++;

        console.log(
          `🔴 OrderBatch #${ob.id} | ` +
            `Order #${ob.orderItem.orderId} | ` +
            `${ob.quantity} шт`,
        );

        console.log(
          `   Order date: ${date(orderDate)}`,
        );

        console.log(
          `   Batch date: ${date(batchDate)}`,
        );

        console.log(
          `   Batch #${batch.id}`,
        );

        console.log("");
      }
    }
  }

  if (chronologyViolations === 0) {
    console.log(
      "🟢 Хронологических нарушений OrderBatch не найдено.",
    );
  } else {
    console.log(
      `🔴 Всего нарушений: ${chronologyViolations}`,
    );
  }

  console.log("");

  // ============================================================
  // ORDERBATCH COST MISMATCH
  // ============================================================

  console.log("========================================");
  console.log("💰 ORDERBATCH COST vs BATCH COST");
  console.log("========================================");
  console.log("");

  let costMismatches = 0;

  for (const batch of batches) {
    for (const ob of batch.orderBatches) {
      if (ob.purchaseCost !== batch.purchaseCost) {
        costMismatches++;

        console.log(
          `🔴 OrderBatch #${ob.id} | ` +
            `Batch #${batch.id} | ` +
            `Order #${ob.orderItem.orderId}`,
        );

        console.log(
          `   OrderBatch cost: ${money(ob.purchaseCost)}`,
        );

        console.log(
          `   Batch cost:      ${money(batch.purchaseCost)}`,
        );

        console.log("");
      }
    }
  }

  if (costMismatches === 0) {
    console.log(
      "🟢 Расхождений себестоимости не найдено.",
    );
  } else {
    console.log(
      `🔴 Расхождений себестоимости: ${costMismatches}`,
    );
  }

  console.log("");

  // ============================================================
  // RETURN BATCH WITHOUT ORDER BATCH
  // ============================================================

  console.log("========================================");
  console.log("↩️ RETURN BATCH БЕЗ СООТВЕТСТВУЮЩЕЙ ПРОДАЖИ");
  console.log("========================================");
  console.log("");

  let returnWithoutSale = 0;

  for (const batch of batches) {
    for (const rb of batch.ReturnBatch) {
      const soldToBatch = batch.orderBatches.reduce(
        (sum, ob) => sum + ob.quantity,
        0,
      );

      const returnedToBatchBefore =
        batch.ReturnBatch
          .filter((other) => other.id < rb.id)
          .reduce(
            (sum, other) => sum + other.quantity,
            0,
          );

      const availableHistoricalSale =
        soldToBatch - returnedToBatchBefore;

      if (rb.quantity > availableHistoricalSale) {
        returnWithoutSale++;

        console.log(
          `🔴 ReturnBatch #${rb.id} | ` +
            `Batch #${batch.id} | ` +
            `${rb.quantity} шт`,
        );

        console.log(
          `   Batch linked sales: ${soldToBatch}`,
        );

        console.log(
          `   Returned before this return: ${returnedToBatchBefore}`,
        );

        console.log(
          `   Available sale capacity: ${availableHistoricalSale}`,
        );

        console.log(
          `   Order #${rb.OrderItem.orderId}`,
        );

        console.log("");
      }
    }
  }

  if (returnWithoutSale === 0) {
    console.log(
      "🟢 Явных возвратов сверх продаж Batch не найдено.",
    );
  } else {
    console.log(
      `🔴 Подозрительных возвратов: ${returnWithoutSale}`,
    );
  }

  console.log("");

  // ============================================================
  // FINAL SUMMARY
  // ============================================================

  console.log("========================================");
  console.log("🏁 ИТОГ АУДИТА");
  console.log("========================================");
  console.log("");

  console.log(`SupplyItem quantity: ${totalSupplied}`);
  console.log(`Current Batch stock: ${totalCurrentBatch}`);
  console.log(`Product.stock:       ${product.stock}`);
  console.log(`Movement balance:    ${movementBalance}`);
  console.log("");

  console.log(
    `Количество Batch продукта: ${batches.length}`,
  );

  console.log(
    `Batch ID: ${batches.map((b) => b.id).join(", ")}`,
  );

  console.log("");

  console.log(
    `OrderBatch chronology violations: ${chronologyViolations}`,
  );

  console.log(
    `OrderBatch cost mismatches:       ${costMismatches}`,
  );

  console.log(
    `Suspicious ReturnBatch:           ${returnWithoutSale}`,
  );

  console.log("");

  console.log(
    "⚠️ ВАЖНО: этот скрипт НЕ изменяет базу данных.",
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ ОШИБКА:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });