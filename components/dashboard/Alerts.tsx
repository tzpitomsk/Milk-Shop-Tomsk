"use client";

import Link from "next/link";

type Props = {
lowStock: number;
emptyStock: number;
expiredBatches: number;
expiringSoon: number;

lowStockProducts: {
id: number;
name: string;
stock: number;
}[];

expiringProducts: {
id: number;
productId: number;
quantity: number;
expiryDate: string;
product?: {
name: string;
};
}[];
};

export default function Alerts({
lowStock,
emptyStock,
expiredBatches,
expiringSoon,
lowStockProducts,
expiringProducts,
}: Props) {
return ( <div className="rounded-2xl bg-white p-5 shadow"> <h2 className="mb-4 text-xl font-bold">
⚠️ Что требует внимания </h2>


  <div className="space-y-2">
    <Link
      href="/products"
      className="flex items-center justify-between rounded-xl p-3 transition hover:bg-orange-50"
    >
      <span>🟠 Заканчиваются товары</span>
      <b className="text-orange-600">{lowStock}</b>
    </Link>

    <Link
      href="/products"
      className="flex items-center justify-between rounded-xl p-3 transition hover:bg-red-50"
    >
      <span>🔴 Нет в наличии</span>
      <b className="text-red-600">{emptyStock}</b>
    </Link>

    <Link
      href="/batches"
      className="flex items-center justify-between rounded-xl p-3 transition hover:bg-red-50"
    >
      <span>⛔ Просрочено</span>
      <b className="text-red-600">{expiredBatches}</b>
    </Link>

    <Link
      href="/batches"
      className="flex items-center justify-between rounded-xl p-3 transition hover:bg-yellow-50"
    >
      <span>🕒 До 7 дней</span>
      <b className="text-orange-600">{expiringSoon}</b>
    </Link>
  </div>

  {lowStockProducts.length > 0 && (
    <>
      <hr className="my-5" />

      <h3 className="mb-3 font-bold">
        📦 Нужно пополнить
      </h3>

      <div className="space-y-3">
        {lowStockProducts.map((product) => (
          <div
            key={product.id}
            className="rounded-xl border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">
                {product.name}
              </span>

              <span className="whitespace-nowrap font-bold text-orange-600">
                {product.stock} шт
              </span>
            </div>

            <Link
              href={`/supplies/new?product=${product.id}`}
              className="mt-3 block rounded-lg bg-green-700 py-2 text-center font-semibold text-white transition hover:bg-green-800"
            >
              🚚 Создать поставку
            </Link>
          </div>
        ))}
      </div>
    </>
  )}

  {expiringProducts.length > 0 && (
    <>
      <hr className="my-5" />

      <h3 className="mb-3 font-bold">
        ⏰ Ближайшие сроки годности
      </h3>

      <div className="space-y-3">
        {expiringProducts.map((batch) => (
          <Link
            key={batch.id}
            href={`/batches/${batch.id}`}
            className="block rounded-xl border p-3 transition hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">
                {batch.product?.name}
              </span>

              <span className="font-bold">
                {batch.quantity} шт
              </span>
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Партия №{batch.id}
            </div>

            <div className="mt-1 text-sm font-semibold text-orange-600">
              До:{" "}
              {new Date(batch.expiryDate).toLocaleDateString(
                "ru-RU"
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  )}

  {lowStockProducts.length === 0 &&
    expiringProducts.length === 0 &&
    emptyStock === 0 &&
    expiredBatches === 0 &&
    expiringSoon === 0 && (
      <div className="mt-5 rounded-xl bg-green-50 p-4 text-center font-semibold text-green-700">
        ✅ Всё в порядке. Требующих внимания товаров нет.
      </div>
    )}
</div>


);
}
