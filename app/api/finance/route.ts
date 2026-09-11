import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET() {

  try {


    const orders = await prisma.order.findMany({

      include: {

        items: {

          include: {

            product: true,

          },

        },

      },

      orderBy: {

        date: "desc",

      },

    });





    const today = new Date();

    today.setHours(0, 0, 0, 0);





    const todayOrders = orders.filter((order) => {

      return new Date(order.date) >= today;

    });







    const revenueToday = todayOrders.reduce(

      (sum, order) => sum + order.total,

      0

    );






    const revenueTotal = orders.reduce(

      (sum, order) => sum + order.total,

      0

    );







    const ordersToday = todayOrders.length;


    const ordersTotal = orders.length;







    // расчёт прибыли

    let profitToday = 0;

    let profitTotal = 0;





    orders.forEach((order) => {


      order.items.forEach((item) => {


        const cost = item.product.cost ?? 0;


        const profit =
          (item.price - cost) *
          item.quantity;



        profitTotal += profit;




        if (new Date(order.date) >= today) {

          profitToday += profit;

        }



      });


    });







    const averageCheck = ordersTotal

      ? Math.round(revenueTotal / ordersTotal)

      : 0;







    return NextResponse.json({

      revenueToday,

      profitToday,

      ordersToday,


      revenueTotal,

      profitTotal,

      ordersTotal,


      averageCheck,

    });





  } catch (error) {


    console.error(error);



    return NextResponse.json(

      {
        error: "Ошибка загрузки финансов",
      },

      {
        status: 500,
      }

    );


  }

}