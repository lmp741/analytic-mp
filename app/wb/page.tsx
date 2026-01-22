'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatInt,
  formatPercent,
  formatMoney,
  getInvalidValueTooltip,
} from '@/lib/utils/formatting';
import { calcDeltaPercent } from '@/lib/utils/number';
import { MetricCell } from '@/components/metric-cell';

interface WeeklyMetric {
  artikul: string;
  impressions: number;
  visits: number;
  ctr: number;
  add_to_cart: number;
  cr_to_cart: number;
  orders: number;
  revenue: number | null;
  price_avg: number | null;
  stock_end: number | null;
  delivery_avg_hours: number | null;
  rating: number | null;
  reviews_count: number | null;
  delta_impressions?: number | null;
  delta_visits?: number | null;
  delta_ctr?: number | null;
  delta_orders?: number | null;
  delta_revenue?: number | null;
  delta_add_to_cart?: number | null;
  delta_cr_to_cart?: number | null;
  delta_price_avg?: number | null;
}

export default function WBDashboard() {
  const [metrics, setMetrics] = useState<WeeklyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtikul, setSelectedArtikul] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const supabase = createClient();
      
      // Get latest import
      const { data: latestImport, error: latestImportError } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'WB')
        .eq('status', 'IMPORTED')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestImportError && latestImportError.code !== 'PGRST116') {
        throw latestImportError;
      }

      if (!latestImport) {
        setLoading(false);
        return;
      }

      // Get previous week import
      const prevWeekStart = new Date(latestImport.period_start);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

      const { data: prevImport, error: prevImportError } = await supabase
        .from('imports')
        .select('id')
        .eq('marketplace', 'WB')
        .eq('period_start', prevWeekStartStr)
        .eq('status', 'IMPORTED')
        .maybeSingle();
      if (prevImportError && prevImportError.code !== 'PGRST116') {
        throw prevImportError;
      }

      // Get current metrics
      const { data: currentMetrics } = await supabase
        .from('weekly_metrics')
        .select('*')
        .eq('import_id', latestImport.id)
        .order('impressions', { ascending: false });

      if (!currentMetrics) {
        setLoading(false);
        return;
      }

      // Get previous metrics if available
      let prevMetricsMap = new Map<string, any>();
      if (prevImport) {
        const { data: prevMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', prevImport.id);

        if (prevMetrics) {
          prevMetrics.forEach((m) => {
            prevMetricsMap.set(m.artikul, m);
          });
        }
      }

      // Calculate deltas
      const metricsWithDeltas = currentMetrics.map((current) => {
        const prev = prevMetricsMap.get(current.artikul);
        return {
          ...current,
          delta_impressions: prev ? calcDeltaPercent(current.impressions, prev.impressions) : null,
          delta_visits: prev ? calcDeltaPercent(current.visits, prev.visits) : null,
          delta_ctr: prev ? calcDeltaPercent(current.ctr, prev.ctr) : null,
          delta_add_to_cart: prev ? calcDeltaPercent(current.add_to_cart, prev.add_to_cart) : null,
          delta_cr_to_cart: prev ? calcDeltaPercent(current.cr_to_cart, prev.cr_to_cart) : null,
          delta_orders: prev ? calcDeltaPercent(current.orders, prev.orders) : null,
          delta_revenue:
            prev && current.revenue !== null && prev.revenue !== null
              ? calcDeltaPercent(Number(current.revenue), Number(prev.revenue))
              : null,
          delta_price_avg:
            prev && current.price_avg !== null && prev.price_avg !== null
              ? calcDeltaPercent(Number(current.price_avg), Number(prev.price_avg))
              : null,
        };
      });

      setMetrics(metricsWithDeltas);
    } catch (error) {
      console.error('Error loading WB data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div>Загрузка...</div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">WB Dashboard</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              Нет данных для отображения. Загрузите данные на странице{' '}
              <Link href="/upload" className="text-blue-600 hover:underline">
                Загрузка данных
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedMetric = metrics.find((m) => m.artikul === selectedArtikul);

  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-8">WB Dashboard</h1>

      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Таблица</TabsTrigger>
          <TabsTrigger value="dynamics">Динамика</TabsTrigger>
          <TabsTrigger value="problem">Проблемные</TabsTrigger>
          <TabsTrigger value="ab-tests">A/B тесты</TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <div className="mb-6">
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 sticky left-0 bg-muted z-10">Артикул</th>
                  <th className="border p-2">Показы</th>
                  <th className="border p-2">Переходы</th>
                  <th className="border p-2">CTR</th>
                  <th className="border p-2">В корзину</th>
                  <th className="border p-2">CR</th>
                  <th className="border p-2">Заказы</th>
                  <th className="border p-2">Выручка</th>
                  <th className="border p-2">Ср. цена</th>
                  <th className="border p-2">Остаток</th>
                </tr>
              </thead>
              <tbody>
            {metrics.map((metric) => {
              return (
                <tr
                  key={metric.artikul}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedArtikul(metric.artikul)}
                >
                  <td className="border p-2 sticky left-0 bg-background font-medium">
                    {metric.artikul}
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.impressions) || undefined}
                  >
                    <MetricCell
                      value={formatInt(metric.impressions)}
                      deltaPct={metric.delta_impressions ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.visits) || undefined}
                  >
                    <MetricCell
                      value={formatInt(metric.visits)}
                      deltaPct={metric.delta_visits ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.ctr) || undefined}
                  >
                    <MetricCell
                      value={formatPercent(metric.ctr, 2)}
                      deltaPct={metric.delta_ctr ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.add_to_cart) || undefined}
                  >
                    <MetricCell
                      value={formatInt(metric.add_to_cart)}
                      deltaPct={metric.delta_add_to_cart ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.cr_to_cart) || undefined}
                  >
                    <MetricCell
                      value={formatPercent(metric.cr_to_cart, 2)}
                      deltaPct={metric.delta_cr_to_cart ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.orders) || undefined}
                  >
                    <MetricCell
                      value={formatInt(metric.orders)}
                      deltaPct={metric.delta_orders ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.revenue) || undefined}
                  >
                    <MetricCell
                      value={formatMoney(metric.revenue)}
                      deltaPct={metric.delta_revenue ?? null}
                    />
                  </td>
                  <td
                    className="border p-2"
                    title={getInvalidValueTooltip(metric.price_avg) || undefined}
                  >
                    <MetricCell
                      value={formatMoney(metric.price_avg)}
                      deltaPct={metric.delta_price_avg ?? null}
                    />
                  </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.stock_end) || undefined}
                      >
                        {formatInt(metric.stock_end)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedMetric && (
            <Card>
              <CardHeader>
                <CardTitle>Детали: {selectedMetric.artikul}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>Показы:</strong> {formatInt(selectedMetric.impressions)}
                  </div>
                  <div>
                    <strong>Переходы:</strong> {formatInt(selectedMetric.visits)}
                  </div>
                  <div>
                    <strong>CTR:</strong> {formatPercent(selectedMetric.ctr)}
                  </div>
                  <div>
                    <strong>В корзину:</strong> {formatInt(selectedMetric.add_to_cart)}
                  </div>
                  <div>
                    <strong>CR:</strong> {formatPercent(selectedMetric.cr_to_cart)}
                  </div>
                  <div>
                    <strong>Заказы:</strong> {formatInt(selectedMetric.orders)}
                  </div>
                  <div>
                    <strong>Выручка:</strong> {formatMoney(selectedMetric.revenue)}
                  </div>
                  <div>
                    <strong>Средняя цена:</strong> {formatMoney(selectedMetric.price_avg)}
                  </div>
                  {selectedMetric.delivery_avg_hours && (
                    <div>
                      <strong>Ср. время доставки:</strong>{' '}
                      {selectedMetric.delivery_avg_hours.toFixed(1)} ч
                    </div>
                  )}
                  {selectedMetric.rating && (
                    <div>
                      <strong>Рейтинг:</strong> {selectedMetric.rating.toFixed(2)}
                    </div>
                  )}
                  {selectedMetric.reviews_count && (
                    <div>
                      <strong>Отзывы:</strong> {formatInt(selectedMetric.reviews_count)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dynamics">
          <Card>
            <CardHeader>
              <CardTitle>Динамика</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Динамика по WB появится в следующем обновлении. Сейчас можно посмотреть изменения в
              таблице или перейти в Summary для общих сигналов.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="problem">
          <Card>
            <CardHeader>
              <CardTitle>Проблемные позиции</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Перейдите в <Link className="text-blue-600 hover:underline" href="/summary">Summary</Link>{' '}
              для списка проблемных артикула и сигналов.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ab-tests">
          <Card>
            <CardHeader>
              <CardTitle>A/B тесты</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Откройте <Link className="text-blue-600 hover:underline" href="/ab-tests">A/B tests</Link>{' '}
              чтобы увидеть эксперименты по WB.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
