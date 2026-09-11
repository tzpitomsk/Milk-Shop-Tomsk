import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BatchInfo = {
    id: number;
    quantity: number;
    purchaseCost: number;
    receivedAt: Date;
    expiryDate: Date;
    status: string;
};

type SupplyInfo = {
    id: number;
    quantity: number;
    cost: number;
    supplyId: number;
    supplyDate: Date;
};

async function main() {
    console.log("🔎 БЕЗОПАСНЫЙ АУДИТ FIFO");
    console.log("⚠️ База данных НЕ изменяется\n");

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

    let grandSupplied = 0;
    let grandSold = 0;
    let grandReturned = 0;
    let grandStock = 0;
    let grandExpectedStock = 0;

    for (const product of products) {
        console.log("\n");
        console.log("========================================");
        console.log(`🥛 ТОВАР №${product.id}: ${product.name}`);
        console.log("========================================");

        const batches: BatchInfo[] = product.batches.map((batch) => ({
            id: batch.id,
            quantity: batch.quantity,
            purchaseCost: batch.purchaseCost,
            receivedAt: batch.receivedAt,
            expiryDate: batch.expiryDate,
            status: batch.status,
        }));

        const supplies: SupplyInfo[] = product.supplyItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            cost: item.cost,
            supplyId: item.supplyId,
            supplyDate: item.supply.date,
        }));

        const suppliedQuantity = supplies.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        const soldQuantity = product.orderItems.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        const returnedQuantity = product.orderItems.reduce(
            (sum, item) => sum + item.returned,
            0
        );

        const realSoldQuantity =
            soldQuantity - returnedQuantity;

        const batchStock = batches.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        const expectedStock =
            suppliedQuantity - realSoldQuantity;

        const difference =
            batchStock - expectedStock;

        /*
         * ----------------------------------------
         * SUPPLIES
         * ----------------------------------------
         */

        console.log("\n📦 ПОСТАВКИ:");

        if (supplies.length === 0) {
            console.log("  Нет поставок");
        }

        for (const supply of supplies) {
            console.log(
                `  SupplyItem #${supply.id}: ` +
                `Supply #${supply.supplyId}, ` +
                `${supply.quantity} шт × ${supply.cost} ₽, ` +
                `${supply.supplyDate.toISOString()}`
            );
        }

        console.log(
            `  ИТОГО ПОСТАВЛЕНО: ${suppliedQuantity} шт`
        );

        /*
         * ----------------------------------------
         * BATCHES
         * ----------------------------------------
         */

        console.log("\n📦 ПАРТИИ:");

        if (batches.length === 0) {
            console.log("  ❌ ПАРТИЙ НЕТ");
        }

        for (const batch of batches) {
            console.log(
                `  Batch #${batch.id}: ` +
                `остаток=${batch.quantity}, ` +
                `закупка=${batch.purchaseCost} ₽, ` +
                `получена=${batch.receivedAt.toISOString()}, ` +
                `срок=${batch.expiryDate.toISOString()}, ` +
                `status=${batch.status}`
            );
        }

        /*
         * ----------------------------------------
         * ORDER ITEMS
         * ----------------------------------------
         */

        console.log("\n🛒 ПРОДАЖИ:");

        if (product.orderItems.length === 0) {
            console.log("  Продаж нет");
        }

        for (const item of product.orderItems) {
            console.log(
                `  Order #${item.orderId}: ` +
                `продано=${item.quantity}, ` +
                `возвращено=${item.returned}, ` +
                `реально=${item.quantity - item.returned}, ` +
                `дата=${item.order.date.toISOString()}`
            );

            if (item.batches.length === 0) {
                console.log(
                    "    ⚠️ OrderBatch отсутствует"
                );
            } else {
                for (const orderBatch of item.batches) {
                    console.log(
                        `    ↳ OrderBatch #${orderBatch.id}: ` +
                        `Batch #${orderBatch.batchId}, ` +
                        `${orderBatch.quantity} шт × ` +
                        `${orderBatch.purchaseCost} ₽`
                    );
                }
            }

            if (item.ReturnBatch.length > 0) {
                for (const returned of item.ReturnBatch) {
                    console.log(
                        `    ↩ ReturnBatch #${returned.id}: ` +
                        `${returned.quantity} шт → ` +
                        `Batch #${returned.batchId}`
                    );
                }
            }
        }

        /*
         * ----------------------------------------
         * СОПОСТАВЛЕНИЕ SUPPLY → BATCH
         * ----------------------------------------
         *
         * Это ТОЛЬКО анализ.
         *
         * Ничего в БД не создаём.
         */

        console.log("\n🔗 ПРЕДПОЛАГАЕМОЕ СОПОСТАВЛЕНИЕ:");

        const unusedBatchIds = new Set(
            batches.map((batch) => batch.id)
        );

        const sortedBatches = [...batches].sort(
            (a, b) => {
                const diff =
                    a.receivedAt.getTime() -
                    b.receivedAt.getTime();

                if (diff !== 0) {
                    return diff;
                }

                return a.id - b.id;
            }
        );

        for (const supply of supplies) {
            const candidates = sortedBatches
                .filter((batch) =>
                    unusedBatchIds.has(batch.id)
                )
                .map((batch) => ({
                    batch,
                    distance: Math.abs(
                        batch.receivedAt.getTime() -
                        supply.supplyDate.getTime()
                    ),
                }))
                .sort((a, b) => {
                    if (a.distance !== b.distance) {
                        return a.distance - b.distance;
                    }

                    return a.batch.id - b.batch.id;
                });

            const candidate = candidates[0];

            if (!candidate) {
                console.log(
                    `  ❌ SupplyItem #${supply.id} ` +
                    `(${supply.quantity} шт × ${supply.cost} ₽)` +
                    ` → ПАРТИЯ НЕ НАЙДЕНА`
                );

                continue;
            }

            const hours =
                candidate.distance /
                (1000 * 60 * 60);

            console.log(
                `  SupplyItem #${supply.id} ` +
                `(${supply.quantity} шт × ${supply.cost} ₽)` +
                ` → Batch #${candidate.batch.id} ` +
                `(остаток ${candidate.batch.quantity}, ` +
                `закупка ${candidate.batch.purchaseCost} ₽, ` +
                `разница ${hours.toFixed(2)} ч)`
            );

            unusedBatchIds.delete(candidate.batch.id);
        }

        /*
         * ----------------------------------------
         * НЕСОПОСТАВЛЕННЫЕ BATCH
         * ----------------------------------------
         */

        const unmatchedBatches = batches.filter(
            (batch) => unusedBatchIds.has(batch.id)
        );

        if (unmatchedBatches.length > 0) {
            console.log(
                "\n⚠️ ПАРТИИ, КОТОРЫМ НЕ НАШЛИ SUPPLYITEM:"
            );

            for (const batch of unmatchedBatches) {
                console.log(
                    `  Batch #${batch.id}: ` +
                    `${batch.quantity} шт, ` +
                    `${batch.purchaseCost} ₽, ` +
                    `${batch.receivedAt.toISOString()}`
                );
            }
        }

        /*
         * ----------------------------------------
         * BALANCE
         * ----------------------------------------
         */

        console.log("\n📊 БАЛАНС:");

        console.log(
            `  Поставлено:        ${suppliedQuantity}`
        );

        console.log(
            `  Продано:           ${soldQuantity}`
        );

        console.log(
            `  Возвращено:        ${returnedQuantity}`
        );

        console.log(
            `  Реально продано:   ${realSoldQuantity}`
        );

        console.log(
            `  Ожидаемый остаток:  ${expectedStock}`
        );

        console.log(
            `  Batch.stock:       ${batchStock}`
        );

        console.log(
            `  Product.stock:     ${product.stock}`
        );

        if (difference === 0) {
            console.log(
                "  ✅ Баланс Batch совпадает с историей"
            );
        } else {
            console.log(
                `  ❌ РАСХОЖДЕНИЕ: ${difference}`
            );
        }

        if (product.stock === batchStock) {
            console.log(
                "  ✅ Product.stock = сумма Batch"
            );
        } else {
            console.log(
                `  ❌ Product.stock отличается от Batch на ` +
                `${product.stock - batchStock}`
            );
        }

        /*
         * ----------------------------------------
         * TOTALS
         * ----------------------------------------
         */

        grandSupplied += suppliedQuantity;
        grandSold += soldQuantity;
        grandReturned += returnedQuantity;
        grandStock += batchStock;
        grandExpectedStock += expectedStock;
    }

    /*
     * ========================================
     * ОБЩИЙ ИТОГ
     * ========================================
     */

    console.log("\n");
    console.log("========================================");
    console.log("📈 ОБЩИЙ ИТОГ");
    console.log("========================================");

    console.log(
        `📦 Всего поставлено:       ${grandSupplied}`
    );

    console.log(
        `🛒 Всего продано:          ${grandSold}`
    );

    console.log(
        `↩️ Всего возвращено:       ${grandReturned}`
    );

    console.log(
        `✅ Реально продано:        ${grandSold - grandReturned
        }`
    );

    console.log(
        `📊 Ожидаемый остаток:      ${grandExpectedStock}`
    );

    console.log(
        `📦 Остаток по Batch:       ${grandStock}`
    );

    console.log(
        `❗ Общее расхождение:      ${grandStock - grandExpectedStock
        }`
    );

    console.log("\n✅ Аудит завершён");
    console.log("⚠️ База данных не изменялась");
}

main()
    .catch((error) => {
        console.error("\n❌ ОШИБКА АУДИТА:");
        console.error(error);

        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });