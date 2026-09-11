import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERT FAILED: ${message}`);
  }
}

async function requestJson(
  url: string,
  options?: RequestInit
): Promise<{
  status: number;
  body: any;
}> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  let body: any = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body,
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function cleanup(
  productId: number | null,
  supplierId: number | null
) {
  console.log("");
  console.log("CLEANUP");
  console.log("------------------------------------------------------------------------------");

  /*
   * ВАЖНО:
   *
   * Удаляем данные строго от зависимых записей к родительским.
   *
   * 1. ReturnBatch
   * 2. OrderBatch
   * 3. OrderItem
   * 4. Order
   * 5. Movement
   * 6. SupplyItem
   * 7. Batch
   * 8. Supply
   * 9. Product
   * 10. Supplier
   *
   * Это предотвращает ошибки FOREIGN KEY при удалении Product/Supplier.
   */

  if (productId !== null) {
    console.log(`Cleaning Product #${productId}`);

    // -------------------------------------------------------------------------
    // 1. RETURNBATCH
    // -------------------------------------------------------------------------

    await prisma.returnBatch.deleteMany({
      where: {
        OrderItem: {
          productId,
        },
      },
    });

    console.log("✓ ReturnBatch deleted");

    // -------------------------------------------------------------------------
    // 2. ORDERBATCH
    // -------------------------------------------------------------------------

    await prisma.orderBatch.deleteMany({
      where: {
        orderItem: {
          productId,
        },
      },
    });

    console.log("✓ OrderBatch deleted");

    // -------------------------------------------------------------------------
    // 3. ORDERITEM
    // -------------------------------------------------------------------------

    await prisma.orderItem.deleteMany({
      where: {
        productId,
      },
    });

    console.log("✓ OrderItem deleted");

    // -------------------------------------------------------------------------
    // 4. ORDER
    // -------------------------------------------------------------------------

    await prisma.order.deleteMany({
      where: {
        items: {
          some: {
            productId,
          },
        },
      },
    });

    console.log("✓ Order deleted");

    // -------------------------------------------------------------------------
    // 5. MOVEMENT
    // -------------------------------------------------------------------------

    await prisma.movement.deleteMany({
      where: {
        productId,
      },
    });

    console.log("✓ Movement deleted");

    // -------------------------------------------------------------------------
    // 6. SUPPLYITEM
    // -------------------------------------------------------------------------

    await prisma.supplyItem.deleteMany({
      where: {
        productId,
      },
    });

    console.log("✓ SupplyItem deleted");

    // -------------------------------------------------------------------------
    // 7. BATCH
    // -------------------------------------------------------------------------

    await prisma.batch.deleteMany({
      where: {
        productId,
      },
    });

    console.log("✓ Batch deleted");

    // -------------------------------------------------------------------------
    // 8. SUPPLY
    // -------------------------------------------------------------------------

    if (supplierId !== null) {
      await prisma.supply.deleteMany({
        where: {
          supplierId,
        },
      });

      console.log("✓ Supply deleted");
    }

    // -------------------------------------------------------------------------
    // 9. PRODUCT
    // -------------------------------------------------------------------------

    await prisma.product.deleteMany({
      where: {
        id: productId,
      },
    });

    console.log("✓ Product deleted");
  }

  // ===========================================================================
  // 10. SUPPLIER
  // ===========================================================================

  if (supplierId !== null) {
    await prisma.supplier.deleteMany({
      where: {
        id: supplierId,
      },
    });

    console.log("✓ Supplier deleted");
  }

  console.log("Cleanup complete.");
}

async function main() {
  console.log("");
  console.log("==============================================================================");
  console.log("V51 DELETE AFTER MULTI-RETURN E2E");
  console.log("NO HARDCODED BATCH A/B REFERENCES");
  console.log("==============================================================================");
  console.log("");

  let productId: number | null = null;
  let supplierId: number | null = null;

  try {
    // =========================================================================
    // 1. CREATE PRODUCT
    // =========================================================================

    console.log("1. CREATE PRODUCT");
    console.log("------------------------------------------------------------------------------");

    const product = await prisma.product.create({
      data: {
        name: `V51 Test Product ${Date.now()}`,
        unit: "шт",
        price: 300,
        cost: 0,
        stock: 0,
      },
    });

    productId = product.id;

    console.log(`Product #${product.id}`);
    console.log(`Price=${product.price}`);
    console.log(`Initial stock=${product.stock}`);
    console.log("");

    assert(product.stock === 0, "Initial Product.stock must be 0");

    // =========================================================================
    // 2. CREATE SUPPLIER
    // =========================================================================

    console.log("2. CREATE SUPPLIER");
    console.log("------------------------------------------------------------------------------");

    const supplier = await prisma.supplier.create({
      data: {
        name: `V51 Supplier ${Date.now()}`,
      },
    });

    supplierId = supplier.id;

    console.log(`Supplier #${supplier.id}`);
    console.log("");

    // =========================================================================
    // 3. CREATE FIRST SUPPLY
    // =========================================================================

    console.log("3. CREATE FIRST SUPPLY");
    console.log("------------------------------------------------------------------------------");

    const expiryFirst = new Date();
    expiryFirst.setDate(expiryFirst.getDate() + 30);

    const supplyFirstResponse = await requestJson(
      `${BASE_URL}/api/supplies`,
      {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplier.id,
          items: [
            {
              id: product.id,
              quantity: 3,
              cost: 100,
              expiryDate: formatLocalDate(expiryFirst),
            },
          ],
        }),
      }
    );

    console.log(`HTTP ${supplyFirstResponse.status}`);
    console.log(JSON.stringify(supplyFirstResponse.body, null, 2));
    console.log("");

    assert(
      supplyFirstResponse.status === 200,
      `First supply must return 200, got ${supplyFirstResponse.status}`
    );

    // =========================================================================
    // 4. CREATE SECOND SUPPLY
    // =========================================================================

    console.log("4. CREATE SECOND SUPPLY");
    console.log("------------------------------------------------------------------------------");

    const expirySecond = new Date();
    expirySecond.setDate(expirySecond.getDate() + 60);

    const supplySecondResponse = await requestJson(
      `${BASE_URL}/api/supplies`,
      {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplier.id,
          items: [
            {
              id: product.id,
              quantity: 3,
              cost: 120,
              expiryDate: formatLocalDate(expirySecond),
            },
          ],
        }),
      }
    );

    console.log(`HTTP ${supplySecondResponse.status}`);
    console.log(JSON.stringify(supplySecondResponse.body, null, 2));
    console.log("");

    assert(
      supplySecondResponse.status === 200,
      `Second supply must return 200, got ${supplySecondResponse.status}`
    );

    const batchesAfterSupply = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
    });

    assert(
      batchesAfterSupply.length === 2,
      `Expected exactly 2 test batches, got ${batchesAfterSupply.length}`
    );

    const suppliedQuantities = batchesAfterSupply.map(
      (batch) => batch.quantity
    );

    const suppliedCosts = batchesAfterSupply.map(
      (batch) => batch.purchaseCost
    );

    assert(
      suppliedQuantities.every((quantity) => quantity === 3),
      "Every test batch must contain 3 units after supply"
    );

    assert(
      suppliedCosts.includes(100),
      "One test batch must have purchaseCost=100"
    );

    assert(
      suppliedCosts.includes(120),
      "One test batch must have purchaseCost=120"
    );

    const productAfterSupply = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(productAfterSupply !== null, "Product must exist after supplies");

    console.log(
      `Test batches=${batchesAfterSupply
        .map(
          (batch) =>
            `#${batch.id} qty=${batch.quantity} cost=${batch.purchaseCost}`
        )
        .join(" | ")}`
    );

    console.log(`Product.stock after supplies=${productAfterSupply.stock}`);
    console.log("");

    assert(
      productAfterSupply.stock === 6,
      `Product.stock after supplies must be 6, got ${productAfterSupply.stock}`
    );

    // =========================================================================
    // 5. CREATE ORDER
    // =========================================================================

    console.log("5. CREATE ORDER");
    console.log("------------------------------------------------------------------------------");

    const orderResponse = await requestJson(`${BASE_URL}/api/orders`, {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: product.id,
            quantity: 6,
            price: 300,
          },
        ],
      }),
    });

    console.log(`HTTP ${orderResponse.status}`);
    console.log(JSON.stringify(orderResponse.body, null, 2));
    console.log("");

    assert(
      orderResponse.status === 200 || orderResponse.status === 201,
      `Order creation must return 200/201, got ${orderResponse.status}`
    );

    const orderId =
      orderResponse.body?.data?.id ??
      orderResponse.body?.order?.id ??
      orderResponse.body?.id;

    assert(
      typeof orderId === "number",
      "Order creation response must contain numeric order id"
    );

    console.log(`Order #${orderId}`);
    console.log("");

    // =========================================================================
    // 6. LOAD ACTUAL ORDERBATCH HISTORY
    // =========================================================================

    console.log("6. LOAD ACTUAL ORDERBATCH HISTORY");
    console.log("------------------------------------------------------------------------------");

    const orderAfterSale = await prisma.order.findUnique({
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

    assert(orderAfterSale !== null, `Order #${orderId} must exist`);
    assert(
      orderAfterSale.items.length === 1,
      "Test order must contain exactly one OrderItem"
    );

    const orderItem = orderAfterSale.items[0];

    assert(
      orderItem.batches.length === 2,
      `Sale must create exactly 2 OrderBatch records, got ${orderItem.batches.length}`
    );

    const soldBatchLinks = orderItem.batches.map((link) => ({
      orderBatchId: link.id,
      batchId: link.batchId,
      sold: link.quantity,
      purchaseCost: link.purchaseCost,
    }));

    console.log("Actual sold batches:");

    for (const link of soldBatchLinks) {
      console.log(
        `OrderBatch #${link.orderBatchId} | Batch #${link.batchId} | ` +
          `sold=${link.sold} | purchaseCost=${link.purchaseCost}`
      );
    }

    console.log("");

    const totalSold = soldBatchLinks.reduce(
      (sum, link) => sum + link.sold,
      0
    );

    assert(totalSold === 6, `Total sold quantity must be 6, got ${totalSold}`);

    assert(
      soldBatchLinks.every((link) => link.sold === 3),
      "Each actual sold batch must contain 3 sold units"
    );

    assert(
      soldBatchLinks.some((link) => link.purchaseCost === 100),
      "Actual sale must include purchaseCost=100 batch"
    );

    assert(
      soldBatchLinks.some((link) => link.purchaseCost === 120),
      "Actual sale must include purchaseCost=120 batch"
    );

    // =========================================================================
    // 7. VERIFY SALE FINANCIALS AND STOCK
    // =========================================================================

    console.log("7. VERIFY SALE");
    console.log("------------------------------------------------------------------------------");

    console.log(`Order total=${orderAfterSale.total}`);
    console.log(`Order profit=${orderAfterSale.profit}`);
    console.log(`Order status=${orderAfterSale.status}`);
    console.log(`OrderItem quantity=${orderItem.quantity}`);
    console.log("");

    assert(orderItem.quantity === 6, "OrderItem quantity must be 6");
    assert(orderAfterSale.total === 1800, "Gross order total must be 1800");
    assert(orderAfterSale.profit === 1140, "Gross order profit must be 1140");
    assert(
      orderAfterSale.status === "COMPLETED",
      "Order status must be COMPLETED after sale"
    );

    const productAfterSale = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(productAfterSale !== null, "Product must exist after sale");

    console.log(`Product.stock after sale=${productAfterSale.stock}`);
    console.log("");

    assert(
      productAfterSale.stock === 0,
      `Product.stock after sale must be 0, got ${productAfterSale.stock}`
    );

    // =========================================================================
    // 8. PERFORM FOUR RETURNS
    // =========================================================================

    console.log("8. PERFORM FOUR RETURNS");
    console.log("------------------------------------------------------------------------------");

    const expectedAfterReturns = [
      {
        total: 1500,
        profit: 960,
        status: "PARTIAL_RETURN",
      },
      {
        total: 1200,
        profit: 780,
        status: "PARTIAL_RETURN",
      },
      {
        total: 900,
        profit: 600,
        status: "PARTIAL_RETURN",
      },
      {
        total: 600,
        profit: 400,
        status: "PARTIAL_RETURN",
      },
    ];

    for (let index = 0; index < 4; index += 1) {
      const returnNumber = index + 1;

      const response = await requestJson(
        `${BASE_URL}/api/orders/${orderId}/return`,
        {
          method: "POST",
          body: JSON.stringify({
            itemId: orderItem.id,
            quantity: 1,
          }),
        }
      );

      console.log(
        `Return #${returnNumber}: HTTP ${response.status}`
      );

      assert(
        response.status === 200,
        `Return #${returnNumber} must return 200, got ${response.status}`
      );

      const currentOrder = await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

      assert(
        currentOrder !== null,
        `Order must exist after return #${returnNumber}`
      );

      const expected = expectedAfterReturns[index];

      console.log(
        `After return #${returnNumber}: ` +
          `total=${currentOrder.total} ` +
          `profit=${currentOrder.profit} ` +
          `status=${currentOrder.status}`
      );

      assert(
        currentOrder.total === expected.total,
        `Return #${returnNumber}: expected total ${expected.total}, got ${currentOrder.total}`
      );

      assert(
        currentOrder.profit === expected.profit,
        `Return #${returnNumber}: expected profit ${expected.profit}, got ${currentOrder.profit}`
      );

      assert(
        currentOrder.status === expected.status,
        `Return #${returnNumber}: expected status ${expected.status}, got ${currentOrder.status}`
      );
    }

    console.log("");

    // =========================================================================
    // 9. RELOAD ACTUAL RETURN HISTORY
    // =========================================================================

    console.log("9. RELOAD ACTUAL RETURN HISTORY");
    console.log("------------------------------------------------------------------------------");

    const orderBeforeDelete = await prisma.order.findUnique({
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

    assert(orderBeforeDelete !== null, "Order must exist before DELETE");
    assert(
      orderBeforeDelete.items.length === 1,
      "Order must contain exactly one item before DELETE"
    );

    const orderItemBeforeDelete = orderBeforeDelete.items[0];

    const returnedByBatch = new Map<number, number>();

    for (const returnBatch of orderItemBeforeDelete.ReturnBatch) {
      const batchId = returnBatch.batchId;

      assert(
        typeof batchId === "number",
        "ReturnBatch.batchId must be a number"
      );

      returnedByBatch.set(
        batchId,
        (returnedByBatch.get(batchId) ?? 0) + returnBatch.quantity
      );
    }

    console.log("Actual return allocation:");

    for (const [batchId, quantity] of returnedByBatch.entries()) {
      console.log(`Batch #${batchId} | returned=${quantity}`);
    }

    console.log("");

    const totalReturned = Array.from(returnedByBatch.values()).reduce(
      (sum, quantity) => sum + quantity,
      0
    );

    assert(
      totalReturned === 4,
      `Total returned before DELETE must be 4, got ${totalReturned}`
    );

    // =========================================================================
    // 10. BUILD DYNAMIC BATCH STATE
    // =========================================================================

    console.log("10. BUILD DYNAMIC BATCH STATE");
    console.log("------------------------------------------------------------------------------");

    const batchStates = [];

    for (const soldLink of orderItemBeforeDelete.batches) {
      const batch = await prisma.batch.findUnique({
        where: {
          id: soldLink.batchId,
        },
      });

      assert(
        batch !== null,
        `Sold Batch #${soldLink.batchId} must exist before DELETE`
      );

      const returned = returnedByBatch.get(soldLink.batchId) ?? 0;

      batchStates.push({
        orderBatchId: soldLink.id,
        batchId: soldLink.batchId,
        sold: soldLink.quantity,
        returned,
        currentQuantity: batch.quantity,
        status: batch.status,
        purchaseCost: soldLink.purchaseCost,
      });
    }

    for (const state of batchStates) {
      console.log(
        `OrderBatch #${state.orderBatchId} | ` +
          `Batch #${state.batchId} | ` +
          `sold=${state.sold} | ` +
          `returned=${state.returned} | ` +
          `current=${state.currentQuantity} | ` +
          `status=${state.status} | ` +
          `purchaseCost=${state.purchaseCost}`
      );
    }

    console.log("");

    assert(
      batchStates.length === 2,
      `Expected 2 dynamic batch states, got ${batchStates.length}`
    );

    for (const state of batchStates) {
      assert(
        state.currentQuantity === state.returned,
        `Batch #${state.batchId}: current quantity must equal returned quantity`
      );

      assert(
        state.sold - state.returned >= 0,
        `Batch #${state.batchId}: returned quantity cannot exceed sold quantity`
      );
    }

    // =========================================================================
    // 11. IDENTIFY LIFO RETURN TARGET DYNAMICALLY
    // =========================================================================

    console.log("11. IDENTIFY LIFO RETURN TARGET DYNAMICALLY");
    console.log("------------------------------------------------------------------------------");

    const lifoReturnTarget = batchStates.find(
      (state) => state.returned === state.sold
    );

    assert(
      lifoReturnTarget !== undefined,
      "One actual sold batch must have been completely returned"
    );

    const partiallyReturnedBatch = batchStates.find(
      (state) => state.returned > 0 && state.returned < state.sold
    );

    assert(
      partiallyReturnedBatch !== undefined,
      "One actual sold batch must be partially returned"
    );

    console.log(
      `Fully returned batch: #${lifoReturnTarget.batchId} ` +
        `(sold=${lifoReturnTarget.sold}, returned=${lifoReturnTarget.returned})`
    );

    console.log(
      `Partially returned batch: #${partiallyReturnedBatch.batchId} ` +
        `(sold=${partiallyReturnedBatch.sold}, returned=${partiallyReturnedBatch.returned})`
    );

    console.log("");

    assert(
      lifoReturnTarget.returned === 3,
      "The fully returned batch must contain 3 returned units"
    );

    assert(
      partiallyReturnedBatch.returned === 1,
      "The partially returned batch must contain 1 returned unit"
    );

    // =========================================================================
    // 12. MARK FULLY RETURNED BATCH EXPIRED
    // =========================================================================

    console.log("12. MARK FULLY RETURNED BATCH EXPIRED");
    console.log("------------------------------------------------------------------------------");

    await prisma.batch.update({
      where: {
        id: lifoReturnTarget.batchId,
      },
      data: {
        status: "EXPIRED",
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const expiredBatch = await prisma.batch.findUnique({
      where: {
        id: lifoReturnTarget.batchId,
      },
    });

    assert(
      expiredBatch !== null,
      `Batch #${lifoReturnTarget.batchId} must exist after expiry fixture`
    );

    console.log(
      `Batch #${expiredBatch.id} | ` +
        `quantity=${expiredBatch.quantity} | ` +
        `status=${expiredBatch.status}`
    );

    console.log("");

    assert(
      expiredBatch.status === "EXPIRED",
      "Selected returned batch must be EXPIRED before DELETE"
    );

    assert(
      expiredBatch.quantity === lifoReturnTarget.returned,
      "Marking batch expired must not change its quantity"
    );

    // =========================================================================
    // 13. SNAPSHOT ACTUAL BATCH STATES BEFORE DELETE
    // =========================================================================

    console.log("13. SNAPSHOT ACTUAL BATCH STATES BEFORE DELETE");
    console.log("------------------------------------------------------------------------------");

    const batchSnapshotBeforeDelete = new Map<
      number,
      {
        quantity: number;
        status: string;
        sold: number;
        returned: number;
      }
    >();

    for (const state of batchStates) {
      const currentBatch = await prisma.batch.findUnique({
        where: {
          id: state.batchId,
        },
      });

      assert(
        currentBatch !== null,
        `Batch #${state.batchId} must exist before DELETE snapshot`
      );

      batchSnapshotBeforeDelete.set(state.batchId, {
        quantity: currentBatch.quantity,
        status: currentBatch.status,
        sold: state.sold,
        returned: state.returned,
      });

      console.log(
        `Batch #${state.batchId} | ` +
          `quantity=${currentBatch.quantity} | ` +
          `status=${currentBatch.status} | ` +
          `sold=${state.sold} | ` +
          `returned=${state.returned}`
      );
    }

    console.log("");

    const productBeforeDelete = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(
      productBeforeDelete !== null,
      "Product must exist before DELETE"
    );

    console.log(
      `Product.stock before DELETE=${productBeforeDelete.stock}`
    );

    console.log("");

    assert(
      productBeforeDelete.stock === 4,
      `Product.stock before DELETE must be 4, got ${productBeforeDelete.stock}`
    );

    // =========================================================================
    // 14. SNAPSHOT MOVEMENTS BEFORE DELETE
    // =========================================================================

    console.log("14. SNAPSHOT MOVEMENTS BEFORE DELETE");
    console.log("------------------------------------------------------------------------------");

    const movementsBeforeDelete = await prisma.movement.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const movementIdsBeforeDelete = new Set(
      movementsBeforeDelete.map((movement) => movement.id)
    );

    const supplyMovementsBeforeDelete = movementsBeforeDelete.filter(
      (movement) => movement.type === "SUPPLY"
    );

    const saleMovementsBeforeDelete = movementsBeforeDelete.filter(
      (movement) => movement.type === "SALE"
    );

    const returnMovementsBeforeDelete = movementsBeforeDelete.filter(
      (movement) => movement.type === "RETURN"
    );

    const writeOffMovementsBeforeDelete = movementsBeforeDelete.filter(
      (movement) => movement.type === "WRITE_OFF"
    );

    console.log(`Total movements=${movementsBeforeDelete.length}`);
    console.log(`SUPPLY=${supplyMovementsBeforeDelete.length}`);
    console.log(`SALE=${saleMovementsBeforeDelete.length}`);
    console.log(`RETURN=${returnMovementsBeforeDelete.length}`);
    console.log(`WRITE_OFF=${writeOffMovementsBeforeDelete.length}`);
    console.log("");

    assert(
      supplyMovementsBeforeDelete.length === 2,
      "There must be exactly 2 SUPPLY movements before DELETE"
    );

    assert(
      saleMovementsBeforeDelete.length === 1,
      "There must be exactly 1 SALE movement before DELETE"
    );

    assert(
      returnMovementsBeforeDelete.length === 4,
      "There must be exactly 4 RETURN movements before DELETE"
    );

    assert(
      writeOffMovementsBeforeDelete.length === 0,
      "There must be 0 WRITE_OFF movements before DELETE"
    );

    // =========================================================================
    // 15. DELETE ORDER
    // =========================================================================

    console.log("15. DELETE ORDER");
    console.log("------------------------------------------------------------------------------");

    const deleteResponse = await requestJson(
      `${BASE_URL}/api/orders/${orderId}`,
      {
        method: "DELETE",
      }
    );

    console.log(`HTTP ${deleteResponse.status}`);
    console.log(JSON.stringify(deleteResponse.body, null, 2));
    console.log("");

    assert(
      deleteResponse.status === 200,
      `DELETE must return 200, got ${deleteResponse.status}`
    );

    // =========================================================================
    // 16. VERIFY ORDER RECORDS ARE GONE
    // =========================================================================

    console.log("16. VERIFY ORDER RECORDS ARE GONE");
    console.log("------------------------------------------------------------------------------");

    const deletedOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });

    assert(
      deletedOrder === null,
      "Order must be deleted"
    );

    const remainingOrderItems = await prisma.orderItem.findMany({
      where: {
        orderId,
      },
    });

    assert(
      remainingOrderItems.length === 0,
      "OrderItems must be deleted"
    );

    const remainingOrderBatches = await prisma.orderBatch.findMany({
      where: {
        orderItem: {
          orderId,
        },
      },
    });

    assert(
      remainingOrderBatches.length === 0,
      "OrderBatch records must be deleted"
    );

    const remainingReturnBatches = await prisma.returnBatch.findMany({
      where: {
        OrderItem: {
          orderId,
        },
      },
    });

    assert(
      remainingReturnBatches.length === 0,
      "ReturnBatch records must be deleted"
    );

    console.log("Order records successfully removed.");
    console.log("");

    // =========================================================================
    // 17. VERIFY DYNAMIC BATCH RESTORATION
    // =========================================================================

    console.log("17. VERIFY DYNAMIC BATCH RESTORATION");
    console.log("------------------------------------------------------------------------------");

    let expectedFinalStock = 0;

    for (const [batchId, snapshot] of batchSnapshotBeforeDelete.entries()) {
      const finalBatch = await prisma.batch.findUnique({
        where: {
          id: batchId,
        },
      });

      assert(
        finalBatch !== null,
        `Batch #${batchId} must exist after DELETE`
      );

      const quantityToRestore =
        snapshot.sold - snapshot.returned;

      const expectedQuantity =
        snapshot.quantity + quantityToRestore;

      expectedFinalStock += expectedQuantity;

      console.log(
        `Batch #${batchId}: ` +
          `before=${snapshot.quantity} | ` +
          `sold=${snapshot.sold} | ` +
          `returned=${snapshot.returned} | ` +
          `restore=${quantityToRestore} | ` +
          `expected=${expectedQuantity} | ` +
          `actual=${finalBatch.quantity} | ` +
          `status=${finalBatch.status}`
      );

      assert(
        finalBatch.quantity === expectedQuantity,
        `Batch #${batchId}: expected quantity ${expectedQuantity}, got ${finalBatch.quantity}`
      );

      assert(
        finalBatch.status === snapshot.status,
        `Batch #${batchId}: status changed from ${snapshot.status} to ${finalBatch.status}`
      );
    }

    const finalProductAfterRestore = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(
      finalProductAfterRestore !== null,
      "Product must exist after DELETE restoration"
    );

    console.log(
      `Expected final Product.stock=${expectedFinalStock}`
    );

    console.log(
      `Actual final Product.stock=${finalProductAfterRestore.stock}`
    );

    console.log("");

    assert(
      expectedFinalStock === 6,
      `Expected final stock must be 6, got ${expectedFinalStock}`
    );

    assert(
      finalProductAfterRestore.stock === expectedFinalStock,
      `Product.stock must be ${expectedFinalStock}, got ${finalProductAfterRestore.stock}`
    );

    // =========================================================================
    // 18. VERIFY EXPIRED STATUS PRESERVATION
    // =========================================================================

    console.log("18. VERIFY EXPIRED STATUS PRESERVATION");
    console.log("------------------------------------------------------------------------------");

    const finalExpiredTarget = await prisma.batch.findUnique({
      where: {
        id: lifoReturnTarget.batchId,
      },
    });

    assert(
      finalExpiredTarget !== null,
      `Selected expired Batch #${lifoReturnTarget.batchId} must exist`
    );

    console.log(
      `Batch #${finalExpiredTarget.id} after DELETE: ` +
        `quantity=${finalExpiredTarget.quantity} | ` +
        `status=${finalExpiredTarget.status}`
    );

    console.log("");

    assert(
      finalExpiredTarget.status === "EXPIRED",
      "Expired batch status must be preserved by DELETE"
    );

    assert(
      finalExpiredTarget.quantity === 3,
      "Fully returned expired batch must be restored to its original sold quantity"
    );

    // =========================================================================
    // 19. VERIFY BATCH SUM
    // =========================================================================

    console.log("19. VERIFY PRODUCT STOCK = BATCH SUM");
    console.log("------------------------------------------------------------------------------");

    const finalBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
    });

    const finalBatchSum = finalBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(`Final batch count=${finalBatches.length}`);
    console.log(`Final batch sum=${finalBatchSum}`);
    console.log(`Product.stock=${finalProductAfterRestore.stock}`);
    console.log("");

    assert(
      finalBatchSum === 6,
      `Final batch sum must be 6, got ${finalBatchSum}`
    );

    assert(
      finalBatchSum === finalProductAfterRestore.stock,
      "Product.stock must equal SUM(Batch.quantity)"
    );

    // =========================================================================
    // 20. VERIFY DELETE RESTORATION MOVEMENT
    // =========================================================================

    console.log("20. VERIFY DELETE RESTORATION MOVEMENT");
    console.log("------------------------------------------------------------------------------");

    const movementsAfterDelete = await prisma.movement.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const newReturnMovements = movementsAfterDelete.filter(
      (movement) =>
        movement.type === "RETURN" &&
        !movementIdsBeforeDelete.has(movement.id)
    );

    console.log(
      `Total movements after DELETE=${movementsAfterDelete.length}`
    );

    console.log(
      `New RETURN movements=${newReturnMovements.length}`
    );

    for (const movement of newReturnMovements) {
      console.log(
        `Movement #${movement.id} | ` +
          `type=${movement.type} | ` +
          `quantity=${movement.quantity} | ` +
          `comment=${movement.comment ?? ""}`
      );
    }

    console.log("");

    assert(
      newReturnMovements.length === 1,
      `DELETE must create exactly 1 new RETURN movement, got ${newReturnMovements.length}`
    );

    const deleteRestorationMovement = newReturnMovements[0];

    assert(
      deleteRestorationMovement.quantity === 2,
      `DELETE restoration movement must be +2, got ${deleteRestorationMovement.quantity}`
    );

    // =========================================================================
    // 21. VERIFY COMPLETE MOVEMENT TOTALS
    // =========================================================================

    console.log("21. VERIFY COMPLETE MOVEMENT TOTALS");
    console.log("------------------------------------------------------------------------------");

    const finalSupplyMovements = movementsAfterDelete.filter(
      (movement) => movement.type === "SUPPLY"
    );

    const finalSaleMovements = movementsAfterDelete.filter(
      (movement) => movement.type === "SALE"
    );

    const finalReturnMovements = movementsAfterDelete.filter(
      (movement) => movement.type === "RETURN"
    );

    const finalWriteOffMovements = movementsAfterDelete.filter(
      (movement) => movement.type === "WRITE_OFF"
    );

    const supplyNet = finalSupplyMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const saleNet = finalSaleMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const returnNet = finalReturnMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const writeOffNet = finalWriteOffMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const movementNet =
      supplyNet +
      saleNet +
      returnNet +
      writeOffNet;

    console.log(`SUPPLY movements=${finalSupplyMovements.length}`);
    console.log(`SUPPLY net=${supplyNet}`);

    console.log(`SALE movements=${finalSaleMovements.length}`);
    console.log(`SALE net=${saleNet}`);

    console.log(`RETURN movements=${finalReturnMovements.length}`);
    console.log(`RETURN net=${returnNet}`);

    console.log(`WRITE_OFF movements=${finalWriteOffMovements.length}`);
    console.log(`WRITE_OFF net=${writeOffNet}`);

    console.log(`Movement NET=${movementNet}`);
    console.log("");

    assert(
      movementsAfterDelete.length === 8,
      `Expected 8 total movements after DELETE, got ${movementsAfterDelete.length}`
    );

    assert(
      finalSupplyMovements.length === 2,
      "Expected 2 SUPPLY movements after DELETE"
    );

    assert(
      finalSaleMovements.length === 1,
      "Expected 1 SALE movement after DELETE"
    );

    assert(
      finalReturnMovements.length === 5,
      "Expected 5 RETURN movements after DELETE"
    );

    assert(
      finalWriteOffMovements.length === 0,
      "Expected 0 WRITE_OFF movements after DELETE"
    );

    assert(
      supplyNet === 6,
      `SUPPLY net must be +6, got ${supplyNet}`
    );

    assert(
      saleNet === -6,
      `SALE net must be -6, got ${saleNet}`
    );

    assert(
      returnNet === 6,
      `RETURN net must be +6, got ${returnNet}`
    );

    assert(
      writeOffNet === 0,
      `WRITE_OFF net must be 0, got ${writeOffNet}`
    );

    assert(
      movementNet === 6,
      `Final movement NET must be +6, got ${movementNet}`
    );

    // =========================================================================
    // 22. REPEATED DELETE MUST RETURN 404
    // =========================================================================

    console.log("22. REPEATED DELETE");
    console.log("------------------------------------------------------------------------------");

    const movementCountBeforeRepeatedDelete = await prisma.movement.count({
      where: {
        productId: product.id,
      },
    });

    const productBeforeRepeatedDelete = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(
      productBeforeRepeatedDelete !== null,
      "Product must exist before repeated DELETE"
    );

    const stockBeforeRepeatedDelete =
      productBeforeRepeatedDelete.stock;

    const repeatedDeleteResponse = await requestJson(
      `${BASE_URL}/api/orders/${orderId}`,
      {
        method: "DELETE",
      }
    );

    console.log(`HTTP ${repeatedDeleteResponse.status}`);
    console.log(
      JSON.stringify(repeatedDeleteResponse.body, null, 2)
    );
    console.log("");

    assert(
      repeatedDeleteResponse.status === 404,
      `Repeated DELETE must return 404, got ${repeatedDeleteResponse.status}`
    );

    assert(
      repeatedDeleteResponse.body?.error === "Заказ не найден",
      `Repeated DELETE error must be "Заказ не найден", got ${JSON.stringify(
        repeatedDeleteResponse.body
      )}`
    );

    const movementCountAfterRepeatedDelete =
      await prisma.movement.count({
        where: {
          productId: product.id,
        },
      });

    const productAfterRepeatedDelete =
      await prisma.product.findUnique({
        where: {
          id: product.id,
        },
      });

    assert(
      productAfterRepeatedDelete !== null,
      "Product must exist after repeated DELETE"
    );

    assert(
      movementCountAfterRepeatedDelete === movementCountBeforeRepeatedDelete,
      "Repeated DELETE must not create movements"
    );

    assert(
      productAfterRepeatedDelete.stock === stockBeforeRepeatedDelete,
      "Repeated DELETE must not change stock"
    );

    // =========================================================================
    // 23. FINAL RESULT
    // =========================================================================

    console.log("23. FINAL RESULT");
    console.log("------------------------------------------------------------------------------");

    console.log("🟢 V51 PASSED");
    console.log("");
    console.log("Verified:");
    console.log("- Actual OrderBatch records are used as the source of batch identity");
    console.log("- No hardcoded Batch A / Batch B IDs");
    console.log("- No dependency on findMany array positions");
    console.log("- Sale across two actual batches");
    console.log("- Four sequential returns");
    console.log("- LIFO return allocation");
    console.log("- Actual fully-returned batch marked EXPIRED");
    console.log("- DELETE restores sold minus already-returned quantity");
    console.log("- Restoration is calculated independently for every actual batch");
    console.log("- EXPIRED status is preserved");
    console.log("- Product.stock restored exactly");
    console.log("- Product.stock equals SUM(Batch.quantity)");
    console.log("- DELETE creates exactly one additional RETURN movement");
    console.log("- DELETE restoration movement quantity = +2");
    console.log("- Final movement totals are consistent");
    console.log("- Repeated DELETE returns 404 without side effects");
    console.log("");
    console.log("==============================================================================");
    console.log("V51 PASSED");
    console.log("==============================================================================");
    console.log("");
  } finally {
    await cleanup(productId, supplierId);
  }
}

main().catch((error) => {
  console.error("");
  console.error("🔴 V51 FAILED");
  console.error(error);
  process.exitCode = 1;
});