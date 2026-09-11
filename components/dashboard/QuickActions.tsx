"use client";

import Link from "next/link";

const actions = [
  {
    title: "Новый заказ",
    icon: "🛒",
    href: "/orders",
    description: "Оформить продажу",
  },
  {
    title: "Склад",
    icon: "📦",
    href: "/stock",
    description: "Остатки товаров",
  },
  {
    title: "Товары",
    icon: "🥛",
    href: "/products",
    description: "Каталог товаров",
  },
  {
    title: "Клиенты",
    icon: "👥",
    href: "/customers",
    description: "База клиентов",
  },
  {
    title: "Поставки",
    icon: "🚚",
    href: "/supplies",
    description: "Приход товара",
  },
  {
    title: "Партии",
    icon: "📦",
    href: "/batches",
    description: "Сроки годности и списание",
  },
  {
    title: "Финансы",
    icon: "💰",
    href: "/finance",
    description: "Доходы и расходы",
  },
];

export default function QuickActions() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-gray-900">
        Быстрые действия
      </h2>

      <p className="mt-1 text-sm text-gray-500">
        Основные разделы магазина
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-2xl border border-gray-200 bg-gray-50 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-green-300 hover:bg-green-50 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm transition-transform duration-200 group-hover:scale-110">
                {action.icon}
              </div>

              <span className="text-gray-400 transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </div>

            <h3 className="mt-4 font-bold text-gray-900">
              {action.title}
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              {action.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}