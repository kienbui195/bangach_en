import type { FieldError, ResourceMeta } from '../contract.js';

export interface Delegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
}

export interface ValidationContext {
  /** Dữ liệu sắp ghi (đã ép kiểu); hàm kiểm có thể chuẩn hóa tại chỗ. */
  data: Record<string, unknown>;
  /** Bản ghi hiện có khi sửa, null khi thêm. */
  existing: Record<string, unknown> | null;
  delegate: Delegate;
}

export interface ResourceDefinition {
  meta: ResourceMeta;
  /** Tên delegate trong PrismaClient. */
  model: string;
  /** Chuẩn hóa giá trị khóa đối chiếu của file nhập trước khi tìm (ví dụ chữ thường). */
  normalizeKey?: (value: string) => string;
  /** Tìm bản ghi sẵn có ứng với một dòng nhập; mặc định khớp theo khóa đối chiếu. */
  findExisting?: (delegate: Delegate, matchKey: string, data: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  /** Luật nghiệp vụ của game (BR13: nằm ở máy chủ game, không ở dashboard). */
  validate?: (ctx: ValidationContext) => Promise<FieldError[]>;
}
