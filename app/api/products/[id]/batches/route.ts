import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET(
  request: Request,
  {params}: {params: Promise<{id:string}>}
){

  try {

    const {id}=await params;


    const batches = await prisma.batch.findMany({

      where:{
        productId:Number(id),
        quantity:{
          gt:0
        }
      },

      orderBy:{
        expiryDate:"asc"
      }

    });


    return NextResponse.json(batches);


  } catch(error:any){

    return NextResponse.json(
      {
        error:error.message
      },
      {
        status:500
      }
    );

  }

}