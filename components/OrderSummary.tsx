import { Button } from "@/components/ui/button";

type OrderSummaryProps = {
  total: number;
  onSave: () => void;
};

export default function OrderSummary({
  total,
  onSave,
}: OrderSummaryProps) {
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow">
      <div className="flex items-end justify-between gap-3">
        <span className="text-base font-semibold text-gray-600">
          Итого
        </span>

        <span className="text-3xl font-bold text-green-700">
          {total} ₽
        </span>
      </div>

      <Button
        onClick={onSave}
        className="mt-4 h-12 w-full rounded-xl bg-green-700 text-base font-bold text-white transition hover:bg-green-800"
      >
        🛒 Оформить заказ
      </Button>
    </div>
  );
}