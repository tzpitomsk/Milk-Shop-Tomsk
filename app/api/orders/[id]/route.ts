import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// =================================
// GET - получение одного заказа
// =================================

export async function GET(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params;


const orderId = Number(id);

if (!Number.isInteger(orderId) || orderId <= 0) {
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

  include: {
    customer: true,

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
console.error("ORDER GET ERROR:", error);


return NextResponse.json(
  {
    error:
      error?.message ||
      "Ошибка загрузки заказа",
  },
  {
    status: 500,
  }
);


}
}

// =================================
// DELETE - удаление заказа
//
// ВАЖНО:
//
// При удалении заказа возвращается
// только та часть товара, которая
// фактически остаётся проданной.
//
// Например:
//
// Продажа: 5
// Возврат: 2
// Удаление:
//
// На склад вернётся только 3.
//
// Каждая единица возвращается
// именно в исходную Batch.
//
// Если исходная Batch уже просрочена,
// она НЕ становится ACTIVE.
//
// Просроченная Batch остаётся EXPIRED.
// =================================

export async function DELETE(
request: Request,
{ params }: { params: Promise<{ id: string }> }
) {
try {
const { id } = await params;


const orderId = Number(id);

if (!Number.isInteger(orderId) || orderId <= 0) {
  return NextResponse.json(
    {
      error: "Некорректный номер заказа",
    },
    {
      status: 400,
    }
  );
}

await prisma.$transaction(async (tx) => {
  // =================================
  // 1. Загружаем заказ
  // =================================

  const order = await tx.order.findUnique({
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

          ReturnBatch: {
            orderBy: {
              id: "asc",
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Error("Заказ не найден");
  }

  // =================================
  // 2. Текущая дата
  //
  // Используется для определения,
  // должна ли восстановленная партия
  // быть ACTIVE или EXPIRED.
  // =================================

  const now = new Date();

  // =================================
  // 3. Защита от повреждённых данных
  //
  // Проверяем все OrderItem.
  // =================================

  for (const item of order.items) {
    if (!item.product) {
      throw new Error(
        `OrderItem #${item.id}: товар не найден`
      );
    }

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error(
        `OrderItem #${item.id}: некорректное количество`
      );
    }

    if (
      !Number.isInteger(item.returned) ||
      item.returned < 0 ||
      item.returned > item.quantity
    ) {
      throw new Error(
        `OrderItem #${item.id}: некорректное количество возврата`
      );
    }
  }

  // =================================
  // 4. Обрабатываем позиции
  // =================================

  for (const item of order.items) {
    // =================================
    // Если у позиции вообще нет
    // OrderBatch, автоматически
    // восстанавливать её нельзя.
    //
    // Это особенно важно для наших
    // известных исторических OrderItem,
    // у которых отсутствуют OrderBatch.
    // =================================

    if (item.batches.length === 0) {
      if (item.returned > 0) {
        throw new Error(
          `OrderItem #${item.id} имеет возвраты, ` +
            `но не имеет OrderBatch. ` +
            `Удаление заказа остановлено для безопасности.`
        );
      }

      throw new Error(
        `OrderItem #${item.id} не имеет OrderBatch. ` +
          `Невозможно безопасно определить, в какую партию вернуть товар. ` +
          `Удаление заказа остановлено.`
      );
    }

    // =================================
    // Собираем проданное количество
    // по каждой Batch.
    //
    // Это безопаснее, чем обрабатывать
    // OrderBatch по одному:
    //
    // если исторически существуют
    // несколько OrderBatch для одной
    // партии, они будут объединены.
    // =================================

    const soldByBatch = new Map<
      number,
      number
    >();

    const batchInfoById = new Map<
      number,
      {
        batchId: number;
        productId: number;
      }
    >();

    for (const orderBatch of item.batches) {
      // =================================
      // Проверяем OrderBatch
      // =================================

      if (
        !Number.isInteger(
          orderBatch.quantity
        ) ||
        orderBatch.quantity <= 0
      ) {
        throw new Error(
          `OrderBatch #${orderBatch.id}: ` +
            `некорректное количество`
        );
      }

      if (
        !Number.isInteger(
          orderBatch.batchId
        ) ||
        orderBatch.batchId <= 0
      ) {
        throw new Error(
          `OrderBatch #${orderBatch.id}: ` +
            `некорректный Batch`
        );
      }

      // =================================
      // Проверяем наличие Batch
      // =================================

      if (!orderBatch.batch) {
        throw new Error(
          `OrderBatch #${orderBatch.id}: Batch не найден`
        );
      }

      // =================================
      // КРИТИЧЕСКАЯ ПРОВЕРКА
      //
      // Batch должен принадлежать тому
      // же Product, что и OrderItem.
      //
      // Это защищает от возврата товара
      // в чужую партию.
      // =================================

      if (
        orderBatch.batch.productId !==
        item.productId
      ) {
        throw new Error(
          `OrderBatch #${orderBatch.id}: ` +
            `Batch #${orderBatch.batchId} ` +
            `принадлежит другому товару. ` +
            `Удаление заказа остановлено.`
        );
      }

      const currentSold =
        soldByBatch.get(
          orderBatch.batchId
        ) ?? 0;

      soldByBatch.set(
        orderBatch.batchId,
        currentSold +
          orderBatch.quantity
      );

      batchInfoById.set(
        orderBatch.batchId,
        {
          batchId: orderBatch.batchId,
          productId: item.productId,
        }
      );
    }

    // =================================
    // Проверяем, что сумма OrderBatch
    // соответствует OrderItem.quantity.
    //
    // Это важная защита перед удалением:
    // нельзя частично восстановить заказ,
    // если его исторические связи уже
    // повреждены.
    // =================================

    const totalSoldFromBatches =
      Array.from(
        soldByBatch.values()
      ).reduce(
        (sum, quantity) =>
          sum + quantity,
        0
      );

    if (
      totalSoldFromBatches !==
      item.quantity
    ) {
      throw new Error(
        `OrderItem #${item.id}: ` +
          `сумма OrderBatch (${totalSoldFromBatches}) ` +
          `не совпадает с количеством OrderItem (${item.quantity}). ` +
          `Удаление заказа остановлено.`
      );
    }

    // =================================
    // 5. Считаем возвраты по Batch
    // =================================

    const returnedByBatch = new Map<
      number,
      number
    >();

    for (const returnBatch of item.ReturnBatch) {
      if (
        !Number.isInteger(
          returnBatch.quantity
        ) ||
        returnBatch.quantity <= 0
      ) {
        throw new Error(
          `ReturnBatch #${returnBatch.id}: ` +
            `некорректное количество`
        );
      }

      if (
        !Number.isInteger(
          returnBatch.batchId
        ) ||
        returnBatch.batchId <= 0
      ) {
        throw new Error(
          `ReturnBatch #${returnBatch.id}: ` +
            `некорректный Batch`
        );
      }

      // =================================
      // Возвращённая партия обязательно
      // должна быть одной из партий,
      // из которых этот OrderItem был
      // продан.
      // =================================

      if (
        !soldByBatch.has(
          returnBatch.batchId
        )
      ) {
        throw new Error(
          `ReturnBatch #${returnBatch.id}: ` +
            `Batch #${returnBatch.batchId} ` +
            `не принадлежит исходной продаже OrderItem #${item.id}. ` +
            `Удаление заказа остановлено.`
        );
      }

      const currentReturned =
        returnedByBatch.get(
          returnBatch.batchId
        ) ?? 0;

      returnedByBatch.set(
        returnBatch.batchId,
        currentReturned +
          returnBatch.quantity
      );
    }

    // =================================
    // 6. Проверяем общий возврат
    // =================================

    const totalReturnedFromHistory =
      Array.from(
        returnedByBatch.values()
      ).reduce(
        (sum, quantity) =>
          sum + quantity,
        0
      );

    if (
      totalReturnedFromHistory !==
      item.returned
    ) {
      throw new Error(
        `OrderItem #${item.id}: ` +
          `ReturnBatch total=${totalReturnedFromHistory}, ` +
          `OrderItem.returned=${item.returned}. ` +
          `История возвратов не совпадает. ` +
          `Удаление заказа остановлено.`
      );
    }

    if (
      totalReturnedFromHistory >
      totalSoldFromBatches
    ) {
      throw new Error(
        `OrderItem #${item.id}: ` +
          `возвращено больше, чем продано. ` +
          `Удаление заказа остановлено.`
      );
    }

    // =================================
    // 7. Возвращаем только реально
    //    оставшуюся проданную часть
    // =================================

    for (const [
      batchId,
      soldQuantity,
    ] of soldByBatch.entries()) {
      const alreadyReturned =
        returnedByBatch.get(
          batchId
        ) ?? 0;

      const remainingFromBatch =
        soldQuantity -
        alreadyReturned;

      if (
        remainingFromBatch <= 0
      ) {
        continue;
      }

      const batchInfo =
        batchInfoById.get(batchId);

      if (!batchInfo) {
        throw new Error(
          `Batch #${batchId}: ` +
            `не найдена информация о партии`
        );
      }

      // =================================
      // Повторно загружаем Batch внутри
      // транзакции.
      //
      // Не полагаемся на старый snapshot
      // из include.
      // =================================

      const currentBatch =
        await tx.batch.findUnique({
          where: {
            id: batchId,
          },

          select: {
            id: true,
            productId: true,
            quantity: true,
            status: true,
            expiryDate: true,
          },
        });

      if (!currentBatch) {
        throw new Error(
          `Batch #${batchId} не найдена`
        );
      }

      // =================================
      // Повторная проверка Product
      // =================================

      if (
        currentBatch.productId !==
        item.productId
      ) {
        throw new Error(
          `Batch #${batchId} принадлежит Product #${currentBatch.productId}, ` +
            `а OrderItem #${item.id} принадлежит Product #${item.productId}. ` +
            `Удаление остановлено.`
        );
      }

      // =================================
      // Восстанавливаем Batch
      // =================================

      const updatedBatch =
        await tx.batch.update({
          where: {
            id: batchId,
          },

          data: {
            quantity: {
              increment:
                remainingFromBatch,
            },
          },

          select: {
            id: true,
            quantity: true,
            expiryDate: true,
            productId: true,
          },
        });

      // =================================
      // КРИТИЧЕСКАЯ ЗАЩИТА ПРОСРОЧКИ
      //
      // Если срок годности уже истёк,
      // партия должна остаться EXPIRED.
      //
      // Если срок ещё действителен —
      // ACTIVE.
      //
      // Никогда не ставим ACTIVE только
      // потому, что quantity > 0.
      // =================================

      const restoredStatus =
        updatedBatch.expiryDate <
        now
          ? "EXPIRED"
          : "ACTIVE";

      await tx.batch.update({
        where: {
          id: updatedBatch.id,
        },

        data: {
          status: restoredStatus,
        },
      });

      // =================================
      // Проверяем результат восстановления
      // =================================

      const verifiedBatch =
        await tx.batch.findUnique({
          where: {
            id: updatedBatch.id,
          },

          select: {
            id: true,
            productId: true,
            quantity: true,
            status: true,
            expiryDate: true,
          },
        });

      if (!verifiedBatch) {
        throw new Error(
          `Batch #${batchId}: ` +
            `не удалось проверить восстановление`
        );
      }

      if (
        verifiedBatch.productId !==
        item.productId
      ) {
        throw new Error(
          `Batch #${batchId}: ` +
            `Product изменился некорректно`
        );
      }

      if (
        verifiedBatch.quantity !==
        updatedBatch.quantity
      ) {
        throw new Error(
          `Batch #${batchId}: ` +
            `количество после восстановления ` +
            `не соответствует ожидаемому`
        );
      }

      if (
        verifiedBatch.expiryDate <
          now &&
        verifiedBatch.status !==
          "EXPIRED"
      ) {
        throw new Error(
          `Batch #${batchId}: ` +
            `просроченная партия ошибочно получила ACTIVE`
        );
      }

      if (
        verifiedBatch.expiryDate >=
          now &&
        verifiedBatch.status !==
          "ACTIVE"
      ) {
        throw new Error(
          `Batch #${batchId}: ` +
            `действующая партия не получила ACTIVE`
        );
      }

      // =================================
      // История движения
      //
      // Создаём RETURN только для той
      // части, которая действительно
      // была продана и ещё не возвращена.
      // =================================

      await tx.movement.create({
        data: {
          type: "RETURN",

          quantity:
            remainingFromBatch,

          comment:
            `Возврат после удаления заказа №${order.id}. ` +
            `Партия №${batchId}`,

          productId:
            item.productId,
        },
      });
    }

    // =================================
    // 8. Пересчитываем Product.stock
    //
    // Не increment, а полный пересчёт
    // из Batch — это надёжнее.
    // =================================

    const totalStock =
      await tx.batch.aggregate({
        where: {
          productId:
            item.productId,
        },

        _sum: {
          quantity: true,
        },
      });

    const calculatedStock =
      totalStock._sum.quantity ?? 0;

    await tx.product.update({
      where: {
        id: item.productId,
      },

      data: {
        stock: calculatedStock,
      },
    });

    // =================================
    // Проверяем Product.stock
    // =================================

    const verifiedProduct =
      await tx.product.findUnique({
        where: {
          id: item.productId,
        },

        select: {
          id: true,
          stock: true,
        },
      });

    if (!verifiedProduct) {
      throw new Error(
        `Product #${item.productId} не найден после обновления`
      );
    }

    if (
      verifiedProduct.stock !==
      calculatedStock
    ) {
      throw new Error(
        `Product #${item.productId}: ` +
          `stock=${verifiedProduct.stock}, ` +
          `ожидалось=${calculatedStock}`
      );
    }
  }

  // =================================
  // 9. Удаляем ReturnBatch
  //
  // Сначала удаляем зависимые записи.
  // =================================

  await tx.returnBatch.deleteMany({
    where: {
      OrderItem: {
        orderId: order.id,
      },
    },
  });

  // =================================
  // 10. Удаляем OrderBatch
  // =================================

  await tx.orderBatch.deleteMany({
    where: {
      orderItem: {
        orderId: order.id,
      },
    },
  });

  // =================================
  // 11. Удаляем OrderItem
  // =================================

  await tx.orderItem.deleteMany({
    where: {
      orderId: order.id,
    },
  });

  // =================================
  // 12. Удаляем Order
  // =================================

  await tx.order.delete({
    where: {
      id: order.id,
    },
  });

  // =================================
  // 13. Финальная проверка внутри
  // транзакции
  // =================================

  const deletedOrder =
    await tx.order.findUnique({
      where: {
        id: order.id,
      },
    });

  if (deletedOrder) {
    throw new Error(
      `Заказ #${order.id} не был удалён`
    );
  }

  const remainingItems =
    await tx.orderItem.count({
      where: {
        orderId: order.id,
      },
    });

  if (remainingItems !== 0) {
    throw new Error(
      `После удаления заказа #${order.id} ` +
        `остались OrderItem: ${remainingItems}`
    );
  }

  const remainingOrderBatches =
    await tx.orderBatch.count({
      where: {
        orderItem: {
          orderId: order.id,
        },
      },
    });

  if (remainingOrderBatches !== 0) {
    throw new Error(
      `После удаления заказа #${order.id} ` +
        `остались OrderBatch: ${remainingOrderBatches}`
    );
  }

  const remainingReturnBatches =
    await tx.returnBatch.count({
      where: {
        OrderItem: {
          orderId: order.id,
        },
      },
    });

  if (remainingReturnBatches !== 0) {
    throw new Error(
      `После удаления заказа #${order.id} ` +
        `остались ReturnBatch: ${remainingReturnBatches}`
    );
  }
});

return NextResponse.json({
  success: true,
});


} catch (error: any) {
console.error(
"ORDER DELETE ERROR:",
error
);


const message =
  error?.message ||
  "Ошибка удаления заказа";

// =================================
// Ошибки бизнес-целостности
// =================================

if (
  message.includes(
    "Заказ не найден"
  )
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 404,
    }
  );
}

if (
  message.includes(
    "Некорректный номер заказа"
  )
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 400,
    }
  );
}

// =================================
// Все остальные ошибки:
//
// транзакция уже откатилась,
// поэтому база остаётся без изменений.
// =================================

return NextResponse.json(
  {
    error: message,
  },
  {
    status: 500,
  }
);


}
}