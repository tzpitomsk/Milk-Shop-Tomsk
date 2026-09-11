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

function formatDate(
    date: Date | null | undefined
) {
    if (!date) {
        return "NULL";
    }

    return date.toISOString();
}

function signed(value: number) {
    return value >= 0
        ? `+${value}`
        : `${value}`;
}

function extractOrderNumber(
    comment: string | null
): number | null {
    if (!comment) {
        return null;
    }

    const match = comment.match(
        /заказ(?:а)?\s*№\s*(\d+)(?!\d)/i
    );

    if (!match) {
        return null;
    }

    const value = Number(match[1]);

    return Number.isFinite(value)
        ? value
        : null;
}

function extractSupplyNumber(
    comment: string | null
): number | null {
    if (!comment) {
        return null;
    }

    const match = comment.match(
        /поставк[аи]\s*№\s*(\d+)(?!\d)/i
    );

    if (!match) {
        return null;
    }

    const value = Number(match[1]);

    return Number.isFinite(value)
        ? value
        : null;
}

function extractBatchNumber(
    comment: string | null
): number | null {
    if (!comment) {
        return null;
    }

    const match = comment.match(
        /партия\s*№\s*(\d+)(?!\d)/i
    );

    if (!match) {
        return null;
    }

    const value = Number(match[1]);

    return Number.isFinite(value)
        ? value
        : null;
}

async function main() {
    console.log(`
==============================================================================

🧀 ТВОРОГ — LEDGER RECONSTRUCTION FORENSIC AUDIT V19

==============================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

⚠️ V19 НЕ ВЫПОЛНЯЕТ:

create
update
delete
transaction
repair

ЦЕЛЬ V19:

ПРОДОЛЖИТЬ РАССЛЕДОВАНИЕ ПОСЛЕ V18.

V19 СТРОИТ ИСТОРИЧЕСКУЮ РЕКОНСТРУКЦИЮ:

1. SupplyItem
2. Batch
3. OrderItem
4. OrderBatch
5. ReturnBatch
6. Movement
7. Supply ↔ Batch chronology
8. Sale ↔ Order chronology
9. Return chronology
10. Deleted order movement chains
11. Write-off chains
12. Missing Batch references
13. Historical stock reconstruction
14. Independent balance calculations
15. Final forensic hypotheses

ВАЖНО:

V19 НЕ ИСПРАВЛЯЕТ ДАННЫЕ.

==============================================================================

`);

    title(
        "1. PRODUCT — CURRENT STATE"
    );

    const product =
        await prisma.product.findUnique({
            where: {
                id: PRODUCT_ID,
            },
        });

    if (!product) {
        throw new Error(
            `Product #${PRODUCT_ID} not found`
        );
    }

    console.log(`
Product #${product.id}

name=${product.name}

unit=${product.unit}

stock=${product.stock}

cost=${product.cost}

price=${product.price}
`);

    title(
        "2. CURRENT BATCH RECONSTRUCTION"
    );

    const batches =
        await prisma.batch.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            orderBy: [
                {
                    receivedAt: "asc",
                },
                {
                    id: "asc",
                },
            ],
        });

    let currentBatchTotal = 0;

    for (const batch of batches) {
        currentBatchTotal +=
            batch.quantity;

        console.log(`
Batch #${batch.id}

quantity=${batch.quantity}

purchaseCost=${batch.purchaseCost}

receivedAt=${formatDate(
    batch.receivedAt
)}

expiryDate=${formatDate(
    batch.expiryDate
)}

status=${batch.status}
`);
    }

    console.log(`
TOTAL CURRENT BATCH QUANTITY=${currentBatchTotal}

Product.stock=${product.stock}

Difference=${
    product.stock -
    currentBatchTotal
}
`);

    title(
        "3. SUPPLY → BATCH CHRONOLOGY"
    );

    const supplyItems =
        await prisma.supplyItem.findMany({
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

    let totalBusinessSupply = 0;

    for (const item of supplyItems) {
        totalBusinessSupply +=
            item.quantity;

        console.log(`
SUPPLY RECORD

Supply #${item.supplyId}

SupplyItem #${item.id}

quantity=${item.quantity}

cost=${item.cost}

date=${formatDate(
    item.supply.date
)}

NEARBY CURRENT BATCHES:
`);

        const supplyTime =
            item.supply.date.getTime();

        const nearbyBatches =
            batches
                .map((batch) => {
                    const difference =
                        Math.abs(
                            batch.receivedAt.getTime() -
                            supplyTime
                        );

                    return {
                        batch,
                        difference,
                    };
                })
                .sort(
                    (a, b) =>
                        a.difference -
                        b.difference
                )
                .slice(0, 3);

        for (const entry of nearbyBatches) {
            console.log(
                `Batch #${entry.batch.id} | ` +
                `quantity=${entry.batch.quantity} | ` +
                `purchaseCost=${entry.batch.purchaseCost} | ` +
                `receivedAt=${formatDate(
                    entry.batch.receivedAt
                )} | ` +
                `time difference=${entry.difference} ms`
            );
        }
    }

    console.log(`
TOTAL BUSINESS SUPPLY=${totalBusinessSupply}
`);

    title(
        "4. ORDER ITEM → ORDERBATCH RECONSTRUCTION"
    );

    const orderItems =
        await prisma.orderItem.findMany({
            where: {
                productId: PRODUCT_ID,
            },
            include: {
                order: true,
                batches: {
                    include: {
                        batch: true,
                    },
                },
                ReturnBatch: true,
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

    let totalGrossSales = 0;
    let totalReturned = 0;
    let totalNetSales = 0;
    let totalOrderBatchQuantity = 0;

    for (const item of orderItems) {
        const orderBatchTotal =
            item.batches.reduce(
                (
                    sum,
                    link
                ) =>
                    sum +
                    link.quantity,
                0
            );

        const returnBatchTotal =
            item.ReturnBatch.reduce(
                (
                    sum,
                    link
                ) =>
                    sum +
                    link.quantity,
                0
            );

        const net =
            item.quantity -
            item.returned;

        totalGrossSales +=
            item.quantity;

        totalReturned +=
            item.returned;

        totalNetSales +=
            net;

        totalOrderBatchQuantity +=
            orderBatchTotal;

        console.log(`
ORDER #${item.orderId}

OrderItem #${item.id}

date=${formatDate(
    item.order.date
)}

status=${item.order.status}

gross=${item.quantity}

returned field=${item.returned}

net=${net}

OrderBatch total=${orderBatchTotal}

ReturnBatch total=${returnBatchTotal}

ORDERBATCH DETAILS:
`);

        if (
            item.batches.length === 0
        ) {
            console.log(
                "🔴 NO ORDERBATCH LINKS"
            );
        }

        for (
            const link of item.batches
        ) {
            console.log(
                `OrderBatch -> Batch #${link.batchId} | ` +
                `quantity=${link.quantity} | ` +
                `purchaseCost=${link.purchaseCost} | ` +
                `current batch quantity=${link.batch.quantity} | ` +
                `batch receivedAt=${formatDate(
                    link.batch.receivedAt
                )} | ` +
                `expiryDate=${formatDate(
                    link.batch.expiryDate
                )}`
            );
        }

        if (
            item.ReturnBatch.length === 0
        ) {
            console.log(
                "ReturnBatch links=0"
            );
        }

        for (
            const link of item.ReturnBatch
        ) {
            console.log(
                `ReturnBatch -> Batch #${link.batchId} | ` +
                `quantity=${link.quantity}`
            );
        }

        if (
            orderBatchTotal !==
            item.quantity
        ) {
            console.log(
                `🟠 ORDERBATCH GAP=${
                    item.quantity -
                    orderBatchTotal
                }`
            );
        }

        if (
            item.returned !==
            returnBatchTotal
        ) {
            console.log(
                `🟠 RETURN GAP field=${item.returned} ` +
                `ReturnBatch=${returnBatchTotal}`
            );
        }
    }

    console.log(`
TOTAL GROSS SALES=${totalGrossSales}

TOTAL RETURNED=${totalReturned}

TOTAL NET SALES=${totalNetSales}

TOTAL ORDERBATCH QUANTITY=${totalOrderBatchQuantity}

ORDERBATCH GAP=${
    totalGrossSales -
    totalOrderBatchQuantity
}
`);

    title(
        "5. COMPLETE MOVEMENT TIMELINE"
    );

    const movements =
        await prisma.movement.findMany({
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

    let runningBalance = 0;

    for (const movement of movements) {
        runningBalance +=
            movement.quantity;

        console.log(
            `${formatDate(
                movement.createdAt
            )} | ` +
            `#${movement.id} | ` +
            `${movement.type.padEnd(10)} | ` +
            `${signed(
                movement.quantity
            ).padStart(6)} | ` +
            `RUNNING=${runningBalance} | ` +
            `${movement.comment ?? "NULL"}`
        );
    }

    const rawMovementBalance =
        runningBalance;

    console.log(`
RAW FINAL MOVEMENT BALANCE=${rawMovementBalance}
`);

    title(
        "6. SUPPLY MOVEMENT ↔ BUSINESS RECONSTRUCTION"
    );

    const supplyMovementMap =
        new Map<number, number>();

    let supplyMovementWithoutNumber = 0;

    for (const movement of movements) {
        if (
            movement.type !== "SUPPLY"
        ) {
            continue;
        }

        const supplyId =
            extractSupplyNumber(
                movement.comment
            );

        if (
            supplyId === null
        ) {
            supplyMovementWithoutNumber +=
                movement.quantity;

            console.log(`
🔴 SUPPLY MOVEMENT WITHOUT PARSEABLE SUPPLY

Movement #${movement.id}

quantity=${movement.quantity}

comment=${movement.comment ?? "NULL"}
`);

            continue;
        }

        supplyMovementMap.set(
            supplyId,
            (
                supplyMovementMap.get(
                    supplyId
                ) ?? 0
            ) +
            movement.quantity
        );
    }

    for (const item of supplyItems) {
        const movementQuantity =
            supplyMovementMap.get(
                item.supplyId
            ) ?? 0;

        console.log(`
Supply #${item.supplyId}

business=${item.quantity}

movement=${movementQuantity}

difference=${
    item.quantity -
    movementQuantity
}

${
    item.quantity ===
    movementQuantity
        ? "🟢 SUPPLY CHAIN MATCHES"
        : "🟠 SUPPLY CHAIN DOES NOT MATCH"
}
`);
    }

    console.log(`
SUPPLY MOVEMENT WITHOUT PARSEABLE NUMBER=${supplyMovementWithoutNumber}
`);

    title(
        "7. SALE MOVEMENT ↔ CURRENT ORDER RECONSTRUCTION"
    );

    const orderIds =
        new Set(
            orderItems.map(
                (item) =>
                    item.orderId
            )
        );

    const saleMovementMap =
        new Map<number, number>();

    const orphanSales =
        new Map<
            number,
            {
                quantity: number;
                movementIds: number[];
            }
        >();

    for (const movement of movements) {
        if (
            movement.type !== "SALE"
        ) {
            continue;
        }

        const orderId =
            extractOrderNumber(
                movement.comment
            );

        if (
            orderId === null
        ) {
            console.log(`
🔴 SALE WITHOUT PARSEABLE ORDER

Movement #${movement.id}

quantity=${movement.quantity}

comment=${movement.comment ?? "NULL"}
`);

            continue;
        }

        if (
            !orderIds.has(
                orderId
            )
        ) {
            const current =
                orphanSales.get(
                    orderId
                ) ?? {
                    quantity: 0,
                    movementIds: [],
                };

            current.quantity +=
                movement.quantity;

            current.movementIds.push(
                movement.id
            );

            orphanSales.set(
                orderId,
                current
            );

            continue;
        }

        saleMovementMap.set(
            orderId,
            (
                saleMovementMap.get(
                    orderId
                ) ?? 0
            ) +
            movement.quantity
        );
    }

    for (const item of orderItems) {
        const expected =
            -item.quantity;

        const actual =
            saleMovementMap.get(
                item.orderId
            ) ?? 0;

        console.log(`
Order #${item.orderId}

gross=${item.quantity}

expected SALE=${expected}

actual SALE=${actual}

difference=${
    expected -
    actual
}

${
    expected === actual
        ? "🟢 SALE CHAIN MATCHES"
        : "🟠 SALE CHAIN DOES NOT MATCH"
}
`);
    }

    title(
        "8. DELETED / ORPHAN ORDER CHAIN RECONSTRUCTION"
    );

    const orphanOrderMap =
        new Map<
            number,
            {
                sale: number;
                return: number;
                saleIds: number[];
                returnIds: number[];
                firstDate: Date | null;
                lastDate: Date | null;
            }
        >();

    for (const movement of movements) {
        if (
            movement.type !== "SALE" &&
            movement.type !== "RETURN"
        ) {
            continue;
        }

        const orderId =
            extractOrderNumber(
                movement.comment
            );

        if (
            orderId === null
        ) {
            continue;
        }

        if (
            orderIds.has(
                orderId
            )
        ) {
            continue;
        }

        const current =
            orphanOrderMap.get(
                orderId
            ) ?? {
                sale: 0,
                return: 0,
                saleIds: [],
                returnIds: [],
                firstDate: null,
                lastDate: null,
            };

        if (
            current.firstDate === null ||
            movement.createdAt <
            current.firstDate
        ) {
            current.firstDate =
                movement.createdAt;
        }

        if (
            current.lastDate === null ||
            movement.createdAt >
            current.lastDate
        ) {
            current.lastDate =
                movement.createdAt;
        }

        if (
            movement.type === "SALE"
        ) {
            current.sale +=
                movement.quantity;

            current.saleIds.push(
                movement.id
            );
        }

        if (
            movement.type === "RETURN"
        ) {
            current.return +=
                movement.quantity;

            current.returnIds.push(
                movement.id
            );
        }

        orphanOrderMap.set(
            orderId,
            current
        );
    }

    let orphanNetTotal = 0;

    for (
        const [
            orderId,
            data
        ]
        of Array.from(
            orphanOrderMap.entries()
        ).sort(
            ([a], [b]) =>
                a - b
        )
    ) {
        const net =
            data.sale +
            data.return;

        orphanNetTotal +=
            net;

        console.log(`
ORPHAN / DELETED ORDER #${orderId}

first movement=${formatDate(
    data.firstDate
)}

last movement=${formatDate(
    data.lastDate
)}

SALE total=${data.sale}

RETURN total=${data.return}

NET=${net}

SALE Movement IDs=${
    data.saleIds.join(", ") ||
    "none"
}

RETURN Movement IDs=${
    data.returnIds.join(", ") ||
    "none"
}

${
    net === 0
        ? "🟢 HISTORICAL ORDER CHAIN NETS TO ZERO"
        : "🔴 HISTORICAL ORDER CHAIN DOES NOT NET TO ZERO"
}
`);
    }

    console.log(`
TOTAL ORPHAN ORDER NET=${orphanNetTotal}
`);

    title(
        "9. RETURN RECONSTRUCTION"
    );

    const returnMovementMap =
        new Map<number, number>();

    for (const movement of movements) {
        if (
            movement.type !== "RETURN"
        ) {
            continue;
        }

        const orderId =
            extractOrderNumber(
                movement.comment
            );

        if (
            orderId === null
        ) {
            continue;
        }

        if (
            !orderIds.has(
                orderId
            )
        ) {
            continue;
        }

        returnMovementMap.set(
            orderId,
            (
                returnMovementMap.get(
                    orderId
                ) ?? 0
            ) +
            movement.quantity
        );
    }

    for (const item of orderItems) {
        const movementReturn =
            returnMovementMap.get(
                item.orderId
            ) ?? 0;

        const returnBatchTotal =
            item.ReturnBatch.reduce(
                (
                    sum,
                    link
                ) =>
                    sum +
                    link.quantity,
                0
            );

        console.log(`
Order #${item.orderId}

returned field=${item.returned}

ReturnBatch=${returnBatchTotal}

RETURN Movement=${movementReturn}

field ↔ ReturnBatch difference=${
    item.returned -
    returnBatchTotal
}

field ↔ Movement difference=${
    item.returned -
    movementReturn
}
`);
    }

    title(
        "10. WRITE-OFF RECONSTRUCTION"
    );

    const currentBatchIds =
        new Set(
            batches.map(
                (batch) =>
                    batch.id
            )
        );

    let writeOffExistingBatchTotal = 0;
    let writeOffMissingBatchTotal = 0;
    let writeOffUnparsedTotal = 0;

    for (const movement of movements) {
        if (
            movement.type !==
            "WRITE_OFF"
        ) {
            continue;
        }

        const batchId =
            extractBatchNumber(
                movement.comment
            );

        if (
            batchId === null
        ) {
            writeOffUnparsedTotal +=
                movement.quantity;

            console.log(`
🟠 WRITE-OFF WITHOUT PARSEABLE BATCH

Movement #${movement.id}

quantity=${movement.quantity}

date=${formatDate(
    movement.createdAt
)}

comment=${movement.comment ?? "NULL"}
`);

            continue;
        }

        if (
            currentBatchIds.has(
                batchId
            )
        ) {
            writeOffExistingBatchTotal +=
                movement.quantity;

            const batch =
                batches.find(
                    (candidate) =>
                        candidate.id ===
                        batchId
                );

            console.log(`
WRITE-OFF Movement #${movement.id}

quantity=${movement.quantity}

Batch #${batchId} EXISTS

current batch quantity=${
    batch?.quantity ??
    "UNKNOWN"
}

batch receivedAt=${formatDate(
    batch?.receivedAt
)}

batch expiryDate=${formatDate(
    batch?.expiryDate
)}
`);
        } else {
            writeOffMissingBatchTotal +=
                movement.quantity;

            console.log(`
🔴 WRITE-OFF Movement #${movement.id}

quantity=${movement.quantity}

Batch #${batchId} DOES NOT EXIST

date=${formatDate(
    movement.createdAt
)}

comment=${movement.comment ?? "NULL"}

FORENSIC NOTE:

Current database no longer contains
the referenced Batch.
`);
        }
    }

    console.log(`
WRITE-OFF EXISTING BATCH TOTAL=${writeOffExistingBatchTotal}

WRITE-OFF MISSING BATCH TOTAL=${writeOffMissingBatchTotal}

WRITE-OFF UNPARSED TOTAL=${writeOffUnparsedTotal}
`);

    title(
        "11. INDEPENDENT BUSINESS STOCK CALCULATION"
    );

    const expectedFromBusiness =
        totalBusinessSupply -
        totalNetSales;

    console.log(`
BUSINESS SUPPLY=${totalBusinessSupply}

NET SALES=${totalNetSales}

SUPPLY - NET SALES=${expectedFromBusiness}

CURRENT Product.stock=${product.stock}

DIFFERENCE BEFORE WRITE-OFF=${
    expectedFromBusiness -
    product.stock
}

KNOWN WRITE-OFF TOTAL=${
    writeOffExistingBatchTotal +
    writeOffMissingBatchTotal +
    writeOffUnparsedTotal
}

IMPORTANT:

This section does NOT assume
that all historical records belong
to one complete uninterrupted chain.

It only shows arithmetic.
`);

    title(
        "12. MOVEMENT LEDGER RECONSTRUCTION"
    );

    let supplyMovementTotal = 0;
    let saleMovementTotal = 0;
    let returnMovementTotal = 0;
    let writeOffMovementTotal = 0;

    for (const movement of movements) {
        if (
            movement.type === "SUPPLY"
        ) {
            supplyMovementTotal +=
                movement.quantity;
        }

        if (
            movement.type === "SALE"
        ) {
            saleMovementTotal +=
                movement.quantity;
        }

        if (
            movement.type === "RETURN"
        ) {
            returnMovementTotal +=
                movement.quantity;
        }

        if (
            movement.type === "WRITE_OFF"
        ) {
            writeOffMovementTotal +=
                movement.quantity;
        }
    }

    const calculatedMovementBalance =
        supplyMovementTotal +
        saleMovementTotal +
        returnMovementTotal +
        writeOffMovementTotal;

    console.log(`
SUPPLY=${supplyMovementTotal}

SALE=${saleMovementTotal}

RETURN=${returnMovementTotal}

WRITE_OFF=${writeOffMovementTotal}

CALCULATED BALANCE=${calculatedMovementBalance}

RAW RUNNING BALANCE=${rawMovementBalance}

Product.stock=${product.stock}

Product.stock - Movement balance=${
    product.stock -
    calculatedMovementBalance
}
`);

    title(
        "13. BATCH ID HISTORICAL GAP INVESTIGATION"
    );

    if (
        batches.length > 0
    ) {
        const ids =
            batches
                .map(
                    (batch) =>
                        batch.id
                )
                .sort(
                    (a, b) =>
                        a - b
                );

        const minId =
            ids[0];

        const maxId =
            ids[
                ids.length - 1
            ];

        console.log(`
CURRENT BATCH ID RANGE

first=${minId}

last=${maxId}

CURRENT BATCH IDS=${ids.join(
    ", "
)}

MISSING IDs IN CURRENT RANGE:
`);

        const missingIds: number[] = [];

        for (
            let id = minId;
            id <= maxId;
            id++
        ) {
            if (
                !currentBatchIds.has(
                    id
                )
            ) {
                missingIds.push(
                    id
                );
            }
        }

        console.log(
            missingIds.length > 0
                ? missingIds.join(", ")
                : "none"
        );

        console.log(`
NOTE:

A missing Batch ID does NOT by itself
prove data corruption.

Batch records may have been deleted
historically.

However, a Movement referencing
a missing Batch is forensic evidence
that requires investigation.
`);
    }

    title(
        "14. CHRONOLOGICAL EVENT RECONSTRUCTION"
    );

    type EventRow = {
        date: Date;
        kind: string;
        quantity: number;
        description: string;
    };

    const events: EventRow[] = [];

    for (
        const item of supplyItems
    ) {
        events.push({
            date: item.supply.date,
            kind: "BUSINESS_SUPPLY",
            quantity: item.quantity,
            description:
                `Supply #${item.supplyId} ` +
                `quantity=${item.quantity}`,
        });
    }

    for (
        const batch of batches
    ) {
        events.push({
            date: batch.receivedAt,
            kind: "BATCH_RECEIVED",
            quantity: batch.quantity,
            description:
                `Batch #${batch.id} ` +
                `currentQuantity=${batch.quantity}`,
        });
    }

    for (
        const item of orderItems
    ) {
        events.push({
            date: item.order.date,
            kind: "BUSINESS_SALE",
            quantity: -item.quantity,
            description:
                `Order #${item.orderId} ` +
                `gross=${item.quantity} ` +
                `returned=${item.returned}`,
        });
    }

    for (
        const movement of movements
    ) {
        events.push({
            date: movement.createdAt,
            kind:
                `MOVEMENT_${movement.type}`,
            quantity:
                movement.quantity,
            description:
                `Movement #${movement.id} ` +
                `${movement.comment ?? "NULL"}`,
        });
    }

    events.sort(
        (a, b) =>
            a.date.getTime() -
            b.date.getTime()
    );

    let chronologicalBalance = 0;

    for (
        const event of events
    ) {
        if (
            event.kind.startsWith(
                "MOVEMENT_"
            )
        ) {
            chronologicalBalance +=
                event.quantity;
        }

        console.log(
            `${formatDate(
                event.date
            )} | ` +
            `${event.kind.padEnd(20)} | ` +
            `${signed(
                event.quantity
            ).padStart(6)} | ` +
            `${event.description}`
        );
    }

    console.log(`
FINAL MOVEMENT BALANCE FROM TIMELINE=${chronologicalBalance}
`);

    title(
        "15. FORENSIC FINDINGS"
    );

    const productBatchConsistent =
        product.stock ===
        currentBatchTotal;

    const missingSupply =
        totalBusinessSupply -
        supplyMovementTotal;

    const orderBatchGap =
        totalGrossSales -
        totalOrderBatchQuantity;

    console.log(`
A. CURRENT PRODUCT ↔ BATCH STATE

Product.stock=${product.stock}

Current Batch total=${currentBatchTotal}

STATUS=${
    productBatchConsistent
        ? "🟢 CONSISTENT"
        : "🔴 NOT CONSISTENT"
}

---

B. BUSINESS SUPPLY ↔ SUPPLY MOVEMENTS

Business supply=${totalBusinessSupply}

Supply movements=${supplyMovementTotal}

Arithmetic difference=${missingSupply}

NOTE:

This is a total arithmetic comparison.
Individual chains must still be checked.

---

C. ORDER ↔ ORDERBATCH

Gross sales=${totalGrossSales}

OrderBatch quantity=${totalOrderBatchQuantity}

Gap=${orderBatchGap}

STATUS=${
    orderBatchGap === 0
        ? "🟢 COMPLETE"
        : "🟠 HISTORICAL ORDERBATCH LINKS MISSING"
}

---

D. DELETED / ORPHAN ORDERS

Net orphan movement=${orphanNetTotal}

STATUS=${
    orphanNetTotal === 0
        ? "🟢 ORPHAN CHAINS ARE NET ZERO"
        : "🔴 ORPHAN CHAINS CHANGE LEDGER BALANCE"
}

---

E. WRITE-OFF REFERENCES

Existing Batch write-off=${writeOffExistingBatchTotal}

Missing Batch write-off=${writeOffMissingBatchTotal}

Unparsed write-off=${writeOffUnparsedTotal}

STATUS=${
    writeOffMissingBatchTotal === 0
        ? "🟢 NO MISSING BATCH REFERENCES"
        : "🔴 HISTORICAL BATCH CHAIN MISSING"
}

---

F. CURRENT SAFETY

${
    productBatchConsistent
        ? "🟢 CURRENT STOCK SHOULD NOT BE AUTOMATICALLY REPAIRED"
        : "🔴 CURRENT STOCK REQUIRES FURTHER INVESTIGATION"
}
`);

    title(
        "16. FINAL FORENSIC STATUS"
    );

    console.log(`
CURRENT DATABASE

Product.stock=${product.stock}

Current Batch total=${currentBatchTotal}

Product ↔ Batch difference=${
    product.stock -
    currentBatchTotal
}

---

BUSINESS HISTORY

Total Supply=${totalBusinessSupply}

Gross Sales=${totalGrossSales}

Returned=${totalReturned}

Net Sales=${totalNetSales}

---

RELATIONAL HISTORY

OrderBatch quantity=${totalOrderBatchQuantity}

OrderBatch gap=${orderBatchGap}

---

MOVEMENT LEDGER

SUPPLY=${supplyMovementTotal}

SALE=${saleMovementTotal}

RETURN=${returnMovementTotal}

WRITE_OFF=${writeOffMovementTotal}

RAW BALANCE=${rawMovementBalance}

---

ORPHAN ORDER CHAINS

Net=${orphanNetTotal}

---

WRITE-OFF MISSING BATCH REFERENCES

Total=${writeOffMissingBatchTotal}

---

FINAL STATUS

${
    productBatchConsistent
        ? "🟢 CURRENT PRODUCT/BATCH STATE IS INTERNALLY CONSISTENT"
        : "🔴 CURRENT PRODUCT/BATCH STATE IS NOT INTERNALLY CONSISTENT"
}

🟠 HISTORICAL LEDGER CONTAINS
MULTIPLE GENERATIONS OF DATA.

🟠 SOME HISTORICAL CHAINS ARE
INCOMPLETE OR DELETED.

🚫 NO AUTOMATIC REPAIR IS AUTHORIZED.

NEXT STEP MUST BE BASED ON
THE RESULTS OF THIS V19 AUDIT.
`);

    title(
        "17. FINAL SAFETY STATUS"
    );

    console.log(`
STRICT READ ONLY AUDIT COMPLETED.

NO Product changed.

NO Product.stock changed.

NO Batch created.

NO Batch deleted.

NO Batch updated.

NO Movement created.

NO Movement deleted.

NO Movement updated.

NO Supply changed.

NO SupplyItem changed.

NO Order changed.

NO OrderItem changed.

NO OrderBatch changed.

NO ReturnBatch changed.

NO Supplier changed.

NO database repair executed.

🏁 AUDIT V19 COMPLETED
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