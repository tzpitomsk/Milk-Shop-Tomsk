"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Product = {
id: number;
name: string;
unit: string;
};

type Supplier = {
id: number;
name: string;
};

type SupplyItem = {
id: string;
productId: string;
quantity: string;
cost: string;
expiryDate: string;
};

function createSupplyItemId(): string {
return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function NewSupplyPage() {
const router = useRouter();
const searchParams = useSearchParams();

const [products, setProducts] = useState<Product[]>([]);
const [suppliers, setSuppliers] = useState<Supplier[]>([]);

const [supplierId, setSupplierId] = useState("");

const [items, setItems] = useState<SupplyItem[]>([
{
id: createSupplyItemId(),
productId: "",
quantity: "1",
cost: "",
expiryDate: "",
},
]);

const [saving, setSaving] = useState(false);
const [loading, setLoading] = useState(true);

// =================================
// Загрузка товаров и поставщиков
// =================================

useEffect(() => {
async function loadData() {
try {
setLoading(true);


    const [productsRes, suppliersRes] = await Promise.all([
      fetch("/api/products", {
        cache: "no-store",
      }),
      fetch("/api/suppliers", {
        cache: "no-store",
      }),
    ]);

    const productsData = await productsRes.json();
    const suppliersData = await suppliersRes.json();

    if (Array.isArray(productsData)) {
      setProducts(productsData);
    }

    if (Array.isArray(suppliersData)) {
      setSuppliers(suppliersData);
    }

    const productFromUrl = searchParams.get("product");

    if (productFromUrl) {
      setItems((currentItems) => {
        const firstItem = currentItems[0];

        if (!firstItem) {
          return currentItems;
        }

        return [
          {
            ...firstItem,
            productId: productFromUrl,
          },
          ...currentItems.slice(1),
        ];
      });
    }
  } catch (error) {
    console.error("LOAD SUPPLY DATA ERROR:", error);
    alert("Ошибка загрузки данных");
  } finally {
    setLoading(false);
  }
}

loadData();


}, [searchParams]);

// =================================
// Числовые значения
// =================================

function toNumber(value: string): number {
const normalized = value.replace(",", ".").trim();


if (!normalized) {
  return 0;
}

const number = Number(normalized);

return Number.isFinite(number) ? number : 0;


}

// =================================
// Расчёт итоговой суммы
// =================================

const total = useMemo(() => {
return items.reduce((sum, item) => {
const quantity = toNumber(item.quantity);
const cost = toNumber(item.cost);


  return sum + quantity * cost;
}, 0);


}, [items]);

// =================================
// Добавление позиции
// =================================

function addItem() {
setItems((currentItems) => [
...currentItems,
{
id: createSupplyItemId(),
productId: "",
quantity: "1",
cost: "",
expiryDate: "",
},
]);
}

// =================================
// Удаление позиции
// =================================

function removeItem(itemId: string) {
if (items.length === 1) {
return;
}


setItems((currentItems) =>
  currentItems.filter((item) => item.id !== itemId)
);


}

// =================================
// Изменение позиции
// =================================

function updateItem(
itemId: string,
field: keyof SupplyItem,
value: string
) {
setItems((currentItems) =>
currentItems.map((item) =>
item.id === itemId
? {
...item,
[field]: value,
}
: item
)
);
}

// =================================
// Сохранение поставки
// =================================

async function saveSupply() {
if (!supplierId) {
alert("Выберите поставщика");
return;
}


if (items.length === 0) {
  alert("Добавьте хотя бы один товар");
  return;
}

// Проверяем позиции
for (let index = 0; index < items.length; index++) {
  const item = items[index];
  const position = index + 1;

  const quantity = toNumber(item.quantity);
  const cost = toNumber(item.cost);

  if (!item.productId) {
    alert(`Выберите товар в позиции №${position}`);
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    alert(`Введите корректное количество в позиции №${position}`);
    return;
  }

  if (!Number.isInteger(cost) || cost <= 0) {
    alert(`Введите корректную цену закупки в позиции №${position}`);
    return;
  }

  if (!item.expiryDate) {
    alert(`Укажите срок годности в позиции №${position}`);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(`${item.expiryDate}T00:00:00`);

  if (Number.isNaN(expiry.getTime())) {
    alert(`Некорректный срок годности в позиции №${position}`);
    return;
  }

  if (expiry < today) {
    alert(`Срок годности уже прошёл в позиции №${position}`);
    return;
  }
}

// Проверяем, что один товар не добавлен дважды
const productIds = items.map((item) => item.productId);

const hasDuplicates =
  new Set(productIds).size !== productIds.length;

if (hasDuplicates) {
  alert(
    "Один и тот же товар нельзя добавить дважды. Объедините его в одну позицию."
  );
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
      total,
      items: items.map((item) => ({
        id: Number(item.productId),
        quantity: toNumber(item.quantity),
        cost: toNumber(item.cost),
        expiryDate: item.expiryDate,
      })),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data?.error || "Ошибка сохранения поставки");
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

if (loading) {
return ( <main className="min-h-screen bg-slate-100 p-4"> <div className="mx-auto max-w-2xl"> <div className="rounded-2xl bg-white p-6 text-center shadow">
Загрузка... </div> </div> </main>
);
}

return ( <main className="min-h-screen bg-slate-100 p-4"> <div className="mx-auto max-w-2xl"> <h1 className="mb-2 text-3xl font-bold text-green-700">
🚚 Новая поставка </h1>


    <p className="mb-6 text-sm text-gray-600">
      Добавьте один или несколько товаров в одну поставку
    </p>

    <div className="space-y-5 rounded-2xl bg-white p-5 shadow">
      {/* Поставщик */}

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          Поставщик
        </label>

        <select
          className="w-full rounded-xl border p-3"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          disabled={saving}
        >
          <option value="">Выберите поставщика</option>

          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>

      {/* Товары */}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              Товары
            </h2>

            <p className="text-sm text-gray-500">
              {items.length}{" "}
              {items.length === 1
                ? "позиция"
                : items.length < 5
                ? "позиции"
                : "позиций"}
            </p>
          </div>

          <button
            type="button"
            onClick={addItem}
            disabled={saving}
            className="rounded-xl bg-green-100 px-4 py-2 font-semibold text-green-800 hover:bg-green-200 disabled:opacity-50"
          >
            ➕ Добавить товар
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => {
            const quantity = toNumber(item.quantity);
            const cost = toNumber(item.cost);
            const lineTotal = quantity * cost;

            const selectedProductIds = items
              .filter((otherItem) => otherItem.id !== item.id)
              .map((otherItem) => otherItem.productId);

            return (
              <div
                key={item.id}
                className="rounded-2xl border bg-slate-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-gray-800">
                    Позиция №{index + 1}
                  </h3>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={saving}
                      className="rounded-lg px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      🗑 Удалить
                    </button>
                  )}
                </div>

                {/* Товар */}

                <div className="mb-3">
                  <label className="mb-1 block text-sm font-semibold text-gray-700">
                    Товар
                  </label>

                  <select
                    className="w-full rounded-xl border bg-white p-3"
                    value={item.productId}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "productId",
                        e.target.value
                      )
                    }
                    disabled={saving}
                  >
                    <option value="">Выберите товар</option>

                    {products.map((product) => (
                      <option
                        key={product.id}
                        value={product.id}
                        disabled={selectedProductIds.includes(
                          String(product.id)
                        )}
                      >
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Количество */}

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-gray-700">
                      Количество
                    </label>

                    <input
                      className="w-full rounded-xl border bg-white p-3"
                      type="text"
                      inputMode="numeric"
                      minLength={1}
                      placeholder="Например, 10"
                      value={item.quantity}
                      onChange={(e) => {
                        const value = e.target.value.replace(
                          /\D/g,
                          ""
                        );

                        updateItem(
                          item.id,
                          "quantity",
                          value
                        );
                      }}
                      disabled={saving}
                    />
                  </div>

                  {/* Цена */}

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-gray-700">
                      Закупочная цена за 1 шт.
                    </label>

                    <input
                      className="w-full rounded-xl border bg-white p-3"
                      type="text"
                      inputMode="numeric"
                      minLength={1}
                      placeholder="Например, 120"
                      value={item.cost}
                      onChange={(e) => {
                        const value = e.target.value.replace(
                          /\D/g,
                          ""
                        );

                        updateItem(
                          item.id,
                          "cost",
                          value
                        );
                      }}
                      disabled={saving}
                    />
                  </div>
                </div>

                {/* Срок годности */}

                <div className="mt-3">
                  <label className="mb-1 block text-sm font-semibold text-gray-700">
                    Срок годности
                  </label>

                  <input
                    className="w-full rounded-xl border bg-white p-3"
                    type="date"
                    value={item.expiryDate}
                    onChange={(e) =>
                      updateItem(
                        item.id,
                        "expiryDate",
                        e.target.value
                      )
                    }
                    disabled={saving}
                  />
                </div>

                {/* Сумма позиции */}

                <div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3">
                  <span className="text-sm text-gray-600">
                    Стоимость позиции
                  </span>

                  <span className="font-bold text-gray-900">
                    {lineTotal.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Общий итог */}

      <div className="rounded-2xl bg-green-50 p-5">
        <div className="flex items-center justify-between">
          <span className="text-gray-700">Товаров</span>

          <span className="font-semibold">
            {items.reduce(
              (sum, item) => sum + toNumber(item.quantity),
              0
            )}{" "}
            шт.
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-green-200 pt-3">
          <span className="text-lg font-bold text-gray-800">
            Итого поставка
          </span>

          <span className="text-2xl font-bold text-green-700">
            {total.toLocaleString("ru-RU")} ₽
          </span>
        </div>
      </div>

      {/* Сохранить */}

      <button
        type="button"
        onClick={saveSupply}
        disabled={saving}
        className="w-full rounded-xl bg-green-700 py-4 font-bold text-white hover:bg-green-800 disabled:bg-gray-400"
      >
        {saving ? "⏳ Сохранение..." : "💾 Сохранить поставку"}
      </button>

      {/* Назад */}

      <button
        type="button"
        onClick={() => router.push("/supplies")}
        disabled={saving}
        className="w-full rounded-xl bg-white py-3 font-semibold shadow hover:bg-gray-50"
      >
        ⬅️ Назад к поставкам
      </button>
    </div>
  </div>
</main>


);
}

export default function Page() {
return (
<Suspense fallback={<div className="p-5">Загрузка...</div>}> <NewSupplyPage /> </Suspense>
);
}
