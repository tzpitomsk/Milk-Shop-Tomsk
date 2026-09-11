import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

type LedgerEvent = {
  date: Date;
  type: "SUPPLY" | "SALE" | "RETURN" | "WRITE_OFF" | "MOVEMENT";
  quantity: number;
  description: string;
};

async function main() {
  console.log("========================================");
  console.log("🧀 ТВОРОГ — ХРОНОЛОГИЧЕСКИЙ LEDGER-АУДИТ");
  console.log("========================================");
  console.log("");
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
    include: {
      batches: {
        orderBy: [
          {
            receivedAt: "asc",
          },
          {
            id: "asc",
          },
        ],
        include: {
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
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },

      supplyItems: {
        include: {
          supply: true,
        },
      },
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

  console.log("========================================");
  console.log("🚚 ПОСТАВКИ");
  console.log("========================================");
  console.log("");

  const supplyItems = product.supplyItems
    .slice()
    .sort(
      (a, b) =>
        a.supply.date.getTime() - b.supply.date.getTime() ||
        a.id - b.id,
    );

  let totalSupplied = 0;

  for (const item of supplyItems) {
    totalSupplied += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `${item.supply.date.toISOString()} | ` +
        `+${item.quantity} шт × ${item.cost} ₽`,
    );
  }

  console.log("");
  console.log(`ИТОГО ПОСТАВЛЕНО: ${totalSupplied} шт`);
  console.log("");

  // ============================================================
  // ORDERS
  // ============================================================

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },

    include: {
      order: true,

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
          createdAt: "asc",
        },
      },
    },

    orderBy: {
      order: {
        date: "asc",
      },
    },
  });

  console.log("========================================");
  console.log("🛒 ПРОДАЖИ");
  console.log("========================================");
  console.log("");

  let totalSold = 0;
  let totalReturned = 0;

  for (const item of orderItems) {
    totalSold += item.quantity;
    totalReturned += item.returned;

    const linked = item.batches.reduce(
      (sum, b) => sum + b.quantity,
      0,
    );

    const returnedFromReturnBatch = item.ReturnBatch.reduce(
      (sum, r) => sum + r.quantity,
      0,
    );

    console.log(
      `Order #${item.orderId}, ` +
        `OrderItem #${item.id} | ` +
        `${item.order.date.toISOString()} | ` +
        `sold=${item.quantity} | ` +
        `linked=${linked} | ` +
        `returned=${returnedFromReturnBatch} | ` +
        `OrderItem.returned=${item.returned}`,
    );

    for (const ob of item.batches) {
      console.log(
        `   OrderBatch #${ob.id}: ` +
          `Batch #${ob.batchId}, ` +
          `${ob.quantity} шт, ` +
          `received=${ob.batch.receivedAt.toISOString()}, ` +
          `cost=${ob.purchaseCost} ₽`,
      );
    }

    for (const rb of item.ReturnBatch) {
      console.log(
        `   ReturnBatch #${rb.id}: ` +
          `Batch #${rb.batchId}, ` +
          `${rb.quantity} шт, ` +
          `created=${rb.createdAt.toISOString()}`,
      );
    }

    console.log("");
  }

  console.log(`ИТОГО ПРОДАНО: ${totalSold}`);
  console.log(`ИТОГО RETURNED field: ${totalReturned}`);
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
  console.log("📜 MOVEMENT");
  console.log("========================================");
  console.log("");

  let movementBalance = 0;

  for (const movement of movements) {
    movementBalance += movement.quantity;

    console.log(
      `${movement.createdAt.toISOString()} | ` +
        `${movement.type.padEnd(18)} | ` +
        `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
        `balance=${movementBalance} | ` +
        `#${movement.id} ${movement.comment ?? ""}`,
    );
  }

  console.log("");
  console.log(
    `ФИНАЛЬНЫЙ MOVEMENT BALANCE: ${movementBalance}`,
  );
  console.log("");

  // ============================================================
  // BUSINESS CHRONOLOGY
  // ============================================================

  console.log("========================================");
  console.log("⚖️ БИЗНЕС-ХРОНОЛОГИЯ");
  console.log("========================================");
  console.log("");

  const events: LedgerEvent[] = [];

  for (const item of supplyItems) {
    events.push({
      date: item.supply.date,
      type: "SUPPLY",
      quantity: item.quantity,
      description:
        `Supply #${item.supplyId}, ` +
        `SupplyItem #${item.id}, ` +
        `${item.quantity} шт × ${item.cost} ₽`,
    });
  }

  for (const item of orderItems) {
    events.push({
      date: item.order.date,
      type: "SALE",
      quantity: -item.quantity,
      description:
        `Order #${item.orderId}, ` +
        `OrderItem #${item.id}, ` +
        `${item.quantity} шт`,
    });

    for (const rb of item.ReturnBatch) {
      events.push({
        date: rb.createdAt,
        type: "RETURN",
        quantity: rb.quantity,
        description:
          `ReturnBatch #${rb.id}, ` +
          `Order #${item.orderId}, ` +
          `Batch #${rb.batchId}, ` +
          `${rb.quantity} шт`,
      });
    }
  }

  // Добавляем только WRITE_OFF.
  // SALE и RETURN здесь повторно НЕ добавляем,
  // иначе будет двойной учёт.

  for (const movement of movements) {
    const type = movement.type.toUpperCase();

    if (
      type.includes("WRITE_OFF") ||
      type.includes("WRITE-OFF") ||
      type.includes("СПИС")
    ) {
      events.push({
        date: movement.createdAt,
        type: "WRITE_OFF",
        quantity: movement.quantity,
        description:
          `Movement #${movement.id}, ` +
          `${movement.comment ?? ""}`,
      });
    }
  }

  events.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      a.type.localeCompare(b.type),
  );

  let balance = 0;
  let minimumBalance = 0;

  for (const event of events) {
    balance += event.quantity;

    minimumBalance = Math.min(
      minimumBalance,
      balance,
    );

    const sign = event.quantity >= 0 ? "+" : "";

    console.log(
      `${event.date.toISOString()} | ` +
        `${event.type.padEnd(10)} | ` +
        `${sign}${event.quantity.toString().padStart(3)} | ` +
        `balance=${balance.toString().padStart(3)} | ` +
        `${event.description}`,
    );

    if (balance < 0) {
      console.log(
        "   🔴 ОТРИЦАТЕЛЬНЫЙ ОСТАТОК — " +
          "на этот момент продажи превышают известные поставки",
      );
    }
  }

  console.log("");
  console.log(`ФИНАЛЬНЫЙ БИЗНЕС-БАЛАНС: ${balance}`);
  console.log(`МИНИМАЛЬНЫЙ БАЛАНС: ${minimumBalance}`);
  console.log("");

  // ============================================================
  // MATHEMATICAL CHECK
  // ============================================================

  console.log("========================================");
  console.log("🧮 МАТЕМАТИКА");
  console.log("========================================");
  console.log("");

  const writeOffQuantity = events
    .filter((e) => e.type === "WRITE_OFF")
    .reduce(
      (sum, e) => sum + e.quantity,
      0,
    );

  const expected =
    totalSupplied -
    totalSold +
    totalReturned +
    writeOffQuantity;

  const batchStock = product.batches.reduce(
    (sum, b) => sum + b.quantity,
    0,
  );

  console.log(`Поставлено:       +${totalSupplied}`);
  console.log(`Продано:          -${totalSold}`);
  console.log(`Возвращено:       +${totalReturned}`);
  console.log(`Списания:         ${writeOffQuantity}`);
  console.log("----------------------------------------");
  console.log(`Ожидаемый остаток: ${expected}`);
  console.log(`Batch.quantity:    ${batchStock}`);
  console.log(`Product.stock:     ${product.stock}`);
  console.log("");

  // ============================================================
  // BATCH CAPACITY
  // ============================================================

  console.log("========================================");
  console.log("📦 BATCH CAPACITY");
  console.log("========================================");
  console.log("");

  let historicalCapacityTotal = 0;

  for (const batch of product.batches) {
    const sold = batch.orderBatches.reduce(
      (sum, ob) => sum + ob.quantity,
      0,
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0,
    );

    const historicalCapacity =
      batch.quantity +
      sold -
      returned;

    historicalCapacityTotal += historicalCapacity;

    console.log(
      `Batch #${batch.id}: ` +
        `current=${batch.quantity}, ` +
        `sold=${sold}, ` +
        `returned=${returned}, ` +
        `capacity=${historicalCapacity}, ` +
        `received=${batch.receivedAt.toISOString()}, ` +
        `expiry=${batch.expiryDate.toISOString()}, ` +
        `cost=${batch.purchaseCost} ₽`,
    );

    for (const ob of batch.orderBatches) {
      console.log(
        `   ↳ OrderBatch #${ob.id}: ` +
          `Order #${ob.orderItem.orderId}, ` +
          `OrderItem #${ob.orderItemId}, ` +
          `${ob.quantity} шт × ${ob.purchaseCost} ₽`,
      );
    }

    for (const rb of batch.ReturnBatch) {
      console.log(
        `   ↳ ReturnBatch #${rb.id}: ` +
          `Order #${rb.OrderItem.orderId}, ` +
          `OrderItem #${rb.orderItemId}, ` +
          `${rb.quantity} шт`,
      );
    }

    console.log("");
  }

  console.log(
    `SUM historical batch capacity: ${historicalCapacityTotal}`,
  );

  console.log(
    `SUM SupplyItem quantity:        ${totalSupplied}`,
  );

  const capacityDifference =
    historicalCapacityTotal -
    totalSupplied;

  console.log(
    `Разница capacity - supplies:    ${capacityDifference}`,
  );

  console.log("");

  // ============================================================
  // THEORETICAL FIFO CAPACITY
  // ============================================================

  console.log("========================================");
  console.log("🔬 ТЕОРЕТИЧЕСКАЯ FIFO-ЁМКОСТЬ");
  console.log("========================================");
  console.log("");

  const fifoBatches = product.batches
    .slice()
    .sort(
      (a, b) =>
        a.expiryDate.getTime() -
          b.expiryDate.getTime() ||
        a.receivedAt.getTime() -
          b.receivedAt.getTime() ||
        a.id - b.id,
    );

  let available = 0;

  for (const batch of fifoBatches) {
    const sold = batch.orderBatches.reduce(
      (sum, ob) => sum + ob.quantity,
      0,
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, rb) => sum + rb.quantity,
      0,
    );

    const capacity =
      batch.quantity +
      sold -
      returned;

    console.log("");
    console.log(`Batch #${batch.id}`);
    console.log(`  current:  ${batch.quantity}`);
    console.log(`  sold:     ${sold}`);
    console.log(`  returned: ${returned}`);
    console.log(`  capacity: ${capacity}`);
    console.log(`  received: ${batch.receivedAt.toISOString()}`);
    console.log(`  expiry:   ${batch.expiryDate.toISOString()}`);
    console.log(`  cost:     ${batch.purchaseCost} ₽`);

    available += capacity;

    console.log(
      `  cumulative capacity: ${available}`,
    );
  }

  console.log("");

  // ============================================================
  // FINAL
  // ============================================================

  console.log("========================================");
  console.log("🏁 ИТОГ");
  console.log("========================================");
  console.log("");

  console.log(`SupplyItem:          ${totalSupplied}`);
  console.log(`OrderItem sold:      ${totalSold}`);
  console.log(`ReturnBatch:         ${totalReturned}`);
  console.log(`WriteOff:            ${writeOffQuantity}`);
  console.log(`Business balance:    ${balance}`);
  console.log(`Expected balance:    ${expected}`);
  console.log(`Batch stock:         ${batchStock}`);
  console.log(`Product.stock:       ${product.stock}`);
  console.log(`Batch capacity:      ${historicalCapacityTotal}`);
  console.log("");

  if (balance === product.stock) {
    console.log(
      "🟢 Бизнес-ledger совпадает с Product.stock",
    );
  } else {
    console.log(
      `🔴 Бизнес-ledger НЕ совпадает с Product.stock: ` +
        `${balance} vs ${product.stock}`,
    );
  }

  if (historicalCapacityTotal === totalSupplied) {
    console.log(
      "🟢 Историческая ёмкость Batch совпадает с поставками",
    );
  } else {
    console.log(
      `🔴 Историческая ёмкость Batch НЕ совпадает с поставками: ` +
        `${historicalCapacityTotal} vs ${totalSupplied}`,
    );
  }

  console.log("");
  console.log("⚠️ НИ ОДНА ЗАПИСЬ В БАЗЕ НЕ ИЗМЕНЕНА.");
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