'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatInt, formatPercent, formatMoney, formatDelta } from '@/lib/utils/formatting';

interface ABTest {
  id: string;
  marketplace: 'WB' | 'OZON';
  artikul: string;
  label: string;
  baseline_period_start: string;
  baseline_metrics: any;
  is_active: boolean;
  current_metrics?: any;
  wow_delta?: any;
}

export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const supabase = createClient();

      const { data: abTests } = await supabase
        .from('ab_tests')
        .select('*')
        .eq('is_active', true)
        .is('removed_at', null)
        .order('created_at', { ascending: false });

      if (!abTests) {
        setLoading(false);
        return;
      }

      // Load current metrics for each test
      const testsWithMetrics = await Promise.all(
        abTests.map(async (test) => {
          const { data: latestImport } = await supabase
            .from('imports')
            .select('id, period_start')
            .eq('marketplace', test.marketplace)
            .eq('status', 'IMPORTED')
            .order('period_start', { ascending: false })
            .limit(1)
            .single();

          if (!latestImport) return test;

          const { data: currentMetric } = await supabase
            .from('weekly_metrics')
            .select('*')
            .eq('import_id', latestImport.id)
            .eq('artikul', test.artikul)
            .single();

          if (!currentMetric) return test;

          // Calculate WoW delta
          const baseline = test.baseline_metrics;
          const wow_delta = {
            impressions: currentMetric.impressions - baseline.impressions,
            ctr: currentMetric.ctr - baseline.ctr,
            cr_to_cart: currentMetric.cr_to_cart - baseline.cr_to_cart,
            orders: currentMetric.orders - baseline.orders,
            revenue:
              currentMetric.revenue && baseline.revenue
                ? Number(currentMetric.revenue) - Number(baseline.revenue)
                : null,
            price_avg:
              currentMetric.price_avg && baseline.price_avg
                ? Number(currentMetric.price_avg) - Number(baseline.price_avg)
                : null,
          };

          return {
            ...test,
            current_metrics: currentMetric,
            wow_delta,
          };
        })
      );

      setTests(testsWithMetrics);
    } catch (error) {
      console.error('Error loading AB tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (testId: string) => {
    try {
      const supabase = createClient();
      await supabase
        .from('ab_tests')
        .update({
          is_active: false,
          removed_at: new Date().toISOString(),
        })
        .eq('id', testId);

      loadData();
    } catch (error) {
      console.error('Error removing AB test:', error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div>Загрузка...</div>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">AB Tests</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              Нет активных AB тестов
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-8">AB Tests</h1>

      <div className="space-y-4">
        {tests.map((test) => {
          const baseline = test.baseline_metrics;
          const current = test.current_metrics;
          const delta = test.wow_delta;

          return (
            <Card key={test.id}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>
                    {test.marketplace} - {test.artikul} ({test.label})
                  </CardTitle>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemove(test.id)}
                  >
                    Remove from AB list
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Baseline</h3>
                    <div className="space-y-1 text-sm">
                      <div>Показы: {formatInt(baseline.impressions)}</div>
                      <div>CTR: {formatPercent(baseline.ctr)}</div>
                      <div>CR: {formatPercent(baseline.cr_to_cart)}</div>
                      <div>Заказы: {formatInt(baseline.orders)}</div>
                      <div>Выручка: {formatMoney(baseline.revenue)}</div>
                      <div>Ср. цена: {formatMoney(baseline.price_avg)}</div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Current (WoW Delta)</h3>
                    {current ? (
                      <div className="space-y-1 text-sm">
                        <div>
                          Показы: {formatInt(current.impressions)}
                          {delta && (
                            <span
                              className={`ml-2 ${
                                delta.impressions >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              ({delta.impressions >= 0 ? '+' : ''}
                              {formatInt(delta.impressions)})
                            </span>
                          )}
                        </div>
                        <div>
                          CTR: {formatPercent(current.ctr)}
                          {delta && (
                            <span
                              className={`ml-2 ${
                                delta.ctr >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              ({delta.ctr >= 0 ? '+' : ''}
                              {formatPercent(delta.ctr)})
                            </span>
                          )}
                        </div>
                        <div>
                          CR: {formatPercent(current.cr_to_cart)}
                          {delta && (
                            <span
                              className={`ml-2 ${
                                delta.cr_to_cart >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              ({delta.cr_to_cart >= 0 ? '+' : ''}
                              {formatPercent(delta.cr_to_cart)})
                            </span>
                          )}
                        </div>
                        <div>
                          Заказы: {formatInt(current.orders)}
                          {delta && (
                            <span
                              className={`ml-2 ${
                                delta.orders >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              ({delta.orders >= 0 ? '+' : ''}
                              {formatInt(delta.orders)})
                            </span>
                          )}
                        </div>
                        <div>
                          Выручка: {formatMoney(current.revenue)}
                          {delta && delta.revenue !== null && (
                            <span
                              className={`ml-2 ${
                                delta.revenue >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              ({delta.revenue >= 0 ? '+' : ''}
                              {formatMoney(delta.revenue)})
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Нет текущих данных</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
