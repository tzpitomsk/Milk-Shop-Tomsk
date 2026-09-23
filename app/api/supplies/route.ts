import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateProductStock } from "@/lib/update-stock";

// ============================================
// Тип входящего товара поставки
// ============================================

type SupplyInputItem = {
  id: number;
  quantity: number;
  cost: number;
  expiryDate: string;
};

// ============================================
// GET
// Получить все поставки
// ============================================

export async function GET() {
  try {
    const supplies = await prisma.supply.findMany({
      orderBy: {
        date: "desc",
      },
      include: {
        Supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return NextResponse.json(supplies);
  } catch (error: unknown) {
    console.error("GET SUPPLIES ERROR:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Ошибка загрузки поставок";

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

// ============================================
// POST
// Создать поставку
// ============================================

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ========================================
    // Проверяем поставщика
    // ========================================

    const supplierId = Number(body.supplierId);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json(
        {
          error: "Некорректный поставщик",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================
    // Проверяем товары
    // ========================================

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        {
          error: "В поставке должен быть хотя бы один товар",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================
    // Нормализуем товары
    // ========================================

    const normalizedItems: SupplyInputItem[] = body.items.map(
      (item: any) => {
        const id = Number(item.id);
        const quantity = Number(item.quantity);
        const cost = Number(item.cost);
        const expiryDate = String(item.expiryDate ?? "");

        return {
          id,
          quantity,
          cost,
          expiryDate,
        };
      }
    );

    // ========================================
    // Проверяем товары
    // ========================================

    for (const item of normalizedItems) {
      if (!Number.isInteger(item.id) || item.id <= 0) {
        return NextResponse.json(
          {
            error: "Некорректный товар",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return NextResponse.json(
          {
            error: `Некорректное количество для товара #${item.id}`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(item.cost) ||
        item.cost <= 0
      ) {
        return NextResponse.json(
          {
            error: `Некорректная закупочная цена для товара #${item.id}`,
          },
          {
            status: 400,
          }
        );
      }

      if (!item.expiryDate) {
        return NextResponse.json(
          {
            error: `Не указан срок годности для товара #${item.id}`,
          },
          {
            status: 400,
          }
        );
      }

      const expiryDate = new Date(
        `${item.expiryDate}T00:00:00`
      );

      if (Number.isNaN(expiryDate.getTime())) {
        return NextResponse.json(
          {
            error: `Некорректный срок годности для товара #${item.id}`,
          },
          {
            status: 400,
          }
        );
      }
    }

    // ========================================
    // Проверяем существование поставщика
    // ========================================

    const supplier = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!supplier) {
      return NextResponse.json(
        {
          error: "Поставщик не найден",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================
    // Получаем ID товаров
    // ========================================

    const productIds: number[] = normalizedItems.map(
      (item: SupplyInputItem) => item.id
    );

    const products = await prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // ========================================
    // Проверяем, что все товары существуют
    // ========================================

    const existingProductIds = new Set(
      products.map((product) => product.id)
    );

    for (const item of normalizedItems) {
      if (!existingProductIds.has(item.id)) {
        return NextResponse.json(
          {
            error: `Товар #${item.id} не найден`,
          },
          {
            status: 404,
          }
        );
      }
    }

    // ========================================
    // Считаем общую сумму
    // ========================================

    const total = normalizedItems.reduce(
      (
        sum: number,
        item: SupplyInputItem
      ) => {
        return sum + item.quantity * item.cost;
      },
      0
    );

    // ========================================
    // Транзакция
    // ========================================

    const supply = await prisma.$transaction(
      async (tx) => {
        // ------------------------------------
        // Создаём поставку
        // ------------------------------------

        const newSupply = await tx.supply.create({
          data: {
            supplierId,
            total,
            items: {
              create: normalizedItems.map(
                (item: SupplyInputItem) => ({
                  productId: item.id,
                  quantity: item.quantity,
                  cost: item.cost,
                })
              ),
            },
          },
          include: {
            Supplier: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        // ------------------------------------
        // Создаём Batch для каждого товара
        // ------------------------------------

        for (const item of normalizedItems) {
          const expiryDate = new Date(
            `${item.expiryDate}T00:00:00`
          );

          // ==================================
          // Создаём новую партию
          // ==================================

          await tx.batch.create({
            data: {
              productId: item.id,
              quantity: item.quantity,
              purchaseCost: item.cost,
              receivedAt: new Date(),
              expiryDate,
              status: "ACTIVE",
            },
          });

          // ==================================
          // Обновляем текущую себестоимость
          // товара.
          //
          // ВАЖНО:
          // это НЕ меняет purchaseCost уже
          // существующих Batch.
          // ==================================

          await tx.product.update({
            where: {
              id: item.id,
            },
            data: {
              cost: item.cost,
            },
          });

          // ==================================
          // Движение товара
          // ==================================

          await tx.movement.create({
            data: {
              type: "SUPPLY",
              quantity: item.quantity,
              comment: `Приход поставка №${newSupply.id}`,
              productId: item.id,
            },
          });

          // ==================================
          // ВАЖНО:
          // stock берём из Batch.quantity
          // ==================================

          await updateProductStock(
            tx,
            item.id
          );
        }

        return newSupply;
      }
    );

    // ========================================
    // Ответ
    // ========================================

    return NextResponse.json({
      success: true,
      supply,
    });
  } catch (error: unknown) {
    console.error(
      "CREATE SUPPLY ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Ошибка создания поставки";

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