'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatInt, formatPercent, formatMoney } from '@/lib/utils/formatting';

interface MonthSummary {
  marketplace: 'WB' | 'OZON';
  firstWeek: string;
  lastWeek: string;
  delta_orders: number;
  delta_revenue: number | null;
  delta_ctr: number;
  delta_cr_to_cart: number;
  delta_price_avg: number | null;
  delta_drr: number | null;
  topGrowers: Array<{ artikul: string; growth: number }>;
  topFallers: Array<{ artikul: string; decline: number }>;
}

export default function MonthPage() {
  const [wbSummary, setWbSummary] = useState<MonthSummary | null>(null);
  const [ozonSummary, setOzonSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const supabase = createClient();
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      // Get first and last day of month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      // Process WB
      const { data: wbImports } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'WB')
        .eq('status', 'IMPORTED')
        .gte('period_start', firstDay.toISOString().split('T')[0])
        .lte('period_start', lastDay.toISOString().split('T')[0])
        .order('period_start', { ascending: true });

      if (wbImports && wbImports.length > 0) {
        const firstImport = wbImports[0];
        const lastImport = wbImports[wbImports.length - 1];

        const { data: firstMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', firstImport.id);

        const { data: lastMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', lastImport.id);

        if (firstMetrics && lastMetrics) {
          const firstMap = new Map(firstMetrics.map((m) => [m.artikul, m]));
          const lastMap = new Map(lastMetrics.map((m) => [m.artikul, m]));

          let totalOrdersFirst = 0;
          let totalOrdersLast = 0;
          let totalRevenueFirst = 0;
          let totalRevenueLast = 0;
          let totalCtrFirst = 0;
          let totalCtrLast = 0;
          let totalCrFirst = 0;
          let totalCrLast = 0;
          let totalPriceFirst = 0;
          let totalPriceLast = 0;
          let countFirst = 0;
          let countLast = 0;

          firstMap.forEach((m) => {
            totalOrdersFirst += m.orders;
            if (m.revenue) totalRevenueFirst += Number(m.revenue);
            totalCtrFirst += m.ctr;
            totalCrFirst += m.cr_to_cart;
            if (m.price_avg) totalPriceFirst += Number(m.price_avg);
            countFirst++;
          });

          lastMap.forEach((m) => {
            totalOrdersLast += m.orders;
            if (m.revenue) totalRevenueLast += Number(m.revenue);
            totalCtrLast += m.ctr;
            totalCrLast += m.cr_to_cart;
            if (m.price_avg) totalPriceLast += Number(m.price_avg);
            countLast++;
          });

          const growths: Array<{ artikul: string; growth: number }> = [];
          lastMap.forEach((last, artikul) => {
            const first = firstMap.get(artikul);
            if (first && first.orders > 0) {
              const growth = (last.orders - first.orders) / first.orders;
              growths.push({ artikul, growth });
            }
          });

          growths.sort((a, b) => b.growth - a.growth);
          const topGrowers = growths.slice(0, 5);
          const topFallers = growths.slice(-5).reverse().map(item => ({
            artikul: item.artikul,
            decline: -item.growth
          }));

          setWbSummary({
            marketplace: 'WB',
            firstWeek: firstImport.period_start,
            lastWeek: lastImport.period_start,
            delta_orders: totalOrdersLast - totalOrdersFirst,
            delta_revenue: totalRevenueLast - totalRevenueFirst,
            delta_ctr: totalCtrLast / countLast - totalCtrFirst / countFirst,
            delta_cr_to_cart: totalCrLast / countLast - totalCrFirst / countFirst,
            delta_price_avg:
              totalPriceLast / countLast - totalPriceFirst / countFirst,
            delta_drr: null,
            topGrowers,
            topFallers,
          });
        }
      }

      // Process Ozon (similar logic)
      const { data: ozonImports } = await supabase
        .from('imports')
        .select('id, period_start')
        .eq('marketplace', 'OZON')
        .eq('status', 'IMPORTED')
        .gte('period_start', firstDay.toISOString().split('T')[0])
        .lte('period_start', lastDay.toISOString().split('T')[0])
        .order('period_start', { ascending: true });

      if (ozonImports && ozonImports.length > 0) {
        const firstImport = ozonImports[0];
        const lastImport = ozonImports[ozonImports.length - 1];

        const { data: firstMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', firstImport.id);

        const { data: lastMetrics } = await supabase
          .from('weekly_metrics')
          .select('*')
          .eq('import_id', lastImport.id);

        if (firstMetrics && lastMetrics) {
          const firstMap = new Map(firstMetrics.map((m) => [m.artikul, m]));
          const lastMap = new Map(lastMetrics.map((m) => [m.artikul, m]));

          let totalOrdersFirst = 0;
          let totalOrdersLast = 0;
          let totalRevenueFirst = 0;
          let totalRevenueLast = 0;
          let totalCtrFirst = 0;
          let totalCtrLast = 0;
          let totalCrFirst = 0;
          let totalCrLast = 0;
          let totalPriceFirst = 0;
          let totalPriceLast = 0;
          let countFirst = 0;
          let countLast = 0;

          firstMap.forEach((m) => {
            totalOrdersFirst += m.orders;
            if (m.revenue) totalRevenueFirst += Number(m.revenue);
            totalCtrFirst += m.ctr;
            totalCrFirst += m.cr_to_cart;
            if (m.price_avg) totalPriceFirst += Number(m.price_avg);
            countFirst++;
          });

          lastMap.forEach((m) => {
            totalOrdersLast += m.orders;
            if (m.revenue) totalRevenueLast += Number(m.revenue);
            totalCtrLast += m.ctr;
            totalCrLast += m.cr_to_cart;
            if (m.price_avg) totalPriceLast += Number(m.price_avg);
            countLast++;
          });

          const growths: Array<{ artikul: string; growth: number }> = [];
          lastMap.forEach((last, artikul) => {
            const first = firstMap.get(artikul);
            if (first && first.orders > 0) {
              const growth = (last.orders - first.orders) / first.orders;
              growths.push({ artikul, growth });
            }
          });

          growths.sort((a, b) => b.growth - a.growth);
          const topGrowers = growths.slice(0, 5);
          const topFallers = growths.slice(-5).reverse().map(item => ({
            artikul: item.artikul,
            decline: -item.growth
          }));

          setOzonSummary({
            marketplace: 'OZON',
            firstWeek: firstImport.period_start,
            lastWeek: lastImport.period_start,
            delta_orders: totalOrdersLast - totalOrdersFirst,
            delta_revenue: totalRevenueLast - totalRevenueFirst,
            delta_ctr: totalCtrLast / countLast - totalCtrFirst / countFirst,
            delta_cr_to_cart: totalCrLast / countLast - totalCrFirst / countFirst,
            delta_price_avg:
              totalPriceLast / countLast - totalPriceFirst / countFirst,
            delta_drr: null,
            topGrowers,
            topFallers,
          });
        }
      }
    } catch (error) {
      console.error('Error loading month summary:', error);
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

  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-8">Итоги месяца</h1>

      <div className="space-y-8">
        {wbSummary && (
          <Card>
            <CardHeader>
              <CardTitle>WB</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <strong>Период:</strong> {wbSummary.firstWeek} - {wbSummary.lastWeek}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>Δ Заказы:</strong> {formatInt(wbSummary.delta_orders)}
                  </div>
                  <div>
                    <strong>Δ Выручка:</strong> {formatMoney(wbSummary.delta_revenue)}
                  </div>
                  <div>
                    <strong>Δ CTR:</strong> {formatPercent(wbSummary.delta_ctr)}
                  </div>
                  <div>
                    <strong>Δ CR:</strong> {formatPercent(wbSummary.delta_cr_to_cart)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>Топ рост:</strong>
                    <ul className="list-disc list-inside">
                      {wbSummary.topGrowers.map((g) => (
                        <li key={g.artikul}>
                          {g.artikul}: {formatPercent(g.growth)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Топ падение:</strong>
                    <ul className="list-disc list-inside">
                      {wbSummary.topFallers.map((f) => (
                        <li key={f.artikul}>
                          {f.artikul}: {formatPercent(-f.decline)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {ozonSummary && (
          <Card>
            <CardHeader>
              <CardTitle>OZON</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <strong>Период:</strong> {ozonSummary.firstWeek} - {ozonSummary.lastWeek}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>Δ Заказы:</strong> {formatInt(ozonSummary.delta_orders)}
                  </div>
                  <div>
                    <strong>Δ Выручка:</strong> {formatMoney(ozonSummary.delta_revenue)}
                  </div>
                  <div>
                    <strong>Δ CTR:</strong> {formatPercent(ozonSummary.delta_ctr)}
                  </div>
                  <div>
                    <strong>Δ CR:</strong> {formatPercent(ozonSummary.delta_cr_to_cart)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>Топ рост:</strong>
                    <ul className="list-disc list-inside">
                      {ozonSummary.topGrowers.map((g) => (
                        <li key={g.artikul}>
                          {g.artikul}: {formatPercent(g.growth)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Топ падение:</strong>
                    <ul className="list-disc list-inside">
                      {ozonSummary.topFallers.map((f) => (
                        <li key={f.artikul}>
                          {f.artikul}: {formatPercent(-f.decline)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!wbSummary && !ozonSummary && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                Нет данных за текущий месяц
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
