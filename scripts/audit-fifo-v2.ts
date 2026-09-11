import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IssueLevel = "INFO" | "WARNING" | "CRITICAL";

type Issue = {
    level: IssueLevel;
    productId: number;
    productName: string;
    message: string;
};

const issues: Issue[] = [];

function addIssue(
    level: IssueLevel,
    productId: number,
    productName: string,
    message: string
) {
    issues.push({
        level,
        productId,
        productName,
        message,
    });
}

function printIssue(issue: Issue) {
    const icon =
        issue.level === "CRITICAL"
            ? "🔴"
            : issue.level === "WARNING"
                ? "🟡"
                : "🔵";

    console.log(
        `${icon} ${issue.productName} (#${issue.productId}): ${issue.message}`
    );
}

async function main() {
    console.log("========================================");
    console.log("🔎 FIFO AUDIT V2");
    console.log("========================================");
    console.log("⚠️ ТОЛЬКО АУДИТ");
    console.log("⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ");
    console.log("");

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
                include: {
                    orderBatches: {
                        include: {
                            orderItem: {
                                include: {
                                    order: true,
                                },
                            },
                        },
                    },
                    ReturnBatch: {
                        include: {
                            OrderItem: {
                                include: {
                                    order: true,
                                },
                            },
                        },
                    },
                },
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

    let totalSupply = 0;
    let totalOrderQuantity = 0;
    let totalReturnedField = 0;
    let totalReturnBatch = 0;
    let totalBatchStock = 0;
    let totalProductStock = 0;

    for (const product of products) {
        console.log("");
        console.log("========================================");
        console.log(`🥛 ТОВАР #${product.id}: ${product.name}`);
        console.log("========================================");

        const supplied = product.supplyItems.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        const sold = product.orderItems.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        const returnedField = product.orderItems.reduce(
            (sum, item) => sum + item.returned,
            0
        );

        const returnBatchQuantity = product.orderItems.reduce(
            (sum, item) =>
                sum +
                item.ReturnBatch.reduce(
                    (innerSum, rb) => innerSum + rb.quantity,
                    0
                ),
            0
        );

        const batchStock = product.batches.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        const expectedStock =
            supplied - sold + returnedField;

        console.log("");
        console.log("📊 ОБЩИЙ БАЛАНС");

        console.log(`  Поставлено:             ${supplied}`);
        console.log(`  OrderItem.quantity:     ${sold}`);
        console.log(`  OrderItem.returned:     ${returnedField}`);
        console.log(`  ReturnBatch.quantity:   ${returnBatchQuantity}`);
        console.log(`  Ожидаемый остаток:      ${expectedStock}`);
        console.log(`  Batch.quantity:         ${batchStock}`);
        console.log(`  Product.stock:          ${product.stock}`);

        /*
         * ========================================
         * 1. PRODUCT.STOCK VS BATCH
         * ========================================
         */

        if (product.stock !== batchStock) {
            addIssue(
                "CRITICAL",
                product.id,
                product.name,
                `Product.stock=${product.stock}, но сумма Batch=${batchStock}`
            );
        } else {
            console.log("  ✅ Product.stock = сумма Batch");
        }

        /*
         * ========================================
         * 2. SUPPLY → BATCH
         * ========================================
         */

        console.log("");
        console.log("🔗 SUPPLY → BATCH");

        const unusedBatchIds = new Set(
            product.batches.map((batch) => batch.id)
        );

        for (const supplyItem of product.supplyItems) {
            const candidates = product.batches
                .filter((batch) => unusedBatchIds.has(batch.id))
                .map((batch) => ({
                    batch,
                    distance: Math.abs(
                        batch.receivedAt.getTime() -
                        supplyItem.supply.date.getTime()
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
                    `  🔴 SupplyItem #${supplyItem.id}: ` +
                    `${supplyItem.quantity} шт × ${supplyItem.cost} ₽ → НЕТ BATCH`
                );

                addIssue(
                    "CRITICAL",
                    product.id,
                    product.name,
                    `SupplyItem #${supplyItem.id} (${supplyItem.quantity} шт) не имеет подходящей Batch`
                );

                continue;
            }

            const hours =
                candidate.distance /
                (1000 * 60 * 60);

            console.log(
                `  SupplyItem #${supplyItem.id}: ` +
                `${supplyItem.quantity} шт × ${supplyItem.cost} ₽ ` +
                `→ Batch #${candidate.batch.id} ` +
                `(${candidate.batch.quantity} шт, ` +
                `${candidate.batch.purchaseCost} ₽, ` +
                `${hours.toFixed(2)} ч)`
            );

            if (hours > 24) {
                addIssue(
                    "WARNING",
                    product.id,
                    product.name,
                    `SupplyItem #${supplyItem.id} → Batch #${candidate.batch.id}: разница ${hours.toFixed(2)} ч`
                );
            }

            if (
                candidate.batch.purchaseCost !== 0 &&
                candidate.batch.purchaseCost !== supplyItem.cost
            ) {
                addIssue(
                    "WARNING",
                    product.id,
                    product.name,
                    `Batch #${candidate.batch.id}: purchaseCost=${candidate.batch.purchaseCost}, SupplyItem.cost=${supplyItem.cost}`
                );
            }

            if (candidate.batch.purchaseCost === 0) {
                addIssue(
                    "WARNING",
                    product.id,
                    product.name,
                    `Batch #${candidate.batch.id} имеет purchaseCost=0`
                );
            }

            unusedBatchIds.delete(candidate.batch.id);
        }

        /*
         * ========================================
         * 3. BATCH БЕЗ SUPPLY
         * ========================================
         */

        if (unusedBatchIds.size > 0) {
            console.log("");
            console.log("⚠️ BATCH БЕЗ SUPPLY");

            for (const batch of product.batches) {
                if (!unusedBatchIds.has(batch.id)) {
                    continue;
                }

                console.log(
                    `  Batch #${batch.id}: ` +
                    `${batch.quantity} шт × ${batch.purchaseCost} ₽`
                );

                addIssue(
                    "WARNING",
                    product.id,
                    product.name,
                    `Batch #${batch.id} не удалось сопоставить с SupplyItem`
                );
            }
        }

        /*
         * ========================================
         * 4. ORDERITEM → ORDERBATCH
         * ========================================
         */

        console.log("");
        console.log("🛒 ORDERITEM → ORDERBATCH");

        for (const item of product.orderItems) {
            const orderBatchQuantity = item.batches.reduce(
                (sum, ob) => sum + ob.quantity,
                0
            );

            const expectedOrderBatchQuantity = item.quantity;

            if (item.batches.length === 0) {
                console.log(
                    `  🔴 Order #${item.orderId}, OrderItem #${item.id}: ` +
                    `${item.quantity} шт → ORDERBATCH НЕТ`
                );

                addIssue(
                    "CRITICAL",
                    product.id,
                    product.name,
                    `Order #${item.orderId}, OrderItem #${item.id}: отсутствует OrderBatch`
                );

                continue;
            }

            console.log(
                `  Order #${item.orderId}, OrderItem #${item.id}: ` +
                `продано=${item.quantity}, ` +
                `OrderBatch=${orderBatchQuantity}, ` +
                `возвращено=${item.returned}`
            );

            if (orderBatchQuantity !== expectedOrderBatchQuantity) {
                addIssue(
                    "CRITICAL",
                    product.id,
                    product.name,
                    `Order #${item.orderId}, OrderItem #${item.id}: quantity=${item.quantity}, но OrderBatch=${orderBatchQuantity}`
                );
            }

            /*
             * Проверяем каждую OrderBatch
             */

            for (const orderBatch of item.batches) {
                if (orderBatch.batch.productId !== product.id) {
                    addIssue(
                        "CRITICAL",
                        product.id,
                        product.name,
                        `OrderBatch #${orderBatch.id} ссылается на Batch другого товара`
                    );
                }

                if (orderBatch.quantity <= 0) {
                    addIssue(
                        "CRITICAL",
                        product.id,
                        product.name,
                        `OrderBatch #${orderBatch.id} имеет quantity=${orderBatch.quantity}`
                    );
                }
            }
        }

        /*
         * ========================================
         * 5. RETURNED VS RETURNBATCH
         * ========================================
         */

        console.log("");
        console.log("↩️ RETURNED → RETURNBATCH");

        for (const item of product.orderItems) {
            const returnBatchQuantity = item.ReturnBatch.reduce(
                (sum, rb) => sum + rb.quantity,
                0
            );

            if (item.returned !== returnBatchQuantity) {
                console.log(
                    `  🔴 Order #${item.orderId}, OrderItem #${item.id}: ` +
                    `returned=${item.returned}, ` +
                    `ReturnBatch=${returnBatchQuantity}`
                );

                addIssue(
                    "CRITICAL",
                    product.id,
                    product.name,
                    `Order #${item.orderId}, OrderItem #${item.id}: returned=${item.returned}, но ReturnBatch=${returnBatchQuantity}`
                );
            } else if (item.returned > 0) {
                console.log(
                    `  ✅ Order #${item.orderId}, OrderItem #${item.id}: ` +
                    `returned=${item.returned} = ReturnBatch=${returnBatchQuantity}`
                );
            }

            if (item.returned > item.quantity) {
                addIssue(
                    "CRITICAL",
                    product.id,
                    product.name,
                    `Order #${item.orderId}: returned=${item.returned} > quantity=${item.quantity}`
                );
            }

            /*
             * Проверяем ReturnBatch
             */

            for (const returnBatch of item.ReturnBatch) {
                const correspondingOrderBatch = item.batches.find(
                    (ob) => ob.batchId === returnBatch.batchId
                );

                if (!correspondingOrderBatch) {
                    console.log(
                        `  🔴 ReturnBatch #${returnBatch.id}: ` +
                        `Batch #${returnBatch.batchId} ` +
                        `не участвовал в продаже`
                    );

                    addIssue(
                        "CRITICAL",
                        product.id,
                        product.name,
                        `ReturnBatch #${returnBatch.id} возвращает Batch #${returnBatch.batchId}, которого нет среди OrderBatch`
                    );
                } else if (
                    returnBatch.quantity >
                    correspondingOrderBatch.quantity
                ) {
                    addIssue(
                        "CRITICAL",
                        product.id,
                        product.name,
                        `ReturnBatch #${returnBatch.id}: возвращено ${returnBatch.quantity}, но продано из Batch #${returnBatch.batchId} только ${correspondingOrderBatch.quantity}`
                    );
                }
            }
        }

        /*
         * ========================================
         * 6. BATCH → ORDERBATCH
         * ========================================
         */

        console.log("");
        console.log("📦 BATCH → ПРОДАЖИ");

        for (const batch of product.batches) {
            const soldFromBatch = batch.orderBatches.reduce(
                (sum, ob) => sum + ob.quantity,
                0
            );

            const returnedToBatch = batch.ReturnBatch.reduce(
                (sum, rb) => sum + rb.quantity,
                0
            );

            const theoretical =
                batch.quantity +
                soldFromBatch -
                returnedToBatch;

            console.log(
                `  Batch #${batch.id}: ` +
                `остаток=${batch.quantity}, ` +
                `продано=${soldFromBatch}, ` +
                `возвращено=${returnedToBatch}, ` +
                `теория=${theoretical}`
            );

            if (theoretical < 0) {
                addIssue(
                    "CRITICAL",
                    product.id,
                    product.name,
                    `Batch #${batch.id}: невозможно отрицательное движение (${theoretical})`
                );
            }
        }

        /*
         * ========================================
         * 7. FIFO ПОРЯДОК
         * ========================================
         */

        console.log("");
        console.log("🔄 FIFO-ПРОВЕРКА");

        const sortedBatches = [...product.batches].sort(
            (a, b) => {
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
            }
        );

        console.log(
            "  Порядок партий:"
        );

        for (const batch of sortedBatches) {
            console.log(
                `    Batch #${batch.id}: ` +
                `expiry=${batch.expiryDate.toISOString()}, ` +
                `received=${batch.receivedAt.toISOString()}, ` +
                `stock=${batch.quantity}`
            );
        }

        /*
         * ========================================
         * 8. BALANCE
         * ========================================
         */

        const balanceDifference =
            batchStock - expectedStock;

        if (balanceDifference !== 0) {
            addIssue(
                "CRITICAL",
                product.id,
                product.name,
                `Общий баланс: Batch=${batchStock}, ожидалось=${expectedStock}, разница=${balanceDifference}`
            );
        }

        /*
         * TOTALS
         */

        totalSupply += supplied;
        totalOrderQuantity += sold;
        totalReturnedField += returnedField;
        totalReturnBatch += returnBatchQuantity;
        totalBatchStock += batchStock;
        totalProductStock += product.stock;
    }

    /*
     * ========================================
     * GLOBAL CHECKS
     * ========================================
     */

    console.log("");
    console.log("========================================");
    console.log("📈 ОБЩИЙ ИТОГ");
    console.log("========================================");

    console.log(`📦 Supply:              ${totalSupply}`);
    console.log(`🛒 OrderItem.quantity:  ${totalOrderQuantity}`);
    console.log(`↩️ OrderItem.returned:  ${totalReturnedField}`);
    console.log(`↩️ ReturnBatch:         ${totalReturnBatch}`);
    console.log(`📦 Batch.stock:         ${totalBatchStock}`);
    console.log(`📊 Product.stock:       ${totalProductStock}`);

    const globalExpected =
        totalSupply -
        totalOrderQuantity +
        totalReturnedField;

    console.log(`📊 Ожидаемый остаток:   ${globalExpected}`);

    console.log(
        `❗ Расхождение Batch:   ${totalBatchStock - globalExpected}`
    );

    /*
     * ========================================
     * ISSUES
     * ========================================
     */

    console.log("");
    console.log("========================================");
    console.log("🚨 НАЙДЕННЫЕ ПРОБЛЕМЫ");
    console.log("========================================");

    if (issues.length === 0) {
        console.log("🎉 Проблем не найдено!");
    } else {
        const critical = issues.filter(
            (issue) => issue.level === "CRITICAL"
        );

        const warnings = issues.filter(
            (issue) => issue.level === "WARNING"
        );

        console.log("");
        console.log(`🔴 CRITICAL: ${critical.length}`);
        console.log(`🟡 WARNING:  ${warnings.length}`);

        console.log("");

        for (const issue of critical) {
            printIssue(issue);
        }

        if (warnings.length > 0) {
            console.log("");
            console.log("🟡 ПРЕДУПРЕЖДЕНИЯ:");

            for (const issue of warnings) {
                printIssue(issue);
            }
        }
    }

    /*
     * ========================================
     * REPAIR SUMMARY
     * ========================================
     */

    console.log("");
    console.log("========================================");
    console.log("🛠️ ПОДГОТОВКА К ВОССТАНОВЛЕНИЮ");
    console.log("========================================");

    const missingOrderBatches = issues.filter(
        (issue) =>
            issue.level === "CRITICAL" &&
            issue.message.includes("отсутствует OrderBatch")
    );

    const missingSupplies = issues.filter(
        (issue) =>
            issue.level === "CRITICAL" &&
            issue.message.includes("не имеет подходящей Batch")
    );

    const balanceProblems = issues.filter(
        (issue) =>
            issue.level === "CRITICAL" &&
            issue.message.includes("Общий баланс")
    );

    console.log(
        `🔴 Заказы без OrderBatch:        ${missingOrderBatches.length}`
    );

    console.log(
        `🔴 Supply без Batch:             ${missingSupplies.length}`
    );

    console.log(
        `🔴 Проблемы общего баланса:      ${balanceProblems.length}`
    );

    console.log("");
    console.log("⚠️ НИЧЕГО НЕ ИСПРАВЛЯЛОСЬ.");
    console.log("⚠️ Это диагностический отчёт.");
    console.log("⚠️ Следующим шагом можно будет подготовить repair FIFO.");
}

main()
    .catch((error) => {
        console.error("");
        console.error("❌ ОШИБКА AUDIT V2:");
        console.error(error);

        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });