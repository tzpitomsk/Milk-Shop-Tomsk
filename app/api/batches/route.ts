import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET() {

  try {

    const batches = await prisma.batch.findMany({

      where: {

        quantity: {
          gt: 0,
        },

      },


      orderBy: {

        expiryDate: "asc",

      },


      include: {

        product: true,

      },

    });


    return NextResponse.json(batches);


  } catch(error) {


    console.error(error);


    return NextResponse.json(

      {
        error:"Ошибка загрузки партий",
      },

      {
        status:500,
      }

    );


  }

}