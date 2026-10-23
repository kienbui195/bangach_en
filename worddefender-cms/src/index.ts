import type { Core } from '@strapi/strapi';
import { DEFAULT_GAME_RULES } from './seed/defaultGameRules';

/** Nội dung chính thức công khai cho game đọc; ghi vẫn chỉ qua admin. */
const PUBLIC_READ = [
  'api::topic.topic',
  'api::level.level',
  'api::vocabulary.vocabulary',
  'api::game-config.game-config',
];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Thêm khóa còn thiếu từ mặc định, không đụng tới giá trị đã có (người dùng đã chỉnh). Trả về số khóa đã thêm. */
const fillMissing = (target: Record<string, unknown>, defaults: Record<string, unknown>): number => {
  let added = 0;
  for (const [key, def] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = def;
      added += 1;
    } else if (isPlainObject(target[key]) && isPlainObject(def)) {
      added += fillMissing(target[key] as Record<string, unknown>, def);
    }
  }
  return added;
};

const seedGameConfig = async (strapi: Core.Strapi) => {
  const docs = strapi.documents('api::game-config.game-config');
  const existing = await docs.findFirst({});
  if (!existing) {
    await docs.create({ data: { rules: DEFAULT_GAME_RULES, version: 1 } });
    strapi.log.info('Đã khởi tạo game-config với luật chơi mặc định');
    return;
  }
  const rules = structuredClone(existing.rules) as Record<string, unknown>;
  const added = fillMissing(rules, DEFAULT_GAME_RULES);
  if (added > 0) {
    await docs.update({ documentId: existing.documentId, data: { rules } as never });
    strapi.log.info(`game-config: bổ sung ${added} khóa còn thiếu (giữ nguyên giá trị đã chỉnh)`);
  }
};

/**
 * Quyền ghi của khách: chỉ đủ để gửi báo lỗi từ (và tải lên file đọc đề xuất). Nội dung thật
 * không bao giờ bị khách sửa trực tiếp — báo lỗi vào hàng chờ, admin duyệt thì lifecycle của
 * word-report mới ghi vào bảng vocabulary.
 */
const PUBLIC_WRITE = ['api::word-report.word-report.create', 'plugin::upload.content-api.upload'];

const openPublicRead = async (strapi: Core.Strapi) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  if (!role) return;
  const perms = strapi.db.query('plugin::users-permissions.permission');
  const keys = [
    ...PUBLIC_READ.flatMap((uid) => ['find', 'findOne'].map((action) => `${uid}.${action}`)),
    ...PUBLIC_WRITE,
  ];
  for (const key of keys) {
    const found = await perms.findOne({ where: { action: key, role: role.id } });
    if (!found) await perms.create({ data: { action: key, role: role.id } });
  }
};

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedGameConfig(strapi);
    await openPublicRead(strapi);
  },
};
