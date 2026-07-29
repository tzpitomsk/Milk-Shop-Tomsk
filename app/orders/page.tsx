"use client";

import { useMemo, useState } from "react";
import { products } from "@/data/products";
import { Button } from "@/components/ui/button";

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

export default function OrdersPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
const [search, setSearch] = useState("");

const filteredProducts = useMemo(() => {
  return products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );
}, [search]);
  function addProduct(id: number) {
    const product = products.find((p) => p.id === id);

    if (!product) return;

    setCart((current) => {
      const existing = current.find((item) => item.id === id);

      if (existing) {
        return current.map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
function removeProduct(id: number) {
  setCart((current) => {
    return current
      .map((item) =>
        item.id === id
          ? { ...item, quantity: item.quantity - 1 }
          : item
      )
      .filter((item) => item.quantity > 0);
  });
}
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
        },
      ];
    });
  }
function saveOrder() {
  if (cart.length === 0) {
    alert("Корзина пуста");
    return;
  }

  const order = {
    id: Date.now().toString(),
    date: new Date().toLocaleString("ru-RU"),
    customer: "Без клиента",
    items: cart,
    total,
  };

  const saved = localStorage.getItem("orders");

  const orders = saved ? JSON.parse(saved) : [];

  orders.push(order);

  localStorage.setItem("orders", JSON.stringify(orders));

  alert("✅ Заказ сохранен");

  setCart([]);
}
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-24">

      <div className="mx-auto max-w-md">

        <h1 className="mb-6 text-3xl font-bold text-green-700">
          📦 Новый заказ
        </h1>
<input
  type="text"
  placeholder="🔍 Поиск товара..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="mb-4 w-full rounded-xl border bg-white p-3 outline-none focus:ring-2 focus:ring-green-600"
/>
        <div className="space-y-3">

          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between rounded-xl border bg-white p-4"
            >
              <div>
                <p className="font-semibold">{product.name}</p>
                <p className="text-sm text-gray-500">
                  {product.price} ₽
                </p>
              </div>

         <Button onClick={() => addProduct(product.id)}>
  Добавить
</Button>

            </div>
          ))}

        </div>

        <div className="mt-8 rounded-xl border bg-white p-5">

          <h2 className="text-xl font-bold">
            🛒 Корзина
          </h2>

          {cart.length === 0 ? (
            <p className="mt-3 text-gray-500">
              Пока нет товаров
            </p>
          ) : (
            <div className="mt-4 space-y-2">

              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between"
                >
                  <div className="flex items-center gap-3">
  <Button
    variant="outline"
    size="sm"
    onClick={() => removeProduct(item.id)}
  >
    −
  </Button>

  <span className="min-w-[120px]">
    {item.name} × {item.quantity}
  </span>

  <Button
    variant="outline"
    size="sm"
    onClick={() => addProduct(item.id)}
  >
    +
  </Button>
</div>

<strong>
  {item.price * item.quantity} ₽
</strong>
                </div>
              ))}

            </div>
          )}

        <div className="mt-6 border-t pt-4 flex justify-between text-xl font-bold">
  <span>Итого</span>
  <span>{total} ₽</span>
</div>

<Button
  onClick={saveOrder}
  className="mt-6 w-full h-12 rounded-xl bg-green-700 hover:bg-green-800"
>
  💾 Сохранить заказ
</Button>

        </div>

      </div>

    </main>
  );
}