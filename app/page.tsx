import Link from "next/link";
import {
  Upload,
  ShoppingBag,
  BarChart3,
  LineChart,
  Settings,
  LayoutGrid,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

const tiles = [
  {
    href: "/upload",
    title: "Загрузка данных",
    description: "Импорт WB и Ozon, dry-run и диагностика",
    icon: Upload,
    primary: true,
  },
  {
    href: "/wb",
    title: "WB",
    description: "Таблица, динамика и проблемные позиции",
    icon: ShoppingBag,
  },
  {
    href: "/ozon",
    title: "Ozon",
    description: "Сводные метрики и показатели по артикулам",
    icon: ShoppingBag,
  },
  {
    href: "/summary",
    title: "Summary",
    description: "Главные сигналы и агрегации",
    icon: BarChart3,
  },
  {
    href: "/ab-tests",
    title: "A/B tests",
    description: "Результаты экспериментов",
    icon: LineChart,
  },
  {
    href: "/month",
    title: "Month",
    description: "Месячные итоги",
    icon: LayoutGrid,
  },
  {
    href: "/settings",
    title: "Settings",
    description: "Настройки и параметры импорта",
    icon: Settings,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-4xl font-bold">Analytic MP</h1>
          <p className="mt-2 text-muted-foreground">
            Быстрый доступ к загрузке отчетов и ключевым аналитическим разделам.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.href} href={tile.href} className="group">
                <Card
                  className={cn(
                    "h-full rounded-2xl border bg-background transition-all group-hover:-translate-y-1 group-hover:shadow-lg",
                    tile.primary && "border-primary/60 bg-primary/5"
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground",
                          tile.primary && "bg-primary text-primary-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{tile.title}</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                          {tile.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
