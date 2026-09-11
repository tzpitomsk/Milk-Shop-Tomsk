import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function POST() {

  try {


    const today = new Date();



    const result = await prisma.$transaction(async (tx) => {


      const expiredBatches = await tx.batch.findMany({

        where: {

          expiryDate: {
            lt: today,
          },

          quantity: {
            gt: 0,
          },

        },

      });




      const items: any[] = [];




      for (const batch of expiredBatches) {



        // сохраняем информацию для уведомления

        const product = await tx.product.findUnique({
          where: {
            id: batch.productId
          }
        });


        items.push({

          id: batch.id,

          quantity: batch.quantity,

          productId: batch.productId,

          productName: product?.name || "Неизвестный товар",

        });





        // уменьшаем общий остаток товара

        await tx.product.update({

          where: {

            id: batch.productId,

          },

          data: {

            stock: {

              decrement: batch.quantity,

            },

          },

        });






        // записываем движение

        await tx.movement.create({

          data: {

            type: "WRITE_OFF",

            quantity: -batch.quantity,

            comment:
              `Автоматическое списание просрочки. Партия №${batch.id}`,

            productId: batch.productId,

          },

        });







        // обнуляем партию

        await tx.batch.delete({

          where: {

            id: batch.id,

          },

        });



      }






      return {

        count: expiredBatches.length,

        items,

      };



    });







    return NextResponse.json({

      success: true,

      count: result.count,

      items: result.items,

    });






  } catch (error) {


    console.error(
      "AUTO WRITEOFF ERROR:",
      error
    );



    return NextResponse.json(

      {

        error:
          "Ошибка автоматического списания",

      },

      {

        status: 500,

      }

    );


  }


}