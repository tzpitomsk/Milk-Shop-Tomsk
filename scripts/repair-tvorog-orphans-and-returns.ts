import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2; // Творог

/**
 * ============================================================
 * 🧀 ТВОРОГ — ИСПРАВЛЕНИЕ ORPHAN ORDERBATCH + RETURNBATCH
 * ============================================================
 *
 * ИЗМЕНЯЕТ БАЗУ ДАННЫХ.
 *
 * Что исправляем:
 *
 * 1. Удаляем 7 заведомо неправильных OrderBatch:
 *    #79, #80, #81, #82, #83, #84, #85
 *
 * 2. Исправляем ReturnBatch:
 *    #2: Batch #15 -> Batch #14
 *    #3: Batch #15 -> Batch #14
 *    #4: Batch #15 -> Batch #14
 *
 * 3. Исправляем purchaseCost:
 *    Batch #13: 0 -> 200
 *    Batch #14: 0 -> 200
 *
 * НЕ ИЗМЕНЯЕМ:
 *
 * - OrderItem
 * - количество продажи
 * - Batch.quantity
 * - Product.stock
 * - Movement
 * - Order.status
 * - Order.total
 * - Order.profit
 */

type ExpectedOrderBatch = {
    orderBatchId: number;
    orderId: number;
    orderItemId: number;
    batchId: number;
    quantity: number;
};

type ExpectedReturnBatch = {
    returnBatchId: number;
    orderId: number;
    orderItemId: number;
    currentBatchId: number;
    expectedBatchId: number;
    quantity: number;
};

type BatchCostRepair = {
    batchId: number;
    oldCost: number;
    newCost: number;
};

const INVALID_ORDER_BATCHES: ExpectedOrderBatch[] = [
    {
        orderBatchId: 79,
        orderId: 4,
        orderItemId: 7,
        batchId: 13,
        quantity: 1,
    },
    {
        orderBatchId: 80,
        orderId: 12,
        orderItemId: 16,
        batchId: 14,
        quantity: 1,
    },
    {
        orderBatchId: 81,
        orderId: 16,
        orderItemId: 21,
        batchId: 14,
        quantity: 1,
    },
    {
        orderBatchId: 82,
        orderId: 18,
        orderItemId: 26,
        batchId: 14,
        quantity: 1,
    },
    {
        orderBatchId: 83,
        orderId: 19,
        orderItemId: 28,
        batchId: 14,
        quantity: 4,
    },
    {
        orderBatchId: 84,
        orderId: 20,
        orderItemId: 29,
        batchId: 14,
        quantity: 1,
    },
    {
        orderBatchId: 85,
        orderId: 23,
        orderItemId: 35,
        batchId: 14,
        quantity: 1,
    },
];

const RETURN_BATCH_REPAIRS: ExpectedReturnBatch[] = [
    {
        returnBatchId: 2,
        orderId: 53,
        orderItemId: 65,
        currentBatchId: 15,
        expectedBatchId: 14,
        quantity: 2,
    },
    {
        returnBatchId: 3,
        orderId: 54,
        orderItemId: 66,
        currentBatchId: 15,
        expectedBatchId: 14,
        quantity: 2,
    },
    {
        returnBatchId: 4,
        orderId: 55,
        orderItemId: 67,
        currentBatchId: 15,
        expectedBatchId: 14,
        quantity: 1,
    },
];

const BATCH_COST_REPAIRS: BatchCostRepair[] = [
    {
        batchId: 13,
        oldCost: 0,
        newCost: 200,
    },
    {
        batchId: 14,
        oldCost: 0,
        newCost: 200,
    },
];

async function main() {
    console.log("========================================");
    console.log("");
    console.log("🧀 ТВОРОГ — ИСПРАВЛЕНИЕ ИСТОРИЧЕСКИХ СВЯЗЕЙ");
    console.log("");
    console.log("========================================");
    console.log("");

    console.log("⚠️ ЭТОТ СКРИПТ ИЗМЕНЯЕТ БАЗУ ДАННЫХ");
    console.log("");

    console.log("Будут исправлены только:");
    console.log("  • 7 заведомо неправильных OrderBatch");
    console.log("  • 3 неправильных ReturnBatch");
    console.log("  • purchaseCost Batch #13 и #14");

    console.log("");

    console.log("НЕ будут изменены:");
    console.log("  • OrderItem");
    console.log("  • Batch.quantity");
    console.log("  • Product.stock");
    console.log("  • Movement");
    console.log("  • Order.total");
    console.log("  • Order.profit");
    console.log("  • Order.status");

    console.log("");

    // ============================================================
    // PRODUCT
    // ============================================================

    const product = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    if (!product) {
        throw new Error(
            `Product #${PRODUCT_ID} не найден`
        );
    }

    console.log(
        `Товар: #${product.id} ${product.name}`
    );

    console.log(
        `Product.stock: ${product.stock}`
    );

    // ============================================================
    // BATCH CHECK
    // ============================================================

    console.log("");
    console.log("----------------------------------------");
    console.log("🔎 ПРОВЕРКА BATCH");
    console.log("----------------------------------------");

    const batchIds = [13, 14, 15, 29];

    const batches = await prisma.batch.findMany({
        where: {
            id: {
                in: batchIds,
            },
            productId: PRODUCT_ID,
        },
        orderBy: {
            id: "asc",
        },
    });

    if (batches.length !== batchIds.length) {
        throw new Error(
            `Ожидалось ${batchIds.length} Batch Творога, ` +
            `найдено ${batches.length}`
        );
    }

    for (const batch of batches) {
        console.log(
            `Batch #${batch.id} | ` +
            `quantity=${batch.quantity} | ` +
            `cost=${batch.purchaseCost} ₽ | ` +
            `received=${batch.receivedAt.toISOString()} | ` +
            `expiry=${batch.expiryDate.toISOString()} | ` +
            `status=${batch.status}`
        );
    }

    const batch13 = batches.find(
        (b) => b.id === 13
    );

    const batch14 = batches.find(
        (b) => b.id === 14
    );

    const batch15 = batches.find(
        (b) => b.id === 15
    );

    if (!batch13 || !batch14 || !batch15) {
        throw new Error(
            "Не найден один из обязательных Batch #13/#14/#15"
        );
    }

    // ============================================================
    // INVALID ORDERBATCH CHECK
    // ============================================================

    console.log("");
    console.log("----------------------------------------");
    console.log("🔎 ПРОВЕРКА НЕПРАВИЛЬНЫХ ORDERBATCH");
    console.log("----------------------------------------");

    for (const expected of INVALID_ORDER_BATCHES) {
        const orderBatch =
            await prisma.orderBatch.findUnique({
                where: {
                    id: expected.orderBatchId,
                },
                include: {
                    orderItem: true,
                    batch: true,
                },
            });

        if (!orderBatch) {
            throw new Error(
                `OrderBatch #${expected.orderBatchId} не найден`
            );
        }

        if (
            orderBatch.orderItemId !==
            expected.orderItemId
        ) {
            throw new Error(
                `OrderBatch #${expected.orderBatchId}: ` +
                `ожидался OrderItem #${expected.orderItemId}, ` +
                `получен #${orderBatch.orderItemId}`
            );
        }

        if (
            orderBatch.batchId !==
            expected.batchId
        ) {
            throw new Error(
                `OrderBatch #${expected.orderBatchId}: ` +
                `ожидался Batch #${expected.batchId}, ` +
                `получен #${orderBatch.batchId}`
            );
        }

        if (
            orderBatch.quantity !==
            expected.quantity
        ) {
            throw new Error(
                `OrderBatch #${expected.orderBatchId}: ` +
                `ожидалось quantity=${expected.quantity}, ` +
                `получено ${orderBatch.quantity}`
            );
        }

        if (
            orderBatch.orderItem.productId !==
            PRODUCT_ID
        ) {
            throw new Error(
                `OrderBatch #${expected.orderBatchId}: ` +
                `OrderItem не относится к Творогу`
            );
        }

        if (
            orderBatch.batch.productId !==
            PRODUCT_ID
        ) {
            throw new Error(
                `OrderBatch #${expected.orderBatchId}: ` +
                `Batch не относится к Творогу`
            );
        }

        console.log(
            `✅ OrderBatch #${orderBatch.id} | ` +
            `OrderItem #${orderBatch.orderItemId} | ` +
            `Batch #${orderBatch.batchId} | ` +
            `${orderBatch.quantity} шт`
        );
    }

    console.log("");
    console.log(
        "Все 7 неправильных OrderBatch подтверждены."
    );

    // ============================================================
    // RETURNBATCH CHECK
    // ============================================================

    console.log("");
    console.log("----------------------------------------");
    console.log("🔎 ПРОВЕРКА RETURNBATCH");
    console.log("----------------------------------------");

    for (const expected of RETURN_BATCH_REPAIRS) {
        const returnBatch =
            await prisma.returnBatch.findUnique({
                where: {
                    id: expected.returnBatchId,
                },
                include: {
                    OrderItem: true,
                    Batch: true,
                },
            });

        if (!returnBatch) {
            throw new Error(
                `ReturnBatch #${expected.returnBatchId} не найден`
            );
        }

        if (
            returnBatch.orderItemId !==
            expected.orderItemId
        ) {
            throw new Error(
                `ReturnBatch #${expected.returnBatchId}: ` +
                `ожидался OrderItem #${expected.orderItemId}, ` +
                `получен #${returnBatch.orderItemId}`
            );
        }

        if (
            returnBatch.batchId !==
            expected.currentBatchId
        ) {
            throw new Error(
                `ReturnBatch #${expected.returnBatchId}: ` +
                `ожидался текущий Batch #${expected.currentBatchId}, ` +
                `получен #${returnBatch.batchId}`
            );
        }

        if (
            returnBatch.quantity !==
            expected.quantity
        ) {
            throw new Error(
                `ReturnBatch #${expected.returnBatchId}: ` +
                `ожидалось quantity=${expected.quantity}, ` +
                `получено ${returnBatch.quantity}`
            );
        }

        if (
            returnBatch.OrderItem.productId !==
            PRODUCT_ID
        ) {
            throw new Error(
                `ReturnBatch #${expected.returnBatchId}: ` +
                `OrderItem не относится к Творогу`
            );
        }

        if (
            returnBatch.Batch.productId !==
            PRODUCT_ID
        ) {
            throw new Error(
                `ReturnBatch #${expected.returnBatchId}: ` +
                `Batch не относится к Творогу`
            );
        }

        console.log(
            `✅ ReturnBatch #${returnBatch.id} | ` +
            `OrderItem #${returnBatch.orderItemId} | ` +
            `Batch #${returnBatch.batchId} | ` +
            `${returnBatch.quantity} шт | ` +
            `будет -> Batch #${expected.expectedBatchId}`
        );
    }

    console.log("");
    console.log(
        "Все 3 ReturnBatch подтверждены."
    );

    // ============================================================
    // BATCH COST CHECK
    // ============================================================

    console.log("");
    console.log("----------------------------------------");
    console.log("💰 ПРОВЕРКА СЕБЕСТОИМОСТИ BATCH");
    console.log("----------------------------------------");

    for (const repair of BATCH_COST_REPAIRS) {
        const batch =
            await prisma.batch.findUnique({
                where: {
                    id: repair.batchId,
                },
            });

        if (!batch) {
            throw new Error(
                `Batch #${repair.batchId} не найден`
            );
        }

        if (
            batch.productId !== PRODUCT_ID
        ) {
            throw new Error(
                `Batch #${repair.batchId} ` +
                `не относится к Творогу`
            );
        }

        if (
            batch.purchaseCost !==
            repair.oldCost
        ) {
            throw new Error(
                `Batch #${repair.batchId}: ` +
                `ожидалась текущая себестоимость ` +
                `${repair.oldCost} ₽, ` +
                `фактически ${batch.purchaseCost} ₽`
            );
        }

        console.log(
            `✅ Batch #${batch.id}: ` +
            `${batch.purchaseCost} ₽ -> ` +
            `${repair.newCost} ₽`
        );
    }

    // ============================================================
    // FORBIDDEN CHANGES SNAPSHOT
    // ============================================================

    console.log("");
    console.log("----------------------------------------");
    console.log("🛑 ПРОВЕРКА ЗАПРЕЩЁННЫХ ИЗМЕНЕНИЙ");
    console.log("----------------------------------------");

    const productBefore =
        await prisma.product.findUnique({
            where: {
                id: PRODUCT_ID,
            },
        });

    if (!productBefore) {
        throw new Error(
            "Product исчез во время проверки"
        );
    }

    const batchesBefore =
        await prisma.batch.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: {
                id: "asc",
            },
        });

    const movementsBefore =
        await prisma.movement.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: {
                id: "asc",
            },
        });

    const orderItemsBefore =
        await prisma.orderItem.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: {
                id: "asc",
            },
        });

    console.log(
        `Product.stock перед transaction: ` +
        `${productBefore.stock}`
    );

    console.log(
        `Batch Творога: ${batchesBefore.length}`
    );

    console.log(
        `Movement Творога: ${movementsBefore.length}`
    );

    console.log(
        `OrderItem Творога: ${orderItemsBefore.length}`
    );

    console.log("");
    console.log("----------------------------------------");
    console.log("🧮 НАЧАЛЬНЫЕ КОНТРОЛЬНЫЕ ЗНАЧЕНИЯ");
    console.log("----------------------------------------");

    const batchQuantityBefore = new Map(
        batchesBefore.map((batch) => [
            batch.id,
            batch.quantity,
        ])
    );

    /*
     * Текущая schema Movement:
     *
     * id
     * type
     * quantity
     * comment
     * createdAt
     * productId
     *
     * Полей balance / description больше нет.
     */

    const movementSnapshotBefore =
        movementsBefore.map((movement) => ({
            id: movement.id,
            quantity: movement.quantity,
            type: movement.type,
            comment: movement.comment,
            createdAt: movement.createdAt.getTime(),
            productId: movement.productId,
        }));

    const orderItemSnapshotBefore =
        orderItemsBefore.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
            productId: item.productId,
        }));

    console.log(
        `SUM Batch.quantity: ${
            batchesBefore.reduce(
                (sum, batch) =>
                    sum + batch.quantity,
                0
            )
        }`
    );

    console.log(
        `Product.stock: ${productBefore.stock}`
    );

    console.log("");

    // ============================================================
    // TRANSACTION
    // ============================================================

    console.log("========================================");
    console.log("💾 НАЧИНАЕМ TRANSACTION");
    console.log("========================================");
    console.log("");

    await prisma.$transaction(async (tx) => {
        console.log(
            "🗑️ УДАЛЕНИЕ 7 НЕПРАВИЛЬНЫХ ORDERBATCH"
        );

        console.log("");

        for (const expected of INVALID_ORDER_BATCHES) {
            const deleted =
                await tx.orderBatch.delete({
                    where: {
                        id: expected.orderBatchId,
                    },
                });

            console.log(
                `  ✅ удалён OrderBatch #${deleted.id} | ` +
                `OrderItem #${expected.orderItemId} | ` +
                `Batch #${expected.batchId} | ` +
                `${deleted.quantity} шт`
            );
        }

        console.log("");

        console.log(
            "↩️ ИСПРАВЛЕНИЕ RETURNBATCH"
        );

        console.log("");

        for (const repair of RETURN_BATCH_REPAIRS) {
            const updated =
                await tx.returnBatch.update({
                    where: {
                        id: repair.returnBatchId,
                    },
                    data: {
                        batchId:
                            repair.expectedBatchId,
                    },
                });

            console.log(
                `  ✅ ReturnBatch #${updated.id}: ` +
                `Batch #${repair.currentBatchId} -> ` +
                `Batch #${repair.expectedBatchId} | ` +
                `${updated.quantity} шт`
            );
        }

        console.log("");

        console.log(
            "💰 ИСПРАВЛЕНИЕ PURCHASE COST"
        );

        console.log("");

        for (const repair of BATCH_COST_REPAIRS) {
            const updated =
                await tx.batch.update({
                    where: {
                        id: repair.batchId,
                    },
                    data: {
                        purchaseCost:
                            repair.newCost,
                    },
                });

            console.log(
                `  ✅ Batch #${updated.id}: ` +
                `${repair.oldCost} ₽ -> ` +
                `${updated.purchaseCost} ₽`
            );
        }
    });

    console.log("");

    console.log("========================================");
    console.log("✅ TRANSACTION УСПЕШНО ЗАВЕРШЁН");
    console.log("========================================");

    // ============================================================
    // AFTER AUDIT
    // ============================================================

    console.log("");

    console.log("----------------------------------------");
    console.log("🔎 ПОСЛЕПРОВЕРОЧНЫЙ АУДИТ");
    console.log("----------------------------------------");

    const productAfter =
        await prisma.product.findUnique({
            where: {
                id: PRODUCT_ID,
            },
        });

    if (!productAfter) {
        throw new Error(
            "Product не найден после transaction"
        );
    }

    const batchesAfter =
        await prisma.batch.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: {
                id: "asc",
            },
        });

    const movementsAfter =
        await prisma.movement.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: {
                id: "asc",
            },
        });

    const orderItemsAfter =
        await prisma.orderItem.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: {
                id: "asc",
            },
        });

    const invalidOrderBatchIdsAfter =
        await prisma.orderBatch.findMany({
            where: {
                id: {
                    in:
                        INVALID_ORDER_BATCHES.map(
                            (item) =>
                                item.orderBatchId
                        ),
                },
            },
            select: {
                id: true,
            },
        });

    if (
        invalidOrderBatchIdsAfter.length !==
        0
    ) {
        throw new Error(
            "Некоторые неправильные OrderBatch всё ещё существуют"
        );
    }

    const returnBatchAfter =
        await prisma.returnBatch.findMany({
            where: {
                id: {
                    in:
                        RETURN_BATCH_REPAIRS.map(
                            (item) =>
                                item.returnBatchId
                        ),
                },
            },
            orderBy: {
                id: "asc",
            },
        });

    for (const repair of RETURN_BATCH_REPAIRS) {
        const found =
            returnBatchAfter.find(
                (item) =>
                    item.id ===
                    repair.returnBatchId
            );

        if (!found) {
            throw new Error(
                `ReturnBatch #${repair.returnBatchId} ` +
                `не найден после repair`
            );
        }

        if (
            found.batchId !==
            repair.expectedBatchId
        ) {
            throw new Error(
                `ReturnBatch #${repair.returnBatchId}: ` +
                `ожидался Batch #${repair.expectedBatchId}, ` +
                `получен #${found.batchId}`
            );
        }
    }

    console.log("");

    console.log("🗑️ OrderBatch");
    console.log(
        "  ✅ 7 неправильных OrderBatch удалены"
    );

    console.log("");

    console.log("↩️ ReturnBatch");

    for (const repair of RETURN_BATCH_REPAIRS) {
        console.log(
            `  ✅ #${repair.returnBatchId}: ` +
            `Batch #${repair.expectedBatchId}`
        );
    }

    console.log("");

    console.log("💰 Batch cost");

    for (const repair of BATCH_COST_REPAIRS) {
        const batch =
            batchesAfter.find(
                (item) =>
                    item.id === repair.batchId
            );

        if (!batch) {
            throw new Error(
                `Batch #${repair.batchId} ` +
                `не найден после repair`
            );
        }

        console.log(
            `  ✅ Batch #${batch.id}: ` +
            `${batch.purchaseCost} ₽`
        );
    }

    // ============================================================
    // CONTROL
    // ============================================================

    console.log("");

    console.log("----------------------------------------");
    console.log("🛡️ КОНТРОЛЬ НЕИЗМЕНЁННЫХ ДАННЫХ");
    console.log("----------------------------------------");

    if (
        productAfter.stock !==
        productBefore.stock
    ) {
        throw new Error(
            `Product.stock изменился: ` +
            `${productBefore.stock} -> ` +
            `${productAfter.stock}`
        );
    }

    console.log(
        `✅ Product.stock: ` +
        `${productBefore.stock} -> ` +
        `${productAfter.stock}`
    );

    for (const batchBefore of batchesBefore) {
        const batchAfter =
            batchesAfter.find(
                (batch) =>
                    batch.id === batchBefore.id
            );

        if (!batchAfter) {
            throw new Error(
                `Batch #${batchBefore.id} ` +
                `исчез после repair`
            );
        }

        const expectedQuantity =
            batchQuantityBefore.get(
                batchBefore.id
            );

        if (
            batchAfter.quantity !==
            expectedQuantity
        ) {
            throw new Error(
                `Batch #${batchBefore.id}: ` +
                `quantity изменился ` +
                `${expectedQuantity} -> ` +
                `${batchAfter.quantity}`
            );
        }
    }

    console.log(
        "✅ Batch.quantity не изменялся"
    );

    // ============================================================
    // MOVEMENT CONTROL
    // ============================================================

    if (
        movementsAfter.length !==
        movementSnapshotBefore.length
    ) {
        throw new Error(
            "Количество Movement изменилось"
        );
    }

    for (const before of movementSnapshotBefore) {
        const after =
            movementsAfter.find(
                (movement) =>
                    movement.id === before.id
            );

        if (!after) {
            throw new Error(
                `Movement #${before.id} исчез`
            );
        }

        if (
            after.quantity !==
                before.quantity ||
            after.type !==
                before.type ||
            after.comment !==
                before.comment ||
            after.createdAt.getTime() !==
                before.createdAt ||
            after.productId !==
                before.productId
        ) {
            throw new Error(
                `Movement #${before.id} был изменён`
            );
        }
    }

    console.log(
        "✅ Movement не изменялись"
    );

    // ============================================================
    // ORDER ITEM CONTROL
    // ============================================================

    if (
        orderItemsAfter.length !==
        orderItemSnapshotBefore.length
    ) {
        throw new Error(
            "Количество OrderItem изменилось"
        );
    }

    for (const before of orderItemSnapshotBefore) {
        const after =
            orderItemsAfter.find(
                (item) =>
                    item.id === before.id
            );

        if (!after) {
            throw new Error(
                `OrderItem #${before.id} исчез`
            );
        }

        if (
            after.quantity !==
                before.quantity ||
            after.price !==
                before.price ||
            after.productId !==
                before.productId
        ) {
            throw new Error(
                `OrderItem #${before.id} был изменён`
            );
        }
    }

    console.log(
        "✅ OrderItem не изменялись"
    );

    // ============================================================
    // FINAL STOCK
    // ============================================================

    const sumBatchQuantity =
        batchesAfter.reduce(
            (sum, batch) =>
                sum + batch.quantity,
            0
        );

    console.log("");

    console.log("----------------------------------------");
    console.log("📦 ИТОГОВЫЙ ОСТАТОК");
    console.log("----------------------------------------");

    console.log(
        `Product.stock: ${productAfter.stock}`
    );

    console.log(
        `SUM Batch.quantity: ${sumBatchQuantity}`
    );

    if (
        productAfter.stock !==
        sumBatchQuantity
    ) {
        throw new Error(
            `Product.stock != SUM Batch.quantity: ` +
            `${productAfter.stock} != ` +
            `${sumBatchQuantity}`
        );
    }

    console.log(
        "✅ Product.stock = SUM Batch.quantity"
    );

    console.log("");

    console.log("========================================");
    console.log("🏁 ИСПРАВЛЕНИЕ ЗАВЕРШЕНО");
    console.log("========================================");

    console.log("");

    console.log("Исправлено:");
    console.log(
        "  • 7 неправильных OrderBatch удалены"
    );
    console.log(
        "  • ReturnBatch #2 -> Batch #14"
    );
    console.log(
        "  • ReturnBatch #3 -> Batch #14"
    );
    console.log(
        "  • ReturnBatch #4 -> Batch #14"
    );
    console.log(
        "  • Batch #13 purchaseCost -> 200 ₽"
    );
    console.log(
        "  • Batch #14 purchaseCost -> 200 ₽"
    );

    console.log("");

    console.log("НЕ изменялось:");
    console.log("  • OrderItem");
    console.log("  • Batch.quantity");
    console.log("  • Product.stock");
    console.log("  • Movement");
    console.log("  • Order.total");
    console.log("  • Order.profit");
    console.log("  • Order.status");

    console.log("");

    console.log(
        "⚠️ Следующий шаг — повторный полный аудит Творога."
    );
}

main()
    .catch((error) => {
        console.error("");
        console.error("========================================");
        console.error("❌ ОШИБКА");
        console.error("========================================");
        console.error("");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });