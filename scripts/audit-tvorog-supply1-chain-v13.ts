import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;

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

function fmt(value: unknown) {
    if (value === null || value === undefined) {
        return "NULL";
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return String(value);
}

async function main() {
    console.log(`
======================================================================

🧀 ТВОРОГ — SUPPLY #1 FORENSIC CHAIN AUDIT V13

======================================================================

⚠️ READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

Цель:

Найти происхождение аномального Movement +40,
проверить его связь с ранними продажами,
Batch #4 и необъяснённым остатком.

======================================================================
`);

    // ================================================================
    // 1. PRODUCT
    // ================================================================

    title("1. PRODUCT");

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

stock=${product.stock}

cost=${product.cost}

price=${product.price}
`);

    // ================================================================
    // 2. SUPPLY #1
    // ================================================================

    title("2. SUPPLY #1 — SOURCE BUSINESS RECORD");

    const supplyItem = await prisma.supplyItem.findFirst({
        where: {
            productId: PRODUCT_ID,
            supplyId: 1,
        },
        include: {
            supply: true,
        },
    });

    if (!supplyItem) {
        console.log("🔴 Supply #1 / SupplyItem not found");
    } else {
        console.log(`
Supply #${supplyItem.supplyId}

SupplyItem #${supplyItem.id}

productId=${supplyItem.productId}

quantity=${supplyItem.quantity}

cost=${supplyItem.cost}

date=${supplyItem.supply.date.toISOString()}
`);
    }

    // ================================================================
    // 3. ALL MOVEMENTS FOR TVOROG
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

    console.log(`Total movements = ${movements.length}\n`);

    for (const movement of movements) {
        console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}

raw:
${JSON.stringify(movement, null, 2)}
`);
    }

    // ================================================================
    // 4. FIND SUPPLY #1 MOVEMENT
    // ================================================================

    title("4. SUPPLY #1 ↔ MOVEMENT INVESTIGATION");

    const supply1Movements = movements.filter((movement) => {
        const comment = movement.comment ?? "";

        return (
            comment.includes("Поставка №1") ||
            comment.includes("поставка №1") ||
            comment.includes("Supply #1") ||
            comment.includes("Supply №1")
        );
    });

    if (supply1Movements.length === 0) {
        console.log(`
🔴 No Movement found by direct Supply #1 comment match.

Searching by date proximity...
`);
    } else {
        console.log(`
Found ${supply1Movements.length} movement(s) related to Supply #1
`);

        for (const movement of supply1Movements) {
            console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}

RAW OBJECT:

${JSON.stringify(movement, null, 2)}
`);
        }
    }

    // ================================================================
    // 5. TIME WINDOW AROUND SUPPLY #1
    // ================================================================

    title("5. SUPPLY #1 DATE FIELD INVESTIGATION");

    if (supplyItem) {
        console.log(`
Supply object fields:

${Object.keys(supplyItem.supply).join(", ")}

--------------------------------------------------

RAW SUPPLY OBJECT:

${JSON.stringify(supplyItem.supply, null, 2)}

--------------------------------------------------

Attempting to detect date field...
`);

        const supplyRaw = supplyItem.supply as Record<string, unknown>;

        const possibleDateFields = [
            "createdAt",
            "date",
            "receivedAt",
            "suppliedAt",
            "updatedAt",
        ];

        let supplyDate: Date | null = null;
        let detectedField: string | null = null;

        for (const field of possibleDateFields) {
            const value = supplyRaw[field];

            if (value instanceof Date) {
                supplyDate = value;
                detectedField = field;
                break;
            }
        }

        if (!supplyDate) {
            console.log(`
🔴 DATE FIELD NOT AUTOMATICALLY DETECTED.

V13 intentionally stops date-window analysis here.

The raw Supply object above will show the real field name.
`);
        } else {
            console.log(`
🟢 DATE FIELD DETECTED

field=${detectedField}

value=${supplyDate.toISOString()}
`);

            const from = new Date(
                supplyDate.getTime() - 1000 * 60 * 60 * 24
            );

            const to = new Date(
                supplyDate.getTime() + 1000 * 60 * 60 * 24 * 3
            );

            console.log(`
Window start = ${from.toISOString()}

Supply #1 date = ${supplyDate.toISOString()}

Window end = ${to.toISOString()}
`);

            const nearbyMovements = movements.filter((movement) => {
                return movement.createdAt >= from && movement.createdAt <= to;
            });

            console.log(`
Found movements = ${nearbyMovements.length}
`);

            let running = 0;

            for (const movement of nearbyMovements) {
                running += movement.quantity;

                console.log(
                    `${movement.createdAt.toISOString()} | ` +
                    `Movement #${movement.id} | ` +
                    `${movement.type.padEnd(10)} | ` +
                    `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
                    `RUNNING=${running} | ` +
                    `${movement.comment ?? ""}`
                );
            }
        }
    }

    // ================================================================
    // 6. BATCH #4 SEARCH
    // ================================================================

    title("6. BATCH #4 FORENSIC SEARCH");

    const batch4 = await prisma.batch.findUnique({
        where: {
            id: 4,
        },
    });

    console.log(`Batch #4 exists = ${Boolean(batch4)}`);

    if (batch4) {
        console.log(`
${JSON.stringify(batch4, null, 2)}
`);
    } else {
        console.log(`
🔴 Batch #4 does not exist in current database.

Searching ALL references to "Партия №4" / "Batch #4"...
`);
    }

    const batch4Movements = movements.filter((movement) => {
        const comment = movement.comment ?? "";

        return (
            comment.includes("Партия №4") ||
            comment.includes("партия №4") ||
            comment.includes("Batch #4")
        );
    });

    console.log(`
Referenced movements = ${batch4Movements.length}
`);

    let batch4Net = 0;

    for (const movement of batch4Movements) {
        batch4Net += movement.quantity;

        console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}
`);
    }

    console.log(`
Batch #4 movement net = ${batch4Net}
`);

    // ================================================================
    // 7. EARLY MISSING SALES
    // ================================================================

    title("7. EARLY SALES WITHOUT SALE MOVEMENTS");

    const earlyOrderItems = await prisma.orderItem.findMany({
        where: {
            productId: PRODUCT_ID,
            order: {
                is: {
                    date: {
                        lt: new Date("2026-08-01T08:38:56.380Z"),
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

    let missingSalesQty = 0;

    for (const item of earlyOrderItems) {
        const returnedQty = item.ReturnBatch.reduce(
            (sum, returnBatch) => sum + returnBatch.quantity,
            0
        );

        const netQty = item.quantity - returnedQty;

        const saleCommentVariants = [
            `Заказ №${item.orderId}`,
            `Заказ #${item.orderId}`,
        ];

        const matchingSaleMovements = movements.filter((movement) => {
            if (movement.type !== "SALE") {
                return false;
            }

            const comment = movement.comment ?? "";

            return saleCommentVariants.some((variant) =>
                comment.includes(variant)
            );
        });

        const movementQty = matchingSaleMovements.reduce(
            (sum, movement) => sum + movement.quantity,
            0
        );

        const expectedQty = -netQty;

        const gap = expectedQty - movementQty;

        if (gap !== 0) {
            missingSalesQty += Math.abs(gap);

            console.log(`
🔴 Order #${item.orderId}

OrderItem #${item.id}

date=${item.order.date.toISOString()}

gross=${item.quantity}

returned=${returnedQty}

net=${netQty}

expected SALE=${expectedQty}

actual SALE=${movementQty}

gap=${gap}
`);
        }
    }

    console.log(`
TOTAL MISSING EARLY SALE QUANTITY = ${missingSalesQty}
`);

    // ================================================================
    // 8. ANOMALOUS +40
    // ================================================================

    title("8. +40 ANOMALY INVESTIGATION");

    const plus40Movements = movements.filter(
        (movement) => movement.quantity === 40
    );

    console.log(`
Movements with quantity +40 = ${plus40Movements.length}
`);

    for (const movement of plus40Movements) {
        console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}

RAW:

${JSON.stringify(movement, null, 2)}
`);
    }

    // ================================================================
    // 9. QUANTITY CHAIN
    // ================================================================

    title("9. QUANTITY CHAIN RECONSTRUCTION");

    const supplyBusinessQty = supplyItem
        ? supplyItem.quantity
        : 0;

    const supplyMovementQty = plus40Movements.reduce(
        (sum, movement) => sum + movement.quantity,
        0
    );

    const supplyAnomaly =
        supplyMovementQty - supplyBusinessQty;

    const batch4WriteOffQty = Math.abs(
        batch4Movements
            .filter((movement) => movement.type === "WRITE_OFF")
            .reduce((sum, movement) => sum + movement.quantity, 0)
    );

    const explainedQuantity =
        missingSalesQty + batch4WriteOffQty;

    const unexplainedRemainder =
        supplyAnomaly - explainedQuantity;

    console.log(`
Supply #1 business quantity = ${supplyBusinessQty}

Movement quantity (+40 anomaly candidate) = ${supplyMovementQty}

SUPPLY ANOMALY = ${supplyAnomaly}

--------------------------------------------------

Missing early SALE quantity = ${missingSalesQty}

Batch #4 WRITE_OFF quantity = ${batch4WriteOffQty}

Explained quantity total = ${explainedQuantity}

--------------------------------------------------

UNEXPLAINED REMAINDER = ${unexplainedRemainder}
`);

    // ================================================================
    // 10. SEARCH FOR ±4 EVENTS
    // ================================================================

    title("10. SEARCH FOR REMAINING 4 UNITS");

    const suspiciousFourEvents = movements.filter(
        (movement) =>
            Math.abs(movement.quantity) === 4 ||
            Math.abs(movement.quantity) === unexplainedRemainder
    );

    console.log(`
Suspicious movements = ${suspiciousFourEvents.length}
`);

    for (const movement of suspiciousFourEvents) {
        console.log(`
Movement #${movement.id}

type=${movement.type}

quantity=${movement.quantity}

date=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}
`);
    }

    // ================================================================
    // 11. HISTORICAL ORDERS WITH QTY 4
    // ================================================================

    title("11. HISTORICAL ORDER EVENTS WITH QUANTITY 4");

    const qtyFourOrders = await prisma.orderItem.findMany({
        where: {
            productId: PRODUCT_ID,
            quantity: 4,
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
Found OrderItem records with quantity = 4: ${qtyFourOrders.length}
`);

    for (const item of qtyFourOrders) {
        const returned = item.ReturnBatch.reduce(
            (sum, returnBatch) => sum + returnBatch.quantity,
            0
        );

        const net = item.quantity - returned;

        console.log(`
Order #${item.orderId}

OrderItem #${item.id}

date=${item.order.date.toISOString()}

gross=${item.quantity}

returned=${returned}

net=${net}

status=${item.order.status}
`);
    }

    if (qtyFourOrders.length === 0) {
        console.log(`
No OrderItem records found with:

productId=${PRODUCT_ID}

quantity=4
`);
    }

    // ================================================================
    // 12. FORENSIC CONCLUSION
    // ================================================================

    title("12. FORENSIC CONCLUSION");

    console.log(`
KNOWN SUPPLY ANOMALY = +${supplyAnomaly}

KNOWN MISSING EARLY SALES = -${missingSalesQty}

KNOWN MISSING BATCH #4 WRITE-OFF = -${batch4WriteOffQty}

--------------------------------------------------

EXPLAINED = ${explainedQuantity}

UNEXPLAINED REMAINDER = ${unexplainedRemainder}

--------------------------------------------------
`);

    if (unexplainedRemainder === 0) {
        console.log(`
🟢 QUANTITY CHAIN FULLY EXPLAINS THE +40 ANOMALY.

No remaining quantity mismatch.
`);
    } else {
        console.log(`
🟠 QUANTITY CHAIN IS NOT YET FULLY EXPLAINED.

Remaining quantity = ${unexplainedRemainder}

Next repair decision must NOT be made yet.
`);
    }

    title("13. FINAL SAFETY STATUS");

    console.log(`
READ ONLY FORENSIC AUDIT COMPLETED.

Product.stock НЕ изменялся.

Batch НЕ создавались.

Batch НЕ удалялись.

Movement НЕ создавались.

Movement НЕ удалялись.

OrderBatch НЕ изменялись.

ReturnBatch НЕ изменялись.

Supply НЕ изменялись.

Order НЕ изменялись.

🏁 AUDIT V13 ЗАВЕРШЁН
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