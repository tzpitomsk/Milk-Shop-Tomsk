"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
id: number;
name: string;
unit: string;
};

type Batch = {
id: number;
quantity: number;
purchaseCost: number;
expiryDate: string;
};

type OrderBatch = {
id: number;
quantity: number;
purchaseCost: number;
batch: Batch;
};

type ReturnBatch = {
id: number;
quantity: number;
createdAt: string;
batchId: number;
};

type OrderItem = {
id: number;
quantity: number;
returned: number;
price: number;
product: Product;
batches: OrderBatch[];
ReturnBatch: ReturnBatch[];
};

type Customer = {
id: number;
name: string;
phone?: string | null;
address?: string | null;
};

type Order = {
id: number;
total: number;
profit: number;
date: string;
status: "COMPLETED" | "PARTIAL_RETURN" | "RETURNED";
customer?: Customer | null;
items: OrderItem[];
};

type ReturnDialogState = {
orderId: number;
itemId: number;
productName: string;
maxQuantity: number;
};

function formatMoney(value: number) {
return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatDate(value: string) {
return new Date(value).toLocaleString("ru-RU", {
day: "2-digit",
month: "2-digit",
year: "numeric",
hour: "2-digit",
minute: "2-digit",
second: "2-digit",
});
}

function getStatusLabel(status: Order["status"]) {
switch (status) {
case "RETURNED":
return "🔴 Возвращён";
case "PARTIAL_RETURN":
return "🟠 Частичный возврат";
case "COMPLETED":
default:
return "🟢 Продан";
}
}

function getStatusClass(status: Order["status"]) {
switch (status) {
case "RETURNED":
return "bg-red-50 text-red-700 border-red-200";
case "PARTIAL_RETURN":
return "bg-orange-50 text-orange-700 border-orange-200";
case "COMPLETED":
default:
return "bg-green-50 text-green-700 border-green-200";
}
}

export default function OrdersPage() {
const router = useRouter();

const [orders, setOrders] = useState<Order[]>([]);
const [loading, setLoading] = useState(true);

const [returnDialog, setReturnDialog] =
useState<ReturnDialogState | null>(null);

const [returnQuantity, setReturnQuantity] = useState(1);
const [returning, setReturning] = useState(false);

const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);

async function loadOrders() {
try {
setLoading(true);


  const response = await fetch("/api/orders", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить заказы");
  }

  const data = await response.json();

  setOrders(data);
} catch (error) {
  console.error(error);
  alert("Не удалось загрузить историю заказов");
} finally {
  setLoading(false);
}


}

useEffect(() => {
loadOrders();
}, []);

function openReturnDialog(order: Order, item: OrderItem) {
const remaining = Math.max(item.quantity - item.returned, 0);


if (remaining <= 0) {
  return;
}

setReturnDialog({
  orderId: order.id,
  itemId: item.id,
  productName: item.product.name,
  maxQuantity: remaining,
});

setReturnQuantity(1);


}

function closeReturnDialog() {
if (returning) {
return;
}


setReturnDialog(null);
setReturnQuantity(1);


}

function decreaseReturnQuantity() {
setReturnQuantity((current) => Math.max(1, current - 1));
}

function increaseReturnQuantity() {
if (!returnDialog) {
return;
}


setReturnQuantity((current) =>
  Math.min(returnDialog.maxQuantity, current + 1)
);


}

async function submitReturn() {
if (!returnDialog || returning) {
return;
}


if (
  returnQuantity < 1 ||
  returnQuantity > returnDialog.maxQuantity
) {
  return;
}

try {
  setReturning(true);

  const response = await fetch(
    `/api/orders/${returnDialog.orderId}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: returnDialog.itemId,
        quantity: returnQuantity,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || "Не удалось оформить возврат"
    );
  }

  setReturnDialog(null);
  setReturnQuantity(1);

  await loadOrders();
} catch (error) {
  console.error(error);

  alert(
    error instanceof Error
      ? error.message
      : "Не удалось оформить возврат"
  );
} finally {
  setReturning(false);
}


}

async function deleteOrder(order: Order) {
if (deletingOrderId !== null) {
return;
}


const confirmed = window.confirm(
  `Удалить заказ №${order.id}?\n\n` +
    `Это действие нельзя отменить.`
);

if (!confirmed) {
  return;
}

try {
  setDeletingOrderId(order.id);

  const response = await fetch(`/api/orders/${order.id}`, {
    method: "DELETE",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || "Не удалось удалить заказ"
    );
  }

  setOrders((current) =>
    current.filter((item) => item.id !== order.id)
  );
} catch (error) {
  console.error(error);

  alert(
    error instanceof Error
      ? error.message
      : "Не удалось удалить заказ"
  );
} finally {
  setDeletingOrderId(null);
}


}

function openReceipt(orderId: number) {
router.push(`/orders/${orderId}`);
}

if (loading) {
return ( <main className="min-h-screen bg-slate-50 px-4 py-6"> <div className="mx-auto max-w-5xl"> <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"> <div className="text-lg font-medium text-slate-700">
Загружаем историю заказов… </div> </div> </div> </main>
);
}

return ( <main className="min-h-screen bg-slate-50 px-3 py-5 sm:px-5 sm:py-8"> <div className="mx-auto max-w-5xl">
{/* HEADER */} <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"> <div> <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
📋 История заказов </h1>


        <p className="mt-1 text-sm text-slate-500">
          Всего заказов: {orders.length}
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.push("/orders/new")}
        className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] sm:w-auto"
      >
        🛒 Новый заказ
      </button>
    </div>

    {/* EMPTY */}
    {orders.length === 0 && (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="text-4xl">📦</div>

        <h2 className="mt-3 text-lg font-semibold text-slate-900">
          Заказов пока нет
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Создайте первый заказ, чтобы он появился здесь.
        </p>
      </div>
    )}

    {/* ORDERS */}
    <div className="space-y-4">
      {orders.map((order) => {
        const originalOrderTotal = order.items.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0
        );

        const returnedOrderTotal = order.items.reduce(
          (sum, item) => sum + item.returned * item.price,
          0
        );

        const currentOrderTotal = order.total;

        const isReturned = order.status === "RETURNED";
        const isPartialReturn =
          order.status === "PARTIAL_RETURN";

        const hasReturns =
          isReturned ||
          isPartialReturn ||
          returnedOrderTotal > 0;

        return (
          <section
            key={order.id}
            className="overflow-hidden rounded-2xl border bg-white shadow-sm"
          >
            {/* ORDER HEADER */}
            <div className="border-b bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      Заказ №{order.id}
                    </h2>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                        order.status
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    {formatDate(order.date)}
                  </div>

                  {order.customer && (
                    <div className="mt-2 text-sm text-slate-600">
                      👤 {order.customer.name}

                      {order.customer.phone && (
                        <span className="ml-2">
                          · {order.customer.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* CURRENT TOTAL */}
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-left sm:min-w-[190px] sm:text-right">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Текущая сумма
                  </div>

                  <div
                    className={`mt-0.5 text-2xl font-bold ${
                      currentOrderTotal === 0
                        ? "text-slate-500"
                        : "text-slate-900"
                    }`}
                  >
                    {formatMoney(currentOrderTotal)}
                  </div>

                  {hasReturns && (
                    <div className="mt-1 text-xs text-slate-500">
                      после возврата
                    </div>
                  )}
                </div>
              </div>

              {/* ORDER MONEY SUMMARY */}
              {hasReturns ? (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">
                      Исходная сумма
                    </div>

                    <div className="mt-0.5 font-semibold text-slate-800">
                      {formatMoney(originalOrderTotal)}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 px-3 py-2.5">
                    <div className="text-xs text-slate-500">
                      Возвращено
                    </div>

                    <div className="mt-0.5 font-semibold text-slate-800">
                      {returnedOrderTotal > 0
                        ? `−${formatMoney(returnedOrderTotal)}`
                        : formatMoney(0)}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-900 px-3 py-2.5 text-white">
                    <div className="text-xs text-slate-300">
                      К оплате
                    </div>

                    <div className="mt-0.5 font-bold">
                      {formatMoney(currentOrderTotal)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border bg-slate-50 px-3 py-2.5 sm:max-w-[260px]">
                  <div className="text-xs text-slate-500">
                    К оплате
                  </div>

                  <div className="mt-0.5 font-bold text-slate-900">
                    {formatMoney(currentOrderTotal)}
                  </div>
                </div>
              )}
            </div>

            {/* ORDER ITEMS */}
            <div className="divide-y">
              {order.items.map((item) => {
                const remaining = Math.max(
                  item.quantity - item.returned,
                  0
                );

                const originalLineTotal =
                  item.quantity * item.price;

                const returnedLineTotal =
                  item.returned * item.price;

                const remainingLineTotal =
                  remaining * item.price;

                const canReturn = remaining > 0;

                return (
                  <div
                    key={item.id}
                    className="px-4 py-4 sm:px-5"
                  >
                    {/* PRODUCT */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-base font-bold text-slate-900">
                          {item.product.name}
                        </div>

                        <div className="mt-1 text-sm text-slate-600">
                          Продано:{" "}
                          <span className="font-semibold">
                            {item.quantity}{" "}
                            {item.product.unit}
                          </span>{" "}
                          × {formatMoney(item.price)}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <div className="text-base font-bold text-slate-900">
                          {formatMoney(originalLineTotal)}
                        </div>

                        <div className="text-xs text-slate-500">
                          исходная стоимость
                        </div>
                      </div>
                    </div>

                    {/* RETURN INFO */}
                    {item.returned > 0 && (
                      <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-medium text-orange-800">
                            ↩️ Возвращено:{" "}
                            {item.returned}{" "}
                            {item.product.unit}
                          </div>

                          <div className="text-sm font-semibold text-orange-800">
                            −{formatMoney(returnedLineTotal)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* REMAINING */}
                    <div
                      className={`mt-3 rounded-xl px-3 py-3 ${
                        remaining === 0
                          ? "bg-slate-50"
                          : "bg-green-50"
                      }`}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div
                          className={`text-sm font-medium ${
                            remaining === 0
                              ? "text-slate-600"
                              : "text-green-800"
                          }`}
                        >
                          Осталось:{" "}
                          <span className="font-bold">
                            {remaining}{" "}
                            {item.product.unit}
                          </span>
                        </div>

                        <div
                          className={`text-sm font-bold ${
                            remaining === 0
                              ? "text-slate-600"
                              : "text-green-800"
                          }`}
                        >
                          {formatMoney(remainingLineTotal)}
                        </div>
                      </div>
                    </div>

                    {/* RETURN BUTTON */}
                    {canReturn && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            openReturnDialog(order, item)
                          }
                          className="w-full rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 active:scale-[0.99] sm:w-auto"
                        >
                          ↩️ Вернуть товар
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ORDER FOOTER */}
            <div className="border-t bg-slate-50 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {isReturned ? (
                    <div className="text-sm font-medium text-red-700">
                      🔴 Заказ полностью возвращён
                    </div>
                  ) : isPartialReturn ? (
                    <div className="text-sm font-medium text-orange-700">
                      🟠 По заказу оформлен частичный возврат
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-green-700">
                      🟢 Заказ оплачен и не возвращён
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() =>
                      openReceipt(order.id)
                    }
                    className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
                  >
                    🧾 Открыть чек
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteOrder(order)}
                    disabled={
                      deletingOrderId === order.id
                    }
                    className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                  >
                    {deletingOrderId === order.id
                      ? "Удаление…"
                      : `🗑️ Удалить заказ №${order.id}`}
                  </button>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  </div>

  {/* RETURN MODAL */}
  {returnDialog && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeReturnDialog();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              ↩️ Возврат товара
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {returnDialog.productName}
            </p>
          </div>

          <button
            type="button"
            onClick={closeReturnDialog}
            disabled={returning}
            className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="text-sm text-slate-500">
            Максимально можно вернуть
          </div>

          <div className="mt-1 text-lg font-bold text-slate-900">
            {returnDialog.maxQuantity} шт.
          </div>
        </div>

        {/* QUANTITY SELECTOR */}
        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold text-slate-700">
            Количество возврата
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={decreaseReturnQuantity}
              disabled={
                returning || returnQuantity <= 1
              }
              className="flex h-12 w-12 items-center justify-center rounded-xl border bg-white text-2xl font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>

            <div className="min-w-[80px] text-center">
              <div className="text-3xl font-bold text-slate-900">
                {returnQuantity}
              </div>

              <div className="text-xs text-slate-500">
                шт.
              </div>
            </div>

            <button
              type="button"
              onClick={increaseReturnQuantity}
              disabled={
                returning ||
                returnQuantity >=
                  returnDialog.maxQuantity
              }
              className="flex h-12 w-12 items-center justify-center rounded-xl border bg-white text-2xl font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={submitReturn}
            disabled={returning}
            className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {returning
              ? "Оформление…"
              : `↩️ Вернуть ${returnQuantity} шт.`}
          </button>

          <button
            type="button"
            onClick={closeReturnDialog}
            disabled={returning}
            className="rounded-xl border bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )}
</main>


);
}
