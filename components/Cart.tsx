import { Button } from "@/components/ui/button";

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

type CartProps = {
  items: CartItem[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
};

export default function Cart({
  items,
  onAdd,
  onRemove,
}: CartProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <h2 className="mb-4 text-xl font-bold">
        🛒 Корзина
      </h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Корзина пустая
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const itemTotal = item.price * item.quantity;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {item.name}
                  </div>

                  <div className="mt-0.5 text-sm text-gray-500">
                    {item.price} ₽ × {item.quantity}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      onClick={() => onRemove(item.id)}
                      className="h-9 w-9 p-0 text-lg"
                      aria-label={`Уменьшить количество товара ${item.name}`}
                    >
                      −
                    </Button>

                    <span className="w-7 text-center font-semibold">
                      {item.quantity}
                    </span>

                    <Button
                      onClick={() => onAdd(item.id)}
                      className="h-9 w-9 p-0 text-lg"
                      aria-label={`Увеличить количество товара ${item.name}`}
                    >
                      +
                    </Button>
                  </div>

                  <div className="w-[72px] text-right font-bold">
                    {itemTotal} ₽
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}