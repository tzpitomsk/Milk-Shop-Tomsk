import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateProductStock } from "@/lib/update-stock";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const productId = Number(body.productId);
    const targetStock = Number(body.stock);

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "Некорректный товар" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(targetStock) || targetStock < 0) {
      return NextResponse.json(
        { error: "Введите корректный остаток" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          stock: true,
          cost: true,
        },
      });

      if (!product) {
        throw new Error("Товар не найден");
      }

      const batches = await tx.batch.findMany({
        where: {
          productId,
          status: "ACTIVE",
          quantity: {
            gt: 0,
          },
        },
        orderBy: [
          {
            receivedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
      });

      const currentBatchStock = batches.reduce(
        (sum, batch) => sum + batch.quantity,
        0
      );

      const difference = targetStock - currentBatchStock;

      /*
       * Остаток уже совпадает.
       * Ничего в партиях не меняем, но всё равно
       * пересчитываем Product.stock из Batch.quantity.
       */
      if (difference === 0) {
        await updateProductStock(tx, productId);

        const updatedProduct = await tx.product.findUnique({
          where: { id: productId },
        });

        return {
          product: updatedProduct,
          difference: 0,
          currentBatchStock,
          targetStock,
        };
      }

      /*
       * Фактический остаток меньше складского.
       *
       * Уменьшаем самые свежие ACTIVE-партии.
       * Исторические OrderBatch / ReturnBatch не изменяются.
       */
      if (difference < 0) {
        let remainingToRemove = Math.abs(difference);

        for (const batch of batches) {
          if (remainingToRemove <= 0) {
            break;
          }

          const removeFromBatch = Math.min(
            batch.quantity,
            remainingToRemove
          );

          const newQuantity = batch.quantity - removeFromBatch;

          await tx.batch.update({
            where: {
              id: batch.id,
            },
            data: {
              quantity: newQuantity,
              status: newQuantity === 0 ? "EMPTY" : "ACTIVE",
            },
          });

          await tx.movement.create({
            data: {
              type: "WRITE_OFF",
              quantity: -removeFromBatch,
              comment: `Инвентаризация. Корректировка партии №${batch.id}`,
              productId,
            },
          });

          remainingToRemove -= removeFromBatch;
        }

        if (remainingToRemove > 0) {
          throw new Error(
            "Не удалось корректно уменьшить остаток по партиям"
          );
        }
      }

      /*
       * Фактический остаток больше складского.
       *
       * Добавляем недостающее количество в самую свежую
       * ACTIVE-партию. Себестоимость партии при этом не меняется.
       */
      if (difference > 0) {
        const latestBatch = batches[0];

        if (!latestBatch) {
          throw new Error(
            "Нельзя увеличить остаток: у товара нет активной партии. " +
              "Сначала создайте поставку."
          );
        }

        await tx.batch.update({
          where: {
            id: latestBatch.id,
          },
          data: {
            quantity: latestBatch.quantity + difference,
            status: "ACTIVE",
          },
        });

        await tx.movement.create({
          data: {
            type: "SUPPLY",
            quantity: difference,
            comment: `Инвентаризация. Корректировка партии №${latestBatch.id}`,
            productId,
          },
        });
      }

      /*
       * Product.stock не является самостоятельным источником истины.
       * После изменения партий пересчитываем его по Batch.quantity.
       */
      await updateProductStock(tx, productId);

      const updatedProduct = await tx.product.findUnique({
        where: {
          id: productId,
        },
      });

      return {
        product: updatedProduct,
        difference,
        currentBatchStock,
        targetStock,
      };
    });

    return NextResponse.json(result.product);
  } catch (error: unknown) {
    console.error("INVENTORY ERROR:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Ошибка инвентаризации";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}