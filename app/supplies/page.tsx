"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SupplyItem = {
  id: number;
  quantity: number;
  cost: number;
  product?: {
    id: number;
    name: string;
    unit: string;
  };
};

type Supply = {
  id: number;
  date: string;
  total: number;
  Supplier?: {
    id: number;
    name: string;
    phone?: string | null;
    address?: string | null;
  } | null;
  items: SupplyItem[];
};

type DateFilter = "ALL" | "TODAY" | "WEEK";

type MonthGroup = {
  key: string;
  title: string;
  supplies: Supply[];
  total: number;
};

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] =
    useState<DateFilter>("ALL");

  const [openMonths, setOpenMonths] = useState<
    Record<string, boolean>
  >({});

  const [openSupplies, setOpenSupplies] = useState<
    Record<number, boolean>
  >({});

  useEffect(() => {
    async function loadSupplies() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/supplies", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error || "Ошибка загрузки поставок"
          );
        }

        if (!Array.isArray(data)) {
          throw new Error(
            "API вернул некорректные данные"
          );
        }

        setSupplies(data);
      } catch (error) {
        console.error(
          "SUPPLIES PAGE ERROR:",
          error
        );

        setError(
          error instanceof Error
            ? error.message
            : "Ошибка загрузки поставок"
        );
      } finally {
        setLoading(false);
      }
    }

    loadSupplies();
  }, []);

  const todayStart = useMemo(() => {
    const date = new Date();

    date.setHours(0, 0, 0, 0);

    return date;
  }, []);

  const weekStart = useMemo(() => {
    const date = new Date();

    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 6);

    return date;
  }, []);

  const filteredSupplies = useMemo(() => {
    const query = search.trim().toLowerCase();

    return supplies.filter((supply) => {
      const supplyDate = new Date(supply.date);

      const supplierName =
        supply.Supplier?.name?.toLowerCase() ?? "";

      const productNames = supply.items
        .map(
          (item) =>
            item.product?.name?.toLowerCase() ?? ""
        )
        .join(" ");

      const matchesSearch =
        query.length === 0 ||
        supplierName.includes(query) ||
        productNames.includes(query) ||
        String(supply.id).includes(query);

      if (!matchesSearch) {
        return false;
      }

      if (dateFilter === "TODAY") {
        return supplyDate >= todayStart;
      }

      if (dateFilter === "WEEK") {
        return supplyDate >= weekStart;
      }

      return true;
    });
  }, [
    supplies,
    search,
    dateFilter,
    todayStart,
    weekStart,
  ]);

  const totalSupplies = supplies.length;

  const todaySupplies = supplies.filter(
    (supply) =>
      new Date(supply.date) >= todayStart
  ).length;

  const weekSupplies = supplies.filter(
    (supply) =>
      new Date(supply.date) >= weekStart
  ).length;

  const totalAmount = supplies.reduce(
    (sum, supply) =>
      sum + Number(supply.total),
    0
  );

  const filteredAmount = filteredSupplies.reduce(
    (sum, supply) =>
      sum + Number(supply.total),
    0
  );

  function formatMoney(value: number) {
    return `${value.toLocaleString("ru-RU")} ₽`;
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    );
  }

  function formatShortDate(value: string) {
    return new Date(value).toLocaleDateString(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
      }
    );
  }

  function getItemCount(supply: Supply) {
    return supply.items.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    );
  }

  function getMonthKey(value: string) {
    const date = new Date(value);

    return `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
  }

  function getMonthTitle(value: string) {
    const date = new Date(value);

    return date.toLocaleDateString(
      "ru-RU",
      {
        month: "long",
        year: "numeric",
      }
    );
  }

  function toggleMonth(key: string) {
    setOpenMonths((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function toggleSupply(id: number) {
    setOpenSupplies((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  const monthGroups = useMemo(() => {
    const groups = new Map<string, MonthGroup>();

    for (const supply of filteredSupplies) {
      const key = getMonthKey(supply.date);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: getMonthTitle(supply.date),
          supplies: [],
          total: 0,
        });
      }

      const group = groups.get(key)!;

      group.supplies.push(supply);
      group.total += Number(supply.total);
    }

    return Array.from(groups.values()).sort(
      (a, b) =>
        b.key.localeCompare(a.key)
    );
  }, [filteredSupplies]);

  useEffect(() => {
    if (monthGroups.length === 0) {
      return;
    }

    const currentMonthKey = getMonthKey(
      new Date().toISOString()
    );

    setOpenMonths((current) => {
      const next = { ...current };

      if (
        next[currentMonthKey] === undefined
      ) {
        next[currentMonthKey] = true;
      }

      return next;
    });
  }, [monthGroups]);

  useEffect(() => {
    if (!search.trim() && dateFilter === "ALL") {
      return;
    }

    if (monthGroups.length === 0) {
      return;
    }

    setOpenMonths((current) => {
      const next = { ...current };

      for (const group of monthGroups) {
        next[group.key] = true;
      }

      return next;
    });
  }, [search, dateFilter, monthGroups]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-5 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-3xl">
        {/* HEADER */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-green-700">
              🚚 Поставки
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Приход товара и расходы на закупку
            </p>
          </div>

          <Link
            href="/supplies/new"
            className="shrink-0 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-800"
          >
            ➕ Новая
          </Link>
        </div>

        {/* ERROR */}
        {!loading && error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="font-bold text-red-700">
              ⚠️ Ошибка
            </div>

            <div className="mt-2 text-sm text-red-600">
              {error}
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* SUMMARY */}
        {!loading && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setDateFilter("ALL");
                setSearch("");
              }}
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                dateFilter === "ALL" &&
                search === ""
                  ? "border-slate-400 bg-white ring-2 ring-slate-200"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-sm text-slate-500">
                Всего
              </div>

              <div className="mt-1 text-2xl font-bold text-slate-900">
                {totalSupplies}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setDateFilter("TODAY")
              }
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                dateFilter === "TODAY"
                  ? "border-green-400 bg-green-50 ring-2 ring-green-100"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-sm text-slate-500">
                Сегодня
              </div>

              <div className="mt-1 text-2xl font-bold text-green-700">
                {todaySupplies}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setDateFilter("WEEK")
              }
              className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                dateFilter === "WEEK"
                  ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                  : "border-transparent bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-sm text-slate-500">
                7 дней
              </div>

              <div className="mt-1 text-2xl font-bold text-blue-700">
                {weekSupplies}
              </div>
            </button>

            <div className="rounded-2xl border border-transparent bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                Закуплено
              </div>

              <div className="mt-1 text-xl font-bold text-slate-900">
                {formatMoney(totalAmount)}
              </div>
            </div>
          </div>
        )}

        {/* SEARCH */}
        <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
          <label
            htmlFor="supply-search"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            🔎 Найти поставку
          </label>

          <input
            id="supply-search"
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Поставщик, товар или номер поставки"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100"
          />

          {(search ||
            dateFilter !== "ALL") && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                Найдено:{" "}
                <b className="text-slate-800">
                  {filteredSupplies.length}
                </b>

                {filteredSupplies.length >
                  0 && (
                  <>
                    {" · "}
                    {formatMoney(
                      filteredAmount
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDateFilter("ALL");
                }}
                className="text-sm font-semibold text-green-700 hover:text-green-800"
              >
                Сбросить
              </button>
            </div>
          )}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-slate-500">
              Загрузка поставок...
            </p>
          </div>
        )}

        {/* EMPTY */}
        {!loading &&
          !error &&
          supplies.length === 0 && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-800">
                Поставок пока нет
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Добавьте первую поставку, чтобы
                начать вести приход товара.
              </p>

              <Link
                href="/supplies/new"
                className="mt-5 inline-block rounded-xl bg-green-700 px-5 py-3 font-semibold text-white transition hover:bg-green-800"
              >
                🚚 Добавить поставку
              </Link>
            </div>
          )}

        {/* NO RESULTS */}
        {!loading &&
          !error &&
          supplies.length > 0 &&
          filteredSupplies.length === 0 && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-800">
                Ничего не найдено
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Измените поиск или период.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDateFilter("ALL");
                }}
                className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
              >
                Показать все поставки
              </button>
            </div>
          )}

        {/* MONTHS */}
        {!loading &&
          !error &&
          monthGroups.length > 0 && (
            <div className="space-y-3">
              {monthGroups.map((group) => {
                const isOpen =
                  openMonths[group.key] === true;

                return (
                  <section
                    key={group.key}
                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                  >
                    {/* MONTH HEADER */}
                    <button
                      type="button"
                      onClick={() =>
                        toggleMonth(group.key)
                      }
                      className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="text-lg font-bold capitalize text-slate-900">
                          {group.title}
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          {group.supplies.length}{" "}
                          {group.supplies.length === 1
                            ? "поставка"
                            : group.supplies.length <
                              5
                            ? "поставки"
                            : "поставок"}{" "}
                          ·{" "}
                          {formatMoney(
                            group.total
                          )}
                        </div>
                      </div>

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600">
                        {isOpen ? "⌃" : "›"}
                      </div>
                    </button>

                    {/* MONTH CONTENT */}
                    {isOpen && (
                      <div className="border-t border-slate-100">
                        {group.supplies.map(
                          (supply) => {
                            const isSupplyOpen =
                              openSupplies[
                                supply.id
                              ] === true;

                            return (
                              <div
                                key={supply.id}
                                className="border-b border-slate-100 last:border-b-0"
                              >
                                {/* SUPPLY ROW */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSupply(
                                      supply.id
                                    )
                                  }
                                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                                >
                                  <div className="w-14 shrink-0 text-sm font-semibold text-slate-500">
                                    {formatShortDate(
                                      supply.date
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-semibold text-slate-900">
                                      {supply
                                        .Supplier
                                        ?.name ||
                                        "Поставщик не указан"}
                                    </div>

                                    <div className="mt-0.5 text-xs text-slate-500">
                                      Поставка №
                                      {
                                        supply.id
                                      }{" "}
                                      ·{" "}
                                      {
                                        supply
                                          .items
                                          .length
                                      }{" "}
                                      поз.
                                    </div>
                                  </div>

                                  <div className="shrink-0 text-right">
                                    <div className="font-bold text-slate-900">
                                      {formatMoney(
                                        Number(
                                          supply.total
                                        )
                                      )}
                                    </div>

                                    <div className="text-xs text-slate-400">
                                      {isSupplyOpen
                                        ? "⌃"
                                        : "›"}
                                    </div>
                                  </div>
                                </button>

                                {/* SUPPLY DETAILS */}
                                {isSupplyOpen && (
                                  <div className="bg-slate-50 px-4 pb-4 pt-2">
                                    <div className="rounded-xl bg-white p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <div className="font-bold text-slate-900">
                                            Поставка №
                                            {
                                              supply.id
                                            }
                                          </div>

                                          <div className="mt-1 text-sm text-slate-500">
                                            {formatDate(
                                              supply.date
                                            )}
                                          </div>
                                        </div>

                                        <div className="text-right">
                                          <div className="text-xs text-slate-500">
                                            Итого
                                          </div>

                                          <div className="font-bold text-green-700">
                                            {formatMoney(
                                              Number(
                                                supply.total
                                              )
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="mt-3 rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                          Поставщик
                                        </div>

                                        <div className="mt-1 font-semibold text-slate-900">
                                          {supply
                                            .Supplier
                                            ?.name ||
                                            "Поставщик не указан"}
                                        </div>

                                        {supply
                                          .Supplier
                                          ?.phone && (
                                          <div className="mt-1 text-sm text-slate-500">
                                            📞{" "}
                                            {
                                              supply
                                                .Supplier
                                                .phone
                                            }
                                          </div>
                                        )}
                                      </div>

                                      <div className="mt-4">
                                        <div className="mb-2 flex items-center justify-between">
                                          <div className="text-sm font-semibold text-slate-600">
                                            Товары
                                          </div>

                                          <div className="text-xs text-slate-500">
                                            {
                                              supply
                                                .items
                                                .length
                                            }{" "}
                                            поз. ·{" "}
                                            {
                                              getItemCount(
                                                supply
                                              )
                                            }{" "}
                                            ед.
                                          </div>
                                        </div>

                                        <div className="divide-y rounded-xl border border-slate-100">
                                          {supply.items.map(
                                            (
                                              item
                                            ) => (
                                              <div
                                                key={
                                                  item.id
                                                }
                                                className="flex items-center justify-between gap-3 p-3"
                                              >
                                                <div className="min-w-0">
                                                  <div className="font-semibold text-slate-900">
                                                    {item
                                                      .product
                                                      ?.name ||
                                                      "Товар"}
                                                  </div>

                                                  <div className="mt-1 text-sm text-slate-500">
                                                    {
                                                      item.quantity
                                                    }{" "}
                                                    {
                                                      item
                                                        .product
                                                        ?.unit
                                                    }{" "}
                                                    ×{" "}
                                                    {formatMoney(
                                                      Number(
                                                        item.cost
                                                      )
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="shrink-0 font-bold text-slate-900">
                                                  {formatMoney(
                                                    Number(
                                                      item.quantity
                                                    ) *
                                                      Number(
                                                        item.cost
                                                      )
                                                  )}
                                                </div>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

        {/* BOTTOM BUTTON */}
        {!loading && supplies.length > 0 && (
          <Link
            href="/supplies/new"
            className="mt-5 block rounded-xl bg-green-700 py-3.5 text-center font-bold text-white shadow-sm transition hover:bg-green-800"
          >
            ➕ Новая поставка
          </Link>
        )}
      </div>
    </main>
  );
}