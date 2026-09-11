import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_MARKER = "V35_INTEGRATION_TEST";

async function main() {
  console.log("🧪 V35-A PREPARE INTEGRATION TEST");
  console.log("⚠️ This script creates ONLY isolated test data.");

  // ============================================================
  // Проверяем, нет ли уже старого V35 теста
  // ============================================================

  const existingProducts = await prisma.product.findMany({
    where: {
      name: {
        contains: TEST_MARKER,
      },
    },
    include: {
      batches: true,
    },
  });

  if (existingProducts.length > 0) {
    console.log("");
    console.log("❌ Старый V35 тест уже существует.");

    for (const product of existingProducts) {
      console.log(
        `Product #${product.id}: ${product.name}, ` +
          `stock=${product.stock}, batches=${product.batches.length}`
      );
    }

    console.log("");
    console.log(
      "Сначала выполни cleanup-скрипт V35, затем повтори подготовку."
    );

    process.exitCode = 1;
    return;
  }

  // ============================================================
  // Создаём тестовый товар
  // ============================================================

  const product = await prisma.product.create({
    data: {
      name: `${TEST_MARKER} Молоко`,
      unit: "шт",
      price: 300,
      cost: 100,
      stock: 0,
    },
  });

  console.log("");
  console.log(
    `✅ Created test Product #${product.id}`
  );

  // ============================================================
  // Время теста
  // ============================================================

  const now = new Date();

  // Партия A:
  // более ранний срок годности -> должна уйти первой.
  const batchAExpiry = new Date(
    now.getTime() + 2 * 24 * 60 * 60 * 1000
  );

  // Партия B:
  // более поздний срок годности -> должна уйти второй.
  const batchBExpiry = new Date(
    now.getTime() + 5 * 24 * 60 * 60 * 1000
  );

  // ============================================================
  // Создаём Batch A
  // ============================================================

  const batchA = await prisma.batch.create({
    data: {
      quantity: 2,
      purchaseCost: 100,
      receivedAt: now,
      expiryDate: batchAExpiry,
      status: "ACTIVE",
      productId: product.id,
    },
  });

  console.log(
    `✅ Batch A #${batchA.id}: qty=2, cost=100, ` +
      `expiry=${batchA.expiryDate.toISOString()}`
  );

  // ============================================================
  // Создаём Batch B
  // ============================================================

  const batchB = await prisma.batch.create({
    data: {
      quantity: 2,
      purchaseCost: 120,
      receivedAt: new Date(now.getTime() + 1000),
      expiryDate: batchBExpiry,
      status: "ACTIVE",
      productId: product.id,
    },
  });

  console.log(
    `✅ Batch B #${batchB.id}: qty=2, cost=120, ` +
      `expiry=${batchB.expiryDate.toISOString()}`
  );

  // ============================================================
  // Синхронизируем Product.stock
  // ============================================================

  const stock = batchA.quantity + batchB.quantity;

  await prisma.product.update({
    where: {
      id: product.id,
    },
    data: {
      stock,
    },
  });

  console.log(
    `✅ Product #${product.id} stock = ${stock}`
  );

  // ============================================================
  // Финальная проверка
  // ============================================================

  const check = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (!check) {
    throw new Error("Тестовый товар не найден после создания");
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("V35 TEST DATA READY");
  console.log("=".repeat(70));

  console.log(`PRODUCT_ID=${check.id}`);
  console.log(`BATCH_A_ID=${batchA.id}`);
  console.log(`BATCH_B_ID=${batchB.id}`);

  console.log("");
  console.log("Product:");
  console.log(`  id=${check.id}`);
  console.log(`  name=${check.name}`);
  console.log(`  price=${check.price}`);
  console.log(`  stock=${check.stock}`);

  console.log("");
  console.log("Expected sale:");
  console.log("  quantity = 3");
  console.log("  Batch A = 2");
  console.log("  Batch B = 1");

  console.log("");
  console.log("Expected after sale:");
  console.log("  Batch A = 0");
  console.log("  Batch B = 1");
  console.log("  Product.stock = 1");

  console.log("");
  console.log("Expected after returning 1:");
  console.log("  return Batch B");
  console.log("  Batch A = 0");
  console.log("  Batch B = 2");
  console.log("  Product.stock = 2");
  console.log("  Order.total = 600");
  console.log("  Order.profit = 400");
  console.log("  Order.status = PARTIAL_RETURN");

  console.log("");
  console.log("⚠️ Do NOT manually edit these test records.");
  console.log(
    "The next step is to create the sale through the real API."
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error("❌ V35-A ERROR");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });