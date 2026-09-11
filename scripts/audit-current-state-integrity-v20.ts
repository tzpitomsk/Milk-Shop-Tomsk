import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

🔍 CURRENT STATE INTEGRITY AUDIT V20

==============================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

V20 НЕ ВЫПОЛНЯЕТ:

create

update

delete

transaction

repair

ЦЕЛЬ V20:

ПРОВЕРИТЬ ТЕКУЩЕЕ СОСТОЯНИЕ БАЗЫ ДАННЫХ.

V20 НЕ ПЫТАЕТСЯ АВТОМАТИЧЕСКИ ИСПРАВИТЬ
СТАРУЮ ИСТОРИЮ.

ОСНОВНЫЕ ПРОВЕРКИ:

1. Product.stock ↔ Batch.quantity

2. Отрицательные остатки

3. Batch status consistency

4. OrderItem ↔ OrderBatch

5. OrderItem.returned ↔ ReturnBatch

6. Возврат больше продажи

7. Order status consistency

8. OrderBatch batch integrity

9. ReturnBatch batch integrity

10. Movement consistency

11. FIFO chronology where provable

12. Final current database status

==============================================================================

`);


const now = new Date();

let criticalIssues = 0;
let warnings = 0;
let passedChecks = 0;

const critical = (message: string) => {
    criticalIssues++;
    console.log(`🔴 CRITICAL: ${message}`);
};

const warning = (message: string) => {
    warnings++;
    console.log(`🟠 WARNING: ${message}`);
};

const pass = (message: string) => {
    passedChecks++;
    console.log(`🟢 ${message}`);
};

title(
    "1. PRODUCT ↔ BATCH STOCK INTEGRITY"
);

const products =
    await prisma.product.findMany({
        include: {
            batches: {
                orderBy: [
                    {
                        expiryDate: "asc",
                    },
                    {
                        receivedAt: "asc",
                    },
                    {
                        id: "asc",
                    },
                ],
            },
        },
        orderBy: {
            id: "asc",
        },
    });

let totalProductStock = 0;
let totalBatchStock = 0;

for (const product of products) {
    const batchTotal =
        product.batches.reduce(
            (sum, batch) =>
                sum + batch.quantity,
            0
        );

    totalProductStock +=
        product.stock;

    totalBatchStock +=
        batchTotal;

    console.log(`


Product #${product.id}

name=${product.name}

unit=${product.unit}

Product.stock=${product.stock}

Batch total=${batchTotal}

difference=${product.stock - batchTotal}

batch count=${product.batches.length}

`);


    if (
        product.stock !== batchTotal
    ) {
        critical(
            `Product #${product.id} "${product.name}" ` +
            `stock mismatch: Product.stock=${product.stock}, ` +
            `Batch total=${batchTotal}`
        );
    } else {
        pass(
            `Product #${product.id} "${product.name}" ` +
            `stock matches batches`
        );
    }

    if (
        product.stock < 0
    ) {
        critical(
            `Product #${product.id} "${product.name}" ` +
            `has negative Product.stock=${product.stock}`
        );
    }

    for (const batch of product.batches) {
        if (
            batch.quantity < 0
        ) {
            critical(
                `Batch #${batch.id} of "${product.name}" ` +
                `has negative quantity=${batch.quantity}`
            );
        }
    }
}

console.log(`


TOTAL PRODUCT STOCK=${totalProductStock}

TOTAL BATCH STOCK=${totalBatchStock}

GLOBAL DIFFERENCE=${totalProductStock - totalBatchStock}

`);


if (
    totalProductStock === totalBatchStock
) {
    pass(
        "Global Product.stock total matches global Batch total"
    );
} else {
    critical(
        "Global Product.stock total does not match global Batch total"
    );
}

title(
    "2. BATCH STATUS INTEGRITY"
);

const allBatches =
    await prisma.batch.findMany({
        include: {
            product: true,
        },
        orderBy: {
            id: "asc",
        },
    });

let activeBatches = 0;
let emptyBatches = 0;
let expiredActiveBatches = 0;
let zeroQuantityActiveBatches = 0;

for (const batch of allBatches) {
    const isExpired =
        batch.expiryDate.getTime() <
        now.getTime();

    console.log(
        `Batch #${batch.id} | ` +
        `Product="${batch.product.name}" | ` +
        `quantity=${batch.quantity} | ` +
        `status=${batch.status} | ` +
        `expiry=${formatDate(batch.expiryDate)}`
    );

    if (
        batch.status === "ACTIVE"
    ) {
        activeBatches++;

        if (
            batch.quantity === 0
        ) {
            zeroQuantityActiveBatches++;

            warning(
                `Batch #${batch.id} is ACTIVE but quantity=0`
            );
        }

        if (
            isExpired &&
            batch.quantity > 0
        ) {
            expiredActiveBatches++;

            warning(
                `Batch #${batch.id} is ACTIVE, expired, and still has quantity=${batch.quantity}`
            );
        }
    }

    if (
        batch.status === "EMPTY"
    ) {
        emptyBatches++;

        if (
            batch.quantity !== 0
        ) {
            warning(
                `Batch #${batch.id} has status EMPTY but quantity=${batch.quantity}`
            );
        }
    }

    if (
        batch.quantity > 0 &&
        batch.status === "EMPTY"
    ) {
        critical(
            `Batch #${batch.id} has positive quantity but EMPTY status`
        );
    }
}

console.log(`


ACTIVE BATCHES=${activeBatches}

EMPTY BATCHES=${emptyBatches}

ACTIVE WITH ZERO QUANTITY=${zeroQuantityActiveBatches}

EXPIRED ACTIVE WITH STOCK=${expiredActiveBatches}

`);


if (
    zeroQuantityActiveBatches === 0
) {
    pass(
        "No ACTIVE batches with zero quantity"
    );
}

if (
    expiredActiveBatches === 0
) {
    pass(
        "No expired ACTIVE batches with remaining stock"
    );
}

title(
    "3. ORDERITEM ↔ ORDERBATCH INTEGRITY"
);

const orderItems =
    await prisma.orderItem.findMany({
        include: {
            order: true,
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

let totalGross = 0;
let totalReturned = 0;
let totalOrderBatch = 0;
let itemsWithoutOrderBatch = 0;
let orderBatchMismatchCount = 0;

for (const item of orderItems) {
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

    const net =
        item.quantity -
        item.returned;

    totalGross +=
        item.quantity;

    totalReturned +=
        item.returned;

    totalOrderBatch +=
        orderBatchTotal;

    console.log(`


Order #${item.orderId}

OrderItem #${item.id}

Product="${item.product.name}"

date=${formatDate(item.order.date)}

status=${item.order.status}

gross=${item.quantity}

returned=${item.returned}

net=${net}

OrderBatch total=${orderBatchTotal}

ReturnBatch total=${returnBatchTotal}

`);


    if (
        item.quantity < 0
    ) {
        critical(
            `OrderItem #${item.id} has negative quantity=${item.quantity}`
        );
    }

    if (
        item.returned < 0
    ) {
        critical(
            `OrderItem #${item.id} has negative returned=${item.returned}`
        );
    }

    if (
        item.returned > item.quantity
    ) {
        critical(
            `OrderItem #${item.id} returned=${item.returned} ` +
            `is greater than sold quantity=${item.quantity}`
        );
    }

    if (
        item.batches.length === 0
    ) {
        itemsWithoutOrderBatch++;

        warning(
            `OrderItem #${item.id} has no OrderBatch links`
        );
    } else if (
        orderBatchTotal !==
        item.quantity
    ) {
        orderBatchMismatchCount++;

        warning(
            `OrderItem #${item.id} OrderBatch total=${orderBatchTotal}, ` +
            `sold quantity=${item.quantity}`
        );
    }

    if (
        returnBatchTotal !==
        item.returned
    ) {
        critical(
            `OrderItem #${item.id} ReturnBatch total=${returnBatchTotal}, ` +
            `returned field=${item.returned}`
        );
    }

    if (
        returnBatchTotal >
        orderBatchTotal
    ) {
        critical(
            `OrderItem #${item.id} ReturnBatch quantity=${returnBatchTotal} ` +
            `is greater than OrderBatch quantity=${orderBatchTotal}`
        );
    }

    for (const link of item.batches) {
        if (
            link.quantity <= 0
        ) {
            warning(
                `OrderBatch #${link.id} has non-positive quantity=${link.quantity}`
            );
        }

        if (
            link.purchaseCost < 0
        ) {
            critical(
                `OrderBatch #${link.id} has negative purchaseCost=${link.purchaseCost}`
            );
        }
    }

    for (const link of item.ReturnBatch) {
        if (
            link.quantity <= 0
        ) {
            warning(
                `ReturnBatch #${link.id} has non-positive quantity=${link.quantity}`
            );
        }
    }
}

console.log(`


TOTAL ORDERITEM GROSS=${totalGross}

TOTAL ORDERITEM RETURNED=${totalReturned}

TOTAL ORDERBATCH QUANTITY=${totalOrderBatch}

ORDERITEMS WITHOUT ORDERBATCH=${itemsWithoutOrderBatch}

ORDERBATCH MISMATCHES=${orderBatchMismatchCount}

`);


title(
    "4. ORDER STATUS INTEGRITY"
);

const orders =
    await prisma.order.findMany({
        include: {
            items: true,
        },
        orderBy: {
            id: "asc",
        },
    });

let completedStatusMismatch = 0;
let partialStatusMismatch = 0;
let returnedStatusMismatch = 0;

for (const order of orders) {
    const gross =
        order.items.reduce(
            (sum, item) =>
                sum + item.quantity,
            0
        );

    const returned =
        order.items.reduce(
            (sum, item) =>
                sum + item.returned,
            0
        );

    const net =
        gross - returned;

    console.log(
        `Order #${order.id} | ` +
        `status=${order.status} | ` +
        `gross=${gross} | ` +
        `returned=${returned} | ` +
        `net=${net}`
    );

    if (
        order.status === "COMPLETED" &&
        returned !== 0
    ) {
        completedStatusMismatch++;

        warning(
            `Order #${order.id} is COMPLETED but has returned=${returned}`
        );
    }

    if (
        order.status === "PARTIAL_RETURN" &&
        (
            returned <= 0 ||
            returned >= gross
        )
    ) {
        partialStatusMismatch++;

        warning(
            `Order #${order.id} is PARTIAL_RETURN but gross=${gross}, returned=${returned}`
        );
    }

    if (
        order.status === "RETURNED" &&
        (
            gross <= 0 ||
            returned !== gross
        )
    ) {
        returnedStatusMismatch++;

        warning(
            `Order #${order.id} is RETURNED but gross=${gross}, returned=${returned}`
        );
    }

    if (
        order.status === "COMPLETED" &&
        returned === 0
    ) {
        pass(
            `Order #${order.id} COMPLETED status is consistent`
        );
    }

    if (
        order.status === "PARTIAL_RETURN" &&
        returned > 0 &&
        returned < gross
    ) {
        pass(
            `Order #${order.id} PARTIAL_RETURN status is consistent`
        );
    }

    if (
        order.status === "RETURNED" &&
        gross > 0 &&
        returned === gross
    ) {
        pass(
            `Order #${order.id} RETURNED status is consistent`
        );
    }
}

console.log(`


COMPLETED STATUS MISMATCHES=${completedStatusMismatch}

PARTIAL_RETURN STATUS MISMATCHES=${partialStatusMismatch}

RETURNED STATUS MISMATCHES=${returnedStatusMismatch}

`);


title(
    "5. ORDERBATCH ↔ RETURNBATCH BATCH INTEGRITY"
);

const allOrderBatches =
    await prisma.orderBatch.findMany({
        include: {
            batch: true,
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

let negativeOrderBatchQuantity = 0;

for (const link of allOrderBatches) {
    console.log(
        `OrderBatch #${link.id} | ` +
        `Order #${link.orderItem.orderId} | ` +
        `OrderItem #${link.orderItemId} | ` +
        `Batch #${link.batchId} | ` +
        `quantity=${link.quantity} | ` +
        `product="${link.orderItem.product.name}"`
    );

    if (
        link.quantity <= 0
    ) {
        negativeOrderBatchQuantity++;

        warning(
            `OrderBatch #${link.id} has quantity=${link.quantity}`
        );
    }

    if (
        link.batch.productId !==
        link.orderItem.productId
    ) {
        critical(
            `OrderBatch #${link.id} product mismatch: ` +
            `OrderItem productId=${link.orderItem.productId}, ` +
            `Batch productId=${link.batch.productId}`
        );
    }
}

const allReturnBatches =
    await prisma.returnBatch.findMany({
        include: {
            Batch: true,
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

let negativeReturnBatchQuantity = 0;

for (const link of allReturnBatches) {
    console.log(
        `ReturnBatch #${link.id} | ` +
        `Order #${link.OrderItem.orderId} | ` +
        `OrderItem #${link.orderItemId} | ` +
        `Batch #${link.batchId} | ` +
        `quantity=${link.quantity} | ` +
        `product="${link.OrderItem.product.name}"`
    );

    if (
        link.quantity <= 0
    ) {
        negativeReturnBatchQuantity++;

        warning(
            `ReturnBatch #${link.id} has quantity=${link.quantity}`
        );
    }

    if (
        link.Batch.productId !==
        link.OrderItem.productId
    ) {
        critical(
            `ReturnBatch #${link.id} product mismatch: ` +
            `OrderItem productId=${link.OrderItem.productId}, ` +
            `Batch productId=${link.Batch.productId}`
        );
    }
}

title(
    "6. RETURNBATCH ≤ ORDERBATCH PER BATCH"
);

for (const item of orderItems) {
    const soldByBatch =
        new Map<number, number>();

    const returnedByBatch =
        new Map<number, number>();

    for (const link of item.batches) {
        soldByBatch.set(
            link.batchId,
            (soldByBatch.get(link.batchId) ?? 0) +
            link.quantity
        );
    }

    for (const link of item.ReturnBatch) {
        returnedByBatch.set(
            link.batchId,
            (returnedByBatch.get(link.batchId) ?? 0) +
            link.quantity
        );
    }

    for (
        const [
            batchId,
            returnedQuantity,
        ]
        of returnedByBatch
    ) {
        const soldQuantity =
            soldByBatch.get(batchId) ?? 0;

        console.log(
            `OrderItem #${item.id} | ` +
            `Batch #${batchId} | ` +
            `sold=${soldQuantity} | ` +
            `returned=${returnedQuantity}`
        );

        if (
            returnedQuantity >
            soldQuantity
        ) {
            critical(
                `OrderItem #${item.id}, Batch #${batchId}: ` +
                `returned=${returnedQuantity} exceeds sold=${soldQuantity}`
            );
        }
    }
}

title(
    "7. FIFO CHRONOLOGY CHECK"
);

const fifoItems =
    orderItems.filter(
        (item) =>
            item.batches.length > 0
    );

let fifoChecked = 0;
let fifoWarnings = 0;

for (const item of fifoItems) {
    const orderedLinks =
        [...item.batches].sort(
            (a, b) => {
                const expiryDifference =
                    a.batch.expiryDate.getTime() -
                    b.batch.expiryDate.getTime();

                if (
                    expiryDifference !== 0
                ) {
                    return expiryDifference;
                }

                const receivedDifference =
                    a.batch.receivedAt.getTime() -
                    b.batch.receivedAt.getTime();

                if (
                    receivedDifference !== 0
                ) {
                    return receivedDifference;
                }

                return (
                    a.batch.id -
                    b.batch.id
                );
            }
        );

    fifoChecked++;

    console.log(
        `OrderItem #${item.id} | ` +
        `Order #${item.orderId} | ` +
        `FIFO batch order: ` +
        orderedLinks
            .map(
                (link) =>
                    `#${link.batchId}`
            )
            .join(" → ")
    );

    for (
        let i = 1;
        i < orderedLinks.length;
        i++
    ) {
        const previous =
            orderedLinks[i - 1];

        const current =
            orderedLinks[i];

        if (
            previous.batch.receivedAt >
            current.batch.receivedAt
        ) {
            fifoWarnings++;

            warning(
                `OrderItem #${item.id}: unexpected FIFO chronology`
            );
        }
    }
}

console.log(`


FIFO ITEMS CHECKED=${fifoChecked}

FIFO WARNINGS=${fifoWarnings}

NOTE:

This FIFO section only verifies chronology
inside existing OrderBatch links.

It does NOT attempt to reconstruct
historically missing OrderBatch links.

`);


title(
    "8. CURRENT MOVEMENT INTEGRITY"
);

const movements =
    await prisma.movement.findMany({
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

let negativeRunningBalance = 0;

const runningByProduct =
    new Map<number, number>();

for (const movement of movements) {
    const previous =
        runningByProduct.get(
            movement.productId
        ) ?? 0;

    const next =
        previous +
        movement.quantity;

    runningByProduct.set(
        movement.productId,
        next
    );

    const orderNumber =
        extractOrderNumber(
            movement.comment
        );

    const batchNumber =
        extractBatchNumber(
            movement.comment
        );

    console.log(
        `${formatDate(movement.createdAt)} | ` +
        `Movement #${movement.id} | ` +
        `Product #${movement.productId} "${movement.product.name}" | ` +
        `${movement.type} | ` +
        `${signed(movement.quantity)} | ` +
        `RUNNING=${next}` +
        (
            orderNumber
                ? ` | Order #${orderNumber}`
                : ""
        ) +
        (
            batchNumber
                ? ` | Batch #${batchNumber}`
                : ""
        )
    );

    if (
        next < 0
    ) {
        negativeRunningBalance++;

        warning(
            `Historical Movement running balance below zero for ` +
            `Product #${movement.productId} at Movement #${movement.id}`
        );
    }
}

console.log(`


MOVEMENT RUNNING NEGATIVE EVENTS=${negativeRunningBalance}

NOTE:

Historical Movement balances are NOT used
as the source of truth for current stock.

Current stock source of truth is:

Product.stock ↔ Batch.quantity

`);


title(
    "9. CURRENT PRODUCT STOCK SUMMARY"
);

for (const product of products) {
    const batchTotal =
        product.batches.reduce(
            (sum, batch) =>
                sum + batch.quantity,
            0
        );

    const positiveBatches =
        product.batches.filter(
            (batch) =>
                batch.quantity > 0
        );

    console.log(`


Product #${product.id}

name=${product.name}

Product.stock=${product.stock}

Batch total=${batchTotal}

Positive batches=${positiveBatches.length}

`);


    for (
        const batch of positiveBatches
    ) {
        console.log(
            `  Batch #${batch.id} | ` +
            `quantity=${batch.quantity} | ` +
            `status=${batch.status} | ` +
            `expiry=${formatDate(batch.expiryDate)}`
        );
    }
}

title(
    "10. FINAL CURRENT STATE STATUS"
);

console.log(`


PASSED CHECKS=${passedChecks}

WARNINGS=${warnings}

CRITICAL ISSUES=${criticalIssues}

`);


if (
    criticalIssues === 0
) {
    console.log(
        "🟢 CURRENT DATABASE HAS NO CRITICAL INTEGRITY FAILURES"
    );
} else {
    console.log(
        "🔴 CURRENT DATABASE HAS CRITICAL INTEGRITY FAILURES"
    );
}

if (
    warnings > 0
) {
    console.log(
        "\n🟠 WARNINGS REQUIRE REVIEW, " +
        "BUT DO NOT AUTOMATICALLY AUTHORIZE REPAIR."
    );
}

console.log(`


==============================================================================

11. FINAL SAFETY STATUS

==============================================================================

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

NO OrdыerItem changed.

NO OrderBatch changed.

NO ReturnBatch changed.

NO Supplier changed.

NO database repair executed.

🏁 CURRENT STATE INTEGRITY AUDIT V20 COMPLETED

==============================================================================

`);
}

main()
.catch((error) => {
console.error(
"\n🔴 AUDIT FAILED\n"
);


    console.error(error);

    process.exitCode = 1;
})
.finally(async () => {
    await prisma.$disconnect();
});