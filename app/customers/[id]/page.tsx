"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

type ApiError = {
  error?: string;
};

export default function CustomerPage() {
  const params = useParams();
  const id = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    loadCustomer();
  }, [id]);

  async function loadCustomer() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/customers/${id}`);
      const data: Customer | ApiError = await res.json();

      if (!res.ok) {
        const errorData = data as ApiError;

        setError(
          errorData.error || "Не удалось загрузить клиента"
        );

        return;
      }

      setCustomer(data as Customer);
    } catch (error) {
      console.error("CUSTOMER PAGE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
          Загрузка клиента...
        </div>
      </main>
    );
  }

  if (error || !customer) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <div className="mb-3 text-4xl">❌</div>

          <div className="font-bold">
            Клиент не найден
          </div>

          <p className="mt-2 text-sm text-gray-600">
            {error || "Не удалось загрузить данные клиента"}
          </p>

          <Link
            href="/customers"
            className="mt-4 block w-full rounded-xl bg-gray-200 py-3 font-bold"
          >
            ← К клиентам
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-5 text-3xl font-bold text-green-700">
          👤 Клиент
        </h1>

        <div className="rounded-2xl bg-white p-5 shadow">
          <h2 className="text-2xl font-bold text-gray-900">
            {customer.name}
          </h2>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-gray-500">
                ТЕЛЕФОН
              </div>

              <div className="mt-1 text-lg font-semibold">
                📞 {customer.phone || "Не указан"}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-gray-500">
                АДРЕС
              </div>

              <div className="mt-1 text-lg font-semibold">
                📍 {customer.address || "Не указан"}
              </div>
            </div>
          </div>
        </div>

        <Link
          href={`/customers/${customer.id}/edit`}
          className="
            mt-4
            block
            w-full
            rounded-xl
            bg-green-700
            py-3
            text-center
            font-bold
            text-white
            transition
            active:scale-[0.99]
          "
        >
          ✏️ Изменить клиента
        </Link>

        <Link
          href="/customers"
          className="
            mt-2
            block
            w-full
            rounded-xl
            bg-gray-200
            py-3
            text-center
            font-bold
            text-gray-800
          "
        >
          ← К клиентам
        </Link>
      </div>
    </main>
  );
}