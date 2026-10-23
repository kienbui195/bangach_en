import { DifficultyLevel } from '../types/game';
import { GAME_RULES } from '../config/gameRules';

export interface WordScoreInput {
  wordLength: number;
  blanks: number; // số chữ người chơi phải gõ
  elapsedSec: number; // thời gian gạch đã rơi tới lúc vỡ (không tính lúc tạm dừng)
  expectedFallSec: number; // thời gian gạch rơi từ trên xuống đất
  mistakes: number; // số lần gõ sai trên viên gạch này
  difficulty: DifficultyLevel;
}

export interface WordScoreBreakdown {
  base: number;
  speedMult: number; // 1 - 2: càng vỡ sớm càng cao
  accuracyMult: number; // 1.2 nếu không sai, giảm 0.15 mỗi lần sai (tối thiểu 0.5)
  difficultyMult: number;
  total: number;
}

const DIFFICULTY_MULT: Record<DifficultyLevel, number> = {
  easy: 1,
  medium: 1.25,
  hard: 1.5,
  boss: 2,
};

/** Điểm trần của viên gạch tăng theo độ dài và số chữ khuyết; tốc độ và độ chính xác nhân lên trên điểm trần. */
export const calculateWordScore = (input: WordScoreInput): WordScoreBreakdown => {
  const base = input.wordLength * 10 + input.blanks * 20;
  const timeRatio = Math.min(1, Math.max(0, 1 - input.elapsedSec / Math.max(0.1, input.expectedFallSec)));
  const speedMult = 1 + timeRatio;
  const accuracyMult = input.mistakes === 0 ? 1.2 : Math.max(0.5, 1 - 0.15 * input.mistakes);
  const difficultyMult = DIFFICULTY_MULT[input.difficulty];

  return {
    base,
    speedMult,
    accuracyMult,
    difficultyMult,
    total: Math.round(base * speedMult * accuracyMult * difficultyMult),
  };
};

/**
 * Số sao của MỘT ván vừa chơi: 3 sao khi gần như không gõ sai và còn đủ tim, 2 sao khi gõ khá
 * chuẩn, còn lại 1 sao. Dùng chung cho chỗ lưu tiến độ (App) và bảng tổng kết (PostMatchModal)
 * để hai nơi không lệch nhau; mốc tim lấy theo luật chơi chứ không viết cứng số 3, vì luật có
 * thể được CMS thay đổi.
 */
export const matchStars = (accuracy: number, heartsRemaining: number): number => {
  if (accuracy >= 90 && heartsRemaining >= GAME_RULES.hearts.max) return 3;
  if (accuracy >= 75) return 2;
  return 1;
};
