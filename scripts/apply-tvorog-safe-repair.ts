import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

/**
 * ТВОРОГ — БЕЗОПАСНОЕ ВОССТАНОВЛЕНИЕ ORDERBATCH
 *
 * ВАЖНО:
 * - изменяются ТОЛЬКО подтверждённые историческим FIFO связи;
 * - 9 шт. неразрешённых продаж НЕ трогаются;
 * - старые неопределённые OrderBatch НЕ удаляются;
 * - ReturnBatch НЕ изменяются;
 * - Batch.current НЕ изменяется;
 * - Product.stock НЕ изменяется;
 * - Movement НЕ изменяется.
 *
 * Особый случай:
 *
 * Order #24 / OrderItem #36
 *
 * Сейчас:
 *   Batch #14 -> 1 шт
 *   Batch #15 -> 10 шт
 *
 * Исторический FIFO:
 *   Batch #13 -> 10 шт
 *   Batch #14 -> 2 шт
 *
 * Поэтому существующие связи этого OrderItem
 * сначала удаляются и создаются заново.
 *
 * Все остальные безопасные связи создаются только
 * если для соответствующего OrderItem их ещё нет.
 */

type PlannedLink = {
    orderId: number;
    orderItemId: number;
    batchId: number;
    quantity: number;
    purchaseCost: number;
    reason: string;
};

const SAFE_PLAN: PlannedLink[] = [
    // Order #24 / OrderItem #36
    // Полностью заменяем существующую неправильную раскладку.
    {
        orderId: 24,
        orderItemId: 36,
        batchId: 13,
        quantity: 10,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #14 → Batch #13",
    },
    {
        orderId: 24,
        orderItemId: 36,
        batchId: 14,
        quantity: 2,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #15 → Batch #14",
    },

    // Order #25
    {
        orderId: 25,
        orderItemId: 37,
        batchId: 14,
        quantity: 1,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #15 → Batch #14",
    },

    // Order #52
    {
        orderId: 52,
        orderItemId: 64,
        batchId: 14,
        quantity: 2,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #15 → Batch #14",
    },

    // Order #53
    {
        orderId: 53,
        orderItemId: 65,
        batchId: 14,
        quantity: 2,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #15 → Batch #14",
    },

    // Order #54
    {
        orderId: 54,
        orderItemId: 66,
        batchId: 14,
        quantity: 2,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #15 → Batch #14",
    },

    // Order #55
    {
        orderId: 55,
        orderItemId: 67,
        batchId: 14,
        quantity: 1,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #15 → Batch #14",
    },

    // Order #56
    {
        orderId: 56,
        orderItemId: 68,
        batchId: 15,
        quantity: 1,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #16 → Batch #15",
    },

    // Order #57
    {
        orderId: 57,
        orderItemId: 69,
        batchId: 15,
        quantity: 1,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #16 → Batch #15",
    },

    // Order #58
    {
        orderId: 58,
        orderItemId: 70,
        batchId: 15,
        quantity: 1,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #16 → Batch #15",
    },

    // Order #59
    {
        orderId: 59,
        orderItemId: 71,
        batchId: 15,
        quantity: 3,
        purchaseCost: 200,
        reason: "Исторический FIFO: SupplyItem #16 → Batch #15",
    },
];

async function main() {
    console.log("");
    console.log("========================================");
    console.log("");
    console.log("🧀 ТВОРОГ — БЕЗОПАСНОЕ ВОССТАНОВЛЕНИЕ");
    console.log("       ORDERBATCH");
    console.log("");
    console.log("========================================");
    console.log("");
    console.log("⚠️ ЭТОТ СКРИПТ ИЗМЕНЯЕТ БАЗУ ДАННЫХ");
    console.log("");
    console.log("Изменяются только подтверждённые связи.");
    console.log("Неразрешённые продажи НЕ изменяются.");
    console.log("ReturnBatch НЕ изменяются.");
    console.log("Batch.current НЕ изменяется.");
    console.log("Product.stock НЕ изменяется.");
    console.log("Movement НЕ изменяется.");
    console.log("");

    const product = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    if (!product) {
        throw new Error(`Product #${PRODUCT_ID} не найден`);
    }

    console.log(`Товар: #${product.id} ${product.name}`);
    console.log(`Product.stock: ${product.stock}`);
    console.log("");

    /**
     * ---------------------------------------------------------
     * 1. ПРОВЕРКА ВСЕХ ORDERITEM
     * ---------------------------------------------------------
     */

    const orderItemIds = [
        ...new Set(SAFE_PLAN.map((x) => x.orderItemId)),
    ];

    const orderItems = await prisma.orderItem.findMany({
        where: {
            id: {
                in: orderItemIds,
            },
        },
        include: {
            product: true,
            order: true,
            batches: true,
        },
        orderBy: {
            id: "asc",
        },
    });

    console.log("----------------------------------------");
    console.log("🔎 ПРОВЕРКА ORDERITEM");
    console.log("----------------------------------------");
    console.log("");

    for (const planned of SAFE_PLAN) {
        const item = orderItems.find(
            (x) => x.id === planned.orderItemId,
        );

        if (!item) {
            throw new Error(
                `OrderItem #${planned.orderItemId} не найден`,
            );
        }

        if (item.productId !== PRODUCT_ID) {
            throw new Error(
                `OrderItem #${item.id} относится к Product #${item.productId}, ` +
                `а не к Product #${PRODUCT_ID}`,
            );
        }

        if (item.orderId !== planned.orderId) {
            throw new Error(
                `OrderItem #${item.id}: ожидался Order #${planned.orderId}, ` +
                `но фактически Order #${item.orderId}`,
            );
        }
    }

    console.log("✅ Все OrderItem существуют и относятся к Творогу");
    console.log("");

    /**
     * ---------------------------------------------------------
     * 2. ПРОВЕРКА BATCH
     * ---------------------------------------------------------
     */

    const batchIds = [
        ...new Set(SAFE_PLAN.map((x) => x.batchId)),
    ];

    const batches = await prisma.batch.findMany({
        where: {
            id: {
                in: batchIds,
            },
        },
        orderBy: {
            id: "asc",
        },
    });

    console.log("----------------------------------------");
    console.log("📦 ПРОВЕРКА BATCH");
    console.log("----------------------------------------");
    console.log("");

    for (const planned of SAFE_PLAN) {
        const batch = batches.find(
            (x) => x.id === planned.batchId,
        );

        if (!batch) {
            throw new Error(
                `Batch #${planned.batchId} не найден`,
            );
        }

        if (batch.productId !== PRODUCT_ID) {
            throw new Error(
                `Batch #${batch.id} относится к Product #${batch.productId}`,
            );
        }

        console.log(
            `Batch #${batch.id} | current=${batch.quantity} | ` +
            `cost=${batch.purchaseCost} ₽ | ` +
            `quantity=${planned.quantity} шт`,
        );
    }

    console.log("");
    console.log("✅ Все необходимые Batch существуют");
    console.log("");

    /**
     * ---------------------------------------------------------
     * 3. ПРОВЕРКА RETURNBATCH
     * ---------------------------------------------------------
     *
     * Мы их не меняем, но убеждаемся, что для возвращённых
     * OrderItem существуют соответствующие ReturnBatch.
     */

    const returnedOrderItemIds = [
        65,
        66,
        67,
        68,
        70,
        71,
    ];

    const returnBatches = await prisma.returnBatch.findMany({
        where: {
            orderItemId: {
                in: returnedOrderItemIds,
            },
        },
        orderBy: {
            id: "asc",
        },
    });

    console.log("----------------------------------------");
    console.log("↩️ ПРОВЕРКА RETURNBATCH");
    console.log("----------------------------------------");
    console.log("");

    for (const orderItemId of returnedOrderItemIds) {
        const rows = returnBatches.filter(
            (x) => x.orderItemId === orderItemId,
        );

        if (rows.length === 0) {
            throw new Error(
                `Для OrderItem #${orderItemId} не найден ReturnBatch`,
            );
        }

        console.log(
            `OrderItem #${orderItemId}: ReturnBatch = ${rows.length}`,
        );
    }

    console.log("");
    console.log("✅ ReturnBatch существуют");
    console.log("⚠️ ReturnBatch изменяться НЕ будут");
    console.log("");

    /**
     * ---------------------------------------------------------
     * 4. ПОКАЗЫВАЕМ ПЛАН
     * ---------------------------------------------------------
     */

    console.log("----------------------------------------");
    console.log("🧮 ПЛАН ИЗМЕНЕНИЙ");
    console.log("----------------------------------------");
    console.log("");

    for (const planned of SAFE_PLAN) {
        console.log(
            `Order #${planned.orderId} | ` +
            `OrderItem #${planned.orderItemId} | ` +
            `Batch #${planned.batchId} | ` +
            `${planned.quantity} шт × ${planned.purchaseCost} ₽`,
        );

        console.log(
            `  ${planned.reason}`,
        );

        console.log("");
    }

    const totalQuantity = SAFE_PLAN.reduce(
        (sum, x) => sum + x.quantity,
        0,
    );

    console.log(
        `Всего подтверждённого количества: ${totalQuantity} шт`,
    );

    console.log("");

    /**
     * ---------------------------------------------------------
     * 5. TRANSACTION
     * ---------------------------------------------------------
     */

    console.log("----------------------------------------");
    console.log("💾 НАЧИНАЕМ TRANSACTION");
    console.log("----------------------------------------");
    console.log("");

    await prisma.$transaction(
        async (tx) => {
            /**
             * =====================================================
             * ORDER #24 / ITEM #36
             * =====================================================
             *
             * Здесь существующие связи исторически неверны:
             *
             * Batch #14 -> 1
             * Batch #15 -> 10
             *
             * Должно быть:
             *
             * Batch #13 -> 10
             * Batch #14 -> 2
             *
             * Поэтому удаляем ТОЛЬКО OrderBatch этого
             * конкретного OrderItem и строим заново.
             */

            const order24Item = 36;

            const existingOrder24Batches =
                await tx.orderBatch.findMany({
                    where: {
                        orderItemId: order24Item,
                    },
                });

            console.log(
                `OrderItem #${order24Item}: найдено старых OrderBatch = ` +
                `${existingOrder24Batches.length}`,
            );

            for (const existing of existingOrder24Batches) {
                console.log(
                    `  удаляем OrderBatch #${existing.id} | ` +
                    `Batch #${existing.batchId} | ` +
                    `${existing.quantity} шт`,
                );
            }

            if (existingOrder24Batches.length > 0) {
                await tx.orderBatch.deleteMany({
                    where: {
                        orderItemId: order24Item,
                    },
                });
            }

            /**
             * Создаём правильные две связи для Order #24.
             */

            const order24Plan = SAFE_PLAN.filter(
                (x) => x.orderItemId === order24Item,
            );

            for (const planned of order24Plan) {
                await tx.orderBatch.create({
                    data: {
                        orderItemId: planned.orderItemId,
                        batchId: planned.batchId,
                        quantity: planned.quantity,
                        purchaseCost: planned.purchaseCost,
                    },
                });

                console.log(
                    `  ✅ создан OrderBatch: ` +
                    `OrderItem #${planned.orderItemId} → ` +
                    `Batch #${planned.batchId} → ` +
                    `${planned.quantity} шт`,
                );
            }

            /**
             * =====================================================
             * ОСТАЛЬНЫЕ БЕЗОПАСНЫЕ СВЯЗИ
             * =====================================================
             *
             * Здесь существующие связи НЕ удаляем.
             *
             * Если связь уже есть — проверяем её.
             * Если связи нет — создаём.
             */

            const otherPlan = SAFE_PLAN.filter(
                (x) => x.orderItemId !== order24Item,
            );

            for (const planned of otherPlan) {
                const existing = await tx.orderBatch.findFirst({
                    where: {
                        orderItemId: planned.orderItemId,
                        batchId: planned.batchId,
                    },
                });

                if (existing) {
                    if (
                        existing.quantity !== planned.quantity ||
                        existing.purchaseCost !== planned.purchaseCost
                    ) {
                        throw new Error(
                            `Конфликт OrderBatch #${existing.id}: ` +
                            `ожидалось ${planned.quantity} шт × ` +
                            `${planned.purchaseCost} ₽, ` +
                            `но сейчас ${existing.quantity} шт × ` +
                            `${existing.purchaseCost} ₽`,
                        );
                    }

                    console.log(
                        `  🟢 уже существует: OrderBatch #${existing.id} | ` +
                        `OrderItem #${planned.orderItemId} → ` +
                        `Batch #${planned.batchId} → ` +
                        `${planned.quantity} шт`,
                    );

                    continue;
                }

                await tx.orderBatch.create({
                    data: {
                        orderItemId: planned.orderItemId,
                        batchId: planned.batchId,
                        quantity: planned.quantity,
                        purchaseCost: planned.purchaseCost,
                    },
                });

                console.log(
                    `  ✅ создан: OrderItem #${planned.orderItemId} → ` +
                    `Batch #${planned.batchId} → ` +
                    `${planned.quantity} шт`,
                );
            }
        },
        {
            maxWait: 10_000,
            timeout: 30_000,
        },
    );

    console.log("");
    console.log("----------------------------------------");
    console.log("✅ TRANSACTION УСПЕШНО ЗАВЕРШЁН");
    console.log("----------------------------------------");
    console.log("");

    /**
     * ---------------------------------------------------------
     * 6. ПОСЛЕПРОВЕРОЧНЫЙ АУДИТ
     * ---------------------------------------------------------
     */

    console.log("----------------------------------------");
    console.log("🔎 ПОСЛЕПРОВЕРОЧНЫЙ АУДИТ");
    console.log("----------------------------------------");
    console.log("");

    const checkItemIds = [
        ...new Set(SAFE_PLAN.map((x) => x.orderItemId)),
    ];

    const checkItems = await prisma.orderItem.findMany({
        where: {
            id: {
                in: checkItemIds,
            },
        },
        include: {
            batches: {
                include: {
                    batch: true,
                },
            },
        },
        orderBy: {
            id: "asc",
        },
    });

    let checkQuantity = 0;

    for (const item of checkItems) {
        console.log(
            `OrderItem #${item.id} | quantity=${item.quantity}`,
        );

        for (const link of item.batches) {
            console.log(
                `  → Batch #${link.batchId} | ` +
                `${link.quantity} шт × ${link.purchaseCost} ₽`,
            );

            checkQuantity += link.quantity;
        }

        console.log("");
    }

    console.log(
        `Всего проверено OrderBatch количества: ${checkQuantity} шт`,
    );

    console.log("");

    /**
     * ---------------------------------------------------------
     * 7. КОНТРОЛЬ STOCK
     * ---------------------------------------------------------
     */

    const productAfter = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    const batchesAfter = await prisma.batch.findMany({
        where: {
            productId: PRODUCT_ID,
        },
        orderBy: {
            id: "asc",
        },
    });

    const batchStock = batchesAfter.reduce(
        (sum, batch) => sum + batch.quantity,
        0,
    );

    console.log("----------------------------------------");
    console.log("📦 КОНТРОЛЬ ОСТАТКА");
    console.log("----------------------------------------");
    console.log("");

    console.log(
        `Product.stock: ${productAfter?.stock}`,
    );

    console.log(
        `SUM Batch.current: ${batchStock}`,
    );

    console.log("");

    /**
     * Мы намеренно НЕ меняли stock.
     *
     * Поэтому эти значения должны остаться такими же,
     * какими были до запуска.
     */

    if (productAfter?.stock !== product.stock) {
        throw new Error(
            `Product.stock неожиданно изменился: ` +
            `${product.stock} → ${productAfter?.stock}`,
        );
    }

    if (batchStock !== 10) {
        console.warn(
            `⚠️ SUM Batch.current сейчас ${batchStock}, ` +
            `ожидалось 10`,
        );
    }

    console.log("✅ Product.stock не изменён");
    console.log("✅ Batch.current не изменён");
    console.log("");

    /**
     * ---------------------------------------------------------
     * 8. ФИНАЛ
     * ---------------------------------------------------------
     */

    console.log("========================================");
    console.log("");
    console.log("🏁 ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО");
    console.log("");
    console.log("========================================");
    console.log("");

    console.log("Изменено:");
    console.log("  • подтверждённые OrderBatch");
    console.log("");

    console.log("НЕ изменялось:");
    console.log("  • неразрешённые продажи: 9 шт");
    console.log("  • ReturnBatch");
    console.log("  • Batch.current");
    console.log("  • Product.stock");
    console.log("  • Movement");
    console.log("");

    console.log(
        "⚠️ Следующий шаг — повторный аудит Творога.",
    );
    console.log("");
}

main()
    .catch((error) => {
        console.error("");
        console.error("========================================");
        console.error("❌ ОШИБКА");
        console.error("========================================");
        console.error("");

        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });