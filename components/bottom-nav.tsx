"use client";

import Link from "next/link";
import { useState } from "react";

const mainItems = [
{
href: "/",
icon: "🏠",
label: "Главная",
},
{
href: "/orders",
icon: "🛒",
label: "Заказы",
},
{
href: "/stock",
icon: "📦",
label: "Склад",
},
{
href: "/products",
icon: "🥛",
label: "Товары",
},
{
href: "/finance",
icon: "💰",
label: "Финансы",
},
];

const moreItems = [
{
href: "/customers",
icon: "👥",
label: "Клиенты",
},
{
href: "/suppliers",
icon: "🚚",
label: "Поставщики",
},
{
href: "/supplies",
icon: "🚚",
label: "Поставки",
},
{
href: "/batches",
icon: "📦",
label: "Партии",
},
];

export default function BottomNav() {
const [isMoreOpen, setIsMoreOpen] = useState(false);

return (
<>
{isMoreOpen && ( <div className="fixed bottom-[82px] left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border bg-white p-3 shadow-xl"> <div className="grid grid-cols-2 gap-2">
{moreItems.map((item) => (
<Link
key={item.href}
href={item.href}
onClick={() => setIsMoreOpen(false)}
className="flex items-center gap-3 rounded-xl border p-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
> <span className="text-xl">{item.icon}</span> <span>{item.label}</span> </Link>
))} </div> </div>
)}


  <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white shadow-lg print:hidden">
    <div className="mx-auto flex max-w-md justify-around py-2">
      {mainItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setIsMoreOpen(false)}
          className="flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50"
        >
          <span className="text-2xl">{item.icon}</span>
          <span className="mt-1 truncate">{item.label}</span>
        </Link>
      ))}

      <button
        type="button"
        onClick={() => setIsMoreOpen((open) => !open)}
        className="flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50"
      >
        <span className="text-2xl">☰</span>
        <span className="mt-1">Ещё</span>
      </button>
    </div>
  </nav>
</>


);
}
