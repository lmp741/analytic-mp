'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, Home, Upload, ShoppingBag, BarChart3, LineChart, Settings } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const navItems = [
  { href: '/', label: 'Главное меню', icon: Home },
  { href: '/upload', label: 'Загрузка', icon: Upload },
  { href: '/wb', label: 'WB', icon: ShoppingBag },
  { href: '/ozon', label: 'Ozon', icon: ShoppingBag },
  { href: '/summary', label: 'Summary', icon: BarChart3 },
  { href: '/ab-tests', label: 'A/B tests', icon: LineChart },
  { href: '/month', label: 'Month', icon: LineChart },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const primaryNav = navItems.slice(0, 5);
const secondaryNav = navItems.slice(5);

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Analytic MP
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {primaryNav.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  isActive && 'bg-accent text-accent-foreground'
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <details className="relative">
            <summary
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'cursor-pointer list-none'
              )}
            >
              More
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-lg border bg-background p-2 shadow-lg">
              {secondaryNav.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-accent',
                      isActive && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </details>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/upload" className={buttonVariants({ variant: 'default', size: 'sm' })}>
            Загрузить отчёты
          </Link>
        </div>

        <Dialog.Root>
          <Dialog.Trigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40" />
            <Dialog.Content className="fixed right-0 top-0 h-full w-72 border-l bg-background p-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-lg font-semibold">Навигация</span>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="sm">
                    Закрыть
                  </Button>
                </Dialog.Close>
              </div>
              <div className="flex flex-col gap-2">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Dialog.Close asChild key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-accent',
                          isActive && 'bg-accent text-accent-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </Dialog.Close>
                  );
                })}
                <Link
                  href="/upload"
                  className={cn(buttonVariants({ size: 'sm' }), 'mt-3')}
                >
                  Загрузить отчёты
                </Link>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
