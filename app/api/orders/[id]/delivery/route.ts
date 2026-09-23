import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type DeliveryStatus =
| "PENDING"
| "IN_ROUTE"
| "DELIVERED"
| "SKIPPED";

function isDeliveryStatus(
value: unknown
): value is DeliveryStatus {
return (
value === "PENDING" ||
value === "IN_ROUTE" ||
value === "DELIVERED" ||
value === "SKIPPED"
);
}

function parseOrderId(id: string): number | null {
const orderId = Number(id);

if (!Number.isInteger(orderId) || orderId <= 0) {
return null;
}

return orderId;
}

// ============================================================
// GET — получить состояние доставки заказа
// ============================================================

export async function GET(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params;


const orderId = parseOrderId(id);

if (orderId === null) {
  return NextResponse.json(
    {
      error: "Некорректный номер заказа",
    },
    {
      status: 400,
    }
  );
}

const order = await prisma.order.findUnique({
  where: {
    id: orderId,
  },
  select: {
    id: true,
    status: true,
    date: true,
    customerId: true,

    deliveryStatus: true,
    deliveryPriority: true,
    deliveryDate: true,
    deliveredAt: true,
    deliverySkipReason: true,

    customer: true,
  },
});

if (!order) {
  return NextResponse.json(
    {
      error: "Заказ не найден",
    },
    {
      status: 404,
    }
  );
}

return NextResponse.json(order);


} catch (error: any) {
console.error(
"ORDER DELIVERY GET ERROR:",
error
);


return NextResponse.json(
  {
    error:
      error?.message ||
      "Ошибка загрузки доставки",
  },
  {
    status: 500,
  }
);


}
}

// ============================================================
// PATCH — изменить состояние доставки
//
// Поддерживаемые поля:
//
// deliveryStatus:
//   PENDING
//   IN_ROUTE
//   DELIVERED
//   SKIPPED
//
// deliveryPriority:
//   положительное целое число или 0
//
// deliveryDate:
//   ISO-дата или null
//
// deliverySkipReason:
//   причина пропуска или null
// ============================================================

export async function PATCH(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params;


const orderId = parseOrderId(id);

if (orderId === null) {
  return NextResponse.json(
    {
      error: "Некорректный номер заказа",
    },
    {
      status: 400,
    }
  );
}

let body: any;

try {
  body = await request.json();
} catch {
  return NextResponse.json(
    {
      error: "Некорректный JSON",
    },
    {
      status: 400,
    }
  );
}

const existingOrder =
  await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      deliveryStatus: true,
      deliveryPriority: true,
      deliveryDate: true,
      deliveredAt: true,
      deliverySkipReason: true,
    },
  });

if (!existingOrder) {
  return NextResponse.json(
    {
      error: "Заказ не найден",
    },
    {
      status: 404,
    }
  );
}

// ==========================================================
// Подготавливаем изменения
// ==========================================================

const data: {
  deliveryStatus?: DeliveryStatus;
  deliveryPriority?: number;
  deliveryDate?: Date | null;
  deliveredAt?: Date | null;
  deliverySkipReason?: string | null;
} = {};

// ==========================================================
// DELIVERY STATUS
// ==========================================================

if (
  body.deliveryStatus !== undefined
) {
  if (
    !isDeliveryStatus(
      body.deliveryStatus
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Некорректный статус доставки",
      },
      {
        status: 400,
      }
    );
  }

  data.deliveryStatus =
    body.deliveryStatus;
}

// ==========================================================
// DELIVERY PRIORITY
// ==========================================================

if (
  body.deliveryPriority !== undefined
) {
  const priority =
    Number(body.deliveryPriority);

  if (
    !Number.isInteger(priority) ||
    priority < 0
  ) {
    return NextResponse.json(
      {
        error:
          "Приоритет доставки должен быть целым числом от 0",
      },
      {
        status: 400,
      }
    );
  }

  data.deliveryPriority =
    priority;
}

// ==========================================================
// DELIVERY DATE
// ==========================================================

if (
  body.deliveryDate !== undefined
) {
  if (
    body.deliveryDate === null ||
    body.deliveryDate === ""
  ) {
    data.deliveryDate = null;
  } else {
    const deliveryDate =
      new Date(body.deliveryDate);

    if (
      Number.isNaN(
        deliveryDate.getTime()
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Некорректная дата доставки",
        },
        {
          status: 400,
        }
      );
    }

    data.deliveryDate =
      deliveryDate;
  }
}

// ==========================================================
// DELIVERY SKIP REASON
// ==========================================================

if (
  body.deliverySkipReason !==
  undefined
) {
  if (
    body.deliverySkipReason === null ||
    body.deliverySkipReason === ""
  ) {
    data.deliverySkipReason =
      null;
  } else if (
    typeof body.deliverySkipReason !==
    "string"
  ) {
    return NextResponse.json(
      {
        error:
          "Причина пропуска должна быть строкой",
      },
      {
        status: 400,
      }
    );
  } else {
    const reason =
      body.deliverySkipReason.trim();

    if (reason.length === 0) {
      data.deliverySkipReason =
        null;
    } else if (reason.length > 500) {
      return NextResponse.json(
        {
          error:
            "Причина пропуска слишком длинная",
        },
        {
          status: 400,
        }
      );
    } else {
      data.deliverySkipReason =
        reason;
    }
  }
}

// ==========================================================
// АВТОМАТИЧЕСКАЯ ЛОГИКА СТАТУСА
// ==========================================================

const nextStatus =
  data.deliveryStatus ??
  existingOrder.deliveryStatus;

// ----------------------------------------------------------
// DELIVERED
//
// При доставке автоматически записываем deliveredAt.
// ----------------------------------------------------------

if (
  data.deliveryStatus ===
  "DELIVERED"
) {
  data.deliveredAt =
    new Date();

  data.deliverySkipReason =
    null;
}

// ----------------------------------------------------------
// SKIPPED
//
// При пропуске deliveredAt
// очищается.
//
// Причина может быть передана
// отдельно.
// ----------------------------------------------------------

if (
  data.deliveryStatus ===
  "SKIPPED"
) {
  data.deliveredAt = null;
}

// ----------------------------------------------------------
// Возврат из DELIVERED / SKIPPED
// в обычное состояние доставки
// очищает старое время/причину.
// ----------------------------------------------------------

if (
  nextStatus === "PENDING" ||
  nextStatus === "IN_ROUTE"
) {
  data.deliveredAt = null;
  data.deliverySkipReason = null;
}

// ==========================================================
// SKIPPED должен иметь причину
// ==========================================================

if (
  nextStatus === "SKIPPED"
) {
  const finalReason =
    data.deliverySkipReason ??
    existingOrder.deliverySkipReason;

  if (
    !finalReason ||
    finalReason.trim().length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Для пропущенной доставки необходимо указать причину",
      },
      {
        status: 400,
      }
    );
  }
}

// ==========================================================
// IN_ROUTE / DELIVERED / SKIPPED
//
// Если заказ переводится в работу,
// дата доставки должна существовать.
//
// Но пока не заставляем пользователя
// обязательно выбирать дату.
// ==========================================================

const updatedOrder =
  await prisma.order.update({
    where: {
      id: orderId,
    },
    data,
    select: {
      id: true,
      status: true,
      date: true,
      customerId: true,

      deliveryStatus: true,
      deliveryPriority: true,
      deliveryDate: true,
      deliveredAt: true,
      deliverySkipReason: true,

      customer: true,
    },
  });

return NextResponse.json({
  success: true,
  order: updatedOrder,
});


} catch (error: any) {
console.error(
"ORDER DELIVERY PATCH ERROR:",
error
);


return NextResponse.json(
  {
    error:
      error?.message ||
      "Ошибка изменения доставки",
  },
  {
    status: 500,
  }
);


}
}
