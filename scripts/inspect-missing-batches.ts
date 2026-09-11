import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BatchInfo = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
  status: string;
};

type SupplyInfo = {
  id: number;
  quantity: number;
  cost: number;
  date: Date;
};

function hoursDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

function formatDate(date: Date): string {
  return date.toISOString();
}

async function main() {
  console.log("========================================");
  console.log("🔎 INSPECT MISSING BATCHES");
  console.log("========================================");
  console.log("");
  console.log("⚠️ ТОЛЬКО ДИАГНОСТИКА");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
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
      },

      supplyItems: {
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
        include: {
          supply: true,
        },
      },

      orderItems: {
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
        include: {
          order: true,
          batches: {
            include: {
              batch: true,
            },
          },
          ReturnBatch: {
            include: {
              Batch: true,
            },
          },
        },
      },
    },
  });

  let totalProducts = 0;
  let totalBatches = 0;
  let totalSupplyItems = 0;
  let totalMissingSupplyItems = 0;
  let totalUnmatchedBatches = 0;

  const problematicProducts: number[] = [];

  for (const product of products) {
    totalProducts++;

    const batches: BatchInfo[] = product.batches.map((batch) => ({
      id: batch.id,
      quantity: batch.quantity,
      purchaseCost: batch.purchaseCost,
      receivedAt: batch.receivedAt,
      expiryDate: batch.expiryDate,
      status: batch.status,
    }));

    const supplies: SupplyInfo[] = product.supplyItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      cost: item.cost,
      date: item.supply.date,
    }));

    totalBatches += batches.length;
    totalSupplyItems += supplies.length;

    console.log("");
    console.log("========================================");
    console.log(`🥛 ТОВАР #${product.id}: ${product.name}`);
    console.log("========================================");
    console.log("");

    console.log("📊 ОБЩАЯ ИНФОРМАЦИЯ");
    console.log(`  Product.stock: ${product.stock}`);
    console.log(`  SupplyItem: ${supplies.length}`);
    console.log(`  Batch: ${batches.length}`);
    console.log(
      `  Всего поставлено: ${supplies.reduce(
        (sum, item) => sum + item.quantity,
        0
      )} шт`
    );
    console.log(
      `  Сумма Batch.quantity: ${batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      )} шт`
    );
    console.log("");

    if (supplies.length === 0 && batches.length === 0) {
      console.log("ℹ️ Нет поставок и партий.");
      continue;
    }

    /*
     * ======================================================
     * 1. SUPPLY ITEMS
     * ======================================================
     */

    console.log("📦 ПОСТАВКИ");
    console.log("");

    if (supplies.length === 0) {
      console.log("  Нет SupplyItem.");
    } else {
      for (const supply of supplies) {
        console.log(
          `  SupplyItem #${supply.id}: ` +
            `${supply.quantity} шт × ${supply.cost} ₽`
        );

        console.log(
          `    Supply date: ${formatDate(supply.date)}`
        );
      }
    }

    console.log("");

    /*
     * ======================================================
     * 2. ВСЕ BATCH
     * ======================================================
     */

    console.log("🧱 СУЩЕСТВУЮЩИЕ BATCH");
    console.log("");

    if (batches.length === 0) {
      console.log("  🔴 Batch отсутствуют.");
    } else {
      for (const batch of batches) {
        console.log(
          `  Batch #${batch.id}: ` +
            `quantity=${batch.quantity}, ` +
            `purchaseCost=${batch.purchaseCost} ₽, ` +
            `status=${batch.status}`
        );

        console.log(
          `    receivedAt=${formatDate(batch.receivedAt)}`
        );

        console.log(
          `    expiryDate=${formatDate(batch.expiryDate)}`
        );
      }
    }

    console.log("");

    /*
     * ======================================================
     * 3. СОПОСТАВЛЕНИЕ SUPPLY → BATCH
     * ======================================================
     */

    console.log("🔗 ПОПЫТКА СОПОСТАВЛЕНИЯ SUPPLYITEM → BATCH");
    console.log("");

    const usedBatchIds = new Set<number>();

    let missingForProduct = 0;

    for (const supply of supplies) {
      const candidates = batches
        .filter((batch) => !usedBatchIds.has(batch.id))
        .map((batch) => ({
          batch,
          diffHours: hoursDiff(
            batch.receivedAt,
            supply.date
          ),
        }))
        .sort((a, b) => {
          if (a.diffHours !== b.diffHours) {
            return a.diffHours - b.diffHours;
          }

          return a.batch.id - b.batch.id;
        });

      if (candidates.length === 0) {
        console.log(
          `  🔴 SupplyItem #${supply.id}: ` +
            `${supply.quantity} шт × ${supply.cost} ₽`
        );

        console.log(
          "      → Batch не найдена"
        );

        missingForProduct++;
        totalMissingSupplyItems++;

        continue;
      }

      const best = candidates[0];

      usedBatchIds.add(best.batch.id);

      console.log(
        `  SupplyItem #${supply.id}: ` +
          `${supply.quantity} шт × ${supply.cost} ₽`
      );

      console.log(
        `      → Batch #${best.batch.id}`
      );

      console.log(
        `      → разница по времени: ` +
          `${best.diffHours.toFixed(2)} ч`
      );

      console.log(
        `      → Batch.quantity: ${best.batch.quantity}`
      );

      console.log(
        `      → Batch.purchaseCost: ` +
          `${best.batch.purchaseCost} ₽`
      );

      if (best.batch.quantity !== supply.quantity) {
        console.log(
          `      🟡 Разница количества: ` +
            `SupplyItem=${supply.quantity}, ` +
            `Batch=${best.batch.quantity}`
        );
      }

      if (best.batch.purchaseCost !== supply.cost) {
        console.log(
          `      🟡 Разница purchaseCost: ` +
            `SupplyItem=${supply.cost} ₽, ` +
            `Batch=${best.batch.purchaseCost} ₽`
        );
      }

      if (best.diffHours > 24) {
        console.log(
          `      🔴 Большая разница по времени!`
        );
      }
    }

    console.log("");

    /*
     * ======================================================
     * 4. BATCH БЕЗ SUPPLY
     * ======================================================
     */

    const unmatchedBatches = batches.filter(
      (batch) => !usedBatchIds.has(batch.id)
    );

    if (unmatchedBatches.length > 0) {
      console.log("🟡 BATCH БЕЗ СОПОСТАВЛЕННОГО SUPPLY");
      console.log("");

      for (const batch of unmatchedBatches) {
        console.log(
          `  Batch #${batch.id}: ` +
            `quantity=${batch.quantity}, ` +
            `purchaseCost=${batch.purchaseCost} ₽`
        );

        console.log(
          `    receivedAt=${formatDate(batch.receivedAt)}`
        );

        console.log(
          `    expiryDate=${formatDate(batch.expiryDate)}`
        );
      }

      totalUnmatchedBatches += unmatchedBatches.length;

      console.log("");
    }

    /*
     * ======================================================
     * 5. ORDER ITEMS
     * ======================================================
     */

    console.log("🛒 ПРОДАЖИ");
    console.log("");

    if (product.orderItems.length === 0) {
      console.log("  Продаж нет.");
    } else {
      for (const item of product.orderItems) {
        const orderBatchQuantity = item.batches.reduce(
          (sum, link) => sum + link.quantity,
          0
        );

        const returnQuantity = item.ReturnBatch.reduce(
          (sum, link) => sum + link.quantity,
          0
        );

        console.log(
          `  Order #${item.orderId}, ` +
            `OrderItem #${item.id}: ` +
            `продано=${item.quantity}, ` +
            `returned=${item.returned}`
        );

        console.log(
          `    OrderBatch=${orderBatchQuantity} шт`
        );

        console.log(
          `    ReturnBatch=${returnQuantity} шт`
        );

        if (orderBatchQuantity !== item.quantity) {
          console.log(
            `    🔴 OrderBatch не соответствует продаже: ` +
              `ожидалось=${item.quantity}, ` +
              `есть=${orderBatchQuantity}`
          );
        }

        if (returnQuantity !== item.returned) {
          console.log(
            `    🔴 ReturnBatch не соответствует returned: ` +
              `ожидалось=${item.returned}, ` +
              `есть=${returnQuantity}`
          );
        }

        if (item.batches.length > 0) {
          for (const link of item.batches) {
            console.log(
              `      OrderBatch #${link.id}: ` +
                `Batch #${link.batchId}, ` +
                `${link.quantity} шт × ` +
                `${link.purchaseCost} ₽`
            );
          }
        }

        if (item.ReturnBatch.length > 0) {
          for (const link of item.ReturnBatch) {
            console.log(
              `      ReturnBatch #${link.id}: ` +
                `Batch #${link.batchId}, ` +
                `+${link.quantity} шт`
            );
          }
        }
      }
    }

    console.log("");

    /*
     * ======================================================
     * 6. БАЛАНС ТОВАРА
     * ======================================================
     */

    const totalSupplied = supplies.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const totalSold = product.orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const totalReturned = product.orderItems.reduce(
      (sum, item) => sum + item.returned,
      0
    );

    const theoreticalStock =
      totalSupplied - totalSold + totalReturned;

    const realBatchStock = batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log("🧮 БАЛАНС");
    console.log(`  Поставлено: ${totalSupplied}`);
    console.log(`  Продано: ${totalSold}`);
    console.log(`  Возвращено: ${totalReturned}`);
    console.log(
      `  Теоретический остаток: ${theoreticalStock}`
    );
    console.log(
      `  Batch.quantity: ${realBatchStock}`
    );
    console.log(
      `  Product.stock: ${product.stock}`
    );

    const balanceDiff =
      realBatchStock - theoreticalStock;

    if (balanceDiff !== 0) {
      console.log(
        `  🔴 Баланс НЕ сходится: ` +
          `разница=${balanceDiff}`
      );
    } else {
      console.log("  ✅ Баланс сходится");
    }

    console.log("");

    /*
     * ======================================================
     * 7. ПОПЫТКА НАЙТИ ПОДОЗРИТЕЛЬНЫЕ BATCH
     * ======================================================
     */

    console.log("🕵️ ПОДОЗРИТЕЛЬНЫЕ BATCH");
    console.log("");

    for (const batch of batches) {
      const possibleSupplies = supplies
        .map((supply) => ({
          supply,
          diffHours: hoursDiff(
            batch.receivedAt,
            supply.date
          ),
        }))
        .sort((a, b) => {
          if (a.diffHours !== b.diffHours) {
            return a.diffHours - b.diffHours;
          }

          return a.supply.id - b.supply.id;
        });

      const closest = possibleSupplies[0];

      if (!closest) {
        continue;
      }

      if (closest.diffHours > 24) {
        console.log(
          `  🟡 Batch #${batch.id}: ` +
            `ближайший SupplyItem #${closest.supply.id}, ` +
            `разница=${closest.diffHours.toFixed(2)} ч`
        );
      }
    }

    /*
     * ======================================================
     * 8. ПРОБЛЕМНЫЙ ТОВАР
     * ======================================================
     */

    if (
      missingForProduct > 0 ||
      unmatchedBatches.length > 0 ||
      balanceDiff !== 0
    ) {
      problematicProducts.push(product.id);
    }

    console.log("");
  }

  /*
   * ========================================================
   * ИТОГ
   * ========================================================
   */

  console.log("========================================");
  console.log("📊 ИТОГ ДИАГНОСТИКИ");
  console.log("========================================");
  console.log("");

  console.log(`Товаров проверено: ${totalProducts}`);
  console.log(`Batch проверено: ${totalBatches}`);
  console.log(`SupplyItem проверено: ${totalSupplyItems}`);
  console.log(
    `SupplyItem без Batch: ${totalMissingSupplyItems}`
  );
  console.log(
    `Batch без SupplyItem: ${totalUnmatchedBatches}`
  );

  console.log("");

  if (problematicProducts.length > 0) {
    console.log("🔴 ПРОБЛЕМНЫЕ ТОВАРЫ:");

    for (const productId of problematicProducts) {
      console.log(`  Product #${productId}`);
    }
  } else {
    console.log("✅ Критических проблем не найдено.");
  }

  console.log("");
  console.log("========================================");
  console.log("🛡️ ДИАГНОСТИКА ЗАВЕРШЕНА");
  console.log("========================================");
  console.log("");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ ОШИБКА ДИАГНОСТИКИ:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });