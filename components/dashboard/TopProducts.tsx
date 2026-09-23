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
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">
          🏆 Популярные товары
        </h2>

        <p className="mt-2 text-sm text-gray-500">
          Пока нет данных о продажах.
        </p>
      </div>
    );
  }

  const max = Math.max(
    ...data.map((product) => product.quantity),
    1
  );

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">
        🏆 Популярные товары
      </h2>

      <div className="space-y-3">
        {data.map((product, index) => (
          <div key={product.name}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {index === 0 && "🥇 "}
                {index === 1 && "🥈 "}
                {index === 2 && "🥉 "}
                {product.name}
              </span>

              <span className="shrink-0 font-bold text-blue-700">
                {product.quantity} шт.
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all duration-700"
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