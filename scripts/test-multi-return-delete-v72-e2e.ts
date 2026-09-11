import assert from "assert";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

const TEST_TOKEN = Date.now().toString();

type JsonValue = any;

async function request(
    path: string,
    options: RequestInit = {}
): Promise<{
    status: number;
    data: JsonValue;
}> {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
        },
    });

    const text = await response.text();

    let data: JsonValue = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    console.log(`HTTP ${response.status}`);

    if (data !== null) {
        console.log(JSON.stringify(data, null, 2));
    }

    return {
        status: response.status,
        data,
    };
}

function expectStatus(
    actual: number,
    expected: number,
    message: string
): void {
    assert.equal(
        actual,
        expected,
        `${message}: ожидался HTTP ${expected}, получен HTTP ${actual}`
    );
}

function getProductId(data: JsonValue): number {
    const id =
        data?.id ??
        data?.product?.id ??
        data?.data?.product?.id;

    assert.equal(
        typeof id,
        "number",
        `Не удалось определить Product ID: ${JSON.stringify(data)}`
    );

    return id;
}

function getOrderId(data: JsonValue): number {
    const id =
        data?.id ??
        data?.order?.id ??
        data?.data?.order?.id;

    assert.equal(
        typeof id,
        "number",
        `Не удалось определить Order ID: ${JSON.stringify(data)}`
    );

    return id;
}

function getOrderItemId(
    data: JsonValue,
    productId: number
): number {
    const order =
        data?.order ??
        data?.data?.order ??
        data;

    const items =
        order?.items ??
        order?.order?.items ??
        order?.data?.items;

    assert.ok(
        Array.isArray(items),
        `В ответе отсутствует массив items: ${JSON.stringify(data)}`
    );

    const item = items.find(
        (candidate: JsonValue) =>
            candidate.productId === productId
    );

    assert.ok(
        item,
        `OrderItem для Product #${productId} не найден`
    );

    assert.equal(
        typeof item.id,
        "number",
        `OrderItem ID имеет неверный формат: ${JSON.stringify(item)}`
    );

    return item.id;
}

async function main(): Promise<void> {
    console.log("");
    console.log(
        "=============================================================================="
    );
    console.log(
        "V72 — TWO BATCH SALE + PARTIAL RETURN + LIFO + DELETE E2E TEST"
    );
    console.log(
        "=============================================================================="
    );
    console.log("");

    let productId: number | null = null;
    let supplierId: number | null = null;

    let supply1Id: number | null = null;
    let supply2Id: number | null = null;

    let batch1Id: number | null = null;
    let batch2Id: number | null = null;

    let orderId: number | null = null;
    let orderItemId: number | null = null;

    try {
        // =========================================================================
        // 1. CREATE TEST PRODUCT
        // =========================================================================

        console.log("1. CREATE TEST PRODUCT");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const productResponse = await request("/api/products", {
            method: "POST",
            body: JSON.stringify({
                name: `V72 Test Product ${TEST_TOKEN}`,
                unit: "шт",
                price: 300,
                cost: 0,
                barcode: `V72-${TEST_TOKEN}`,
            }),
        });

        expectStatus(
            productResponse.status,
            200,
            "Создание V72 Product"
        );

        productId = getProductId(productResponse.data);

        console.log(`Product #${productId}`);
        console.log("");

        // =========================================================================
        // 2. CREATE TEST SUPPLIER
        // =========================================================================

        console.log("2. CREATE TEST SUPPLIER");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const supplierResponse = await request("/api/suppliers", {
            method: "POST",
            body: JSON.stringify({
                name: `V72 Test Supplier ${TEST_TOKEN}`,
            }),
        });

        expectStatus(
            supplierResponse.status,
            200,
            "Создание V72 Supplier"
        );

        supplierId =
            supplierResponse.data?.id ??
            supplierResponse.data?.supplier?.id ??
            supplierResponse.data?.data?.supplier?.id;

        assert.equal(
            typeof supplierId,
            "number",
            `Не удалось определить Supplier ID: ${JSON.stringify(
                supplierResponse.data
            )}`
        );

        console.log(`Supplier #${supplierId}`);
        console.log("");

        // =========================================================================
        // 3. SUPPLY BATCH 1 — 2 UNITS
        // =========================================================================

        console.log("3. SUPPLY BATCH 1 — 2 UNITS");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const supply1Response = await request("/api/supplies", {
            method: "POST",
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productId,
                        quantity: 2,
                        cost: 100,
                        expiryDate: "2026-10-01",
                    },
                ],
            }),
        });

        expectStatus(
            supply1Response.status,
            200,
            "Создание первой партии"
        );

        supply1Id =
            supply1Response.data?.supply?.id ??
            supply1Response.data?.data?.supply?.id ??
            supply1Response.data?.id ??
            supply1Response.data?.data?.id;

        assert.equal(
            typeof supply1Id,
            "number",
            `Не удалось определить Supply #1 ID: ${JSON.stringify(
                supply1Response.data
            )}`
        );

        console.log(`Supply #${supply1Id}`);
        console.log("");

        // =========================================================================
        // 4. SUPPLY BATCH 2 — 3 UNITS
        // =========================================================================

        console.log("4. SUPPLY BATCH 2 — 3 UNITS");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const supply2Response = await request("/api/supplies", {
            method: "POST",
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productId,
                        quantity: 3,
                        cost: 120,
                        expiryDate: "2026-11-01",
                    },
                ],
            }),
        });

        expectStatus(
            supply2Response.status,
            200,
            "Создание второй партии"
        );

        supply2Id =
            supply2Response.data?.supply?.id ??
            supply2Response.data?.data?.supply?.id ??
            supply2Response.data?.id ??
            supply2Response.data?.data?.id;

        assert.equal(
            typeof supply2Id,
            "number",
            `Не удалось определить Supply #2 ID: ${JSON.stringify(
                supply2Response.data
            )}`
        );

        console.log(`Supply #${supply2Id}`);
        console.log("");

        // =========================================================================
        // 5. LOAD EXACT TEST BATCHES
        // =========================================================================

        console.log("5. LOAD EXACT TEST BATCHES");
        console.log(
            "------------------------------------------------------------------------------"
        );

        assert.notEqual(
            productId,
            null,
            "Product ID отсутствует"
        );

        const createdBatches = await prisma.batch.findMany({
            where: {
                productId,
            },
            orderBy: {
                id: "asc",
            },
        });

        assert.equal(
            createdBatches.length,
            2,
            `Для V72 Product ожидалось 2 Batch, найдено ${createdBatches.length}`
        );

        const batch1 = createdBatches.find(
            (batch) => batch.purchaseCost === 100
        );

        const batch2 = createdBatches.find(
            (batch) => batch.purchaseCost === 120
        );

        assert.ok(
            batch1,
            "Batch #1 с purchaseCost=100 не найден"
        );

        assert.ok(
            batch2,
            "Batch #2 с purchaseCost=120 не найден"
        );

        assert.equal(
            batch1.quantity,
            2,
            "Первая партия должна содержать 2 единицы"
        );

        assert.equal(
            batch2.quantity,
            3,
            "Вторая партия должна содержать 3 единицы"
        );

        batch1Id = batch1.id;
        batch2Id = batch2.id;

        console.log(
            `Batch #${batch1Id}: quantity=2, purchaseCost=100`
        );

        console.log(
            `Batch #${batch2Id}: quantity=3, purchaseCost=120`
        );

        console.log("");

        // =========================================================================
        // 6. VERIFY INITIAL STOCK
        // =========================================================================

        console.log("6. VERIFY INITIAL STOCK");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const initialProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
            });

        assert.ok(
            initialProduct,
            "V72 Product не найден"
        );

        assert.equal(
            initialProduct.stock,
            5,
            "Начальный Product.stock должен быть 5"
        );

        const initialBatchSum =
            createdBatches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        assert.equal(
            initialBatchSum,
            5,
            "Начальная сумма Batch.quantity должна быть 5"
        );

        assert.equal(
            initialProduct.stock,
            initialBatchSum,
            "Product.stock должен совпадать с SUM(Batch.quantity)"
        );

        console.log(
            `Product #${productId} stock=${initialProduct.stock}`
        );

        console.log(
            `SUM(Batch.quantity)=${initialBatchSum}`
        );

        console.log("");
        console.log("🟢 Initial stock correct");
        console.log("");

        // =========================================================================
        // 7. CREATE ORDER FOR ALL 5 UNITS
        // =========================================================================

        console.log("7. CREATE ORDER FOR ALL 5 UNITS");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const orderResponse = await request("/api/orders", {
            method: "POST",
            body: JSON.stringify({
                items: [
                    {
                        id: productId,
                        quantity: 5,
                    },
                ],
            }),
        });

        expectStatus(
            orderResponse.status,
            201,
            "Создание V72 заказа"
        );

        orderId = getOrderId(
            orderResponse.data
        );

        orderItemId = getOrderItemId(
            orderResponse.data,
            productId
        );

        const createdOrder =
            orderResponse.data?.order ??
            orderResponse.data?.data?.order ??
            orderResponse.data;

        assert.equal(
            createdOrder.total,
            1500,
            "Order.total должен быть 1500"
        );

        assert.equal(
            createdOrder.status,
            "COMPLETED",
            "Новый заказ должен иметь COMPLETED"
        );

        console.log(`Order #${orderId}`);
        console.log(`OrderItem #${orderItemId}`);
        console.log(`Order total=${createdOrder.total}`);
        console.log(`Order status=${createdOrder.status}`);
        console.log("");

        // =========================================================================
        // 8. VERIFY SALE ALLOCATION BETWEEN TWO BATCHES
        // =========================================================================

        console.log("8. VERIFY SALE ALLOCATION BETWEEN TWO BATCHES");
        console.log(
            "------------------------------------------------------------------------------"
        );

        assert.notEqual(
            orderItemId,
            null,
            "OrderItem ID отсутствует"
        );

        const orderBatches =
            await prisma.orderBatch.findMany({
                where: {
                    orderItemId,
                },
                include: {
                    batch: true,
                },
                orderBy: {
                    id: "asc",
                },
            });

        assert.equal(
            orderBatches.length,
            2,
            `Ожидалось 2 OrderBatch, найдено ${orderBatches.length}`
        );

        const saleBatch1 =
            orderBatches.find(
                (item) => item.batchId === batch1Id
            );

        const saleBatch2 =
            orderBatches.find(
                (item) => item.batchId === batch2Id
            );

        assert.ok(
            saleBatch1,
            `OrderBatch для Batch #${batch1Id} не найден`
        );

        assert.ok(
            saleBatch2,
            `OrderBatch для Batch #${batch2Id} не найден`
        );

        assert.equal(
            saleBatch1.quantity,
            2,
            "Из первой партии должно быть продано 2"
        );

        assert.equal(
            saleBatch1.purchaseCost,
            100,
            "OrderBatch первой партии должен хранить purchaseCost=100"
        );

        assert.equal(
            saleBatch2.quantity,
            3,
            "Из второй партии должно быть продано 3"
        );

        assert.equal(
            saleBatch2.purchaseCost,
            120,
            "OrderBatch второй партии должен хранить purchaseCost=120"
        );

        const totalSold =
            saleBatch1.quantity +
            saleBatch2.quantity;

        assert.equal(
            totalSold,
            5,
            "Общее количество OrderBatch должно быть 5"
        );

        console.log(
            `Batch #${batch1Id}: sold=2 @100`
        );

        console.log(
            `Batch #${batch2Id}: sold=3 @120`
        );

        console.log("");
        console.log("🟢 Two-batch sale allocation correct");
        console.log("");

        // =========================================================================
        // 9. VERIFY STOCK AFTER SALE
        // =========================================================================

        console.log("9. VERIFY STOCK AFTER SALE");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const afterSaleBatches =
            await prisma.batch.findMany({
                where: {
                    id: {
                        in: [
                            batch1Id,
                            batch2Id,
                        ],
                    },
                },
                orderBy: {
                    id: "asc",
                },
            });

        const afterSaleMap = new Map(
            afterSaleBatches.map(
                (batch) => [batch.id, batch]
            )
        );

        assert.equal(
            afterSaleMap.get(batch1Id)?.quantity,
            0,
            "После продажи Batch #1 должен быть 0"
        );

        assert.equal(
            afterSaleMap.get(batch2Id)?.quantity,
            0,
            "После продажи Batch #2 должен быть 0"
        );

        const productAfterSale =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
            });

        assert.ok(productAfterSale);

        assert.equal(
            productAfterSale.stock,
            0,
            "После продажи Product.stock должен быть 0"
        );

        console.log(
            `Batch #${batch1Id}: quantity=0`
        );

        console.log(
            `Batch #${batch2Id}: quantity=0`
        );

        console.log(
            `Product.stock=${productAfterSale.stock}`
        );

        console.log("");
        console.log("🟢 Stock after sale correct");
        console.log("");

        // =========================================================================
        // 10. PARTIAL RETURN — 2 UNITS
        // =========================================================================

        console.log("10. PARTIAL RETURN — 2 UNITS");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const returnResponse = await request(
            `/api/orders/${orderId}/return`,
            {
                method: "POST",
                body: JSON.stringify({
                    itemId: orderItemId,
                    quantity: 2,
                }),
            }
        );

        expectStatus(
            returnResponse.status,
            200,
            "Частичный возврат V72"
        );

        const returnOrder =
            returnResponse.data?.order ??
            returnResponse.data?.data?.order;

        assert.ok(
            returnOrder,
            `В ответе отсутствует Order после возврата: ${JSON.stringify(
                returnResponse.data
            )}`
        );

        assert.equal(
            returnOrder.total,
            900,
            "После возврата 2 единиц total должен быть 900"
        );

        assert.equal(
            returnOrder.status,
            "PARTIAL_RETURN",
            "После частичного возврата статус должен быть PARTIAL_RETURN"
        );

        const returnedQuantity =
            returnResponse.data?.returnedQuantity ??
            returnResponse.data?.data?.returnedQuantity;

        assert.equal(
            returnedQuantity,
            2,
            "returnedQuantity должен быть 2"
        );

        console.log(
            `Returned quantity=${returnedQuantity}`
        );

        console.log(
            `Order total=${returnOrder.total}`
        );

        console.log(
            `Order status=${returnOrder.status}`
        );

        console.log("");
        console.log("🟢 Partial return accepted");
        console.log("");

        // =========================================================================
        // 11. VERIFY LIFO RETURNBATCH
        // =========================================================================

        console.log("11. VERIFY LIFO RETURNBATCH");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const returnBatches =
            await prisma.returnBatch.findMany({
                where: {
                    orderItemId,
                },
                include: {
                    Batch: true,
                    OrderItem: true,
                },
                orderBy: {
                    id: "asc",
                },
            });

        assert.equal(
            returnBatches.length,
            1,
            `Ожидался 1 ReturnBatch, найдено ${returnBatches.length}`
        );

        const returnBatch =
            returnBatches[0];

        assert.equal(
            returnBatch.quantity,
            2,
            "ReturnBatch.quantity должен быть 2"
        );

        assert.equal(
            returnBatch.batchId,
            batch2Id,
            `LIFO возврат должен ссылаться на последнюю партию #${batch2Id}`
        );

        assert.equal(
            returnBatch.OrderItem.productId,
            productId,
            "ReturnBatch должен относиться к тестовому Product"
        );

        console.log(
            `ReturnBatch #${returnBatch.id}`
        );

        console.log(
            `Returned quantity=${returnBatch.quantity}`
        );

        console.log(
            `Returned Batch #${returnBatch.batchId}`
        );

        console.log("");
        console.log(
            `🟢 LIFO confirmed: return went to Batch #${batch2Id}`
        );
        console.log("");

        // =========================================================================
        // 12. VERIFY STOCK AFTER RETURN
        // =========================================================================

        console.log("12. VERIFY STOCK AFTER RETURN");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const afterReturnBatches =
            await prisma.batch.findMany({
                where: {
                    id: {
                        in: [
                            batch1Id,
                            batch2Id,
                        ],
                    },
                },
                orderBy: {
                    id: "asc",
                },
            });

        const afterReturnMap = new Map(
            afterReturnBatches.map(
                (batch) => [batch.id, batch]
            )
        );

        /*
         * Продажа:
         * Batch #1: 2 -> 0
         * Batch #2: 3 -> 0
         *
         * LIFO возврат 2:
         * Batch #2: 0 -> 2
         *
         * Поэтому перед DELETE:
         * Batch #1 = 0
         * Batch #2 = 2
         */

        assert.equal(
            afterReturnMap.get(batch1Id)?.quantity,
            0,
            "После возврата Batch #1 должен быть 0"
        );

        assert.equal(
            afterReturnMap.get(batch2Id)?.quantity,
            2,
            "После возврата Batch #2 должен быть 2"
        );

        const productAfterReturn =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
            });

        assert.ok(productAfterReturn);

        assert.equal(
            productAfterReturn.stock,
            2,
            "После возврата Product.stock должен быть 2"
        );

        const afterReturnBatchSum =
            afterReturnBatches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        assert.equal(
            afterReturnBatchSum,
            2,
            "После возврата SUM(Batch.quantity) должен быть 2"
        );

        assert.equal(
            productAfterReturn.stock,
            afterReturnBatchSum,
            "Product.stock должен совпадать с SUM(Batch.quantity)"
        );

        console.log(
            `Batch #${batch1Id}: quantity=0`
        );

        console.log(
            `Batch #${batch2Id}: quantity=2`
        );

        console.log(
            `Product.stock=${productAfterReturn.stock}`
        );

        console.log("");

        console.log(
            "🟢 Stock after partial return correct"
        );

        console.log("");

        // =========================================================================
        // 13. VERIFY ORDER ITEM RETURNED
        // =========================================================================

        console.log("13. VERIFY ORDER ITEM RETURNED");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const orderItemAfterReturn =
            await prisma.orderItem.findUnique({
                where: {
                    id: orderItemId,
                },
            });

        assert.ok(orderItemAfterReturn);

        assert.equal(
            orderItemAfterReturn.quantity,
            5,
            "OrderItem.quantity должен оставаться 5"
        );

        assert.equal(
            orderItemAfterReturn.returned,
            2,
            "OrderItem.returned должен быть 2"
        );

        console.log(
            `OrderItem quantity=${orderItemAfterReturn.quantity}`
        );

        console.log(
            `OrderItem returned=${orderItemAfterReturn.returned}`
        );

        console.log("");
        console.log("🟢 OrderItem return state correct");
        console.log("");

        // =========================================================================
        // 14. CAPTURE MOVEMENTS BEFORE DELETE
        // =========================================================================

        console.log("14. CAPTURE MOVEMENTS BEFORE DELETE");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const movementsBeforeDelete =
            await prisma.movement.findMany({
                where: {
                    productId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const supplyMovementsBeforeDelete =
            movementsBeforeDelete.filter(
                (movement) =>
                    movement.type === "SUPPLY"
            );

        const saleMovementsBeforeDelete =
            movementsBeforeDelete.filter(
                (movement) =>
                    movement.type === "SALE"
            );

        const returnMovementsBeforeDelete =
            movementsBeforeDelete.filter(
                (movement) =>
                    movement.type === "RETURN"
            );

        assert.equal(
            supplyMovementsBeforeDelete.length,
            2,
            "До DELETE должно быть 2 SUPPLY movement"
        );

        assert.equal(
            saleMovementsBeforeDelete.length,
            1,
            "До DELETE должен быть 1 SALE movement"
        );

        assert.equal(
            returnMovementsBeforeDelete.length,
            1,
            "До DELETE должен быть 1 клиентский RETURN movement"
        );

        const supplyNetBeforeDelete =
            supplyMovementsBeforeDelete.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        const saleNetBeforeDelete =
            saleMovementsBeforeDelete.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        const returnNetBeforeDelete =
            returnMovementsBeforeDelete.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        assert.equal(
            supplyNetBeforeDelete,
            5,
            "SUPPLY net до DELETE должен быть +5"
        );

        assert.equal(
            saleNetBeforeDelete,
            -5,
            "SALE net до DELETE должен быть -5"
        );

        assert.equal(
            returnNetBeforeDelete,
            2,
            "RETURN net до DELETE должен быть +2"
        );

        console.log(
            `SUPPLY count=${supplyMovementsBeforeDelete.length}, net=${supplyNetBeforeDelete}`
        );

        console.log(
            `SALE count=${saleMovementsBeforeDelete.length}, net=${saleNetBeforeDelete}`
        );

        console.log(
            `RETURN count=${returnMovementsBeforeDelete.length}, net=${returnNetBeforeDelete}`
        );

        console.log("");

        console.log(
            "🟢 Movements before DELETE correct"
        );

        console.log("");

        // =========================================================================
        // 15. DELETE ORDER
        // =========================================================================

        console.log("15. DELETE ORDER");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const deleteResponse = await request(
            `/api/orders/${orderId}`,
            {
                method: "DELETE",
            }
        );

        expectStatus(
            deleteResponse.status,
            200,
            "DELETE V72 заказа"
        );

        assert.equal(
            deleteResponse.data?.success,
            true,
            "DELETE должен вернуть success=true"
        );

        console.log("");
        console.log("🟢 Order DELETE succeeded");
        console.log("");

        // =========================================================================
        // 16. VERIFY ORDER HISTORY DELETED
        // =========================================================================

        console.log("16. VERIFY ORDER HISTORY DELETED");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const deletedOrder =
            await prisma.order.findUnique({
                where: {
                    id: orderId,
                },
            });

        const deletedOrderItem =
            await prisma.orderItem.findUnique({
                where: {
                    id: orderItemId,
                },
            });

        const deletedOrderBatches =
            await prisma.orderBatch.findMany({
                where: {
                    orderItemId,
                },
            });

        const deletedReturnBatches =
            await prisma.returnBatch.findMany({
                where: {
                    orderItemId,
                },
            });

        assert.equal(
            deletedOrder,
            null,
            "Order должен быть удалён"
        );

        assert.equal(
            deletedOrderItem,
            null,
            "OrderItem должен быть удалён"
        );

        assert.equal(
            deletedOrderBatches.length,
            0,
            "OrderBatch должны быть удалены"
        );

        assert.equal(
            deletedReturnBatches.length,
            0,
            "ReturnBatch должны быть удалены"
        );

        console.log(`Order #${orderId}: removed`);
        console.log("OrderItem: removed");
        console.log("OrderBatches: removed");
        console.log("ReturnBatches: removed");
        console.log("");

        console.log(
            "🟢 Order history removed"
        );

        console.log("");

        // =========================================================================
        // 17. VERIFY EXACT BATCH RESTORATION
        // =========================================================================

        console.log("17. VERIFY EXACT BATCH RESTORATION");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const restoredBatch1 =
            await prisma.batch.findUnique({
                where: {
                    id: batch1Id,
                },
            });

        const restoredBatch2 =
            await prisma.batch.findUnique({
                where: {
                    id: batch2Id,
                },
            });

        assert.ok(restoredBatch1);
        assert.ok(restoredBatch2);

        /*
         * До продажи:
         * Batch #1 = 2
         * Batch #2 = 3
         *
         * После продажи:
         * Batch #1 = 0
         * Batch #2 = 0
         *
         * Клиентский возврат 2 по LIFO:
         * Batch #1 = 0
         * Batch #2 = 2
         *
         * DELETE должен вернуть только НЕвозвращённое количество:
         *
         * Batch #1:
         * sold=2
         * returned=0
         * restore=2
         *
         * Batch #2:
         * sold=3
         * returned=2
         * restore=1
         *
         * Финал:
         * Batch #1 = 2
         * Batch #2 = 3
         */

        assert.equal(
            restoredBatch1.quantity,
            2,
            "После DELETE Batch #1 должен восстановиться до 2"
        );

        assert.equal(
            restoredBatch2.quantity,
            3,
            "После DELETE Batch #2 должен восстановиться до 3"
        );

        console.log(
            `Batch #${batch1Id}: 0 → ${restoredBatch1.quantity} (+2)`
        );

        console.log(
            `Batch #${batch2Id}: 2 → ${restoredBatch2.quantity} (+1)`
        );

        console.log("");
        console.log(
            "🟢 Exact per-batch restoration passed"
        );
        console.log("");

        // =========================================================================
        // 18. VERIFY PRODUCT STOCK AFTER DELETE
        // =========================================================================

        console.log("18. VERIFY PRODUCT STOCK AFTER DELETE");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const restoredProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
            });

        assert.ok(restoredProduct);

        const finalBatches =
            await prisma.batch.findMany({
                where: {
                    productId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const finalBatchSum =
            finalBatches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        assert.equal(
            restoredProduct.stock,
            5,
            "После DELETE Product.stock должен быть 5"
        );

        assert.equal(
            finalBatchSum,
            5,
            "После DELETE SUM(Batch.quantity) должен быть 5"
        );

        assert.equal(
            restoredProduct.stock,
            finalBatchSum,
            "Product.stock должен совпадать с SUM(Batch.quantity)"
        );

        console.log(
            `Product.stock=${restoredProduct.stock}`
        );

        console.log(
            `SUM(Batch.quantity)=${finalBatchSum}`
        );

        console.log("");

        console.log(
            "🟢 Product stock restoration passed"
        );

        console.log("");

        // =========================================================================
        // 19. VERIFY MOVEMENT RESTORATION
        // =========================================================================

        console.log("19. VERIFY MOVEMENT RESTORATION");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const movementsAfterDelete =
            await prisma.movement.findMany({
                where: {
                    productId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const supplyMovementsAfterDelete =
            movementsAfterDelete.filter(
                (movement) =>
                    movement.type === "SUPPLY"
            );

        const saleMovementsAfterDelete =
            movementsAfterDelete.filter(
                (movement) =>
                    movement.type === "SALE"
            );

        const returnMovementsAfterDelete =
            movementsAfterDelete.filter(
                (movement) =>
                    movement.type === "RETURN"
            );

        assert.equal(
            supplyMovementsAfterDelete.length,
            2,
            "После DELETE должно быть 2 SUPPLY movement"
        );

        assert.equal(
            saleMovementsAfterDelete.length,
            1,
            "После DELETE должен быть 1 SALE movement"
        );

        /*
         * RETURN movements:
         *
         * клиент вернул 2
         * DELETE восстановил ещё 3
         *
         * Итого RETURN net = +5
         */

        assert.equal(
            returnMovementsAfterDelete.length,
            3,
            "После DELETE должно быть 3 RETURN movement"
        );

        const supplyNetAfterDelete =
            supplyMovementsAfterDelete.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        const saleNetAfterDelete =
            saleMovementsAfterDelete.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        const returnNetAfterDelete =
            returnMovementsAfterDelete.reduce(
                (sum, movement) =>
                    sum + movement.quantity,
                0
            );

        assert.equal(
            supplyNetAfterDelete,
            5,
            "SUPPLY net должен быть +5"
        );

        assert.equal(
            saleNetAfterDelete,
            -5,
            "SALE net должен быть -5"
        );

        assert.equal(
            returnNetAfterDelete,
            5,
            "RETURN net должен быть +5"
        );

        const movementNet =
            supplyNetAfterDelete +
            saleNetAfterDelete +
            returnNetAfterDelete;

        assert.equal(
            movementNet,
            5,
            "Общий Movement net должен быть +5"
        );

        console.log(
            `SUPPLY count=${supplyMovementsAfterDelete.length}, net=${supplyNetAfterDelete}`
        );

        console.log(
            `SALE count=${saleMovementsAfterDelete.length}, net=${saleNetAfterDelete}`
        );

        console.log(
            `RETURN count=${returnMovementsAfterDelete.length}, net=${returnNetAfterDelete}`
        );

        console.log(
            `Movement NET=${movementNet}`
        );

        console.log("");

        console.log(
            "🟢 Movement restoration passed"
        );

        console.log("");

        // =========================================================================
        // 20. VERIFY RETURN MOVEMENTS FROM DELETE
        // =========================================================================

        console.log("20. VERIFY DELETE RETURN QUANTITIES");
        console.log(
            "------------------------------------------------------------------------------"
        );

        /*
         * До DELETE был RETURN +2 от клиента.
         *
         * DELETE должен добавить:
         * Batch #1 → +2
         * Batch #2 → +1
         *
         * Поэтому все RETURN movements:
         * +2 +2 +1 = +5
         */

        const returnMovementQuantities =
            returnMovementsAfterDelete
                .map(
                    (movement) => movement.quantity
                )
                .sort((a, b) => a - b);

        assert.deepEqual(
            returnMovementQuantities,
            [1, 2, 2],
            "RETURN movements должны иметь количества 1, 2, 2"
        );

        console.log(
            `RETURN quantities=${returnMovementQuantities.join(", ")}`
        );

        console.log("");

        console.log(
            "🟢 RETURN movement quantities are exact"
        );

        console.log("");

        // =========================================================================
        // 21. REPEATED DELETE
        // =========================================================================

        console.log("21. REPEATED DELETE");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const stockBeforeRepeatedDelete =
            restoredProduct.stock;

        const batch1BeforeRepeatedDelete =
            restoredBatch1.quantity;

        const batch2BeforeRepeatedDelete =
            restoredBatch2.quantity;

        const movementCountBeforeRepeatedDelete =
            movementsAfterDelete.length;

        const repeatedDeleteResponse =
            await request(
                `/api/orders/${orderId}`,
                {
                    method: "DELETE",
                }
            );

        expectStatus(
            repeatedDeleteResponse.status,
            404,
            "Повторный DELETE"
        );

        assert.equal(
            repeatedDeleteResponse.data?.error,
            "Заказ не найден",
            "Повторный DELETE должен вернуть 'Заказ не найден'"
        );

        const productAfterRepeatedDelete =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
            });

        const batchesAfterRepeatedDelete =
            await prisma.batch.findMany({
                where: {
                    id: {
                        in: [
                            batch1Id,
                            batch2Id,
                        ],
                    },
                },
                orderBy: {
                    id: "asc",
                },
            });

        const movementCountAfterRepeatedDelete =
            await prisma.movement.count({
                where: {
                    productId,
                },
            });

        assert.ok(productAfterRepeatedDelete);

        assert.equal(
            productAfterRepeatedDelete.stock,
            stockBeforeRepeatedDelete,
            "Повторный DELETE не должен менять Product.stock"
        );

        const repeatedBatch1 =
            batchesAfterRepeatedDelete.find(
                (batch) => batch.id === batch1Id
            );

        const repeatedBatch2 =
            batchesAfterRepeatedDelete.find(
                (batch) => batch.id === batch2Id
            );

        assert.ok(repeatedBatch1);
        assert.ok(repeatedBatch2);

        assert.equal(
            repeatedBatch1.quantity,
            batch1BeforeRepeatedDelete,
            "Повторный DELETE не должен менять Batch #1"
        );

        assert.equal(
            repeatedBatch2.quantity,
            batch2BeforeRepeatedDelete,
            "Повторный DELETE не должен менять Batch #2"
        );

        assert.equal(
            movementCountAfterRepeatedDelete,
            movementCountBeforeRepeatedDelete,
            "Повторный DELETE не должен создавать новые Movement"
        );

        console.log(
            `Repeated DELETE HTTP=${repeatedDeleteResponse.status}`
        );

        console.log(
            `Product.stock remains=${productAfterRepeatedDelete.stock}`
        );

        console.log(
            `Batch #${batch1Id} remains=${repeatedBatch1.quantity}`
        );

        console.log(
            `Batch #${batch2Id} remains=${repeatedBatch2.quantity}`
        );

        console.log(
            `Movement count remains=${movementCountAfterRepeatedDelete}`
        );

        console.log("");

        console.log(
            "🟢 Repeated DELETE produced no changes"
        );

        console.log("");

        // =========================================================================
        // 22. FINAL TEST INTEGRITY
        // =========================================================================

        console.log("22. FINAL TEST INTEGRITY");
        console.log(
            "------------------------------------------------------------------------------"
        );

        const finalProduct =
            await prisma.product.findUnique({
                where: {
                    id: productId,
                },
            });

        assert.ok(finalProduct);

        const finalProductBatches =
            await prisma.batch.findMany({
                where: {
                    productId,
                },
            });

        const finalProductBatchSum =
            finalProductBatches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        assert.equal(
            finalProduct.stock,
            5
        );

        assert.equal(
            finalProductBatchSum,
            5
        );

        assert.equal(
            finalProduct.stock,
            finalProductBatchSum
        );

        const finalOrderCheck =
            await prisma.order.findUnique({
                where: {
                    id: orderId,
                },
            });

        const finalOrderItemCheck =
            await prisma.orderItem.findUnique({
                where: {
                    id: orderItemId,
                },
            });

        const finalOrderBatchCheck =
            await prisma.orderBatch.findMany({
                where: {
                    orderItemId,
                },
            });

        const finalReturnBatchCheck =
            await prisma.returnBatch.findMany({
                where: {
                    orderItemId,
                },
            });

        assert.equal(
            finalOrderCheck,
            null
        );

        assert.equal(
            finalOrderItemCheck,
            null
        );

        assert.equal(
            finalOrderBatchCheck.length,
            0
        );

        assert.equal(
            finalReturnBatchCheck.length,
            0
        );

        console.log(
            "Order: removed"
        );

        console.log(
            "OrderItem: removed"
        );

        console.log(
            "OrderBatch: removed"
        );

        console.log(
            "ReturnBatch: removed"
        );

        console.log(
            `Product.stock=${finalProduct.stock}`
        );

        console.log(
            `SUM(Batch.quantity)=${finalProductBatchSum}`
        );

        console.log("");

        console.log(
            "🟢 Final V72 integrity check passed"
        );

        console.log("");

        // =========================================================================
        // 23. FINAL RESULT
        // =========================================================================

        console.log(
            "=============================================================================="
        );
        console.log(
            "V72 FINAL RESULT"
        );
        console.log(
            "=============================================================================="
        );
        console.log("");

        console.log(
            "🟢 V72 PASSED"
        );

        console.log("");

        console.log("Проверено:");
        console.log("");

        console.log(
            "1. Создан тестовый Product."
        );

        console.log(
            "2. Созданы две реальные Batch."
        );

        console.log(
            "3. Начальный stock = 5."
        );

        console.log(
            "4. Продажа распределена по двум партиям."
        );

        console.log(
            "5. OrderBatch сохранил фактический purchaseCost."
        );

        console.log(
            "6. Проданы все 5 единиц."
        );

        console.log(
            "7. Выполнен частичный возврат 2 единиц."
        );

        console.log(
            "8. ReturnBatch использовал LIFO."
        );

        console.log(
            "9. Возврат попал в последнюю Batch."
        );

        console.log(
            "10. Product.stock после возврата корректен."
        );

        console.log(
            "11. DELETE удалил Order и историю заказа."
        );

        console.log(
            "12. Уже возвращённые 2 единицы повторно не восстановлены."
        );

        console.log(
            "13. Batch #1 восстановлена +2."
        );

        console.log(
            "14. Batch #2 восстановлена +1."
        );

        console.log(
            "15. Финальные Batch восстановлены точно до 2 + 3."
        );

        console.log(
            "16. Product.stock восстановлен до 5."
        );

        console.log(
            "17. SUM(Batch.quantity) = Product.stock."
        );

        console.log(
            "18. RETURN movements соответствуют восстановлению."
        );

        console.log(
            "19. Повторный DELETE возвращает HTTP404."
        );

        console.log(
            "20. Повторный DELETE не меняет stock."
        );

        console.log(
            "21. Повторный DELETE не создаёт новые Movement."
        );

        console.log("");

        console.log(
            "=============================================================================="
        );
        console.log(
            "V72 TEST COMPLETED"
        );
        console.log(
            "=============================================================================="
        );
        console.log("");
    } catch (error) {
        console.error("");
        console.error(
            "🔴 V72 FAILED"
        );
        console.error("");
        console.error(error);
        console.error("");

        throw error;
    } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================

        console.log("");
        console.log(
            "=============================================================================="
        );
        console.log(
            "V72 CLEANUP"
        );
        console.log(
            "=============================================================================="
        );
        console.log("");

        try {
            if (orderItemId !== null) {
                await prisma.returnBatch.deleteMany({
                    where: {
                        orderItemId,
                    },
                });

                await prisma.orderBatch.deleteMany({
                    where: {
                        orderItemId,
                    },
                });

                await prisma.orderItem.deleteMany({
                    where: {
                        id: orderItemId,
                    },
                });
            }

            if (productId !== null) {
                await prisma.movement.deleteMany({
                    where: {
                        productId,
                    },
                });

                await prisma.batch.deleteMany({
                    where: {
                        productId,
                    },
                });

                await prisma.supplyItem.deleteMany({
                    where: {
                        productId,
                    },
                });

                await prisma.product.deleteMany({
                    where: {
                        id: productId,
                    },
                });
            }

            if (supply1Id !== null) {
                await prisma.supplyItem.deleteMany({
                    where: {
                        supplyId: supply1Id,
                    },
                });

                await prisma.supply.deleteMany({
                    where: {
                        id: supply1Id,
                    },
                });
            }

            if (supply2Id !== null) {
                await prisma.supplyItem.deleteMany({
                    where: {
                        supplyId: supply2Id,
                    },
                });

                await prisma.supply.deleteMany({
                    where: {
                        id: supply2Id,
                    },
                });
            }

            if (supplierId !== null) {
                await prisma.supplier.deleteMany({
                    where: {
                        id: supplierId,
                    },
                });
            }

            console.log(
                "🟢 V72 CLEANUP COMPLETED"
            );

            console.log("");
            console.log(
                "Test data removed."
            );

            console.log("");
        } catch (cleanupError) {
            console.error("");
            console.error(
                "🔴 V72 CLEANUP FAILED"
            );
            console.error("");
            console.error(cleanupError);
            console.error("");
        }

        await prisma.$disconnect();
    }
}

main().catch(() => {
    process.exitCode = 1;
});