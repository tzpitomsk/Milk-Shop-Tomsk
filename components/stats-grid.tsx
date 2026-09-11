import DashboardCard from "./dashboard-card";

type Props = {
  revenue: number;
  profit: number;
  orders: number;
  products: number;
};

export default function StatsGrid({
  revenue,
  profit,
  orders,
  products,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <DashboardCard
        title="Выручка"
        value={`${revenue} ₽`}
        icon="💰"
      />

      <DashboardCard
        title="Прибыль"
        value={`${profit} ₽`}
        icon="📈"
      />

      <DashboardCard
        title="Заказы"
        value={String(orders)}
        icon="📦"
      />

      <DashboardCard
        title="Товары"
        value={String(products)}
        icon="🥛"
      />
    </div>
  );
}