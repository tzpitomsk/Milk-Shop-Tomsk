type DashboardCardProps = {
  title: string;
  value: string;
  icon: string;
};

export default function DashboardCard({
  title,
  value,
  icon,
}: DashboardCardProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>

      <h2 className="mt-4 text-3xl font-bold text-gray-900">
        {value}
      </h2>
    </div>
  );
}