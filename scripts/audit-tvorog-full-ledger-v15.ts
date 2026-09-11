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

function date(value: Date | null | undefined) {
    if (!value) {
        return "NULL";
    }

    return value.toISOString();
}

function signed(value: number) {
    return value >= 0 ? `+${value}` : String(value);
}

function exactSupplyNumberFromComment(
    comment: string | null,
    supplyId: number
) {
    if (!comment) {
        return false;
    }

    const normalized = comment.toLowerCase();

    const patterns = [
        new RegExp(`поставка\\s*[№#]?\\s*${supplyId}(?!\\d)`, "i"),
        new RegExp(`приход\\s+поставка\\s*[№#]?\\s*${supplyId}(?!\\d)`, "i"),
        new RegExp(`supply\\s*[№#]?\\s*${supplyId}(?!\\d)`, "i"),
    ];

    return patterns.some((pattern) => pattern.test(normalized));
}

function exactOrderNumberFromComment(
    comment: string | null,
    orderId: number
) {
    if (!comment) {
        return false;
    }

    const patterns = [
        new RegExp(`заказ\\s*[№#]?\\s*${orderId}(?!\\d)`, "i"),
        new RegExp(`order\\s*[№#]?\\s*${orderId}(?!\\d)`, "i"),
    ];

    return patterns.some((pattern) => pattern.test(comment));
}

async function main() {
    console.log(`
======================================================================

🧀 ТВОРОГ — FULL LEDGER FORENSIC AUDIT V15

======================================================================

⚠️ READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

ЦЕЛЬ:

Построить полную сверку:

1. Product
2. SupplyItem
3. Batch
4. Movement SUPPLY
5. OrderItem
6. OrderBatch
7. ReturnBatch
8. Movement SALE
9. Movement RETURN
10. WRITE_OFF
11. Финальный количественный баланс

ВАЖНО:

Supply и Order номера сравниваются ТОЧНО.

Например:

Поставка №1 НЕ совпадает с Поставка №12.

Заказ №2 НЕ совпадает с Заказ №23.

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

unit=${product.unit}

stock=${product.stock}

cost=${product.cost}

price=${product.price}
`);

    // ================================================================
    // 2. ALL SUPPLY ITEMS
    // ================================================================

    title("2. ALL SUPPLY ITEMS — BUSINESS SOURCE");

    const supplyItems = await prisma.supplyItem.findMany({
        where: {
            productId: PRODUCT_ID,
        },
        include: {
            supply: true,
        },
        orderBy: {
            supplyId: "asc",
        },
    });

    console.log(`SupplyItem records = ${supplyItems.length}\n`);

    let totalSupplyBusiness = 0;

    for (const item of supplyItems) {
        totalSupplyBusiness += item.quantity;

        console.log(
            `Supply #${item.supplyId} | ` +
            `SupplyItem #${item.id} | ` +
            `quantity=${item.quantity} | ` +
            `cost=${item.cost} | ` +
            `date=${date(item.supply.date)}`
        );
    }

    console.log(`
TOTAL BUSINESS SUPPLY QUANTITY = ${totalSupplyBusiness}
`);

    // ================================================================
    // 3. ALL CURRENT BATCHES
    // ================================================================

    title("3. CURRENT BATCHES");

    const batches = await prisma.batch.findMany({
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

    console.log(`Current Batch records = ${batches.length}\n`);

    let totalCurrentBatchQuantity = 0;

    for (const batch of batches) {
        totalCurrentBatchQuantity += batch.quantity;

        console.log(`
Batch #${batch.id}

quantity=${batch.quantity}

purchaseCost=${batch.purchaseCost}

receivedAt=${date(batch.receivedAt)}

expiryDate=${date(batch.expiryDate)}

status=${batch.status}
`);
    }

    console.log(`
TOTAL CURRENT BATCH QUANTITY = ${totalCurrentBatchQuantity}
`);

    // ================================================================
    // 4. ALL MOVEMENTS
    // ================================================================

    title("4. ALL MOVEMENTS");

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

    console.log(`Movement records = ${movements.length}\n`);

    let movementRunningBalance = 0;

    for (const movement of movements) {
        movementRunningBalance += movement.quantity;

        console.log(
            `${date(movement.createdAt)} | ` +
            `Movement #${movement.id} | ` +
            `${movement.type.padEnd(10)} | ` +
            `${signed(movement.quantity).padStart(5)} | ` +
            `RUNNING=${movementRunningBalance} | ` +
            `${movement.comment ?? ""}`
        );
    }

    console.log(`
FINAL MOVEMENT RUNNING BALANCE = ${movementRunningBalance}
`);

    // ================================================================
    // 5. SUPPLY ↔ MOVEMENT EXACT MATCH
    // ================================================================

    title("5. SUPPLY ↔ MOVEMENT EXACT RECONCILIATION");

    let totalSupplyMovementMatched = 0;
    let supplyMismatchCount = 0;

    for (const supplyItem of supplyItems) {
        const matchingMovements = movements.filter(
            (movement) =>
                movement.type === "SUPPLY" &&
                exactSupplyNumberFromComment(
                    movement.comment,
                    supplyItem.supplyId
                )
        );

        const movementQuantity = matchingMovements.reduce(
            (sum, movement) => sum + movement.quantity,
            0
        );

        totalSupplyMovementMatched += movementQuantity;

        const gap = supplyItem.quantity - movementQuantity;

        console.log(`
Supply #${supplyItem.supplyId}

SupplyItem #${supplyItem.id}

business quantity=${supplyItem.quantity}

matched SUPPLY Movement quantity=${movementQuantity}

gap=${gap}
`);

        if (matchingMovements.length === 0) {
            supplyMismatchCount += 1;

            console.log("🔴 NO EXACT SUPPLY MOVEMENT FOUND");
        } else {
            for (const movement of matchingMovements) {
                console.log(
                    `  Movement #${movement.id} | ` +
                    `${signed(movement.quantity)} | ` +
                    `${date(movement.createdAt)} | ` +
                    `${movement.comment ?? ""}`
                );
            }

            if (gap === 0) {
                console.log("🟢 SUPPLY MATCHED");
            } else {
                supplyMismatchCount += 1;
                console.log("🟠 SUPPLY QUANTITY MISMATCH");
            }
        }
    }

    console.log(`
TOTAL EXACT-MATCHED SUPPLY MOVEMENT QUANTITY = ${totalSupplyMovementMatched}

SUPPLY MISMATCH RECORDS = ${supplyMismatchCount}
`);

    // ================================================================
    // 6. SUPPLY MOVEMENTS WITHOUT BUSINESS SUPPLY MATCH
    // ================================================================

    title("6. SUPPLY MOVEMENTS WITHOUT EXACT BUSINESS MATCH");

    const supplyMovements = movements.filter(
        (movement) => movement.type === "SUPPLY"
    );

    let unmatchedSupplyMovementCount = 0;
    let unmatchedSupplyMovementQuantity = 0;

    for (const movement of supplyMovements) {
        const hasMatch = supplyItems.some((supplyItem) =>
            exactSupplyNumberFromComment(
                movement.comment,
                supplyItem.supplyId
            )
        );

        if (!hasMatch) {
            unmatchedSupplyMovementCount += 1;
            unmatchedSupplyMovementQuantity += movement.quantity;

            console.log(`
🔴 UNMATCHED SUPPLY MOVEMENT

Movement #${movement.id}

quantity=${movement.quantity}

date=${date(movement.createdAt)}

comment=${movement.comment ?? "NULL"}
`);
        }
    }

    console.log(`
UNMATCHED SUPPLY MOVEMENT COUNT = ${unmatchedSupplyMovementCount}

UNMATCHED SUPPLY MOVEMENT QUANTITY = ${unmatchedSupplyMovementQuantity}
`);

    // ================================================================
    // 7. ALL ORDER ITEMS
    // ================================================================

    title("7. ALL ORDER ITEMS — BUSINESS SALES");

    const orderItems = await prisma.orderItem.findMany({
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
        orderBy: {
            orderId: "asc",
        },
    });

    console.log(`OrderItem records = ${orderItems.length}\n`);

    let totalGrossSales = 0;
    let totalReturnedByField = 0;
    let totalReturnedByReturnBatch = 0;
    let totalNetSales = 0;

    for (const item of orderItems) {
        const returnBatchQuantity = item.ReturnBatch.reduce(
            (sum, returnBatch) => sum + returnBatch.quantity,
            0
        );

        const netQuantity = item.quantity - item.returned;

        totalGrossSales += item.quantity;
        totalReturnedByField += item.returned;
        totalReturnedByReturnBatch += returnBatchQuantity;
        totalNetSales += netQuantity;

        console.log(`
Order #${item.orderId}

OrderItem #${item.id}

date=${date(item.order.date)}

status=${item.order.status}

gross=${item.quantity}

returned field=${item.returned}

ReturnBatch total=${returnBatchQuantity}

net=${netQuantity}

OrderBatch links=${item.batches.length}

ReturnBatch links=${item.ReturnBatch.length}
`);

        if (item.batches.length > 0) {
            console.log("  OrderBatch:");

            for (const orderBatch of item.batches) {
                console.log(
                    `    Batch #${orderBatch.batchId} | ` +
                    `quantity=${orderBatch.quantity} | ` +
                    `purchaseCost=${orderBatch.purchaseCost}`
                );
            }
        }

        if (item.ReturnBatch.length > 0) {
            console.log("  ReturnBatch:");

            for (const returnBatch of item.ReturnBatch) {
                console.log(
                    `    ReturnBatch #${returnBatch.id} | ` +
                    `Batch #${returnBatch.batchId} | ` +
                    `quantity=${returnBatch.quantity} | ` +
                    `createdAt=${date(returnBatch.createdAt)}`
                );
            }
        }

        if (item.returned !== returnBatchQuantity) {
            console.log(
                "  🟠 RETURN FIELD ≠ RETURNBATCH TOTAL"
            );
        }
    }

    console.log(`
TOTAL GROSS SALES = ${totalGrossSales}

TOTAL RETURNED (OrderItem.returned) = ${totalReturnedByField}

TOTAL RETURNED (ReturnBatch) = ${totalReturnedByReturnBatch}

TOTAL NET SALES = ${totalNetSales}
`);

    // ================================================================
    // 8. ORDER ↔ SALE MOVEMENT RECONCILIATION
    // ================================================================

    title("8. ORDER ↔ SALE MOVEMENT RECONCILIATION");

    let missingSaleMovementQuantity = 0;
    let saleMismatchCount = 0;

    for (const item of orderItems) {
        const matchingSaleMovements = movements.filter(
            (movement) =>
                movement.type === "SALE" &&
                exactOrderNumberFromComment(
                    movement.comment,
                    item.orderId
                )
        );

        const actualSaleQuantity = matchingSaleMovements.reduce(
            (sum, movement) => sum + movement.quantity,
            0
        );

        const expectedSaleQuantity = -item.quantity;

        const gap =
            expectedSaleQuantity - actualSaleQuantity;

        if (gap !== 0) {
            saleMismatchCount += 1;
            missingSaleMovementQuantity += Math.abs(gap);

            console.log(`
🔴 SALE MISMATCH

Order #${item.orderId}

OrderItem #${item.id}

gross=${item.quantity}

expected SALE Movement=${expectedSaleQuantity}

actual SALE Movement=${actualSaleQuantity}

gap=${gap}
`);

            for (const movement of matchingSaleMovements) {
                console.log(
                    `  Movement #${movement.id} | ` +
                    `${signed(movement.quantity)} | ` +
                    `${date(movement.createdAt)} | ` +
                    `${movement.comment ?? ""}`
                );
            }
        }
    }

    console.log(`
SALE MISMATCH RECORDS = ${saleMismatchCount}

TOTAL ABSOLUTE SALE QUANTITY GAP = ${missingSaleMovementQuantity}
`);

    // ================================================================
    // 9. SALE MOVEMENTS WITHOUT ORDER MATCH
    // ================================================================

    title("9. SALE MOVEMENTS WITHOUT EXACT ORDER MATCH");

    const saleMovements = movements.filter(
        (movement) => movement.type === "SALE"
    );

    let unmatchedSaleMovementCount = 0;
    let unmatchedSaleMovementQuantity = 0;

    for (const movement of saleMovements) {
        const hasMatch = orderItems.some((item) =>
            exactOrderNumberFromComment(
                movement.comment,
                item.orderId
            )
        );

        if (!hasMatch) {
            unmatchedSaleMovementCount += 1;
            unmatchedSaleMovementQuantity += movement.quantity;

            console.log(`
🔴 UNMATCHED SALE MOVEMENT

Movement #${movement.id}

quantity=${movement.quantity}

date=${date(movement.createdAt)}

comment=${movement.comment ?? "NULL"}
`);
        }
    }

    console.log(`
UNMATCHED SALE MOVEMENT COUNT = ${unmatchedSaleMovementCount}

UNMATCHED SALE MOVEMENT QUANTITY = ${unmatchedSaleMovementQuantity}
`);

    // ================================================================
    // 10. RETURN ↔ MOVEMENT RECONCILIATION
    // ================================================================

    title("10. RETURN ↔ MOVEMENT RECONCILIATION");

    const returnMovements = movements.filter(
        (movement) => movement.type === "RETURN"
    );

    let totalReturnMovementQuantity = 0;

    for (const movement of returnMovements) {
        totalReturnMovementQuantity += movement.quantity;
    }

    console.log(`
ReturnBatch quantity total = ${totalReturnedByReturnBatch}

OrderItem.returned total = ${totalReturnedByField}

RETURN Movement quantity total = ${totalReturnMovementQuantity}

ReturnBatch ↔ Movement gap = ${
        totalReturnedByReturnBatch -
        totalReturnMovementQuantity
    }

OrderItem.returned ↔ Movement gap = ${
        totalReturnedByField -
        totalReturnMovementQuantity
    }
`);

    // ================================================================
    // 11. WRITE OFF
    // ================================================================

    title("11. ALL WRITE-OFF MOVEMENTS");

    const writeOffMovements = movements.filter(
        (movement) => movement.type === "WRITE_OFF"
    );

    let totalWriteOffQuantity = 0;

    for (const movement of writeOffMovements) {
        totalWriteOffQuantity += movement.quantity;

        console.log(`
Movement #${movement.id}

quantity=${movement.quantity}

date=${date(movement.createdAt)}

comment=${movement.comment ?? "NULL"}
`);
    }

    console.log(`
TOTAL WRITE-OFF QUANTITY = ${totalWriteOffQuantity}
`);

    // ================================================================
    // 12. MOVEMENT TYPE TOTALS
    // ================================================================

    title("12. MOVEMENT TYPE TOTALS");

    const movementTotals = new Map<string, number>();

    for (const movement of movements) {
        const current =
            movementTotals.get(movement.type) ?? 0;

        movementTotals.set(
            movement.type,
            current + movement.quantity
        );
    }

    for (const [type, quantity] of movementTotals.entries()) {
        console.log(
            `${type.padEnd(15)} = ${signed(quantity)}`
        );
    }

    // ================================================================
    // 13. ORDERBATCH INTEGRITY
    // ================================================================

    title("13. ORDERBATCH QUANTITY INTEGRITY");

    let orderBatchMismatchCount = 0;

    for (const item of orderItems) {
        const orderBatchQuantity = item.batches.reduce(
            (sum, orderBatch) =>
                sum + orderBatch.quantity,
            0
        );

        if (
            item.quantity > 0 &&
            orderBatchQuantity !== item.quantity
        ) {
            orderBatchMismatchCount += 1;

            console.log(`
🟠 ORDERBATCH MISMATCH

Order #${item.orderId}

OrderItem #${item.id}

OrderItem quantity=${item.quantity}

OrderBatch total=${orderBatchQuantity}

gap=${item.quantity - orderBatchQuantity}
`);
        }
    }

    console.log(`
ORDERBATCH MISMATCH RECORDS = ${orderBatchMismatchCount}
`);

    // ================================================================
    // 14. FINAL QUANTITY LEDGER
    // ================================================================

    title("14. FINAL QUANTITY LEDGER");

    const businessCalculatedStock =
        totalSupplyBusiness -
        totalGrossSales +
        totalReturnedByField +
        totalWriteOffQuantity;

    const movementCalculatedStock =
        movementRunningBalance;

    const productStockGap =
        product.stock -
        movementCalculatedStock;

    const batchStockGap =
        product.stock -
        totalCurrentBatchQuantity;

    console.log(`
A. BUSINESS RECORDS

Total SupplyItem quantity
= ${totalSupplyBusiness}

Gross OrderItem sales
= -${totalGrossSales}

Returned quantity
= +${totalReturnedByField}

Write-off quantity
= ${totalWriteOffQuantity}

--------------------------------------

BUSINESS CALCULATED STOCK
= ${businessCalculatedStock}

--------------------------------------

B. MOVEMENT LEDGER

Movement calculated balance
= ${movementCalculatedStock}

--------------------------------------

C. CURRENT DATABASE STATE

Product.stock
= ${product.stock}

Current Batch quantity
= ${totalCurrentBatchQuantity}

--------------------------------------

Product.stock - Movement balance
= ${productStockGap}

Product.stock - Current Batch quantity
= ${batchStockGap}
`);

    // ================================================================
    // 15. FORENSIC RESULT
    // ================================================================

    title("15. FORENSIC RESULT");

    console.log(`
SUPPLY BUSINESS TOTAL
= ${totalSupplyBusiness}

EXACT MATCHED SUPPLY MOVEMENT TOTAL
= ${totalSupplyMovementMatched}

UNMATCHED SUPPLY MOVEMENT QUANTITY
= ${unmatchedSupplyMovementQuantity}

--------------------------------------

GROSS SALES
= ${totalGrossSales}

RETURNED FIELD TOTAL
= ${totalReturnedByField}

RETURNBATCH TOTAL
= ${totalReturnedByReturnBatch}

MISSING / MISMATCH SALE QUANTITY
= ${missingSaleMovementQuantity}

--------------------------------------

WRITE-OFF TOTAL
= ${totalWriteOffQuantity}

--------------------------------------

MOVEMENT FINAL BALANCE
= ${movementCalculatedStock}

PRODUCT.STOCK
= ${product.stock}

CURRENT BATCH TOTAL
= ${totalCurrentBatchQuantity}

--------------------------------------
`);

    if (
        product.stock === totalCurrentBatchQuantity &&
        product.stock === movementCalculatedStock
    ) {
        console.log(`
🟢 CURRENT STOCK IS CONSISTENT

Product.stock = Batch total = Movement balance
`);
    } else {
        console.log(`
🟠 CURRENT STOCK IS NOT FULLY CONSISTENT

Further repair must NOT be performed yet.
`);
    }

    if (
        totalReturnedByField !==
        totalReturnedByReturnBatch
    ) {
        console.log(`
🔴 RETURN DATA INCONSISTENCY DETECTED

OrderItem.returned and ReturnBatch totals differ.
`);
    }

    if (supplyMismatchCount > 0) {
        console.log(`
🟠 SUPPLY RECONCILIATION HAS MISMATCHES
`);
    }

    if (saleMismatchCount > 0) {
        console.log(`
🟠 SALE RECONCILIATION HAS MISMATCHES
`);
    }

    title("16. FINAL SAFETY STATUS");

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

SupplyItem НЕ изменялись.

Order НЕ изменялись.

OrderItem НЕ изменялись.

🏁 AUDIT V15 ЗАВЕРШЁН
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