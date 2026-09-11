"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Order = {
  id: number;
  total: number;
  date: string;
  items: {
    id: number;
    quantity: number;
    price: number;
    product: {
      name: string;
    };
  }[];
};

export default function HistoryPage() {

  const [orders, setOrders] = useState<Order[]>([]);


  useEffect(() => {

    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => {
        setOrders(data);
      });

  }, []);



  return (
    <main className="min-h-screen bg-slate-100 p-6 pb-24">

      <div className="mx-auto max-w-3xl">


        <h1 className="mb-6 text-3xl font-bold">
          📋 История заказов
        </h1>



        <div className="space-y-4">


          {orders.map((order) => (

            <div
              key={order.id}
              className="rounded-2xl bg-white p-5 shadow"
            >


              <div className="flex justify-between">

                <h2 className="text-xl font-bold">
                  Заказ №{order.id}
                </h2>


                <span className="font-bold">
                  {order.total} ₽
                </span>


              </div>



              <p className="mt-1 text-sm text-gray-500">
                {new Date(order.date).toLocaleString("ru-RU")}
              </p>




              <div className="mt-4 space-y-2">


                {order.items.map((item) => (

                  <div
                    key={item.id}
                    className="flex justify-between border-t pt-2"
                  >

                    <span>
                      {item.product.name} × {item.quantity}
                    </span>


                    <span>
                      {item.price * item.quantity} ₽
                    </span>


                  </div>

                ))}


              </div>



              <Link
                href={`/orders/${order.id}`}
                className="mt-5 block w-full rounded-xl bg-green-700 py-3 text-center font-bold text-white"
              >
                🧾 Открыть чек
              </Link>



            </div>

          ))}


        </div>


      </div>


    </main>
  );
}