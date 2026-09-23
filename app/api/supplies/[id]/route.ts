import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// ===============================
// Получить одного поставщика
// ===============================

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supplierId = Number(id);

    if (!Number.isInteger(supplierId)) {
      return NextResponse.json(
        {
          error: "Некорректный ID поставщика",
        },
        {
          status: 400,
        }
      );
    }

    const supplier = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!supplier) {
      return NextResponse.json(
        {
          error: "Поставщик не найден",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(supplier);
  } catch (error) {
    console.error(
      "SUPPLIER GET ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Ошибка загрузки поставщика",
      },
      {
        status: 500,
      }
    );
  }
}

// ===============================
// Изменить поставщика
// ===============================

export async function PUT(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const supplierId = Number(id);

    if (!Number.isInteger(supplierId)) {
      return NextResponse.json(
        {
          error: "Некорректный ID поставщика",
        },
        {
          status: 400,
        }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();

    if (!name) {
      return NextResponse.json(
        {
          error: "Название поставщика обязательно",
        },
        {
          status: 400,
        }
      );
    }

    const existingSupplier =
      await prisma.supplier.findUnique({
        where: {
          id: supplierId,
        },
      });

    if (!existingSupplier) {
      return NextResponse.json(
        {
          error: "Поставщик не найден",
        },
        {
          status: 404,
        }
      );
    }

    const supplier =
      await prisma.supplier.update({
        where: {
          id: supplierId,
        },
        data: {
          name,
          phone: phone || null,
          address: address || null,
        },
      });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error(
      "SUPPLIER UPDATE ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Ошибка изменения поставщика",
      },
      {
        status: 500,
      }
    );
  }
}