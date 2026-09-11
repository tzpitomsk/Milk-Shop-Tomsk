import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const product = await prisma.product.update({
      where: {
        id: Number(body.productId),
      },
      data: {
        stock: Number(body.stock),
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Ошибка инвентаризации" },
      { status: 500 }
    );
  }
}