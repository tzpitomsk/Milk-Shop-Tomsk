"use client";

import Link from "next/link";

const actions = [
{
href: "/orders",
icon: "🛒",
title: "Новый заказ",
description: "Оформить продажу",
},
{
href: "/stock",
icon: "📦",
title: "Склад",
description: "Остатки товаров",
},
{
href: "/products",
icon: "🥛",
title: "Товары",
description: "Каталог товаров",
},
{
href: "/customers",
icon: "👥",
title: "Клиенты",
description: "База клиентов",
},
{
href: "/suppliers",
icon: "🚚",
title: "Поставщики",
description: "База поставщиков",
},
{
href: "/supplies",
icon: "🚚",
title: "Поставки",
description: "Приход товара",
},
{
href: "/batches",
icon: "📦",
title: "Партии",
description: "Сроки годности и списание",
},
{
href: "/finance",
icon: "💰",
title: "Финансы",
description: "Доходы и расходы",
},
];

export default function QuickActions() {
return ( <section className="space-y-4"> <div> <h2 className="text-xl font-semibold">Быстрые действия</h2> <p className="text-sm text-muted-foreground">
Основные разделы магазина </p> </div>


  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {actions.map((action) => (
      <Link
        key={action.href}
        href={action.href}
        className="group rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl">
            {action.icon}
          </div>

          <span className="text-muted-foreground transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold">{action.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {action.description}
          </p>
        </div>
      </Link>
    ))}
  </div>
</section>

);
}
