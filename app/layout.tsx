import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/app-header";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Analytic MP - Аналитика маркетплейсов",
  description: "Аналитика метрик WB и Ozon",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <AppHeader />
        <main className="min-h-screen bg-muted/10">{children}</main>
      </body>
    </html>
  );
}
