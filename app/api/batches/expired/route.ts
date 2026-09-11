import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET() {

  try {

    const today = new Date();


    const batches = await prisma.batch.findMany({

      where: {

        expiryDate: {
          lt: today,
        },

        quantity: {
          gt: 0,
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
        error: "Ошибка загрузки просроченных партий",
      },

      {
        status: 500,
      }

    );

  }

}