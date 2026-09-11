import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateProductStock } from "@/lib/update-stock";

// ==================================================
// GET - получение заказов
// ==================================================

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: {
        date: "desc",
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
            ReturnBatch: true,
          },
        },
      },
    });

    return NextResponse.json(orders);
  } catch (error: any) {
    console.error("GET ORDERS ERROR:", error);

    return NextResponse.json(
      {
        error: "Ошибка загрузки заказов",
      },
      {
        status: 500,
      }
    );
  }
}

// ==================================================
// POST - создание заказа
// ==================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ==================================================
    // Проверяем товары
    // ==================================================

    if (!body.items || !Array.isArray(body.items)) {
      throw new Error("В заказе нет товаров");
    }

    if (body.items.length === 0) {
      throw new Error("Нельзя создать пустой заказ");
    }

    // ==================================================
    // Подготавливаем товары
    //
    // ВАЖНО:
    // price из клиента пока принимаем только для совместимости
    // с текущим frontend.
    //
    // Фактическую цену ниже получаем из Product на сервере.
    // ==================================================

    const requestedItems: {
      productId: number;
      quantity: number;
    }[] = body.items.map((item: any) => {
      const productId = Number(item.id);
      const quantity = Number(item.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error("Некорректный товар");
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Некорректное количество");
      }

      return {
        productId,
        quantity,
      };
    });

    // ==================================================
    // TRANSACTION
    // ==================================================

    const order = await prisma.$transaction(async (tx) => {
      // ==================================================
      // Дата заказа
      //
      // Партия может быть использована только если:
      //
      // receivedAt <= orderDate
      //
      // и партия уже действующая:
      //
      // status = ACTIVE
      //
      // и срок годности ещё не истёк:
      //
      // expiryDate >= orderDate
      // ==================================================

      const orderDate = new Date();

      // ==================================================
      // Загружаем товары с сервера
      //
      // Цена НЕ доверяется клиенту.
      // ==================================================

      const productIds = [
        ...new Set(
          requestedItems.map(
            (item) => item.productId
          )
        ),
      ];

      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });

      const productMap = new Map(
        products.map((product) => [
          product.id,
          product,
        ])
      );

      // ==================================================
      // Проверяем существование товаров
      // ==================================================

      for (const item of requestedItems) {
        const product = productMap.get(
          item.productId
        );

        if (!product) {
          throw new Error(
            `Товар ${item.productId} не найден`
          );
        }
      }

      // ==================================================
      // Проверяем customerId
      // ==================================================

      let customerId: number | null = null;

      if (
        body.customerId !== undefined &&
        body.customerId !== null &&
        body.customerId !== ""
      ) {
        const parsedCustomerId = Number(
          body.customerId
        );

        if (
          !Number.isInteger(parsedCustomerId) ||
          parsedCustomerId <= 0
        ) {
          throw new Error(
            "Некорректный покупатель"
          );
        }

        const customer =
          await tx.customer.findUnique({
            where: {
              id: parsedCustomerId,
            },
            select: {
              id: true,
            },
          });

        if (!customer) {
          throw new Error(
            "Выбранный покупатель не найден"
          );
        }

        customerId = customer.id;
      }

      // ==================================================
      // Нормализуем позиции
      //
      // Цена берётся ТОЛЬКО из Product.price.
      // ==================================================

      const items = requestedItems.map(
        (item) => {
          const product = productMap.get(
            item.productId
          )!;

          return {
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
          };
        }
      );

      // ==================================================
      // Проверяем доступный товар
      //
      // КРИТИЧЕСКИ ВАЖНО:
      //
      // Используем те же условия, что и при FIFO:
      //
      // 1. quantity > 0
      // 2. status = ACTIVE
      // 3. receivedAt <= orderDate
      // 4. expiryDate >= orderDate
      //
      // Поэтому проверка остатка и фактическое списание
      // работают с одним и тем же набором партий.
      // ==================================================

      for (const item of items) {
        const product =
          productMap.get(item.productId)!;

        const stock =
          await tx.batch.aggregate({
            where: {
              productId: item.productId,
              quantity: {
                gt: 0,
              },
              status: "ACTIVE",
              receivedAt: {
                lte: orderDate,
              },
              expiryDate: {
                gte: orderDate,
              },
            },
            _sum: {
              quantity: true,
            },
          });

        const available =
          stock._sum.quantity ?? 0;

        if (available < item.quantity) {
          throw new Error(
            `Недостаточно товара "${product.name}". ` +
              `Доступно: ${available}, ` +
              `требуется: ${item.quantity}`
          );
        }
      }

      // ==================================================
      // Рассчитываем total на сервере
      // ==================================================

      const calculatedTotal = items.reduce(
        (sum, item) => {
          return (
            sum +
            item.quantity * item.price
          );
        },
        0
      );

      // ==================================================
      // Создаём заказ
      // ==================================================

      const createdOrder =
        await tx.order.create({
          data: {
            total: calculatedTotal,
            profit: 0,
            date: orderDate,
            customerId,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
          },
        });

      // ==================================================
      // Получаем созданные позиции заказа
      // ==================================================

      const orderItems =
        await tx.orderItem.findMany({
          where: {
            orderId: createdOrder.id,
          },
          orderBy: {
            id: "asc",
          },
        });

      let totalProfit = 0;

      // ==================================================
      // FIFO / FEFO списание
      // ==================================================

      for (const orderItem of orderItems) {
        let remaining = orderItem.quantity;
        let cost = 0;

        // ==================================================
        // Получаем только реально продаваемые партии
        //
        // Приоритет:
        //
        // 1. expiryDate
        // 2. receivedAt
        // 3. id
        //
        // Таким образом FIFO/FEFO полностью детерминирован.
        // ==================================================

        const batches =
          await tx.batch.findMany({
            where: {
              productId:
                orderItem.productId,
              quantity: {
                gt: 0,
              },
              status: "ACTIVE",
              receivedAt: {
                lte: orderDate,
              },
              expiryDate: {
                gte: orderDate,
              },
            },
            orderBy: [
              {
                expiryDate: "asc",
              },
              {
                receivedAt: "asc",
              },
              {
                id: "asc",
              },
            ],
          });

        // ==================================================
        // Списываем по партиям
        // ==================================================

        for (const batch of batches) {
          if (remaining <= 0) {
            break;
          }

          const take = Math.min(
            batch.quantity,
            remaining
          );

          if (take <= 0) {
            continue;
          }

          // ==================================================
          // Атомарная защита остатка партии
          //
          // Повторно проверяем:
          // - количество
          // - статус
          // - дату поступления
          // - срок годности
          // ==================================================

          const updated =
            await tx.batch.updateMany({
              where: {
                id: batch.id,
                quantity: {
                  gte: take,
                },
                status: "ACTIVE",
                receivedAt: {
                  lte: orderDate,
                },
                expiryDate: {
                  gte: orderDate,
                },
              },
              data: {
                quantity: {
                  decrement: take,
                },
              },
            });

          if (updated.count === 0) {
            // Партия изменилась.
            // Переходим к следующей.
            continue;
          }

          // ==================================================
          // Фиксируем фактическую партию продажи
          //
          // purchaseCost сохраняется как исторический
          // snapshot себестоимости на момент продажи.
          //
          // НЕ нужно потом синхронизировать его с Batch.
          // ==================================================

          await tx.orderBatch.create({
            data: {
              quantity: take,
              purchaseCost:
                batch.purchaseCost,
              orderItemId: orderItem.id,
              batchId: batch.id,
            },
          });

          // ==================================================
          // Себестоимость
          // ==================================================

          cost +=
            take * batch.purchaseCost;

          remaining -= take;

          // ==================================================
          // Обновляем статус партии
          //
          // batch.quantity — значение до decrement.
          // Поэтому:
          //
          // batch.quantity - take > 0
          //     => ACTIVE
          //
          // иначе:
          //     => EMPTY
          // ==================================================

          await tx.batch.update({
            where: {
              id: batch.id,
            },
            data: {
              status:
                batch.quantity - take > 0
                  ? "ACTIVE"
                  : "EMPTY",
            },
          });
        }

        // ==================================================
        // Обязательно проверяем полное списание
        // ==================================================

        if (remaining > 0) {
          throw new Error(
            `FIFO ошибка. Не удалось полностью списать товар "${orderItem.productId}". ` +
              `Осталось списать: ${remaining} шт.`
          );
        }

        // ==================================================
        // Выручка позиции
        // ==================================================

        const revenue =
          orderItem.price *
          orderItem.quantity;

        // ==================================================
        // Прибыль позиции
        //
        // При создании заказа возвратов ещё нет,
        // поэтому это одновременно gross и net profit.
        // ==================================================

        totalProfit +=
          revenue - cost;

        // ==================================================
        // История движения
        // ==================================================

        await tx.movement.create({
          data: {
            type: "SALE",
            quantity:
              -orderItem.quantity,
            comment: `Продажа. Заказ №${createdOrder.id}`,
            productId:
              orderItem.productId,
          },
        });
      }

      // ==================================================
      // Пересчитываем Product.stock
      // ==================================================

      const affectedProductIds = [
        ...new Set(
          orderItems.map(
            (item) => item.productId
          )
        ),
      ];

      for (const productId of affectedProductIds) {
        await updateProductStock(
          tx,
          productId
        );
      }

      // ==================================================
      // Сохраняем итоговые данные заказа
      //
      // total:
      // сумма продажи ДО возможных возвратов.
      //
      // profit:
      // прибыль ДО возможных возвратов.
      //
      // При возврате отдельный API должен пересчитать
      // их в NET-значения.
      // ==================================================

      const result =
        await tx.order.update({
          where: {
            id: createdOrder.id,
          },
          data: {
            total: calculatedTotal,
            profit: totalProfit,
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
                ReturnBatch: true,
              },
            },
          },
        });

      return result;
    });

    return NextResponse.json(order, {
      status: 201,
    });
  } catch (error: any) {
    console.error(
      "ORDER ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Ошибка создания заказа",
      },
      {
        status: 500,
      }
    );
  }
}