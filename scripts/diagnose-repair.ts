import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ProblemLevel = "🔴" | "🟡";

let criticalProblems = 0;
let warnings = 0;

function report(level: ProblemLevel, message: string) {
  if (level === "🔴") {
    criticalProblems++;
  } else {
    warnings++;
  }

  console.log(`  ${level} ${message}`);
}

async function main() {
  console.log("========================================");
  console.log("🧪 ДИАГНОСТИКА ВОССТАНОВЛЕНИЯ");
  console.log("========================================");
  console.log();
  console.log("⚠️ ТОЛЬКО ДИАГНОСТИКА");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  await prisma.$connect();

  console.log("✅ Prisma работает");
  console.log();

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
      },

      supplyItems: {
        orderBy: {
          id: "asc",
        },
        include: {
          supply: true,
        },
      },

      movements: {
        orderBy: {
          id: "asc",
        },
      },

      orderItems: {
        orderBy: {
          id: "asc",
        },

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
  console.log();

  // ============================================================
  // PRODUCTS
  // ============================================================

  for (const product of products) {
    console.log("========================================");
    console.log(`🥛 ТОВАР #${product.id}: ${product.name}`);
    console.log("========================================");
    console.log();

    // ==========================================================
    // SUPPLIES
    // ==========================================================

    const supplied = product.supplyItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    console.log("🚚 ПОСТАВКИ");
    console.log();

    if (product.supplyItems.length === 0) {
      console.log("  Поставок нет");
    }

    for (const supplyItem of product.supplyItems) {
      console.log(
        `  SupplyItem #${supplyItem.id}: ` +
          `${supplyItem.quantity} шт × ${supplyItem.cost} ₽`
      );

      console.log(
        `    Supply #${supplyItem.supplyId}, ` +
          `date=${supplyItem.supply.date.toISOString()}`
      );
    }

    console.log();
    console.log(`  ИТОГО ПОСТАВЛЕНО: ${supplied} шт`);

    // ==========================================================
    // BATCHES
    // ==========================================================

    console.log();
    console.log("📦 BATCH");
    console.log();

    const batchStock = product.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    if (product.batches.length === 0) {
      report(
        "🔴",
        "У товара отсутствуют Batch"
      );
    }

    for (const batch of product.batches) {
      console.log(
        `  Batch #${batch.id}: ` +
          `quantity=${batch.quantity}, ` +
          `purchaseCost=${batch.purchaseCost}, ` +
          `status=${batch.status}`
      );

      console.log(
        `    receivedAt=${batch.receivedAt.toISOString()}`
      );

      console.log(
        `    expiryDate=${batch.expiryDate.toISOString()}`
      );

      if (batch.quantity < 0) {
        report(
          "🔴",
          `Batch #${batch.id}: отрицательный quantity=${batch.quantity}`
        );
      }

      if (
        batch.quantity > 0 &&
        batch.status === "EMPTY"
      ) {
        report(
          "🔴",
          `Batch #${batch.id}: quantity > 0, но status=EMPTY`
        );
      }

      if (
        batch.quantity === 0 &&
        batch.status === "ACTIVE"
      ) {
        report(
          "🟡",
          `Batch #${batch.id}: ACTIVE при quantity=0`
        );
      }
    }

    console.log();
    console.log(`  ИТОГО В BATCH: ${batchStock} шт`);

    // ==========================================================
    // ORDER ITEMS
    // ==========================================================

    console.log();
    console.log("🛒 ПРОДАЖИ");
    console.log();

    if (product.orderItems.length === 0) {
      console.log("  Продаж нет");
    }

    let productSold = 0;
    let productReturned = 0;

    for (const item of product.orderItems) {
      productSold += item.quantity;
      productReturned += item.returned;

      const orderBatchQuantity = item.batches.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      const returnBatchQuantity = item.ReturnBatch.reduce(
        (sum, link) => sum + link.quantity,
        0
      );

      const remaining =
        item.quantity - item.returned;

      console.log(
        `  Order #${item.orderId}, ` +
          `OrderItem #${item.id}`
      );

      console.log(
        `    status=${item.order.status}`
      );

      console.log(
        `    sold=${item.quantity}, ` +
          `returned=${item.returned}, ` +
          `remaining=${remaining}`
      );

      // --------------------------------------------------------
      // BASIC VALUES
      // --------------------------------------------------------

      if (item.quantity < 0) {
        report(
          "🔴",
          `OrderItem #${item.id}: quantity < 0`
        );
      }

      if (item.returned < 0) {
        report(
          "🔴",
          `OrderItem #${item.id}: returned < 0`
        );
      }

      if (item.returned > item.quantity) {
        report(
          "🔴",
          `OrderItem #${item.id}: returned > quantity`
        );
      }

      // --------------------------------------------------------
      // ORDER BATCH
      // --------------------------------------------------------

      console.log(
        `    OrderBatch quantity=${orderBatchQuantity}`
      );

      if (item.quantity > 0 && item.batches.length === 0) {
        report(
          "🔴",
          `OrderItem #${item.id}: ` +
            `есть продажа ${item.quantity} шт, ` +
            `но OrderBatch отсутствует`
        );
      }

      if (
        item.batches.length > 0 &&
        orderBatchQuantity !== item.quantity
      ) {
        report(
          "🔴",
          `OrderItem #${item.id}: ` +
            `OrderBatch=${orderBatchQuantity}, ` +
            `продано=${item.quantity}`
        );
      }

      for (const orderBatch of item.batches) {
        console.log(
          `      OrderBatch #${orderBatch.id}: ` +
            `Batch #${orderBatch.batchId}, ` +
            `${orderBatch.quantity} шт × ` +
            `${orderBatch.purchaseCost} ₽`
        );

        if (!orderBatch.batch) {
          report(
            "🔴",
            `OrderBatch #${orderBatch.id}: ` +
              `Batch #${orderBatch.batchId} не найден`
          );
        }

        if (orderBatch.quantity <= 0) {
          report(
            "🔴",
            `OrderBatch #${orderBatch.id}: ` +
              `quantity=${orderBatch.quantity}`
          );
        }
      }

      // --------------------------------------------------------
      // RETURN BATCH
      // --------------------------------------------------------

      console.log(
        `    ReturnBatch quantity=${returnBatchQuantity}`
      );

      if (
        item.returned > 0 &&
        item.ReturnBatch.length === 0
      ) {
        report(
          "🔴",
          `OrderItem #${item.id}: ` +
            `returned=${item.returned}, ` +
            `но ReturnBatch отсутствует`
        );
      }

      if (
        item.ReturnBatch.length > 0 &&
        returnBatchQuantity !== item.returned
      ) {
        report(
          "🔴",
          `OrderItem #${item.id}: ` +
            `ReturnBatch=${returnBatchQuantity}, ` +
            `returned=${item.returned}`
        );
      }

      for (const returnBatch of item.ReturnBatch) {
        console.log(
          `      ReturnBatch #${returnBatch.id}: ` +
            `Batch #${returnBatch.batchId}, ` +
            `+${returnBatch.quantity} шт`
        );

        if (!returnBatch.Batch) {
          report(
            "🔴",
            `ReturnBatch #${returnBatch.id}: ` +
              `Batch #${returnBatch.batchId} не найден`
          );
        }

        if (returnBatch.quantity <= 0) {
          report(
            "🔴",
            `ReturnBatch #${returnBatch.id}: ` +
              `quantity=${returnBatch.quantity}`
          );
        }
      }

      // --------------------------------------------------------
      // STATUS
      // --------------------------------------------------------

      if (
        item.returned === 0 &&
        item.order.status !== "COMPLETED"
      ) {
        report(
          "🟡",
          `Order #${item.orderId}: ` +
            `status=${item.order.status}, ` +
            `но returned=0`
        );
      }

      if (
        item.returned > 0 &&
        item.returned < item.quantity &&
        item.order.status !== "PARTIAL_RETURN"
      ) {
        report(
          "🟡",
          `Order #${item.orderId}: ` +
            `частичный возврат, ` +
            `но статус=${item.order.status}`
        );
      }

      if (
        item.returned === item.quantity &&
        item.quantity > 0 &&
        item.order.status !== "RETURNED"
      ) {
        report(
          "🟡",
          `Order #${item.orderId}: ` +
            `полный возврат, ` +
            `но статус=${item.order.status}`
        );
      }

      if (remaining < 0) {
        report(
          "🔴",
          `OrderItem #${item.id}: ` +
            `remaining=${remaining}`
        );
      }

      console.log();
    }

    // ==========================================================
    // PRODUCT BALANCE
    // ==========================================================

    const realSold =
      productSold - productReturned;

    const theoreticalStock =
      supplied - realSold;

    const differenceProduct =
      theoreticalStock - product.stock;

    const differenceBatch =
      theoreticalStock - batchStock;

    console.log("📊 БАЛАНС");
    console.log();

    console.log(
      `  Поставлено:            ${supplied}`
    );

    console.log(
      `  Продано:               ${productSold}`
    );

    console.log(
      `  Возвращено:            ${productReturned}`
    );

    console.log(
      `  Реально продано:       ${realSold}`
    );

    console.log(
      `  Теоретический остаток: ${theoreticalStock}`
    );

    console.log(
      `  Product.stock:         ${product.stock}`
    );

    console.log(
      `  Batch.quantity:        ${batchStock}`
    );

    console.log(
      `  Теория → Product:      ${differenceProduct}`
    );

    console.log(
      `  Теория → Batch:        ${differenceBatch}`
    );

    if (theoreticalStock !== product.stock) {
      report(
        "🔴",
        `Product.stock неверный: ` +
          `ожидалось ${theoreticalStock}, ` +
          `сейчас ${product.stock}`
      );
    } else {
      console.log(
        "  ✅ Product.stock соответствует теории"
      );
    }

    if (theoreticalStock !== batchStock) {
      report(
        "🔴",
        `Batch.quantity неверный: ` +
          `ожидалось ${theoreticalStock}, ` +
          `сейчас ${batchStock}`
      );
    } else {
      console.log(
        "  ✅ Batch.quantity соответствует теории"
      );
    }

    if (product.stock !== batchStock) {
      report(
        "🔴",
        `Product.stock (${product.stock}) ` +
          `!= Batch.quantity (${batchStock})`
      );
    } else {
      console.log(
        "  ✅ Product.stock = Batch.quantity"
      );
    }

    // ==========================================================
    // REPAIR POSSIBILITY
    // ==========================================================

    console.log();
    console.log("🛠️ ВОЗМОЖНОСТЬ ВОССТАНОВЛЕНИЯ");
    console.log();

    const missingOrderBatches =
      product.orderItems.filter(
        (item) =>
          item.quantity > 0 &&
          item.batches.length === 0
      );

    const incompleteOrderBatches =
      product.orderItems.filter((item) => {
        const linked = item.batches.reduce(
          (sum, link) => sum + link.quantity,
          0
        );

        return (
          item.quantity > 0 &&
          linked > 0 &&
          linked < item.quantity
        );
      });

    const missingReturnBatches =
      product.orderItems.filter(
        (item) =>
          item.returned > 0 &&
          item.ReturnBatch.length === 0
      );

    if (missingOrderBatches.length > 0) {
      console.log(
        `  🔴 Продаж без OrderBatch: ` +
          `${missingOrderBatches.length}`
      );

      for (const item of missingOrderBatches) {
        console.log(
          `      Order #${item.orderId}, ` +
            `OrderItem #${item.id}, ` +
            `${item.quantity} шт`
        );
      }
    } else {
      console.log(
        "  ✅ Продаж без OrderBatch не найдено"
      );
    }

    if (incompleteOrderBatches.length > 0) {
      console.log(
        `  🟡 Неполных OrderBatch: ` +
          `${incompleteOrderBatches.length}`
      );

      for (const item of incompleteOrderBatches) {
        const linked = item.batches.reduce(
          (sum, link) => sum + link.quantity,
          0
        );

        console.log(
          `      Order #${item.orderId}, ` +
            `OrderItem #${item.id}: ` +
            `${linked}/${item.quantity} шт`
        );
      }
    } else {
      console.log(
        "  ✅ Неполных OrderBatch не найдено"
      );
    }

    if (missingReturnBatches.length > 0) {
      console.log(
        `  🔴 Возвратов без ReturnBatch: ` +
          `${missingReturnBatches.length}`
      );

      for (const item of missingReturnBatches) {
        console.log(
          `      Order #${item.orderId}, ` +
            `OrderItem #${item.id}: ` +
            `возвращено ${item.returned} шт`
        );
      }
    } else {
      console.log(
        "  ✅ Возвратов без ReturnBatch не найдено"
      );
    }

    // ==========================================================
    // MOVEMENTS
    // ==========================================================

    console.log();
    console.log("📜 ДВИЖЕНИЯ");
    console.log();

    if (product.movements.length === 0) {
      console.log("  Движений нет");
    } else {
      let movementTotal = 0;

      for (const movement of product.movements) {
        movementTotal += movement.quantity;

        console.log(
          `  Movement #${movement.id}: ` +
            `type=${movement.type}, ` +
            `quantity=${movement.quantity}, ` +
            `comment=${movement.comment ?? "-"}`
        );
      }

      console.log();
      console.log(
        `  Сумма quantity движений: ${movementTotal}`
      );
    }

    console.log();
  }

  // ============================================================
  // FINAL
  // ============================================================

  console.log("========================================");
  console.log("🚨 РЕЗУЛЬТАТ ДИАГНОСТИКИ");
  console.log("========================================");
  console.log();

  console.log(
    `🔴 Критических проблем: ${criticalProblems}`
  );

  console.log(
    `🟡 Предупреждений: ${warnings}`
  );

  console.log();

  if (criticalProblems === 0) {
    console.log(
      "🟢 Критических проблем не найдено"
    );
  } else {
    console.log(
      "🔴 Найдены данные для дальнейшего восстановления"
    );
  }

  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ");
  console.log();
  console.log("🛡️ ДИАГНОСТИКА ЗАВЕРШЕНА");
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ ОШИБКА ДИАГНОСТИКИ:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });