import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { updateProductStock } from "@/lib/update-stock";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;


    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          error: "Некорректный ID заказа",
        },
        {
          status: 400,
        }
      );
    }

    const body = await request.json();

    const itemId = Number(body.itemId);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json(
        {
          error: "Некорректный товар",
        },
        {
          status: 400,
        }
      );
    }

    const requestedQuantity =
      body.quantity !== undefined &&
        body.quantity !== null &&
        body.quantity !== ""
        ? Number(body.quantity)
        : null;

    if (
      requestedQuantity !== null &&
      (!Number.isInteger(requestedQuantity) ||
        requestedQuantity <= 0)
    ) {
      return NextResponse.json(
        {
          error: "Некорректное количество",
        },
        {
          status: 400,
        }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // =========================================================
      // 1. Получаем заказ
      // =========================================================

      const order = await tx.order.findUnique({
        where: {
          id: orderId,
        },
        include: {
          items: {
            include: {
              product: true,
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
            orderBy: {
              id: "asc",
            },
          },
        },
      });

      if (!order) {
        throw new Error("Заказ не найден");
      }

      // =========================================================
      // 2. Находим позицию заказа
      // =========================================================

      const item = order.items.find(
        (orderItem) => orderItem.id === itemId
      );

      if (!item) {
        throw new Error("Позиция заказа не найдена");
      }

      // =========================================================
      // 3. Проверяем доступное количество возврата
      // =========================================================

      const canReturn =
        item.quantity - item.returned;

      const quantity =
        requestedQuantity ?? canReturn;

      if (quantity <= 0) {
        throw new Error("Нечего возвращать");
      }

      if (quantity > canReturn) {
        throw new Error(
          `Можно вернуть только ${canReturn} шт`
        );
      }

      // =========================================================
      // 4. Возврат по LIFO
      //
      // Продажа идёт по FEFO/FIFO:
      //
      // OrderBatch #196 → Batch B → 3 шт
      // OrderBatch #197 → Batch A → 1 шт
      //
      // При возврате используем обратный порядок:
      //
      // OrderBatch #197 → Batch A → сначала
      // OrderBatch #196 → Batch B → потом
      //
      // То есть последняя партия, использованная при продаже,
      // возвращается первой.
      // =========================================================

      let remaining = quantity;

      const soldBatches = [...item.batches].sort(
        (a, b) => b.id - a.id
      );

      for (const orderBatch of soldBatches) {
        if (remaining <= 0) {
          break;
        }

        // -------------------------------------------------------
        // Сколько уже возвращено именно из этой партии
        // -------------------------------------------------------

        const previousReturns =
          await tx.returnBatch.findMany({
            where: {
              orderItemId: item.id,
              batchId: orderBatch.batchId,
            },
            select: {
              id: true,
              quantity: true,
            },
            orderBy: {
              id: "asc",
            },
          });

        const returnedQuantityForBatch =
          previousReturns.reduce(
            (sum, returnBatch) =>
              sum + returnBatch.quantity,
            0
          );

        const availableToReturn =
          orderBatch.quantity -
          returnedQuantityForBatch;

        if (availableToReturn <= 0) {
          continue;
        }

        const quantityToReturn = Math.min(
          availableToReturn,
          remaining
        );

        // -------------------------------------------------------
        // Получаем исходную Batch
        // -------------------------------------------------------

        const batch = await tx.batch.findUnique({
          where: {
            id: orderBatch.batchId,
          },
          select: {
            id: true,
            quantity: true,
            status: true,
            expiryDate: true,
            productId: true,
          },
        });

        if (!batch) {
          throw new Error(
            `Партия #${orderBatch.batchId} не найдена`
          );
        }

        if (batch.productId !== item.productId) {
          throw new Error(
            `Партия #${batch.id} принадлежит другому товару`
          );
        }

        // -------------------------------------------------------
        // Возвращаем товар в исходную партию
        // -------------------------------------------------------

        const newQuantity =
          batch.quantity + quantityToReturn;

        const now = new Date();

        const newStatus =
          batch.expiryDate < now
            ? "EXPIRED"
            : "ACTIVE";

        const updatedBatch =
          await tx.batch.update({
            where: {
              id: batch.id,
            },
            data: {
              quantity: newQuantity,
              status: newStatus,
            },
            select: {
              id: true,
              quantity: true,
              status: true,
            },
          });

        // -------------------------------------------------------
        // Создаём ReturnBatch
        // -------------------------------------------------------

        await tx.returnBatch.create({
          data: {
            quantity: quantityToReturn,
            orderItemId: item.id,
            batchId: orderBatch.batchId,
          },
        });

        console.log(
          `RETURN: Order #${orderId}, ` +
          `OrderItem #${item.id}, ` +
          `Batch #${orderBatch.batchId}, ` +
          `OrderBatch #${orderBatch.id}, ` +
          `qty=${quantityToReturn}, ` +
          `newBatchQty=${updatedBatch.quantity}, ` +
          `status=${updatedBatch.status}`
        );

        remaining -= quantityToReturn;
      }

      // =========================================================
      // 5. Проверяем распределение возврата
      // =========================================================

      if (remaining > 0) {
        throw new Error(
          `Ошибка распределения возврата. Осталось вернуть ${remaining} шт`
        );
      }

      // =========================================================
      // 6. Увеличиваем returned
      // =========================================================

      await tx.orderItem.update({
        where: {
          id: item.id,
        },
        data: {
          returned: {
            increment: quantity,
          },
        },
      });

      // =========================================================
      // 7. Получаем актуальные OrderItem
      // =========================================================

      const items =
        await tx.orderItem.findMany({
          where: {
            orderId,
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
          orderBy: {
            id: "asc",
          },
        });

      // =========================================================
      // 8. Пересчитываем total и profit
      //
      // Для каждой OrderBatch:
      //
      // netSold = sold - returnedFromThisBatch
      //
      // cost = netSold × purchaseCost
      //
      // profit = revenue - cost
      // =========================================================

      let total = 0;
      let profit = 0;

      for (const orderItem of items) {
        const netQuantity =
          orderItem.quantity -
          orderItem.returned;

        const itemRevenue =
          netQuantity *
          orderItem.price;

        total += itemRevenue;

        let itemCost = 0;

        console.log("");
        console.log(
          `PROFIT DEBUG: OrderItem #${orderItem.id}`
        );
        console.log(
          `  original quantity=${orderItem.quantity}`
        );
        console.log(
          `  returned=${orderItem.returned}`
        );
        console.log(
          `  net quantity=${netQuantity}`
        );
        console.log(
          `  item price=${orderItem.price}`
        );
        console.log(
          `  item revenue=${itemRevenue}`
        );

        for (const orderBatch of orderItem.batches) {
          const returnedQuantity =
            orderItem.ReturnBatch
              .filter(
                (returnBatch) =>
                  returnBatch.batchId ===
                  orderBatch.batchId
              )
              .reduce(
                (sum, returnBatch) =>
                  sum + returnBatch.quantity,
                0
              );

          const netSoldQuantity =
            orderBatch.quantity -
            returnedQuantity;

          const batchCost =
            Math.max(netSoldQuantity, 0) *
            orderBatch.purchaseCost;

          itemCost += batchCost;

          console.log(
            `  OrderBatch #${orderBatch.id} | ` +
            `Batch #${orderBatch.batchId} | ` +
            `sold=${orderBatch.quantity} | ` +
            `returned=${returnedQuantity} | ` +
            `netSold=${netSoldQuantity} | ` +
            `purchaseCost=${orderBatch.purchaseCost} | ` +
            `batchCost=${batchCost}`
          );
        }

        const itemProfit =
          itemRevenue -
          itemCost;

        profit += itemProfit;

        console.log(
          `  item cost=${itemCost}`
        );
        console.log(
          `  item profit=${itemProfit}`
        );
        console.log("");
      }

      console.log(
        `PROFIT DEBUG FINAL: Order #${orderId}`
      );

      console.log(
        `  total=${total}`
      );

      console.log(
        `  profit=${profit}`
      );

      // =========================================================
      // 9. Определяем статус заказа
      // =========================================================

      const fullyReturned =
        items.every(
          (orderItem) =>
            orderItem.returned >=
            orderItem.quantity
        );

      const hasReturn =
        items.some(
          (orderItem) =>
            orderItem.returned > 0
        );

      let status: OrderStatus =
        OrderStatus.COMPLETED;

      if (fullyReturned) {
        status = OrderStatus.RETURNED;
      } else if (hasReturn) {
        status =
          OrderStatus.PARTIAL_RETURN;
      }

      // =========================================================
      // 10. Обновляем заказ
      // =========================================================

      const updatedOrder =
        await tx.order.update({
          where: {
            id: orderId,
          },
          data: {
            total,
            profit,
            status,
          },
        });

      // =========================================================
      // 11. Синхронизируем Product.stock
      // =========================================================

      const stock =
        await updateProductStock(
          tx,
          item.productId
        );

      // =========================================================
      // 12. Создаём RETURN Movement
      // =========================================================

      await tx.movement.create({
        data: {
          type: "RETURN",
          quantity,
          comment:
            `Возврат из заказа №${orderId}`,
          productId: item.productId,
        },
      });

      // =========================================================
      // 13. Результат
      // =========================================================

      return {
        order: updatedOrder,
        returnedQuantity: quantity,
        stock,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });


  } catch (error: any) {
    console.error(
      "RETURN ERROR:",
      error
    );


    return NextResponse.json(
      {
        error:
          error?.message ||
          "Ошибка возврата",
      },
      {
        status: 500,
      }
    );


  }
}
