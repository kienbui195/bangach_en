/** Phiên bản hợp đồng quản trị mà máy chủ này nói. Dashboard chỉ nối game có phiên bản nó hỗ trợ (BR33). */
export const CONTRACT_VERSION = 1;

export type FieldType = 'string' | 'text' | 'int' | 'decimal' | 'bool' | 'enum' | 'datetime' | 'json' | 'file';

export interface FieldMeta {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  readonly?: boolean;
  /** Hiện thành cột trong bảng. */
  list?: boolean;
  filter?: boolean;
  search?: boolean;
  sortable?: boolean;
  maxLength?: number;
  enum?: string[];
  /** Gợi ý hiện dưới ô nhập (ví dụ giá trị mặc định khi để trống). */
  hint?: string;
}

export interface ActionMeta {
  name: string;
  label: string;
  /** Chỉ áp dụng khi trường `when.field` có giá trị `when.equals`. */
  when?: { field: string; equals: string };
  /** Cần ghi chú khi thực hiện (ví dụ từ chối). */
  needsNote?: boolean;
  /** `record` (mặc định): áp dụng cho một bản ghi; `resource`: áp dụng cho cả tài nguyên (ví dụ đặt lại luật mặc định). */
  target?: 'record' | 'resource';
  /** Danh sách lựa chọn gửi kèm dưới tên `option` (rỗng nghĩa là mọi nhóm). */
  options?: { value: string; label: string }[];
  /** Hỏi xác nhận bằng câu này trước khi thực hiện (thao tác nguy hiểm như khôi phục). */
  confirm?: string;
}

export interface ResourceMeta {
  key: string;
  label: string;
  kind: 'collection' | 'singleton';
  primaryKey: string;
  fields: FieldMeta[];
  allowCreate: boolean;
  allowDelete: boolean;
  /** Mặc định true. Đặt false cho tài nguyên chỉ đọc (ví dụ sao lưu): dashboard ẩn nút Sửa. */
  allowEdit?: boolean;
  /** Mặc định true. Đặt false nếu xuất CSV/JSON không có nghĩa với tài nguyên này. */
  allowExport?: boolean;
  actions: ActionMeta[];
  import?: { formats: string[]; matchKey: string };
  description?: string;
}

export interface GameMeta {
  game: { key: string; name: string; version: string };
  contractVersion: number;
  resources: ResourceMeta[];
}

export interface FieldError {
  name: string;
  message: string;
}
