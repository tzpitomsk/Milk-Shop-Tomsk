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
    <div className="rounded-2xl bg-white p-5 shadow">

      <h2 className="mb-5 text-2xl font-bold">
        🛒 Корзина
      </h2>


      {items.length === 0 ? (

        <p className="text-gray-500">
          Корзина пустая
        </p>

      ) : (

        <div className="space-y-4">

          {items.map((item)=>(

            <div
              key={item.id}
              className="flex items-center justify-between border-b pb-3"
            >

              <div>

                <div className="font-semibold">
                  {item.name}
                </div>


                <div className="text-gray-500">
                  {item.price} ₽ × {item.quantity}
                </div>

              </div>


              <div className="flex items-center gap-2">


                <Button
                  variant="outline"
                  onClick={() => onRemove(item.id)}
                >
                  −
                </Button>


                <span className="w-6 text-center">
                  {item.quantity}
                </span>


                <Button
                  onClick={() => onAdd(item.id)}
                >
                  +
                </Button>


              </div>


            </div>

          ))}


        </div>

      )}

    </div>
  );
}