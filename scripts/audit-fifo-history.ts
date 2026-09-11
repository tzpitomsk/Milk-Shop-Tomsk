import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("========================================");
  console.log("🔎 АУДИТ FIFO ИСТОРИИ ПАРТИЙ");
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

  for (const product of products) {
    console.log("========================================");
    console.log(`🥛 ТОВАР #${product.id}: ${product.name}`);
    console.log("========================================");
    console.log();

    if (product.batches.length === 0) {
      console.log("❌ У товара нет Batch");
      console.log();
      continue;
    }

    // ==========================================================
    // BATCHES
    // ==========================================================

    console.log("📦 ПАРТИИ");
    console.log();

    for (const batch of product.batches) {
      console.log("----------------------------------------");

      console.log(
        `Batch #${batch.id}`
      );

      console.log(
        `  quantity сейчас: ${batch.quantity}`
      );

      console.log(
        `  purchaseCost: ${batch.purchaseCost} ₽`
      );

      console.log(
        `  receivedAt: ${batch.receivedAt.toISOString()}`
      );

      console.log(
        `  expiryDate: ${batch.expiryDate.toISOString()}`
      );

      console.log(
        `  status: ${batch.status}`
      );

      const orderBatchLinks = product.orderItems.flatMap(
        (item) =>
          item.batches
            .filter((ob) => ob.batchId === batch.id)
            .map((ob) => ({
              orderId: item.orderId,
              orderItemId: item.id,
              orderDate: item.order.date,
              quantity: ob.quantity,
              purchaseCost: ob.purchaseCost,
            }))
      );

      const returnBatchLinks = product.orderItems.flatMap(
        (item) =>
          item.ReturnBatch
            .filter((rb) => rb.batchId === batch.id)
            .map((rb) => ({
              orderId: item.orderId,
              orderItemId: item.id,
              orderDate: item.order.date,
              quantity: rb.quantity,
            }))
      );

      const soldFromBatch = orderBatchLinks.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      const returnedToBatch = returnBatchLinks.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      const netSoldFromBatch =
        soldFromBatch - returnedToBatch;

      console.log();

      console.log(
        `  🛒 Продано через OrderBatch: ${soldFromBatch}`
      );

      console.log(
        `  ↩ Возвращено через ReturnBatch: ${returnedToBatch}`
      );

      console.log(
        `  📉 Реально ушло из партии: ${netSoldFromBatch}`
      );

      console.log();

      if (orderBatchLinks.length === 0) {
        console.log(
          "  ⚠️ OrderBatch для этой партии отсутствуют"
        );
      } else {
        console.log("  🔗 ORDERBATCH:");

        for (const link of orderBatchLinks) {
          console.log(
            `    Order #${link.orderId}, ` +
              `OrderItem #${link.orderItemId}, ` +
              `date=${link.orderDate.toISOString()}, ` +
              `quantity=${link.quantity}, ` +
              `cost=${link.purchaseCost}`
          );
        }
      }

      console.log();

      if (returnBatchLinks.length === 0) {
        console.log(
          "  ↩ ReturnBatch для этой партии отсутствуют"
        );
      } else {
        console.log("  ↩ RETURNBATCH:");

        for (const link of returnBatchLinks) {
          console.log(
            `    Order #${link.orderId}, ` +
              `OrderItem #${link.orderItemId}, ` +
              `date=${link.orderDate.toISOString()}, ` +
              `quantity=${link.quantity}`
          );
        }
      }

      console.log();
    }

    // ==========================================================
    // ORDERS
    // ==========================================================

    console.log("========================================");
    console.log("🛒 ИСТОРИЯ ПРОДАЖ");
    console.log("========================================");
    console.log();

    if (product.orderItems.length === 0) {
      console.log("Продаж нет");
      console.log();
      continue;
    }

    for (const item of product.orderItems) {
      console.log("----------------------------------------");

      console.log(
        `Order #${item.orderId} / OrderItem #${item.id}`
      );

      console.log(
        `  дата: ${item.order.date.toISOString()}`
      );

      console.log(
        `  статус: ${item.order.status}`
      );

      console.log(
        `  продано: ${item.quantity}`
      );

      console.log(
        `  возвращено: ${item.returned}`
      );

      console.log(
        `  реально осталось: ${item.quantity - item.returned}`
      );

      console.log();

      if (item.batches.length === 0) {
        console.log(
          "  ❌ OrderBatch отсутствует"
        );
      } else {
        console.log("  🔗 OrderBatch:");

        for (const ob of item.batches) {
          console.log(
            `    Batch #${ob.batchId}: ` +
              `${ob.quantity} шт × ${ob.purchaseCost} ₽`
          );
        }
      }

      console.log();

      if (item.ReturnBatch.length === 0) {
        console.log(
          "  ↩ ReturnBatch отсутствует"
        );
      } else {
        console.log("  ↩ ReturnBatch:");

        for (const rb of item.ReturnBatch) {
          console.log(
            `    Batch #${rb.batchId}: ` +
              `+${rb.quantity} шт`
          );
        }
      }

      console.log();
    }

    // ==========================================================
    // FIFO SIMULATION
    // ==========================================================

    console.log("========================================");
    console.log("🔄 FIFO СИМУЛЯЦИЯ");
    console.log("========================================");
    console.log();

    const batches = product.batches
      .map((batch) => ({
        id: batch.id,
        quantity: batch.quantity,
        purchaseCost: batch.purchaseCost,
        receivedAt: batch.receivedAt,
        expiryDate: batch.expiryDate,
      }))
      .sort((a, b) => {
        const expiryCompare =
          a.expiryDate.getTime() -
          b.expiryDate.getTime();

        if (expiryCompare !== 0) {
          return expiryCompare;
        }

        const receivedCompare =
          a.receivedAt.getTime() -
          b.receivedAt.getTime();

        if (receivedCompare !== 0) {
          return receivedCompare;
        }

        return a.id - b.id;
      });

    const orders = [...product.orderItems].sort(
      (a, b) =>
        a.order.date.getTime() -
        b.order.date.getTime()
    );

    const virtualStock = batches.map((batch) => ({
      ...batch,
      remaining: batch.quantity,
    }));

    for (const item of orders) {
      const needed = item.quantity;

      console.log("----------------------------------------");

      console.log(
        `Order #${item.orderId}, ` +
          `OrderItem #${item.id}`
      );

      console.log(
        `Дата: ${item.order.date.toISOString()}`
      );

      console.log(
        `Продажа: ${item.quantity}`
      );

      console.log(
        `Возврат: ${item.returned}`
      );

      if (needed <= 0) {
        console.log(
          "  Нечего распределять"
        );
        continue;
      }

      let remaining = needed;

      for (const batch of virtualStock) {
        if (remaining <= 0) {
          break;
        }

        if (batch.remaining <= 0) {
          continue;
        }

        const take = Math.min(
          remaining,
          batch.remaining
        );

        console.log(
          `  → Batch #${batch.id}: ` +
            `${take} шт × ${batch.purchaseCost} ₽`
        );

        batch.remaining -= take;
        remaining -= take;
      }

      if (remaining > 0) {
        console.log(
          `  🔴 Невозможно распределить ` +
            `ещё ${remaining} шт`
        );
      } else {
        console.log(
          "  🟢 Продажа полностью распределяется по FIFO"
        );
      }
    }

    console.log();

    console.log("📊 ОСТАТОК ПОСЛЕ FIFO-СИМУЛЯЦИИ");
    console.log();

    for (const batch of virtualStock) {
      console.log(
        `  Batch #${batch.id}: ` +
          `виртуальный остаток=${batch.remaining}, ` +
          `фактический=${batch.quantity}`
      );
    }

    console.log();
  }

  console.log("========================================");
  console.log("🛡️ АУДИТ ЗАВЕРШЁН");
  console.log("========================================");
  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ");
}

main()
  .catch((error) => {
    console.error();
    console.error("❌ ОШИБКА АУДИТА:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });