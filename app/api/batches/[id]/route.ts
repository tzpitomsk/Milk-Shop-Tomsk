import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params;
const batchId = Number(id);


// =========================================================================
// 1. VALIDATE BATCH ID
// =========================================================================

if (!Number.isInteger(batchId) || batchId <= 0) {
  return NextResponse.json(
    {
      error: "Некорректный номер партии",
    },
    {
      status: 400,
    }
  );
}

// =========================================================================
// 2. LOAD BATCH
// =========================================================================

const batch = await prisma.batch.findUnique({
  where: {
    id: batchId,
  },
  include: {
    product: true,
  },
});

if (!batch) {
  return NextResponse.json(
    {
      error: "Партия не найдена",
    },
    {
      status: 404,
    }
  );
}

return NextResponse.json(batch);


} catch (error) {
console.error("GET BATCH ERROR:", error);


return NextResponse.json(
  {
    error: "Ошибка загрузки партии",
  },
  {
    status: 500,
  }
);


}
}

export async function PUT(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params;
const batchId = Number(id);


// =========================================================================
// 1. VALIDATE BATCH ID
// =========================================================================

if (!Number.isInteger(batchId) || batchId <= 0) {
  return NextResponse.json(
    {
      error: "Некорректный номер партии",
    },
    {
      status: 400,
    }
  );
}

// =========================================================================
// 2. READ REQUEST BODY
// =========================================================================

const body = await request.json().catch(() => null);

if (!body || typeof body !== "object" || Array.isArray(body)) {
  return NextResponse.json(
    {
      error: "Некорректные данные",
    },
    {
      status: 400,
    }
  );
}

// =========================================================================
// 3. VALIDATE QUANTITY
//
// Quantity is intentionally NOT editable through this endpoint.
//
// Stock changes must happen through:
//   SUPPLY    -> increase stock
//   SALE      -> decrease stock
//   RETURN    -> restore original batch
//   WRITE_OFF -> decrease stock with movement
//
// The existing quantity may be sent by the UI, but it must:
//   1. actually be a number;
//   2. be an integer;
//   3. be >= 0.
//
// IMPORTANT:
// Do NOT use Number(body.quantity) here.
//
// Otherwise:
//   Number("5") === 5
//
// and a string "5" would incorrectly pass validation.
// =========================================================================

if (typeof body.quantity !== "number") {
  return NextResponse.json(
    {
      error: "Количество партии должно быть числом",
    },
    {
      status: 400,
    }
  );
}

const requestedQuantity = body.quantity;

if (
  !Number.isInteger(requestedQuantity) ||
  requestedQuantity < 0
) {
  return NextResponse.json(
    {
      error: "Количество партии должно быть целым числом не меньше 0",
    },
    {
      status: 400,
    }
  );
}

// =========================================================================
// 4. VALIDATE EXPIRY DATE
// =========================================================================

if (
  typeof body.expiryDate !== "string" ||
  !body.expiryDate.trim()
) {
  return NextResponse.json(
    {
      error: "Необходимо указать срок годности",
    },
    {
      status: 400,
    }
  );
}

const expiryDate = new Date(body.expiryDate);

if (Number.isNaN(expiryDate.getTime())) {
  return NextResponse.json(
    {
      error: "Некорректная дата срока годности",
    },
    {
      status: 400,
    }
  );
}

// =========================================================================
// 5. TRANSACTION
// =========================================================================

const result = await prisma.$transaction(async (tx) => {
  // -----------------------------------------------------------------------
  // Load current batch
  // -----------------------------------------------------------------------

  const currentBatch = await tx.batch.findUnique({
    where: {
      id: batchId,
    },
  });

  if (!currentBatch) {
    throw new Error("Партия не найдена");
  }

  // -----------------------------------------------------------------------
  // Quantity protection
  // -----------------------------------------------------------------------

  if (requestedQuantity !== currentBatch.quantity) {
    throw new Error(
      `Изменение количества партии через редактирование запрещено. Текущее количество: ${currentBatch.quantity} шт.`
    );
  }

  // -----------------------------------------------------------------------
  // Determine new status
  //
  // EMPTY stays EMPTY when quantity is zero.
  //
  // For positive quantity:
  //   expired     -> EXPIRED
  //   not expired -> ACTIVE
  // -----------------------------------------------------------------------

  let newStatus: string;

  if (currentBatch.quantity === 0) {
    newStatus = "EMPTY";
  } else if (expiryDate < new Date()) {
    newStatus = "EXPIRED";
  } else {
    newStatus = "ACTIVE";
  }

  // -----------------------------------------------------------------------
  // Update only expiryDate and status.
  //
  // Quantity deliberately remains unchanged.
  // -----------------------------------------------------------------------

  const updatedBatch = await tx.batch.update({
    where: {
      id: currentBatch.id,
    },
    data: {
      expiryDate,
      status: newStatus,
    },
    include: {
      product: true,
    },
  });

  // -----------------------------------------------------------------------
  // Recalculate Product.stock from all batches.
  // -----------------------------------------------------------------------

  const total = await tx.batch.aggregate({
    where: {
      productId: currentBatch.productId,
    },
    _sum: {
      quantity: true,
    },
  });

  const newStock = total._sum.quantity ?? 0;

  const updatedProduct = await tx.product.update({
    where: {
      id: currentBatch.productId,
    },
    data: {
      stock: newStock,
    },
  });

  return {
    batch: updatedBatch,
    productStock: updatedProduct.stock,
  };
});

// =========================================================================
// 6. RESPONSE
// =========================================================================

return NextResponse.json({
  success: true,
  message: "Партия обновлена",
  batch: result.batch,
  stock: result.productStock,
});


} catch (error) {
console.error("UPDATE BATCH ERROR:", error);


const message =
  error instanceof Error
    ? error.message
    : "Ошибка обновления партии";

const status =
  message === "Партия не найдена"
    ? 404
    : message.startsWith(
          "Изменение количества партии через редактирование запрещено"
        )
      ? 400
      : 500;

return NextResponse.json(
  {
    error: message,
  },
  {
    status,
  }
);


}
}