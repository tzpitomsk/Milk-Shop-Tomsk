import { Button } from "@/components/ui/button";

export default function AppHeader() {
  return (
    <header className="rounded-b-3xl bg-green-700 px-6 py-8 text-white shadow-lg">
      <h1 className="text-4xl font-bold">🥛 Milk Shop Tomsk</h1>

      <p className="mt-2 text-green-100">
        Управление фермерским хозяйством
      </p>

      <Button
        className="mt-6 h-14 w-full rounded-2xl bg-white text-lg text-green-700 hover:bg-green-50"
      >
        ➕ Новый заказ
      </Button>
    </header>
  );
}