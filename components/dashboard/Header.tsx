"use client";

export default function Header() {
  const today = new Date();

  const date = today.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="relative mb-4 overflow-hidden rounded-[30px] bg-gradient-to-br from-blue-50 via-sky-50 to-blue-100 px-3 py-4 shadow-sm sm:px-5 sm:py-5">
      {/* Декоративные голубые элементы */}
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/80" />
      <div className="pointer-events-none absolute -right-10 bottom-[-38px] h-28 w-28 rounded-full bg-blue-200/50" />
      <div className="pointer-events-none absolute right-28 bottom-[-24px] h-12 w-24 rotate-[8deg] rounded-full bg-sky-300/35" />
      <div className="pointer-events-none absolute right-48 bottom-[-20px] h-10 w-16 rotate-[-20deg] rounded-full bg-sky-300/30" />

      <div className="relative flex items-center gap-2.5">
        {/* Логотип */}
        <div className="shrink-0 overflow-hidden rounded-[18px] shadow-sm">
          <img
            src="/apple-touch-icon.png"
            alt="Milk Shop"
            className="h-[68px] w-[68px] object-cover sm:h-[82px] sm:w-[82px]"
          />
        </div>

        {/* Название */}
        <div className="min-w-0 flex-1">
          <h1
            className="whitespace-nowrap text-[27px] font-extrabold leading-none tracking-[-1px] text-blue-700 sm:text-[38px]"
            style={{
              fontFamily:
                "ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif",
            }}
          >
            Milk Shop
          </h1>

          <p className="mt-1.5 text-[13px] font-medium leading-[1.15] text-slate-500 sm:text-base">
            Система управления
            <br />
            магазином
          </p>
        </div>

        {/* Сегодня / дата */}
        <div className="shrink-0 rounded-[20px] bg-white/90 px-2.5 py-2.5 text-center shadow-sm sm:px-5 sm:py-4">
          <p className="text-[12px] font-semibold text-slate-500 sm:text-sm">
            Сегодня
          </p>

          <p className="mt-1 max-w-[100px] text-[14px] font-bold leading-[1.15] text-blue-700 sm:max-w-[150px] sm:text-lg">
            {date}
          </p>
        </div>
      </div>
    </header>
  );
}