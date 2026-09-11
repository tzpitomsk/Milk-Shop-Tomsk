import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";

const TEST_PRODUCT_NAME = "V65_SUPPLY_HISTORY_TEST";
const TEST_SUPPLIER_NAME = "V65_SUPPLY_HISTORY_SUPPLIER";

function assert(
    condition: unknown,
    message: string
): asserts condition {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
}

type ApiResponse = {
    status: number;
    body: any;
};

async function api(
    path: string,
    method = "GET",
    body?: unknown
): Promise<ApiResponse> {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
        },
        body:
            body === undefined
                ? undefined
                : JSON.stringify(body),
    });

    let parsed: any = null;

    try {
        parsed = await response.json();
    } catch {
        parsed = null;
    }

    return {
        status: response.status,
        body: parsed,
    };
}

function futureDate(days: number): string {
    const date = new Date();

    date.setDate(date.getDate() + days);

    const year = date.getFullYear();
    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

async function cleanup(): Promise<void> {
    console.log("CLEANUP");

    const products = await prisma.product.findMany({
        where: {
            name: TEST_PRODUCT_NAME,
        },
        select: {
            id: true,
        },
    });

    for (const product of products) {
        await prisma.$transaction(async (tx) => {
            await tx.returnBatch.deleteMany({
                where: {
                    OrderItem: {
                        productId: product.id,
                    },
                },
            });


            await tx.orderBatch.deleteMany({
                where: {
                    orderItem: {
                        productId: product.id,
                    },
                },
            });

            await tx.orderItem.deleteMany({
                where: {
                    productId: product.id,
                },
            });

            await tx.supplyItem.deleteMany({
                where: {
                    productId: product.id,
                },
            });

            await tx.movement.deleteMany({
                where: {
                    productId: product.id,
                },
            });

            await tx.batch.deleteMany({
                where: {
                    productId: product.id,
                },
            });

            await tx.product.delete({
                where: {
                    id: product.id,
                },
            });
        });


    }

    await prisma.supply.deleteMany({
        where: {
            Supplier: {
                name: TEST_SUPPLIER_NAME,
            },
        },
    });

    await prisma.supplier.deleteMany({
        where: {
            name: TEST_SUPPLIER_NAME,
        },
    });

    console.log("🟢 Old V65 test data removed");
    console.log("");
}

async function verifySupplyUnchanged(
    supplyId: number,
    supplyItemId: number,
    batchId: number,
    movementId: number,
    productId: number,
    expected: {
        supplierId: number;
        total: number;
        date: number;
        supplyItemQuantity: number;
        supplyItemCost: number;
        batchQuantity: number;
        batchPurchaseCost: number;
        batchStatus: string;
        productStock: number;
    }
): Promise<void> {
    const supply =
        await prisma.supply.findUnique({
            where: {
                id: supplyId,
            },
            include: {
                items: true,
            },
        });

    assert(
        supply,
        `Supply #${supplyId} disappeared`
    );

    assert(
        supply.supplierId ===
        expected.supplierId,
        "Supply supplierId changed"
    );

    assert(
        supply.total === expected.total,
        "Supply total changed"
    );

    assert(
        supply.date.getTime() ===
        expected.date,
        "Supply date changed"
    );

    assert(
        supply.items.length === 1,
        "SupplyItem count changed"
    );

    const supplyItem =
        supply.items[0];

    assert(
        supplyItem.id === supplyItemId,
        "SupplyItem id changed"
    );

    assert(
        supplyItem.productId === productId,
        "SupplyItem productId changed"
    );

    assert(
        supplyItem.quantity ===
        expected.supplyItemQuantity,
        "SupplyItem quantity changed"
    );

    assert(
        supplyItem.cost ===
        expected.supplyItemCost,
        "SupplyItem cost changed"
    );

    const batch =
        await prisma.batch.findUnique({
            where: {
                id: batchId,
            },
        });

    assert(
        batch,
        `Batch #${batchId} disappeared`
    );

    assert(
        batch.quantity ===
        expected.batchQuantity,
        "Batch quantity changed"
    );

    assert(
        batch.purchaseCost ===
        expected.batchPurchaseCost,
        "Batch purchaseCost changed"
    );

    assert(
        batch.status ===
        expected.batchStatus,
        "Batch status changed"
    );

    assert(
        batch.productId === productId,
        "Batch productId changed"
    );

    const product =
        await prisma.product.findUnique({
            where: {
                id: productId,
            },
        });

    assert(
        product,
        `Product #${productId} disappeared`
    );

    assert(
        product.stock ===
        expected.productStock,
        `Product.stock changed from ${expected.productStock} to ${product.stock}`
    );

    const batchSum =
        (
            await prisma.batch.findMany({
                where: {
                    productId,
                },
            })
        ).reduce(
            (sum, currentBatch) =>
                sum + currentBatch.quantity,
            0
        );

    assert(
        batchSum === expected.productStock,
        `Product.stock ${product.stock} does not equal Batch sum ${batchSum}`
    );

    const movement =
        await prisma.movement.findUnique({
            where: {
                id: movementId,
            },
        });

    assert(
        movement,
        `Movement #${movementId} disappeared`
    );

    assert(
        movement.productId === productId,
        "Movement productId changed"
    );

    assert(
        movement.type === "SUPPLY",
        "Movement type changed"
    );

    assert(
        movement.quantity === 5,
        "Movement quantity changed"
    );

    assert(
        movement.comment ===
        `Приход поставка №${supplyId}`,
        "Movement comment changed"
    );
}

async function main() {
    console.log("");
    console.log(
        "=============================================================================="
    );
    console.log("V65 SUPPLY HISTORY PROTECTION E2E TEST");
    console.log(
        "=============================================================================="
    );
    console.log("");

    // ===========================================================================
    // 0. CLEANUP OLD TEST DATA
    // ===========================================================================

    await cleanup();

    // ===========================================================================
    // 1. CREATE TEST PRODUCT
    // ===========================================================================

    console.log("1. CREATE TEST PRODUCT");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const product = await prisma.product.create({
        data: {
            name: TEST_PRODUCT_NAME,
            unit: "шт",
            price: 300,
            cost: 100,
            stock: 0,
        },
    });

    console.log(
        `Product #${product.id} created`
    );
    console.log("");

    // ===========================================================================
    // 2. CREATE TEST SUPPLIER
    // ===========================================================================

    console.log("2. CREATE TEST SUPPLIER");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const supplier = await prisma.supplier.create({
        data: {
            name: TEST_SUPPLIER_NAME,
        },
    });

    console.log(
        `Supplier #${supplier.id} created`
    );
    console.log("");

    // ===========================================================================
    // 3. CREATE SUPPLY THROUGH REAL API
    // ===========================================================================

    console.log("3. CREATE SUPPLY THROUGH API");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const supplyResponse = await api(
        "/api/supplies",
        "POST",
        {
            supplierId: supplier.id,


            items: [
                {
                    id: product.id,
                    quantity: 5,
                    cost: 100,
                    expiryDate: futureDate(30),
                },
            ],
        }


    );

    console.log(
        `HTTP ${supplyResponse.status}`
    );

    console.log(
        JSON.stringify(
            supplyResponse.body,
            null,
            2
        )
    );

    assert(
        supplyResponse.status === 200,
        `Supply creation expected HTTP 200, got ${supplyResponse.status}`
    );

    assert(
        supplyResponse.body?.success === true,
        "Supply creation must return success=true"
    );

    const supplyId = Number(
        supplyResponse.body?.supply?.id
    );

    assert(
        Number.isInteger(supplyId) &&
        supplyId > 0,
        "Created Supply id not found"
    );

    console.log(
        `Supply #${supplyId} created`
    );
    console.log("");

    // ===========================================================================
    // 4. CAPTURE INITIAL SUPPLY HISTORY STATE
    // ===========================================================================

    console.log("4. CAPTURE INITIAL SUPPLY HISTORY STATE");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const supplyBefore =
        await prisma.supply.findUnique({
            where: {
                id: supplyId,
            },
            include: {
                items: true,
            },
        });

    assert(
        supplyBefore,
        "Supply must exist after creation"
    );

    assert(
        supplyBefore.supplierId ===
        supplier.id,
        "Supply supplierId mismatch"
    );

    assert(
        supplyBefore.total === 500,
        `Supply total expected 500, got ${supplyBefore.total}`
    );

    assert(
        supplyBefore.items.length === 1,
        `Supply must contain exactly 1 SupplyItem, got ${supplyBefore.items.length}`
    );

    assert(
        supplyBefore.items[0].productId ===
        product.id,
        "SupplyItem productId mismatch"
    );

    assert(
        supplyBefore.items[0].quantity === 5,
        "SupplyItem quantity must be 5"
    );

    assert(
        supplyBefore.items[0].cost === 100,
        "SupplyItem cost must be 100"
    );

    const supplyItemId =
        supplyBefore.items[0].id;

    const expected = {
        supplierId:
            supplyBefore.supplierId,
        total:
            supplyBefore.total,
        date:
            supplyBefore.date.getTime(),
        supplyItemQuantity:
            supplyBefore.items[0].quantity,
        supplyItemCost:
            supplyBefore.items[0].cost,
        batchQuantity: 5,
        batchPurchaseCost: 100,
        batchStatus: "ACTIVE",
        productStock: 5,
    };

    console.log(
        `Supply #${supplyId} total=${supplyBefore.total}`
    );

    console.log(
        `SupplyItem #${supplyItemId} quantity=${supplyBefore.items[0].quantity}`
    );

    console.log(
        `SupplyItem #${supplyItemId} cost=${supplyBefore.items[0].cost}`
    );

    console.log("");

    // ===========================================================================
    // 5. VERIFY CREATED BATCH
    // ===========================================================================

    console.log("5. VERIFY CREATED BATCH");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const batchesBefore =
        await prisma.batch.findMany({
            where: {
                productId: product.id,
            },
            orderBy: {
                id: "asc",
            },
        });

    assert(
        batchesBefore.length === 1,
        `Expected exactly 1 test Batch, got ${batchesBefore.length}`
    );

    const batchBefore =
        batchesBefore[0];

    assert(
        batchBefore.quantity === 5,
        `Batch quantity expected 5, got ${batchBefore.quantity}`
    );

    assert(
        batchBefore.purchaseCost === 100,
        `Batch purchaseCost expected 100, got ${batchBefore.purchaseCost}`
    );

    assert(
        batchBefore.productId === product.id,
        "Batch productId mismatch"
    );

    assert(
        batchBefore.status === "ACTIVE",
        `Batch status expected ACTIVE, got ${batchBefore.status}`
    );

    const batchId =
        batchBefore.id;

    console.log(
        `Batch #${batchId} quantity=${batchBefore.quantity}`
    );

    console.log(
        `Batch #${batchId} purchaseCost=${batchBefore.purchaseCost}`
    );

    console.log(
        `Batch #${batchId} status=${batchBefore.status}`
    );

    console.log("");

    // ===========================================================================
    // 6. VERIFY PRODUCT STOCK
    // ===========================================================================

    console.log("6. VERIFY PRODUCT STOCK");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const productBefore =
        await prisma.product.findUnique({
            where: {
                id: product.id,
            },
        });

    assert(
        productBefore,
        "Product must exist"
    );

    assert(
        productBefore.stock === 5,
        `Product.stock expected 5, got ${productBefore.stock}`
    );

    const batchSumBefore =
        batchesBefore.reduce(
            (sum, batch) =>
                sum + batch.quantity,
            0
        );

    assert(
        productBefore.stock ===
        batchSumBefore,
        `Product.stock ${productBefore.stock} must equal Batch sum ${batchSumBefore}`
    );

    console.log(
        `Product.stock=${productBefore.stock}`
    );

    console.log(
        `SUM(Batch.quantity)=${batchSumBefore}`
    );

    console.log("");

    console.log(
        "🟢 Initial stock state correct"
    );

    console.log("");

    // ===========================================================================
    // 7. VERIFY SUPPLY MOVEMENT
    // ===========================================================================

    console.log("7. VERIFY SUPPLY MOVEMENT");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const movementsBefore =
        await prisma.movement.findMany({
            where: {
                productId: product.id,
            },
            orderBy: {
                id: "asc",
            },
        });

    assert(
        movementsBefore.length === 1,
        `Expected exactly 1 movement, got ${movementsBefore.length}`
    );

    const supplyMovement =
        movementsBefore[0];

    assert(
        supplyMovement.type === "SUPPLY",
        `Movement type expected SUPPLY, got ${supplyMovement.type}`
    );

    assert(
        supplyMovement.quantity === 5,
        `SUPPLY movement quantity expected 5, got ${supplyMovement.quantity}`
    );

    assert(
        supplyMovement.comment ===
        `Приход поставка №${supplyId}`,
        `Unexpected SUPPLY movement comment: ${supplyMovement.comment}`
    );

    const movementId =
        supplyMovement.id;

    console.log(
        `Movement #${movementId} type=${supplyMovement.type}`
    );

    console.log(
        `Movement quantity=${supplyMovement.quantity}`
    );

    console.log(
        `Movement comment="${supplyMovement.comment}"`
    );

    console.log("");

    // ===========================================================================
    // 8. CAPTURE GLOBAL COUNTS
    // ===========================================================================

    console.log("8. CAPTURE GLOBAL COUNTS");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const snapshot = {
        supplyCount:
            await prisma.supply.count(),


        supplyItemCount:
            await prisma.supplyItem.count(),

        batchCount:
            await prisma.batch.count(),

        movementCount:
            await prisma.movement.count(),

        productCount:
            await prisma.product.count(),

        supplierCount:
            await prisma.supplier.count(),


    };

    console.log(
        `Supply count=${snapshot.supplyCount}`
    );

    console.log(
        `SupplyItem count=${snapshot.supplyItemCount}`
    );

    console.log(
        `Batch count=${snapshot.batchCount}`
    );

    console.log(
        `Movement count=${snapshot.movementCount}`
    );

    console.log("");

    // ===========================================================================
    // 9. ATTEMPT DELETE SUPPLY
    // ===========================================================================

    console.log("9. ATTEMPT DELETE SUPPLY");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const deleteResponse =
        await api(
            `/api/supplies/${supplyId}`,
            "DELETE"
        );

    console.log(
        `HTTP ${deleteResponse.status}`
    );

    console.log(
        JSON.stringify(
            deleteResponse.body,
            null,
            2
        )
    );

    assert(
        deleteResponse.status === 404,
        `DELETE /api/supplies/${supplyId} expected HTTP 404 because [id] route does not exist, got ${deleteResponse.status}`
    );

    console.log("");
    console.log(
        "🟢 DELETE supply correctly unavailable"
    );
    console.log("");

    await verifySupplyUnchanged(
        supplyId,
        supplyItemId,
        batchId,
        movementId,
        product.id,
        expected
    );

    console.log(
        "🟢 Database unchanged after DELETE attempt"
    );

    console.log("");

    // ===========================================================================
    // 10. ATTEMPT PUT SUPPLY
    // ===========================================================================

    console.log("10. ATTEMPT PUT SUPPLY");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const putResponse =
        await api(
            `/api/supplies/${supplyId}`,
            "PUT",
            {
                supplierId: 999999,
                items: [
                    {
                        id: product.id,
                        quantity: 99,
                        cost: 999,
                        expiryDate: futureDate(60),
                    },
                ],
            }
        );

    console.log(
        `HTTP ${putResponse.status}`
    );

    console.log(
        JSON.stringify(
            putResponse.body,
            null,
            2
        )
    );

    assert(
        putResponse.status === 404,
        `PUT /api/supplies/${supplyId} expected HTTP 404 because [id] route does not exist, got ${putResponse.status}`
    );

    console.log("");
    console.log(
        "🟢 PUT supply correctly unavailable"
    );
    console.log("");

    await verifySupplyUnchanged(
        supplyId,
        supplyItemId,
        batchId,
        movementId,
        product.id,
        expected
    );

    console.log(
        "🟢 Database unchanged after PUT attempt"
    );

    console.log("");

    // ===========================================================================
    // 11. ATTEMPT PATCH SUPPLY
    // ===========================================================================

    console.log("11. ATTEMPT PATCH SUPPLY");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const patchResponse =
        await api(
            `/api/supplies/${supplyId}`,
            "PATCH",
            {
                supplierId: 999999,
                items: [
                    {
                        id: product.id,
                        quantity: 99,
                        cost: 999,
                        expiryDate: futureDate(60),
                    },
                ],
            }
        );

    console.log(
        `HTTP ${patchResponse.status}`
    );

    console.log(
        JSON.stringify(
            patchResponse.body,
            null,
            2
        )
    );

    assert(
        patchResponse.status === 404,
        `PATCH /api/supplies/${supplyId} expected HTTP 404 because [id] route does not exist, got ${patchResponse.status}`
    );

    console.log("");
    console.log(
        "🟢 PATCH supply correctly unavailable"
    );
    console.log("");

    await verifySupplyUnchanged(
        supplyId,
        supplyItemId,
        batchId,
        movementId,
        product.id,
        expected
    );

    console.log(
        "🟢 Database unchanged after PATCH attempt"
    );

    console.log("");

    // ===========================================================================
    // 12. VERIFY GLOBAL COUNTS
    // ===========================================================================

    console.log("12. VERIFY GLOBAL COUNTS");
    console.log(
        "------------------------------------------------------------------------------"
    );

    const supplyCountAfter =
        await prisma.supply.count();

    const supplyItemCountAfter =
        await prisma.supplyItem.count();

    const batchCountAfter =
        await prisma.batch.count();

    const movementCountAfter =
        await prisma.movement.count();

    const productCountAfter =
        await prisma.product.count();

    const supplierCountAfter =
        await prisma.supplier.count();

    assert(
        supplyCountAfter ===
        snapshot.supplyCount,
        `Supply count changed from ${snapshot.supplyCount} to ${supplyCountAfter}`
    );

    assert(
        supplyItemCountAfter ===
        snapshot.supplyItemCount,
        `SupplyItem count changed from ${snapshot.supplyItemCount} to ${supplyItemCountAfter}`
    );

    assert(
        batchCountAfter ===
        snapshot.batchCount,
        `Batch count changed from ${snapshot.batchCount} to ${batchCountAfter}`
    );

    assert(
        movementCountAfter ===
        snapshot.movementCount,
        `Movement count changed from ${snapshot.movementCount} to ${movementCountAfter}`
    );

    assert(
        productCountAfter ===
        snapshot.productCount,
        `Product count changed from ${snapshot.productCount} to ${productCountAfter}`
    );

    assert(
        supplierCountAfter ===
        snapshot.supplierCount,
        `Supplier count changed from ${snapshot.supplierCount} to ${supplierCountAfter}`
    );

    console.log(
        `Supply count=${supplyCountAfter}`
    );

    console.log(
        `SupplyItem count=${supplyItemCountAfter}`
    );

    console.log(
        `Batch count=${batchCountAfter}`
    );

    console.log(
        `Movement count=${movementCountAfter}`
    );

    console.log(
        `Product count=${productCountAfter}`
    );

    console.log(
        `Supplier count=${supplierCountAfter}`
    );

    console.log("");

    console.log(
        "🟢 Global database counts unchanged"
    );

    console.log("");

    // ===========================================================================
    // 13. FINAL RESULT
    // ===========================================================================

    console.log(
        "=============================================================================="
    );
    console.log("V65 RESULT");
    console.log(
        "=============================================================================="
    );
    console.log("");

    console.log(
        "🟢 Supply creation: PASSED"
    );

    console.log(
        "🟢 Supply history creation: PASSED"
    );

    console.log(
        "🟢 DELETE /api/supplies/:id → 404"
    );

    console.log(
        "🟢 PUT /api/supplies/:id → 404"
    );

    console.log(
        "🟢 PATCH /api/supplies/:id → 404"
    );

    console.log(
        "🟢 Supply history remained unchanged"
    );

    console.log(
        "🟢 Batch remained unchanged"
    );

    console.log(
        "🟢 Product.stock remained unchanged"
    );

    console.log(
        "🟢 Movement history remained unchanged"
    );

    console.log(
        "🟢 Global database counts remained unchanged"
    );

    console.log("");

    console.log(
        "V65 TEST PASSED"
    );

    console.log("");
}

main()
    .catch((error) => {
        console.error("");
        console.error(
            "🔴 V65 TEST FAILED"
        );
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await cleanup();


        await prisma.$disconnect();


    });
