import type { Metadata } from "next";

import "./globals.css";

import BottomNav from "@/components/bottom-nav";

import ServiceWorkerRegister from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: "Milk Shop",
  description: "Система управления магазином Milk Shop",
  icons: {
    icon: [
      {
        url: "/icon-192.png",
        type: "image/png",
      },
      {
        url: "/icon-512.png",
        type: "image/png",
      },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="min-h-full antialiased font-sans">
      <body className="min-h-screen flex flex-col bg-slate-100 pb-20">
        <ServiceWorkerRegister />
        {children}
        <div className="print:hidden">
          <BottomNav />
        </div>
      </body>
    </html>
  );
}