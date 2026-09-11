import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

type SupplyRow = {
    id: number;
    supplyId: number;
    productId: number;
    quantity: number;
    purchaseCost: number;
    createdAt: Date;
};

type BatchRow = {
    id: number;
    productId: number;
    quantity: number;
    purchaseCost: number;
    current: number;
    status: string;
    receivedAt: Date;
    expiryDate: Date;
};

type OrderRow = {
    id: number;
    createdAt: Date;
    status: string;
};

type OrderItemRow = {
    id: number;
    orderId: number;
    productId: number;
    quantity: number;
    price: number;
};

type OrderBatchRow = {
    id: number;
    orderItemId: number;
    batchId: number;
    quantity: number;
    purchaseCost: number;
};

type ReturnBatchRow = {
    id: number;
    orderId: number;
    orderItemId: number;
    batchId: number;
    quantity: number;
    createdAt: Date;
};

function line(char = "=", length = 40) {
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
    console.log("🧀 ТВОРОГ — АУДИТ ПЕРВОНАЧАЛЬНОГО ОСТАТКА");
    line();

    console.log();
    console.log("⚠️ READ ONLY");
    console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
    console.log();

    // ============================================================
    // 1. PRODUCT
    // ============================================================

    const product = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    if (!product) {
        throw new Error(`Product #${PRODUCT_ID} не найден`);
    }

    console.log(`Продукт: #${product.id} ${PRODUCT_NAME}`);
    console.log(`Product.stock: ${product.stock}`);

    // ============================================================
    // 2. SUPPLIES
    // ============================================================

    console.log();
    line();
    console.log("🚚 ЗАРЕГИСТРИРОВАННЫЕ ПОСТАВКИ");
    line();
    console.log();

    /*
     * В текущей Prisma schema:
     *
     * SupplyItem:
     *   quantity
     *   cost
     *   supplyId
     *
     * Supply:
     *   date
     *
     * Поэтому:
     *   createdAt    <- Supply.date
     *   purchaseCost <- SupplyItem.cost
     */

    const supplyItems = await prisma.supplyItem.findMany({
        where: {
            productId: PRODUCT_ID,
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

    const supplies: SupplyRow[] = supplyItems.map((item) => ({
        id: item.id,
        supplyId: item.supplyId,
        productId: item.productId,
        quantity: item.quantity,
        purchaseCost: item.cost,
        createdAt: item.supply.date,
    }));

    if (supplies.length === 0) {
        console.log("⚠️ SupplyItem для Творога не найден");
    }

    let totalSupplied = 0;

    for (const supply of supplies) {
        totalSupplied += supply.quantity;

        console.log(
            `SupplyItem #${supply.id} | ` +
            `Supply #${supply.supplyId} | ` +
            `${date(supply.createdAt)} | ` +
            `+${supply.quantity} шт × ${money(supply.purchaseCost)}`
        );
    }

    console.log();
    console.log(`ИТОГО ПОСТАВЛЕНО: ${totalSupplied} шт`);

    const firstSupply = supplies[0];

    if (!firstSupply) {
        console.log();
        console.log("❌ Невозможно определить первую поставку.");
        return;
    }

    console.log();
    console.log("📌 ПЕРВАЯ ЗАРЕГИСТРИРОВАННАЯ ПОСТАВКА");

    console.log(
        `SupplyItem #${firstSupply.id} | ` +
        `${date(firstSupply.createdAt)} | ` +
        `${firstSupply.quantity} шт × ${money(firstSupply.purchaseCost)}`
    );

    // ============================================================
    // 3. BATCH
    // ============================================================

    console.log();
    line();
    console.log("📦 BATCH ТВОРОГА");
    line();
    console.log();

    const batchRecords = await prisma.batch.findMany({
        where: {
            productId: PRODUCT_ID,
        },
        orderBy: {
            receivedAt: "asc",
        },
    });

    /*
     * В текущей schema Batch.quantity — это фактический текущий
     * остаток Batch.
     *
     * Поэтому для старого поля current используем quantity.
     */

    const batches: BatchRow[] = batchRecords.map((batch) => ({
        id: batch.id,
        productId: batch.productId,
        quantity: batch.quantity,
        purchaseCost: batch.purchaseCost,
        current: batch.quantity,
        status: batch.status,
        receivedAt: batch.receivedAt,
        expiryDate: batch.expiryDate,
    }));

    let batchCurrentTotal = 0;

    for (const batch of batches) {
        batchCurrentTotal += batch.current;

        console.log(
            `Batch #${batch.id} | ` +
            `current=${batch.current} | ` +
            `quantity=${batch.quantity} | ` +
            `cost=${money(batch.purchaseCost)} | ` +
            `received=${date(batch.receivedAt)} | ` +
            `expiry=${date(batch.expiryDate)} | ` +
            `status=${batch.status}`
        );
    }

    console.log();
    console.log(`SUM Batch.current: ${batchCurrentTotal}`);

    // ============================================================
    // 4. ALL ORDERS FOR TVOROG
    // ============================================================

    console.log();
    line();
    console.log("🛒 ВСЕ ПРОДАЖИ ТВOРОГА");
    line();
    console.log();

    /*
     * В текущей schema:
     *
     * Order.date вместо Order.createdAt.
     */

    const orderItemRecords = await prisma.orderItem.findMany({
        where: {
            productId: PRODUCT_ID,
        },
        include: {
            order: true,
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

    const orderItems = orderItemRecords.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,

        order: {
            id: item.order.id,
            createdAt: item.order.date,
            status: item.order.status,
        },
    }));

    let totalSold = 0;

    for (const item of orderItems) {
        totalSold += item.quantity;

        console.log(
            `Order #${item.orderId} | ` +
            `OrderItem #${item.id} | ` +
            `${date(item.order.createdAt)} | ` +
            `${item.quantity} шт | ` +
            `price=${money(item.price)} | ` +
            `status=${item.order.status}`
        );
    }

    console.log();
    console.log(`ИТОГО ПРОДАНО ПО ORDERITEM: ${totalSold} шт`);

    // ============================================================
    // 5. SALES BEFORE FIRST SUPPLY
    // ============================================================

    console.log();
    line();
    console.log("🚨 ПРОДАЖИ ДО ПЕРВОЙ ЗАРЕГИСТРИРОВАННОЙ ПОСТАВКИ");
    line();
    console.log();

    const beforeFirstSupply = orderItems.filter(
        (item) =>
            new Date(item.order.createdAt).getTime() <
            new Date(firstSupply.createdAt).getTime()
    );

    let beforeFirstSupplyQty = 0;

    if (beforeFirstSupply.length === 0) {
        console.log("✅ Продаж до первой поставки нет");
    } else {
        for (const item of beforeFirstSupply) {
            beforeFirstSupplyQty += item.quantity;

            const differenceMinutes = Math.round(
                (
                    new Date(firstSupply.createdAt).getTime() -
                    new Date(item.order.createdAt).getTime()
                ) /
                1000 /
                60
            );

            console.log(
                `🔴 Order #${item.orderId} | ` +
                `OrderItem #${item.id} | ` +
                `${date(item.order.createdAt)} | ` +
                `${item.quantity} шт | ` +
                `заказ раньше первой поставки на ` +
                `${differenceMinutes} мин`
            );
        }
    }

    console.log();

    console.log(
        `Всего продаж до первой поставки: ${beforeFirstSupplyQty} шт`
    );

    // ============================================================
    // 6. SALES BETWEEN SUPPLIES
    // ============================================================

    console.log();
    line();
    console.log("⏱️ ПРОДАЖИ МЕЖДУ ПОСТАВКАМИ");
    line();
    console.log();

    for (let i = 0; i < supplies.length - 1; i++) {
        const currentSupply = supplies[i];
        const nextSupply = supplies[i + 1];

        const sales = orderItems.filter((item) => {
            const orderDate = new Date(item.order.createdAt).getTime();
            const from = new Date(currentSupply.createdAt).getTime();
            const to = new Date(nextSupply.createdAt).getTime();

            return orderDate >= from && orderDate < to;
        });

        const qty = sales.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        console.log(
            `SupplyItem #${currentSupply.id} → ` +
            `SupplyItem #${nextSupply.id}`
        );

        console.log(
            `  период: ${date(currentSupply.createdAt)} → ` +
            `${date(nextSupply.createdAt)}`
        );

        console.log(`  продажи: ${qty} шт`);

        for (const item of sales) {
            console.log(
                `    Order #${item.orderId} | ` +
                `OrderItem #${item.id} | ` +
                `${item.quantity} шт | ` +
                `${date(item.order.createdAt)}`
            );
        }

        console.log();
    }

    // ============================================================
    // 7. ORDERBATCH FOR DISPUTED SALES
    // ============================================================

    console.log();
    line();
    console.log("🔗 ORDERBATCH ДЛЯ ИСТОРИЧЕСКИХ ПРОДАЖ");
    line();
    console.log();

    const orderItemIds = orderItems.map((item) => item.id);

    const orderBatches: OrderBatchRow[] = orderItemIds.length
        ? await prisma.orderBatch.findMany({
            where: {
                orderItemId: {
                    in: orderItemIds,
                },
            },
            orderBy: {
                id: "asc",
            },
        })
        : [];

    const orderBatchByItem = new Map<number, OrderBatchRow[]>();

    for (const orderBatch of orderBatches) {
        const list =
            orderBatchByItem.get(orderBatch.orderItemId) ?? [];

        list.push(orderBatch);
        orderBatchByItem.set(orderBatch.orderItemId, list);
    }

    for (const item of beforeFirstSupply) {
        const links = orderBatchByItem.get(item.id) ?? [];

        console.log(
            `Order #${item.orderId} | ` +
            `OrderItem #${item.id} | ` +
            `quantity=${item.quantity}`
        );

        if (links.length === 0) {
            console.log("  OrderBatch: НЕТ");
            continue;
        }

        for (const link of links) {
            const batch = batches.find(
                (b) => b.id === link.batchId
            );

            console.log(
                `  OrderBatch #${link.id} | ` +
                `Batch #${link.batchId} | ` +
                `${link.quantity} шт | ` +
                `cost=${money(link.purchaseCost)}`
            );

            if (batch) {
                const orderDate = new Date(item.order.createdAt);
                const batchDate = new Date(batch.receivedAt);

                if (orderDate < batchDate) {
                    console.log(
                        `    🔴 Batch поступил ПОСЛЕ заказа`
                    );
                } else {
                    console.log(
                        `    ✅ Batch существовал на момент продажи`
                    );
                }
            } else {
                console.log(
                    `    🔴 Batch #${link.batchId} не найден`
                );
            }
        }
    }

    // ============================================================
    // 8. OPENING STOCK CALCULATION
    // ============================================================

    console.log();
    line();
    console.log("🧮 РАСЧЁТ ВОЗМОЖНОГО OPENING STOCK");
    line();
    console.log();

    console.log(`Первая SupplyItem: #${firstSupply.id}`);

    console.log(
        `Дата первой поставки: ${date(firstSupply.createdAt)}`
    );

    console.log(
        `Количество первой поставки: ${firstSupply.quantity} шт`
    );

    console.log();

    console.log(
        `Продано ДО первой поставки: ${beforeFirstSupplyQty} шт`
    );

    console.log();

    console.log(
        `Минимальный opening stock, необходимый для этих продаж: ` +
        `${beforeFirstSupplyQty} шт`
    );

    // ============================================================
    // 9. COST OF OPENING STOCK
    // ============================================================

    console.log();
    line();
    console.log("💰 ВОЗМОЖНАЯ СЕБЕСТОИМОСТЬ OPENING STOCK");
    line();
    console.log();

    if (beforeFirstSupplyQty === 0) {
        console.log(
            "Opening stock по данным хронологии не требуется."
        );
    } else {
        console.log(
            `Для ${beforeFirstSupplyQty} шт до первой поставки ` +
            `в базе НЕТ зарегистрированной поставки, ` +
            `из которой их можно достоверно получить.`
        );

        console.log();

        console.log(
            "Поэтому себестоимость этих единиц автоматически " +
            "восстанавливать НЕ БУДЕМ."
        );

        console.log(
            "Нужна отдельная историческая проверка."
        );
    }

    // ============================================================
    // 10. RETURNS
    // ============================================================

    console.log();
    line();
    console.log("↩️ RETURNBATCH В КОНТЕКСТЕ ИСТОРИЧЕСКИХ ПРОДАЖ");
    line();
    console.log();

    const returnBatchRecords = orderItemIds.length
        ? await prisma.returnBatch.findMany({
            where: {
                orderItemId: {
                    in: orderItemIds,
                },
            },
            orderBy: {
                createdAt: "asc",
            },
        })
        : [];

    /*
     * В текущей schema ReturnBatch не имеет orderId напрямую.
     *
     * Поэтому orderId восстанавливаем через OrderItem.
     */

    const orderItemById = new Map(
        orderItems.map((item) => [item.id, item])
    );

    const returnBatches: ReturnBatchRow[] =
        returnBatchRecords.map((ret) => {
            const item = orderItemById.get(ret.orderItemId);

            return {
                id: ret.id,
                orderId: item?.orderId ?? 0,
                orderItemId: ret.orderItemId,
                batchId: ret.batchId,
                quantity: ret.quantity,
                createdAt: ret.createdAt,
            };
        });

    const returnByItem =
        new Map<number, ReturnBatchRow[]>();

    for (const ret of returnBatches) {
        const list =
            returnByItem.get(ret.orderItemId) ?? [];

        list.push(ret);
        returnByItem.set(ret.orderItemId, list);
    }

    for (const item of beforeFirstSupply) {
        const returns =
            returnByItem.get(item.id) ?? [];

        console.log(
            `Order #${item.orderId} | ` +
            `OrderItem #${item.id} | ` +
            `sale=${item.quantity} шт`
        );

        if (returns.length === 0) {
            console.log("  ReturnBatch: НЕТ");
            continue;
        }

        let returned = 0;

        for (const ret of returns) {
            returned += ret.quantity;

            console.log(
                `  ReturnBatch #${ret.id} | ` +
                `Batch #${ret.batchId} | ` +
                `${ret.quantity} шт | ` +
                `${date(ret.createdAt)}`
            );
        }

        console.log(
            `  Всего возвращено: ${returned} шт`
        );

        if (returned > item.quantity) {
            console.log(
                "  🔴 ВОЗВРАТ БОЛЬШЕ КОЛИЧЕСТВА ПРОДАЖИ"
            );
        } else {
            console.log(
                "  ✅ Возврат не превышает продажу"
            );
        }
    }

    // ============================================================
    // 11. EXACT DISPUTED ORDERS
    // ============================================================

    console.log();
    line();
    console.log("🔍 КОНКРЕТНЫЕ СПОРНЫЕ ЗАКАЗЫ");
    line();
    console.log();

    const disputedOrderIds = [
        4,
        12,
        16,
        18,
        19,
        20,
        23,
    ];

    let disputedTotal = 0;

    for (const orderId of disputedOrderIds) {
        const items = orderItems.filter(
            (item) => item.orderId === orderId
        );

        if (items.length === 0) {
            console.log(
                `Order #${orderId}: OrderItem Творога не найден`
            );
            continue;
        }

        for (const item of items) {
            disputedTotal += item.quantity;

            const links =
                orderBatchByItem.get(item.id) ?? [];

            console.log(
                `Order #${orderId} | ` +
                `OrderItem #${item.id} | ` +
                `date=${date(item.order.createdAt)} | ` +
                `quantity=${item.quantity}`
            );

            if (links.length === 0) {
                console.log("  OrderBatch: НЕТ");
            } else {
                for (const link of links) {
                    const batch = batches.find(
                        (batch) =>
                            batch.id === link.batchId
                    );

                    console.log(
                        `  OrderBatch #${link.id} → ` +
                        `Batch #${link.batchId} | ` +
                        `${link.quantity} шт | ` +
                        `cost=${money(link.purchaseCost)}`
                    );

                    if (batch) {
                        console.log(
                            `    Batch received: ` +
                            `${date(batch.receivedAt)}`
                        );

                        if (
                            new Date(
                                item.order.createdAt
                            ).getTime() <
                            new Date(
                                batch.receivedAt
                            ).getTime()
                        ) {
                            console.log(
                                "    🔴 ХРОНОЛОГИЧЕСКИ НЕВОЗМОЖНО"
                            );
                        }
                    }
                }
            }
        }
    }

    console.log();

    console.log(
        `Всего в указанных спорных заказах: ` +
        `${disputedTotal} шт`
    );

    // ============================================================
    // 12. IMPORTANT BALANCE
    // ============================================================

    console.log();
    line();
    console.log("📊 СВОДНЫЙ БАЛАНС");
    line();
    console.log();

    console.log(
        `Поставлено всего:          ${totalSupplied} шт`
    );

    console.log(
        `Продано всего:             ${totalSold} шт`
    );

    console.log(
        `Текущий Batch stock:       ${batchCurrentTotal} шт`
    );

    console.log(
        `Product.stock:             ${product.stock} шт`
    );

    console.log(
        `Продано до первой поставки: ${beforeFirstSupplyQty} шт`
    );

    console.log();

    const theoretical =
        totalSupplied -
        totalSold;

    console.log(
        `Поставка − все OrderItem = ${theoretical} шт`
    );

    console.log();

    // ============================================================
    // 13. CONCLUSION
    // ============================================================

    line();
    console.log("🏁 ВЫВОД");
    line();
    console.log();

    if (beforeFirstSupplyQty > 0) {
        console.log(
            `🔴 Обнаружен исторический opening stock: ` +
            `минимум ${beforeFirstSupplyQty} шт`
        );

        console.log();

        console.log(
            "Эти продажи произошли до первой зарегистрированной поставки."
        );

        console.log(
            "Их нельзя корректно привязать к Batch только по текущей БД."
        );

        console.log();

        console.log(
            "❗ НИКАКИЕ OrderBatch НЕ УДАЛЯЕМ."
        );

        console.log(
            "❗ НИКАКИЕ ReturnBatch НЕ МЕНЯЕМ."
        );

        console.log(
            "❗ Batch.quantity НЕ МЕНЯЕМ."
        );

        console.log(
            "❗ Product.stock НЕ МЕНЯЕМ."
        );

        console.log(
            "❗ Movement НЕ МЕНЯЕМ."
        );
    } else {
        console.log(
            "✅ Продаж до первой поставки не обнаружено."
        );
    }

    console.log();

    console.log(
        "Следующий этап после этого аудита — определить, " +
        "какие исторические OrderBatch действительно нужно считать " +
        "opening-stock продажами и какую себестоимость им назначать."
    );

    console.log();

    line();
}

main()
    .catch((error) => {
        console.error();
        console.error("❌ ОШИБКА:");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });