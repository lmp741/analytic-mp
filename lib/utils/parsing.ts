/**
 * Shared parsing utilities for robust XLSX/CSV parsing
 * Handles RU locale, malformed data, and edge cases
 */

import { parseRuNumber, parseRuPercentToFraction } from '@/lib/utils/number';
/**
 * Normalizes header strings: trim, collapse spaces, replace line breaks
 */
export function normalizeHeader(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toString()
    .trim()
    .replace(/[\u00a0]/g, ' ')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Parses number from RU locale string
 * Handles: "12 345", "12,34", "12.34", "₽", "%", empty, "—", null
 */
export function parseNumberRU(value: any): number | null {
  return parseRuNumber(value);
}

/**
 * Parses percent value to fraction (0..1)
 * If value > 1 and <= 100, assumes percent; else if 0..1 assumes fraction
 */
export function parsePercentToFraction(value: any): number | null {
  return parseRuPercentToFraction(value);
}

/**
 * Finds header row index by matching normalized cell values.
 */
export function findHeaderRow(
  rows: any[][],
  options: {
    maxRows?: number;
    matcher: (normalizedCell: string) => boolean;
  }
): number | null {
  const maxRows = Math.min(options.maxRows ?? 50, rows.length - 1);
  for (let i = 0; i <= maxRows; i++) {
    const row = rows[i] || [];
    for (const cell of row) {
      const normalized = normalizeHeader(cell);
      if (normalized && options.matcher(normalized)) {
        return i;
      }
    }
  }
  return null;
}

/**
 * Finds header row index by matching any keyword in normalized cell values.
 */
export function findHeaderRowByKeywords(
  rows: any[][],
  keywords: string[],
  maxRows: number = 50
): number | null {
  const normalizedKeywords = keywords.map((keyword) => normalizeHeader(keyword));
  return findHeaderRow(rows, {
    maxRows,
    matcher: (cell) => normalizedKeywords.some((keyword) => cell.includes(keyword)),
  });
}

/**
 * Picks column index by matching candidate strings/regex against normalized headers.
 */
export function pickColIndex(
  headers: string[],
  candidates: Array<string | RegExp>
): number | null {
  for (const candidate of candidates) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (!header) continue;
      if (typeof candidate === 'string') {
        if (header.includes(candidate.toLowerCase())) {
          return i;
        }
      } else if (candidate.test(header)) {
        return i;
      }
    }
  }
  return null;
}

/**
 * Safe division: returns null if denominator is 0
 */
export function safeDiv(
  numerator: number | null,
  denominator: number | null,
  ignoreZero: boolean = false
): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) {
    if (ignoreZero) return null;
    return null; // Always return null for division by zero
  }
  
  const result = numerator / denominator;
  if (isNaN(result) || !isFinite(result)) return null;
  return result;
}

/**
 * Clamps fraction to 0..1 range
 * Logs warning if value is outside range
 */
export function clampFraction(x: number | null, logWarning: boolean = false): number | null {
  if (x === null) return null;
  
  if (x < 0) {
    if (logWarning) console.warn(`Fraction ${x} is negative, clamping to 0`);
    return 0;
  }
  if (x > 1) {
    if (logWarning) console.warn(`Fraction ${x} > 1, clamping to 1`);
    return 1;
  }
  
  return x;
}

/**
 * Coerces value to integer, minimum 0
 * If negative, warns and clamps to 0
 */
export function coerceInt(x: number | null, logWarning: boolean = false): number | null {
  if (x === null) return null;
  
  const rounded = Math.round(x);
  
  if (rounded < 0) {
    if (logWarning) console.warn(`Integer ${x} is negative, clamping to 0`);
    return 0;
  }
  
  return rounded;
}

/**
 * Checks if string matches pattern (case-insensitive, fuzzy)
 */
export function fuzzyMatch(str: string, patterns: string[]): boolean {
  const normalized = normalizeHeader(str);
  return patterns.some(pattern => normalized.includes(pattern.toLowerCase()));
}

/**
 * Finds column index by fuzzy matching header
 */
export function findColumnIndex(
  headers: (string | null | undefined)[],
  patterns: string[]
): number | null {
  for (let i = 0; i < headers.length; i++) {
    if (fuzzyMatch(headers[i] || '', patterns)) {
      return i;
    }
  }
  return null;
}

/**
 * Validates artikul pattern (e.g., GFA-5200, GFM-300)
 */
export function isValidArtikul(artikul: string | null | undefined): boolean {
  if (!artikul) return false;
  const pattern = /^[A-Z0-9]+-[A-Z0-9]+/;
  return pattern.test(artikul.trim().toUpperCase());
}

/**
 * Checks if row looks like a totals/summary row
 */
export function isTotalsRow(row: any[]): boolean {
  const firstCell = String(row[0] || '').trim().toLowerCase();
  return (
    firstCell === 'итого' ||
    firstCell === 'total' ||
    firstCell === 'всего' ||
    firstCell.startsWith('итог')
  );
}
