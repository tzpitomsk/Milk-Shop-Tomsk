import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_NAME = "Творог";

type LedgerRow = {
  date: Date;
  type: string;
  quantity: number;
  balance: number;
  details: string;
};

function separator() {
  console.log("========================================");
}

function money(value: number) {
  return `${value} ₽`;
}

function date(value: Date) {
  return value.toISOString();
}

function section(title: string) {
  console.log("");
  separator();
  console.log(title);
  separator();
  console.log("");
}

async function main() {
  console.log("");
  separator();
  console.log("🧀 ПОЛНЫЙ LEDGER-АУДИТ ТВOРОГА");
  separator();
  console.log("");
  console.log("⚠️ ТОЛЬКО READ-ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  await prisma.$connect();

  const product = await prisma.product.findFirst({
    where: {
      name: {
        equals: PRODUCT_NAME,
      },
    },
  });

  if (!product) {
    throw new Error(`Товар "${PRODUCT_NAME}" не найден`);
  }

  console.log(`Product #${product.id}: ${product.name}`);
  console.log(`Цена продажи: ${money(product.price)}`);
  console.log(`Текущий Product.stock: ${product.stock}`);

  /*
   * ============================================================
   * 1. ВСЕ ПАРТИИ
   * ============================================================
   */

  const batches = await prisma.batch.findMany({
    where: {
      productId: product.id,
    },
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
  });

  /*
   * ============================================================
   * 2. ВСЕ ПОСТАВКИ
   * ============================================================
   */

  const supplies = await prisma.supplyItem.findMany({
    where: {
      productId: product.id,
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
    include: {
      supply: {
        include: {
          Supplier: true,
        },
      },
    },
  });

  /*
   * ============================================================
   * 3. ВСЕ ЗАКАЗЫ
   * ============================================================
   */

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: product.id,
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
          id: "asc",
        },
      },
    },
  });

  /*
   * ============================================================
   * 4. ВСЕ ДВИЖЕНИЯ
   * ============================================================
   */

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
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

  /*
   * ============================================================
   * 5. SUPPLY LEDGER
   * ============================================================
   */

  section("🚚 ПОСТАВКИ");

  let suppliedTotal = 0;

  for (const item of supplies) {
    suppliedTotal += item.quantity;

    console.log(
      `SupplyItem #${item.id}`
    );

    console.log(
      `  Supply #${item.supplyId}`
    );

    console.log(
      `  дата: ${date(item.supply.date)}`
    );

    console.log(
      `  поставщик: ${item.supply.Supplier.name}`
    );

    console.log(
      `  количество: ${item.quantity}`
    );

    console.log(
      `  себестоимость: ${money(item.cost)}`
    );

    console.log(
      `  сумма: ${money(item.quantity * item.cost)}`
    );

    console.log("");
  }

  console.log(`ИТОГО поставлено: ${suppliedTotal} шт`);

  /*
   * ============================================================
   * 6. BATCH LEDGER
   * ============================================================
   */

  section("📦 ПАРТИИ");

  let batchQuantityTotal = 0;

  for (const batch of batches) {
    const sold = batch.orderBatches.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    const returned = batch.ReturnBatch.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    batchQuantityTotal += batch.quantity;

    console.log(`Batch #${batch.id}`);

    console.log(
      `  quantity сейчас: ${batch.quantity}`
    );

    console.log(
      `  purchaseCost: ${money(batch.purchaseCost)}`
    );

    console.log(
      `  receivedAt: ${date(batch.receivedAt)}`
    );

    console.log(
      `  expiryDate: ${date(batch.expiryDate)}`
    );

    console.log(
      `  status: ${batch.status}`
    );

    console.log(
      `  OrderBatch sold: ${sold}`
    );

    console.log(
      `  ReturnBatch returned: ${returned}`
    );

    /*
     * Диагностическая реконструкция.
     */

    const inferredInitial =
      batch.quantity + sold - returned;

    console.log(
      `  диагностическая первоначальная ёмкость: ${inferredInitial}`
    );

    console.log("");

    if (batch.orderBatches.length > 0) {
      console.log("  🔗 Продажи:");

      for (const link of batch.orderBatches) {
        const orderDate = link.orderItem.order.date;

        const beforeReceipt =
          orderDate.getTime() <
          batch.receivedAt.getTime();

        console.log(
          `    Order #${link.orderItem.orderId}, ` +
            `OrderItem #${link.orderItemId}: ` +
            `${link.quantity} шт × ` +
            `${money(link.purchaseCost)}`
        );

        console.log(
          `      дата заказа: ${date(orderDate)}`
        );

        console.log(
          `      batch receivedAt: ${date(batch.receivedAt)}`
        );

        console.log(
          `      статус: ${link.orderItem.order.status}`
        );

        if (beforeReceipt) {
          console.log(
            "      🔴 ОШИБКА: продажа произошла ДО поступления партии"
          );
        }
      }

      console.log("");
    }

    if (batch.ReturnBatch.length > 0) {
      console.log("  ↩ Возвраты:");

      for (const link of batch.ReturnBatch) {
        const orderDate = link.OrderItem.order.date;

        console.log(
          `    ReturnBatch #${link.id}: ` +
            `Order #${link.OrderItem.orderId}, ` +
            `OrderItem #${link.orderItemId}: ` +
            `${link.quantity} шт`
        );

        console.log(
          `      дата заказа: ${date(orderDate)}`
        );
      }

      console.log("");
    }
  }

  console.log(
    `SUM(Batch.quantity): ${batchQuantityTotal} шт`
  );

  console.log(
    `Product.stock: ${product.stock} шт`
  );

  if (batchQuantityTotal === product.stock) {
    console.log(
      "🟢 Product.stock = SUM(Batch.quantity)"
    );
  } else {
    console.log(
      `🔴 РАСХОЖДЕНИЕ STOCK: Product.stock=${product.stock}, ` +
        `Batch.sum=${batchQuantityTotal}`
    );
  }

  /*
   * ============================================================
   * 7. ORDER LEDGER
   * ============================================================
   */

  section("🛒 ПРОДАЖИ");

  let soldTotal = 0;
  let returnedFieldTotal = 0;
  let linkedOrderBatchTotal = 0;
  let missingOrderBatchTotal = 0;

  for (const item of orderItems) {
    const linkedQuantity = item.batches.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    const returnBatchQuantity = item.ReturnBatch.reduce(
      (sum, link) => sum + link.quantity,
      0
    );

    const missing =
      item.quantity - linkedQuantity;

    soldTotal += item.quantity;
    returnedFieldTotal += item.returned;
    linkedOrderBatchTotal += linkedQuantity;

    if (missing > 0) {
      missingOrderBatchTotal += missing;
    }

    console.log(
      `Order #${item.orderId}, OrderItem #${item.id}`
    );

    console.log(
      `  дата: ${date(item.order.date)}`
    );

    console.log(
      `  статус: ${item.order.status}`
    );

    console.log(
      `  продано: ${item.quantity}`
    );

    console.log(
      `  returned field: ${item.returned}`
    );

    console.log(
      `  ReturnBatch: ${returnBatchQuantity}`
    );

    console.log(
      `  OrderBatch: ${linkedQuantity}`
    );

    console.log(
      `  отсутствует OrderBatch: ${missing}`
    );

    if (missing > 0) {
      console.log(
        "  🔴 НЕПОЛНОЕ ПОКРЫТИЕ ORDERBATCH"
      );
    }

    if (item.returned !== returnBatchQuantity) {
      console.log(
        `  🔴 RETURN РАСХОЖДЕНИЕ: ` +
          `OrderItem.returned=${item.returned}, ` +
          `ReturnBatch=${returnBatchQuantity}`
      );
    } else {
      console.log(
        "  🟢 returned = ReturnBatch"
      );
    }

    if (item.returned > item.quantity) {
      console.log(
        "  🔴 returned больше quantity"
      );
    }

    if (
      item.order.status === "RETURNED" &&
      item.returned !== item.quantity
    ) {
      console.log(
        "  🔴 STATUS RETURNED, но возвращено не всё"
      );
    }

    if (
      item.order.status === "PARTIAL_RETURN" &&
      (item.returned <= 0 ||
        item.returned >= item.quantity)
    ) {
      console.log(
        "  🔴 STATUS PARTIAL_RETURN не соответствует количеству возврата"
      );
    }

    if (item.batches.length > 0) {
      console.log("  🔗 OrderBatch:");

      for (const link of item.batches) {
        console.log(
          `    Batch #${link.batchId}: ` +
            `${link.quantity} шт × ` +
            `${money(link.purchaseCost)}`
        );
      }
    }

    if (item.ReturnBatch.length > 0) {
      console.log("  ↩ ReturnBatch:");

      for (const link of item.ReturnBatch) {
        console.log(
          `    Batch #${link.batchId}: ` +
            `${link.quantity} шт`
        );
      }
    }

    console.log("");
  }

  /*
   * ============================================================
   * 8. RETURN LEDGER
   * ============================================================
   */

  section("↩ ВОЗВРАТЫ");

  let totalReturns = 0;

  for (const item of orderItems) {
    for (const ret of item.ReturnBatch) {
      totalReturns += ret.quantity;

      console.log(
        `ReturnBatch #${ret.id}`
      );

      console.log(
        `  Order #${item.orderId}, OrderItem #${item.id}`
      );

      console.log(
        `  Batch #${ret.batchId}`
      );

      console.log(
        `  количество: ${ret.quantity}`
      );

      console.log(
        `  дата заказа: ${date(item.order.date)}`
      );

      console.log(
        `  createdAt возврата: ${date(ret.createdAt)}`
      );

      /*
       * Проверяем, есть ли OrderBatch той же позиции
       * на ту же Batch.
       */

      const soldFromSameBatch =
        item.batches
          .filter(
            (link) =>
              link.batchId === ret.batchId
          )
          .reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          );

      if (soldFromSameBatch >= ret.quantity) {
        console.log(
          `  🟢 В этой OrderItem есть ${soldFromSameBatch} шт продажи из этой Batch`
        );
      } else {
        console.log(
          `  🔴 В этой OrderItem нет достаточной продажи ` +
            `из Batch #${ret.batchId}: ` +
            `продано=${soldFromSameBatch}, ` +
            `возвращено=${ret.quantity}`
        );
      }

      console.log("");
    }
  }

  /*
   * ============================================================
   * 9. ХРОНОЛОГИЧЕСКИЙ LEDGER
   * ============================================================
   */

  section("📜 ХРОНОЛОГИЧЕСКИЙ LEDGER");

  const ledger: LedgerRow[] = [];

  /*
   * Поставки.
   */

  for (const item of supplies) {
    ledger.push({
      date: item.supply.date,
      type: "SUPPLY",
      quantity: item.quantity,
      balance: 0,
      details:
        `Supply #${item.supplyId}, ` +
        `SupplyItem #${item.id}, ` +
        `${item.quantity} шт × ${money(item.cost)}`,
    });
  }

  /*
   * Продажи.
   */

  for (const item of orderItems) {
    ledger.push({
      date: item.order.date,
      type: "SALE",
      quantity: -item.quantity,
      balance: 0,
      details:
        `Order #${item.orderId}, ` +
        `OrderItem #${item.id}, ` +
        `${item.quantity} шт`,
    });
  }

  /*
   * Возвраты.
   */

  for (const item of orderItems) {
    for (const ret of item.ReturnBatch) {
      ledger.push({
        date: ret.createdAt,
        type: "RETURN",
        quantity: ret.quantity,
        balance: 0,
        details:
          `ReturnBatch #${ret.id}, ` +
          `Order #${item.orderId}, ` +
          `Batch #${ret.batchId}, ` +
          `${ret.quantity} шт`,
      });
    }
  }

  /*
   * Движения.
   */

  for (const movement of movements) {
    ledger.push({
      date: movement.createdAt,
      type: `MOVEMENT:${movement.type}`,
      quantity: movement.quantity,
      balance: 0,
      details:
        `Movement #${movement.id}` +
        (movement.comment
          ? `, ${movement.comment}`
          : ""),
    });
  }

  ledger.sort((a, b) => {
    const diff =
      a.date.getTime() -
      b.date.getTime();

    if (diff !== 0) {
      return diff;
    }

    return a.type.localeCompare(b.type);
  });

  let runningBalance = 0;

  for (const row of ledger) {
    runningBalance += row.quantity;
    row.balance = runningBalance;

    const sign =
      row.quantity >= 0 ? "+" : "";

    console.log(
      `${date(row.date)} | ` +
        `${row.type.padEnd(18)} | ` +
        `${sign}${row.quantity
          .toString()
          .padStart(4)} | ` +
        `баланс ${row.balance
          .toString()
          .padStart(4)} | ` +
        row.details
    );
  }

  /*
   * ============================================================
   * 10. МАТЕМАТИЧЕСКИЙ БАЛАНС
   * ============================================================
   */

  section("⚖️ МАТЕМАТИЧЕСКИЙ БАЛАНС");

  console.log(
    `Поставлено:        +${suppliedTotal}`
  );

  console.log(
    `Продано:           -${soldTotal}`
  );

  console.log(
    `Возвраты:          +${totalReturns}`
  );

  const mathematicalBalance =
    suppliedTotal -
    soldTotal +
    totalReturns;

  console.log(
    `----------------------------------------`
  );

  console.log(
    `Математический остаток: ${mathematicalBalance}`
  );

  console.log(
    `Фактический Batch stock: ${batchQuantityTotal}`
  );

  console.log(
    `Product.stock: ${product.stock}`
  );

  if (
    mathematicalBalance ===
    batchQuantityTotal
  ) {
    console.log(
      "🟢 Математический баланс совпадает с Batch stock"
    );
  } else {
    console.log(
      `🔴 МАТЕМАТИЧЕСКОЕ РАСХОЖДЕНИЕ: ` +
        `${mathematicalBalance - batchQuantityTotal} шт`
    );
  }

  /*
   * ============================================================
   * 11. ORDERBATCH BALANCE
   * ============================================================
   */

  section("🔗 ORDERBATCH BALANCE");

  console.log(
    `Продано по OrderItem: ${soldTotal}`
  );

  console.log(
    `Связано через OrderBatch: ${linkedOrderBatchTotal}`
  );

  console.log(
    `Отсутствует OrderBatch: ${missingOrderBatchTotal}`
  );

  console.log(
    `Проверка: ${linkedOrderBatchTotal} + ` +
      `${missingOrderBatchTotal} = ` +
      `${linkedOrderBatchTotal + missingOrderBatchTotal}`
  );

  if (
    linkedOrderBatchTotal +
      missingOrderBatchTotal ===
    soldTotal
  ) {
    console.log(
      "🟢 OrderBatch deficit полностью объясняет разницу"
    );
  } else {
    console.log(
      "🔴 Ошибка расчёта OrderBatch deficit"
    );
  }

  /*
   * ============================================================
   * 12. ПРОВЕРКА FIFO / ВРЕМЕНИ
   * ============================================================
   */

  section("⏱ ПРОВЕРКА ВРЕМЕННЫХ ПРАВИЛ");

  let temporalProblems = 0;

  for (const batch of batches) {
    for (const link of batch.orderBatches) {
      const orderDate =
        link.orderItem.order.date;

      if (
        orderDate.getTime() <
        batch.receivedAt.getTime()
      ) {
        temporalProblems++;

        console.log(
          `🔴 Batch #${batch.id} → ` +
            `Order #${link.orderItem.orderId}`
        );

        console.log(
          `  Batch receivedAt: ${date(batch.receivedAt)}`
        );

        console.log(
          `  Order date:       ${date(orderDate)}`
        );

        console.log(
          `  Продажа раньше поступления: ` +
            `${link.quantity} шт`
        );

        console.log("");
      }
    }
  }

  if (temporalProblems === 0) {
    console.log(
      "🟢 Продаж раньше receivedAt партии не найдено"
    );
  } else {
    console.log(
      `🔴 Временных нарушений: ${temporalProblems}`
    );
  }

  /*
   * ============================================================
   * 13. ПРОВЕРКА ВОЗВРАТОВ
   * ============================================================
   */

  section("↩ ПРОВЕРКА ВОЗВРАТОВ ПО ПАРТИЯМ");

  let returnProblems = 0;

  for (const batch of batches) {
    const sold =
      batch.orderBatches.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    const returned =
      batch.ReturnBatch.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    console.log(
      `Batch #${batch.id}: sold=${sold}, returned=${returned}, current=${batch.quantity}`
    );

    if (returned > sold) {
      returnProblems++;

      console.log(
        "  🔴 Возвратов больше, чем продаж через OrderBatch"
      );
    }

    const reconstructed =
      batch.quantity +
      sold -
      returned;

    console.log(
      `  quantity + sold - returned = ${reconstructed}`
    );

    if (reconstructed < 0) {
      returnProblems++;

      console.log(
        "  🔴 Отрицательная историческая ёмкость"
      );
    }

    console.log("");
  }

  /*
   * ============================================================
   * 14. ПРОВЕРКА ПОЛНОГО ORDER ITEM
   * ============================================================
   */

  section("🔎 ORDER ITEM CONSISTENCY");

  let itemProblems = 0;

  for (const item of orderItems) {
    const sold = item.quantity;

    const linked =
      item.batches.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    const returned =
      item.ReturnBatch.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    const unlinked =
      sold - linked;

    const remaining =
      sold - item.returned;

    if (
      linked < 0 ||
      returned < 0 ||
      item.returned < 0
    ) {
      itemProblems++;
      console.log(
        `🔴 OrderItem #${item.id}: отрицательное количество`
      );
    }

    if (item.returned > sold) {
      itemProblems++;
      console.log(
        `🔴 OrderItem #${item.id}: returned > quantity`
      );
    }

    if (returned !== item.returned) {
      itemProblems++;

      console.log(
        `🔴 OrderItem #${item.id}: ` +
          `returned field ${item.returned} != ` +
          `ReturnBatch ${returned}`
      );
    }

    if (linked > sold) {
      itemProblems++;

      console.log(
        `🔴 OrderItem #${item.id}: ` +
          `OrderBatch ${linked} > sold ${sold}`
      );
    }

    if (remaining < 0) {
      itemProblems++;
      console.log(
        `🔴 OrderItem #${item.id}: отрицательный остаток`
      );
    }

    console.log(
      `OrderItem #${item.id}: ` +
        `sold=${sold}, ` +
        `linked=${linked}, ` +
        `returned=${item.returned}, ` +
        `returnBatch=${returned}, ` +
        `remaining=${remaining}, ` +
        `unlinked=${unlinked}`
    );
  }

  if (itemProblems === 0) {
    console.log(
      "🟢 Критических противоречий OrderItem не найдено"
    );
  }

  /*
   * ============================================================
   * 15. ПРОВЕРКА ПАРТИЙ ПРОТИВ ПОСТАВОК
   * ============================================================
   *
   * ВАЖНО:
   * SupplyItem и Batch НЕ имеют прямой FK.
   *
   * Поэтому здесь только диагностическое сравнение.
   */

  section("🚚 SUPPLY → BATCH ДИАГНОСТИКА");

  console.log(
    "⚠️ SupplyItem → Batch прямой связи в schema.prisma НЕТ."
  );

  console.log(
    "⚠️ Следующая информация НЕ является доказанным соответствием."
  );

  console.log("");

  for (const batch of batches) {
    const possibleSupplies =
      supplies.filter((supply) => {
        const supplyDate =
          supply.supply.date.getTime();

        const batchDate =
          batch.receivedAt.getTime();

        /*
         * Допускаем небольшое временное окно.
         */

        const difference =
          Math.abs(
            batchDate - supplyDate
          );

        return difference <=
          10 * 60 * 1000 &&
          supply.quantity > 0 &&
          supply.cost === batch.purchaseCost;
      });

    console.log(
      `Batch #${batch.id}: ` +
        `${batch.quantity} шт, ` +
        `cost=${money(batch.purchaseCost)}, ` +
        `receivedAt=${date(batch.receivedAt)}`
    );

    if (possibleSupplies.length === 0) {
      console.log(
        "  ⚠️ Очевидного SupplyItem-кандидата нет"
      );
    } else {
      for (const supply of possibleSupplies) {
        console.log(
          `  → возможный SupplyItem #${supply.id}: ` +
            `${supply.quantity} шт, ` +
            `cost=${money(supply.cost)}, ` +
            `date=${date(supply.supply.date)}`
        );
      }
    }

    console.log("");
  }

  /*
   * ============================================================
   * 16. ИТОГОВЫЙ LEDGER
   * ============================================================
   */

  section("📊 ФИНАЛЬНЫЙ LEDGER-АУДИТ");

  console.log(
    `Product: #${product.id} ${product.name}`
  );

  console.log("");

  console.log(
    `SupplyItem:              ${supplies.length}`
  );

  console.log(
    `Batch:                   ${batches.length}`
  );

  console.log(
    `OrderItem:               ${orderItems.length}`
  );

  console.log(
    `Movement:                ${movements.length}`
  );

  console.log("");

  console.log(
    `Поставлено:              ${suppliedTotal} шт`
  );

  console.log(
    `Продано:                 ${soldTotal} шт`
  );

  console.log(
    `Возвращено:              ${totalReturns} шт`
  );

  console.log(
    `OrderBatch:              ${linkedOrderBatchTotal} шт`
  );

  console.log(
    `Не связано OrderBatch:   ${missingOrderBatchTotal} шт`
  );

  console.log("");

  console.log(
    `OrderItem.returned:      ${returnedFieldTotal} шт`
  );

  console.log(
    `ReturnBatch:             ${totalReturns} шт`
  );

  console.log(
    `Batch.quantity:          ${batchQuantityTotal} шт`
  );

  console.log(
    `Product.stock:           ${product.stock} шт`
  );

  console.log("");

  console.log(
    `Математический остаток:  ${mathematicalBalance} шт`
  );

  console.log("");

  /*
   * ============================================================
   * 17. КЛЮЧЕВЫЕ ВЫВОДЫ
   * ============================================================
   */

  console.log("🔍 КЛЮЧЕВЫЕ ВЫВОДЫ");
  console.log("");

  if (
    batchQuantityTotal === product.stock
  ) {
    console.log(
      "🟢 Stock Product согласован с Batch."
    );
  } else {
    console.log(
      "🔴 Stock Product НЕ согласован с Batch."
    );
  }

  if (
    mathematicalBalance ===
    batchQuantityTotal
  ) {
    console.log(
      "🟢 Поставка/продажи/возвраты математически согласуются с Batch stock."
    );
  } else {
    console.log(
      `🔴 Поставка/продажи/возвраты НЕ согласуются с Batch stock ` +
        `(разница ${mathematicalBalance - batchQuantityTotal} шт).`
    );
  }

  if (
    missingOrderBatchTotal === 0
  ) {
    console.log(
      "🟢 Все продажи полностью покрыты OrderBatch."
    );
  } else {
    console.log(
      `🔴 Отсутствуют OrderBatch для ${missingOrderBatchTotal} шт.`
    );
  }

  if (temporalProblems === 0) {
    console.log(
      "🟢 Временных нарушений Batch → Order не найдено."
    );
  } else {
    console.log(
      `🔴 Найдено временных нарушений: ${temporalProblems}.`
    );
  }

  if (returnProblems === 0) {
    console.log(
      "🟢 Критических противоречий возвратов не найдено."
    );
  } else {
    console.log(
      `🔴 Проблем возвратов: ${returnProblems}.`
    );
  }

  if (itemProblems === 0) {
    console.log(
      "🟢 Критических противоречий OrderItem не найдено."
    );
  } else {
    console.log(
      `🔴 Проблем OrderItem: ${itemProblems}.`
    );
  }

  console.log("");

  console.log(
    "⚠️ SupplyItem → Batch НЕ восстанавливался."
  );

  console.log(
    "⚠️ OrderBatch НЕ создавался."
  );

  console.log(
    "⚠️ ReturnBatch НЕ создавался."
  );

  console.log(
    "⚠️ Batch НЕ изменялся."
  );

  console.log(
    "⚠️ Product НЕ изменялся."
  );

  console.log("");

  separator();
  console.log("🏁 LEDGER-АУДИТ ЗАВЕРШЁН");
  separator();
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ ОШИБКА LEDGER-АУДИТА");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
