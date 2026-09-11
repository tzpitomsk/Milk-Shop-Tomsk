import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_ORDER_ID = 26;
const TARGET_ORDER_ITEM_ID = 38;
const TARGET_PRODUCT_ID = 1;

const EXPECTED_RETURNED = 2;
const EXPECTED_RETURN_BATCH_TOTAL_BEFORE = 0;
const EXPECTED_ORDER_BATCH_TOTAL = 3;

const REPAIR_PLAN = [
    {
        batchId: 1,
        quantity: 1,
    },
    {
        batchId: 2,
        quantity: 1,
    },
] as const;

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

async function main() {
    console.log(`

==============================================================================

🔧 APPLY RETURNBATCH REPAIR V23

==============================================================================

⚠️ TARGETED REPAIR

⚠️ THIS SCRIPT CHANGES ONLY:

ReturnBatch records for OrderItem #38

TARGET:

Order #${TARGET_ORDER_ID}

OrderItem #${TARGET_ORDER_ITEM_ID}

Product #${TARGET_PRODUCT_ID}

EXPECTED CURRENT STATE:

Gross quantity = 3

OrderItem.returned = 2

Current ReturnBatch total = 0

OrderBatch total = 3

PLANNED REPAIR:

ReturnBatch:

OrderItem #38 → Batch #1 → quantity 1

OrderItem #38 → Batch #2 → quantity 1

THIS SCRIPT WILL NOT CHANGE:

❌ Product.stock

❌ Batch.quantity

❌ Batch.status

❌ OrderItem.returned

❌ Order.status

❌ OrderBatch

❌ Movement

❌ Supply

❌ SupplyItem

❌ Any other Order

==============================================================================

`);

    title(
        "1. PRE-APPLY CURRENT STATE VERIFICATION"
    );

    const targetItem =
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

    if (!targetItem) {
        throw new Error(
            `SAFETY STOP: OrderItem #${TARGET_ORDER_ITEM_ID} not found`
        );
    }

    if (
        targetItem.orderId !==
        TARGET_ORDER_ID
    ) {
        throw new Error(
            `SAFETY STOP: OrderItem #${TARGET_ORDER_ITEM_ID} ` +
            `belongs to Order #${targetItem.orderId}, ` +
            `expected Order #${TARGET_ORDER_ID}`
        );
    }

    if (
        targetItem.productId !==
        TARGET_PRODUCT_ID
    ) {
        throw new Error(
            `SAFETY STOP: OrderItem #${TARGET_ORDER_ITEM_ID} ` +
            `belongs to Product #${targetItem.productId}, ` +
            `expected Product #${TARGET_PRODUCT_ID}`
        );
    }

    const orderBatchTotal =
        targetItem.batches.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    const returnBatchTotal =
        targetItem.ReturnBatch.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    console.log(`

OrderItem #${targetItem.id}

Order #${targetItem.orderId}

Product #${targetItem.productId}

Product="${targetItem.product.name}"

Order date=${formatDate(targetItem.order.date)}

Order status=${targetItem.order.status}

Gross=${targetItem.quantity}

Returned=${targetItem.returned}

Net=${targetItem.quantity - targetItem.returned}

OrderBatch total=${orderBatchTotal}

ReturnBatch total=${returnBatchTotal}

`);

    title(
        "2. SAFETY CHECK — EXPECTED CURRENT STATE"
    );

    if (
        targetItem.quantity !==
        EXPECTED_ORDER_BATCH_TOTAL
    ) {
        throw new Error(
            `SAFETY STOP: gross quantity=${targetItem.quantity}, ` +
            `expected ${EXPECTED_ORDER_BATCH_TOTAL}`
        );
    }

    console.log(
        `🟢 Gross quantity=${targetItem.quantity} matches expected value`
    );

    if (
        targetItem.returned !==
        EXPECTED_RETURNED
    ) {
        throw new Error(
            `SAFETY STOP: OrderItem.returned=${targetItem.returned}, ` +
            `expected ${EXPECTED_RETURNED}`
        );
    }

    console.log(
        `🟢 OrderItem.returned=${targetItem.returned} matches expected value`
    );

    if (
        orderBatchTotal !==
        EXPECTED_ORDER_BATCH_TOTAL
    ) {
        throw new Error(
            `SAFETY STOP: OrderBatch total=${orderBatchTotal}, ` +
            `expected ${EXPECTED_ORDER_BATCH_TOTAL}`
        );
    }

    console.log(
        `🟢 OrderBatch total=${orderBatchTotal} matches expected value`
    );

    if (
        returnBatchTotal !==
        EXPECTED_RETURN_BATCH_TOTAL_BEFORE
    ) {
        throw new Error(
            `SAFETY STOP: ReturnBatch total=${returnBatchTotal}. ` +
            `Expected ${EXPECTED_RETURN_BATCH_TOTAL_BEFORE}. ` +
            `Database state may have changed since V22.`
        );
    }

    console.log(
        `🟢 ReturnBatch total=${returnBatchTotal} matches expected pre-repair value`
    );

    if (
        targetItem.ReturnBatch.length !== 0
    ) {
        throw new Error(
            `SAFETY STOP: ReturnBatch records already exist. ` +
            `Refusing to create possible duplicates.`
        );
    }

    console.log(
        "🟢 No existing ReturnBatch records found"
    );

    title(
        "3. VERIFY EXACT REPAIR PLAN"
    );

    const soldByBatch =
        new Map<number, number>();

    for (const link of targetItem.batches) {
        soldByBatch.set(
            link.batchId,
            (soldByBatch.get(link.batchId) ?? 0) +
            link.quantity
        );
    }

    let plannedTotal = 0;

    for (const planned of REPAIR_PLAN) {
        const soldQuantity =
            soldByBatch.get(
                planned.batchId
            ) ?? 0;

        console.log(`

Planned Batch #${planned.batchId}

Planned return quantity=${planned.quantity}

Sold from this batch=${soldQuantity}

`);

        if (
            soldQuantity === 0
        ) {
            throw new Error(
                `SAFETY STOP: Batch #${planned.batchId} ` +
                `is not linked to OrderItem #${TARGET_ORDER_ITEM_ID}`
            );
        }

        if (
            planned.quantity >
            soldQuantity
        ) {
            throw new Error(
                `SAFETY STOP: Planned return=${planned.quantity} ` +
                `for Batch #${planned.batchId} exceeds sold=${soldQuantity}`
            );
        }

        plannedTotal +=
            planned.quantity;
    }

    if (
        plannedTotal !==
        targetItem.returned
    ) {
        throw new Error(
            `SAFETY STOP: Planned total=${plannedTotal} ` +
            `does not match OrderItem.returned=${targetItem.returned}`
        );
    }

    console.log(
        `🟢 Planned total=${plannedTotal} matches OrderItem.returned=${targetItem.returned}`
    );

    title(
        "4. VERIFY BATCH CHRONOLOGY"
    );

    for (const planned of REPAIR_PLAN) {
        const orderBatch =
            targetItem.batches.find(
                (link) =>
                    link.batchId ===
                    planned.batchId
            );

        if (!orderBatch) {
            throw new Error(
                `SAFETY STOP: OrderBatch not found for Batch #${planned.batchId}`
            );
        }

        console.log(`

Batch #${planned.batchId}

ReceivedAt=${formatDate(
    orderBatch.batch.receivedAt
)}

ExpiryDate=${formatDate(
    orderBatch.batch.expiryDate
)}

Order date=${formatDate(
    targetItem.order.date
)}

`);

        if (
            orderBatch.batch.receivedAt >
            targetItem.order.date
        ) {
            throw new Error(
                `SAFETY STOP: Batch #${planned.batchId} ` +
                `was received after the order date.`
            );
        }

        if (
            orderBatch.batch.productId !==
            targetItem.productId
        ) {
            throw new Error(
                `SAFETY STOP: Batch #${planned.batchId} ` +
                `belongs to Product #${orderBatch.batch.productId}, ` +
                `but OrderItem belongs to Product #${targetItem.productId}`
            );
        }

        console.log(
            `🟢 Batch #${planned.batchId} passed chronology and product checks`
        );
    }

    title(
        "5. FINAL PRE-APPLY DECISION"
    );

    console.log(`

Target Order #${TARGET_ORDER_ID}

Target OrderItem #${TARGET_ORDER_ITEM_ID}

Current OrderItem.returned=${targetItem.returned}

Current ReturnBatch total=${returnBatchTotal}

Planned ReturnBatch total=${plannedTotal}

`);

    console.log(
        "🟢 ALL SAFETY CHECKS PASSED"
    );

    console.log(
        "\n🔧 APPLYING EXACTLY 2 ReturnBatch RECORDS...\n"
    );

    title(
        "6. APPLY REPAIR TRANSACTION"
    );

    await prisma.$transaction(
        async (tx) => {
            const currentItem =
                await tx.orderItem.findUnique({
                    where: {
                        id: TARGET_ORDER_ITEM_ID,
                    },
                    include: {
                        batches: true,
                        ReturnBatch: true,
                    },
                });

            if (!currentItem) {
                throw new Error(
                    "TRANSACTION SAFETY STOP: Target OrderItem disappeared"
                );
            }

            if (
                currentItem.returned !==
                EXPECTED_RETURNED
            ) {
                throw new Error(
                    `TRANSACTION SAFETY STOP: returned changed to ` +
                    `${currentItem.returned}`
                );
            }

            const currentReturnTotal =
                currentItem.ReturnBatch.reduce(
                    (sum, link) =>
                        sum + link.quantity,
                    0
                );

            if (
                currentReturnTotal !== 0 ||
                currentItem.ReturnBatch.length !== 0
            ) {
                throw new Error(
                    "TRANSACTION SAFETY STOP: ReturnBatch records appeared before APPLY"
                );
            }

            for (
                const planned of REPAIR_PLAN
            ) {
                const matchingOrderBatch =
                    currentItem.batches.find(
                        (link) =>
                            link.batchId ===
                            planned.batchId
                    );

                if (!matchingOrderBatch) {
                    throw new Error(
                        `TRANSACTION SAFETY STOP: Batch #${planned.batchId} ` +
                        `is no longer linked to OrderItem`
                    );
                }

                if (
                    planned.quantity >
                    matchingOrderBatch.quantity
                ) {
                    throw new Error(
                        `TRANSACTION SAFETY STOP: planned quantity exceeds ` +
                        `OrderBatch quantity for Batch #${planned.batchId}`
                    );
                }

                await tx.returnBatch.create({
                    data: {
                        orderItemId:
                            TARGET_ORDER_ITEM_ID,

                        batchId:
                            planned.batchId,

                        quantity:
                            planned.quantity,
                    },
                });

                console.log(
                    `🟢 CREATED ReturnBatch: ` +
                    `OrderItem #${TARGET_ORDER_ITEM_ID} → ` +
                    `Batch #${planned.batchId} → ` +
                    `quantity=${planned.quantity}`
                );
            }
        }
    );

    title(
        "7. POST-APPLY VERIFICATION"
    );

    const verifiedItem =
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

    if (!verifiedItem) {
        throw new Error(
            "POST-APPLY FAILURE: Target OrderItem not found"
        );
    }

    const verifiedOrderBatchTotal =
        verifiedItem.batches.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    const verifiedReturnBatchTotal =
        verifiedItem.ReturnBatch.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    console.log(`

OrderItem #${verifiedItem.id}

Gross=${verifiedItem.quantity}

Returned=${verifiedItem.returned}

Net=${verifiedItem.quantity - verifiedItem.returned}

OrderBatch total=${verifiedOrderBatchTotal}

ReturnBatch total=${verifiedReturnBatchTotal}

ReturnBatch records=${verifiedItem.ReturnBatch.length}

`);

    console.log(
        "CREATED / VERIFIED RETURNBATCH LINKS:"
    );

    for (
        const link of
        verifiedItem.ReturnBatch
    ) {
        console.log(
            `ReturnBatch #${link.id} | ` +
            `Batch #${link.batchId} | ` +
            `quantity=${link.quantity} | ` +
            `createdAt=${formatDate(link.createdAt)}`
        );
    }

    title(
        "8. FINAL INTEGRITY CHECK"
    );

    if (
        verifiedItem.returned !==
        EXPECTED_RETURNED
    ) {
        throw new Error(
            `POST-APPLY FAILURE: returned changed unexpectedly to ` +
            `${verifiedItem.returned}`
        );
    }

    if (
        verifiedReturnBatchTotal !==
        verifiedItem.returned
    ) {
        throw new Error(
            `POST-APPLY FAILURE: ReturnBatch total=` +
            `${verifiedReturnBatchTotal} does not match returned=` +
            `${verifiedItem.returned}`
        );
    }

    if (
        verifiedOrderBatchTotal !==
        verifiedItem.quantity
    ) {
        throw new Error(
            `POST-APPLY FAILURE: OrderBatch total=` +
            `${verifiedOrderBatchTotal} does not match gross=` +
            `${verifiedItem.quantity}`
        );
    }

    const verifiedReturnedByBatch =
        new Map<number, number>();

    for (
        const link of
        verifiedItem.ReturnBatch
    ) {
        verifiedReturnedByBatch.set(
            link.batchId,
            (
                verifiedReturnedByBatch.get(
                    link.batchId
                ) ?? 0
            ) + link.quantity
        );
    }

    const verifiedSoldByBatch =
        new Map<number, number>();

    for (
        const link of
        verifiedItem.batches
    ) {
        verifiedSoldByBatch.set(
            link.batchId,
            (
                verifiedSoldByBatch.get(
                    link.batchId
                ) ?? 0
            ) + link.quantity
        );
    }

    for (
        const [
            batchId,
            returnedQuantity,
        ]
        of verifiedReturnedByBatch
    ) {
        const soldQuantity =
            verifiedSoldByBatch.get(
                batchId
            ) ?? 0;

        console.log(
            `Batch #${batchId} | ` +
            `sold=${soldQuantity} | ` +
            `returned=${returnedQuantity}`
        );

        if (
            returnedQuantity >
            soldQuantity
        ) {
            throw new Error(
                `POST-APPLY FAILURE: Batch #${batchId} ` +
                `returned=${returnedQuantity} exceeds sold=${soldQuantity}`
            );
        }
    }

    console.log(`

🟢 OrderItem.returned=${verifiedItem.returned}

🟢 ReturnBatch total=${verifiedReturnBatchTotal}

🟢 OrderBatch total=${verifiedOrderBatchTotal}

🟢 ReturnBatch total matches returned field

🟢 OrderBatch total matches gross quantity

🟢 No ReturnBatch exceeds sold quantity per batch

`);

    title(
        "9. FINAL RESULT"
    );

    console.log(`

==============================================================================

🏁 APPLY RETURNBATCH REPAIR V23 COMPLETED SUCCESSFULLY

==============================================================================

REPAIRED:

Order #${TARGET_ORDER_ID}

OrderItem #${TARGET_ORDER_ITEM_ID}

Product="${verifiedItem.product.name}"

CREATED:

ReturnBatch → Batch #1 → quantity 1

ReturnBatch → Batch #2 → quantity 1

FINAL STATE:

Gross=${verifiedItem.quantity}

Returned=${verifiedItem.returned}

Net=${verifiedItem.quantity - verifiedItem.returned}

OrderBatch total=${verifiedOrderBatchTotal}

ReturnBatch total=${verifiedReturnBatchTotal}

NOT CHANGED:

Product.stock

Batch.quantity

Batch.status

OrderItem.returned

Order.status

OrderBatch

Movement

Supply

==============================================================================

`);
}

main()
    .catch((error) => {
        console.error(
            "\n🔴 V23 APPLY FAILED\n"
        );

        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });