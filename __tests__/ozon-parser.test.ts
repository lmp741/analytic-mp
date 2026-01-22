import * as XLSX from 'xlsx';
import { parseOzonFile } from '@/lib/parsers/ozon';

describe('ozon parser', () => {
  test('parses composite headers and returns rows', async () => {
    const data = [
      ['Отчет по товарам', null, null, null, null],
      ['Воронка продаж', 'Воронка продаж', 'Воронка продаж', 'Продажи', 'Факторы продаж'],
      ['Артикул', 'Показы всего', 'Посещения карточки товара', 'Заказано на сумму', 'Средняя цена'],
      ['GFA-5200', '1 000', '100', '12 345,67 ₽', '123,45 ₽'],
    ];

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, sheet, 'По товарам');

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = {
      name: 'ozon.xlsx',
      arrayBuffer: async () => buffer,
    } as File;

    const result = await parseOzonFile(file);
    expect(result.errors).toHaveLength(0);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].artikul).toBe('GFA-5200');
    expect(result.rows[0].impressions).toBe(1000);
    expect(result.rows[0].visits).toBe(100);
  });
});
