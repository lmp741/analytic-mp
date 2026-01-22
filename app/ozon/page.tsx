'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatInt, formatPercent, formatMoney, formatDelta } from '@/lib/utils/formatting';

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
      
      const { data: latestImport } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'OZON')
        .eq('status', 'IMPORTED')
        .order('period_start', { ascending: false })
        .limit(1)
        .single();

      if (!latestImport) {
        setLoading(false);
        return;
      }

      const prevWeekStart = new Date(latestImport.period_start);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

      const { data: prevImport } = await supabase
        .from('imports')
        .select('id')
        .eq('marketplace', 'OZON')
        .eq('period_start', prevWeekStartStr)
        .eq('status', 'IMPORTED')
        .single();

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
              <a href="/upload" className="text-blue-600 hover:underline">
                Загрузка данных
              </a>
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
              const drrDelta = formatDelta(metric.delta_drr, true); // Inverted
              return (
                <tr
                  key={metric.artikul}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedArtikul(metric.artikul)}
                >
                  <td className="border p-2 sticky left-0 bg-background font-medium">
                    {metric.artikul}
                  </td>
                  <td className="border p-2">
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
                  <td className="border p-2">{formatInt(metric.visits)}</td>
                  <td className="border p-2">
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
                  <td className="border p-2">{formatInt(metric.add_to_cart)}</td>
                  <td className="border p-2">{formatPercent(metric.cr_to_cart)}</td>
                  <td className="border p-2">{formatInt(metric.orders)}</td>
                  <td className="border p-2">{formatMoney(metric.revenue)}</td>
                  <td className="border p-2">{formatMoney(metric.price_avg)}</td>
                  <td className="border p-2">
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
                  <td className="border p-2">{formatInt(metric.stock_end)}</td>
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
              <div>
                <strong>ДРР:</strong> {formatPercent(selectedMetric.drr)}
              </div>
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
    </div>
  );
}
