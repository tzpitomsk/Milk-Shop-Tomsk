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

    const products = await prisma.product.findMany();
    const batches = await prisma.batch.findMany();

    // ==========================
    // Просрочка
    // ==========================

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    let expiredBatches = 0;
    let expiringSoon = 0;

    for (const batch of batches) {
      if (batch.quantity <= 0) continue;

      const expiry = new Date(batch.expiryDate);
      expiry.setHours(0, 0, 0, 0);

      const daysLeft = Math.ceil(
        (expiry.getTime() - todayDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (daysLeft < 0) {
        expiredBatches++;
      } else if (daysLeft <= 7) {
        expiringSoon++;
      }
    }

    // ==========================
    // Финансы
    // ==========================

    let revenue = 0;
    let cost = 0;

    for (const order of orders) {
      revenue += order.total;

      for (const item of order.items) {
        cost += item.product.cost * item.quantity;
      }
    }

    const profit = revenue - cost;

    // ==========================
    // Сегодня
    // ==========================

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(
      (order) => new Date(order.date) >= startOfDay
    );

    let todayRevenue = 0;
    let todayCost = 0;

    for (const order of todayOrders) {
      todayRevenue += order.total;

      for (const item of order.items) {
        todayCost += item.product.cost * item.quantity;
      }
    }

    const todayProfit = todayRevenue - todayCost;

    const averageCheck =
      orders.length > 0
        ? Math.round(revenue / orders.length)
        : 0;

    // ==========================
    // Остатки
    // ==========================

    const lowStockProducts = products
      .filter((p) => p.stock <= 5)
      .sort((a, b) => a.stock - b.stock);

    const lowStock = lowStockProducts.length;

    const emptyStock = products.filter(
      (p) => p.stock === 0
    ).length;

    // ==========================
    // Продажи за 7 дней
    // ==========================

    const salesByDay: {
      date: string;
      revenue: number;
    }[] = [];

    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);

      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const revenueDay = orders
        .filter((order) => {
          const d = new Date(order.date);
          return d >= day && d < nextDay;
        })
        .reduce((sum, order) => sum + order.total, 0);

      salesByDay.push({
        date: day.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
        }),
        revenue: revenueDay,
      });
    }

    // ==========================
    // ТОП товаров
    // ==========================

    const productMap = new Map<
      string,
      { name: string; quantity: number }
    >();

    for (const order of orders) {
      for (const item of order.items) {
        const key = item.product.name;

        if (!productMap.has(key)) {
          productMap.set(key, {
            name: key,
            quantity: 0,
          });
        }

        productMap.get(key)!.quantity += item.quantity;
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const expiringProducts = batches
      .filter((batch) => batch.quantity > 0)
      .map((batch) => ({
        id: batch.id,
        productId: batch.productId,
        quantity: batch.quantity,
        expiryDate: batch.expiryDate,
        product: products.find(
          (p) => p.id === batch.productId
        ),
      }))
      .filter((batch) => {
        const days =
          (new Date(batch.expiryDate).getTime() -
          new Date().getTime()) /
          (1000 * 60 * 60 * 24);

        return days <= 7;
      })
      .sort(
        (a, b) =>
          new Date(a.expiryDate).getTime() -
          new Date(b.expiryDate).getTime()
      );

    return NextResponse.json({
      revenue,
      cost,
      profit,
      orders: orders.length,
      averageCheck,

      todayRevenue,
      todayCost,
      todayProfit,
      todayOrders: todayOrders.length,

      products: products.length,
      lowStock,
      emptyStock,

      expiredBatches,
      expiringSoon,

      salesByDay,

      topProducts,
      
      lowStockProducts,

      expiringProducts,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Ошибка загрузки статистики",
      },
      {
        status: 500,
      }
    );
  }
}