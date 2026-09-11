import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET() {

  try {

    const today = new Date();

    const limit = new Date();

    limit.setDate(
      today.getDate() + 7
    );


    const batches = await prisma.batch.findMany({

      where: {

        quantity: {
          gt: 0,
        },

        expiryDate: {

          lte: limit,

        },

      },

      include: {

        product: true,

      },

      orderBy: {

        expiryDate: "asc",

      },

    });


    return NextResponse.json(batches);


  } catch (error) {


    console.error(error);


    return NextResponse.json(

      {
        error: "Ошибка загрузки партий",
      },

      {
        status: 500,
      }

    );

  }

}