import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCT_ID = 2;
const PRODUCT_NAME = "Творог";

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

function printJson(label: string, value: unknown) {
    console.log(`\n${label}\n`);
    console.log(JSON.stringify(value, null, 2));
}

function quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

async function tableExists(tableName: string) {
    const rows = await prisma.$queryRawUnsafe<
        Array<{ name: string }>
    >(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
        `,
        tableName
    );

    return rows.length > 0;
}

async function getTableColumns(tableName: string) {
    return prisma.$queryRawUnsafe<
        Array<{
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: unknown;
            pk: number;
        }>
    >(
        `PRAGMA table_info(${quoteIdentifier(tableName)})`
    );
}

async function getForeignKeys(tableName: string) {
    return prisma.$queryRawUnsafe<
        Array<{
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string;
            on_update: string;
            on_delete: string;
            match: string;
        }>
    >(
        `PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`
    );
}

async function getAllRows(
    tableName: string,
    whereClause?: string,
    params: unknown[] = []
) {
    const sql = `
        SELECT *
        FROM ${quoteIdentifier(tableName)}
        ${whereClause ? `WHERE ${whereClause}` : ""}
        ORDER BY id ASC
    `;

    return prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
    >(sql, ...params);
}

async function main() {
    console.log(`
======================================================================

🧀 ТВОРОГ — FORENSIC DATABASE AUDIT V14

======================================================================

⚠️ STRICT READ ONLY

⚠️ БАЗА ДАННЫХ НЕ ИЗМЕНЯЕТСЯ

Цель:

1. Получить реальную структуру SQLite.
2. Найти реальные связи SupplyItem ↔ Batch.
3. Найти реальные связи OrderItem ↔ OrderBatch.
4. Проверить исторический Batch #4.
5. Исследовать цепочку +10 +10 +20 = +40.
6. НЕ делать никаких repair-операций.

======================================================================
`);

    // ================================================================
    // 1. DATABASE TABLES
    // ================================================================

    title("1. REAL SQLITE TABLES");

    const tables = await prisma.$queryRawUnsafe<
        Array<{
            name: string;
            sql: string | null;
        }>
    >(`
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name ASC
    `);

    console.log(`Total tables = ${tables.length}\n`);

    for (const table of tables) {
        console.log(`
TABLE: ${table.name}

${table.sql ?? "NO CREATE SQL"}
`);
    }

    // ================================================================
    // 2. IMPORTANT TABLE STRUCTURES
    // ================================================================

    title("2. IMPORTANT TABLE STRUCTURES");

    const importantTables = [
        "Product",
        "Supply",
        "SupplyItem",
        "Batch",
        "Order",
        "OrderItem",
        "OrderBatch",
        "ReturnBatch",
        "Movement",
    ];

    for (const tableName of importantTables) {
        const exists = await tableExists(tableName);

        console.log(`
--------------------------------------------------

TABLE: ${tableName}

exists = ${exists}
`);

        if (!exists) {
            continue;
        }

        const columns = await getTableColumns(tableName);
        const foreignKeys = await getForeignKeys(tableName);

        console.log("\nCOLUMNS:\n");

        for (const column of columns) {
            console.log(
                `name=${column.name} | ` +
                `type=${column.type} | ` +
                `notnull=${column.notnull} | ` +
                `pk=${column.pk} | ` +
                `default=${String(column.dflt_value)}`
            );
        }

        console.log("\nFOREIGN KEYS:\n");

        if (foreignKeys.length === 0) {
            console.log("NONE");
        } else {
            for (const fk of foreignKeys) {
                console.log(
                    `${fk.from} -> ${fk.table}.${fk.to} ` +
                    `(delete=${fk.on_delete}, update=${fk.on_update})`
                );
            }
        }
    }

    // ================================================================
    // 3. PRODUCT
    // ================================================================

    title("3. PRODUCT #2");

    const product = await prisma.product.findUnique({
        where: {
            id: PRODUCT_ID,
        },
    });

    if (!product) {
        throw new Error(
            `Product #${PRODUCT_ID} (${PRODUCT_NAME}) not found`
        );
    }

    printJson(
        `PRODUCT #${PRODUCT_ID}`,
        product
    );

    // ================================================================
    // 4. ALL SUPPLY ITEMS FOR PRODUCT
    // ================================================================

    title("4. ALL SUPPLYITEM RECORDS FOR TVOROG");

    if (await tableExists("SupplyItem")) {
        const rows = await getAllRows(
            "SupplyItem",
            "productId = ?",
            [PRODUCT_ID]
        );

        console.log(
            `SupplyItem rows for Product #${PRODUCT_ID} = ${rows.length}`
        );

        for (const row of rows) {
            printJson(
                `SUPPLYITEM #${String(row.id)}`,
                row
            );
        }
    }

    // ================================================================
    // 5. ALL SUPPLIES
    // ================================================================

    title("5. ALL SUPPLY RECORDS");

    if (await tableExists("Supply")) {
        const rows = await getAllRows("Supply");

        console.log(
            `Total Supply records = ${rows.length}`
        );

        for (const row of rows) {
            printJson(
                `SUPPLY #${String(row.id)}`,
                row
            );
        }
    }

    // ================================================================
    // 6. ALL BATCHES FOR TVOROG
    // ================================================================

    title("6. ALL BATCH RECORDS FOR TVOROG");

    if (await tableExists("Batch")) {
        const batchColumns = await getTableColumns("Batch");

        const hasProductId = batchColumns.some(
            (column) => column.name === "productId"
        );

        let rows: Array<Record<string, unknown>> = [];

        if (hasProductId) {
            rows = await getAllRows(
                "Batch",
                "productId = ?",
                [PRODUCT_ID]
            );
        } else {
            rows = await getAllRows("Batch");
        }

        console.log(
            `Batch rows returned = ${rows.length}`
        );

        for (const row of rows) {
            printJson(
                `BATCH #${String(row.id)}`,
                row
            );
        }
    }

    // ================================================================
    // 7. BATCH #4 HISTORICAL INVESTIGATION
    // ================================================================

    title("7. BATCH #4 HISTORICAL INVESTIGATION");

    if (await tableExists("Batch")) {
        const batch4Rows = await prisma.$queryRawUnsafe<
            Array<Record<string, unknown>>
        >(
            `
            SELECT *
            FROM "Batch"
            WHERE id = 4
            `
        );

        console.log(
            `Current Batch #4 records = ${batch4Rows.length}`
        );

        for (const row of batch4Rows) {
            printJson(
                "CURRENT BATCH #4",
                row
            );
        }
    }

    console.log(`
Searching ALL tables that may contain a batch reference...
`);

    for (const tableName of [
        "Batch",
        "OrderBatch",
        "ReturnBatch",
    ]) {
        if (!(await tableExists(tableName))) {
            continue;
        }

        const columns = await getTableColumns(tableName);

        const batchReferenceColumns = columns.filter((column) => {
            const name = column.name.toLowerCase();

            return (
                name === "batchid" ||
                name.includes("batch")
            );
        });

        console.log(`
TABLE ${tableName}

Possible batch columns:
${batchReferenceColumns.map(
    (column) => column.name
).join(", ") || "NONE"}
`);

        for (const column of batchReferenceColumns) {
            try {
                const rows = await prisma.$queryRawUnsafe<
                    Array<Record<string, unknown>>
                >(
                    `
                    SELECT *
                    FROM ${quoteIdentifier(tableName)}
                    WHERE ${quoteIdentifier(column.name)} = ?
                    ORDER BY id ASC
                    `,
                    4
                );

                console.log(
                    `References where ${tableName}.${column.name} = 4: ${rows.length}`
                );

                for (const row of rows) {
                    printJson(
                        `${tableName} reference to Batch #4`,
                        row
                    );
                }
            } catch (error) {
                console.error(
                    `Error searching ${tableName}.${column.name}:`,
                    error
                );
            }
        }
    }

    // ================================================================
    // 8. ALL TVOROG MOVEMENTS
    // ================================================================

    title("8. ALL TVOROG MOVEMENTS");

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

    console.log(
        `Total movements = ${movements.length}\n`
    );

    let runningStockChange = 0;

    for (const movement of movements) {
        runningStockChange += movement.quantity;

        console.log(
            `${movement.createdAt.toISOString()} | ` +
            `Movement #${movement.id} | ` +
            `${movement.type.padEnd(10)} | ` +
            `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
            `RUNNING=${runningStockChange} | ` +
            `${movement.comment ?? ""}`
        );
    }

    // ================================================================
    // 9. EXACT +40 CHAIN
    // ================================================================

    title("9. EXACT +40 CHAIN INVESTIGATION");

    const supplyMovements = movements.filter(
        (movement) =>
            movement.type === "SUPPLY"
    );

    console.log(
        `SUPPLY movements for Tvorog = ${supplyMovements.length}\n`
    );

    let totalSupplyMovementQuantity = 0;

    for (const movement of supplyMovements) {
        totalSupplyMovementQuantity += movement.quantity;

        console.log(`
Movement #${movement.id}

quantity=${movement.quantity}

createdAt=${movement.createdAt.toISOString()}

comment=${movement.comment ?? "NULL"}
`);
    }

    console.log(`
TOTAL ALL SUPPLY MOVEMENTS = ${totalSupplyMovementQuantity}
`);

    // Search contiguous movement windows that sum exactly to +40.

    console.log(`
Searching contiguous chronological movement windows with net = +40...
`);

    let exact40Chains = 0;

    for (let start = 0; start < movements.length; start++) {
        let sum = 0;

        for (
            let end = start;
            end < movements.length;
            end++
        ) {
            sum += movements[end].quantity;

            if (sum === 40) {
                exact40Chains++;

                console.log(`
🟢 EXACT +40 CHAIN #${exact40Chains}

START:
Movement #${movements[start].id}
${movements[start].createdAt.toISOString()}

END:
Movement #${movements[end].id}
${movements[end].createdAt.toISOString()}

EVENTS:
`);

                for (
                    let index = start;
                    index <= end;
                    index++
                ) {
                    const movement = movements[index];

                    console.log(
                        `${movement.createdAt.toISOString()} | ` +
                        `#${movement.id} | ` +
                        `${movement.type} | ` +
                        `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
                        `${movement.comment ?? ""}`
                    );
                }

                console.log(`
NET = +40
`);
            }
        }
    }

    console.log(`
TOTAL EXACT +40 CHAINS = ${exact40Chains}
`);

    // ================================================================
    // 10. SPECIFIC +10 +10 +20 SEQUENCE
    // ================================================================

    title("10. +10 +10 +20 SEQUENCE");

    const movements101020 = movements.filter(
        (movement) =>
            movement.quantity === 10 ||
            movement.quantity === 20
    );

    console.log(`
Positive +10/+20 events = ${movements101020.length}
`);

    for (const movement of movements101020) {
        console.log(
            `${movement.createdAt.toISOString()} | ` +
            `Movement #${movement.id} | ` +
            `${movement.type} | ` +
            `+${movement.quantity} | ` +
            `${movement.comment ?? ""}`
        );
    }

    // ================================================================
    // 11. ORDER ITEMS FOR TVOROG
    // ================================================================

    title("11. ALL ORDERITEM RECORDS FOR TVOROG");

    if (await tableExists("OrderItem")) {
        const rows = await getAllRows(
            "OrderItem",
            "productId = ?",
            [PRODUCT_ID]
        );

        console.log(
            `OrderItem rows = ${rows.length}`
        );

        for (const row of rows) {
            printJson(
                `ORDERITEM #${String(row.id)}`,
                row
            );
        }
    }

    // ================================================================
    // 12. ORDERBATCH STRUCTURAL LINK INVESTIGATION
    // ================================================================

    title("12. ORDERBATCH LINK INVESTIGATION");

    if (await tableExists("OrderBatch")) {
        const columns = await getTableColumns("OrderBatch");

        const interestingColumns = columns.filter((column) => {
            const name = column.name.toLowerCase();

            return (
                name.includes("order") ||
                name.includes("batch") ||
                name.includes("product") ||
                name.includes("item") ||
                name.includes("quantity")
            );
        });

        console.log(`
OrderBatch relevant columns:

${interestingColumns.map(
    (column) => column.name
).join(", ")}
`);

        const rows = await getAllRows("OrderBatch");

        console.log(
            `Total OrderBatch rows = ${rows.length}`
        );

        for (const row of rows) {
            printJson(
                `ORDERBATCH #${String(row.id)}`,
                row
            );
        }
    }

    // ================================================================
    // 13. RETURNBATCH STRUCTURAL LINK INVESTIGATION
    // ================================================================

    title("13. RETURNBATCH LINK INVESTIGATION");

    if (await tableExists("ReturnBatch")) {
        const columns = await getTableColumns("ReturnBatch");

        const interestingColumns = columns.filter((column) => {
            const name = column.name.toLowerCase();

            return (
                name.includes("order") ||
                name.includes("batch") ||
                name.includes("product") ||
                name.includes("item") ||
                name.includes("quantity")
            );
        });

        console.log(`
ReturnBatch relevant columns:

${interestingColumns.map(
    (column) => column.name
).join(", ")}
`);

        const rows = await getAllRows("ReturnBatch");

        console.log(
            `Total ReturnBatch rows = ${rows.length}`
        );

        for (const row of rows) {
            printJson(
                `RETURNBATCH #${String(row.id)}`,
                row
            );
        }
    }

    // ================================================================
    // 14. MOVEMENT #85 / BATCH #4
    // ================================================================

    title("14. MOVEMENT #85 — BATCH #4");

    const movement85 = movements.find(
        (movement) => movement.id === 85
    );

    if (!movement85) {
        console.log(
            "Movement #85 is not found for Product #2."
        );
    } else {
        printJson(
            "MOVEMENT #85",
            movement85
        );
    }

    const batch4ReferencedMovements = movements.filter(
        (movement) => {
            const comment = movement.comment ?? "";

            return (
                comment.includes("Партия №4") ||
                comment.includes("Партия #4") ||
                comment.includes("Batch #4")
            );
        }
    );

    console.log(`
Movements referencing Batch #4 = ${batch4ReferencedMovements.length}
`);

    let batch4MovementNet = 0;

    for (const movement of batch4ReferencedMovements) {
        batch4MovementNet += movement.quantity;

        console.log(
            `${movement.createdAt.toISOString()} | ` +
            `#${movement.id} | ` +
            `${movement.type} | ` +
            `${movement.quantity >= 0 ? "+" : ""}${movement.quantity} | ` +
            `${movement.comment ?? ""}`
        );
    }

    console.log(`
Batch #4 historical Movement net = ${batch4MovementNet}
`);

    // ================================================================
    // 15. FINAL FACTS ONLY
    // ================================================================

    title("15. FINAL FACTS — NO REPAIR CONCLUSION");

    const currentMovementNet = movements.reduce(
        (sum, movement) =>
            sum + movement.quantity,
        0
    );

    console.log(`
FACT 1

Product #${PRODUCT_ID}
name=${product.name}
current Product.stock=${product.stock}

--------------------------------------------------

FACT 2

Net sum of ALL current Movement records:

${currentMovementNet}

This is NOT automatically expected to equal Product.stock
until the historical starting balance and all legacy
migration rules are known.

--------------------------------------------------

FACT 3

Current Batch #4 exists:

${await tableExists("Batch")
    ? (
        await prisma.$queryRawUnsafe<
            Array<{ count: number }>
        >(
            `SELECT COUNT(*) AS count FROM "Batch" WHERE id = 4`
        )
    )[0]?.count ?? 0
    : 0}

--------------------------------------------------

FACT 4

Batch #4 historical Movement references:

${batch4ReferencedMovements.length}

Historical net:

${batch4MovementNet}

--------------------------------------------------

FACT 5

Exact +40 chronological movement chains found:

${exact40Chains}

--------------------------------------------------

NO DATABASE RECORDS WERE CHANGED.

NO REPAIR WAS EXECUTED.

NO STOCK WAS RECALCULATED.

NO BATCH WAS CREATED.

NO BATCH WAS DELETED.

NO MOVEMENT WAS CREATED OR DELETED.

NO ORDERBATCH WAS CHANGED.

NO RETURNBATCH WAS CHANGED.

🏁 FORENSIC AUDIT V14 COMPLETED
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