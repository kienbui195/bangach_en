import { timingSafeEqual } from 'node:crypto';

/** So sánh chuỗi bí mật (token, chữ ký) với thời gian không phụ thuộc vào vị trí khác nhau đầu tiên. */
export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
