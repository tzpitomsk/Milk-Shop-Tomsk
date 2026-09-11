import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const API_BASE = "http://localhost:3000";

const PRODUCT_NAME = "V50_MULTI_RETURN_TEST Молоко";
const SUPPLIER_NAME = "V50_MULTI_RETURN_SUPPLIER";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function logSection(title: string) {
  console.log("");
  console.log("----------------------------------------------------------------------");
  console.log(title);
  console.log("----------------------------------------------------------------------");
}

function localDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function futureDate(days: number): string {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return localDateOnly(date);
}

async function requestJson(
  path: string,
  options: RequestInit = {}
): Promise<{
  status: number;
  body: any;
}> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();

  let body: any;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    body,
  };
}

async function cleanup() {
  logSection("V50 CLEANUP");

  const products = await prisma.product.findMany({
    where: {
      name: PRODUCT_NAME,
    },
    select: {
      id: true,
    },
  });

  if (products.length === 0) {
    console.log("No old V50 products found");
  } else {
    for (const product of products) {
      const productId = product.id;

      await prisma.$transaction(async (tx) => {
        await tx.returnBatch.deleteMany({
          where: {
            OrderItem: {
              productId,
            },
          },
        });

        await tx.orderBatch.deleteMany({
          where: {
            orderItem: {
              productId,
            },
          },
        });

        await tx.orderItem.deleteMany({
          where: {
            productId,
          },
        });

        await tx.order.deleteMany({
          where: {
            items: {
              none: {
                productId,
              },
            },
          },
        });

        await tx.movement.deleteMany({
          where: {
            productId,
          },
        });

        await tx.supplyItem.deleteMany({
          where: {
            productId,
          },
        });

        await tx.batch.deleteMany({
          where: {
            productId,
          },
        });

        await tx.product.delete({
          where: {
            id: productId,
          },
        });
      });
    }

    console.log(`Products cleaned=${products.length}`);
  }

  const suppliers = await prisma.supplier.findMany({
    where: {
      name: SUPPLIER_NAME,
    },
    select: {
      id: true,
    },
  });

  let suppliersCleaned = 0;

  for (const supplier of suppliers) {
    const supplies = await prisma.supply.findMany({
      where: {
        supplierId: supplier.id,
      },
      select: {
        id: true,
      },
    });

    await prisma.supply.deleteMany({
      where: {
        supplierId: supplier.id,
      },
    });

    await prisma.supplier.delete({
      where: {
        id: supplier.id,
      },
    });

    suppliersCleaned += 1;

    if (supplies.length > 0) {
      console.log(
        `Supplier #${supplier.id}: supplies cleaned=${supplies.length}`
      );
    }
  }

  console.log(`Suppliers cleaned=${suppliersCleaned}`);

  const remainingProducts = await prisma.product.count({
    where: {
      name: PRODUCT_NAME,
    },
  });

  const remainingSuppliers = await prisma.supplier.count({
    where: {
      name: SUPPLIER_NAME,
    },
  });

  assert(
    remainingProducts === 0,
    `V50 products remain after cleanup: ${remainingProducts}`
  );

  assert(
    remainingSuppliers === 0,
    `V50 suppliers remain after cleanup: ${remainingSuppliers}`
  );

  console.log("🟢 Cleanup verification passed");
}

async function main() {
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("V50 — MULTI-RETURN LIFECYCLE E2E");
  console.log("");
  console.log("======================================================================");
  console.log("");
  console.log("STRICTLY ISOLATED TEST DATA");
  console.log("");
  console.log("Scenario:");
  console.log("");
  console.log("  Batch A = 2");
  console.log("  Batch B = 3");
  console.log("  Sale = 5");
  console.log("  Return #1 = 1");
  console.log("  Return #2 = 1");
  console.log("  Return #3 = 1");
  console.log("  Return #4 = 1");
  console.log("  Return #5 = 1");
  console.log("");
  console.log("Expected:");
  console.log("");
  console.log("  COMPLETED → PARTIAL_RETURN → RETURNED");
  console.log("");
  console.log("  returned: 0 → 1 → 2 → 3 → 4 → 5");
  console.log("");
  console.log("  total: 1500 → 1200 → 900 → 600 → 300 → 0");
  console.log("");
  console.log("  profit: 940 → 760 → 580 → 400 → 200 → 0");
  console.log("");
  console.log("  Final stock = 5");
  console.log("");
  console.log("  Sixth return must be rejected");
  console.log("");

  await cleanup();

  let productId: number | null = null;
  let supplierId: number | null = null;

  try {
    // ========================================================================
    // 1. CREATE TEST DATA
    // ========================================================================

    logSection("1. CREATE TEST DATA");

    const product = await prisma.product.create({
      data: {
        name: PRODUCT_NAME,
        unit: "шт",
        price: 300,
        cost: 100,
        stock: 0,
      },
    });

    productId = product.id;

    console.log(
      `Product #${product.id} "${product.name}" created`
    );

    const supplier = await prisma.supplier.create({
      data: {
        name: SUPPLIER_NAME,
      },
    });

    supplierId = supplier.id;

    console.log(
      `Supplier #${supplier.id} "${supplier.name}" created`
    );

    console.log("🟢 Isolated test data created");

    // ========================================================================
    // 2. SUPPLY BATCH A
    // ========================================================================

    logSection("2. SUPPLY BATCH A — 2 UNITS");

    const supplyAResponse = await requestJson("/api/supplies", {
      method: "POST",
      body: JSON.stringify({
        supplierId: supplier.id,
        items: [
          {
            id: product.id,
            quantity: 2,
            cost: 100,
            expiryDate: futureDate(9),
          },
        ],
      }),
    });

    console.log(`HTTP ${supplyAResponse.status}`);
    console.log(
      `Response: ${JSON.stringify(supplyAResponse.body)}`
    );

    assert(
      supplyAResponse.status === 200,
      `Supply A must return HTTP 200, got ${supplyAResponse.status}`
    );

    assert(
      supplyAResponse.body?.success === true,
      "Supply A success must be true"
    );

    assert(
      supplyAResponse.body?.supply?.items?.length === 1,
      "Supply A must contain exactly one SupplyItem"
    );

    assert(
      supplyAResponse.body.supply.items[0].quantity === 2,
      "Supply A quantity must be 2"
    );

    assert(
      supplyAResponse.body.supply.items[0].cost === 100,
      "Supply A cost must be 100"
    );

    // ========================================================================
    // 3. SUPPLY B
    // ========================================================================

    logSection("3. SUPPLY B — 3 UNITS");

    const supplyBResponse = await requestJson("/api/supplies", {
      method: "POST",
      body: JSON.stringify({
        supplierId: supplier.id,
        items: [
          {
            id: product.id,
            quantity: 3,
            cost: 120,
            expiryDate: futureDate(19),
          },
        ],
      }),
    });

    console.log(`HTTP ${supplyBResponse.status}`);
    console.log(
      `Response: ${JSON.stringify(supplyBResponse.body)}`
    );

    assert(
      supplyBResponse.status === 200,
      `Supply B must return HTTP 200, got ${supplyBResponse.status}`
    );

    assert(
      supplyBResponse.body?.success === true,
      "Supply B success must be true"
    );

    assert(
      supplyBResponse.body?.supply?.items?.length === 1,
      "Supply B must contain exactly one SupplyItem"
    );

    assert(
      supplyBResponse.body.supply.items[0].quantity === 3,
      "Supply B quantity must be 3"
    );

    assert(
      supplyBResponse.body.supply.items[0].cost === 120,
      "Supply B cost must be 120"
    );

    // ========================================================================
    // 4. VERIFY INITIAL STOCK
    // ========================================================================

    logSection("4. VERIFY INITIAL STOCK");

    const initialProduct = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(initialProduct, "Product must exist");

    const initialBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    assert(
      initialBatches.length === 2,
      `Expected exactly 2 batches, got ${initialBatches.length}`
    );

    const batchA = initialBatches[0];
    const batchB = initialBatches[1];

    console.log(`Product.stock=${initialProduct.stock}`);
    console.log(`Batch A=${batchA.quantity}`);
    console.log(`Batch B=${batchB.quantity}`);

    assert(
      initialProduct.stock === 5,
      `Initial Product.stock must be 5, got ${initialProduct.stock}`
    );

    assert(
      batchA.quantity === 2,
      `Batch A must contain 2, got ${batchA.quantity}`
    );

    assert(
      batchB.quantity === 3,
      `Batch B must contain 3, got ${batchB.quantity}`
    );

    const initialBatchSum =
      batchA.quantity + batchB.quantity;

    assert(
      initialBatchSum === initialProduct.stock,
      `Initial batch sum ${initialBatchSum} must equal Product.stock ${initialProduct.stock}`
    );

    console.log("🟢 Initial stock passed");

    // ========================================================================
    // 5. CREATE ORDER — SELL ALL 5
    // ========================================================================

    logSection("5. CREATE ORDER — SELL ALL 5");

    const orderResponse = await requestJson("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: product.id,
            quantity: 5,
            price: 300,
          },
        ],
      }),
    });

    console.log(`HTTP ${orderResponse.status}`);
    console.log(
      `Response: ${JSON.stringify(orderResponse.body, null, 2)}`
    );

    assert(
      orderResponse.status === 201,
      `Order creation must return HTTP 201, got ${orderResponse.status}`
    );

    const order = orderResponse.body;

    assert(
      typeof order?.id === "number",
      "Created order must have numeric id"
    );

    assert(
      order.total === 1500,
      `Initial order total must be 1500, got ${order.total}`
    );

    assert(
      order.profit === 940,
      `Initial order profit must be 940, got ${order.profit}`
    );

    assert(
      order.status === "COMPLETED",
      `Initial order status must be COMPLETED, got ${order.status}`
    );

    assert(
      Array.isArray(order.items),
      "Created order must contain items"
    );

    assert(
      order.items.length === 1,
      `Created order must contain exactly one item, got ${order.items.length}`
    );

    const orderItem = order.items[0];

    assert(
      typeof orderItem.id === "number",
      "OrderItem must have numeric id"
    );

    assert(
      orderItem.quantity === 5,
      `OrderItem quantity must be 5, got ${orderItem.quantity}`
    );

    assert(
      orderItem.returned === 0,
      `Initial OrderItem.returned must be 0, got ${orderItem.returned}`
    );

    assert(
      Array.isArray(orderItem.batches),
      "OrderItem must contain batches"
    );

    assert(
      orderItem.batches.length === 2,
      `Expected 2 OrderBatch records, got ${orderItem.batches.length}`
    );

    const orderBatchA = orderItem.batches.find(
      (item: any) => item.batchId === batchA.id
    );

    const orderBatchB = orderItem.batches.find(
      (item: any) => item.batchId === batchB.id
    );

    assert(
      orderBatchA,
      `OrderBatch for Batch A #${batchA.id} must exist`
    );

    assert(
      orderBatchB,
      `OrderBatch for Batch B #${batchB.id} must exist`
    );

    assert(
      orderBatchA.quantity === 2,
      `OrderBatch A quantity must be 2, got ${orderBatchA.quantity}`
    );

    assert(
      orderBatchA.purchaseCost === 100,
      `OrderBatch A purchaseCost must be 100, got ${orderBatchA.purchaseCost}`
    );

    assert(
      orderBatchB.quantity === 3,
      `OrderBatch B quantity must be 3, got ${orderBatchB.quantity}`
    );

    assert(
      orderBatchB.purchaseCost === 120,
      `OrderBatch B purchaseCost must be 120, got ${orderBatchB.purchaseCost}`
    );

    const afterSaleProduct = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(afterSaleProduct, "Product must exist after sale");

    const afterSaleBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(`Order #${order.id}`);
    console.log(`OrderItem #${orderItem.id}`);
    console.log(`Total=${order.total}`);
    console.log(`Profit=${order.profit}`);
    console.log(`Status=${order.status}`);
    console.log(`Product.stock=${afterSaleProduct.stock}`);

    assert(
      afterSaleProduct.stock === 0,
      `Product.stock after sale must be 0, got ${afterSaleProduct.stock}`
    );

    assert(
      afterSaleBatches.find((b) => b.id === batchA.id)?.quantity === 0,
      "Batch A must be empty after sale"
    );

    assert(
      afterSaleBatches.find((b) => b.id === batchB.id)?.quantity === 0,
      "Batch B must be empty after sale"
    );

    console.log("🟢 Initial sale passed");

    // ========================================================================
    // 6. RETURN #1
    // ========================================================================

    logSection("6. RETURN #1 — 1 UNIT");

    const return1Response = await requestJson(
      `/api/orders/${order.id}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItem.id,
          quantity: 1,
        }),
      }
    );

    console.log(`HTTP ${return1Response.status}`);
    console.log(
      `Response: ${JSON.stringify(return1Response.body, null, 2)}`
    );

    assert(
      return1Response.status === 200,
      `Return #1 must return HTTP 200, got ${return1Response.status}`
    );

    const return1Order = return1Response.body?.order;

    assert(
      return1Order?.total === 1200,
      `After return #1 total must be 1200, got ${return1Order?.total}`
    );

    assert(
      return1Order?.profit === 760,
      `After return #1 profit must be 760, got ${return1Order?.profit}`
    );

    assert(
      return1Order?.status === "PARTIAL_RETURN",
      `After return #1 status must be PARTIAL_RETURN, got ${return1Order?.status}`
    );

    assert(
      return1Response.body?.returnedQuantity === 1,
      `Return #1 returnedQuantity must be 1, got ${return1Response.body?.returnedQuantity}`
    );

    assert(
      return1Response.body?.stock === 1,
      `After return #1 stock must be 1, got ${return1Response.body?.stock}`
    );

    const dbAfterReturn1 = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
      include: {
        items: {
          include: {
            batches: true,
            ReturnBatch: true,
          },
        },
      },
    });

    assert(dbAfterReturn1, "Order must exist after return #1");

    assert(
      dbAfterReturn1.total === 1200,
      `DB total after return #1 must be 1200, got ${dbAfterReturn1.total}`
    );

    assert(
      dbAfterReturn1.profit === 760,
      `DB profit after return #1 must be 760, got ${dbAfterReturn1.profit}`
    );

    assert(
      dbAfterReturn1.status === "PARTIAL_RETURN",
      `DB status after return #1 must be PARTIAL_RETURN, got ${dbAfterReturn1.status}`
    );

    const dbItemAfterReturn1 = dbAfterReturn1.items[0];

    assert(
      dbItemAfterReturn1.returned === 1,
      `OrderItem.returned after return #1 must be 1, got ${dbItemAfterReturn1.returned}`
    );

    assert(
      dbItemAfterReturn1.ReturnBatch.length === 1,
      `ReturnBatch count after return #1 must be 1, got ${dbItemAfterReturn1.ReturnBatch.length}`
    );

    const returnBatch1 = dbItemAfterReturn1.ReturnBatch[0];

    assert(
      returnBatch1.batchId === batchB.id,
      `Return #1 must come from Batch B #${batchB.id}, got Batch #${returnBatch1.batchId}`
    );

    assert(
      returnBatch1.quantity === 1,
      `ReturnBatch #1 quantity must be 1, got ${returnBatch1.quantity}`
    );

    let currentBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const batchAAfterReturn1 = currentBatches.find(
      (b) => b.id === batchA.id
    );

    const batchBAfterReturn1 = currentBatches.find(
      (b) => b.id === batchB.id
    );

    assert(batchAAfterReturn1, "Batch A must exist");
    assert(batchBAfterReturn1, "Batch B must exist");

    assert(
      batchAAfterReturn1.quantity === 0,
      `Batch A after return #1 must be 0, got ${batchAAfterReturn1.quantity}`
    );

    assert(
      batchBAfterReturn1.quantity === 1,
      `Batch B after return #1 must be 1, got ${batchBAfterReturn1.quantity}`
    );

    console.log("🟢 Return #1 passed");

    // ========================================================================
    // 7. RETURN #2
    // ========================================================================

    logSection("7. RETURN #2 — 1 UNIT");

    const return2Response = await requestJson(
      `/api/orders/${order.id}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItem.id,
          quantity: 1,
        }),
      }
    );

    console.log(`HTTP ${return2Response.status}`);
    console.log(
      `Response: ${JSON.stringify(return2Response.body, null, 2)}`
    );

    assert(
      return2Response.status === 200,
      `Return #2 must return HTTP 200, got ${return2Response.status}`
    );

    assert(
      return2Response.body?.order?.total === 900,
      `After return #2 total must be 900, got ${return2Response.body?.order?.total}`
    );

    assert(
      return2Response.body?.order?.profit === 580,
      `After return #2 profit must be 580, got ${return2Response.body?.order?.profit}`
    );

    assert(
      return2Response.body?.order?.status === "PARTIAL_RETURN",
      `After return #2 status must be PARTIAL_RETURN, got ${return2Response.body?.order?.status}`
    );

    assert(
      return2Response.body?.returnedQuantity === 1,
      `Return #2 returnedQuantity must be 1, got ${return2Response.body?.returnedQuantity}`
    );

    assert(
      return2Response.body?.stock === 2,
      `After return #2 stock must be 2, got ${return2Response.body?.stock}`
    );

    currentBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const batchBAfterReturn2 = currentBatches.find(
      (b) => b.id === batchB.id
    );

    assert(batchBAfterReturn2, "Batch B must exist");

    assert(
      batchBAfterReturn2.quantity === 2,
      `Batch B after return #2 must be 2, got ${batchBAfterReturn2.quantity}`
    );

    const returnCount2 = await prisma.returnBatch.count({
      where: {
        OrderItem: {
          id: orderItem.id,
        },
      },
    });

    assert(
      returnCount2 === 2,
      `ReturnBatch count after return #2 must be 2, got ${returnCount2}`
    );

    console.log("🟢 Return #2 passed");

    // ========================================================================
    // 8. RETURN #3
    // ========================================================================

    logSection("8. RETURN #3 — 1 UNIT");

    const return3Response = await requestJson(
      `/api/orders/${order.id}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItem.id,
          quantity: 1,
        }),
      }
    );

    console.log(`HTTP ${return3Response.status}`);
    console.log(
      `Response: ${JSON.stringify(return3Response.body, null, 2)}`
    );

    assert(
      return3Response.status === 200,
      `Return #3 must return HTTP 200, got ${return3Response.status}`
    );

    assert(
      return3Response.body?.order?.total === 600,
      `After return #3 total must be 600, got ${return3Response.body?.order?.total}`
    );

    assert(
      return3Response.body?.order?.profit === 400,
      `After return #3 profit must be 400, got ${return3Response.body?.order?.profit}`
    );

    assert(
      return3Response.body?.order?.status === "PARTIAL_RETURN",
      `After return #3 status must be PARTIAL_RETURN, got ${return3Response.body?.order?.status}`
    );

    assert(
      return3Response.body?.returnedQuantity === 1,
      `Return #3 returnedQuantity must be 1, got ${return3Response.body?.returnedQuantity}`
    );

    assert(
      return3Response.body?.stock === 3,
      `After return #3 stock must be 3, got ${return3Response.body?.stock}`
    );

    currentBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const batchBAfterReturn3 = currentBatches.find(
      (b) => b.id === batchB.id
    );

    assert(batchBAfterReturn3, "Batch B must exist");

    assert(
      batchBAfterReturn3.quantity === 3,
      `Batch B after return #3 must be 3, got ${batchBAfterReturn3.quantity}`
    );

    const returnCount3 = await prisma.returnBatch.count({
      where: {
        OrderItem: {
          id: orderItem.id,
        },
      },
    });

    assert(
      returnCount3 === 3,
      `ReturnBatch count after return #3 must be 3, got ${returnCount3}`
    );

    console.log("🟢 Return #3 passed");

    // ========================================================================
    // 9. RETURN #4
    // ========================================================================

    logSection("9. RETURN #4 — 1 UNIT");

    const return4Response = await requestJson(
      `/api/orders/${order.id}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItem.id,
          quantity: 1,
        }),
      }
    );

    console.log(`HTTP ${return4Response.status}`);
    console.log(
      `Response: ${JSON.stringify(return4Response.body, null, 2)}`
    );

    assert(
      return4Response.status === 200,
      `Return #4 must return HTTP 200, got ${return4Response.status}`
    );

    assert(
      return4Response.body?.order?.total === 300,
      `After return #4 total must be 300, got ${return4Response.body?.order?.total}`
    );

    assert(
      return4Response.body?.order?.profit === 200,
      `After return #4 profit must be 200, got ${return4Response.body?.order?.profit}`
    );

    assert(
      return4Response.body?.order?.status === "PARTIAL_RETURN",
      `After return #4 status must be PARTIAL_RETURN, got ${return4Response.body?.order?.status}`
    );

    assert(
      return4Response.body?.returnedQuantity === 1,
      `Return #4 returnedQuantity must be 1, got ${return4Response.body?.returnedQuantity}`
    );

    assert(
      return4Response.body?.stock === 4,
      `After return #4 stock must be 4, got ${return4Response.body?.stock}`
    );

    currentBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const batchAAfterReturn4 = currentBatches.find(
      (b) => b.id === batchA.id
    );

    const batchBAfterReturn4 = currentBatches.find(
      (b) => b.id === batchB.id
    );

    assert(batchAAfterReturn4, "Batch A must exist");
    assert(batchBAfterReturn4, "Batch B must exist");

    assert(
      batchAAfterReturn4.quantity === 1,
      `Batch A after return #4 must be 1, got ${batchAAfterReturn4.quantity}`
    );

    assert(
      batchBAfterReturn4.quantity === 3,
      `Batch B after return #4 must remain 3, got ${batchBAfterReturn4.quantity}`
    );

    const returnCount4 = await prisma.returnBatch.count({
      where: {
        OrderItem: {
          id: orderItem.id,
        },
      },
    });

    assert(
      returnCount4 === 4,
      `ReturnBatch count after return #4 must be 4, got ${returnCount4}`
    );

    const returnBatchRecords4 = await prisma.returnBatch.findMany({
      where: {
        orderItemId: orderItem.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const returnedFromA4 = returnBatchRecords4
      .filter((item) => item.batchId === batchA.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    const returnedFromB4 = returnBatchRecords4
      .filter((item) => item.batchId === batchB.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    assert(
      returnedFromA4 === 1,
      `After return #4 Batch A returned quantity must be 1, got ${returnedFromA4}`
    );

    assert(
      returnedFromB4 === 3,
      `After return #4 Batch B returned quantity must be 3, got ${returnedFromB4}`
    );

    console.log("🟢 Return #4 passed");

    // ========================================================================
    // 10. RETURN #5 — FINAL RETURN
    // ========================================================================

    logSection("10. RETURN #5 — FINAL UNIT");

    const return5Response = await requestJson(
      `/api/orders/${order.id}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItem.id,
          quantity: 1,
        }),
      }
    );

    console.log(`HTTP ${return5Response.status}`);
    console.log(
      `Response: ${JSON.stringify(return5Response.body, null, 2)}`
    );

    assert(
      return5Response.status === 200,
      `Return #5 must return HTTP 200, got ${return5Response.status}`
    );

    assert(
      return5Response.body?.order?.total === 0,
      `After return #5 total must be 0, got ${return5Response.body?.order?.total}`
    );

    assert(
      return5Response.body?.order?.profit === 0,
      `After return #5 profit must be 0, got ${return5Response.body?.order?.profit}`
    );

    assert(
      return5Response.body?.order?.status === "RETURNED",
      `After return #5 status must be RETURNED, got ${return5Response.body?.order?.status}`
    );

    assert(
      return5Response.body?.returnedQuantity === 1,
      `Return #5 returnedQuantity must be 1, got ${return5Response.body?.returnedQuantity}`
    );

    assert(
      return5Response.body?.stock === 5,
      `After return #5 stock must be 5, got ${return5Response.body?.stock}`
    );

    currentBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const batchAAfterReturn5 = currentBatches.find(
      (b) => b.id === batchA.id
    );

    const batchBAfterReturn5 = currentBatches.find(
      (b) => b.id === batchB.id
    );

    assert(batchAAfterReturn5, "Batch A must exist");
    assert(batchBAfterReturn5, "Batch B must exist");

    assert(
      batchAAfterReturn5.quantity === 2,
      `Batch A after return #5 must be 2, got ${batchAAfterReturn5.quantity}`
    );

    assert(
      batchBAfterReturn5.quantity === 3,
      `Batch B after return #5 must be 3, got ${batchBAfterReturn5.quantity}`
    );

    const finalProduct = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(finalProduct, "Product must exist after final return");

    assert(
      finalProduct.stock === 5,
      `Final Product.stock must be 5, got ${finalProduct.stock}`
    );

    const finalBatchSum = currentBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    assert(
      finalBatchSum === 5,
      `Final batch sum must be 5, got ${finalBatchSum}`
    );

    assert(
      finalBatchSum === finalProduct.stock,
      `Final batch sum ${finalBatchSum} must equal Product.stock ${finalProduct.stock}`
    );

    const finalOrderItem = await prisma.orderItem.findUnique({
      where: {
        id: orderItem.id,
      },
      include: {
        batches: {
          orderBy: {
            id: "asc",
          },
        },
        ReturnBatch: {
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    assert(finalOrderItem, "OrderItem must exist after final return");

    assert(
      finalOrderItem.quantity === 5,
      `Final OrderItem.quantity must be 5, got ${finalOrderItem.quantity}`
    );

    assert(
      finalOrderItem.returned === 5,
      `Final OrderItem.returned must be 5, got ${finalOrderItem.returned}`
    );

    assert(
      finalOrderItem.ReturnBatch.length === 5,
      `Final ReturnBatch count must be 5, got ${finalOrderItem.ReturnBatch.length}`
    );

    const finalReturnedFromA = finalOrderItem.ReturnBatch
      .filter((item) => item.batchId === batchA.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    const finalReturnedFromB = finalOrderItem.ReturnBatch
      .filter((item) => item.batchId === batchB.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    assert(
      finalReturnedFromA === 2,
      `Final returned quantity from Batch A must be 2, got ${finalReturnedFromA}`
    );

    assert(
      finalReturnedFromB === 3,
      `Final returned quantity from Batch B must be 3, got ${finalReturnedFromB}`
    );

    assert(
      finalReturnedFromA + finalReturnedFromB === 5,
      `Final total returned quantity must be 5, got ${
        finalReturnedFromA + finalReturnedFromB
      }`
    );

    console.log("🟢 Final return passed");

    // ========================================================================
    // 11. SIXTH RETURN MUST BE REJECTED
    // ========================================================================

    logSection("11. SIXTH RETURN — MUST BE REJECTED");

    const beforeSixthReturnOrder = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    const beforeSixthReturnProduct = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    const beforeSixthReturnMovements = await prisma.movement.count({
      where: {
        productId: product.id,
      },
    });

    const beforeSixthReturnReturnBatches =
      await prisma.returnBatch.count({
        where: {
          orderItemId: orderItem.id,
        },
      });

    assert(
      beforeSixthReturnOrder?.total === 0,
      `Before sixth return order total must be 0, got ${beforeSixthReturnOrder?.total}`
    );

    assert(
      beforeSixthReturnOrder?.profit === 0,
      `Before sixth return order profit must be 0, got ${beforeSixthReturnOrder?.profit}`
    );

    assert(
      beforeSixthReturnOrder?.status === "RETURNED",
      `Before sixth return status must be RETURNED, got ${beforeSixthReturnOrder?.status}`
    );

    assert(
      beforeSixthReturnProduct?.stock === 5,
      `Before sixth return stock must be 5, got ${beforeSixthReturnProduct?.stock}`
    );

    const sixthReturnResponse = await requestJson(
      `/api/orders/${order.id}/return`,
      {
        method: "POST",
        body: JSON.stringify({
          itemId: orderItem.id,
          quantity: 1,
        }),
      }
    );

    console.log(`HTTP ${sixthReturnResponse.status}`);
    console.log(
      `Response: ${JSON.stringify(sixthReturnResponse.body, null, 2)}`
    );

    assert(
      sixthReturnResponse.status >= 400,
      `Sixth return must be rejected with HTTP >=400, got ${sixthReturnResponse.status}`
    );

    const afterSixthReturnOrder = await prisma.order.findUnique({
      where: {
        id: order.id,
      },
    });

    const afterSixthReturnProduct = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    const afterSixthReturnMovements = await prisma.movement.count({
      where: {
        productId: product.id,
      },
    });

    const afterSixthReturnReturnBatches =
      await prisma.returnBatch.count({
        where: {
          orderItemId: orderItem.id,
        },
      });

    assert(
      afterSixthReturnOrder?.total ===
        beforeSixthReturnOrder?.total,
      `Sixth rejected return must not change order total`
    );

    assert(
      afterSixthReturnOrder?.profit ===
        beforeSixthReturnOrder?.profit,
      `Sixth rejected return must not change order profit`
    );

    assert(
      afterSixthReturnOrder?.status ===
        beforeSixthReturnOrder?.status,
      `Sixth rejected return must not change order status`
    );

    assert(
      afterSixthReturnProduct?.stock ===
        beforeSixthReturnProduct?.stock,
      `Sixth rejected return must not change Product.stock`
    );

    assert(
      afterSixthReturnMovements ===
        beforeSixthReturnMovements,
      `Sixth rejected return must not create Movement`
    );

    assert(
      afterSixthReturnReturnBatches ===
        beforeSixthReturnReturnBatches,
      `Sixth rejected return must not create ReturnBatch`
    );

    console.log("🟢 Sixth return correctly rejected");
    console.log("🟢 Database unchanged after rejected return");

    // ========================================================================
    // 12. VERIFY COMPLETE RETURN HISTORY
    // ========================================================================

    logSection("12. VERIFY COMPLETE RETURN HISTORY");

    const finalReturnBatches = await prisma.returnBatch.findMany({
      where: {
        orderItemId: orderItem.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    assert(
      finalReturnBatches.length === 5,
      `Expected 5 ReturnBatch records, got ${finalReturnBatches.length}`
    );

    for (const returnBatch of finalReturnBatches) {
      assert(
        returnBatch.quantity === 1,
        `Every V50 ReturnBatch must have quantity 1, got ${returnBatch.quantity}`
      );
    }

    const totalReturnedFromHistory = finalReturnBatches.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    assert(
      totalReturnedFromHistory === 5,
      `ReturnBatch history total must be 5, got ${totalReturnedFromHistory}`
    );

    const returnedFromA = finalReturnBatches
      .filter((item) => item.batchId === batchA.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    const returnedFromB = finalReturnBatches
      .filter((item) => item.batchId === batchB.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    console.log(`Returned from Batch A=${returnedFromA}`);
    console.log(`Returned from Batch B=${returnedFromB}`);
    console.log(`Total returned=${totalReturnedFromHistory}`);

    assert(
      returnedFromA === 2,
      `Batch A must have 2 returned units, got ${returnedFromA}`
    );

    assert(
      returnedFromB === 3,
      `Batch B must have 3 returned units, got ${returnedFromB}`
    );

    assert(
      returnedFromA + returnedFromB === 5,
      "Returned quantities by batch must sum to 5"
    );

    console.log("🟢 Return history passed");

    // ========================================================================
    // 13. VERIFY ORDERBATCH HISTORY
    // ========================================================================

    logSection("13. VERIFY ORDERBATCH HISTORY");

    const finalOrderBatches = await prisma.orderBatch.findMany({
      where: {
        orderItemId: orderItem.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    assert(
      finalOrderBatches.length === 2,
      `Expected 2 OrderBatch records, got ${finalOrderBatches.length}`
    );

    const finalOrderBatchA = finalOrderBatches.find(
      (item) => item.batchId === batchA.id
    );

    const finalOrderBatchB = finalOrderBatches.find(
      (item) => item.batchId === batchB.id
    );

    assert(
      finalOrderBatchA,
      `Final OrderBatch for Batch A #${batchA.id} must exist`
    );

    assert(
      finalOrderBatchB,
      `Final OrderBatch for Batch B #${batchB.id} must exist`
    );

    assert(
      finalOrderBatchA.quantity === 2,
      `Final OrderBatch A quantity must be 2, got ${finalOrderBatchA.quantity}`
    );

    assert(
      finalOrderBatchA.purchaseCost === 100,
      `Final OrderBatch A purchaseCost must be 100, got ${finalOrderBatchA.purchaseCost}`
    );

    assert(
      finalOrderBatchB.quantity === 3,
      `Final OrderBatch B quantity must be 3, got ${finalOrderBatchB.quantity}`
    );

    assert(
      finalOrderBatchB.purchaseCost === 120,
      `Final OrderBatch B purchaseCost must be 120, got ${finalOrderBatchB.purchaseCost}`
    );

    const soldHistoryTotal =
      finalOrderBatchA.quantity +
      finalOrderBatchB.quantity;

    assert(
      soldHistoryTotal === 5,
      `OrderBatch history total must be 5, got ${soldHistoryTotal}`
    );

    console.log(
      `Batch A sold=${finalOrderBatchA.quantity} @ ${finalOrderBatchA.purchaseCost}`
    );

    console.log(
      `Batch B sold=${finalOrderBatchB.quantity} @ ${finalOrderBatchB.purchaseCost}`
    );

    console.log(`Total sold history=${soldHistoryTotal}`);

    console.log("🟢 OrderBatch history passed");

    // ========================================================================
    // 14. VERIFY MOVEMENTS
    // ========================================================================

    logSection("14. VERIFY MOVEMENTS");

    const movements = await prisma.movement.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(`Movement count=${movements.length}`);

    const supplyMovements = movements.filter(
      (movement) => movement.type === "SUPPLY"
    );

    const saleMovements = movements.filter(
      (movement) => movement.type === "SALE"
    );

    const returnMovements = movements.filter(
      (movement) => movement.type === "RETURN"
    );

    const writeOffMovements = movements.filter(
      (movement) => movement.type === "WRITE_OFF"
    );

    assert(
      supplyMovements.length === 2,
      `Expected 2 SUPPLY movements, got ${supplyMovements.length}`
    );

    assert(
      saleMovements.length === 1,
      `Expected 1 SALE movement, got ${saleMovements.length}`
    );

    assert(
      returnMovements.length === 5,
      `Expected 5 RETURN movements, got ${returnMovements.length}`
    );

    assert(
      writeOffMovements.length === 0,
      `Expected 0 WRITE_OFF movements, got ${writeOffMovements.length}`
    );

    const supplyMovementTotal = supplyMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const saleMovementTotal = saleMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const returnMovementTotal = returnMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    const writeOffMovementTotal = writeOffMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    console.log(
      `SUPPLY net=${supplyMovementTotal}`
    );

    console.log(
      `SALE net=${saleMovementTotal}`
    );

    console.log(
      `RETURN net=${returnMovementTotal}`
    );

    console.log(
      `WRITE_OFF net=${writeOffMovementTotal}`
    );

    assert(
      supplyMovementTotal === 5,
      `SUPPLY movement net must be +5, got ${supplyMovementTotal}`
    );

    assert(
      saleMovementTotal === -5,
      `SALE movement net must be -5, got ${saleMovementTotal}`
    );

    assert(
      returnMovementTotal === 5,
      `RETURN movement net must be +5, got ${returnMovementTotal}`
    );

    assert(
      writeOffMovementTotal === 0,
      `WRITE_OFF movement net must be 0, got ${writeOffMovementTotal}`
    );

    const movementNet =
      supplyMovementTotal +
      saleMovementTotal +
      returnMovementTotal +
      writeOffMovementTotal;

    assert(
      movementNet === 5,
      `Final movement net must be +5, got ${movementNet}`
    );

    console.log(`Movement NET=${movementNet}`);

    console.log("🟢 Movement history passed");

    // ========================================================================
    // 15. FINAL ORDER VERIFICATION
    // ========================================================================

    logSection("15. FINAL ORDER VERIFICATION");

    const finalOrder = await prisma.order.findUnique({
      where: {
        id: order.id,
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
        },
      },
    });

    assert(finalOrder, "Final order must exist");

    assert(
      finalOrder.total === 0,
      `Final order total must be 0, got ${finalOrder.total}`
    );

    assert(
      finalOrder.profit === 0,
      `Final order profit must be 0, got ${finalOrder.profit}`
    );

    assert(
      finalOrder.status === "RETURNED",
      `Final order status must be RETURNED, got ${finalOrder.status}`
    );

    assert(
      finalOrder.items.length === 1,
      `Final order must contain 1 item, got ${finalOrder.items.length}`
    );

    assert(
      finalOrder.items[0].quantity === 5,
      `Final item quantity must be 5, got ${finalOrder.items[0].quantity}`
    );

    assert(
      finalOrder.items[0].returned === 5,
      `Final item returned must be 5, got ${finalOrder.items[0].returned}`
    );

    console.log(`Order #${finalOrder.id}`);
    console.log(`Total=${finalOrder.total}`);
    console.log(`Profit=${finalOrder.profit}`);
    console.log(`Status=${finalOrder.status}`);
    console.log(`Returned=${finalOrder.items[0].returned}`);

    console.log("🟢 Final order verification passed");

    // ========================================================================
    // 16. FINAL STOCK VERIFICATION
    // ========================================================================

    logSection("16. FINAL STOCK VERIFICATION");

    const finalStockProduct = await prisma.product.findUnique({
      where: {
        id: product.id,
      },
    });

    assert(finalStockProduct, "Final Product must exist");

    const finalStockBatches = await prisma.batch.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        id: "asc",
      },
    });

    const physicalStock = finalStockBatches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );

    console.log(`Product.stock=${finalStockProduct.stock}`);
    console.log(`SUM(Batch.quantity)=${physicalStock}`);

    assert(
      finalStockProduct.stock === 5,
      `Final Product.stock must be 5, got ${finalStockProduct.stock}`
    );

    assert(
      physicalStock === 5,
      `Final physical batch stock must be 5, got ${physicalStock}`
    );

    assert(
      finalStockProduct.stock === physicalStock,
      `Product.stock ${finalStockProduct.stock} must equal batch sum ${physicalStock}`
    );

    console.log("🟢 Final stock verification passed");

    // ========================================================================
    // 17. FINAL V50 RESULT
    // ========================================================================

    logSection("17. FINAL V50 RESULT");

    console.log("");
    console.log("======================================================================");
    console.log("V50 PASSED");
    console.log("======================================================================");
    console.log("");
    console.log("Multi-return lifecycle:");
    console.log("");
    console.log("  COMPLETED");
    console.log("      ↓");
    console.log("  PARTIAL_RETURN");
    console.log("      ↓");
    console.log("  PARTIAL_RETURN");
    console.log("      ↓");
    console.log("  PARTIAL_RETURN");
    console.log("      ↓");
    console.log("  PARTIAL_RETURN");
    console.log("      ↓");
    console.log("  RETURNED");
    console.log("");
    console.log("Profit sequence:");
    console.log("");
    console.log("  940 → 760 → 580 → 400 → 200 → 0");
    console.log("");
    console.log("Total sequence:");
    console.log("");
    console.log("  1500 → 1200 → 900 → 600 → 300 → 0");
    console.log("");
    console.log("Returned:");
    console.log("");
    console.log("  0 → 1 → 2 → 3 → 4 → 5");
    console.log("");
    console.log("Final stock:");
    console.log("");
    console.log("  5");
    console.log("");
    console.log("ReturnBatch records:");
    console.log("");
    console.log("  5");
    console.log("");
    console.log("SUPPLY movements:");
    console.log("");
    console.log("  2");
    console.log("");
    console.log("SALE movements:");
    console.log("");
    console.log("  1");
    console.log("");
    console.log("RETURN movements:");
    console.log("");
    console.log("  5");
    console.log("");
    console.log("WRITE_OFF movements:");
    console.log("");
    console.log("  0");
    console.log("");
    console.log("Sixth return:");
    console.log("");
    console.log("  REJECTED");
    console.log("");
    console.log("Database integrity:");
    console.log("");
    console.log("  Product.stock == SUM(Batch.quantity)");
    console.log("  PASSED");
    console.log("");
    console.log("======================================================================");
    console.log("");
  } catch (error) {
    console.log("");
    console.log("======================================================================");
    console.log("🔴 V50 FAILED");
    console.log("======================================================================");
    console.log("");
    console.error(error);
    console.log("");
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.log("");
      console.log("🔴 CLEANUP FAILED");
      console.error(cleanupError);
      process.exitCode = 1;
    }

    if (productId !== null || supplierId !== null) {
      const remainingProductCount = await prisma.product.count({
        where: {
          name: PRODUCT_NAME,
        },
      });

      const remainingSupplierCount = await prisma.supplier.count({
        where: {
          name: SUPPLIER_NAME,
        },
      });

      if (
        remainingProductCount !== 0 ||
        remainingSupplierCount !== 0
      ) {
        console.log("");
        console.log("🔴 V50 DATA REMAINS AFTER CLEANUP");
        console.log(
          `Remaining products=${remainingProductCount}`
        );
        console.log(
          `Remaining suppliers=${remainingSupplierCount}`
        );

        process.exitCode = 1;
      } else {
        console.log("🟢 Cleanup after test completed");
      }
    }

    await prisma.$disconnect();
  }
}

main();