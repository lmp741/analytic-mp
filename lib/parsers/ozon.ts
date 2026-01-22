/**
 * Ozon parser
 * Handles two-row header and duplicate artikul aggregation
 */

import * as XLSX from 'xlsx';
import {
  normalizeHeader,
  parseNumberRU,
  parsePercentToFraction,
  coerceInt,
  clampFraction,
  findHeaderRowByKeywords,
  isValidArtikul,
  isTotalsRow,
  safeDiv,
} from '@/lib/utils/parsing';

// CHANGEABLE: aggregation behavior for duplicate artikuls
const AGGREGATE_DUPLICATES = true;

export interface OzonRow {
  artikul: string;
  impressions: number;
  visits: number;
  ctr: number | null;
  add_to_cart: number;
  cr_to_cart: number | null;
  orders: number;
  revenue: number | null;
  price_avg: number | null;
  drr: number | null;
  stock_end: number | null;
  rating: number | null;
  reviews_count: number | null;
}

export interface OzonParseResult {
  rows: OzonRow[];
  periodStart: Date | null;
  periodEnd: Date | null;
  diagnostics: {
    sheetName: string | null;
    headerStartRow: number | null;
    headerSecondRow: number | null;
    headerSample: string[];
    totalRowsScanned: number;
    rowsAccepted: number;
    rowsSkipped: number;
    duplicatesAggregated: number;
    aggregationApplied: boolean;
    skipReasons: Record<string, number>;
    columnMapping: Record<string, string | null>;
    missingColumns: string[];
  };
  errors: string[];
  warnings: string[];
}

/**
 * Detects period from first 20 rows
 * Pattern: "Период: DD.MM.YYYY - DD.MM.YYYY"
 */
function detectPeriod(workbook: XLSX.WorkBook): { start: Date | null; end: Date | null } {
  const datePattern = /период[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i;
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    
    for (let row = 0; row <= Math.min(20, range.e.r); row++) {
      for (let col = 0; col <= Math.min(10, range.e.c); col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellAddress];
        if (cell && cell.v) {
          const text = String(cell.v);
          const match = text.match(datePattern);
          if (match) {
            try {
              const start = new Date(
                parseInt(match[3]),
                parseInt(match[2]) - 1,
                parseInt(match[1])
              );
              const end = new Date(
                parseInt(match[6]),
                parseInt(match[5]) - 1,
                parseInt(match[4])
              );
              if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                return { start, end };
              }
            } catch (e) {
              // Continue
            }
          }
        }
      }
    }
  }
  
  return { start: null, end: null };
}

/**
 * Finds sheet by name (fuzzy match)
 */
function findSheet(workbook: XLSX.WorkBook, expectedName: string): string | null {
  const normalizedExpected = normalizeHeader(expectedName);
  
  for (const sheetName of workbook.SheetNames) {
    if (normalizeHeader(sheetName).includes(normalizedExpected)) {
      return sheetName;
    }
  }
  
  return null;
}

/**
 * Builds composite header from two rows
 */
function buildCompositeHeaders(row1: any[], row2: any[]): string[] {
  const maxLen = Math.max(row1.length, row2.length);
  const headers: string[] = [];
  let lastGroup = '';
  
  for (let i = 0; i < maxLen; i++) {
    const groupRaw = normalizeHeader(row1[i]);
    const group = groupRaw || lastGroup;
    const metric = normalizeHeader(row2[i] || '');
    if (group) {
      lastGroup = group;
    }
    const composite = metric ? (group ? `${group} | ${metric}` : metric) : group;
    const isDynamic =
      composite.includes('динамика') || group.includes('динамика') || metric.includes('динамика');
    headers.push(isDynamic ? '' : composite);
  }
  
  return headers;
}

/**
 * Finds column by group and metric patterns
 */
function findColumnByGroupAndMetric(
  headers: string[],
  groupPatterns: string[],
  metricPatterns: string[]
): number | null {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header) continue;
    const hasGroup =
      groupPatterns.length === 0 ||
      groupPatterns.some((p) => header.includes(normalizeHeader(p)));
    const hasMetric =
      metricPatterns.length === 0 ||
      metricPatterns.some((p) => header.includes(normalizeHeader(p)));
    
    if (hasGroup && hasMetric) {
      return i;
    }
  }
  
  return null;
}

function findColumnByMetricOnly(headers: string[], metricPatterns: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header) continue;
    const parts = header.split('|').map((part) => part.trim());
    const metric = parts.length > 1 ? parts[1] : parts[0];
    if (metricPatterns.some((p) => metric.includes(normalizeHeader(p)))) {
      return i;
    }
  }
  return null;
}

/**
 * Aggregates duplicate artikuls
 */
function aggregateDuplicates(rows: OzonRow[]): {
  rows: OzonRow[];
  aggregatedCount: number;
} {
  const map = new Map<string, OzonRow>();
  let aggregatedCount = 0;
  
  for (const row of rows) {
    const existing = map.get(row.artikul);
    
    if (existing) {
      const prevVisits = existing.visits;
      const prevImpressions = existing.impressions;
      const prevRevenue = existing.revenue || 0;
      aggregatedCount++;
      // Sum aggregatable fields
      existing.impressions += row.impressions;
      existing.visits += row.visits;
      existing.add_to_cart += row.add_to_cart;
      existing.orders += row.orders;
      existing.revenue = (existing.revenue || 0) + (row.revenue || 0);
      
      // Recompute rates
      existing.ctr = clampFraction(safeDiv(existing.visits, existing.impressions));
      existing.cr_to_cart = clampFraction(safeDiv(existing.add_to_cart, existing.visits));
      
      // Weighted averages
      const totalVisits = prevVisits + row.visits;
      const totalImpressions = prevImpressions + row.impressions;
      if (row.price_avg !== null) {
        if (totalVisits > 0) {
          const weighted =
            (existing.price_avg || 0) * (prevVisits / totalVisits) +
            row.price_avg * (row.visits / totalVisits);
          existing.price_avg = weighted;
        } else if (totalImpressions > 0) {
          const weighted =
            (existing.price_avg || 0) * (prevImpressions / totalImpressions) +
            row.price_avg * (row.impressions / totalImpressions);
          existing.price_avg = weighted;
        } else if (existing.price_avg === null) {
          existing.price_avg = row.price_avg;
        }
      }

      if (row.drr !== null) {
        if (prevRevenue && row.revenue) {
          const totalRevenue = prevRevenue + row.revenue;
          const weighted =
            (existing.drr || 0) * (prevRevenue / totalRevenue) +
            row.drr * (row.revenue / totalRevenue);
          existing.drr = weighted;
        } else if (existing.drr === null) {
          existing.drr = row.drr;
        } else {
          existing.drr = (existing.drr + row.drr) / 2;
        }
      }
      
      // Take latest for optional fields
      if (row.stock_end !== null) existing.stock_end = row.stock_end;
      if (row.rating !== null) existing.rating = row.rating;
      if (row.reviews_count !== null) existing.reviews_count = row.reviews_count;
    } else {
      map.set(row.artikul, { ...row });
    }
  }
  
  return {
    rows: Array.from(map.values()),
    aggregatedCount,
  };
}

/**
 * Parses Ozon XLSX file
 */
export async function parseOzonFile(file: File): Promise<OzonParseResult> {
  const result: OzonParseResult = {
    rows: [],
    periodStart: null,
    periodEnd: null,
    diagnostics: {
      sheetName: null,
      headerStartRow: null,
      headerSecondRow: null,
      headerSample: [],
      totalRowsScanned: 0,
      rowsAccepted: 0,
      rowsSkipped: 0,
      duplicatesAggregated: 0,
      aggregationApplied: AGGREGATE_DUPLICATES,
      skipReasons: {},
      columnMapping: {},
      missingColumns: [],
    },
    errors: [],
    warnings: [],
  };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Detect period
    const period = detectPeriod(workbook);
    result.periodStart = period.start;
    result.periodEnd = period.end;

    // Find sheet
    const sheetName = findSheet(workbook, 'По товарам');
    if (!sheetName) {
      result.errors.push('OZON: лист с названием "По товарам" не найден.');
      return result;
    }
    result.diagnostics.sheetName = sheetName;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    }) as any[][];

    if (data.length < 3) {
      result.errors.push('Файл не содержит данных (меньше 3 строк)');
      return result;
    }

    let headerStartRow: number | null = null;
    const maxHeaderScan = Math.min(60, data.length - 1);
    for (let i = 0; i <= maxHeaderScan; i++) {
      const row = data[i] || [];
      const normalized = row.map((cell) => normalizeHeader(cell));
      const hasProducts = normalized.some((cell) => cell.includes('товар'));
      const hasGroups = normalized.some(
        (cell) =>
          cell.includes('воронка продаж') ||
          cell.includes('факторы продаж') ||
          cell.includes('продажи')
      );
      if (hasProducts && hasGroups) {
        headerStartRow = i;
        break;
      }
    }

    if (headerStartRow === null) {
      result.errors.push(
        'OZON: не нашли строку шапки (ожидали "Воронка продаж" / "Факторы продаж" / "Продажи").'
      );
      return result;
    }

    const headerSecondRow = headerStartRow + 1;
    if (headerSecondRow >= data.length) {
      result.errors.push('OZON: не нашли вторую строку шапки (двухстрочная шапка).');
      return result;
    }

    result.diagnostics.headerStartRow = headerStartRow;
    result.diagnostics.headerSecondRow = headerSecondRow;

    // Build composite headers
    const row1 = data[headerStartRow] || [];
    const row2 = data[headerSecondRow] || [];
    const compositeHeaders = buildCompositeHeaders(row1, row2);
    const headerSample = compositeHeaders.filter(Boolean).slice(0, 30);
    result.diagnostics.headerSample = headerSample;

    // Map columns
    const impressionsComposite = findColumnByGroupAndMetric(
      compositeHeaders,
      ['воронка продаж'],
      ['показы всего', 'показы']
    );
    const visitsComposite = findColumnByGroupAndMetric(
      compositeHeaders,
      ['воронка продаж'],
      ['посещения карточки товара', 'посещения карточки']
    );
    const columnMap: Record<string, number | null> = {
      artikul: findColumnByGroupAndMetric(compositeHeaders, [], ['артикул']),
      impressions:
        impressionsComposite ??
        findColumnByMetricOnly(compositeHeaders, ['показы всего', 'показы']),
      visits:
        visitsComposite ??
        findColumnByMetricOnly(compositeHeaders, ['посещения карточки товара', 'посещения карточки']),
      add_to_cart: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['добавления в корзину всего', 'добавления в корзину', 'корзин']
      ),
      cr_to_cart: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['конверсия в корзину общая', 'конверсия в корзину', 'конверсия', 'корзин']
      ),
      orders: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['заказано товаров', 'заказано']
      ),
      revenue: findColumnByGroupAndMetric(
        compositeHeaders,
        ['продажи'],
        ['заказано на сумму', 'заказано', 'сумм', 'выручка']
      ),
      price_avg: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['средняя цена', 'средняя']
      ),
      drr: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['общая дрр', 'дрр']
      ),
      stock_end: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['остаток на конец периода', 'остаток на конец', 'остаток']
      ),
      rating: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['рейтинг товара', 'рейтинг']
      ),
      reviews: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['отзывы']
      ),
    };

    // Store mapping
    Object.entries(columnMap).forEach(([key, idx]) => {
      result.diagnostics.columnMapping[key] =
        idx !== null ? compositeHeaders[idx] : null;
    });

    // Check required
    const headerSampleText =
      headerSample.length > 0 ? headerSample.join(', ') : 'не найдено';
    const requiredColumns: Array<{ key: string; label: string }> = [
      { key: 'artikul', label: 'Артикул' },
      { key: 'impressions', label: 'Показы всего' },
      { key: 'visits', label: 'Посещения карточки товара' },
    ];
    requiredColumns.forEach(({ key, label }) => {
      if (columnMap[key] === null) {
        result.diagnostics.missingColumns.push(key);
        result.errors.push(
          `OZON: не нашли колонку "${label}". Найденные composite заголовки (первые 30): ${headerSampleText}`
        );
      }
    });

    if (result.errors.length > 0) {
      return result;
    }

    // Parse rows
    const startRow = headerSecondRow + 3;
    result.diagnostics.totalRowsScanned = data.length - startRow;
    const warningsSet = new Set<string>();
    let zeroImpressionsCount = 0;
    let negativeValuesCount = 0;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      if (isTotalsRow(row)) {
        result.diagnostics.rowsSkipped++;
        result.diagnostics.skipReasons['totals_row'] =
          (result.diagnostics.skipReasons['totals_row'] || 0) + 1;
        continue;
      }

      const artikulRaw = row[columnMap.artikul!];
      const artikul = String(artikulRaw || '').trim().toUpperCase();

      if (!isValidArtikul(artikul)) {
        result.diagnostics.rowsSkipped++;
        result.diagnostics.skipReasons['invalid_artikul'] =
          (result.diagnostics.skipReasons['invalid_artikul'] || 0) + 1;
        continue;
      }

      const getCell = (idx: number | null) => (idx === null ? null : row[idx]);
      const clampNonNegative = (value: number | null, label: string) => {
        if (value === null) return null;
        if (value < 0) {
          negativeValuesCount += 1;
          warningsSet.add(`OZON: отрицательные значения "${label}" были обнулены.`);
          return 0;
        }
        return value;
      };

      const impressions = clampNonNegative(
        coerceInt(parseNumberRU(getCell(columnMap.impressions))) ?? null,
        'Показы всего'
      );
      const visits = clampNonNegative(
        coerceInt(parseNumberRU(getCell(columnMap.visits))) ?? null,
        'Посещения карточки товара'
      );

      if (impressions === null || visits === null) {
        result.diagnostics.rowsSkipped++;
        result.diagnostics.skipReasons['missing_required'] =
          (result.diagnostics.skipReasons['missing_required'] || 0) + 1;
        continue;
      }

      const add_to_cart = clampNonNegative(
        coerceInt(parseNumberRU(getCell(columnMap.add_to_cart))) ?? 0,
        'Добавления в корзину'
      ) ?? 0;
      const orders = clampNonNegative(
        coerceInt(parseNumberRU(getCell(columnMap.orders))) ?? 0,
        'Заказано товаров'
      ) ?? 0;
      const revenue = clampNonNegative(parseNumberRU(getCell(columnMap.revenue)), 'Выручка');
      const price_avg = clampNonNegative(
        parseNumberRU(getCell(columnMap.price_avg)),
        'Средняя цена'
      );
      const drr = clampFraction(
        parsePercentToFraction(getCell(columnMap.drr))
      );
      const stock_end = clampNonNegative(
        coerceInt(parseNumberRU(getCell(columnMap.stock_end))) ?? null,
        'Остаток'
      );
      const rating = clampNonNegative(parseNumberRU(getCell(columnMap.rating)), 'Рейтинг');
      const reviews_count = clampNonNegative(
        coerceInt(parseNumberRU(getCell(columnMap.reviews))) ?? null,
        'Отзывы'
      );

      // Compute rates
      const ctr = clampFraction(safeDiv(visits, impressions));
      const cr_to_cart_raw = getCell(columnMap.cr_to_cart);
      let cr_to_cart: number | null;
      if (cr_to_cart_raw !== null && cr_to_cart_raw !== undefined) {
        const parsed = parsePercentToFraction(cr_to_cart_raw);
        cr_to_cart = clampFraction(parsed) ?? safeDiv(add_to_cart, visits);
      } else {
        cr_to_cart = safeDiv(add_to_cart, visits);
      }

      if (impressions === 0) {
        zeroImpressionsCount += 1;
      }

      result.rows.push({
        artikul,
        impressions,
        visits,
        ctr,
        add_to_cart,
        cr_to_cart,
        orders,
        revenue,
        price_avg,
        drr,
        stock_end,
        rating,
        reviews_count,
      });

      result.diagnostics.rowsAccepted++;
    }

    if (AGGREGATE_DUPLICATES) {
      const aggregated = aggregateDuplicates(result.rows);
      result.rows = aggregated.rows;
      result.diagnostics.duplicatesAggregated = aggregated.aggregatedCount;
      result.diagnostics.aggregationApplied = true;
    } else {
      result.diagnostics.duplicatesAggregated = 0;
      result.diagnostics.aggregationApplied = false;
    }
    if (zeroImpressionsCount > 0) {
      warningsSet.add(
        `OZON: ${zeroImpressionsCount} строк(и) с показами = 0. CTR рассчитан как null.`
      );
    }
    if (negativeValuesCount > 0) {
      warningsSet.add(
        'OZON: обнаружены отрицательные значения, они были обнулены.'
      );
    }
    result.warnings.push(...warningsSet);
  } catch (error) {
    result.errors.push(`Ошибка парсинга: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}
