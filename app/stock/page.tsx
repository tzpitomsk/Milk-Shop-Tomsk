"use client";

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
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      product.name.toLowerCase().includes(search.toLowerCase())
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

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          📦 Склад
        </h1>

        <input
          type="text"
          placeholder="🔍 Поиск товара..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-xl border bg-white p-3"
        />

        <div className="mb-4 text-sm text-gray-500">
          Товаров: <strong>{filteredProducts.length}</strong>
        </div>

        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-xl bg-white p-4 shadow"
            >
              <div className="flex justify-between items-start">

                <div>

                  <div className="text-lg font-bold">
                    {product.name}
                  </div>

                  <div className="text-gray-500">
                    Цена: {product.price} ₽
                  </div>

                  <div className="text-gray-500">
                    Себестоимость: {product.cost} ₽
                  </div>

                  <div className={`mt-2 font-bold ${stockColor(product.stock)}`}>
                    {product.stock} {product.unit}
                  </div>

                  <div className={`text-sm ${stockColor(product.stock)}`}>
                    {stockLabel(product.stock)}
                  </div>

                </div>

              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}