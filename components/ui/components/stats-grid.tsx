import DashboardCard from "./dashboard-card";

export default function StatsGrid() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <DashboardCard title="Выручка" value="0 ₽" icon="💰" />
      <DashboardCard title="Прибыль" value="0 ₽" icon="📈" />
      <DashboardCard title="Заказы" value="0" icon="📦" />
      <DashboardCard title="Клиенты" value="0" icon="👥" />
    </div>
  );
}