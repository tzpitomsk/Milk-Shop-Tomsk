"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
};

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const res = await fetch("/api/products");

      if (!res.ok) {
        throw new Error("Не удалось загрузить товары");
      }

      const data = await res.json();
      setProducts(data);
    } catch (error) {
      console.error("STOCK LOAD ERROR:", error);
    }
  }

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) =>
      product.name.toLowerCase().includes(query)
    );
  }, [products, search]);

  function stockColor(stock: number) {
    if (stock <= 5) return "text-red-600";
    if (stock <= 20) return "text-yellow-600";
    return "text-green-700";
  }

  function stockLabel(stock: number) {
    if (stock <= 0) return "❌ Нет на складе";
    if (stock <= 5) return "🔴 Критически мало";
    if (stock <= 20) return "🟡 Заканчивается";
    return "🟢 В наличии";
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-5 text-3xl font-bold text-green-700">
          📦 Склад
        </h1>

        <input
          type="text"
          placeholder="🔍 Поиск товара..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-green-600"
        />

        <div className="mb-3 text-sm text-gray-500">
          Товаров:{" "}
          <strong className="text-gray-700">
            {filteredProducts.length}
          </strong>
        </div>

        <div className="space-y-2.5">
          {filteredProducts.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="block rounded-xl bg-white px-3 py-3 shadow-sm transition active:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold text-gray-900">
                    {product.name}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    Цена {product.price} ₽ · Себ. {product.cost} ₽
                  </div>
                </div>

                <div
                  className={`shrink-0 text-right text-lg font-bold ${stockColor(
                    product.stock
                  )}`}
                >
                  {product.stock} {product.unit}
                </div>
              </div>

              <div
                className={`mt-1 text-sm font-medium ${stockColor(
                  product.stock
                )}`}
              >
                {stockLabel(product.stock)}
              </div>
            </Link>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="rounded-xl bg-white p-5 text-center text-gray-500 shadow-sm">
            Товары не найдены
          </div>
        )}
      </div>
    </main>
  );
}