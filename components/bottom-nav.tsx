import Link from "next/link";

const items = [
  {
    href: "/",
    icon: "🏠",
    label: "Главная",
  },
  {
    href: "/orders",
    icon: "📦",
    label: "Заказы",
  },
  {
    href: "/products",
    icon: "🥛",
    label: "Товары",
  },
  {
    href: "/finance",
    icon: "💰",
    label: "Финансы",
  },
  {
    href: "/settings",
    icon: "⚙️",
    label: "Еще",
  },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white">
      <div className="mx-auto flex max-w-md justify-around py-3">

        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center text-xs text-gray-700"
          >
            <span className="text-2xl">
              {item.icon}
            </span>

            {item.label}
          </Link>
        ))}

      </div>
    </nav>
  );
}