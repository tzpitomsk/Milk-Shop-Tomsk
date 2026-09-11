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
  };

  batches: OrderBatchLink[];
};

type Order = {
  id: number;
  date: string;
  total: number;
  status: string;

  customer: {
    name: string;
  } | null;

  items: OrderItem[];
};

export default function OrderPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id;

  const [order, setOrder] =
    useState<Order | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [returningItemId, setReturningItemId] =
    useState<number | null>(null);

  // ============================================================
  // Загрузка заказа
  // ============================================================

  useEffect(() => {
    async function loadOrder() {
      try {
        setLoading(true);

        const res = await fetch(
          `/api/orders/${id}`,
          {
            cache: "no-store",
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error ||
            "Ошибка загрузки заказа"
          );
        }

        setOrder(data);
      } catch (error: any) {
        console.error(
          "LOAD ORDER ERROR:",
          error
        );

        alert(
          error?.message ||
          "Не удалось загрузить заказ"
        );
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadOrder();
    }
  }, [id]);

  // ============================================================
  // Загрузка
  // ============================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            Загрузка...
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // Заказ не найден
  // ============================================================

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl bg-white p-6 text-center shadow">

            <div className="text-xl font-bold">
              Заказ не найден
            </div>

            <button
              onClick={() =>
                router.push("/history")
              }
              className="mt-5 w-full rounded-xl bg-white py-3 font-semibold shadow"
            >
              ⬅️ Назад
            </button>

          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // ВАЖНО
  //
  // После проверки !order создаём локальную
  // константу. TypeScript теперь точно знает,
  // что здесь заказ НЕ null.
  // ============================================================

  const currentOrder = order;

  // ============================================================
  // Статусы
  // ============================================================

  const isFullyReturned =
    currentOrder.status === "RETURNED";

  const isPartiallyReturned =
    currentOrder.status ===
    "PARTIAL_RETURN";

  // ============================================================
  // Возврат товара
  // ============================================================

  async function handleReturn(
    item: OrderItem
  ) {
    const returned =
      item.returned ?? 0;

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
            "Content-Type":
              "application/json",
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
          data.error ||
          "Ошибка возврата"
        );

        return;
      }

      alert(
        `✅ Возвращено: ${quantity} шт.`
      );

      window.location.reload();
    } catch (error) {
      console.error(
        "RETURN ERROR:",
        error
      );

      alert(
        "Не удалось выполнить возврат"
      );
    } finally {
      setReturningItemId(null);
    }
  }

  // ============================================================
  // Удаление заказа
  // ============================================================

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


      alert(
        "✅ Заказ удалён"
      );


      router.push("/history");


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

  // ============================================================
  // Статус заказа
  // ============================================================

  function renderStatus() {
    if (isFullyReturned) {
      return (
        <div className="mt-3 text-center text-sm font-semibold text-red-600">
          🔴 Возвращён
        </div>
      );
    }

    if (isPartiallyReturned) {
      return (
        <div className="mt-3 text-center text-sm font-semibold text-orange-600">
          🟠 Частичный возврат
        </div>
      );
    }

    return (
      <div className="mt-3 text-center text-sm font-semibold text-green-600">
        🟢 Продан
      </div>
    );
  }

  // ============================================================
  // Текущая сумма заказа
  // ============================================================

  const currentTotal =
    currentOrder.items.reduce(
      (sum, item) => {
        const returned =
          item.returned ?? 0;

        const remaining =
          Math.max(
            item.quantity -
            returned,
            0
          );

        return (
          sum +
          item.price *
          remaining
        );
      },
      0
    );

  // ============================================================
  // Страница
  // ============================================================

  return (
    <main className="min-h-screen bg-slate-100 p-4">

      <div className="mx-auto max-w-md">

        {/* ================================================== */}
        {/* ЧЕК */}
        {/* ================================================== */}

        <div
          id="receipt"
          className="receipt rounded-2xl bg-white p-6 shadow"
        >

          {/* ЛОГОТИП */}

          <h1 className="text-center text-3xl font-bold text-green-700">
            🥛 Milk Shop
          </h1>

          {/* НОМЕР И ДАТА */}

          <div className="mt-4 text-center">

            <div className="text-xl font-bold">
              Чек №{currentOrder.id}
            </div>

            <div className="text-sm text-gray-500">
              {new Date(
                currentOrder.date
              ).toLocaleString(
                "ru-RU"
              )}
            </div>

            {renderStatus()}

          </div>

          {/* ================================================== */}
          {/* ТОВАРЫ */}
          {/* ================================================== */}

          <div className="mt-5 space-y-4 border-t pt-4">

            {currentOrder.items.map(
              (item) => {

                const returned =
                  item.returned ?? 0;

                const remaining =
                  Math.max(
                    item.quantity -
                    returned,
                    0
                  );

                const canReturn =
                  remaining > 0 &&
                  !isFullyReturned;

                const itemTotal =
                  item.price *
                  remaining;

                return (
                  <div
                    key={item.id}
                    className="border-b pb-3"
                  >

                    {/* НАЗВАНИЕ */}

                    <div className="flex justify-between gap-3">

                      <div className="min-w-0">

                        <div className="font-semibold">
                          {item.product.name}
                        </div>

                        <div className="text-sm text-gray-500">
                          {remaining} шт ×{" "}
                          {item.price} ₽
                        </div>

                      </div>

                      <div className="shrink-0 font-bold">
                        {itemTotal} ₽
                      </div>

                    </div>

                    {/* ВОЗВРАТ */}

                    {returned > 0 && (
                      <div className="mt-2 text-sm text-orange-600">
                        ↩️ Возвращено:{" "}
                        {returned} шт.
                      </div>
                    )}

                    {/* ПАРТИИ */}

                    {remaining > 0 &&
                      item.batches &&
                      item.batches.length >
                      0 && (
                        <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">

                          <div className="font-semibold">
                            📦 Партии:
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
                                  key={
                                    link.id
                                  }
                                  className="mt-1 text-gray-600"
                                >

                                  Партия №
                                  {
                                    link.batch
                                      .id
                                  }

                                  {" — "}

                                  {
                                    link.quantity
                                  }{" "}
                                  шт

                                  <br />

                                  Срок:{" "}
                                  {new Date(
                                    link
                                      .batch
                                      .expiryDate
                                  ).toLocaleDateString(
                                    "ru-RU"
                                  )}

                                </div>
                              );
                            }
                          )}

                        </div>
                      )}

                    {/* ВОЗВРАТ */}

                    {canReturn && (
                      <button
                        disabled={
                          returningItemId ===
                          item.id
                        }
                        onClick={() =>
                          handleReturn(
                            item
                          )
                        }
                        className="mt-3 w-full rounded-xl bg-orange-500 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >

                        {returningItemId ===
                          item.id
                          ? "⏳ Возврат..."
                          : `↩️ Вернуть ${item.product.name}`}

                      </button>
                    )}

                  </div>
                );
              }
            )}

          </div>

          {/* ================================================== */}
          {/* ИТОГО */}
          {/* ================================================== */}

          <div className="mt-5 flex justify-between border-t pt-4 text-xl font-bold">

            <span>
              Итого
            </span>

            <span>
              {currentTotal} ₽
            </span>

          </div>

          {/* ================================================== */}
          {/* КЛИЕНТ */}
          {/* ================================================== */}

          <div className="mt-4 border-t pt-4">

            <div className="font-semibold">
              Клиент:
            </div>

            <div className="text-gray-600">
              {currentOrder.customer
                ? currentOrder.customer.name
                : "Без клиента"}
            </div>

          </div>

          {/* ================================================== */}
          {/* НИЖНЯЯ НАДПИСЬ */}
          {/* ================================================== */}

          <div className="mt-4 text-center text-sm text-gray-500">
            Спасибо за покупку ❤️
          </div>

        </div>

        {/* ================================================== */}
        {/* КНОПКИ */}
        {/* ================================================== */}

        <div className="mt-5 space-y-3 print:hidden">

          {/* ПЕЧАТЬ */}

          <button
            onClick={() =>
              window.print()
            }
            className="w-full rounded-xl bg-green-700 py-3 font-bold text-white"
          >
            🖨 Печатать чек
          </button>

          {/* НАЗАД */}

          <button
            onClick={() =>
              router.push("/history")
            }
            className="w-full rounded-xl bg-white py-3 font-semibold shadow"
          >
            ⬅️ Назад
          </button>

          {/* НОВЫЙ ЗАКАЗ */}

          <button
            onClick={() =>
              router.push("/orders")
            }
            className="w-full rounded-xl bg-white py-3 font-semibold shadow"
          >
            🛒 Новый заказ
          </button>

          {/* УДАЛЕНИЕ ЗАКАЗА */}


          <button
            onClick={handleDeleteOrder}
            className="
    w-full
    rounded-xl
    bg-red-600
    py-3
    font-bold
    text-white
  "
          >
            🗑️ Удалить заказ №{currentOrder.id}
          </button>

        </div>

      </div>

    </main>
  );
}