"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function NewSupplyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");

  const [quantity, setQuantity] = useState(1);
  const [cost, setCost] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");

  const [saving, setSaving] = useState(false);

  // =================================
  // Загрузка товаров и поставщиков
  // =================================

  useEffect(() => {
    async function loadData() {
      try {
        const productsRes = await fetch("/api/products");
        const productsData = await productsRes.json();

        if (Array.isArray(productsData)) {
          setProducts(productsData);
        }

        const productFromUrl = searchParams.get("product");

        if (productFromUrl) {
          setProductId(productFromUrl);
        }

        const suppliersRes = await fetch("/api/suppliers");
        const suppliersData = await suppliersRes.json();

        if (Array.isArray(suppliersData)) {
          setSuppliers(suppliersData);
        }
      } catch (error) {
        console.error("LOAD SUPPLY DATA ERROR:", error);
        alert("Ошибка загрузки данных");
      }
    }

    loadData();
  }, [searchParams]);

  // =================================
  // Сохранение поставки
  // =================================

  async function saveSupply() {
    if (!supplierId) {
      alert("Выберите поставщика");
      return;
    }

    if (!productId) {
      alert("Выберите товар");
      return;
    }

    if (!quantity || quantity <= 0) {
      alert("Введите корректное количество");
      return;
    }

    if (!cost || cost <= 0) {
      alert("Введите цену закупки");
      return;
    }

    if (!expiryDate) {
      alert("Укажите срок годности");
      return;
    }

    // Проверяем срок годности
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(`${expiryDate}T00:00:00`);

    if (Number.isNaN(expiry.getTime())) {
      alert("Некорректный срок годности");
      return;
    }

    if (expiry < today) {
      alert("Срок годности уже прошёл");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/supplies", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          supplierId: Number(supplierId),

          total: quantity * cost,

          items: [
            {
              id: Number(productId),

              quantity: Number(quantity),

              cost: Number(cost),

              expiryDate,
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(
          data?.error ||
          "Ошибка сохранения поставки"
        );

        return;
      }

      alert("✅ Поставка успешно сохранена");

      router.push("/supplies");
      router.refresh();
    } catch (error) {
      console.error("SAVE SUPPLY ERROR:", error);

      alert("Ошибка соединения с сервером");
    } finally {
      setSaving(false);
    }
  }

  // =================================
  // Интерфейс
  // =================================

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🚚 Новая поставка
        </h1>

        <div className="space-y-4 rounded-2xl bg-white p-5 shadow">
          {/* Поставщик */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Поставщик
            </label>

            <select
              className="w-full rounded-xl border p-3"
              value={supplierId}
              onChange={(e) =>
                setSupplierId(e.target.value)
              }
              disabled={saving}
            >
              <option value="">
                Выберите поставщика
              </option>

              {suppliers.map((supplier) => (
                <option
                  key={supplier.id}
                  value={supplier.id}
                >
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Товар */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Товар
            </label>

            <select
              className="w-full rounded-xl border p-3"
              value={productId}
              onChange={(e) =>
                setProductId(e.target.value)
              }
              disabled={saving}
            >
              <option value="">
                Выберите товар
              </option>

              {products.map((product) => (
                <option
                  key={product.id}
                  value={product.id}
                >
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          {/* Количество */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Количество
            </label>

            <input
              className="w-full rounded-xl border p-3"
              type="number"
              min="1"
              placeholder="Сколько пришло"
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Number(e.target.value)
                )
              }
              disabled={saving}
            />
          </div>

          {/* Закупочная цена */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Закупочная цена за 1 шт
            </label>

            <input
              className="w-full rounded-xl border p-3"
              type="number"
              min="1"
              placeholder="Цена закупки"
              value={cost}
              onChange={(e) =>
                setCost(
                  Number(e.target.value)
                )
              }
              disabled={saving}
            />
          </div>

          {/* Срок годности */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Срок годности
            </label>

            <input
              className="w-full rounded-xl border p-3"
              type="date"
              value={expiryDate}
              onChange={(e) =>
                setExpiryDate(e.target.value)
              }
              disabled={saving}
            />
          </div>

          {/* Итог */}

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Количество</span>

              <span>
                {quantity} шт.
              </span>
            </div>

            <div className="mt-1 flex justify-between text-sm text-gray-600">
              <span>Закупка за шт.</span>

              <span>
                {cost} ₽
              </span>
            </div>

            <div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">
              <span>Итого</span>

              <span>
                {quantity * cost} ₽
              </span>
            </div>
          </div>

          {/* Сохранить */}

          <button
            onClick={saveSupply}
            disabled={saving}
            className="w-full rounded-xl bg-green-700 py-3 font-bold text-white disabled:bg-gray-400"
          >
            {saving
              ? "⏳ Сохранение..."
              : "💾 Сохранить поставку"}
          </button>

          {/* Назад */}

          <button
            type="button"
            onClick={() => router.push("/supplies")}
            disabled={saving}
            className="w-full rounded-xl bg-white py-3 font-semibold shadow"
          >
            ⬅️ Назад
          </button>
        </div>
      </div>
    </main>
  );


}


export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-5">
          Загрузка...
        </div>
      }
    >
      <NewSupplyPage />
    </Suspense>
  );
}