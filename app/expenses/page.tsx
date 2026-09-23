"use client";

import { useEffect, useState } from "react";

type Period =
  | "today"
  | "7days"
  | "month"
  | "all";

type Expense = {
  id: number;
  category: string;
  date: string;
  amount: number;
  comment: string | null;
};

type ExpensesResponse = {
  period: string;
  total: number;
  expenses: Expense[];
};

const categories = [
  "Транспорт",
  "Упаковка",
  "Реклама",
  "Связь",
  "Аренда",
  "Коммунальные услуги",
  "Зарплата",
  "Налоги",
  "Прочее",
];

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getToday() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPeriodTitle(period: Period) {
  switch (period) {
    case "today":
      return "Сегодня";

    case "7days":
      return "Последние 7 дней";

    case "month":
      return "Текущий месяц";

    case "all":
      return "За всё время";
  }
}

export default function ExpensesPage() {
  const [period, setPeriod] =
    useState<Period>("month");

  const [data, setData] =
    useState<ExpensesResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [formOpen, setFormOpen] =
    useState(false);

  const [category, setCategory] =
    useState("Транспорт");

  const [date, setDate] =
    useState(getToday());

  const [amount, setAmount] =
    useState("");

  const [comment, setComment] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  async function loadExpenses() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/expenses?period=${period}`
      );

      if (!response.ok) {
        throw new Error(
          "Ошибка загрузки расходов"
        );
      }

      const result =
        (await response.json()) as ExpensesResponse;

      setData(result);
    } catch (error) {
      console.error(
        "EXPENSES LOAD ERROR:",
        error
      );

      setError(
        "Не удалось загрузить расходы"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, [period]);

  async function saveExpense() {
    const numericAmount = Number(amount);

    if (
      !Number.isInteger(numericAmount) ||
      numericAmount <= 0
    ) {
      alert(
        "Введите корректную сумму расхода"
      );
      return;
    }

    if (!date) {
      alert("Укажите дату расхода");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/expenses",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            category,
            date,
            amount: numericAmount,
            comment,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        alert(
          result.error ||
            "Не удалось сохранить расход"
        );
        return;
      }

      setAmount("");
      setComment("");
      setDate(getToday());
      setCategory("Транспорт");
      setFormOpen(false);

      await loadExpenses();
    } catch (error) {
      console.error(
        "EXPENSE SAVE ERROR:",
        error
      );

      alert(
        "Ошибка сохранения расхода"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(
    expense: Expense
  ) {
    const confirmed = window.confirm(
      `Удалить расход ${formatMoney(
        expense.amount
      )}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `/api/expenses?id=${expense.id}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        alert(
          result.error ||
            "Не удалось удалить расход"
        );
        return;
      }

      await loadExpenses();
    } catch (error) {
      console.error(
        "EXPENSE DELETE ERROR:",
        error
      );

      alert(
        "Ошибка удаления расхода"
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              💸 Расходы
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Учёт расходов бизнеса
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setFormOpen((open) => !open)
            }
            className="touch-manipulation rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white shadow active:scale-[0.98]"
          >
            {formOpen
              ? "Закрыть"
              : "+ Расход"}
          </button>
        </div>

        {formOpen && (
          <section className="mb-4 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-bold">
              Новый расход
            </h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Категория
                </label>

                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border bg-white p-3"
                >
                  {categories.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Дата
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Сумма
                </label>

                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="Например, 1500"
                  value={amount}
                  onChange={(event) =>
                    setAmount(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Комментарий
                </label>

                <textarea
                  value={comment}
                  onChange={(event) =>
                    setComment(
                      event.target.value
                    )
                  }
                  placeholder="Например: бензин для доставки"
                  rows={3}
                  className="w-full resize-none rounded-xl border p-3"
                />
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={saveExpense}
                className="w-full touch-manipulation rounded-xl bg-green-700 py-3 font-semibold text-white active:scale-[0.99] disabled:opacity-50"
              >
                {saving
                  ? "Сохранение..."
                  : "💾 Сохранить расход"}
              </button>
            </div>
          </section>
        )}

        <section className="mb-4 rounded-2xl bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Период
          </label>

          <select
            value={period}
            onChange={(event) =>
              setPeriod(
                event.target.value as Period
              )
            }
            className="w-full rounded-xl border bg-white p-3"
          >
            <option value="today">
              Сегодня
            </option>

            <option value="7days">
              Последние 7 дней
            </option>

            <option value="month">
              Текущий месяц
            </option>

            <option value="all">
              За всё время
            </option>
          </select>
        </section>

        <section className="mb-4 rounded-2xl bg-white p-5 shadow">
          <p className="text-sm text-gray-500">
            Расходы
          </p>

          <p className="mt-1 text-3xl font-bold text-red-600">
            {formatMoney(
              data?.total ?? 0
            )}
          </p>

          <p className="mt-1 text-sm text-gray-500">
            {getPeriodTitle(period)}
          </p>
        </section>

        <h2 className="mb-3 text-lg font-bold">
          {getPeriodTitle(period)}
        </h2>

        {loading ? (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow">
            Загрузка...
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-white p-5 text-center text-red-600 shadow">
            {error}
          </div>
        ) : data?.expenses.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow">
            Расходов за выбранный период нет
          </div>
        ) : (
          <div className="space-y-3">
            {data?.expenses.map(
              (expense) => (
                <div
                  key={expense.id}
                  className="rounded-2xl bg-white p-4 shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {expense.category}
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        {formatDate(
                          expense.date
                        )}
                      </p>
                    </div>

                    <p className="shrink-0 text-lg font-bold text-red-600">
                      −
                      {formatMoney(
                        expense.amount
                      )}
                    </p>
                  </div>

                  {expense.comment && (
                    <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-gray-600">
                      {expense.comment}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      deleteExpense(
                        expense
                      )
                    }
                    className="mt-3 text-sm text-red-500"
                  >
                    Удалить
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}