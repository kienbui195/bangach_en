/** Đọc và ghi CSV theo RFC 4180: ô có dấu ngoặc kép, dấu phẩy và xuống dòng trong ô, hai dấu ngoặc kép liền nhau là một. */

export const BOM = '﻿';

/** Tách nội dung CSV thành các dòng ô. Bỏ BOM đầu file và các dòng trống hoàn toàn. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
    i++;
  }
  if (inQuotes) throw new Error('CSV có dấu ngoặc kép chưa đóng');
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

const escapeCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Chặn công thức khi mở bằng Excel (CSV injection): ô bắt đầu bằng = + - @ được đặt thêm dấu nháy đơn.
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string' && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Ghi CSV UTF-8 có BOM để Excel đọc đúng tiếng Việt (BR21). */
export function stringifyCsv(header: string[], rows: Record<string, unknown>[]): string {
  const lines = [header.map(escapeCell).join(',')];
  for (const r of rows) lines.push(header.map((h) => escapeCell(r[h])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
