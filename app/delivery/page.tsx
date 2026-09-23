"use client";

import { useEffect, useMemo, useState } from "react";

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
  productId: number;
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
  total: number;
  profit: number;
  date: string;
  customerId: number | null;
  status: string;
  deliveryStatus: DeliveryStatus;
  deliveryPriority: number;
  deliveryDate: string | null;
  deliveredAt: string | null;
  deliverySkipReason: string | null;
  customer: Customer | null;
  items: OrderItem[];
};

const DELIVERY_STATUS_LABELS: Record<
  DeliveryStatus,
  string
> = {
  PENDING: "К доставке",
  IN_ROUTE: "В маршруте",
  DELIVERED: "Доставлен",
  SKIPPED: "Пропущен",
};

function getTodayDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function shiftDate(
  dateString: string,
  days: number
): string {
  const date = new Date(`${dateString}T12:00:00`);

  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatSelectedDate(
  dateString: string
): string {
  const date = new Date(`${dateString}T12:00:00`);

  return date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(
  value: string | null
): string {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(
  value: string
): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDeliveryDateKey(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
}

function getOrderItemsText(
  order: Order
): string {
  return order.items
    .map((item) => {
      const remaining =
        item.quantity - item.returned;

      if (remaining <= 0) {
        return null;
      }

      return `${item.product.name} × ${remaining}`;
    })
    .filter(Boolean)
    .join(", ");
}

function hasRemainingItems(
  order: Order
): boolean {
  return order.items.some(
    (item) =>
      item.quantity - item.returned > 0
  );
}

function getStatusClass(
  status: DeliveryStatus
): string {
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

export default function DeliveryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] =
    useState<number | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const [selectedDate, setSelectedDate] =
    useState<string>(getTodayDate());

  const [nextOrderId, setNextOrderId] =
    useState<number | null>(null);

  async function loadOrders() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        "/api/orders",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Не удалось загрузить заказы"
        );
      }

      if (!Array.isArray(data)) {
        throw new Error(
          "API заказов вернул некорректный формат"
        );
      }

      setOrders(data);
    } catch (err: any) {
      console.error(
        "DELIVERY LOAD ERROR:",
        err
      );

      setError(
        err?.message ||
          "Ошибка загрузки заказов"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    setNextOrderId(null);
  }, [selectedDate]);

  const selectedDateOrders = useMemo(() => {
    return orders.filter(
      (order) =>
        getDeliveryDateKey(
          order.deliveryDate
        ) === selectedDate
    );
  }, [orders, selectedDate]);

  const activeOrders = useMemo(() => {
    return selectedDateOrders
      .filter(
        (order) =>
          hasRemainingItems(order) &&
          (order.deliveryStatus ===
            "PENDING" ||
            order.deliveryStatus ===
              "IN_ROUTE")
      )
      .sort((a, b) => {
        if (
          a.deliveryStatus ===
            "IN_ROUTE" &&
          b.deliveryStatus !==
            "IN_ROUTE"
        ) {
          return -1;
        }

        if (
          a.deliveryStatus !==
            "IN_ROUTE" &&
          b.deliveryStatus ===
            "IN_ROUTE"
        ) {
          return 1;
        }

        if (
          a.deliveryPriority !==
          b.deliveryPriority
        ) {
          return (
            a.deliveryPriority -
            b.deliveryPriority
          );
        }

        return (
          new Date(a.date).getTime() -
          new Date(b.date).getTime()
        );
      });
  }, [selectedDateOrders]);

  const pendingOrders = useMemo(() => {
    return activeOrders
      .filter(
        (order) =>
          order.deliveryStatus ===
          "PENDING"
      )
      .sort((a, b) => {
        return (
          new Date(a.date).getTime() -
          new Date(b.date).getTime()
        );
      });
  }, [activeOrders]);

  const inRouteOrders = useMemo(() => {
    return activeOrders
      .filter(
        (order) =>
          order.deliveryStatus ===
          "IN_ROUTE"
      )
      .sort((a, b) => {
        if (
          a.deliveryPriority !==
          b.deliveryPriority
        ) {
          return (
            a.deliveryPriority -
            b.deliveryPriority
          );
        }

        return (
          new Date(a.date).getTime() -
          new Date(b.date).getTime()
        );
      });
  }, [activeOrders]);

  const deliveredOrders = useMemo(() => {
    return selectedDateOrders
      .filter(
        (order) =>
          order.deliveryStatus ===
          "DELIVERED"
      )
      .sort((a, b) => {
        const aTime = a.deliveredAt
          ? new Date(
              a.deliveredAt
            ).getTime()
          : 0;

        const bTime = b.deliveredAt
          ? new Date(
              b.deliveredAt
            ).getTime()
          : 0;

        return bTime - aTime;
      });
  }, [selectedDateOrders]);

  const skippedOrders = useMemo(() => {
    return selectedDateOrders
      .filter(
        (order) =>
          order.deliveryStatus ===
          "SKIPPED"
      )
      .sort((a, b) => {
        return (
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
        );
      });
  }, [selectedDateOrders]);

  const undatedOrders = useMemo(() => {
    return orders
      .filter(
        (order) =>
          order.deliveryDate === null
      )
      .sort((a, b) => {
        return (
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
        );
      });
  }, [orders]);

  const nextOrder = useMemo(() => {
    if (nextOrderId === null) {
      return null;
    }

    return (
      inRouteOrders.find(
        (order) =>
          order.id === nextOrderId
      ) ?? null
    );
  }, [inRouteOrders, nextOrderId]);

  const pendingCount =
    pendingOrders.length;

  const inRouteCount =
    inRouteOrders.length;

  const deliveredCount =
    deliveredOrders.length;

  const skippedCount =
    skippedOrders.length;

  async function updateDelivery(
    orderId: number,
    body: Record<string, unknown>
  ) {
    try {
      setSavingOrderId(orderId);
      setError(null);

      const response = await fetch(
        `/api/orders/${orderId}/delivery`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Не удалось изменить доставку"
        );
      }

      await loadOrders();
    } catch (err: any) {
      console.error(
        "DELIVERY UPDATE ERROR:",
        err
      );

      setError(
        err?.message ||
          "Ошибка изменения доставки"
      );
    } finally {
      setSavingOrderId(null);
    }
  }

  async function putIntoRoute(
    order: Order
  ) {
    const maxPriority =
      inRouteOrders.reduce(
        (max, item) =>
          Math.max(
            max,
            item.deliveryPriority || 0
          ),
        0
      );

    await updateDelivery(order.id, {
      deliveryStatus: "IN_ROUTE",
      deliveryPriority:
        maxPriority + 1,
      deliveryDate: selectedDate,
    });
  }

  async function markDelivered(
    order: Order
  ) {
    const currentIndex =
      inRouteOrders.findIndex(
        (item) => item.id === order.id
      );

    const followingOrder =
      currentIndex >= 0
        ? inRouteOrders[
            currentIndex + 1
          ]
        : undefined;

    await updateDelivery(order.id, {
      deliveryStatus: "DELIVERED",
      deliveryDate: selectedDate,
    });

    if (followingOrder) {
      setNextOrderId(
        followingOrder.id
      );

      window.setTimeout(() => {
        const element =
          document.getElementById(
            `delivery-order-${followingOrder.id}`
          );

        element?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 150);
    } else {
      setNextOrderId(null);
    }
  }

  async function markSkipped(
    order: Order
  ) {
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

    await updateDelivery(order.id, {
      deliveryStatus: "SKIPPED",
      deliverySkipReason:
        trimmedReason,
      deliveryDate: selectedDate,
    });
  }

  async function returnToRoute(
    order: Order
  ) {
    const maxPriority =
      inRouteOrders.reduce(
        (max, item) =>
          Math.max(
            max,
            item.deliveryPriority || 0
          ),
        0
      );

    await updateDelivery(order.id, {
      deliveryStatus: "IN_ROUTE",
      deliveryPriority:
        maxPriority + 1,
      deliveryDate: selectedDate,
      deliverySkipReason: null,
    });
  }

  async function changePriority(
    order: Order,
    direction: "up" | "down"
  ) {
    const index =
      inRouteOrders.findIndex(
        (item) => item.id === order.id
      );

    if (index === -1) {
      return;
    }

    const targetIndex =
      direction === "up"
        ? index - 1
        : index + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= inRouteOrders.length
    ) {
      return;
    }

    const target =
      inRouteOrders[targetIndex];

    const currentPriority =
      order.deliveryPriority ||
      index + 1;

    const targetPriority =
      target.deliveryPriority ||
      targetIndex + 1;

    try {
      setSavingOrderId(order.id);
      setError(null);

      const [
        firstResponse,
        secondResponse,
      ] = await Promise.all([
        fetch(
          `/api/orders/${order.id}/delivery`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              deliveryPriority:
                targetPriority,
              deliveryDate:
                selectedDate,
            }),
          }
        ),

        fetch(
          `/api/orders/${target.id}/delivery`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              deliveryPriority:
                currentPriority,
              deliveryDate:
                selectedDate,
            }),
          }
        ),
      ]);

      const firstData =
        await firstResponse.json();

      const secondData =
        await secondResponse.json();

      if (
        !firstResponse.ok ||
        !secondResponse.ok
      ) {
        throw new Error(
          firstData?.error ||
            secondData?.error ||
            "Не удалось изменить порядок маршрута"
        );
      }

      await loadOrders();
    } catch (err: any) {
      console.error(
        "DELIVERY PRIORITY ERROR:",
        err
      );

      setError(
        err?.message ||
          "Ошибка изменения порядка"
      );
    } finally {
      setSavingOrderId(null);
    }
  }

  function openNextOrder() {
    if (!nextOrder) {
      return;
    }

    const element =
      document.getElementById(
        `delivery-order-${nextOrder.id}`
      );

    element?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function renderOrderCard(
    order: Order,
    options?: {
      routePosition?: number;
      showPriorityControls?: boolean;
    }
  ) {
    const routePosition =
      options?.routePosition;

    const showPriorityControls =
      options?.showPriorityControls ===
      true;

    const isSaving =
      savingOrderId === order.id;

    const customerName =
      order.customer?.name ||
      "Клиент не указан";

    const phone =
      order.customer?.phone ||
      null;

    const address =
      order.customer?.address ||
      "Адрес не указан";

    const itemsText =
      getOrderItemsText(order) ||
      "Товары отсутствуют";

    const isNextOrder =
      nextOrderId === order.id;

    return (
      <div
        key={order.id}
        id={`delivery-order-${order.id}`}
        className={`rounded-2xl border bg-white p-3 shadow-sm ${
          isNextOrder
            ? "border-blue-300 ring-2 ring-blue-100"
            : ""
        }`}
      >
        <div className="flex items-start gap-3">
          {routePosition !==
            undefined && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-700">
              {routePosition}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-gray-900">
                  {customerName}
                </h2>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusClass(
                      order.deliveryStatus
                    )}`}
                  >
                    {
                      DELIVERY_STATUS_LABELS[
                        order.deliveryStatus
                      ]
                    }
                  </span>

                  {isNextOrder && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                      Следующий
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-gray-900">
                  {order.total} ₽
                </div>

                <div className="text-[11px] text-gray-400">
                  №{order.id}
                </div>
              </div>
            </div>

            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <div className="truncate">
                📍 {address}
              </div>

              {phone && (
                <div>
                  📞 {phone}
                </div>
              )}

              <div>
                🛒 {itemsText}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
              <span>
                Заказ от{" "}
                {formatDate(order.date)}
              </span>

              <span>
                Доставка{" "}
                {selectedDate
                  .split("-")
                  .reverse()
                  .join(".")}
              </span>
            </div>

            {order.deliveryStatus ===
              "DELIVERED" &&
              order.deliveredAt && (
                <div className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-800">
                  ✅ Доставлен в{" "}
                  {formatTime(
                    order.deliveredAt
                  )}
                </div>
              )}

            {order.deliveryStatus ===
              "SKIPPED" &&
              order.deliverySkipReason && (
                <div className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  ⚠️{" "}
                  {
                    order.deliverySkipReason
                  }
                </div>
              )}

            {showPriorityControls && (
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={
                    isSaving ||
                    routePosition === 1
                  }
                  onClick={() =>
                    changePriority(
                      order,
                      "up"
                    )
                  }
                  className="min-h-10 min-w-10 touch-manipulation rounded-xl border bg-white text-base font-bold text-gray-700 shadow-sm active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Поднять выше"
                >
                  ▲
                </button>

                <button
                  type="button"
                  disabled={
                    isSaving ||
                    routePosition ===
                      inRouteOrders.length
                  }
                  onClick={() =>
                    changePriority(
                      order,
                      "down"
                    )
                  }
                  className="min-h-10 min-w-10 touch-manipulation rounded-xl border bg-white text-base font-bold text-gray-700 shadow-sm active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Опустить ниже"
                >
                  ▼
                </button>

                <span className="ml-1 text-[11px] text-gray-500">
                  Приоритет{" "}
                  {order.deliveryPriority ||
                    routePosition}
                </span>
              </div>
            )}

            <div className="mt-3">
              {order.deliveryStatus ===
                "PENDING" && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    putIntoRoute(order)
                  }
                  className="min-h-11 w-full touch-manipulation rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Сохраняю..."
                    : "🚚 В маршрут"}
                </button>
              )}

              {order.deliveryStatus ===
                "IN_ROUTE" && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() =>
                      markDelivered(order)
                    }
                    className="min-h-11 touch-manipulation rounded-xl bg-green-600 px-2 text-sm font-semibold text-white shadow-sm active:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving
                      ? "..."
                      : "✅ Доставил"}
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() =>
                      markSkipped(order)
                    }
                    className="min-h-11 touch-manipulation rounded-xl bg-orange-500 px-2 text-sm font-semibold text-white shadow-sm active:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving
                      ? "..."
                      : "⚠️ Пропустил"}
                  </button>
                </div>
              )}

              {order.deliveryStatus ===
                "DELIVERED" && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    returnToRoute(order)
                  }
                  className="min-h-10 w-full touch-manipulation rounded-xl border px-3 text-sm font-medium text-gray-700 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Сохраняю..."
                    : "↩️ Вернуть в маршрут"}
                </button>
              )}

              {order.deliveryStatus ===
                "SKIPPED" && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    returnToRoute(order)
                  }
                  className="min-h-10 w-full touch-manipulation rounded-xl border px-3 text-sm font-medium text-gray-700 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Сохраняю..."
                    : "↩️ Вернуть в маршрут"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="mx-auto w-full max-w-md px-3 py-4">
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500">
            Логистика
          </div>

          <h1 className="mt-1 text-xl font-bold text-gray-900">
            🚚 Доставка
          </h1>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedDate(
                  shiftDate(
                    selectedDate,
                    -1
                  )
                )
              }
              className="min-h-10 min-w-10 touch-manipulation rounded-xl border bg-white text-lg font-bold text-gray-700 shadow-sm active:bg-gray-100"
              aria-label="Предыдущий день"
            >
              ←
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Доставка на
              </div>

              <div className="mt-0.5 truncate text-sm font-bold capitalize text-gray-900">
                {formatSelectedDate(
                  selectedDate
                )}
              </div>

              <div className="text-[11px] text-gray-400">
                {selectedDate
                  .split("-")
                  .reverse()
                  .join(".")}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setSelectedDate(
                  shiftDate(
                    selectedDate,
                    1
                  )
                )
              }
              className="min-h-10 min-w-10 touch-manipulation rounded-xl border bg-white text-lg font-bold text-gray-700 shadow-sm active:bg-gray-100"
              aria-label="Следующий день"
            >
              →
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedDate(
                  getTodayDate()
                )
              }
              className="min-h-9 touch-manipulation rounded-xl border px-3 text-xs font-medium text-gray-700 active:bg-gray-100"
            >
              Сегодня
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(
                  event.target.value
                )
              }
              className="min-h-9 w-full touch-manipulation rounded-xl border bg-white px-2 text-xs font-medium text-gray-700"
              aria-label="Выбрать дату доставки"
            />
          </div>
        </section>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="text-[11px] text-gray-500">
              К доставке
            </div>

            <div className="mt-0.5 text-xl font-bold text-gray-900">
              {pendingCount}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="text-[11px] text-gray-500">
              В маршруте
            </div>

            <div className="mt-0.5 text-xl font-bold text-blue-600">
              {inRouteCount}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="text-[11px] text-gray-500">
              Доставлено
            </div>

            <div className="mt-0.5 text-xl font-bold text-green-600">
              {deliveredCount}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="text-[11px] text-gray-500">
              Пропущено
            </div>

            <div className="mt-0.5 text-xl font-bold text-orange-600">
              {skippedCount}
            </div>
          </div>
        </div>

        {nextOrder && (
          <section className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
              Следующий клиент
            </div>

            <div className="mt-0.5 text-base font-bold text-gray-900">
              {nextOrder.customer?.name ||
                "Клиент не указан"}
            </div>

            <div className="mt-1 text-xs text-gray-600">
              🧾 Заказ №{nextOrder.id}
            </div>

            {nextOrder.customer
              ?.address && (
              <div className="mt-1 truncate text-xs text-gray-600">
                📍{" "}
                {
                  nextOrder.customer
                    .address
                }
              </div>
            )}

            {nextOrder.customer?.phone && (
              <div className="mt-1 text-xs text-gray-600">
                📞{" "}
                {nextOrder.customer.phone}
              </div>
            )}

            <button
              type="button"
              onClick={openNextOrder}
              className="mt-2 min-h-10 w-full touch-manipulation rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm active:bg-blue-800"
            >
              ➡️ Открыть следующего
            </button>
          </section>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="font-semibold">
              Ошибка
            </div>

            <div className="mt-1">
              {error}
            </div>

            <button
              type="button"
              onClick={loadOrders}
              className="mt-2 min-h-9 rounded-xl bg-red-600 px-3 text-xs font-medium text-white"
            >
              Повторить
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-500 shadow-sm">
            Загружаю доставки...
          </div>
        ) : (
          <>
            <section>
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    📋 К доставке
                  </h2>

                  <p className="text-[11px] text-gray-500">
                    Ещё не в маршруте
                  </p>
                </div>

                <div className="text-sm font-semibold text-gray-700">
                  {pendingOrders.length}
                </div>
              </div>

              {pendingOrders.length ===
              0 ? (
                <div className="rounded-2xl border bg-white p-4 text-center text-xs text-gray-500 shadow-sm">
                  На выбранную дату нет
                  заказов к доставке.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingOrders.map(
                    (order) =>
                      renderOrderCard(
                        order
                      )
                  )}
                </div>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    🚚 В маршруте
                  </h2>

                  <p className="text-[11px] text-gray-500">
                    Порядок меняется кнопками
                    ▲ ▼
                  </p>
                </div>

                <div className="text-sm font-semibold text-blue-600">
                  {inRouteOrders.length}
                </div>
              </div>

              {inRouteOrders.length ===
              0 ? (
                <div className="rounded-2xl border bg-white p-4 text-center text-xs text-gray-500 shadow-sm">
                  В маршрут пока никто не
                  добавлен.
                </div>
              ) : (
                <div className="space-y-2">
                  {inRouteOrders.map(
                    (order, index) =>
                      renderOrderCard(
                        order,
                        {
                          routePosition:
                            index + 1,
                          showPriorityControls:
                            true,
                        }
                      )
                  )}
                </div>
              )}
            </section>

            {deliveredOrders.length >
              0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-base font-bold text-gray-900">
                  ✅ Доставлено
                </h2>

                <div className="space-y-2">
                  {deliveredOrders.map(
                    (order) =>
                      renderOrderCard(
                        order
                      )
                  )}
                </div>
              </section>
            )}

            {skippedOrders.length >
              0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-base font-bold text-gray-900">
                  ⚠️ Пропущено
                </h2>

                <div className="space-y-2">
                  {skippedOrders.map(
                    (order) =>
                      renderOrderCard(
                        order
                      )
                  )}
                </div>
              </section>
            )}

            {undatedOrders.length >
              0 && (
              <section className="mt-6">
                <div className="mb-2">
                  <h2 className="text-base font-bold text-gray-900">
                    📋 Без даты доставки
                  </h2>

                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Заказы без назначенного дня
                    доставки.
                  </p>
                </div>

                <div className="space-y-2">
                  {undatedOrders.map(
                    (order) =>
                      renderOrderCard(
                        order
                      )
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}