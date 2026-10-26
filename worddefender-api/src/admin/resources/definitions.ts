import type { FieldError, FieldMeta } from '../contract.js';
import { DEFAULT_GAME_RULES } from '../../game-config/default-rules.js';
import type { ResourceDefinition } from './definition.js';

const cefr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const f = (name: string, label: string, type: FieldMeta['type'], extra: Partial<FieldMeta> = {}): FieldMeta => ({ name, label, type, ...extra });
const ts = (name: string, label: string): FieldMeta => f(name, label, 'datetime', { readonly: true });

export const HEADWORD_PATTERN = /^[a-z]{2,16}$/;

const topics: ResourceDefinition = {
  model: 'topic',
  meta: {
    key: 'topics',
    label: 'Chặng',
    kind: 'collection',
    primaryKey: 'id',
    allowCreate: true,
    allowDelete: true,
    actions: [],
    fields: [
      f('id', 'Mã', 'int', { readonly: true, list: true, sortable: true }),
      f('slug', 'Slug', 'string', { required: true, unique: true, list: true, search: true, sortable: true, maxLength: 100 }),
      f('title', 'Tên chặng', 'string', { required: true, list: true, search: true, maxLength: 200 }),
      f('order', 'Thứ tự', 'int', { list: true, sortable: true }),
      f('source', 'Nguồn', 'enum', { required: true, enum: ['official', 'custom'], list: true, filter: true }),
      f('visibility', 'Hiển thị', 'enum', { required: true, enum: ['private', 'pending', 'approved', 'rejected'], filter: true }),
      f('ownerKey', 'Chủ sở hữu', 'string', { required: true, filter: true, maxLength: 64 }),
      f('domain', 'Chuyên ngành', 'string', { maxLength: 100 }),
      f('cefr', 'Trình độ CEFR', 'enum', { enum: cefr, filter: true }),
      f('description', 'Mô tả', 'text'),
      f('themeColor', 'Màu chủ đề', 'string', { maxLength: 16 }),
      f('reviewedBy', 'Người duyệt', 'string', { maxLength: 100 }),
      f('reviewedAt', 'Duyệt lúc', 'datetime'),
      ts('createdAt', 'Tạo lúc'),
      ts('updatedAt', 'Sửa lúc'),
    ],
  },
};

const levels: ResourceDefinition = {
  model: 'level',
  meta: {
    key: 'levels',
    label: 'Màn chơi',
    kind: 'collection',
    primaryKey: 'id',
    allowCreate: true,
    allowDelete: true,
    actions: [],
    fields: [
      f('id', 'Mã', 'int', { readonly: true, list: true, sortable: true }),
      f('topicId', 'Mã chặng', 'int', { required: true, list: true, filter: true, sortable: true }),
      f('uniqueKey', 'Khóa duy nhất', 'string', { required: true, unique: true, list: true, search: true, maxLength: 120 }),
      f('levelNumber', 'Số màn', 'int', { required: true, list: true, sortable: true }),
      f('title', 'Tên màn', 'string', { list: true, search: true, maxLength: 200 }),
      f('subtitle', 'Phụ đề', 'string', { maxLength: 200 }),
      f('difficulty', 'Độ khó', 'enum', { required: true, enum: ['easy', 'medium', 'hard', 'boss'], list: true, filter: true }),
      f('isBoss', 'Màn boss', 'bool'),
      f('targetCount', 'Số từ phải xong', 'int', { required: true, list: true }),
      f('minMissing', 'Chữ khuyết tối thiểu', 'int'),
      f('maxMissing', 'Chữ khuyết tối đa', 'int'),
      f('fallSpeed', 'Tốc độ rơi', 'decimal'),
      f('spawnInterval', 'Khoảng sinh gạch (ms)', 'int'),
      f('maxConcurrent', 'Gạch cùng lúc', 'int'),
      f('isGenerated', 'Sinh tự động', 'bool'),
      ts('createdAt', 'Tạo lúc'),
      ts('updatedAt', 'Sửa lúc'),
    ],
  },
};

const vocabularies: ResourceDefinition = {
  model: 'vocabulary',
  meta: {
    key: 'vocabularies',
    label: 'Từ vựng',
    kind: 'collection',
    primaryKey: 'id',
    allowCreate: true,
    allowDelete: true,
    actions: [],
    import: { formats: ['csv', 'json'], matchKey: 'headword' },
    fields: [
      f('id', 'Mã', 'int', { readonly: true, list: true, sortable: true }),
      f('headword', 'Từ (a-z, 2-16 ký tự)', 'string', { required: true, list: true, search: true, sortable: true, maxLength: 16 }),
      f('displayForm', 'Dạng hiển thị', 'string', { search: true, maxLength: 100 }),
      f('meaningVi', 'Nghĩa tiếng Việt', 'string', { required: true, list: true, search: true, maxLength: 500 }),
      f('phonetic', 'Phiên âm', 'string', { list: true, maxLength: 100 }),
      f('partOfSpeech', 'Từ loại', 'enum', {
        enum: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'auxiliary', 'particle', 'determiner', 'interjection', 'phrase'],
        filter: true,
      }),
      f('kind', 'Loại', 'enum', { required: true, enum: ['word', 'term', 'abbreviation'], filter: true }),
      f('ownerKey', 'Bộ từ', 'string', { required: true, filter: true, maxLength: 64 }),
      f('topicSlug', 'Chặng (slug)', 'string', { list: true, filter: true, maxLength: 100 }),
      f('levelNumber', 'Số màn', 'int', { list: true, filter: true, sortable: true }),
      f('orderIndex', 'Thứ tự trong màn', 'int', { sortable: true }),
      f('category', 'Nhóm', 'string', { filter: true, maxLength: 100 }),
      f('example', 'Ví dụ', 'text'),
      f('cefr', 'Trình độ CEFR', 'enum', { enum: cefr, filter: true }),
      f('length', 'Độ dài', 'int', { readonly: true }),
      f('audioPath', 'File đọc', 'file', { maxLength: 255 }),
      ts('createdAt', 'Tạo lúc'),
      ts('updatedAt', 'Sửa lúc'),
    ],
  },
  /** BR16: chuẩn hóa headword, chỉ a-z 2 đến 16 ký tự, không trùng trong cùng bộ. */
  async validate({ data, existing, delegate }) {
    const errors: FieldError[] = [];
    if (typeof data.headword === 'string') data.headword = data.headword.trim().toLowerCase();
    if (data.ownerKey === undefined && !existing) data.ownerKey = 'official';
    const headword = (data.headword ?? existing?.headword) as string | undefined;
    const ownerKey = (data.ownerKey ?? existing?.ownerKey ?? 'official') as string;
    if (headword === undefined) return errors;
    if (!HEADWORD_PATTERN.test(headword)) {
      errors.push({ name: 'headword', message: 'Từ chỉ gồm chữ a-z, dài 2 đến 16 ký tự' });
      return errors;
    }
    data.length = headword.length;
    const clash = await delegate.findFirst({ where: { ownerKey, headword } });
    if (clash && clash.id !== existing?.id) {
      errors.push({ name: 'headword', message: `Từ "${headword}" đã có trong bộ "${ownerKey}" (bản ghi #${String(clash.id)})` });
    }
    return errors;
  },
};

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** BR23: chỉ nhận khóa đã có trong bộ mặc định và cùng kiểu. Trả lỗi theo đường dẫn khóa. */
export function checkRulesShape(rules: unknown, defaults: unknown, path = 'rules'): FieldError[] {
  if (isPlain(defaults)) {
    if (!isPlain(rules)) return [{ name: path, message: 'Phải là một nhóm giá trị' }];
    const errors: FieldError[] = [];
    for (const key of Object.keys(rules)) {
      if (!(key in defaults)) errors.push({ name: `${path}.${key}`, message: 'Khóa không có trong bộ luật mặc định' });
    }
    for (const [key, def] of Object.entries(defaults)) {
      if (key in rules) errors.push(...checkRulesShape(rules[key], def, `${path}.${key}`));
    }
    return errors;
  }
  if (Array.isArray(defaults)) {
    if (!Array.isArray(rules) || rules.length !== defaults.length || !rules.every((x) => typeof x === 'number')) {
      return [{ name: path, message: `Phải là danh sách ${defaults.length} số` }];
    }
    return [];
  }
  return typeof rules === typeof defaults ? [] : [{ name: path, message: `Sai kiểu, cần ${typeof defaults}` }];
}

const gameConfig: ResourceDefinition = {
  model: 'gameConfig',
  meta: {
    key: 'game-config',
    label: 'Luật chơi',
    kind: 'singleton',
    primaryKey: 'id',
    allowCreate: false,
    allowDelete: false,
    actions: [],
    description: 'Mọi hằng số luật chơi nằm ở đây. Sửa xong, người chơi nhận luật mới ở lần tải kế tiếp.',
    fields: [
      f('id', 'Mã', 'int', { readonly: true }),
      f('rules', 'Luật chơi (JSON)', 'json', { required: true }),
      f('version', 'Phiên bản', 'int', { readonly: true }),
      ts('updatedAt', 'Sửa lúc'),
    ],
  },
  async validate({ data }) {
    return data.rules === undefined ? [] : checkRulesShape(data.rules, DEFAULT_GAME_RULES);
  },
};

const wordReports: ResourceDefinition = {
  model: 'wordReport',
  meta: {
    key: 'word-reports',
    label: 'Báo lỗi từ',
    kind: 'collection',
    primaryKey: 'id',
    allowCreate: false,
    allowDelete: true,
    actions: [],
    fields: [
      f('id', 'Mã', 'int', { readonly: true, list: true, sortable: true }),
      f('headword', 'Từ', 'string', { readonly: true, list: true, search: true, filter: true }),
      f('field', 'Trường sai', 'enum', { readonly: true, enum: ['headword', 'displayForm', 'meaningVi', 'phonetic', 'example', 'audio'], list: true, filter: true }),
      f('currentValue', 'Giá trị hiện tại', 'text', { readonly: true }),
      f('suggestedValue', 'Giá trị đề nghị', 'text', { readonly: true, list: true }),
      f('suggestedAudioPath', 'File đọc đề nghị', 'file', { readonly: true }),
      f('note', 'Ghi chú của người chơi', 'text', { readonly: true }),
      f('reviewStatus', 'Trạng thái', 'enum', { readonly: true, enum: ['pending', 'approved', 'rejected'], list: true, filter: true, sortable: true }),
      f('reviewNote', 'Ghi chú duyệt', 'text'),
      ts('appliedAt', 'Áp dụng lúc'),
      ts('createdAt', 'Gửi lúc'),
    ],
  },
};

export const RESOURCES: ResourceDefinition[] = [topics, levels, vocabularies, gameConfig, wordReports];
