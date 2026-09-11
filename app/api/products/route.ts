import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// ============================================================================
// GET /api/products
// ============================================================================

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        batches: {
          where: {
            quantity: {
              gt: 0,
            },
          },
          orderBy: {
            expiryDate: "asc",
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error);

    return NextResponse.json(
      {
        error: "Ошибка загрузки товаров",
      },
      {
        status: 500,
      }
    );
  }
}

// ============================================================================
// POST /api/products
//
// Product.stock НЕ является пользовательским полем.
//
// Источник истины для остатка:
//   SUM(Batch.quantity)
//
// Поэтому новый товар всегда создаётся со stock=0,
// а дальнейшее изменение остатка происходит только через Batch.
// ============================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ------------------------------------------------------------------------
    // Проверяем, что body — объект
    // ------------------------------------------------------------------------

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
    // Product.stock запрещён во входных данных
    // ------------------------------------------------------------------------

    if (Object.prototype.hasOwnProperty.call(body, "stock")) {
      return NextResponse.json(
        {
          error:
            "Поле stock нельзя задавать при создании товара. Остаток формируется партиями.",
        },
        {
          status: 400,
        }
      );
    }

    // ------------------------------------------------------------------------
    // name
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
    // unit
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
    // price
    // ------------------------------------------------------------------------

    const price = Number(body.price);

    if (
      !Number.isInteger(price) ||
      price < 0
    ) {
      return NextResponse.json(
        {
          error: "Цена должна быть целым числом не меньше 0",
        },
        {
          status: 400,
        }
      );
    }

    // ------------------------------------------------------------------------
    // cost
    // ------------------------------------------------------------------------

    const cost = Number(body.cost);

    if (
      !Number.isInteger(cost) ||
      cost < 0
    ) {
      return NextResponse.json(
        {
          error: "Себестоимость должна быть целым числом не меньше 0",
        },
        {
          status: 400,
        }
      );
    }

    // ------------------------------------------------------------------------
    // barcode
    // ------------------------------------------------------------------------

    let barcode: string | null = null;

    if (body.barcode !== undefined && body.barcode !== null) {
      if (typeof body.barcode !== "string") {
        return NextResponse.json(
          {
            error: "Штрихкод должен быть строкой",
          },
          {
            status: 400,
          }
        );
      }

      const normalizedBarcode = body.barcode.trim();

      barcode =
        normalizedBarcode.length > 0
          ? normalizedBarcode
          : null;
    }

    // ------------------------------------------------------------------------
    // CREATE PRODUCT
    //
    // stock намеренно НЕ берём из body.
    // Новый товар всегда начинается с stock=0.
    // ------------------------------------------------------------------------

    const product = await prisma.product.create({
      data: {
        name: body.name.trim(),
        barcode,
        unit: body.unit.trim(),
        price,
        cost,

        // КРИТИЧЕСКИ ВАЖНО:
        // остаток нельзя задавать пользователем.
        // Новый товар не имеет партий => stock = 0.
        stock: 0,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("POST /api/products error:", error);

    return NextResponse.json(
      {
        error: "Ошибка создания товара",
      },
      {
        status: 500,
      }
    );
  }
}