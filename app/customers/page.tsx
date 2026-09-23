"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/customers");
      const data = await res.json();

      if (!res.ok) {
        setError(
          data.error || "Не удалось загрузить клиентов"
        );
        return;
      }

      if (!Array.isArray(data)) {
        setError("Сервер вернул некорректные данные");
        return;
      }

      setCustomers(data);
    } catch (error) {
      console.error("CUSTOMERS PAGE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return customers;
    }

    return customers.filter((customer) => {
      const name = customer.name?.toLowerCase() || "";
      const phone = customer.phone?.toLowerCase() || "";
      const address = customer.address?.toLowerCase() || "";

      return (
        name.includes(query) ||
        phone.includes(query) ||
        address.includes(query)
      );
    });
  }, [search, customers]);

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-3 text-3xl font-bold text-green-700">
          👥 Клиенты
        </h1>

        <div className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-gray-500">
            Всего клиентов
          </div>

          <div className="mt-1 text-2xl font-bold text-gray-900">
            {customers.length}
          </div>
        </div>

        <input
          type="text"
          placeholder="🔍 Поиск клиента..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 w-full rounded-xl border bg-white p-3 shadow-sm outline-none focus:ring-2 focus:ring-green-600"
        />

        <Link
          href="/customers/new"
          className="
            mb-5
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
          ➕ Новый клиент
        </Link>

        {loading && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            Загрузка клиентов...
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
              onClick={loadCustomers}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-bold text-white"
            >
              🔄 Повторить
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          customers.length === 0 && (
            <div className="rounded-2xl bg-white p-5 text-center shadow">
              Пока нет клиентов
            </div>
          )}

        {!loading &&
          !error &&
          customers.length > 0 &&
          filteredCustomers.length === 0 && (
            <div className="rounded-2xl bg-white p-5 text-center shadow">
              Клиенты не найдены
            </div>
          )}

        {!loading &&
          !error &&
          filteredCustomers.length > 0 && (
            <div className="space-y-3">
              {filteredCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}/edit`}
                  className="
                    block
                    rounded-2xl
                    bg-white
                    p-5
                    shadow-sm
                    transition
                    active:scale-[0.99]
                  "
                >
                  <h2 className="text-lg font-bold text-gray-900">
                    👤 {customer.name}
                  </h2>

                  <p className="mt-2 text-gray-600">
                    📞 {customer.phone || "—"}
                  </p>

                  <p className="text-gray-600">
                    📍 {customer.address || "—"}
                  </p>
                </Link>
              ))}
            </div>
          )}
      </div>
    </main>
  );
}