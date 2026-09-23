"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/suppliers");
      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error || "Не удалось загрузить поставщиков"
        );
        return;
      }

      if (!Array.isArray(data)) {
        setError("Сервер вернул некорректные данные");
        return;
      }

      setSuppliers(data);
    } catch (error) {
      console.error("SUPPLIERS PAGE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🚚 Поставщики
        </h1>

        {loading && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            Загрузка поставщиков...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-white p-5 text-center shadow">
            <div className="mb-2 text-3xl">❌</div>

            <div className="font-bold">
              Ошибка
            </div>

            <p className="mt-2 text-sm text-gray-600">
              {error}
            </p>

            <button
              type="button"
              onClick={loadSuppliers}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-bold text-white"
            >
              🔄 Повторить
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          suppliers.length === 0 && (
            <div className="rounded-2xl bg-white p-5 text-center shadow">
              Пока нет поставщиков
            </div>
          )}

        {!loading &&
          !error &&
          suppliers.length > 0 && (
            <div className="space-y-3">
              {suppliers.map((supplier) => (
                <Link
                  key={supplier.id}
                  href={`/suppliers/${supplier.id}/edit`}
                  className="
                    block
                    rounded-2xl
                    bg-white
                    p-5
                    shadow
                    transition
                    active:scale-[0.99]
                  "
                >
                  <h2 className="text-lg font-bold text-gray-900">
                    🚚 {supplier.name}
                  </h2>

                  <p className="mt-2 text-gray-600">
                    📞 {supplier.phone || "—"}
                  </p>

                  <p className="text-gray-600">
                    📍 {supplier.address || "—"}
                  </p>

                  <div className="mt-3 text-sm font-semibold text-green-700">
                    ✏️ Нажмите для изменения
                  </div>
                </Link>
              ))}
            </div>
          )}

        <Link
          href="/suppliers/new"
          className="
            mt-5
            block
            w-full
            rounded-xl
            bg-green-700
            py-3
            text-center
            text-lg
            font-semibold
            text-white
            transition
            active:scale-[0.99]
          "
        >
          ➕ Новый поставщик
        </Link>
      </div>
    </main>
  );
}