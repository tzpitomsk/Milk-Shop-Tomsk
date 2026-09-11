import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const SUPPLY_ID = 1;
const BATCH_ID = 4;

function line() {
    console.log(
        "\n======================================================================\n"
    );
}

function title(text: string) {
    line();
    console.log(text);
    line();
}

function separator() {
    console.log(
        "\n----------------------------------------------------------------------\n"
    );
}

function formatDate(value: Date | null | undefined) {
    if (!value) {
        return "NULL";
    }

    return value.toISOString();
}

/**
 * Экранирование строки для безопасного использования в RegExp.
 */
function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Точное определение номера поставки в комментарии.
 *
 * ВАЖНО:
 * "Поставка №1" НЕ должна совпадать с:
 * - "Поставка №12"
 * - "Поставка №13"
 * - "Поставка №14"
 */
function commentHasExactSupplyNumber(
    comment: string | null,
    supplyId: number
) {
    if (!comment) {
        return false;
    }

    const escapedId = escapeRegExp(String(supplyId));

    const patterns = [
        new RegExp(
            `Поставка\\s*[№#]\\s*${escapedId}(?!\\d)`,
            "i"
        ),

        new RegExp(
            `Поставка\\s+${escapedId}(?!\\d)`,
            "i"
        ),

        new RegExp(
            `Supply\\s*[№#]?\\s*${escapedId}(?!\\d)`,
            "i"
        ),
    ];

    return patterns.some((pattern) => pattern.test(comment));
}

/**
 * Точное определение номера заказа.
 *
 * Заказ №1 не должен совпадать с:
 * - Заказ №10
 * - Заказ №11
 * - Заказ №100
 */
function commentHasExactOrderNumber(
    comment: string | null,
    orderId: number
) {
    if (!comment) {
        return false;
    }

    const escapedId = escapeRegExp(String(orderId));

    const patterns = [
        new RegExp(
            `Заказ\\s*[№#]\\s*${escapedId}(?!\\d)`,
            "i"
        ),

        new RegExp(
            `Order\\s*[№#]?\\s*${escapedId}(?!\\d)`,
            "i"
        ),
    ];

    return patterns.some((pattern) => pattern.test(comment));
}

/**
 * Точное определение номера партии.
 *
 * Партия №4 не должна совпадать с:
 * - Партия №40
 * - Партия №41
 */
function commentHasExactBatchNumber(
    comment: string | null,
    batchId: number
) {
    if (!comment) {
        return false;
    }

    const escapedId = escapeRegExp(String(batchId));

    const patterns = [
        new RegExp(
            `Партия\\s*[№#]\\s*${escapedId}(?!\\d)`,
            "i"
        ),

        new RegExp(
            `Batch\\s*[№#]?\\s*${escapedId}(?!\\d)`,
            "i"
        ),
    ];

    return patterns.some((pattern) => pattern.test(comment));
}

async function main() {
    console.log(`
======================================================================

🧀 ТВОРОГ — SUPPLY #1 FORENSIC CHAIN AUDIT V14

======================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

V14 исправляет критическую ошибку V13:

"Поставка №1" больше НЕ совпадает с:

Поставка №12

Поставка №13

Поставка №14

Цель аудита:

1. Точно исследовать Supply #1.

2. Найти реальные движения Supply #1.

3. Проверить исторические следы Batch #4.

4. Проверить ранние продажи без SALE Movement.

5. Реконструировать общий Movement-баланс Творога.

6. Ничего не изменять.

======================================================================
`);

    // ================================================================
    // 1. PRODUCT
    // ================================================================

    title("1. PRODUCT — CURRENT STATE");

    const product = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    if (!product) {
        throw new Error(`Product #${PRODUCT_ID} not found`);
    }

    console.log(`
Product #${product.id}

name=${product.name}

unit=${product.unit}

stock=${product.stock}

cost=${product.cost}

price=${product.price}
`);

    // ================================================================
    // 2. SUPPLY #1 — FULL BUSINESS RECORD
    // ================================================================

    title("2. SUPPLY #1 — SOURCE BUSINESS RECORD");

    const supply = await prisma.supply.findUnique({
        where: {
            id: SUPPLY_ID,
        },
        include: {
            items: {
                include: {
                    product: true,
                },
                orderBy: {
                    id: "asc",
                },
            },
        },
    });

    if (!supply) {
        console.log(`
🔴 Supply #${SUPPLY_ID} not found.
`);
    } else {
        console.log(`
Supply #${supply.id}

date=${formatDate(supply.date)}

supplierId=${supply.supplierId}

total=${supply.total}

Items count=${supply.items.length}
`);

        separator();

        for (const item of supply.items) {
            console.log(`
SupplyItem #${item.id}

productId=${item.productId}

product=${item.product.name}

quantity=${item.quantity}

cost=${item.cost}
`);
        }
    }

    const tvorogSupplyItem = supply?.items.find(
        (item) => item.productId === PRODUCT_ID
    );

    separator();

    console.log(`
TVOROG SUPPLY ITEM FOR SUPPLY #${SUPPLY_ID}:

${tvorogSupplyItem ? "FOUND" : "NOT FOUND"}
`);

    if (tvorogSupplyItem) {
        console.log(`
SupplyItem #${tvorogSupplyItem.id}

quantity=${tvorogSupplyItem.quantity}

cost=${tvorogSupplyItem.cost}
`);
    }

    // ================================================================
    // 3. ALL MOVEMENTS
    // ================================================================

    title("3. ALL TVOROG MOVEMENTS");

    const movements = await prisma.movement.findMany({
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

    console.log(`
Total movements = ${movements.length}
`);

    let totalMovementBalance = 0;

    for (const movement of movements) {
        totalMovementBalance += movement.quantity;

        console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}

RUNNING BALANCE=${totalMovementBalance}
`);
    }

    console.log(`
FINAL MOVEMENT BALANCE = ${totalMovementBalance}
`);

    // ================================================================
    // 4. EXACT SUPPLY #1 MOVEMENT SEARCH
    // ================================================================

    title("4. EXACT SUPPLY #1 ↔ MOVEMENT SEARCH");

    const exactSupplyMovements = movements.filter((movement) =>
        commentHasExactSupplyNumber(
            movement.comment,
            SUPPLY_ID
        )
    );

    console.log(`
Exact movements referencing Supply #${SUPPLY_ID} = ${exactSupplyMovements.length}
`);

    if (exactSupplyMovements.length === 0) {
        console.log(`
🟠 NO EXACT MOVEMENT FOUND FOR SUPPLY #${SUPPLY_ID}.

IMPORTANT:

V14 does NOT treat:

Поставка №12

Поставка №13

Поставка №14

as Supply #${SUPPLY_ID}.

Therefore these movements are NOT evidence for Supply #${SUPPLY_ID}.
`);
    } else {
        for (const movement of exactSupplyMovements) {
            console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}
`);
        }
    }

    // ================================================================
    // 5. MOVEMENT SEARCH BY SUPPLY DATE
    // ================================================================

    title("5. SUPPLY #1 DATE WINDOW INVESTIGATION");

    if (!supply) {
        console.log(`
Supply #${SUPPLY_ID} does not exist.

Date window investigation skipped.
`);
    } else {
        const supplyDate = supply.date;

        const from = new Date(
            supplyDate.getTime() - 1000 * 60 * 60 * 24
        );

        const to = new Date(
            supplyDate.getTime() + 1000 * 60 * 60 * 24 * 3
        );

        console.log(`
Supply date=${supplyDate.toISOString()}

Window start=${from.toISOString()}

Window end=${to.toISOString()}
`);

        const nearbyMovements = movements.filter((movement) => {
            return (
                movement.createdAt >= from &&
                movement.createdAt <= to
            );
        });

        console.log(`
Movements inside date window=${nearbyMovements.length}
`);

        let running = 0;

        for (const movement of nearbyMovements) {
            running += movement.quantity;

            const exactSupplyMatch =
                commentHasExactSupplyNumber(
                    movement.comment,
                    SUPPLY_ID
                );

            console.log(
                `${movement.createdAt.toISOString()} | ` +
                `Movement #${movement.id} | ` +
                `${movement.type.padEnd(10)} | ` +
                `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
                `RUNNING=${running} | ` +
                `EXACT_SUPPLY_${SUPPLY_ID}=${exactSupplyMatch ? "YES" : "NO"} | ` +
                `${movement.comment ?? ""}`
            );
        }
    }

    // ================================================================
    // 6. CURRENT BATCH #4
    // ================================================================

    title("6. CURRENT BATCH #4");

    const batch4 = await prisma.batch.findUnique({
        where: {
            id: BATCH_ID,
        },
        include: {
            product: true,
        },
    });

    console.log(`
Batch #${BATCH_ID} exists=${Boolean(batch4)}
`);

    if (batch4) {
        console.log(`
Batch #${batch4.id}

productId=${batch4.productId}

product=${batch4.product.name}

quantity=${batch4.quantity}

purchaseCost=${batch4.purchaseCost}

receivedAt=${batch4.receivedAt.toISOString()}

expiryDate=${batch4.expiryDate.toISOString()}

status=${batch4.status}
`);
    } else {
        console.log(`
🟠 Batch #${BATCH_ID} does not exist in the current Batch table.

V14 will now search historical references using:

1. OrderBatch.batchId

2. ReturnBatch.batchId

3. Movement comments
`);
    }

    // ================================================================
    // 7. HISTORICAL ORDERBATCH REFERENCES TO BATCH #4
    // ================================================================

    title("7. HISTORICAL OrderBatch REFERENCES TO BATCH #4");

    const historicalOrderBatches = await prisma.orderBatch.findMany({
        where: {
            batchId: BATCH_ID,
        },
        include: {
            orderItem: {
                include: {
                    order: true,
                    product: true,
                },
            },
        },
        orderBy: {
            id: "asc",
        },
    });

    console.log(`
OrderBatch records referencing Batch #${BATCH_ID} = ${historicalOrderBatches.length}
`);

    let batch4SoldQty = 0;

    for (const orderBatch of historicalOrderBatches) {
        batch4SoldQty += orderBatch.quantity;

        console.log(`
OrderBatch #${orderBatch.id}

batchId=${orderBatch.batchId}

quantity=${orderBatch.quantity}

purchaseCost=${orderBatch.purchaseCost}

OrderItem #${orderBatch.orderItemId}

product=${orderBatch.orderItem.product.name}

Order #${orderBatch.orderItem.orderId}

orderDate=${orderBatch.orderItem.order.date.toISOString()}

orderStatus=${orderBatch.orderItem.order.status}
`);
    }

    console.log(`
TOTAL QUANTITY SOLD FROM HISTORICAL BATCH #${BATCH_ID} REFERENCES = ${batch4SoldQty}
`);

    // ================================================================
    // 8. HISTORICAL RETURNBATCH REFERENCES TO BATCH #4
    // ================================================================

    title("8. HISTORICAL ReturnBatch REFERENCES TO BATCH #4");

    const historicalReturnBatches =
        await prisma.returnBatch.findMany({
            where: {
                batchId: BATCH_ID,
            },
            include: {
                OrderItem: {
                    include: {
                        order: true,
                        product: true,
                    },
                },
            },
            orderBy: {
                id: "asc",
            },
        });

    console.log(`
ReturnBatch records referencing Batch #${BATCH_ID} = ${historicalReturnBatches.length}
`);

    let batch4ReturnedQty = 0;

    for (const returnBatch of historicalReturnBatches) {
        batch4ReturnedQty += returnBatch.quantity;

        console.log(`
ReturnBatch #${returnBatch.id}

batchId=${returnBatch.batchId}

quantity=${returnBatch.quantity}

createdAt=${returnBatch.createdAt.toISOString()}

OrderItem #${returnBatch.orderItemId}

product=${returnBatch.OrderItem.product.name}

Order #${returnBatch.OrderItem.orderId}

orderDate=${returnBatch.OrderItem.order.date.toISOString()}

orderStatus=${returnBatch.OrderItem.order.status}
`);
    }

    console.log(`
TOTAL QUANTITY RETURNED TO HISTORICAL BATCH #${BATCH_ID} = ${batch4ReturnedQty}
`);

    // ================================================================
    // 9. MOVEMENT REFERENCES TO BATCH #4
    // ================================================================

    title("9. MOVEMENT REFERENCES TO BATCH #4");

    const batch4Movements = movements.filter((movement) =>
        commentHasExactBatchNumber(
            movement.comment,
            BATCH_ID
        )
    );

    console.log(`
Movements exactly referencing Batch #${BATCH_ID} = ${batch4Movements.length}
`);

    let batch4MovementNet = 0;
    let batch4WriteOffQty = 0;

    for (const movement of batch4Movements) {
        batch4MovementNet += movement.quantity;

        if (movement.type === "WRITE_OFF") {
            batch4WriteOffQty += Math.abs(
                movement.quantity
            );
        }

        console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}
`);
    }

    console.log(`
Batch #${BATCH_ID} movement net=${batch4MovementNet}

Batch #${BATCH_ID} WRITE_OFF quantity=${batch4WriteOffQty}
`);

    // ================================================================
    // 10. EARLY SALES WITHOUT EXACT SALE MOVEMENT
    // ================================================================

    title("10. EARLY SALES WITHOUT EXACT SALE MOVEMENTS");

    const cutoffDate = new Date(
        "2026-08-01T08:38:56.380Z"
    );

    console.log(`
Cutoff date=${cutoffDate.toISOString()}
`);

    const earlyOrderItems = await prisma.orderItem.findMany({
        where: {
            productId: PRODUCT_ID,
            order: {
                is: {
                    date: {
                        lt: cutoffDate,
                    },
                },
            },
        },
        include: {
            order: true,
            ReturnBatch: true,
        },
        orderBy: {
            order: {
                date: "asc",
            },
        },
    });

    console.log(`
Early Tvorog OrderItems=${earlyOrderItems.length}
`);

    let missingSalesQty = 0;

    for (const item of earlyOrderItems) {
        const returnedQty = item.ReturnBatch.reduce(
            (sum, returnBatch) =>
                sum + returnBatch.quantity,
            0
        );

        const netQty =
            item.quantity - returnedQty;

        const matchingSaleMovements =
            movements.filter((movement) => {
                if (movement.type !== "SALE") {
                    return false;
                }

                return commentHasExactOrderNumber(
                    movement.comment,
                    item.orderId
                );
            });

        const movementQty =
            matchingSaleMovements.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        const expectedMovementQty = -netQty;

        const gap =
            expectedMovementQty -
            movementQty;

        if (gap !== 0) {
            missingSalesQty += Math.abs(gap);

            console.log(`
🔴 MISMATCH FOUND

Order #${item.orderId}

OrderItem #${item.id}

date=${item.order.date.toISOString()}

status=${item.order.status}

gross=${item.quantity}

returned=${returnedQty}

net=${netQty}

expected SALE movement=${expectedMovementQty}

actual SALE movement=${movementQty}

gap=${gap}
`);

            if (
                matchingSaleMovements.length === 0
            ) {
                console.log(
                    `No exact SALE Movement found for Order #${item.orderId}`
                );
            } else {
                for (
                    const movement of matchingSaleMovements
                ) {
                    console.log(
                        `  Movement #${movement.id} | ` +
                        `${movement.quantity} | ` +
                        `${movement.comment ?? ""}`
                    );
                }
            }
        }
    }

    console.log(`
TOTAL MISSING EARLY SALE QUANTITY=${missingSalesQty}
`);

    // ================================================================
    // 11. ORDER #19 / QUANTITY 4 INVESTIGATION
    // ================================================================

    title("11. ORDER ITEMS WITH QUANTITY = 4");

    const qtyFourOrders =
        await prisma.orderItem.findMany({
            where: {
                productId: PRODUCT_ID,
                quantity: 4,
            },
            include: {
                order: true,
                ReturnBatch: true,
                batches: {
                    include: {
                        batch: true,
                    },
                },
            },
            orderBy: {
                order: {
                    date: "asc",
                },
            },
        });

    console.log(`
Found OrderItem records with quantity=4: ${qtyFourOrders.length}
`);

    for (const item of qtyFourOrders) {
        const returned = item.ReturnBatch.reduce(
            (sum, returnBatch) =>
                sum + returnBatch.quantity,
            0
        );

        console.log(`
Order #${item.orderId}

OrderItem #${item.id}

date=${item.order.date.toISOString()}

gross=${item.quantity}

returned=${returned}

net=${item.quantity - returned}

status=${item.order.status}

OrderBatch links=${item.batches.length}
`);

        for (const orderBatch of item.batches) {
            console.log(`
  OrderBatch #${orderBatch.id}

  batchId=${orderBatch.batchId}

  quantity=${orderBatch.quantity}

  purchaseCost=${orderBatch.purchaseCost}

  batchCurrentQuantity=${orderBatch.batch.quantity}

  batchStatus=${orderBatch.batch.status}

  batchExpiry=${orderBatch.batch.expiryDate.toISOString()}
`);
        }
    }

    // ================================================================
    // 12. SUPPLY / BATCH #4 QUANTITY CHAIN
    // ================================================================

    title("12. QUANTITY CHAIN — FACTS ONLY");

    const supplyBusinessQty =
        tvorogSupplyItem?.quantity ?? 0;

    const exactSupplyMovementQty =
        exactSupplyMovements.reduce(
            (sum, movement) =>
                sum + movement.quantity,
            0
        );

    const exactSupplyMovementCount =
        exactSupplyMovements.length;

    const batch4NetAfterSalesAndReturns =
        batch4SoldQty - batch4ReturnedQty;

    console.log(`
SUPPLY #${SUPPLY_ID}

Business quantity=${supplyBusinessQty}

Exact Movement count=${exactSupplyMovementCount}

Exact Movement quantity=${exactSupplyMovementQty}

Difference:

exact movement quantity - business quantity

=${exactSupplyMovementQty - supplyBusinessQty}

----------------------------------------------------------------------

BATCH #${BATCH_ID}

Historical OrderBatch sold quantity=${batch4SoldQty}

Historical ReturnBatch quantity=${batch4ReturnedQty}

Net quantity consumed by sales=${batch4NetAfterSalesAndReturns}

Movement WRITE_OFF quantity=${batch4WriteOffQty}

----------------------------------------------------------------------

EARLY SALES

Missing early SALE quantity=${missingSalesQty}

----------------------------------------------------------------------

CURRENT PRODUCT STOCK

Product.stock=${product.stock}

----------------------------------------------------------------------

ALL MOVEMENT LEDGER

Total Movement balance=${totalMovementBalance}
`);

    // ================================================================
    // 13. FULL MOVEMENT TYPE TOTALS
    // ================================================================

    title("13. MOVEMENT TOTALS BY TYPE");

    const totalsByType = new Map<string, number>();

    for (const movement of movements) {
        totalsByType.set(
            movement.type,
            (totalsByType.get(movement.type) ?? 0) +
                movement.quantity
        );
    }

    for (const [type, quantity] of totalsByType) {
        console.log(`
${type} = ${quantity}
`);
    }

    console.log(`
TOTAL MOVEMENT BALANCE=${totalMovementBalance}

CURRENT Product.stock=${product.stock}

Difference:

Product.stock - Movement balance

=${product.stock - totalMovementBalance}
`);

    // ================================================================
    // 14. EXACT +40 SEARCH
    // ================================================================

    title("14. EXACT +40 MOVEMENT SEARCH");

    const plus40Movements = movements.filter(
        (movement) =>
            movement.quantity === 40
    );

    console.log(`
Movements with exact quantity +40=${plus40Movements.length}
`);

    if (plus40Movements.length === 0) {
        console.log(`
No exact +40 Movement exists in the current Movement table.

Therefore V14 does NOT claim that a +40 Movement currently exists.
`);
    } else {
        for (const movement of plus40Movements) {
            console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}
`);
        }
    }

    // ================================================================
    // 15. FORENSIC SUMMARY
    // ================================================================

    title("15. FORENSIC SUMMARY");

    console.log(`
PRODUCT

-------

Product #${product.id}

Current stock=${product.stock}

Movement ledger balance=${totalMovementBalance}

Difference=${product.stock - totalMovementBalance}


SUPPLY #${SUPPLY_ID}

---------

Business quantity=${supplyBusinessQty}

Exact Supply #${SUPPLY_ID} Movement records=${exactSupplyMovementCount}

Exact Supply #${SUPPLY_ID} Movement quantity=${exactSupplyMovementQty}


EARLY SALES

-----------

Missing exact SALE Movement quantity=${missingSalesQty}


BATCH #${BATCH_ID}

---------

Current Batch exists=${Boolean(batch4)}

Historical OrderBatch sold=${batch4SoldQty}

Historical ReturnBatch returned=${batch4ReturnedQty}

Net sold=${batch4NetAfterSalesAndReturns}

WRITE_OFF=${batch4WriteOffQty}

Movement net=${batch4MovementNet}


+40 SEARCH

----------

Exact +40 Movement records=${plus40Movements.length}
`);

    // ================================================================
    // 16. FINAL SAFETY STATUS
    // ================================================================

    title("16. FINAL SAFETY STATUS");

    console.log(`
READ ONLY FORENSIC AUDIT COMPLETED.

Product НЕ изменялся.

Product.stock НЕ изменялся.

Batch НЕ создавались.

Batch НЕ удалялись.

Batch НЕ изменялись.

Movement НЕ создавались.

Movement НЕ удалялись.

Movement НЕ изменялись.

OrderBatch НЕ изменялись.

ReturnBatch НЕ изменялись.

Supply НЕ изменялись.

SupplyItem НЕ изменялись.

Order НЕ изменялись.

OrderItem НЕ изменялись.

Supplier НЕ изменялся.

🏁 AUDIT V14 ЗАВЕРШЁН
`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });