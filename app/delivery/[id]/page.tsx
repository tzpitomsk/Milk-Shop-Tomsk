"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type DeliveryStatus =
  | "PENDING"
  | "IN_ROUTE"
  | "DELIVERED"
  | "SKIPPED";

type Product = {
  id: number;
  name: string;
  unit: string;
};

type OrderItem = {
  id: number;
  quantity: number;
  returned: number;
  price: number;
  product: Product;
};

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
};

type Order = {
  id: number;
  date: string;
  total: number;
  status: string;

  deliveryStatus: DeliveryStatus;
  deliveryPriority: number;
  deliveryDate: string | null;
  deliveredAt: string | null;
  deliverySkipReason: string | null;

  customer: Customer | null;
  items: OrderItem[];
};

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(value: string | null): string {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTodayDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDeliveryDate(value: string | null): string {
  if (!value) {
    return "Не назначена";
  }

  const date = new Date(`${value.slice(0, 10)}T12:00:00`);

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getStatusLabel(status: DeliveryStatus): string {
  switch (status) {
    case "PENDING":
      return "К доставке";

    case "IN_ROUTE":
      return "В маршруте";

    case "DELIVERED":
      return "Доставлен";

    case "SKIPPED":
      return "Пропущен";

    default:
      return status;
  }
}

function getStatusClass(status: DeliveryStatus): string {
  switch (status) {
    case "DELIVERED":
      return "bg-green-100 text-green-700";

    case "SKIPPED":
      return "bg-orange-100 text-orange-700";

    case "IN_ROUTE":
      return "bg-blue-100 text-blue-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

function getStatusIcon(status: DeliveryStatus): string {
  switch (status) {
    case "DELIVERED":
      return "✅";

    case "SKIPPED":
      return "⚠️";

    case "IN_ROUTE":
      return "🚚";

    default:
      return "📦";
  }
}

export default function DeliveryOrderPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      return;
    }

    loadOrder();
  }, [id]);

  async function loadOrder() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/orders/${id}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Не удалось загрузить заказ"
        );
      }

      setOrder(data);
    } catch (error) {
      console.error(
        "DELIVERY ORDER LOAD ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Ошибка загрузки заказа"
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateDelivery(
    body: Record<string, unknown>
  ) {
    if (!order) {
      return false;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        `/api/orders/${order.id}/delivery`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Не удалось изменить доставку"
        );
      }

      await loadOrder();

      return true;
    } catch (error) {
      console.error(
        "DELIVERY ORDER UPDATE ERROR:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Ошибка изменения доставки"
      );

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function markDelivered() {
    if (!order) {
      return;
    }

    await updateDelivery({
      deliveryStatus: "DELIVERED",
      deliveryDate:
        order.deliveryDate ||
        getTodayDate(),
    });
  }

  async function markSkipped() {
    if (!order) {
      return;
    }

    const reason = window.prompt(
      "Почему доставка пропущена?"
    );

    if (reason === null) {
      return;
    }

    const trimmedReason =
      reason.trim();

    if (!trimmedReason) {
      window.alert(
        "Нужно указать причину пропуска."
      );

      return;
    }

    await updateDelivery({
      deliveryStatus: "SKIPPED",
      deliverySkipReason:
        trimmedReason,
      deliveryDate:
        order.deliveryDate ||
        getTodayDate(),
    });
  }

  async function returnToRoute() {
    if (!order) {
      return;
    }

    await updateDelivery({
      deliveryStatus: "IN_ROUTE",
      deliveryDate:
        order.deliveryDate ||
        getTodayDate(),
      deliverySkipReason: null,
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 pb-24">
        <div className="mx-auto w-full max-w-md px-4 py-5">
          <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            Загружаю заказ...
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-gray-50 pb-24">
        <div className="mx-auto w-full max-w-md px-4 py-5">
          <button
            type="button"
            onClick={() =>
              router.push("/delivery")
            }
            className="mb-5 min-h-11 rounded-xl border bg-white px-4 font-medium text-gray-700 shadow-sm"
          >
            ← Назад к доставке
          </button>

          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <div className="text-lg font-bold text-gray-900">
              Заказ не найден
            </div>

            <button
              type="button"
              onClick={() =>
                router.push("/delivery")
              }
              className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white"
            >
              Вернуться к доставке
            </button>
          </div>
        </div>
      </main>
    );
  }

  const customerName =
    order.customer?.name ||
    "Клиент не указан";

  const phone =
    order.customer?.phone || null;

  const address =
    order.customer?.address ||
    "Адрес не указан";

  const activeItems =
    order.items.filter(
      (item) =>
        item.quantity - item.returned > 0
    );

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="mx-auto w-full max-w-md px-4 py-5">

        {/* НАЗАД */}
        <button
          type="button"
          onClick={() =>
            router.push("/delivery")
          }
          className="mb-7 min-h-11 touch-manipulation rounded-xl border border-gray-300 bg-white px-4 text-base font-medium text-gray-700 shadow-sm active:bg-gray-100"
        >
          ← Назад к доставке
        </button>

        {/* ================================================== */}
        {/* КЛИЕНТ + ОСНОВНАЯ ИНФОРМАЦИЯ */}
        {/* ================================================== */}

        <section className="rounded-2xl border border-gray-300 bg-white p-4 shadow-sm">

          {/* ИМЯ + СТАТУС */}

          <div className="flex items-start justify-between gap-3">

            <div className="min-w-0">
              <div className="text-sm text-gray-500">
                Доставка
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-900">
                {customerName}
              </h1>
            </div>

            <div
              className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${getStatusClass(
                order.deliveryStatus
              )}`}
            >
              {getStatusIcon(
                order.deliveryStatus
              )}{" "}
              {getStatusLabel(
                order.deliveryStatus
              )}
            </div>

          </div>

          {/* ТЕЛЕФОН */}

          {phone && (
            <div className="mt-5 rounded-2xl bg-gray-50 px-4 py-3">

              <div className="text-sm text-gray-500">
                📞 Телефон
              </div>

              <a
                href={`tel:${phone}`}
                className="mt-1 block text-xl font-semibold text-blue-600"
              >
                {phone}
              </a>

            </div>
          )}

          {/* АДРЕС */}

          <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3">

            <div className="text-sm text-gray-500">
              📍 Адрес
            </div>

            <div className="mt-1 text-lg font-semibold text-gray-900">
              {address}
            </div>

          </div>

          {/* ИНФОРМАЦИЯ О ЗАКАЗЕ */}

          <div className="mt-3 grid grid-cols-2 gap-2">

            <div className="rounded-2xl bg-gray-50 px-3 py-3">
              <div className="text-sm text-gray-500">
                🧾 Заказ
              </div>

              <div className="mt-1 text-lg font-bold text-gray-900">
                №{order.id}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 px-3 py-3">
              <div className="text-sm text-gray-500">
                📅 Дата заказа
              </div>

              <div className="mt-1 text-base font-bold text-gray-900">
                {formatDate(order.date)}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 px-3 py-3">
              <div className="text-sm text-gray-500">
                🚚 Доставка
              </div>

              <div className="mt-1 text-base font-bold text-gray-900">
                {formatDeliveryDate(
                  order.deliveryDate
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 px-3 py-3">
              <div className="text-sm text-gray-500">
                🔢 Приоритет
              </div>

              <div className="mt-1 text-base font-bold text-gray-900">
                {order.deliveryPriority ||
                  "—"}
              </div>
            </div>

          </div>

        </section>

        {/* ================================================== */}
        {/* ДОСТАВЛЕНО */}
        {/* ================================================== */}

        {order.deliveryStatus ===
          "DELIVERED" &&
          order.deliveredAt && (
            <div className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
              ✅ Доставлен в{" "}
              <span className="font-semibold">
                {formatTime(
                  order.deliveredAt
                )}
              </span>
            </div>
          )}

        {/* ================================================== */}
        {/* ПРОПУЩЕНО */}
        {/* ================================================== */}

        {order.deliveryStatus ===
          "SKIPPED" &&
          order.deliverySkipReason && (
            <div className="mt-3 rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-800">
              ⚠️ Причина:{" "}
              <span className="font-semibold">
                {order.deliverySkipReason}
              </span>
            </div>
          )}

        {/* ================================================== */}
        {/* ТОВАРЫ */}
        {/* ================================================== */}

        <section className="mt-5 rounded-2xl border border-gray-300 bg-white p-4 shadow-sm">

          <div className="flex items-center justify-between gap-3">

            <h2 className="text-xl font-bold text-gray-900">
              🛒 Товары
            </h2>

            <span className="text-sm text-gray-500">
              {activeItems.length}{" "}
              {activeItems.length === 1
                ? "позиция"
                : "позиций"}
            </span>

          </div>

          {activeItems.length === 0 ? (
            <div className="mt-5 rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
              Все товары возвращены
            </div>
          ) : (
            <div className="mt-4">

              {activeItems.map(
                (item, index) => {
                  const quantity =
                    item.quantity -
                    item.returned;

                  const lineTotal =
                    item.price * quantity;

                  return (
                    <div
                      key={item.id}
                      className={
                        index > 0
                          ? "border-t border-gray-200 pt-4 mt-4"
                          : ""
                      }
                    >
                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <div className="text-lg font-semibold text-gray-900">
                            {item.product.name}
                          </div>

                          <div className="mt-1 text-sm text-gray-500">
                            {item.price} ₽ /{" "}
                            {item.product.unit}
                          </div>

                        </div>

                        <div className="shrink-0 text-right">

                          <div className="text-lg font-bold text-gray-900">
                            × {quantity}
                          </div>

                          <div className="mt-1 text-sm text-gray-500">
                            {lineTotal} ₽
                          </div>

                        </div>

                      </div>
                    </div>
                  );
                }
              )}

              {/* ИТОГО */}

              <div className="mt-5 flex items-center justify-between border-t border-gray-300 pt-4">

                <span className="text-lg text-gray-500">
                  Итого
                </span>

                <span className="text-2xl font-bold text-gray-900">
                  {order.total} ₽
                </span>

              </div>

            </div>
          )}

        </section>

        {/* ================================================== */}
        {/* КНОПКИ ДОСТАВКИ */}
        {/* ================================================== */}

        <section className="mt-5">

          {order.deliveryStatus ===
            "IN_ROUTE" && (
            <div className="grid grid-cols-2 gap-3">

              <button
                type="button"
                disabled={saving}
                onClick={markDelivered}
                className="min-h-12 touch-manipulation rounded-xl bg-green-600 px-3 font-semibold text-white shadow-sm active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "..."
                  : "✅ Доставил"}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={markSkipped}
                className="min-h-12 touch-manipulation rounded-xl bg-orange-500 px-3 font-semibold text-white shadow-sm active:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "..."
                  : "⚠️ Пропустил"}
              </button>

            </div>
          )}

          {order.deliveryStatus ===
            "PENDING" && (
            <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
              🚚 Заказ ещё не добавлен в
              маршрут.
            </div>
          )}

          {(order.deliveryStatus ===
            "DELIVERED" ||
            order.deliveryStatus ===
              "SKIPPED") && (
            <button
              type="button"
              disabled={saving}
              onClick={returnToRoute}
              className="min-h-12 w-full touch-manipulation rounded-xl border border-gray-300 bg-white px-4 font-semibold text-gray-700 shadow-sm active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Сохраняю..."
                : "↩️ Вернуть в маршрут"}
            </button>
          )}

        </section>

        {/* ОШИБКА */}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="font-semibold">
              Ошибка
            </div>

            <div className="mt-1">
              {error}
            </div>

            <button
              type="button"
              onClick={loadOrder}
              className="mt-3 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white"
            >
              Повторить
            </button>
          </div>
        )}

      </div>
    </main>
  );
}