import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


// ===============================
// Получить всех поставщиков
// ===============================

export async function GET() {

  try {


    const suppliers = await prisma.supplier.findMany({

      orderBy: {

        id: "desc",

      },

    });



    return NextResponse.json(suppliers);



  } catch (error:any) {


    console.error(
      "SUPPLIERS GET ERROR:",
      error
    );



    return NextResponse.json(

      {
        error:
          "Ошибка загрузки поставщиков",
      },

      {
        status:500,
      }

    );


  }

}






// ===============================
// Создать поставщика
// ===============================

export async function POST(
  request: Request
) {


  try {


    const body = await request.json();



    console.log(
      "NEW SUPPLIER:",
      body
    );




    if (!body.name) {


      return NextResponse.json(

        {
          error:
            "Название поставщика обязательно",
        },

        {
          status:400,
        }

      );


    }






    const supplier = await prisma.supplier.create({

      data:{


        name:
          String(body.name),


        phone:
          body.phone
          ? String(body.phone)
          : null,



        address:
          body.address
          ? String(body.address)
          : null,



      },


    });







    return NextResponse.json(
      supplier
    );





  } catch(error:any) {


    console.error(
      "SUPPLIER CREATE ERROR:",
      error
    );



    return NextResponse.json(

      {

        error:
          error.message ||
          "Ошибка создания поставщика",

      },

      {

        status:500,

      }

    );


  }

}