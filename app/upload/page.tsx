'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { parseWBFile, type WBParseResult } from '@/lib/parsers/wb';
import { parseOzonFile, type OzonParseResult } from '@/lib/parsers/ozon';
import { computeFileHash } from '@/lib/utils/hash';
import { formatInt, formatPercent, formatMoney } from '@/lib/utils/formatting';

type UploadState = 'idle' | 'parsing' | 'parsed' | 'importing' | 'imported' | 'error';

export default function UploadPage() {
  const [wbFile, setWbFile] = useState<File | null>(null);
  const [ozonFile, setOzonFile] = useState<File | null>(null);
  const [wbResult, setWbResult] = useState<WBParseResult | null>(null);
  const [ozonResult, setOzonResult] = useState<OzonParseResult | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleWbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleOzonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    
    // Check for existing imports and show confirmation
    // For now, proceed with import
    setState('importing');
    setError(null);

    try {
      // Import WB if available
      if (wbFile && wbResult && wbResult.periodStart && wbResult.periodEnd) {
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
          throw new Error(error.error || 'WB import failed');
        }
      }

      // Import Ozon if available
      if (ozonFile && ozonResult && ozonResult.periodStart && ozonResult.periodEnd) {
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
          throw new Error(error.error || 'Ozon import failed');
        }
      }

      setState('imported');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта');
      setState('error');
    }
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
        stats: {
          totalRowsScanned: wbResult.diagnostics.totalRowsScanned,
          rowsAccepted: wbResult.diagnostics.rowsAccepted,
          rowsSkipped: wbResult.diagnostics.rowsSkipped,
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
        stats: {
          totalRowsScanned: ozonResult.diagnostics.totalRowsScanned,
          rowsAccepted: ozonResult.diagnostics.rowsAccepted,
          rowsSkipped: ozonResult.diagnostics.rowsSkipped,
          duplicatesAggregated: ozonResult.diagnostics.duplicatesAggregated,
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

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Загрузка данных</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Wildberries</CardTitle>
            <CardDescription>Загрузите отчет WB</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleWbFileChange}
              className="mb-4"
            />
            {wbFile && (
              <div className="text-sm text-muted-foreground">
                Файл: {wbFile.name} ({(wbFile.size / 1024).toFixed(2)} KB)
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ozon</CardTitle>
            <CardDescription>Загрузите отчет Ozon</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleOzonFileChange}
              className="mb-4"
            />
            {ozonFile && (
              <div className="text-sm text-muted-foreground">
                Файл: {ozonFile.name} ({(ozonFile.size / 1024).toFixed(2)} KB)
              </div>
            )}
          </CardContent>
        </Card>
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
            <Button onClick={handleImport} disabled={state === 'importing'}>
              {state === 'importing' ? 'Импорт...' : 'Import to database'}
            </Button>
            <Button onClick={downloadDiagnostics} variant="secondary">
              Download diagnostics JSON
            </Button>
          </div>

          {wbResult && (
            <Card>
              <CardHeader>
                <CardTitle>WB Diagnostics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <strong>Sheet:</strong> {wbResult.diagnostics.sheetName || 'N/A'}
                  </div>
                  <div>
                    <strong>Period:</strong>{' '}
                    {wbResult.periodStart
                      ? `${wbResult.periodStart.toLocaleDateString('ru-RU')} - ${wbResult.periodEnd?.toLocaleDateString('ru-RU')}`
                      : 'Не обнаружен'}
                  </div>
                  <div>
                    <strong>Rows:</strong> {wbResult.diagnostics.rowsAccepted} accepted,{' '}
                    {wbResult.diagnostics.rowsSkipped} skipped
                  </div>
                  {wbResult.rows.length > 0 && (
                    <div>
                      <strong>Preview (first 5 rows):</strong>
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
                              <td className="border p-2">{formatInt(row.impressions)}</td>
                              <td className="border p-2">{formatInt(row.visits)}</td>
                              <td className="border p-2">{formatPercent(row.ctr)}</td>
                              <td className="border p-2">{formatInt(row.orders)}</td>
                              <td className="border p-2">{formatMoney(row.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {ozonResult && (
            <Card>
              <CardHeader>
                <CardTitle>Ozon Diagnostics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <strong>Sheet:</strong> {ozonResult.diagnostics.sheetName || 'N/A'}
                  </div>
                  <div>
                    <strong>Period:</strong>{' '}
                    {ozonResult.periodStart
                      ? `${ozonResult.periodStart.toLocaleDateString('ru-RU')} - ${ozonResult.periodEnd?.toLocaleDateString('ru-RU')}`
                      : 'Не обнаружен'}
                  </div>
                  <div>
                    <strong>Rows:</strong> {ozonResult.diagnostics.rowsAccepted} accepted,{' '}
                    {ozonResult.diagnostics.rowsSkipped} skipped
                  </div>
                  <div>
                    <strong>Duplicates aggregated:</strong>{' '}
                    {ozonResult.diagnostics.duplicatesAggregated}
                  </div>
                  {ozonResult.rows.length > 0 && (
                    <div>
                      <strong>Preview (first 5 rows):</strong>
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
                              <td className="border p-2">{formatInt(row.impressions)}</td>
                              <td className="border p-2">{formatInt(row.visits)}</td>
                              <td className="border p-2">{formatPercent(row.ctr)}</td>
                              <td className="border p-2">{formatInt(row.orders)}</td>
                              <td className="border p-2">{formatMoney(row.revenue)}</td>
                              <td className="border p-2">{formatPercent(row.drr)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
