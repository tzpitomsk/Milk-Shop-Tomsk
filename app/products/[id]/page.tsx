"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Batch = {
id: number;
quantity: number;
purchaseCost: number;
receivedAt: string;
expiryDate: string;
status: string;
productId: number;
};

type Supply = {
id: number;
date: string;
supplierId: number;
total: number;
};

type SupplyItem = {
id: number;
quantity: number;
cost: number;
productId: number;
supplyId: number;
supply: Supply;
};

type Order = {
id: number;
total: number;
profit: number;
date: string;
customerId: number | null;
status: string;
};

type OrderBatch = {
id: number;
quantity: number;
purchaseCost: number;
orderItemId: number;
batchId: number;
batch: Batch;
};

type OrderItem = {
id: number;
quantity: number;
returned: number;
price: number;
productId: number;
orderId: number;
order: Order;
batches: OrderBatch[];
};

type Movement = {
id: number;
type: string;
quantity: number;
comment: string | null;
createdAt: string;
productId: number;
};

type Statistics = {
soldQuantity: number;
returnedQuantity: number;
realSold: number;
revenue: number;
profit: number;
};

type Product = {
id: number;
name: string;
unit: string;
price: number;
cost: number;
stock: number;
barcode: string | null;

batches: Batch[];
supplyItems: SupplyItem[];
orderItems: OrderItem[];
movements: Movement[];

statistics: Statistics;
};

type ApiError = {
error?: string;
};

export default function ProductCardPage() {
const params = useParams();
const router = useRouter();

const id = params.id;

const [product, setProduct] = useState<Product | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

useEffect(() => {
if (!id) {
return;
}


loadProduct();


}, [id]);

async function loadProduct() {
try {
setLoading(true);
setError("");


  const res = await fetch(
    `/api/products/${id}/details`
  );

  const data: Product | ApiError =
    await res.json();

  if (!res.ok) {
    const errorData = data as ApiError;

    setError(
      errorData.error ||
        "Не удалось загрузить товар"
    );

    return;
  }

  setProduct(data as Product);
} catch (error) {
  console.error(
    "PRODUCT PAGE ERROR:",
    error
  );

  setError(
    "Ошибка соединения с сервером"
  );
} finally {
  setLoading(false);
}


}

if (loading) {
return ( <main className="min-h-screen bg-slate-100 p-5"> <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow"> <div className="text-lg">
Загрузка товара... </div> </div> </main>
);
}

if (error) {
return ( <main className="min-h-screen bg-slate-100 p-5"> <div className="mx-auto max-w-md space-y-4"> <div className="rounded-2xl bg-white p-6 text-center shadow"> <div className="mb-3 text-4xl">
❌ </div>


        <h1 className="mb-2 text-xl font-bold">
          Ошибка
        </h1>

        <p className="text-gray-600">
          {error}
        </p>
      </div>

      <button
        onClick={() => router.push("/products")}
        className="w-full rounded-xl bg-gray-200 py-3 font-bold"
      >
        ⬅️ Назад к товарам
      </button>
    </div>
  </main>
);


}

if (!product) {
return ( <main className="min-h-screen bg-slate-100 p-5"> <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow">
Товар не найден </div> </main>
);
}

/*

* Все партии, у которых есть физический остаток.
*
* Сюда специально попадают и EXPIRED партии.
* Они являются частью физического Product.stock и должны
* оставаться видимыми для контроля и списания.
  */
  const positiveBatches = product.batches.filter(
  (batch) => batch.quantity > 0
  );

/*

* Продаваемые партии.
*
* Для продажи партия должна:
* 1. иметь положительный остаток;
* 2. иметь ACTIVE статус;
* 3. быть уже полученной;
* 4. не иметь истёкший срок годности.
     */
     const now = new Date();

const sellableBatches = product.batches.filter(
(batch) => {
if (batch.quantity <= 0) {
return false;
}


  if (batch.status !== "ACTIVE") {
    return false;
  }

  const receivedAt =
    new Date(batch.receivedAt);

  const expiryDate =
    new Date(batch.expiryDate);

  return (
    receivedAt <= now &&
    expiryDate >= now
  );
}


);

const physicalStockFromBatches =
positiveBatches.reduce(
(sum, batch) =>
sum + batch.quantity,
0
);

const sellableStock =
sellableBatches.reduce(
(sum, batch) =>
sum + batch.quantity,
0
);

return ( <main className="min-h-screen bg-slate-100 p-4"> <div className="mx-auto max-w-md space-y-4">


    {/* ========================================= */}
    {/* ОСНОВНАЯ ИНФОРМАЦИЯ */}
    {/* ========================================= */}

    <div className="rounded-2xl bg-white p-6 shadow">

      <h1 className="mb-5 text-3xl font-bold text-green-700">
        🥛 {product.name}
      </h1>

      <div className="space-y-2 text-lg">

        <p>
          🏷 Штрихкод:
          <b>
            {" "}
            {product.barcode ||
              "Не указан"}
          </b>
        </p>

        <p>
          💰 Цена:
          <b>
            {" "}
            {product.price} ₽
          </b>
        </p>

        <p>
          📦 Себестоимость:
          <b>
            {" "}
            {product.cost} ₽
          </b>
        </p>

        <div className="mt-4 rounded-xl bg-green-50 p-4">
          <p className="font-bold text-green-700">
            📦 Физический остаток:
            {" "}
            {product.stock}{" "}
            {product.unit}
          </p>

          <p className="mt-2 font-bold text-blue-700">
            🛒 Можно продавать сейчас:
            {" "}
            {sellableStock}{" "}
            {product.unit}
          </p>

          {physicalStockFromBatches !==
            product.stock && (
            <p className="mt-2 text-sm font-bold text-red-600">
              ⚠️ Несовпадение остатка:
              партии =
              {" "}
              {physicalStockFromBatches}
              , товар =
              {" "}
              {product.stock}
            </p>
          )}

          {sellableStock <
            product.stock && (
            <p className="mt-2 text-sm text-gray-600">
              Часть физического остатка сейчас
              не продаётся: просроченные,
              будущие или неактивные партии.
            </p>
          )}
        </div>

      </div>

      {/* ===================================== */}
      {/* СТАТИСТИКА */}
      {/* ===================================== */}

      <div className="mt-6 rounded-2xl bg-slate-50 p-4">

        <h2 className="mb-4 text-2xl font-bold">
          📊 Статистика
        </h2>

        <div className="space-y-3 text-lg">

          <div className="flex justify-between gap-4">
            <span>
              🛒 Продано:
            </span>

            <b>
              {product.statistics.soldQuantity}{" "}
              {product.unit}
            </b>
          </div>

          <div className="flex justify-between gap-4">
            <span>
              ↩️ Возвращено:
            </span>

            <b className="text-orange-600">
              {product.statistics.returnedQuantity}{" "}
              {product.unit}
            </b>
          </div>

          <div className="flex justify-between gap-4">
            <span>
              ✅ Реально продано:
            </span>

            <b className="text-green-700">
              {product.statistics.realSold}{" "}
              {product.unit}
            </b>
          </div>

          <div className="flex justify-between gap-4">
            <span>
              💰 Выручка:
            </span>

            <b>
              {product.statistics.revenue} ₽
            </b>
          </div>

          <div className="flex justify-between gap-4 border-t pt-3">
            <span>
              📈 Прибыль:
            </span>

            <b className="text-green-700">
              {product.statistics.profit} ₽
            </b>
          </div>

        </div>

      </div>

    </div>

    {/* ========================================= */}
    {/* КНОПКИ */}
    {/* ========================================= */}

    <div className="space-y-3">

      <button
        onClick={() =>
          router.push(
            `/products/${product.id}/edit`
          )
        }
        className="w-full rounded-xl bg-yellow-500 py-3 text-lg font-bold text-white"
      >
        ✏️ Изменить товар
      </button>

      <button
        onClick={() =>
          router.push(
            `/supplies/new?product=${product.id}`
          )
        }
        className="w-full rounded-xl bg-green-700 py-3 text-lg font-bold text-white"
      >
        🚚 Добавить поставку
      </button>

      <button
        onClick={() =>
          router.push(
            `/orders/new?product=${product.id}`
          )
        }
        className="w-full rounded-xl bg-blue-600 py-3 text-lg font-bold text-white"
      >
        🛒 Добавить в заказ
      </button>

      <button
        onClick={() =>
          router.push(
            `/writeoff?product=${product.id}`
          )
        }
        className="w-full rounded-xl bg-red-600 py-3 text-lg font-bold text-white"
      >
        🗑 Списать товар
      </button>

      <button
        onClick={() =>
          router.push("/products")
        }
        className="w-full rounded-xl bg-gray-200 py-3 font-bold"
      >
        ⬅️ Назад к товарам
      </button>

    </div>

    {/* ========================================= */}
    {/* ПОСТАВКИ */}
    {/* ========================================= */}

    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-4 text-2xl font-bold">
        🚚 Поставки
      </h2>

      {product.supplyItems.length === 0 && (
        <p className="text-gray-500">
          Поставок нет
        </p>
      )}

      <div className="space-y-3">

        {product.supplyItems.map(
          (item) => (
            <div
              key={item.id}
              className="border-b py-3 last:border-b-0"
            >

              <div className="font-bold">
                Поставка №{item.supply.id}
              </div>

              <div>
                +{item.quantity}{" "}
                {product.unit}
              </div>

              <div>
                Цена закупки:{" "}
                <b>
                  {item.cost} ₽
                </b>
              </div>

              <div className="text-gray-500">
                {new Date(
                  item.supply.date
                ).toLocaleDateString(
                  "ru-RU"
                )}
              </div>

            </div>
          )
        )}

      </div>

    </div>

    {/* ========================================= */}
    {/* ПРОДАЖИ */}
    {/* ========================================= */}

    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-4 text-2xl font-bold">
        🛒 Продажи
      </h2>

      {product.orderItems.length === 0 && (
        <p className="text-gray-500">
          Продаж нет
        </p>
      )}

      <div className="space-y-3">

        {product.orderItems.map(
          (item) => {

            const realQuantity =
              item.quantity -
              item.returned;

            return (
              <div
                key={item.id}
                className="border-b py-3 last:border-b-0"
              >

                <div className="font-bold">
                  Заказ №{item.order.id}
                </div>

                <div>
                  Продано:{" "}
                  {item.quantity}{" "}
                  {product.unit}
                </div>

                {item.returned > 0 && (
                  <div className="font-bold text-red-600">
                    ↩️ Возвращено:{" "}
                    {item.returned}{" "}
                    {product.unit}
                  </div>
                )}

                <div className="font-bold text-green-700">
                  Реально:{" "}
                  {realQuantity}{" "}
                  {product.unit}
                </div>

                <div>
                  Сумма:{" "}
                  {item.price *
                    realQuantity}{" "}
                  ₽
                </div>

                <div className="text-gray-500">
                  {new Date(
                    item.order.date
                  ).toLocaleDateString(
                    "ru-RU"
                  )}
                </div>

              </div>
            );
          }
        )}

      </div>

    </div>

    {/* ========================================= */}
    {/* ПАРТИИ */}
    {/* ========================================= */}

    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-2 text-2xl font-bold">
        ⏰ Партии и срок годности
      </h2>

      <p className="mb-4 text-sm text-gray-600">
        Показаны все партии с физическим остатком.
        Продаваемый остаток рассчитывается отдельно.
      </p>

      {positiveBatches.length === 0 && (
        <p className="text-gray-500">
          Положительных партий нет
        </p>
      )}

      <div className="space-y-3">

        {positiveBatches.map(
          (batch) => {

            const today =
              new Date();

            const expiry =
              new Date(
                batch.expiryDate
              );

            const receivedAt =
              new Date(
                batch.receivedAt
              );

            const days = Math.ceil(
              (
                expiry.getTime() -
                today.getTime()
              ) /
              (1000 * 60 * 60 * 24)
            );

            const isSellable =
              batch.quantity > 0 &&
              batch.status === "ACTIVE" &&
              receivedAt <= today &&
              expiry >= today;

            return (
              <div
                key={batch.id}
                className={`
                  rounded-xl
                  border
                  p-4
                  ${
                    isSellable
                      ? "border-green-300 bg-green-50"
                      : "border-red-200 bg-red-50"
                  }
                `}
              >

                <div className="flex items-start justify-between gap-3">

                  <div className="font-bold">
                    📦 Партия №{batch.id}
                  </div>

                  <div
                    className={
                      isSellable
                        ? "rounded-lg bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                        : "rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-700"
                    }
                  >
                    {isSellable
                      ? "Можно продавать"
                      : "Не продаётся"}
                  </div>

                </div>

                <div className="mt-2">
                  Остаток:{" "}
                  <b>
                    {batch.quantity}{" "}
                    {product.unit}
                  </b>
                </div>

                <div>
                  Закупка:{" "}
                  <b>
                    {batch.purchaseCost} ₽
                  </b>
                </div>

                <div>
                  Получена:{" "}
                  <b>
                    {receivedAt.toLocaleDateString(
                      "ru-RU"
                    )}
                  </b>
                </div>

                <div>
                  Срок:{" "}
                  <b>
                    {expiry.toLocaleDateString(
                      "ru-RU"
                    )}
                  </b>
                </div>

                <div className="mt-1 text-sm text-gray-600">
                  Статус:{" "}
                  <b>
                    {batch.status}
                  </b>
                </div>

                <div
                  className={
                    days < 0
                      ? "mt-2 font-bold text-red-600"
                      : days <= 3
                        ? "mt-2 font-bold text-orange-500"
                        : "mt-2 font-bold text-green-600"
                  }
                >
                  {days < 0
                    ? "❌ Просрочено"
                    : days === 0
                      ? "⚠️ Сегодня заканчивается"
                      : `Осталось ${days} дн.`}
                </div>

              </div>
            );
          }
        )}

      </div>

    </div>

  </div>
</main>


);
}
