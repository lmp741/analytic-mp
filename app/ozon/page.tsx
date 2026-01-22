'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatInt,
  formatPercent,
  formatMoney,
  formatDelta,
  getInvalidValueTooltip,
} from '@/lib/utils/formatting';

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
  drr: number | null;
  stock_end: number | null;
  rating: number | null;
  reviews_count: number | null;
  delta_impressions?: number | null;
  delta_visits?: number | null;
  delta_ctr?: number | null;
  delta_orders?: number | null;
  delta_revenue?: number | null;
  delta_drr?: number | null;
}

export default function OzonDashboard() {
  const [metrics, setMetrics] = useState<WeeklyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtikul, setSelectedArtikul] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const supabase = createClient();
      
      const { data: latestImport, error: latestImportError } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'OZON')
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

      const prevWeekStart = new Date(latestImport.period_start);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

      const { data: prevImport, error: prevImportError } = await supabase
        .from('imports')
        .select('id')
        .eq('marketplace', 'OZON')
        .eq('period_start', prevWeekStartStr)
        .eq('status', 'IMPORTED')
        .maybeSingle();
      if (prevImportError && prevImportError.code !== 'PGRST116') {
        throw prevImportError;
      }

      const { data: currentMetrics } = await supabase
        .from('weekly_metrics')
        .select('*')
        .eq('import_id', latestImport.id)
        .order('impressions', { ascending: false });

      if (!currentMetrics) {
        setLoading(false);
        return;
      }

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

      const metricsWithDeltas = currentMetrics.map((current) => {
        const prev = prevMetricsMap.get(current.artikul);
        return {
          ...current,
          delta_impressions: prev
            ? current.impressions - prev.impressions
            : null,
          delta_visits: prev ? current.visits - prev.visits : null,
          delta_ctr: prev ? current.ctr - prev.ctr : null,
          delta_orders: prev ? current.orders - prev.orders : null,
          delta_revenue: prev && current.revenue && prev.revenue
            ? Number(current.revenue) - Number(prev.revenue)
            : null,
          delta_drr: prev && current.drr !== null && prev.drr !== null
            ? current.drr - prev.drr
            : null,
        };
      });

      setMetrics(metricsWithDeltas);
    } catch (error) {
      console.error('Error loading Ozon data:', error);
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
        <h1 className="text-3xl font-bold mb-8">Ozon Dashboard</h1>
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
      <h1 className="text-3xl font-bold mb-8">Ozon Dashboard</h1>

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
                  <th className="border p-2">ДРР</th>
                  <th className="border p-2">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => {
                  const impressionsDelta = formatDelta(metric.delta_impressions);
                  const ctrDelta = formatDelta(metric.delta_ctr);
                  const drrDelta = formatDelta(metric.delta_drr, true);
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
                        {formatInt(metric.impressions)}
                        {impressionsDelta.isPositive !== null && (
                          <span
                            className={`ml-2 text-xs ${
                              impressionsDelta.isPositive ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {impressionsDelta.text}
                          </span>
                        )}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.visits) || undefined}
                      >
                        {formatInt(metric.visits)}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.ctr) || undefined}
                      >
                        {formatPercent(metric.ctr)}
                        {ctrDelta.isPositive !== null && (
                          <span
                            className={`ml-2 text-xs ${
                              ctrDelta.isPositive ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {ctrDelta.text}
                          </span>
                        )}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.add_to_cart) || undefined}
                      >
                        {formatInt(metric.add_to_cart)}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.cr_to_cart) || undefined}
                      >
                        {formatPercent(metric.cr_to_cart)}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.orders) || undefined}
                      >
                        {formatInt(metric.orders)}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.revenue) || undefined}
                      >
                        {formatMoney(metric.revenue)}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.price_avg) || undefined}
                      >
                        {formatMoney(metric.price_avg)}
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(metric.drr) || undefined}
                      >
                        {formatPercent(metric.drr)}
                        {drrDelta.isPositive !== null && (
                          <span
                            className={`ml-2 text-xs ${
                              drrDelta.isPositive ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {drrDelta.text}
                          </span>
                        )}
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
                  {selectedMetric.stock_end !== null && (
                    <div>
                      <strong>Остаток:</strong> {formatInt(selectedMetric.stock_end)}
                    </div>
                  )}
                  {selectedMetric.drr !== null && (
                    <div>
                      <strong>ДРР:</strong> {formatPercent(selectedMetric.drr)}
                    </div>
                  )}
                  {selectedMetric.rating !== null && (
                    <div>
                      <strong>Рейтинг:</strong> {selectedMetric.rating.toFixed(2)}
                    </div>
                  )}
                  {selectedMetric.reviews_count !== null && (
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
              Здесь появится динамика по Ozon. Пока можно ориентироваться на изменения в таблице или
              открыть Summary.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="problem">
          <Card>
            <CardHeader>
              <CardTitle>Проблемные позиции</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Откройте <Link className="text-blue-600 hover:underline" href="/summary">Summary</Link>{' '}
              чтобы увидеть проблемные товары и сигналы.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ab-tests">
          <Card>
            <CardHeader>
              <CardTitle>A/B тесты</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Перейдите в <Link className="text-blue-600 hover:underline" href="/ab-tests">A/B tests</Link>{' '}
              для экспериментов по Ozon.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
