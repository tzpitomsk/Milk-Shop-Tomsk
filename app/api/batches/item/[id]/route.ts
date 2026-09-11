import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Получить партию
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;


    if (isNaN(Number(id))) {

      return NextResponse.json(
        {
          error: "Неверный ID партии",
        },
        {
          status: 400,
        }
      );

    }


    const batch = await prisma.batch.findUnique({
      where: {
        id: Number(id),
      },
      include: {
        product: true,
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: "Партия не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json(batch);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: "Ошибка загрузки партии" },
      { status: 500 }
    );

  }
}

// Обновить партию
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id } = await params;

    const body = await request.json();

    const batch = await prisma.batch.update({

      where: {
        id: Number(id),
      },

      data: {

        quantity: Number(body.quantity),

        expiryDate: new Date(body.expiryDate),

      },

      include: {
        product: true,
      },

    });

    // Пересчитываем остаток товара
    const total = await prisma.batch.aggregate({

      where: {
        productId: batch.productId,
      },

      _sum: {
        quantity: true,
      },

    });

    await prisma.product.update({

      where: {
        id: batch.productId,
      },

      data: {
        stock: total._sum.quantity || 0,
      },

    });

    return NextResponse.json(batch);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      { error: "Ошибка обновления партии" },
      { status: 500 }
    );

  }
}