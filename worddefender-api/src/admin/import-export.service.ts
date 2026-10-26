import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ADMIN_API_TOKEN } from './admin-token.guard.js';
import type { FieldError, FieldMeta } from './contract.js';
import { BOM, parseCsv, stringifyCsv } from './csv.js';
import type { Delegate, ResourceDefinition } from './resources/definition.js';
import { apiError, unprocessable } from './errors.js';
import { ResourcesService } from './resources.service.js';
import { safeEqual } from '../security/safe-equal.js';

/** BR17: giới hạn một lần nhập. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const PREVIEW_TTL_MS = 10 * 60_000;

export interface ImportInput {
  format: 'csv' | 'json';
  content: string;
  matchKey?: string;
  previewToken?: string;
}

export interface ImportReport {
  dryRun: boolean;
  willCreate: number;
  willUpdate: number;
  unchanged: number;
  rejected: { row: number; field: string; message: string }[];
  ignoredColumns: string[];
  previewToken?: string;
}

type Row = { row: number; values: Record<string, unknown> };

const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

@Injectable()
export class ImportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourcesService,
    @Inject(ADMIN_API_TOKEN) private readonly secret: string | undefined,
  ) {}

  // ------------------------------------------------------------------ chạy thử và ghi thật

  async import(def: ResourceDefinition, dryRun: boolean, input: ImportInput): Promise<ImportReport> {
    if (!def.meta.import) throw this.bad('Tài nguyên này không hỗ trợ nhập');
    const matchKey = input.matchKey || def.meta.import.matchKey;
    const content = this.checkFile(input);
    const { rows, ignoredColumns } = this.readRows(def, input.format, content, matchKey);

    if (!dryRun) this.verifyPreview(def, matchKey, content, input.previewToken); // BR18

    const run = async (delegate: Delegate, write: boolean): Promise<ImportReport> => {
      const report: ImportReport = { dryRun, willCreate: 0, willUpdate: 0, unchanged: 0, rejected: [], ignoredColumns };
      const seen = new Map<string, number>();
      for (const r of rows) {
        const { data, errors } = this.resources.coerceForImport(def, r.values);
        const rawKey = data[matchKey];
        const key = typeof rawKey === 'string' && def.normalizeKey ? def.normalizeKey(rawKey) : rawKey;
        if (!errors.some((e) => e.name === matchKey) && (key === undefined || key === null || key === '')) errors.push({ name: matchKey, message: 'Thiếu giá trị khóa đối chiếu' });
        else if (typeof rawKey === 'string' && def.normalizeKey) data[matchKey] = key;
        if (errors.length === 0) {
          const dupLine = seen.get(String(key));
          if (dupLine !== undefined) errors.push({ name: matchKey, message: `Trùng khóa "${String(key)}" với dòng ${dupLine} trong cùng file` });
          else seen.set(String(key), r.row);
        }
        let existing: Record<string, unknown> | null = null;
        if (errors.length === 0) {
          existing = def.findExisting ? await def.findExisting(delegate, matchKey, data) : await delegate.findFirst({ where: { [matchKey]: key } });
          if (def.validate) errors.push(...(await def.validate({ data, existing, delegate })));
        }
        if (errors.length > 0) {
          for (const e of errors) report.rejected.push({ row: r.row, field: e.name, message: e.message });
          continue;
        }
        if (existing && this.sameValues(def, data, existing)) {
          report.unchanged++;
        } else if (existing) {
          report.willUpdate++;
          if (write) await delegate.update({ where: { id: existing.id }, data });
        } else {
          report.willCreate++;
          if (write) await delegate.create({ data });
        }
      }
      return report;
    };

    if (dryRun) {
      const report = await run(this.resources.delegate(def), false);
      report.previewToken = this.signPreview(def, matchKey, content);
      return report;
    }
    // Ghi thật trong một giao dịch: lỗi giữa chừng thì không dòng nào được ghi (E3).
    return this.prisma.$transaction(
      async (tx) => run((tx as unknown as Record<string, Delegate>)[def.model], true),
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  private bad(message: string, fields: FieldError[] = []) {
    return unprocessable(fields, message);
  }

  /** E1: file quá lớn hoặc không phải UTF-8. */
  private checkFile(input: ImportInput): string {
    if (input.format !== 'csv' && input.format !== 'json') throw this.bad('Định dạng phải là csv hoặc json');
    if (typeof input.content !== 'string' || input.content.length === 0) throw this.bad('File rỗng');
    if (Buffer.byteLength(input.content) > MAX_IMPORT_BYTES) throw this.bad(`File vượt quá ${MAX_IMPORT_BYTES / 1024 / 1024}MB`);
    if (input.content.includes('�')) throw this.bad('File không phải UTF-8 (có ký tự không đọc được). Hãy lưu lại file bằng mã hóa UTF-8.');
    return input.content.startsWith(BOM) ? input.content.slice(1) : input.content;
  }

  private importableFields(def: ResourceDefinition) {
    return def.meta.fields.filter((f) => !f.readonly);
  }

  /** Đọc dòng từ CSV hoặc JSON, đổi tên cột snake_case sang camelCase, kiểm cột bắt buộc. */
  private readRows(def: ResourceDefinition, format: 'csv' | 'json', content: string, matchKey: string) {
    const fields = this.importableFields(def);
    const known = new Map(fields.map((f) => [f.name, f]));
    if (!known.has(matchKey)) throw this.bad(`Khóa đối chiếu "${matchKey}" không phải trường nhập được`);

    let columns: string[];
    let raw: { row: number; values: Record<string, unknown> }[];
    if (format === 'csv') {
      let table: string[][];
      try {
        table = parseCsv(content);
      } catch (e) {
        throw this.bad((e as Error).message);
      }
      if (table.length === 0) throw this.bad('File CSV không có dòng nào');
      columns = table[0].map((h) => h.trim());
      raw = table.slice(1).map((cells, i) => ({
        row: i + 2,
        values: Object.fromEntries(columns.map((c, ci) => [c, cells[ci] ?? ''])),
      }));
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw this.bad('File JSON không hợp lệ');
      }
      const list = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
      if (!Array.isArray(list) || list.some((x) => typeof x !== 'object' || x === null || Array.isArray(x))) {
        throw this.bad('File JSON phải là danh sách đối tượng (hoặc { "items": [...] })');
      }
      columns = [...new Set(list.flatMap((x) => Object.keys(x as object)))];
      raw = list.map((x, i) => ({ row: i + 1, values: x as Record<string, unknown> }));
    }
    if (raw.length === 0) throw this.bad('File không có dòng dữ liệu nào');
    if (raw.length > MAX_IMPORT_ROWS) throw this.bad(`File có ${raw.length} dòng, vượt giới hạn ${MAX_IMPORT_ROWS} dòng`);

    const map = new Map<string, string>(); // tên cột trong file -> tên trường
    const ignoredColumns: string[] = [];
    for (const c of columns) {
      const name = known.has(c) ? c : known.has(snakeToCamel(c)) ? snakeToCamel(c) : null;
      if (name) map.set(c, name);
      else ignoredColumns.push(c);
    }
    const present = new Set(map.values());
    const missing = fields.filter((f) => f.required && !present.has(f.name)).map((f) => f.name);
    if (missing.length > 0) throw this.bad(`Thiếu cột bắt buộc: ${missing.join(', ')}`);
    if (!present.has(matchKey)) throw this.bad(`Thiếu cột khóa đối chiếu: ${matchKey}`);

    const rows: Row[] = raw.map((r) => ({
      row: r.row,
      values: Object.fromEntries([...map.entries()].map(([col, name]) => [name, format === 'csv' ? this.fromCsv(known.get(name)!, r.values[col] as string) : r.values[col]])),
    }));
    return { rows, ignoredColumns };
  }

  /** Ô CSV là chuỗi: đổi về kiểu theo hợp đồng. Ô rỗng nghĩa là để trống. */
  private fromCsv(f: FieldMeta, s: string): unknown {
    const v = s.trim() === '' ? '' : s;
    if (v === '') return null;
    switch (f.type) {
      case 'int':
      case 'decimal':
        return Number.isNaN(Number(v)) ? v : Number(v);
      case 'bool':
        return v.toLowerCase() === 'true' || v === '1' ? true : v.toLowerCase() === 'false' || v === '0' ? false : v;
      case 'json':
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      default:
        return v;
    }
  }

  /** So dữ liệu mới với bản ghi sẵn có: giống hết thì "không đổi". */
  private sameValues(def: ResourceDefinition, data: Record<string, unknown>, existing: Record<string, unknown>): boolean {
    return Object.entries(data).every(([k, v]) => {
      const cur = existing[k] as unknown;
      const f = def.meta.fields.find((x) => x.name === k);
      if (f?.type === 'datetime') return new Date(v as string).getTime() === (cur as Date | null)?.getTime();
      if (f?.type === 'decimal') return Number(v) === Number((cur as { toNumber?: () => number } | null)?.toNumber?.() ?? cur);
      if (f?.type === 'json') return JSON.stringify(v) === JSON.stringify(cur);
      return (v ?? null) === (cur ?? null);
    });
  }

  // ------------------------------------------------------------------ previewToken (BR18)

  private mac(def: ResourceDefinition, matchKey: string, content: string, exp: number) {
    const hash = createHash('sha256').update(content).digest('hex');
    return createHmac('sha256', this.secret ?? '').update(`${def.meta.key}|${matchKey}|${hash}|${exp}`).digest('base64url');
  }

  /** Token buộc với đúng nội dung file, đúng tài nguyên và khóa đối chiếu; hạn 10 phút; không cần lưu trạng thái. */
  private signPreview(def: ResourceDefinition, matchKey: string, content: string): string {
    const exp = Date.now() + PREVIEW_TTL_MS;
    return `${exp}.${this.mac(def, matchKey, content, exp)}`;
  }

  private verifyPreview(def: ResourceDefinition, matchKey: string, content: string, token: string | undefined) {
    const [expRaw, sig] = String(token ?? '').split('.');
    const exp = Number(expRaw);
    const want = Number.isFinite(exp) ? this.mac(def, matchKey, content, exp) : '';
    const ok = !!sig && safeEqual(sig, want) && exp >= Date.now();
    if (!ok) throw apiError(HttpStatus.UNPROCESSABLE_ENTITY, 'preview_required', 'Phải chạy thử file này trước (token chạy thử thiếu, hết hạn hoặc không khớp nội dung file)');
  }

  // ------------------------------------------------------------------ xuất

  async export(def: ResourceDefinition, format: string, q: { q?: string; filter?: Record<string, string> }) {
    if (format !== 'csv' && format !== 'json') throw this.bad('Định dạng phải là csv hoặc json');
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    for (;;) {
      const res = (await this.resources.list(def, { ...q, page: String(page), pageSize: '100', sort: `${def.meta.primaryKey}:asc` })) as { items: Record<string, unknown>[]; total: number };
      rows.push(...res.items);
      if (rows.length >= res.total || res.items.length === 0) break;
      page++;
    }
    const fields = def.meta.fields.filter((f) => !f.readonly || f.name === def.meta.primaryKey || f.name === 'updatedAt' || f.name === 'createdAt');
    const header = fields.map((f) => f.name);
    const stamp = new Date().toISOString().slice(0, 10);
    const content =
      format === 'csv'
        ? stringifyCsv(header, rows)
        : JSON.stringify(rows.map((r) => Object.fromEntries(header.map((h) => [h, r[h] ?? null]))), null, 2);
    return { format, filename: `${def.meta.key}-${stamp}.${format}`, count: rows.length, content };
  }
}
