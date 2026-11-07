/**
 * Ядро распознавания дат, расчета сроков годности, валидации Горизонта свежести и FEFO
 * (Разделы 5, 6, 7, 8, 9, 10, 11 Master Prompt)
 */

export interface RecognizedDateCandidate {
  isoDate: string;
  rawMatch: string;
  confidence: number;
  formatType: string;
}

export interface BatchRecord {
  batchId: string;
  sku: string;
  barcode: string;
  title: string;
  category: string;
  productionDate?: string;
  expiryDate: string;
  qty: number;
  department: string;
  zone: string;
  shelf: string;
  scannedBy: string;
  scannedAt: string;
  status: 'active' | 'rotate' | 'markdown' | 'writeoff' | 'exception';
}

const MONTH_NAME_MAP: Record<string, number> = {
  // Русский
  'янв': 1, 'января': 1, 'фев': 2, 'февраля': 2, 'мар': 3, 'марта': 3,
  'апр': 4, 'апреля': 4, 'май': 5, 'мая': 5, 'июн': 6, 'июня': 6,
  'июл': 7, 'июля': 7, 'авг': 8, 'августа': 8, 'сен': 9, 'сентября': 9,
  'окт': 10, 'октября': 10, 'ноя': 11, 'ноября': 11, 'дек': 12, 'декабря': 12,
  // Румынский
  'ian': 1, 'ianuarie': 1, 'feb': 2, 'februarie': 2, 'mar': 3, 'martie': 3,
  'apr': 4, 'aprilie': 4, 'mai': 5, 'iun': 6, 'iunie': 6,
  'iul': 7, 'iulie': 7, 'aug': 8, 'august': 8, 'sep': 9, 'septembrie': 9,
  'oct': 10, 'octombrie': 10, 'noi': 11, 'noiembrie': 11, 'dec': 12, 'decembrie': 12
};

const ROMAN_MONTH_MAP: Record<string, number> = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6,
  'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12
};

export function getDaysInYearMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

export function normalizeYear(yRaw: number): number {
  if (yRaw < 100) return 2000 + yRaw;
  return yRaw;
}

export function toIsoDateString(year: number, month: number, day: number): string | null {
  const y = normalizeYear(year);
  if (y < 2020 || y > 2035) return null;
  if (month < 1 || month > 12) return null;
  const maxDay = getDaysInYearMonth(y, month);
  const clampedDay = Math.min(Math.max(1, day), maxDay);
  return `${y}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function extractAllExpiryDates(rawOcrText: string): RecognizedDateCandidate[] {
  const candidates: RecognizedDateCandidate[] = [];
  const text = String(rawOcrText || '').trim();
  if (!text) return candidates;

  // 1. ДД.ММ.ГГГГ / ДД/ММ/ГГ / ДД-ММ-ГГГГ
  const stdRegex = /\b(0?[1-9]|[12]\d|3[01])[.\/-](0?[1-9]|1[0-2])[.\/-](20\d{2}|\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = stdRegex.exec(text)) !== null) {
    const iso = toIsoDateString(Number(m[3]), Number(m[2]), Number(m[1]));
    if (iso) candidates.push({ isoDate: iso, rawMatch: m[0], confidence: 0.96, formatType: 'DD.MM.YYYY' });
  }

  // 2. Римские цифры месяцев: 14.XI.2026
  const romanRegex = /\b(0?[1-9]|[12]\d|3[01])[.\/-\s](XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)[.\/-\s](20\d{2}|\d{2})\b/gi;
  while ((m = romanRegex.exec(text)) !== null) {
    const month = ROMAN_MONTH_MAP[m[2].toUpperCase()];
    const iso = month ? toIsoDateString(Number(m[3]), month, Number(m[1])) : null;
    if (iso) candidates.push({ isoDate: iso, rawMatch: m[0], confidence: 0.93, formatType: 'DD.ROMAN.YYYY' });
  }

  // 3. Текстовые месяцы RU / RO: 15 НОЯ 2026, 20 MAI 2026
  const wordRegex = /\b(0?[1-9]|[12]\d|3[01])\s+([а-яёa-zăâîșț]{3,10})\s+(20\d{2}|\d{2})\b/gi;
  while ((m = wordRegex.exec(text)) !== null) {
    const w = m[2].toLowerCase();
    const monthKey = Object.keys(MONTH_NAME_MAP).find(k => w.startsWith(k));
    if (monthKey) {
      const iso = toIsoDateString(Number(m[3]), MONTH_NAME_MAP[monthKey], Number(m[1]));
      if (iso) candidates.push({ isoDate: iso, rawMatch: m[0], confidence: 0.95, formatType: 'DD MONTH YYYY' });
    }
  }

  // 4. Слитный 6-значный штамп ДДММГГ: 151126
  const compactRegex = /\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(2[4-9]|3[0-5])\b/g;
  while ((m = compactRegex.exec(text)) !== null) {
    const iso = toIsoDateString(Number(m[3]), Number(m[2]), Number(m[1]));
    if (iso) candidates.push({ isoDate: iso, rawMatch: m[0], confidence: 0.86, formatType: 'DDMMYY' });
  }

  // 5. Формат М.ГГГГ / ММ ГГГГ: "5 2026", "05.2026"
  const myRegex = /\b(0?[1-9]|1[0-2])[.\/\s](202[5-9]|203[0-2])\b/g;
  while ((m = myRegex.exec(text)) !== null) {
    const year = Number(m[2]);
    const month = Number(m[1]);
    const lastDay = getDaysInYearMonth(year, month);
    const iso = toIsoDateString(year, month, lastDay);
    if (iso) candidates.push({ isoDate: iso, rawMatch: m[0], confidence: 0.89, formatType: 'M.YYYY' });
  }

  return candidates;
}

export function calculateExpiryFromProductionDate(
  productionIsoDate: string,
  shelfLifeDays: number,
  includeProductionDay = false
): string {
  const [y, m, d] = productionIsoDate.split('-').map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0);
  const effectiveOffset = includeProductionDay ? Math.max(0, shelfLifeDays - 1) : Math.max(1, shelfLifeDays);
  const target = new Date(base.getTime() + effectiveOffset * 86400000);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

export function detectFefoConflict(newBatchExpiryIso: string, existingBatches: BatchRecord[]): BatchRecord | null {
  const activeOlder = existingBatches
    .filter(b => b.status === 'active' && b.qty > 0 && b.expiryDate < newBatchExpiryIso)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  return activeOlder.length > 0 ? activeOlder[0] : null;
}
