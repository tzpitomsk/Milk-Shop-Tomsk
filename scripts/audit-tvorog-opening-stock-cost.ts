import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

const OPENING_ORDER_ID = 4;
const OPENING_ORDER_ITEM_ID = 7;

const FIRST_SUPPLY_ITEM_ID = 2;

function line(char = "=", length = 50) {
    console.log(char.repeat(length));
}

function money(value: number) {
    return `${value.toLocaleString("ru-RU")} ₽`;
}

function date(value: Date | string | null | undefined) {
    if (!value) return "—";
    return new Date(value).toISOString();
}

function minutesBetween(a: Date, b: Date) {
    return Math.round(
        Math.abs(a.getTime() - b.getTime()) / 1000 / 60,
    );
}

async function main() {
    console.log();

    line();

    console.log("🧀 ТВОРОГ — АУДИТ СЕБЕСТОИМОСТИ OPENING STOCK");

    line();

    console.log();

    console.log("⚠️ READ ONLY");
    console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");

    console.log();

    console.log(
        "Цель: определить, можно ли достоверно установить " +
            "себестоимость 1 шт., проданной до первой зарегистрированной поставки.",
    );

    console.log();

    console.log(`Product: #${PRODUCT_ID} ${PRODUCT_NAME}`);
    console.log(`Opening Order: #${OPENING_ORDER_ID}`);
    console.log(`Opening OrderItem: #${OPENING_ORDER_ITEM_ID}`);
    console.log(`First SupplyItem: #${FIRST_SUPPLY_ITEM_ID}`);

    /*
     * ============================================================
     * 1. PRODUCT
     * ============================================================
     */

    console.log();

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

    /*
     * ============================================================
     * 2. OPENING ORDER
     * ============================================================
     */

    console.log();

    line();

    console.log("2. OPENING ORDER");

    line();

    console.log();

    const openingOrder = await prisma.order.findUnique({
        where: {
            id: OPENING_ORDER_ID,
        },
        include: {
            items: {
                include: {
                    product: true,

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

    if (!openingOrder) {
        throw new Error(`Order #${OPENING_ORDER_ID} не найден`);
    }

    console.log(`Order #${openingOrder.id}`);
    console.log(`date=${date(openingOrder.date)}`);
    console.log(`status=${openingOrder.status}`);
    console.log(`total=${money(openingOrder.total)}`);
    console.log(`profit=${money(openingOrder.profit)}`);

    const openingItem = openingOrder.items.find(
        (item) => item.id === OPENING_ORDER_ITEM_ID,
    );

    if (!openingItem) {
        throw new Error(
            `OrderItem #${OPENING_ORDER_ITEM_ID} не найден в Order #${OPENING_ORDER_ID}`,
        );
    }

    if (openingItem.productId !== PRODUCT_ID) {
        throw new Error(
            `OrderItem #${OPENING_ORDER_ITEM_ID} относится к Product #${openingItem.productId}, ` +
                `а ожидался Product #${PRODUCT_ID}`,
        );
    }

    console.log();

    console.log(`OrderItem #${openingItem.id}`);
    console.log(`productId=${openingItem.productId}`);
    console.log(`quantity=${openingItem.quantity}`);
    console.log(`sale price=${money(openingItem.price)}`);

    console.log();

    console.log("OrderBatch:");

    if (openingItem.batches.length === 0) {
        console.log("  НЕТ");
    } else {
        for (const link of openingItem.batches) {
            console.log(
                `  OrderBatch #${link.id} | ` +
                    `Batch #${link.batchId} | ` +
                    `quantity=${link.quantity} | ` +
                    `purchaseCost=${money(link.purchaseCost)} | ` +
                    `Batch.receivedAt=${date(link.batch.receivedAt)}`,
            );
        }
    }

    console.log();

    console.log("ReturnBatch:");

    if (openingItem.ReturnBatch.length === 0) {
        console.log("  НЕТ");
    } else {
        for (const ret of openingItem.ReturnBatch) {
            console.log(
                `  ReturnBatch #${ret.id} | ` +
                    `Batch #${ret.batchId} | ` +
                    `quantity=${ret.quantity} | ` +
                    `createdAt=${date(ret.createdAt)}`,
            );
        }
    }

    /*
     * ============================================================
     * 3. FIRST SUPPLY
     * ============================================================
     */

    console.log();

    line();

    console.log("3. ПЕРВАЯ ЗАРЕГИСТРИРОВАННАЯ ПОСТАВКА");

    line();

    console.log();

    const firstSupplyItem = await prisma.supplyItem.findUnique({
        where: {
            id: FIRST_SUPPLY_ITEM_ID,
        },
        include: {
            supply: true,
        },
    });

    if (!firstSupplyItem) {
        throw new Error(
            `SupplyItem #${FIRST_SUPPLY_ITEM_ID} не найден`,
        );
    }

    if (firstSupplyItem.productId !== PRODUCT_ID) {
        throw new Error(
            `SupplyItem #${FIRST_SUPPLY_ITEM_ID} относится к Product #${firstSupplyItem.productId}`,
        );
    }

    const firstSupplyDate = new Date(firstSupplyItem.supply.date);

    console.log(`SupplyItem #${firstSupplyItem.id}`);
    console.log(`Supply #${firstSupplyItem.supplyId}`);
    console.log(`supply.date=${date(firstSupplyItem.supply.date)}`);
    console.log(`quantity=${firstSupplyItem.quantity}`);
    console.log(`cost=${money(firstSupplyItem.cost)}`);

    console.log(
        `Order #${OPENING_ORDER_ID} раньше первой поставки на ` +
            `${minutesBetween(
                new Date(openingOrder.date),
                firstSupplyDate,
            )} мин`,
    );

    /*
     * ============================================================
     * 4. ИСТОРИЯ ПОСТАВОК
     * ============================================================
     */

    console.log();

    line();

    console.log("4. ИСТОРИЯ ПОСТАВОК ВОКРУГ OPENING ORDER");

    line();

    console.log();

    const allSupplies = await prisma.supplyItem.findMany({
        where: {
            productId: PRODUCT_ID,
        },
        include: {
            supply: true,
        },
    });

    /*
     * SupplyItem не имеет createdAt.
     * Поэтому сортируем по Supply.date.
     */

    allSupplies.sort(
        (a, b) =>
            new Date(a.supply.date).getTime() -
            new Date(b.supply.date).getTime(),
    );

    const openingOrderDate = new Date(openingOrder.date);

    for (const supplyItem of allSupplies) {
        const supplyDate = new Date(supplyItem.supply.date);

        let marker = "  ";

        if (supplyDate < openingOrderDate) {
            marker = "🔵";
        } else if (
            supplyItem.id === FIRST_SUPPLY_ITEM_ID
        ) {
            marker = "🟢";
        } else if (supplyDate < firstSupplyDate) {
            marker = "🟠";
        }

        console.log(
            `${marker} SupplyItem #${supplyItem.id} | ` +
                `${date(supplyItem.supply.date)} | ` +
                `+${supplyItem.quantity} шт | ` +
                `cost=${money(supplyItem.cost)} | ` +
                `Supply #${supplyItem.supplyId}`,
        );
    }

    const suppliesBeforeOpeningOrder = allSupplies.filter(
        (supplyItem) =>
            new Date(supplyItem.supply.date).getTime() <
            openingOrderDate.getTime(),
    );

    console.log();

    console.log(
        `Поставок Творога ДО Order #${OPENING_ORDER_ID}: ` +
            `${suppliesBeforeOpeningOrder.length}`,
    );

    if (suppliesBeforeOpeningOrder.length === 0) {
        console.log(
            "  ❌ В зарегистрированной истории поставок ничего нет.",
        );
    } else {
        for (const supplyItem of suppliesBeforeOpeningOrder) {
            console.log(
                `  SupplyItem #${supplyItem.id} | ` +
                    `${date(supplyItem.supply.date)} | ` +
                    `${supplyItem.quantity} шт | ` +
                    `${money(supplyItem.cost)}`,
            );
        }
    }

    /*
     * ============================================================
     * 5. MOVEMENT HISTORY
     * ============================================================
     */

    console.log();

    line();

    console.log("5. MOVEMENT — ИСТОРИЯ ДВИЖЕНИЯ ТВОРОГА");

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

    console.log(
        `Всего Movement Творога: ${movements.length}`,
    );

    console.log();

    for (const movement of movements) {
        const movementDate = new Date(movement.createdAt);

        const beforeOpening =
            movementDate.getTime() <
            openingOrderDate.getTime();

        const aroundOpening =
            movementDate.getTime() >=
                openingOrderDate.getTime() &&
            movementDate.getTime() <=
                firstSupplyDate.getTime();

        let marker = "  ";

        if (beforeOpening) {
            marker = "🔵";
        } else if (aroundOpening) {
            marker = "🔴";
        }

        console.log(
            `${marker} Movement #${movement.id} | ` +
                `${date(movement.createdAt)} | ` +
                `type=${movement.type} | ` +
                `quantity=${movement.quantity} | ` +
                `comment=${movement.comment ?? "—"}`,
        );
    }

    /*
     * ============================================================
     * 6. MOVEMENTS BEFORE OPENING ORDER
     * ============================================================
     */

    console.log();

    line();

    console.log("6. MOVEMENT ДО OPENING ORDER");

    line();

    console.log();

    const movementsBeforeOpening = movements.filter(
        (movement) =>
            new Date(movement.createdAt).getTime() <
            openingOrderDate.getTime(),
    );

    if (movementsBeforeOpening.length === 0) {
        console.log(
            "❌ Movement Творога до Order #4 отсутствуют.",
        );
    } else {
        for (const movement of movementsBeforeOpening) {
            console.log(
                `Movement #${movement.id} | ` +
                    `${date(movement.createdAt)} | ` +
                    `type=${movement.type} | ` +
                    `quantity=${movement.quantity} | ` +
                    `comment=${movement.comment ?? "—"}`,
            );
        }
    }

    /*
     * ============================================================
     * 7. MOVEMENTS BETWEEN ORDER AND FIRST SUPPLY
     * ============================================================
     */

    console.log();

    line();

    console.log("7. MOVEMENT МЕЖДУ ORDER #4 И FIRST SUPPLY");

    line();

    console.log();

    const movementsAroundOpening = movements.filter(
        (movement) => {
            const t = new Date(
                movement.createdAt,
            ).getTime();

            return (
                t >= openingOrderDate.getTime() &&
                t <= firstSupplyDate.getTime()
            );
        },
    );

    if (movementsAroundOpening.length === 0) {
        console.log(
            "❌ Movement в этом временном интервале отсутствуют.",
        );
    } else {
        for (const movement of movementsAroundOpening) {
            console.log(
                `Movement #${movement.id} | ` +
                    `${date(movement.createdAt)} | ` +
                    `type=${movement.type} | ` +
                    `quantity=${movement.quantity} | ` +
                    `comment=${movement.comment ?? "—"}`,
            );
        }
    }

    /*
     * ============================================================
     * 8. BATCH HISTORY
     * ============================================================
     */

    console.log();

    line();

    console.log("8. BATCH ИСТОРИЯ ТВОРОГА");

    line();

    console.log();

    const batches = await prisma.batch.findMany({
        where: {
            productId: PRODUCT_ID,
        },
        orderBy: {
            receivedAt: "asc",
        },
    });

    for (const batch of batches) {
        const received = new Date(batch.receivedAt);

        let marker = "  ";

        if (received < openingOrderDate) {
            marker = "🟢";
        } else if (
            received >= openingOrderDate &&
            received < firstSupplyDate
        ) {
            marker = "🔴";
        }

        console.log(
            `${marker} Batch #${batch.id} | ` +
                `quantity=${batch.quantity} | ` +
                `cost=${money(batch.purchaseCost)} | ` +
                `received=${date(batch.receivedAt)} | ` +
                `expiry=${date(batch.expiryDate)} | ` +
                `status=${batch.status}`,
        );
    }

    const batchesBeforeOpening = batches.filter(
        (batch) =>
            new Date(batch.receivedAt).getTime() <
            openingOrderDate.getTime(),
    );

    console.log();

    console.log(
        `Batch Творога, поступивших ДО Order #${OPENING_ORDER_ID}: ` +
            `${batchesBeforeOpening.length}`,
    );

    if (batchesBeforeOpening.length === 0) {
        console.log(
            "  ❌ В текущей таблице Batch таких записей нет.",
        );
    } else {
        for (const batch of batchesBeforeOpening) {
            console.log(
                `  Batch #${batch.id} | ` +
                    `${date(batch.receivedAt)} | ` +
                    `${batch.quantity} шт | ` +
                    `${money(batch.purchaseCost)}`,
            );
        }
    }

    /*
     * ============================================================
     * 9. OTHER PRODUCTS / GLOBAL MOVEMENT CONTEXT
     * ============================================================
     */

    console.log();

    line();

    console.log("9. ОБЩИЙ КОНТЕКСТ MOVEMENT");

    line();

    console.log();

    const globalMovements = await prisma.movement.findMany({
        where: {
            createdAt: {
                gte: new Date(
                    openingOrderDate.getTime() -
                        24 * 60 * 60 * 1000,
                ),

                lte: new Date(
                    firstSupplyDate.getTime() +
                        24 * 60 * 60 * 1000,
                ),
            },
        },

        orderBy: {
            createdAt: "asc",
        },
    });

    console.log(
        `Movement всех товаров в окне ±24 часа: ${globalMovements.length}`,
    );

    console.log();

    for (const movement of globalMovements) {
        console.log(
            `Movement #${movement.id} | ` +
                `${date(movement.createdAt)} | ` +
                `Product #${movement.productId} | ` +
                `type=${movement.type} | ` +
                `quantity=${movement.quantity} | ` +
                `comment=${movement.comment ?? "—"}`,
        );
    }

    /*
     * ============================================================
     * 10. SUPPLY CREATION CONTEXT
     * ============================================================
     */

    console.log();

    line();

    console.log("10. КОНТЕКСТ SUPPLY");

    line();

    console.log();

    const supplies = await prisma.supply.findMany({
        orderBy: {
            date: "asc",
        },

        include: {
            items: {
                include: {
                    product: true,
                },
            },
        },
    });

    const nearbySupplies = supplies.filter((supply) => {
        const t = new Date(supply.date).getTime();

        const from =
            openingOrderDate.getTime() -
            24 * 60 * 60 * 1000;

        const to =
            firstSupplyDate.getTime() +
            24 * 60 * 60 * 1000;

        return t >= from && t <= to;
    });

    console.log(
        `Supply в окне ±24 часа: ${nearbySupplies.length}`,
    );

    console.log();

    for (const supply of nearbySupplies) {
        console.log(
            `Supply #${supply.id} | ` +
                `${date(supply.date)}`,
        );

        for (const item of supply.items) {
            console.log(
                `  SupplyItem #${item.id} | ` +
                    `Product #${item.productId} ${item.product.name} | ` +
                    `${item.quantity} шт | ` +
                    `${money(item.cost)}`,
            );
        }
    }

    /*
     * ============================================================
     * 11. OPENING STOCK HYPOTHESES
     * ============================================================
     */

    console.log();

    line();

    console.log("11. ПРОВЕРКА ГИПОТЕЗ");

    line();

    console.log();

    const hasSupplyBeforeOpening =
        suppliesBeforeOpeningOrder.length > 0;

    const hasBatchBeforeOpening =
        batchesBeforeOpening.length > 0;

    const hasMovementBeforeOpening =
        movementsBeforeOpening.length > 0;

    console.log(
        `Есть SupplyItem Творога до Order #4: ` +
            `${hasSupplyBeforeOpening ? "ДА" : "НЕТ"}`,
    );

    console.log(
        `Есть Batch Творога до Order #4: ` +
            `${hasBatchBeforeOpening ? "ДА" : "НЕТ"}`,
    );

    console.log(
        `Есть Movement Творога до Order #4: ` +
            `${hasMovementBeforeOpening ? "ДА" : "НЕТ"}`,
    );

    console.log();

    if (!hasSupplyBeforeOpening) {
        console.log(
            "🔴 Зарегистрированного источника товара до продажи нет.",
        );
    }

    if (!hasBatchBeforeOpening) {
        console.log(
            "🔴 Batch-источника до продажи нет.",
        );
    }

    if (!hasMovementBeforeOpening) {
        console.log(
            "🔴 Movement-источника до продажи нет.",
        );
    }

    /*
     * ============================================================
     * 12. COST CONCLUSION
     * ============================================================
     */

    console.log();

    line();

    console.log("12. ВЫВОД ПО СЕБЕСТОИМОСТИ");

    line();

    console.log();

    if (
        hasSupplyBeforeOpening &&
        hasBatchBeforeOpening
    ) {
        console.log(
            "🟢 В базе обнаружен потенциальный источник opening stock.",
        );

        console.log(
            "Нужно дополнительно сопоставить его количество, " +
                "дату и себестоимость.",
        );
    } else {
        console.log(
            "🔴 Достоверного зарегистрированного источника " +
                "себестоимости для 1 шт. opening stock не найдено.",
        );

        console.log();

        console.log(
            "Текущие данные позволяют установить только факт:",
        );

        console.log("  1. Order #4 продал 1 шт.");

        console.log(
            "  2. Order #4 произошёл до первой зарегистрированной поставки.",
        );

        console.log(
            "  3. OrderBatch для этой продажи отсутствует.",
        );

        console.log(
            "  4. Batch, существовавшего до продажи, в текущей БД нет.",
        );

        console.log(
            "  5. SupplyItem до продажи в текущей БД нет.",
        );

        console.log();

        console.log(
            "Следовательно, автоматически назначать себестоимость " +
                "этой единице НЕ БУДЕМ.",
        );
    }

    /*
     * ============================================================
     * 13. SAFETY CHECK
     * ============================================================
     */

    console.log();

    line();

    console.log("13. SAFETY CHECK");

    line();

    console.log();

    const productAfter = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    if (!productAfter) {
        throw new Error(
            "Product не найден во время финальной проверки",
        );
    }

    console.log(
        `Product.stock: ${product.stock} -> ${productAfter.stock}`,
    );

    if (productAfter.stock !== product.stock) {
        throw new Error(
            "❌ Product.stock неожиданно изменился",
        );
    }

    console.log("✅ Product.stock не изменился");

    console.log();

    console.log("========================================");
    console.log("🏁 АУДИТ ЗАВЕРШЁН");
    console.log("========================================");

    console.log();

    console.log(
        "⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЛАСЬ.",
    );

    console.log(
        "Следующее решение принимается только после анализа этого отчёта.",
    );

    console.log();
}

main()
    .catch((error) => {
        console.error();

        console.error("========================================");
        console.error("❌ ОШИБКА");
        console.error("========================================");

        console.error();

        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });