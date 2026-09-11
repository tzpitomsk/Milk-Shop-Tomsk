import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Classification =
  | "OK"
  | "UPDATE"
  | "SKIP"
  | "CRITICAL";

type OrderAnalysis = {
  id: number;
  status: string;

  storedTotal: number;
  storedProfit: number;

  grossRevenue: number;
  returnedRevenue: number;
  netRevenue: number;

  grossCost: number;
  returnedCost: number;
  netCost: number;

  grossProfit: number;
  netProfit: number;

  orderBatchQuantity: number;
  returnedBatchQuantity: number;

  missingOrderBatchItems: number;
  mismatchedOrderBatchItems: number;
  invalidOrderBatchItems: number;

  invalidReturnBatchItems: number;
  returnBatchWithoutOrderBatch: number;

  statusIssue: string | null;

  classification: Classification;
  reason: string;
};

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function printSeparator() {
  console.log("=".repeat(90));
}

async function main() {
  console.log("🔍 DRY-RUN V29.1 — ORDER PROFIT AUDIT");
  console.log("⚠️ РЕЖИМ ТОЛЬКО ДЛЯ ЧТЕНИЯ — БД НЕ ИЗМЕНЯЕТСЯ");
  console.log();

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

  console.log(`📦 Загружено заказов: ${orders.length}`);
  console.log();

  const analyses: OrderAnalysis[] = [];

  for (const order of orders) {
    let grossRevenue = 0;
    let returnedRevenue = 0;

    let grossCost = 0;
    let returnedCost = 0;

    let orderBatchQuantity = 0;
    let returnedBatchQuantity = 0;

    let missingOrderBatchItems = 0;
    let mismatchedOrderBatchItems = 0;
    let invalidOrderBatchItems = 0;

    let invalidReturnBatchItems = 0;
    let returnBatchWithoutOrderBatch = 0;

    let statusIssue: string | null = null;

    for (const item of order.items) {
      const grossItemRevenue = item.price * item.quantity;
      const returnedItemRevenue = item.price * item.returned;

      grossRevenue += grossItemRevenue;
      returnedRevenue += returnedItemRevenue;

      const itemOrderBatchQuantity = item.batches.reduce(
        (sum, orderBatch) => sum + orderBatch.quantity,
        0
      );

      orderBatchQuantity += itemOrderBatchQuantity;

      /*
       * Для полностью подтверждённого заказа вся проданная
       * величина OrderItem.quantity должна быть распределена
       * по OrderBatch.
       */
      if (itemOrderBatchQuantity !== item.quantity) {
        if (itemOrderBatchQuantity < item.quantity) {
          missingOrderBatchItems++;
        } else {
          mismatchedOrderBatchItems++;
        }
      }

      for (const orderBatch of item.batches) {
        if (
          orderBatch.quantity <= 0 ||
          !Number.isInteger(orderBatch.quantity) ||
          orderBatch.purchaseCost < 0
        ) {
          invalidOrderBatchItems++;
        }

        /*
         * Стоимость продажи берём именно из OrderBatch.purchaseCost,
         * потому что это историческая закупочная стоимость партии.
         */
        grossCost +=
          orderBatch.quantity * orderBatch.purchaseCost;
      }

      /*
       * Проверяем возвраты по конкретным партиям.
       */
      const returnsByBatch = new Map<number, number>();

      for (const returnBatch of item.ReturnBatch) {
        if (
          returnBatch.quantity <= 0 ||
          !Number.isInteger(returnBatch.quantity)
        ) {
          invalidReturnBatchItems++;
        }

        returnedBatchQuantity += returnBatch.quantity;

        const previous =
          returnsByBatch.get(returnBatch.batchId) ?? 0;

        returnsByBatch.set(
          returnBatch.batchId,
          previous + returnBatch.quantity
        );

        /*
         * Возврат должен ссылаться на партию,
         * из которой этот товар действительно был продан.
         */
        const matchingOrderBatch = item.batches.find(
          (orderBatch) =>
            orderBatch.batchId === returnBatch.batchId
        );

        if (!matchingOrderBatch) {
          returnBatchWithoutOrderBatch++;
          continue;
        }

        /*
         * Возвращаемое количество не может превышать
         * количество проданного из этой партии.
         */
        const returnedFromBatch =
          returnsByBatch.get(returnBatch.batchId) ?? 0;

        if (
          returnedFromBatch >
          matchingOrderBatch.quantity
        ) {
          invalidReturnBatchItems++;
        }

        returnedCost +=
          returnBatch.quantity *
          matchingOrderBatch.purchaseCost;
      }

      /*
       * Сумма ReturnBatch должна соответствовать OrderItem.returned.
       */
      const itemReturnedBatchQuantity =
        item.ReturnBatch.reduce(
          (sum, returnBatch) =>
            sum + returnBatch.quantity,
          0
        );

      if (
        itemReturnedBatchQuantity !== item.returned
      ) {
        invalidReturnBatchItems++;
      }

      /*
       * Нельзя вернуть больше, чем было продано.
       */
      if (item.returned < 0 || item.returned > item.quantity) {
        invalidReturnBatchItems++;
      }
    }

    const netRevenue =
      grossRevenue - returnedRevenue;

    const netCost =
      grossCost - returnedCost;

    const grossProfit =
      grossRevenue - grossCost;

    const netProfit =
      netRevenue - netCost;

    /*
     * Проверка статуса.
     */
    const totalReturnedItems = order.items.reduce(
      (sum, item) => sum + item.returned,
      0
    );

    const totalGrossItems = order.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    if (totalGrossItems > 0) {
      if (
        totalReturnedItems === 0 &&
        order.status !== "COMPLETED"
      ) {
        statusIssue =
          `Статус ${order.status}, но возвратов нет`;
      } else if (
        totalReturnedItems > 0 &&
        totalReturnedItems < totalGrossItems &&
        order.status !== "PARTIAL_RETURN"
      ) {
        statusIssue =
          `Статус ${order.status}, но возврат частичный`;
      } else if (
        totalReturnedItems === totalGrossItems &&
        order.status !== "RETURNED"
      ) {
        statusIssue =
          `Статус ${order.status}, но заказ полностью возвращён`;
      }
    }

    /*
     * Ключевая проверка полноты истории.
     *
     * Заказ считается полностью подтверждённым только тогда,
     * когда КАЖДЫЙ OrderItem полностью покрыт OrderBatch,
     * а возвраты полностью согласованы с ReturnBatch.
     */
    const fullyLinked =
      missingOrderBatchItems === 0 &&
      mismatchedOrderBatchItems === 0 &&
      invalidOrderBatchItems === 0 &&
      invalidReturnBatchItems === 0 &&
      returnBatchWithoutOrderBatch === 0;

    let classification: Classification;
    let reason: string;

    if (!fullyLinked) {
      /*
       * Исторические заказы с отсутствующими OrderBatch
       * не трогаем автоматически.
       *
       * Но реальные структурные противоречия считаем CRITICAL.
       */
      const hasStructuralCritical =
        mismatchedOrderBatchItems > 0 ||
        invalidOrderBatchItems > 0 ||
        invalidReturnBatchItems > 0 ||
        returnBatchWithoutOrderBatch > 0;

      if (hasStructuralCritical) {
        classification = "CRITICAL";

        const reasons: string[] = [];

        if (mismatchedOrderBatchItems > 0) {
          reasons.push(
            `OrderBatch mismatch: ${mismatchedOrderBatchItems}`
          );
        }

        if (invalidOrderBatchItems > 0) {
          reasons.push(
            `invalid OrderBatch: ${invalidOrderBatchItems}`
          );
        }

        if (invalidReturnBatchItems > 0) {
          reasons.push(
            `invalid ReturnBatch: ${invalidReturnBatchItems}`
          );
        }

        if (returnBatchWithoutOrderBatch > 0) {
          reasons.push(
            `ReturnBatch без OrderBatch: ${returnBatchWithoutOrderBatch}`
          );
        }

        reason = reasons.join("; ");
      } else {
        classification = "SKIP";

        reason =
          `Неполная историческая Batch-история: ` +
          `OrderItems без полного OrderBatch = ${missingOrderBatchItems}`;
      }
    } else if (statusIssue) {
      classification = "CRITICAL";
      reason = statusIssue;
    } else if (order.profit !== netProfit) {
      classification = "UPDATE";

      reason =
        `Order.profit ${money(order.profit)} → ` +
        `${money(netProfit)}`;
    } else {
      classification = "OK";
      reason = "Прибыль уже соответствует NET-формуле";
    }

    analyses.push({
      id: order.id,
      status: order.status,

      storedTotal: order.total,
      storedProfit: order.profit,

      grossRevenue,
      returnedRevenue,
      netRevenue,

      grossCost,
      returnedCost,
      netCost,

      grossProfit,
      netProfit,

      orderBatchQuantity,
      returnedBatchQuantity,

      missingOrderBatchItems,
      mismatchedOrderBatchItems,
      invalidOrderBatchItems,

      invalidReturnBatchItems,
      returnBatchWithoutOrderBatch,

      statusIssue,

      classification,
      reason,
    });
  }

  /*
   * ============================================================
   * ГЛАВНАЯ ПРОВЕРКА: каждый заказ должен попасть ровно в одну
   * категорию.
   * ============================================================
   */

  const okOrders = analyses.filter(
    (x) => x.classification === "OK"
  );

  const updateOrders = analyses.filter(
    (x) => x.classification === "UPDATE"
  );

  const skipOrders = analyses.filter(
    (x) => x.classification === "SKIP"
  );

  const criticalOrders = analyses.filter(
    (x) => x.classification === "CRITICAL"
  );

  const classifiedTotal =
    okOrders.length +
    updateOrders.length +
    skipOrders.length +
    criticalOrders.length;

  printSeparator();
  console.log("📊 КЛАССИФИКАЦИЯ");
  printSeparator();

  console.log(`Всего заказов:       ${analyses.length}`);
  console.log(`OK:                   ${okOrders.length}`);
  console.log(`UPDATE:               ${updateOrders.length}`);
  console.log(`SKIP:                 ${skipOrders.length}`);
  console.log(`CRITICAL:             ${criticalOrders.length}`);
  console.log(`Всего классифицировано: ${classifiedTotal}`);
  console.log();

  if (classifiedTotal !== analyses.length) {
    console.error(
      "❌ КРИТИЧЕСКАЯ ОШИБКА АУДИТА:"
    );
    console.error(
      `Не все заказы классифицированы: ` +
      `${classifiedTotal} из ${analyses.length}`
    );

    throw new Error(
      "V29.1 classification coverage check failed"
    );
  }

  console.log(
    `✅ Проверка покрытия: ` +
    `${analyses.length} = ` +
    `${okOrders.length} OK + ` +
    `${updateOrders.length} UPDATE + ` +
    `${skipOrders.length} SKIP + ` +
    `${criticalOrders.length} CRITICAL`
  );

  /*
   * ============================================================
   * ПОЛНОСТЬЮ ПОДТВЕРЖДЁННЫЕ ЗАКАЗЫ
   * ============================================================
   *
   * UPDATE и OK вместе образуют COMPLETE.
   */
  const completeOrders = analyses.filter(
    (x) =>
      x.classification === "OK" ||
      x.classification === "UPDATE"
  );

  console.log();
  printSeparator();
  console.log("📦 ПОЛНОСТЬЮ ПОДТВЕРЖДЁННЫЕ ЗАКАЗЫ");
  printSeparator();

  console.log(
    `Complete = OK + UPDATE = ` +
    `${completeOrders.length}`
  );

  console.log(
    `Skip = ${skipOrders.length}`
  );

  console.log(
    `Complete + Skip + Critical = ` +
    `${completeOrders.length} + ` +
    `${skipOrders.length} + ` +
    `${criticalOrders.length} = ` +
    `${completeOrders.length +
      skipOrders.length +
      criticalOrders.length}`
  );

  /*
   * ============================================================
   * UPDATE PLAN
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("📝 UPDATE PLAN");
  printSeparator();

  if (updateOrders.length === 0) {
    console.log("Нет заказов для обновления.");
  } else {
    for (const order of updateOrders) {
      console.log(
        `UPDATE Order #${order.id}: ` +
        `${money(order.storedProfit)} → ` +
        `${money(order.netProfit)}`
      );

      console.log(
        `  status=${order.status}, ` +
        `total=${money(order.storedTotal)}`
      );

      console.log(
        `  grossRevenue=${money(order.grossRevenue)}, ` +
        `returnedRevenue=${money(order.returnedRevenue)}, ` +
        `netRevenue=${money(order.netRevenue)}`
      );

      console.log(
        `  grossCost=${money(order.grossCost)}, ` +
        `returnedCost=${money(order.returnedCost)}, ` +
        `netCost=${money(order.netCost)}`
      );

      console.log(
        `  grossProfit=${money(order.grossProfit)}, ` +
        `netProfit=${money(order.netProfit)}`
      );

      console.log();
    }
  }

  /*
   * ============================================================
   * OK
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("✅ OK");
  printSeparator();

  if (okOrders.length === 0) {
    console.log("Нет заказов.");
  } else {
    console.log(
      okOrders
        .map(
          (order) =>
            `#${order.id} = ${money(order.netProfit)}`
        )
        .join("\n")
    );
  }

  /*
   * ============================================================
   * SKIP
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("⏭️ SKIP — ИСТОРИЧЕСКАЯ НЕПОЛНАЯ ИНФОРМАЦИЯ");
  printSeparator();

  if (skipOrders.length === 0) {
    console.log("Нет SKIP.");
  } else {
    for (const order of skipOrders) {
      console.log(
        `SKIP Order #${order.id}: ${order.reason}`
      );
    }
  }

  /*
   * ============================================================
   * CRITICAL
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("🚨 CRITICAL");
  printSeparator();

  if (criticalOrders.length === 0) {
    console.log("Нет критических проблем.");
  } else {
    for (const order of criticalOrders) {
      console.log(
        `CRITICAL Order #${order.id}: ${order.reason}`
      );
    }
  }

  /*
   * ============================================================
   * ПРОВЕРКА TOTAL
   * ============================================================
   *
   * Order.total должен соответствовать NET revenue.
   *
   * Для SKIP отдельно это не используется как основание
   * для исправления прибыли.
   */
  const completeStoredTotal = completeOrders.reduce(
    (sum, order) => sum + order.storedTotal,
    0
  );

  const completeCalculatedRevenue = completeOrders.reduce(
    (sum, order) => sum + order.netRevenue,
    0
  );

  const completeStoredProfit = completeOrders.reduce(
    (sum, order) => sum + order.storedProfit,
    0
  );

  const completeCalculatedNetProfit = completeOrders.reduce(
    (sum, order) => sum + order.netProfit,
    0
  );

  const completeProfitAfterUpdate = completeOrders.reduce(
    (sum, order) => sum + order.netProfit,
    0
  );

  console.log();
  printSeparator();
  console.log("💰 АГРЕГАТ — ТОЛЬКО COMPLETE");
  printSeparator();

  console.log(
    `Stored Order.total:        ${money(
      completeStoredTotal
    )}`
  );

  console.log(
    `Calculated NET revenue:    ${money(
      completeCalculatedRevenue
    )}`
  );

  console.log(
    `Δ total:                    ${money(
      completeStoredTotal -
        completeCalculatedRevenue
    )}`
  );

  console.log();

  console.log(
    `Stored Order.profit:        ${money(
      completeStoredProfit
    )}`
  );

  console.log(
    `Calculated NET profit:      ${money(
      completeCalculatedNetProfit
    )}`
  );

  console.log(
    `Δ profit before update:     ${money(
      completeStoredProfit -
        completeCalculatedNetProfit
    )}`
  );

  console.log(
    `NET profit after update:    ${money(
      completeProfitAfterUpdate
    )}`
  );

  /*
   * ============================================================
   * ПРОВЕРКА, ЧТО ВСЕ COMPLETE ДЕЙСТВИТЕЛЬНО ПОЛНОСТЬЮ
   * СВЯЗАНЫ.
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("🔗 ПРОВЕРКА COMPLETE");
  printSeparator();

  let completeIntegrityErrors = 0;

  for (const order of completeOrders) {
    const problems: string[] = [];

    if (order.missingOrderBatchItems !== 0) {
      problems.push(
        `missing OrderBatch=${order.missingOrderBatchItems}`
      );
    }

    if (order.mismatchedOrderBatchItems !== 0) {
      problems.push(
        `mismatch OrderBatch=${order.mismatchedOrderBatchItems}`
      );
    }

    if (order.invalidOrderBatchItems !== 0) {
      problems.push(
        `invalid OrderBatch=${order.invalidOrderBatchItems}`
      );
    }

    if (order.invalidReturnBatchItems !== 0) {
      problems.push(
        `invalid ReturnBatch=${order.invalidReturnBatchItems}`
      );
    }

    if (order.returnBatchWithoutOrderBatch !== 0) {
      problems.push(
        `ReturnBatch without OrderBatch=${order.returnBatchWithoutOrderBatch}`
      );
    }

    if (order.statusIssue) {
      problems.push(order.statusIssue);
    }

    if (problems.length > 0) {
      completeIntegrityErrors++;

      console.log(
        `❌ COMPLETE Order #${order.id}: ` +
        problems.join("; ")
      );
    }
  }

  if (completeIntegrityErrors === 0) {
    console.log(
      "✅ Все COMPLETE-заказы прошли проверку целостности."
    );
  }

  /*
   * ============================================================
   * СПИСОК ВСЕХ 49 ЗАКАЗОВ
   *
   * Это специально добавлено для устранения прошлой проблемы,
   * когда один заказ потерялся между COMPLETE и SKIP.
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("📋 ПОЛНЫЙ СПИСОК ВСЕХ ЗАКАЗОВ");
  printSeparator();

  for (const order of analyses) {
    console.log(
      `#${order.id} | ` +
      `${order.classification.padEnd(8)} | ` +
      `status=${order.status.padEnd(15)} | ` +
      `profit=${money(order.storedProfit).padStart(12)} | ` +
      `calc=${money(order.netProfit).padStart(12)} | ` +
      `${order.reason}`
    );
  }

  /*
   * ============================================================
   * ФИНАЛЬНЫЕ ПРОВЕРКИ
   * ============================================================
   */

  console.log();
  printSeparator();
  console.log("🧪 ФИНАЛЬНЫЕ ПРОВЕРКИ V29.1");
  printSeparator();

  let finalErrors = 0;

  if (analyses.length !== 49) {
    console.log(
      `⚠️ В БД сейчас ${analyses.length} заказов, ` +
      `а ожидается 49 из предыдущего аудита.`
    );
  }

  if (classifiedTotal !== analyses.length) {
    console.error(
      "❌ Ошибка покрытия классификации."
    );
    finalErrors++;
  }

  if (
    completeOrders.length +
      skipOrders.length +
      criticalOrders.length !==
    analyses.length
  ) {
    console.error(
      "❌ Complete + Skip + Critical != total."
    );
    finalErrors++;
  }

  if (completeIntegrityErrors !== 0) {
    console.error(
      `❌ Ошибок целостности COMPLETE: ` +
      `${completeIntegrityErrors}`
    );
    finalErrors++;
  }

  if (criticalOrders.length !== 0) {
    console.error(
      `❌ CRITICAL заказов: ${criticalOrders.length}`
    );
    finalErrors++;
  }

  if (
    completeStoredTotal !==
    completeCalculatedRevenue
  ) {
    console.error(
      "❌ У COMPLETE-заказов Order.total " +
      "не совпадает с NET revenue."
    );
    finalErrors++;
  }

  /*
   * Очень важная проверка:
   *
   * Все UPDATE должны иметь отличающуюся storedProfit
   * и calculated netProfit.
   */
  for (const order of updateOrders) {
    if (order.storedProfit === order.netProfit) {
      console.error(
        `❌ Order #${order.id} находится в UPDATE, ` +
        `но значения profit одинаковые.`
      );
      finalErrors++;
    }
  }

  for (const order of okOrders) {
    if (order.storedProfit !== order.netProfit) {
      console.error(
        `❌ Order #${order.id} находится в OK, ` +
        `но profit отличается.`
      );
      finalErrors++;
    }
  }

  /*
   * Проверяем отсутствие дублей ID.
   */
  const ids = analyses.map((order) => order.id);
  const uniqueIds = new Set(ids);

  if (uniqueIds.size !== ids.length) {
    console.error(
      "❌ В результате обнаружены дубли Order.id."
    );
    finalErrors++;
  }

  console.log();

  if (finalErrors > 0) {
    console.error(
      `❌ V29.1 НЕ ПРОЙДЕН. Ошибок: ${finalErrors}`
    );

    console.error(
      "⛔ НИКАКИХ ИЗМЕНЕНИЙ В БД НЕ ПРОИЗВОДИЛОСЬ."
    );

    process.exitCode = 1;
    return;
  }

  printSeparator();
  console.log("✅ V29.1 ПРОЙДЕН");
  printSeparator();

  console.log(
    `Всего заказов: ${analyses.length}`
  );

  console.log(
    `Complete: ${completeOrders.length}`
  );

  console.log(
    `  OK: ${okOrders.length}`
  );

  console.log(
    `  UPDATE: ${updateOrders.length}`
  );

  console.log(
    `SKIP: ${skipOrders.length}`
  );

  console.log(
    `CRITICAL: ${criticalOrders.length}`
  );

  console.log();

  console.log(
    `Обновлений Order.profit: ${updateOrders.length}`
  );

  console.log(
    `Stored profit COMPLETE: ${money(
      completeStoredProfit
    )}`
  );

  console.log(
    `Calculated NET profit COMPLETE: ${money(
      completeCalculatedNetProfit
    )}`
  );

  console.log();

  console.log(
    "⛔ БД НЕ ИЗМЕНЯЛАСЬ."
  );

  console.log(
    "➡️ Следующий шаг — только после проверки этого вывода."
  );
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ V29.1 ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });