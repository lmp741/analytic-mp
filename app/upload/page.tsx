'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { parseWBFile, type WBParseResult } from '@/lib/parsers/wb';
import { parseOzonFile, type OzonParseResult } from '@/lib/parsers/ozon';
import { computeFileHash } from '@/lib/utils/hash';
import { createClient } from '@/lib/supabase/client';
import {
  formatInt,
  formatPercent,
  formatMoney,
  getInvalidValueTooltip,
} from '@/lib/utils/formatting';
import { cn } from '@/lib/utils/cn';

type UploadState = 'idle' | 'parsing' | 'parsed' | 'importing' | 'imported' | 'error';
type StatusLevel = 'idle' | 'ok' | 'warn' | 'error';
type DbHealth = {
  status: 'checking' | 'ok' | 'error';
  details: string[];
};
type ImportStats = {
  skuUpsertSize: number;
  metricsAttempted: number;
  metricsInserted: number;
};

const statusConfig: Record<StatusLevel, { label: string; className: string }> = {
  idle: { label: '⚪️ WAIT', className: 'text-muted-foreground' },
  ok: { label: '✅ OK', className: 'text-emerald-600' },
  warn: { label: '🟡 WARN', className: 'text-amber-600' },
  error: { label: '🔴 ERROR', className: 'text-red-600' },
};

const wbColumnLabels: Record<string, string> = {
  artikul: 'Артикул продавца',
  impressions: 'Показы',
  visits: 'Переходы в карточку',
  ctr: 'CTR',
  add_to_cart: 'Положили в корзину',
  cr_to_cart: 'Конверсия в корзину, %',
  orders: 'Заказали, шт',
  revenue: 'Выручка / Заказали на сумму',
  price_avg: 'Средняя цена, ₽',
  stock_end: 'Остаток (конец)',
  delivery: 'Среднее время доставки',
  rating: 'Рейтинг',
  reviews: 'Отзывы',
  drr: 'ДРР',
};

const ozonColumnLabels: Record<string, string> = {
  artikul: 'Артикул',
  impressions: 'Показы всего',
  visits: 'Посещения карточки товара',
  ctr: 'CTR',
  add_to_cart: 'Добавления в корзину',
  cr_to_cart: 'Конверсия в корзину',
  orders: 'Заказано товаров',
  revenue: 'Заказано на сумму / Выручка',
  price_avg: 'Средняя цена',
  stock_end: 'Остаток на конец периода',
  rating: 'Рейтинг товара',
  reviews: 'Отзывы',
  drr: 'Общая ДРР',
};

export default function UploadPage() {
  const [wbFile, setWbFile] = useState<File | null>(null);
  const [ozonFile, setOzonFile] = useState<File | null>(null);
  const [wbResult, setWbResult] = useState<WBParseResult | null>(null);
  const [ozonResult, setOzonResult] = useState<OzonParseResult | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealth>({ status: 'checking', details: [] });
  const [wbImportStats, setWbImportStats] = useState<ImportStats | null>(null);
  const [ozonImportStats, setOzonImportStats] = useState<ImportStats | null>(null);

  useEffect(() => {
    const checkDbHealth = async () => {
      const supabase = createClient();
      const issues: string[] = [];

      const { error: importsError } = await supabase
        .from('imports')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      if (importsError) {
        issues.push('imports table missing or inaccessible');
      }

      const { error: metricsError } = await supabase
        .from('weekly_metrics')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      if (metricsError) {
        issues.push('weekly_metrics table missing or inaccessible');
      }

      setDbHealth(
        issues.length > 0
          ? { status: 'error', details: issues }
          : { status: 'ok', details: [] }
      );
    };

    checkDbHealth();
  }, []);

  const parseWbFile = async (file: File) => {
    setWbFile(file);
    setState('parsing');
    setError(null);

    try {
      const result = await parseWBFile(file);
      setWbResult(result);
      if (result.errors.length > 0) {
        setError(result.errors.join('; '));
        setState('error');
      } else {
        setState('parsed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка парсинга WB файла');
      setState('error');
    }
  };

  const parseOzonFileInput = async (file: File) => {
    setOzonFile(file);
    setState('parsing');
    setError(null);

    try {
      const result = await parseOzonFile(file);
      setOzonResult(result);
      if (result.errors.length > 0) {
        setError(result.errors.join('; '));
        setState('error');
      } else {
        setState('parsed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка парсинга Ozon файла');
      setState('error');
    }
  };

  const handleDryRun = async () => {
    // Dry-run is already done during parsing
    // This function can show detailed diagnostics
    setState('parsed');
  };

  const handleImport = async () => {
    if (!wbResult && !ozonResult) return;
    if (overallStatus === 'error') return;
    if (overallStatus === 'warn') {
      const proceed = window.confirm(
        'Обнаружены предупреждения. Импортировать несмотря на WARN?'
      );
      if (!proceed) return;
    }
    
    // Check for existing imports and show confirmation
    // For now, proceed with import
    setState('importing');
    setError(null);

    try {
      let importedCount = 0;

      // Import WB if available
      if (wbFile && wbResult && wbResult.periodStart && wbResult.periodEnd) {
        const wbArtikuls = new Set(wbResult.rows.map((row) => row.artikul));
        const wbHash = await computeFileHash(wbFile);
        const wbResponse = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marketplace: 'WB',
            periodStart: wbResult.periodStart.toISOString().split('T')[0],
            periodEnd: wbResult.periodEnd.toISOString().split('T')[0],
            fileHash: wbHash,
            rows: wbResult.rows,
          }),
        });

        if (!wbResponse.ok) {
          const error = await wbResponse.json();
          const message = error.details
            ? `${error.error} (${error.details})`
            : error.error || 'WB import failed';
          throw new Error(message);
        }
        const wbPayload = await wbResponse.json();
        if (!wbPayload.metricsCount || wbPayload.metricsCount === 0) {
          throw new Error('WB import failed: no metrics saved');
        }
        setWbImportStats({
          skuUpsertSize: wbArtikuls.size,
          metricsAttempted: wbResult.rows.length,
          metricsInserted: wbPayload.metricsCount,
        });
        importedCount += 1;
      } else if (wbFile && wbResult && (!wbResult.periodStart || !wbResult.periodEnd)) {
        throw new Error('WB: период не найден. Укажите период вручную перед импортом.');
      }

      // Import Ozon if available
      if (ozonFile && ozonResult && ozonResult.periodStart && ozonResult.periodEnd) {
        const ozonArtikuls = new Set(ozonResult.rows.map((row) => row.artikul));
        const ozonHash = await computeFileHash(ozonFile);
        const ozonResponse = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marketplace: 'OZON',
            periodStart: ozonResult.periodStart.toISOString().split('T')[0],
            periodEnd: ozonResult.periodEnd.toISOString().split('T')[0],
            fileHash: ozonHash,
            rows: ozonResult.rows,
          }),
        });

        if (!ozonResponse.ok) {
          const error = await ozonResponse.json();
          const message = error.details
            ? `${error.error} (${error.details})`
            : error.error || 'Ozon import failed';
          throw new Error(message);
        }
        const ozonPayload = await ozonResponse.json();
        if (!ozonPayload.metricsCount || ozonPayload.metricsCount === 0) {
          throw new Error('Ozon import failed: no metrics saved');
        }
        setOzonImportStats({
          skuUpsertSize: ozonArtikuls.size,
          metricsAttempted: ozonResult.rows.length,
          metricsInserted: ozonPayload.metricsCount,
        });
        importedCount += 1;
      } else if (ozonFile && ozonResult && (!ozonResult.periodStart || !ozonResult.periodEnd)) {
        throw new Error('OZON: период не найден. Укажите период вручную перед импортом.');
      }

      if (importedCount > 0) {
        setState('imported');
      } else {
        throw new Error('Импорт не завершён: записи не были сохранены');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта');
      setState('error');
    }
  };

  const buildImportStats = (
    rows: { artikul: string }[],
    importStats: ImportStats | null
  ) => {
    const uniqueArtikuls = new Set(rows.map((row) => row.artikul));
    return {
      skuUpsertSize: importStats?.skuUpsertSize ?? uniqueArtikuls.size,
      metricsAttempted: importStats?.metricsAttempted ?? rows.length,
      metricsInserted: importStats?.metricsInserted ?? 0,
    };
  };

  const downloadDiagnostics = () => {
    const diagnostics = {
      wb: wbResult ? {
        marketplace: 'WB',
        file_hash: wbFile ? 'computing...' : null,
        detected_period: wbResult.periodStart ? {
          start: wbResult.periodStart.toISOString(),
          end: wbResult.periodEnd?.toISOString(),
        } : null,
        mapping: wbResult.diagnostics.columnMapping,
        header_row_index: wbResult.diagnostics.headerRowIndex,
        header_sample: wbResult.diagnostics.headerSample,
        stats: {
          totalRowsScanned: wbResult.diagnostics.totalRowsScanned,
          rowsAccepted: wbResult.diagnostics.rowsAccepted,
          rowsSkipped: wbResult.diagnostics.rowsSkipped,
          skuUpsertSize: buildImportStats(wbResult.rows, wbImportStats).skuUpsertSize,
          metricsAttempted: buildImportStats(wbResult.rows, wbImportStats).metricsAttempted,
          metricsInserted: buildImportStats(wbResult.rows, wbImportStats).metricsInserted,
          skipReasons: wbResult.diagnostics.skipReasons,
        },
        warnings: wbResult.warnings,
        errors: wbResult.errors,
        previewSample: wbResult.rows.slice(0, 20),
      } : null,
      ozon: ozonResult ? {
        marketplace: 'OZON',
        file_hash: ozonFile ? 'computing...' : null,
        detected_period: ozonResult.periodStart ? {
          start: ozonResult.periodStart.toISOString(),
          end: ozonResult.periodEnd?.toISOString(),
        } : null,
        mapping: ozonResult.diagnostics.columnMapping,
        header_row_1_index: ozonResult.diagnostics.headerStartRow,
        header_row_2_index: ozonResult.diagnostics.headerSecondRow,
        header_sample: ozonResult.diagnostics.headerSample,
        stats: {
          totalRowsScanned: ozonResult.diagnostics.totalRowsScanned,
          rowsAccepted: ozonResult.diagnostics.rowsAccepted,
          rowsSkipped: ozonResult.diagnostics.rowsSkipped,
          duplicatesAggregated: ozonResult.diagnostics.duplicatesAggregated,
          aggregationApplied: ozonResult.diagnostics.aggregationApplied,
          skuUpsertSize: buildImportStats(ozonResult.rows, ozonImportStats).skuUpsertSize,
          metricsAttempted: buildImportStats(ozonResult.rows, ozonImportStats).metricsAttempted,
          metricsInserted: buildImportStats(ozonResult.rows, ozonImportStats).metricsInserted,
          skipReasons: ozonResult.diagnostics.skipReasons,
        },
        warnings: ozonResult.warnings,
        errors: ozonResult.errors,
        previewSample: ozonResult.rows.slice(0, 20),
      } : null,
    };

    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostics-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatus = (result: { errors: string[]; warnings: string[] } | null): StatusLevel => {
    if (!result) return 'idle';
    if (result.errors.length > 0) return 'error';
    if (result.warnings.length > 0) return 'warn';
    return 'ok';
  };

  const wbStatus = getStatus(wbResult);
  const ozonStatus = getStatus(ozonResult);
  const overallStatus =
    wbStatus === 'error' || ozonStatus === 'error'
      ? 'error'
      : wbStatus === 'warn' || ozonStatus === 'warn'
        ? 'warn'
        : wbStatus === 'ok' || ozonStatus === 'ok'
          ? 'ok'
          : 'idle';

  const dryRunComplete = (!wbFile || wbResult) && (!ozonFile || ozonResult);
  const canImport = dryRunComplete && overallStatus !== 'error' && state !== 'importing';

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Загрузка данных</h1>

      {dbHealth.status === 'error' && (
        <Card className="mb-6 border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">DB schema not applied</CardTitle>
            <CardDescription>
              Таблицы Supabase не найдены. Примените миграции, иначе импорт не сохранит данные.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-destructive">
            {dbHealth.details.join('; ')}
          </CardContent>
        </Card>
      )}

      <div className="mb-8 rounded-lg border bg-muted/30 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {[
            { label: 'WB', done: !!wbResult },
            { label: 'Ozon', done: !!ozonResult },
            { label: 'Dry-run', done: dryRunComplete },
            { label: 'Import', done: state === 'imported' },
          ].map((step, index) => (
            <div key={step.label} className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
                  step.done ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white'
                }`}
              >
                {index + 1}
              </span>
              <span className="font-medium">{step.label}</span>
              {index < 3 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <UploadCard
          title="Wildberries"
          description="Лист “Товары”, русские заголовки"
          file={wbFile}
          status={wbStatus}
          onFile={parseWbFile}
        />
        <UploadCard
          title="Ozon"
          description="Загрузите отчет Ozon"
          file={ozonFile}
          status={ozonStatus}
          onFile={parseOzonFileInput}
        />
      </div>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <div className="text-destructive">{error}</div>
          </CardContent>
        </Card>
      )}

      {(wbResult || ozonResult) && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <Button onClick={handleDryRun} variant="outline">
              Dry-run (Validate & Preview)
            </Button>
            <Button onClick={handleImport} disabled={!canImport}>
              {state === 'importing' ? 'Импорт...' : 'Import to database'}
            </Button>
            <Button onClick={downloadDiagnostics} variant="secondary">
              Download diagnostics JSON
            </Button>
          </div>

          {state === 'imported' && (
            <Card className="border-emerald-500/50 bg-emerald-50/50">
              <CardHeader>
                <CardTitle className="text-emerald-700">Импорт завершён</CardTitle>
                <CardDescription>
                  Данные успешно загружены. Перейдите к просмотру результатов.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {wbResult && (
                  <Link href="/wb" className={buttonVariants()}>
                    Перейти в WB
                  </Link>
                )}
                {ozonResult && (
                  <Link href="/ozon" className={buttonVariants()}>
                    Перейти в Ozon
                  </Link>
                )}
                <Link href="/summary" className={buttonVariants({ variant: 'secondary' })}>
                  Открыть Summary
                </Link>
                <Link
                  href="/"
                  className={cn(
                    "text-sm text-muted-foreground underline-offset-4 hover:underline"
                  )}
                >
                  В главное меню
                </Link>
              </CardContent>
            </Card>
          )}

          {wbResult && (
            <Card>
              <CardHeader>
                <CardTitle>WB Diagnostics</CardTitle>
                <div className={`text-sm font-medium ${statusConfig[wbStatus].className}`}>
                  {statusConfig[wbStatus].label}
                </div>
              </CardHeader>
              <CardContent>
                <DiagnosticsAccordion
                  file={wbFile}
                  periodStart={wbResult.periodStart}
                  periodEnd={wbResult.periodEnd}
                  diagnostics={{
                    sheetName: wbResult.diagnostics.sheetName,
                    headerRowIndex: wbResult.diagnostics.headerRowIndex,
                    headerRowIndexSecondary: null,
                    totalRowsScanned: wbResult.diagnostics.totalRowsScanned,
                    rowsAccepted: wbResult.diagnostics.rowsAccepted,
                    rowsSkipped: wbResult.diagnostics.rowsSkipped,
                    skipReasons: wbResult.diagnostics.skipReasons,
                    headerSample: wbResult.diagnostics.headerSample,
                    columnMapping: wbResult.diagnostics.columnMapping,
                    ...buildImportStats(wbResult.rows, wbImportStats),
                  }}
                  errors={wbResult.errors}
                  warnings={wbResult.warnings}
                  columnLabels={wbColumnLabels}
                  preview={
                    wbResult.rows.length > 0 && (
                      <table className="mt-2 w-full text-sm border">
                        <thead>
                          <tr className="bg-muted">
                            <th className="border p-2">Артикул</th>
                            <th className="border p-2">Показы</th>
                            <th className="border p-2">Переходы</th>
                            <th className="border p-2">CTR</th>
                            <th className="border p-2">Заказы</th>
                            <th className="border p-2">Выручка</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wbResult.rows.slice(0, 5).map((row, idx) => (
                            <tr key={idx}>
                              <td className="border p-2">{row.artikul}</td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.impressions) || undefined}
                              >
                                {formatInt(row.impressions)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.visits) || undefined}
                              >
                                {formatInt(row.visits)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.ctr) || undefined}
                              >
                                {formatPercent(row.ctr)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.orders) || undefined}
                              >
                                {formatInt(row.orders)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.revenue) || undefined}
                              >
                                {formatMoney(row.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                />
              </CardContent>
            </Card>
          )}

          {ozonResult && (
            <Card>
              <CardHeader>
                <CardTitle>Ozon Diagnostics</CardTitle>
                <div className={`text-sm font-medium ${statusConfig[ozonStatus].className}`}>
                  {statusConfig[ozonStatus].label}
                </div>
              </CardHeader>
              <CardContent>
                <DiagnosticsAccordion
                  file={ozonFile}
                  periodStart={ozonResult.periodStart}
                  periodEnd={ozonResult.periodEnd}
                  diagnostics={{
                    sheetName: ozonResult.diagnostics.sheetName,
                    headerRowIndex: ozonResult.diagnostics.headerStartRow,
                    headerRowIndexSecondary: ozonResult.diagnostics.headerSecondRow,
                    totalRowsScanned: ozonResult.diagnostics.totalRowsScanned,
                    rowsAccepted: ozonResult.diagnostics.rowsAccepted,
                    rowsSkipped: ozonResult.diagnostics.rowsSkipped,
                    skipReasons: {
                      ...ozonResult.diagnostics.skipReasons,
                      duplicates_aggregated: ozonResult.diagnostics.duplicatesAggregated,
                      aggregation_applied: ozonResult.diagnostics.aggregationApplied ? 1 : 0,
                    },
                    headerSample: ozonResult.diagnostics.headerSample,
                    columnMapping: ozonResult.diagnostics.columnMapping,
                    ...buildImportStats(ozonResult.rows, ozonImportStats),
                  }}
                  errors={ozonResult.errors}
                  warnings={ozonResult.warnings}
                  columnLabels={ozonColumnLabels}
                  preview={
                    ozonResult.rows.length > 0 && (
                      <table className="mt-2 w-full text-sm border">
                        <thead>
                          <tr className="bg-muted">
                            <th className="border p-2">Артикул</th>
                            <th className="border p-2">Показы</th>
                            <th className="border p-2">Переходы</th>
                            <th className="border p-2">CTR</th>
                            <th className="border p-2">Заказы</th>
                            <th className="border p-2">Выручка</th>
                            <th className="border p-2">ДРР</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ozonResult.rows.slice(0, 5).map((row, idx) => (
                            <tr key={idx}>
                              <td className="border p-2">{row.artikul}</td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.impressions) || undefined}
                              >
                                {formatInt(row.impressions)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.visits) || undefined}
                              >
                                {formatInt(row.visits)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.ctr) || undefined}
                              >
                                {formatPercent(row.ctr)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.orders) || undefined}
                              >
                                {formatInt(row.orders)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.revenue) || undefined}
                              >
                                {formatMoney(row.revenue)}
                              </td>
                              <td
                                className="border p-2"
                                title={getInvalidValueTooltip(row.drr) || undefined}
                              >
                                {formatPercent(row.drr)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function UploadCard({
  title,
  description,
  file,
  status,
  onFile,
}: {
  title: string;
  description: string;
  file: File | null;
  status: StatusLevel;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFile(droppedFile);
    }
  };

  return (
    <Card
      className={`rounded-2xl border-2 border-dashed transition ${
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <span className={`text-sm font-medium ${statusConfig[status].className}`}>
            {statusConfig[status].label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
          Перетащите файл сюда или нажмите кнопку ниже
        </div>
        <Input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            if (selectedFile) {
              onFile(selectedFile);
            }
          }}
          className="hidden"
        />
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
          Выбрать файл
        </Button>
        {file && (
          <div className="text-sm text-muted-foreground">
            Файл: {file.name} ({(file.size / 1024).toFixed(2)} KB)
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticsAccordion({
  file,
  periodStart,
  periodEnd,
  diagnostics,
  errors,
  warnings,
  columnLabels,
  preview,
}: {
  file: File | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  diagnostics: {
    sheetName: string | null;
    headerRowIndex: number | null;
    headerRowIndexSecondary: number | null;
    totalRowsScanned: number;
    rowsAccepted: number;
    rowsSkipped: number;
    skuUpsertSize: number;
    metricsAttempted: number;
    metricsInserted: number;
    skipReasons: Record<string, number>;
    headerSample: string[];
    columnMapping: Record<string, string | null>;
  };
  errors: string[];
  warnings: string[];
  columnLabels: Record<string, string>;
  preview: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          {errors.length > 0 && (
            <div className="text-red-600">
              Ошибки: {errors.join('; ')}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="text-amber-600">
              Предупреждения: {warnings.join('; ')}
            </div>
          )}
        </div>
      )}
      <Accordion>
        <AccordionItem title="Файл" defaultOpen>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Имя:</strong> {file?.name || '—'}
            </div>
            <div>
              <strong>Sheet:</strong> {diagnostics.sheetName || 'N/A'}
            </div>
            <div>
              <strong>Строка шапки:</strong>{' '}
              {diagnostics.headerRowIndex !== null
                ? `${diagnostics.headerRowIndex + 1} (index ${diagnostics.headerRowIndex})`
                : '—'}
            </div>
            {diagnostics.headerRowIndexSecondary !== null && (
              <div>
                <strong>Строка шапки (2):</strong>{' '}
                {`${diagnostics.headerRowIndexSecondary + 1} (index ${diagnostics.headerRowIndexSecondary})`}
              </div>
            )}
            {diagnostics.headerSample.length > 0 && (
              <div>
                <strong>Первые заголовки:</strong> {diagnostics.headerSample.join(', ')}
              </div>
            )}
          </div>
        </AccordionItem>
        <AccordionItem title="Период">
          <div className="text-sm">
            {periodStart
              ? `${periodStart.toLocaleDateString('ru-RU')} - ${periodEnd?.toLocaleDateString('ru-RU')}`
              : 'Не обнаружен'}
          </div>
        </AccordionItem>
        <AccordionItem title="Колонки">
          <div className="grid gap-2 text-sm">
            {Object.entries(diagnostics.columnMapping).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{columnLabels[key] || key}</span>
                <span className="max-w-[60%] truncate text-right font-medium" title={value || ''}>
                  {value || '—'}
                </span>
              </div>
            ))}
          </div>
        </AccordionItem>
        <AccordionItem title="Строки">
          <div className="space-y-2 text-sm">
            <div>
              <strong>Rows scanned:</strong> {diagnostics.totalRowsScanned}
            </div>
            <div>
              <strong>Rows accepted:</strong> {diagnostics.rowsAccepted}
            </div>
            <div>
              <strong>Rows skipped:</strong> {diagnostics.rowsSkipped}
            </div>
            <div>
              <strong>SKU upsert size:</strong> {diagnostics.skuUpsertSize}
            </div>
            <div>
              <strong>weekly_metrics attempted:</strong> {diagnostics.metricsAttempted}
            </div>
            <div>
              <strong>weekly_metrics inserted:</strong> {diagnostics.metricsInserted}
            </div>
            {Object.keys(diagnostics.skipReasons).length > 0 && (
              <div>
                <strong>Причины пропуска:</strong>{' '}
                {Object.entries(diagnostics.skipReasons)
                  .map(([reason, count]) => `${reason}: ${count}`)
                  .join(', ')}
              </div>
            )}
          </div>
        </AccordionItem>
        {preview && (
          <AccordionItem title="Превью">
            <div>{preview}</div>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
