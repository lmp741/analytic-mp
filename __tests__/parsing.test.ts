import { findHeaderRow, parseNumberRU, parsePercentToFraction } from '@/lib/utils/parsing';

describe('parsing utilities', () => {
  test('parseNumberRU handles RU formatted numbers', () => {
    expect(parseNumberRU('12 345,67 ₽')).toBeCloseTo(12345.67, 2);
    expect(parseNumberRU('12\u00a0345')).toBe(12345);
    expect(parseNumberRU('—')).toBeNull();
    expect(parseNumberRU('12.345,67')).toBeCloseTo(12345.67, 2);
  });

  test('parsePercentToFraction converts percents to fractions', () => {
    expect(parsePercentToFraction('12%')).toBeCloseTo(0.12, 4);
    expect(parsePercentToFraction(0.3)).toBeCloseTo(0.3, 4);
    expect(parsePercentToFraction('120%')).toBeNull();
  });

  test('findHeaderRow finds row with artikul header', () => {
    const data = [
      ['Отчет по продажам', null],
      ['Артикул продавца', 'Показы', 'CTR'],
      ['ABC-123', 100, '1,2%'],
    ];
    const headerRowIndex = findHeaderRow(data, {
      maxRows: 10,
      matcher: (cell) => cell.includes('артикул') && cell.includes('продав'),
    });
    expect(headerRowIndex).toBe(1);
  });
});
