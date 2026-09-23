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
  id: number;
  date: Date;
  customer: {
    name: string;
  } | null;
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") === "all"
      ? "all"
      : "today";

    const orders = await prisma.order.findMany({
      orderBy: {
        date: "desc",
      },
      include: {
        customer: true,
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
    });

    let selectedOrders = orders;

    if (period === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      selectedOrders = orders.filter(
        (order) => new Date(order.date) >= today
      );
    }

    const result = selectedOrders.map((order) => {
      const financials = getOrderFinancials(order);

      return {
        id: order.id,
        date: order.date,
        customer: order.customer,
        revenue: financials.revenue,
        cost: financials.netCost,
        profit: financials.profit,
      };
    });

    const totalRevenue = result.reduce(
      (sum, order) => sum + order.revenue,
      0
    );

    const totalCost = result.reduce(
      (sum, order) => sum + order.cost,
      0
    );

    const totalProfit = result.reduce(
      (sum, order) => sum + order.profit,
      0
    );

    return NextResponse.json({
      orders: result,
      totalRevenue,
      totalCost,
      totalProfit,
    });
  } catch (error) {
    console.error("FINANCE PROFIT ERROR:", error);

    return NextResponse.json(
      {
        error: "Ошибка загрузки прибыли",
      },
      {
        status: 500,
      }
    );
  }
}