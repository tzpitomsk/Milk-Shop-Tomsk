import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// ============================================================================
// Helpers
// ============================================================================

async function getProductId(
params: Promise<{ id: string }>
): Promise<number | null> {
const { id } = await params;

const productId = Number(id);

if (
!Number.isInteger(productId) ||
productId <= 0
) {
return null;
}

return productId;
}

// ============================================================================
// GET /api/products/[id]
// ============================================================================

export async function GET(
_request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const productId =
await getProductId(params);


if (productId === null) {
  return NextResponse.json(
    {
      error: "Некорректный ID товара",
    },
    {
      status: 400,
    }
  );
}

const product =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

if (!product) {
  return NextResponse.json(
    {
      error: "Товар не найден",
    },
    {
      status: 404,
    }
  );
}

return NextResponse.json(product);


} catch (error) {
console.error(
"GET /api/products/[id] error:",
error
);


return NextResponse.json(
  {
    error: "Ошибка загрузки товара",
  },
  {
    status: 500,
  }
);


}
}

// ============================================================================
// PUT /api/products/[id]
//
// Product.stock НИКОГДА не изменяется через PUT.
//
// Остаток формируется только через Batch.
// ============================================================================

export async function PUT(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const productId =
await getProductId(params);


if (productId === null) {
  return NextResponse.json(
    {
      error: "Некорректный ID товара",
    },
    {
      status: 400,
    }
  );
}

const body =
  await request.json();

if (
  typeof body !== "object" ||
  body === null ||
  Array.isArray(body)
) {
  return NextResponse.json(
    {
      error: "Некорректные данные товара",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Product.stock cannot be changed manually.
// ------------------------------------------------------------------------

if (
  Object.prototype.hasOwnProperty.call(
    body,
    "stock"
  )
) {
  return NextResponse.json(
    {
      error:
        "Поле stock нельзя изменять напрямую. Остаток формируется партиями.",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Check product existence
// ------------------------------------------------------------------------

const existingProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

if (!existingProduct) {
  return NextResponse.json(
    {
      error: "Товар не найден",
    },
    {
      status: 404,
    }
  );
}

// ------------------------------------------------------------------------
// Validate name
// ------------------------------------------------------------------------

if (
  typeof body.name !== "string" ||
  body.name.trim().length === 0
) {
  return NextResponse.json(
    {
      error: "Название товара обязательно",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Validate unit
// ------------------------------------------------------------------------

if (
  typeof body.unit !== "string" ||
  body.unit.trim().length === 0
) {
  return NextResponse.json(
    {
      error: "Единица измерения обязательна",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Validate price
// ------------------------------------------------------------------------

const price =
  Number(body.price);

if (
  !Number.isInteger(price) ||
  price < 0
) {
  return NextResponse.json(
    {
      error:
        "Цена должна быть целым числом не меньше 0",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Validate cost
// ------------------------------------------------------------------------

const cost =
  Number(body.cost);

if (
  !Number.isInteger(cost) ||
  cost < 0
) {
  return NextResponse.json(
    {
      error:
        "Себестоимость должна быть целым числом не меньше 0",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Validate barcode
// ------------------------------------------------------------------------

let barcode: string | null = null;

if (
  body.barcode !== undefined &&
  body.barcode !== null
) {
  if (
    typeof body.barcode !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "Штрихкод должен быть строкой",
      },
      {
        status: 400,
      }
    );
  }

  const normalizedBarcode =
    body.barcode.trim();

  barcode =
    normalizedBarcode.length > 0
      ? normalizedBarcode
      : null;
}

// ------------------------------------------------------------------------
// Update only editable Product fields.
//
// stock is deliberately NOT included.
// ------------------------------------------------------------------------

const product =
  await prisma.product.update({
    where: {
      id: productId,
    },
    data: {
      name:
        body.name.trim(),
      barcode,
      unit:
        body.unit.trim(),
      price,
      cost,
    },
  });

return NextResponse.json(product);


} catch (error) {
console.error(
"PUT /api/products/[id] error:",
error
);


return NextResponse.json(
  {
    error: "Ошибка обновления товара",
  },
  {
    status: 500,
  }
);


}
}

// ============================================================================
// DELETE /api/products/[id]
//
// Product can be deleted ONLY when it has no accounting/history relations.
//
// Protected relations:
//   - OrderItem
//   - Batch
//   - SupplyItem
//   - Movement
//
// We intentionally do NOT rely on a Prisma FK error.
// The API returns a clear HTTP 400 instead.
// ============================================================================

export async function DELETE(
_request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const productId =
await getProductId(params);


if (productId === null) {
  return NextResponse.json(
    {
      error: "Некорректный ID товара",
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Load product and all relations relevant to deletion protection.
// ------------------------------------------------------------------------

const product =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
    include: {
      batches: {
        select: {
          id: true,
          quantity: true,
        },
      },
      supplyItems: {
        select: {
          id: true,
          quantity: true,
        },
      },
      orderItems: {
        select: {
          id: true,
          quantity: true,
          returned: true,
        },
      },
      movements: {
        select: {
          id: true,
          type: true,
          quantity: true,
        },
      },
    },
  });

if (!product) {
  return NextResponse.json(
    {
      error: "Товар не найден",
    },
    {
      status: 404,
    }
  );
}

// ------------------------------------------------------------------------
// Protect accounting history.
// ------------------------------------------------------------------------

const hasBatches =
  product.batches.length > 0;

const hasSupplyHistory =
  product.supplyItems.length > 0;

const hasOrderHistory =
  product.orderItems.length > 0;

const hasMovementHistory =
  product.movements.length > 0;

if (
  hasBatches ||
  hasSupplyHistory ||
  hasOrderHistory ||
  hasMovementHistory
) {
  const reasons: string[] = [];

  if (hasBatches) {
    reasons.push(
      `партий: ${product.batches.length}`
    );
  }

  if (hasSupplyHistory) {
    reasons.push(
      `поставок: ${product.supplyItems.length}`
    );
  }

  if (hasOrderHistory) {
    reasons.push(
      `продаж: ${product.orderItems.length}`
    );
  }

  if (hasMovementHistory) {
    reasons.push(
      `движений: ${product.movements.length}`
    );
  }

  return NextResponse.json(
    {
      error:
        "Товар нельзя удалить, потому что у него есть история складского или торгового учета.",
      details: reasons.join(", "),
    },
    {
      status: 400,
    }
  );
}

// ------------------------------------------------------------------------
// Safe deletion.
//
// At this point there are:
//   - no Batches
//   - no SupplyItems
//   - no OrderItems
//   - no Movements
//
// Therefore the Product can be deleted safely.
// ------------------------------------------------------------------------

await prisma.product.delete({
  where: {
    id: productId,
  },
});

// ------------------------------------------------------------------------
// Verify deletion.
// ------------------------------------------------------------------------

const deletedProduct =
  await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

if (deletedProduct) {
  console.error(
    `DELETE verification failed for Product #${productId}`
  );

  return NextResponse.json(
    {
      error:
        "Не удалось подтвердить удаление товара",
    },
    {
      status: 500,
    }
  );
}

return NextResponse.json({
  success: true,
  message: "Товар удалён",
  productId,
});


} catch (error) {
console.error(
"DELETE /api/products/[id] error:",
error
);


return NextResponse.json(
  {
    error: "Ошибка удаления товара",
  },
  {
    status: 500,
  }
);


}
}
