const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Thêm khóa còn thiếu từ bộ mặc định vào `target`, không đụng tới giá trị đã có (giá trị admin đã chỉnh).
 * Trả về số khóa đã thêm. BR24.
 */
export function fillMissing(target: Record<string, unknown>, defaults: Record<string, unknown>): number {
  let added = 0;
  for (const [key, def] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = structuredClone(def);
      added += 1;
    } else if (isPlainObject(target[key]) && isPlainObject(def)) {
      added += fillMissing(target[key], def);
    }
  }
  return added;
}
