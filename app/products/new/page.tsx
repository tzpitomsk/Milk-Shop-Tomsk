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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedBarcode = barcode.trim();
    const trimmedUnit = unit.trim();

    if (!trimmedName) {
      alert("Введите название товара");
      return;
    }

    if (!trimmedUnit) {
      alert("Введите единицу измерения");
      return;
    }

    const numericPrice = Number(price);
    const numericCost = Number(cost);

    if (
      !Number.isInteger(numericPrice) ||
      numericPrice < 0
    ) {
      alert("Введите корректную цену");
      return;
    }

    if (
      !Number.isInteger(numericCost) ||
      numericCost < 0
    ) {
      alert("Введите корректную себестоимость");
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

      alert("Товар успешно создан");

      router.push("/products");
      router.refresh();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Ошибка создания товара"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Новый товар
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Остаток нового товара начинается с 0 и формируется
          только через партии поставок.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        {/* Название */}

        <div className="space-y-2">
          <label
            htmlFor="name"
            className="text-sm font-medium"
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
            placeholder="Например, Молоко 1,5 л"
            disabled={loading}
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        {/* Штрихкод */}

        <div className="space-y-2">
          <label
            htmlFor="barcode"
            className="text-sm font-medium"
          >
            Штрихкод
          </label>

          <input
            id="barcode"
            type="text"
            value={barcode}
            onChange={(event) =>
              setBarcode(event.target.value)
            }
            placeholder="Необязательно"
            disabled={loading}
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        {/* Единица */}

        <div className="space-y-2">
          <label
            htmlFor="unit"
            className="text-sm font-medium"
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
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        {/* Цена */}

        <div className="space-y-2">
          <label
            htmlFor="price"
            className="text-sm font-medium"
          >
            Цена продажи
          </label>

          <input
            id="price"
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={(event) =>
              setPrice(event.target.value)
            }
            placeholder="0"
            disabled={loading}
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        {/* Себестоимость */}

        <div className="space-y-2">
          <label
            htmlFor="cost"
            className="text-sm font-medium"
          >
            Себестоимость
          </label>

          <input
            id="cost"
            type="number"
            min="0"
            step="1"
            value={cost}
            onChange={(event) =>
              setCost(event.target.value)
            }
            placeholder="0"
            disabled={loading}
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </div>

        {/* Информация об остатке */}

        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="text-sm font-medium">
            Начальный остаток
          </div>

          <div className="mt-1 text-2xl font-bold">
            0
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            Остаток нельзя вводить вручную. Для добавления
            товара на склад создайте поставку — она создаст
            партию и автоматически увеличит остаток.
          </p>
        </div>

        {/* Кнопки */}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Создание..."
              : "Создать товар"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => router.push("/products")}
            className="rounded-lg border px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </form>
    </main>
  );
}