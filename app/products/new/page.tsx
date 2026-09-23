"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProductPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("шт");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    const trimmedName = name.trim();
    const trimmedBarcode = barcode.trim();
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

    if (
      !Number.isInteger(numericPrice) ||
      numericPrice < 0
    ) {
      setError("Введите корректную цену");
      return;
    }

    if (
      !Number.isInteger(numericCost) ||
      numericCost < 0
    ) {
      setError("Введите корректную себестоимость");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          barcode: trimmedBarcode || null,
          unit: trimmedUnit,
          price: numericPrice,
          cost: numericCost,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Ошибка создания товара"
        );
      }

      router.push("/products");
      router.refresh();
    } catch (error) {
      console.error("CREATE PRODUCT ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Ошибка создания товара"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow">
        <h1 className="mb-4 text-2xl font-bold text-green-700">
          ➕ Новый товар
        </h1>

        <p className="mb-4 text-sm text-gray-500">
          Начальный остаток нового товара всегда равен 0.
          Остаток формируется через партии поставок.
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <div className="font-bold">❌ Ошибка</div>
            <div className="mt-1">{error}</div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          {/* Название */}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-bold text-gray-700"
            >
              Название товара
            </label>

            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Например: Молоко 1,5 л"
              disabled={loading}
              className="w-full rounded-xl border p-2.5"
            />
          </div>

          {/* Штрихкод */}
          <div>
            <label
              htmlFor="barcode"
              className="mb-1 block text-sm font-bold text-gray-700"
            >
              Штрихкод
            </label>

            <input
              id="barcode"
              type="text"
              inputMode="numeric"
              value={barcode}
              onChange={(event) =>
                setBarcode(event.target.value)
              }
              placeholder="Необязательно"
              disabled={loading}
              className="w-full rounded-xl border p-2.5"
            />
          </div>

          {/* Единица измерения */}
          <div>
            <label
              htmlFor="unit"
              className="mb-1 block text-sm font-bold text-gray-700"
            >
              Единица измерения
            </label>

            <input
              id="unit"
              type="text"
              value={unit}
              onChange={(event) =>
                setUnit(event.target.value)
              }
              placeholder="шт"
              disabled={loading}
              className="w-full rounded-xl border p-2.5"
            />
          </div>

          {/* Цена */}
          <div>
            <label
              htmlFor="price"
              className="mb-1 block text-sm font-bold text-gray-700"
            >
              Цена продажи, ₽
            </label>

            <input
              id="price"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={price}
              onChange={(event) =>
                setPrice(event.target.value)
              }
              placeholder="0"
              disabled={loading}
              className="w-full rounded-xl border p-2.5"
            />
          </div>

          {/* Себестоимость */}
          <div>
            <label
              htmlFor="cost"
              className="mb-1 block text-sm font-bold text-gray-700"
            >
              Себестоимость, ₽
            </label>

            <input
              id="cost"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={cost}
              onChange={(event) =>
                setCost(event.target.value)
              }
              placeholder="0"
              disabled={loading}
              className="w-full rounded-xl border p-2.5"
            />
          </div>

          {/* Начальный остаток */}
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-sm font-bold text-gray-700">
              📦 Начальный остаток
            </div>

            <div className="mt-1 text-xl font-bold">
              0
            </div>

            <p className="mt-1 text-xs text-gray-500">
              Остаток нельзя вводить вручную. Для добавления
              товара на склад создайте поставку.
            </p>
          </div>

          {/* Кнопки */}
          <div className="mt-4 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-green-700 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "⏳ Создание..."
                : "💾 Создать товар"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => router.push("/products")}
              className="w-full rounded-xl bg-gray-200 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-60"
            >
              ↩️ Отмена
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
