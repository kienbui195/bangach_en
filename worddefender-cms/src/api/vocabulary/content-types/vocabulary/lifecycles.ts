/**
 * Chặn trùng từ: mỗi bộ (ownerKey) chỉ được có một bản ghi cho mỗi headword.
 *
 * Schema mô tả ràng buộc này nhưng MySQL chưa có chỉ mục unique (xem mục 2b của tài liệu
 * thiết kế); trước khi có chỉ mục, lifecycle là chỗ duy nhất chặn. Quan trọng khi nạp lô lớn:
 * plugin import không khử trùng, chạy nhầm một file hai lần là nhân đôi cả bộ từ.
 *
 * Cũng chuẩn hóa headword về chữ thường để "Ball" và "ball" không thành hai bản ghi.
 */
import { errors } from '@strapi/utils';

const UID = 'api::vocabulary.vocabulary';

interface LifecycleEvent {
  params: { data: Record<string, unknown>; where?: Record<string, unknown> };
}

/** Khóa nghiệp vụ của bản ghi sắp ghi; lấy giá trị cũ cho trường không nằm trong lần sửa này. */
const resolveKey = async (data: Record<string, unknown>, where: Record<string, unknown> | undefined) => {
  let current: { ownerKey?: string; headword?: string } | null = null;
  if (where?.id !== undefined) {
    current = await strapi.db.query(UID).findOne({ where: { id: where.id }, select: ['ownerKey', 'headword'] });
  }
  return {
    ownerKey: (data.ownerKey as string) ?? current?.ownerKey ?? 'official',
    headword: (data.headword as string) ?? current?.headword,
  };
};

const assertUnique = async (event: LifecycleEvent) => {
  const { data, where } = event.params;
  if (typeof data.headword === 'string') data.headword = data.headword.trim().toLowerCase();

  const { ownerKey, headword } = await resolveKey(data, where);
  if (!headword) return;

  const clash = await strapi.db.query(UID).findOne({ where: { ownerKey, headword }, select: ['id'] });
  if (!clash) return;
  if (where?.id !== undefined && clash.id === where.id) return; // đang sửa chính nó

  throw new errors.ApplicationError(
    `Từ "${headword}" đã có trong bộ "${ownerKey}" (bản ghi #${clash.id}). Mỗi bộ chỉ được một bản ghi cho mỗi từ.`
  );
};

export default {
  beforeCreate: assertUnique,
  beforeUpdate: assertUnique,
};
