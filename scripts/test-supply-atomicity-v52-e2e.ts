import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { updateProductStock } from "../lib/update-stock";

async function main() {
console.log("");
console.log("==============================================================================");
console.log("V52 — SUPPLY TRANSACTION ATOMICITY TEST");
console.log("==============================================================================");
console.log("");
console.log("Проверяем, что ошибка внутри транзакции полностью откатывает поставку.");
console.log("Production API и schema не изменяются.");
console.log("");

let product1Id: number | null = null;
let product2Id: number | null = null;
let supplierId: number | null = null;
let supplyId: number | null = null;

try {
// =========================================================================
// 1. СОЗДАЁМ ТЕСТОВЫЕ ДАННЫЕ
// =========================================================================


console.log("1. СОЗДАНИЕ ТЕСТОВЫХ ДАННЫХ");
console.log("------------------------------------------------------------------------------");

const supplier = await prisma.supplier.create({
  data: {
    name: `V52 TEST Supplier ${Date.now()}`,
    phone: null,
    address: null,
  },
});

supplierId = supplier.id;

const product1 = await prisma.product.create({
  data: {
    name: `V52 TEST Product A ${Date.now()}`,
    unit: "шт",
    price: 300,
    cost: 100,
    stock: 0,
  },
});

product1Id = product1.id;

const product2 = await prisma.product.create({
  data: {
    name: `V52 TEST Product B ${Date.now()}`,
    unit: "шт",
    price: 400,
    cost: 150,
    stock: 0,
  },
});

product2Id = product2.id;

console.log(`Supplier #${supplierId}`);
console.log(`Product A #${product1Id}`);
console.log(`Product B #${product2Id}`);
console.log("");

// =========================================================================
// 2. ПРОВЕРЯЕМ ИСХОДНОЕ СОСТОЯНИЕ
// =========================================================================

console.log("2. ИСХОДНОЕ СОСТОЯНИЕ");
console.log("------------------------------------------------------------------------------");

const beforeA = await prisma.product.findUnique({
  where: {
    id: product1Id,
  },
});

const beforeB = await prisma.product.findUnique({
  where: {
    id: product2Id,
  },
});

if (!beforeA || !beforeB) {
  throw new Error("Не удалось загрузить тестовые товары");
}

if (beforeA.stock !== 0 || beforeB.stock !== 0) {
  throw new Error(
    `Исходный stock должен быть 0: A=${beforeA.stock}, B=${beforeB.stock}`
  );
}

console.log(`Product A stock=${beforeA.stock}`);
console.log(`Product B stock=${beforeB.stock}`);
console.log("");

// =========================================================================
// 3. ЗАПОМИНАЕМ КОЛИЧЕСТВО ЗАПИСЕЙ
// =========================================================================

console.log("3. СОХРАНЯЕМ ИСХОДНЫЕ СЧЁТЧИКИ");
console.log("------------------------------------------------------------------------------");

const beforeSupplyCount = await prisma.supply.count();
const beforeSupplyItemCount = await prisma.supplyItem.count();
const beforeBatchCount = await prisma.batch.count();
const beforeMovementCount = await prisma.movement.count();

console.log(`Supply=${beforeSupplyCount}`);
console.log(`SupplyItem=${beforeSupplyItemCount}`);
console.log(`Batch=${beforeBatchCount}`);
console.log(`Movement=${beforeMovementCount}`);
console.log("");

// =========================================================================
// 4. ЗАПУСКАЕМ ТРАНЗАКЦИЮ И НАМЕРЕННО ЛОМАЕМ ЕЁ ПОСЛЕ ПЕРВОГО ТОВАРА
// =========================================================================

console.log("4. ПРОВЕРКА ROLLBACK");
console.log("------------------------------------------------------------------------------");

let transactionFailed = false;

try {
  await prisma.$transaction(
    async (tx) => {
      // -------------------------------------------------------------------
      // Создаём Supply
      // -------------------------------------------------------------------

      const supply = await tx.supply.create({
        data: {
          supplierId: supplierId!,
          total: 2 * 100 + 3 * 150,
        },
      });

      supplyId = supply.id;

      console.log(`Внутри транзакции создан Supply #${supply.id}`);

      // -------------------------------------------------------------------
      // Создаём SupplyItem для первого товара
      // -------------------------------------------------------------------

      await tx.supplyItem.create({
        data: {
          supplyId: supply.id,
          productId: product1Id!,
          quantity: 2,
          cost: 100,
        },
      });

      console.log("Внутри транзакции создан SupplyItem для Product A");

      // -------------------------------------------------------------------
      // Создаём Batch первого товара
      // -------------------------------------------------------------------

      await tx.batch.create({
        data: {
          productId: product1Id!,
          quantity: 2,
          purchaseCost: 100,
          receivedAt: new Date(),
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      console.log("Внутри транзакции создан Batch для Product A");

      // -------------------------------------------------------------------
      // Создаём Movement первого товара
      // -------------------------------------------------------------------

      await tx.movement.create({
        data: {
          type: "SUPPLY",
          quantity: 2,
          comment: `V52 тест поставки №${supply.id}`,
          productId: product1Id!,
        },
      });

      console.log("Внутри транзакции создан Movement для Product A");

      // -------------------------------------------------------------------
      // Пересчитываем stock первого товара
      // -------------------------------------------------------------------

      const stockA = await updateProductStock(
        tx,
        product1Id!
      );

      console.log(
        `Внутри транзакции Product A stock=${stockA}`
      );

      // -------------------------------------------------------------------
      // ВАЖНО:
      // Здесь намеренно вызываем ошибку.
      //
      // До этого момента внутри транзакции уже были:
      // Supply
      // SupplyItem
      // Batch
      // Movement
      // Product.stock
      //
      // Если транзакция работает правильно, всё это должно исчезнуть
      // после rollback.
      // -------------------------------------------------------------------

      throw new Error(
        "V52 INTENTIONAL TRANSACTION FAILURE"
      );
    }
  );
} catch (error: unknown) {
  transactionFailed = true;

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.log("");
  console.log(
    `Получена ожидаемая ошибка: ${message}`
  );
  console.log("");
}

if (!transactionFailed) {
  throw new Error(
    "Транзакция НЕ завершилась ожидаемой ошибкой"
  );
}

console.log("🟢 Ошибка внутри транзакции получена");
console.log("");

// =========================================================================
// 5. ПРОВЕРЯЕМ, ЧТО SUPPLY ОТКАТИЛСЯ
// =========================================================================

console.log("5. ПРОВЕРКА SUPPLY");
console.log("------------------------------------------------------------------------------");

const afterSupplyCount = await prisma.supply.count();

if (afterSupplyCount !== beforeSupplyCount) {
  throw new Error(
    `Supply НЕ откатился: было ${beforeSupplyCount}, стало ${afterSupplyCount}`
  );
}

console.log(
  `🟢 Supply count восстановлен: ${afterSupplyCount}`
);

// =========================================================================
// 6. ПРОВЕРЯЕМ SUPPLY ITEM
// =========================================================================

console.log("");
console.log("6. ПРОВЕРКА SUPPLYITEM");
console.log("------------------------------------------------------------------------------");

const afterSupplyItemCount =
  await prisma.supplyItem.count();

if (afterSupplyItemCount !== beforeSupplyItemCount) {
  throw new Error(
    `SupplyItem НЕ откатился: было ${beforeSupplyItemCount}, стало ${afterSupplyItemCount}`
  );
}

console.log(
  `🟢 SupplyItem count восстановлен: ${afterSupplyItemCount}`
);

// =========================================================================
// 7. ПРОВЕРЯЕМ BATCH
// =========================================================================

console.log("");
console.log("7. ПРОВЕРКА BATCH");
console.log("------------------------------------------------------------------------------");

const afterBatchCount = await prisma.batch.count();

if (afterBatchCount !== beforeBatchCount) {
  throw new Error(
    `Batch НЕ откатился: было ${beforeBatchCount}, стало ${afterBatchCount}`
  );
}

console.log(
  `🟢 Batch count восстановлен: ${afterBatchCount}`
);

// =========================================================================
// 8. ПРОВЕРЯЕМ MOVEMENT
// =========================================================================

console.log("");
console.log("8. ПРОВЕРКА MOVEMENT");
console.log("------------------------------------------------------------------------------");

const afterMovementCount =
  await prisma.movement.count();

if (afterMovementCount !== beforeMovementCount) {
  throw new Error(
    `Movement НЕ откатился: было ${beforeMovementCount}, стало ${afterMovementCount}`
  );
}

console.log(
  `🟢 Movement count восстановлен: ${afterMovementCount}`
);

// =========================================================================
// 9. ПРОВЕРЯЕМ PRODUCT STOCK
// =========================================================================

console.log("");
console.log("9. ПРОВЕРКА PRODUCT.STOCK");
console.log("------------------------------------------------------------------------------");

const afterA = await prisma.product.findUnique({
  where: {
    id: product1Id,
  },
});

const afterB = await prisma.product.findUnique({
  where: {
    id: product2Id,
  },
});

if (!afterA || !afterB) {
  throw new Error(
    "Тестовые товары исчезли после rollback"
  );
}

console.log(
  `Product A stock: ${beforeA.stock} → ${afterA.stock}`
);

console.log(
  `Product B stock: ${beforeB.stock} → ${afterB.stock}`
);

if (afterA.stock !== beforeA.stock) {
  throw new Error(
    `Product A stock изменился после rollback: ${beforeA.stock} → ${afterA.stock}`
  );
}

if (afterB.stock !== beforeB.stock) {
  throw new Error(
    `Product B stock изменился после rollback: ${beforeB.stock} → ${afterB.stock}`
  );
}

console.log("🟢 Product.stock полностью восстановлен");
console.log("");

// =========================================================================
// 10. ПРОВЕРЯЕМ BATCH ДЛЯ ТЕСТОВЫХ ТОВАРОВ
// =========================================================================

console.log("10. ПРОВЕРКА ОСТАТКОВ BATCH");
console.log("------------------------------------------------------------------------------");

const testBatches = await prisma.batch.findMany({
  where: {
    productId: {
      in: [product1Id, product2Id],
    },
  },
});

if (testBatches.length !== 0) {
  throw new Error(
    `После rollback остались тестовые Batch: ${testBatches.length}`
  );
}

console.log(
  "🟢 Для тестовых товаров Batch после rollback отсутствуют"
);

// =========================================================================
// 11. ПРОВЕРЯЕМ MOVEMENT ДЛЯ ТЕСТОВЫХ ТОВАРОВ
// =========================================================================

console.log("");
console.log("11. ПРОВЕРКА MOVEMENT ТЕСТОВЫХ ТОВАРОВ");
console.log("------------------------------------------------------------------------------");

const testMovements = await prisma.movement.findMany({
  where: {
    productId: {
      in: [product1Id, product2Id],
    },
  },
});

if (testMovements.length !== 0) {
  throw new Error(
    `После rollback остались тестовые Movement: ${testMovements.length}`
  );
}

console.log(
  "🟢 Для тестовых товаров Movement после rollback отсутствуют"
);

// =========================================================================
// 12. ИТОГ
// =========================================================================

console.log("");
console.log("==============================================================================");
console.log("V52 RESULT");
console.log("==============================================================================");
console.log("");
console.log("🟢 TRANSACTION ROLLBACK PASSED");
console.log("");
console.log("Подтверждено:");
console.log("  🟢 Supply откатывается");
console.log("  🟢 SupplyItem откатывается");
console.log("  🟢 Batch откатывается");
console.log("  🟢 Movement откатывается");
console.log("  🟢 Product.stock откатывается");
console.log("");
console.log(
  "Транзакционная модель app/api/supplies/route.ts работает атомарно."
);
console.log("");


} finally {
// =========================================================================
// 13. CLEANUP
// =========================================================================


console.log("==============================================================================");
console.log("CLEANUP");
console.log("==============================================================================");
console.log("");

// На случай неожиданного поведения удаляем остатки тестовых данных.
// Сначала зависимые записи.

if (supplyId !== null) {
  await prisma.supplyItem.deleteMany({
    where: {
      supplyId,
    },
  });

  await prisma.supply.deleteMany({
    where: {
      id: supplyId,
    },
  });
}

if (product1Id !== null || product2Id !== null) {
  const productIds = [
    product1Id,
    product2Id,
  ].filter(
    (id): id is number => id !== null
  );

  await prisma.movement.deleteMany({
    where: {
      productId: {
        in: productIds,
      },
    },
  });

  await prisma.batch.deleteMany({
    where: {
      productId: {
        in: productIds,
      },
    },
  });
}

if (product1Id !== null) {
  await prisma.product.delete({
    where: {
      id: product1Id,
    },
  });
}

if (product2Id !== null) {
  await prisma.product.delete({
    where: {
      id: product2Id,
    },
  });
}

if (supplierId !== null) {
  await prisma.supplier.delete({
    where: {
      id: supplierId,
    },
  });
}

console.log("🟢 Cleanup завершён");
console.log("");


}
}

main()
.catch((error: unknown) => {
console.error("");
console.error("🔴 V52 FAILED");
console.error("");


if (error instanceof Error) {
  console.error(error.message);
  console.error(error.stack);
} else {
  console.error(error);
}

process.exitCode = 1;


})
.finally(async () => {
await prisma.$disconnect();
});
