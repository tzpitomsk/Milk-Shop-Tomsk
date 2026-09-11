type Product = {
  name: string;
  quantity: number;
};

type Props = {
  data: Product[];
};

export default function TopProducts({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">
          🏆 Самые популярные товары
        </h2>

        <p className="mt-4 text-gray-500">
          Пока нет данных
        </p>
      </div>
    );
  }

  const max = Math.max(...data.map((p) => p.quantity), 1);

  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">
        🏆 Самые популярные товары
      </h2>

      <div className="space-y-5">
        {data.map((product, index) => (
          <div key={product.name}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">
                {index === 0 && "🥇 "}
                {index === 1 && "🥈 "}
                {index === 2 && "🥉 "}
                {product.name}
              </span>

              <span className="font-bold text-green-700">
                {product.quantity} шт.
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-3 rounded-full bg-green-600 transition-all duration-700"
                style={{
                  width: `${(product.quantity / max) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}