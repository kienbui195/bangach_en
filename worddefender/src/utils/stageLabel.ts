import { LevelProgress } from './storage';
import { StageConfig } from '../types/game';

/**
 * Tên chủ đề để hiển thị. Dữ liệu đặt title là "Chặng 1: Văn Phòng & Giao Tiếp" (một chủ đề
 * hiện ứng với một chặng), nhưng người chơi chọn theo chủ đề nên bỏ tiền tố "Chặng N:".
 */
export const subjectName = (stage: StageConfig): string => stage.title.replace(/^Chặng\s*\d+:\s*/, '');

/** Tiến độ của một chủ đề: số màn đã vượt, tổng số màn, tổng sao và điểm của riêng chủ đề đó. */
export const stageProgress = (stage: StageConfig, completedLevels: Record<number, LevelProgress>) => {
  const done = stage.levels.filter((l) => completedLevels[l.id]);
  return {
    cleared: done.length,
    total: stage.levels.length,
    stars: done.reduce((sum, l) => sum + (completedLevels[l.id]?.stars ?? 0), 0),
    score: done.reduce((sum, l) => sum + (completedLevels[l.id]?.bestScore ?? 0), 0),
  };
};
