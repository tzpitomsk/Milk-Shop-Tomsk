import { Button } from "@/components/ui/button";

export default function QuickActions() {
  return (
    <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Быстрые действия</h2>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <Button variant="outline" className="h-16 rounded-2xl">
          🥛 Товары
        </Button>

        <Button variant="outline" className="h-16 rounded-2xl">
          👥 Клиенты
        </Button>

        <Button variant="outline" className="h-16 rounded-2xl">
          🚚 Доставка
        </Button>

        <Button variant="outline" className="h-16 rounded-2xl">
          💰 Финансы
        </Button>
      </div>
    </div>
  );
}