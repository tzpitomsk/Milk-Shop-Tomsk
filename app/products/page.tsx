export default function ProductsPage() {
  const products = [
    { name: "🥛 Молоко 1,5 л", price: "170 ₽" },
    { name: "🧀 Сулугуни", price: "1700 ₽/кг" },
    { name: "🧀 Качотта", price: "2200 ₽/кг" },
    { name: "🥚 Яйца (10 шт.)", price: "180 ₽" },
    { name: "🥛 Сметана 500 мл", price: "450 ₽" },
  ];

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🥛 Товары
        </h1>

        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.name}
              className="rounded-xl bg-white p-4 shadow border"
            >
              <div className="flex justify-between">
                <span>{product.name}</span>

                <span className="font-bold text-green-700">
                  {product.price}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}