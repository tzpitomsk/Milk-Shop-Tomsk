"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCustomerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  async function saveCustomer() {
  if (!name.trim()) {
    alert("Введите имя клиента");
    return;
  }

  const response = await fetch("/api/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      phone,
      address,
    }),
  });

  if (!response.ok) {
    alert("Ошибка сохранения клиента");
    return;
  }

  alert("✅ Клиент добавлен");

  router.push("/customers");
}

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          Новый клиент
        </h1>

        <input
          className="mb-4 w-full rounded-xl border p-3"
          placeholder="Имя"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="mb-4 w-full rounded-xl border p-3"
          placeholder="Телефон"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          className="mb-6 w-full rounded-xl border p-3"
          placeholder="Адрес"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <button
          onClick={saveCustomer}
          className="w-full rounded-xl bg-green-700 py-3 text-white font-semibold"
        >
          💾 Сохранить клиента
        </button>

      </div>
    </main>
  );
}