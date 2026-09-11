import { Button } from "@/components/ui/button";

type ProductCardProps = {
  name: string;
  price: number;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
};

export default function ProductCard({
  name,
  price,
  quantity,
  onAdd,
  onRemove,
}: ProductCardProps) {
  return (
    <div className="rounded-2xl bg-white border shadow-sm p-4 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{name}</h3>
          <p className="text-green-700 font-bold">{price} ₽</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
          >
            −
          </Button>

          <span className="w-8 text-center font-bold">
            {quantity}
          </span>

          <Button
            size="sm"
            onClick={onAdd}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  );
}