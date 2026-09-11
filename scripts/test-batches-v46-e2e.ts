import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL =
process.env.BASE_URL || "http://localhost:3000";

function assert(
condition: unknown,
message: string
): asserts condition {
if (!condition) {
throw new Error(`🔴 ASSERTION FAILED: ${message}`);
}
}

function requireId(
value: number | null | undefined,
name: string
): number {
assert(
typeof value === "number",
`${name} должен быть числом`
);

return value;
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

function localDate(
year: number,
month: number,
day: number
): Date {
return new Date(
year,
month - 1,
day,
12,
0,
0,
0
);
}

async function api(
path: string,
init?: RequestInit
) {
const response = await fetch(
`${BASE_URL}${path}`,
init
);

let data: unknown = null;

try {
data = await response.json();
} catch {
data = null;
}

return {
response,
data,
};
}

async function cleanup(
productId: number | null,
batchIds: number[],
movementIds: number[]
) {
console.log("");
console.log(
"7. CLEANUP"
);
console.log(
"------------------------------------------------------------------------------"
);

try {
if (movementIds.length > 0) {
const result =
await prisma.movement.deleteMany({
where: {
id: {
in: movementIds,
},
},
});


  console.log(
    `Movements deleted=${result.count}`
  );
}

if (batchIds.length > 0) {
  const result =
    await prisma.batch.deleteMany({
      where: {
        id: {
          in: batchIds,
        },
      },
    });

  console.log(
    `Batches deleted=${result.count}`
  );
}

if (productId !== null) {
  const result =
    await prisma.product.deleteMany({
      where: {
        id: productId,
      },
    });

  console.log(
    `Products deleted=${result.count}`
  );
}

console.log(
  "🟢 Cleanup completed"
);


} catch (error) {
console.error(
"🔴 Cleanup failed:",
error
);
throw error;
}
}

async function main() {
console.log("");
console.log(
"=============================================================================="
);
console.log(
"V46 BATCH VISIBILITY / SELLABLE STOCK E2E TEST"
);
console.log(
"PHYSICAL STOCK vs SELLABLE STOCK"
);
console.log(
"=============================================================================="
);
console.log("");

let productId: number | null = null;
const batchIds: number[] = [];
const movementIds: number[] = [];

try {
// =========================================================================
// 1. CREATE ISOLATED TEST PRODUCT
// =========================================================================


console.log(
  "1. CREATE ISOLATED TEST PRODUCT"
);
console.log(
  "------------------------------------------------------------------------------"
);

const product =
  await prisma.product.create({
    data: {
      name:
        "V46_INTEGRATION_TEST Молоко",
      unit: "шт.",
      price: 300,
      cost: 100,
      stock: 0,
    },
  });

productId = product.id;

console.log(
  `Product #${product.id} created`
);

assert(
  product.stock === 0,
  "initial Product.stock должен быть 0"
);

// =========================================================================
// 2. CREATE FOUR BATCH STATES
// =========================================================================

console.log("");
console.log(
  "2. CREATE TEST BATCHES"
);
console.log(
  "------------------------------------------------------------------------------"
);

const now = new Date();

const pastReceivedAt = new Date(
  now.getTime() - 24 * 60 * 60 * 1000
);

const futureReceivedAt = new Date(
  now.getTime() + 24 * 60 * 60 * 1000
);

/*
 * Batch A:
 * positive + ACTIVE + already received + not expired
 * => SELLABLE
 */
const batchA =
  await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 3,
      purchaseCost: 100,
      receivedAt: pastReceivedAt,
      expiryDate: localDate(
        2030,
        12,
        31
      ),
      status: "ACTIVE",
    },
  });

batchIds.push(batchA.id);

/*
 * Batch B:
 * positive + EXPIRED
 * => NOT SELLABLE
 */
const batchB =
  await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 2,
      purchaseCost: 110,
      receivedAt: pastReceivedAt,
      expiryDate: localDate(
        2020,
        1,
        1
      ),
      status: "EXPIRED",
    },
  });

batchIds.push(batchB.id);

/*
 * Batch C:
 * positive + ACTIVE + future receivedAt
 * => NOT SELLABLE
 */
const batchC =
  await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 4,
      purchaseCost: 120,
      receivedAt: futureReceivedAt,
      expiryDate: localDate(
        2030,
        12,
        31
      ),
      status: "ACTIVE",
    },
  });

batchIds.push(batchC.id);

/*
 * Batch D:
 * quantity 0 + EMPTY
 * => NOT SELLABLE
 */
const batchD =
  await prisma.batch.create({
    data: {
      productId: product.id,
      quantity: 0,
      purchaseCost: 130,
      receivedAt: pastReceivedAt,
      expiryDate: localDate(
        2030,
        12,
        31
      ),
      status: "EMPTY",
    },
  });

batchIds.push(batchD.id);

console.log(
  `Batch A #${batchA.id} | qty=3 | ACTIVE | received=past | future expiry`
);

console.log(
  `Batch B #${batchB.id} | qty=2 | EXPIRED | received=past | expired`
);

console.log(
  `Batch C #${batchC.id} | qty=4 | ACTIVE | received=future | future expiry`
);

console.log(
  `Batch D #${batchD.id} | qty=0 | EMPTY`
);

// =========================================================================
// 3. CALCULATE AND SET PHYSICAL PRODUCT STOCK
// =========================================================================

console.log("");
console.log(
  "3. PHYSICAL STOCK"
);
console.log(
  "------------------------------------------------------------------------------"
);

const physicalAggregate =
  await prisma.batch.aggregate({
    where: {
      productId: product.id,
    },
    _sum: {
      quantity: true,
    },
  });

const physicalStock =
  physicalAggregate._sum.quantity ?? 0;

console.log(
  `SUM(Batch.quantity)=${physicalStock}`
);

assert(
  physicalStock === 9,
  "SUM(Batch.quantity) должен быть 9"
);

await prisma.product.update({
  where: {
    id: product.id,
  },
  data: {
    stock: physicalStock,
  },
});

const storedProduct =
  await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

assert(
  storedProduct !== null,
  "тестовый Product должен существовать"
);

assert(
  storedProduct.stock === 9,
  "Product.stock должен быть равен 9"
);

console.log(
  `Product.stock=${storedProduct.stock}`
);

console.log(
  "🟢 Physical stock invariant passed"
);

// =========================================================================
// 4. SELLABLE STOCK CALCULATION
// =========================================================================

console.log("");
console.log(
  "4. SELLABLE STOCK"
);
console.log(
  "------------------------------------------------------------------------------"
);

const currentTime =
  new Date();

const allBatches =
  await prisma.batch.findMany({
    where: {
      productId: product.id,
    },
    orderBy: {
      id: "asc",
    },
  });

const sellableBatches =
  allBatches.filter(
    (batch) => {
      if (batch.quantity <= 0) {
        return false;
      }

      if (batch.status !== "ACTIVE") {
        return false;
      }

      if (
        batch.receivedAt >
        currentTime
      ) {
        return false;
      }

      if (
        batch.expiryDate <
        currentTime
      ) {
        return false;
      }

      return true;
    }
  );

const sellableStock =
  sellableBatches.reduce(
    (sum, batch) =>
      sum + batch.quantity,
    0
  );

console.log(
  `Sellable batches=${sellableBatches.length}`
);

for (const batch of sellableBatches) {
  console.log(
    `SELLABLE Batch #${batch.id} | qty=${batch.quantity} | status=${batch.status}`
  );
}

console.log(
  `SELLABLE STOCK=${sellableStock}`
);

assert(
  sellableBatches.length === 1,
  "продаваемой должна быть ровно одна тестовая партия"
);

assert(
  sellableBatches[0].id === batchA.id,
  "продаваемой должна быть только Batch A"
);

assert(
  sellableStock === 3,
  "sellable stock должен быть 3"
);

console.log(
  "🟢 Sellable stock calculation passed"
);

// =========================================================================
// 5. CHECK ALL FOUR STATES
// =========================================================================

console.log("");
console.log(
  "5. VERIFY FOUR BATCH STATES"
);
console.log(
  "------------------------------------------------------------------------------"
);

const dbBatchA =
  await prisma.batch.findUnique({
    where: {
      id: batchA.id,
    },
  });

const dbBatchB =
  await prisma.batch.findUnique({
    where: {
      id: batchB.id,
    },
  });

const dbBatchC =
  await prisma.batch.findUnique({
    where: {
      id: batchC.id,
    },
  });

const dbBatchD =
  await prisma.batch.findUnique({
    where: {
      id: batchD.id,
    },
  });

assert(
  dbBatchA !== null,
  "Batch A должна существовать"
);

assert(
  dbBatchB !== null,
  "Batch B должна существовать"
);

assert(
  dbBatchC !== null,
  "Batch C должна существовать"
);

assert(
  dbBatchD !== null,
  "Batch D должна существовать"
);

assert(
  dbBatchA.quantity === 3,
  "Batch A quantity должен быть 3"
);

assert(
  dbBatchA.status === "ACTIVE",
  "Batch A должна быть ACTIVE"
);

assert(
  dbBatchA.receivedAt <= currentTime,
  "Batch A должна быть уже получена"
);

assert(
  dbBatchA.expiryDate >= currentTime,
  "Batch A не должна быть просрочена"
);

console.log(
  "🟢 Batch A = SELLABLE"
);

assert(
  dbBatchB.quantity === 2,
  "Batch B quantity должен быть 2"
);

assert(
  dbBatchB.status === "EXPIRED",
  "Batch B должна быть EXPIRED"
);

assert(
  dbBatchB.expiryDate < currentTime,
  "Batch B должна быть просрочена"
);

console.log(
  "🟢 Batch B = NOT SELLABLE (EXPIRED)"
);

assert(
  dbBatchC.quantity === 4,
  "Batch C quantity должен быть 4"
);

assert(
  dbBatchC.status === "ACTIVE",
  "Batch C должна быть ACTIVE"
);

assert(
  dbBatchC.receivedAt > currentTime,
  "Batch C должна иметь будущую receivedAt"
);

console.log(
  "🟢 Batch C = NOT SELLABLE (FUTURE RECEIVED)"
);

assert(
  dbBatchD.quantity === 0,
  "Batch D quantity должен быть 0"
);

assert(
  dbBatchD.status === "EMPTY",
  "Batch D должна быть EMPTY"
);

console.log(
  "🟢 Batch D = NOT SELLABLE (EMPTY)"
);

// =========================================================================
// 6. API /api/batches
// =========================================================================

console.log("");
console.log(
  "6. VERIFY /api/batches"
);
console.log(
  "------------------------------------------------------------------------------"
);

const {
  response: batchesResponse,
  data: batchesData,
} = await api(
  "/api/batches"
);

assert(
  batchesResponse.ok,
  `/api/batches должен вернуть 2xx, получен ${batchesResponse.status}`
);

assert(
  Array.isArray(batchesData),
  "/api/batches должен вернуть массив"
);

const apiBatches =
  batchesData as Array<{
    id: number;
    quantity: number;
    status: string;
    productId: number;
  }>;

const testApiBatches =
  apiBatches.filter(
    (batch) =>
      batch.productId === product.id
  );

console.log(
  `API returned test batches=${testApiBatches.length}`
);

/*
 * GET /api/batches по текущему контракту возвращает
 * только quantity > 0.
 *
 * Поэтому A, B и C должны быть видимы,
 * а D с quantity=0 — нет.
 */
assert(
  testApiBatches.length === 3,
  "API должен вернуть три положительные тестовые партии"
);

assert(
  testApiBatches.some(
    (batch) =>
      batch.id === batchA.id
  ),
  "API должен показывать Batch A"
);

assert(
  testApiBatches.some(
    (batch) =>
      batch.id === batchB.id
  ),
  "API должен показывать Batch B"
);

assert(
  testApiBatches.some(
    (batch) =>
      batch.id === batchC.id
  ),
  "API должен показывать Batch C"
);

assert(
  !testApiBatches.some(
    (batch) =>
      batch.id === batchD.id
  ),
  "API не должен показывать пустую Batch D"
);

console.log(
  "🟢 /api/batches visibility contract passed"
);

// =========================================================================
// 7. FINAL INVARIANTS
// =========================================================================

console.log("");
console.log(
  "7. FINAL INVARIANTS"
);
console.log(
  "------------------------------------------------------------------------------"
);

const finalAggregate =
  await prisma.batch.aggregate({
    where: {
      productId: product.id,
    },
    _sum: {
      quantity: true,
    },
  });

const finalPhysicalStock =
  finalAggregate._sum.quantity ?? 0;

const finalProduct =
  await prisma.product.findUnique({
    where: {
      id: product.id,
    },
  });

assert(
  finalProduct !== null,
  "Product должен существовать перед cleanup"
);

console.log(
  `SUM(Batch.quantity)=${finalPhysicalStock}`
);

console.log(
  `Product.stock=${finalProduct.stock}`
);

console.log(
  `Sellable stock=${sellableStock}`
);

assert(
  finalPhysicalStock === 9,
  "финальный физический остаток должен быть 9"
);

assert(
  finalProduct.stock === 9,
  "финальный Product.stock должен быть 9"
);

assert(
  sellableStock === 3,
  "финальный продаваемый остаток должен быть 3"
);

assert(
  sellableStock < finalProduct.stock,
  "продаваемый остаток должен быть меньше физического в этом тесте"
);

console.log(
  "🟢 All V46 invariants passed"
);

console.log("");
console.log(
  "=============================================================================="
);
console.log(
  "V46 PASSED"
);
console.log(
  "=============================================================================="
);
console.log("");

console.log(
  "Physical stock = 9"
);

console.log(
  "Sellable stock = 3"
);

console.log(
  "Expired positive batch remains visible"
);

console.log(
  "Future-received positive batch remains visible"
);

console.log(
  "Empty batch is hidden by /api/batches"
);

console.log(
  "No real business data was used"
);

console.log("");


} finally {
await cleanup(
productId,
batchIds,
movementIds
);
}
}

main()
.catch((error) => {
console.error("");
console.error(
"🔴 V46 FAILED"
);
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
