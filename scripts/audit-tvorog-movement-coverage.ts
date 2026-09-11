import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toISOString();
}

async function main() {
  console.log();
  line();
  console.log("🧀 ТВОРОГ — АУДИТ ПОКРЫТИЯ MOVEMENT И ХРОНОЛОГИЧЕСКОГО БАЛАНСА");
  line();
  console.log();
  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
  console.log();

  // ============================================================
  // 1. PRODUCT
  // ============================================================

  line();
  console.log("1. PRODUCT");
  line();
  console.log();

  const product = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!product) {
    throw new Error(`Product #${PRODUCT_ID} не найден`);
  }

  console.log(`Product #${product.id}`);
  console.log(`name=${product.name}`);
  console.log(`stock=${product.stock}`);

  // ============================================================
  // 2. SUPPLIES
  // ============================================================

  console.log();
  line();
  console.log("2. SUPPLY → MOVEMENT SUPPLY");
  line();
  console.log();

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
  });

  supplyItems.sort(
    (a, b) =>
      new Date(a.supply.date).getTime() -
      new Date(b.supply.date).getTime(),
  );

  const supplyMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      type: "SUPPLY",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let totalSupplyItems = 0;
  let totalSupplyMovements = 0;

  for (const item of supplyItems) {
    totalSupplyItems += item.quantity;

    const supplyDate = new Date(item.supply.date);

    const matching = supplyMovements.filter((movement) => {
      const movementDate = new Date(movement.createdAt);

      return (
        Math.abs(movementDate.getTime() - supplyDate.getTime()) <=
        10_000 &&
        movement.quantity === item.quantity
      );
    });

    if (matching.length > 0) {
      console.log(
        `🟢 SupplyItem #${item.id} | ` +
          `Supply #${item.supplyId} | ` +
          `${date(item.supply.date)} | ` +
          `+${item.quantity} шт | ` +
          `cost=${money(item.cost)} | ` +
          `Movement найден`,
      );
    } else {
      console.log(
        `🔴 SupplyItem #${item.id} | ` +
          `Supply #${item.supplyId} | ` +
          `${date(item.supply.date)} | ` +
          `+${item.quantity} шт | ` +
          `cost=${money(item.cost)} | ` +
          `Movement НЕ найден`,
      );
    }
  }

  for (const movement of supplyMovements) {
    totalSupplyMovements += movement.quantity;
  }

  console.log();
  console.log(`SupplyItem quantity: ${totalSupplyItems} шт`);
  console.log(`Movement SUPPLY quantity: ${totalSupplyMovements} шт`);
  console.log(
    `Разница: ${totalSupplyItems - totalSupplyMovements} шт`,
  );

  // ============================================================
  // 3. ORDERS → MOVEMENT SALE
  // ============================================================

  console.log();
  line();
  console.log("3. ORDER → MOVEMENT SALE");
  line();
  console.log();

  const orders = await prisma.order.findMany({
    include: {
      items: {
        where: {
          productId: PRODUCT_ID,
        },
        include: {
          ReturnBatch: true,
        },
      },
    },
    orderBy: {
      date: "asc",
    },
  });

  const saleMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
      type: "SALE",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let currentGrossSales = 0;
  let currentReturns = 0;
  let currentNetSales = 0;

  const orderIdsWithSaleMovement = new Set<number>();

  for (const movement of saleMovements) {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (match) {
      orderIdsWithSaleMovement.add(Number(match[1]));
    }
  }

  for (const order of orders) {
    for (const item of order.items) {
      const returned = item.ReturnBatch.reduce(
        (sum: number, ret: { quantity: number }) =>
          sum + ret.quantity,
        0,
      );

      const net = Math.max(0, item.quantity - returned);

      currentGrossSales += item.quantity;
      currentReturns += returned;
      currentNetSales += net;

      const movement = saleMovements.find((m) => {
        const match = m.comment?.match(/Заказ №(\d+)/);

        return (
          match &&
          Number(match[1]) === order.id &&
          Math.abs(m.quantity) === item.quantity
        );
      });

      if (movement) {
        console.log(
          `🟢 Order #${order.id} | ` +
            `OrderItem #${item.id} | ` +
            `date=${date(order.date)} | ` +
            `gross=${item.quantity} | ` +
            `net=${net} | ` +
            `SALE Movement #${movement.id} | ` +
            `qty=${movement.quantity}`,
        );
      } else {
        console.log(
          `🔴 Order #${order.id} | ` +
            `OrderItem #${item.id} | ` +
            `date=${date(order.date)} | ` +
            `gross=${item.quantity} | ` +
            `net=${net} | ` +
            `SALE Movement НЕ найден`,
        );
      }
    }
  }

  console.log();
  console.log(`Текущие OrderItem gross: ${currentGrossSales} шт`);
  console.log(`Текущие возвраты: ${currentReturns} шт`);
  console.log(`Текущие OrderItem net: ${currentNetSales} шт`);

  // ============================================================
  // 4. SALE MOVEMENT, КОТОРЫЕ НЕ ИМЕЮТ ТЕКУЩЕГО ORDER
  // ============================================================

  console.log();
  line();
  console.log("4. MOVEMENT SALE → ТЕКУЩИЙ ORDER");
  line();
  console.log();

  let orphanSaleQuantity = 0;

  for (const movement of saleMovements) {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (!match) {
      console.log(
        `⚠️ Movement #${movement.id} | ` +
          `${date(movement.createdAt)} | ` +
          `qty=${movement.quantity} | ` +
          `comment=${movement.comment ?? "—"} | ` +
          `НЕТ НОМЕРА ЗАКАЗА`,
      );

      continue;
    }

    const orderId = Number(match[1]);

    const exists = orders.some(
      (order) => order.id === orderId,
    );

    if (!exists) {
      orphanSaleQuantity += Math.abs(movement.quantity);

      console.log(
        `🟡 Movement #${movement.id} | ` +
          `${date(movement.createdAt)} | ` +
          `qty=${movement.quantity} | ` +
          `Заказ #${orderId} отсутствует в Order`,
      );
    }
  }

  console.log();
  console.log(
    `SALE Movement без текущего Order: ${orphanSaleQuantity} шт`,
  );

  // ============================================================
  // 5. ORDER → MOVEMENT COVERAGE
  // ============================================================

  console.log();
  line();
  console.log("5. ПОКРЫТИЕ ПРОДАЖ");
  line();
  console.log();

  let missingSaleQuantity = 0;
  let coveredSaleQuantity = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const movement = saleMovements.find((m) => {
        const match = m.comment?.match(/Заказ №(\d+)/);

        return (
          match &&
          Number(match[1]) === order.id &&
          Math.abs(m.quantity) === item.quantity
        );
      });

      if (movement) {
        coveredSaleQuantity += item.quantity;
      } else {
        missingSaleQuantity += item.quantity;

        console.log(
          `🔴 НЕТ SALE Movement: ` +
            `Order #${order.id} | ` +
            `OrderItem #${item.id} | ` +
            `quantity=${item.quantity}`,
        );
      }
    }
  }

  console.log();
  console.log(`Покрыто Movement SALE: ${coveredSaleQuantity} шт`);
  console.log(`Не покрыто Movement SALE: ${missingSaleQuantity} шт`);

  // ============================================================
  // 6. DELETED ORDERS FROM MOVEMENTS
  // ============================================================

  console.log();
  line();
  console.log("6. УДАЛЁННЫЕ ЗАКАЗЫ, ОСТАВИВШИЕ MOVEMENT");
  line();
  console.log();

  const deletedOrderIds = new Set<number>();

  for (const movement of saleMovements) {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (!match) continue;

    const orderId = Number(match[1]);

    if (!orders.some((order) => order.id === orderId)) {
      deletedOrderIds.add(orderId);
    }
  }

  let deletedSaleQuantity = 0;

  for (const orderId of [...deletedOrderIds].sort(
    (a, b) => a - b,
  )) {
    const movementsForOrder = saleMovements.filter((movement) => {
      const match = movement.comment?.match(/Заказ №(\d+)/);

      return match && Number(match[1]) === orderId;
    });

    const quantity = movementsForOrder.reduce(
      (sum, movement) => sum + Math.abs(movement.quantity),
      0,
    );

    deletedSaleQuantity += quantity;

    console.log(
      `🟡 Order #${orderId} отсутствует в БД | ` +
        `SALE Movement=${quantity} шт`,
    );
  }

  console.log();
  console.log(
    `Итого SALE от удалённых заказов: ${deletedSaleQuantity} шт`,
  );

  // ============================================================
  // 7. CHRONOLOGICAL MOVEMENT BALANCE
  // ============================================================

  console.log();
  line();
  console.log("7. ХРОНОЛОГИЧЕСКИЙ БАЛАНС MOVEMENT");
  line();
  console.log();

  const allMovements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  let runningBalance = 0;
  let minimumBalance = 0;

  for (const movement of allMovements) {
    runningBalance += movement.quantity;

    if (runningBalance < minimumBalance) {
      minimumBalance = runningBalance;
    }

    console.log(
      `Movement #${movement.id} | ` +
        `${date(movement.createdAt)} | ` +
        `${movement.type.padEnd(10)} | ` +
        `qty=${String(movement.quantity).padStart(4)} | ` +
        `balance=${runningBalance}`,
    );
  }

  const requiredOpeningFromChronology = Math.max(
    0,
    -minimumBalance,
  );

  console.log();
  console.log(
    `Минимальный opening stock по полной хронологии: ` +
      `${requiredOpeningFromChronology} шт`,
  );

  console.log(
    `Конечный баланс Movement без opening: ` +
      `${runningBalance} шт`,
  );

  console.log(
    `Opening + Movement = ` +
      `${requiredOpeningFromChronology + runningBalance} шт`,
  );

  // ============================================================
  // 8. HISTORICAL OPENING REQUIREMENT
  // ============================================================

  console.log();
  line();
  console.log("8. КОНТРОЛЬНЫЙ РАСЧЁТ");
  line();
  console.log();

  console.log(
    `Текущий Product.stock: ${product.stock} шт`,
  );

  console.log(
    `NET Movement: ${runningBalance} шт`,
  );

  console.log(
    `Opening по конечному балансу: ` +
      `${product.stock - runningBalance} шт`,
  );

  console.log(
    `Opening минимум по хронологии: ` +
      `${requiredOpeningFromChronology} шт`,
  );

  // ============================================================
  // 9. FIRST SALE
  // ============================================================

  console.log();
  line();
  console.log("9. ПЕРВАЯ ПРОДАЖА");
  line();
  console.log();

  const firstOrder = orders[0];

  if (firstOrder) {
    console.log(`Первый Order: #${firstOrder.id}`);
    console.log(`Дата: ${date(firstOrder.date)}`);

    for (const item of firstOrder.items) {
      console.log(
        `OrderItem #${item.id} | quantity=${item.quantity}`,
      );
    }
  }

  // ============================================================
  // 10. FINAL CONCLUSION
  // ============================================================

  console.log();
  line();
  console.log("10. ИТОГ");
  line();
  console.log();

  console.log(`Product.stock: ${product.stock} шт`);
  console.log(`SupplyItem total: ${totalSupplyItems} шт`);
  console.log(`Movement SUPPLY: ${totalSupplyMovements} шт`);
  console.log(`Current OrderItem gross: ${currentGrossSales} шт`);
  console.log(`Current OrderItem returns: ${currentReturns} шт`);
  console.log(`Current OrderItem net: ${currentNetSales} шт`);
  console.log(`Movement SALE: ${saleMovements.reduce(
    (sum, movement) => sum + Math.abs(movement.quantity),
    0,
  )} шт`);
  console.log(`Missing SALE Movement: ${missingSaleQuantity} шт`);
  console.log(`Deleted-order SALE Movement: ${deletedSaleQuantity} шт`);
  console.log(`Movement RETURN: ${allMovements
    .filter((m) => m.type === "RETURN")
    .reduce((sum, m) => sum + m.quantity, 0)} шт`);
  console.log(`Movement WRITE_OFF: ${allMovements
    .filter((m) => m.type === "WRITE_OFF")
    .reduce((sum, m) => sum + m.quantity, 0)} шт`);

  console.log();

  console.log(
    `Opening по конечному Movement-балансу: ` +
      `${product.stock - runningBalance} шт`,
  );

  console.log(
    `Минимальный opening по хронологии: ` +
      `${requiredOpeningFromChronology} шт`,
  );

  console.log();

  if (missingSaleQuantity === 0) {
    console.log("🟢 Все текущие продажи имеют SALE Movement.");
  } else {
    console.log(
      `🔴 ${missingSaleQuantity} шт текущих продаж не имеют SALE Movement.`,
    );
  }

  if (totalSupplyItems === totalSupplyMovements) {
    console.log("🟢 Supply и Movement SUPPLY совпадают.");
  } else {
    console.log(
      `🔴 Supply и Movement SUPPLY расходятся на ` +
        `${totalSupplyItems - totalSupplyMovements} шт.`,
    );
  }

  console.log();

  console.log("⚠️ READ ONLY");
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");

  console.log();
  line();
  console.log("🏁 АУДИТ ЗАВЕРШЁН");
  line();
}

main()
  .catch((error) => {
    console.error();
    line();
    console.error("❌ ОШИБКА");
    line();
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });