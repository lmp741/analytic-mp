/**
 * Wildberries parser
 * Handles tolerant column matching and period detection
 */

import * as XLSX from 'xlsx';
import {
  normalizeHeader,
  parseNumberRU,
  parsePercentToFraction,
  coerceInt,
  clampFraction,
  findColumnIndex,
  isValidArtikul,
  isTotalsRow,
  safeDiv,
} from '@/lib/utils/parsing';

export interface WBRow {
  artikul: string;
  impressions: number;
  visits: number;
  ctr: number;
  add_to_cart: number;
  cr_to_cart: number;
  orders: number;
  revenue: number | null;
  price_avg: number | null;
  stock_end: number | null;
  delivery_avg_hours: number | null;
  rating: number | null;
  reviews_count: number | null;
}

export interface WBParseResult {
  rows: WBRow[];
  periodStart: Date | null;
  periodEnd: Date | null;
  diagnostics: {
    sheetName: string | null;
    totalRowsScanned: number;
    rowsAccepted: number;
    rowsSkipped: number;
    skipReasons: Record<string, number>;
    columnMapping: Record<string, string | null>;
    missingColumns: string[];
  };
  errors: string[];
  warnings: string[];
}

/**
 * Detects period from sheet cells
 * Searches for pattern "С DD.MM.YYYY по DD.MM.YYYY"
 */
function detectPeriod(workbook: XLSX.WorkBook): { start: Date | null; end: Date | null } {
  const datePattern = /с\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s+по\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i;
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    
    // Search first 50 rows
    for (let row = 0; row <= Math.min(50, range.e.r); row++) {
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
              // Continue searching
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
 * Parses WB XLSX file
 */
export async function parseWBFile(file: File): Promise<WBParseResult> {
  const result: WBParseResult = {
    rows: [],
    periodStart: null,
    periodEnd: null,
    diagnostics: {
      sheetName: null,
      totalRowsScanned: 0,
      rowsAccepted: 0,
      rowsSkipped: 0,
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
    const sheetName = findSheet(workbook, 'Товары');
    if (!sheetName) {
      result.errors.push('Лист "Товары" не найден. Проверьте, что файл содержит лист с названием, содержащим "товар"');
      return result;
    }
    result.diagnostics.sheetName = sheetName;

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];

    if (data.length < 2) {
      result.errors.push('Файл не содержит данных (меньше 2 строк)');
      return result;
    }

    // Find header row (first non-empty row)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      if (data[i] && data[i].some((cell) => cell !== null && cell !== '')) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = data[headerRowIndex] || [];
    const normalizedHeaders = headers.map(normalizeHeader);

    // Map columns
    const columnMap: Record<string, number | null> = {
      artikul: findColumnIndex(normalizedHeaders, ['артикул', 'продав']),
      impressions: findColumnIndex(normalizedHeaders, ['показы']),
      visits: findColumnIndex(normalizedHeaders, ['переход', 'карточ']),
      ctr: findColumnIndex(normalizedHeaders, ['ctr']),
      add_to_cart: findColumnIndex(normalizedHeaders, ['корзин']),
      cr_to_cart: findColumnIndex(normalizedHeaders, ['конверси', 'корзин']),
      orders: findColumnIndex(normalizedHeaders, ['заказ', 'шт']),
      revenue: findColumnIndex(normalizedHeaders, ['заказали на сумму', 'выруч']),
      price_avg: findColumnIndex(normalizedHeaders, ['средняя цена']),
      stock_end: findColumnIndex(normalizedHeaders, ['остатк', 'шт']),
      delivery: findColumnIndex(normalizedHeaders, ['среднее время достав']),
      rating: findColumnIndex(normalizedHeaders, ['рейтинг']),
      reviews: findColumnIndex(normalizedHeaders, ['отзыв']),
    };

    // Store mapping for diagnostics
    Object.entries(columnMap).forEach(([key, idx]) => {
      result.diagnostics.columnMapping[key] =
        idx !== null ? (headers[idx] || null) : null;
    });

    // Check required columns
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
    result.diagnostics.totalRowsScanned = data.length - headerRowIndex - 1;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      // Skip totals rows
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

      // Parse values
      const impressions = coerceInt(parseNumberRU(row[columnMap.impressions!]));
      const visits = coerceInt(parseNumberRU(row[columnMap.visits!]));

      if (impressions === null || visits === null) {
        result.diagnostics.rowsSkipped++;
        result.diagnostics.skipReasons['missing_required'] =
          (result.diagnostics.skipReasons['missing_required'] || 0) + 1;
        continue;
      }

      // Parse optional fields
      const ctrRaw = row[columnMap.ctr!];
      let ctr: number;
      if (ctrRaw !== null && ctrRaw !== undefined) {
        const parsed = parsePercentToFraction(ctrRaw);
        ctr = clampFraction(parsed) ?? safeDiv(visits, impressions) ?? 0;
      } else {
        ctr = safeDiv(visits, impressions) ?? 0;
      }

      const add_to_cart = coerceInt(parseNumberRU(row[columnMap.add_to_cart!])) ?? 0;
      const cr_to_cart_raw = row[columnMap.cr_to_cart!];
      let cr_to_cart: number;
      if (cr_to_cart_raw !== null && cr_to_cart_raw !== undefined) {
        const parsed = parsePercentToFraction(cr_to_cart_raw);
        cr_to_cart = clampFraction(parsed) ?? safeDiv(add_to_cart, visits) ?? 0;
      } else {
        cr_to_cart = safeDiv(add_to_cart, visits) ?? 0;
      }

      const orders = coerceInt(parseNumberRU(row[columnMap.orders!])) ?? 0;
      const revenue = parseNumberRU(row[columnMap.revenue!]);
      const price_avg = parseNumberRU(row[columnMap.price_avg!]);
      const stock_end = coerceInt(parseNumberRU(row[columnMap.stock_end!]));
      const delivery_raw = parseNumberRU(row[columnMap.delivery!]);
      const delivery_avg_hours = delivery_raw !== null ? delivery_raw : null;
      const rating = parseNumberRU(row[columnMap.rating!]);
      const reviews_count = coerceInt(parseNumberRU(row[columnMap.reviews!]));

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
        stock_end,
        delivery_avg_hours,
        rating,
        reviews_count,
      });

      result.diagnostics.rowsAccepted++;
    }
  } catch (error) {
    result.errors.push(`Ошибка парсинга: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}
