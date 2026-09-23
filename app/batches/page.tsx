"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Batch = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: string;
  expiryDate: string;
  status: string;
  productId: number;
  product: {
    id: number;
    name: string;
    unit: string;
  };
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadBatches();
  }, []);

  async function loadBatches() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/batches");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Не удалось загрузить партии");
        return;
      }

      if (!Array.isArray(data)) {
        setError("Сервер вернул некорректные данные");
        return;
      }

      /*
       * ВАЖНО:
       *
       * Эта страница показывает ВСЕ партии с физическим остатком.
       *
       * Поэтому здесь нельзя фильтровать только status === "ACTIVE":
       * просроченная партия с quantity > 0 должна оставаться видимой,
       * чтобы её можно было списать.
       */
      const positiveBatches = data.filter(
        (batch: Batch) => batch.quantity > 0
      );

      setBatches(positiveBatches);
    } catch (error) {
      console.error("BATCHES PAGE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  function getInfo(date: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(date);
    expiry.setHours(0, 0, 0, 0);

    const days = Math.ceil(
      (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (days < 0) {
      return {
        text: "❌ Просрочено",
        color: "text-red-700",
        card: "bg-red-50 border-red-300",
      };
    }

    if (days === 0) {
      return {
        text: "⚠️ Сегодня",
        color: "text-orange-600",
        card: "bg-orange-50 border-orange-300",
      };
    }

    if (days <= 3) {
      return {
        text: `⚠️ ${days} дн.`,
        color: "text-orange-600",
        card: "bg-orange-50 border-orange-300",
      };
    }

    return {
      text: `✅ ${days} дн.`,
      color: "text-green-700",
      card: "bg-green-50 border-green-300",
    };
  }

  async function writeOffExpired() {
    const ok = confirm(
      "Списать все просроченные партии?"
    );

    if (!ok) return;

    try {
      const res = await fetch(
        "/api/batches/expired/writeoff",
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Ошибка списания");
        return;
      }

      alert(`✅ Списано партий: ${data.count}`);

      await loadBatches();
    } catch (error) {
      console.error(
        "WRITE OFF EXPIRED ERROR:",
        error
      );

      alert("Ошибка соединения с сервером");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-2 text-3xl font-bold text-green-700">
          📦 Все партии
        </h1>

        <p className="mb-5 text-sm text-gray-600">
          Здесь отображаются все партии с физическим остатком,
          включая просроченные.
        </p>

        {/* КНОПКА СПИСАНИЯ — ОСТАВЛЯЕМ БОЛЬШОЙ */}
        <button
          onClick={writeOffExpired}
          className="
            mb-4
            w-full
            rounded-xl
            bg-red-600
            py-3
            font-bold
            text-white
            shadow-sm
            transition
            active:scale-[0.99]
          "
        >
          ⚡ Списать всю просрочку
        </button>

        {loading && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            Загрузка партий...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <div className="mb-3 text-4xl">❌</div>

            <div className="font-bold">
              Ошибка
            </div>

            <p className="mt-2 text-gray-600">
              {error}
            </p>

            <button
              onClick={loadBatches}
              className="
                mt-4
                w-full
                rounded-xl
                bg-blue-600
                py-3
                font-bold
                text-white
              "
            >
              🔄 Повторить
            </button>
          </div>
        )}

        {!loading && !error && batches.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <div className="mb-3 text-4xl">📦</div>

            <div className="font-bold">
              Положительных остатков нет
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Все партии пустые либо уже списаны.
            </p>
          </div>
        )}

        {!loading && !error && batches.length > 0 && (
          <div className="space-y-2.5">
            {batches.map((batch) => {
              const info = getInfo(batch.expiryDate);

              return (
                <Link
                  key={batch.id}
                  href={`/batches/${batch.id}`}
                  className={`
                    block
                    rounded-xl
                    border
                    px-3
                    py-3
                    shadow-sm
                    transition
                    active:scale-[0.99]
                    ${info.card}
                  `}
                >
                  {/* ВЕРХ КАРТОЧКИ */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold text-gray-900">
                        🥛 {batch.product.name}
                      </div>

                      <div className="mt-0.5 text-xs text-gray-600">
                        📦 Партия №{batch.id}
                      </div>
                    </div>

                    {/* ОСТАТОК */}
                    <div className="shrink-0 rounded-lg bg-white/80 px-2.5 py-1.5 text-right shadow-sm">
                      <div className="text-[10px] font-semibold text-gray-500">
                        ОСТАТОК
                      </div>

                      <div className="text-lg font-bold leading-tight text-gray-900">
                        {batch.quantity}
                      </div>

                      <div className="text-[10px] font-semibold text-gray-600">
                        {batch.product.unit}
                      </div>
                    </div>
                  </div>

                  {/* НИЗ КАРТОЧКИ */}
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-black/5 pt-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-gray-500">
                        Срок годности
                      </div>

                      <div className="mt-0.5 text-sm font-bold text-gray-900">
                        {new Date(
                          batch.expiryDate
                        ).toLocaleDateString("ru-RU")}
                      </div>
                    </div>

                    <div
                      className={`
                        rounded-lg
                        bg-white/70
                        px-2.5
                        py-1.5
                        text-xs
                        font-bold
                        ${info.color}
                      `}
                    >
                      {info.text}
                    </div>
                  </div>

                  {batch.status !== "ACTIVE" && (
                    <div className="mt-2 border-t border-black/5 pt-1.5 text-[11px] font-bold text-gray-600">
                      Статус партии: {batch.status}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}