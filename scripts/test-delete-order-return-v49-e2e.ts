import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";

const TEST_PRODUCT_NAME = "V49_DELETE_RETURN_TEST Молоко";
const TEST_SUPPLIER_NAME = "V49_DELETE_RETURN_SUPPLIER";

function assert(condition: unknown, message: string): asserts condition {
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let parsed: any = null;

  try {
    parsed = await response.json();
  } catch {
    // Some error responses may not contain JSON.
  }

  return {
    status: response.status,
    body: parsed,
  };
}

function localDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function futureDate(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function pastDate(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function section(title: string) {
  console.log("");
  console.log(title);
  console.log("----------------------------------------------------------------------");
}

async function cleanup() {
  section("V49 CLEANUP");

  const products = await prisma.product.findMany({
    where: {
      name: TEST_PRODUCT_NAME,
    },
    select: {
      id: true,
    },
  });

  const productIds = products.map((product) => product.id);

  if (productIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      /*
       * OrderItem → OrderBatch / ReturnBatch have cascade from OrderItem,
       * but ReturnBatch itself must be removed before an OrderItem if
       * there are any records not covered by cascade in the current DB.
       */

      await tx.returnBatch.deleteMany({
        where: {
          OrderItem: {
            productId: {
              in: productIds,
            },
          },
        },
      });

      await tx.orderBatch.deleteMany({
        where: {
          orderItem: {
            productId: {
              in: productIds,
            },
          },
        },
      });

      const orderItems = await tx.orderItem.findMany({
        where: {
          productId: {
            in: productIds,
          },
        },
        select: {
          orderId: true,
        },
      });

      const orderIds = Array.from(
        new Set(orderItems.map((item) => item.orderId))
      );

      await tx.orderItem.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      if (orderIds.length > 0) {
        await tx.order.deleteMany({
          where: {
            id: {
              in: orderIds,
            },
          },
        });
      }

      await tx.supplyItem.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      await tx.movement.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      await tx.batch.deleteMany({
        where: {
          productId: {
            in: productIds,
          },
        },
      });

      await tx.product.deleteMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });
    });

    console.log(`Products cleaned=${productIds.length}`);
  } else {
    console.log("No old V49 products found");
  }

  await prisma.supply.deleteMany({
    where: {
      Supplier: {
        name: TEST_SUPPLIER_NAME,
      },
    },
  });

  const suppliers = await prisma.supplier.deleteMany({
    where: {
      name: TEST_SUPPLIER_NAME,
    },
  });

  console.log(`Suppliers cleaned=${suppliers.count}`);

  const remainingProducts = await prisma.product.count({
    where: {
      name: TEST_PRODUCT_NAME,
    },
  });

  const remainingSuppliers = await prisma.supplier.count({
    where: {
      name: TEST_SUPPLIER_NAME,
    },
  });

  assert(
    remainingProducts === 0,
    `V49 cleanup failed: ${remainingProducts} test products remain`
  );

  assert(
    remainingSuppliers === 0,
    `V49 cleanup failed: ${remainingSuppliers} test suppliers remain`
  );

  console.log("🟢 Cleanup verification passed");
}

async function main() {
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("V49 — DELETE ORDER + RETURN + BATCH RESTORATION E2E");
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("STRICTLY ISOLATED TEST DATA");
  console.log("");
  console.log("Scenario:");
  console.log("");
  console.log("  Supply Batch A = 2");
  console.log("  Supply Batch B = 3");
  console.log("  Sale = 5");
  console.log("  Return = 2");
  console.log("  DELETE ORDER");
  console.log("");
  console.log("Expected after DELETE:");
  console.log("");
  console.log("  Batch A restored +2");
  console.log("  Batch B restored +1");
  console.log("  Already returned +2 must NOT be restored again");
  console.log("  Product.stock returns to 5");
  console.log("  DELETE creates exactly 2 restoration movements");
  console.log("  Repeated DELETE returns 404");
  console.log("");

  await cleanup();

  // ===========================================================================
  // 1. CREATE TEST DATA
  // ===========================================================================

  section("1. CREATE TEST DATA");

  const product = await prisma.product.create({
    data: {
      name: TEST_PRODUCT_NAME,
      unit: "шт",
      price: 300,
      cost: 100,
      stock: 0,
    },
  });

  const supplier = await prisma.supplier.create({
    data: {
      name: TEST_SUPPLIER_NAME,
    },
  });

  console.log(
    `Product #${product.id} "${product.name}" created`
  );

  console.log(
    `Supplier #${supplier.id} "${supplier.name}" created`
  );

  console.log("🟢 Isolated test data created");

  // ===========================================================================
  // 2. SUPPLY BATCH A
  // ===========================================================================

  section("2. SUPPLY BATCH A — 2 UNITS");

  const expiryA = futureDate(10);

  const supplyA = await api("/api/supplies", "POST", {
    supplierId: supplier.id,
    items: [
      {
        id: product.id,
        quantity: 2,
        cost: 100,
        expiryDate: localDateOnly(expiryA),
      },
    ],
  });

  console.log(`HTTP ${supplyA.status}`);
  console.log(`Response: ${JSON.stringify(supplyA.body)}`);

  assert(
    supplyA.status === 200,
    `Supply A expected HTTP 200, got ${supplyA.status}`
  );

  assert(
    supplyA.body?.success === true,
    "Supply A must return success=true"
  );

  const batchA = await prisma.batch.findFirst({
    where: {
      productId: product.id,
    },
    orderBy: {
      id: "asc",
    },
  });

  assert(batchA !== null, "Batch A was not created");

  assert(
    batchA.quantity === 2,
    `Batch A quantity must be 2, got ${batchA.quantity}`
  );

  assert(
    batchA.purchaseCost === 100,
    `Batch A purchaseCost must be 100, got ${batchA.purchaseCost}`
  );

  assert(
    batchA.status === "ACTIVE",
    `Batch A status must be ACTIVE, got ${batchA.status}`
  );

  console.log(
    `Batch A #${batchA.id} | quantity=${batchA.quantity} | cost=${batchA.purchaseCost}`
  );

  // ===========================================================================
  // 3. SUPPLY BATCH B
  // ===========================================================================

  section("3. SUPPLY BATCH B — 3 UNITS");

  const expiryB = futureDate(20);

  const supplyB = await api("/api/supplies", "POST", {
    supplierId: supplier.id,
    items: [
      {
        id: product.id,
        quantity: 3,
        cost: 120,
        expiryDate: localDateOnly(expiryB),
      },
    ],
  });

  console.log(`HTTP ${supplyB.status}`);
  console.log(`Response: ${JSON.stringify(supplyB.body)}`);

  assert(
    supplyB.status === 200,
    `Supply B expected HTTP 200, got ${supplyB.status}`
  );

  assert(
    supplyB.body?.success === true,
    "Supply B must return success=true"
  );

  const batchB = await prisma.batch.findFirst({
    where: {
      productId: product.id,
      id: {
        not: batchA.id,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  assert(batchB !== null, "Batch B was not created");

  assert(
    batchB.quantity === 3,
    `Batch B quantity must be 3, got ${batchB.quantity}`
  );

  assert(
    batchB.purchaseCost === 120,
    `Batch B purchaseCost must be 120, got ${batchB.purchaseCost}`
  );

  assert(
    batchB.status === "ACTIVE",
    `Batch B status must be ACTIVE, got ${batchB.status}`
  );

  console.log(
    `Batch B #${batchB.id} | quantity=${batchB.quantity} | cost=${batchB.purchaseCost}`
  );

  // ===========================================================================
  // 4. VERIFY INITIAL STOCK
  // ===========================================================================

  section("4. VERIFY INITIAL STOCK");

  let currentProduct = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  assert(currentProduct !== null, "Test product disappeared");

  assert(
    currentProduct.stock === 5,
    `Initial Product.stock must be 5, got ${currentProduct.stock}`
  );

  let currentBatchA = await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

  let currentBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  assert(currentBatchA?.quantity === 2, "Initial Batch A must contain 2");
  assert(currentBatchB?.quantity === 3, "Initial Batch B must contain 3");

  console.log(`Product.stock=${currentProduct.stock}`);
  console.log(`Batch A #${batchA.id}=${currentBatchA?.quantity}`);
  console.log(`Batch B #${batchB.id}=${currentBatchB?.quantity}`);

  console.log("🟢 Initial stock state passed");

  // ===========================================================================
  // 5. CREATE ORDER — SELL ALL 5
  // ===========================================================================

  section("5. CREATE ORDER — SELL ALL 5");

  const beforeOrderMovements = await prisma.movement.count({
    where: {
      productId: product.id,
    },
  });

  const orderResponse = await api("/api/orders", "POST", {
    items: [
      {
        id: product.id,
        quantity: 5,
        price: 300,
      },
    ],
  });

  console.log(`HTTP ${orderResponse.status}`);
  console.log(
    `Response: ${JSON.stringify(orderResponse.body, null, 2)}`
  );

  assert(
    orderResponse.status === 201,
    `Order expected HTTP 201, got ${orderResponse.status}`
  );

  const orderId = orderResponse.body?.id;

  assert(
    typeof orderId === "number",
    "Created order must contain numeric id"
  );

  const order = await prisma.order.findUnique({
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
        },
      },
    },
  });

  assert(order !== null, "Created order was not found");

  assert(
    order.items.length === 1,
    `Order must contain exactly 1 OrderItem, got ${order.items.length}`
  );

  const orderItem = order.items[0];

  assert(
    orderItem.quantity === 5,
    `OrderItem quantity must be 5, got ${orderItem.quantity}`
  );

  assert(
    orderItem.returned === 0,
    `OrderItem returned must initially be 0, got ${orderItem.returned}`
  );

  assert(
    orderItem.batches.length === 2,
    `OrderItem must have 2 OrderBatch records, got ${orderItem.batches.length}`
  );

  const orderBatchA = orderItem.batches.find(
    (item) => item.batchId === batchA.id
  );

  const orderBatchB = orderItem.batches.find(
    (item) => item.batchId === batchB.id
  );

  assert(orderBatchA !== undefined, "OrderBatch for Batch A not found");
  assert(orderBatchB !== undefined, "OrderBatch for Batch B not found");

  assert(
    orderBatchA.quantity === 2,
    `OrderBatch A must record 2 sold, got ${orderBatchA.quantity}`
  );

  assert(
    orderBatchB.quantity === 3,
    `OrderBatch B must record 3 sold, got ${orderBatchB.quantity}`
  );

  assert(
    orderBatchA.purchaseCost === 100,
    "OrderBatch A purchaseCost snapshot must be 100"
  );

  assert(
    orderBatchB.purchaseCost === 120,
    "OrderBatch B purchaseCost snapshot must be 120"
  );

  currentProduct = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  currentBatchA = await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

  currentBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  assert(
    currentProduct?.stock === 0,
    `Product.stock after sale must be 0, got ${currentProduct?.stock}`
  );

  assert(
    currentBatchA?.quantity === 0,
    `Batch A after sale must be 0, got ${currentBatchA?.quantity}`
  );

  assert(
    currentBatchB?.quantity === 0,
    `Batch B after sale must be 0, got ${currentBatchB?.quantity}`
  );

  const afterOrderMovements = await prisma.movement.count({
    where: {
      productId: product.id,
    },
  });

  assert(
    afterOrderMovements === beforeOrderMovements + 1,
    "Sale must create exactly one SALE movement"
  );

  const saleMovement = await prisma.movement.findFirst({
    where: {
      productId: product.id,
      type: "SALE",
    },
    orderBy: {
      id: "desc",
    },
  });

  assert(
    saleMovement?.quantity === -5,
    `SALE movement must be -5, got ${saleMovement?.quantity}`
  );

  console.log(`Order #${orderId}`);
  console.log(`OrderItem #${orderItem.id}`);
  console.log(`OrderBatch A quantity=${orderBatchA.quantity}`);
  console.log(`OrderBatch B quantity=${orderBatchB.quantity}`);
  console.log(`Product.stock=${currentProduct?.stock}`);

  console.log("🟢 Multi-batch sale passed");

  // ===========================================================================
  // 6. RETURN 2 — MUST USE LIFO / BATCH B
  // ===========================================================================

  section("6. RETURN 2 — LIFO FROM BATCH B");

  const beforeReturnBatchCount = await prisma.returnBatch.count({
    where: {
      OrderItem: {
        productId: product.id,
      },
    },
  });

  const beforeReturnMovements = await prisma.movement.count({
    where: {
      productId: product.id,
      type: "RETURN",
    },
  });

  const returnResponse = await api(
    `/api/orders/${orderId}/return`,
    "POST",
    {
      itemId: orderItem.id,
      quantity: 2,
    }
  );

  console.log(`HTTP ${returnResponse.status}`);
  console.log(
    `Response: ${JSON.stringify(returnResponse.body, null, 2)}`
  );

  assert(
    returnResponse.status === 200,
    `Return expected HTTP 200, got ${returnResponse.status}`
  );

  const afterReturnOrder = await prisma.order.findUnique({
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
      },
    },
  });

  assert(afterReturnOrder !== null, "Order disappeared after return");

  const afterReturnItem = afterReturnOrder.items.find(
    (item) => item.id === orderItem.id
  );

  assert(
    afterReturnItem !== undefined,
    "OrderItem disappeared after return"
  );

  assert(
    afterReturnItem.returned === 2,
    `OrderItem.returned must be 2, got ${afterReturnItem.returned}`
  );

  assert(
    afterReturnOrder.status === "PARTIAL_RETURN",
    `Order status must be PARTIAL_RETURN, got ${afterReturnOrder.status}`
  );

  const returnBatches = await prisma.returnBatch.findMany({
    where: {
      OrderItem: {
        productId: product.id,
      },
      orderItemId: orderItem.id,
    },
    orderBy: {
      id: "asc",
    },
  });

  assert(
    returnBatches.length === beforeReturnBatchCount + 1,
    "Return must create exactly one ReturnBatch record"
  );

  const returnedBatchRecord = returnBatches[returnBatches.length - 1];

  assert(
    returnedBatchRecord.batchId === batchB.id,
    `Return must come from Batch B #${batchB.id}, got Batch #${returnedBatchRecord.batchId}`
  );

  assert(
    returnedBatchRecord.quantity === 2,
    `ReturnBatch quantity must be 2, got ${returnedBatchRecord.quantity}`
  );

  currentProduct = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  currentBatchA = await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

  currentBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  assert(
    currentBatchA?.quantity === 0,
    `Batch A must remain 0 after return, got ${currentBatchA?.quantity}`
  );

  assert(
    currentBatchB?.quantity === 2,
    `Batch B must become 2 after return, got ${currentBatchB?.quantity}`
  );

  assert(
    currentProduct?.stock === 2,
    `Product.stock must become 2 after return, got ${currentProduct?.stock}`
  );

  const afterReturnMovements = await prisma.movement.count({
    where: {
      productId: product.id,
      type: "RETURN",
    },
  });

  assert(
    afterReturnMovements === beforeReturnMovements + 1,
    "Return must create exactly one RETURN movement"
  );

  console.log(`ReturnBatch #${returnedBatchRecord.id}`);
  console.log(`Returned from Batch #${returnedBatchRecord.batchId}`);
  console.log(`Batch A quantity=${currentBatchA?.quantity}`);
  console.log(`Batch B quantity=${currentBatchB?.quantity}`);
  console.log(`Product.stock=${currentProduct?.stock}`);

  console.log("🟢 LIFO return passed");

  // ===========================================================================
  // 7. MARK BATCH B EXPIRED BEFORE DELETE
  // ===========================================================================

  section("7. MARK BATCH B EXPIRED BEFORE DELETE");

  /*
   * This is deliberately done after the sale/return.
   *
   * The DELETE operation must restore the remaining sold quantity
   * without blindly changing the historical batch status.
   *
   * Expected:
   *   Batch B quantity = 2 before DELETE
   *   Batch B status   = EXPIRED
   */

  const expiredExpiryDate = pastDate(5);

  await prisma.batch.update({
    where: {
      id: batchB.id,
    },
    data: {
      expiryDate: expiredExpiryDate,
      status: "EXPIRED",
    },
  });

  currentBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  assert(
    currentBatchB !== null,
    "Batch B disappeared while marking it expired"
  );

  assert(
    currentBatchB.quantity === 2,
    `Expired Batch B quantity must remain 2, got ${currentBatchB.quantity}`
  );

  assert(
    currentBatchB.status === "EXPIRED",
    `Batch B status must be EXPIRED, got ${currentBatchB.status}`
  );

  console.log(
    `Batch B #${batchB.id} | quantity=${currentBatchB.quantity} | status=${currentBatchB.status}`
  );

  console.log("🟢 Expired-batch deletion fixture prepared");

  // ===========================================================================
  // 8. SNAPSHOT BEFORE DELETE
  // ===========================================================================

  section("8. SNAPSHOT BEFORE DELETE");

  const beforeDeleteOrderBatchCount = await prisma.orderBatch.count({
    where: {
      orderItem: {
        productId: product.id,
      },
    },
  });

  const beforeDeleteReturnBatchCount = await prisma.returnBatch.count({
    where: {
      OrderItem: {
        productId: product.id,
      },
    },
  });

  const beforeDeleteSaleMovements = await prisma.movement.count({
    where: {
      productId: product.id,
      type: "SALE",
    },
  });

  const beforeDeleteReturnMovements = await prisma.movement.count({
    where: {
      productId: product.id,
      type: "RETURN",
    },
  });

  const beforeDeleteTotalMovements = await prisma.movement.count({
    where: {
      productId: product.id,
    },
  });

  assert(
    beforeDeleteOrderBatchCount === 2,
    `Before DELETE expected 2 OrderBatch, got ${beforeDeleteOrderBatchCount}`
  );

  assert(
    beforeDeleteReturnBatchCount === 1,
    `Before DELETE expected 1 ReturnBatch, got ${beforeDeleteReturnBatchCount}`
  );

  assert(
    beforeDeleteSaleMovements === 1,
    `Before DELETE expected 1 SALE movement, got ${beforeDeleteSaleMovements}`
  );

  assert(
    beforeDeleteReturnMovements === 1,
    `Before DELETE expected 1 RETURN movement, got ${beforeDeleteReturnMovements}`
  );

  assert(
    beforeDeleteTotalMovements === 4,
    `Before DELETE expected 4 movements, got ${beforeDeleteTotalMovements}`
  );

  currentProduct = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  currentBatchA = await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

  currentBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  assert(
    currentProduct?.stock === 2,
    `Before DELETE Product.stock must be 2, got ${currentProduct?.stock}`
  );

  assert(
    currentBatchA?.quantity === 0,
    `Before DELETE Batch A must be 0, got ${currentBatchA?.quantity}`
  );

  assert(
    currentBatchB?.quantity === 2,
    `Before DELETE Batch B must be 2, got ${currentBatchB?.quantity}`
  );

  console.log(`Product.stock=${currentProduct?.stock}`);
  console.log(`Batch A=${currentBatchA?.quantity}`);
  console.log(`Batch B=${currentBatchB?.quantity} (${currentBatchB?.status})`);
  console.log(`OrderBatch=${beforeDeleteOrderBatchCount}`);
  console.log(`ReturnBatch=${beforeDeleteReturnBatchCount}`);
  console.log(`SALE movements=${beforeDeleteSaleMovements}`);
  console.log(`RETURN movements=${beforeDeleteReturnMovements}`);

  console.log("🟢 Pre-delete snapshot passed");

  // ===========================================================================
  // 9. DELETE ORDER THROUGH REAL API
  // ===========================================================================

  section("9. DELETE ORDER THROUGH REAL API");

  const deleteResponse = await api(
    `/api/orders/${orderId}`,
    "DELETE"
  );

  console.log(`HTTP ${deleteResponse.status}`);
  console.log(
    `Response: ${JSON.stringify(deleteResponse.body, null, 2)}`
  );

  assert(
    deleteResponse.status === 200,
    `DELETE order expected HTTP 200, got ${deleteResponse.status}`
  );

  assert(
    deleteResponse.body?.success === true,
    "DELETE response must contain success=true"
  );

  console.log("🟢 DELETE /api/orders/:id returned HTTP 200");

  // ===========================================================================
  // 10. VERIFY ORDER IS GONE
  // ===========================================================================

  section("10. VERIFY ORDER DELETION");

  const deletedOrder = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  assert(
    deletedOrder === null,
    `Order #${orderId} still exists after DELETE`
  );

  const remainingOrderItems = await prisma.orderItem.count({
    where: {
      id: orderItem.id,
    },
  });

  assert(
    remainingOrderItems === 0,
    `OrderItem #${orderItem.id} still exists after DELETE`
  );

  const remainingOrderBatches = await prisma.orderBatch.count({
    where: {
      orderItemId: orderItem.id,
    },
  });

  assert(
    remainingOrderBatches === 0,
    `OrderBatch records for OrderItem #${orderItem.id} still exist`
  );

  const remainingReturnBatches = await prisma.returnBatch.count({
    where: {
      orderItemId: orderItem.id,
    },
  });

  assert(
    remainingReturnBatches === 0,
    `ReturnBatch records for OrderItem #${orderItem.id} still exist`
  );

  console.log(`Order #${orderId} removed`);
  console.log(`OrderItem #${orderItem.id} removed`);
  console.log("OrderBatch records removed");
  console.log("ReturnBatch records removed");

  console.log("🟢 Order deletion integrity passed");

  // ===========================================================================
  // 11. VERIFY EXACT BATCH RESTORATION
  // ===========================================================================

  section("11. VERIFY EXACT BATCH RESTORATION");

  currentBatchA = await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

  currentBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  currentProduct = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  assert(currentBatchA !== null, "Batch A disappeared after DELETE");
  assert(currentBatchB !== null, "Batch B disappeared after DELETE");
  assert(currentProduct !== null, "Product disappeared after DELETE");

  /*
   * Original sale:
   *   Batch A sold = 2
   *   Batch B sold = 3
   *
   * Return:
   *   Batch B returned = 2
   *
   * DELETE must restore:
   *   Batch A = +2
   *   Batch B = +(3 - 2) = +1
   *
   * Therefore:
   *   Batch A = 2
   *   Batch B = 3
   *
   * It must NOT restore the already-returned 2 units again.
   */

  assert(
    currentBatchA.quantity === 2,
    `DELETE must restore Batch A to 2, got ${currentBatchA.quantity}`
  );

  assert(
    currentBatchB.quantity === 3,
    `DELETE must restore Batch B to 3, got ${currentBatchB.quantity}`
  );

  assert(
    currentProduct.stock === 5,
    `DELETE must restore Product.stock to 5, got ${currentProduct.stock}`
  );

  assert(
    currentBatchB.status === "EXPIRED",
    `DELETE must preserve Batch B EXPIRED status, got ${currentBatchB.status}`
  );

  const batchTotal =
    currentBatchA.quantity + currentBatchB.quantity;

  assert(
    batchTotal === 5,
    `SUM(Batch.quantity) must be 5 after DELETE, got ${batchTotal}`
  );

  assert(
    currentProduct.stock === batchTotal,
    `Product.stock ${currentProduct.stock} must equal batch total ${batchTotal}`
  );

  console.log(
    `Batch A #${batchA.id}: ${currentBatchA.quantity}`
  );

  console.log(
    `Batch B #${batchB.id}: ${currentBatchB.quantity} / ${currentBatchB.status}`
  );

  console.log(
    `Product.stock=${currentProduct.stock}`
  );

  console.log(
    `SUM(Batch.quantity)=${batchTotal}`
  );

  console.log(
    "🟢 Exact batch restoration passed"
  );

  // ===========================================================================
  // 12. VERIFY DELETE RESTORATION MOVEMENTS
  // ===========================================================================

  section("12. VERIFY DELETE RESTORATION MOVEMENTS");

  const deleteReturnMovements = await prisma.movement.findMany({
    where: {
      productId: product.id,
      type: "RETURN",
      comment: {
        contains: `после удаления заказа №${orderId}`,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(
    `DELETE RETURN movements found=${deleteReturnMovements.length}`
  );

  assert(
    deleteReturnMovements.length === 2,
    `DELETE must create exactly 2 restoration RETURN movements, got ${deleteReturnMovements.length}`
  );

  const restorationA = deleteReturnMovements.find(
    (movement) =>
      movement.comment?.includes(`Партия №${batchA.id}`)
  );

  const restorationB = deleteReturnMovements.find(
    (movement) =>
      movement.comment?.includes(`Партия №${batchB.id}`)
  );

  assert(
    restorationA !== undefined,
    `DELETE restoration movement for Batch A #${batchA.id} not found`
  );

  assert(
    restorationB !== undefined,
    `DELETE restoration movement for Batch B #${batchB.id} not found`
  );

  assert(
    restorationA.quantity === 2,
    `DELETE restoration for Batch A must be +2, got ${restorationA.quantity}`
  );

  assert(
    restorationB.quantity === 1,
    `DELETE restoration for Batch B must be +1, got ${restorationB.quantity}`
  );

  console.log(
    `Batch A restoration movement #${restorationA.id} quantity=${restorationA.quantity}`
  );

  console.log(
    `Batch B restoration movement #${restorationB.id} quantity=${restorationB.quantity}`
  );

  console.log("🟢 DELETE restoration movements passed");

  // ===========================================================================
  // 13. VERIFY MOVEMENT TOTAL
  // ===========================================================================

  section("13. VERIFY MOVEMENT HISTORY");

  const movements = await prisma.movement.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      id: "asc",
    },
  });

  const supplyQuantity = movements
    .filter((movement) => movement.type === "SUPPLY")
    .reduce((sum, movement) => sum + movement.quantity, 0);

  const saleQuantity = movements
    .filter((movement) => movement.type === "SALE")
    .reduce((sum, movement) => sum + movement.quantity, 0);

  const returnQuantity = movements
    .filter((movement) => movement.type === "RETURN")
    .reduce((sum, movement) => sum + movement.quantity, 0);

  const writeOffQuantity = movements
    .filter((movement) => movement.type === "WRITE_OFF")
    .reduce((sum, movement) => sum + movement.quantity, 0);

  const netMovement = movements.reduce(
    (sum, movement) => sum + movement.quantity,
    0
  );

  console.log(`Movement count=${movements.length}`);
  console.log(`SUPPLY=${supplyQuantity}`);
  console.log(`SALE=${saleQuantity}`);
  console.log(`RETURN=${returnQuantity}`);
  console.log(`WRITE_OFF=${writeOffQuantity}`);
  console.log(`NET=${netMovement}`);

  /*
   * SUPPLY:
   *   +2 +3 = +5
   *
   * SALE:
   *   -5
   *
   * Customer return:
   *   +2
   *
   * DELETE restoration:
   *   +2 +1 = +3
   *
   * Net:
   *   +5 -5 +2 +3 = +5
   *
   * Final physical stock is therefore 5.
   */

  assert(
    supplyQuantity === 5,
    `SUPPLY movement total must be +5, got ${supplyQuantity}`
  );

  assert(
    saleQuantity === -5,
    `SALE movement total must be -5, got ${saleQuantity}`
  );

  assert(
    returnQuantity === 5,
    `RETURN movement total must be +5, got ${returnQuantity}`
  );

  assert(
    writeOffQuantity === 0,
    `WRITE_OFF movement total must be 0, got ${writeOffQuantity}`
  );

  assert(
    netMovement === 5,
    `Net movement must be +5, got ${netMovement}`
  );

  assert(
    currentProduct.stock === netMovement,
    `Product.stock ${currentProduct.stock} must equal movement net ${netMovement}`
  );

  console.log("🟢 Movement history passed");

  // ===========================================================================
  // 14. VERIFY NO ORDER-RELATED RECORDS REMAIN
  // ===========================================================================

  section("14. VERIFY NO ORDER-RELATED RECORDS REMAIN");

  const remainingProductOrders = await prisma.orderItem.count({
    where: {
      productId: product.id,
    },
  });

  const remainingProductOrderBatches = await prisma.orderBatch.count({
    where: {
      orderItem: {
        productId: product.id,
      },
    },
  });

  const remainingProductReturnBatches = await prisma.returnBatch.count({
    where: {
      OrderItem: {
        productId: product.id,
      },
    },
  });

  assert(
    remainingProductOrders === 0,
    `No OrderItems should remain, got ${remainingProductOrders}`
  );

  assert(
    remainingProductOrderBatches === 0,
    `No OrderBatch records should remain, got ${remainingProductOrderBatches}`
  );

  assert(
    remainingProductReturnBatches === 0,
    `No ReturnBatch records should remain, got ${remainingProductReturnBatches}`
  );

  console.log("OrderItems=0");
  console.log("OrderBatch=0");
  console.log("ReturnBatch=0");

  console.log("🟢 Order-related cleanup passed");

  // ===========================================================================
  // 15. REPEATED DELETE MUST RETURN 404
  // ===========================================================================

  section("15. REPEATED DELETE MUST RETURN 404");

  const repeatedDelete = await api(
    `/api/orders/${orderId}`,
    "DELETE"
  );

  console.log(`HTTP ${repeatedDelete.status}`);
  console.log(
    `Response: ${JSON.stringify(repeatedDelete.body)}`
  );

  assert(
    repeatedDelete.status === 404,
    `Repeated DELETE must return HTTP 404, got ${repeatedDelete.status}`
  );

  console.log("🟢 Repeated DELETE returned HTTP 404");

  // ===========================================================================
  // 16. VERIFY REPEATED DELETE DID NOT CHANGE STOCK
  // ===========================================================================

  section("16. VERIFY REPEATED DELETE DID NOT CHANGE STOCK");

  const finalProduct = await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

  const finalBatchA = await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

  const finalBatchB = await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

  assert(finalProduct !== null, "Final product disappeared");

  assert(finalBatchA !== null, "Final Batch A disappeared");

  assert(finalBatchB !== null, "Final Batch B disappeared");

  assert(
    finalProduct.stock === 5,
    `Repeated DELETE changed Product.stock: expected 5, got ${finalProduct.stock}`
  );

  assert(
    finalBatchA.quantity === 2,
    `Repeated DELETE changed Batch A: expected 2, got ${finalBatchA.quantity}`
  );

  assert(
    finalBatchB.quantity === 3,
    `Repeated DELETE changed Batch B: expected 3, got ${finalBatchB.quantity}`
  );

  assert(
    finalBatchB.status === "EXPIRED",
    `Repeated DELETE changed Batch B status: expected EXPIRED, got ${finalBatchB.status}`
  );

  const finalMovementCount = await prisma.movement.count({
    where: {
      productId: product.id,
    },
  });

  assert(
    finalMovementCount === movements.length,
    `Repeated DELETE created an unexpected movement: before=${movements.length}, after=${finalMovementCount}`
  );

  console.log(`Product.stock=${finalProduct.stock}`);
  console.log(`Batch A=${finalBatchA.quantity}`);
  console.log(
    `Batch B=${finalBatchB.quantity} / ${finalBatchB.status}`
  );
  console.log(`Movement count=${finalMovementCount}`);

  console.log("🟢 Repeated DELETE caused no state change");

  // ===========================================================================
  // 17. FINAL RESULT
  // ===========================================================================

  section("17. V49 FINAL RESULT");

  console.log("");
  console.log("🟢 V49 PASSED");
  console.log("");
  console.log("Verified:");
  console.log("");
  console.log("  Multi-batch sale                         ✓");
  console.log("  OrderBatch history                       ✓");
  console.log("  LIFO partial return                      ✓");
  console.log("  ReturnBatch history                      ✓");
  console.log("  PARTIAL_RETURN status                    ✓");
  console.log("  DELETE /api/orders/:id                   ✓");
  console.log("  Order removed                            ✓");
  console.log("  OrderItem removed                        ✓");
  console.log("  OrderBatch removed                       ✓");
  console.log("  ReturnBatch removed                      ✓");
  console.log("  Batch A restored +2                      ✓");
  console.log("  Batch B restored +1                      ✓");
  console.log("  Already-returned units not restored      ✓");
  console.log("  Expired Batch status preserved           ✓");
  console.log("  Product.stock restored to 5              ✓");
  console.log("  Product.stock = SUM(Batch.quantity)      ✓");
  console.log("  Batch-specific DELETE movements          ✓");
  console.log("  Repeated DELETE → 404                    ✓");
  console.log("  Repeated DELETE does not alter stock     ✓");
  console.log("");
  console.log("🟢 DELETE + RETURN + BATCH RESTORATION SAFETY PASSED");
  console.log("");
  console.log("======================================================================");
  console.log("");

  // ===========================================================================
  // 18. CLEANUP
  // ===========================================================================

  await cleanup();

  console.log("");
  console.log("======================================================================");
  console.log("V49 CLEANUP COMPLETED");
  console.log("======================================================================");
  console.log("");
  console.log("🟢 No V49 test data remains");
  console.log("");
}

main()
  .catch(async (error) => {
    console.error("");
    console.error("======================================================================");
    console.error("🔴 V49 FAILED");
    console.error("======================================================================");
    console.error("");
    console.error(error);
    console.error("");

    try {
      await cleanup();
      console.log("🟢 Cleanup after failure completed");
    } catch (cleanupError) {
      console.error("🔴 Cleanup after failure failed");
      console.error(cleanupError);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
