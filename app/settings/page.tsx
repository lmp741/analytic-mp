'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (data) {
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('settings')
        .update({
          summary_min_impressions: settings.summary_min_impressions,
          ctr_drop_pct: settings.ctr_drop_pct,
          cr_to_cart_drop_pct: settings.cr_to_cart_drop_pct,
          orders_drop_pct: settings.orders_drop_pct,
          revenue_drop_pct: settings.revenue_drop_pct,
          drr_worse_pct: settings.drr_worse_pct,
          max_zone_tags: settings.max_zone_tags,
          ignore_prev_zero: settings.ignore_prev_zero,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) throw error;
      alert('Настройки сохранены');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Ошибка сохранения настроек');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  if (loading || !settings) {
    return (
      <div className="container mx-auto p-8">
        <div>Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Пороги и настройки</CardTitle>
          <CardDescription>
            Настройте пороги для определения сигналов в Summary
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="summary_min_impressions">
              Минимальные показы для Summary
            </Label>
            <Input
              id="summary_min_impressions"
              type="number"
              value={settings.summary_min_impressions}
              onChange={(e) =>
                updateSetting('summary_min_impressions', parseInt(e.target.value) || 0)
              }
              min={0}
            />
          </div>

          <div>
            <Label htmlFor="ctr_drop_pct">
              Порог падения CTR (%)
            </Label>
            <Input
              id="ctr_drop_pct"
              type="number"
              step="0.01"
              value={settings.ctr_drop_pct * 100}
              onChange={(e) =>
                updateSetting('ctr_drop_pct', (parseFloat(e.target.value) || 0) / 100)
              }
            />
            <p className="text-sm text-muted-foreground mt-1">
              Хранится как: {settings.ctr_drop_pct} (дробь)
            </p>
          </div>

          <div>
            <Label htmlFor="cr_to_cart_drop_pct">
              Порог падения CR (%)
            </Label>
            <Input
              id="cr_to_cart_drop_pct"
              type="number"
              step="0.01"
              value={settings.cr_to_cart_drop_pct * 100}
              onChange={(e) =>
                updateSetting('cr_to_cart_drop_pct', (parseFloat(e.target.value) || 0) / 100)
              }
            />
          </div>

          <div>
            <Label htmlFor="orders_drop_pct">
              Порог падения заказов (%)
            </Label>
            <Input
              id="orders_drop_pct"
              type="number"
              step="0.01"
              value={settings.orders_drop_pct * 100}
              onChange={(e) =>
                updateSetting('orders_drop_pct', (parseFloat(e.target.value) || 0) / 100)
              }
            />
          </div>

          <div>
            <Label htmlFor="revenue_drop_pct">
              Порог падения выручки (%)
            </Label>
            <Input
              id="revenue_drop_pct"
              type="number"
              step="0.01"
              value={settings.revenue_drop_pct * 100}
              onChange={(e) =>
                updateSetting('revenue_drop_pct', (parseFloat(e.target.value) || 0) / 100)
              }
            />
          </div>

          <div>
            <Label htmlFor="drr_worse_pct">
              Порог ухудшения ДРР (%)
            </Label>
            <Input
              id="drr_worse_pct"
              type="number"
              step="0.01"
              value={settings.drr_worse_pct * 100}
              onChange={(e) =>
                updateSetting('drr_worse_pct', (parseFloat(e.target.value) || 0) / 100)
              }
            />
          </div>

          <div>
            <Label htmlFor="max_zone_tags">
              Максимум тегов сигналов
            </Label>
            <Input
              id="max_zone_tags"
              type="number"
              value={settings.max_zone_tags}
              onChange={(e) =>
                updateSetting('max_zone_tags', parseInt(e.target.value) || 1)
              }
              min={1}
              max={5}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="ignore_prev_zero"
              checked={settings.ignore_prev_zero}
              onChange={(e) => updateSetting('ignore_prev_zero', e.target.checked)}
            />
            <Label htmlFor="ignore_prev_zero">
              Игнорировать предыдущие нулевые значения при расчете дельт
            </Label>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
