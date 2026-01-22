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
  isValidArtikul,
  isTotalsRow,
  safeDiv,
} from '@/lib/utils/parsing';

export interface OzonRow {
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
}

export interface OzonParseResult {
  rows: OzonRow[];
  periodStart: Date | null;
  periodEnd: Date | null;
  diagnostics: {
    sheetName: string | null;
    headerStartRow: number | null;
    totalRowsScanned: number;
    rowsAccepted: number;
    rowsSkipped: number;
    duplicatesAggregated: number;
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
  
  for (let i = 0; i < maxLen; i++) {
    const cell1 = normalizeHeader(row1[i]);
    const cell2 = normalizeHeader(row2[i] || '');
    
    if (cell1 && cell2) {
      headers.push(`${cell1} | ${cell2}`);
    } else if (cell1) {
      headers.push(cell1);
    } else if (cell2) {
      headers.push(cell2);
    } else {
      headers.push('');
    }
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
    const hasGroup = groupPatterns.some((p) => header.includes(p.toLowerCase()));
    const hasMetric = metricPatterns.some((p) => header.includes(p.toLowerCase()));
    
    if (hasGroup && hasMetric) {
      return i;
    }
  }
  
  return null;
}

/**
 * Aggregates duplicate artikuls
 */
function aggregateDuplicates(rows: OzonRow[]): OzonRow[] {
  const map = new Map<string, OzonRow>();
  let aggregatedCount = 0;
  
  for (const row of rows) {
    const existing = map.get(row.artikul);
    
    if (existing) {
      aggregatedCount++;
      // Sum aggregatable fields
      existing.impressions += row.impressions;
      existing.visits += row.visits;
      existing.add_to_cart += row.add_to_cart;
      existing.orders += row.orders;
      existing.revenue = (existing.revenue || 0) + (row.revenue || 0);
      
      // Recompute rates
      existing.ctr = clampFraction(safeDiv(existing.visits, existing.impressions)) ?? 0;
      existing.cr_to_cart = clampFraction(safeDiv(existing.add_to_cart, existing.visits)) ?? 0;
      
      // Weighted averages
      const totalVisits = existing.visits;
      if (totalVisits > 0 && row.visits > 0 && row.price_avg !== null) {
        const existingWeight = existing.visits / totalVisits;
        const newWeight = row.visits / totalVisits;
        existing.price_avg =
          (existing.price_avg || 0) * existingWeight + row.price_avg * newWeight;
      } else if (row.price_avg !== null && existing.price_avg === null) {
        existing.price_avg = row.price_avg;
      }
      
      if (row.drr !== null) {
        if (existing.revenue && row.revenue) {
          const totalRevenue = existing.revenue;
          const existingWeight = existing.revenue / totalRevenue;
          const newWeight = row.revenue / totalRevenue;
          existing.drr = (existing.drr || 0) * existingWeight + row.drr * newWeight;
        } else if (existing.drr === null) {
          existing.drr = row.drr;
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
      totalRowsScanned: 0,
      rowsAccepted: 0,
      rowsSkipped: 0,
      duplicatesAggregated: 0,
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
      result.errors.push('Лист "По товарам" не найден');
      return result;
    }
    result.diagnostics.sheetName = sheetName;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];

    if (data.length < 3) {
      result.errors.push('Файл не содержит данных (меньше 3 строк)');
      return result;
    }

    // Find header start (look for "Товары" or "Артикул")
    let headerStartRow = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i] || [];
      const rowText = row.join(' ').toLowerCase();
      if (rowText.includes('товар') || rowText.includes('артикул')) {
        headerStartRow = i;
        break;
      }
    }

    result.diagnostics.headerStartRow = headerStartRow;

    // Build composite headers
    const row1 = data[headerStartRow] || [];
    const row2 = data[headerStartRow + 1] || [];
    const compositeHeaders = buildCompositeHeaders(row1, row2);

    // Map columns
    const columnMap: Record<string, number | null> = {
      artikul: findColumnByGroupAndMetric(compositeHeaders, [], ['артикул']),
      impressions: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['показы']
      ),
      visits: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['посещения карточки']
      ),
      add_to_cart: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['добавления', 'корзин']
      ),
      cr_to_cart: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['конверсия', 'корзин']
      ),
      orders: findColumnByGroupAndMetric(
        compositeHeaders,
        ['воронка продаж'],
        ['заказано товаров']
      ),
      revenue: findColumnByGroupAndMetric(
        compositeHeaders,
        ['продажи'],
        ['заказано', 'сумм']
      ),
      price_avg: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['средняя цена']
      ),
      drr: findColumnByGroupAndMetric(compositeHeaders, ['факторы продаж'], ['дрр']),
      stock_end: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['остаток', 'конец']
      ),
      rating: findColumnByGroupAndMetric(
        compositeHeaders,
        ['факторы продаж'],
        ['рейтинг']
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
    const required = ['artikul', 'impressions', 'visits'];
    required.forEach((key) => {
      if (columnMap[key] === null) {
        result.diagnostics.missingColumns.push(key);
        result.errors.push(`Обязательная колонка "${key}" не найдена`);
      }
    });

    if (result.errors.length > 0) {
      return result;
    }

    // Parse rows
    result.diagnostics.totalRowsScanned = data.length - headerStartRow - 2;

    for (let i = headerStartRow + 2; i < data.length; i++) {
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

      const impressions = coerceInt(parseNumberRU(row[columnMap.impressions!]));
      const visits = coerceInt(parseNumberRU(row[columnMap.visits!]));

      if (impressions === null || visits === null) {
        result.diagnostics.rowsSkipped++;
        result.diagnostics.skipReasons['missing_required'] =
          (result.diagnostics.skipReasons['missing_required'] || 0) + 1;
        continue;
      }

      const add_to_cart = coerceInt(parseNumberRU(row[columnMap.add_to_cart!])) ?? 0;
      const orders = coerceInt(parseNumberRU(row[columnMap.orders!])) ?? 0;
      const revenue = parseNumberRU(row[columnMap.revenue!]);
      const price_avg = parseNumberRU(row[columnMap.price_avg!]);
      const drr = parseNumberRU(row[columnMap.drr!]);
      const stock_end = coerceInt(parseNumberRU(row[columnMap.stock_end!]));
      const rating = parseNumberRU(row[columnMap.rating!]);
      const reviews_count = coerceInt(parseNumberRU(row[columnMap.reviews!]));

      // Compute rates
      const ctr = clampFraction(safeDiv(visits, impressions)) ?? 0;
      const cr_to_cart_raw = row[columnMap.cr_to_cart!];
      let cr_to_cart: number;
      if (cr_to_cart_raw !== null && cr_to_cart_raw !== undefined) {
        const parsed = parsePercentToFraction(cr_to_cart_raw);
        cr_to_cart = clampFraction(parsed) ?? safeDiv(add_to_cart, visits) ?? 0;
      } else {
        cr_to_cart = safeDiv(add_to_cart, visits) ?? 0;
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

    // Aggregate duplicates
    const aggregated = aggregateDuplicates(result.rows);
    result.rows = aggregated.rows;
    result.diagnostics.duplicatesAggregated = aggregated.aggregatedCount;
  } catch (error) {
    result.errors.push(`Ошибка парсинга: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}
