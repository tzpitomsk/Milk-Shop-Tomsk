import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Severity = "CRITICAL" | "WARNING" | "INFO";

type Issue = {
  severity: Severity;
  message: string;
};

type BatchProfitRow = {
  orderBatchId: number;
  batchId: number;
  soldQuantity: number;
  returnedQuantity: number;
  netQuantity: number;
  purchaseCost: number;
  grossCost: number;
  returnedCost: number;
  netCost: number;
};

type OrderAnalysis = {
  orderId: number;
  status: string;

  grossRevenue: number;
  returnedRevenue: number;
  netRevenue: number;

  grossCost: number;
  returnedCost: number;
  netCost: number;

  grossProfit: number;
  netProfit: number;

  storedTotal: number;
  storedProfit: number;

  orderBatchComplete: boolean;

  totalMatchesGrossRevenue: boolean;
  totalMatchesNetRevenue: boolean;

  profitMatchesGrossProfit: boolean;
  profitMatchesNetProfit: boolean;

  batchRows: BatchProfitRow[];
};

const issues: Issue[] = [];

function issue(severity: Severity, message: string) {
  issues.push({ severity, message });

  const prefix =
    severity === "CRITICAL"
      ? "❌ CRITICAL"
      : severity === "WARNING"
        ? "⚠️ WARNING"
        : "ℹ️ INFO";

  console.log(`${prefix}: ${message}`);
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function dateTime(value: Date) {
  return value.toISOString();
}

function statusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "Продан";
    case "PARTIAL_RETURN":
      return "Частичный возврат";
    case "RETURNED":
      return "Возвращён";
    default:
      return status;
  }
}

async function main() {
  console.log("=".repeat(100));
  console.log("🔍 AUDIT ORDER PROFIT V28");
  console.log("Строгий READ-ONLY аудит прибыли заказов");
  console.log("=".repeat(100));
  console.log(`⏱ Audit time: ${new Date().toISOString()}`);
  console.log();

  console.log("🚫 ВАЖНО: этот скрипт НЕ изменяет базу данных.");
  console.log("🚫 Нет create / update / delete / transaction с изменениями.");
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

  let ordersWithCompleteBatchHistory = 0;
  let ordersWithMissingOrderBatch = 0;

  let totalGrossRevenue = 0;
  let totalReturnedRevenue = 0;
  let totalNetRevenue = 0;

  let totalGrossCost = 0;
  let totalReturnedCost = 0;
  let totalNetCost = 0;

  let totalGrossProfit = 0;
  let totalNetProfit = 0;

  let storedTotalSum = 0;
  let storedProfitSum = 0;

  let profitMatchesNet = 0;
  let profitMatchesGross = 0;

  let totalMatchesGross = 0;
  let totalMatchesNet = 0;
  let totalMatchesNeither = 0;

  let fullyReturnedOrders = 0;
  let partialReturnOrders = 0;
  let completedOrders = 0;

  for (const order of orders) {
    let grossRevenue = 0;
    let returnedRevenue = 0;

    let grossCost = 0;
    let returnedCost = 0;

    let hasMissingOrderBatch = false;

    const batchRows: BatchProfitRow[] = [];

    for (const item of order.items) {
      const grossQuantity = item.quantity;
      const returnedQuantity = item.returned;

      /*
       * Выручка:
       *
       * grossRevenue:
       *     quantity * selling price
       *
       * returnedRevenue:
       *     returned * selling price
       *
       * netRevenue:
       *     (quantity - returned) * selling price
       */
      const itemGrossRevenue = item.price * grossQuantity;
      const itemReturnedRevenue = item.price * returnedQuantity;

      grossRevenue += itemGrossRevenue;
      returnedRevenue += itemReturnedRevenue;

      /*
       * Если OrderBatch отсутствует полностью,
       * историческую себестоимость доказать нельзя.
       */
      if (item.batches.length === 0) {
        hasMissingOrderBatch = true;

        issue(
          "WARNING",
          `OrderItem #${item.id} (Order #${order.id}, ${item.product.name}) ` +
            `не имеет OrderBatch. Gross qty=${grossQuantity}, returned=${returnedQuantity}. ` +
            `Себестоимость этого товара исторически не подтверждена.`,
        );

        continue;
      }

      const soldByOrderBatch = item.batches.reduce(
        (sum, orderBatch) => sum + orderBatch.quantity,
        0,
      );

      /*
       * OrderBatch total должен совпадать с gross quantity OrderItem.
       */
      if (soldByOrderBatch !== grossQuantity) {
        hasMissingOrderBatch = true;

        issue(
          "WARNING",
          `OrderItem #${item.id} (Order #${order.id}, ${item.product.name}): ` +
            `gross quantity=${grossQuantity}, OrderBatch total=${soldByOrderBatch}. ` +
            `Историческая себестоимость неполная.`,
        );
      }

      /*
       * Сколько товара возвращено из каждого конкретного Batch.
       *
       * ReturnBatch является источником истины для возврата себестоимости,
       * потому что он непосредственно связывает возврат с Batch.
       */
      const returnedByBatch = new Map<number, number>();

      for (const returnBatch of item.ReturnBatch) {
        const previous = returnedByBatch.get(returnBatch.batchId) ?? 0;

        returnedByBatch.set(
          returnBatch.batchId,
          previous + returnBatch.quantity,
        );
      }

      /*
       * Проверяем ReturnBatch против фактически проданного
       * количества того же Batch.
       */
      for (const [batchId, returnedQuantityForBatch] of returnedByBatch) {
        const soldQuantityForBatch = item.batches
          .filter((orderBatch) => orderBatch.batchId === batchId)
          .reduce((sum, orderBatch) => sum + orderBatch.quantity, 0);

        if (returnedQuantityForBatch > soldQuantityForBatch) {
          issue(
            "CRITICAL",
            `OrderItem #${item.id} (Order #${order.id}): ` +
              `ReturnBatch для Batch #${batchId} = ${returnedQuantityForBatch} шт., ` +
              `но продано этого Batch только ${soldQuantityForBatch} шт.`,
          );
        }
      }

      /*
       * Расчёт себестоимости по каждому OrderBatch.
       */
      for (const orderBatch of item.batches) {
        const soldQuantity = orderBatch.quantity;

        const returnedQuantityForBatch =
          returnedByBatch.get(orderBatch.batchId) ?? 0;

        const netQuantity = soldQuantity - returnedQuantityForBatch;

        if (netQuantity < 0) {
          issue(
            "CRITICAL",
            `OrderBatch #${orderBatch.id} (Order #${order.id}): ` +
              `sold=${soldQuantity}, returned=${returnedQuantityForBatch}, ` +
              `net=${netQuantity}. Отрицательное количество.`,
          );
        }

        const grossBatchCost =
          soldQuantity * orderBatch.purchaseCost;

        const returnedBatchCost =
          returnedQuantityForBatch * orderBatch.purchaseCost;

        const netBatchCost =
          Math.max(0, netQuantity) * orderBatch.purchaseCost;

        grossCost += grossBatchCost;
        returnedCost += returnedBatchCost;

        batchRows.push({
          orderBatchId: orderBatch.id,
          batchId: orderBatch.batchId,
          soldQuantity,
          returnedQuantity: returnedQuantityForBatch,
          netQuantity: Math.max(0, netQuantity),
          purchaseCost: orderBatch.purchaseCost,
          grossCost: grossBatchCost,
          returnedCost: returnedBatchCost,
          netCost: netBatchCost,
        });
      }
    }

    const netRevenue = grossRevenue - returnedRevenue;
    const netCost = grossCost - returnedCost;

    const grossProfit = grossRevenue - grossCost;
    const netProfit = netRevenue - netCost;

    const totalMatchesGrossRevenue = order.total === grossRevenue;
    const totalMatchesNetRevenue = order.total === netRevenue;

    const profitMatchesGrossProfit = order.profit === grossProfit;
    const profitMatchesNetProfit = order.profit === netProfit;

    const orderBatchComplete = !hasMissingOrderBatch;

    if (orderBatchComplete) {
      ordersWithCompleteBatchHistory++;
    } else {
      ordersWithMissingOrderBatch++;
    }

    if (order.status === "RETURNED") {
      fullyReturnedOrders++;
    } else if (order.status === "PARTIAL_RETURN") {
      partialReturnOrders++;
    } else if (order.status === "COMPLETED") {
      completedOrders++;
    }

    /*
     * Order.total:
     *
     * Мы НЕ предполагаем заранее, является ли total gross или net.
     * Сначала сравниваем с обоими вариантами.
     */
    if (orderBatchComplete) {
      if (totalMatchesGrossRevenue) {
        totalMatchesGross++;
      }

      if (totalMatchesNetRevenue) {
        totalMatchesNet++;
      }

      if (!totalMatchesGrossRevenue && !totalMatchesNetRevenue) {
        totalMatchesNeither++;

        issue(
          "WARNING",
          `Order #${order.id}: Order.total=${money(order.total)}, ` +
            `grossRevenue=${money(grossRevenue)}, ` +
            `netRevenue=${money(netRevenue)}. ` +
            `total не совпадает ни с gross, ни с net выручкой.`,
        );
      }
    }

    /*
     * Profit имеет смысл сравнивать с кандидатами только тогда,
     * когда OrderBatch полностью восстановлен.
     *
     * Для неполных исторических заказов мы не объявляем profit ошибочным,
     * потому что себестоимость неизвестна.
     */
    if (orderBatchComplete) {
      if (profitMatchesGrossProfit) {
        profitMatchesGross++;
      }

      if (profitMatchesNetProfit) {
        profitMatchesNet++;
      }

      if (!profitMatchesGrossProfit && !profitMatchesNetProfit) {
        issue(
          "WARNING",
          `Order #${order.id}: сохранённая profit=${money(order.profit)}, ` +
            `grossProfit=${money(grossProfit)}, ` +
            `netProfit=${money(netProfit)}. ` +
            `Ни одна из стандартных формул не совпадает.`,
        );
      }

      /*
       * Особо важная проверка:
       *
       * Если заказ полностью возвращён, netRevenue и netCost должны
       * дать netProfit = 0, если ReturnBatch покрывает все продажи.
       */
      if (
        order.status === "RETURNED" &&
        order.items.length > 0 &&
        netRevenue === 0 &&
        netCost === 0 &&
        order.profit !== 0
      ) {
        issue(
          "WARNING",
          `Order #${order.id} имеет статус RETURNED и полностью ` +
            `нулевые netRevenue/netCost, но сохранённая profit=${money(order.profit)}.`,
        );
      }

      /*
       * Если статус PARTIAL_RETURN, проверяем, что действительно
       * присутствует возврат и остаётся ненулевое количество.
       */
      if (order.status === "PARTIAL_RETURN") {
        const grossQuantity = order.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        const returnedQuantity = order.items.reduce(
          (sum, item) => sum + item.returned,
          0,
        );

        if (returnedQuantity <= 0 || returnedQuantity >= grossQuantity) {
          issue(
            "WARNING",
            `Order #${order.id} имеет статус PARTIAL_RETURN, ` +
              `но gross=${grossQuantity}, returned=${returnedQuantity}.`,
          );
        }
      }

      /*
       * Если COMPLETED, возвратов быть не должно.
       */
      if (order.status === "COMPLETED") {
        const returnedQuantity = order.items.reduce(
          (sum, item) => sum + item.returned,
          0,
        );

        if (returnedQuantity !== 0) {
          issue(
            "WARNING",
            `Order #${order.id} имеет статус COMPLETED, ` +
              `но returned=${returnedQuantity}.`,
          );
        }
      }
    }

    const analysis: OrderAnalysis = {
      orderId: order.id,
      status: order.status,

      grossRevenue,
      returnedRevenue,
      netRevenue,

      grossCost,
      returnedCost,
      netCost,

      grossProfit,
      netProfit,

      storedTotal: order.total,
      storedProfit: order.profit,

      orderBatchComplete,

      totalMatchesGrossRevenue,
      totalMatchesNetRevenue,

      profitMatchesGrossProfit,
      profitMatchesNetProfit,

      batchRows,
    };

    analyses.push(analysis);

    totalGrossRevenue += grossRevenue;
    totalReturnedRevenue += returnedRevenue;
    totalNetRevenue += netRevenue;

    totalGrossCost += grossCost;
    totalReturnedCost += returnedCost;
    totalNetCost += netCost;

    totalGrossProfit += grossProfit;
    totalNetProfit += netProfit;

    storedTotalSum += order.total;
    storedProfitSum += order.profit;
  }

  console.log();
  console.log("=".repeat(100));
  console.log("📊 ДЕТАЛЬНЫЙ АНАЛИЗ ЗАКАЗОВ");
  console.log("=".repeat(100));
  console.log();

  for (const analysis of analyses) {
    console.log("-".repeat(100));

    console.log(
      `🧾 Заказ #${analysis.orderId} — ${statusLabel(analysis.status)}`,
    );

    console.log(
      `   Order.total:       ${money(analysis.storedTotal)}`,
    );

    console.log(
      `   Gross revenue:     ${money(analysis.grossRevenue)}`,
    );

    console.log(
      `   Returned revenue:  ${money(analysis.returnedRevenue)}`,
    );

    console.log(
      `   Net revenue:       ${money(analysis.netRevenue)}`,
    );

    console.log();

    console.log(
      `   Gross cost:        ${money(analysis.grossCost)}`,
    );

    console.log(
      `   Returned cost:     ${money(analysis.returnedCost)}`,
    );

    console.log(
      `   Net cost:          ${money(analysis.netCost)}`,
    );

    console.log();

    console.log(
      `   Gross profit:      ${money(analysis.grossProfit)}`,
    );

    console.log(
      `   Net profit:        ${money(analysis.netProfit)}`,
    );

    console.log(
      `   Stored profit:     ${money(analysis.storedProfit)}`,
    );

    console.log();

    if (!analysis.orderBatchComplete) {
      console.log(
        "   ⚠️ Себестоимость неполная: есть OrderItem без полного OrderBatch.",
      );
    } else {
      const totalMode =
        analysis.totalMatchesGrossRevenue &&
        analysis.totalMatchesNetRevenue
          ? "GROSS = NET"
          : analysis.totalMatchesGrossRevenue
            ? "GROSS"
            : analysis.totalMatchesNetRevenue
              ? "NET"
              : "NEITHER";

      const profitMode =
        analysis.profitMatchesGrossProfit &&
        analysis.profitMatchesNetProfit
          ? "GROSS = NET"
          : analysis.profitMatchesGrossProfit
            ? "GROSS"
            : analysis.profitMatchesNetProfit
              ? "NET"
              : "NEITHER";

      console.log(`   Order.total formula: ${totalMode}`);
      console.log(`   Order.profit formula: ${profitMode}`);
    }

    if (analysis.batchRows.length > 0) {
      console.log();
      console.log("   📦 Batch себестоимость:");

      for (const row of analysis.batchRows) {
        console.log(
          `      OrderBatch #${row.orderBatchId} → Batch #${row.batchId}: ` +
            `sold=${row.soldQuantity}, ` +
            `returned=${row.returnedQuantity}, ` +
            `net=${row.netQuantity}, ` +
            `cost=${money(row.purchaseCost)}, ` +
            `grossCost=${money(row.grossCost)}, ` +
            `returnedCost=${money(row.returnedCost)}, ` +
            `netCost=${money(row.netCost)}`,
        );
      }
    }

    console.log();
  }

  console.log("=".repeat(100));
  console.log("📈 ОБЩАЯ СТАТИСТИКА");
  console.log("=".repeat(100));
  console.log();

  console.log(`Всего заказов:                 ${orders.length}`);
  console.log(`COMPLETED:                      ${completedOrders}`);
  console.log(`PARTIAL_RETURN:                 ${partialReturnOrders}`);
  console.log(`RETURNED:                        ${fullyReturnedOrders}`);
  console.log();

  console.log(
    `Полностью связанные OrderBatch: ${ordersWithCompleteBatchHistory}`,
  );

  console.log(
    `Неполная Batch-история:          ${ordersWithMissingOrderBatch}`,
  );

  console.log();

  console.log(`Сумма stored Order.total:       ${money(storedTotalSum)}`);
  console.log(`Gross revenue:                  ${money(totalGrossRevenue)}`);
  console.log(`Returned revenue:               ${money(totalReturnedRevenue)}`);
  console.log(`Net revenue:                    ${money(totalNetRevenue)}`);
  console.log();

  console.log(`Gross cost:                     ${money(totalGrossCost)}`);
  console.log(`Returned cost:                  ${money(totalReturnedCost)}`);
  console.log(`Net cost:                       ${money(totalNetCost)}`);
  console.log();

  console.log(`Gross profit candidate:         ${money(totalGrossProfit)}`);
  console.log(`Net profit candidate:           ${money(totalNetProfit)}`);
  console.log(`Stored Order.profit:            ${money(storedProfitSum)}`);
  console.log();

  console.log("=".repeat(100));
  console.log("🧮 ФОРМУЛЫ");
  console.log("=".repeat(100));
  console.log();

  console.log(
    `Order.total = gross revenue:    ${totalMatchesGross} заказов`,
  );

  console.log(
    `Order.total = net revenue:      ${totalMatchesNet} заказов`,
  );

  console.log(
    `Order.total = neither:          ${totalMatchesNeither} заказов`,
  );

  console.log();

  console.log(
    `profit = gross profit:           ${profitMatchesGross} заказов`,
  );

  console.log(
    `profit = net profit:             ${profitMatchesNet} заказов`,
  );

  console.log();

  /*
   * Дополнительный анализ полностью связанных заказов.
   */
  const fullyLinked = analyses.filter(
    (analysis) => analysis.orderBatchComplete,
  );

  console.log("=".repeat(100));
  console.log("🔬 ПОЛНОСТЬЮ СВЯЗАННЫЕ ЗАКАЗЫ");
  console.log("=".repeat(100));
  console.log();

  console.log(
    `Полностью связанных заказов: ${fullyLinked.length}`,
  );

  console.log();

  for (const analysis of fullyLinked) {
    const profitDeltaNet =
      analysis.storedProfit - analysis.netProfit;

    const profitDeltaGross =
      analysis.storedProfit - analysis.grossProfit;

    const totalDeltaNet =
      analysis.storedTotal - analysis.netRevenue;

    const totalDeltaGross =
      analysis.storedTotal - analysis.grossRevenue;

    if (
      !analysis.profitMatchesNetProfit ||
      !analysis.profitMatchesGrossProfit ||
      !analysis.totalMatchesNetRevenue ||
      !analysis.totalMatchesGrossRevenue
    ) {
      console.log(
        `Order #${analysis.orderId}:`,
      );

      console.log(
        `   total stored=${money(analysis.storedTotal)}`,
      );

      console.log(
        `   grossRevenue=${money(analysis.grossRevenue)}`,
      );

      console.log(
        `   netRevenue=${money(analysis.netRevenue)}`,
      );

      console.log(
        `   total Δ gross=${money(totalDeltaGross)}`,
      );

      console.log(
        `   total Δ net=${money(totalDeltaNet)}`,
      );

      console.log(
        `   profit stored=${money(analysis.storedProfit)}`,
      );

      console.log(
        `   grossProfit=${money(analysis.grossProfit)}`,
      );

      console.log(
        `   netProfit=${money(analysis.netProfit)}`,
      );

      console.log(
        `   profit Δ gross=${money(profitDeltaGross)}`,
      );

      console.log(
        `   profit Δ net=${money(profitDeltaNet)}`,
      );

      console.log();
    }
  }

  /*
   * Отдельно показываем наиболее интересные случаи:
   *
   * 1. Полностью возвращённые заказы с ненулевой stored profit.
   * 2. Заказы, где stored profit > revenue.
   * 3. Заказы, где stored profit не совпадает ни с gross, ни с net.
   */
  console.log("=".repeat(100));
  console.log("🚨 ПОДОЗРИТЕЛЬНЫЕ СЛУЧАИ");
  console.log("=".repeat(100));
  console.log();

  for (const analysis of fullyLinked) {
    if (
      analysis.status === "RETURNED" &&
      analysis.netRevenue === 0 &&
      analysis.netCost === 0 &&
      analysis.storedProfit !== 0
    ) {
      console.log(
        `⚠️ Order #${analysis.orderId}: полностью возвращён, ` +
          `но stored profit=${money(analysis.storedProfit)}.`,
      );
    }

    if (analysis.storedProfit > analysis.storedTotal) {
      console.log(
        `⚠️ Order #${analysis.orderId}: stored profit ` +
          `${money(analysis.storedProfit)} > stored total ` +
          `${money(analysis.storedTotal)}.`,
      );
    }

    if (
      !analysis.profitMatchesGrossProfit &&
      !analysis.profitMatchesNetProfit
    ) {
      console.log(
        `⚠️ Order #${analysis.orderId}: stored profit=${money(analysis.storedProfit)}, ` +
          `grossProfit=${money(analysis.grossProfit)}, ` +
          `netProfit=${money(analysis.netProfit)}.`,
      );
    }
  }

  console.log();

  /*
   * Финальная сводка issues.
   */
  console.log("=".repeat(100));
  console.log("🏁 FINAL V28 SUMMARY");
  console.log("=".repeat(100));
  console.log();

  const criticalCount = issues.filter(
    (item) => item.severity === "CRITICAL",
  ).length;

  const warningCount = issues.filter(
    (item) => item.severity === "WARNING",
  ).length;

  const infoCount = issues.filter(
    (item) => item.severity === "INFO",
  ).length;

  console.log(`❌ CRITICAL: ${criticalCount}`);
  console.log(`⚠️ WARNING:  ${warningCount}`);
  console.log(`ℹ️ INFO:     ${infoCount}`);
  console.log();

  /*
   * Выводим только критические ошибки ещё раз,
   * чтобы их было легко увидеть в конце лога.
   */
  if (criticalCount > 0) {
    console.log("❌ КРИТИЧЕСКИЕ ПРОБЛЕМЫ:");
    console.log();

    for (const item of issues.filter(
      (issue) => issue.severity === "CRITICAL",
    )) {
      console.log(`- ${item.message}`);
    }

    console.log();
  }

  if (warningCount > 0) {
    console.log("⚠️ ОСНОВНЫЕ WARNING:");
    console.log();

    for (const item of issues
      .filter((issue) => issue.severity === "WARNING")
      .slice(0, 100)) {
      console.log(`- ${item.message}`);
    }

    if (warningCount > 100) {
      console.log(
        `... ещё ${warningCount - 100} предупреждений`,
      );
    }

    console.log();
  }

  console.log("=".repeat(100));

  if (criticalCount === 0) {
    console.log("✅ V28 завершён: критических нарушений нет.");
  } else {
    console.log(
      "❌ V28 завершён: обнаружены критические нарушения.",
    );
  }

  console.log();

  console.log(
    "ℹ️ V28 READ-ONLY: база данных не изменялась.",
  );

  console.log("=".repeat(100));
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ V28 FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });