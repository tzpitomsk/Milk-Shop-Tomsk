"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type OrderItem = {
  id: number;
  quantity: number;
  returned: number;
  price: number;
  product: {
    name: string;
  };
};

type Customer = {
  name: string;
};

type Order = {
  id: number;
  date: string;
  total: number;
  customer: Customer | null;
  items: OrderItem[];
};

type RevenueData = {
  orders: Order[];
  totalRevenue: number;
};

function getOrderRevenue(order: Order): number {
  return order.items.reduce((sum, item) => {
    const realSoldQuantity = item.quantity - item.returned;

    return sum + item.price * realSoldQuantity;
  }, 0);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number): string {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function RevenuePageContent() {
  const searchParams = useSearchParams();

  const period =
    searchParams.get("period") === "all" ? "all" : "today";

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrders(null);
    setError("");

    fetch("/api/orders")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Ошибка загрузки заказов");
        }

        return response.json();
      })
      .then((result) => {
        if (!Array.isArray(result)) {
          throw new Error("Некорректный ответ API заказов");
        }

        setOrders(result);
      })
      .catch((error) => {
        console.error("FINANCE REVENUE LOAD ERROR:", error);
        setError("Не удалось загрузить выручку");
      });
  }, [period]);

  if (!orders) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 pb-24">
        <div className="mx-auto max-w-md">
          <div className="mb-4">
            <Link
              href="/finance"
              className="text-sm font-medium text-green-700"
            >
              ← Финансы
            </Link>
          </div>

          <h1 className="mb-4 text-2xl font-bold text-green-700">
            💵 Выручка
          </h1>

          <div className="rounded-2xl bg-white p-5 text-gray-500 shadow">
            {error || "Загрузка..."}
          </div>
        </div>
      </main>
    );
  }

  const selectedOrders =
    period === "all"
      ? orders
      : orders.filter((order) => isToday(order.date));

  const revenue = selectedOrders.reduce((sum, order) => {
    return sum + getOrderRevenue(order);
  }, 0);

  const periodTitle =
    period === "all" ? "За всё время" : "Сегодня";

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24">
      <div className="mx-auto max-w-md">
        <div className="mb-3">
          <Link
            href="/finance"
            className="text-sm font-medium text-green-700"
          >
            ← Финансы
          </Link>
        </div>

        <h1 className="mb-4 text-2xl font-bold text-green-700">
          💵 Выручка
        </h1>

        <div className="mb-4 flex gap-2">
          <Link
            href="/finance/revenue"
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium ${
              period === "today"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 shadow"
            }`}
          >
            Сегодня
          </Link>

          <Link
            href="/finance/revenue?period=all"
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium ${
              period === "all"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 shadow"
            }`}
          >
            За всё время
          </Link>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow">
          <div className="text-sm text-gray-500">
            {periodTitle}
          </div>

          <div className="mt-1 text-3xl font-bold text-green-700">
            {formatMoney(revenue)}
          </div>

          <div className="mt-2 text-sm text-gray-500">
            {selectedOrders.length}{" "}
            {selectedOrders.length === 1
              ? "заказ"
              : selectedOrders.length >= 2 &&
                  selectedOrders.length <= 4
                ? "заказа"
                : "заказов"}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Заказы
          </h2>

          <span className="text-sm text-gray-500">
            {selectedOrders.length}
          </span>
        </div>

        {selectedOrders.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow">
            {period === "all"
              ? "Заказов пока нет"
              : "Сегодня заказов ещё нет"}
          </div>
        ) : (
          <div className="space-y-3">
            {selectedOrders.map((order) => {
              const orderRevenue = getOrderRevenue(order);
              const isReturned = orderRevenue === 0;

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold">
                        Заказ №{order.id}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {formatDate(order.date)}{" "}
                        {formatTime(order.date)}
                      </div>

                      {order.customer && (
                        <div className="mt-1 truncate text-sm text-gray-600">
                          👤 {order.customer.name}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <div
                        className={`text-lg font-bold ${
                          isReturned
                            ? "text-gray-400"
                            : "text-green-700"
                        }`}
                      >
                        {formatMoney(orderRevenue)}
                      </div>

                      {isReturned && (
                        <div className="mt-1 text-xs text-gray-400">
                          Возвращён
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 border-t pt-3 text-xs text-gray-400">
                    Нажмите, чтобы открыть чек →
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {period === "all"
                ? "Выручка за всё время"
                : "Выручка за сегодня"}
            </span>

            <span className="text-lg font-bold text-green-700">
              {formatMoney(revenue)}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function FinanceRevenuePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-4 pb-24">
          <div className="mx-auto max-w-md">
            <h1 className="text-2xl font-bold text-green-700">
              💵 Выручка
            </h1>

            <div className="mt-4 rounded-2xl bg-white p-5 text-gray-500 shadow">
              Загрузка...
            </div>
          </div>
        </main>
      }
    >
      <RevenuePageContent />
    </Suspense>
  );
}