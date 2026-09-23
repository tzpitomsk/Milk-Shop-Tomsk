"use client";

import { useEffect, useState } from "react";
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

  const [suppliesOpen, setSuppliesOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadProduct();
  }, [id]);

  async function loadProduct() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/products/${id}/details`);
      const data: Product | ApiError = await res.json();

      if (!res.ok) {
        const errorData = data as ApiError;
        setError(errorData.error || "Не удалось загрузить товар");
        return;
      }

      setProduct(data as Product);
    } catch (error) {
      console.error("PRODUCT PAGE ERROR:", error);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-5">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow">
          <div className="text-lg">Загрузка товара...</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-100 p-5">
        <div className="mx-auto max-w-md space-y-4">
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <div className="mb-3 text-4xl">❌</div>
            <h1 className="mb-2 text-xl font-bold">Ошибка</h1>
            <p className="text-gray-600">{error}</p>
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
    return (
      <main className="min-h-screen bg-slate-100 p-5">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow">
          Товар не найден
        </div>
      </main>
    );
  }

  const activeBatches = product.batches.filter(
    (batch) => batch.quantity > 0
  );

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md space-y-4">
        {/* Основная информация о товаре */}
        <div className="rounded-2xl bg-white p-6 shadow">
          <h1 className="mb-5 text-3xl font-bold text-green-700">
            🥛 {product.name}
          </h1>

          <div className="space-y-2 text-lg">
            <p>
              🏷 Штрихкод: <b>{product.barcode || "Не указан"}</b>
            </p>

            <p>
              💰 Цена: <b>{product.price} ₽</b>
            </p>

            <p>
              📦 Себестоимость: <b>{product.cost} ₽</b>
            </p>

            <p className="font-bold text-green-700">
              🟢 Остаток: {product.stock} {product.unit}
            </p>
          </div>

          {/* Статистика */}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <h2 className="mb-4 text-2xl font-bold">📊 Статистика</h2>

            <div className="space-y-3 text-lg">
              <div className="flex justify-between gap-4">
                <span>🛒 Продано:</span>
                <b>
                  {product.statistics.soldQuantity} {product.unit}
                </b>
              </div>

              <div className="flex justify-between gap-4">
                <span>↩️ Возвращено:</span>
                <b className="text-orange-600">
                  {product.statistics.returnedQuantity} {product.unit}
                </b>
              </div>

              <div className="flex justify-between gap-4">
                <span>✅ Реально продано:</span>
                <b className="text-green-700">
                  {product.statistics.realSold} {product.unit}
                </b>
              </div>

              <div className="flex justify-between gap-4">
                <span>💰 Выручка:</span>
                <b>{product.statistics.revenue} ₽</b>
              </div>

              <div className="flex justify-between gap-4 border-t pt-3">
                <span>📈 Прибыль:</span>
                <b className="text-green-700">
                  {product.statistics.profit} ₽
                </b>
              </div>
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div className="space-y-3">
          <button
            onClick={() => router.push(`/products/${product.id}/edit`)}
            className="w-full rounded-xl bg-yellow-500 py-3 text-lg font-bold text-white"
          >
            ✏️ Изменить товар
          </button>

          <button
            onClick={() =>
              router.push(`/supplies/new?product=${product.id}`)
            }
            className="w-full rounded-xl bg-green-700 py-3 text-lg font-bold text-white"
          >
            🚚 Добавить поставку
          </button>

          <button
            onClick={() => router.push(`/orders/new?product=${product.id}`)}
            className="w-full rounded-xl bg-blue-600 py-3 text-lg font-bold text-white"
          >
            🛒 Добавить в заказ
          </button>

          <button
            onClick={() => router.push(`/writeoff?product=${product.id}`)}
            className="w-full rounded-xl bg-red-600 py-3 text-lg font-bold text-white"
          >
            🗑 Списать товар
          </button>

          <button
            onClick={() => router.push("/products")}
            className="w-full rounded-xl bg-gray-200 py-3 font-bold"
          >
            ⬅️ Назад к товарам
          </button>
        </div>

        {/* История поставок */}
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <button
            type="button"
            onClick={() => setSuppliesOpen((open) => !open)}
            className="flex w-full items-center justify-between p-5 text-left"
          >
            <div>
              <div className="text-xl font-bold">🚚 История поставок</div>
              <div className="mt-1 text-sm text-gray-500">
                Поставок: {product.supplyItems.length}
              </div>
            </div>

            <div className="ml-3 text-2xl text-gray-500">
              {suppliesOpen ? "▲" : "▼"}
            </div>
          </button>

          {suppliesOpen && (
            <div className="border-t px-6 pb-6">
              {product.supplyItems.length === 0 && (
                <p className="pt-4 text-gray-500">Поставок нет</p>
              )}

              <div className="space-y-3">
                {product.supplyItems.map((item) => (
                  <div
                    key={item.id}
                    className="border-b py-3 last:border-b-0"
                  >
                    <div className="font-bold">
                      Поставка №{item.supply.id}
                    </div>

                    <div>
                      +{item.quantity} {product.unit}
                    </div>

                    <div>
                      Цена закупки: <b>{item.cost} ₽</b>
                    </div>

                    <div className="text-gray-500">
                      {new Date(
                        item.supply.date
                      ).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* История продаж */}
        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <button
            type="button"
            onClick={() => setSalesOpen((open) => !open)}
            className="flex w-full items-center justify-between p-5 text-left"
          >
            <div>
              <div className="text-xl font-bold">🛒 История продаж</div>
              <div className="mt-1 text-sm text-gray-500">
                Заказов: {product.orderItems.length}
              </div>
            </div>

            <div className="ml-3 text-2xl text-gray-500">
              {salesOpen ? "▲" : "▼"}
            </div>
          </button>

          {salesOpen && (
            <div className="border-t px-6 pb-6">
              {product.orderItems.length === 0 && (
                <p className="pt-4 text-gray-500">Продаж нет</p>
              )}

              <div className="space-y-3">
                {product.orderItems.map((item) => {
                  const realQuantity = item.quantity - item.returned;

                  return (
                    <div
                      key={item.id}
                      className="border-b py-3 last:border-b-0"
                    >
                      <div className="font-bold">
                        Заказ №{item.order.id}
                      </div>

                      <div>
                        Продано: {item.quantity} {product.unit}
                      </div>

                      {item.returned > 0 && (
                        <div className="font-bold text-red-600">
                          ↩️ Возвращено: {item.returned} {product.unit}
                        </div>
                      )}

                      <div className="font-bold text-green-700">
                        Реально: {realQuantity} {product.unit}
                      </div>

                      <div>
                        Сумма: {item.price * realQuantity} ₽
                      </div>

                      <div className="text-gray-500">
                        {new Date(
                          item.order.date
                        ).toLocaleDateString("ru-RU")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Партии и сроки годности */}
        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold">
            ⏰ Партии и срок годности
          </h2>

          {activeBatches.length === 0 && (
            <p className="text-gray-500">Активных партий нет</p>
          )}

          <div className="space-y-3">
            {activeBatches.map((batch) => {
              const today = new Date();
              const expiry = new Date(batch.expiryDate);

              const days = Math.ceil(
                (expiry.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={batch.id}
                  className="rounded-xl border p-4"
                >
                  <div className="font-bold">
                    📦 Партия №{batch.id}
                  </div>

                  <div>
                    Остаток:{" "}
                    <b>
                      {batch.quantity} {product.unit}
                    </b>
                  </div>

                  <div>
                    Закупка: <b>{batch.purchaseCost} ₽</b>
                  </div>

                  <div>
                    Срок:{" "}
                    <b>
                      {expiry.toLocaleDateString("ru-RU")}
                    </b>
                  </div>

                  <div
                    className={
                      days < 0
                        ? "font-bold text-red-600"
                        : days <= 3
                          ? "font-bold text-orange-500"
                          : "font-bold text-green-600"
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
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
