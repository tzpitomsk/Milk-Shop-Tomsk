import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

function line(char = "=", length = 60) {
  console.log(char.repeat(length));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toISOString();
}

async function main() {
  console.log();

  line();
  console.log("🧀 ТВОРОГ — ПОЛНЫЙ АУДИТ OPENING BALANCE");
  line();

  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  console.log(
    "Цель: математически восстановить минимальный исторический " +
      "opening stock Творога без изменения БД.",
  );

  /*
   * ============================================================
   * 1. PRODUCT
   * ============================================================
   */

  console.log();
  line();
  console.log("1. PRODUCT");
  line();
  console.log();

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);

  /*
   * ============================================================
   * 2. SUPPLIES
   * ============================================================
   */

  console.log();
  line();
  console.log("2. ЗАРЕГИСТРИРОВАННЫЕ ПОСТАВКИ");
  line();
  console.log();

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
  });

  supplyItems.sort(
    (a, b) =>
      new Date(a.supply.date).getTime() -
      new Date(b.supply.date).getTime(),
  );

  let totalSupplied = 0;

  for (const item of supplyItems) {
    totalSupplied += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `${date(item.supply.date)} | ` +
        `+${item.quantity} шт | ` +
        `cost=${money(item.cost)}`,
    );
  }

  console.log();
  console.log(`ИТОГО ПОСТАВЛЕНО: ${totalSupplied} шт`);

  /*
   * ============================================================
   * 3. BATCHES
   * ============================================================
   */

  console.log();
  line();
  console.log("3. BATCH");
  line();
  console.log();

  const batches = await prisma.batch.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      receivedAt: "asc",
    },
  });

  let totalBatchQuantity = 0;

  for (const batch of batches) {
    totalBatchQuantity += batch.quantity;

    console.log(
      `Batch #${batch.id} | ` +
        `quantity=${batch.quantity} | ` +
        `cost=${money(batch.purchaseCost)} | ` +
        `received=${date(batch.receivedAt)} | ` +
        `expiry=${date(batch.expiryDate)} | ` +
        `status=${batch.status}`,
    );
  }

  console.log();
  console.log(`SUM Batch.quantity: ${totalBatchQuantity} шт`);

  /*
   * ============================================================
   * 4. ALL ORDER ITEMS
   * ============================================================
   */

  console.log();
  line();
  console.log("4. ВСЕ ПРОДАЖИ И ВОЗВРАТЫ");
  line();
  console.log();

  const orders = await prisma.order.findMany({
    include: {
      items: {
        where: {
          productId: PRODUCT_ID,
        },
        include: {
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
    orderBy: {
      date: "asc",
    },
  });

  let grossSold = 0;
  let totalReturned = 0;
  let netSold = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const returned = item.ReturnBatch.reduce(
        (sum: number, ret) => sum + ret.quantity,
        0,
      );

      const net = Math.max(0, item.quantity - returned);

      grossSold += item.quantity;
      totalReturned += returned;
      netSold += net;

      console.log(
        `Order #${order.id} | ` +
          `OrderItem #${item.id} | ` +
          `${date(order.date)} | ` +
          `gross=${item.quantity} | ` +
          `returned=${returned} | ` +
          `net=${net} | ` +
          `status=${order.status}`,
      );
    }
  }

  console.log();
  console.log(`GROSS ПРОДАЖ: ${grossSold} шт`);
  console.log(`ВОЗВРАТОВ: ${totalReturned} шт`);
  console.log(`NET ПРОДАЖ: ${netSold} шт`);

  /*
   * ============================================================
   * 5. ORDERBATCH
   * ============================================================
   */

  console.log();
  line();
  console.log("5. ORDERBATCH — ФАКТИЧЕСКАЯ ПРИВЯЗКА ПРОДАЖ К ПАРТИЯМ");
  line();
  console.log();

  let orderBatchQuantity = 0;
  let orderBatchCost = 0;
  let orderItemsWithoutBatch = 0;
  let quantityWithoutBatch = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const linkedQuantity = item.batches.reduce(
        (sum: number, link) => sum + link.quantity,
        0,
      );

      const returned = item.ReturnBatch.reduce(
        (sum: number, ret) => sum + ret.quantity,
        0,
      );

      const netQuantity = Math.max(
        0,
        item.quantity - returned,
      );

      orderBatchQuantity += linkedQuantity;

      for (const link of item.batches) {
        orderBatchCost +=
          link.quantity * link.purchaseCost;
      }

      if (linkedQuantity < netQuantity) {
        orderItemsWithoutBatch++;

        quantityWithoutBatch +=
          netQuantity - linkedQuantity;

        console.log(
          `🔴 Order #${order.id} | ` +
            `OrderItem #${item.id} | ` +
            `net=${netQuantity} | ` +
            `OrderBatch=${linkedQuantity} | ` +
            `БЕЗ BATCH=${netQuantity - linkedQuantity}`,
        );
      } else {
        console.log(
          `🟢 Order #${order.id} | ` +
            `OrderItem #${item.id} | ` +
            `net=${netQuantity} | ` +
            `OrderBatch=${linkedQuantity}`,
        );
      }
    }
  }

  console.log();

  console.log(
    `Всего через OrderBatch: ${orderBatchQuantity} шт`,
  );

  console.log(
    `Количество OrderItem с неполной привязкой: ${orderItemsWithoutBatch}`,
  );

  console.log(
    `Количество товара без OrderBatch: ${quantityWithoutBatch} шт`,
  );

  console.log(
    `Суммарная себестоимость через OrderBatch: ${money(orderBatchCost)}`,
  );

  /*
   * ============================================================
   * 6. MOVEMENTS
   * ============================================================
   */

  console.log();
  line();
  console.log("6. MOVEMENT");
  line();
  console.log();

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let movementSupply = 0;
  let movementSale = 0;
  let movementReturn = 0;
  let movementWriteOff = 0;
  let movementOther = 0;

  for (const movement of movements) {
    const q = movement.quantity;

    if (movement.type === "SUPPLY") {
      movementSupply += q;
    } else if (movement.type === "SALE") {
      movementSale += q;
    } else if (movement.type === "RETURN") {
      movementReturn += q;
    } else if (movement.type === "WRITE_OFF") {
      movementWriteOff += q;
    } else {
      movementOther += q;
    }

    console.log(
      `Movement #${movement.id} | ` +
        `${date(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `quantity=${movement.quantity} | ` +
        `comment=${movement.comment ?? "—"}`,
    );
  }

  const movementNet =
    movementSupply +
    movementSale +
    movementReturn +
    movementWriteOff +
    movementOther;

  console.log();

  console.log(
    `Movement SUPPLY: ${movementSupply} шт`,
  );

  console.log(
    `Movement SALE: ${movementSale} шт`,
  );

  console.log(
    `Movement RETURN: ${movementReturn} шт`,
  );

  console.log(
    `Movement WRITE_OFF: ${movementWriteOff} шт`,
  );

  console.log(
    `Movement OTHER: ${movementOther} шт`,
  );

  console.log();
  console.log(`NET MOVEMENT: ${movementNet} шт`);

  /*
   * ============================================================
   * 7. QUANTITY BALANCE FROM MOVEMENTS
   * ============================================================
   */

  console.log();
  line();
  console.log("7. МАТЕМАТИЧЕСКИЙ БАЛАНС ПО MOVEMENT");
  line();
  console.log();

  /*
   * Формула:
   *
   * current stock =
   * opening stock +
   * net movement
   *
   * Следовательно:
   *
   * opening stock =
   * current stock - net movement
   */

  const openingFromMovements =
    product.stock - movementNet;

  console.log(
    `Product.stock: ${product.stock} шт`,
  );

  console.log(
    `NET Movement: ${movementNet} шт`,
  );

  console.log();

  console.log(
    `Расчётный opening stock по Movement: ` +
      `${openingFromMovements} шт`,
  );

  /*
   * ============================================================
   * 8. БАЛАНС ПО ПОСТАВКАМ / ПРОДАЖАМ / СПИСАНИЯМ
   * ============================================================
   */

  console.log();
  line();
  console.log("8. БАЛАНС ПО БИЗНЕС-ОПЕРАЦИЯМ");
  line();
  console.log();

  const openingByBusinessBalance =
    product.stock -
    totalSupplied +
    netSold +
    Math.abs(movementWriteOff);

  console.log(
    `Текущий stock: ${product.stock} шт`,
  );

  console.log(
    `+ NET продажи: ${netSold} шт`,
  );

  console.log(
    `+ списания: ${Math.abs(movementWriteOff)} шт`,
  );

  console.log(
    `- зарегистрированные поставки: ${totalSupplied} шт`,
  );

  console.log();

  console.log(
    `Расчётный opening stock: ` +
      `${openingByBusinessBalance} шт`,
  );

  /*
   * ============================================================
   * 9. ИСТОРИЧЕСКИЕ ПРОДАЖИ ДО ПЕРВОЙ ПОСТАВКИ
   * ============================================================
   */

  console.log();
  line();
  console.log("9. ПРОДАЖИ ДО ПЕРВОЙ ЗАРЕГИСТРИРОВАННОЙ ПОСТАВКИ");
  line();
  console.log();

  let historicalBeforeSupply = 0;

  if (supplyItems.length === 0) {
    console.log("Поставок нет.");
  } else {
    const firstSupplyDate = new Date(
      supplyItems[0].supply.date,
    );

    for (const order of orders) {
      const orderDate = new Date(order.date);

      if (orderDate >= firstSupplyDate) {
        continue;
      }

      for (const item of order.items) {
        const returned = item.ReturnBatch.reduce(
          (sum: number, ret) => sum + ret.quantity,
          0,
        );

        const net = Math.max(
          0,
          item.quantity - returned,
        );

        if (net <= 0) {
          continue;
        }

        historicalBeforeSupply += net;

        console.log(
          `Order #${order.id} | ` +
            `OrderItem #${item.id} | ` +
            `${date(order.date)} | ` +
            `gross=${item.quantity} | ` +
            `returned=${returned} | ` +
            `net=${net}`,
        );
      }
    }

    console.log();

    console.log(
      `Продано NET до первой поставки: ` +
        `${historicalBeforeSupply} шт`,
    );
  }

  /*
   * ============================================================
   * 10. ВАЖНЫЙ РАСЧЁТ
   * ============================================================
   */

  console.log();
  line();
  console.log("10. КЛЮЧЕВОЙ АНАЛИЗ OPENING STOCK");
  line();
  console.log();

  const firstSupplyDate =
    supplyItems.length > 0
      ? new Date(supplyItems[0].supply.date)
      : null;

  const minimumOpeningForHistoricalSales =
    orders.reduce(
      (sum: number, order) => {
        if (
          !firstSupplyDate ||
          new Date(order.date) >= firstSupplyDate
        ) {
          return sum;
        }

        return (
          sum +
          order.items.reduce(
            (itemSum: number, item) => {
              const returned = item.ReturnBatch.reduce(
                (returnSum: number, ret) =>
                  returnSum + ret.quantity,
                0,
              );

              return (
                itemSum +
                Math.max(
                  0,
                  item.quantity - returned,
                )
              );
            },
            0,
          )
        );
      },
      0,
    );

  console.log(
    `Минимум opening stock для продаж до первой поставки: ` +
      `${minimumOpeningForHistoricalSales} шт`,
  );

  console.log(
    `Opening stock по Movement: ` +
      `${openingFromMovements} шт`,
  );

  console.log(
    `Opening stock по полному бизнес-балансу: ` +
      `${openingByBusinessBalance} шт`,
  );

  /*
   * ============================================================
   * 11. РАЗНИЦА
   * ============================================================
   */

  console.log();
  line();
  console.log("11. ПРОВЕРКА СОГЛАСОВАННОСТИ");
  line();
  console.log();

  const difference =
    openingFromMovements -
    openingByBusinessBalance;

  console.log(
    `Разница между двумя расчётами: ${difference} шт`,
  );

  if (difference === 0) {
    console.log(
      "🟢 Два независимых расчёта opening stock совпадают.",
    );
  } else {
    console.log(
      "🔴 Расчёты opening stock НЕ совпадают.",
    );

    console.log(
      "Это означает, что перед восстановлением Batch " +
        "нужно дополнительно разобрать историю Movement.",
    );
  }

  /*
   * ============================================================
   * 12. СРАВНЕНИЕ С МИНИМАЛЬНЫМ ИСТОРИЧЕСКИМ STOCK
   * ============================================================
   */

  console.log();
  line();
  console.log("12. МИНИМАЛЬНЫЙ ИСТОРИЧЕСКИЙ STOCK");
  line();
  console.log();

  const movementOpeningExcess =
    openingFromMovements -
    minimumOpeningForHistoricalSales;

  const businessOpeningExcess =
    openingByBusinessBalance -
    minimumOpeningForHistoricalSales;

  console.log(
    `Минимум для существования ранней продажи: ` +
      `${minimumOpeningForHistoricalSales} шт`,
  );

  console.log(
    `Opening по Movement: ${openingFromMovements} шт`,
  );

  console.log(
    `Избыток относительно исторического минимума: ` +
      `${movementOpeningExcess} шт`,
  );

  console.log();

  console.log(
    `Opening по бизнес-балансу: ` +
      `${openingByBusinessBalance} шт`,
  );

  console.log(
    `Избыток относительно исторического минимума: ` +
      `${businessOpeningExcess} шт`,
  );

  /*
   * ============================================================
   * 13. SAFETY CHECK
   * ============================================================
   */

  console.log();
  line();
  console.log("13. SAFETY CHECK");
  line();
  console.log();

  const productAfter = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!productAfter) {
    throw new Error(
      "Product не найден во время финальной проверки",
    );
  }

  console.log(
    `Product.stock: ${product.stock} -> ${productAfter.stock}`,
  );

  if (productAfter.stock !== product.stock) {
    throw new Error(
      "❌ Product.stock неожиданно изменился",
    );
  }

  console.log("✅ Product.stock не изменился");

  console.log();

  line();
  console.log("🏁 АУДИТ ЗАВЕРШЁН");
  line();

  console.log();

  console.log(
    "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.",
  );

  console.log();
}

main()
  .catch((error) => {
    console.error();
    line();
    console.error("❌ ОШИБКА");
    line();
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });