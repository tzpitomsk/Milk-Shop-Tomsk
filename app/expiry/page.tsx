"use client";

import { useEffect, useState } from "react";

type Batch = {
  id: number;
  quantity: number;
  expiryDate: string;
  receivedAt: string;
  product: {
    name: string;
    unit: string;
  };
};

export default function ExpiryPage() {
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    fetch("/api/batches")
      .then((res) => res.json())
      .then((data) => setBatches(data));
  }, []);

  function getDaysLeft(date: string) {
    const today = new Date();
    const expiry = new Date(date);

    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    return Math.ceil(
      (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-2xl">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          📅 Сроки годности
        </h1>

        <div className="space-y-4">

          {batches.map((batch) => {
            const days = getDaysLeft(batch.expiryDate);

            let color = "text-green-700";
            let status = "🟢 Свежий";

            if (days <= 7)
            {
              color = "text-yellow-600";
              status = "🟡 Скоро закончится";
            }

            if (days <= 0)
            {
              color = "text-red-600";
              status = "🔴 Просрочен";
            }

            return (
              <div
                key={batch.id}
                className="rounded-2xl bg-white p-5 shadow"
              >
                <h2 className="text-xl font-bold">
                  {batch.product.name}
                </h2>

                <p className="mt-2">
                  Количество:{" "}
                  <strong>
                    {batch.quantity} {batch.product.unit}
                  </strong>
                </p>

                <p>
                  Срок годности:
                  <strong className="ml-2">
                    {new Date(batch.expiryDate).toLocaleDateString()}
                  </strong>
                </p>

                <p className={`mt-3 font-bold ${color}`}>
                  {status} ({days} дн.)
                </p>

              </div>
            );
          })}

        </div>

      </div>
    </main>
  );
}