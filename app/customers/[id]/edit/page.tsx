"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

type ApiError = {
  error?: string;
};

export default function EditCustomerPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

      const customer = data as Customer;

      setName(customer.name || "");
      setPhone(customer.phone || "");
      setAddress(customer.address || "");
    } catch (error) {
      console.error("EDIT CUSTOMER LOAD ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  async function saveCustomer() {
    if (saving) return;

    setError("");

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();

    if (!trimmedName) {
      setError("Введите имя клиента");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
          address: trimmedAddress,
        }),
      });

      const data: ApiError =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          data.error || "Не удалось сохранить клиента"
        );
        return;
      }

      router.push("/customers");
    } catch (error) {
      console.error("EDIT CUSTOMER SAVE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (saving) return;

    router.push("/customers");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-3">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
          Загрузка клиента...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow">
        <h1 className="mb-4 text-2xl font-bold text-green-700">
          ✏️ Изменить клиента
        </h1>

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <div className="font-bold">
              ❌ Ошибка
            </div>

            <div className="mt-1">
              {error}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Имя клиента
            </label>

            <input
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              disabled={saving}
              className="w-full rounded-xl border p-2.5"
              placeholder="Имя клиента"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Телефон
            </label>

            <input
              type="text"
              inputMode="tel"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value)
              }
              disabled={saving}
              className="w-full rounded-xl border p-2.5"
              placeholder="Телефон"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Адрес
            </label>

            <input
              type="text"
              value={address}
              onChange={(event) =>
                setAddress(event.target.value)
              }
              disabled={saving}
              className="w-full rounded-xl border p-2.5"
              placeholder="Адрес"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={saveCustomer}
            disabled={saving}
            className="
              w-full
              rounded-xl
              bg-green-700
              py-2.5
              font-bold
              text-white
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            {saving ? "⏳ Сохраняю..." : "💾 Сохранить"}
          </button>

          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="
              w-full
              rounded-xl
              bg-gray-200
              py-2.5
              font-bold
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            ↩️ Отмена
          </button>
        </div>
      </div>
    </main>
  );
}