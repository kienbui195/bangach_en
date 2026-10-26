import type { ResourceMeta } from '../contract.js';

/** Sao lưu logic của database worddefender (JSON nén), lưu ở BACKUP_DIR. Khôi phục chỉ phục hồi dữ liệu trong database, không đụng file âm thanh. */
export const BACKUPS_META: ResourceMeta = {
  key: 'backups',
  label: 'Sao lưu',
  kind: 'collection',
  primaryKey: 'name',
  allowCreate: false,
  allowDelete: true,
  allowEdit: false,
  allowExport: false,
  description:
    'Bản sao lưu dữ liệu game (chặng, màn, từ vựng, luật chơi, báo lỗi). Tự sao lưu mỗi ngày (giữ 14 bản tự động); bấm "Sao lưu ngay" để tạo thêm. Khôi phục sẽ thay TOÀN BỘ dữ liệu hiện tại bằng nội dung bản đã chọn (có tự sao lưu "trước khi khôi phục" để quay lại được); file âm thanh không bị đụng tới.',
  actions: [
    { name: 'backup-now', label: 'Sao lưu ngay', target: 'resource' },
    {
      name: 'restore',
      label: 'Khôi phục',
      confirm: 'Khôi phục sẽ thay TOÀN BỘ dữ liệu game hiện tại bằng bản sao lưu này (hệ thống tự sao lưu lại trạng thái hiện tại trước). Tiếp tục?',
    },
  ],
  fields: [
    { name: 'name', label: 'Tên bản sao lưu', type: 'string', readonly: true, list: true },
    { name: 'kind', label: 'Loại', type: 'enum', enum: ['manual', 'auto', 'pre-restore'], readonly: true, list: true },
    { name: 'createdAt', label: 'Tạo lúc', type: 'datetime', readonly: true, list: true },
    { name: 'sizeKb', label: 'Dung lượng (KB)', type: 'int', readonly: true, list: true },
    { name: 'topics', label: 'Chặng', type: 'int', readonly: true, list: true },
    { name: 'levels', label: 'Màn', type: 'int', readonly: true, list: true },
    { name: 'vocabularies', label: 'Từ vựng', type: 'int', readonly: true, list: true },
    { name: 'wordReports', label: 'Báo lỗi', type: 'int', readonly: true, list: true },
  ],
};
