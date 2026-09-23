"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Order = {
  id: number;
  date: string;
  total: number;
  customer: {
    name: string;
  } | null;
};

type FinanceData = {
  period: "today" | "all";
  revenue: number;
  profit: number;
  ordersCount: number;
  averageCheck: number;
};

function formatMoney(value: number): string {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
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

function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function AverageCheckPageContent() {
  const searchParams = useSearchParams();

  const period =
    searchParams.get("period") === "all" ? "all" : "today";

  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setFinance(null);
    setOrders(null);
    setError("");

    Promise.all([
      fetch(`/api/finance?period=${period}`).then(async (response) => {
        if (!response.ok) {
          throw new Error("Ошибка загрузки финансов");
        }

        return response.json();
      }),

      fetch("/api/orders").then(async (response) => {
        if (!response.ok) {
          throw new Error("Ошибка загрузки заказов");
        }

        return response.json();
      }),
    ])
      .then(([financeResult, ordersResult]) => {
        if (
          typeof financeResult.averageCheck !== "number" ||
          typeof financeResult.ordersCount !== "number"
        ) {
          throw new Error("Некорректный ответ финансового API");
        }

        if (!Array.isArray(ordersResult)) {
          throw new Error("Некорректный ответ API заказов");
        }

        setFinance(financeResult);
        setOrders(ordersResult);
      })
      .catch((error) => {
        console.error("FINANCE AVERAGE CHECK LOAD ERROR:", error);
        setError("Не удалось загрузить средний чек");
      });
  }, [period]);

  if (!finance || !orders) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 pb-24">
        <div className="mx-auto max-w-md">
          <Link
            href="/finance"
            className="text-sm font-medium text-green-700"
          >
            ← Финансы
          </Link>

          <h1 className="mt-3 text-2xl font-bold text-green-700">
            🧾 Средний чек
          </h1>

          <div className="mt-4 rounded-2xl bg-white p-5 text-gray-500 shadow">
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
          🧾 Средний чек
        </h1>

        <div className="mb-4 flex gap-2">
          <Link
            href="/finance/average-check"
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium ${
              period === "today"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 shadow"
            }`}
          >
            Сегодня
          </Link>

          <Link
            href="/finance/average-check?period=all"
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
            {formatMoney(finance.averageCheck)}
          </div>

          <div className="mt-2 text-sm text-gray-500">
            Средний чек
          </div>

          <div className="mt-3 border-t pt-3 text-sm text-gray-500">
            Заказов:{" "}
            <span className="font-medium text-gray-700">
              {finance.ordersCount}
            </span>
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
            {selectedOrders.map((order) => (
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
                    <div className="text-lg font-bold text-green-700">
                      {formatMoney(order.total)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3 text-xs text-gray-400">
                  Открыть чек →
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Средний чек
            </span>

            <span className="text-lg font-bold text-green-700">
              {formatMoney(finance.averageCheck)}
            </span>
          </div>

          <div className="mt-1 text-xs text-gray-400">
            {periodTitle}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AverageCheckPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-4 pb-24">
          <div className="mx-auto max-w-md">
            <h1 className="text-2xl font-bold text-green-700">
              🧾 Средний чек
            </h1>

            <div className="mt-4 rounded-2xl bg-white p-5 text-gray-500 shadow">
              Загрузка...
            </div>
          </div>
        </main>
      }
    >
      <AverageCheckPageContent />
    </Suspense>
  );
}