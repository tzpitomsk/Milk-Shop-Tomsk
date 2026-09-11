"use client";

import { useEffect, useState } from "react";


type Finance = {
  revenueToday: number;
  profitToday: number;
  ordersToday: number;

  revenueTotal: number;
  profitTotal: number;
  ordersTotal: number;

  averageCheck: number;
};



export default function FinancePage() {


  const [data, setData] = useState<Finance | null>(null);



  useEffect(() => {


    fetch("/api/finance")

      .then((res) => res.json())

      .then((data) => {

        setData(data);

      });


  }, []);





  if (!data) {

    return (

      <main className="min-h-screen bg-slate-100 p-6">

        Загрузка...

      </main>

    );

  }






  return (

    <main className="min-h-screen bg-slate-100 p-4 pb-24">


      <div className="mx-auto max-w-md">



        <h1 className="mb-6 text-3xl font-bold text-green-700">

          💰 Финансы

        </h1>





        <h2 className="mb-3 text-xl font-bold">

          📅 Сегодня

        </h2>




        <div className="grid grid-cols-2 gap-4 mb-8">


          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              💵 Выручка

            </p>

            <p className="text-2xl font-bold text-green-700">

              {data.revenueToday} ₽

            </p>

          </div>





          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              📈 Прибыль

            </p>

            <p className="text-2xl font-bold text-green-700">

              {data.profitToday} ₽

            </p>

          </div>





          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              🛒 Заказы

            </p>

            <p className="text-2xl font-bold">

              {data.ordersToday}

            </p>

          </div>





          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              🧾 Средний чек

            </p>

            <p className="text-2xl font-bold">

              {data.averageCheck} ₽

            </p>

          </div>



        </div>







        <h2 className="mb-3 text-xl font-bold">

          📊 За всё время

        </h2>






        <div className="space-y-4">



          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              💰 Общая выручка

            </p>

            <p className="text-2xl font-bold">

              {data.revenueTotal} ₽

            </p>

          </div>





          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              📈 Общая прибыль

            </p>

            <p className="text-2xl font-bold">

              {data.profitTotal} ₽

            </p>

          </div>





          <div className="rounded-2xl bg-white p-5 shadow">

            <p className="text-gray-500">

              📦 Всего заказов

            </p>

            <p className="text-2xl font-bold">

              {data.ordersTotal}

            </p>

          </div>



        </div>



      </div>


    </main>

  );


}