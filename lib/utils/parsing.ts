/**
 * Shared parsing utilities for robust XLSX/CSV parsing
 * Handles RU locale, malformed data, and edge cases
 */

/**
 * Normalizes header strings: trim, collapse spaces, replace line breaks
 */
export function normalizeHeader(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toString()
    .trim()
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Parses number from RU locale string
 * Handles: "12 345", "12,34", "12.34", "₽", "%", empty, "—", null
 */
export function parseNumberRU(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return null;
    return value;
  }

  if (typeof value !== 'string') {
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) return num;
    return null;
  }

  let str = value.trim();
  
  // Handle empty or dash
  if (str === '' || str === '—' || str === '-' || str === '–') return null;
  
  // Remove currency and percent symbols
  str = str.replace(/[₽%]/g, '');
  
  // Remove spaces (thousand separators)
  str = str.replace(/\s/g, '');
  
  // Replace comma with dot for decimal
  str = str.replace(',', '.');
  
  // Remove any remaining non-numeric characters except dot and minus
  str = str.replace(/[^\d.-]/g, '');
  
  if (str === '' || str === '-' || str === '.') return null;
  
  const num = parseFloat(str);
  if (isNaN(num) || !isFinite(num)) return null;
  
  return num;
}

/**
 * Parses percent value to fraction (0..1)
 * If value > 1 and <= 100, assumes percent; else if 0..1 assumes fraction
 */
export function parsePercentToFraction(value: any): number | null {
  const num = parseNumberRU(value);
  if (num === null) return null;
  
  if (num > 1 && num <= 100) {
    // Assume percent, convert to fraction
    return num / 100;
  } else if (num >= 0 && num <= 1) {
    // Already fraction
    return num;
  }
  
  // Out of range
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
