"use client";

import { useEffect, useState } from "react";

import StatsGrid from "@/components/stats-grid";
import SalesChart from "@/components/dashboard/SalesChart";
import TopProducts from "@/components/dashboard/TopProducts";
import Alerts from "@/components/dashboard/Alerts";
import QuickActions from "@/components/dashboard/QuickActions";
import Header from "@/components/dashboard/Header";

type Dashboard = {
  revenue: number;
  profit: number;
  orders: number;
  averageCheck: number;
  todayRevenue: number;
  todayProfit: number;
  todayOrders: number;
  products: number;
  lowStock: number;
  emptyStock: number;
  expiredBatches: number;
  expiringSoon: number;

  salesByDay: {
    date: string;
    revenue: number;
  }[];

  topProducts: {
    name: string;
    quantity: number;
  }[];

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

export default function HomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [writeOffs, setWriteOffs] = useState<any[]>([]);

  useEffect(() => {
    async function autoWriteOff() {
      try {
        const res = await fetch("/api/batches/auto-writeoff", {
          method: "POST",
        });


        const result = await res.json();

        if (result.count > 0) {
          setWriteOffs(result.items);
        }
      } catch (error) {
        console.error("Ошибка авто списания", error);
      }
    }

    async function start() {
      await autoWriteOff();
      await loadDashboard();
    }

    start();


  }, []);

  async function loadDashboard() {
    const res = await fetch("/api/dashboard");
    const json = await res.json();


    setData(json);

    const res2 = await fetch("/api/batches/expiring");
    const expiringData = await res2.json();

    setExpiring(expiringData);


  }

  if (!data) {
    return (<main className="min-h-screen bg-slate-100 flex items-center justify-center"> <p>Загрузка...</p> </main>
    );
  }

  return (<main className="min-h-screen bg-slate-100"> <div className="mx-auto max-w-5xl p-6"> <div className="mb-8 text-center">
    {writeOffs.length > 0 && (<div
      className="
             mb-6
             rounded-2xl
             border
             border-red-300
             bg-red-50
             p-5
           "
    > <h2
      className="
               text-xl
               font-bold
               text-red-700
             "
    >
        ⚠️ Автоматическое списание </h2>


      {writeOffs.map((item) => (
        <div
          key={item.id}
          className="
                mt-3
                rounded-xl
                bg-white
                p-4
                text-center
              "
        >
          <div className="text-xl font-bold">
            🥛 {item.productName}
          </div>

          <div className="mt-2 text-gray-600">
            🗑 Партия №{item.id}
          </div>

          <div className="mt-2">
            Списано: <b>{item.quantity} шт</b>
          </div>

          <div className="mt-2 text-red-600 font-semibold">
            Причина: истёк срок годности
          </div>
        </div>
      ))}
    </div>
    )}

    <Header />
  </div>

    <section className="mb-8">
      <h2 className="mb-4 text-2xl font-bold">📅 Сегодня</h2>

      <StatsGrid
        revenue={data.todayRevenue}
        profit={data.todayProfit}
        orders={data.todayOrders}
        products={data.products}
      />
    </section>

    <section className="mb-8">
      <SalesChart data={data.salesByDay} />
    </section>

    <section className="mb-8 grid gap-6 lg:grid-cols-2">
      <TopProducts data={data.topProducts} />

      <Alerts
        lowStock={data.lowStock}
        emptyStock={data.emptyStock}
        expiredBatches={data.expiredBatches}
        expiringSoon={data.expiringSoon}
        lowStockProducts={data.lowStockProducts}
        expiringProducts={data.expiringProducts}
      />
    </section>

    <section className="mb-8">
      <h2 className="mb-4 text-2xl font-bold">
        📊 За всё время
      </h2>

      <StatsGrid
        revenue={data.revenue}
        profit={data.profit}
        orders={data.orders}
        products={data.products}
      />
    </section>

    <QuickActions />
  </div>
  </main>


  );
}
