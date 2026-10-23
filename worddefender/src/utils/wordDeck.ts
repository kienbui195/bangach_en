import { WordItem } from '../types/game';

/** Số ngẫu nhiên có hạt giống (mulberry32): cùng hạt giống thì luôn ra cùng dãy số. */
const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Hạt giống của một màn: lấy từ chính danh sách từ của màn, nên màn nào bộ nấy và ổn định. */
const seedOf = (ids: string[]) => {
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
};

const shuffleWith = <T,>(xs: T[], rand: () => number): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Bộ từ của một màn. CỐ ĐỊNH: chơi lại màn nào cũng gặp đúng bộ từ đó theo đúng thứ tự, vì
 * người chơi chơi lại là để học lại chính những từ ấy và để lấy đủ 3 sao — đổi sang bộ khác
 * thì việc chơi lại mất ý nghĩa. Bộ từ cũng giống nhau giữa mọi người chơi nên điểm so sánh
 * được với nhau.
 *
 * Mỗi từ chỉ xuất hiện một lần. Pool ít từ hơn số cần thì bộ ngắn lại chứ không lặp từ, nên
 * số từ phải phá của màn lấy theo độ dài bộ này (xem App.tsx).
 *
 * Tỉ lệ từ mới / từ ôn đến từ cách dựng pool (từ mới của màn này cộng từ của màn liền trước),
 * không còn tính theo danh sách từ đã học của từng người — nếu tính theo thì bộ từ sẽ đổi mỗi
 * lần người chơi học thêm được từ mới.
 */
export const buildWordDeck = (
  pool: WordItem[],
  count: number,
  /** @deprecated không còn dùng: bộ từ cố định nên không phụ thuộc người chơi đã học gì */
  _learnedWords?: Set<string>
): WordItem[] => {
  const seen = new Set<string>();
  const unique = pool.filter((w) => {
    const key = w.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rand = seededRandom(seedOf(unique.map((w) => w.id)));
  return shuffleWith(unique, rand).slice(0, count);
};
