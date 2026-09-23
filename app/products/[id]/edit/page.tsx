"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ProductData = {
  name: string;
  barcode: string | null;
  unit: string;
  price: number;
  cost: number;
};

type ApiError = {
  error?: string;
};

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id;

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("шт");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    async function loadProduct() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/products/${id}/details`);
        const data: ProductData | ApiError = await res.json();

        if (!res.ok) {
          const errorData = data as ApiError;
          setError(
            errorData.error || "Не удалось загрузить товар"
          );
          return;
        }

        const product = data as ProductData;

        setName(product.name || "");
        setBarcode(product.barcode || "");
        setUnit(product.unit || "шт");
        setPrice(String(product.price ?? ""));
        setCost(String(product.cost ?? ""));
      } catch (error) {
        console.error("EDIT PRODUCT LOAD ERROR:", error);
        setError("Ошибка соединения с сервером");
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [id]);

  async function saveProduct() {
    if (saving) return;

    setError("");

    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();

    if (!trimmedName) {
      setError("Введите название товара");
      return;
    }

    if (!trimmedUnit) {
      setError("Введите единицу измерения");
      return;
    }

    const numericPrice = Number(price);
    const numericCost = Number(cost);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Введите корректную цену продажи");
      return;
    }

    if (!Number.isFinite(numericCost) || numericCost < 0) {
      setError("Введите корректную себестоимость");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          barcode: barcode.trim(),
          unit: trimmedUnit,
          price: numericPrice,
          cost: numericCost,
        }),
      });

      const data: ApiError = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          data.error || "Не удалось сохранить товар"
        );
        return;
      }

      router.push(`/products/${id}`);
    } catch (error) {
      console.error("EDIT PRODUCT SAVE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (saving) return;
    router.push(`/products/${id}`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-3">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <div>Загрузка товара...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow">
        <h1 className="mb-4 text-2xl font-bold text-green-700">
          ✏️ Изменить товар
        </h1>

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <div className="font-bold">❌ Ошибка</div>
            <div className="mt-1">{error}</div>
          </div>
        )}

        <div className="space-y-3">
          {/* Название */}
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Название товара
            </label>

            <input
              className="w-full rounded-xl border p-2.5"
              placeholder="Например: Молоко"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Штрихкод */}
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Штрихкод
            </label>

            <input
              inputMode="numeric"
              className="w-full rounded-xl border p-2.5"
              placeholder="Введите штрихкод"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Единица */}
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Единица измерения
            </label>

            <input
              className="w-full rounded-xl border p-2.5"
              placeholder="шт, кг, л"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Цена */}
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Цена продажи, ₽
            </label>

            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="w-full rounded-xl border p-2.5"
              placeholder="Цена продажи"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Себестоимость */}
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">
              Себестоимость, ₽
            </label>

            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="w-full rounded-xl border p-2.5"
              placeholder="Себестоимость"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        {/* Кнопки */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={saveProduct}
            disabled={saving}
            className="w-full rounded-xl bg-green-700 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "⏳ Сохраняю..." : "💾 Сохранить"}
          </button>

          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="w-full rounded-xl bg-gray-200 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            ↩️ Отмена
          </button>
        </div>
      </div>
    </main>
  );
}
