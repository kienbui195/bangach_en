import { ConflictException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FieldError, FieldMeta } from './contract.js';
import { apiError, notFound, parseId, parsePaging, unprocessable } from './errors.js';
import type { Delegate, ResourceDefinition } from './resources/definition.js';
import { RESOURCES } from './resources/definitions.js';

export interface ListQuery {
  page?: string;
  pageSize?: string;
  sort?: string;
  q?: string;
  filter?: Record<string, string>;
}

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  find(key: string): ResourceDefinition {
    const def = RESOURCES.find((r) => r.meta.key === key);
    if (!def) throw notFound(`Không có tài nguyên "${key}"`);
    return def;
  }

  delegate(def: ResourceDefinition): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[def.model];
  }

  /** Bản ghi gửi ra ngoài: Decimal đổi thành số. */
  private out(def: ResourceDefinition, row: Record<string, unknown>): Record<string, unknown> {
    const res = { ...row };
    for (const f of def.meta.fields) {
      const v = res[f.name] as { toNumber?: () => number } | null | undefined;
      if (f.type === 'decimal' && v && typeof v.toNumber === 'function') res[f.name] = v.toNumber();
    }
    return res;
  }

  // ------------------------------------------------------------------ đọc

  async list(def: ResourceDefinition, q: ListQuery) {
    const d = this.delegate(def);
    if (def.meta.kind === 'singleton') return this.out(def, await this.singleton(def));

    const { page, pageSize } = parsePaging(q.page, q.pageSize); // BR14
    const where: Record<string, unknown> = {};
    const errors: FieldError[] = [];

    for (const [name, raw] of Object.entries(q.filter ?? {})) {
      const f = def.meta.fields.find((x) => x.name === name && x.filter);
      if (!f) {
        errors.push({ name: `filter[${name}]`, message: 'Trường không lọc được' });
        continue;
      }
      where[name] = f.type === 'int' ? Number(raw) : f.type === 'bool' ? raw === 'true' : raw;
    }
    if (errors.length > 0) throw unprocessable(errors);

    const search = def.meta.fields.filter((f) => f.search).map((f) => f.name);
    const term = (q.q ?? '').trim();
    if (term && search.length > 0) where.OR = search.map((name) => ({ [name]: { contains: term } }));

    const [sortName, sortDir] = (q.sort ?? '').split(':');
    const sortField = def.meta.fields.find((f) => f.name === sortName && (f.sortable || f.list));
    const orderBy = sortField ? { [sortField.name]: sortDir === 'desc' ? 'desc' : 'asc' } : { [def.meta.primaryKey]: 'asc' };

    const [items, total] = await Promise.all([
      d.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      d.count({ where }),
    ]);
    return { items: items.map((r) => this.out(def, r)), total, page, pageSize };
  }

  async get(def: ResourceDefinition, rawId: string) {
    const row = await this.delegate(def).findUnique({ where: { id: parseId(rawId) } });
    if (!row) throw notFound();
    return this.out(def, row);
  }

  private async singleton(def: ResourceDefinition) {
    const row = await this.delegate(def).findFirst({});
    if (!row) throw notFound('Chưa có bản ghi');
    return row;
  }

  // ------------------------------------------------------------------ ghi

  /** Ép kiểu và kiểm cơ bản theo mô tả trường. Trường chỉ đọc bị bỏ qua. */
  private coerce(def: ResourceDefinition, body: Record<string, unknown>, creating: boolean) {
    const data: Record<string, unknown> = {};
    const errors: FieldError[] = [];
    for (const f of def.meta.fields) {
      if (f.readonly) continue;
      const present = Object.prototype.hasOwnProperty.call(body, f.name);
      const v = body[f.name];
      if (!present) {
        if (creating && f.required && !this.hasDefault(def, f)) errors.push({ name: f.name, message: 'Bắt buộc' });
        continue;
      }
      if (v === null || v === '') {
        if (f.required) errors.push({ name: f.name, message: 'Bắt buộc' });
        else data[f.name] = null;
        continue;
      }
      const err = this.coerceOne(f, v, data);
      if (err) errors.push({ name: f.name, message: err });
    }
    return { data, errors };
  }

  /** Dùng cho nhập hàng loạt: giá trị dòng đã đổi kiểu theo hợp đồng; thiếu trường bắt buộc là lỗi (khi tạo mới). */
  coerceForImport(def: ResourceDefinition, values: Record<string, unknown>) {
    return this.coerce(def, values, true);
  }

  private hasDefault(_def: ResourceDefinition, _f: FieldMeta) {
    return false;
  }

  private coerceOne(f: FieldMeta, v: unknown, data: Record<string, unknown>): string | null {
    switch (f.type) {
      case 'string':
      case 'text':
      case 'file':
        if (typeof v !== 'string') return 'Phải là chuỗi';
        if (f.maxLength && [...v].length > f.maxLength) return `Tối đa ${f.maxLength} ký tự`;
        data[f.name] = v;
        return null;
      case 'int':
        if (typeof v !== 'number' || !Number.isInteger(v)) return 'Phải là số nguyên';
        data[f.name] = v;
        return null;
      case 'decimal':
        if (typeof v !== 'number' || !Number.isFinite(v)) return 'Phải là số';
        data[f.name] = v;
        return null;
      case 'bool':
        if (typeof v !== 'boolean') return 'Phải là đúng/sai';
        data[f.name] = v;
        return null;
      case 'enum':
        if (typeof v !== 'string' || !f.enum?.includes(v)) return `Phải là một trong: ${f.enum?.join(', ')}`;
        data[f.name] = v;
        return null;
      case 'datetime': {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) return 'Ngày giờ không hợp lệ (ISO 8601)';
        data[f.name] = d;
        return null;
      }
      case 'json':
        data[f.name] = v;
        return null;
    }
  }

  async create(def: ResourceDefinition, body: Record<string, unknown>) {
    if (!def.meta.allowCreate) throw apiError(HttpStatus.METHOD_NOT_ALLOWED, 'method_not_allowed', 'Không cho thêm');
    const { data, errors } = this.coerce(def, body ?? {}, true);
    const d = this.delegate(def);
    if (def.validate) errors.push(...(await def.validate({ data, existing: null, delegate: d })));
    if (errors.length > 0) throw unprocessable(errors);
    return this.out(def, await this.write(def, () => d.create({ data })));
  }

  async update(def: ResourceDefinition, rawId: string | null, body: Record<string, unknown>) {
    const d = this.delegate(def);
    const existing = rawId === null ? await this.singleton(def) : await d.findUnique({ where: { id: parseId(rawId) } });
    if (!existing) throw notFound();

    // E3: người lưu sau nhận cảnh báo xung đột thay vì ghi đè lặng lẽ.
    const seen = body?.updatedAt;
    if (typeof seen !== 'string' || new Date(seen).getTime() !== (existing.updatedAt as Date).getTime()) {
      throw new ConflictException({ error: { code: 'conflict', message: 'Bản ghi vừa được người khác sửa. Hãy tải lại rồi sửa tiếp.' } });
    }
    const { data, errors } = this.coerce(def, body, false);
    if (def.validate) errors.push(...(await def.validate({ data, existing, delegate: d })));
    if (errors.length > 0) throw unprocessable(errors);
    if (def.meta.kind === 'singleton' && data.rules !== undefined) data.version = (existing.version as number) + 1;
    return this.out(def, await this.write(def, () => d.update({ where: { id: existing.id }, data })));
  }

  async remove(def: ResourceDefinition, rawId: string) {
    if (!def.meta.allowDelete) throw apiError(HttpStatus.METHOD_NOT_ALLOWED, 'method_not_allowed', 'Không cho xóa');
    await this.write(def, () => this.delegate(def).delete({ where: { id: parseId(rawId) } }));
    return { ok: true };
  }

  /** Đổi lỗi ràng buộc của DB thành lỗi 422/404 theo từng trường. */
  private async write<T>(def: ResourceDefinition, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'P2002') {
        const unique = def.meta.fields.filter((f) => f.unique).map((f) => ({ name: f.name, message: 'Giá trị đã tồn tại' }));
        throw unprocessable(unique.length ? unique : [{ name: '_', message: 'Giá trị đã tồn tại' }]);
      }
      if (code === 'P2003') throw unprocessable([{ name: '_', message: 'Tham chiếu tới bản ghi không tồn tại' }]);
      if (code === 'P2025') throw notFound();
      throw e;
    }
  }
}
