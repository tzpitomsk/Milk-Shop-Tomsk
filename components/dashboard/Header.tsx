"use client";

export default function Header() {
  const today = new Date();

  const date = today.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="mb-8 rounded-3xl bg-gradient-to-r from-green-700 to-emerald-500 p-6 text-white shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            🥛 Milk Shop
          </h1>

          <p className="mt-1 text-green-100">
            Система управления магазином
          </p>
        </div>

        <div className="text-right">
          <p className="text-sm text-green-100">
            Сегодня
          </p>

          <p className="font-semibold">
            {date}
          </p>
        </div>
      </div>
    </header>
  );
}