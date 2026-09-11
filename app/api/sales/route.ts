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
    });

    let totalSales = 0;
    let totalCost = 0;
    let totalProfit = 0;

    const products: any = {};

    orders.forEach((order) => {
      totalSales += order.total;

      order.items.forEach((item) => {
        const cost =
          item.product.cost * item.quantity;

        const sale =
          item.price * item.quantity;

        totalCost += cost;
        totalProfit += sale - cost;


        if (!products[item.product.name]) {
          products[item.product.name] = 0;
        }

        products[item.product.name] += item.quantity;
      });
    });


    const popularProducts = Object.entries(products)
      .map(([name, quantity]) => ({
        name,
        quantity,
      }))
      .sort(
        (a: any, b: any) =>
          b.quantity - a.quantity
      )
      .slice(0, 5);


    return NextResponse.json({
      ordersCount: orders.length,
      totalSales,
      totalCost,
      totalProfit,
      popularProducts,
    });


  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error: "Ошибка загрузки продаж",
      },
      {
        status: 500,
      }
    );
  }
}