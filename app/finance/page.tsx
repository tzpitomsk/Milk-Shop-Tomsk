"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Finance = {
  period: "today" | "all";
  revenue: number;
  profit: number;
  expenses: number;
  netProfit: number;
  ordersCount: number;
  averageCheck: number;
};

function formatMoney(value: number): string {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function formatTodayDate(): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function FinancePageContent() {
  const searchParams = useSearchParams();

  const period =
    searchParams.get("period") === "all"
      ? "all"
      : "today";

  const [data, setData] = useState<Finance | null>(null);
  const [error, setError] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    setData(null);
    setError("");

    fetch(`/api/finance?period=${period}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Ошибка загрузки финансов");
        }

        return response.json();
      })
      .then((result) => {
        if (
          typeof result.revenue !== "number" ||
          typeof result.profit !== "number" ||
          typeof result.expenses !== "number" ||
          typeof result.netProfit !== "number" ||
          typeof result.ordersCount !== "number" ||
          typeof result.averageCheck !== "number"
        ) {
          throw new Error(
            "Некорректный ответ финансового API"
          );
        }

        setData(result);
      })
      .catch((error) => {
        console.error("FINANCE LOAD ERROR:", error);
        setError("Не удалось загрузить финансы");
      });
  }, [period]);

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 pb-24">
        <div className="mx-auto max-w-md">
          <h1 className="mb-4 text-2xl font-bold text-green-700">
            💰 Финансы
          </h1>

          <div className="rounded-2xl bg-white p-5 text-gray-500 shadow">
            {error || "Загрузка..."}
          </div>
        </div>
      </main>
    );
  }

  const todayDate = formatTodayDate();

  const periodTitle =
    period === "all"
      ? "За всё время"
      : `Сегодня — ${todayDate}`;

  const periodQuery =
    period === "all" ? "?period=all" : "";

  function selectPeriod(nextPeriod: "today" | "all") {
    setPeriodOpen(false);

    if (nextPeriod === "all") {
      window.location.href = "/finance?period=all";
    } else {
      window.location.href = "/finance";
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24">
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-2xl font-bold text-green-700">
          💰 Финансы
        </h1>

        <div className="relative mb-3">
          <button
            type="button"
            onClick={() =>
              setPeriodOpen((open) => !open)
            }
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left shadow active:scale-[0.99]"
          >
            <div className="font-bold">
              {periodTitle}
            </div>

            <div
              className={`text-lg text-gray-400 transition-transform ${
                periodOpen ? "rotate-180" : ""
              }`}
            >
              ▾
            </div>
          </button>

          {periodOpen && (
            <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl bg-white shadow-lg">
              <button
                type="button"
                onClick={() => selectPeriod("today")}
                className={`w-full px-4 py-3 text-left ${
                  period === "today"
                    ? "bg-green-50 text-green-700"
                    : "text-gray-700"
                }`}
              >
                <div className="font-medium">
                  Сегодня — {todayDate}
                </div>
              </button>

              <div className="border-t" />

              <button
                type="button"
                onClick={() => selectPeriod("all")}
                className={`w-full px-4 py-3 text-left ${
                  period === "all"
                    ? "bg-green-50 text-green-700"
                    : "text-gray-700"
                }`}
              >
                <div className="font-medium">
                  За всё время
                </div>

                <div className="text-sm text-gray-500">
                  Все заказы и расходы
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <Link
            href={`/finance/revenue${periodQuery}`}
            className="rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <p className="text-sm text-gray-500">
              💵 Выручка
            </p>

            <p className="mt-1 text-xl font-bold text-green-700">
              {formatMoney(data.revenue)}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Подробнее →
            </p>
          </Link>

          <Link
            href={`/finance/profit${periodQuery}`}
            className="rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <p className="text-sm text-gray-500">
              📈 Прибыль
            </p>

            <p className="mt-1 text-xl font-bold text-green-700">
              {formatMoney(data.profit)}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Подробнее →
            </p>
          </Link>

          <Link
            href="/expenses"
            className="rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <p className="text-sm text-gray-500">
              💸 Расходы
            </p>

            <p className="mt-1 text-xl font-bold text-red-600">
              {formatMoney(data.expenses)}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Подробнее →
            </p>
          </Link>

          <div className="rounded-2xl bg-white p-4 shadow">
            <p className="text-sm text-gray-500">
              🟢 Чистая прибыль
            </p>

            <p
              className={`mt-1 text-xl font-bold ${
                data.netProfit >= 0
                  ? "text-green-700"
                  : "text-red-600"
              }`}
            >
              {formatMoney(data.netProfit)}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              После расходов
            </p>
          </div>

          <Link
            href={`/finance/orders${periodQuery}`}
            className="rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <p className="text-sm text-gray-500">
              🛒 Заказы
            </p>

            <p className="mt-1 text-xl font-bold">
              {data.ordersCount}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Подробнее →
            </p>
          </Link>

          <Link
            href={`/finance/average-check${periodQuery}`}
            className="rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <p className="text-sm text-gray-500">
              🧾 Средний чек
            </p>

            <p className="mt-1 text-xl font-bold">
              {formatMoney(data.averageCheck)}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Подробнее →
            </p>
          </Link>
        </div>

        <h2 className="mb-3 text-lg font-bold">
          {periodTitle}
        </h2>

        <div className="space-y-3">
          <Link
            href={`/finance/revenue${periodQuery}`}
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <div>
              <p className="text-sm text-gray-500">
                💰 Выручка
              </p>

              <p className="text-xl font-bold">
                {formatMoney(data.revenue)}
              </p>
            </div>

            <span className="text-gray-400">
              →
            </span>
          </Link>

          <Link
            href={`/finance/profit${periodQuery}`}
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <div>
              <p className="text-sm text-gray-500">
                📈 Прибыль от продаж
              </p>

              <p className="text-xl font-bold">
                {formatMoney(data.profit)}
              </p>
            </div>

            <span className="text-gray-400">
              →
            </span>
          </Link>

          <Link
            href="/expenses"
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <div>
              <p className="text-sm text-gray-500">
                💸 Расходы
              </p>

              <p className="text-xl font-bold text-red-600">
                {formatMoney(data.expenses)}
              </p>
            </div>

            <span className="text-gray-400">
              →
            </span>
          </Link>

          <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow">
            <div>
              <p className="text-sm text-gray-500">
                🟢 Чистая прибыль
              </p>

              <p
                className={`text-xl font-bold ${
                  data.netProfit >= 0
                    ? "text-green-700"
                    : "text-red-600"
                }`}
              >
                {formatMoney(data.netProfit)}
              </p>
            </div>

            <span className="text-sm text-gray-400">
              После расходов
            </span>
          </div>

          <Link
            href={`/finance/orders${periodQuery}`}
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow transition active:scale-[0.98]"
          >
            <div>
              <p className="text-sm text-gray-500">
                📦 Всего заказов
              </p>

              <p className="text-xl font-bold">
                {data.ordersCount}
              </p>
            </div>

            <span className="text-gray-400">
              →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-4 pb-24">
          <div className="mx-auto max-w-md">
            <h1 className="text-2xl font-bold text-green-700">
              💰 Финансы
            </h1>

            <div className="mt-4 rounded-2xl bg-white p-5 text-gray-500 shadow">
              Загрузка...
            </div>
          </div>
        </main>
      }
    >
      <FinancePageContent />
    </Suspense>
  );
}