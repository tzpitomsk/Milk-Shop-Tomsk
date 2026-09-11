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

type TimelineRow = {
    date: Date;
    type: string;
    source: string;
    quantity: number;
    details: string;
};

async function main() {
    line();
    console.log("");
    console.log("🧀 ТВОРОГ — OPENING CHAIN AUDIT V10");
    console.log("");
    line();
    console.log("");
    console.log("⚠️ READ ONLY");
    console.log("");
    console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
    console.log("");
    console.log(
        "Цель: проверить цепочку historical opening stock → ранние продажи → missing Batch #4.",
    );
    console.log("");

    line();
    console.log("");
    console.log("1. PRODUCT");
    console.log("");
    line();
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

    console.log(`Product #${product.id}`);
    console.log("");
    console.log(`name=${product.name}`);
    console.log(`stock=${product.stock}`);
    console.log(`cost=${product.cost} ₽`);
    console.log(`price=${product.price} ₽`);

    line();
    console.log("");
    console.log("2. FIRST CURRENT BATCH BOUNDARY");
    console.log("");
    line();
    console.log("");

    const firstCurrentBatch = product.batches[0];

    if (!firstCurrentBatch) {
        console.log("🔴 CURRENT Batch отсутствуют.");
        return;
    }

    console.log(`Batch #${firstCurrentBatch.id}`);
    console.log("");
    console.log(`received=${fmtDate(firstCurrentBatch.receivedAt)}`);
    console.log(`quantity=${firstCurrentBatch.quantity}`);
    console.log(`purchaseCost=${firstCurrentBatch.purchaseCost} ₽`);
    console.log(`expiry=${fmtDate(firstCurrentBatch.expiryDate)}`);
    console.log(`status=${firstCurrentBatch.status}`);

    const boundaryDate = firstCurrentBatch.receivedAt;

    line();
    console.log("");
    console.log("3. ALL TVOROG ORDERS");
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

    let totalGross = 0;
    let totalReturnedField = 0;
    let totalReturnBatch = 0;
    let totalNet = 0;
    let totalOrderBatch = 0;

    let earlyGross = 0;
    let earlyReturned = 0;
    let earlyReturnBatch = 0;
    let earlyNet = 0;
    let earlyOrderBatch = 0;

    const earlyOrders = orderItems.filter(
        (item) => item.order.date < boundaryDate,
    );

    for (const item of orderItems) {
        const returnBatchTotal = item.ReturnBatch.reduce(
            (sum, rb) => sum + rb.quantity,
            0,
        );

        const orderBatchTotal = item.batches.reduce(
            (sum, ob) => sum + ob.quantity,
            0,
        );

        const returned = Math.max(item.returned, returnBatchTotal);
        const net = item.quantity - returned;

        const isEarly = item.order.date < boundaryDate;

        totalGross += item.quantity;
        totalReturnedField += item.returned;
        totalReturnBatch += returnBatchTotal;
        totalNet += net;
        totalOrderBatch += orderBatchTotal;

        if (isEarly) {
            earlyGross += item.quantity;
            earlyReturned += item.returned;
            earlyReturnBatch += returnBatchTotal;
            earlyNet += net;
            earlyOrderBatch += orderBatchTotal;
        }

        console.log(
            `Order #${item.order.id} | ` +
            `date=${fmtDate(item.order.date)} | ` +
            `OrderItem #${item.id} | ` +
            `gross=${item.quantity} | ` +
            `returned=${item.returned} | ` +
            `ReturnBatch=${returnBatchTotal} | ` +
            `net=${net} | ` +
            `OrderBatch=${orderBatchTotal} | ` +
            `status=${item.order.status} | ` +
            `${isEarly ? "PRE-BATCH" : "POST-BATCH"}`,
        );
    }

    console.log("");
    console.log("--- ALL ORDER TOTALS ---");
    console.log("");
    console.log(`GROSS ORDERS = ${totalGross} шт`);
    console.log(`RETURNED FIELD = ${totalReturnedField} шт`);
    console.log(`RETURNBATCH TOTAL = ${totalReturnBatch} шт`);
    console.log(`NET ORDERS = ${totalNet} шт`);
    console.log(`ORDERBATCH COVERAGE = ${totalOrderBatch} шт`);

    console.log("");
    console.log("--- PRE-BATCH ORDER TOTALS ---");
    console.log("");
    console.log(`PRE-BATCH GROSS = ${earlyGross} шт`);
    console.log(`PRE-BATCH RETURNED FIELD = ${earlyReturned} шт`);
    console.log(`PRE-BATCH RETURNBATCH TOTAL = ${earlyReturnBatch} шт`);
    console.log(`PRE-BATCH NET = ${earlyNet} шт`);
    console.log(`PRE-BATCH ORDERBATCH COVERAGE = ${earlyOrderBatch} шт`);

    line();
    console.log("");
    console.log("4. ALL SUPPLIES");
    console.log("");
    line();
    console.log("");

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

    let supplyTotal = 0;
    let preBatchSupply = 0;

    for (const item of supplyItems) {
        const isPreBatch = item.supply.date < boundaryDate;

        supplyTotal += item.quantity;

        if (isPreBatch) {
            preBatchSupply += item.quantity;
        }

        console.log(
            `SupplyItem #${item.id} | ` +
            `Supply #${item.supply.id} | ` +
            `date=${fmtDate(item.supply.date)} | ` +
            `qty=${item.quantity} | ` +
            `cost=${item.cost} ₽ | ` +
            `${isPreBatch ? "PRE-BATCH" : "POST-BATCH"}`,
        );
    }

    console.log("");
    console.log(`SUPPLY TOTAL = ${supplyTotal} шт`);
    console.log(`PRE-BATCH SUPPLY TOTAL = ${preBatchSupply} шт`);

    line();
    console.log("");
    console.log("5. ALL MOVEMENTS");
    console.log("");
    line();
    console.log("");

    const movements = await prisma.movement.findMany({
        where: {
            productId: product.id,
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    let movementNet = 0;
    let saleMovementNet = 0;
    let returnMovementTotal = 0;
    let supplyMovementTotal = 0;
    let writeOffMovementTotal = 0;

    let preBatchMovementNet = 0;
    let preBatchSaleMovementNet = 0;

    for (const movement of movements) {
        const isPreBatch = movement.createdAt < boundaryDate;

        movementNet += movement.quantity;

        if (movement.type === "SALE") {
            saleMovementNet += movement.quantity;
        }

        if (movement.type === "RETURN") {
            returnMovementTotal += movement.quantity;
        }

        if (movement.type === "SUPPLY") {
            supplyMovementTotal += movement.quantity;
        }

        if (movement.type === "WRITE_OFF") {
            writeOffMovementTotal += movement.quantity;
        }

        if (isPreBatch) {
            preBatchMovementNet += movement.quantity;

            if (movement.type === "SALE") {
                preBatchSaleMovementNet += movement.quantity;
            }
        }

        console.log(
            `Movement #${movement.id} | ` +
            `date=${fmtDate(movement.createdAt)} | ` +
            `type=${movement.type} | ` +
            `qty=${fmtQty(movement.quantity)} | ` +
            `comment=${movement.comment ?? "-"} | ` +
            `${isPreBatch ? "PRE-BATCH" : "POST-BATCH"}`,
        );
    }

    console.log("");
    console.log("--- MOVEMENT TOTALS ---");
    console.log("");
    console.log(`MOVEMENT NET = ${movementNet} шт`);
    console.log(`SALE MOVEMENT NET = ${saleMovementNet} шт`);
    console.log(`RETURN MOVEMENT TOTAL = ${returnMovementTotal} шт`);
    console.log(`SUPPLY MOVEMENT TOTAL = ${supplyMovementTotal} шт`);
    console.log(`WRITE-OFF MOVEMENT TOTAL = ${writeOffMovementTotal} шт`);
    console.log("");
    console.log(`PRE-BATCH MOVEMENT NET = ${preBatchMovementNet} шт`);
    console.log(
        `PRE-BATCH SALE MOVEMENT NET = ${preBatchSaleMovementNet} шт`,
    );

    line();
    console.log("");
    console.log("6. PRE-BATCH ORDER ↔ MOVEMENT CHAIN");
    console.log("");
    line();
    console.log("");

    let missingEarlySaleMovement = 0;
    let ordersWithMissingMovement = 0;

    for (const item of earlyOrders) {
        const returnBatchTotal = item.ReturnBatch.reduce(
            (sum, rb) => sum + rb.quantity,
            0,
        );

        const returned = Math.max(item.returned, returnBatchTotal);
        const net = item.quantity - returned;

        const expectedMovement = -net;

        const matchingMovements = movements.filter((movement) => {
            if (movement.type !== "SALE") {
                return false;
            }

            if (!movement.comment) {
                return false;
            }

            return movement.comment.includes(`Заказ №${item.order.id}`);
        });

        const actualMovement = matchingMovements.reduce(
            (sum, movement) => sum + movement.quantity,
            0,
        );

        const gap = expectedMovement - actualMovement;

        console.log(
            `Order #${item.order.id} | ` +
            `OrderItem #${item.id} | ` +
            `date=${fmtDate(item.order.date)} | ` +
            `expected=${expectedMovement} | ` +
            `actual=${actualMovement} | ` +
            `gap=${gap}`,
        );

        if (matchingMovements.length === 0) {
            console.log("  🔴 SALE Movement: НЕТ");
        } else {
            for (const movement of matchingMovements) {
                console.log(
                    `  🟢 Movement #${movement.id} | ` +
                    `qty=${movement.quantity} | ` +
                    `date=${fmtDate(movement.createdAt)}`,
                );
            }
        }

        if (gap !== 0) {
            ordersWithMissingMovement += 1;
            missingEarlySaleMovement += Math.abs(gap);

            console.log(`  🔴 MOVEMENT GAP = ${gap} шт`);
        } else {
            console.log("  🟢 MOVEMENT COVERAGE OK");
        }

        console.log("");
    }

    console.log(`ORDERS WITH MOVEMENT GAP = ${ordersWithMissingMovement}`);
    console.log(
        `TOTAL MISSING PRE-BATCH SALE MOVEMENT = ${missingEarlySaleMovement} шт`,
    );

    line();
    console.log("");
    console.log("7. MISSING HISTORICAL BATCH REFERENCES");
    console.log("");
    line();
    console.log("");

    const batchReferenceRegex = /Партия\s*№(\d+)/i;

    const referencedBatchMap = new Map<
        number,
        {
            movements: typeof movements;
        }
    >();

    for (const movement of movements) {
        if (!movement.comment) {
            continue;
        }

        const match = movement.comment.match(batchReferenceRegex);

        if (!match) {
            continue;
        }

        const batchId = Number(match[1]);

        if (!referencedBatchMap.has(batchId)) {
            referencedBatchMap.set(batchId, {
                movements: [],
            });
        }

        referencedBatchMap.get(batchId)!.movements.push(movement);
    }

    const batchExistenceMap = new Map<number, boolean>();
    let missingBatchConfirmedMinimum = 0;

    for (const [batchId, data] of referencedBatchMap.entries()) {
        const batch = await prisma.batch.findUnique({
            where: {
                id: batchId,
            },
        });

        batchExistenceMap.set(batchId, Boolean(batch));

        const movementTotal = data.movements.reduce(
            (sum, movement) => sum + movement.quantity,
            0,
        );

        console.log(
            `${batch ? "🟢" : "🔴"} Batch #${batchId} | ` +
            `exists=${Boolean(batch)} | ` +
            `movement net=${movementTotal}`,
        );

        for (const movement of data.movements) {
            console.log(
                `  Movement #${movement.id} | ` +
                `${movement.type} | ` +
                `qty=${movement.quantity} | ` +
                `${fmtDate(movement.createdAt)} | ` +
                `${movement.comment}`,
            );
        }

        if (!batch) {
            const minimumQuantity = Math.abs(
                data.movements
                    .filter((movement) => movement.quantity < 0)
                    .reduce(
                        (sum, movement) => sum + movement.quantity,
                        0,
                    ),
            );

            missingBatchConfirmedMinimum += minimumQuantity;

            console.log(
                `  🔴 MINIMUM CONFIRMED HISTORICAL QUANTITY = ${minimumQuantity} шт`,
            );
        }

        console.log("");
    }

    line();
    console.log("");
    console.log("8. OPENING STOCK MODELS");
    console.log("");
    line();
    console.log("");

    const currentStock = product.stock;

    const grossOrders = totalGross;
    const returnedOrders = Math.max(
        totalReturnedField,
        totalReturnBatch,
    );
    const writeOffAbsolute = Math.abs(writeOffMovementTotal);

    const businessOpening =
        currentStock -
        supplyTotal +
        grossOrders -
        returnedOrders +
        writeOffAbsolute;

    const movementOpening = currentStock - movementNet;

    console.log("--- BUSINESS MODEL ---");
    console.log("");
    console.log(`Current stock = ${currentStock} шт`);
    console.log(`Supply = ${supplyTotal} шт`);
    console.log(`Gross orders = ${grossOrders} шт`);
    console.log(`Returns = ${returnedOrders} шт`);
    console.log(`Write-offs = ${writeOffAbsolute} шт`);
    console.log("");
    console.log(
        `OPENING = ${currentStock} - ${supplyTotal} + ${grossOrders} - ${returnedOrders} + ${writeOffAbsolute}`,
    );
    console.log(`BUSINESS OPENING REQUIRED = ${businessOpening} шт`);

    console.log("");
    console.log("--- MOVEMENT MODEL ---");
    console.log("");
    console.log(`Current stock = ${currentStock} шт`);
    console.log(`Movement net = ${movementNet} шт`);
    console.log(`MOVEMENT OPENING REQUIRED = ${movementOpening} шт`);

    const globalModelGap = businessOpening - movementOpening;

    console.log("");
    console.log(`GLOBAL MODEL GAP = ${globalModelGap} шт`);

    line();
    console.log("");
    console.log("9. HISTORICAL OPENING CHAIN HYPOTHESIS");
    console.log("");
    line();
    console.log("");

    const unexplainedOpening =
        businessOpening - missingBatchConfirmedMinimum;

    console.log(
        `A. BUSINESS OPENING REQUIRED = ${businessOpening} шт`,
    );
    console.log(
        `B. CONFIRMED MISSING BATCH MINIMUM = ${missingBatchConfirmedMinimum} шт`,
    );
    console.log(
        `C. OPENING NOT EXPLAINED BY MISSING BATCH = ${unexplainedOpening} шт`,
    );
    console.log(
        `D. MISSING PRE-BATCH SALE MOVEMENT = ${missingEarlySaleMovement} шт`,
    );

    console.log("");

    const chainMatches =
        unexplainedOpening === missingEarlySaleMovement;

    if (chainMatches) {
        console.log(
            `🟠 NUMERICAL MATCH: ${unexplainedOpening} шт unexplained opening ` +
            `= ${missingEarlySaleMovement} шт missing pre-batch SALE Movement.`,
        );

        console.log("");
        console.log("⚠️ Это только числовое совпадение.");
        console.log(
            "⚠️ Оно НЕ доказывает, что missing Movement и historical opening имеют одну причину.",
        );
    } else {
        console.log(
            "🔴 Числового совпадения между unexplained opening и missing SALE Movement нет.",
        );
    }

    line();
    console.log("");
    console.log("10. HYPOTHETICAL HISTORICAL CHAIN TEST");
    console.log("");
    line();
    console.log("");

    console.log("Проверяется только математическая гипотеза:");
    console.log("");
    console.log("Historical opening stock");
    console.log(`  ${businessOpening} шт`);
    console.log("");
    console.log(
        `├── Missing historical Batch minimum: ${missingBatchConfirmedMinimum} шт`,
    );
    console.log(
        `└── Remaining historical quantity: ${unexplainedOpening} шт`,
    );
    console.log(
        `    └── Missing pre-batch SALE Movement: ${missingEarlySaleMovement} шт`,
    );

    console.log("");

    if (
        businessOpening ===
        missingBatchConfirmedMinimum + missingEarlySaleMovement
    ) {
        console.log(
            "🟢 HYPOTHETICAL QUANTITY CHAIN BALANCES MATHEMATICALLY",
        );

        console.log("");
        console.log(
            `${businessOpening} = ${missingBatchConfirmedMinimum} + ${missingEarlySaleMovement}`,
        );
    } else {
        console.log(
            "🔴 HYPOTHETICAL QUANTITY CHAIN DOES NOT BALANCE.",
        );
    }

    line();
    console.log("");
    console.log("11. UNIFIED HISTORICAL TIMELINE");
    console.log("");
    line();
    console.log("");

    const timeline: TimelineRow[] = [];

    for (const item of earlyOrders) {
        const returnBatchTotal = item.ReturnBatch.reduce(
            (sum, rb) => sum + rb.quantity,
            0,
        );

        const returned = Math.max(item.returned, returnBatchTotal);
        const net = item.quantity - returned;

        timeline.push({
            date: item.order.date,
            type: "ORDER",
            source: `Order #${item.order.id} / OrderItem #${item.id}`,
            quantity: -net,
            details:
                `gross=${item.quantity}, ` +
                `returned=${returned}, ` +
                `net=${net}`,
        });
    }

    for (const item of supplyItems.filter(
        (item) => item.supply.date < boundaryDate,
    )) {
        timeline.push({
            date: item.supply.date,
            type: "SUPPLY",
            source: `Supply #${item.supply.id} / SupplyItem #${item.id}`,
            quantity: item.quantity,
            details: `cost=${item.cost} ₽`,
        });
    }

    for (const movement of movements.filter(
        (movement) => movement.createdAt < boundaryDate,
    )) {
        timeline.push({
            date: movement.createdAt,
            type: "MOVEMENT",
            source: `Movement #${movement.id}`,
            quantity: movement.quantity,
            details:
                `${movement.type}: ${movement.comment ?? "-"}`,
        });
    }

    const missingBatchReferences = Array.from(
        referencedBatchMap.entries(),
    ).filter(([batchId]) => {
        return batchExistenceMap.get(batchId) === false;
    });

    console.log(
        `MISSING BATCH REFERENCES FOUND = ${missingBatchReferences.length}`,
    );

    for (const [batchId, data] of missingBatchReferences) {
        console.log(
            `🔴 Missing Batch #${batchId} | referenced movements=${data.movements.length}`,
        );
    }

    console.log("");

    timeline.sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
    );

    let runningBusinessBalance = 0;

    for (const row of timeline) {
        if (
            row.type === "ORDER" ||
            row.type === "SUPPLY"
        ) {
            runningBusinessBalance += row.quantity;
        }

        console.log(
            `${fmtDate(row.date)} | ` +
            `${row.type.padEnd(8)} | ` +
            `${row.source} | ` +
            `qty=${fmtQty(row.quantity)} | ` +
            `historical balance=${runningBusinessBalance}`,
        );

        console.log(`  ${row.details}`);
    }

    console.log("");
    console.log(
        `PRE-BATCH HISTORICAL BUSINESS DELTA = ${runningBusinessBalance} шт`,
    );

    line();
    console.log("");
    console.log("12. EVIDENCE CLASSIFICATION");
    console.log("");
    line();
    console.log("");

    console.log("🟢 CONFIRMED FACTS");
    console.log("");
    console.log(
        `• Required business opening: ${businessOpening} шт`,
    );
    console.log(
        `• Missing historical Batch references minimum: ${missingBatchConfirmedMinimum} шт`,
    );
    console.log(
        `• Missing pre-batch SALE Movement: ${missingEarlySaleMovement} шт`,
    );
    console.log(
        `• Pre-batch orders: ${earlyNet} шт net sales`,
    );
    console.log(
        `• Pre-batch OrderBatch coverage: ${earlyOrderBatch} шт`,
    );

    console.log("");
    console.log("🟠 NUMERICAL CORRELATIONS");
    console.log("");

    if (chainMatches) {
        console.log(
            `• Unexplained opening (${unexplainedOpening}) = ` +
            `missing SALE Movement (${missingEarlySaleMovement})`,
        );
    } else {
        console.log(
            "• Числового совпадения между unexplained opening и missing SALE Movement нет.",
        );
    }

    console.log("");
    console.log("🔴 NOT YET PROVEN");
    console.log("");
    console.log(
        "• Что все ранние продажи были совершены именно из Batch #4.",
    );
    console.log(
        "• Что Batch #4 имел первоначальное количество 35 шт.",
    );
    console.log(
        "• Что missing SALE Movement и missing Batch являются одной причиной.",
    );
    console.log(
        "• Что historical opening можно автоматически восстановить одной операцией.",
    );

    line();
    console.log("");
    console.log("13. FINAL RESULT");
    console.log("");
    line();
    console.log("");

    const currentBatchTotal = product.batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0,
    );

    console.log(`Product = ${product.name}`);
    console.log(`Product ID = ${product.id}`);
    console.log("");
    console.log(`Current stock = ${currentStock} шт`);
    console.log(`Current Batch total = ${currentBatchTotal} шт`);
    console.log("");
    console.log(
        `Business opening required = ${businessOpening} шт`,
    );
    console.log(
        `Movement opening required = ${movementOpening} шт`,
    );
    console.log(
        `Confirmed missing Batch minimum = ${missingBatchConfirmedMinimum} шт`,
    );
    console.log(
        `Unexplained opening = ${unexplainedOpening} шт`,
    );
    console.log(
        `Missing pre-batch SALE Movement = ${missingEarlySaleMovement} шт`,
    );

    console.log("");

    if (
        businessOpening ===
        missingBatchConfirmedMinimum + missingEarlySaleMovement
    ) {
        console.log(
            "🟠 MATHEMATICAL HISTORICAL CHAIN MATCH FOUND",
        );
        console.log(
            `${businessOpening} = ${missingBatchConfirmedMinimum} + ${missingEarlySaleMovement}`,
        );
        console.log("");
        console.log(
            "⚠️ Но причинная связь ещё не доказана.",
        );
    } else {
        console.log(
            "🔴 HISTORICAL CHAIN DOES NOT FULLY MATCH.",
        );
    }

    console.log("");
    console.log("⚠️ FINAL SAFETY STATUS");
    console.log("");
    console.log("READ ONLY AUDIT COMPLETED.");
    console.log("");
    console.log("Batch НЕ создавались.");
    console.log("Movement НЕ создавались.");
    console.log("OrderBatch НЕ изменялись.");
    console.log("ReturnBatch НЕ изменялись.");
    console.log("Product.stock НЕ изменялся.");
    console.log("");
    console.log("🏁 AUDIT V10 ЗАВЕРШЁН");
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