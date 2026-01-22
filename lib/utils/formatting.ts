/**
 * UI formatting utilities
 * Handles NaN, Infinity, null values consistently
 */

/**
 * Formats integer with thousand separators
 */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '—';
  }
  return Math.round(value).toLocaleString('ru-RU');
}

/**
 * Formats money (RUB)
 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '—';
  }
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

/**
 * Formats percent (0..1 fraction to percent)
 */
export function formatPercent(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Formats delta with sign and color indicator
 */
export function formatDelta(
  value: number | null | undefined,
  isInverted: boolean = false
): { text: string; isPositive: boolean | null } {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return { text: '—', isPositive: null };
  }
  
  const isPositive = isInverted ? value < 0 : value > 0;
  const sign = value > 0 ? '+' : '';
  return {
    text: `${sign}${formatPercent(value)}`,
    isPositive,
  };
}

/**
 * Formats delta absolute value
 */
export function formatDeltaAbs(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatInt(value)}`;
}

/**
 * Gets tooltip text for invalid values
 */
export function getInvalidValueTooltip(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return 'Нет данных';
  if (isNaN(value)) return 'Некорректное значение (NaN)';
  if (!isFinite(value)) {
    return value === Infinity || value === -Infinity ? 'Бесконечность' : 'Некорректное значение';
  }
  return null;
}
