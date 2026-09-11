"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SupplyItem = {
  id: number;
  quantity: number;
  cost: number;
  product?: {
    id: number;
    name: string;
    unit: string;
  };
};

type Supply = {
  id: number;
  date: string;
  total: number;
  Supplier?: {
    id: number;
    name: string;
    phone?: string | null;
    address?: string | null;
  } | null;
  items: SupplyItem[];
};

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSupplies() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/supplies");

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Ошибка загрузки поставок"
          );
        }

        if (!Array.isArray(data)) {
          throw new Error("API вернул некорректные данные");
        }

        setSupplies(data);
      } catch (error: any) {
        console.error("SUPPLIES PAGE ERROR:", error);

        setError(
          error?.message || "Ошибка загрузки поставок"
        );
      } finally {
        setLoading(false);
      }
    }

    loadSupplies();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        {/* Заголовок */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-green-700">
            🚚 Поставки
          </h1>

          <Link
            href="/supplies/new"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-700 text-2xl font-semibold text-white shadow-sm transition hover:bg-green-800"
          >
            +
          </Link>
        </div>

        {/* Загрузка */}
        {loading && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-gray-500">
              Загрузка поставок...
            </p>
          </div>
        )}

        {/* Ошибка */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="font-semibold text-red-700">
              Ошибка
            </p>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>
          </div>
        )}

        {/* Поставок нет */}
        {!loading && !error && supplies.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-gray-500">
              Поставок пока нет
            </p>

            <Link
              href="/supplies/new"
              className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-3 font-semibold text-white"
            >
              Добавить поставку
            </Link>
          </div>
        )}

        {/* Список поставок */}
        {!loading && !error && supplies.length > 0 && (
          <div className="space-y-4">
            {supplies.map((supply) => (
              <div
                key={supply.id}
                className="rounded-2xl bg-white p-5 shadow-sm"
              >
                {/* Верхняя часть */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Поставка №{supply.id}
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      {new Date(
                        supply.date
                      ).toLocaleString("ru-RU")}
                    </p>
                  </div>

                  <div className="whitespace-nowrap text-lg font-bold text-green-700">
                    {Number(supply.total).toLocaleString(
                      "ru-RU"
                    )}{" "}
                    ₽
                  </div>
                </div>

                {/* Поставщик */}
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-gray-600">
                    Поставщик
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {supply.Supplier?.name ||
                      "Поставщик не указан"}
                  </p>

                  {supply.Supplier?.phone && (
                    <p className="mt-1 text-sm text-gray-500">
                      {supply.Supplier.phone}
                    </p>
                  )}
                </div>

                {/* Товары */}
                <div className="mt-4 border-t pt-4">
                  <p className="mb-3 text-sm font-semibold text-gray-600">
                    Товары
                  </p>

                  <div className="space-y-3">
                    {supply.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {item.product?.name ||
                              "Товар"}
                          </p>

                          <p className="text-sm text-gray-500">
                            {item.quantity}{" "}
                            {item.product?.unit || "шт."}
                          </p>
                        </div>

                        <div className="whitespace-nowrap text-right">
                          <p className="font-semibold text-gray-900">
                            {Number(
                              item.cost
                            ).toLocaleString("ru-RU")}{" "}
                            ₽
                          </p>

                          <p className="text-xs text-gray-500">
                            за единицу
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Итог */}
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <span className="font-semibold text-gray-600">
                    Итого
                  </span>

                  <span className="text-xl font-bold text-green-700">
                    {Number(
                      supply.total
                    ).toLocaleString("ru-RU")}{" "}
                    ₽
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}