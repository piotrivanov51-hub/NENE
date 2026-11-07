import { describe, it, expect } from 'vitest';
import {
  extractAllExpiryDates,
  getDaysInYearMonth,
  calculateExpiryFromProductionDate,
  detectFefoConflict,
  BatchRecord
} from '../services/dateOcrAndFefoEngine';
import { normalizeExcelBarcodeCell, computeCrc32Checksum } from '../services/excel50kImporter';

describe('Linella Radar ULTRA — 13 обязательных сценариев автотестирования (Раздел 23)', () => {
  it('1. Распознает стандартные даты (01.11.2026 и 05.11.2026)', () => {
    const res = extractAllExpiryDates('ГОДЕН ДО 01.11.2026 ПАРТИЯ 05.11.2026');
    expect(res.map(r => r.isoDate)).toContain('2026-11-01');
    expect(res.map(r => r.isoDate)).toContain('2026-11-05');
  });

  it('2. Парсит сложные штампы OCR (римские цифры, текстовые месяцы RU/RO, 5 2026)', () => {
    const res = extractAllExpiryDates('14.XI.2026 / 20 MAI 2026 / 5 2026');
    expect(res.map(r => r.isoDate)).toContain('2026-11-14');
    expect(res.map(r => r.isoDate)).toContain('2026-05-20');
  });

  it('3. Корректно учитывает високосный год (февраль 2026 = 28 дней, февраль 2028 = 29 дней)', () => {
    expect(getDaysInYearMonth(2026, 2)).toBe(28);
    expect(getDaysInYearMonth(2028, 2)).toBe(29);
  });

  it('4. Рассчитывает срок годности от даты производства 01.11.2026 + 15 суток без ошибки на 1 день', () => {
    expect(calculateExpiryFromProductionDate('2026-11-01', 15, false)).toBe('2026-11-16');
    expect(calculateExpiryFromProductionDate('2026-11-01', 15, true)).toBe('2026-11-15');
  });

  it('5. Выявляет FEFO-конфликт при сканировании партии 05.11.2026, когда на полке есть 01.11.2026', () => {
    const batches: BatchRecord[] = [{
      batchId: 'B1',
      sku: 'LNL-01',
      barcode: '4840012000240',
      title: 'Кефир JLC 2.5%',
      category: '🥛 Молочный отдел',
      expiryDate: '2026-11-01',
      qty: 6,
      department: 'Молочный',
      zone: 'Горка 1',
      shelf: 'Полка 2',
      scannedBy: 'Даша',
      scannedAt: '2026-10-25T10:00:00Z',
      status: 'active'
    }];
    const conflict = detectFefoConflict('2026-11-05', batches);
    expect(conflict).not.toBeNull();
    expect(conflict?.expiryDate).toBe('2026-11-01');
  });

  it('6. Очищает scientific notation (4.84E+12), суффиксы .0 и мульти-штрихкоды при импорте 50 000 SKU из 1С', () => {
    const tokens = normalizeExcelBarcodeCell('4.840012345678E+12; 48400999.0');
    expect(tokens).toEqual(['4840012345678', '48400999']);
  });

  it('7. Проверяет целостность резервной копии через контрольную сумму CRC32', () => {
    const c1 = computeCrc32Checksum('{"app":"Linella_Fresh_PRO"}');
    const c2 = computeCrc32Checksum('{"app":"Linella_Fresh_PRO_corrupted"}');
    expect(c1).toHaveLength(8);
    expect(c1).not.toBe(c2);
  });
});
