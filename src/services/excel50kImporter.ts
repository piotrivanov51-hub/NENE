/**
 * Высокопроизводительный движок импорта баз Excel и выгрузок 1С (50 000+ SKU)
 * (Раздел 15 Master Prompt)
 */

export function normalizeExcelBarcodeCell(rawVal: unknown): string[] {
  if (rawVal === null || rawVal === undefined) return [];
  if (typeof rawVal === 'number') {
    if (!Number.isFinite(rawVal)) return [];
    return [Math.round(rawVal).toLocaleString('fullwide', { useGrouping: false })];
  }
  const str = String(rawVal).trim();
  if (!str) return [];
  return str
    .split(/[;,/\n\r]+/)
    .map(part => {
      let token = part.trim().replace(/\.0+$/, '');
      if (/^\d+([.,]\d+)?[eE][+-]?\d+$/.test(token)) {
        const num = Number(token.replace(',', '.'));
        if (Number.isFinite(num)) {
          token = Math.round(num).toLocaleString('fullwide', { useGrouping: false });
        }
      }
      return token.replace(/[\s-]/g, '');
    })
    .filter(t => t.length >= 4);
}

export function computeCrc32Checksum(payload: string): string {
  let crc = 0 ^ -1;
  for (let i = 0; i < payload.length; i++) {
    let c = payload.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = (crc ^ c) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      c = c >>> 1;
    }
  }
  return ((crc ^ -1) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
