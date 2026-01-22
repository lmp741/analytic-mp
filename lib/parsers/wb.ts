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
  findHeaderRow,
  pickColIndex,
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
    headerRowIndex: number | null;
    totalRowsScanned: number;
    rowsAccepted: number;
    rowsSkipped: number;
    skipReasons: Record<string, number>;
    columnMapping: Record<string, string | null>;
    missingColumns: string[];
    headerSample: string[];
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
      headerRowIndex: null,
      totalRowsScanned: 0,
      rowsAccepted: 0,
      rowsSkipped: 0,
      skipReasons: {},
      columnMapping: {},
      missingColumns: [],
      headerSample: [],
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
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    }) as any[][];

    if (data.length < 2) {
      result.errors.push('Файл не содержит данных (меньше 2 строк)');
      return result;
    }

    const headerRowIndex = findHeaderRow(data, {
      maxRows: 50,
      matcher: (cell) => cell.includes('артикул') && cell.includes('продав'),
    });

    if (headerRowIndex === null) {
      result.errors.push(
        'WB: не нашли строку шапки (ожидали колонку "Артикул продавца"). Проверьте файл.'
      );
      return result;
    }

    result.diagnostics.headerRowIndex = headerRowIndex;

    const headers = data[headerRowIndex] || [];
    const normalizedHeaders = headers.map(normalizeHeader);
    result.diagnostics.headerSample = headers
      .map((header) => (header === null || header === undefined ? '' : String(header).trim()))
      .filter((header) => header.length > 0)
      .slice(0, 20);

    // Map columns
    const columnMap: Record<string, number | null> = {
      artikul: pickColIndex(normalizedHeaders, [/артикул.*продав/, 'артикул продавца']),
      impressions: pickColIndex(normalizedHeaders, ['показы']),
      visits: pickColIndex(normalizedHeaders, [/переход.*карточ/, 'переходы в карточку']),
      ctr: pickColIndex(normalizedHeaders, ['ctr']),
      add_to_cart: pickColIndex(normalizedHeaders, [/положил.*корзин/, /добавил.*корзин/]),
      cr_to_cart: pickColIndex(normalizedHeaders, [/конверс.*корзин/]),
      orders: pickColIndex(normalizedHeaders, [/заказал.*шт/, 'заказали, шт']),
      revenue: pickColIndex(normalizedHeaders, [/заказал.*сумм/, 'выручка']),
      price_avg: pickColIndex(normalizedHeaders, ['средняя цена']),
      stock_end: pickColIndex(normalizedHeaders, [/остаток.*конец/, /остатк.*шт/]),
      delivery: pickColIndex(normalizedHeaders, [/среднее время достав/, 'среднее время доставки']),
      rating: pickColIndex(normalizedHeaders, ['рейтинг']),
      reviews: pickColIndex(normalizedHeaders, ['отзыв']),
    };

    // Store mapping for diagnostics
    Object.entries(columnMap).forEach(([key, idx]) => {
      result.diagnostics.columnMapping[key] =
        idx !== null ? (headers[idx] || null) : null;
    });

    // Check required columns
    const headerSampleText =
      result.diagnostics.headerSample.length > 0
        ? result.diagnostics.headerSample.join(', ')
        : 'не найдено';
    const requiredColumns: Array<{ key: string; label: string }> = [
      { key: 'artikul', label: 'Артикул продавца' },
      { key: 'impressions', label: 'Показы' },
    ];
    requiredColumns.forEach(({ key, label }) => {
      if (columnMap[key] === null) {
        result.diagnostics.missingColumns.push(key);
        result.errors.push(
          `WB: не нашли колонку "${label}". Найденные заголовки: ${headerSampleText}`
        );
      }
    });

    if (columnMap.visits === null) {
      result.warnings.push(
        `WB: не нашли колонку "Переходы в карточку". CTR будет рассчитан от показов.`
      );
    }

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
      const impressions = coerceInt(
        parseNumberRU(columnMap.impressions !== null ? row[columnMap.impressions] : null)
      );
      const visits = coerceInt(
        parseNumberRU(columnMap.visits !== null ? row[columnMap.visits] : null)
      );
      const visitsValue = visits ?? 0;

      if (impressions === null) {
        result.diagnostics.rowsSkipped++;
        result.diagnostics.skipReasons['missing_required'] =
          (result.diagnostics.skipReasons['missing_required'] || 0) + 1;
        continue;
      }

      // Parse optional fields
      const ctrRaw = columnMap.ctr !== null ? row[columnMap.ctr] : null;
      let ctr: number;
      if (ctrRaw !== null && ctrRaw !== undefined) {
        const parsed = parsePercentToFraction(ctrRaw);
        ctr = clampFraction(parsed) ?? safeDiv(visitsValue, impressions) ?? 0;
      } else {
        ctr = safeDiv(visitsValue, impressions) ?? 0;
      }

      const add_to_cart =
        coerceInt(
          parseNumberRU(
            columnMap.add_to_cart !== null ? row[columnMap.add_to_cart] : null
          )
        ) ?? 0;
      const cr_to_cart_raw =
        columnMap.cr_to_cart !== null ? row[columnMap.cr_to_cart] : null;
      let cr_to_cart: number;
      if (cr_to_cart_raw !== null && cr_to_cart_raw !== undefined) {
        const parsed = parsePercentToFraction(cr_to_cart_raw);
        cr_to_cart = clampFraction(parsed) ?? safeDiv(add_to_cart, visitsValue) ?? 0;
      } else {
        cr_to_cart = safeDiv(add_to_cart, visitsValue) ?? 0;
      }

      const orders =
        coerceInt(parseNumberRU(columnMap.orders !== null ? row[columnMap.orders] : null)) ??
        0;
      const revenue = parseNumberRU(columnMap.revenue !== null ? row[columnMap.revenue] : null);
      const price_avg = parseNumberRU(
        columnMap.price_avg !== null ? row[columnMap.price_avg] : null
      );
      const stock_end = coerceInt(
        parseNumberRU(columnMap.stock_end !== null ? row[columnMap.stock_end] : null)
      );
      const delivery_raw = parseNumberRU(
        columnMap.delivery !== null ? row[columnMap.delivery] : null
      );
      const delivery_avg_hours = delivery_raw !== null ? delivery_raw : null;
      const rating = parseNumberRU(columnMap.rating !== null ? row[columnMap.rating] : null);
      const reviews_count = coerceInt(
        parseNumberRU(columnMap.reviews !== null ? row[columnMap.reviews] : null)
      );

      result.rows.push({
        artikul,
        impressions,
        visits: visitsValue,
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
