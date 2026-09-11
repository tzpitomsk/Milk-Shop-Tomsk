import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function section(title: string) {
    console.log("");
    console.log("==============================================================================");
    console.log(title);
    console.log("------------------------------------------------------------------------------");
}

function fail(message: string): never {
    throw new Error(`🔴 ${message}`);
}

async function request(
    path: string,
    options?: RequestInit
): Promise<{
    status: number;
    data: any;
}> {
    const response = await fetch(`${BASE_URL}${path}`, options);

    let data: any = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    return {
        status: response.status,
        data,
    };
}

function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

async function main() {
    console.log("");
    console.log("==============================================================================");
    console.log("V44 BATCH EDIT / STOCK INTEGRITY E2E TEST");
    console.log("==============================================================================");
    console.log("");
    console.log(`BASE_URL=${BASE_URL}`);
    console.log("");
    console.log("TEST PURPOSE:");
    console.log("");
    console.log("Batch quantity must not be editable through PUT.");
    console.log("Batch expiryDate may be edited.");
    console.log("Batch status must be recalculated from quantity and expiryDate.");
    console.log("Product.stock must remain equal to SUM(Batch.quantity).");
    console.log("Editing a batch must not create Movement records.");
    console.log("Invalid requests must be rejected without modifying the database.");
    console.log("");

    const timestamp = Date.now();

    let productId: number | null = null;
    let supplierId: number | null = null;
    let supplyId: number | null = null;
    let batchId: number | null = null;

    try {
        // =========================================================================
        // 1. CREATE TEST PRODUCT
        // =========================================================================

        section("1. CREATE TEST PRODUCT");

        const createProductResponse = await request("/api/products", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: `V44_INTEGRATION_TEST Партия ${timestamp}`,
                unit: "шт",
                price: 300,
                cost: 100,
                barcode: `V44-${timestamp}`,
            }),
        });

        console.log("POST /api/products");
        console.log(`HTTP ${createProductResponse.status}`);
        console.log(
            JSON.stringify(createProductResponse.data, null, 2)
        );

        if (createProductResponse.status !== 200) {
            fail("Не удалось создать тестовый Product");
        }

        productId = Number(createProductResponse.data?.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            fail("Product имеет некорректный id");
        }

        if (createProductResponse.data?.stock !== 0) {
            fail("Новый Product должен иметь stock=0");
        }

        console.log(`Created Product #${productId}`);
        console.log("🟢 Product created");

        // =========================================================================
        // 2. CREATE TEST SUPPLIER
        // =========================================================================

        section("2. CREATE TEST SUPPLIER");

        const createSupplierResponse = await request("/api/suppliers", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: `V44_INTEGRATION_TEST Supplier ${timestamp}`,
            }),
        });

        console.log("POST /api/suppliers");
        console.log(`HTTP ${createSupplierResponse.status}`);
        console.log(
            JSON.stringify(createSupplierResponse.data, null, 2)
        );

        if (createSupplierResponse.status !== 200) {
            fail("Не удалось создать тестового Supplier");
        }

        supplierId = Number(createSupplierResponse.data?.id);

        if (!Number.isInteger(supplierId) || supplierId <= 0) {
            fail("Supplier имеет некорректный id");
        }

        console.log(`Created Supplier #${supplierId}`);
        console.log("🟢 Supplier created");

        // =========================================================================
        // 3. CREATE SUPPLY
        // =========================================================================

        section("3. CREATE TEST SUPPLY");

        const originalExpiryDate = "2026-12-31";

        const createSupplyResponse = await request("/api/supplies", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productId,
                        quantity: 5,
                        cost: 100,
                        expiryDate: originalExpiryDate,
                    },
                ],
            }),
        });

        console.log("POST /api/supplies");
        console.log(`HTTP ${createSupplyResponse.status}`);
        console.log(
            JSON.stringify(createSupplyResponse.data, null, 2)
        );

        if (createSupplyResponse.status !== 200) {
            fail("Не удалось создать тестовую Supply");
        }

        supplyId = Number(createSupplyResponse.data?.supply?.id);

        if (!Number.isInteger(supplyId) || supplyId <= 0) {
            fail("Supply имеет некорректный id");
        }

        console.log(`Created Supply #${supplyId}`);
        console.log("🟢 Supply created");

        // =========================================================================
        // 4. LOAD INITIAL BATCH
        // =========================================================================

        section("4. LOAD INITIAL BATCH");

        const initialBatches = await prisma.batch.findMany({
            where: {
                productId,
            },
            orderBy: {
                id: "asc",
            },
        });

        if (initialBatches.length !== 1) {
            fail(
                `Ожидалась ровно 1 тестовая Batch, найдено ${initialBatches.length}`
            );
        }

        const initialBatch = initialBatches[0];

        batchId = initialBatch.id;

        console.log(
            `Batch #${initialBatch.id} | ` +
            `quantity=${initialBatch.quantity} | ` +
            `purchaseCost=${initialBatch.purchaseCost} | ` +
            `expiry=${initialBatch.expiryDate.toISOString()} | ` +
            `expiryLocal=${formatLocalDate(initialBatch.expiryDate)} | ` +
            `status=${initialBatch.status}`
        );

        if (initialBatch.quantity !== 5) {
            fail(
                `Initial Batch quantity должен быть 5, получено ${initialBatch.quantity}`
            );
        }

        if (initialBatch.purchaseCost !== 100) {
            fail(
                `Initial Batch purchaseCost должен быть 100, получено ${initialBatch.purchaseCost}`
            );
        }

        if (formatLocalDate(initialBatch.expiryDate) !== originalExpiryDate) {
            fail(
                `Initial Batch expiryDate должен быть ${originalExpiryDate}, ` +
                `получено ${formatLocalDate(initialBatch.expiryDate)}`
            );
        }

        if (initialBatch.status !== "ACTIVE") {
            fail(
                `Initial Batch должен иметь status=ACTIVE, получено ${initialBatch.status}`
            );
        }

        console.log("🟢 Initial Batch is correct");

        // =========================================================================
        // 5. VERIFY INITIAL STOCK
        // =========================================================================

        section("5. VERIFY INITIAL STOCK");

        const initialProduct = await prisma.product.findUnique({
            where: {
                id: productId,
            },
            include: {
                batches: true,
                movements: true,
            },
        });

        if (!initialProduct) {
            fail("Тестовый Product не найден");
        }

        const initialBatchTotal = initialProduct.batches.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        console.log(
            `Product #${productId} | stock=${initialProduct.stock} | ` +
            `SUM(Batch.quantity)=${initialBatchTotal}`
        );

        if (initialProduct.stock !== 5) {
            fail(
                `Initial Product.stock должен быть 5, получено ${initialProduct.stock}`
            );
        }

        if (initialProduct.stock !== initialBatchTotal) {
            fail(
                "Initial Product.stock != SUM(Batch.quantity)"
            );
        }

        const initialMovementCount =
            initialProduct.movements.length;

        console.log(
            `Initial movement count=${initialMovementCount}`
        );

        console.log("🟢 Initial stock invariant passed");

        // =========================================================================
        // 6. GET BATCH THROUGH API
        // =========================================================================

        section("6. GET BATCH THROUGH API");

        const getBatchResponse = await request(
            `/api/batches/${batchId}`
        );

        console.log(`GET /api/batches/${batchId}`);
        console.log(`HTTP ${getBatchResponse.status}`);
        console.log(
            JSON.stringify(getBatchResponse.data, null, 2)
        );

        if (getBatchResponse.status !== 200) {
            fail("GET Batch должен вернуть HTTP 200");
        }

        const apiBatch = getBatchResponse.data;

        if (!apiBatch || apiBatch.id !== batchId) {
            fail("GET Batch вернул неправильную Batch");
        }

        if (apiBatch.quantity !== 5) {
            fail(
                `GET Batch quantity должен быть 5, получено ${apiBatch.quantity}`
            );
        }

        if (apiBatch.purchaseCost !== 100) {
            fail(
                `GET Batch purchaseCost должен быть 100, получено ${apiBatch.purchaseCost}`
            );
        }

        console.log("🟢 GET Batch passed");

        // =========================================================================
        // 7. EDIT EXPIRY DATE
        // =========================================================================

        section("7. EDIT EXPIRY DATE");

        const newExpiryDate = "2027-01-31";

        const editExpiryResponse = await request(
            `/api/batches/${batchId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    quantity: 5,
                    expiryDate: newExpiryDate,
                }),

            }
        );

        console.log(
            `PUT /api/batches/${batchId} expiryDate=${newExpiryDate}`
        );

        console.log(`HTTP ${editExpiryResponse.status}`);
        console.log(
            JSON.stringify(editExpiryResponse.data, null, 2)
        );

        if (editExpiryResponse.status !== 200) {
            fail(
                `Изменение expiryDate должно вернуть HTTP 200, получено ${editExpiryResponse.status}`
            );
        }

        console.log("🟢 Expiry date edit accepted");

        // =========================================================================
        // 8. VERIFY EXPIRY EDIT DID NOT CHANGE QUANTITY/COST/STOCK
        // =========================================================================

        section("8. VERIFY EXPIRY EDIT INTEGRITY");

        const afterExpiryBatch = await prisma.batch.findUnique({
            where: {
                id: batchId,
            },
        });

        if (!afterExpiryBatch) {
            fail("Batch исчезла после редактирования expiryDate");
        }

        console.log(
            `Batch #${afterExpiryBatch.id} | ` +
            `quantity=${afterExpiryBatch.quantity} | ` +
            `purchaseCost=${afterExpiryBatch.purchaseCost} | ` +
            `expiryLocal=${formatLocalDate(afterExpiryBatch.expiryDate)} | ` +
            `status=${afterExpiryBatch.status}`
        );

        if (afterExpiryBatch.quantity !== 5) {
            fail(
                `После изменения expiryDate quantity должна остаться 5, ` +
                `получено ${afterExpiryBatch.quantity}`
            );
        }

        if (afterExpiryBatch.purchaseCost !== 100) {
            fail(
                `После изменения expiryDate purchaseCost должен остаться 100, ` +
                `получено ${afterExpiryBatch.purchaseCost}`
            );
        }

        if (formatLocalDate(afterExpiryBatch.expiryDate) !== newExpiryDate) {
            fail(
                `expiryDate должен быть ${newExpiryDate}, ` +
                `получено ${formatLocalDate(afterExpiryBatch.expiryDate)}`
            );
        }

        if (afterExpiryBatch.status !== "ACTIVE") {
            fail(
                `Batch с будущей датой и quantity=5 должен быть ACTIVE, ` +
                `получено ${afterExpiryBatch.status}`
            );
        }

        const productAfterExpiryEdit =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!productAfterExpiryEdit) {
            fail("Product исчез после редактирования Batch");
        }

        const stockAfterExpiryEdit =
            productAfterExpiryEdit.batches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        console.log(
            `Product.stock=${productAfterExpiryEdit.stock}`
        );

        console.log(
            `SUM(Batch.quantity)=${stockAfterExpiryEdit}`
        );

        if (productAfterExpiryEdit.stock !== 5) {
            fail(
                `Product.stock после expiry edit должен быть 5, ` +
                `получено ${productAfterExpiryEdit.stock}`
            );
        }

        if (
            productAfterExpiryEdit.stock !==
            stockAfterExpiryEdit
        ) {
            fail(
                "Product.stock после expiry edit не равен SUM(Batch.quantity)"
            );
        }

        if (
            productAfterExpiryEdit.movements.length !==
            initialMovementCount
        ) {
            fail(
                "Редактирование Batch не должно создавать Movement"
            );
        }

        console.log("🟢 Expiry edit integrity passed");

        // =========================================================================
        // 9. ATTEMPT TO CHANGE QUANTITY
        // =========================================================================

        section("9. ATTEMPT TO CHANGE QUANTITY");

        const quantityChangeResponse = await request(
            `/api/batches/${batchId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    quantity: 3,
                    expiryDate: newExpiryDate,
                }),
            }
        );

        console.log(
            `PUT /api/batches/${batchId} quantity=3`
        );

        console.log(`HTTP ${quantityChangeResponse.status}`);
        console.log(
            JSON.stringify(quantityChangeResponse.data, null, 2)
        );

        if (quantityChangeResponse.status !== 400) {
            fail(
                `Изменение quantity через PUT должно вернуть HTTP 400, ` +
                `получено ${quantityChangeResponse.status}`
            );
        }

        console.log("🟢 Quantity change correctly rejected");

        // =========================================================================
        // 10. VERIFY QUANTITY WAS NOT CHANGED
        // =========================================================================

        section("10. VERIFY QUANTITY REMAINED UNCHANGED");

        const afterRejectedQuantityBatch =
            await prisma.batch.findUnique({
                where: {
                    id: batchId,
                },
            });

        if (!afterRejectedQuantityBatch) {
            fail("Batch исчезла после rejected quantity update");
        }

        console.log(
            `Batch #${batchId} quantity=${afterRejectedQuantityBatch.quantity}`
        );

        if (afterRejectedQuantityBatch.quantity !== 5) {
            fail(
                `После rejected quantity update quantity должна быть 5, ` +
                `получено ${afterRejectedQuantityBatch.quantity}`
            );
        }

        const productAfterRejectedQuantity =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!productAfterRejectedQuantity) {
            fail("Product исчез после rejected quantity update");
        }

        const stockAfterRejectedQuantity =
            productAfterRejectedQuantity.batches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        if (productAfterRejectedQuantity.stock !== 5) {
            fail(
                `Product.stock после rejected quantity update должен быть 5, ` +
                `получено ${productAfterRejectedQuantity.stock}`
            );
        }

        if (
            productAfterRejectedQuantity.stock !==
            stockAfterRejectedQuantity
        ) {
            fail(
                "Product.stock после rejected quantity update != SUM(Batch.quantity)"
            );
        }

        if (
            productAfterRejectedQuantity.movements.length !==
            initialMovementCount
        ) {
            fail(
                "Rejected quantity update не должен создавать Movement"
            );
        }

        console.log("🟢 Quantity remained unchanged");

        // =========================================================================
        // 11. CHANGE TO EXPIRED DATE
        // =========================================================================

        section("11. CHANGE EXPIRY DATE TO PAST");

        const expiredDate = "2020-01-01";

        const expireBatchResponse = await request(
            `/api/batches/${batchId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    quantity: 5,
                    expiryDate: expiredDate,
                }),
            }
        );

        console.log(
            `PUT /api/batches/${batchId} expiryDate=${expiredDate}`
        );

        console.log(`HTTP ${expireBatchResponse.status}`);
        console.log(
            JSON.stringify(expireBatchResponse.data, null, 2)
        );

        if (expireBatchResponse.status !== 200) {
            fail(
                `Изменение expiryDate на прошлую дату должно вернуть HTTP 200, ` +
                `получено ${expireBatchResponse.status}`
            );
        }

        // =========================================================================
        // 12. VERIFY EXPIRED STATUS
        // =========================================================================

        section("12. VERIFY EXPIRED STATUS");

        const expiredBatch = await prisma.batch.findUnique({
            where: {
                id: batchId,
            },
        });

        if (!expiredBatch) {
            fail("Batch исчезла после установки просроченной даты");
        }

        console.log(
            `Batch #${expiredBatch.id} | ` +
            `quantity=${expiredBatch.quantity} | ` +
            `expiryLocal=${formatLocalDate(expiredBatch.expiryDate)} | ` +
            `status=${expiredBatch.status}`
        );

        if (expiredBatch.quantity !== 5) {
            fail(
                `Просроченная Batch должна сохранить quantity=5, ` +
                `получено ${expiredBatch.quantity}`
            );
        }

        if (formatLocalDate(expiredBatch.expiryDate) !== expiredDate) {
            fail(
                `expiryDate должен быть ${expiredDate}, ` +
                `получено ${formatLocalDate(expiredBatch.expiryDate)}`
            );
        }

        if (expiredBatch.status !== "EXPIRED") {
            fail(
                `Просроченная положительная Batch должна иметь status=EXPIRED, ` +
                `получено ${expiredBatch.status}`
            );
        }

        console.log("🟢 EXPIRED status recalculated correctly");

        // =========================================================================
        // 13. VERIFY STOCK AFTER EXPIRATION
        // =========================================================================

        section("13. VERIFY STOCK AFTER EXPIRATION");

        const productAfterExpiration =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!productAfterExpiration) {
            fail("Product не найден после expiration edit");
        }

        const batchTotalAfterExpiration =
            productAfterExpiration.batches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        console.log(
            `Product.stock=${productAfterExpiration.stock}`
        );

        console.log(
            `SUM(Batch.quantity)=${batchTotalAfterExpiration}`
        );

        console.log(
            `Movement count=${productAfterExpiration.movements.length}`
        );

        if (productAfterExpiration.stock !== 5) {
            fail(
                `Product.stock после expiration должен быть 5, ` +
                `получено ${productAfterExpiration.stock}`
            );
        }

        if (
            productAfterExpiration.stock !==
            batchTotalAfterExpiration
        ) {
            fail(
                "Product.stock после expiration != SUM(Batch.quantity)"
            );
        }

        if (
            productAfterExpiration.movements.length !==
            initialMovementCount
        ) {
            fail(
                "Изменение статуса Batch через PUT не должно создавать Movement"
            );
        }

        console.log("🟢 Stock invariant after expiration passed");

        // =========================================================================
        // 14. INVALID BATCH ID
        // =========================================================================

        section("14. INVALID BATCH ID");

        const invalidIdResponse = await request(
            "/api/batches/not-a-number",
            {
                method: "GET",
            }
        );

        console.log("GET /api/batches/not-a-number");
        console.log(`HTTP ${invalidIdResponse.status}`);
        console.log(
            JSON.stringify(invalidIdResponse.data, null, 2)
        );

        if (invalidIdResponse.status !== 400) {
            fail(
                `Некорректный Batch id должен вернуть HTTP 400, ` +
                `получено ${invalidIdResponse.status}`
            );
        }

        console.log("🟢 Invalid Batch id rejected");

        // =========================================================================
        // 15. UNKNOWN BATCH
        // =========================================================================

        section("15. UNKNOWN BATCH");

        const unknownBatchResponse = await request(
            "/api/batches/999999999",
            {
                method: "GET",
            }
        );

        console.log("GET /api/batches/999999999");
        console.log(`HTTP ${unknownBatchResponse.status}`);
        console.log(
            JSON.stringify(unknownBatchResponse.data, null, 2)
        );

        if (unknownBatchResponse.status !== 404) {
            fail(
                `Несуществующая Batch должна вернуть HTTP 404, ` +
                `получено ${unknownBatchResponse.status}`
            );
        }

        console.log("🟢 Unknown Batch rejected");

        // =========================================================================
        // 16. INVALID EXPIRY DATE
        // =========================================================================

        section("16. INVALID EXPIRY DATE");

        const beforeInvalidDateBatch =
            await prisma.batch.findUnique({
                where: {
                    id: batchId,
                },
            });

        const beforeInvalidDateProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!beforeInvalidDateBatch || !beforeInvalidDateProduct) {
            fail("Не удалось получить состояние перед invalid date test");
        }

        const invalidDateResponse = await request(
            `/api/batches/${batchId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    quantity: 5,
                    expiryDate: "NOT-A-DATE",
                }),
            }
        );

        console.log(
            `PUT /api/batches/${batchId} expiryDate=NOT-A-DATE`
        );

        console.log(`HTTP ${invalidDateResponse.status}`);
        console.log(
            JSON.stringify(invalidDateResponse.data, null, 2)
        );

        if (invalidDateResponse.status !== 400) {
            fail(
                `Некорректная expiryDate должна вернуть HTTP 400, ` +
                `получено ${invalidDateResponse.status}`
            );
        }

        const afterInvalidDateBatch =
            await prisma.batch.findUnique({
                where: {
                    id: batchId,
                },
            });

        const afterInvalidDateProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!afterInvalidDateBatch || !afterInvalidDateProduct) {
            fail("Не удалось получить состояние после invalid date test");
        }

        if (
            afterInvalidDateBatch.quantity !==
            beforeInvalidDateBatch.quantity
        ) {
            fail(
                "Invalid expiryDate не должна изменять quantity"
            );
        }

        if (
            afterInvalidDateBatch.purchaseCost !==
            beforeInvalidDateBatch.purchaseCost
        ) {
            fail(
                "Invalid expiryDate не должна изменять purchaseCost"
            );
        }

        if (
            afterInvalidDateBatch.expiryDate.getTime() !==
            beforeInvalidDateBatch.expiryDate.getTime()
        ) {
            fail(
                "Invalid expiryDate не должна изменять существующую expiryDate"
            );
        }

        if (
            afterInvalidDateBatch.status !==
            beforeInvalidDateBatch.status
        ) {
            fail(
                "Invalid expiryDate не должна изменять status"
            );
        }

        if (
            afterInvalidDateProduct.stock !==
            beforeInvalidDateProduct.stock
        ) {
            fail(
                "Invalid expiryDate не должна изменять Product.stock"
            );
        }

        if (
            afterInvalidDateProduct.movements.length !==
            beforeInvalidDateProduct.movements.length
        ) {
            fail(
                "Invalid expiryDate не должна создавать Movement"
            );
        }

        console.log("🟢 Invalid expiryDate rejected without mutation");

        // =========================================================================
        // 17. INVALID QUANTITY TYPE
        // =========================================================================

        section("17. INVALID QUANTITY TYPE");

        const beforeInvalidQuantityProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!beforeInvalidQuantityProduct) {
            fail("Product не найден перед invalid quantity test");
        }

        const invalidQuantityResponse = await request(
            `/api/batches/${batchId}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    quantity: "five",
                    expiryDate: expiredDate,
                }),
            }
        );

        console.log(
            `PUT /api/batches/${batchId} quantity="five"`
        );

        console.log(`HTTP ${invalidQuantityResponse.status}`);
        console.log(
            JSON.stringify(invalidQuantityResponse.data, null, 2)
        );

        if (invalidQuantityResponse.status !== 400) {
            fail(
                `Некорректный quantity должен вернуть HTTP 400, ` +
                `получено ${invalidQuantityResponse.status}`
            );
        }

        const afterInvalidQuantityProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
                include: {
                    batches: true,
                    movements: true,
                },
            });

        if (!afterInvalidQuantityProduct) {
            fail("Product не найден после invalid quantity test");
        }

        if (
            afterInvalidQuantityProduct.stock !==
            beforeInvalidQuantityProduct.stock
        ) {
            fail(
                "Invalid quantity не должна изменять Product.stock"
            );
        }

        if (
            afterInvalidQuantityProduct.movements.length !==
            beforeInvalidQuantityProduct.movements.length
        ) {
            fail(
                "Invalid quantity не должна создавать Movement"
            );
        }

        console.log("🟢 Invalid quantity rejected without mutation");

        // =========================================================================
        // 18. FINAL INTEGRITY
        // =========================================================================

        section("18. FINAL BATCH / STOCK INTEGRITY");

        const finalBatch = await prisma.batch.findUnique({
            where: {
                id: batchId,
            },
        });

        const finalProduct = await prisma.product.findUnique({
            where: {
                id: productId,
            },
            include: {
                batches: true,
                movements: true,
                supplyItems: true,
            },
        });

        if (!finalBatch) {
            fail("Final Batch не найдена");
        }

        if (!finalProduct) {
            fail("Final Product не найден");
        }

        const finalBatchTotal = finalProduct.batches.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        const finalSupplyQuantity =
            finalProduct.supplyItems.reduce(
                (sum, item) => sum + item.quantity,
                0
            );

        const finalSupplyMovementQuantity =
            finalProduct.movements
                .filter((movement) => movement.type === "SUPPLY")
                .reduce(
                    (sum, movement) => sum + movement.quantity,
                    0
                );

        console.log(
            `Batch #${finalBatch.id} | ` +
            `quantity=${finalBatch.quantity} | ` +
            `purchaseCost=${finalBatch.purchaseCost} | ` +
            `expiryLocal=${formatLocalDate(finalBatch.expiryDate)} | ` +
            `status=${finalBatch.status}`
        );

        console.log("");
        console.log(`Product.stock=${finalProduct.stock}`);
        console.log(`SUM(Batch.quantity)=${finalBatchTotal}`);
        console.log(`SUM(SupplyItem.quantity)=${finalSupplyQuantity}`);
        console.log(
            `SUM(SUPPLY Movement.quantity)=${finalSupplyMovementQuantity}`
        );
        console.log(
            `Movement count=${finalProduct.movements.length}`
        );

        if (finalBatch.quantity !== 5) {
            fail(
                `Final Batch quantity должен быть 5, получено ${finalBatch.quantity}`
            );
        }

        if (finalBatch.purchaseCost !== 100) {
            fail(
                `Final Batch purchaseCost должен быть 100, получено ${finalBatch.purchaseCost}`
            );
        }

        if (finalBatch.status !== "EXPIRED") {
            fail(
                `Final Batch должна быть EXPIRED, получено ${finalBatch.status}`
            );
        }

        if (finalProduct.stock !== 5) {
            fail(
                `Final Product.stock должен быть 5, получено ${finalProduct.stock}`
            );
        }

        if (finalProduct.stock !== finalBatchTotal) {
            fail(
                "Final Product.stock != SUM(Batch.quantity)"
            );
        }

        if (finalProduct.stock !== finalSupplyQuantity) {
            fail(
                "Final Product.stock != SUM(SupplyItem.quantity)"
            );
        }

        if (
            finalProduct.stock !==
            finalSupplyMovementQuantity
        ) {
            fail(
                "Final Product.stock != SUM(SUPPLY Movement.quantity)"
            );
        }

        if (finalProduct.movements.length !== initialMovementCount) {
            fail(
                "Batch PUT operations не должны создавать Movement"
            );
        }

        console.log("");
        console.log("🟢 FINAL BATCH INTEGRITY PASSED");
        console.log("🟢 FINAL STOCK INVARIANT PASSED");
        console.log("🟢 NO EXTRA MOVEMENTS CREATED");

        // =========================================================================
        // 19. FINAL RESULT
        // =========================================================================

        console.log("");
        console.log("==============================================================================");
        console.log("V44 FINAL RESULT");
        console.log("==============================================================================");
        console.log("");
        console.log("🟢 V44 PASSED");
        console.log("");
        console.log("Verified:");
        console.log("");
        console.log("🟢 Product creation");
        console.log("🟢 Supplier creation");
        console.log("🟢 Supply creation");
        console.log("🟢 Batch creation");
        console.log("🟢 GET Batch");
        console.log("🟢 Expiry date editing");
        console.log("🟢 Quantity cannot be edited through PUT");
        console.log("🟢 Purchase cost cannot be changed");
        console.log("🟢 Product.stock remains correct");
        console.log("🟢 Batch status recalculation");
        console.log("🟢 Expired status");
        console.log("🟢 No Movement on Batch edit");
        console.log("🟢 Invalid Batch id rejected");
        console.log("🟢 Unknown Batch rejected");
        console.log("🟢 Invalid expiry date rejected");
        console.log("🟢 Invalid quantity rejected");
        console.log("🟢 Invalid requests do not mutate data");
        console.log("🟢 Final stock invariant");
        console.log("🟢 Final batch integrity");
        console.log("");
        console.log("==============================================================================");
        console.log("V44 COMPLETED");
        console.log("==============================================================================");
    } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================

        console.log("");
        console.log("==============================================================================");
        console.log("V44 CLEANUP");
        console.log("==============================================================================");
        console.log("");

        if (productId !== null) {
            const testOrderItems = await prisma.orderItem.findMany({
                where: {
                    productId,
                },
                select: {
                    id: true,
                },
            });

            if (testOrderItems.length > 0) {
                const orderItemIds = testOrderItems.map(
                    (item) => item.id
                );

                const deletedReturnBatches =
                    await prisma.returnBatch.deleteMany({
                        where: {
                            orderItemId: {
                                in: orderItemIds,
                            },
                        },
                    });

                console.log(
                    `Deleted return batches=${deletedReturnBatches.count}`
                );

                const deletedOrderBatches =
                    await prisma.orderBatch.deleteMany({
                        where: {
                            orderItemId: {
                                in: orderItemIds,
                            },
                        },
                    });

                console.log(
                    `Deleted order batches=${deletedOrderBatches.count}`
                );

                const deletedOrderItems =
                    await prisma.orderItem.deleteMany({
                        where: {
                            id: {
                                in: orderItemIds,
                            },
                        },
                    });

                console.log(
                    `Deleted order items=${deletedOrderItems.count}`
                );
            } else {
                console.log("Deleted return batches=0");
                console.log("Deleted order batches=0");
                console.log("Deleted order items=0");
            }

            const deletedMovements =
                await prisma.movement.deleteMany({
                    where: {
                        productId,
                    },
                });

            console.log(
                `Deleted movements=${deletedMovements.count}`
            );

            const deletedSupplyItems =
                await prisma.supplyItem.deleteMany({
                    where: {
                        productId,
                    },
                });

            console.log(
                `Deleted supply items=${deletedSupplyItems.count}`
            );

            const deletedBatches =
                await prisma.batch.deleteMany({
                    where: {
                        productId,
                    },
                });

            console.log(
                `Deleted batches=${deletedBatches.count}`
            );

            const deletedProduct =
                await prisma.product.deleteMany({
                    where: {
                        id: productId,
                    },
                });

            console.log(
                `Deleted products=${deletedProduct.count}`
            );
        }

        if (supplyId !== null) {
            const deletedSupply =
                await prisma.supply.deleteMany({
                    where: {
                        id: supplyId,
                    },
                });

            console.log(
                `Deleted supplies=${deletedSupply.count}`
            );
        }

        if (supplierId !== null) {
            const deletedSupplier =
                await prisma.supplier.deleteMany({
                    where: {
                        id: supplierId,
                    },
                });

            console.log(
                `Deleted suppliers=${deletedSupplier.count}`
            );
        }

        console.log("");
        console.log("🟢 CLEANUP COMPLETED");
        console.log("");
    }
}

main()
    .catch((error) => {
        console.error("");
        console.error("🔴 V44 TEST FAILED");
        console.error("");
        console.error(error);
        console.error("");
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });