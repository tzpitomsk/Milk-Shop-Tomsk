import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(
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

if (
  !body ||
  typeof body !== "object" ||
  Array.isArray(body)
) {
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
// 3. VALIDATE WRITE-OFF QUANTITY
//
// IMPORTANT:
// Do not use Number(body.quantity).
//
// Otherwise:
//   Number("2") === 2
//
// and a string quantity would incorrectly pass validation.
// =========================================================================

if (typeof body.quantity !== "number") {
  return NextResponse.json(
    {
      error:
        "Количество для списания должно быть числом",
    },
    {
      status: 400,
    }
  );
}

const quantity = body.quantity;

if (
  !Number.isInteger(quantity) ||
  quantity <= 0
) {
  return NextResponse.json(
    {
      error:
        "Количество для списания должно быть положительным целым числом",
    },
    {
      status: 400,
    }
  );
}

// =========================================================================
// 4. REASON
// =========================================================================

const reason =
  typeof body.reason === "string" &&
  body.reason.trim()
    ? body.reason.trim()
    : "Списание";

// =========================================================================
// 5. TRANSACTION
// =========================================================================

const result = await prisma.$transaction(async (tx) => {
  // -----------------------------------------------------------------------
  // Load current batch
  // -----------------------------------------------------------------------

  const batch = await tx.batch.findUnique({
    where: {
      id: batchId,
    },
  });

  if (!batch) {
    throw new Error("Партия не найдена");
  }

  // -----------------------------------------------------------------------
  // Empty batch protection
  // -----------------------------------------------------------------------

  if (batch.quantity <= 0) {
    throw new Error("Партия уже пустая");
  }

  // -----------------------------------------------------------------------
  // Cannot write off more than current quantity
  // -----------------------------------------------------------------------

  if (quantity > batch.quantity) {
    throw new Error(
      `Нельзя списать ${quantity} шт. — в партии только ${batch.quantity} шт.`
    );
  }

  // -----------------------------------------------------------------------
  // Calculate new quantity
  // -----------------------------------------------------------------------

  const newQuantity =
    batch.quantity - quantity;

  // -----------------------------------------------------------------------
  // Determine new status
  //
  // quantity = 0
  //   -> EMPTY
  //
  // positive quantity + expired
  //   -> EXPIRED
  //
  // positive quantity + not expired
  //   -> ACTIVE
  // -----------------------------------------------------------------------

  const now = new Date();

  let newStatus: string;

  if (newQuantity === 0) {
    newStatus = "EMPTY";
  } else if (batch.expiryDate < now) {
    newStatus = "EXPIRED";
  } else {
    newStatus = "ACTIVE";
  }

  // -----------------------------------------------------------------------
  // Update batch
  // -----------------------------------------------------------------------

  const updatedBatch = await tx.batch.update({
    where: {
      id: batch.id,
    },
    data: {
      quantity: newQuantity,
      status: newStatus,
    },
  });

  // -----------------------------------------------------------------------
  // Create WRITE_OFF movement
  //
  // Movement quantity is negative because physical stock decreases.
  // -----------------------------------------------------------------------

  await tx.movement.create({
    data: {
      type: "WRITE_OFF",
      quantity: -quantity,
      comment: `${reason}. Партия №${batch.id}`,
      productId: batch.productId,
    },
  });

  // -----------------------------------------------------------------------
  // Recalculate Product.stock from all batches
  // -----------------------------------------------------------------------

  const total = await tx.batch.aggregate({
    where: {
      productId: batch.productId,
    },
    _sum: {
      quantity: true,
    },
  });

  const newStock =
    total._sum.quantity ?? 0;

  const updatedProduct =
    await tx.product.update({
      where: {
        id: batch.productId,
      },
      data: {
        stock: newStock,
      },
    });

  return {
    batchId: batch.id,
    oldQuantity: batch.quantity,
    writeOff: quantity,
    newQuantity: updatedBatch.quantity,
    stock: updatedProduct.stock,
    status: updatedBatch.status,
  };
});

// =========================================================================
// 6. RESPONSE
// =========================================================================

return NextResponse.json({
  success: true,
  message: "Партия списана",
  data: result,
});


} catch (error) {
console.error("WRITE OFF ERROR:", error);


const message =
  error instanceof Error
    ? error.message
    : "Ошибка списания";

const status =
  message === "Партия не найдена"
    ? 404
    : message === "Партия уже пустая" ||
        message.startsWith("Нельзя списать")
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