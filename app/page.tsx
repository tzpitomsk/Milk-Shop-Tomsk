import { products } from "@/data/products";

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-3xl font-bold text-green-700">
          🥛 Товары
        </h1>

        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-sm text-gray-500">
                    Себестоимость: {product.cost} ₽ / {product.unit}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-bold text-green-700">
                    {product.price} ₽
                  </p>
                  <p className="text-xs text-gray-500">
                    за {product.unit}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}