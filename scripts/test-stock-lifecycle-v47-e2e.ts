import { prisma } from "@/lib/prisma";

// ============================================================
// V47 — FULL STOCK LIFECYCLE E2E
//
// Проверяем полный жизненный цикл товара:
//
// SUPPLY  +10
// SALE     -6
// RETURN   +2
// WRITE_OFF -1
//
// Итоговый физический stock = 5
//
// Дополнительно проверяем:
// - Product.stock
// - Batch.quantity
// - Batch.status
// - OrderBatch
// - ReturnBatch
// - OrderItem.returned
// - Order.total
// - Order.profit
// - Order.status
// - Movement history
// - sellable stock
//
// ВАЖНО:
// Тест НЕ использует DELETE API для cleanup,
// потому что DELETE заказа восстанавливает товар.
// Для изолированного cleanup используются прямые Prisma
// операции после завершения всех проверок.
// ============================================================

const BASE_URL = "http://localhost:3000";

const TEST_PRODUCT_NAME =
"V47_INTEGRATION_TEST Молоко";

const TEST_SUPPLIER_NAME =
"V47_INTEGRATION_TEST Поставщик";

const PRODUCT_PRICE = 300;
const PURCHASE_COST = 100;

const SUPPLY_QUANTITY = 10;
const SALE_QUANTITY = 6;
const RETURN_QUANTITY = 2;
const WRITE_OFF_QUANTITY = 1;

const EXPECTED_FINAL_STOCK =
SUPPLY_QUANTITY -
SALE_QUANTITY +
RETURN_QUANTITY -
WRITE_OFF_QUANTITY;

// ============================================================
// Helpers
// ============================================================

function assert(
condition: unknown,
message: string
): asserts condition {
if (!condition) {
throw new Error(`ASSERT FAILED: ${message}`);
}
}

function formatLocalDate(date: Date): string {
const year = date.getFullYear();

const month = String(
date.getMonth() + 1
).padStart(2, "0");

const day = String(
date.getDate()
).padStart(2, "0");

return `${year}-${month}-${day}`;
}

async function getJson(
response: Response
): Promise<any> {
const text = await response.text();

if (!text) {
return null;
}

try {
return JSON.parse(text);
} catch {
return {
raw: text,
};
}
}

async function request(
path: string,
options?: RequestInit
) {
const response = await fetch(
`${BASE_URL}${path}`,
{
...options,
headers: {
"Content-Type": "application/json",
...(options?.headers ?? {}),
},
}
);

const data = await getJson(response);

return {
response,
data,
};
}

// ============================================================
// Test IDs
// ============================================================

let productId: number | null = null;
let supplierId: number | null = null;
let supplyId: number | null = null;
let batchId: number | null = null;
let orderId: number | null = null;
let orderItemId: number | null = null;

// ============================================================
// Main
// ============================================================

async function main() {
console.log("");
console.log(
"======================================================================"
);
console.log(
"V47 — FULL STOCK LIFECYCLE E2E"
);
console.log(
"======================================================================"
);
console.log("");

// ==========================================================
// 0. Проверяем ожидаемую математику
// ==========================================================

console.log("0. LIFECYCLE PLAN");
console.log(
"----------------------------------------------------------------------"
);

console.log(
`Supply:     +${SUPPLY_QUANTITY}`
);

console.log(
`Sale:       -${SALE_QUANTITY}`
);

console.log(
`Return:     +${RETURN_QUANTITY}`
);

console.log(
`Write-off:  -${WRITE_OFF_QUANTITY}`
);

console.log(
`Expected final stock=${EXPECTED_FINAL_STOCK}`
);

assert(
EXPECTED_FINAL_STOCK === 5,
"Ожидаемый итоговый stock должен быть 5"
);

console.log(
"🟢 Lifecycle arithmetic passed"
);
console.log("");

try {
// ========================================================
// 1. CREATE ISOLATED TEST DATA
// ========================================================


console.log("1. CREATE TEST DATA");
console.log(
  "----------------------------------------------------------------------"
);

const supplier =
  await prisma.supplier.create({
    data: {
      name: TEST_SUPPLIER_NAME,
      phone: null,
      address: null,
    },
  });

supplierId = supplier.id;

console.log(
  `Supplier #${supplier.id} created`
);

const product =
  await prisma.product.create({
    data: {
      name: TEST_PRODUCT_NAME,
      unit: "шт",
      price: PRODUCT_PRICE,
      cost: PURCHASE_COST,
      stock: 0,
    },
  });

productId = product.id;

console.log(
  `Product #${product.id} "${product.name}" created`
);

assert(
  product.stock === 0,
  `Initial Product.stock expected 0, got ${product.stock}`
);

console.log(
  "🟢 Isolated test data created"
);
console.log("");

// ========================================================
// 2. SUPPLY +10
// ========================================================

console.log("2. SUPPLY +10");
console.log(
  "----------------------------------------------------------------------"
);

const expiryDate = new Date(
  "2030-12-31T00:00:00"
);

const supplyResponse =
  await request(
    "/api/supplies",
    {
      method: "POST",
      body: JSON.stringify({
        supplierId,
        items: [
          {
            id: productId,
            quantity: SUPPLY_QUANTITY,
            cost: PURCHASE_COST,
            expiryDate:
              formatLocalDate(expiryDate),
          },
        ],
      }),
    }
  );

console.log(
  `HTTP ${supplyResponse.response.status}`
);

console.log(
  "Supply response:",
  JSON.stringify(
    supplyResponse.data,
    null,
    2
  )
);

assert(
  supplyResponse.response.status === 200,
  `Создание поставки должно вернуть HTTP 200, получено ${supplyResponse.response.status}`
);

// --------------------------------------------------------
// Находим созданную Supply через DB.
// --------------------------------------------------------

const createdSupply =
  await prisma.supply.findFirst({
    where: {
      supplierId,
      items: {
        some: {
          productId,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
    include: {
      items: true,
    },
  });

assert(
  createdSupply !== null,
  "Supply не найдена после POST /api/supplies"
);

supplyId = createdSupply.id;

assert(
  createdSupply.total ===
    SUPPLY_QUANTITY *
      PURCHASE_COST,
  `Supply.total должен быть ${
    SUPPLY_QUANTITY * PURCHASE_COST
  }, получено ${createdSupply.total}`
);

const supplyItem =
  createdSupply.items.find(
    (item) =>
      item.productId === productId
  );

assert(
  supplyItem !== undefined,
  "SupplyItem для тестового Product не найден"
);

assert(
  supplyItem.quantity ===
    SUPPLY_QUANTITY,
  `SupplyItem.quantity должен быть ${SUPPLY_QUANTITY}, получено ${supplyItem.quantity}`
);

assert(
  supplyItem.cost ===
    PURCHASE_COST,
  `SupplyItem.cost должен быть ${PURCHASE_COST}, получено ${supplyItem.cost}`
);

// --------------------------------------------------------
// Проверяем Batch
// --------------------------------------------------------

const batchesAfterSupply =
  await prisma.batch.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "desc",
    },
  });

assert(
  batchesAfterSupply.length === 1,
  `После поставки должна существовать 1 тестовая Batch, найдено ${batchesAfterSupply.length}`
);

const suppliedBatch =
  batchesAfterSupply[0];

batchId = suppliedBatch.id;

assert(
  suppliedBatch.quantity ===
    SUPPLY_QUANTITY,
  `Batch.quantity должен быть ${SUPPLY_QUANTITY}, получено ${suppliedBatch.quantity}`
);

assert(
  suppliedBatch.purchaseCost ===
    PURCHASE_COST,
  `Batch.purchaseCost должен быть ${PURCHASE_COST}, получено ${suppliedBatch.purchaseCost}`
);

assert(
  suppliedBatch.status ===
    "ACTIVE",
  `Batch.status должен быть ACTIVE, получено ${suppliedBatch.status}`
);

assert(
  formatLocalDate(
    suppliedBatch.expiryDate
  ) === "2030-12-31",
  `Batch expiryDate должен быть 2030-12-31, получено ${formatLocalDate(
    suppliedBatch.expiryDate
  )}`
);

// --------------------------------------------------------
// Проверяем Product.stock
// --------------------------------------------------------

const productAfterSupply =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  productAfterSupply !== null,
  "Product не найден после поставки"
);

assert(
  productAfterSupply.stock ===
    SUPPLY_QUANTITY,
  `После поставки Product.stock должен быть ${SUPPLY_QUANTITY}, получено ${productAfterSupply.stock}`
);

console.log(
  `Supply #${supplyId}`
);

console.log(
  `Batch #${batchId} quantity=${suppliedBatch.quantity}`
);

console.log(
  `Product.stock=${productAfterSupply.stock}`
);

console.log(
  "🟢 SUPPLY stage passed"
);
console.log("");

// ========================================================
// 3. VERIFY SUPPLY MOVEMENT
// ========================================================

console.log("3. VERIFY SUPPLY MOVEMENT");
console.log(
  "----------------------------------------------------------------------"
);

const supplyMovements =
  await prisma.movement.findMany({
    where: {
      productId,
      type: "SUPPLY",
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  supplyMovements.length === 1,
  `Должно быть ровно 1 SUPPLY движение, найдено ${supplyMovements.length}`
);

const supplyMovement =
  supplyMovements[0];

assert(
  supplyMovement.quantity ===
    SUPPLY_QUANTITY,
  `SUPPLY movement.quantity должен быть +${SUPPLY_QUANTITY}, получено ${supplyMovement.quantity}`
);

assert(
  supplyMovement.comment ===
    `Приход поставка №${supplyId}`,
  `Некорректный комментарий SUPPLY: ${supplyMovement.comment}`
);

console.log(
  `Movement #${supplyMovement.id} SUPPLY +${supplyMovement.quantity}`
);

console.log(
  "🟢 SUPPLY movement passed"
);
console.log("");

// ========================================================
// 4. SELL 6
// ========================================================

console.log("4. SALE -6");
console.log(
  "----------------------------------------------------------------------"
);

const saleResponse =
  await request(
    "/api/orders",
    {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: productId,
            quantity: SALE_QUANTITY,
            price: PRODUCT_PRICE,
          },
        ],
      }),
    }
  );

console.log(
  `HTTP ${saleResponse.response.status}`
);

assert(
  saleResponse.response.status === 201,
  `Создание заказа должно вернуть HTTP 201, получено ${saleResponse.response.status}`
);

// --------------------------------------------------------
// Находим созданный OrderItem
// --------------------------------------------------------

const createdOrderItem =
  await prisma.orderItem.findFirst({
    where: {
      productId,
    },
    orderBy: {
      id: "desc",
    },
    include: {
      order: true,
    },
  });

assert(
  createdOrderItem !== null,
  "OrderItem не найден после создания заказа"
);

orderItemId =
  createdOrderItem.id;

orderId =
  createdOrderItem.orderId;

assert(
  createdOrderItem.quantity ===
    SALE_QUANTITY,
  `OrderItem.quantity должен быть ${SALE_QUANTITY}, получено ${createdOrderItem.quantity}`
);

assert(
  createdOrderItem.returned === 0,
  `До возврата OrderItem.returned должен быть 0, получено ${createdOrderItem.returned}`
);

assert(
  createdOrderItem.price ===
    PRODUCT_PRICE,
  `OrderItem.price должен быть ${PRODUCT_PRICE}, получено ${createdOrderItem.price}`
);

// --------------------------------------------------------
// Проверяем Order
// --------------------------------------------------------

const orderAfterSale =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

assert(
  orderAfterSale !== null,
  "Order не найден после создания"
);

assert(
  orderAfterSale.total ===
    SALE_QUANTITY *
      PRODUCT_PRICE,
  `Gross order.total должен быть ${
    SALE_QUANTITY * PRODUCT_PRICE
  }, получено ${orderAfterSale.total}`
);

const expectedGrossProfit =
  SALE_QUANTITY *
    (PRODUCT_PRICE -
      PURCHASE_COST);

assert(
  orderAfterSale.profit ===
    expectedGrossProfit,
  `Gross order.profit должен быть ${expectedGrossProfit}, получено ${orderAfterSale.profit}`
);

assert(
  orderAfterSale.status ===
    "COMPLETED",
  `После продажи status должен быть COMPLETED, получено ${orderAfterSale.status}`
);

// --------------------------------------------------------
// Проверяем OrderBatch
// --------------------------------------------------------

const orderBatches =
  await prisma.orderBatch.findMany({
    where: {
      orderItemId,
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  orderBatches.length === 1,
  `Должен быть 1 OrderBatch, найдено ${orderBatches.length}`
);

const orderBatch =
  orderBatches[0];

assert(
  orderBatch.batchId ===
    batchId,
  `OrderBatch.batchId должен быть ${batchId}, получено ${orderBatch.batchId}`
);

assert(
  orderBatch.quantity ===
    SALE_QUANTITY,
  `OrderBatch.quantity должен быть ${SALE_QUANTITY}, получено ${orderBatch.quantity}`
);

assert(
  orderBatch.purchaseCost ===
    PURCHASE_COST,
  `OrderBatch.purchaseCost должен быть ${PURCHASE_COST}, получено ${orderBatch.purchaseCost}`
);

// --------------------------------------------------------
// Проверяем Batch после продажи
// --------------------------------------------------------

const batchAfterSale =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert(
  batchAfterSale !== null,
  "Batch не найдена после продажи"
);

const expectedAfterSale =
  SUPPLY_QUANTITY -
  SALE_QUANTITY;

assert(
  batchAfterSale.quantity ===
    expectedAfterSale,
  `После продажи Batch.quantity должен быть ${expectedAfterSale}, получено ${batchAfterSale.quantity}`
);

assert(
  batchAfterSale.status ===
    "ACTIVE",
  `После частичной продажи Batch.status должен быть ACTIVE, получено ${batchAfterSale.status}`
);

// --------------------------------------------------------
// Проверяем Product.stock
// --------------------------------------------------------

const productAfterSale =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  productAfterSale !== null,
  "Product не найден после продажи"
);

assert(
  productAfterSale.stock ===
    expectedAfterSale,
  `После продажи Product.stock должен быть ${expectedAfterSale}, получено ${productAfterSale.stock}`
);

console.log(
  `Order #${orderId}`
);

console.log(
  `OrderItem #${orderItemId}`
);

console.log(
  `OrderBatch #${orderBatch.id} → Batch #${orderBatch.batchId}, qty=${orderBatch.quantity}, cost=${orderBatch.purchaseCost}`
);

console.log(
  `Batch quantity=${batchAfterSale.quantity}`
);

console.log(
  `Product.stock=${productAfterSale.stock}`
);

console.log(
  `Gross total=${orderAfterSale.total}`
);

console.log(
  `Gross profit=${orderAfterSale.profit}`
);

console.log(
  "🟢 SALE stage passed"
);
console.log("");

// ========================================================
// 5. VERIFY SALE MOVEMENT
// ========================================================

console.log("5. VERIFY SALE MOVEMENT");
console.log(
  "----------------------------------------------------------------------"
);

const saleMovements =
  await prisma.movement.findMany({
    where: {
      productId,
      type: "SALE",
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  saleMovements.length === 1,
  `Должно быть ровно 1 SALE движение, найдено ${saleMovements.length}`
);

const saleMovement =
  saleMovements[0];

assert(
  saleMovement.quantity ===
    -SALE_QUANTITY,
  `SALE movement.quantity должен быть -${SALE_QUANTITY}, получено ${saleMovement.quantity}`
);

assert(
  saleMovement.comment ===
    `Продажа. Заказ №${orderId}`,
  `Некорректный комментарий SALE: ${saleMovement.comment}`
);

console.log(
  `Movement #${saleMovement.id} SALE ${saleMovement.quantity}`
);

console.log(
  "🟢 SALE movement passed"
);
console.log("");

// ========================================================
// 6. RETURN 2
// ========================================================

console.log("6. RETURN +2");
console.log(
  "----------------------------------------------------------------------"
);

const returnResponse =
  await request(
    `/api/orders/${orderId}/return`,
    {
      method: "POST",
      body: JSON.stringify({
        itemId: orderItemId,
        quantity: RETURN_QUANTITY,
      }),
    }
  );

console.log(
  `HTTP ${returnResponse.response.status}`
);

console.log(
  "Return response:",
  JSON.stringify(
    returnResponse.data,
    null,
    2
  )
);

assert(
  returnResponse.response.status ===
    200,
  `Возврат должен вернуть HTTP 200, получено ${returnResponse.response.status}`
);

// --------------------------------------------------------
// Проверяем OrderItem
// --------------------------------------------------------

const orderItemAfterReturn =
  await prisma.orderItem.findUnique({
    where: {
      id: orderItemId,
    },
  });

assert(
  orderItemAfterReturn !== null,
  "OrderItem не найден после возврата"
);

assert(
  orderItemAfterReturn.quantity ===
    SALE_QUANTITY,
  `OrderItem.quantity должен остаться ${SALE_QUANTITY}, получено ${orderItemAfterReturn.quantity}`
);

assert(
  orderItemAfterReturn.returned ===
    RETURN_QUANTITY,
  `OrderItem.returned должен быть ${RETURN_QUANTITY}, получено ${orderItemAfterReturn.returned}`
);

// --------------------------------------------------------
// Проверяем ReturnBatch
// --------------------------------------------------------

const returnBatches =
  await prisma.returnBatch.findMany({
    where: {
      orderItemId,
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  returnBatches.length === 1,
  `Должен быть 1 ReturnBatch, найдено ${returnBatches.length}`
);

const returnBatch =
  returnBatches[0];

assert(
  returnBatch.batchId ===
    batchId,
  `ReturnBatch.batchId должен быть ${batchId}, получено ${returnBatch.batchId}`
);

assert(
  returnBatch.quantity ===
    RETURN_QUANTITY,
  `ReturnBatch.quantity должен быть ${RETURN_QUANTITY}, получено ${returnBatch.quantity}`
);

// --------------------------------------------------------
// Проверяем Batch
// --------------------------------------------------------

const batchAfterReturn =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert(
  batchAfterReturn !== null,
  "Batch не найдена после возврата"
);

const expectedAfterReturn =
  SUPPLY_QUANTITY -
  SALE_QUANTITY +
  RETURN_QUANTITY;

assert(
  batchAfterReturn.quantity ===
    expectedAfterReturn,
  `После возврата Batch.quantity должен быть ${expectedAfterReturn}, получено ${batchAfterReturn.quantity}`
);

assert(
  batchAfterReturn.status ===
    "ACTIVE",
  `После возврата Batch.status должен быть ACTIVE, получено ${batchAfterReturn.status}`
);

// --------------------------------------------------------
// Проверяем Product.stock
// --------------------------------------------------------

const productAfterReturn =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  productAfterReturn !== null,
  "Product не найден после возврата"
);

assert(
  productAfterReturn.stock ===
    expectedAfterReturn,
  `После возврата Product.stock должен быть ${expectedAfterReturn}, получено ${productAfterReturn.stock}`
);

// --------------------------------------------------------
// Проверяем NET Order
//
// Осталось продано:
// 6 - 2 = 4
//
// Revenue:
// 4 * 300 = 1200
//
// Cost:
// 4 * 100 = 400
//
// Profit:
// 1200 - 400 = 800
// --------------------------------------------------------

const orderAfterReturn =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

assert(
  orderAfterReturn !== null,
  "Order не найден после возврата"
);

const expectedNetQuantity =
  SALE_QUANTITY -
  RETURN_QUANTITY;

const expectedNetTotal =
  expectedNetQuantity *
  PRODUCT_PRICE;

const expectedNetCost =
  expectedNetQuantity *
  PURCHASE_COST;

const expectedNetProfit =
  expectedNetTotal -
  expectedNetCost;

assert(
  expectedNetQuantity === 4,
  `Ожидаемое NET quantity должно быть 4, получено ${expectedNetQuantity}`
);

assert(
  expectedNetTotal === 1200,
  `Ожидаемый NET total должен быть 1200, получено ${expectedNetTotal}`
);

assert(
  expectedNetCost === 400,
  `Ожидаемая NET себестоимость должна быть 400, получено ${expectedNetCost}`
);

assert(
  expectedNetProfit === 800,
  `Ожидаемая NET прибыль должна быть 800, получено ${expectedNetProfit}`
);

assert(
  orderAfterReturn.total ===
    expectedNetTotal,
  `После возврата Order.total должен быть ${expectedNetTotal}, получено ${orderAfterReturn.total}`
);

assert(
  orderAfterReturn.profit ===
    expectedNetProfit,
  `После возврата Order.profit должен быть ${expectedNetProfit}, получено ${orderAfterReturn.profit}`
);

assert(
  orderAfterReturn.status ===
    "PARTIAL_RETURN",
  `После частичного возврата Order.status должен быть PARTIAL_RETURN, получено ${orderAfterReturn.status}`
);

console.log(
  `Batch quantity=${batchAfterReturn.quantity}`
);

console.log(
  `Product.stock=${productAfterReturn.stock}`
);

console.log(
  `OrderItem.returned=${orderItemAfterReturn.returned}`
);

console.log(
  `ReturnBatch #${returnBatch.id} qty=${returnBatch.quantity}`
);

console.log(
  `NET total=${orderAfterReturn.total}`
);

console.log(
  `NET profit=${orderAfterReturn.profit}`
);

console.log(
  `Order.status=${orderAfterReturn.status}`
);

console.log(
  "🟢 RETURN stage passed"
);
console.log("");

// ========================================================
// 7. VERIFY RETURN MOVEMENT
// ========================================================

console.log("7. VERIFY RETURN MOVEMENT");
console.log(
  "----------------------------------------------------------------------"
);

const returnMovements =
  await prisma.movement.findMany({
    where: {
      productId,
      type: "RETURN",
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  returnMovements.length === 1,
  `Должно быть ровно 1 RETURN движение, найдено ${returnMovements.length}`
);

const returnMovement =
  returnMovements[0];

assert(
  returnMovement.quantity ===
    RETURN_QUANTITY,
  `RETURN movement.quantity должен быть +${RETURN_QUANTITY}, получено ${returnMovement.quantity}`
);

assert(
  returnMovement.comment ===
    `Возврат из заказа №${orderId}`,
  `Некорректный комментарий RETURN: ${returnMovement.comment}`
);

console.log(
  `Movement #${returnMovement.id} RETURN +${returnMovement.quantity}`
);

console.log(
  "🟢 RETURN movement passed"
);
console.log("");

// ========================================================
// 8. WRITE OFF 1
// ========================================================

console.log("8. WRITE-OFF -1");
console.log(
  "----------------------------------------------------------------------"
);

const writeOffResponse =
  await request(
    `/api/batches/${batchId}/writeoff`,
    {
      method: "POST",
      body: JSON.stringify({
        quantity:
          WRITE_OFF_QUANTITY,
        reason:
          "V47 интеграционный тест",
      }),
    }
  );

console.log(
  `HTTP ${writeOffResponse.response.status}`
);

console.log(
  "Write-off response:",
  JSON.stringify(
    writeOffResponse.data,
    null,
    2
  )
);

assert(
  writeOffResponse.response.status ===
    200,
  `Списание должно вернуть HTTP 200, получено ${writeOffResponse.response.status}`
);

// --------------------------------------------------------
// Проверяем Batch
// --------------------------------------------------------

const batchAfterWriteOff =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert(
  batchAfterWriteOff !== null,
  "Batch не найдена после списания"
);

const expectedAfterWriteOff =
  SUPPLY_QUANTITY -
  SALE_QUANTITY +
  RETURN_QUANTITY -
  WRITE_OFF_QUANTITY;

assert(
  expectedAfterWriteOff === 5,
  `Ожидаемый Batch.quantity после списания должен быть 5, получено ${expectedAfterWriteOff}`
);

assert(
  batchAfterWriteOff.quantity ===
    expectedAfterWriteOff,
  `После списания Batch.quantity должен быть ${expectedAfterWriteOff}, получено ${batchAfterWriteOff.quantity}`
);

assert(
  batchAfterWriteOff.status ===
    "ACTIVE",
  `После списания Batch.status должен быть ACTIVE, получено ${batchAfterWriteOff.status}`
);

// --------------------------------------------------------
// Проверяем Product.stock
// --------------------------------------------------------

const productAfterWriteOff =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  productAfterWriteOff !== null,
  "Product не найден после списания"
);

assert(
  productAfterWriteOff.stock ===
    EXPECTED_FINAL_STOCK,
  `После списания Product.stock должен быть ${EXPECTED_FINAL_STOCK}, получено ${productAfterWriteOff.stock}`
);

console.log(
  `Batch quantity=${batchAfterWriteOff.quantity}`
);

console.log(
  `Batch status=${batchAfterWriteOff.status}`
);

console.log(
  `Product.stock=${productAfterWriteOff.stock}`
);

console.log(
  "🟢 WRITE-OFF stage passed"
);
console.log("");

// ========================================================
// 9. VERIFY WRITE-OFF MOVEMENT
// ========================================================

console.log("9. VERIFY WRITE-OFF MOVEMENT");
console.log(
  "----------------------------------------------------------------------"
);

const writeOffMovements =
  await prisma.movement.findMany({
    where: {
      productId,
      type: "WRITE_OFF",
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  writeOffMovements.length === 1,
  `Должно быть ровно 1 WRITE_OFF движение, найдено ${writeOffMovements.length}`
);

const writeOffMovement =
  writeOffMovements[0];

assert(
  writeOffMovement.quantity ===
    -WRITE_OFF_QUANTITY,
  `WRITE_OFF movement.quantity должен быть -${WRITE_OFF_QUANTITY}, получено ${writeOffMovement.quantity}`
);

assert(
  writeOffMovement.comment ===
    `V47 интеграционный тест. Партия №${batchId}`,
  `Некорректный комментарий WRITE_OFF: ${writeOffMovement.comment}`
);

console.log(
  `Movement #${writeOffMovement.id} WRITE_OFF ${writeOffMovement.quantity}`
);

console.log(
  "🟢 WRITE-OFF movement passed"
);
console.log("");

// ========================================================
// 10. VERIFY PHYSICAL STOCK
// ========================================================

console.log("10. VERIFY PHYSICAL STOCK");
console.log(
  "----------------------------------------------------------------------"
);

const physicalAggregate =
  await prisma.batch.aggregate({
    where: {
      productId,
    },
    _sum: {
      quantity: true,
    },
  });

const physicalStock =
  physicalAggregate._sum.quantity ??
  0;

assert(
  physicalStock ===
    EXPECTED_FINAL_STOCK,
  `SUM(Batch.quantity) должен быть ${EXPECTED_FINAL_STOCK}, получено ${physicalStock}`
);

assert(
  productAfterWriteOff.stock ===
    physicalStock,
  `Product.stock=${productAfterWriteOff.stock}, Batch total=${physicalStock}`
);

console.log(
  `SUM(Batch.quantity)=${physicalStock}`
);

console.log(
  `Product.stock=${productAfterWriteOff.stock}`
);

console.log(
  "🟢 Physical stock invariant passed"
);
console.log("");

// ========================================================
// 11. VERIFY SELLABLE STOCK
// ========================================================

console.log("11. VERIFY SELLABLE STOCK");
console.log(
  "----------------------------------------------------------------------"
);

const now = new Date();

const sellableAggregate =
  await prisma.batch.aggregate({
    where: {
      productId,
      quantity: {
        gt: 0,
      },
      status: "ACTIVE",
      receivedAt: {
        lte: now,
      },
      expiryDate: {
        gte: now,
      },
    },
    _sum: {
      quantity: true,
    },
  });

const sellableStock =
  sellableAggregate._sum.quantity ??
  0;

assert(
  sellableStock ===
    EXPECTED_FINAL_STOCK,
  `Sellable stock должен быть ${EXPECTED_FINAL_STOCK}, получено ${sellableStock}`
);

console.log(
  `Sellable stock=${sellableStock}`
);

console.log(
  "🟢 Sellable stock invariant passed"
);
console.log("");

// ========================================================
// 12. VERIFY ALL MOVEMENTS
// ========================================================

console.log("12. VERIFY COMPLETE MOVEMENT HISTORY");
console.log(
  "----------------------------------------------------------------------"
);

const allMovements =
  await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

assert(
  allMovements.length === 4,
  `Для тестового Product должно быть ровно 4 Movement, найдено ${allMovements.length}`
);

const supplyMovementCount =
  allMovements.filter(
    (movement) =>
      movement.type === "SUPPLY"
  ).length;

const saleMovementCount =
  allMovements.filter(
    (movement) =>
      movement.type === "SALE"
  ).length;

const returnMovementCount =
  allMovements.filter(
    (movement) =>
      movement.type === "RETURN"
  ).length;

const writeOffMovementCount =
  allMovements.filter(
    (movement) =>
      movement.type ===
      "WRITE_OFF"
  ).length;

assert(
  supplyMovementCount === 1,
  `SUPPLY movement count должен быть 1, получено ${supplyMovementCount}`
);

assert(
  saleMovementCount === 1,
  `SALE movement count должен быть 1, получено ${saleMovementCount}`
);

assert(
  returnMovementCount === 1,
  `RETURN movement count должен быть 1, получено ${returnMovementCount}`
);

assert(
  writeOffMovementCount === 1,
  `WRITE_OFF movement count должен быть 1, получено ${writeOffMovementCount}`
);

const movementNet =
  allMovements.reduce(
    (sum, movement) =>
      sum + movement.quantity,
    0
  );

assert(
  movementNet ===
    EXPECTED_FINAL_STOCK,
  `Net movement должен быть ${EXPECTED_FINAL_STOCK}, получено ${movementNet}`
);

const supplyQuantity =
  allMovements
    .filter(
      (movement) =>
        movement.type ===
        "SUPPLY"
    )
    .reduce(
      (sum, movement) =>
        sum + movement.quantity,
      0
    );

const saleQuantity =
  allMovements
    .filter(
      (movement) =>
        movement.type ===
        "SALE"
    )
    .reduce(
      (sum, movement) =>
        sum + movement.quantity,
      0
    );

const returnQuantity =
  allMovements
    .filter(
      (movement) =>
        movement.type ===
        "RETURN"
    )
    .reduce(
      (sum, movement) =>
        sum + movement.quantity,
      0
    );

const writeOffQuantity =
  allMovements
    .filter(
      (movement) =>
        movement.type ===
        "WRITE_OFF"
    )
    .reduce(
      (sum, movement) =>
        sum + movement.quantity,
      0
    );

assert(
  supplyQuantity ===
    SUPPLY_QUANTITY,
  `SUPPLY total должен быть +${SUPPLY_QUANTITY}, получено ${supplyQuantity}`
);

assert(
  saleQuantity ===
    -SALE_QUANTITY,
  `SALE total должен быть -${SALE_QUANTITY}, получено ${saleQuantity}`
);

assert(
  returnQuantity ===
    RETURN_QUANTITY,
  `RETURN total должен быть +${RETURN_QUANTITY}, получено ${returnQuantity}`
);

assert(
  writeOffQuantity ===
    -WRITE_OFF_QUANTITY,
  `WRITE_OFF total должен быть -${WRITE_OFF_QUANTITY}, получено ${writeOffQuantity}`
);

console.log(
  `SUPPLY=${supplyQuantity}`
);

console.log(
  `SALE=${saleQuantity}`
);

console.log(
  `RETURN=${returnQuantity}`
);

console.log(
  `WRITE_OFF=${writeOffQuantity}`
);

console.log(
  `NET=${movementNet}`
);

console.log(
  "🟢 Complete movement history passed"
);
console.log("");

// ========================================================
// 13. VERIFY ORDER FINANCIAL RESULT
// ========================================================

console.log("13. VERIFY ORDER FINANCIAL RESULT");
console.log(
  "----------------------------------------------------------------------"
);

const finalOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
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

assert(
  finalOrder !== null,
  "Order не найден при финальной проверке"
);

assert(
  finalOrder.total === 1200,
  `Final Order.total должен быть 1200, получено ${finalOrder.total}`
);

assert(
  finalOrder.profit === 800,
  `Final Order.profit должен быть 800, получено ${finalOrder.profit}`
);

assert(
  finalOrder.status ===
    "PARTIAL_RETURN",
  `Final Order.status должен быть PARTIAL_RETURN, получено ${finalOrder.status}`
);

assert(
  finalOrder.items.length === 1,
  `Final Order должен иметь 1 OrderItem, найдено ${finalOrder.items.length}`
);

const finalItem =
  finalOrder.items[0];

assert(
  finalItem.quantity === 6,
  `Final OrderItem.quantity должен быть 6, получено ${finalItem.quantity}`
);

assert(
  finalItem.returned === 2,
  `Final OrderItem.returned должен быть 2, получено ${finalItem.returned}`
);

const finalOrderBatchQuantity =
  finalItem.batches.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );

const finalReturnedBatchQuantity =
  finalItem.ReturnBatch.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );

assert(
  finalOrderBatchQuantity === 6,
  `OrderBatch total должен быть 6, получено ${finalOrderBatchQuantity}`
);

assert(
  finalReturnedBatchQuantity === 2,
  `ReturnBatch total должен быть 2, получено ${finalReturnedBatchQuantity}`
);

assert(
  finalOrderBatchQuantity -
    finalReturnedBatchQuantity ===
    4,
  "NET проданное количество должно быть 4"
);

console.log(
  `Order #${finalOrder.id}`
);

console.log(
  `Gross sold=${finalItem.quantity}`
);

console.log(
  `Returned=${finalItem.returned}`
);

console.log(
  `Net sold=${finalItem.quantity - finalItem.returned}`
);

console.log(
  `NET total=${finalOrder.total}`
);

console.log(
  `NET profit=${finalOrder.profit}`
);

console.log(
  `Status=${finalOrder.status}`
);

console.log(
  "🟢 Order financial result passed"
);
console.log("");

// ========================================================
// 14. FINAL INTEGRITY CHECK
// ========================================================

console.log("14. FINAL INTEGRITY CHECK");
console.log(
  "----------------------------------------------------------------------"
);

const finalBatch =
  await prisma.batch.findUnique({
    where: {
      id: batchId,
    },
  });

assert(
  finalBatch !== null,
  "Final Batch отсутствует"
);

const finalProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

assert(
  finalProduct !== null,
  "Final Product отсутствует"
);

const finalBatchTotal =
  await prisma.batch.aggregate({
    where: {
      productId,
    },
    _sum: {
      quantity: true,
    },
  });

const finalPhysicalStock =
  finalBatchTotal._sum.quantity ??
  0;

assert(
  finalProduct.stock ===
    finalPhysicalStock,
  `FINAL invariant: Product.stock=${finalProduct.stock}, Batch total=${finalPhysicalStock}`
);

assert(
  finalPhysicalStock === 5,
  `FINAL physical stock должен быть 5, получено ${finalPhysicalStock}`
);

assert(
  finalBatch.quantity === 5,
  `FINAL Batch.quantity должен быть 5, получено ${finalBatch.quantity}`
);

assert(
  finalBatch.status ===
    "ACTIVE",
  `FINAL Batch.status должен быть ACTIVE, получено ${finalBatch.status}`
);

console.log(
  `Product #${finalProduct.id} stock=${finalProduct.stock}`
);

console.log(
  `Batch #${finalBatch.id} quantity=${finalBatch.quantity}`
);

console.log(
  `Batch #${finalBatch.id} status=${finalBatch.status}`
);

console.log(
  `Batch total=${finalPhysicalStock}`
);

console.log(
  "🟢 FINAL integrity check passed"
);
console.log("");

// ========================================================
// 15. SUCCESS
// ========================================================

console.log(
  "======================================================================"
);
console.log(
  "V47 PASSED"
);
console.log(
  "======================================================================"
);
console.log("");

console.log(
  "Lifecycle:"
);

console.log(
  `  SUPPLY       +${SUPPLY_QUANTITY}`
);

console.log(
  `  SALE         -${SALE_QUANTITY}`
);

console.log(
  `  RETURN       +${RETURN_QUANTITY}`
);

console.log(
  `  WRITE_OFF    -${WRITE_OFF_QUANTITY}`
);

console.log(
  `  FINAL STOCK   ${EXPECTED_FINAL_STOCK}`
);

console.log("");

console.log(
  "Financial:"
);

console.log(
  "  Gross revenue = 1800"
);

console.log(
  "  Gross profit  = 1200"
);

console.log(
  "  Net revenue   = 1200"
);

console.log(
  "  Net profit    = 800"
);

console.log("");

console.log(
  "Database integrity:"
);

console.log(
  "  Product.stock == SUM(Batch.quantity) ✓"
);

console.log(
  "  OrderBatch history ✓"
);

console.log(
  "  ReturnBatch history ✓"
);

console.log(
  "  Movement history ✓"
);

console.log(
  "  Sellable stock ✓"
);

console.log("");

console.log(
  "🟢 V47 FULL STOCK LIFECYCLE PASSED"
);


} finally {
// ========================================================
// CLEANUP
//
// НИКОГДА не используем DELETE API заказа здесь,
// поскольку он восстанавливает склад.
//
// Нам нужно удалить только тестовые записи из БД
// после того, как все проверки завершены.
// ========================================================


console.log("");
console.log(
  "======================================================================"
);
console.log(
  "V47 CLEANUP"
);
console.log(
  "======================================================================"
);
console.log("");

try {
  await prisma.$transaction(
    async (tx) => {
      // --------------------------------------------------
      // 1. Order
      //
      // OrderItem -> OrderBatch / ReturnBatch
      // удалятся каскадно согласно Prisma schema.
      // --------------------------------------------------

      if (orderId !== null) {
        const deletedOrder =
          await tx.order.deleteMany({
            where: {
              id: orderId,
            },
          });

        console.log(
          `Orders deleted=${deletedOrder.count}`
        );
      }

      // --------------------------------------------------
      // 2. Supply
      //
      // SupplyItem удалится каскадно.
      // --------------------------------------------------

      if (supplyId !== null) {
        const deletedSupply =
          await tx.supply.deleteMany({
            where: {
              id: supplyId,
            },
          });

        console.log(
          `Supplies deleted=${deletedSupply.count}`
        );
      }

      // --------------------------------------------------
      // 3. Movements
      // --------------------------------------------------

      if (productId !== null) {
        const deletedMovements =
          await tx.movement.deleteMany({
            where: {
              productId,
            },
          });

        console.log(
          `Movements deleted=${deletedMovements.count}`
        );
      }

      // --------------------------------------------------
      // 4. Batch
      //
      // OrderBatch / ReturnBatch уже удалены вместе
      // с OrderItem.
      // --------------------------------------------------

      if (productId !== null) {
        const deletedBatches =
          await tx.batch.deleteMany({
            where: {
              productId,
            },
          });

        console.log(
          `Batches deleted=${deletedBatches.count}`
        );
      }

      // --------------------------------------------------
      // 5. Product
      // --------------------------------------------------

      if (productId !== null) {
        const deletedProducts =
          await tx.product.deleteMany({
            where: {
              id: productId,
            },
          });

        console.log(
          `Products deleted=${deletedProducts.count}`
        );
      }

      // --------------------------------------------------
      // 6. Supplier
      // --------------------------------------------------

      if (supplierId !== null) {
        const deletedSuppliers =
          await tx.supplier.deleteMany({
            where: {
              id: supplierId,
            },
          });

        console.log(
          `Suppliers deleted=${deletedSuppliers.count}`
        );
      }
    }
  );

  // ======================================================
  // Verify cleanup
  // ======================================================

  if (orderId !== null) {
    const remainingOrder =
      await prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

    assert(
      remainingOrder === null,
      `Cleanup: Order #${orderId} всё ещё существует`
    );
  }

  if (orderItemId !== null) {
    const remainingOrderItem =
      await prisma.orderItem.findUnique({
        where: {
          id: orderItemId,
        },
      });

    assert(
      remainingOrderItem === null,
      `Cleanup: OrderItem #${orderItemId} всё ещё существует`
    );
  }

  if (batchId !== null) {
    const remainingBatch =
      await prisma.batch.findUnique({
        where: {
          id: batchId,
        },
      });

    assert(
      remainingBatch === null,
      `Cleanup: Batch #${batchId} всё ещё существует`
    );
  }

  if (productId !== null) {
    const remainingProduct =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    assert(
      remainingProduct === null,
      `Cleanup: Product #${productId} всё ещё существует`
    );
  }

  if (supplierId !== null) {
    const remainingSupplier =
      await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });

    assert(
      remainingSupplier === null,
      `Cleanup: Supplier #${supplierId} всё ещё существует`
    );
  }

  console.log("");
  console.log(
    "🟢 Cleanup verification passed"
  );
  console.log(
    "🟢 No V47 test data remains"
  );
} catch (cleanupError) {
  console.error("");
  console.error(
    "🔴 CLEANUP FAILED"
  );
  console.error(cleanupError);

  // Cleanup failure должен быть заметен,
  // но основной error также не теряем.
  throw cleanupError;
}


}
}

// ============================================================
// Run
// ============================================================

main()
.catch((error) => {
console.error("");
console.error(
"======================================================================"
);
console.error(
"🔴 V47 FAILED"
);
console.error(
"======================================================================"
);
console.error("");


console.error(error);

process.exitCode = 1;


})
.finally(async () => {
await prisma.$disconnect();
});
