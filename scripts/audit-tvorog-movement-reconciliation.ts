import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

function line(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toISOString();
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

async function main() {
  console.log();
  line();
  console.log(`🧀 ${PRODUCT_NAME} — RECONCILIATION MOVEMENT`);
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
  console.log(`current stock=${product.stock} шт`);

  // ============================================================
  // 2. SUPPLIES
  // ============================================================

  console.log();
  line();
  console.log("2. SUPPLY ↔ MOVEMENT");
  line();
  console.log();

  const supplyItems = await prisma.supplyItem.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    include: {
      supply: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  const supplies = [...supplyItems].sort(
    (a, b) =>
      new Date(a.supply.date).getTime() -
      new Date(b.supply.date).getTime(),
  );

  let totalSupplyItems = 0;

  for (const item of supplies) {
    totalSupplyItems += item.quantity;

    console.log(
      `SupplyItem #${item.id} | ` +
        `Supply #${item.supplyId} | ` +
        `${date(item.supply.date)} | ` +
        `+${item.quantity} шт | ` +
        `cost=${money(item.cost)}`,
    );
  }

  console.log();
  console.log(`Всего SupplyItem: ${supplies.length}`);
  console.log(`Всего поставлено: ${totalSupplyItems} шт`);

  // ============================================================
  // 3. ORDERS
  // ============================================================

  console.log();
  line();
  console.log("3. ORDER ↔ MOVEMENT");
  line();
  console.log();

  const orders = await prisma.order.findMany({
    include: {
      items: {
        where: {
          productId: PRODUCT_ID,
        },
        include: {
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
    orderBy: {
      date: "asc",
    },
  });

  let grossSold = 0;
  let totalReturned = 0;
  let netSold = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const returned = item.ReturnBatch.reduce(
        (sum: number, ret: { quantity: number }) =>
          sum + ret.quantity,
        0,
      );

      const net = item.quantity - returned;

      grossSold += item.quantity;
      totalReturned += returned;
      netSold += net;

      console.log(
        `Order #${order.id} | ` +
          `OrderItem #${item.id} | ` +
          `${date(order.date)} | ` +
          `gross=${item.quantity} | ` +
          `returned=${returned} | ` +
          `net=${net} | ` +
          `status=${order.status}`,
      );
    }
  }

  console.log();
  console.log(`GROSS продаж: ${grossSold} шт`);
  console.log(`RETURN по OrderItem: ${totalReturned} шт`);
  console.log(`NET продаж: ${netSold} шт`);

  // ============================================================
  // 4. MOVEMENTS
  // ============================================================

  console.log();
  line();
  console.log("4. ПОСЛЕДОВАТЕЛЬНЫЙ БАЛАНС MOVEMENT");
  line();
  console.log();

  const movements = await prisma.movement.findMany({
    where: {
      productId: PRODUCT_ID,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  let movementSupply = 0;
  let movementSale = 0;
  let movementReturn = 0;
  let movementWriteOff = 0;
  let movementOther = 0;

  let runningMovement = 0;

  for (const movement of movements) {
    runningMovement += movement.quantity;

    if (movement.type === "SUPPLY") {
      movementSupply += movement.quantity;
    } else if (movement.type === "SALE") {
      movementSale += movement.quantity;
    } else if (movement.type === "RETURN") {
      movementReturn += movement.quantity;
    } else if (movement.type === "WRITE_OFF") {
      movementWriteOff += movement.quantity;
    } else {
      movementOther += movement.quantity;
    }

    console.log(
      `Movement #${movement.id} | ` +
        `${date(movement.createdAt)} | ` +
        `type=${movement.type} | ` +
        `quantity=${movement.quantity} | ` +
        `running=${runningMovement} | ` +
        `comment=${movement.comment ?? "—"}`,
    );
  }

  console.log();
  console.log(`SUPPLY: ${movementSupply} шт`);
  console.log(`SALE: ${movementSale} шт`);
  console.log(`RETURN: ${movementReturn} шт`);
  console.log(`WRITE_OFF: ${movementWriteOff} шт`);
  console.log(`OTHER: ${movementOther} шт`);
  console.log(`NET MOVEMENT: ${runningMovement} шт`);

  // ============================================================
  // 5. MOVEMENT SALE ↔ ORDER
  // ============================================================

  console.log();
  line();
  console.log("5. ПРОВЕРКА SALE MOVEMENT ↔ ORDER");
  line();
  console.log();

  const saleMovements = movements.filter(
    (movement) => movement.type === "SALE",
  );

  let matchedSaleMovement = 0;
  let unmatchedSaleMovement = 0;

  for (const movement of saleMovements) {
    const match = movement.comment?.match(/Заказ №(\d+)/);

    if (!match) {
      unmatchedSaleMovement++;

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `SALE=${movement.quantity} | ` +
          `не удалось определить Order`,
      );

      continue;
    }

    const orderId = Number(match[1]);

    const order = orders.find(
      (candidate) => candidate.id === orderId,
    );

    if (!order) {
      unmatchedSaleMovement++;

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `SALE=${movement.quantity} | ` +
          `Order #${orderId} отсутствует`,
      );

      continue;
    }

    const orderQuantity = order.items.reduce(
      (sum: number, item: { quantity: number }) =>
        sum + item.quantity,
      0,
    );

    const expectedMovement = -orderQuantity;

    if (movement.quantity !== expectedMovement) {
      console.log(
        `🟠 Movement #${movement.id} | ` +
          `Order #${orderId} | ` +
          `Movement=${movement.quantity} | ` +
          `OrderItem expected=${expectedMovement}`,
      );
    } else {
      console.log(
        `🟢 Movement #${movement.id} | ` +
          `Order #${orderId} | ` +
          `${movement.quantity} ↔ ${expectedMovement}`,
      );
    }

    matchedSaleMovement++;
  }

  console.log();
  console.log(
    `SALE Movement проверено: ${saleMovements.length}`,
  );
  console.log(
    `SALE Movement с найденным Order: ${matchedSaleMovement}`,
  );
  console.log(
    `SALE Movement без Order: ${unmatchedSaleMovement}`,
  );

  // ============================================================
  // 6. RETURN MOVEMENT ↔ RETURNBATCH
  // ============================================================

  console.log();
  line();
  console.log("6. RETURN MOVEMENT ↔ RETURNBATCH");
  line();
  console.log();

  const returnMovements = movements.filter(
    (movement) => movement.type === "RETURN",
  );

  let returnMovementFromExistingOrder = 0;
  let returnMovementAfterDeletedOrder = 0;
  let returnMovementUnknown = 0;

  for (const movement of returnMovements) {
    const match = movement.comment?.match(/заказа №(\d+)/i);

    if (!match) {
      returnMovementUnknown++;

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `RETURN=${movement.quantity} | ` +
          `Order не определён | ` +
          `${movement.comment ?? "—"}`,
      );

      continue;
    }

    const orderId = Number(match[1]);

    const order = orders.find(
      (candidate) => candidate.id === orderId,
    );

    if (!order) {
      returnMovementAfterDeletedOrder++;

      console.log(
        `🟠 Movement #${movement.id} | ` +
          `RETURN=${movement.quantity} | ` +
          `Order #${orderId} отсутствует | ` +
          `${movement.comment ?? "—"}`,
      );

      continue;
    }

    returnMovementFromExistingOrder++;

    const returnedQuantity = order.items.reduce(
      (sum: number, item) =>
        sum +
        item.ReturnBatch.reduce(
          (
            returnSum: number,
            ret: { quantity: number },
          ) => returnSum + ret.quantity,
          0,
        ),
      0,
    );

    console.log(
      `🟢 Movement #${movement.id} | ` +
        `Order #${orderId} | ` +
        `RETURN=${movement.quantity} | ` +
        `OrderItem returns=${returnedQuantity} | ` +
        `${movement.comment ?? "—"}`,
    );
  }

  console.log();
  console.log(
    `RETURN Movement всего: ${returnMovements.length}`,
  );
  console.log(
    `RETURN связанных с существующими Order: ${returnMovementFromExistingOrder}`,
  );
  console.log(
    `RETURN после удаления Order: ${returnMovementAfterDeletedOrder}`,
  );
  console.log(
    `RETURN без определения Order: ${returnMovementUnknown}`,
  );

  // ============================================================
  // 7. WRITE_OFF ↔ BATCH
  // ============================================================

  console.log();
  line();
  console.log("7. WRITE_OFF ↔ BATCH");
  line();
  console.log();

  const writeOffMovements = movements.filter(
    (movement) => movement.type === "WRITE_OFF",
  );

  for (const movement of writeOffMovements) {
    const match = movement.comment?.match(/Партия №(\d+)/);

    if (!match) {
      console.log(
        `🔴 Movement #${movement.id} | ` +
          `WRITE_OFF=${movement.quantity} | ` +
          `Batch не определён | ` +
          `${movement.comment ?? "—"}`,
      );

      continue;
    }

    const batchId = Number(match[1]);

    const batch = await prisma.batch.findUnique({
      where: {
        id: batchId,
      },
    });

    if (!batch) {
      console.log(
        `🔴 Movement #${movement.id} | ` +
          `Batch #${batchId} отсутствует | ` +
          `WRITE_OFF=${movement.quantity}`,
      );

      continue;
    }

    console.log(
      `🟢 Movement #${movement.id} | ` +
        `Batch #${batch.id} | ` +
        `WRITE_OFF=${movement.quantity} | ` +
        `batch.quantity now=${batch.quantity} | ` +
        `cost=${money(batch.purchaseCost)} | ` +
        `expiry=${date(batch.expiryDate)}`,
    );
  }

  // ============================================================
  // 8. SUPPLY MOVEMENT ↔ SUPPLY ITEM
  // ============================================================

  console.log();
  line();
  console.log("8. SUPPLY MOVEMENT ↔ SUPPLYITEM");
  line();
  console.log();

  const supplyMovements = movements.filter(
    (movement) => movement.type === "SUPPLY",
  );

  let matchedSupplyMovements = 0;
  let unmatchedSupplyMovements = 0;

  for (const movement of supplyMovements) {
    const match = movement.comment?.match(/поставк[аи]\s*№(\d+)/i);

    if (!match) {
      unmatchedSupplyMovements++;

      console.log(
        `🔴 Movement #${movement.id} | ` +
          `SUPPLY=${movement.quantity} | ` +
          `поставка не определена | ` +
          `${movement.comment ?? "—"}`,
      );

      continue;
    }

    const supplyId = Number(match[1]);

    const items = supplies.filter(
      (item) => item.supplyId === supplyId,
    );

    const supplyQuantity = items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    if (supplyQuantity !== movement.quantity) {
      console.log(
        `🟠 Movement #${movement.id} | ` +
          `Supply #${supplyId} | ` +
          `Movement=${movement.quantity} | ` +
          `SupplyItem total=${supplyQuantity}`,
      );
    } else {
      console.log(
        `🟢 Movement #${movement.id} | ` +
          `Supply #${supplyId} | ` +
          `${movement.quantity} ↔ ${supplyQuantity}`,
      );
    }

    matchedSupplyMovements++;
  }

  console.log();
  console.log(
    `SUPPLY Movement всего: ${supplyMovements.length}`,
  );
  console.log(
    `SUPPLY Movement с найденной Supply: ${matchedSupplyMovements}`,
  );
  console.log(
    `SUPPLY Movement без Supply: ${unmatchedSupplyMovements}`,
  );

  // ============================================================
  // 9. ORDERBATCH SUMMARY
  // ============================================================

  console.log();
  line();
  console.log("9. ORDERBATCH");
  line();
  console.log();

  let linkedOrderBatchQuantity = 0;
  let linkedOrderBatchCost = 0;

  for (const order of orders) {
    for (const item of order.items) {
      for (const link of item.batches) {
        linkedOrderBatchQuantity += link.quantity;
        linkedOrderBatchCost +=
          link.quantity * link.purchaseCost;
      }
    }
  }

  console.log(
    `Количество через OrderBatch: ${linkedOrderBatchQuantity} шт`,
  );

  console.log(
    `Себестоимость через OrderBatch: ${money(linkedOrderBatchCost)}`,
  );

  // ============================================================
  // 10. RECONCILIATION
  // ============================================================

  console.log();
  line();
  console.log("10. ИТОГОВАЯ СВЕРКА");
  line();
  console.log();

  const orderGrossExpected = -grossSold;
  const orderReturnExpected = totalReturned;

  console.log(
    `OrderItem GROSS продаж: ${grossSold} шт`,
  );

  console.log(
    `SALE Movement: ${movementSale} шт`,
  );

  console.log(
    `Разница SALE: ${movementSale - orderGrossExpected} шт`,
  );

  console.log();

  console.log(
    `OrderItem RETURN: ${orderReturnExpected} шт`,
  );

  console.log(
    `RETURN Movement: ${movementReturn} шт`,
  );

  console.log(
    `Разница RETURN: ${movementReturn - orderReturnExpected} шт`,
  );

  console.log();

  console.log(
    `NET OrderItem movement: ${netSold} шт продано`,
  );

  console.log(
    `NET SALE+RETURN Movement: ${
      Math.abs(movementSale) - movementReturn
    } шт`,
  );

  console.log();

  const businessNetMovement =
    movementSupply +
    movementSale +
    movementReturn +
    movementWriteOff +
    movementOther;

  console.log(
    `NET Movement: ${businessNetMovement} шт`,
  );

  console.log(
    `Current Product.stock: ${product.stock} шт`,
  );

  console.log(
    `Opening stock по Movement: ${
      product.stock - businessNetMovement
    } шт`,
  );

  // ============================================================
  // 11. CRITICAL FINDINGS
  // ============================================================

  console.log();
  line();
  console.log("11. 🔴 КРИТИЧЕСКИЕ НАХОДКИ");
  line();
  console.log();

  const saleDifference =
    movementSale - orderGrossExpected;

  const returnDifference =
    movementReturn - orderReturnExpected;

  const deletedReturnQuantity =
    returnMovements
      .filter((movement) =>
        /после удаления заказа/i.test(
          movement.comment ?? "",
        ),
      )
      .reduce(
        (sum, movement) => sum + movement.quantity,
        0,
      );

  console.log(
    `SALE discrepancy: ${saleDifference} шт`,
  );

  console.log(
    `RETURN discrepancy: ${returnDifference} шт`,
  );

  console.log(
    `RETURN после удаления заказов: ${deletedReturnQuantity} шт`,
  );

  if (saleDifference !== 0) {
    console.log(
      "🔴 История SALE Movement не совпадает с OrderItem.",
    );
  } else {
    console.log(
      "🟢 SALE Movement соответствует OrderItem.",
    );
  }

  if (returnDifference !== 0) {
    console.log(
      "🔴 История RETURN Movement не совпадает с ReturnBatch.",
    );
  } else {
    console.log(
      "🟢 RETURN Movement соответствует ReturnBatch.",
    );
  }

  if (deletedReturnQuantity !== 0) {
    console.log(
      "🔴 В истории присутствуют возвраты после удаления заказов.",
    );
  }

  // ============================================================
  // 12. SAFETY CHECK
  // ============================================================

  console.log();
  line();
  console.log("12. SAFETY CHECK");
  line();
  console.log();

  const productAfter = await prisma.product.findUnique({
    where: {
      id: PRODUCT_ID,
    },
  });

  if (!productAfter) {
    throw new Error("Product исчез во время аудита");
  }

  console.log(
    `Product.stock: ${product.stock} -> ${productAfter.stock}`,
  );

  if (product.stock !== productAfter.stock) {
    throw new Error(
      "❌ Product.stock изменился — аудит небезопасен",
    );
  }

  console.log("✅ Product.stock не изменился");
  console.log();

  line();
  console.log("🏁 RECONCILIATION ЗАВЕРШЁН");
  line();
  console.log();
  console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.");
  console.log();
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