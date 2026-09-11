import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type RepairPlan = {
  orderId: number;
  orderItemId: number;
  productName: string;
  batchId: number;
  quantity: number;
};

/**
 * Только 9 полностью безопасных и однозначно подтверждённых восстановлений.
 *
 * Order #26 / OrderItem #38 намеренно НЕ включён,
 * потому что возврат 2 шт. невозможно однозначно распределить
 * между Batch #1, #2 и #16.
 */
const REPAIR_PLAN: RepairPlan[] = [
  {
    orderId: 15,
    orderItemId: 19,
    productName: "Молоко",
    batchId: 7,
    quantity: 1,
  },
  {
    orderId: 33,
    orderItemId: 45,
    productName: "Молоко",
    batchId: 16,
    quantity: 1,
  },
  {
    orderId: 36,
    orderItemId: 48,
    productName: "Молоко",
    batchId: 16,
    quantity: 4,
  },
  {
    orderId: 37,
    orderItemId: 49,
    productName: "Молоко",
    batchId: 16,
    quantity: 2,
  },
  {
    orderId: 38,
    orderItemId: 50,
    productName: "Молоко",
    batchId: 16,
    quantity: 2,
  },
  {
    orderId: 44,
    orderItemId: 56,
    productName: "Молоко",
    batchId: 16,
    quantity: 2,
  },
  {
    orderId: 45,
    orderItemId: 57,
    productName: "Молоко",
    batchId: 16,
    quantity: 1,
  },
  {
    orderId: 46,
    orderItemId: 58,
    productName: "Молоко",
    batchId: 16,
    quantity: 1,
  },
  {
    orderId: 47,
    orderItemId: 59,
    productName: "Молоко",
    batchId: 16,
    quantity: 1,
  },
];

async function main() {
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("  APPLY SAFE RETURNBATCH REPAIR");
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("⚠️  APPLY MODE");
  console.log("");
  console.log("Будут созданы только заранее подтверждённые ReturnBatch записи.");
  console.log("");
  console.log(`Планируемых операций: ${REPAIR_PLAN.length}`);
  console.log("");

  let createdCount = 0;
  let skippedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const plan of REPAIR_PLAN) {
      console.log("----------------------------------------------------------------------");
      console.log("");
      console.log(
        `Order #${plan.orderId} | OrderItem #${plan.orderItemId} | "${plan.productName}"`
      );
      console.log("");

      /**
       * 1. Проверяем OrderItem.
       */
      const orderItem = await tx.orderItem.findUnique({
        where: {
          id: plan.orderItemId,
        },
        include: {
          order: true,
          product: true,
          batches: {
            include: {
              batch: true,
            },
          },
          ReturnBatch: true,
        },
      });

      if (!orderItem) {
        throw new Error(
          `OrderItem #${plan.orderItemId} не найден. Транзакция отменена.`
        );
      }

      if (orderItem.orderId !== plan.orderId) {
        throw new Error(
          `OrderItem #${plan.orderItemId} принадлежит Order #${orderItem.orderId}, ` +
            `ожидался Order #${plan.orderId}. Транзакция отменена.`
        );
      }

      if (orderItem.product.name !== plan.productName) {
        throw new Error(
          `OrderItem #${plan.orderItemId} имеет продукт "${orderItem.product.name}", ` +
            `ожидался "${plan.productName}". Транзакция отменена.`
        );
      }

      console.log(`Sold quantity: ${orderItem.quantity}`);
      console.log(`OrderItem.returned: ${orderItem.returned}`);

      /**
       * 2. Считаем уже существующие ReturnBatch.
       */
      const existingReturnedTotal = orderItem.ReturnBatch.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      console.log(`Existing ReturnBatch total: ${existingReturnedTotal}`);

      /**
       * 3. Проверяем, что состояние соответствует ожидаемому.
       *
       * После создания ReturnBatch:
       *
       * existingReturnedTotal + plan.quantity
       *
       * должно точно совпадать с OrderItem.returned.
       */
      const expectedReturnedAfterRepair =
        existingReturnedTotal + plan.quantity;

      if (expectedReturnedAfterRepair !== orderItem.returned) {
        throw new Error(
          `OrderItem #${plan.orderItemId}: ` +
            `после ремонта ReturnBatch total будет ${expectedReturnedAfterRepair}, ` +
            `но OrderItem.returned = ${orderItem.returned}. ` +
            `Транзакция отменена.`
        );
      }

      /**
       * 4. Проверяем наличие исходного OrderBatch.
       */
      const orderBatch = orderItem.batches.find(
        (item) => item.batchId === plan.batchId
      );

      if (!orderBatch) {
        throw new Error(
          `OrderItem #${plan.orderItemId}: нет OrderBatch для Batch #${plan.batchId}. ` +
            `Транзакция отменена.`
        );
      }

      console.log("");
      console.log(
        `Original OrderBatch → Batch #${plan.batchId} | sold=${orderBatch.quantity}`
      );

      /**
       * 5. Проверяем, сколько уже возвращено именно в этот Batch.
       */
      const alreadyReturnedForBatch = orderItem.ReturnBatch.filter(
        (item) => item.batchId === plan.batchId
      ).reduce((sum, item) => sum + item.quantity, 0);

      const availableForReturn =
        orderBatch.quantity - alreadyReturnedForBatch;

      console.log(
        `Already returned for Batch #${plan.batchId}: ${alreadyReturnedForBatch}`
      );

      console.log(
        `Available sold quantity for return: ${availableForReturn}`
      );

      /**
       * 6. Нельзя вернуть больше, чем было продано из конкретного Batch.
       */
      if (plan.quantity > availableForReturn) {
        throw new Error(
          `OrderItem #${plan.orderItemId}: попытка создать возврат ${plan.quantity} ` +
            `из Batch #${plan.batchId}, но доступно только ${availableForReturn}. ` +
            `Транзакция отменена.`
        );
      }

      /**
       * 7. Проверяем Batch.
       */
      const batch = await tx.batch.findUnique({
        where: {
          id: plan.batchId,
        },
        include: {
          product: true,
        },
      });

      if (!batch) {
        throw new Error(
          `Batch #${plan.batchId} не найден. Транзакция отменена.`
        );
      }

      if (batch.productId !== orderItem.productId) {
        throw new Error(
          `Batch #${plan.batchId} принадлежит другому продукту. ` +
            `Транзакция отменена.`
        );
      }

      /**
       * 8. Защита от случайного повторного запуска.
       *
       * Если ReturnBatch уже существует и всё уже соответствует,
       * запись пропускаем.
       */
      if (existingReturnedTotal === orderItem.returned) {
        console.log("");
        console.log(
          "🟡 SKIPPED — ReturnBatch уже соответствует OrderItem.returned"
        );

        skippedCount++;
        continue;
      }

      /**
       * 9. Создаём только ReturnBatch.
       *
       * ВАЖНО:
       * - Product.stock НЕ изменяется
       * - Batch.quantity НЕ изменяется
       * - Movement НЕ создаётся
       * - OrderItem.returned НЕ изменяется
       *
       * Скрипт только восстанавливает отсутствующую историческую связь.
       */
      await tx.returnBatch.create({
        data: {
          quantity: plan.quantity,
          orderItemId: plan.orderItemId,
          batchId: plan.batchId,
        },
      });

      console.log("");
      console.log(
        `🟢 CREATED ReturnBatch → Batch #${plan.batchId} | quantity=${plan.quantity}`
      );

      createdCount++;
    }
  });

  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("  REPAIR COMPLETE");
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log(`🟢 ReturnBatch records created: ${createdCount}`);
  console.log(`🟡 Already repaired / skipped: ${skippedCount}`);
  console.log("");
  console.log("🔒 Order #26 / OrderItem #38 intentionally NOT modified.");
  console.log("");
  console.log("NO Product.stock records were changed.");
  console.log("NO Batch.quantity records were changed.");
  console.log("NO Movement records were changed.");
  console.log("NO OrderItem.returned values were changed.");
  console.log("");
  console.log("======================================================================");
}

main()
  .catch((error) => {
    console.error("");
    console.error("======================================================================");
    console.error("");
    console.error("❌ REPAIR FAILED");
    console.error("");
    console.error("======================================================================");
    console.error("");
    console.error(error);
    console.error("");
    console.error(
      "Транзакция была отменена. Частично созданных записей быть не должно."
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });