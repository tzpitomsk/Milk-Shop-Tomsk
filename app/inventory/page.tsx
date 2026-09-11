"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  unit: string;
  stock: number;
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [factStock, setFactStock] = useState<Record<number, string>>({});

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();

    setProducts(data);

    const values: Record<number, string> = {};

    data.forEach((product: Product) => {
      values[product.id] = String(product.stock);
    });

    setFactStock(values);
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      product.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  async function saveInventory(product: Product) {
    const stock = Number(factStock[product.id]);

    if (Number.isNaN(stock) || stock < 0) {
      alert("Введите корректный остаток");
      return;
    }

    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: product.id,
        stock,
      }),
    });

    if (!response.ok) {
      alert("Ошибка сохранения");
      return;
    }

    alert("✅ Остаток обновлен");

    loadProducts();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          📋 Инвентаризация
        </h1>

        <input
          type="text"
          placeholder="🔍 Поиск товара..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-5 w-full rounded-xl border bg-white p-3"
        />

        <div className="space-y-4">

          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-xl bg-white p-4 shadow"
            >
              <div className="text-lg font-bold">
                {product.name}
              </div>

              <div className="mt-2 text-gray-500">
                Остаток в системе:
              </div>

              <div className="mb-4 text-2xl font-bold text-green-700">
                {product.stock} {product.unit}
              </div>

              <label className="mb-2 block text-sm font-medium">
                Фактический остаток
              </label>

              <input
                type="number"
                min="0"
                value={factStock[product.id] ?? ""}
                onChange={(e) =>
                  setFactStock({
                    ...factStock,
                    [product.id]: e.target.value,
                  })
                }
                className="mb-4 w-full rounded-xl border p-3"
              />

              <button
                onClick={() => saveInventory(product)}
                className="w-full rounded-xl bg-green-700 py-3 font-semibold text-white hover:bg-green-800"
              >
                💾 Сохранить
              </button>
            </div>
          ))}

        </div>

      </div>
    </main>
  );
}