"use client";

import { useEffect, useState } from "react";

export default function SalesPage() {

  const [sales, setSales] = useState<any>(null);


  useEffect(() => {

    fetch("/api/sales")
      .then((res) => res.json())
      .then((data) => setSales(data));

  }, []);


  if (!sales) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        Загрузка...
      </main>
    );
  }


  return (
    <main className="min-h-screen bg-slate-100 p-4">

      <div className="mx-auto max-w-md">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          📊 Продажи
        </h1>


        <div className="space-y-4">


          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-gray-500">
              Заказов
            </p>

            <p className="text-3xl font-bold">
              {sales.ordersCount}
            </p>
          </div>


          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-gray-500">
              Выручка
            </p>

            <p className="text-3xl font-bold">
              {sales.totalSales} ₽
            </p>
          </div>


          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-gray-500">
              Себестоимость
            </p>

            <p className="text-3xl font-bold">
              {sales.totalCost} ₽
            </p>
          </div>


          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-gray-500">
              💰 Прибыль
            </p>

            <p className="text-3xl font-bold text-green-700">
              {sales.totalProfit} ₽
            </p>
          </div>


          <div className="rounded-2xl bg-white p-5 shadow">

            <h2 className="mb-4 text-xl font-bold">
              🏆 Популярные товары
            </h2>


            {sales.popularProducts.map(
              (product:any) => (

              <div
                key={product.name}
                className="flex justify-between border-b py-2"
              >

                <span>
                  {product.name}
                </span>

                <span>
                  {product.quantity} шт.
                </span>

              </div>

            ))}


          </div>


        </div>

      </div>

    </main>
  );
}