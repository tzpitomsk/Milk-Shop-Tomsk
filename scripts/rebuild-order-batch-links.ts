import { prisma } from "../lib/prisma";

type BatchState = {
    id: number;
    productId: number;
    quantity: number;
    purchaseCost: number;
    receivedAt: Date;
    expiryDate: Date;
    status: string;
};

type Allocation = {
    batchId: number;
    quantity: number;
    purchaseCost: number;
};

async function main() {
    console.log("========================================");
    console.log("🔎 REBUILD ORDER → BATCH LINKS");
    console.log("========================================");
    console.log();
    console.log("⚠️ DRY RUN");
    console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
    console.log();

    await prisma.$connect();

    console.log("✅ Prisma работает");
    console.log();

    const products = await prisma.product.findMany({
        orderBy: {
            id: "asc",
        },
    });

    let totalOrders = 0;
    let totalAllocated = 0;
    let totalMissing = 0;

    for (const product of products) {
        console.log("========================================");
        console.log(`🥛 ТОВАР #${product.id}: ${product.name}`);
        console.log("========================================");
        console.log();

        const supplies = await prisma.supplyItem.findMany({
            where: {
                productId: product.id,
            },
            include: {
                supply: true,
            },
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
        });

        const existingBatches = await prisma.batch.findMany({
            where: {
                productId: product.id,
            },
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
        });

        const orderItems = await prisma.orderItem.findMany({
            where: {
                productId: product.id,
            },
            include: {
                order: true,
                batches: true,
            },
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
        });

        console.log(`📦 Поставок: ${supplies.length}`);
        console.log(`🧱 Batch: ${existingBatches.length}`);
        console.log(`🛒 Продаж: ${orderItems.length}`);
        console.log();

        if (supplies.length === 0 && orderItems.length === 0) {
            console.log("ℹ️ Данных для восстановления нет");
            console.log();
            continue;
        }

        /*
         * ------------------------------------------------------------
         * СОЗДАЁМ В ПАМЯТИ FIFO-ПУЛ ПОСТАВОК
         * ------------------------------------------------------------
         *
         * Важный момент:
         *
         * Мы НЕ используем текущее Batch.quantity.
         *
         * Историческое Batch.quantity сейчас повреждено.
         *
         * Вместо этого количество каждой партии берём непосредственно
         * из SupplyItem.quantity.
         */

        const fifoBatches: BatchState[] = [];

        for (const supplyItem of supplies) {
            const matchingBatches = existingBatches.filter(
                (batch) =>
                    batch.receivedAt.getTime() >=
                    supplyItem.supply.date.getTime() - 5000 &&
                    batch.receivedAt.getTime() <=
                    supplyItem.supply.date.getTime() + 5000
            );

            const matchingBatch =
                matchingBatches.length > 0
                    ? matchingBatches[0]
                    : null;

            if (matchingBatch) {
                fifoBatches.push({
                    id: matchingBatch.id,
                    productId: product.id,
                    quantity: supplyItem.quantity,
                    purchaseCost: supplyItem.cost,
                    receivedAt: matchingBatch.receivedAt,
                    expiryDate: matchingBatch.expiryDate,
                    status: matchingBatch.status,
                });
            } else {
                /*
                 * Если Batch не найден, создаём виртуальную партию.
                 *
                 * id = -SupplyItem.id
                 *
                 * Это НЕ реальный ID.
                 * Он нужен только для DRY RUN.
                 */

                fifoBatches.push({
                    id: -supplyItem.id,
                    productId: product.id,
                    quantity: supplyItem.quantity,
                    purchaseCost: supplyItem.cost,
                    receivedAt: supplyItem.supply.date,
                    expiryDate: new Date("9999-12-31T00:00:00.000Z"),
                    status: "MISSING_BATCH",
                });
            }
        }

        /*
         * ------------------------------------------------------------
         * FIFO
         * ------------------------------------------------------------
         *
         * Сначала срок годности.
         * Затем дата поступления.
         * Затем ID партии.
         */

        fifoBatches.sort((a, b) => {
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

        console.log("📋 FIFO ПАРТИИ");
        console.log();

        for (const batch of fifoBatches) {
            console.log(
                `  Batch #${batch.id}: ${batch.quantity} шт × ${batch.purchaseCost} ₽`
            );

            console.log(
                `    expiry=${batch.expiryDate.toISOString()}`
            );

            if (batch.id < 0) {
                console.log(
                    "    ⚠️ Реальный Batch отсутствует"
                );
            }
        }

        console.log();

        /*
         * ------------------------------------------------------------
         * ВОССТАНАВЛИВАЕМ ПРОДАЖИ
         * ------------------------------------------------------------
         */

        for (const item of orderItems) {
            totalOrders++;

            const alreadyLinked = item.batches.reduce(
                (sum, link) => sum + link.quantity,
                0
            );

            console.log(
                `🛒 Order #${item.orderId}, OrderItem #${item.id}`
            );

            console.log(
                `   Продано: ${item.quantity}`
            );

            console.log(
                `   Уже связано: ${alreadyLinked}`
            );

            /*
             * Если OrderBatch уже полностью существует,
             * ничего не предлагаем менять.
             */

            if (alreadyLinked === item.quantity) {
                console.log(
                    "   ✅ OrderBatch уже полностью заполнен"
                );
                console.log();
                continue;
            }

            if (alreadyLinked > item.quantity) {
                console.log(
                    "   🔴 OrderBatch содержит больше товара, чем продажа"
                );
                console.log();
                continue;
            }

            const needToAllocate =
                item.quantity - alreadyLinked;

            console.log(
                `   🔧 Нужно восстановить: ${needToAllocate}`
            );

            /*
             * Для DRY RUN создаём локальную копию партий.
             *
             * Это позволяет последующие продажи распределять
             * остаток FIFO, не изменяя БД.
             */

            let remainingToAllocate =
                needToAllocate;

            const allocations: Allocation[] = [];

            for (const batch of fifoBatches) {
                if (remainingToAllocate <= 0) {
                    break;
                }

                if (batch.quantity <= 0) {
                    continue;
                }

                /*
                 * Уже существующие OrderBatch этой партии
                 * нужно учитывать, чтобы не продавать одну
                 * и ту же партию дважды.
                 */

                const alreadySoldFromBatch =
                    await prisma.orderBatch.aggregate({
                        where: {
                            batchId: batch.id > 0 ? batch.id : -999999999,
                        },
                        _sum: {
                            quantity: true,
                        },
                    });

                const soldFromBatch =
                    alreadySoldFromBatch._sum.quantity ?? 0;

                /*
                 * Возвраты возвращают товар обратно в партию.
                 *
                 * Поэтому при восстановлении учитываем ReturnBatch.
                 */

                const alreadyReturnedToBatch =
                    await prisma.returnBatch.aggregate({
                        where: {
                            batchId: batch.id > 0 ? batch.id : -999999999,
                        },
                        _sum: {
                            quantity: true,
                        },
                    });

                const returnedToBatch =
                    alreadyReturnedToBatch._sum.quantity ?? 0;

                const available =
                    batch.quantity -
                    soldFromBatch +
                    returnedToBatch;

                if (available <= 0) {
                    continue;
                }

                const take =
                    Math.min(
                        available,
                        remainingToAllocate
                    );

                allocations.push({
                    batchId: batch.id,
                    quantity: take,
                    purchaseCost: batch.purchaseCost,
                });

                remainingToAllocate -= take;
                totalAllocated += take;
            }

            if (allocations.length === 0) {
                console.log(
                    "   🔴 Не удалось найти подходящую партию"
                );
                totalMissing +=
                    remainingToAllocate;
                console.log();
                continue;
            }

            for (const allocation of allocations) {
                if (allocation.batchId < 0) {
                    console.log(
                        `   ⚠️ Batch отсутствует: виртуальный Batch #${allocation.batchId}`
                    );

                    console.log(
                        `      ${allocation.quantity} шт`
                    );

                    continue;
                }

                console.log(
                    `   ➕ OrderBatch → Batch #${allocation.batchId}: ${allocation.quantity} шт × ${allocation.purchaseCost} ₽`
                );
            }

            if (remainingToAllocate > 0) {
                console.log(
                    `   🔴 НЕ ХВАТИЛО: ${remainingToAllocate} шт`
                );

                totalMissing +=
                    remainingToAllocate;
            }

            console.log();
        }

        /*
         * ------------------------------------------------------------
         * ИТОГ ПО ТОВАРУ
         * ------------------------------------------------------------
         */

        console.log(
            `📊 Товар "${product.name}" обработан`
        );

        console.log();
    }

    console.log("========================================");
    console.log("📊 ИТОГ DRY RUN");
    console.log("========================================");
    console.log();

    console.log(
        `Продаж проверено: ${totalOrders}`
    );

    console.log(
        `Количество товара распределено: ${totalAllocated}`
    );

    console.log(
        `Не удалось распределить: ${totalMissing}`
    );

    console.log();

    if (totalMissing === 0) {
        console.log(
            "🟢 Все продажи удалось распределить по FIFO"
        );
    } else {
        console.log(
            "🔴 Есть продажи, которые нельзя безопасно восстановить автоматически"
        );
    }

    console.log();

    console.log(
        "⚠️ DRY RUN ЗАВЕРШЁН"
    );

    console.log(
        "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ"
    );

    console.log();

    await prisma.$disconnect();
}

main()
    .catch((error) => {
        console.error();
        console.error("========================================");
        console.error("🔴 ОШИБКА");
        console.error("========================================");
        console.error();
        console.error(error);
        process.exit(1);
    });