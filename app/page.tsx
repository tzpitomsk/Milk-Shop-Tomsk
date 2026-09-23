"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import StatsGrid from "@/components/stats-grid";
import Alerts from "@/components/dashboard/Alerts";
import Header from "@/components/dashboard/Header";

type Dashboard = {
  revenue: number;
  profit: number;
  orders: number;
  averageCheck: number;
  todayRevenue: number;
  todayProfit: number;
  todayOrders: number;
  products: number;
  lowStock: number;
  emptyStock: number;
  expiredBatches: number;
  expiringSoon: number;
  salesByDay: {
    date: string;
    revenue: number;
  }[];
  topProducts: {
    name: string;
    quantity: number;
  }[];
  lowStockProducts: {
    id: number;
    name: string;
    stock: number;
  }[];
  expiringProducts: {
    id: number;
    productId: number;
    quantity: number;
    expiryDate: string;
    product?: {
      name: string;
    };
  }[];
};

const sections = [
  {
    href: "/orders",
    icon: "🛒",
    title: "Заказы",
    description: "Продажи и чеки",
  },
  {
    href: "/delivery",
    icon: "🚚",
    title: "Доставка",
    description: "Маршрут и доставка",
  },
  {
    href: "/stock",
    icon: "📦",
    title: "Склад",
    description: "Остатки товаров",
  },
  {
    href: "/products",
    icon: "🥛",
    title: "Товары",
    description: "Товары и цены",
  },
  {
    href: "/finance",
    icon: "💰",
    title: "Финансы",
    description: "Выручка и прибыль",
  },
  {
    href: "/customers",
    icon: "👥",
    title: "Клиенты",
    description: "Клиенты магазина",
  },
  {
    href: "/suppliers",
    icon: "🚚",
    title: "Поставщики",
    description: "Поставщики товаров",
  },
  {
    href: "/supplies",
    icon: "🚚",
    title: "Поставки",
    description: "Приход товаров",
  },
  {
    href: "/batches",
    icon: "📦",
    title: "Партии",
    description: "Партии и остатки",
  },
  {
    href: "/inventory",
    icon: "📋",
    title: "Инвентаризация",
    description: "Сверка остатков",
  },
  {
    href: "/expiry",
    icon: "⏰",
    title: "Срок годности",
    description: "Сроки и списание",
  },
];

export default function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [writeOffs, setWriteOffs] = useState<any[]>([]);

  useEffect(() => {
    async function autoWriteOff() {
      try {
        const res = await fetch("/api/batches/auto-writeoff", {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error(
            `Авто списание: HTTP ${res.status}`
          );
        }

        const result = await res.json();

        if (result.count > 0) {
          setWriteOffs(result.items);
        }
      } catch (error) {
        console.error("Ошибка авто списания", error);
      }
    }

    async function start() {
      await autoWriteOff();
      await loadDashboard();
    }

    start();
  }, []);

  async function loadDashboard() {
    const res = await fetch("/api/dashboard");
    const json = await res.json();

    setData(json);

    const res2 = await fetch("/api/batches/expiring");
    const expiringData = await res2.json();

    setExpiring(expiringData);
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p>Загрузка...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl p-3 pb-24 sm:p-6">
        {writeOffs.length > 0 && (
          <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-3">
            <h2 className="text-base font-bold text-red-700">
              ⚠️ Автоматическое списание
            </h2>

            {writeOffs.map((item) => (
              <div
                key={item.id}
                className="mt-2 rounded-xl bg-white p-3 text-center"
              >
                <div className="font-bold">
                  🥛 {item.productName}
                </div>

                <div className="mt-1 text-sm text-gray-600">
                  Партия №{item.id}
                </div>

                <div className="mt-1 text-sm">
                  Списано: <b>{item.quantity} шт</b>
                </div>

                <div className="mt-1 text-sm font-semibold text-red-600">
                  Причина: истёк срок годности
                </div>
              </div>
            ))}
          </div>
        )}

        <Header />

        <Link
          href="/orders/new"
          className="mb-4 flex min-h-14 w-full touch-manipulation items-center justify-center rounded-2xl bg-blue-700 px-4 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-blue-800 active:bg-blue-800"
        >
          ＋ Новая продажа
        </Link>

        <section className="mb-4">
          <div className="mb-2">
            <h2 className="text-lg font-bold">
              Сегодня
            </h2>

            <div className="text-sm text-slate-500">
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </div>
          </div>

          <StatsGrid
            revenue={data.todayRevenue}
            profit={data.todayProfit}
            orders={data.todayOrders}
            products={data.products}
          />
        </section>

        <section className="mb-4">
          <Alerts
            lowStock={data.lowStock}
            emptyStock={data.emptyStock}
            expiredBatches={data.expiredBatches}
            expiringSoon={data.expiringSoon}
            lowStockProducts={data.lowStockProducts}
            expiringProducts={data.expiringProducts}
          />
        </section>

        <section className="mb-5">
          <h2 className="mb-2 text-lg font-bold">
            📋 Все разделы
          </h2>

          <div className="grid grid-cols-2 gap-2">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="min-h-[84px] rounded-xl bg-white p-3 shadow-sm transition-colors active:bg-gray-50"
              >
                <div className="text-2xl">
                  {section.icon}
                </div>

                <div className="mt-1 font-bold text-gray-900">
                  {section.title}
                </div>

                <div className="mt-0.5 text-xs leading-4 text-gray-500">
                  {section.description}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}