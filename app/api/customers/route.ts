import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET() {
  const customers = await prisma.customer.findMany({
    orderBy: {
      id: "desc",
    },
  });

  return NextResponse.json(customers);
}


export async function POST(request: Request) {
  try {
    const body = await request.json();

    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone,
        address: body.address,
      },
    });

    return NextResponse.json(customer);

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Ошибка создания клиента" },
      { status: 500 }
    );
  }
}