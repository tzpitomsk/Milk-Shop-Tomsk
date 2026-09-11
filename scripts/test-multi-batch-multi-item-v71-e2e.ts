import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";
const TEST_TOKEN = `${Date.now()}`;

const PRODUCT_A_NAME = `V71_PRODUCT_A_${TEST_TOKEN}`;
const PRODUCT_B_NAME = `V71_PRODUCT_B_${TEST_TOKEN}`;
const SUPPLIER_NAME = `V71_TEST_SUPPLIER_${TEST_TOKEN}`;

let productAId: number | null = null;
let productBId: number | null = null;
let supplierId: number | null = null;
let supplyA1Id: number | null = null;
let supplyA2Id: number | null = null;
let supplyB1Id: number | null = null;
let supplyB2Id: number | null = null;
let orderId: number | null = null;

async function api(
    path: string,
    options: RequestInit = {}
): Promise<{
    status: number;
    data: any;
}> {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
        },
    });

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

function section(title: string) {
    console.log("");
    console.log(
        "=============================================================================="
    );
    console.log(title);
    console.log(
        "=============================================================================="
    );
}

async function cleanup() {
    section("CLEANUP");

    if (orderId !== null) {
        const result = await api(`/api/orders/${orderId}`, {
            method: "DELETE",
        });

        console.log(
            `Cleanup DELETE /api/orders/${orderId}: HTTP ${result.status}`
        );
    }

    const supplyIds = [
        supplyA1Id,
        supplyA2Id,
        supplyB1Id,
        supplyB2Id,
    ].filter((id): id is number => id !== null);

    if (supplyIds.length > 0) {
        await prisma.supplyItem.deleteMany({
            where: {
                supplyId: {
                    in: supplyIds,
                },
            },
        });

        await prisma.supply.deleteMany({
            where: {
                id: {
                    in: supplyIds,
                },
            },
        });
    }

    const productIds = [
        productAId,
        productBId,
    ].filter((id): id is number => id !== null);

    if (productIds.length > 0) {
        await prisma.movement.deleteMany({
            where: {
                productId: {
                    in: productIds,
                },
            },
        });

        await prisma.batch.deleteMany({
            where: {
                productId: {
                    in: productIds,
                },
            },
        });

        await prisma.product.deleteMany({
            where: {
                id: {
                    in: productIds,
                },
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

    console.log("🟢 CLEANUP FINISHED");
}

async function main() {
    section("V71 MULTI-BATCH MULTI-ITEM E2E TEST");

    console.log("");
    console.log("STRICTLY ISOLATED TEST");
    console.log(`BASE_URL=${BASE_URL}`);
    console.log(`TEST_TOKEN=${TEST_TOKEN}`);
    console.log("");
    console.log("Сценарий:");
    console.log("1. Создать два Product.");
    console.log("2. Создать одного Supplier.");
    console.log("3. Создать по две партии для каждого товара.");
    console.log(
        "4. Продать каждый товар количеством, которое требует две партии."
    );
    console.log("5. Проверить FEFO/FIFO распределение продажи по партиям.");
    console.log("6. Частично вернуть Product A.");
    console.log(
        "7. Проверить LIFO возврат — возврат должен идти из последней проданной партии."
    );
    console.log("8. Полностью вернуть оставшийся Product A.");
    console.log("9. Проверить последовательность LIFO возвратов Product A.");
    console.log("10. Проверить, что Product B всё ещё частично продан.");
    console.log("11. Проверить NET total/profit.");
    console.log("12. Удалить заказ.");
    console.log("13. Проверить точное восстановление всех четырёх партий.");
    console.log("");

    try {
        // ========================================================================
        // 1. CREATE PRODUCT A
        // ========================================================================

        section("1. CREATE PRODUCT A");

        const productAResult = await api("/api/products", {
            method: "POST",
            body: JSON.stringify({
                name: PRODUCT_A_NAME,
                unit: "шт",
                price: 300,
                cost: 100,
                barcode: `V71 - A - ${TEST_TOKEN}`,
            }),
        });

        console.log(`HTTP ${productAResult.status}`);
        console.log(JSON.stringify(productAResult.data, null, 2));

        if (
            productAResult.status !== 200 ||
            !productAResult.data?.id
        ) {
            throw new Error("Не удалось создать Product A");
        }

        productAId = Number(productAResult.data.id);

        console.log(`🟢 Product A #${productAId} создан`);

        // ========================================================================
        // 2. CREATE PRODUCT B
        // ========================================================================

        section("2. CREATE PRODUCT B");

        const productBResult = await api("/api/products", {
            method: "POST",
            body: JSON.stringify({
                name: PRODUCT_B_NAME,
                unit: "шт",
                price: 500,
                cost: 200,
                barcode: `V71 - B - ${TEST_TOKEN}`,
            }),
        });

        console.log(`HTTP ${productBResult.status}`);
        console.log(JSON.stringify(productBResult.data, null, 2));

        if (
            productBResult.status !== 200 ||
            !productBResult.data?.id
        ) {
            throw new Error("Не удалось создать Product B");
        }

        productBId = Number(productBResult.data.id);

        console.log(`🟢 Product B #${productBId} создан`);

        // ========================================================================
        // 3. CREATE SUPPLIER
        // ========================================================================

        section("3. CREATE SUPPLIER");

        const supplierResult = await api("/api/suppliers", {
            method: "POST",
            body: JSON.stringify({
                name: SUPPLIER_NAME,
            }),
        });

        console.log(`HTTP ${supplierResult.status}`);
        console.log(JSON.stringify(supplierResult.data, null, 2));

        if (
            supplierResult.status !== 200 ||
            !supplierResult.data?.id
        ) {
            throw new Error("Не удалось создать Supplier");
        }

        supplierId = Number(supplierResult.data.id);

        console.log(`🟢 Supplier #${supplierId} создан`);

        // ========================================================================
        // 4. SUPPLY PRODUCT A — BATCH A1
        // ========================================================================

        section("4. SUPPLY PRODUCT A — BATCH A1");

        const supplyA1Result = await api("/api/supplies", {
            method: "POST",
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productAId,
                        quantity: 3,
                        cost: 100,
                        expiryDate: "2026-10-01",
                    },
                ],
            }),
        });

        console.log(`HTTP ${supplyA1Result.status}`);
        console.log(JSON.stringify(supplyA1Result.data, null, 2));

        if (
            supplyA1Result.status !== 200 ||
            !supplyA1Result.data?.supply?.id
        ) {
            throw new Error("Не удалось создать Supply A1");
        }

        supplyA1Id = Number(supplyA1Result.data.supply.id);

        console.log(`🟢 Supply A1 #${supplyA1Id} создан`);

        // ========================================================================
        // 5. SUPPLY PRODUCT A — BATCH A2
        // ========================================================================

        section("5. SUPPLY PRODUCT A — BATCH A2");

        const supplyA2Result = await api("/api/supplies", {
            method: "POST",
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productAId,
                        quantity: 4,
                        cost: 120,
                        expiryDate: "2026-11-01",
                    },
                ],
            }),
        });

        console.log(`HTTP ${supplyA2Result.status}`);
        console.log(JSON.stringify(supplyA2Result.data, null, 2));

        if (
            supplyA2Result.status !== 200 ||
            !supplyA2Result.data?.supply?.id
        ) {
            throw new Error("Не удалось создать Supply A2");
        }

        supplyA2Id = Number(supplyA2Result.data.supply.id);

        console.log(`🟢 Supply A2 #${supplyA2Id} создан`);

        // ========================================================================
        // 6. SUPPLY PRODUCT B — BATCH B1
        // ========================================================================

        section("6. SUPPLY PRODUCT B — BATCH B1");

        const supplyB1Result = await api("/api/supplies", {
            method: "POST",
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productBId,
                        quantity: 2,
                        cost: 200,
                        expiryDate: "2026-10-15",
                    },
                ],
            }),
        });

        console.log(`HTTP ${supplyB1Result.status}`);
        console.log(JSON.stringify(supplyB1Result.data, null, 2));

        if (
            supplyB1Result.status !== 200 ||
            !supplyB1Result.data?.supply?.id
        ) {
            throw new Error("Не удалось создать Supply B1");
        }

        supplyB1Id = Number(supplyB1Result.data.supply.id);

        console.log(`🟢 Supply B1 #${supplyB1Id} создан`);

        // ========================================================================
        // 7. SUPPLY PRODUCT B — BATCH B2
        // ========================================================================

        section("7. SUPPLY PRODUCT B — BATCH B2");

        const supplyB2Result = await api("/api/supplies", {
            method: "POST",
            body: JSON.stringify({
                supplierId,
                items: [
                    {
                        id: productBId,
                        quantity: 5,
                        cost: 220,
                        expiryDate: "2026-11-15",
                    },
                ],
            }),
        });

        console.log(`HTTP ${supplyB2Result.status}`);
        console.log(JSON.stringify(supplyB2Result.data, null, 2));

        if (
            supplyB2Result.status !== 200 ||
            !supplyB2Result.data?.supply?.id
        ) {
            throw new Error("Не удалось создать Supply B2");
        }

        supplyB2Id = Number(supplyB2Result.data.supply.id);

        console.log(`🟢 Supply B2 #${supplyB2Id} создан`);

        // ========================================================================
        // 8. VERIFY FOUR BATCHES
        // ========================================================================

        section("8. VERIFY FOUR BATCHES");

        const initialBatchesA = await prisma.batch.findMany({
            where: {
                productId: productAId,
            },
            orderBy: {
                id: "asc",
            },
        });

        const initialBatchesB = await prisma.batch.findMany({
            where: {
                productId: productBId,
            },
            orderBy: {
                id: "asc",
            },
        });

        if (initialBatchesA.length !== 2) {
            throw new Error(
                `Product A должен иметь 2 Batch, получено ${initialBatchesA.length}`
            );
        }

        if (initialBatchesB.length !== 2) {
            throw new Error(
                `Product B должен иметь 2 Batch, получено ${initialBatchesB.length}`
            );
        }

        const batchA1 = initialBatchesA[0];
        const batchA2 = initialBatchesA[1];
        const batchB1 = initialBatchesB[0];
        const batchB2 = initialBatchesB[1];

        if (batchA1.quantity !== 3) {
            throw new Error(
                `Batch A1 quantity должен быть 3, получено ${batchA1.quantity}`
            );
        }

        if (batchA2.quantity !== 4) {
            throw new Error(
                `Batch A2 quantity должен быть 4, получено ${batchA2.quantity}`
            );
        }

        if (batchB1.quantity !== 2) {
            throw new Error(
                `Batch B1 quantity должен быть 2, получено ${batchB1.quantity}`
            );
        }

        if (batchB2.quantity !== 5) {
            throw new Error(
                `Batch B2 quantity должен быть 5, получено ${batchB2.quantity}`
            );
        }

        console.log(
            `🟢 Product A: Batch #${batchA1.id}=3, Batch #${batchA2.id}=4`
        );

        console.log(
            `🟢 Product B: Batch #${batchB1.id}=2, Batch #${batchB2.id}=5`
        );

        // ========================================================================
        // 9. CREATE MULTI-ITEM ORDER
        // ========================================================================

        section("9. CREATE MULTI-ITEM ORDER");

        const orderResult = await api("/api/orders", {
            method: "POST",
            body: JSON.stringify({
                items: [
                    {
                        id: productAId,
                        quantity: 6,
                    },
                    {
                        id: productBId,
                        quantity: 6,
                    },
                ],
            }),
        });

        console.log(`HTTP ${orderResult.status}`);
        console.log(JSON.stringify(orderResult.data, null, 2));

        if (
            orderResult.status !== 201 ||
            !orderResult.data?.id
        ) {
            throw new Error(
                "Не удалось создать multi-batch multi-item Order"
            );
        }

        orderId = Number(orderResult.data.id);

        console.log(`🟢 Order #${orderId} создан`);

        // ========================================================================
        // 10. VERIFY SALE ALLOCATION
        // ========================================================================

        section("10. VERIFY FEFO/FIFO SALE ALLOCATION");

        const orderAfterSale =
            await prisma.order.findUnique({
                where: {
                    id: orderId,
                },
                include: {
                    items: {
                        include: {
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
                        orderBy: {
                            id: "asc",
                        },
                    },
                },
            });

        if (!orderAfterSale) {
            throw new Error("Order не найден после создания");
        }

        const orderItemA =
            orderAfterSale.items.find(
                (item) => item.productId === productAId
            );

        const orderItemB =
            orderAfterSale.items.find(
                (item) => item.productId === productBId
            );

        if (!orderItemA || !orderItemB) {
            throw new Error(
                "Не найдены оба OrderItem после продажи"
            );
        }

        console.log(`🟢 OrderItem A #${orderItemA.id}`);
        console.log(`🟢 OrderItem B #${orderItemB.id}`);

        if (orderItemA.batches.length !== 2) {
            throw new Error(
                `Product A должен использовать 2 OrderBatch, получено ${orderItemA.batches.length}`
            );
        }

        if (orderItemB.batches.length !== 2) {
            throw new Error(
                `Product B должен использовать 2 OrderBatch, получено ${orderItemB.batches.length}`
            );
        }

        const soldA1 =
            orderItemA.batches.find(
                (item) => item.batchId === batchA1.id
            );

        const soldA2 =
            orderItemA.batches.find(
                (item) => item.batchId === batchA2.id
            );

        const soldB1 =
            orderItemB.batches.find(
                (item) => item.batchId === batchB1.id
            );

        const soldB2 =
            orderItemB.batches.find(
                (item) => item.batchId === batchB2.id
            );

        if (!soldA1 || !soldA2 || !soldB1 || !soldB2) {
            throw new Error(
                "Не найдены ожидаемые OrderBatch по четырём партиям"
            );
        }

        if (soldA1.quantity !== 3) {
            throw new Error(
                `Product A Batch A1 должен продать 3, получено ${soldA1.quantity}`
            );
        }

        if (soldA2.quantity !== 3) {
            throw new Error(
                `Product A Batch A2 должен продать 3, получено ${soldA2.quantity}`
            );
        }

        if (soldB1.quantity !== 2) {
            throw new Error(
                `Product B Batch B1 должен продать 2, получено ${soldB1.quantity}`
            );
        }

        if (soldB2.quantity !== 4) {
            throw new Error(
                `Product B Batch B2 должен продать 4, получено ${soldB2.quantity}`
            );
        }

        console.log(
            `🟢 Product A sale: Batch #${batchA1.id}=3 + Batch #${batchA2.id}=3`
        );

        console.log(
            `🟢 Product B sale: Batch #${batchB1.id}=2 + Batch #${batchB2.id}=4`
        );

        // ========================================================================
        // 11. VERIFY STOCK AFTER SALE
        // ========================================================================

        section("11. VERIFY STOCK AFTER SALE");

        const productAAfterSale =
            await prisma.product.findUnique({
                where: {
                    id: productAId,
                },
            });

        const productBAfterSale =
            await prisma.product.findUnique({
                where: {
                    id: productBId,
                },
            });

        const batchesAAfterSale =
            await prisma.batch.findMany({
                where: {
                    productId: productAId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const batchesBAfterSale =
            await prisma.batch.findMany({
                where: {
                    productId: productBId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        if (!productAAfterSale || !productBAfterSale) {
            throw new Error("Products не найдены после продажи");
        }

        const currentA1 =
            batchesAAfterSale.find(
                (batch) => batch.id === batchA1.id
            );

        const currentA2 =
            batchesAAfterSale.find(
                (batch) => batch.id === batchA2.id
            );

        const currentB1 =
            batchesBAfterSale.find(
                (batch) => batch.id === batchB1.id
            );

        const currentB2 =
            batchesBAfterSale.find(
                (batch) => batch.id === batchB2.id
            );

        if (
            !currentA1 ||
            !currentA2 ||
            !currentB1 ||
            !currentB2
        ) {
            throw new Error(
                "Не найдены партии после продажи"
            );
        }

        if (currentA1.quantity !== 0) {
            throw new Error(
                `Batch A1 после продажи должен быть 0, получено ${currentA1.quantity}`
            );
        }

        if (currentA2.quantity !== 1) {
            throw new Error(
                `Batch A2 после продажи должен быть 1, получено ${currentA2.quantity}`
            );
        }

        if (currentB1.quantity !== 0) {
            throw new Error(
                `Batch B1 после продажи должен быть 0, получено ${currentB1.quantity}`
            );
        }

        if (currentB2.quantity !== 1) {
            throw new Error(
                `Batch B2 после продажи должен быть 1, получено ${currentB2.quantity}`
            );
        }

        if (productAAfterSale.stock !== 1) {
            throw new Error(
                `Product A stock после продажи должен быть 1, получено ${productAAfterSale.stock}`
            );
        }

        if (productBAfterSale.stock !== 1) {
            throw new Error(
                `Product B stock после продажи должен быть 1, получено ${productBAfterSale.stock}`
            );
        }

        console.log(
            `🟢 Product A: Batch #${batchA1.id}=0, Batch #${batchA2.id}=1`
        );

        console.log(
            `🟢 Product B: Batch #${batchB1.id}=0, Batch #${batchB2.id}=1`
        );

        console.log("🟢 Product A stock = 1");
        console.log("🟢 Product B stock = 1");

        // ========================================================================
        // 12. VERIFY GROSS FINANCIALS
        // ========================================================================

        section("12. VERIFY GROSS FINANCIALS");

        if (orderAfterSale.total !== 4800) {
            throw new Error(
                `Gross Order.total должен быть 4800, получено ${orderAfterSale.total}`
            );
        }

        if (orderAfterSale.profit !== 2860) {
            throw new Error(
                `Gross Order.profit должен быть 2860, получено ${orderAfterSale.profit}`
            );
        }

        if (orderAfterSale.status !== "COMPLETED") {
            throw new Error(
                `Order.status должен быть COMPLETED, получено ${orderAfterSale.status}`
            );
        }

        console.log("🟢 Gross Order.total = 4800");
        console.log("🟢 Gross Order.profit = 2860");
        console.log("🟢 Order.status = COMPLETED");

        // ========================================================================
        // 13. PARTIAL RETURN PRODUCT A — 2 UNITS
        // ========================================================================

        section("13. PARTIAL RETURN PRODUCT A — 2 UNITS");

        const returnA1Result = await api(
            `/api/orders/${orderId}/return`,
            {
                method: "POST",
                body: JSON.stringify({
                    itemId: orderItemA.id,
                    quantity: 2,
                }),
            }
        );

        console.log(`HTTP ${returnA1Result.status}`);
        console.log(
            JSON.stringify(returnA1Result.data, null, 2)
        );

        if (returnA1Result.status !== 200) {
            throw new Error(
                "Первый возврат Product A должен завершиться HTTP 200"
            );
        }

        console.log("🟢 Возврат Product A = 2 выполнен");

        // ========================================================================
        // 14. VERIFY FIRST LIFO RETURN
        // ========================================================================

        section("14. VERIFY FIRST LIFO RETURN");

        const afterReturnA1 =
            await prisma.order.findUnique({
                where: {
                    id: orderId,
                },
                include: {
                    items: {
                        include: {
                            batches: {
                                include: {
                                    batch: true,
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
                        orderBy: {
                            id: "asc",
                        },
                    },
                },
            });

        if (!afterReturnA1) {
            throw new Error(
                "Order не найден после первого возврата"
            );
        }

        const returnedItemA1 =
            afterReturnA1.items.find(
                (item) => item.productId === productAId
            );

        const returnedItemB1 =
            afterReturnA1.items.find(
                (item) => item.productId === productBId
            );

        if (!returnedItemA1 || !returnedItemB1) {
            throw new Error(
                "OrderItems не найдены после первого возврата"
            );
        }

        if (returnedItemA1.returned !== 2) {
            throw new Error(
                `Product A returned должен быть 2, получено ${returnedItemA1.returned}`
            );
        }

        if (returnedItemB1.returned !== 0) {
            throw new Error(
                `Product B returned должен оставаться 0, получено ${returnedItemB1.returned}`
            );
        }

        if (returnedItemA1.ReturnBatch.length !== 1) {
            throw new Error(
                `После первого возврата должен быть 1 ReturnBatch Product A, получено ${returnedItemA1.ReturnBatch.length}`
            );
        }

        const firstReturnA =
            returnedItemA1.ReturnBatch[0];

        if (firstReturnA.batchId !== batchA2.id) {
            throw new Error(
                `LIFO: первый возврат Product A должен идти из Batch #${batchA2.id}, получено Batch #${firstReturnA.batchId}`
            );
        }

        if (firstReturnA.quantity !== 2) {
            throw new Error(
                `Первый ReturnBatch Product A должен иметь quantity=2, получено ${firstReturnA.quantity}`
            );
        }

        if (afterReturnA1.total !== 4200) {
            throw new Error(
                `NET Order.total должен быть 4200, получено ${afterReturnA1.total}`
            );
        }

        if (afterReturnA1.profit !== 2500) {
            throw new Error(
                `NET Order.profit должен быть 2500, получено ${afterReturnA1.profit}`
            );
        }

        if (afterReturnA1.status !== "PARTIAL_RETURN") {
            throw new Error(
                `Order.status должен быть PARTIAL_RETURN, получено ${afterReturnA1.status}`
            );
        }

        console.log(
            `🟢 LIFO: Product A возврат 2 → Batch #${batchA2.id}`
        );

        console.log("🟢 Product B returned = 0");
        console.log("🟢 NET Order.total = 4200");
        console.log("🟢 NET Order.profit = 2500");
        console.log("🟢 Order.status = PARTIAL_RETURN");

        // ========================================================================
        // 15. VERIFY STOCK AFTER FIRST RETURN
        // ========================================================================

        section("15. VERIFY STOCK AFTER FIRST RETURN");

        const batchesAAfterReturn1 =
            await prisma.batch.findMany({
                where: {
                    productId: productAId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const batchesBAfterReturn1 =
            await prisma.batch.findMany({
                where: {
                    productId: productBId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const a1AfterReturn1 =
            batchesAAfterReturn1.find(
                (batch) => batch.id === batchA1.id
            );

        const a2AfterReturn1 =
            batchesAAfterReturn1.find(
                (batch) => batch.id === batchA2.id
            );

        const b1AfterReturn1 =
            batchesBAfterReturn1.find(
                (batch) => batch.id === batchB1.id
            );

        const b2AfterReturn1 =
            batchesBAfterReturn1.find(
                (batch) => batch.id === batchB2.id
            );

        if (
            !a1AfterReturn1 ||
            !a2AfterReturn1 ||
            !b1AfterReturn1 ||
            !b2AfterReturn1
        ) {
            throw new Error(
                "Не найдены партии после первого возврата"
            );
        }

        if (a1AfterReturn1.quantity !== 0) {
            throw new Error(
                `Batch A1 должен оставаться 0, получено ${a1AfterReturn1.quantity}`
            );
        }

        if (a2AfterReturn1.quantity !== 3) {
            throw new Error(
                `Batch A2 после возврата должен быть 3, получено ${a2AfterReturn1.quantity}`
            );
        }

        if (b1AfterReturn1.quantity !== 0) {
            throw new Error(
                `Batch B1 должен оставаться 0, получено ${b1AfterReturn1.quantity}`
            );
        }

        if (b2AfterReturn1.quantity !== 1) {
            throw new Error(
                `Batch B2 должен оставаться 1, получено ${b2AfterReturn1.quantity}`
            );
        }

        console.log(
            `🟢 A1=${a1AfterReturn1.quantity}, A2=${a2AfterReturn1.quantity}`
        );

        console.log(
            `🟢 B1=${b1AfterReturn1.quantity}, B2=${b2AfterReturn1.quantity}`
        );

        // ========================================================================
        // 16. FULL RETURN REMAINING PRODUCT A — 4 UNITS
        // ========================================================================

        section("16. FULL RETURN REMAINING PRODUCT A — 4 UNITS");

        const returnA2Result = await api(
            `/api/orders/${orderId}/return`,
            {
                method: "POST",
                body: JSON.stringify({
                    itemId: orderItemA.id,
                    quantity: 4,
                }),
            }
        );

        console.log(`HTTP ${returnA2Result.status}`);
        console.log(
            JSON.stringify(returnA2Result.data, null, 2)
        );

        if (returnA2Result.status !== 200) {
            throw new Error(
                "Второй возврат Product A должен завершиться HTTP 200"
            );
        }

        console.log("🟢 Остаток Product A = 4 возвращён");

        // ========================================================================
        // 17. VERIFY COMPLETE LIFO RETURN SEQUENCE
        // ========================================================================

        section("17. VERIFY COMPLETE LIFO RETURN SEQUENCE");

        const afterFullReturnA =
            await prisma.order.findUnique({
                where: {
                    id: orderId,
                },
                include: {
                    items: {
                        include: {
                            batches: {
                                include: {
                                    batch: true,
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
                        orderBy: {
                            id: "asc",
                        },
                    },
                },
            });

        if (!afterFullReturnA) {
            throw new Error(
                "Order не найден после полного возврата Product A"
            );
        }

        const fullReturnItemA =
            afterFullReturnA.items.find(
                (item) => item.productId === productAId
            );

        const fullReturnItemB =
            afterFullReturnA.items.find(
                (item) => item.productId === productBId
            );

        if (!fullReturnItemA || !fullReturnItemB) {
            throw new Error(
                "OrderItems не найдены после полного возврата Product A"
            );
        }

        if (fullReturnItemA.returned !== 6) {
            throw new Error(
                `Product A returned должен быть 6, получено ${fullReturnItemA.returned}`
            );
        }

        if (fullReturnItemB.returned !== 0) {
            throw new Error(
                `Product B returned должен быть 0, получено ${fullReturnItemB.returned}`
            );
        }

        if (fullReturnItemA.ReturnBatch.length !== 3) {
            throw new Error(
                `Product A должен иметь 3 ReturnBatch, получено ${fullReturnItemA.ReturnBatch.length}`
            );
        }

        const returnAFirst =
            fullReturnItemA.ReturnBatch[0];

        const returnASecond =
            fullReturnItemA.ReturnBatch[1];

        const returnAThird =
            fullReturnItemA.ReturnBatch[2];

        if (returnAFirst.batchId !== batchA2.id) {
            throw new Error(
                `Первый ReturnBatch Product A должен быть Batch #${batchA2.id}, получено #${returnAFirst.batchId}`
            );
        }

        if (returnAFirst.quantity !== 2) {
            throw new Error(
                `Первый ReturnBatch Product A quantity должен быть 2, получено ${returnAFirst.quantity}`
            );
        }

        if (returnASecond.batchId !== batchA2.id) {
            throw new Error(
                `Второй ReturnBatch Product A должен продолжить Batch #${batchA2.id}, получено #${returnASecond.batchId}`
            );
        }

        if (returnASecond.quantity !== 1) {
            throw new Error(
                `Второй ReturnBatch Product A quantity должен быть 1, получено ${returnASecond.quantity}`
            );
        }

        if (returnAThird.batchId !== batchA1.id) {
            throw new Error(
                `Третий ReturnBatch Product A должен перейти на Batch #${batchA1.id}, получено #${returnAThird.batchId}`
            );
        }

        if (returnAThird.quantity !== 3) {
            throw new Error(
                `Третий ReturnBatch Product A quantity должен быть 3, получено ${returnAThird.quantity}`
            );
        }

        if (afterFullReturnA.total !== 3000) {
            throw new Error(
                `NET Order.total должен быть 3000, получено ${afterFullReturnA.total}`
            );
        }

        if (afterFullReturnA.profit !== 1720) {
            throw new Error(
                `NET Order.profit должен быть 1720, получено ${afterFullReturnA.profit}`
            );
        }

        if (afterFullReturnA.status !== "PARTIAL_RETURN") {
            throw new Error(
                `Order.status должен быть PARTIAL_RETURN, получено ${afterFullReturnA.status}`
            );
        }

        console.log(
            `🟢 Return #${returnAFirst.id}: Batch #${returnAFirst.batchId}, qty=2`
        );

        console.log(
            `🟢 Return #${returnASecond.id}: Batch #${returnASecond.batchId}, qty=1`
        );

        console.log(
            `🟢 Return #${returnAThird.id}: Batch #${returnAThird.batchId}, qty=3`
        );

        console.log(
            "🟢 LIFO sequence: A2 → A2 → A1"
        );

        console.log("🟢 Product A returned = 6");
        console.log("🟢 Product B returned = 0");
        console.log("🟢 NET Order.total = 3000");
        console.log("🟢 NET Order.profit = 1720");
        console.log("🟢 Order.status = PARTIAL_RETURN");

        // ========================================================================
        // 18. VERIFY STOCK AFTER FULL PRODUCT A RETURN
        // ========================================================================

        section("18. VERIFY STOCK AFTER FULL PRODUCT A RETURN");

        const productAAfterFullReturn =
            await prisma.product.findUnique({
                where: {
                    id: productAId,
                },
            });

        const productBAfterFullReturn =
            await prisma.product.findUnique({
                where: {
                    id: productBId,
                },
            });

        const finalBeforeDeleteBatchesA =
            await prisma.batch.findMany({
                where: {
                    productId: productAId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const finalBeforeDeleteBatchesB =
            await prisma.batch.findMany({
                where: {
                    productId: productBId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        if (
            !productAAfterFullReturn ||
            !productBAfterFullReturn
        ) {
            throw new Error(
                "Products не найдены после полного возврата Product A"
            );
        }

        const finalA1 =
            finalBeforeDeleteBatchesA.find(
                (batch) => batch.id === batchA1.id
            );

        const finalA2 =
            finalBeforeDeleteBatchesA.find(
                (batch) => batch.id === batchA2.id
            );

        const finalB1 =
            finalBeforeDeleteBatchesB.find(
                (batch) => batch.id === batchB1.id
            );

        const finalB2 =
            finalBeforeDeleteBatchesB.find(
                (batch) => batch.id === batchB2.id
            );

        if (
            !finalA1 ||
            !finalA2 ||
            !finalB1 ||
            !finalB2
        ) {
            throw new Error(
                "Не найдены партии перед DELETE"
            );
        }

        if (finalA1.quantity !== 3) {
            throw new Error(
                `Batch A1 перед DELETE должен быть 3, получено ${finalA1.quantity}`
            );
        }

        if (finalA2.quantity !== 4) {
            throw new Error(
                `Batch A2 перед DELETE должен быть 4, получено ${finalA2.quantity}`
            );
        }

        if (finalB1.quantity !== 0) {
            throw new Error(
                `Batch B1 перед DELETE должен быть 0, получено ${finalB1.quantity}`
            );
        }

        if (finalB2.quantity !== 1) {
            throw new Error(
                `Batch B2 перед DELETE должен быть 1, получено ${finalB2.quantity}`
            );
        }

        if (productAAfterFullReturn.stock !== 7) {
            throw new Error(
                `Product A stock перед DELETE должен быть 7, получено ${productAAfterFullReturn.stock}`
            );
        }

        if (productBAfterFullReturn.stock !== 1) {
            throw new Error(
                `Product B stock перед DELETE должен быть 1, получено ${productBAfterFullReturn.stock}`
            );
        }

        console.log(
            `🟢 Product A batches: ${finalA1.quantity} + ${finalA2.quantity} = 7`
        );

        console.log(
            `🟢 Product B batches: ${finalB1.quantity} + ${finalB2.quantity} = 1`
        );

        console.log("🟢 Product A stock = 7");
        console.log("🟢 Product B stock = 1");

        // ========================================================================
        // 19. DELETE ORDER
        // ========================================================================

        section("19. DELETE ORDER");

        const deleteResult = await api(
            `/api/orders/${orderId}`,
            {
                method: "DELETE",
            }
        );

        console.log(`HTTP ${deleteResult.status}`);
        console.log(
            JSON.stringify(deleteResult.data, null, 2)
        );

        if (deleteResult.status !== 200) {
            throw new Error(
                "DELETE заказа должен завершиться HTTP 200"
            );
        }

        console.log(`🟢 Order #${orderId} удалён`);

        // ========================================================================
        // 20. VERIFY ORDER DELETED
        // ========================================================================

        section("20. VERIFY ORDER DELETED");

        const deletedOrder =
            await prisma.order.findUnique({
                where: {
                    id: orderId,
                },
            });

        if (deletedOrder) {
            throw new Error(
                "Order должен отсутствовать после DELETE"
            );
        }

        console.log("🟢 Order удалён из БД");

        // ========================================================================
        // 21. VERIFY EXACT FOUR-BATCH RESTORATION
        // ========================================================================

        section("21. VERIFY EXACT FOUR-BATCH RESTORATION");

        const productAAfterDelete =
            await prisma.product.findUnique({
                where: {
                    id: productAId,
                },
            });

        const productBAfterDelete =
            await prisma.product.findUnique({
                where: {
                    id: productBId,
                },
            });

        const batchesAAfterDelete =
            await prisma.batch.findMany({
                where: {
                    productId: productAId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        const batchesBAfterDelete =
            await prisma.batch.findMany({
                where: {
                    productId: productBId,
                },
                orderBy: {
                    id: "asc",
                },
            });

        if (
            !productAAfterDelete ||
            !productBAfterDelete
        ) {
            throw new Error(
                "Products не найдены после DELETE"
            );
        }

        const restoredA1 =
            batchesAAfterDelete.find(
                (batch) => batch.id === batchA1.id
            );

        const restoredA2 =
            batchesAAfterDelete.find(
                (batch) => batch.id === batchA2.id
            );

        const restoredB1 =
            batchesBAfterDelete.find(
                (batch) => batch.id === batchB1.id
            );

        const restoredB2 =
            batchesBAfterDelete.find(
                (batch) => batch.id === batchB2.id
            );

        if (
            !restoredA1 ||
            !restoredA2 ||
            !restoredB1 ||
            !restoredB2
        ) {
            throw new Error(
                "После DELETE не найдены все четыре исходные Batch"
            );
        }

        if (restoredA1.quantity !== 3) {
            throw new Error(
                `Batch A1 после DELETE должен быть 3, получено ${restoredA1.quantity}`
            );
        }

        if (restoredA2.quantity !== 4) {
            throw new Error(
                `Batch A2 после DELETE должен быть 4, получено ${restoredA2.quantity}`
            );
        }

        if (restoredB1.quantity !== 2) {
            throw new Error(
                `Batch B1 после DELETE должен быть 2, получено ${restoredB1.quantity}`
            );
        }

        if (restoredB2.quantity !== 5) {
            throw new Error(
                `Batch B2 после DELETE должен быть 5, получено ${restoredB2.quantity}`
            );
        }

        if (productAAfterDelete.stock !== 7) {
            throw new Error(
                `Product A stock после DELETE должен быть 7, получено ${productAAfterDelete.stock}`
            );
        }

        if (productBAfterDelete.stock !== 7) {
            throw new Error(
                `Product B stock после DELETE должен быть 7, получено ${productBAfterDelete.stock}`
            );
        }

        console.log(
            `🟢 Product A: Batch #${restoredA1.id}=3, Batch #${restoredA2.id}=4`
        );

        console.log(
            `🟢 Product B: Batch #${restoredB1.id}=2, Batch #${restoredB2.id}=5`
        );

        console.log("🟢 Product A stock после DELETE = 7");
        console.log("🟢 Product B stock после DELETE = 7");

        // ========================================================================
        // 22. VERIFY STOCK EQUALS BATCH SUM
        // ========================================================================

        section("22. VERIFY STOCK = SUM(BATCH.QUANTITY)");

        const finalStockA =
            batchesAAfterDelete.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        const finalStockB =
            batchesBAfterDelete.reduce(
                (sum, batch) => sum + batch.quantity,
                0
            );

        if (finalStockA !== productAAfterDelete.stock) {
            throw new Error(
                `Product A stock ${productAAfterDelete.stock} не совпадает с Batch sum ${finalStockA}`
            );
        }

        if (finalStockB !== productBAfterDelete.stock) {
            throw new Error(
                `Product B stock ${productBAfterDelete.stock} не совпадает с Batch sum ${finalStockB}`
            );
        }

        if (finalStockA !== 7) {
            throw new Error(
                `Product A final Batch sum должен быть 7, получено ${finalStockA}`
            );
        }

        if (finalStockB !== 7) {
            throw new Error(
                `Product B final Batch sum должен быть 7, получено ${finalStockB}`
            );
        }

        console.log("🟢 Product A stock = SUM(Batch.quantity) = 7");
        console.log("🟢 Product B stock = SUM(Batch.quantity) = 7");

        // ========================================================================
        // 23. FINAL RESULT
        // ========================================================================

        section("23. V71 FINAL RESULT");

        console.log("🟢 V71 PASSED");
        console.log("");
        console.log("Проверено:");
        console.log("1. Два Product в одном заказе.");
        console.log("2. У каждого Product две Batch.");
        console.log("3. Product A продажа распределена 3 + 3.");
        console.log("4. Product B продажа распределена 2 + 4.");
        console.log(
            "5. FEFO/FIFO выбирает более раннюю партию первой."
        );
        console.log(
            "6. Первый возврат Product A идёт по LIFO."
        );
        console.log(
            "7. Следующий возврат продолжает последнюю проданную Batch."
        );
        console.log(
            "8. После исчерпания последней Batch возврат переходит к предыдущей."
        );
        console.log(
            "9. Product B не изменяется при возвратах Product A."
        );
        console.log(
            "10. NET total/profit пересчитываются по всему multi-item заказу."
        );
        console.log(
            "11. DELETE восстанавливает все четыре Batch."
        );
        console.log(
            "12. Product.stock совпадает с SUM(Batch.quantity)."
        );
        console.log("");
        console.log(
            "=============================================================================="
        );
        console.log("V71 TEST PASSED");
        console.log(
            "=============================================================================="
        );
    } finally {
        await cleanup();
    }
}

main()
    .catch((error) => {
        console.error("");
        console.error("🔴 V71 TEST FAILED");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
