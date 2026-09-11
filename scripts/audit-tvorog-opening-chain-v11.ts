import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_NAME = "Творог";

function line() {
    console.log(
        "======================================================================",
    );
}

function fmtDate(date: Date | null | undefined) {
    if (!date) return "-";
    return date.toISOString();
}

function fmtQty(quantity: number) {
    return quantity >= 0 ? `+${quantity}` : `${quantity}`;
}

type LedgerRow = {
    date: Date;
    sequence: number;
    source: string;
    type: string;

    businessDelta: number;
    movementDelta: number;

    details: string;
};

async function main() {
    line();
    console.log("");
    console.log("🧀 ТВОРОГ — OPENING CHAIN FORENSIC AUDIT V11");
    console.log("");
    line();

    console.log("");
    console.log("⚠️ READ ONLY");
    console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
    console.log("");

    console.log(
        "Цель: найти первую точку расхождения между Business ledger и Movement ledger.",
    );

    console.log("");

    const product = await prisma.product.findFirst({
        where: {
            name: PRODUCT_NAME,
        },
        include: {
            batches: {
                orderBy: {
                    receivedAt: "asc",
                },
            },
        },
    });

    if (!product) {
        console.log(`🔴 Product "${PRODUCT_NAME}" не найден.`);
        return;
    }

    line();
    console.log("");
    console.log("1. PRODUCT");
    console.log("");
    line();
    console.log("");

    console.log(`Product #${product.id}`);
    console.log(`name=${product.name}`);
    console.log(`stock=${product.stock}`);
    console.log(`cost=${product.cost}`);
    console.log(`price=${product.price}`);

    if (product.batches.length === 0) {
        console.log("");
        console.log("🔴 Batch отсутствуют.");
        return;
    }

    line();
    console.log("");
    console.log("2. CURRENT BATCHES");
    console.log("");
    line();
    console.log("");

    for (const batch of product.batches) {
        console.log(
            `Batch #${batch.id} | ` +
                `received=${fmtDate(batch.receivedAt)} | ` +
                `qty=${batch.quantity} | ` +
                `cost=${batch.purchaseCost} | ` +
                `expiry=${fmtDate(batch.expiryDate)} | ` +
                `status=${batch.status}`,
        );
    }

    const firstBatch = product.batches[0];
    const boundaryDate = firstBatch.receivedAt;

    console.log("");
    console.log(`BOUNDARY BATCH = #${firstBatch.id}`);
    console.log(`BOUNDARY DATE = ${fmtDate(boundaryDate)}`);

    line();
    console.log("");
    console.log("3. LOAD HISTORICAL DATA");
    console.log("");
    line();
    console.log("");

    const orderItems = await prisma.orderItem.findMany({
        where: {
            productId: product.id,
        },
        include: {
            order: true,
            batches: true,
            ReturnBatch: true,
        },
        orderBy: {
            order: {
                date: "asc",
            },
        },
    });

    const supplyItems = await prisma.supplyItem.findMany({
        where: {
            productId: product.id,
        },
        include: {
            supply: true,
        },
        orderBy: {
            supply: {
                date: "asc",
            },
        },
    });

    const movements = await prisma.movement.findMany({
        where: {
            productId: product.id,
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    console.log(`OrderItems = ${orderItems.length}`);
    console.log(`SupplyItems = ${supplyItems.length}`);
    console.log(`Movements = ${movements.length}`);

    line();
    console.log("");
    console.log("4. BUILD BUSINESS LEDGER");
    console.log("");
    line();
    console.log("");

    const rows: LedgerRow[] = [];

    let sequence = 0;

    for (const item of supplyItems) {
        rows.push({
            date: item.supply.date,
            sequence: sequence++,

            source:
                `Supply #${item.supply.id} / ` +
                `SupplyItem #${item.id}`,

            type: "SUPPLY",

            businessDelta: item.quantity,
            movementDelta: 0,

            details:
                `qty=${item.quantity}, cost=${item.cost}`,
        });
    }

    for (const item of orderItems) {
        const returnBatchTotal = item.ReturnBatch.reduce(
            (sum, rb) => sum + rb.quantity,
            0,
        );

        const returned = Math.max(
            item.returned,
            returnBatchTotal,
        );

        const net = item.quantity - returned;

        rows.push({
            date: item.order.date,
            sequence: sequence++,

            source:
                `Order #${item.order.id} / ` +
                `OrderItem #${item.id}`,

            type: "ORDER",

            businessDelta: -net,
            movementDelta: 0,

            details:
                `gross=${item.quantity}, ` +
                `returned=${returned}, ` +
                `net=${net}, ` +
                `status=${item.order.status}`,
        });
    }

    line();
    console.log("");
    console.log("5. BUILD MOVEMENT LEDGER");
    console.log("");
    line();
    console.log("");

    for (const movement of movements) {
        rows.push({
            date: movement.createdAt,
            sequence: sequence++,

            source: `Movement #${movement.id}`,

            type: `MOVEMENT:${movement.type}`,

            businessDelta: 0,
            movementDelta: movement.quantity,

            details:
                movement.comment ?? "-",
        });
    }

    rows.sort((a, b) => {
        const dateDiff =
            a.date.getTime() - b.date.getTime();

        if (dateDiff !== 0) {
            return dateDiff;
        }

        return a.sequence - b.sequence;
    });

    line();
    console.log("");
    console.log("6. UNIFIED FORENSIC TIMELINE");
    console.log("");
    line();
    console.log("");

    let businessBalance = 0;
    let movementBalance = 0;

    let firstDivergence:
        | {
              row: LedgerRow;
              businessBalance: number;
              movementBalance: number;
              gap: number;
          }
        | undefined;

    let maxGap = 0;

    for (const row of rows) {
        businessBalance += row.businessDelta;
        movementBalance += row.movementDelta;

        const gap =
            businessBalance - movementBalance;

        maxGap = Math.max(
            maxGap,
            Math.abs(gap),
        );

        if (
            !firstDivergence &&
            gap !== 0
        ) {
            firstDivergence = {
                row,
                businessBalance,
                movementBalance,
                gap,
            };
        }

        console.log(
            `${fmtDate(row.date)} | ` +
                `${row.type.padEnd(18)} | ` +
                `${row.source} | ` +
                `business=${fmtQty(row.businessDelta)} | ` +
                `movement=${fmtQty(row.movementDelta)} | ` +
                `B=${businessBalance} | ` +
                `M=${movementBalance} | ` +
                `GAP=${gap}`,
        );

        console.log(`  ${row.details}`);
    }

    line();
    console.log("");
    console.log("7. FIRST DIVERGENCE");
    console.log("");
    line();
    console.log("");

    if (!firstDivergence) {
        console.log(
            "🟢 Business ledger и Movement ledger полностью совпадают.",
        );
    } else {
        console.log(
            "🔴 ПЕРВАЯ ТОЧКА РАСХОЖДЕНИЯ НАЙДЕНА",
        );

        console.log("");

        console.log(
            `DATE = ${fmtDate(
                firstDivergence.row.date,
            )}`,
        );

        console.log(
            `TYPE = ${firstDivergence.row.type}`,
        );

        console.log(
            `SOURCE = ${firstDivergence.row.source}`,
        );

        console.log(
            `BUSINESS BALANCE = ${firstDivergence.businessBalance}`,
        );

        console.log(
            `MOVEMENT BALANCE = ${firstDivergence.movementBalance}`,
        );

        console.log(
            `GAP = ${firstDivergence.gap}`,
        );

        console.log("");

        console.log(
            `DETAILS = ${firstDivergence.row.details}`,
        );
    }

    line();
    console.log("");
    console.log("8. PRE-BOUNDARY ANALYSIS");
    console.log("");
    line();
    console.log("");

    const preBoundaryRows = rows.filter(
        (row) =>
            row.date < boundaryDate,
    );

    let preBusiness = 0;
    let preMovement = 0;

    console.log(
        `Boundary = ${fmtDate(boundaryDate)}`,
    );

    console.log("");

    for (const row of preBoundaryRows) {
        preBusiness += row.businessDelta;
        preMovement += row.movementDelta;
    }

    const preGap =
        preBusiness - preMovement;

    console.log(
        `PRE-BOUNDARY BUSINESS DELTA = ${preBusiness}`,
    );

    console.log(
        `PRE-BOUNDARY MOVEMENT DELTA = ${preMovement}`,
    );

    console.log(
        `PRE-BOUNDARY GAP = ${preGap}`,
    );

    console.log("");

    console.log(
        "Проверка: это разница между тем, что говорят Business records и Movement.",
    );

    line();
    console.log("");
    console.log("9. MISSING SALE MOVEMENT CHECK");
    console.log("");
    line();
    console.log("");

    let missingSaleTotal = 0;

    for (
        const item of orderItems.filter(
            (item) =>
                item.order.date <
                boundaryDate,
        )
    ) {
        const returnBatchTotal =
            item.ReturnBatch.reduce(
                (sum, rb) =>
                    sum + rb.quantity,
                0,
            );

        const returned = Math.max(
            item.returned,
            returnBatchTotal,
        );

        const net =
            item.quantity - returned;

        const matches =
            movements.filter(
                (movement) => {
                    if (
                        movement.type !==
                        "SALE"
                    ) {
                        return false;
                    }

                    return (
                        movement.comment?.includes(
                            `Заказ №${item.order.id}`,
                        ) ?? false
                    );
                },
            );

        const movementQty =
            matches.reduce(
                (sum, movement) =>
                    sum +
                    movement.quantity,
                0,
            );

        const expected = -net;

        const gap =
            expected - movementQty;

        if (gap !== 0) {
            missingSaleTotal +=
                Math.abs(gap);
        }

        console.log(
            `Order #${item.order.id} | ` +
                `expected=${expected} | ` +
                `movement=${movementQty} | ` +
                `gap=${gap}`,
        );
    }

    console.log("");

    console.log(
        `TOTAL MISSING PRE-BOUNDARY SALE = ${missingSaleTotal} шт`,
    );

    line();
    console.log("");
    console.log("10. MISSING BATCH #4 CHECK");
    console.log("");
    line();
    console.log("");

    const batch4Movements =
        movements.filter(
            (movement) =>
                movement.comment?.match(
                    /Партия\s*№4/i,
                ),
        );

    let batch4Exists = false;

    try {
        const batch4 =
            await prisma.batch.findUnique({
                where: {
                    id: 4,
                },
            });

        batch4Exists =
            Boolean(batch4);

        console.log(
            `Batch #4 exists = ${batch4Exists}`,
        );
    } catch {
        console.log(
            "⚠️ Проверка Batch #4 не выполнена.",
        );
    }

    let batch4NegativeTotal = 0;

    for (const movement of batch4Movements) {
        console.log(
            `Movement #${movement.id} | ` +
                `type=${movement.type} | ` +
                `qty=${movement.quantity} | ` +
                `date=${fmtDate(
                    movement.createdAt,
                )}`,
        );

        if (movement.quantity < 0) {
            batch4NegativeTotal +=
                Math.abs(
                    movement.quantity,
                );
        }
    }

    console.log("");

    console.log(
        `Batch #4 confirmed negative quantity = ${batch4NegativeTotal} шт`,
    );

    line();
    console.log("");
    console.log("11. RECONCILIATION");
    console.log("");
    line();
    console.log("");

    const currentStock =
        product.stock;

    const businessOpening =
        currentStock -
        businessBalance;

    const movementOpening =
        currentStock -
        movementBalance;

    console.log(
        `Current stock = ${currentStock}`,
    );

    console.log(
        `Business ledger final delta = ${businessBalance}`,
    );

    console.log(
        `Movement ledger final delta = ${movementBalance}`,
    );

    console.log("");

    console.log(
        `BUSINESS OPENING REQUIRED = ${businessOpening}`,
    );

    console.log(
        `MOVEMENT OPENING REQUIRED = ${movementOpening}`,
    );

    console.log("");

    console.log(
        `FINAL GAP = ${
            businessBalance -
            movementBalance
        }`,
    );

    console.log(
        `MAX HISTORICAL GAP = ${maxGap}`,
    );

    line();
    console.log("");
    console.log("12. FORENSIC INTERPRETATION");
    console.log("");
    line();
    console.log("");

    if (firstDivergence) {
        console.log(
            "Первая проблема начинается здесь:",
        );

        console.log(
            `${fmtDate(
                firstDivergence.row.date,
            )}`,
        );

        console.log(
            `${firstDivergence.row.source}`,
        );

        console.log("");

        if (
            firstDivergence.row.type ===
            "ORDER"
        ) {
            console.log(
                "🟠 Первое расхождение вызвано Business ORDER без соответствующего Movement.",
            );
        }

        if (
            firstDivergence.row.type ===
            "SUPPLY"
        ) {
            console.log(
                "🟠 Первое расхождение вызвано Business SUPPLY без соответствующего Movement.",
            );
        }
    }

    console.log("");

    console.log(
        `Missing pre-boundary SALE = ${missingSaleTotal}`,
    );

    console.log(
        `Missing Batch #4 minimum = ${batch4NegativeTotal}`,
    );

    console.log("");

    const hypotheticalHistoricalChain =
        missingSaleTotal +
        batch4NegativeTotal;

    console.log(
        `HYPOTHETICAL CHAIN TOTAL = ${hypotheticalHistoricalChain}`,
    );

    console.log(
        `BUSINESS OPENING REQUIRED = ${businessOpening}`,
    );

    if (
        hypotheticalHistoricalChain ===
        businessOpening
    ) {
        console.log("");

        console.log(
            "🟢 QUANTITY CHAIN MATCH",
        );

        console.log(
            `${businessOpening} = ${missingSaleTotal} + ${batch4NegativeTotal}`,
        );
    } else {
        console.log("");

        console.log(
            "🟠 QUANTITY CHAIN DOES NOT FULLY MATCH",
        );

        console.log(
            `${businessOpening} ≠ ${missingSaleTotal} + ${batch4NegativeTotal}`,
        );
    }

    line();
    console.log("");
    console.log("13. FINAL SAFETY STATUS");
    console.log("");
    line();

    console.log("");
    console.log(
        "READ ONLY FORENSIC AUDIT COMPLETED.",
    );

    console.log("");
    console.log(
        "Batch НЕ создавались.",
    );

    console.log(
        "Movement НЕ создавались.",
    );

    console.log(
        "OrderBatch НЕ изменялись.",
    );

    console.log(
        "ReturnBatch НЕ изменялись.",
    );

    console.log(
        "Product.stock НЕ изменялся.",
    );

    console.log("");
    console.log(
        "🏁 AUDIT V11 ЗАВЕРШЁН",
    );
}

main()
    .catch((error) => {
        console.error("");
        console.error("🔴 AUDIT FAILED");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });