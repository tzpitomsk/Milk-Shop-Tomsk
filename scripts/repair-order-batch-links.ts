import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ============================================================
 * REPAIR ORDER -> BATCH LINKS
 * ============================================================
 *
 * СТРОГИЙ DRY-RUN
 *
 * ВАЖНО:
 * Этот файл НИКОГДА не изменяет базу данных.
 *
 * Не выполняются:
 *
 * prisma.orderBatch.create()
 * prisma.orderBatch.update()
 * prisma.batch.update()
 * prisma.product.update()
 * prisma.orderItem.update()
 * prisma.returnBatch.create()
 *
 * Задача:
 *
 * 1. Найти OrderItem без полного OrderBatch.
 * 2. Посмотреть существующие OrderBatch.
 * 3. Посмотреть существующие ReturnBatch.
 * 4. Построить виртуальное состояние партий.
 * 5. Сначала использовать доказательство ReturnBatch.
 * 6. Затем использовать строгий FIFO.
 * 7. Никогда не превышать виртуальную доступность партии.
 * 8. Показать безопасный план восстановления.
 *
 * БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ.
 *
 * ============================================================
 */

type PlannedLink = {
  orderId: number;
  orderItemId: number;
  productId: number;
  productName: string;
  batchId: number;
  quantity: number;
  purchaseCost: number;
  reason: string;
};

type VirtualBatch = {
  id: number;
  productId: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
  status: string;

  /**
   * Уже существующие продажи через OrderBatch.
   */
  existingSold: number;

  /**
   * Уже существующие возвраты через ReturnBatch.
   */
  existingReturned: number;

  /**
   * Диагностическая историческая ёмкость.
   *
   * current quantity
   * + existing sold
   * - existing returned
   *
   * Это НЕ абсолютная истина.
   *
   * Используется только как консервативная
   * проверка согласованности истории.
   */
  inferredInitialQuantity: number;

  /**
   * Сколько продаж можно дополнительно объяснить
   * этой партией по диагностической модели.
   *
   * Это:
   *
   * inferredInitialQuantity
   * - existingSold
   *
   * То есть:
   *
   * current quantity - existingReturned
   *
   * ВАЖНО:
   *
   * виртуально уменьшается после каждого
   * предлагаемого восстановления.
   */
  virtualAvailableForMissingSales: number;

  /**
   * Сколько уже было предложено восстановить
   * в рамках текущего dry-run.
   */
  plannedMissingSales: number;
};

const plannedLinks: PlannedLink[] = [];

let problemCount = 0;
let warningCount = 0;
let candidateCount = 0;
let candidateQuantity = 0;

/**
 * Сколько всего OrderItem имеют неполный OrderBatch.
 */
let problematicOrderItemCount = 0;

/**
 * Сколько единиц реально удалось безопасно
 * распределить в dry-run.
 */
let safelyPlannedQuantity = 0;

/**
 * Сколько единиц осталось нераспределёнными.
 */
let unresolvedQuantity = 0;

function separator() {
  console.log("----------------------------------------");
}

function formatDate(value: Date) {
  return value.toISOString();
}

function money(value: number) {
  return `${value} ₽`;
}

function addProblem(message: string) {
  problemCount++;
  console.log(`🔴 ${message}`);
}

function addWarning(message: string) {
  warningCount++;
  console.log(`🟡 ${message}`);
}

/**
 * Безопасно получить количество.
 */
function sumQuantity(
  links: Array<{ quantity: number }>
) {
  return links.reduce(
    (sum, link) => sum + link.quantity,
    0
  );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log("");
  console.log("========================================");
  console.log("🧪 REPAIR ORDER → BATCH LINKS");
  console.log("========================================");
  console.log("");

  console.log("⚠️ СТРОГИЙ DRY-RUN");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log("");

  await prisma.$connect();

  console.log("✅ Prisma работает");
  console.log("");

  /**
   * ----------------------------------------------------------
   * Получаем товары.
   * ----------------------------------------------------------
   */

  const products = await prisma.product.findMany({
    orderBy: {
      id: "asc",
    },

    include: {
      batches: {
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

        include: {
          orderBatches: true,
          ReturnBatch: true,
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

  console.log(`📦 Товаров: ${products.length}`);
  console.log("");

  /**
   * ==========================================================
   * ОБРАБОТКА ТОВАРОВ
   * ==========================================================
   */

  for (const product of products) {
    console.log("========================================");
    console.log(
      `🥛 ТОВАР #${product.id}: ${product.name}`
    );
    console.log("========================================");
    console.log("");

    /**
     * --------------------------------------------------------
     * ВИРТУАЛЬНЫЕ ПАРТИИ
     * --------------------------------------------------------
     */

    const batches = new Map<number, VirtualBatch>();

    for (const batch of product.batches) {
      const existingSold = sumQuantity(
        batch.orderBatches
      );

      const existingReturned = sumQuantity(
        batch.ReturnBatch
      );

      /**
       * Диагностическая историческая ёмкость.
       *
       * Формула:
       *
       * current + sold - returned
       *
       * Например Batch #15:
       *
       * 15 + 10 - 8 = 17
       */
      const inferredInitialQuantity =
        batch.quantity +
        existingSold -
        existingReturned;

      /**
       * Дополнительные продажи, которые можно
       * объяснить текущей историей партии.
       *
       * Важно:
       *
       * мы НЕ прибавляем ReturnBatch сюда.
       *
       * Возвращённый товар уже находится
       * в текущем quantity.
       */
      const virtualAvailableForMissingSales =
        Math.max(
          0,
          inferredInitialQuantity -
            existingSold
        );

      batches.set(batch.id, {
        id: batch.id,
        productId: batch.productId,
        quantity: batch.quantity,
        purchaseCost: batch.purchaseCost,
        receivedAt: batch.receivedAt,
        expiryDate: batch.expiryDate,
        status: batch.status,

        existingSold,
        existingReturned,

        inferredInitialQuantity,

        virtualAvailableForMissingSales,

        plannedMissingSales: 0,
      });
    }

    /**
     * --------------------------------------------------------
     * ПРОБЛЕМНЫЕ ORDER ITEM
     * --------------------------------------------------------
     */

    const problematicItems =
      product.orderItems.filter((item) => {
        const orderBatchQuantity =
          sumQuantity(item.batches);

        return (
          orderBatchQuantity <
          item.quantity
        );
      });

    if (problematicItems.length === 0) {
      console.log(
        "✅ Все OrderItem полностью покрыты OrderBatch"
      );
      console.log("");

      /**
       * Даже если нет проблемных OrderItem,
       * всё равно покажем партии с подозрительной
       * историей.
       */

      for (const batch of batches.values()) {
        if (
          batch.inferredInitialQuantity <
          batch.existingSold
        ) {
          addWarning(
            `Batch #${batch.id}: существующие продажи ` +
              `превышают диагностическую ёмкость`
          );
        }
      }

      continue;
    }

    problematicOrderItemCount +=
      problematicItems.length;

    console.log(
      `⚠️ OrderItem с проблемами OrderBatch: ${problematicItems.length}`
    );

    console.log("");

    /**
     * ========================================================
     * ORDER ITEMS
     * ========================================================
     */

    for (const item of problematicItems) {
      separator();

      const existingOrderBatchQuantity =
        sumQuantity(item.batches);

      const returnBatchQuantity =
        sumQuantity(item.ReturnBatch);

      const missingQuantity =
        item.quantity -
        existingOrderBatchQuantity;

      console.log(
        `🛒 Order #${item.orderId}, OrderItem #${item.id}`
      );

      console.log(
        `  Товар: ${product.name}`
      );

      console.log(
        `  Дата заказа: ${formatDate(item.order.date)}`
      );

      console.log(
        `  Статус: ${item.order.status}`
      );

      console.log(
        `  Продано: ${item.quantity}`
      );

      console.log(
        `  Возвращено: ${item.returned}`
      );

      console.log(
        `  Реально осталось: ${
          item.quantity - item.returned
        }`
      );

      console.log(
        `  OrderBatch сейчас: ${existingOrderBatchQuantity}`
      );

      console.log(
        `  ReturnBatch сейчас: ${returnBatchQuantity}`
      );

      console.log(
        `  Не хватает OrderBatch: ${missingQuantity}`
      );

      /**
       * ------------------------------------------------------
       * Существующие OrderBatch
       * ------------------------------------------------------
       */

      if (item.batches.length > 0) {
        console.log("");
        console.log(
          "  🔗 Существующие OrderBatch:"
        );

        for (const link of item.batches) {
          console.log(
            `    Batch #${link.batchId}: ` +
              `${link.quantity} шт × ` +
              `${money(link.purchaseCost)}`
          );
        }
      }

      /**
       * ------------------------------------------------------
       * ReturnBatch
       * ------------------------------------------------------
       */

      if (item.ReturnBatch.length > 0) {
        console.log("");
        console.log("  ↩ ReturnBatch:");

        for (const returnLink of item.ReturnBatch) {
          console.log(
            `    ReturnBatch #${returnLink.id}: ` +
              `Batch #${returnLink.batchId}, ` +
              `${returnLink.quantity} шт`
          );
        }
      }

      /**
       * ------------------------------------------------------
       * Невозможно восстанавливать отрицательное
       * количество.
       * ------------------------------------------------------
       */

      if (missingQuantity <= 0) {
        continue;
      }

      let remaining = missingQuantity;

      /**
       * ------------------------------------------------------
       * Уже существующие OrderBatch по партиям.
       * ------------------------------------------------------
       */

      const existingByBatch =
        new Map<number, number>();

      for (const link of item.batches) {
        const previous =
          existingByBatch.get(link.batchId) ??
          0;

        existingByBatch.set(
          link.batchId,
          previous + link.quantity
        );
      }

      /**
       * ------------------------------------------------------
       * ReturnBatch по партиям.
       * ------------------------------------------------------
       */

      const returnByBatch =
        new Map<number, number>();

      for (const returnLink of item.ReturnBatch) {
        const previous =
          returnByBatch.get(
            returnLink.batchId
          ) ?? 0;

        returnByBatch.set(
          returnLink.batchId,
          previous + returnLink.quantity
        );
      }

      /**
       * ======================================================
       * STEP 1
       *
       * ReturnBatch — самое сильное доказательство
       * конкретной партии.
       *
       * Но теперь есть важнейшая защита:
       *
       * мы НЕ можем создать виртуально больше продаж,
       * чем допускает виртуальная ёмкость партии.
       * ======================================================
       */

      if (returnByBatch.size > 0) {
        console.log("");
        console.log(
          "  🔎 Проверяем партии, подтверждённые возвратами..."
        );

        for (const [
          batchId,
          returnedQuantity,
        ] of returnByBatch) {
          if (remaining <= 0) {
            break;
          }

          const batch =
            batches.get(batchId);

          if (!batch) {
            addProblem(
              `Order #${item.orderId}, ` +
                `OrderItem #${item.id}: ` +
                `ReturnBatch указывает на ` +
                `отсутствующий Batch #${batchId}`
            );

            continue;
          }

          const existingQuantity =
            existingByBatch.get(batchId) ??
            0;

          /**
           * Сколько продажи этой партии
           * требуется минимум для объяснения возврата.
           */
          const requiredForReturn =
            Math.max(
              0,
              returnedQuantity -
                existingQuantity
            );

          if (requiredForReturn <= 0) {
            continue;
          }

          /**
           * Критически важная проверка:
           *
           * сколько реально осталось в виртуальном
           * бюджете этой партии.
           */
          const take = Math.min(
            requiredForReturn,
            remaining,
            batch.virtualAvailableForMissingSales
          );

          if (take <= 0) {
            console.log("");
            console.log(
              `  🔴 Batch #${batch.id}: ` +
                `ReturnBatch требует восстановления ` +
                `${requiredForReturn} шт, ` +
                `но виртуальная доступность = 0`
            );

            addProblem(
              `Order #${item.orderId}, ` +
                `OrderItem #${item.id}: ` +
                `невозможно безопасно восстановить ` +
                `продажу Batch #${batch.id} ` +
                `по ReturnBatch`
            );

            continue;
          }

          console.log("");
          console.log(
            `  🟢 ReturnBatch подтверждает Batch #${batch.id}`
          );

          console.log(
            `     требуется: ${requiredForReturn} шт`
          );

          console.log(
            `     безопасно можно: ${take} шт`
          );

          console.log(
            `     purchaseCost: ${money(
              batch.purchaseCost
            )}`
          );

          if (
            take <
            requiredForReturn
          ) {
            console.log(
              `     🔴 Не хватает виртуальной ёмкости: ` +
                `${
                  requiredForReturn - take
                } шт`
            );

            addProblem(
              `Order #${item.orderId}, ` +
                `OrderItem #${item.id}: ` +
                `ReturnBatch требует ещё ` +
                `${
                  requiredForReturn - take
                } шт`
            );
          }

          plannedLinks.push({
            orderId: item.orderId,
            orderItemId: item.id,
            productId: product.id,
            productName: product.name,
            batchId: batch.id,
            quantity: take,
            purchaseCost: batch.purchaseCost,
            reason:
              "Партия подтверждена существующим ReturnBatch",
          });

          candidateCount++;
          candidateQuantity += take;
          safelyPlannedQuantity += take;

          remaining -= take;

          batch.virtualAvailableForMissingSales -=
            take;

          batch.plannedMissingSales +=
            take;
        }
      }

      /**
       * ======================================================
       * STEP 2
       *
       * FIFO для оставшегося количества.
       * ======================================================
       */

      if (remaining > 0) {
        console.log("");
        console.log(
          `  🔄 FIFO-анализ: осталось ${remaining} шт`
        );

        const candidates =
          Array.from(
            batches.values()
          )
            .filter((batch) => {
              /**
               * Товар должен совпадать.
               */
              if (
                batch.productId !==
                product.id
              ) {
                return false;
              }

              /**
               * Партия должна существовать
               * до момента заказа.
               */
              if (
                batch.receivedAt.getTime() >
                item.order.date.getTime()
              ) {
                return false;
              }

              /**
               * Нельзя использовать партию,
               * у которой закончился диагностический
               * виртуальный ресурс.
               */
              if (
                batch.virtualAvailableForMissingSales <=
                0
              ) {
                return false;
              }

              return true;
            })
            .sort((a, b) => {
              const expiryDifference =
                a.expiryDate.getTime() -
                b.expiryDate.getTime();

              if (
                expiryDifference !== 0
              ) {
                return expiryDifference;
              }

              const receivedDifference =
                a.receivedAt.getTime() -
                b.receivedAt.getTime();

              if (
                receivedDifference !== 0
              ) {
                return receivedDifference;
              }

              return a.id - b.id;
            });

        if (candidates.length === 0) {
          console.log(
            "  🔴 FIFO-кандидатов нет."
          );
        }

        for (const batch of candidates) {
          if (remaining <= 0) {
            break;
          }

          const take = Math.min(
            remaining,
            batch.virtualAvailableForMissingSales
          );

          if (take <= 0) {
            continue;
          }

          const alreadyUsedInItem =
            existingByBatch.get(
              batch.id
            ) ?? 0;

          console.log("");

          console.log(
            `    → Batch #${batch.id}: ${take} шт`
          );

          console.log(
            `       purchaseCost: ${money(
              batch.purchaseCost
            )}`
          );

          console.log(
            `       quantity сейчас: ${batch.quantity}`
          );

          console.log(
            `       уже продано через OrderBatch: ` +
              `${batch.existingSold}`
          );

          console.log(
            `       возвращено через ReturnBatch: ` +
              `${batch.existingReturned}`
          );

          console.log(
            `       диагностическая первоначальная ёмкость: ` +
              `${batch.inferredInitialQuantity}`
          );

          console.log(
            `       виртуально доступно до этого шага: ` +
              `${batch.virtualAvailableForMissingSales}`
          );

          console.log(
            `       уже восстановлено в dry-run: ` +
              `${batch.plannedMissingSales}`
          );

          console.log(
            `       уже есть в этом OrderItem: ` +
              `${alreadyUsedInItem}`
          );

          console.log(
            `       receivedAt: ${formatDate(
              batch.receivedAt
            )}`
          );

          console.log(
            `       expiryDate: ${formatDate(
              batch.expiryDate
            )}`
          );

          const hasReturnForThisBatch =
            returnByBatch.has(batch.id);

          let reason =
            "FIFO: наиболее ранняя подходящая партия";

          if (hasReturnForThisBatch) {
            reason =
              "FIFO: партия также присутствует в ReturnBatch";
          }

          plannedLinks.push({
            orderId: item.orderId,
            orderItemId: item.id,
            productId: product.id,
            productName: product.name,
            batchId: batch.id,
            quantity: take,
            purchaseCost: batch.purchaseCost,
            reason,
          });

          candidateCount++;
          candidateQuantity += take;
          safelyPlannedQuantity += take;

          remaining -= take;

          /**
           * Критически важно:
           *
           * после каждого кандидата уменьшаем
           * виртуальную доступность.
           */
          batch.virtualAvailableForMissingSales -=
            take;

          batch.plannedMissingSales +=
            take;
        }
      }

      /**
       * ======================================================
       * ИТОГ ПО ORDER ITEM
       * ======================================================
       */

      console.log("");

      if (remaining === 0) {
        console.log(
          "  🟢 Для этого OrderItem найден полный " +
            "виртуальный кандидат."
        );
      } else {
        unresolvedQuantity += remaining;

        addProblem(
          `Order #${item.orderId}, ` +
            `OrderItem #${item.id}: ` +
            `невозможно безопасно распределить ещё ` +
            `${remaining} шт`
        );

        console.log(
          `  🔴 Осталось нераспределено: ${remaining} шт`
        );
      }
    }

    /**
     * ========================================================
     * СОСТОЯНИЕ ПАРТИЙ
     * ========================================================
     */

    console.log("");
    console.log("📦 СОСТОЯНИЕ ПАРТИЙ");
    console.log("");

    for (const batch of batches.values()) {
      const plannedForBatch =
        batch.plannedMissingSales;

      if (
        batch.existingSold === 0 &&
        batch.existingReturned === 0 &&
        plannedForBatch === 0
      ) {
        continue;
      }

      console.log(
        `Batch #${batch.id}`
      );

      console.log(
        `  quantity сейчас: ${batch.quantity}`
      );

      console.log(
        `  purchaseCost: ${money(
          batch.purchaseCost
        )}`
      );

      console.log(
        `  receivedAt: ${formatDate(
          batch.receivedAt
        )}`
      );

      console.log(
        `  expiryDate: ${formatDate(
          batch.expiryDate
        )}`
      );

      console.log(
        `  продано через OrderBatch: ${batch.existingSold}`
      );

      console.log(
        `  возвращено через ReturnBatch: ${batch.existingReturned}`
      );

      console.log(
        `  диагностическая историческая ёмкость: ` +
          `${batch.inferredInitialQuantity}`
      );

      console.log(
        `  максимум дополнительных продаж: ` +
          `${
            batch.inferredInitialQuantity -
            batch.existingSold
          }`
      );

      console.log(
        `  предложено восстановить: ` +
          `${plannedForBatch}`
      );

      console.log(
        `  виртуально осталось: ` +
          `${batch.virtualAvailableForMissingSales}`
      );

      if (
        batch.inferredInitialQuantity <
        batch.existingSold
      ) {
        addWarning(
          `Batch #${batch.id}: существующие продажи ` +
            `превышают диагностическую ёмкость`
        );
      }

      console.log("");
    }
  }

  /**
   * ==========================================================
   * ИТОГОВЫЙ ПЛАН
   * ==========================================================
   */

  console.log("");
  console.log("========================================");
  console.log(
    "🛠️ ПРЕДЛАГАЕМЫЙ ПЛАН ВОССТАНОВЛЕНИЯ"
  );
  console.log("========================================");
  console.log("");

  if (plannedLinks.length === 0) {
    console.log(
      "ℹ️ Безопасных кандидатов не найдено."
    );
  } else {
    for (const link of plannedLinks) {
      console.log(
        `Order #${link.orderId}, ` +
          `OrderItem #${link.orderItemId}, ` +
          `${link.productName}`
      );

      console.log(
        `  → Batch #${link.batchId}: ` +
          `${link.quantity} шт × ` +
          `${money(link.purchaseCost)}`
      );

      console.log(
        `  причина: ${link.reason}`
      );

      console.log("");
    }
  }

  /**
   * ==========================================================
   * ГРУППИРОВКА ПО ORDER ITEM
   * ==========================================================
   */

  console.log("========================================");
  console.log("📋 ПЛАН ПО ORDER ITEM");
  console.log("========================================");
  console.log("");

  const groupedByOrderItem =
    new Map<number, PlannedLink[]>();

  for (const link of plannedLinks) {
    const current =
      groupedByOrderItem.get(
        link.orderItemId
      ) ?? [];

    current.push(link);

    groupedByOrderItem.set(
      link.orderItemId,
      current
    );
  }

  for (const [
    orderItemId,
    links,
  ] of groupedByOrderItem) {
    const total =
      links.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    console.log(
      `OrderItem #${orderItemId}: ${total} шт`
    );

    for (const link of links) {
      console.log(
        `  Batch #${link.batchId}: ` +
          `${link.quantity} шт × ` +
          `${money(link.purchaseCost)}`
      );
    }

    console.log("");
  }

  /**
   * ==========================================================
   * ОСОБАЯ ПРОВЕРКА ТВOРОГА
   * ==========================================================
   */

  const tvorog = products.find(
    (product) =>
      product.name
        .toLowerCase()
        .includes("творог")
  );

  if (tvorog) {
    console.log("========================================");
    console.log("🧀 ОСОБАЯ ПРОВЕРКА ТВОРOГА");
    console.log("========================================");
    console.log("");

    const tvorogLinks =
      plannedLinks.filter(
        (link) =>
          link.productId ===
          tvorog.id
      );

    const tvorogItems =
      tvorog.orderItems.filter(
        (item) =>
          sumQuantity(item.batches) <
          item.quantity
      );

    const tvorogRequired =
      tvorogItems.reduce(
        (sum, item) =>
          sum +
          (
            item.quantity -
            sumQuantity(item.batches)
          ),
        0
      );

    const tvorogPlanned =
      tvorogLinks.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    const tvorogUnresolved =
      Math.max(
        0,
        tvorogRequired -
          tvorogPlanned
      );

    console.log(
      `Всего требуется восстановить: ` +
        `${tvorogRequired} шт`
    );

    console.log(
      `Безопасно предлагается восстановить: ` +
        `${tvorogPlanned} шт`
    );

    console.log(
      `Остаётся неподтверждённым: ` +
        `${tvorogUnresolved} шт`
    );

    console.log("");

    if (tvorogUnresolved > 0) {
      console.log(
        "🔴 История Творога НЕ позволяет " +
          "безопасно восстановить все отсутствующие связи."
      );

      console.log(
        "⚠️ В БД ничего менять нельзя до отдельного " +
          "разбора исторической ёмкости партий."
      );

      console.log("");
    }

    for (const link of tvorogLinks) {
      console.log(
        `Order #${link.orderId}, ` +
          `OrderItem #${link.orderItemId} → ` +
          `Batch #${link.batchId}: ` +
          `${link.quantity} шт × ` +
          `${money(link.purchaseCost)}`
      );

      console.log(
        `  ${link.reason}`
      );
    }

    console.log("");
  }

  /**
   * ==========================================================
   * ФИНАЛЬНАЯ ПРОВЕРКА
   * ==========================================================
   */

  console.log("========================================");
  console.log("🔍 ФИНАЛЬНАЯ ПРОВЕРКА");
  console.log("========================================");
  console.log("");

  /**
   * Проверяем каждый OrderItem:
   *
   * существующие OrderBatch
   * +
   * запланированные OrderBatch
   *
   * не должны превышать item.quantity.
   */

  let finalPlanProblems = 0;

  for (const product of products) {
    for (const item of product.orderItems) {
      const existing =
        sumQuantity(item.batches);

      const planned =
        plannedLinks
          .filter(
            (link) =>
              link.orderItemId ===
              item.id
          )
          .reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          );

      const total =
        existing + planned;

      if (total > item.quantity) {
        finalPlanProblems++;

        console.log(
          `🔴 OrderItem #${item.id}: ` +
            `существует ${existing}, ` +
            `планируется ${planned}, ` +
            `продано ${item.quantity}`
        );
      }
    }
  }

  if (finalPlanProblems === 0) {
    console.log(
      "✅ Ни один OrderItem не превышает своё количество."
    );
  } else {
    addProblem(
      `Финальный план содержит ${finalPlanProblems} ` +
        `перераспределений`
    );
  }

  console.log("");

  /**
   * ==========================================================
   * БЕЗОПАСНОСТЬ
   * ==========================================================
   */

  console.log("========================================");
  console.log("🛡️ БЕЗОПАСНОСТЬ");
  console.log("========================================");
  console.log("");

  console.log(
    "✅ OrderBatch НЕ создавались"
  );

  console.log(
    "✅ ReturnBatch НЕ создавались"
  );

  console.log(
    "✅ Batch НЕ изменялись"
  );

  console.log(
    "✅ Product.stock НЕ изменялся"
  );

  console.log(
    "✅ OrderItem НЕ изменялись"
  );

  console.log(
    "✅ Order НЕ изменялись"
  );

  console.log("");
  console.log(
    "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ"
  );

  /**
   * ==========================================================
   * ИТОГ
   * ==========================================================
   */

  console.log("");
  console.log("========================================");
  console.log("📊 ИТОГ СТРОГОГО DRY-RUN");
  console.log("========================================");
  console.log("");

  console.log(
    `🔴 Проблем: ${problemCount}`
  );

  console.log(
    `🟡 Предупреждений: ${warningCount}`
  );

  console.log(
    `⚠️ Проблемных OrderItem: ${problematicOrderItemCount}`
  );

  console.log(
    `🟢 Кандидатов OrderBatch: ${candidateCount}`
  );

  console.log(
    `📦 Количество в кандидатах: ${candidateQuantity} шт`
  );

  console.log(
    `🟢 Безопасно распределено: ${safelyPlannedQuantity} шт`
  );

  console.log(
    `🔴 Осталось нераспределено: ${unresolvedQuantity} шт`
  );

  console.log("");

  if (unresolvedQuantity > 0) {
    console.log(
      "⛔ ВОССТАНОВЛЕНИЕ ВСЕЙ ИСТОРИИ НЕ МОЖЕТ БЫТЬ " +
        "ПРОИЗВЕДЕНО АВТОМАТИЧЕСКИ."
    );

    console.log(
      "⛔ Сначала необходимо разобраться с " +
        "нераспределёнными продажами."
    );
  } else if (problemCount === 0) {
    console.log(
      "🟢 Все найденные отсутствующие связи имеют " +
        "безопасный кандидат."
    );
  }

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "🏁 DRY-RUN ЗАВЕРШЁН"
  );

  console.log(
    "========================================"
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ ОШИБКА:");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });