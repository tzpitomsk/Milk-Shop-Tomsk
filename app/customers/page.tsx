"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data));
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, customers]);

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          👥 Клиенты
        </h1>

        <input
          type="text"
          placeholder="🔍 Поиск клиента..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-5 w-full rounded-xl border bg-white p-3 shadow-sm outline-none focus:ring-2 focus:ring-green-600"
        />

        <div className="space-y-4">
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              className="rounded-2xl bg-white p-5 shadow-sm"
            >
              <h2 className="text-lg font-bold">
                {customer.name}
              </h2>

              <p className="mt-2 text-gray-600">
                📞 {customer.phone}
              </p>

              <p className="text-gray-600">
                📍 {customer.address}
              </p>
            </div>
          ))}
        </div>

        <Link href="/customers/new">
  <button
    className="mt-6 w-full rounded-xl bg-green-700 py-3 text-lg font-semibold text-white transition hover:bg-green-800"
  >
    ➕ Новый клиент
  </button>
</Link>

      </div>
    </main>
  );
}