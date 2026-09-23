import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function getDateRange(period: string) {
  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  if (period === "7days") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  if (period === "month") {
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

    const end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    return { start, end };
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const period = searchParams.get("period") || "today";

    const range = getDateRange(period);

    const where = range
      ? {
          date: {
            gte: range.start,
            lte: range.end,
          },
        }
      : {};

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: [
        {
          date: "desc",
        },
        {
          id: "desc",
        },
      ],
    });

    const total = expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    return NextResponse.json({
      period,
      total,
      expenses,
    });
  } catch (error) {
    console.error("EXPENSES GET ERROR:", error);

    return NextResponse.json(
      {
        error: "Не удалось загрузить расходы",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const category =
      typeof body.category === "string"
        ? body.category.trim()
        : "";

    const comment =
      typeof body.comment === "string"
        ? body.comment.trim()
        : "";

    const amount = Number(body.amount);

    const dateValue =
      typeof body.date === "string"
        ? body.date
        : "";

    if (!category) {
      return NextResponse.json(
        {
          error: "Укажите категорию расхода",
        },
        {
          status: 400,
        }
      );
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        {
          error: "Сумма должна быть целым числом больше 0",
        },
        {
          status: 400,
        }
      );
    }

    if (!dateValue) {
      return NextResponse.json(
        {
          error: "Укажите дату расхода",
        },
        {
          status: 400,
        }
      );
    }

    const date = new Date(`${dateValue}T12:00:00`);

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        {
          error: "Некорректная дата",
        },
        {
          status: 400,
        }
      );
    }

    const expense = await prisma.expense.create({
      data: {
        category,
        date,
        amount,
        comment: comment || null,
      },
    });

    return NextResponse.json(expense, {
      status: 201,
    });
  } catch (error) {
    console.error("EXPENSES POST ERROR:", error);

    return NextResponse.json(
      {
        error: "Не удалось сохранить расход",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const id = Number(searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        {
          error: "Некорректный расход",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.expense.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("EXPENSES DELETE ERROR:", error);

    return NextResponse.json(
      {
        error: "Не удалось удалить расход",
      },
      {
        status: 500,
      }
    );
  }
}