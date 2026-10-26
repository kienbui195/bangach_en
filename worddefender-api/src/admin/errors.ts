import { HttpException, HttpStatus } from '@nestjs/common';
import type { FieldError } from './contract.js';

/** Mọi lỗi của /admin-api có cùng một khuôn: { error: { code, message, fields? } }. */
export const apiError = (status: HttpStatus, code: string, message: string, fields?: FieldError[]) =>
  new HttpException({ error: { code, message, ...(fields ? { fields } : {}) } }, status);

export const notFound = (message = 'Không tìm thấy bản ghi') => apiError(HttpStatus.NOT_FOUND, 'not_found', message);

export const unprocessable = (fields: FieldError[], message = 'Dữ liệu không hợp lệ') => apiError(HttpStatus.UNPROCESSABLE_ENTITY, 'validation', message, fields);

/** Mã bản ghi là số nguyên dương, không thì coi như không tồn tại. */
export const parseId = (raw: string | null): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw notFound();
  return id;
};

/** BR14: mặc định 25 dòng, tối đa 100 dòng một trang. */
export const parsePaging = (page?: string, pageSize?: string) => ({
  page: Math.max(1, Number(page) || 1),
  pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
});
