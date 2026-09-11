import { prisma } from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";
const TEST_PRODUCT_NAME = "V39_E2E_TEST";
const TEST_SUPPLIER_NAME = "V39_E2E_SUPPLIER";

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
body:
body === undefined
? undefined
: JSON.stringify(body),
});


let parsed: any = null;

try {
    parsed = await response.json();
} catch {
    // Response may have no JSON body.
}

return {
    status: response.status,
    body: parsed,
};


}

function futureDate(days: number): Date {
const d = new Date();
d.setDate(d.getDate() + days);
return d;
}

/**

* Дата для API поставки.
*
* /api/supplies ожидает календарную дату YYYY-MM-DD.
  */
  function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
  }

/**

* Получаем календарную дату из Date в локальном времени.
*
* Это важно для проверки expiryDate:
* API создаёт дату как YYYY-MM-DD 00:00:00,
* а toISOString() переводит её в UTC.
*
* Например:
* локально 2026-09-19 00:00
* UTC      2026-09-18T17:00:00.000Z
*
* Поэтому для проверки используем локальные
* year/month/day, а не toISOString().slice(0, 10).
  */
  function localDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
  }

async function cleanup() {
const products = await prisma.product.findMany({
where: {
name: TEST_PRODUCT_NAME,
},
select: {
id: true,
},
});


for (const product of products) {
    await prisma.$transaction(async (tx) => {
        await tx.returnBatch.deleteMany({
            where: {
                OrderItem: {
                    productId: product.id,
                },
            },
        });

        await tx.orderBatch.deleteMany({
            where: {
                orderItem: {
                    productId: product.id,
                },
            },
        });

        await tx.orderItem.deleteMany({
            where: {
                productId: product.id,
            },
        });

        await tx.supplyItem.deleteMany({
            where: {
                productId: product.id,
            },
        });

        await tx.movement.deleteMany({
            where: {
                productId: product.id,
            },
        });

        await tx.batch.deleteMany({
            where: {
                productId: product.id,
            },
        });

        await tx.product.delete({
            where: {
                id: product.id,
            },
        });
    });
}

await prisma.supply.deleteMany({
    where: {
        Supplier: {
            name: TEST_SUPPLIER_NAME,
        },
    },
});

await prisma.supplier.deleteMany({
    where: {
        name: TEST_SUPPLIER_NAME,
    },
});


}

async function main() {
console.log(
"\n=============================================================================="
);
console.log("V39 BATCH E2E TEST");
console.log(
"==============================================================================\n"
);


// =========================================================================
// 0. CLEANUP OLD TEST DATA
// =========================================================================

await cleanup();

console.log("0. 🟢 Old V39 test data removed\n");

// =========================================================================
// 1. CREATE ISOLATED TEST DATA
// =========================================================================

const product = await prisma.product.create({
    data: {
        name: TEST_PRODUCT_NAME,
        unit: "шт",
        price: 200,
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
    `1. Product #${product.id}, Supplier #${supplier.id} created`
);

// =========================================================================
// 2. REAL POST /api/supplies
// =========================================================================

const expiry = futureDate(10);
const expiryDate = dateOnly(expiry);

const supplyPayload = {
    supplierId: supplier.id,
    total: 500,
    items: [
        {
            id: product.id,
            quantity: 5,
            cost: 100,
            expiryDate,
        },
    ],
};

console.log("\n2. POST /api/supplies");

console.log("Request body:");
console.log(
    JSON.stringify(supplyPayload, null, 2)
);

const supply = await api(
    "/api/supplies",
    "POST",
    supplyPayload
);

console.log(
    `HTTP status: ${supply.status}`
);

console.log("Response body:");
console.log(
    JSON.stringify(supply.body, null, 2)
);

assert(
    supply.status === 200,
    `Supply expected 200, got ${supply.status}. API response: ${JSON.stringify(
        supply.body
    )}`
);

assert(
    supply.body?.success === true,
    `Supply must return success=true. API response: ${JSON.stringify(
        supply.body
    )}`
);

console.log(
    "🟢 /api/supplies request succeeded"
);

// =========================================================================
// 3. VERIFY SUPPLY → BATCH → PRODUCT.STOCK
// =========================================================================

const batch = await prisma.batch.findFirst({
    where: {
        productId: product.id,
    },
    orderBy: {
        id: "desc",
    },
});

assert(
    batch !== null,
    "Supply must create a batch"
);

assert(
    batch.quantity === 5,
    `Supply batch quantity must be 5, got ${batch.quantity}`
);

assert(
    batch.purchaseCost === 100,
    `Supply batch purchaseCost must be 100, got ${batch.purchaseCost}`
);

assert(
    batch.status === "ACTIVE",
    `Supply batch must be ACTIVE, got ${batch.status}`
);

const actualBatchExpiryDate = localDateOnly(
    batch.expiryDate
);

assert(
    actualBatchExpiryDate === expiryDate,
    `Batch expiryDate must be ${expiryDate}, got ${actualBatchExpiryDate}. Raw DB value: ${batch.expiryDate.toISOString()}`
);

let currentProduct =
    await prisma.product.findUnique({
        where: {
            id: product.id,
        },
    });

assert(
    currentProduct?.stock === 5,
    `Product.stock after supply must be 5, got ${currentProduct?.stock}`
);

let movements =
    await prisma.movement.findMany({
        where: {
            productId: product.id,
        },
        orderBy: {
            id: "asc",
        },
    });

assert(
    movements.length === 1 &&
        movements[0].type === "SUPPLY" &&
        movements[0].quantity === 5,
    "Supply movement must be +5"
);

console.log(
    "3. 🟢 Real /api/supplies → Batch → Product.stock passed"
);

// =========================================================================
// 4. GET /api/batches
// =========================================================================

const list = await api(
    "/api/batches"
);

assert(
    list.status === 200 &&
        Array.isArray(list.body),
    "GET /api/batches must return 200 and array"
);

assert(
    list.body.some(
        (b: any) => b.id === batch.id
    ),
    "Created batch must appear in /api/batches"
);

console.log(
    "4. 🟢 GET /api/batches passed"
);

// =========================================================================
// 5. GET /api/batches/:id
// =========================================================================

const getBatch = await api(
    `/api/batches/${batch.id}`
);

assert(
    getBatch.status === 200,
    `GET batch expected 200, got ${getBatch.status}`
);

assert(
    getBatch.body?.id === batch.id &&
        getBatch.body?.product?.id ===
            product.id,
    "GET batch must return batch with product"
);

console.log(
    "5. 🟢 Batch detail API passed"
);

// =========================================================================
// 6. PUT /api/batches/:id — EXPIRY EDIT
// =========================================================================

const editedExpiry =
    futureDate(20);

const editedExpiryDate =
    dateOnly(editedExpiry);

const edit = await api(
    `/api/batches/${batch.id}`,
    "PUT",
    {
        quantity: 5,
        expiryDate:
            editedExpiryDate,
    }
);

assert(
    edit.status === 200 &&
        edit.body?.success === true,
    `Batch edit expected 200/success, got ${edit.status}. Response: ${JSON.stringify(
        edit.body
    )}`
);

let afterEdit =
    await prisma.batch.findUnique({
        where: {
            id: batch.id,
        },
    });

assert(
    afterEdit?.quantity === 5,
    "Expiry edit must not change quantity"
);

assert(
    afterEdit?.status === "ACTIVE",
    `Future expiry must be ACTIVE, got ${afterEdit?.status}`
);

assert(
    afterEdit !== null,
    "Batch must still exist after expiry edit"
);

const actualEditedExpiryDate =
    localDateOnly(afterEdit.expiryDate);

assert(
    actualEditedExpiryDate === editedExpiryDate,
    `Expiry date was not saved correctly. Expected ${editedExpiryDate}, got ${actualEditedExpiryDate}. Raw DB value: ${afterEdit.expiryDate.toISOString()}`
);

currentProduct =
    await prisma.product.findUnique({
        where: {
            id: product.id,
        },
    });

assert(
    currentProduct?.stock === 5,
    "Expiry edit must preserve stock"
);

movements =
    await prisma.movement.findMany({
        where: {
            productId: product.id,
        },
    });

assert(
    movements.length === 1,
    "Expiry edit must not create movement"
);

console.log(
    "6. 🟢 Real batch expiry edit passed"
);

// =========================================================================
// 7. PARTIAL WRITE-OFF
// =========================================================================

const partial = await api(
    `/api/batches/${batch.id}/writeoff`,
    "POST",
    {
        quantity: 2,
        reason: "V39 частичное списание",
    }
);

assert(
    partial.status === 200 &&
        partial.body?.success === true,
    `Partial write-off expected 200/success, got ${partial.status}. Response: ${JSON.stringify(
        partial.body
    )}`
);

assert(
    partial.body?.data?.writeOff === 2,
    `Write-off response must contain data.writeOff=2. Response: ${JSON.stringify(
        partial.body
    )}`
);

afterEdit =
    await prisma.batch.findUnique({
        where: {
            id: batch.id,
        },
    });

assert(
    afterEdit?.quantity === 3 &&
        afterEdit.status === "ACTIVE",
    `Partial write-off must leave 3 ACTIVE. Got quantity=${afterEdit?.quantity}, status=${afterEdit?.status}`
);

currentProduct =
    await prisma.product.findUnique({
        where: {
            id: product.id,
        },
    });

assert(
    currentProduct?.stock === 3,
    `Product.stock after partial write-off must be 3, got ${currentProduct?.stock}`
);

console.log(
    "7. 🟢 Partial write-off passed"
);

// =========================================================================
// 8. FULL WRITE-OFF
// =========================================================================

const full = await api(
    `/api/batches/${batch.id}/writeoff`,
    "POST",
    {
        quantity: 3,
        reason: "V39 полное списание",
    }
);

assert(
    full.status === 200 &&
        full.body?.success === true &&
        full.body?.data?.writeOff === 3,
    `Full write-off must succeed and report 3. Response: ${JSON.stringify(
        full.body
    )}`
);

afterEdit =
    await prisma.batch.findUnique({
        where: {
            id: batch.id,
        },
    });

assert(
    afterEdit?.quantity === 0 &&
        afterEdit.status === "EMPTY",
    `Full write-off must produce EMPTY/0. Got quantity=${afterEdit?.quantity}, status=${afterEdit?.status}`
);

currentProduct =
    await prisma.product.findUnique({
        where: {
            id: product.id,
        },
    });

assert(
    currentProduct?.stock === 0,
    `Product.stock after full write-off must be 0, got ${currentProduct?.stock}`
);

console.log(
    "8. 🟢 Full write-off passed"
);

// =========================================================================
// 9. EMPTY BATCH PROTECTION
// =========================================================================

const rejected = await api(
    `/api/batches/${batch.id}/writeoff`,
    "POST",
    {
        quantity: 1,
        reason: "V39 rejected",
    }
);

console.log(
    `Empty batch write-off HTTP status: ${rejected.status}`
);

console.log(
    "Empty batch write-off response:",
    JSON.stringify(
        rejected.body,
        null,
        2
    )
);

assert(
    rejected.status === 400,
    `Empty batch write-off must return 400, got ${rejected.status}`
);

afterEdit =
    await prisma.batch.findUnique({
        where: {
            id: batch.id,
        },
    });

assert(
    afterEdit?.quantity === 0 &&
        afterEdit.status === "EMPTY",
    "Rejected empty write-off must not change batch"
);

console.log(
    "9. 🟢 Empty-batch protection passed"
);

// =========================================================================
// 10. MOVEMENT + STOCK INTEGRITY
// =========================================================================

movements =
    await prisma.movement.findMany({
        where: {
            productId: product.id,
        },
        orderBy: {
            id: "asc",
        },
    });

assert(
    movements.length === 3,
    `Expected 3 movements, got ${movements.length}`
);

assert(
    movements[0].type === "SUPPLY" &&
        movements[0].quantity === 5,
    "SUPPLY movement must be +5"
);

assert(
    movements[1].type === "WRITE_OFF" &&
        movements[1].quantity === -2,
    "First WRITE_OFF must be -2"
);

assert(
    movements[2].type === "WRITE_OFF" &&
        movements[2].quantity === -3,
    "Second WRITE_OFF must be -3"
);

for (const movement of movements.filter(
    (m) => m.type === "WRITE_OFF"
)) {
    assert(
        movement.comment?.includes(
            "Партия №"
        ) ?? false,
        `WRITE_OFF #${movement.id} must contain batch number`
    );
}

assert(
    movements.reduce(
        (sum, m) => sum + m.quantity,
        0
    ) === 0,
    "Movement net balance must be zero"
);

const batchSum = (
    await prisma.batch.findMany({
        where: {
            productId: product.id,
        },
    })
).reduce(
    (sum, b) => sum + b.quantity,
    0
);

currentProduct =
    await prisma.product.findUnique({
        where: {
            id: product.id,
        },
    });

assert(
    currentProduct?.stock === batchSum,
    `Product.stock must equal SUM(Batch.quantity). Stock=${currentProduct?.stock}, batchSum=${batchSum}`
);

console.log(
    "10. 🟢 Movement + stock integrity passed"
);

// =========================================================================
// 11. FINAL CLEANUP
// =========================================================================

await cleanup();

assert(
    (await prisma.product.count({
        where: {
            name: TEST_PRODUCT_NAME,
        },
    })) === 0,
    "Test product cleanup failed"
);

assert(
    (await prisma.supplier.count({
        where: {
            name: TEST_SUPPLIER_NAME,
        },
    })) === 0,
    "Test supplier cleanup failed"
);

console.log(
    "\n=============================================================================="
);
console.log("V39 RESULT");
console.log(
    "=============================================================================="
);
console.log(
    "\n🟢 V39 PASSED"
);
console.log(
    "Database was restored to its pre-test state.\n"
);


}

main()
.catch(async (error) => {
console.error(
"\n🔴 V39 FAILED"
);


    console.error(error);

    try {
        await cleanup();

        console.log(
            "🟢 Cleanup after failure completed"
        );
    } catch (cleanupError) {
        console.error(
            "🔴 Cleanup after failure failed"
        );

        console.error(cleanupError);
    }

    process.exitCode = 1;
})
.finally(async () => {
    await prisma.$disconnect();
});