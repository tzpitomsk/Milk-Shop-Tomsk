import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type FinanceItem = {
  quantity: number;
  returned: number;
  price: number;
  batches: Array<{
    quantity: number;
    purchaseCost: number;
  }>;
  ReturnBatch: Array<{
    quantity: number;
    Batch: {
      purchaseCost: number;
    };
  }>;
};

type FinanceOrder = {
  date: Date;
  total: number;
  items: FinanceItem[];
};

function getOrderFinancials(order: FinanceOrder) {
  let revenue = 0;
  let originalCost = 0;
  let returnedCost = 0;

  for (const item of order.items) {
    const realSoldQuantity = item.quantity - item.returned;


    revenue += item.price * realSoldQuantity;

    for (const orderBatch of item.batches) {
      originalCost +=
        orderBatch.quantity * orderBatch.purchaseCost;
    }

    for (const returnBatch of item.ReturnBatch) {
      returnedCost +=
        returnBatch.quantity *
        returnBatch.Batch.purchaseCost;
    }


  }

  const netCost = originalCost - returnedCost;
  const profit = revenue - netCost;

  return {
    revenue,
    netCost,
    profit,
  };
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      include: {
        items: {
          include: {
            batches: true,
            ReturnBatch: {
              include: {
                Batch: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(
      (order) => new Date(order.date) >= today
    );

    let revenueToday = 0;
    let profitToday = 0;

    for (const order of todayOrders) {
      const financials = getOrderFinancials(order);

      revenueToday += financials.revenue;
      profitToday += financials.profit;
    }

    let revenueTotal = 0;
    let profitTotal = 0;

    for (const order of orders) {
      const financials = getOrderFinancials(order);

      revenueTotal += financials.revenue;
      profitTotal += financials.profit;
    }

    const ordersToday = todayOrders.length;
    const ordersTotal = orders.length;

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