import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
try {
const orders = await prisma.order.findMany({
include: {
items: {
include: {
product: true,
batches: {
include: {
batch: true,
},
},
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


const products = await prisma.product.findMany();

const batches = await prisma.batch.findMany();

// =========================================================================
// ПРОСРОЧКА
// =========================================================================

const todayDate = new Date();
todayDate.setHours(0, 0, 0, 0);

let expiredBatches = 0;
let expiringSoon = 0;

for (const batch of batches) {
  if (batch.quantity <= 0) {
    continue;
  }

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

// =========================================================================
// ФИНАНСЫ
//
// Используем ту же NET-логику, что и Product details:
//
// revenue =
//   item.price * (item.quantity - item.returned)
//
// originalCost =
//   SUM(OrderBatch.quantity * OrderBatch.purchaseCost)
//
// returnedCost =
//   SUM(ReturnBatch.quantity * ReturnBatch.Batch.purchaseCost)
//
// netCost = originalCost - returnedCost
//
// profit = revenue - netCost
// =========================================================================

function getOrderFinancials(order: (typeof orders)[number]) {
  let revenue = 0;
  let originalCost = 0;
  let returnedCost = 0;

  for (const item of order.items) {
    const realSoldQuantity =
      item.quantity - item.returned;

    revenue += item.price * realSoldQuantity;

    for (const orderBatch of item.batches) {
      originalCost +=
        orderBatch.quantity *
        orderBatch.purchaseCost;
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
    originalCost,
    returnedCost,
    netCost,
    profit,
  };
}

let revenue = 0;
let cost = 0;
let profit = 0;

for (const order of orders) {
  const financials = getOrderFinancials(order);

  revenue += financials.revenue;
  cost += financials.netCost;
  profit += financials.profit;
}

// =========================================================================
// СЕГОДНЯ
// =========================================================================

const startOfDay = new Date();
startOfDay.setHours(0, 0, 0, 0);

const todayOrders = orders.filter(
  (order) => new Date(order.date) >= startOfDay
);

let todayRevenue = 0;
let todayCost = 0;
let todayProfit = 0;

for (const order of todayOrders) {
  const financials = getOrderFinancials(order);

  todayRevenue += financials.revenue;
  todayCost += financials.netCost;
  todayProfit += financials.profit;
}

const averageCheck =
  orders.length > 0
    ? Math.round(revenue / orders.length)
    : 0;

// =========================================================================
// ОСТАТКИ
// =========================================================================

const lowStockProducts = products
  .filter(
    (product) =>
      product.stock > 0 && product.stock <= 5
  )
  .sort((a, b) => a.stock - b.stock);

const lowStock = lowStockProducts.length;

const emptyStock = products.filter(
  (product) => product.stock === 0
).length;

// =========================================================================
// ПРОДАЖИ ЗА ПОСЛЕДНИЕ 7 ДНЕЙ
// =========================================================================

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
      const orderDate = new Date(order.date);

      return (
        orderDate >= day &&
        orderDate < nextDay
      );
    })
    .reduce((sum, order) => {
      const financials =
        getOrderFinancials(order);

      return sum + financials.revenue;
    }, 0);

  salesByDay.push({
    date: day.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    }),
    revenue: revenueDay,
  });
}

// =========================================================================
// ТОП ТОВАРОВ
//
// Показываем фактически проданное количество:
//
// realSold = quantity - returned
// =========================================================================

const productMap = new Map<
  number,
  {
    name: string;
    quantity: number;
  }
>();

for (const order of orders) {
  for (const item of order.items) {
    const realSoldQuantity =
      item.quantity - item.returned;

    if (realSoldQuantity <= 0) {
      continue;
    }

    const productId = item.product.id;

    if (!productMap.has(productId)) {
      productMap.set(productId, {
        name: item.product.name,
        quantity: 0,
      });
    }

    productMap.get(productId)!.quantity +=
      realSoldQuantity;
  }
}

const topProducts = Array.from(
  productMap.values()
)
  .sort((a, b) => b.quantity - a.quantity)
  .slice(0, 5);

// =========================================================================
// ТОВАРЫ С БЛИЖАЙШИМ СРОКОМ ГОДНОСТИ
// =========================================================================

const now = new Date();

const expiringProducts = batches
  .filter((batch) => batch.quantity > 0)
  .map((batch) => ({
    id: batch.id,
    productId: batch.productId,
    quantity: batch.quantity,
    expiryDate: batch.expiryDate,
    product: products.find(
      (product) =>
        product.id === batch.productId
    ),
  }))
  .filter((batch) => {
    const days =
      (new Date(batch.expiryDate).getTime() -
        now.getTime()) /
      (1000 * 60 * 60 * 24);

    return days <= 7;
  })
  .sort(
    (a, b) =>
      new Date(a.expiryDate).getTime() -
      new Date(b.expiryDate).getTime()
  );

// =========================================================================
// ОТВЕТ
// =========================================================================

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
