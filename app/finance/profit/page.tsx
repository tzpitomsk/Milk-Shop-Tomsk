"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type ProfitOrder = {
  id: number;
  date: string;
  customer: {
    name: string;
  } | null;
  revenue: number;
  cost: number;
  profit: number;
};

type ProfitData = {
  orders: ProfitOrder[];
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
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

function ProfitPageContent() {
  const searchParams = useSearchParams();

  const period =
    searchParams.get("period") === "all" ? "all" : "today";

  const [data, setData] = useState<ProfitData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");

    fetch(`/api/finance/profit?period=${period}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Ошибка загрузки прибыли");
        }

        return response.json();
      })
      .then((result) => {
        if (
          !result ||
          !Array.isArray(result.orders) ||
          typeof result.totalRevenue !== "number" ||
          typeof result.totalCost !== "number" ||
          typeof result.totalProfit !== "number"
        ) {
          throw new Error("Некорректный ответ финансового API");
        }

        setData(result);
      })
      .catch((error) => {
        console.error("FINANCE PROFIT LOAD ERROR:", error);
        setError("Не удалось загрузить прибыль");
      });
  }, [period]);

  if (!data) {
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
            📈 Прибыль
          </h1>

          <div className="rounded-2xl bg-white p-5 text-gray-500 shadow">
            {error || "Загрузка..."}
          </div>
        </div>
      </main>
    );
  }

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
          📈 Прибыль
        </h1>

        <div className="mb-4 flex gap-2">
          <Link
            href="/finance/profit"
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium ${
              period === "today"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 shadow"
            }`}
          >
            Сегодня
          </Link>

          <Link
            href="/finance/profit?period=all"
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium ${
              period === "all"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 shadow"
            }`}
          >
            За всё время
          </Link>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-4 shadow">
          <div className="mb-3 text-sm text-gray-500">
            {periodTitle}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-gray-500">
                Выручка
              </div>

              <div className="mt-1 text-base font-bold">
                {formatMoney(data.totalRevenue)}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-gray-500">
                Себестоимость
              </div>

              <div className="mt-1 text-base font-bold">
                {formatMoney(data.totalCost)}
              </div>
            </div>

            <div className="rounded-xl bg-green-50 p-3">
              <div className="text-xs text-gray-500">
                Прибыль
              </div>

              <div className="mt-1 text-base font-bold text-green-700">
                {formatMoney(data.totalProfit)}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Заказы
          </h2>

          <span className="text-sm text-gray-500">
            {data.orders.length}
          </span>
        </div>

        {data.orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow">
            {period === "all"
              ? "Заказов пока нет"
              : "Сегодня заказов ещё нет"}
          </div>
        ) : (
          <div className="space-y-3">
            {data.orders.map((order) => (
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
                      {formatMoney(order.profit)}
                    </div>

                    <div className="text-xs text-gray-400">
                      прибыль
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                  <div>
                    <div className="text-xs text-gray-400">
                      💵 Выручка
                    </div>

                    <div className="mt-1 text-sm font-semibold">
                      {formatMoney(order.revenue)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-400">
                      📦 Себестоимость
                    </div>

                    <div className="mt-1 text-sm font-semibold">
                      {formatMoney(order.cost)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3 text-xs text-gray-400">
                  Нажмите, чтобы открыть чек →
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {period === "all"
                ? "Прибыль за всё время"
                : "Прибыль за сегодня"}
            </span>

            <span className="text-lg font-bold text-green-700">
              {formatMoney(data.totalProfit)}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function FinanceProfitPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-4 pb-24">
          <div className="mx-auto max-w-md">
            <h1 className="text-2xl font-bold text-green-700">
              📈 Прибыль
            </h1>

            <div className="mt-4 rounded-2xl bg-white p-5 text-gray-500 shadow">
              Загрузка...
            </div>
          </div>
        </main>
      }
    >
      <ProfitPageContent />
    </Suspense>
  );
}