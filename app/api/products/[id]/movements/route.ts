import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {

  try {

    const { id } = await params;


    const movements = await prisma.movement.findMany({

      where: {
        productId: Number(id),
      },

      orderBy: {
        createdAt: "desc",
      },

    });


    return NextResponse.json(movements);


  } catch (error) {

    console.error(error);


    return NextResponse.json(
      {
        error: "Ошибка загрузки истории",
      },
      {
        status: 500,
      }
    );

  }

}