import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

const TEST_SUFFIX = Date.now();

const PRODUCTS = {
  milk: {
    name: "ORDER LIFECYCLE V2 TEST MILK",
    barcode: `LIFECYCLE_V2_MILK_${TEST_SUFFIX}`,
    unit: "шт",
    price: 300,
    cost: 100,
  },
  tvorog: {
    name: "ORDER LIFECYCLE V2 TEST TVOROG",
    barcode: `LIFECYCLE_V2_TVOROG_${TEST_SUFFIX}`,
    unit: "шт",
    price: 250,
    cost: 180,
  },
};

const createdProductIds = [];

let orderId = null;

function section(title) {
  console.log("");
  console.log("==============================================================================");
  console.log(title);
  console.log("==============================================================================");
  console.log("");
}

function step(number, title) {
  console.log("");
  console.log(`${number}. ${title}`);
  console.log("------------------------------------------------------------------------------");
}

function ok(message) {
  console.log(`🟢 ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`🔴 ${message}`);
  }

  ok(message);
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    response,
    body,
  };
}

async function main() {
  section(
    "ORDER LIFECYCLE INTEGRATION TEST V2\nMULTI-PRODUCT / MULTI-BATCH"
  );

  console.log(
    "POST ORDER → MULTI-BATCH SALE → MULTIPLE RETURNS → DELETE"
  );
  console.log("STRICTLY ISOLATED TEST DATA");

  // ===========================================================================
  // 1. CREATE TEST PRODUCTS
  // ===========================================================================

  step(1, "CREATING TEST PRODUCTS");

  const milk = await prisma.product.create({
    data: {
      name: PRODUCTS.milk.name,
      barcode: PRODUCTS.milk.barcode,
      unit: PRODUCTS.milk.unit,
      price: PRODUCTS.milk.price,
      cost: PRODUCTS.milk.cost,
      stock: 0,
    },
  });

  const tvorog = await prisma.product.create({
    data: {
      name: PRODUCTS.tvorog.name,
      barcode: PRODUCTS.tvorog.barcode,
      unit: PRODUCTS.tvorog.unit,
      price: PRODUCTS.tvorog.price,
      cost: PRODUCTS.tvorog.cost,
      stock: 0,
    },
  });

  createdProductIds.push(milk.id, tvorog.id);

  console.log(`Milk Product #${milk.id}`);
  console.log(`Barcode=${milk.barcode}`);

  console.log(`Tvorog Product #${tvorog.id}`);
  console.log(`Barcode=${tvorog.barcode}`);

  // ===========================================================================
  // 2. CREATE TEST BATCHES
  // ===========================================================================

  step(2, "CREATING TEST BATCHES");

  const now = Date.now();

  const milkBatchA = await prisma.batch.create({
    data: {
      quantity: 2,
      purchaseCost: 100,
      receivedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(now + 10 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      productId: milk.id,
    },
  });

  const milkBatchB = await prisma.batch.create({
    data: {
      quantity: 3,
      purchaseCost: 120,
      receivedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(now + 20 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      productId: milk.id,
    },
  });

  const tvorogBatchA = await prisma.batch.create({
    data: {
      quantity: 1,
      purchaseCost: 180,
      receivedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(now + 12 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      productId: tvorog.id,
    },
  });

  const tvorogBatchB = await prisma.batch.create({
    data: {
      quantity: 2,
      purchaseCost: 200,
      receivedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(now + 22 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      productId: tvorog.id,
    },
  });

  console.log(
    `Milk Batch A #${milkBatchA.id} | qty=2 | cost=100 | earlier expiry`
  );

  console.log(
    `Milk Batch B #${milkBatchB.id} | qty=3 | cost=120 | later expiry`
  );

  console.log(
    `Tvorog Batch A #${tvorogBatchA.id} | qty=1 | cost=180 | earlier expiry`
  );

  console.log(
    `Tvorog Batch B #${tvorogBatchB.id} | qty=2 | cost=200 | later expiry`
  );

  // ===========================================================================
  // 3. VERIFY INITIAL STOCK
  // ===========================================================================

  step(3, "VERIFYING INITIAL STOCK");

  await prisma.product.update({
    where: {
      id: milk.id,
    },
    data: {
      stock: 5,
    },
  });

  await prisma.product.update({
    where: {
      id: tvorog.id,
    },
    data: {
      stock: 3,
    },
  });

  const milkInitial = await prisma.product.findUnique({
    where: {
      id: milk.id,
    },
    include: {
      batches: true,
    },
  });

  const tvorogInitial = await prisma.product.findUnique({
    where: {
      id: tvorog.id,
    },
    include: {
      batches: true,
    },
  });

  assert(milkInitial !== null, "Milk product exists");
  assert(tvorogInitial !== null, "Tvorog product exists");

  const milkInitialBatchTotal = milkInitial.batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  const tvorogInitialBatchTotal = tvorogInitial.batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  assert(milkInitial.stock === 5, "Milk initial Product.stock is 5");
  assert(milkInitialBatchTotal === 5, "Milk initial batch stock is 5");
  assert(
    milkInitial.stock === milkInitialBatchTotal,
    "Milk Product.stock equals batch total"
  );

  assert(tvorogInitial.stock === 3, "Tvorog initial Product.stock is 3");
  assert(tvorogInitialBatchTotal === 3, "Tvorog initial batch stock is 3");
  assert(
    tvorogInitial.stock === tvorogInitialBatchTotal,
    "Tvorog Product.stock equals batch total"
  );

  // ===========================================================================
  // 4. CREATE MULTI-PRODUCT ORDER
  // ===========================================================================

  step(4, "CREATING MULTI-PRODUCT ORDER THROUGH POST /api/orders");

  const orderRequest = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          id: milk.id,
          quantity: 4,
          price: 999999,
        },
        {
          id: tvorog.id,
          quantity: 3,
          price: 999999,
        },
      ],
    }),
  });

  console.log(`HTTP ${orderRequest.response.status}`);
  console.log(`Response=${JSON.stringify(orderRequest.body)}`);

  assert(
    orderRequest.response.status === 201,
    "POST /api/orders succeeded"
  );

  assert(
    Number.isInteger(orderRequest.body?.id),
    "POST /api/orders returned an order id"
  );

  orderId = orderRequest.body.id;

  // ===========================================================================
  // 5. VERIFY CREATED ORDER
  // ===========================================================================

  step(5, "VERIFYING CREATED MULTI-PRODUCT ORDER");

  const createdOrder = await prisma.order.findUnique({
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
          ReturnBatch: true,
        },
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  assert(createdOrder !== null, "Order exists in database");

  assert(
    createdOrder.items.length === 2,
    "Order contains exactly two OrderItems"
  );

  const milkItem = createdOrder.items.find(
    (item) => item.productId === milk.id
  );

  const tvorogItem = createdOrder.items.find(
    (item) => item.productId === tvorog.id
  );

  assert(milkItem !== undefined, "Milk OrderItem exists");
  assert(tvorogItem !== undefined, "Tvorog OrderItem exists");

  assert(milkItem.quantity === 4, "Milk OrderItem quantity is 4");
  assert(tvorogItem.quantity === 3, "Tvorog OrderItem quantity is 3");

  assert(
    milkItem.returned === 0,
    "Milk returned quantity initially equals 0"
  );

  assert(
    tvorogItem.returned === 0,
    "Tvorog returned quantity initially equals 0"
  );

  assert(
    milkItem.price === PRODUCTS.milk.price,
    "Milk OrderItem uses Product.price from database"
  );

  assert(
    tvorogItem.price === PRODUCTS.tvorog.price,
    "Tvorog OrderItem uses Product.price from database"
  );

  // ===========================================================================
  // 6. VERIFY GROSS TOTAL AND PROFIT
  // ===========================================================================

  step(6, "VERIFYING GROSS TOTAL AND PROFIT");

  const expectedGrossTotal =
    4 * PRODUCTS.milk.price +
    3 * PRODUCTS.tvorog.price;

  const expectedMilkCost =
    2 * 100 +
    2 * 120;

  const expectedTvorogCost =
    1 * 180 +
    2 * 200;

  const expectedGrossProfit =
    expectedGrossTotal -
    expectedMilkCost -
    expectedTvorogCost;

  assert(
    createdOrder.total === expectedGrossTotal,
    `Gross order total is ${expectedGrossTotal}`
  );

  assert(
    createdOrder.profit === expectedGrossProfit,
    `Gross order profit is ${expectedGrossProfit}`
  );

  assert(
    createdOrder.status === "COMPLETED",
    "Order status is COMPLETED"
  );

  console.log(`Gross total=${createdOrder.total}`);
  console.log(`Gross profit=${createdOrder.profit}`);

  // ===========================================================================
  // 7. VERIFY MILK FEFO/FIFO
  // ===========================================================================

  step(7, "VERIFYING MILK FEFO/FIFO ALLOCATION");

  assert(
    milkItem.batches.length === 2,
    "Milk sale was split across two OrderBatch records"
  );

  const milkOrderBatchA = milkItem.batches.find(
    (item) => item.batchId === milkBatchA.id
  );

  const milkOrderBatchB = milkItem.batches.find(
    (item) => item.batchId === milkBatchB.id
  );

  assert(
    milkOrderBatchA !== undefined,
    "Milk earlier-expiry batch was used"
  );

  assert(
    milkOrderBatchB !== undefined,
    "Milk later-expiry batch was used"
  );

  assert(
    milkOrderBatchA.quantity === 2,
    "Milk earlier-expiry batch supplied 2 units"
  );

  assert(
    milkOrderBatchB.quantity === 2,
    "Milk later-expiry batch supplied remaining 2 units"
  );

  assert(
    milkOrderBatchA.purchaseCost === 100,
    "Milk first OrderBatch preserved purchase cost 100"
  );

  assert(
    milkOrderBatchB.purchaseCost === 120,
    "Milk second OrderBatch preserved purchase cost 120"
  );

  assert(
    milkItem.batches.reduce(
      (sum, item) => sum + item.quantity,
      0
    ) === 4,
    "Milk OrderBatch quantities equal sold quantity"
  );

  // ===========================================================================
  // 8. VERIFY TVOROG FEFO/FIFO
  // ===========================================================================

  step(8, "VERIFYING TVOROG FEFO/FIFO ALLOCATION");

  assert(
    tvorogItem.batches.length === 2,
    "Tvorog sale was split across two OrderBatch records"
  );

  const tvorogOrderBatchA = tvorogItem.batches.find(
    (item) => item.batchId === tvorogBatchA.id
  );

  const tvorogOrderBatchB = tvorogItem.batches.find(
    (item) => item.batchId === tvorogBatchB.id
  );

  assert(
    tvorogOrderBatchA !== undefined,
    "Tvorog earlier-expiry batch was used"
  );

  assert(
    tvorogOrderBatchB !== undefined,
    "Tvorog later-expiry batch was used"
  );

  assert(
    tvorogOrderBatchA.quantity === 1,
    "Tvorog earlier-expiry batch supplied 1 unit"
  );

  assert(
    tvorogOrderBatchB.quantity === 2,
    "Tvorog later-expiry batch supplied remaining 2 units"
  );

  assert(
    tvorogOrderBatchA.purchaseCost === 180,
    "Tvorog first OrderBatch preserved purchase cost 180"
  );

  assert(
    tvorogOrderBatchB.purchaseCost === 200,
    "Tvorog second OrderBatch preserved purchase cost 200"
  );

  assert(
    tvorogItem.batches.reduce(
      (sum, item) => sum + item.quantity,
      0
    ) === 3,
    "Tvorog OrderBatch quantities equal sold quantity"
  );

  // ===========================================================================
  // 9. VERIFY STOCK AFTER SALE
  // ===========================================================================

  step(9, "VERIFYING STOCK AFTER MULTI-PRODUCT SALE");

  const milkAfterSale = await prisma.product.findUnique({
    where: {
      id: milk.id,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  const tvorogAfterSale = await prisma.product.findUnique({
    where: {
      id: tvorog.id,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  assert(milkAfterSale !== null, "Milk exists after sale");
  assert(tvorogAfterSale !== null, "Tvorog exists after sale");

  const milkBatchAAfterSale = milkAfterSale.batches.find(
    (batch) => batch.id === milkBatchA.id
  );

  const milkBatchBAfterSale = milkAfterSale.batches.find(
    (batch) => batch.id === milkBatchB.id
  );

  const tvorogBatchAAfterSale = tvorogAfterSale.batches.find(
    (batch) => batch.id === tvorogBatchA.id
  );

  const tvorogBatchBAfterSale = tvorogAfterSale.batches.find(
    (batch) => batch.id === tvorogBatchB.id
  );

  assert(
    milkBatchAAfterSale !== undefined,
    "Milk Batch A exists after sale"
  );

  assert(
    milkBatchBAfterSale !== undefined,
    "Milk Batch B exists after sale"
  );

  assert(
    tvorogBatchAAfterSale !== undefined,
    "Tvorog Batch A exists after sale"
  );

  assert(
    tvorogBatchBAfterSale !== undefined,
    "Tvorog Batch B exists after sale"
  );

  assert(
    milkBatchAAfterSale.quantity === 0,
    "Milk Batch A became 0 after sale"
  );

  assert(
    milkBatchAAfterSale.status === "EMPTY",
    "Milk Batch A became EMPTY"
  );

  assert(
    milkBatchBAfterSale.quantity === 1,
    "Milk Batch B became 1 after sale"
  );

  assert(
    milkBatchBAfterSale.status === "ACTIVE",
    "Milk Batch B remains ACTIVE"
  );

  assert(
    milkAfterSale.stock === 1,
    "Milk Product.stock became 1 after sale"
  );

  assert(
    tvorogBatchAAfterSale.quantity === 0,
    "Tvorog Batch A became 0 after sale"
  );

  assert(
    tvorogBatchAAfterSale.status === "EMPTY",
    "Tvorog Batch A became EMPTY"
  );

  assert(
    tvorogBatchBAfterSale.quantity === 0,
    "Tvorog Batch B became 0 after sale"
  );

  assert(
    tvorogBatchBAfterSale.status === "EMPTY",
    "Tvorog Batch B became EMPTY"
  );

  assert(
    tvorogAfterSale.stock === 0,
    "Tvorog Product.stock became 0 after sale"
  );

  // ===========================================================================
  // 10. VERIFY SALE MOVEMENTS
  // ===========================================================================

  step(10, "VERIFYING SALE MOVEMENTS");

  const saleMovements = await prisma.movement.findMany({
    where: {
      type: "SALE",
      comment: `Продажа. Заказ №${orderId}`,
      productId: {
        in: [milk.id, tvorog.id],
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(`SALE movements found=${saleMovements.length}`);

  for (const movement of saleMovements) {
    console.log(
      `Movement #${movement.id} | product=${movement.productId} | ` +
      `quantity=${movement.quantity} | ${movement.comment}`
    );
  }

  assert(
    saleMovements.length === 2,
    "Exactly two SALE movements were created"
  );

  const milkSaleMovement = saleMovements.find(
    (movement) => movement.productId === milk.id
  );

  const tvorogSaleMovement = saleMovements.find(
    (movement) => movement.productId === tvorog.id
  );

  assert(
    milkSaleMovement?.quantity === -4,
    "Milk SALE movement quantity is -4"
  );

  assert(
    tvorogSaleMovement?.quantity === -3,
    "Tvorog SALE movement quantity is -3"
  );

  // ===========================================================================
  // 11. RETURN MILK
  // ===========================================================================

  step(11, "RETURNING ONE MILK UNIT");

  const milkReturnRequest = await api(
    `/api/orders/${orderId}/return`,
    {
      method: "POST",
      body: JSON.stringify({
        itemId: milkItem.id,
        quantity: 1,
      }),
    }
  );

  console.log(`HTTP ${milkReturnRequest.response.status}`);
  console.log(`Response=${JSON.stringify(milkReturnRequest.body)}`);

  assert(
    milkReturnRequest.response.status === 200,
    "Milk return API returned HTTP 200"
  );

  // ===========================================================================
  // 12. VERIFY MILK LIFO RETURN
  // ===========================================================================

  step(12, "VERIFYING MILK LIFO RETURN");

  const milkAfterReturn = await prisma.orderItem.findUnique({
    where: {
      id: milkItem.id,
    },
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  assert(
    milkAfterReturn !== null,
    "Milk OrderItem exists after return"
  );

  assert(
    milkAfterReturn.returned === 1,
    "Milk OrderItem returned quantity became 1"
  );

  assert(
    milkAfterReturn.ReturnBatch.length === 1,
    "Milk has exactly one ReturnBatch"
  );

  const milkReturnBatch = milkAfterReturn.ReturnBatch[0];

  assert(
    milkReturnBatch.batchId === milkBatchB.id,
    "Milk return used the last sold batch (LIFO)"
  );

  assert(
    milkReturnBatch.quantity === 1,
    "Milk ReturnBatch quantity is 1"
  );

  const milkBatchBAfterReturn = await prisma.batch.findUnique({
    where: {
      id: milkBatchB.id,
    },
  });

  assert(
    milkBatchBAfterReturn !== null,
    "Milk Batch B exists after return"
  );

  assert(
    milkBatchBAfterReturn.quantity === 2,
    "Milk Batch B increased from 1 to 2 after return"
  );

  assert(
    milkBatchBAfterReturn.status === "ACTIVE",
    "Milk Batch B is ACTIVE after return"
  );

  const milkProductAfterReturn = await prisma.product.findUnique({
    where: {
      id: milk.id,
    },
  });

  assert(
    milkProductAfterReturn?.stock === 2,
    "Milk Product.stock became 2 after return"
  );

  // ===========================================================================
  // 13. RETURN TVOROG
  // ===========================================================================

  step(13, "RETURNING ONE TVOROG UNIT");

  const tvorogReturnRequest = await api(
    `/api/orders/${orderId}/return`,
    {
      method: "POST",
      body: JSON.stringify({
        itemId: tvorogItem.id,
        quantity: 1,
      }),
    }
  );

  console.log(`HTTP ${tvorogReturnRequest.response.status}`);
  console.log(`Response=${JSON.stringify(tvorogReturnRequest.body)}`);

  assert(
    tvorogReturnRequest.response.status === 200,
    "Tvorog return API returned HTTP 200"
  );

  // ===========================================================================
  // 14. VERIFY TVOROG LIFO RETURN
  // ===========================================================================

  step(14, "VERIFYING TVOROG LIFO RETURN");

  const tvorogAfterReturn = await prisma.orderItem.findUnique({
    where: {
      id: tvorogItem.id,
    },
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  assert(
    tvorogAfterReturn !== null,
    "Tvorog OrderItem exists after return"
  );

  assert(
    tvorogAfterReturn.returned === 1,
    "Tvorog OrderItem returned quantity became 1"
  );

  assert(
    tvorogAfterReturn.ReturnBatch.length === 1,
    "Tvorog has exactly one ReturnBatch"
  );

  const tvorogReturnBatch = tvorogAfterReturn.ReturnBatch[0];

  assert(
    tvorogReturnBatch.batchId === tvorogBatchB.id,
    "Tvorog return used the last sold batch (LIFO)"
  );

  assert(
    tvorogReturnBatch.quantity === 1,
    "Tvorog ReturnBatch quantity is 1"
  );

  const tvorogBatchBAfterReturn = await prisma.batch.findUnique({
    where: {
      id: tvorogBatchB.id,
    },
  });

  assert(
    tvorogBatchBAfterReturn !== null,
    "Tvorog Batch B exists after return"
  );

  assert(
    tvorogBatchBAfterReturn.quantity === 1,
    "Tvorog Batch B increased from 0 to 1 after return"
  );

  assert(
    tvorogBatchBAfterReturn.status === "ACTIVE",
    "Tvorog Batch B is ACTIVE after return"
  );

  const tvorogProductAfterReturn = await prisma.product.findUnique({
    where: {
      id: tvorog.id,
    },
  });

  assert(
    tvorogProductAfterReturn?.stock === 1,
    "Tvorog Product.stock became 1 after return"
  );

  // ===========================================================================
  // 15. VERIFY NET ORDER TOTAL / PROFIT / STATUS
  // ===========================================================================

  step(15, "VERIFYING NET ORDER TOTAL / PROFIT / STATUS");

  const orderAfterReturns = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  assert(
    orderAfterReturns !== null,
    "Order exists after returns"
  );

  const expectedNetTotal =
    3 * PRODUCTS.milk.price +
    2 * PRODUCTS.tvorog.price;

  const expectedNetMilkCost =
    2 * 100 +
    1 * 120;

  const expectedNetTvorogCost =
    1 * 180 +
    1 * 200;

  const expectedNetProfit =
    expectedNetTotal -
    expectedNetMilkCost -
    expectedNetTvorogCost;

  assert(
    orderAfterReturns.total === expectedNetTotal,
    `Net order total became ${expectedNetTotal}`
  );

  assert(
    orderAfterReturns.profit === expectedNetProfit,
    `Net order profit became ${expectedNetProfit}`
  );

  assert(
    orderAfterReturns.status === "PARTIAL_RETURN",
    "Order status became PARTIAL_RETURN"
  );

  console.log(`Net total=${orderAfterReturns.total}`);
  console.log(`Net profit=${orderAfterReturns.profit}`);

  // ===========================================================================
  // 16. VERIFY STOCK AFTER RETURNS
  // ===========================================================================

  step(16, "VERIFYING STOCK AFTER BOTH RETURNS");

  const milkStockAfterReturn = await prisma.product.findUnique({
    where: {
      id: milk.id,
    },
    include: {
      batches: true,
    },
  });

  const tvorogStockAfterReturn = await prisma.product.findUnique({
    where: {
      id: tvorog.id,
    },
    include: {
      batches: true,
    },
  });

  assert(
    milkStockAfterReturn !== null,
    "Milk exists after both returns"
  );

  assert(
    tvorogStockAfterReturn !== null,
    "Tvorog exists after both returns"
  );

  const milkBatchATest = milkStockAfterReturn.batches.find(
    (batch) => batch.id === milkBatchA.id
  );

  const milkBatchBTest = milkStockAfterReturn.batches.find(
    (batch) => batch.id === milkBatchB.id
  );

  const tvorogBatchATest = tvorogStockAfterReturn.batches.find(
    (batch) => batch.id === tvorogBatchA.id
  );

  const tvorogBatchBTest = tvorogStockAfterReturn.batches.find(
    (batch) => batch.id === tvorogBatchB.id
  );

  assert(
    milkBatchATest?.quantity === 0,
    "Milk Batch A remains at 0"
  );

  assert(
    milkBatchBTest?.quantity === 2,
    "Milk Batch B is 2 after return"
  );

  assert(
    milkStockAfterReturn.stock === 2,
    "Milk Product.stock became 2 after return"
  );

  assert(
    tvorogBatchATest?.quantity === 0,
    "Tvorog Batch A remains at 0"
  );

  assert(
    tvorogBatchBTest?.quantity === 1,
    "Tvorog Batch B is 1 after return"
  );

  assert(
    tvorogStockAfterReturn.stock === 1,
    "Tvorog Product.stock became 1 after return"
  );

  // ===========================================================================
  // 17. VERIFY RETURN MOVEMENTS
  // ===========================================================================

  step(17, "VERIFYING RETURN MOVEMENTS");

  const returnMovements = await prisma.movement.findMany({
    where: {
      type: "RETURN",
      comment: `Возврат из заказа №${orderId}`,
      productId: {
        in: [milk.id, tvorog.id],
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(`RETURN movements found=${returnMovements.length}`);

  for (const movement of returnMovements) {
    console.log(
      `Movement #${movement.id} | product=${movement.productId} | ` +
      `quantity=${movement.quantity} | ${movement.comment}`
    );
  }

  assert(
    returnMovements.length === 2,
    "Exactly two RETURN movements were created"
  );

  const milkReturnMovement = returnMovements.find(
    (movement) => movement.productId === milk.id
  );

  const tvorogReturnMovement = returnMovements.find(
    (movement) => movement.productId === tvorog.id
  );

  assert(
    milkReturnMovement?.quantity === 1,
    "Milk RETURN movement quantity is +1"
  );

  assert(
    tvorogReturnMovement?.quantity === 1,
    "Tvorog RETURN movement quantity is +1"
  );

  // ===========================================================================
  // 18. DELETE ORDER
  // ===========================================================================

  step(18, "DELETING MULTI-PRODUCT ORDER THROUGH DELETE API");

  const deleteRequest = await api(
    `/api/orders/${orderId}`,
    {
      method: "DELETE",
    }
  );

  console.log(`HTTP ${deleteRequest.response.status}`);
  console.log(`Response=${JSON.stringify(deleteRequest.body)}`);

  assert(
    deleteRequest.response.status === 200,
    "DELETE /api/orders/:id returned HTTP 200"
  );

  // ===========================================================================
  // 19. VERIFY ORDER WAS DELETED
  // ===========================================================================

  step(19, "VERIFYING ORDER DELETION");

  const deletedOrder = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  const deletedOrderItems = await prisma.orderItem.findMany({
    where: {
      orderId,
    },
  });

  assert(
    deletedOrder === null,
    "Order was deleted"
  );

  assert(
    deletedOrderItems.length === 0,
    "OrderItems were deleted"
  );

  const remainingOrderBatches = await prisma.orderBatch.findMany({
    where: {
      orderItemId: {
        in: [milkItem.id, tvorogItem.id],
      },
    },
  });

  const remainingReturnBatches = await prisma.returnBatch.findMany({
    where: {
      orderItemId: {
        in: [milkItem.id, tvorogItem.id],
      },
    },
  });

  assert(
    remainingOrderBatches.length === 0,
    "OrderBatch records were deleted"
  );

  assert(
    remainingReturnBatches.length === 0,
    "ReturnBatch records were deleted"
  );

  // ===========================================================================
  // 20. VERIFY RESTORED STOCK
  // ===========================================================================

  step(20, "VERIFYING RESTORED STOCK AFTER DELETE");

  const milkAfterDelete = await prisma.product.findUnique({
    where: {
      id: milk.id,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  const tvorogAfterDelete = await prisma.product.findUnique({
    where: {
      id: tvorog.id,
    },
    include: {
      batches: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  assert(
    milkAfterDelete !== null,
    "Milk exists after DELETE"
  );

  assert(
    tvorogAfterDelete !== null,
    "Tvorog exists after DELETE"
  );

  const milkBatchAFinal = milkAfterDelete.batches.find(
    (batch) => batch.id === milkBatchA.id
  );

  const milkBatchBFinal = milkAfterDelete.batches.find(
    (batch) => batch.id === milkBatchB.id
  );

  const tvorogBatchAFinal = tvorogAfterDelete.batches.find(
    (batch) => batch.id === tvorogBatchA.id
  );

  const tvorogBatchBFinal = tvorogAfterDelete.batches.find(
    (batch) => batch.id === tvorogBatchB.id
  );

  assert(
    milkBatchAFinal?.quantity === 2,
    "Milk Batch A restored to original quantity 2"
  );

  assert(
    milkBatchAFinal?.status === "ACTIVE",
    "Milk Batch A restored to ACTIVE"
  );

  assert(
    milkBatchBFinal?.quantity === 3,
    "Milk Batch B restored to original quantity 3"
  );

  assert(
    milkBatchBFinal?.status === "ACTIVE",
    "Milk Batch B restored to ACTIVE"
  );

  assert(
    milkAfterDelete.stock === 5,
    "Milk Product.stock restored to 5"
  );

  assert(
    tvorogBatchAFinal?.quantity === 1,
    "Tvorog Batch A restored to original quantity 1"
  );

  assert(
    tvorogBatchAFinal?.status === "ACTIVE",
    "Tvorog Batch A restored to ACTIVE"
  );

  assert(
    tvorogBatchBFinal?.quantity === 2,
    "Tvorog Batch B restored to original quantity 2"
  );

  assert(
    tvorogBatchBFinal?.status === "ACTIVE",
    "Tvorog Batch B restored to ACTIVE"
  );

  assert(
    tvorogAfterDelete.stock === 3,
    "Tvorog Product.stock restored to 3"
  );

  const finalMilkBatchTotal = milkAfterDelete.batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  const finalTvorogBatchTotal = tvorogAfterDelete.batches.reduce(
    (sum, batch) => sum + batch.quantity,
    0
  );

  assert(
    finalMilkBatchTotal === 5,
    "Final Milk batch total is 5"
  );

  assert(
    finalTvorogBatchTotal === 3,
    "Final Tvorog batch total is 3"
  );

  assert(
    milkAfterDelete.stock === finalMilkBatchTotal,
    "Final Milk Product.stock equals batch total"
  );

  assert(
    tvorogAfterDelete.stock === finalTvorogBatchTotal,
    "Final Tvorog Product.stock equals batch total"
  );

  // ===========================================================================
  // 21. VERIFY DELETE RESTORATION MOVEMENTS
  // ===========================================================================

  step(21, "VERIFYING DELETE RESTORATION MOVEMENTS");

  const deleteReturnMovements = await prisma.movement.findMany({
    where: {
      type: "RETURN",
      comment: {
        startsWith: `Возврат после удаления заказа №${orderId}.`,
      },
      productId: {
        in: [milk.id, tvorog.id],
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log(
    `DELETE RETURN movements found=${deleteReturnMovements.length}`
  );

  for (const movement of deleteReturnMovements) {
    console.log(
      `Movement #${movement.id} | product=${movement.productId} | ` +
      `quantity=${movement.quantity} | ${movement.comment}`
    );
  }

  assert(
    deleteReturnMovements.length === 4,
    "DELETE created four restoration movements"
  );

  const milkDeleteMovementA = deleteReturnMovements.find(
    (movement) =>
      movement.productId === milk.id &&
      movement.comment.includes(`Партия №${milkBatchA.id}`)
  );

  const milkDeleteMovementB = deleteReturnMovements.find(
    (movement) =>
      movement.productId === milk.id &&
      movement.comment.includes(`Партия №${milkBatchB.id}`)
  );

  const tvorogDeleteMovementA = deleteReturnMovements.find(
    (movement) =>
      movement.productId === tvorog.id &&
      movement.comment.includes(`Партия №${tvorogBatchA.id}`)
  );

  const tvorogDeleteMovementB = deleteReturnMovements.find(
    (movement) =>
      movement.productId === tvorog.id &&
      movement.comment.includes(`Партия №${tvorogBatchB.id}`)
  );

  assert(
    milkDeleteMovementA?.quantity === 2,
    "DELETE restored 2 Milk units to Batch A"
  );

  assert(
    milkDeleteMovementB?.quantity === 1,
    "DELETE restored 1 Milk unit to Batch B"
  );

  assert(
    tvorogDeleteMovementA?.quantity === 1,
    "DELETE restored 1 Tvorog unit to Batch A"
  );

  assert(
    tvorogDeleteMovementB?.quantity === 1,
    "DELETE restored 1 Tvorog unit to Batch B"
  );

  // ===========================================================================
  // 22. VERIFY MOVEMENT BALANCE
  // ===========================================================================

  step(22, "VERIFYING PER-PRODUCT MOVEMENT BALANCE");

  const allTestMovements = await prisma.movement.findMany({
    where: {
      productId: {
        in: [milk.id, tvorog.id],
      },
      OR: [
        {
          comment: `Продажа. Заказ №${orderId}`,
        },
        {
          comment: `Возврат из заказа №${orderId}`,
        },
        {
          comment: {
            startsWith: `Возврат после удаления заказа №${orderId}.`,
          },
        },
      ],
    },
    orderBy: {
      id: "asc",
    },
  });

  for (const movement of allTestMovements) {
    console.log(
      `Movement #${movement.id} | product=${movement.productId} | ` +
      `${movement.type} | quantity=${movement.quantity} | ${movement.comment}`
    );
  }

  const milkMovementBalance = allTestMovements
    .filter((movement) => movement.productId === milk.id)
    .reduce((sum, movement) => sum + movement.quantity, 0);

  const tvorogMovementBalance = allTestMovements
    .filter((movement) => movement.productId === tvorog.id)
    .reduce((sum, movement) => sum + movement.quantity, 0);

  assert(
    milkMovementBalance === 0,
    "Milk test movement net balance is 0"
  );

  assert(
    tvorogMovementBalance === 0,
    "Tvorog test movement net balance is 0"
  );

  // ===========================================================================
  // 23. REPEATED DELETE
  // ===========================================================================

  step(23, "VERIFYING REPEATED DELETE");

  const repeatedDelete = await api(
    `/api/orders/${orderId}`,
    {
      method: "DELETE",
    }
  );

  console.log(`HTTP ${repeatedDelete.response.status}`);
  console.log(`Response=${JSON.stringify(repeatedDelete.body)}`);

  assert(
    repeatedDelete.response.status === 404,
    "Repeated DELETE returned HTTP 404"
  );

  // ===========================================================================
  // FINAL
  // ===========================================================================

  section("ORDER LIFECYCLE V2 PASSED");

  console.log("Verified:");
  console.log("");
  console.log("🟢 Real POST /api/orders");
  console.log("🟢 Multiple products in one order");
  console.log("🟢 Multiple OrderItems");
  console.log("🟢 FEFO/FIFO allocation for Milk");
  console.log("🟢 FEFO/FIFO allocation for Tvorog");
  console.log("🟢 Multiple OrderBatch records");
  console.log("🟢 Purchase cost snapshots");
  console.log("🟢 Gross total");
  console.log("🟢 Gross profit");
  console.log("🟢 Product prices taken from database");
  console.log("🟢 Real POST /return");
  console.log("🟢 Milk LIFO return");
  console.log("🟢 Tvorog LIFO return");
  console.log("🟢 Multiple ReturnBatch records");
  console.log("🟢 Product.stock after multiple returns");
  console.log("🟢 NET order total");
  console.log("🟢 NET order profit");
  console.log("🟢 PARTIAL_RETURN status");
  console.log("🟢 SALE movements");
  console.log("🟢 RETURN movements");
  console.log("🟢 Real DELETE /api/orders/:id");
  console.log("🟢 Complete multi-product order deletion");
  console.log("🟢 Complete batch restoration");
  console.log("🟢 Product.stock restoration for both products");
  console.log("🟢 Batch-specific DELETE restoration movements");
  console.log("🟢 Per-product movement balance returns to zero");
  console.log("🟢 Repeated DELETE → 404");
  console.log("");
  console.log("The complete multi-product order lifecycle passed.");
}

async function cleanup() {
  section("LIFECYCLE V2 CLEANUP");

  try {
    if (createdProductIds.length === 0) {
      console.log("No test products were created.");
      return;
    }

    // -------------------------------------------------------------------------
    // If the test failed before DELETE, remove the test order through API.
    // -------------------------------------------------------------------------

    if (orderId !== null) {
      const existingOrder = await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

      if (existingOrder) {
        console.log(
          `Cleanup: test Order #${orderId} still exists. Deleting it first.`
        );

        const deleteResult = await api(
          `/api/orders/${orderId}`,
          {
            method: "DELETE",
          }
        );

        console.log(
          `Cleanup DELETE /api/orders/${orderId}: HTTP ${deleteResult.response.status}`
        );

        if (
          deleteResult.response.status === 200 ||
          deleteResult.response.status === 404
        ) {
          if (deleteResult.response.status === 200) {
            ok(`Test Order #${orderId} deleted during cleanup`);
          }
        } else {
          console.log(
            `Cleanup API DELETE failed: ${JSON.stringify(deleteResult.body)}`
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // Find test products.
    // -------------------------------------------------------------------------

    const products = await prisma.product.findMany({
      where: {
        id: {
          in: createdProductIds,
        },
      },
      include: {
        batches: true,
      },
    });

    if (products.length === 0) {
      ok("Final cleanup: no test products remain");
      return;
    }

    for (const product of products) {
      console.log(
        `Found test Product #${product.id} "${product.name}"`
      );
    }

    const productIds = products.map(
      (product) => product.id
    );

    // -------------------------------------------------------------------------
    // Delete movements.
    // -------------------------------------------------------------------------

    const movements = await prisma.movement.findMany({
      where: {
        productId: {
          in: productIds,
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(
      `Deleting ${movements.length} Movement record(s)`
    );

    for (const movement of movements) {
      console.log(
        `  Movement #${movement.id} | ${movement.type} | ` +
        `quantity=${movement.quantity} | ${movement.comment}`
      );
    }

    if (movements.length > 0) {
      await prisma.movement.deleteMany({
        where: {
          id: {
            in: movements.map(
              (movement) => movement.id
            ),
          },
        },
      });
    }

    // -------------------------------------------------------------------------
    // Delete any remaining OrderItems belonging to test products.
    // This should normally be unnecessary because DELETE API already removed
    // them, but it makes cleanup defensive.
    // -------------------------------------------------------------------------

    const remainingOrderItems = await prisma.orderItem.findMany({
      where: {
        productId: {
          in: productIds,
        },
      },
      select: {
        id: true,
        orderId: true,
      },
    });

    if (remainingOrderItems.length > 0) {
      console.log(
        `Cleanup found ${remainingOrderItems.length} remaining OrderItem(s)`
      );

      const remainingOrderItemIds = remainingOrderItems.map(
        (item) => item.id
      );

      await prisma.returnBatch.deleteMany({
        where: {
          orderItemId: {
            in: remainingOrderItemIds,
          },
        },
      });

      await prisma.orderBatch.deleteMany({
        where: {
          orderItemId: {
            in: remainingOrderItemIds,
          },
        },
      });

      await prisma.orderItem.deleteMany({
        where: {
          id: {
            in: remainingOrderItemIds,
          },
        },
      });
    }

    // -------------------------------------------------------------------------
    // Delete any remaining test orders.
    // -------------------------------------------------------------------------

    const remainingOrderIds = [
      ...new Set(
        remainingOrderItems.map(
          (item) => item.orderId
        )
      ),
    ];

    if (remainingOrderIds.length > 0) {
      await prisma.order.deleteMany({
        where: {
          id: {
            in: remainingOrderIds,
          },
        },
      });
    }

    // -------------------------------------------------------------------------
    // Delete batches.
    // -------------------------------------------------------------------------

    const batches = await prisma.batch.findMany({
      where: {
        productId: {
          in: productIds,
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    console.log(
      `Deleting ${batches.length} Batch record(s)`
    );

    for (const batch of batches) {
      console.log(
        `  Batch #${batch.id} | quantity=${batch.quantity} | status=${batch.status}`
      );
    }

    if (batches.length > 0) {
      await prisma.batch.deleteMany({
        where: {
          id: {
            in: batches.map(
              (batch) => batch.id
            ),
          },
        },
      });
    }

    // -------------------------------------------------------------------------
    // Delete products.
    // -------------------------------------------------------------------------

    await prisma.product.deleteMany({
      where: {
        id: {
          in: productIds,
        },
      },
    });

    const remainingProducts = await prisma.product.count({
      where: {
        id: {
          in: productIds,
        },
      },
    });

    if (remainingProducts !== 0) {
      throw new Error(
        `Cleanup failed: ${remainingProducts} test product(s) remain`
      );
    }

    ok("All test products deleted.");
    ok("All test batches deleted.");
    ok("All test movements deleted.");
    ok("Final cleanup: no test products remain");
  } catch (error) {
    console.error("");
    console.error("🔴 CLEANUP FAILED");
    console.error(error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("");
    console.error("==============================================================================");
    console.error("🔴 ORDER LIFECYCLE V2 FAILED");
    console.error("==============================================================================");
    console.error("");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch {
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  });