'use strict';

/**
 * Đọc/ghi nội dung cho plugin Import / Export.
 *
 * Mọi thao tác ghi đi qua Document Service (strapi.documents) chứ không qua strapi.db.query,
 * để lifecycle (ví dụ chặn trùng headword của vocabulary) vẫn chạy và dữ liệu đúng chuẩn
 * Strapi 5. Bản ghi được khớp theo một trường khóa do người dùng chọn (mặc định id), nên
 * nạp lại cùng một file là cập nhật chứ không nhân bản.
 */

/** Trường do Strapi quản lý: không bao giờ nhận từ file import. */
const MANAGED_FIELDS = [
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdBy',
  'updatedBy',
  'locale',
  'localizations',
];

const RELATION_TYPES = ['relation', 'component', 'dynamiczone', 'media'];

/** Các content type người dùng được chọn; giới hạn bằng config allowedUids nếu có. */
const listContentTypes = (strapi) => {
  const allowed = strapi.config.get('plugin::wd-import-export.allowedUids', null);
  return Object.values(strapi.contentTypes)
    .filter((ct) => ct.uid.startsWith('api::'))
    .filter((ct) => !allowed || allowed.includes(ct.uid))
    .map((ct) => ({
      uid: ct.uid,
      kind: ct.kind,
      displayName: ct.info.displayName ?? ct.info.singularName,
      fields: plainFields(ct),
      keyFields: ['id', 'documentId', ...plainFields(ct).map((f) => f.name)],
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};

/** Thuộc tính ghi/đọc được dưới dạng ô phẳng (bỏ quan hệ, component, media). */
const plainFields = (ct) =>
  Object.entries(ct.attributes)
    .filter(([, attr]) => !RELATION_TYPES.includes(attr.type))
    .map(([name, attr]) => ({ name, type: attr.type, required: Boolean(attr.required) }));

const getContentType = (strapi, uid) => {
  const ct = strapi.contentTypes[uid];
  if (!ct) throw new Error(`Không có content type ${uid}`);
  const allowed = strapi.config.get('plugin::wd-import-export.allowedUids', null);
  if (allowed && !allowed.includes(uid)) throw new Error(`Content type ${uid} không nằm trong danh sách cho phép`);
  return ct;
};

// ---------- CSV ----------

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (rows, columns) =>
  [columns.join(','), ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(','))].join('\n');

/** Tách CSV theo RFC 4180: có dấu nháy kép, dấu phẩy và xuống dòng bên trong ô. */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((x) => x !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
};

/** Ô CSV luôn là chuỗi: ép về đúng kiểu của schema, ô rỗng coi như không khai. */
const coerce = (value, type) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  switch (type) {
    case 'integer':
    case 'biginteger':
      return Number.parseInt(value, 10);
    case 'float':
    case 'decimal':
      return Number.parseFloat(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
};

// ---------- Export ----------

const exportData = async (strapi, { uid, format }) => {
  const ct = getContentType(strapi, uid);
  const columns = plainFields(ct).map((f) => f.name);
  const entries = await strapi.documents(uid).findMany({ limit: -1 });
  const rows = (Array.isArray(entries) ? entries : [entries].filter(Boolean)).map((e) =>
    Object.fromEntries(columns.map((c) => [c, e[c] ?? null]))
  );

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const base = `${uid.split('.').pop()}-${stamp}`;
  return format === 'csv'
    ? { filename: `${base}.csv`, mime: 'text/csv', count: rows.length, content: toCsv(rows, columns) }
    : { filename: `${base}.json`, mime: 'application/json', count: rows.length, content: JSON.stringify(rows, null, 2) };
};

// ---------- Import ----------

/** Nhận mảng phẳng, hoặc object { "1": {...} } (dạng khóa theo số thứ tự). */
const readRows = (content, format) => {
  if (format === 'csv') return parseCsv(content);
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    // { "version": 2, "data": { "api::x.y": { "1": {...} } } } hoặc { "1": {...} }
    const inner = parsed.data && typeof parsed.data === 'object' ? Object.values(parsed.data)[0] : parsed;
    if (inner && typeof inner === 'object') return Object.values(inner);
  }
  throw new Error('File phải là mảng bản ghi, hoặc object có các bản ghi bên trong');
};

/**
 * ValidationError của Strapi chỉ đưa "2 errors occurred"; chi tiết từng trường nằm trong
 * details.errors, gom lại để người nhập biết sửa ô nào.
 */
const readableError = (err) => {
  const parts = (err.details?.errors ?? []).map((e) => {
    const field = Array.isArray(e.path) ? e.path.join('.') : e.path;
    return field ? `${field}: ${e.message}` : e.message;
  });
  return parts.length ? parts.join(' · ') : err.message ?? String(err);
};

const importData = async (strapi, { uid, format, content, keyField = 'id', dryRun = false }) => {
  const ct = getContentType(strapi, uid);
  const fields = plainFields(ct);
  const typeOf = Object.fromEntries(fields.map((f) => [f.name, f.type]));
  const writable = new Set(fields.map((f) => f.name).filter((n) => !MANAGED_FIELDS.includes(n)));

  const rows = readRows(content, format);
  const docs = strapi.documents(uid);
  const result = { total: rows.length, created: 0, updated: 0, failures: [], dryRun };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2; // dòng trong file CSV (1 là tiêu đề)
    try {
      const data = {};
      for (const [k, v] of Object.entries(row)) {
        if (!writable.has(k)) continue;
        const value = coerce(v, typeOf[k]);
        if (value !== undefined) data[k] = value;
      }
      if (!Object.keys(data).length) throw new Error('Không có cột nào khớp schema');

      const rawKey = row[keyField];
      const key = coerce(rawKey, keyField === 'id' ? 'integer' : typeOf[keyField]);
      let existing = null;
      if (key !== undefined && key !== null && key !== '') {
        existing =
          keyField === 'documentId'
            ? await docs.findOne({ documentId: String(key) })
            : await docs.findFirst({ filters: { [keyField]: key } });
      }

      if (dryRun) {
        existing ? result.updated++ : result.created++;
        continue;
      }
      if (existing) {
        await docs.update({ documentId: existing.documentId, data });
        result.updated++;
      } else {
        await docs.create({ data });
        result.created++;
      }
    } catch (err) {
      result.failures.push({
        line,
        key: row[keyField] ?? null,
        label: row.headword ?? row.title ?? row.name ?? null,
        error: readableError(err),
      });
    }
  }
  return result;
};

module.exports = ({ strapi }) => ({
  listContentTypes: () => listContentTypes(strapi),
  exportData: (params) => exportData(strapi, params),
  importData: (params) => importData(strapi, params),
});
