import type { Metadata } from "next";

import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import BottomNav from "@/components/bottom-nav";
import ServiceWorkerRegister from "@/components/service-worker-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} min-h-full antialiased`}
    >
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