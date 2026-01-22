import * as XLSX from 'xlsx';
import { parseWBFile } from '@/lib/parsers/wb';

describe('WB parser', () => {
  test('parses WB sheet with header on second row', async () => {
    const data = [
      ['Отчет по продажам', null, null],
      [
        'Артикул продавца',
        'Показы',
        'Переходы в карточку',
        'CTR',
        'Положили в корзину',
        'Конверсия в корзину, %',
        'Заказали, шт',
        'Заказали на сумму',
        'Средняя цена, ₽',
      ],
      ['ABC-123', 120, 12, '10%', 3, '25%', 1, '1 200,50 ₽', '1 200 ₽'],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Товары');
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const file = new File([arrayBuffer], 'wb.xlsx');
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => arrayBuffer,
    });

    const result = await parseWBFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.diagnostics.headerRowIndex).toBe(1);
    expect(result.diagnostics.rowsAccepted).toBeGreaterThan(0);
  });
});
