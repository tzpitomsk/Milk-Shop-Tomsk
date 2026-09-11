import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type VirtualBatch = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: Date;
  expiryDate: Date;
};

async function main() {
  console.log("🚀 Перестройка FIFO начата...\n");

  /*
   * ВАЖНО:
   *
   * Batch.quantity — это ТЕКУЩИЙ остаток.
   * Для восстановления исторического FIFO нам нужно
   * первоначальное количество партии.
   *
   * Первоначальное количество берем из SupplyItem.
   */

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
        },
      },
    },
  });

  /*
   * Удаляем только историческое FIFO-распределение.
   *
   * ReturnBatch НЕ трогаем.
   */
  await prisma.orderBatch.deleteMany();

  console.log("🧹 Старые OrderBatch удалены\n");

  for (const product of products) {
    console.log("========================================");
    console.log(`🥛 ${product.name}`);
    console.log("========================================");

    /*
     * ------------------------------------------------------
     * 1. Собираем первоначальные количества поставок
     * ------------------------------------------------------
     */

    const supplies = product.supplyItems.map((item) => ({
      supplyItemId: item.id,
      quantity: item.quantity,
      purchaseCost: item.cost,
      date: item.supply.date,
    }));

    console.log(
      `📦 Поставок: ${supplies.length}`
    );

    /*
     * ------------------------------------------------------
     * 2. Сопоставляем SupplyItem с Batch
     *
     * В момент создания поставки Batch создается примерно
     * в то же время, что и Supply.
     *
     * Для восстановления используем хронологический порядок.
     * ------------------------------------------------------
     */

    const batches: VirtualBatch[] = [];

    const usedBatchIds = new Set<number>();

    for (const supply of supplies) {
      const availableBatches = product.batches.filter(
        (batch) => !usedBatchIds.has(batch.id)
      );

      if (availableBatches.length === 0) {
        console.log(
          `⚠️ Для поставки #${supply.supplyItemId} не найдена партия`
        );

        continue;
      }

      /*
       * Берем ближайшую по времени еще не использованную партию.
       */

      availableBatches.sort((a, b) => {
        const diffA = Math.abs(
          a.receivedAt.getTime() -
            supply.date.getTime()
        );

        const diffB = Math.abs(
          b.receivedAt.getTime() -
            supply.date.getTime()
        );

        if (diffA !== diffB) {
          return diffA - diffB;
        }

        return a.id - b.id;
      });

      const batch = availableBatches[0];

      usedBatchIds.add(batch.id);

      batches.push({
        id: batch.id,

        /*
         * ВОТ ГЛАВНОЕ ИЗМЕНЕНИЕ:
         *
         * quantity берется из SupplyItem,
         * а НЕ из Batch.quantity.
         */
        quantity: supply.quantity,

        /*
         * Цена также берем из SupplyItem,
         * потому что у старых Batch она иногда = 0.
         */
        purchaseCost: supply.purchaseCost,

        receivedAt: batch.receivedAt,

        expiryDate: batch.expiryDate,
      });

      console.log(
        `  поставка #${supply.supplyItemId} → партия #${batch.id}: ` +
          `${supply.quantity} шт × ${supply.purchaseCost} ₽`
      );
    }

    /*
     * ------------------------------------------------------
     * 3. Сортируем партии для FIFO
     *
     * Сначала партия с более ранним сроком годности.
     * Если срок одинаковый — более ранняя дата получения.
     * Если и она одинаковая — меньший ID.
     * ------------------------------------------------------
     */

    batches.sort((a, b) => {
      const expiryDiff =
        a.expiryDate.getTime() -
        b.expiryDate.getTime();

      if (expiryDiff !== 0) {
        return expiryDiff;
      }

      const receivedDiff =
        a.receivedAt.getTime() -
        b.receivedAt.getTime();

      if (receivedDiff !== 0) {
        return receivedDiff;
      }

      return a.id - b.id;
    });

    /*
     * ------------------------------------------------------
     * 4. Распределяем продажи
     * ------------------------------------------------------
     */

    for (const item of product.orderItems) {
      /*
       * ВАЖНО:
       *
       * Распределяем ВСЕ проданные товары.
       *
       * Возвраты НЕ вычитаем здесь.
       *
       * Возврат уже хранится отдельно в ReturnBatch.
       */

      let need = item.quantity;

      if (need <= 0) {
        continue;
      }

      console.log(
        `\nЗаказ №${item.orderId}: продано ${item.quantity} шт, ` +
          `возвращено ${item.returned} шт`
      );

      for (const batch of batches) {
        if (need <= 0) {
          break;
        }

        if (batch.quantity <= 0) {
          continue;
        }

        const take = Math.min(
          need,
          batch.quantity
        );

        await prisma.orderBatch.create({
          data: {
            quantity: take,

            purchaseCost:
              batch.purchaseCost,

            orderItemId:
              item.id,

            batchId:
              batch.id,
          },
        });

        batch.quantity -= take;
        need -= take;

        console.log(
          `  ↳ партия №${batch.id}: ` +
            `${take} шт × ${batch.purchaseCost} ₽`
        );
      }

      if (need > 0) {
        console.log(
          `  ⚠️ Не удалось распределить ${need} шт`
        );
      }
    }

    console.log("");
  }

  console.log("========================================");
  console.log("✅ FIFO полностью перестроен");
  console.log("========================================");
}

main()
  .catch((error) => {
    console.error("❌ ОШИБКА FIFO:");
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
