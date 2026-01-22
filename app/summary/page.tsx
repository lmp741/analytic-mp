'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  formatInt,
  formatPercent,
  formatMoney,
  getInvalidValueTooltip,
} from '@/lib/utils/formatting';
import { calcDeltaPercent } from '@/lib/utils/number';
import { MetricCell } from '@/components/metric-cell';

interface SummaryRow {
  artikul: string;
  marketplace: 'WB' | 'OZON';
  impressions: number;
  price_avg: number | null;
  ctr: number;
  cr_to_cart: number;
  orders: number;
  revenue: number | null;
  drr: number | null;
  delta_ctr: number | null;
  delta_cr_to_cart: number | null;
  delta_orders: number | null;
  delta_revenue: number | null;
  delta_drr: number | null;
  delta_impressions: number | null;
  delta_price_avg: number | null;
  signals: string[];
  severity: number;
}

export default function SummaryPage() {
  const [wbRows, setWbRows] = useState<SummaryRow[]>([]);
  const [ozonRows, setOzonRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const supabase = createClient();

      // Load settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError;
      }
      setSettings(settingsData);

      // Load WB latest
      const { data: wbImport, error: wbImportError } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'WB')
        .eq('status', 'IMPORTED')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (wbImportError && wbImportError.code !== 'PGRST116') {
        throw wbImportError;
      }

      // Load Ozon latest
      const { data: ozonImport, error: ozonImportError } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'OZON')
        .eq('status', 'IMPORTED')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ozonImportError && ozonImportError.code !== 'PGRST116') {
        throw ozonImportError;
      }

      if (!settingsData) {
        setLoading(false);
        return;
      }

      const minImpressions = settingsData.summary_min_impressions;
      const ignorePrevZero = settingsData.ignore_prev_zero;
      const maxRows = settingsData.summary_max_rows_per_mp ?? 50;

      const calcDeltaPct = (current: number, previous: number | null | undefined) =>
        calcDeltaPercent(current, previous ?? null, ignorePrevZero);

      const toFraction = (pct: number | null) => (pct === null ? null : pct / 100);

      // Process WB
      if (wbImport) {
        const prevWeekStart = new Date(wbImport.period_start);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

        const { data: prevWbImport, error: prevWbError } = await supabase
          .from('imports')
          .select('id')
          .eq('marketplace', 'WB')
          .eq('period_start', prevWeekStartStr)
          .maybeSingle();
        if (prevWbError && prevWbError.code !== 'PGRST116') {
          throw prevWbError;
        }

        const { data: wbMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', wbImport.id)
          .gte('impressions', minImpressions);

        let prevWbMap = new Map<string, any>();
        if (prevWbImport) {
          const { data: prevWbMetrics } = await supabase
            .from('weekly_metrics')
            .select('*')
            .eq('import_id', prevWbImport.id);

          if (prevWbMetrics) {
            prevWbMetrics.forEach((m) => prevWbMap.set(m.artikul, m));
          }
        }

        const wbSummary = (wbMetrics || [])
          .map((current) => {
            const prev = prevWbMap.get(current.artikul);
            const signals: string[] = [];

            if (prev) {
              const ctrDelta = calcDeltaPct(current.ctr, prev.ctr);
              const crDelta = calcDeltaPct(current.cr_to_cart, prev.cr_to_cart);
              const ordersDelta = calcDeltaPct(current.orders, prev.orders);
              const revenueDelta =
                current.revenue !== null && prev.revenue !== null
                  ? calcDeltaPct(Number(current.revenue), Number(prev.revenue))
                  : null;

              if (toFraction(ctrDelta) !== null && toFraction(ctrDelta)! <= settingsData.ctr_drop_pct) {
                signals.push('CTR');
              }
              if (toFraction(crDelta) !== null && toFraction(crDelta)! <= settingsData.cr_to_cart_drop_pct) {
                signals.push('CR');
              }
              if (toFraction(ordersDelta) !== null && toFraction(ordersDelta)! <= settingsData.orders_drop_pct) {
                signals.push('Orders');
              }
              if (toFraction(revenueDelta) !== null && toFraction(revenueDelta)! <= settingsData.revenue_drop_pct) {
                signals.push('Revenue');
              }
            }

            const deltaImpressions = prev ? calcDeltaPct(current.impressions, prev.impressions) : null;
            const deltaPriceAvg =
              prev && current.price_avg !== null && prev.price_avg !== null
                ? calcDeltaPct(Number(current.price_avg), Number(prev.price_avg))
                : null;
            const deltaCtr = prev ? calcDeltaPct(current.ctr, prev.ctr) : null;
            const deltaCr = prev ? calcDeltaPct(current.cr_to_cart, prev.cr_to_cart) : null;
            const deltaOrders = prev ? calcDeltaPct(current.orders, prev.orders) : null;
            const deltaRevenue =
              prev && current.revenue !== null && prev.revenue !== null
                ? calcDeltaPct(Number(current.revenue), Number(prev.revenue))
                : null;

            const severity = [deltaCtr, deltaCr, deltaOrders, deltaRevenue]
              .filter((value) => value !== null)
              .reduce((sum, value) => sum + Math.abs(value as number), 0);

            return {
              artikul: current.artikul,
              marketplace: 'WB' as const,
              impressions: current.impressions,
              price_avg: current.price_avg,
              ctr: current.ctr,
              cr_to_cart: current.cr_to_cart,
              orders: current.orders,
              revenue: current.revenue,
              drr: null,
              delta_ctr: deltaCtr,
              delta_cr_to_cart: deltaCr,
              delta_orders: deltaOrders,
              delta_revenue: deltaRevenue,
              delta_drr: null,
              delta_impressions: deltaImpressions,
              delta_price_avg: deltaPriceAvg,
              signals: signals.slice(0, settingsData.max_zone_tags),
              severity,
            };
          })
          .filter((row) => row.signals.length > 0)
          .sort((a, b) => b.severity - a.severity)
          .slice(0, maxRows);

        setWbRows(wbSummary);
      }

      // Process Ozon
      if (ozonImport) {
        const prevWeekStart = new Date(ozonImport.period_start);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

        const { data: prevOzonImport, error: prevOzonError } = await supabase
          .from('imports')
          .select('id')
          .eq('marketplace', 'OZON')
          .eq('period_start', prevWeekStartStr)
          .maybeSingle();
        if (prevOzonError && prevOzonError.code !== 'PGRST116') {
          throw prevOzonError;
        }

        const { data: ozonMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', ozonImport.id)
          .gte('impressions', minImpressions);

        let prevOzonMap = new Map<string, any>();
        if (prevOzonImport) {
          const { data: prevOzonMetrics } = await supabase
            .from('weekly_metrics')
            .select('*')
            .eq('import_id', prevOzonImport.id);

          if (prevOzonMetrics) {
            prevOzonMetrics.forEach((m) => prevOzonMap.set(m.artikul, m));
          }
        }

        const ozonSummary = (ozonMetrics || [])
          .map((current) => {
            const prev = prevOzonMap.get(current.artikul);
            const signals: string[] = [];

            if (prev) {
              const ctrDelta = calcDeltaPct(current.ctr, prev.ctr);
              const crDelta = calcDeltaPct(current.cr_to_cart, prev.cr_to_cart);
              const ordersDelta = calcDeltaPct(current.orders, prev.orders);
              const revenueDelta =
                current.revenue !== null && prev.revenue !== null
                  ? calcDeltaPct(Number(current.revenue), Number(prev.revenue))
                  : null;
              const drrDelta =
                current.drr !== null && prev.drr !== null
                  ? calcDeltaPct(current.drr, prev.drr)
                  : null;

              if (toFraction(ctrDelta) !== null && toFraction(ctrDelta)! <= settingsData.ctr_drop_pct) {
                signals.push('CTR');
              }
              if (toFraction(crDelta) !== null && toFraction(crDelta)! <= settingsData.cr_to_cart_drop_pct) {
                signals.push('CR');
              }
              if (toFraction(ordersDelta) !== null && toFraction(ordersDelta)! <= settingsData.orders_drop_pct) {
                signals.push('Orders');
              }
              if (toFraction(revenueDelta) !== null && toFraction(revenueDelta)! <= settingsData.revenue_drop_pct) {
                signals.push('Revenue');
              }
              if (toFraction(drrDelta) !== null && toFraction(drrDelta)! >= settingsData.drr_worse_pct) {
                signals.push('DRR');
              }
            }

            const deltaImpressions = prev ? calcDeltaPct(current.impressions, prev.impressions) : null;
            const deltaPriceAvg =
              prev && current.price_avg !== null && prev.price_avg !== null
                ? calcDeltaPct(Number(current.price_avg), Number(prev.price_avg))
                : null;
            const deltaCtr = prev ? calcDeltaPct(current.ctr, prev.ctr) : null;
            const deltaCr = prev ? calcDeltaPct(current.cr_to_cart, prev.cr_to_cart) : null;
            const deltaOrders = prev ? calcDeltaPct(current.orders, prev.orders) : null;
            const deltaRevenue =
              prev && current.revenue !== null && prev.revenue !== null
                ? calcDeltaPct(Number(current.revenue), Number(prev.revenue))
                : null;
            const deltaDrr =
              prev && current.drr !== null && prev.drr !== null
                ? calcDeltaPct(current.drr, prev.drr)
                : null;

            const severity = [deltaCtr, deltaCr, deltaOrders, deltaRevenue, deltaDrr]
              .filter((value) => value !== null)
              .reduce((sum, value) => sum + Math.abs(value as number), 0);

            return {
              artikul: current.artikul,
              marketplace: 'OZON' as const,
              impressions: current.impressions,
              price_avg: current.price_avg,
              ctr: current.ctr,
              cr_to_cart: current.cr_to_cart,
              orders: current.orders,
              revenue: current.revenue,
              drr: current.drr,
              delta_ctr: deltaCtr,
              delta_cr_to_cart: deltaCr,
              delta_orders: deltaOrders,
              delta_revenue: deltaRevenue,
              delta_drr: deltaDrr,
              delta_impressions: deltaImpressions,
              delta_price_avg: deltaPriceAvg,
              signals: signals.slice(0, settingsData.max_zone_tags),
              severity,
            };
          })
          .filter((row) => row.signals.length > 0)
          .sort((a, b) => b.severity - a.severity)
          .slice(0, maxRows);

        setOzonRows(ozonSummary);
      }
    } catch (error) {
      console.error('Error loading summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddABTest = async (artikul: string, marketplace: 'WB' | 'OZON') => {
    try {
      const response = await fetch('/api/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace, artikul }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create AB test');
      }

      alert(`AB тест создан для ${artikul} (${marketplace})`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Ошибка создания AB теста');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div>Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-8">Summary</h1>

      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-semibold mb-4">WB:</h2>
          {wbRows.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  Нет товаров с сигналами
                </div>
              </CardContent>
            </Card>
          ) : (
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2">Артикул</th>
                  <th className="border p-2">Показы</th>
                  <th className="border p-2">Ср. цена</th>
                  <th className="border p-2">CTR</th>
                  <th className="border p-2">CR</th>
                  <th className="border p-2">Заказы</th>
                  <th className="border p-2">Выручка</th>
                  <th className="border p-2">Сигналы</th>
                  <th className="border p-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {wbRows.map((row) => {
                  return (
                    <tr key={row.artikul}>
                      <td className="border p-2 font-medium">{row.artikul}</td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.impressions) || undefined}
                      >
                        <MetricCell
                          value={formatInt(row.impressions)}
                          deltaPct={row.delta_impressions}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.price_avg) || undefined}
                      >
                        <MetricCell
                          value={formatMoney(row.price_avg)}
                          deltaPct={row.delta_price_avg}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.ctr) || undefined}
                      >
                        <MetricCell
                          value={formatPercent(row.ctr, 2)}
                          deltaPct={row.delta_ctr}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.cr_to_cart) || undefined}
                      >
                        <MetricCell
                          value={formatPercent(row.cr_to_cart, 2)}
                          deltaPct={row.delta_cr_to_cart}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.orders) || undefined}
                      >
                        <MetricCell
                          value={formatInt(row.orders)}
                          deltaPct={row.delta_orders}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.revenue) || undefined}
                      >
                        <MetricCell
                          value={formatMoney(row.revenue)}
                          deltaPct={row.delta_revenue}
                        />
                      </td>
                      <td className="border p-2">
                        {row.signals.map((s) => (
                          <span
                            key={s}
                            className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded mr-1"
                          >
                            {s}
                          </span>
                        ))}
                      </td>
                      <td className="border p-2">
                        <Button
                          size="sm"
                          onClick={() => handleAddABTest(row.artikul, 'WB')}
                        >
                          AB Test
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">OZON:</h2>
          {ozonRows.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  Нет товаров с сигналами
                </div>
              </CardContent>
            </Card>
          ) : (
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2">Артикул</th>
                  <th className="border p-2">Показы</th>
                  <th className="border p-2">Ср. цена</th>
                  <th className="border p-2">CTR</th>
                  <th className="border p-2">CR</th>
                  <th className="border p-2">Заказы</th>
                  <th className="border p-2">Выручка</th>
                  <th className="border p-2">ДРР</th>
                  <th className="border p-2">Сигналы</th>
                  <th className="border p-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {ozonRows.map((row) => {
                  return (
                    <tr key={row.artikul}>
                      <td className="border p-2 font-medium">{row.artikul}</td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.impressions) || undefined}
                      >
                        <MetricCell
                          value={formatInt(row.impressions)}
                          deltaPct={row.delta_impressions}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.price_avg) || undefined}
                      >
                        <MetricCell
                          value={formatMoney(row.price_avg)}
                          deltaPct={row.delta_price_avg}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.ctr) || undefined}
                      >
                        <MetricCell
                          value={formatPercent(row.ctr, 2)}
                          deltaPct={row.delta_ctr}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.cr_to_cart) || undefined}
                      >
                        <MetricCell
                          value={formatPercent(row.cr_to_cart, 2)}
                          deltaPct={row.delta_cr_to_cart}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.orders) || undefined}
                      >
                        <MetricCell
                          value={formatInt(row.orders)}
                          deltaPct={row.delta_orders}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.revenue) || undefined}
                      >
                        <MetricCell
                          value={formatMoney(row.revenue)}
                          deltaPct={row.delta_revenue}
                        />
                      </td>
                      <td
                        className="border p-2"
                        title={getInvalidValueTooltip(row.drr) || undefined}
                      >
                        <MetricCell
                          value={formatPercent(row.drr, 2)}
                          deltaPct={row.delta_drr}
                          isInverted
                        />
                      </td>
                      <td className="border p-2">
                        {row.signals.map((s) => (
                          <span
                            key={s}
                            className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded mr-1"
                          >
                            {s}
                          </span>
                        ))}
                      </td>
                      <td className="border p-2">
                        <Button
                          size="sm"
                          onClick={() => handleAddABTest(row.artikul, 'OZON')}
                        >
                          AB Test
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
