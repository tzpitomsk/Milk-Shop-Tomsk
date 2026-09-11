import { prisma } from "@/lib/prisma";

import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;

    const productId = Number(id);

    if (
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
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

        include: {
          batches: {
            orderBy: {
              id: "desc",
            },
          },

          supplyItems: {
            orderBy: {
              id: "desc",
            },

            include: {
              supply: true,
            },
          },

          orderItems: {
            orderBy: {
              id: "desc",
            },

            include: {
              order: true,

              batches: {
                include: {
                  batch: true,
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

          movements: {
            orderBy: {
              id: "desc",
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

    // ==========================
    // Статистика продаж
    // ==========================

    const soldQuantity =
      product.orderItems.reduce(
        (
          sum: number,
          item
        ) => {
          return (
            sum +
            item.quantity
          );
        },
        0
      );

    const returnedQuantity =
      product.orderItems.reduce(
        (
          sum: number,
          item
        ) => {
          return (
            sum +
            item.returned
          );
        },
        0
      );

    const realSold =
      soldQuantity -
      returnedQuantity;

    // ==========================
    // NET выручка
    // ==========================

    const revenue =
      product.orderItems.reduce(
        (
          sum: number,
          item
        ) => {
          const quantity =
            item.quantity -
            item.returned;

          return (
            sum +
            item.price *
              quantity
          );
        },
        0
      );

    // ==========================
    // NET себестоимость
    //
    // Себестоимость исходной
    // продажи берётся из OrderBatch.
    //
    // Себестоимость возврата
    // берётся из ReturnBatch.
    //
    // Это важно для случаев,
    // когда разные партии имеют
    // разную закупочную цену.
    // ==========================

    const originalCost =
      product.orderItems.reduce(
        (
          sum: number,
          item
        ) => {
          const itemCost =
            item.batches.reduce(
              (
                batchSum: number,
                orderBatch
              ) => {
                return (
                  batchSum +
                  orderBatch.quantity *
                    orderBatch.purchaseCost
                );
              },
              0
            );

          return (
            sum +
            itemCost
          );
        },
        0
      );

    const returnedCost =
      product.orderItems.reduce(
        (
          sum: number,
          item
        ) => {
          const itemReturnedCost =
            item.ReturnBatch.reduce(
              (
                batchSum: number,
                returnBatch
              ) => {
                return (
                  batchSum +
                  returnBatch.quantity *
                    returnBatch.Batch.purchaseCost
                );
              },
              0
            );

          return (
            sum +
            itemReturnedCost
          );
        },
        0
      );

    const netCost =
      originalCost -
      returnedCost;

    // ==========================
    // NET прибыль
    // ==========================

    const profit =
      revenue -
      netCost;

    return NextResponse.json({
      ...product,

      statistics: {
        soldQuantity,
        returnedQuantity,
        realSold,
        revenue,
        profit,
      },
    });
  } catch (error: any) {
    console.error(
      "PRODUCT DETAILS ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Ошибка загрузки товара",
      },
      {
        status: 500,
      }
    );
  }
}