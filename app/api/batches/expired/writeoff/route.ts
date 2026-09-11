import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function POST() {

  try {

    const today = new Date();


    const result = await prisma.$transaction(async (tx)=>{


      const expiredBatches = await tx.batch.findMany({

        where:{

          expiryDate:{
            lt:today,
          },

          quantity:{
            gt:0,
          },

        },

      });



      for(const batch of expiredBatches){


        await tx.movement.create({

          data:{

            type:"WRITE_OFF",

            quantity:-batch.quantity,

            comment:
              `Списание просрочки. Партия №${batch.id}`,

            productId:batch.productId,

          },

        });



        await tx.batch.update({

          where:{
            id:batch.id,
          },

          data:{

            quantity:0,

            status:"EXPIRED",

          },

        });



        const total = await tx.batch.aggregate({

          where:{
            productId:batch.productId,
          },

          _sum:{
            quantity:true,
          },

        });



        await tx.product.update({

          where:{
            id:batch.productId,
          },

          data:{
            stock:total._sum.quantity || 0,
          },

        });


      }


      return expiredBatches.length;


    });



    return NextResponse.json({

      success:true,

      count:result,

    });


  } catch(error){


    console.error(error);


    return NextResponse.json(

      {
        error:"Ошибка списания",
      },

      {
        status:500,
      }

    );


  }

}