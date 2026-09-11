import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function logSection(title: string) {
    console.log("");
    console.log("==============================================================================");
    console.log(title);
    console.log("==============================================================================");
    console.log("");
}

async function requestJson(
    path: string,
    options: RequestInit = {}
): Promise<{ status: number; data: any }> {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
        },
    });

    const text = await response.text();

    let data: any = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    console.log(`HTTP ${response.status}`);
    console.log(JSON.stringify(data, null, 2));

    return {
        status: response.status,
        data,
    };
}


async function cleanupTestData(ids: {
    orderId: number | null;
    productIds: number[];
    batchIds: number[];
    movementIds: number[];
}) {
    logSection("CLEANUP");

    try {
        if (ids.orderId !== null) {
            await prisma.returnBatch.deleteMany({
                where: {
                    OrderItem: {
                        orderId: ids.orderId,
                    },
                },
            });

            await prisma.orderBatch.deleteMany({
                where: {
                    orderItem: {
                        orderId: ids.orderId,
                    },
                },
            });

            await prisma.orderItem.deleteMany({
                where: {
                    orderId: ids.orderId,
                },
            });

            await prisma.order.deleteMany({
                where: {
                    id: ids.orderId,
                },
            });
        }

        if (ids.movementIds.length > 0) {
            await prisma.movement.deleteMany({
                where: {
                    id: {
                        in: ids.movementIds,
                    },
                },
            });
        }

        if (ids.batchIds.length > 0) {
            await prisma.batch.deleteMany({
                where: {
                    id: {
                        in: ids.batchIds,
                    },
                },
            });
        }

        if (ids.productIds.length > 0) {
            await prisma.product.deleteMany({
                where: {
                    id: {
                        in: ids.productIds,
                    },
                },
            });
        }

        console.log("🟢 CLEANUP COMPLETED");
    } catch (error) {
        console.error("🔴 CLEANUP FAILED");
        console.error(error);
        throw error;
    }
}


async function main() {
    let productAId: number | null = null;
    let productBId: number | null = null;

    let batchAId: number | null = null;
    let batchBId: number | null = null;

    let orderId: number | null = null;

    const movementIds: number[] = [];

    try {
        logSection("V61 — HISTORICAL INCOMPLETE ORDER DELETE SAFETY TEST");

        // =========================================================================
        // 1. CREATE TEST PRODUCTS
        // =========================================================================

        logSection("1. CREATE TEST PRODUCTS");

        const timestamp = Date.now();

        const productA = await prisma.product.create({
            data: {
                name: `V61 Test Product A ${timestamp}`,
                unit: "шт",
                price: 300,
                cost: 100,
                stock: 0,
                barcode: `V61-A-${timestamp}`,
            },
        });

        const productB = await prisma.product.create({
            data: {
                name: `V61 Test Product B ${timestamp}`,
                unit: "шт",
                price: 500,
                cost: 200,
                stock: 0,
                barcode: `V61-B-${timestamp}`,
            },
        });

        productAId = productA.id;
        productBId = productB.id;

        console.log(`Product A #${productA.id}`);
        console.log(`Product B #${productB.id}`);

        // =========================================================================
        // 2. CREATE TEST BATCHES
        // =========================================================================

        logSection("2. CREATE TEST BATCHES");

        const receivedAt = new Date();

        const expiryA = new Date(
            receivedAt.getTime() + 30 * 24 * 60 * 60 * 1000
        );

        const expiryB = new Date(
            receivedAt.getTime() + 30 * 24 * 60 * 60 * 1000
        );

        const batchA = await prisma.batch.create({
            data: {
                quantity: 2,
                purchaseCost: 100,
                receivedAt,
                expiryDate: expiryA,
                status: "ACTIVE",
                productId: productA.id,
            },
        });

        const batchB = await prisma.batch.create({
            data: {
                quantity: 2,
                purchaseCost: 200,
                receivedAt,
                expiryDate: expiryB,
                status: "ACTIVE",
                productId: productB.id,
            },
        });

        batchAId = batchA.id;
        batchBId = batchB.id;

        await prisma.product.update({
            where: {
                id: productA.id,
            },
            data: {
                stock: 2,
            },
        });

        await prisma.product.update({
            where: {
                id: productB.id,
            },
            data: {
                stock: 2,
            },
        });

        console.log(`Batch A #${batchA.id}=2 @100`);
        console.log(`Batch B #${batchB.id}=2 @200`);

        console.log("Product A stock=2");
        console.log("Product B stock=2");

        // =========================================================================
        // 3. CREATE HISTORICAL INCOMPLETE ORDER
        // =========================================================================

        logSection("3. CREATE HISTORICAL ORDER WITH ONE INCOMPLETE ORDERITEM");

        /*
         * ВАЖНО:
         *
         * Этот заказ специально создаётся напрямую через Prisma.
         *
         * Product A:
         *   - товар был реально продан;
         *   - Batch A уменьшен 2 -> 0;
         *   - есть OrderBatch.
         *
         * Product B:
         *   - OrderItem существует;
         *   - quantity=2;
         *   - но OrderBatch отсутствует.
         *
         * Это имитирует исторический неполный заказ,
         * который уже встречался в старых данных проекта.
         *
         * DELETE должен полностью отказаться от удаления такого заказа.
         */

        const orderDate = new Date();

        const order = await prisma.order.create({
            data: {
                total: 1600,
                profit: 800,
                date: orderDate,
                status: "COMPLETED",
                items: {
                    create: [
                        {
                            quantity: 2,
                            returned: 0,
                            price: 300,
                            productId: productA.id,
                        },
                        {
                            quantity: 2,
                            returned: 0,
                            price: 500,
                            productId: productB.id,
                        },
                    ],
                },
            },
            include: {
                items: true,
            },
        });

        orderId = order.id;

        const orderItemA = order.items.find(
            (item) => item.productId === productA.id
        );

        const orderItemB = order.items.find(
            (item) => item.productId === productB.id
        );

        assert.ok(orderItemA, "OrderItem A must exist");
        assert.ok(orderItemB, "OrderItem B must exist");

        // =========================================================================
        // 4. SIMULATE HISTORICAL SALE FOR PRODUCT A
        // =========================================================================

        logSection("4. SIMULATE HISTORICAL SALE FOR PRODUCT A");

        await prisma.batch.update({
            where: {
                id: batchA.id,
            },
            data: {
                quantity: 0,
                status: "EMPTY",
            },
        });

        await prisma.product.update({
            where: {
                id: productA.id,
            },
            data: {
                stock: 0,
            },
        });

        const orderBatchA = await prisma.orderBatch.create({
            data: {
                quantity: 2,
                purchaseCost: 100,
                orderItemId: orderItemA.id,
                batchId: batchA.id,
            },
        });

        const saleMovementA = await prisma.movement.create({
            data: {
                type: "SALE",
                quantity: -2,
                comment: `V61 fixture sale. Заказ №${order.id}. Партия №${batchA.id}`,
                productId: productA.id,
            },
        });

        movementIds.push(saleMovementA.id);

        console.log(`Order #${order.id}`);
        console.log(`OrderItem A #${orderItemA.id}`);
        console.log(`OrderBatch A #${orderBatchA.id}`);
        console.log(`Batch A #${batchA.id}: 2 → 0`);
        console.log(`Product A stock: 2 → 0`);
        console.log(`SALE Movement #${saleMovementA.id}: -2`);

        console.log("");
        console.log(
            `OrderItem B #${orderItemB.id} intentionally has NO OrderBatch`
        );

        console.log("");
        console.log(
            "🔴 HISTORICAL INCOMPLETE STATE CREATED"
        );

        // =========================================================================
        // 5. VERIFY FIXTURE
        // =========================================================================

        logSection("5. VERIFY HISTORICAL INCOMPLETE FIXTURE");

        const beforeOrder = await prisma.order.findUnique({
            where: {
                id: order.id,
            },
            include: {
                items: {
                    include: {
                        batches: true,
                    },
                },
            },
        });

        assert.ok(
            beforeOrder,
            "Order must exist before DELETE"
        );

        assert.equal(
            beforeOrder.items.length,
            2,
            "Order must contain exactly two OrderItems"
        );

        const beforeItemA = beforeOrder.items.find(
            (item) => item.productId === productA.id
        );

        const beforeItemB = beforeOrder.items.find(
            (item) => item.productId === productB.id
        );

        assert.ok(beforeItemA);
        assert.ok(beforeItemB);

        assert.equal(
            beforeItemA.batches.length,
            1,
            "Product A must have one OrderBatch"
        );

        assert.equal(
            beforeItemA.batches[0].quantity,
            2
        );

        assert.equal(
            beforeItemB.batches.length,
            0,
            "Product B must intentionally have no OrderBatch"
        );

        const beforeBatchA = await prisma.batch.findUnique({
            where: {
                id: batchA.id,
            },
        });

        const beforeBatchB = await prisma.batch.findUnique({
            where: {
                id: batchB.id,
            },
        });

        assert.ok(beforeBatchA);
        assert.ok(beforeBatchB);

        assert.equal(
            beforeBatchA.quantity,
            0
        );

        assert.equal(
            beforeBatchA.status,
            "EMPTY"
        );

        assert.equal(
            beforeBatchB.quantity,
            2
        );

        assert.equal(
            beforeBatchB.status,
            "ACTIVE"
        );

        const beforeProductA = await prisma.product.findUnique({
            where: {
                id: productA.id,
            },
        });

        const beforeProductB = await prisma.product.findUnique({
            where: {
                id: productB.id,
            },
        });

        assert.ok(beforeProductA);
        assert.ok(beforeProductB);

        assert.equal(
            beforeProductA.stock,
            0
        );

        assert.equal(
            beforeProductB.stock,
            2
        );

        console.log(`Order #${order.id}: exists`);
        console.log(`OrderItems=2`);

        console.log(
            `Product A OrderBatches=${beforeItemA.batches.length}`
        );

        console.log(
            `Product B OrderBatches=${beforeItemB.batches.length}`
        );

        console.log(
            `Batch A quantity=${beforeBatchA.quantity}`
        );

        console.log(
            `Batch B quantity=${beforeBatchB.quantity}`
        );

        console.log(
            `Product A stock=${beforeProductA.stock}`
        );

        console.log(
            `Product B stock=${beforeProductB.stock}`
        );

        console.log(
            "🟢 Historical incomplete fixture verified"
        );

        // =========================================================================
        // 6. DELETE MUST BE REFUSED
        // =========================================================================

        logSection("6. DELETE HISTORICAL INCOMPLETE ORDER");

        const deleteResult = await requestJson(
            `/api/orders/${order.id}`,
            {
                method: "DELETE",
            }
        );

        assert.equal(
            deleteResult.status,
            500,
            "DELETE must be rejected when an OrderItem has no OrderBatch"
        );

        assert.ok(
            deleteResult.data?.error,
            "Rejected DELETE must return an error"
        );

        console.log(
            "🟢 DELETE correctly refused the incomplete historical order"
        );

        // =========================================================================
        // 7. VERIFY ORDER WAS NOT PARTIALLY DELETED
        // =========================================================================

        logSection("7. VERIFY ORDER WAS NOT PARTIALLY DELETED");

        const afterFailedDeleteOrder = await prisma.order.findUnique({
            where: {
                id: order.id,
            },
            include: {
                items: {
                    include: {
                        batches: true,
                    },
                },
            },
        });

        assert.ok(
            afterFailedDeleteOrder,
            "Order must remain after rejected DELETE"
        );

        assert.equal(
            afterFailedDeleteOrder.items.length,
            2
        );

        const afterItemA = afterFailedDeleteOrder.items.find(
            (item) => item.productId === productA.id
        );

        const afterItemB = afterFailedDeleteOrder.items.find(
            (item) => item.productId === productB.id
        );

        assert.ok(afterItemA);
        assert.ok(afterItemB);

        assert.equal(
            afterItemA.batches.length,
            1
        );

        assert.equal(
            afterItemA.batches[0].quantity,
            2
        );

        assert.equal(
            afterItemB.batches.length,
            0
        );

        console.log(
            `Order #${order.id}: preserved`
        );

        console.log(
            `OrderItems=${afterFailedDeleteOrder.items.length}`
        );

        console.log(
            `OrderItem A OrderBatches=${afterItemA.batches.length}`
        );

        console.log(
            `OrderItem B OrderBatches=${afterItemB.batches.length}`
        );

        console.log(
            "🟢 Order history was not partially deleted"
        );

        // =========================================================================
        // 8. VERIFY BATCHES WERE NOT RESTORED
        // =========================================================================

        logSection("8. VERIFY BATCHES WERE NOT PARTIALLY RESTORED");

        const afterFailedDeleteBatchA = await prisma.batch.findUnique({
            where: {
                id: batchA.id,
            },
        });

        const afterFailedDeleteBatchB = await prisma.batch.findUnique({
            where: {
                id: batchB.id,
            },
        });

        assert.ok(afterFailedDeleteBatchA);
        assert.ok(afterFailedDeleteBatchB);

        assert.equal(
            afterFailedDeleteBatchA.quantity,
            0,
            "Batch A must remain at 0"
        );

        assert.equal(
            afterFailedDeleteBatchA.status,
            "EMPTY"
        );

        assert.equal(
            afterFailedDeleteBatchB.quantity,
            2,
            "Batch B must remain at 2"
        );

        assert.equal(
            afterFailedDeleteBatchB.status,
            "ACTIVE"
        );

        console.log(
            `Batch A: quantity=${afterFailedDeleteBatchA.quantity}, status=${afterFailedDeleteBatchA.status}`
        );

        console.log(
            `Batch B: quantity=${afterFailedDeleteBatchB.quantity}, status=${afterFailedDeleteBatchB.status}`
        );

        console.log(
            "🟢 No batch was partially restored"
        );

        // =========================================================================
        // 9. VERIFY PRODUCT STOCK WAS NOT CHANGED
        // =========================================================================

        logSection("9. VERIFY PRODUCT STOCK WAS NOT CHANGED");

        const afterFailedDeleteProductA =
            await prisma.product.findUnique({
                where: {
                    id: productA.id,
                },
            });

        const afterFailedDeleteProductB =
            await prisma.product.findUnique({
                where: {
                    id: productB.id,
                },
            });

        assert.ok(afterFailedDeleteProductA);
        assert.ok(afterFailedDeleteProductB);

        assert.equal(
            afterFailedDeleteProductA.stock,
            0,
            "Product A stock must remain 0"
        );

        assert.equal(
            afterFailedDeleteProductB.stock,
            2,
            "Product B stock must remain 2"
        );

        console.log(
            `Product A stock=${afterFailedDeleteProductA.stock}`
        );

        console.log(
            `Product B stock=${afterFailedDeleteProductB.stock}`
        );

        console.log(
            "🟢 Product stock was not changed by rejected DELETE"
        );

        // =========================================================================
        // 10. VERIFY NO RESTORATION MOVEMENT
        // =========================================================================

        logSection("10. VERIFY NO RESTORATION MOVEMENT WAS CREATED");

        const movementsAfterFailedDelete =
            await prisma.movement.findMany({
                where: {
                    id: {
                        in: movementIds,
                    },
                },
                orderBy: {
                    id: "asc",
                },
            });

        assert.equal(
            movementsAfterFailedDelete.length,
            movementIds.length
        );

        const returnMovements =
            movementsAfterFailedDelete.filter(
                (movement) => movement.type === "RETURN"
            );

        assert.equal(
            returnMovements.length,
            0,
            "Rejected DELETE must not create RETURN movement"
        );

        assert.equal(
            movementsAfterFailedDelete[0]?.type,
            "SALE"
        );

        assert.equal(
            movementsAfterFailedDelete[0]?.quantity,
            -2
        );

        console.log(
            `Fixture movements=${movementsAfterFailedDelete.length}`
        );

        console.log(
            `SALE movements=${movementsAfterFailedDelete.filter(
                (movement) => movement.type === "SALE"
            ).length}`
        );

        console.log(
            `RETURN restoration movements=${returnMovements.length}`
        );

        console.log(
            "🟢 Movement history remained unchanged"
        );

        // =========================================================================
        // 11. VERIFY STOCK INVARIANT
        // =========================================================================

        logSection("11. VERIFY PRODUCT.STOCK == SUM(BATCH.QUANTITY)");

        const batchesA = await prisma.batch.findMany({
            where: {
                productId: productA.id,
            },
        });

        const batchesB = await prisma.batch.findMany({
            where: {
                productId: productB.id,
            },
        });

        const finalProductA = await prisma.product.findUnique({
            where: {
                id: productA.id,
            },
        });

        const finalProductB = await prisma.product.findUnique({
            where: {
                id: productB.id,
            },
        });

        assert.ok(finalProductA);
        assert.ok(finalProductB);

        const batchSumA = batchesA.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        const batchSumB = batchesB.reduce(
            (sum, batch) => sum + batch.quantity,
            0
        );

        assert.equal(
            finalProductA.stock,
            batchSumA,
            "Product A stock must equal batch sum"
        );

        assert.equal(
            finalProductB.stock,
            batchSumB,
            "Product B stock must equal batch sum"
        );

        console.log(
            `Product A stock=${finalProductA.stock}`
        );

        console.log(
            `Product A batch sum=${batchSumA}`
        );

        console.log(
            `Product B stock=${finalProductB.stock}`
        );

        console.log(
            `Product B batch sum=${batchSumB}`
        );

        console.log(
            "🟢 Product.stock == SUM(Batch.quantity)"
        );

        // =========================================================================
        // 12. VERIFY ORDER TOTAL/PROFIT WERE NOT CHANGED
        // =========================================================================

        logSection("12. VERIFY ORDER TOTAL AND PROFIT WERE NOT CHANGED");

        const finalOrder = await prisma.order.findUnique({
            where: {
                id: order.id,
            },
        });

        assert.ok(finalOrder);

        assert.equal(
            finalOrder.total,
            1600,
            "Order total must remain unchanged"
        );

        assert.equal(
            finalOrder.profit,
            800,
            "Order profit must remain unchanged"
        );

        assert.equal(
            finalOrder.status,
            "COMPLETED"
        );

        console.log(
            `Order total=${finalOrder.total}`
        );

        console.log(
            `Order profit=${finalOrder.profit}`
        );

        console.log(
            `Order status=${finalOrder.status}`
        );

        console.log(
            "🟢 Order financial state remained unchanged"
        );

        // =========================================================================
        // 13. REPEATED DELETE
        // =========================================================================

        logSection("13. REPEATED DELETE");

        const repeatedDelete = await requestJson(
            `/api/orders/${order.id}`,
            {
                method: "DELETE",
            }
        );

        assert.equal(
            repeatedDelete.status,
            500,
            "Repeated DELETE must continue to reject the incomplete order"
        );

        const repeatedOrderCheck =
            await prisma.order.findUnique({
                where: {
                    id: order.id,
                },
            });

        assert.ok(
            repeatedOrderCheck,
            "Order must still exist after repeated rejected DELETE"
        );

        const repeatedProductA =
            await prisma.product.findUnique({
                where: {
                    id: productA.id,
                },
            });

        const repeatedProductB =
            await prisma.product.findUnique({
                where: {
                    id: productB.id,
                },
            });

        assert.ok(repeatedProductA);
        assert.ok(repeatedProductB);

        assert.equal(
            repeatedProductA.stock,
            0
        );

        assert.equal(
            repeatedProductB.stock,
            2
        );

        console.log(
            "🟢 Repeated DELETE remained safely rejected"
        );

        // =========================================================================
        // 14. FINAL RESULT
        // =========================================================================

        logSection("V61 FINAL RESULT");

        console.log("🟢 V61 PASSED");
        console.log("");
        console.log("Проверено:");
        console.log("");
        console.log("1. Создан исторический заказ с двумя товарами.");
        console.log("2. Первый OrderItem имеет полноценный OrderBatch.");
        console.log("3. Второй OrderItem намеренно не имеет OrderBatch.");
        console.log("4. DELETE такого заказа отклоняется.");
        console.log("5. Заказ не удаляется частично.");
        console.log("6. OrderItem первого товара сохраняется.");
        console.log("7. OrderBatch первого товара сохраняется.");
        console.log("8. Неполный OrderItem второго товара сохраняется.");
        console.log("9. Batch первого товара не восстанавливается.");
        console.log("10. Batch второго товара не изменяется.");
        console.log("11. Product.stock не изменяется.");
        console.log("12. RETURN movement не создаётся.");
        console.log("13. Product.stock совпадает с SUM(Batch.quantity).");
        console.log("14. Order.total не изменяется.");
        console.log("15. Order.profit не изменяется.");
        console.log("16. Order.status не изменяется.");
        console.log("17. Повторный DELETE также безопасно отклоняется.");
        console.log("");
        console.log("Production-код не изменялся.");
        console.log("Тестовая историческая запись создана только для проверки защиты DELETE.");
    } catch (error) {
        console.error("");
        console.error("🔴 V61 FAILED");
        console.error(error);

        throw error;
    } finally {
        await cleanupTestData({
            orderId,
            productIds: [
                productAId,
                productBId,
            ].filter(
                (id): id is number => id !== null
            ),
            batchIds: [
                batchAId,
                batchBId,
            ].filter(
                (id): id is number => id !== null
            ),
            movementIds,
        });

        await prisma.$disconnect();
    }
}

main().catch(() => {
    process.exitCode = 1;
});
