"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    const res = await fetch("/api/suppliers");
    const data = await res.json();
    setSuppliers(data);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🚚 Поставщики
        </h1>

        {suppliers.length === 0 ? (
          <div className="rounded-xl bg-white p-5 text-center shadow">
            Пока нет поставщиков
          </div>
        ) : (
          <div className="space-y-4">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="rounded-2xl bg-white p-5 shadow"
              >
                <h2 className="text-lg font-bold">
                  {supplier.name}
                </h2>

                <p className="mt-2 text-gray-600">
                  📞 {supplier.phone || "—"}
                </p>

                <p className="text-gray-600">
                  📍 {supplier.address || "—"}
                </p>
              </div>
            ))}
          </div>
        )}

        <Link href="/suppliers/new">
          <button className="mt-6 w-full rounded-xl bg-green-700 py-3 text-lg font-semibold text-white hover:bg-green-800">
            ➕ Новый поставщик
          </button>
        </Link>

      </div>
    </main>
  );
}