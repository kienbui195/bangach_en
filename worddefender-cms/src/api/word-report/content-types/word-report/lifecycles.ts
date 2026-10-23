/**
 * Duyệt một báo lỗi từ: đổi reviewStatus sang "approved" trong admin là hệ thống tự ghi đề xuất
 * vào bản ghi từ vựng tương ứng, rồi đóng dấu thời điểm áp dụng.
 *
 * Chỉ áp dụng một lần: bản ghi đã có appliedAt thì lần cập nhật sau không ghi lại nữa, nên
 * sửa chú thích hay bật/tắt reviewStatus không làm từ vựng bị ghi đè nhiều lần.
 *
 * Người chơi gửi báo lỗi qua REST công khai; mọi thay đổi nội dung đều phải qua tay admin,
 * API công khai không bao giờ chạm trực tiếp vào bảng vocabulary.
 */
import { errors } from '@strapi/utils';

const REPORT_UID = 'api::word-report.word-report';
const VOCAB_UID = 'api::vocabulary.vocabulary';

/** Trường nào của từ vựng nhận giá trị nào từ báo lỗi. */
const TEXT_FIELDS = ['headword', 'displayForm', 'meaningVi', 'phonetic', 'example'] as const;

interface LifecycleEvent {
  params: { data: Record<string, unknown>; where?: Record<string, unknown> };
  result?: Record<string, unknown>;
}

const applyReport = async (reportId: number) => {
  const report = await strapi.db.query(REPORT_UID).findOne({
    where: { id: reportId },
    populate: ['suggestedAudio'],
  });
  if (!report || report.reviewStatus !== 'approved' || report.appliedAt) return;

  const word = await strapi.db.query(VOCAB_UID).findOne({ where: { headword: report.headword } });
  if (!word) {
    throw new errors.ApplicationError(
      `Không tìm thấy từ "${report.headword}" trong bộ từ vựng, không duyệt được báo lỗi này.`
    );
  }

  let data: Record<string, unknown>;
  if (report.field === 'audio') {
    if (!report.suggestedAudio) {
      throw new errors.ApplicationError('Báo lỗi file đọc nhưng chưa có file âm thanh đính kèm.');
    }
    data = { audio: report.suggestedAudio.id };
  } else {
    const value = (report.suggestedValue ?? '').trim();
    if (!value) throw new errors.ApplicationError('Chưa có nội dung đề xuất để ghi vào từ vựng.');
    if (!TEXT_FIELDS.includes(report.field)) {
      throw new errors.ApplicationError(`Không hỗ trợ sửa trường "${report.field}".`);
    }
    data = { [report.field]: value };
  }

  // Qua Document Service để lifecycle của vocabulary (chặn trùng headword) vẫn chạy.
  const doc = await strapi.documents(VOCAB_UID).findFirst({ filters: { headword: report.headword } });
  if (!doc) throw new errors.ApplicationError(`Không tìm thấy từ "${report.headword}".`);
  await strapi.documents(VOCAB_UID).update({ documentId: doc.documentId, data });

  await strapi.db.query(REPORT_UID).update({ where: { id: reportId }, data: { appliedAt: new Date() } });
  strapi.log.info(`[word-report] đã áp dụng #${reportId}: ${report.headword}.${report.field}`);
};

export default {
  /** Người chơi gửi lên luôn ở trạng thái chờ duyệt, kể cả khi payload tự đặt status khác. */
  beforeCreate(event: LifecycleEvent) {
    const { data } = event.params;
    if (typeof data.headword === 'string') data.headword = data.headword.trim().toLowerCase();
    data.reviewStatus = 'pending';
    data.appliedAt = null;
  },

  async afterUpdate(event: LifecycleEvent) {
    const id = event.result?.id;
    if (typeof id === 'number') await applyReport(id);
  },
};
