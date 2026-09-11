import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_ORDER_ID = 26;
const TARGET_ORDER_ITEM_ID = 38;

function line() {
    console.log(
        "\n==============================================================================\n"
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

async function main() {
    console.log(`

==============================================================================

🧪 DRY-RUN RETURNBATCH REPAIR PLAN V22

==============================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

V22 НЕ ВЫПОЛНЯЕТ:

create

update

delete

transaction

repair

ЦЕЛЬ:

ПРОВЕРИТЬ, МОЖНО ЛИ БЕЗОПАСНО ВОССТАНОВИТЬ
ОТСУТСТВУЮЩИЕ ReturnBatch ДЛЯ:

Order #${TARGET_ORDER_ID}

OrderItem #${TARGET_ORDER_ITEM_ID}

V22 ПРОВЕРЯЕТ:

1. Текущее состояние OrderItem #${TARGET_ORDER_ITEM_ID}

2. OrderBatch

3. ReturnBatch

4. Хронологию партий

5. Даты заказа и получения партий

6. Movement возвратов по Order #${TARGET_ORDER_ID}

7. Возможный дубликат Movement

8. Планируемое распределение ReturnBatch

9. Возможность безопасного APPLY

==============================================================================

`);

    title(
        "1. TARGET ORDERITEM"
    );

    const item =
        await prisma.orderItem.findUnique({
            where: {
                id: TARGET_ORDER_ITEM_ID,
            },
            include: {
                order: true,
                product: true,

                batches: {
                    include: {
                        batch: true,
                    },
                    orderBy: {
                        id: "asc",
                    },
                },

                ReturnBatch: {
                    include: {
                        Batch: true,
                    },
                    orderBy: {
                        id: "asc",
                    },
                },
            },
        });

    if (!item) {
        console.log(
            `🔴 OrderItem #${TARGET_ORDER_ITEM_ID} NOT FOUND`
        );

        process.exitCode = 1;
        return;
    }

    const gross =
        item.quantity;

    const returned =
        item.returned;

    const net =
        gross - returned;

    console.log(`

OrderItem #${item.id}

Order #${item.orderId}

Product #${item.productId}

Product="${item.product.name}"

Order date=${formatDate(item.order.date)}

Order status=${item.order.status}

Gross=${gross}

Returned field=${returned}

Net=${net}

`);

    if (
        returned < 0
    ) {
        console.log(
            "🔴 INVALID: returned cannot be negative"
        );

        process.exitCode = 1;
        return;
    }

    if (
        returned > gross
    ) {
        console.log(
            "🔴 INVALID: returned is greater than gross quantity"
        );

        process.exitCode = 1;
        return;
    }

    title(
        "2. CURRENT ORDERBATCH STATE"
    );

    const orderBatchTotal =
        item.batches.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    console.log(`

OrderBatch links=${item.batches.length}

OrderBatch total=${orderBatchTotal}

Sold quantity=${gross}

`);

    for (
        const link of item.batches
    ) {
        const batch =
            link.batch;

        const batchExistsBeforeOrder =
            batch.receivedAt.getTime() <=
            item.order.date.getTime();

        console.log(`

OrderBatch #${link.id}

Batch #${batch.id}

Quantity sold=${link.quantity}

PurchaseCost=${link.purchaseCost}

Batch receivedAt=${formatDate(
    batch.receivedAt
)}

Batch expiryDate=${formatDate(
    batch.expiryDate
)}

Batch current quantity=${batch.quantity}

Batch status=${batch.status}

Batch existed before order=${batchExistsBeforeOrder}

`);

        if (
            batch.productId !==
            item.productId
        ) {
            console.log(
                `🔴 PRODUCT MISMATCH: ` +
                `Batch #${batch.id} does not belong to ` +
                `Product #${item.productId}`
            );

            process.exitCode = 1;
            return;
        }
    }

    if (
        orderBatchTotal !== gross
    ) {
        console.log(
            `🔴 INVALID: OrderBatch total=${orderBatchTotal}, ` +
            `gross=${gross}`
        );

        process.exitCode = 1;
        return;
    }

    console.log(
        "🟢 OrderBatch total matches sold quantity"
    );

    title(
        "3. CURRENT RETURNBATCH STATE"
    );

    const currentReturnBatchTotal =
        item.ReturnBatch.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    console.log(`

ReturnBatch links=${item.ReturnBatch.length}

ReturnBatch total=${currentReturnBatchTotal}

OrderItem.returned=${returned}

Missing ReturnBatch quantity=${returned - currentReturnBatchTotal}

`);

    for (
        const link of item.ReturnBatch
    ) {
        console.log(`

ReturnBatch #${link.id}

Batch #${link.batchId}

Quantity=${link.quantity}

CreatedAt=${formatDate(
    link.createdAt
)}

`);
    }

    if (
        currentReturnBatchTotal >
        returned
    ) {
        console.log(
            "🔴 INVALID: ReturnBatch total exceeds returned field"
        );

        process.exitCode = 1;
        return;
    }

    const missingReturnQuantity =
        returned -
        currentReturnBatchTotal;

    if (
        missingReturnQuantity === 0
    ) {
        console.log(
            "🟢 NO REPAIR NEEDED: ReturnBatch already matches returned field"
        );

        return;
    }

    if (
        missingReturnQuantity < 0
    ) {
        console.log(
            "🔴 INVALID: negative missing return quantity"
        );

        process.exitCode = 1;
        return;
    }

    title(
        "4. ORDERBATCH CHRONOLOGY ANALYSIS"
    );

    const eligibleBatches =
        item.batches.filter(
            (link) =>
                link.batch.receivedAt.getTime() <=
                item.order.date.getTime()
        );

    const futureBatches =
        item.batches.filter(
            (link) =>
                link.batch.receivedAt.getTime() >
                item.order.date.getTime()
        );

    console.log(`

Order date=${formatDate(
    item.order.date
)}

Eligible OrderBatch links=${eligibleBatches.length}

Future / chronologically impossible links=${futureBatches.length}

`);

    for (
        const link of eligibleBatches
    ) {
        console.log(
            `🟢 ELIGIBLE: Batch #${link.batchId} | ` +
            `sold=${link.quantity} | ` +
            `receivedAt=${formatDate(
                link.batch.receivedAt
            )}`
        );
    }

    for (
        const link of futureBatches
    ) {
        console.log(
            `🟠 EXCLUDED FROM REPAIR PLAN: Batch #${link.batchId} | ` +
            `sold=${link.quantity} | ` +
            `receivedAt=${formatDate(
                link.batch.receivedAt
            )} | ` +
            `AFTER order date`
        );
    }

    title(
        "5. MOVEMENT ANALYSIS FOR TARGET ORDER"
    );

    const movements =
        await prisma.movement.findMany({
            where: {
                productId:
                    item.productId,
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

    const orderMovements =
        movements.filter(
            (movement) =>
                extractOrderNumber(
                    movement.comment
                ) === TARGET_ORDER_ID
        );

    let saleMovementTotal = 0;
    let returnMovementTotal = 0;

    for (
        const movement of orderMovements
    ) {
        console.log(`

${formatDate(
    movement.createdAt
)}

Movement #${movement.id}

Type=${movement.type}

Quantity=${signed(
    movement.quantity
)}

Comment="${movement.comment ?? ""}"

`);

        if (
            movement.type === "SALE"
        ) {
            saleMovementTotal +=
                Math.abs(
                    movement.quantity
                );
        }

        if (
            movement.type === "RETURN"
        ) {
            returnMovementTotal +=
                movement.quantity;
        }
    }

    console.log(`

SALE movement quantity=${saleMovementTotal}

RETURN movement quantity=${returnMovementTotal}

OrderItem gross=${gross}

OrderItem returned=${returned}

`);

    if (
        returnMovementTotal > returned
    ) {
        console.log(
            `🟠 WARNING: Movement returns=${returnMovementTotal} ` +
            `exceed OrderItem.returned=${returned}`
        );

        console.log(
            "🟠 Therefore Movement history contains at least one " +
            "duplicate, obsolete, or historically inconsistent return record."
        );
    }

    if (
        saleMovementTotal !== 0 &&
        saleMovementTotal !== gross
    ) {
        console.log(
            `🟠 WARNING: SALE Movement quantity=${saleMovementTotal} ` +
            `does not match OrderItem gross=${gross}`
        );
    }

    title(
        "6. SAFE RETURNBATCH CANDIDATES"
    );

    const remainingSoldByBatch =
        new Map<number, number>();

    for (
        const link of item.batches
    ) {
        remainingSoldByBatch.set(
            link.batchId,
            link.quantity
        );
    }

    for (
        const link of item.ReturnBatch
    ) {
        const previous =
            remainingSoldByBatch.get(
                link.batchId
            ) ?? 0;

        remainingSoldByBatch.set(
            link.batchId,
            previous -
            link.quantity
        );
    }

    const candidates =
        eligibleBatches
            .map(
                (link) => ({
                    link,
                    available:
                        remainingSoldByBatch.get(
                            link.batchId
                        ) ?? 0,
                })
            )
            .filter(
                (candidate) =>
                    candidate.available > 0
            )
            .sort(
                (a, b) => {
                    const expiryDifference =
                        a.link.batch.expiryDate.getTime() -
                        b.link.batch.expiryDate.getTime();

                    if (
                        expiryDifference !== 0
                    ) {
                        return expiryDifference;
                    }

                    const receivedDifference =
                        a.link.batch.receivedAt.getTime() -
                        b.link.batch.receivedAt.getTime();

                    if (
                        receivedDifference !== 0
                    ) {
                        return receivedDifference;
                    }

                    return (
                        a.link.batchId -
                        b.link.batchId
                    );
                }
            );

    let candidateCapacity = 0;

    for (
        const candidate of candidates
    ) {
        candidateCapacity +=
            candidate.available;

        console.log(
            `Candidate Batch #${candidate.link.batchId} | ` +
            `sold=${candidate.link.quantity} | ` +
            `already returned=${
                candidate.link.quantity -
                candidate.available
            } | ` +
            `available for ReturnBatch=${candidate.available} | ` +
            `receivedAt=${formatDate(
                candidate.link.batch.receivedAt
            )}`
        );
    }

    console.log(`

Candidate capacity=${candidateCapacity}

Missing ReturnBatch quantity=${missingReturnQuantity}

`);

    if (
        candidateCapacity <
        missingReturnQuantity
    ) {
        console.log(
            "🔴 NOT SAFE TO REPAIR: eligible historical batches " +
            "do not provide enough capacity"
        );

        process.exitCode = 1;
        return;
    }

    title(
        "7. PROPOSED DRY-RUN REPAIR PLAN"
    );

    let remainingToAllocate =
        missingReturnQuantity;

    const repairPlan:
        Array<{
            batchId: number;
            quantity: number;
        }> = [];

    for (
        const candidate of candidates
    ) {
        if (
            remainingToAllocate <= 0
        ) {
            break;
        }

        const quantity =
            Math.min(
                candidate.available,
                remainingToAllocate
            );

        if (
            quantity <= 0
        ) {
            continue;
        }

        repairPlan.push({
            batchId:
                candidate.link.batchId,
            quantity,
        });

        remainingToAllocate -=
            quantity;
    }

    if (
        remainingToAllocate !== 0
    ) {
        console.log(
            "🔴 REPAIR PLAN FAILED TO ALLOCATE FULL QUANTITY"
        );

        process.exitCode = 1;
        return;
    }

    console.log(`

PROPOSED PLAN:

`);

    for (
        const step of repairPlan
    ) {
        console.log(
            `DRY-RUN ONLY → would create ReturnBatch: ` +
            `OrderItem #${TARGET_ORDER_ITEM_ID} → ` +
            `Batch #${step.batchId} → ` +
            `quantity=${step.quantity}`
        );
    }

    const plannedTotal =
        repairPlan.reduce(
            (sum, step) =>
                sum + step.quantity,
            0
        );

    console.log(`

Planned ReturnBatch quantity=${plannedTotal}

Current ReturnBatch total=${currentReturnBatchTotal}

Expected ReturnBatch total after APPLY=${
    currentReturnBatchTotal +
    plannedTotal
}

Expected OrderItem.returned=${returned}

`);

    if (
        currentReturnBatchTotal +
        plannedTotal !==
        returned
    ) {
        console.log(
            "🔴 PLAN IS INVALID: expected ReturnBatch total would not match returned field"
        );

        process.exitCode = 1;
        return;
    }

    title(
        "8. DATABASE CHANGES THAT V22 WILL NOT MAKE"
    );

    console.log(`

❌ NO ReturnBatch created

❌ NO ReturnBatch deleted

❌ NO ReturnBatch updated

❌ NO OrderItem.updated

❌ NO Order.updated

❌ NO Batch.quantity changed

❌ NO Batch.status changed

❌ NO Product.stock changed

❌ NO Movement created

❌ NO Movement deleted

❌ NO Movement changed

❌ NO Supply changed

❌ NO database repair executed

`);

    title(
        "9. FINAL DRY-RUN SAFETY DECISION"
    );

    console.log(`

Target Order #${TARGET_ORDER_ID}

Target OrderItem #${TARGET_ORDER_ITEM_ID}

Gross=${gross}

Returned=${returned}

Current ReturnBatch total=${currentReturnBatchTotal}

Missing ReturnBatch quantity=${missingReturnQuantity}

Chronologically eligible batch capacity=${candidateCapacity}

Planned ReturnBatch quantity=${plannedTotal}

`);

    console.log(
        "🟢 DRY-RUN PLAN IS INTERNALLY CONSISTENT"
    );

    console.log(
        "🟢 PROPOSED PLAN DOES NOT MODIFY CURRENT STOCK"
    );

    console.log(
        "🟢 PROPOSED PLAN DOES NOT MODIFY Product.stock"
    );

    console.log(
        "🟢 PROPOSED PLAN DOES NOT MODIFY Batch.quantity"
    );

    console.log(
        "🟢 PROPOSED PLAN DOES NOT CREATE OR MODIFY Movement"
    );

    console.log(
        "🟢 PROPOSED PLAN ONLY IDENTIFIES MISSING ReturnBatch LINKS"
    );

    console.log(`

==============================================================================

🏁 DRY-RUN V22 COMPLETED

==============================================================================

NO DATABASE DATA WAS CHANGED.

NO REPAIR WAS EXECUTED.

NEXT STEP, IF APPROVED:

CREATE ONLY THE PLANNED ReturnBatch RECORDS.

==============================================================================

`);
}

main()
    .catch((error) => {
        console.error(
            "\n🔴 DRY-RUN V22 FAILED\n"
        );

        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });