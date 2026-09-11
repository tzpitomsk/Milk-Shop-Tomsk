import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function main() {
    console.log(`

==============================================================================

🔍 DIAGNOSE ORDERITEM #38 — V21

==============================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

ЦЕЛЬ:

ПОНЯТЬ, ПОЧЕМУ У OrderItem #38:

gross = 3
returned = 2
OrderBatch total = 3
ReturnBatch total = 0

ИССЛЕДУЕМ:

1. Order #26
2. OrderItem #38
3. Все OrderBatch
4. Все связанные Batch
5. Все ReturnBatch
6. Movement вокруг Order #26
7. Movement по продукту вокруг даты заказа
8. Историю партии / партий
9. Возможные следы возврата

==============================================================================

`);

    const targetItemId = 38;
    const targetOrderId = 26;

    title(
        "1. TARGET ORDERITEM #38"
    );

    const item =
        await prisma.orderItem.findUnique({
            where: {
                id: targetItemId,
            },
            include: {
                order: {
                    include: {
                        customer: true,
                    },
                },
                product: true,
                batches: {
                    include: {
                        batch: {
                            include: {
                                product: true,
                            },
                        },
                    },
                    orderBy: {
                        id: "asc",
                    },
                },
                ReturnBatch: {
                    include: {
                        Batch: {
                            include: {
                                product: true,
                            },
                        },
                    },
                    orderBy: {
                        id: "asc",
                    },
                },
            },
        });

    if (!item) {
        console.log(
            `🔴 OrderItem #${targetItemId} NOT FOUND`
        );

        return;
    }

    console.log(`
OrderItem #${item.id}

Order #${item.orderId}

Product #${item.productId}

Product="${item.product.name}"

Order date=${formatDate(item.order.date)}

Order status=${item.order.status}

Gross quantity=${item.quantity}

Returned quantity=${item.returned}

Net quantity=${item.quantity - item.returned}

Price=${item.price}

Order total=${item.order.total}

Order profit=${item.order.profit}

Customer=${
    item.order.customer
        ? `#${item.order.customer.id} "${item.order.customer.name}"`
        : "NONE"
}
`);

    title(
        "2. ORDER #26 — ALL ITEMS"
    );

    const order =
        await prisma.order.findUnique({
            where: {
                id: targetOrderId,
            },
            include: {
                customer: true,
                items: {
                    include: {
                        product: true,
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
                    orderBy: {
                        id: "asc",
                    },
                },
            },
        });

    if (!order) {
        console.log(
            `🔴 Order #${targetOrderId} NOT FOUND`
        );
    } else {
        console.log(`
Order #${order.id}

Date=${formatDate(order.date)}

Status=${order.status}

Total=${order.total}

Profit=${order.profit}

Customer=${
    order.customer
        ? `#${order.customer.id} "${order.customer.name}"`
        : "NONE"
}
`);

        for (const orderItem of order.items) {
            const orderBatchTotal =
                orderItem.batches.reduce(
                    (sum, link) =>
                        sum + link.quantity,
                    0
                );

            const returnBatchTotal =
                orderItem.ReturnBatch.reduce(
                    (sum, link) =>
                        sum + link.quantity,
                    0
                );

            console.log(`
--------------------------------------------------

OrderItem #${orderItem.id}

Product="${orderItem.product.name}"

Gross=${orderItem.quantity}

Returned field=${orderItem.returned}

Net=${orderItem.quantity - orderItem.returned}

OrderBatch total=${orderBatchTotal}

ReturnBatch total=${returnBatchTotal}
`);
        }
    }

    title(
        "3. ORDERITEM #38 — ORDERBATCH DETAILS"
    );

    if (item.batches.length === 0) {
        console.log(
            "🟠 NO OrderBatch LINKS FOUND"
        );
    } else {
        for (const link of item.batches) {
            console.log(`
OrderBatch #${link.id}

OrderItem #${link.orderItemId}

Batch #${link.batchId}

Quantity sold=${link.quantity}

Purchase cost=${link.purchaseCost}

Batch current quantity=${link.batch.quantity}

Batch status=${link.batch.status}

Batch receivedAt=${formatDate(
    link.batch.receivedAt
)}

Batch expiryDate=${formatDate(
    link.batch.expiryDate
)}

Batch productId=${link.batch.productId}

Batch product="${link.batch.product.name}"
`);
        }
    }

    title(
        "4. ORDERITEM #38 — RETURNBATCH DETAILS"
    );

    if (item.ReturnBatch.length === 0) {
        console.log(`
🔴 NO ReturnBatch LINKS FOUND

But:

OrderItem.returned=${item.returned}

This is the main inconsistency being investigated.
`);
    } else {
        for (const link of item.ReturnBatch) {
            console.log(`
ReturnBatch #${link.id}

OrderItem #${link.orderItemId}

Batch #${link.batchId}

Returned quantity=${link.quantity}

Return createdAt=${formatDate(
    link.createdAt
)}

Batch current quantity=${link.Batch.quantity}

Batch status=${link.Batch.status}

Batch receivedAt=${formatDate(
    link.Batch.receivedAt
)}

Batch expiryDate=${formatDate(
    link.Batch.expiryDate
)}

Batch product="${link.Batch.product.name}"
`);
        }
    }

    title(
        "5. MOVEMENTS WITH ORDER #26 IN COMMENT"
    );

    const allOrderMovements =
        await prisma.movement.findMany({
            where: {
                comment: {
                    contains: `26`,
                },
            },
            include: {
                product: true,
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

    const exactOrderMovements =
        allOrderMovements.filter(
            (movement) => {
                const comment =
                    movement.comment ?? "";

                return (
                    /заказ(?:а)?\s*№\s*26(?!\d)/i
                        .test(comment)
                );
            }
        );

    if (
        exactOrderMovements.length === 0
    ) {
        console.log(
            "🟠 No exact Movement comments found for Order #26"
        );
    } else {
        for (
            const movement of exactOrderMovements
        ) {
            console.log(`
${formatDate(movement.createdAt)}

Movement #${movement.id}

Product #${movement.productId}

Product="${movement.product.name}"

Type=${movement.type}

Quantity=${signed(movement.quantity)}

Comment="${movement.comment}"
`);
        }
    }

    title(
        "6. ALL MOVEMENTS FOR PRODUCT — MILK"
    );

    const productMovements =
        await prisma.movement.findMany({
            where: {
                productId: item.productId,
            },
            include: {
                product: true,
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

    for (
        const movement of productMovements
    ) {
        console.log(
            `${formatDate(movement.createdAt)} | ` +
            `Movement #${movement.id} | ` +
            `${movement.type} | ` +
            `${signed(movement.quantity)} | ` +
            `Comment="${movement.comment ?? ""}"`
        );
    }

    title(
        "7. MOVEMENTS NEAR ORDER #26 DATE"
    );

    const orderDate =
        item.order.date;

    const twoDaysBefore =
        new Date(
            orderDate.getTime() -
            2 * 24 * 60 * 60 * 1000
        );

    const twoDaysAfter =
        new Date(
            orderDate.getTime() +
            2 * 24 * 60 * 60 * 1000
        );

    console.log(`
Window start=${formatDate(twoDaysBefore)}

Order date=${formatDate(orderDate)}

Window end=${formatDate(twoDaysAfter)}
`);

    const nearbyMovements =
        productMovements.filter(
            (movement) =>
                movement.createdAt >=
                    twoDaysBefore &&
                movement.createdAt <=
                    twoDaysAfter
        );

    if (
        nearbyMovements.length === 0
    ) {
        console.log(
            "🟠 No product movements found in ±2 day window"
        );
    } else {
        for (
            const movement of nearbyMovements
        ) {
            console.log(`
${formatDate(movement.createdAt)}

Movement #${movement.id}

Type=${movement.type}

Quantity=${signed(movement.quantity)}

Comment="${movement.comment ?? ""}"
`);
        }
    }

    title(
        "8. HISTORY OF BATCHES USED BY ORDERITEM #38"
    );

    const usedBatchIds =
        item.batches.map(
            (link) =>
                link.batchId
        );

    if (
        usedBatchIds.length === 0
    ) {
        console.log(
            "🟠 No batches used by OrderItem #38"
        );
    } else {
        for (
            const batchId of usedBatchIds
        ) {
            const batch =
                await prisma.batch.findUnique({
                    where: {
                        id: batchId,
                    },
                    include: {
                        product: true,
                        orderBatches: {
                            include: {
                                orderItem: {
                                    include: {
                                        order: true,
                                    },
                                },
                            },
                            orderBy: {
                                id: "asc",
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
                            orderBy: {
                                id: "asc",
                            },
                        },
                    },
                });

            if (!batch) {
                continue;
            }

            console.log(`
==============================================================================

BATCH #${batch.id}

==============================================================================

Product="${batch.product.name}"

Current quantity=${batch.quantity}

Status=${batch.status}

ReceivedAt=${formatDate(
    batch.receivedAt
)}

ExpiryDate=${formatDate(
    batch.expiryDate
)}

PurchaseCost=${batch.purchaseCost}

TOTAL ORDERBATCH LINKS=${batch.orderBatches.length}

TOTAL RETURNBATCH LINKS=${batch.ReturnBatch.length}
`);

            console.log(
                "\n--- SALES FROM THIS BATCH ---"
            );

            for (
                const link of batch.orderBatches
            ) {
                console.log(`
OrderBatch #${link.id}

Order #${link.orderItem.orderId}

OrderItem #${link.orderItemId}

Order date=${formatDate(
    link.orderItem.order.date
)}

Quantity sold=${link.quantity}
`);
            }

            console.log(
                "\n--- RETURNS TO THIS BATCH ---"
            );

            for (
                const link of batch.ReturnBatch
            ) {
                console.log(`
ReturnBatch #${link.id}

Order #${link.OrderItem.orderId}

OrderItem #${link.orderItemId}

Return createdAt=${formatDate(
    link.createdAt
)}

Quantity returned=${link.quantity}
`);
            }
        }
    }

    title(
        "9. POSSIBLE RETURNS WITHOUT RETURNBATCH"
    );

    const suspiciousItems =
        await prisma.orderItem.findMany({
            where: {
                productId: item.productId,
                returned: {
                    gt: 0,
                },
            },
            include: {
                order: true,
                product: true,
                batches: true,
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

    for (
        const suspicious of suspiciousItems
    ) {
        const returnBatchTotal =
            suspicious.ReturnBatch.reduce(
                (sum, link) =>
                    sum + link.quantity,
                0
            );

        if (
            suspicious.returned !==
            returnBatchTotal
        ) {
            console.log(`
🔴 SUSPICIOUS RETURN

Order #${suspicious.orderId}

OrderItem #${suspicious.id}

Product="${suspicious.product.name}"

Order date=${formatDate(
    suspicious.order.date
)}

Gross=${suspicious.quantity}

Returned field=${suspicious.returned}

ReturnBatch total=${returnBatchTotal}

Difference=${
    suspicious.returned -
    returnBatchTotal
}
`);
        }
    }

    title(
        "10. FINAL DIAGNOSIS SUMMARY"
    );

    const orderBatchTotal =
        item.batches.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    const returnBatchTotal =
        item.ReturnBatch.reduce(
            (sum, link) =>
                sum + link.quantity,
            0
        );

    console.log(`
TARGET:

Order #${item.orderId}

OrderItem #${item.id}

Product="${item.product.name}"

Gross=${item.quantity}

Returned field=${item.returned}

Net=${item.quantity - item.returned}

OrderBatch total=${orderBatchTotal}

ReturnBatch total=${returnBatchTotal}

Return difference=${
    item.returned -
    returnBatchTotal
}
`);

    if (
        item.returned ===
        returnBatchTotal
    ) {
        console.log(
            "🟢 RETURN DATA IS CONSISTENT"
        );
    } else {
        console.log(
            "🔴 RETURN DATA IS INCONSISTENT"
        );

        console.log(`
The returned field says:

${item.returned}

But ReturnBatch records explain only:

${returnBatchTotal}

Missing ReturnBatch quantity:

${
    item.returned -
    returnBatchTotal
}

NO REPAIR HAS BEEN EXECUTED.

NEXT STEP MUST BE BASED ON
THE DIAGNOSTIC EVIDENCE ABOVE.
`);
    }

    line();

    console.log(`
🏁 V21 DIAGNOSTIC COMPLETED

STRICT READ ONLY.

NO DATABASE DATA WAS CHANGED.

==============================================================================

`);
}

main()
    .catch((error) => {
        console.error(
            "\n🔴 DIAGNOSTIC FAILED\n"
        );

        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });