"use client";

import "./print.css";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type OrderBatchLink = {
id: number;
quantity: number;
batch: {
id: number;
expiryDate: string;
};
};

type OrderItem = {
id: number;
quantity: number;
returned: number;
price: number;
product: {
id: number;
name: string;
unit?: string;
};
batches: OrderBatchLink[];
};

type Customer = {
id: number;
name: string;
phone?: string | null;
address?: string | null;
};

type Order = {
id: number;
date: string;
total: number;
profit: number;
status: string;
customer: Customer | null;
items: OrderItem[];
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

function getStatusLabel(status: string) {
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

function getStatusClass(status: string) {
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

export default function OrderPage() {
const params = useParams();
const router = useRouter();

const id = params.id;

const [order, setOrder] = useState<Order | null>(null);
const [loading, setLoading] = useState(true);

const [returningItemId, setReturningItemId] =
useState<number | null>(null);

useEffect(() => {
async function loadOrder() {
try {
setLoading(true);


    const res = await fetch(`/api/orders/${id}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.error || "Ошибка загрузки заказа"
      );
    }

    setOrder(data);
  } catch (error) {
    console.error("LOAD ORDER ERROR:", error);

    alert(
      error instanceof Error
        ? error.message
        : "Не удалось загрузить заказ"
    );
  } finally {
    setLoading(false);
  }
}

if (id) {
  loadOrder();
}


}, [id]);

if (loading) {
return ( <main className="min-h-screen bg-slate-50 px-4 py-6"> <div className="mx-auto max-w-md"> <div className="rounded-2xl border bg-white p-6 text-center shadow-sm"> <div className="text-lg font-medium text-slate-700">
Загрузка заказа… </div> </div> </div> </main>
);
}

if (!order) {
return ( <main className="min-h-screen bg-slate-50 px-4 py-6"> <div className="mx-auto max-w-md"> <div className="rounded-2xl border bg-white p-6 text-center shadow-sm"> <div className="text-xl font-bold text-slate-900">
Заказ не найден </div>


        <button
          type="button"
          onClick={() => router.push("/orders")}
          className="mt-5 w-full rounded-xl bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          ⬅️ Назад к заказам
        </button>
      </div>
    </div>
  </main>
);


}

const currentOrder = order;

const isFullyReturned =
currentOrder.status === "RETURNED";

const isPartiallyReturned =
currentOrder.status === "PARTIAL_RETURN";

const originalTotal = currentOrder.items.reduce(
(sum, item) =>
sum + item.quantity * item.price,
0
);

const returnedTotal = currentOrder.items.reduce(
(sum, item) =>
sum + item.returned * item.price,
0
);

const currentTotal = currentOrder.items.reduce(
(sum, item) => {
const returned = item.returned ?? 0;


  const remaining = Math.max(
    item.quantity - returned,
    0
  );

  return sum + item.price * remaining;
},
0


);

const hasReturns =
isFullyReturned ||
isPartiallyReturned ||
returnedTotal > 0;

async function handleReturn(item: OrderItem) {
const returned = item.returned ?? 0;


const available =
  item.quantity - returned;

if (available <= 0) {
  alert(
    "Этот товар уже полностью возвращён"
  );
  return;
}

const quantityText = prompt(
  `Сколько вернуть товара?\n\n` +
    `${item.product.name}\n` +
    `Продано: ${item.quantity} шт.\n` +
    `Уже возвращено: ${returned} шт.\n` +
    `Можно вернуть: ${available} шт.`
);

if (
  quantityText === null ||
  quantityText.trim() === ""
) {
  return;
}

const quantity = Number(
  quantityText.trim()
);

if (
  !Number.isInteger(quantity) ||
  quantity <= 0
) {
  alert(
    "Введите целое количество больше нуля"
  );
  return;
}

if (quantity > available) {
  alert(
    `Можно вернуть максимум ${available} шт.`
  );
  return;
}

try {
  setReturningItemId(item.id);

  const res = await fetch(
    `/api/orders/${currentOrder.id}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: item.id,
        quantity,
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    alert(
      data.error || "Ошибка возврата"
    );
    return;
  }

  alert(
    `✅ Возвращено: ${quantity} шт.`
  );

  window.location.reload();
} catch (error) {
  console.error("RETURN ERROR:", error);

  alert(
    "Не удалось выполнить возврат"
  );
} finally {
  setReturningItemId(null);
}


}

async function handleDeleteOrder() {
const confirmDelete = window.confirm(
`Удалить заказ №${currentOrder.id}?\n\n` +
`Товары будут возвращены на склад.`
);


if (!confirmDelete) {
  return;
}

try {
  const res = await fetch(
    `/api/orders/${currentOrder.id}`,
    {
      method: "DELETE",
    }
  );

  const data = await res.json();

  if (!res.ok) {
    alert(
      data.error ||
        "Ошибка удаления заказа"
    );
    return;
  }

  alert("✅ Заказ удалён");

  router.push("/orders");
} catch (error) {
  console.error(
    "DELETE ORDER ERROR:",
    error
  );

  alert(
    "Не удалось удалить заказ"
  );
}


}

return ( <main className="min-h-screen bg-slate-50 px-3 py-5 sm:px-5 sm:py-8"> <div className="mx-auto max-w-md">
{/* RECEIPT */} <div
       id="receipt"
       className="receipt overflow-hidden rounded-2xl border bg-white shadow-sm"
     >
{/* HEADER */} <div className="border-b px-5 py-6 text-center"> <h1 className="text-3xl font-bold text-green-700">
🥛 Milk Shop </h1>


        <div className="mt-4">
          <div className="text-xl font-bold text-slate-900">
            Чек №{currentOrder.id}
          </div>

          <div className="mt-1 text-sm text-slate-500">
            {formatDate(currentOrder.date)}
          </div>

          <div
            className={`mx-auto mt-3 w-fit rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
              currentOrder.status
            )}`}
          >
            {getStatusLabel(
              currentOrder.status
            )}
          </div>
        </div>
      </div>

      {/* CUSTOMER */}
      <div className="border-b px-5 py-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Клиент
        </div>

        <div className="mt-1 font-semibold text-slate-900">
          {currentOrder.customer
            ? currentOrder.customer.name
            : "Без клиента"}
        </div>

        {currentOrder.customer?.phone && (
          <div className="mt-1 text-sm text-slate-500">
            📞 {currentOrder.customer.phone}
          </div>
        )}
      </div>

      {/* ITEMS */}
      <div className="px-5">
        <div className="border-b py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Товары
          </div>
        </div>

        <div className="divide-y">
          {currentOrder.items.map(
            (item) => {
              const returned =
                item.returned ?? 0;

              const remaining = Math.max(
                item.quantity - returned,
                0
              );

              const originalLineTotal =
                item.quantity * item.price;

              const returnedLineTotal =
                returned * item.price;

              const remainingLineTotal =
                remaining * item.price;

              const canReturn =
                remaining > 0;

              return (
                <div
                  key={item.id}
                  className="py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900">
                        {item.product.name}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {remaining}{" "}
                        {item.product.unit ||
                          "шт."}{" "}
                        ×{" "}
                        {formatMoney(
                          item.price
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-bold text-slate-900">
                      {formatMoney(
                        remainingLineTotal
                      )}
                    </div>
                  </div>

                  {returned > 0 && (
                    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-orange-800">
                          ↩️ Возвращено{" "}
                          {returned}{" "}
                          {item.product.unit ||
                            "шт."}
                        </span>

                        <span className="font-semibold text-orange-800">
                          −
                          {formatMoney(
                            returnedLineTotal
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {canReturn && (
                    <button
                      type="button"
                      disabled={
                        returningItemId ===
                        item.id
                      }
                      onClick={() =>
                        handleReturn(item)
                      }
                      className="mt-3 w-full rounded-xl border border-orange-300 bg-orange-50 py-2.5 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
                    >
                      {returningItemId ===
                      item.id
                        ? "⏳ Возврат…"
                        : `↩️ Вернуть ${item.product.name}`}
                    </button>
                  )}

                  {/* ORIGINAL LINE TOTAL */}
                  {hasReturns && (
                    <div className="mt-2 text-xs text-slate-400">
                      Исходная стоимость:{" "}
                      {formatMoney(
                        originalLineTotal
                      )}
                    </div>
                  )}

                  {/* BATCHES */}
                  {remaining > 0 &&
                    item.batches &&
                    item.batches.length > 0 && (
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm print:hidden">
                        <div className="font-semibold text-slate-700">
                          📦 Партии
                        </div>

                        {item.batches.map(
                          (link) => {
                            if (
                              link.quantity <=
                              0
                            ) {
                              return null;
                            }

                            return (
                              <div
                                key={link.id}
                                className="mt-2 text-slate-500"
                              >
                                Партия №
                                {link.batch.id}
                                {" — "}
                                {link.quantity}{" "}
                                шт.
                                <br />
                                Срок:{" "}
                                {new Date(
                                  link.batch.expiryDate
                                ).toLocaleDateString(
                                  "ru-RU"
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* TOTALS */}
      <div className="border-t bg-slate-50 px-5 py-5">
        {hasReturns && (
          <div className="space-y-2 border-b pb-4">
            <div className="flex justify-between gap-4 text-sm text-slate-600">
              <span>Исходная сумма</span>

              <span className="font-semibold text-slate-800">
                {formatMoney(originalTotal)}
              </span>
            </div>

            <div className="flex justify-between gap-4 text-sm text-slate-600">
              <span>Возвращено</span>

              <span className="font-semibold text-orange-700">
                −
                {formatMoney(
                  returnedTotal
                )}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-4 pt-4">
          <span className="text-lg font-semibold text-slate-600">
            К оплате
          </span>

          <span className="text-3xl font-bold text-slate-900">
            {formatMoney(currentTotal)}
          </span>
        </div>

        {hasReturns && (
          <div className="mt-2 text-right text-xs text-slate-500">
            Сумма после возврата
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="px-5 py-5 text-center text-sm text-slate-500">
        Спасибо за покупку ❤️
      </div>
    </div>

    {/* ACTIONS */}
    <div className="mt-5 space-y-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="w-full rounded-xl bg-green-700 py-3 font-bold text-white transition hover:bg-green-800 active:scale-[0.98]"
      >
        🖨 Печатать чек
      </button>

      <button
        type="button"
        onClick={() => router.push("/orders")}
        className="w-full rounded-xl border bg-white py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
      >
        ⬅️ Назад к заказам
      </button>

      <button
        type="button"
        onClick={() => router.push("/orders/new")}
        className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
      >
        🛒 Новый заказ
      </button>

      <button
        type="button"
        onClick={handleDeleteOrder}
        className="w-full rounded-xl border border-red-200 bg-white py-3 font-bold text-red-700 transition hover:bg-red-50 active:scale-[0.98]"
      >
        🗑️ Удалить заказ №
        {currentOrder.id}
      </button>
    </div>
  </div>
</main>


);
}
