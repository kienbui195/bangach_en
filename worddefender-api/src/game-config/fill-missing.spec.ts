import { fillMissing } from './fill-missing.js';

describe('fillMissing (BR24)', () => {
  it('thêm khóa còn thiếu, kể cả khóa lồng nhau, và đếm đúng số khóa thêm', () => {
    const target: Record<string, unknown> = { hearts: { max: 5 } };
    const added = fillMissing(target, { hearts: { max: 3, lossPerMiss: 0.5 }, words: { newRatio: 0.6 } });
    expect(added).toBe(2);
    expect(target).toEqual({ hearts: { max: 5, lossPerMiss: 0.5 }, words: { newRatio: 0.6 } });
  });

  it('không ghi đè giá trị admin đã chỉnh', () => {
    const target: Record<string, unknown> = { hearts: { max: 9 } };
    expect(fillMissing(target, { hearts: { max: 3 } })).toBe(0);
    expect(target).toEqual({ hearts: { max: 9 } });
  });

  it('sao chép sâu giá trị mặc định (sửa target không làm hỏng bộ mặc định)', () => {
    const defaults = { pace: { clamp: [12, 45] } };
    const target: Record<string, unknown> = {};
    fillMissing(target, defaults);
    (target.pace as { clamp: number[] }).clamp.push(99);
    expect(defaults.pace.clamp).toEqual([12, 45]);
  });
});
