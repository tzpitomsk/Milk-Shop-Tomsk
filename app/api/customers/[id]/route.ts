import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const customerId = Number(id);

    if (!Number.isInteger(customerId)) {
      return NextResponse.json(
        { error: "Некорректный ID клиента" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error("CUSTOMER GET ERROR:", error);

    return NextResponse.json(
      { error: "Ошибка загрузки клиента" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const customerId = Number(id);

    if (!Number.isInteger(customerId)) {
      return NextResponse.json(
        { error: "Некорректный ID клиента" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Имя клиента обязательно" },
        { status: 400 }
      );
    }

    const existingCustomer =
      await prisma.customer.findUnique({
        where: {
          id: customerId,
        },
      });

    if (!existingCustomer) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 }
      );
    }

    const customer = await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        name,
        phone: phone || null,
        address: address || null,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error("CUSTOMER UPDATE ERROR:", error);

    return NextResponse.json(
      { error: "Ошибка изменения клиента" },
      { status: 500 }
    );
  }
}