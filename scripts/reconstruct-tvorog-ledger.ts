import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

type BatchInfo = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
  status: string;
};

type ExistingOrderBatch = {
  id: number;
  orderItemId: number;
  batchId: number;
  quantity: number;
  purchaseCost: number;
};

type ReturnInfo = {
  id: number;
  orderItemId: number;
  batchId: number;
  quantity: number;
  createdAt: Date;
};

type OrderItemInfo = {
  id: number;
  quantity: number;
  returned: number;
  price: number;
  orderId: number;
  order: {
    id: number;
    date: Date;
    status: string;
  };
  batches: ExistingOrderBatch[];
  ReturnBatch: ReturnInfo[];
};

function fifoSort(a: BatchInfo, b: BatchInfo) {
  const expiry = a.expiryDate.getTime() - b.expiryDate.getTime();

  if (expiry !== 0) {
    return expiry;
  }

  const received = a.receivedAt.getTime() - b.receivedAt.getTime();

  if (received !== 0) {
    return received;
  }

  return a.id - b.id;
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("🧀 ТВOРОГ — ДИАГНОСТИКА РЕКОНСТРУКЦИИ");
  console.log("========================================");
  console.log("");
  console.log(`Product #${PRODUCT_ID}`);
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
    select: {
      id: true,
      name: true,
      stock: true,
      price: true,
      cost: true,
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Продукт: #${product.id} ${product.name}`);
  console.log(`Product.stock: ${product.stock}`);
  console.log("");

  // ==================================================
  // 1. BATCHES
  // ==================================================

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: [
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
  });

  const batchRows: BatchInfo[] = batches.map((batch) => ({
    id: batch.id,
    quantity: batch.quantity,
    purchaseCost: batch.purchaseCost,
    receivedAt: batch.receivedAt,
    expiryDate: batch.expiryDate,
    status: batch.status,
  }));

  console.log("========================================");
  console.log("📦 ПАРТИИ");
  console.log("========================================");

  for (const batch of batchRows) {
    console.log(
      `Batch #${batch.id}: ` +
        `current=${batch.quantity}, ` +
        `cost=${batch.purchaseCost} ₽, ` +
        `receivedAt=${batch.receivedAt.toISOString()}, ` +
        `expiry=${batch.expiryDate.toISOString()}, ` +
        `status=${batch.status}`
    );
  }

  console.log("");

  // ==================================================
  // 2. ORDER ITEMS
  // ==================================================

  const orderItemsRaw = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      order: {
        select: {
          id: true,
          date: true,
          status: true,
        },
      },
      batches: {
        select: {
          id: true,
          orderItemId: true,
          batchId: true,
          quantity: true,
          purchaseCost: true,
        },
      },
      ReturnBatch: {
        select: {
          id: true,
          orderItemId: true,
          batchId: true,
          quantity: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      {
        order: {
          date: "asc",
        },
      },
      {
        id: "asc",
      },
    ],
  });

  const orderItems = orderItemsRaw as OrderItemInfo[];

  console.log("========================================");
  console.log("🛒 ORDER ITEMS");
  console.log("========================================");

  let totalSold = 0;
  let totalLinked = 0;
  let totalMissing = 0;
  let totalReturned = 0;

  for (const item of orderItems) {
    const linked = item.batches.reduce(
      (sum, row) => sum + row.quantity,
      0
    );

    const returnedByBatch = item.ReturnBatch.reduce(
      (sum, row) => sum + row.quantity,
      0
    );

    const missing = Math.max(0, item.quantity - linked);

    totalSold += item.quantity;
    totalLinked += linked;
    totalMissing += missing;
    totalReturned += returnedByBatch;

    if (missing > 0) {
      console.log(
        `Order #${item.orderId}, OrderItem #${item.id}: ` +
          `sold=${item.quantity}, ` +
          `linked=${linked}, ` +
          `returned=${returnedByBatch}, ` +
          `missing=${missing}, ` +
          `date=${item.order.date.toISOString()}`
      );
    }
  }

  console.log("");

  console.log(`Всего продано: ${totalSold}`);
  console.log(`Уже связано OrderBatch: ${totalLinked}`);
  console.log(`Не связано OrderBatch: ${totalMissing}`);
  console.log(`ReturnBatch: ${totalReturned}`);
  console.log("");

  // ==================================================
  // 3. СКОЛЬКО ПРОДАЖ УЖЕ СВЯЗАНО С КАЖДОЙ ПАРТИЕЙ
  // ==================================================

  const soldByBatch = new Map<number, number>();

  for (const item of orderItems) {
    for (const link of item.batches) {
      const current = soldByBatch.get(link.batchId) ?? 0;

      soldByBatch.set(
        link.batchId,
        current + link.quantity
      );
    }
  }

  // ==================================================
  // 4. ВОЗВРАТЫ ПО ПАРТИЯМ
  // ==================================================

  const returnedByBatch = new Map<number, number>();

  for (const item of orderItems) {
    for (const ret of item.ReturnBatch) {
      const current = returnedByBatch.get(ret.batchId) ?? 0;

      returnedByBatch.set(
        ret.batchId,
        current + ret.quantity
      );
    }
  }

  // ==================================================
  // 5. ИСТОРИЧЕСКАЯ ЁМКОСТЬ
  //
  // current stock
  // + sold through OrderBatch
  // - returned through ReturnBatch
  //
  // Это только диагностическая величина.
  // ==================================================

  console.log("========================================");
  console.log("📊 BATCH LEDGER");
  console.log("========================================");

  let totalHistoricalCapacity = 0;
  let totalCurrent = 0;
  let totalSoldLinked = 0;
  let totalReturnedByBatch = 0;

  for (const batch of batchRows) {
    const sold = soldByBatch.get(batch.id) ?? 0;
    const returned = returnedByBatch.get(batch.id) ?? 0;

    const historicalCapacity =
      batch.quantity +
      sold -
      returned;

    totalHistoricalCapacity += historicalCapacity;
    totalCurrent += batch.quantity;
    totalSoldLinked += sold;
    totalReturnedByBatch += returned;

    console.log("");
    console.log(`Batch #${batch.id}`);
    console.log(`  current:              ${batch.quantity}`);
    console.log(`  OrderBatch sold:      ${sold}`);
    console.log(`  ReturnBatch returned: ${returned}`);
    console.log(
      `  historicalCapacity:   ${historicalCapacity}`
    );
    console.log(
      `  receivedAt:           ${batch.receivedAt.toISOString()}`
    );
    console.log(
      `  expiryDate:           ${batch.expiryDate.toISOString()}`
    );
    console.log(
      `  purchaseCost:         ${batch.purchaseCost} ₽`
    );
  }

  console.log("");
  console.log("----------------------------------------");
  console.log(`SUM current:              ${totalCurrent}`);
  console.log(`SUM OrderBatch sold:      ${totalSoldLinked}`);
  console.log(`SUM ReturnBatch returned: ${totalReturnedByBatch}`);
  console.log(
    `SUM historicalCapacity:   ${totalHistoricalCapacity}`
  );
  console.log("");

  // ==================================================
  // 6. ДЕТАЛЬНО ПО НЕДОСТАЮЩИМ ORDERITEM
  // ==================================================

  const missingItems = orderItems.filter((item) => {
    const linked = item.batches.reduce(
      (sum, row) => sum + row.quantity,
      0
    );

    return item.quantity > linked;
  });

  console.log("========================================");
  console.log("🔎 НЕДОСТАЮЩИЕ ORDERBATCH");
  console.log("========================================");

  for (const item of missingItems) {
    const linked = item.batches.reduce(
      (sum, row) => sum + row.quantity,
      0
    );

    const missing = item.quantity - linked;

    console.log("");
    console.log(
      `Order #${item.orderId}, OrderItem #${item.id}`
    );
    console.log(`  date:     ${item.order.date.toISOString()}`);
    console.log(`  sold:     ${item.quantity}`);
    console.log(`  linked:   ${linked}`);
    console.log(`  returned: ${item.returned}`);
    console.log(`  missing:  ${missing}`);

    if (item.ReturnBatch.length > 0) {
      console.log("  возвраты:");

      for (const ret of item.ReturnBatch) {
        console.log(
          `    ReturnBatch #${ret.id}: ` +
            `Batch #${ret.batchId}, ` +
            `${ret.quantity} шт, ` +
            `createdAt=${ret.createdAt.toISOString()}`
        );
      }
    }

    if (item.batches.length > 0) {
      console.log("  существующие OrderBatch:");

      for (const link of item.batches) {
        console.log(
          `    OrderBatch #${link.id}: ` +
            `Batch #${link.batchId}, ` +
            `${link.quantity} шт × ${link.purchaseCost} ₽`
        );
      }
    }

    console.log("");
    console.log("  Возможные партии:");

    for (const batch of batchRows) {
      const historicalCapacity =
        batch.quantity +
        (soldByBatch.get(batch.id) ?? 0) -
        (returnedByBatch.get(batch.id) ?? 0);

      const alreadyLinked =
        soldByBatch.get(batch.id) ?? 0;

      console.log(
        `    Batch #${batch.id}: ` +
          `capacity=${historicalCapacity}, ` +
          `alreadyLinked=${alreadyLinked}, ` +
          `received=${batch.receivedAt.toISOString()}, ` +
          `expiry=${batch.expiryDate.toISOString()}, ` +
          `cost=${batch.purchaseCost} ₽`
      );
    }
  }

  console.log("");

  // ==================================================
  // 7. АНАЛИЗ ВОЗВРАТОВ
  // ==================================================

  console.log("========================================");
  console.log("↩️ RETURN → SALE ПРОВЕРКА");
  console.log("========================================");

  for (const item of orderItems) {
    if (item.ReturnBatch.length === 0) {
      continue;
    }

    console.log("");
    console.log(
      `Order #${item.orderId}, OrderItem #${item.id}`
    );

    for (const ret of item.ReturnBatch) {
      const soldFromSameBatch = item.batches
        .filter(
          (batch) => batch.batchId === ret.batchId
        )
        .reduce(
          (sum, batch) => sum + batch.quantity,
          0
        );

      console.log(
        `  ReturnBatch #${ret.id}: ` +
          `Batch #${ret.batchId}, ` +
          `returned=${ret.quantity}, ` +
          `OrderBatch same batch=${soldFromSameBatch}`
      );

      if (soldFromSameBatch < ret.quantity) {
        console.log(
          "  ⚠️ Возврат превышает OrderBatch этой OrderItem."
        );

        console.log(
          "  ⚠️ Это означает, что ReturnBatch нельзя "
          + "однозначно восстановить через текущую OrderItem."
        );
      }
    }
  }

  console.log("");

  // ==================================================
  // 8. ВРЕМЕННАЯ ПРОВЕРКА
  // ==================================================

  console.log("========================================");
  console.log("⏱ ВРЕМЕННАЯ ПРОВЕРКА");
  console.log("========================================");

  for (const item of orderItems) {
    for (const link of item.batches) {
      const batch = batchRows.find(
        (row) => row.id === link.batchId
      );

      if (!batch) {
        continue;
      }

      if (
        item.order.date.getTime() <
        batch.receivedAt.getTime()
      ) {
        console.log("");
        console.log(
          `🔴 Order #${item.orderId}, ` +
            `OrderItem #${item.id}`
        );

        console.log(
          `   Batch #${batch.id}`
        );

        console.log(
          `   sale:     ${item.order.date.toISOString()}`
        );

        console.log(
          `   received: ${batch.receivedAt.toISOString()}`
        );

        console.log(
          `   quantity: ${link.quantity}`
        );
      }
    }
  }

  console.log("");

  // ==================================================
  // 9. МАТЕМАТИЧЕСКАЯ СВОДКА
  // ==================================================

  console.log("========================================");
  console.log("⚖️ ФИНАЛЬНАЯ СВОДКА");
  console.log("========================================");

  console.log("");
  console.log(`Поставлено по SupplyItem: 41`);
  console.log(`Продано по OrderItem:     ${totalSold}`);
  console.log(`Возвращено:               ${totalReturned}`);
  console.log(
    `Математический остаток:   ${41 - totalSold + totalReturned}`
  );
  console.log(
    `Batch.quantity:            ${totalCurrent}`
  );
  console.log(
    `Product.stock:             ${product.stock}`
  );

  console.log("");
  console.log(
    `OrderBatch deficit:         ${totalMissing}`
  );

  console.log(
    `Historical batch capacity: ${totalHistoricalCapacity}`
  );

  console.log("");

  console.log("========================================");
  console.log("🏁 ДИАГНОСТИКА ЗАВЕРШЕНА");
  console.log("========================================");
  console.log("");
  console.log(
    "⚠️ НИ ОДНА ЗАПИСЬ В БАЗЕ НЕ ИЗМЕНЕНА."
  );
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("🔴 ОШИБКА:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });