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

function isToday(dateValue: Date | string): boolean {
  const date = new Date(dateValue);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const period =
      searchParams.get("period") === "all" ? "all" : "today";

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

    const selectedOrders =
      period === "all"
        ? orders
        : orders.filter((order) => isToday(order.date));

    let revenue = 0;
    let profit = 0;

    for (const order of selectedOrders) {
      const financials = getOrderFinancials(order);

      revenue += financials.revenue;
      profit += financials.profit;
    }

    const expenses = await prisma.expense.findMany({
      orderBy: [
        {
          date: "desc",
        },
        {
          id: "desc",
        },
      ],
    });

    const selectedExpenses =
      period === "all"
        ? expenses
        : expenses.filter((expense) =>
            isToday(expense.date)
          );

    const expensesTotal = selectedExpenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    const netProfit = profit - expensesTotal;

    const ordersCount = selectedOrders.length;

    const averageCheck = ordersCount
      ? Math.round(revenue / ordersCount)
      : 0;

    return NextResponse.json({
      period,
      revenue,
      profit,
      expenses: expensesTotal,
      netProfit,
      ordersCount,
      averageCheck,
    });
  } catch (error) {
    console.error("FINANCE GET ERROR:", error);

    return NextResponse.json(
      { error: "Ошибка загрузки финансов" },
      { status: 500 }
    );
  }
}