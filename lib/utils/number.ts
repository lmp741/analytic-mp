export function parseRuNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).trim();
  if (raw === '' || raw === '—' || raw === '-' || raw === '–') return null;

  const normalized = raw
    .replace(/[₽%]/g, '')
    .replace(/[\u00a0\t]/g, ' ')
    .replace(/\s/g, '')
    .replace(/,/g, '.');

  if (normalized === '' || normalized === '-' || normalized === '.') return null;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseRuPercentToFraction(value: unknown): number | null {
  const num = parseRuNumber(value);
  if (num === null) return null;
  if (num >= 0 && num <= 1) return num;
  if (num > 1 && num <= 100) return num / 100;
  return null;
}

export function formatNumberRu(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

export function formatMoneyRu(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`;
}

export function formatPercentRuFraction(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value * 100)}%`;
}

export function formatDeltaPercent(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(absValue);
  return `${sign}${formatted}%`;
}

export function calcDeltaPercent(
  current: number | null | undefined,
  base: number | null | undefined,
  ignorePrevZero: boolean = true
): number | null {
  if (current === null || current === undefined) return null;
  if (base === null || base === undefined) return null;
  if (base === 0) return ignorePrevZero ? null : null;
  if (!Number.isFinite(current) || !Number.isFinite(base)) return null;
  return ((current - base) / base) * 100;
}

export function toPercentInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value * 100);
}
