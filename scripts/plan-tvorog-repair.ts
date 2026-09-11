import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

function money(value: number) {
  return `${value} ₽`;
}

function formatDate(date: Date) {
  return date.toISOString();
}

function separator() {
  console.log("----------------------------------------");
}

type SupplyState = {
  id: number;
  supplyId: number;
  quantity: number;
  remaining: number;
  cost: number;
  date: Date;
};

type PlannedLink = {
  orderId: number;
  orderItemId: number;
  batchId: number | null;
  quantity: number;
  purchaseCost: number | null;
  reason: string;
  status: "SAFE" | "UNRESOLVED" | "REVIEW";
};

async function main() {
  console.log("");
  console.log("========================================");
  console.log("🧀 ТВОРОГ — ПЛАН ВОССТАНОВЛЕНИЯ ORDERBATCH");
  console.log("========================================");
  console.log("");
  console.log("⚠️ STRICT READ ONLY");
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
            expiryDate: "asc",
          },
          {
            receivedAt: "asc",
          },
          {
            id: "asc",
          },
        ],
      },
      orderItems: {
        include: {
          order: true,
          batches: true,
          ReturnBatch: true,
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
      },
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Товар: #${product.id} ${product.name}`);
  console.log(`Product.stock: ${product.stock}`);

  /*
   * ========================================================
   * 1. SUPPLY ITEMS
   * ========================================================
   */

  separator();
  console.log("🚚 ПОСТАВКИ");
  separator();

  const supplies = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
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

  const supplyStates: SupplyState[] = supplies.map((item) => ({
    id: item.id,
    supplyId: item.supplyId,
    quantity: item.quantity,
    remaining: item.quantity,
    cost: item.cost,
    date: item.supply.date,
  }));

  for (const supply of supplyStates) {
    console.log(
      `SupplyItem #${supply.id} | ` +
        `Supply #${supply.supplyId} | ` +
        `${formatDate(supply.date)} | ` +
        `+${supply.quantity} шт × ${money(supply.cost)}`
    );
  }

  console.log("");
  console.log(
    `ИТОГО ПОСТАВЛЕНО: ${
      supplyStates.reduce((sum, item) => sum + item.quantity, 0)
    } шт`
  );

  /*
   * ========================================================
   * 2. BATCHES
   * ========================================================
   */

  separator();
  console.log("📦 BATCH");
  separator();

  for (const batch of product.batches) {
    const sold = batch.quantity;

    const nearest = supplyStates
      .map((supply) => ({
        supply,
        distance: Math.abs(
          supply.date.getTime() -
            batch.receivedAt.getTime()
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    console.log("");
    console.log(`Batch #${batch.id}`);
    console.log(`  current: ${batch.quantity}`);
    console.log(`  cost: ${money(batch.purchaseCost)}`);
    console.log(`  received: ${formatDate(batch.receivedAt)}`);
    console.log(`  expiry: ${formatDate(batch.expiryDate)}`);
    console.log(`  status: ${batch.status}`);
    console.log(`  OrderBatch quantity: ${sold}`);

    if (nearest) {
      console.log(
        `  nearest SupplyItem: #${nearest.supply.id} ` +
          `Δ=${(
            nearest.distance /
            3600000
          ).toFixed(3)} ч`
      );
      console.log(
        `  nearest cost: ${money(nearest.supply.cost)}`
      );
    }
  }

  /*
   * ========================================================
   * 3. ВСПОМОГАТЕЛЬНАЯ КАРТА BATCH → SUPPLY
   *
   * Мы НЕ создаём связь в БД.
   *
   * Используем только временное соответствие:
   * ближайшая поставка по receivedAt.
   * ========================================================
   */

  const batchToSupply = new Map<number, SupplyState>();

  for (const batch of product.batches) {
    const nearest = supplyStates
      .map((supply) => ({
        supply,
        distance: Math.abs(
          supply.date.getTime() -
            batch.receivedAt.getTime()
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearest) {
      batchToSupply.set(batch.id, nearest.supply);
    }
  }

  /*
   * ========================================================
   * 4. ИСТОРИЧЕСКИЙ FIFO ПО SUPPLY
   *
   * Отдельная виртуальная копия.
   * ========================================================
   */

  const historicalSupplies: SupplyState[] =
    supplyStates.map((item) => ({
      ...item,
    }));

  const historicalByOrderItem =
    new Map<number, PlannedLink[]>();

  console.log("");
  separator();
  console.log("🧮 ИСТОРИЧЕСКИЙ FIFO");
  separator();

  for (const item of product.orderItems) {
    let remaining = item.quantity;

    const links: PlannedLink[] = [];

    console.log("");
    console.log(
      `Order #${item.orderId}, ` +
        `OrderItem #${item.id}: ` +
        `${item.quantity} шт`
    );

    for (const supply of historicalSupplies) {
      if (remaining <= 0) {
        break;
      }

      if (
        supply.date.getTime() >
        item.order.date.getTime()
      ) {
        continue;
      }

      if (supply.remaining <= 0) {
        continue;
      }

      const take = Math.min(
        supply.remaining,
        remaining
      );

      supply.remaining -= take;
      remaining -= take;

      links.push({
        orderId: item.orderId,
        orderItemId: item.id,
        batchId: null,
        quantity: take,
        purchaseCost: supply.cost,
        reason:
          `FIFO SupplyItem #${supply.id}`,
        status: "SAFE",
      });

      console.log(
        `  → SupplyItem #${supply.id}: ` +
          `${take} шт × ${money(supply.cost)}`
      );
    }

    if (remaining > 0) {
      links.push({
        orderId: item.orderId,
        orderItemId: item.id,
        batchId: null,
        quantity: remaining,
        purchaseCost: null,
        reason:
          "На дату заказа доступной поставки нет",
        status: "UNRESOLVED",
      });

      console.log(
        `  🔴 НЕ РАСПРЕДЕЛЕНО: ${remaining} шт`
      );
    }

    historicalByOrderItem.set(
      item.id,
      links
    );
  }

  /*
   * ========================================================
   * 5. СРАВНЕНИЕ EXISTING ORDERBATCH
   * ========================================================
   */

  separator();
  console.log("🔎 EXISTING vs PLAN");
  separator();

  const allPlans: PlannedLink[] = [];

  let safeCount = 0;
  let safeQuantity = 0;
  let unresolvedCount = 0;
  let unresolvedQuantity = 0;

  for (const item of product.orderItems) {
    const historical =
      historicalByOrderItem.get(item.id) ?? [];

    const existingQuantity =
      item.batches.reduce(
        (sum, link) =>
          sum + link.quantity,
        0
      );

    const historicalQuantity =
      historical
        .filter(
          (link) =>
            link.status === "SAFE"
        )
        .reduce(
          (sum, link) =>
            sum + link.quantity,
          0
        );

    const unresolvedQuantityForItem =
      historical
        .filter(
          (link) =>
            link.status ===
            "UNRESOLVED"
        )
        .reduce(
          (sum, link) =>
            sum + link.quantity,
          0
        );

    if (
      existingQuantity ===
        item.quantity &&
      unresolvedQuantityForItem === 0
    ) {
      /*
       * Уже полностью покрыто.
       */
      continue;
    }

    console.log("");
    console.log(
      `Order #${item.orderId}, ` +
        `OrderItem #${item.id}`
    );

    console.log(
      `  Продано: ${item.quantity}`
    );

    console.log(
      `  Existing OrderBatch: ${existingQuantity}`
    );

    console.log(
      `  Historical FIFO: ${historicalQuantity}`
    );

    if (
      unresolvedQuantityForItem > 0
    ) {
      console.log(
        `  🔴 Неизвестно: ` +
          `${unresolvedQuantityForItem} шт`
      );
    }

    /*
     * --------------------------------------------------------
     * Случай, когда исторический FIFO
     * невозможен полностью.
     * --------------------------------------------------------
     */

    if (
      unresolvedQuantityForItem > 0
    ) {
      unresolvedCount += 1;
      unresolvedQuantity +=
        unresolvedQuantityForItem;

      for (const plan of historical) {
        allPlans.push(plan);
      }

      continue;
    }

    /*
     * --------------------------------------------------------
     * Исторический FIFO полностью определён.
     * Теперь пытаемся сопоставить его с Batch.
     * --------------------------------------------------------
     */

    const batchPlans: PlannedLink[] = [];

    for (const plan of historical) {
      if (
        plan.status !== "SAFE"
      ) {
        continue;
      }

      const supply = supplyStates.find(
        (s) =>
          plan.reason ===
          `FIFO SupplyItem #${s.id}`
      );

      if (!supply) {
        batchPlans.push({
          ...plan,
          status: "REVIEW",
          reason:
            "SupplyItem не найден",
        });

        continue;
      }

      const candidateBatches =
        product.batches
          .filter((batch) => {
            const mapped =
              batchToSupply.get(
                batch.id
              );

            if (!mapped) {
              return false;
            }

            if (
              mapped.id !==
              supply.id
            ) {
              return false;
            }

            /*
             * Партия должна существовать
             * на момент продажи.
             */
            if (
              batch.receivedAt.getTime() >
              item.order.date.getTime()
            ) {
              return false;
            }

            return true;
          })
          .sort((a, b) => {
            const expiry =
              a.expiryDate.getTime() -
              b.expiryDate.getTime();

            if (expiry !== 0) {
              return expiry;
            }

            return a.id - b.id;
          });

      if (
        candidateBatches.length === 1
      ) {
        const batch =
          candidateBatches[0];

        batchPlans.push({
          ...plan,
          batchId: batch.id,
          status: "SAFE",
          reason:
            `SupplyItem #${supply.id} → Batch #${batch.id}`,
        });

        continue;
      }

      if (
        candidateBatches.length > 1
      ) {
        batchPlans.push({
          ...plan,
          batchId:
            candidateBatches[0].id,
          status: "REVIEW",
          reason:
            `Несколько возможных Batch для SupplyItem #${supply.id}`,
        });

        continue;
      }

      /*
       * Supply исторически известен,
       * но соответствующего Batch,
       * существующего на дату продажи,
       * нет.
       */
      batchPlans.push({
        ...plan,
        batchId: null,
        status: "REVIEW",
        reason:
          `SupplyItem #${supply.id} определён, ` +
          `но подходящего исторического Batch нет`,
      });
    }

    for (const plan of batchPlans) {
      allPlans.push(plan);

      if (
        plan.status === "SAFE"
      ) {
        safeCount += 1;
        safeQuantity +=
          plan.quantity;
      } else {
        unresolvedCount += 1;
        unresolvedQuantity +=
          plan.quantity;
      }
    }

    /*
     * --------------------------------------------------------
     * Показываем существующие связи.
     * --------------------------------------------------------
     */

    if (item.batches.length > 0) {
      console.log("");
      console.log(
        "  Сейчас:"
      );

      for (const link of item.batches) {
        console.log(
          `    Batch #${link.batchId}: ` +
            `${link.quantity} шт × ` +
            `${money(link.purchaseCost)}`
        );
      }
    }

    console.log("");
    console.log(
      "  План:"
    );

    for (const plan of batchPlans) {
      const icon =
        plan.status === "SAFE"
          ? "🟢"
          : "🟡";

      console.log(
        `    ${icon} ` +
          `Batch #${plan.batchId ?? "?"}: ` +
          `${plan.quantity} шт` +
          (plan.purchaseCost !== null
            ? ` × ${money(plan.purchaseCost)}`
            : "") +
          ` — ${plan.reason}`
      );
    }
  }

  /*
   * ========================================================
   * 6. ИТОГ
   * ========================================================
   */

  separator();
  console.log("🏁 ИТОГ ПЛАНА");
  separator();

  const plannedQuantity =
    allPlans.reduce(
      (sum, plan) =>
        sum + plan.quantity,
      0
    );

  console.log(
    `Всего планируемого количества: ${plannedQuantity} шт`
  );

  console.log(
    `🟢 Безопасных связей: ${safeCount}`
  );

  console.log(
    `🟢 Безопасное количество: ${safeQuantity} шт`
  );

  console.log(
    `🔴 Неразрешённых/требующих проверки связей: ${unresolvedCount}`
  );

  console.log(
    `🔴 Неразрешённое количество: ${unresolvedQuantity} шт`
  );

  /*
   * ========================================================
   * 7. ОСОБАЯ ПРОВЕРКА RETURNBATCH
   * ========================================================
   */

  separator();
  console.log("↩️ RETURNBATCH");
  separator();

  for (const item of product.orderItems) {
    if (
      item.ReturnBatch.length === 0
    ) {
      continue;
    }

    console.log("");
    console.log(
      `Order #${item.orderId}, ` +
        `OrderItem #${item.id}`
    );

    for (const ret of item.ReturnBatch) {
      const batch =
        product.batches.find(
          (b) =>
            b.id ===
            ret.batchId
        );

      const historical =
        historicalByOrderItem.get(
          item.id
        ) ?? [];

      const historicalQty =
        historical
          .filter(
            (link) =>
              link.status === "SAFE"
          )
          .reduce(
            (sum, link) =>
              sum + link.quantity,
            0
          );

      console.log(
        `  ReturnBatch #${ret.id}: ` +
          `Batch #${ret.batchId}, ` +
          `${ret.quantity} шт`
      );

      console.log(
        `    Batch существует: ${
          batch ? "ДА" : "НЕТ"
        }`
      );

      console.log(
        `    Исторически продано ` +
          `по OrderItem: ${historicalQty} шт`
      );

      if (!batch) {
        console.log(
          "    🔴 Нельзя безопасно восстановить"
        );
      } else {
        console.log(
          "    🟡 Требуется сохранить существующий ReturnBatch"
        );
      }
    }
  }

  /*
   * ========================================================
   * 8. НИКАКИХ WRITE ОПЕРАЦИЙ
   * ========================================================
   */

  console.log("");
  separator();
  console.log("🛡️ БЕЗОПАСНОСТЬ");
  separator();

  console.log(
    "Ни один объект БД не изменён."
  );
  console.log(
    "Ни один OrderBatch не создан."
  );
  console.log(
    "Ни один OrderBatch не удалён."
  );
  console.log(
    "Ни один Batch не изменён."
  );
  console.log(
    "Ни один ReturnBatch не изменён."
  );
  console.log(
    "Product.stock не изменён."
  );
  console.log(
    "Movement не изменён."
  );

  console.log("");
  console.log(
    "✅ ПЛАН ВОССТАНОВЛЕНИЯ ПОСТРОЕН"
  );
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