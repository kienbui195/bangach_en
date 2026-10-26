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
  /** Luật nghiệp vụ của game (BR13: nằm ở máy chủ game, không ở dashboard). */
  validate?: (ctx: ValidationContext) => Promise<FieldError[]>;
}
