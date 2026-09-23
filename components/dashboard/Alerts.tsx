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
  const alertItems = [
    {
      href: "/products",
      icon: "🟠",
      label: "Заканчиваются",
      value: lowStock,
      valueClass: "text-orange-600",
      bgClass: "bg-orange-50",
      hoverClass: "hover:bg-orange-100",
    },
    {
      href: "/products",
      icon: "🔴",
      label: "Нет в наличии",
      value: emptyStock,
      valueClass: "text-red-600",
      bgClass: "bg-red-50",
      hoverClass: "hover:bg-red-100",
    },
    {
      href: "/batches",
      icon: "⛔",
      label: "Просрочено",
      value: expiredBatches,
      valueClass: "text-red-600",
      bgClass: "bg-red-50",
      hoverClass: "hover:bg-red-100",
    },
    {
      href: "/batches",
      icon: "🕒",
      label: "До 7 дней",
      value: expiringSoon,
      valueClass: "text-orange-600",
      bgClass: "bg-yellow-50",
      hoverClass: "hover:bg-yellow-100",
    },
  ];

  const hasDetails =
    lowStockProducts.length > 0 || expiringProducts.length > 0;

  const everythingOk =
    lowStockProducts.length === 0 &&
    expiringProducts.length === 0 &&
    emptyStock === 0 &&
    expiredBatches === 0 &&
    expiringSoon === 0;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold text-slate-900">
        ⚠️ Что требует внимания
      </h2>

      <div className="grid grid-cols-2 gap-2">
        {alertItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex min-h-[62px] touch-manipulation items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition ${item.bgClass} ${item.hoverClass}`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-base">
                {item.icon}
              </span>

              <span className="truncate text-sm font-medium text-slate-700">
                {item.label}
              </span>
            </div>

            <b
              className={`shrink-0 text-lg ${item.valueClass}`}
            >
              {item.value}
            </b>
          </Link>
        ))}
      </div>

      {lowStockProducts.length > 0 && (
        <>
          <hr className="my-4" />

          <h3 className="mb-2 font-bold text-slate-900">
            📦 Нужно пополнить
          </h3>

          <div className="space-y-2">
            {lowStockProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-xl border border-orange-100 bg-orange-50/50 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">
                    {product.name}
                  </span>

                  <span className="whitespace-nowrap font-bold text-orange-600">
                    {product.stock} шт
                  </span>
                </div>

                <Link
                  href={`/supplies/new?product=${product.id}`}
                  className="mt-2.5 block rounded-lg bg-green-700 py-2 text-center text-sm font-semibold text-white transition hover:bg-green-800"
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
          <hr className="my-4" />

          <h3 className="mb-2 font-bold text-slate-900">
            ⏰ Ближайшие сроки годности
          </h3>

          <div className="space-y-2">
            {expiringProducts.map((batch) => (
              <Link
                key={batch.id}
                href={`/batches/${batch.id}`}
                className="block rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">
                    {batch.product?.name}
                  </span>

                  <span className="whitespace-nowrap font-bold">
                    {batch.quantity} шт
                  </span>
                </div>

                <div className="mt-1 text-xs text-gray-500">
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

      {everythingOk && (
        <div className="mt-3 rounded-xl bg-green-50 px-3 py-2.5 text-center text-sm font-semibold text-green-700">
          ✅ Всё в порядке. Требующих внимания товаров нет.
        </div>
      )}

      {!everythingOk && !hasDetails && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-center text-sm text-slate-500">
          Подробностей пока нет.
        </div>
      )}
    </div>
  );
}