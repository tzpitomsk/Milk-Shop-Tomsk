"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopProducts from "@/components/dashboard/TopProducts";

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

type Filter = "ALL" | "IN_STOCK" | "LOW" | "EMPTY";

type TopProduct = {
  name: string;
  quantity: number;
};

type DashboardResponse = {
  topProducts?: TopProduct[];
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    loadProducts();
    loadTopProducts();
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

  async function loadTopProducts() {
    try {
      const res = await fetch("/api/dashboard", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(
          "Не удалось загрузить популярные товары:",
          res.status
        );
        return;
      }

      const data: DashboardResponse = await res.json();

      if (Array.isArray(data.topProducts)) {
        setTopProducts(data.topProducts);
      }
    } catch (err) {
      console.error("Ошибка загрузки популярных товаров:", err);
    }
  }

  async function deleteProduct(id: number) {
    const product = products.find((item) => item.id === id);

    const ok = confirm(
      `Удалить товар "${product?.name ?? `#${id}`}"?\n\n` +
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

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        String(product.barcode ?? "")
          .toLowerCase()
          .includes(query);

      if (!matchesSearch) {
        return false;
      }

      switch (filter) {
        case "IN_STOCK":
          return product.stock > 0;

        case "LOW":
          return product.stock > 0 && product.stock <= 2;

        case "EMPTY":
          return product.stock <= 0;

        case "ALL":
        default:
          return true;
      }
    });
  }, [products, search, filter]);

  const totalProducts = products.length;

  const inStockProducts = products.filter(
    (product) => product.stock > 0
  ).length;

  const lowStockProducts = products.filter(
    (product) =>
      product.stock > 0 && product.stock <= 2
  ).length;

  const emptyProducts = products.filter(
    (product) => product.stock <= 0
  ).length;

  function getStockLabel(stock: number) {
    if (stock <= 0) {
      return "Нет в наличии";
    }

    if (stock <= 2) {
      return "Заканчивается";
    }

    return "В наличии";
  }

  function getStockClasses(stock: number) {
    if (stock <= 0) {
      return {
        box: "border-red-200 bg-red-50",
        number: "text-red-700",
        label: "text-red-700",
      };
    }

    if (stock <= 2) {
      return {
        box: "border-orange-200 bg-orange-50",
        number: "text-orange-700",
        label: "text-orange-700",
      };
    }

    return {
      box: "border-green-200 bg-green-50",
      number: "text-green-700",
      label: "text-green-700",
    };
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 pb-24 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-3xl">
        {/* HEADER */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-green-700">
            🥛 Товары
          </h1>

          <Link
            href="/products/new"
            className="shrink-0 rounded-xl bg-green-700 px-3.5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-800 active:scale-[0.98]"
          >
            ＋ Новый товар
          </Link>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-bold">⚠️ Ошибка</div>

            <div className="mt-1">
              {error}
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* SUMMARY */}
        {!loading && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className={`rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition ${
                filter === "ALL"
                  ? "border-slate-400 bg-white ring-2 ring-slate-200"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-xs text-slate-500">
                Всего
              </div>

              <div className="mt-0.5 text-xl font-bold text-slate-900">
                {totalProducts}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFilter("IN_STOCK")}
              className={`rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition ${
                filter === "IN_STOCK"
                  ? "border-green-400 bg-green-50 ring-2 ring-green-100"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-xs text-slate-500">
                В наличии
              </div>

              <div className="mt-0.5 text-xl font-bold text-green-700">
                {inStockProducts}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFilter("LOW")}
              className={`rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition ${
                filter === "LOW"
                  ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-xs text-slate-500">
                Заканчиваются
              </div>

              <div className="mt-0.5 text-xl font-bold text-orange-700">
                {lowStockProducts}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFilter("EMPTY")}
              className={`rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition ${
                filter === "EMPTY"
                  ? "border-red-400 bg-red-50 ring-2 ring-red-100"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-xs text-slate-500">
                Нет
              </div>

              <div className="mt-0.5 text-xl font-bold text-red-700">
                {emptyProducts}
              </div>
            </button>
          </div>
        )}

        {/* SEARCH */}
        <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
          <label
            htmlFor="product-search"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            🔎 Найти товар
          </label>

          <input
            id="product-search"
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Название или штрихкод"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100"
          />

          {(search || filter !== "ALL") && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                Найдено:{" "}
                <b className="text-slate-800">
                  {filteredProducts.length}
                </b>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("ALL");
                }}
                className="text-sm font-semibold text-green-700 hover:text-green-800"
              >
                Сбросить
              </button>
            </div>
          )}
        </div>

        {/* POPULAR PRODUCTS */}
        <div className="mb-3">
          <TopProducts data={topProducts} />
        </div>

        {/* PRODUCTS */}
        {loading ? (
          <div className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
            Загрузка товаров...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="text-xl font-bold text-slate-800">
              Товаров пока нет
            </div>

            <div className="mt-2 text-sm text-slate-500">
              Добавьте первый товар, чтобы начать
              работу.
            </div>

            <Link
              href="/products/new"
              className="mt-5 inline-block rounded-xl bg-green-700 px-5 py-3 font-bold text-white transition hover:bg-green-800"
            >
              ➕ Новый товар
            </Link>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="text-xl font-bold text-slate-800">
              Ничего не найдено
            </div>

            <div className="mt-2 text-sm text-slate-500">
              Измените поиск или фильтр.
            </div>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("ALL");
              }}
              className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
            >
              Показать все товары
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              const isDeleting =
                deletingId === product.id;

              const stockClasses =
                getStockClasses(product.stock);

              const canSell = product.stock > 0;

              return (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm"
                >
                  {/* PRODUCT MAIN */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-900">
                          {product.name}
                        </h2>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                          <span>
                            Цена:{" "}
                            <b className="text-slate-700">
                              {product.price} ₽
                            </b>
                          </span>

                          <span>
                            Себестоимость:{" "}
                            <b className="text-slate-700">
                              {product.cost} ₽
                            </b>
                          </span>
                        </div>

                        {product.barcode && (
                          <div className="mt-1 text-xs text-slate-400">
                            Штрихкод:{" "}
                            {product.barcode}
                          </div>
                        )}
                      </div>

                      {/* STOCK */}
                      <div
                        className={`shrink-0 rounded-xl border px-3 py-2 text-center ${stockClasses.box}`}
                      >
                        <div
                          className={`text-xl font-bold ${stockClasses.number}`}
                        >
                          {product.stock}
                        </div>

                        <div className="text-xs text-slate-500">
                          {product.unit}
                        </div>

                        <div
                          className={`mt-0.5 text-[11px] font-bold ${stockClasses.label}`}
                        >
                          {getStockLabel(product.stock)}
                        </div>
                      </div>
                    </div>

                    {/* QUICK ACTIONS */}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Link
                        href={`/products/${product.id}`}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-center text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        ✏️ Изменить
                      </Link>

                      <Link
                        href={`/products/${product.id}/history`}
                        className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-center text-sm font-semibold text-purple-700 transition hover:bg-purple-100"
                      >
                        📜 История
                      </Link>

                      <Link
                        href={`/supplies/new?product=${product.id}`}
                        className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-center text-sm font-semibold text-green-700 transition hover:bg-green-100"
                      >
                        🚚 Поставка
                      </Link>

                      {canSell ? (
                        <Link
                          href={`/orders/new?product=${product.id}`}
                          className="rounded-xl border border-green-700 bg-green-700 px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-green-800"
                        >
                          🛒 Продать
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Нет товара на складе"
                          aria-label={`Продажа товара ${product.name} недоступна: нет товара на складе`}
                          className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-center text-sm font-semibold text-slate-400"
                        >
                          🛒 Продать
                        </button>
                      )}
                    </div>

                    {/* DELETE */}
                    <button
                      type="button"
                      onClick={() =>
                        deleteProduct(product.id)
                      }
                      disabled={isDeleting}
                      className="mt-2.5 w-full rounded-xl border border-red-200 bg-white py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDeleting
                        ? "⏳ Удаление..."
                        : "🗑️ Удалить товар"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}