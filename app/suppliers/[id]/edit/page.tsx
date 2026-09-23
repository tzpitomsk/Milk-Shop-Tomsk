"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

type ApiError = {
  error?: string;
};

export default function EditSupplierPage() {
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

    loadSupplier();
  }, [id]);

  async function loadSupplier() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/suppliers/${id}`);

      const data: Supplier | ApiError = await res.json();

      if (!res.ok) {
        const errorData = data as ApiError;

        setError(
          errorData.error || "Не удалось загрузить поставщика"
        );

        return;
      }

      const supplier = data as Supplier;

      setName(supplier.name || "");
      setPhone(supplier.phone || "");
      setAddress(supplier.address || "");
    } catch (error) {
      console.error("EDIT SUPPLIER LOAD ERROR:", error);

      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  async function saveSupplier() {
    if (saving) return;

    setError("");

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();

    if (!trimmedName) {
      setError("Введите название поставщика");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`/api/suppliers/${id}`, {
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

      const data: ApiError = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          data.error || "Не удалось сохранить поставщика"
        );

        return;
      }

      router.push("/suppliers");
      router.refresh();
    } catch (error) {
      console.error("EDIT SUPPLIER SAVE ERROR:", error);

      setError("Ошибка соединения с сервером");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (saving) return;

    router.push("/suppliers");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-3">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
          Загрузка поставщика...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow">
        <h1 className="mb-4 text-2xl font-bold text-green-700">
          ✏️ Изменить поставщика
        </h1>

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <div className="font-bold">❌ Ошибка</div>

            <div className="mt-1">{error}</div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Название поставщика
            </label>

            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
              className="w-full rounded-xl border p-2.5"
              placeholder="Например: Ферма Молочная"
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
              onChange={(event) => setPhone(event.target.value)}
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
            onClick={saveSupplier}
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