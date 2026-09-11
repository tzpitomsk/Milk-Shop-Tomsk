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

function separator() {
console.log(
"\n----------------------------------------------------------------------\n"
);
}

function formatDate(value: Date | null | undefined) {
if (!value) {
return "NULL";
}


return value.toISOString();


}

function signed(value: number) {
return value >= 0
? `+${value}`
: String(value);
}

/**

* Экранирует число для безопасного использования в RegExp.
  */
  function escapeRegExp(value: string) {
  return value.replace(
  /[.*+?^${}()|[]\]/g,
  "\$&"
  );
  }

/**

* Точное совпадение номера поставки.
*
* ВАЖНО:
* Поставка №1 НЕ совпадает с Поставка №12.
  */
  function commentHasExactSupplyNumber(
  comment: string | null,
  supplyId: number
  ) {
  if (!comment) {
  return false;
  }

  const escapedId = escapeRegExp(
  String(supplyId)
  );

  const patterns = [
  new RegExp(
  `поставка\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  new RegExp(
  `приход\\s+поставка\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  new RegExp(
  `supply\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  ];

  return patterns.some(
  (pattern) => pattern.test(comment)
  );
  }

/**

* Точное совпадение номера заказа.
*
* Заказ №2 НЕ совпадает с Заказ №23.
  */
  function commentHasExactOrderNumber(
  comment: string | null,
  orderId: number
  ) {
  if (!comment) {
  return false;
  }

  const escapedId = escapeRegExp(
  String(orderId)
  );

  const patterns = [
  new RegExp(
  `заказ\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  new RegExp(
  `order\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  ];

  return patterns.some(
  (pattern) => pattern.test(comment)
  );
  }

/**

* Точное совпадение номера партии.
*
* Партия №4 НЕ совпадает с Партия №40.
  */
  function commentHasExactBatchNumber(
  comment: string | null,
  batchId: number
  ) {
  if (!comment) {
  return false;
  }

  const escapedId = escapeRegExp(
  String(batchId)
  );

  const patterns = [
  new RegExp(
  `партия\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  new RegExp(
  `batch\\s*[№#]?\\s*${escapedId}(?!\\d)`,
  "i"
  ),
  ];

  return patterns.some(
  (pattern) => pattern.test(comment)
  );
  }

/**

* Извлекает номер заказа из комментария.
*
* Возвращает null, если номер заказа не найден.
  */
  function extractOrderNumber(
  comment: string | null
  ): number | null {
  if (!comment) {
  return null;
  }

  const match = comment.match(
  /(?:заказ|order)\s*[№#]?\s*(\d+)(?!\d)/i
  );

  if (!match) {
  return null;
  }

  const value = Number(match[1]);

  return Number.isFinite(value)
  ? value
  : null;
  }

/**

* Извлекает номер поставки из комментария.
  */
  function extractSupplyNumber(
  comment: string | null
  ): number | null {
  if (!comment) {
  return null;
  }

  const match = comment.match(
  /поставка\s*[№#]?\s*(\d+)(?!\d)/i
  );

  if (!match) {
  return null;
  }

  const value = Number(match[1]);

  return Number.isFinite(value)
  ? value
  : null;
  }

/**

* Извлекает номер партии из комментария.
  */
  function extractBatchNumber(
  comment: string | null
  ): number | null {
  if (!comment) {
  return null;
  }

  const match = comment.match(
  /(?:партия|batch)\s*[№#]?\s*(\d+)(?!\d)/i
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
=============

🧀 ТВОРОГ — LEDGER CLASSIFICATION FORENSIC AUDIT V16

======================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

ЦЕЛЬ V16:

НЕ ИСПРАВЛЯТЬ ДАННЫЕ.

А точно классифицировать исторические расхождения.

ПРОВЕРЯЕМ:

1. Product.stock

2. Текущие Batch

3. Все SupplyItem

4. Все Movement SUPPLY

5. Все OrderItem

6. Все OrderBatch

7. Все ReturnBatch

8. SALE Movement без существующего заказа

9. RETURN Movement без существующего заказа

10. Старые продажи без SALE Movement

11. WRITE_OFF Movement и существование Batch

12. Orphan Movement

13. "Живой" Movement ledger

14. Какие записи требуют будущего repair plan

ВАЖНО:

V16 НИЧЕГО НЕ ИЗМЕНЯЕТ.

Никаких:

create

update

delete

transaction

repair

не выполняется.

======================================================================
`);


// ================================================================
// 1. PRODUCT
// ================================================================

title("1. PRODUCT — CURRENT STATE");

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


// ================================================================
// 2. CURRENT BATCHES
// ================================================================

title("2. CURRENT BATCHES");

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

const existingBatchIds =
    new Set(
        batches.map(
            (batch) => batch.id
        )
    );

let currentBatchTotal = 0;

console.log(
    `Current Batch records=${batches.length}\n`
);

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

Difference Product.stock - Batch total=${
product.stock -
currentBatchTotal
}
`);


// ================================================================
// 3. ALL SUPPLY ITEMS
// ================================================================

title(
    "3. ALL SUPPLY ITEMS — BUSINESS SOURCE"
);

const supplyItems =
    await prisma.supplyItem.findMany({
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

const existingSupplyIds =
    new Set(
        supplyItems.map(
            (item) =>
                item.supplyId
        )
    );

let totalBusinessSupply = 0;

console.log(
    `SupplyItem records=${supplyItems.length}\n`
);

for (const item of supplyItems) {
    totalBusinessSupply +=
        item.quantity;

    console.log(
        `Supply #${item.supplyId} | ` +
        `SupplyItem #${item.id} | ` +
        `quantity=${item.quantity} | ` +
        `cost=${item.cost} | ` +
        `date=${formatDate(
            item.supply.date
        )}`
    );
}

console.log(`


TOTAL BUSINESS SUPPLY=${totalBusinessSupply}
`);


// ================================================================
// 4. ALL ORDER ITEMS
// ================================================================

title(
    "4. ALL ORDER ITEMS — BUSINESS SOURCE"
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

const existingOrderIds =
    new Set(
        orderItems.map(
            (item) =>
                item.orderId
        )
    );

let totalGrossSales = 0;
let totalReturnedField = 0;
let totalReturnBatch = 0;
let totalNetSales = 0;

console.log(
    `OrderItem records=${orderItems.length}\n`
);

for (const item of orderItems) {
    const returnBatchTotal =
        item.ReturnBatch.reduce(
            (
                sum,
                returnBatch
            ) =>
                sum +
                returnBatch.quantity,
            0
        );

    const orderBatchTotal =
        item.batches.reduce(
            (
                sum,
                orderBatch
            ) =>
                sum +
                orderBatch.quantity,
            0
        );

    totalGrossSales +=
        item.quantity;

    totalReturnedField +=
        item.returned;

    totalReturnBatch +=
        returnBatchTotal;

    totalNetSales +=
        item.quantity -
        item.returned;

    console.log(`


Order #${item.orderId}

OrderItem #${item.id}

date=${formatDate(
item.order.date
)}

status=${item.order.status}

gross=${item.quantity}

returned field=${item.returned}

ReturnBatch total=${returnBatchTotal}

net=${
item.quantity -
item.returned
}

OrderBatch total=${orderBatchTotal}

OrderBatch links=${item.batches.length}

ReturnBatch links=${
item.ReturnBatch.length
}
`);


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
            "🔴 RETURN FIELD ≠ RETURNBATCH TOTAL"
        );
    }
}

console.log(`

TOTAL GROSS SALES=${totalGrossSales}

TOTAL RETURNED FIELD=${totalReturnedField}

TOTAL RETURNBATCH=${totalReturnBatch}

TOTAL NET SALES=${totalNetSales}
`);


// ================================================================
// 5. ALL MOVEMENTS
// ================================================================

title("5. ALL MOVEMENTS");

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

console.log(
    `Movement records=${movements.length}\n`
);

let rawMovementBalance = 0;

for (const movement of movements) {
    rawMovementBalance +=
        movement.quantity;

    console.log(
        `${formatDate(
            movement.createdAt
        )} | ` +
        `Movement #${movement.id} | ` +
        `${movement.type.padEnd(10)} | ` +
        `${signed(
            movement.quantity
        ).padStart(5)} | ` +
        `RUNNING=${rawMovementBalance} | ` +
        `${movement.comment ?? ""}`
    );
}

console.log(`


RAW FINAL MOVEMENT BALANCE=${rawMovementBalance}
`);


// ================================================================
// 6. SUPPLY CLASSIFICATION
// ================================================================

title(
    "6. SUPPLY MOVEMENT CLASSIFICATION"
);

const supplyMovements =
    movements.filter(
        (movement) =>
            movement.type ===
            "SUPPLY"
    );

let matchedSupplyMovementTotal = 0;
let missingSupplyBusinessTotal = 0;
let unmatchedSupplyMovementTotal = 0;

for (const supplyItem of supplyItems) {
    const matching =
        supplyMovements.filter(
            (movement) =>
                commentHasExactSupplyNumber(
                    movement.comment,
                    itemSupplyId(supplyItem)
                )
        );

    const movementTotal =
        matching.reduce(
            (
                sum,
                movement
            ) =>
                sum +
                movement.quantity,
            0
        );

    matchedSupplyMovementTotal +=
        movementTotal;

    const gap =
        supplyItem.quantity -
        movementTotal;

    console.log(`


Supply #${supplyItem.supplyId}

business quantity=${supplyItem.quantity}

matched movement=${movementTotal}

gap=${gap}
`);


    if (gap !== 0) {
        missingSupplyBusinessTotal +=
            gap;

        console.log(
            "🟠 SUPPLY BUSINESS ↔ MOVEMENT MISMATCH"
        );
    }

    for (const movement of matching) {
        console.log(
            `  Movement #${movement.id} | ` +
            `${signed(
                movement.quantity
            )} | ` +
            `${movement.comment ?? ""}`
        );
    }
}

for (const movement of supplyMovements) {
    const supplyNumber =
        extractSupplyNumber(
            movement.comment
        );

    const exists =
        supplyNumber !== null &&
        existingSupplyIds.has(
            supplyNumber
        );

    if (!exists) {
        unmatchedSupplyMovementTotal +=
            movement.quantity;

        console.log(`


🔴 ORPHAN SUPPLY MOVEMENT

Movement #${movement.id}

quantity=${movement.quantity}

date=${formatDate(
movement.createdAt
)}

comment=${movement.comment ?? "NULL"}

parsed Supply number=${
supplyNumber ?? "NOT FOUND"
}
`);
}
}


console.log(`


MATCHED SUPPLY MOVEMENT TOTAL=${matchedSupplyMovementTotal}

MISSING BUSINESS SUPPLY TOTAL=${missingSupplyBusinessTotal}

ORPHAN SUPPLY MOVEMENT TOTAL=${unmatchedSupplyMovementTotal}
`);


// ================================================================
// 7. SALE CLASSIFICATION
// ================================================================

title(
    "7. SALE MOVEMENT CLASSIFICATION"
);

const saleMovements =
    movements.filter(
        (movement) =>
            movement.type ===
            "SALE"
    );

let missingSaleTotal = 0;
let orphanSaleTotal = 0;

for (const item of orderItems) {
    const matching =
        saleMovements.filter(
            (movement) =>
                commentHasExactOrderNumber(
                    movement.comment,
                    item.orderId
                )
        );

    const actual =
        matching.reduce(
            (
                sum,
                movement
            ) =>
                sum +
                movement.quantity,
            0
        );

    const expected =
        -item.quantity;

    const gap =
        expected -
        actual;

    if (gap !== 0) {
        missingSaleTotal +=
            Math.abs(gap);

        console.log(`


🟠 SALE BUSINESS ↔ MOVEMENT MISMATCH

Order #${item.orderId}

OrderItem #${item.id}

gross=${item.quantity}

expected SALE=${expected}

actual SALE=${actual}

gap=${gap}
`);
}
}


for (const movement of saleMovements) {
    const orderNumber =
        extractOrderNumber(
            movement.comment
        );

    const exists =
        orderNumber !== null &&
        existingOrderIds.has(
            orderNumber
        );

    if (!exists) {
        orphanSaleTotal +=
            movement.quantity;

        console.log(`


🔴 ORPHAN SALE MOVEMENT

Movement #${movement.id}

quantity=${movement.quantity}

date=${formatDate(
movement.createdAt
)}

comment=${movement.comment ?? "NULL"}

parsed Order number=${
orderNumber ?? "NOT FOUND"
}

classification:

SALE movement references an order
which is not present among current
Tvorog OrderItem records.
`);
}
}


console.log(`


MISSING SALE QUANTITY=${missingSaleTotal}

ORPHAN SALE MOVEMENT TOTAL=${orphanSaleTotal}
`);


// ================================================================
// 8. RETURN CLASSIFICATION
// ================================================================

title(
    "8. RETURN MOVEMENT CLASSIFICATION"
);

const returnMovements =
    movements.filter(
        (movement) =>
            movement.type ===
            "RETURN"
    );

let orphanReturnTotal = 0;
let classifiedReturnTotal = 0;

for (const movement of returnMovements) {
    const orderNumber =
        extractOrderNumber(
            movement.comment
        );

    const exists =
        orderNumber !== null &&
        existingOrderIds.has(
            orderNumber
        );

    if (exists) {
        classifiedReturnTotal +=
            movement.quantity;
    } else {
        orphanReturnTotal +=
            movement.quantity;

        console.log(`


🔴 ORPHAN RETURN MOVEMENT

Movement #${movement.id}

quantity=${movement.quantity}

date=${formatDate(
movement.createdAt
)}

comment=${movement.comment ?? "NULL"}

parsed Order number=${
orderNumber ?? "NOT FOUND"
}

classification:

RETURN movement references an order
which is not present among current
Tvorog OrderItem records.
`);
}
}


console.log(`


RETURN MOVEMENT LINKED TO EXISTING ORDERS=${classifiedReturnTotal}

ORPHAN RETURN MOVEMENT TOTAL=${orphanReturnTotal}

RETURNBATCH TOTAL=${totalReturnBatch}
`);


// ================================================================
// 9. WRITE-OFF CLASSIFICATION
// ================================================================

title(
    "9. WRITE-OFF MOVEMENT CLASSIFICATION"
);

const writeOffMovements =
    movements.filter(
        (movement) =>
            movement.type ===
            "WRITE_OFF"
    );

let existingBatchWriteOffTotal = 0;
let missingBatchWriteOffTotal = 0;
let unparsedWriteOffTotal = 0;

for (const movement of writeOffMovements) {
    const batchNumber =
        extractBatchNumber(
            movement.comment
        );

    console.log(`


Movement #${movement.id}

quantity=${movement.quantity}

date=${formatDate(
movement.createdAt
)}

comment=${movement.comment ?? "NULL"}

parsed Batch number=${
batchNumber ?? "NOT FOUND"
}
`);


    if (batchNumber === null) {
        unparsedWriteOffTotal +=
            movement.quantity;

        console.log(
            "🟠 WRITE_OFF WITHOUT PARSEABLE BATCH NUMBER"
        );

        continue;
    }

    if (
        existingBatchIds.has(
            batchNumber
        )
    ) {
        existingBatchWriteOffTotal +=
            movement.quantity;

        console.log(
            `🟢 REFERENCED BATCH #${batchNumber} EXISTS`
        );
    } else {
        missingBatchWriteOffTotal +=
            movement.quantity;

        console.log(
            `🔴 REFERENCED BATCH #${batchNumber} DOES NOT EXIST`
        );
    }
}

console.log(`


WRITE_OFF TOTAL FOR EXISTING BATCHES=${existingBatchWriteOffTotal}

WRITE_OFF TOTAL FOR MISSING BATCHES=${missingBatchWriteOffTotal}

WRITE_OFF TOTAL WITHOUT PARSEABLE BATCH=${unparsedWriteOffTotal}
`);


// ================================================================
// 10. ORPHAN ORDER MOVEMENT PAIRS
// ================================================================

title(
    "10. ORPHAN ORDER MOVEMENT PAIRS"
);

/**
 * Группируем orphan SALE и RETURN
 * по номеру заказа.
 *
 * Это позволяет увидеть:
 *
 * SALE -5
 * RETURN +5
 *
 * которые исторически взаимно
 * компенсируются.
 */

const orphanOrderMap =
    new Map<
        number,
        {
            sale: number;
            returned: number;
            movementIds: number[];
        }
    >();

for (const movement of movements) {
    if (
        movement.type !== "SALE" &&
        movement.type !== "RETURN"
    ) {
        continue;
    }

    const orderNumber =
        extractOrderNumber(
            movement.comment
        );

    if (
        orderNumber === null ||
        existingOrderIds.has(
            orderNumber
        )
    ) {
        continue;
    }

    const current =
        orphanOrderMap.get(
            orderNumber
        ) ?? {
            sale: 0,
            returned: 0,
            movementIds: [],
        };

    if (
        movement.type ===
        "SALE"
    ) {
        current.sale +=
            movement.quantity;
    }

    if (
        movement.type ===
        "RETURN"
    ) {
        current.returned +=
            movement.quantity;
    }

    current.movementIds.push(
        movement.id
    );

    orphanOrderMap.set(
        orderNumber,
        current
    );
}

let orphanOrderNetTotal = 0;

if (
    orphanOrderMap.size === 0
) {
    console.log(
        "No orphan SALE/RETURN order groups found."
    );
}

for (
    const [
        orderId,
        data,
    ] of orphanOrderMap.entries()
) {
    const net =
        data.sale +
        data.returned;

    orphanOrderNetTotal +=
        net;

    console.log(`


ORPHAN ORDER #${orderId}

SALE total=${data.sale}

RETURN total=${data.returned}

NET=${net}

Movement IDs=${data.movementIds.join(
", "
)}

${
net === 0
? "🟢 ORPHAN MOVEMENTS NET TO ZERO"
: "🔴 ORPHAN MOVEMENTS DO NOT NET TO ZERO"
}
`);
}


console.log(`


TOTAL ORPHAN ORDER MOVEMENT NET=${orphanOrderNetTotal}
`);


// ================================================================
// 11. RAW MOVEMENT TYPE TOTALS
// ================================================================

title(
    "11. RAW MOVEMENT TYPE TOTALS"
);

const movementTotals =
    new Map<
        string,
        number
    >();

for (const movement of movements) {
    movementTotals.set(
        movement.type,
        (
            movementTotals.get(
                movement.type
            ) ?? 0
        ) +
            movement.quantity
    );
}

for (
    const [
        type,
        quantity,
    ] of movementTotals.entries()
) {
    console.log(
        `${type.padEnd(
            15
        )} = ${signed(quantity)}`
    );
}

console.log(`


RAW MOVEMENT BALANCE=${rawMovementBalance}
`);


// ================================================================
// 12. CLASSIFIED LEDGER
// ================================================================

title(
    "12. CLASSIFIED LEDGER — EXPERIMENTAL ANALYSIS"
);

/**
 * ВАЖНО:
 *
 * Это НЕ исправление.
 *
 * Здесь мы только математически
 * показываем влияние уже найденных
 * orphan-групп.
 *
 * НИ ОДНО движение из базы
 * не удаляется.
 */

const orphanSaleAndReturnNet =
    orphanSaleTotal +
    orphanReturnTotal;

const movementWithoutNetZeroOrphans =
    rawMovementBalance -
    orphanSaleAndReturnNet;

console.log(`


RAW MOVEMENT BALANCE
= ${rawMovementBalance}

---

ORPHAN SALE TOTAL
= ${orphanSaleTotal}

ORPHAN RETURN TOTAL
= ${orphanReturnTotal}

ORPHAN SALE + RETURN NET
= ${orphanSaleAndReturnNet}

---

EXPERIMENTAL BALANCE AFTER
REMOVING NET EFFECT OF ORPHAN
SALE/RETURN PAIRS

= ${movementWithoutNetZeroOrphans}

---

IMPORTANT:

This is only mathematical
classification.

NO Movement was deleted.

NO Product.stock was changed.

NO Batch was changed.
`);


// ================================================================
// 13. BUSINESS CHAIN
// ================================================================

title(
    "13. BUSINESS CHAIN — HIGH LEVEL"
);

console.log(`


TOTAL BUSINESS SUPPLY
= ${totalBusinessSupply}

GROSS SALES
= -${totalGrossSales}

RETURNED
= +${totalReturnedField}

CURRENT PRODUCT STOCK
= ${product.stock}

CURRENT BATCH TOTAL
= ${currentBatchTotal}

---

KNOWN BUSINESS ↔ MOVEMENT GAPS

MISSING SUPPLY MOVEMENT
= ${missingSupplyBusinessTotal}

MISSING SALE QUANTITY
= ${missingSaleTotal}

ORPHAN SALE TOTAL
= ${orphanSaleTotal}

ORPHAN RETURN TOTAL
= ${orphanReturnTotal}

WRITE_OFF FOR MISSING BATCHES
= ${missingBatchWriteOffTotal}
`);


// ================================================================
// 14. CURRENT STOCK SAFETY CHECK
// ================================================================

title(
    "14. CURRENT STOCK SAFETY CHECK"
);

const productAndBatchConsistent =
    product.stock ===
    currentBatchTotal;

console.log(`


Product.stock=${product.stock}

Current Batch total=${currentBatchTotal}

Difference=${
product.stock -
currentBatchTotal
}

${
productAndBatchConsistent
? "🟢 CURRENT STOCK IS CONSISTENT WITH CURRENT BATCHES"
: "🔴 CURRENT STOCK DOES NOT MATCH CURRENT BATCHES"
}
`);

// ================================================================
// 15. REPAIR CLASSIFICATION
// ================================================================

title(
    "15. REPAIR CLASSIFICATION — NO REPAIR EXECUTED"
);

console.log(`


CATEGORY A

CURRENT STOCK

Product.stock=${product.stock}

Batch total=${currentBatchTotal}

STATUS=${
productAndBatchConsistent
? "CURRENT STATE CONSISTENT"
: "CURRENT STATE INCONSISTENT"
}

---

CATEGORY B

MISSING BUSINESS SUPPLY MOVEMENT

quantity=${missingSupplyBusinessTotal}

STATUS=${
missingSupplyBusinessTotal === 0
? "NO GAP"
: "REQUIRES HISTORICAL DECISION"
}

---

CATEGORY C

MISSING SALE MOVEMENT

quantity=${missingSaleTotal}

STATUS=${
missingSaleTotal === 0
? "NO GAP"
: "REQUIRES HISTORICAL DECISION"
}

---

CATEGORY D

ORPHAN SALE MOVEMENTS

total=${orphanSaleTotal}

---

CATEGORY E

ORPHAN RETURN MOVEMENTS

total=${orphanReturnTotal}

---

CATEGORY F

ORPHAN SALE/RETURN NET

total=${orphanOrderNetTotal}

---

CATEGORY G

WRITE_OFF REFERENCING
MISSING BATCHES

total=${missingBatchWriteOffTotal}

STATUS=${
missingBatchWriteOffTotal === 0
? "NO GAP"
: "CRITICAL HISTORICAL CHAIN INVESTIGATION REQUIRED"
}

---

NO REPAIR WAS EXECUTED.
`);


// ================================================================
// 16. FINAL FORENSIC RESULT
// ================================================================

title(
    "16. FINAL FORENSIC RESULT"
);

console.log(`


CURRENT DATABASE STATE

Product.stock=${product.stock}

Current Batch total=${currentBatchTotal}

Product ↔ Batch difference=${
product.stock -
currentBatchTotal
}

---

RAW MOVEMENT LEDGER

balance=${rawMovementBalance}

Product.stock - raw Movement balance=${
product.stock -
rawMovementBalance
}

---

SUPPLY

Business total=${totalBusinessSupply}

Matched Movement total=${matchedSupplyMovementTotal}

Missing business quantity=${missingSupplyBusinessTotal}

---

SALES

Gross sales=${totalGrossSales}

Missing SALE quantity=${missingSaleTotal}

Orphan SALE total=${orphanSaleTotal}

---

RETURNS

OrderItem.returned=${totalReturnedField}

ReturnBatch=${totalReturnBatch}

Orphan RETURN total=${orphanReturnTotal}

---

WRITE-OFF

Existing Batch references=${existingBatchWriteOffTotal}

Missing Batch references=${missingBatchWriteOffTotal}

Unparsed=${unparsedWriteOffTotal}

---

ORPHAN ORDER MOVEMENTS

Net total=${orphanOrderNetTotal}

---

FINAL STATUS

${
productAndBatchConsistent
? "🟢 CURRENT PRODUCT/BATCH STATE IS INTERNALLY CONSISTENT"
: "🔴 CURRENT PRODUCT/BATCH STATE IS NOT INTERNALLY CONSISTENT"
}

🟠 HISTORICAL MOVEMENT LEDGER REQUIRES
FURTHER FORENSIC CLASSIFICATION.

🚫 NO AUTOMATIC REPAIR IS AUTHORIZED
BY THIS AUDIT.
`);


// ================================================================
// 17. SAFETY STATUS
// ================================================================

title(
    "17. FINAL SAFETY STATUS"
);

console.log(`


STRICT READ ONLY AUDIT COMPLETED.

Product НЕ изменялся.

Product.stock НЕ изменялся.

Batch НЕ создавались.

Batch НЕ удалялись.

Batch НЕ изменялись.

Movement НЕ создавались.

Movement НЕ удалялись.

Movement НЕ изменялись.

OrderBatch НЕ создавались.

OrderBatch НЕ удалялись.

OrderBatch НЕ изменялись.

ReturnBatch НЕ создавались.

ReturnBatch НЕ удалялись.

ReturnBatch НЕ изменялись.

Supply НЕ изменялись.

SupplyItem НЕ изменялись.

Order НЕ изменялись.

OrderItem НЕ изменялись.

Supplier НЕ изменялся.

🏁 AUDIT V16 ЗАВЕРШЁН
`);
}

/**

* Отдельная маленькая функция нужна,
* чтобы TypeScript явно работал
* с supplyId.
  */
  function itemSupplyId(
  item: {
  supplyId: number;
  }
  ) {
  return item.supplyId;
  }

main()
.catch((error) => {
console.error(error);
process.exit(1);
})
.finally(async () => {
await prisma.$disconnect();
});