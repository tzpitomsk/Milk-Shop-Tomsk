"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Product = {
  id: number;
  name: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  barcode?: string | null;
};

type ApiError = {
  error?: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/products", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Не удалось загрузить товары");
        return;
      }

      if (!Array.isArray(data)) {
        setError("Сервер вернул некорректный список товаров");
        return;
      }

      setProducts(data);
    } catch (err) {
      console.error("Ошибка загрузки товаров:", err);
      setError("Не удалось загрузить товары");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProduct(id: number) {
    const product = products.find((item) => item.id === id);

    const ok = confirm(
      `Удалить товар "${product?.name ?? `#${id}`}?"\n\n` +
        "Товар можно удалить только если у него нет складской или торговой истории."
    );

    if (!ok) return;

    try {
      setDeletingId(id);
      setError("");

      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
      });

      const data: ApiError & {
        success?: boolean;
        productId?: number;
      } = await res.json();

      if (!res.ok) {
        setError(
          data?.error ||
            "Товар не удалось удалить. Возможно, у него есть история учета."
        );
        return;
      }

      if (!data?.success) {
        setError("Сервер не подтвердил удаление товара");
        return;
      }

      setProducts((current) =>
        current.filter((item) => item.id !== id)
      );
    } catch (err) {
      console.error("Ошибка удаления товара:", err);
      setError("Не удалось удалить товар");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🥛 Товары
        </h1>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <div className="font-bold">⚠️ Ошибка</div>

            <div className="mt-1">{error}</div>

            <button
              type="button"
              onClick={() => setError("")}
              className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Закрыть
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow">
            Загрузка товаров...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow">
            Товаров пока нет.
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((product) => {
              const isDeleting = deletingId === product.id;

              return (
                <div
                  key={product.id}
                  className="rounded-2xl bg-white p-5 shadow"
                >
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold">
                        {product.name}
                      </h2>

                      <p className="text-gray-500">
                        Цена: {product.price} ₽
                      </p>

                      <p className="text-gray-500">
                        Себестоимость: {product.cost} ₽
                      </p>

                      <p className="font-bold text-green-700">
                        🟢 Остаток: {product.stock} {product.unit}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      <Link
                        href={`/products/${product.id}`}
                        className="
                          rounded-lg
                          bg-blue-600
                          px-3
                          py-2
                          text-center
                          text-white
                        "
                      >
                        ✏️
                      </Link>

                      <Link
                        href={`/products/${product.id}/history`}
                        className="
                          rounded-lg
                          bg-purple-600
                          px-3
                          py-2
                          text-center
                          text-white
                        "
                      >
                        📜
                      </Link>

                      <Link
                        href={`/orders/new?product=${product.id}`}
                        className="
                          rounded-lg
                          bg-green-700
                          px-3
                          py-2
                          text-center
                          text-white
                        "
                      >
                        🛒
                      </Link>

                      <button
                        type="button"
                        onClick={() => deleteProduct(product.id)}
                        disabled={isDeleting}
                        className="
                          rounded-lg
                          bg-red-600
                          px-3
                          py-2
                          text-white
                          disabled:cursor-not-allowed
                          disabled:opacity-50
                        "
                      >
                        {isDeleting ? "..." : "🗑"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Link
          href="/products/new"
          className="
            mt-5
            block
            rounded-xl
            bg-green-700
            py-3
            text-center
            font-bold
            text-white
          "
        >
          ➕ Новый товар
        </Link>
      </div>
    </main>
  );
}