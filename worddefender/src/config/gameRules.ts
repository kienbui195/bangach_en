/**
 * Luật chơi tập trung một chỗ. Hình dạng JSON này sẽ khớp với trường `rules` của
 * single type `game-config` trên Strapi (thiết kế bản online, mục 3c); khi nối API thì
 * thay hằng số này bằng dữ liệu tải về, các nơi dùng không phải sửa.
 */
export interface GameRules {
  /** Mỗi nhóm trong CMS có thêm trường desc (giải thích); game không dùng. */
  pace: {
    /**
     * Thời gian rơi của một viên gạch: clamp(T × fallFactor), T là thời gian ước tính để gõ
     * xong một từ theo hồ sơ gõ (phản xạ + số chữ khuyết × ms mỗi chữ). GIỐNG NHAU ở mọi màn —
     * độ khó nằm ở số gạch rơi cùng lúc, không nằm ở tốc độ rơi.
     */
    fallFactor: number;
    fallDurationClampSec: [number, number];
    /** Chỉ dùng khi màn chưa có từ nào; bình thường độ dài từ lấy từ chính bộ từ của màn. */
    avgWordLength: number;
    failSlowdown: { perFail: number; maxFails: number; maxFactor: number };
    /**
     * Số gạch tối đa rơi cùng lúc, theo mức khó. Trong một mức, các màn chia đều từ đầu đến
     * cuối khoảng: mức dễ 3 màn với khoảng [3,5] thì lần lượt 3, 4, 5 gạch. Phá xong hoặc để
     * rơi một viên là sinh viên mới bù ngay, nên trên sân luôn đủ số gạch này.
     */
    concurrent: { easy: [number, number]; medium: [number, number]; hard: [number, number]; boss: number };
    /** Khoảng cách tối thiểu giữa hai lần sinh gạch, để không bung cả loạt cùng một lúc. */
    refillMinGapMs: number;
    /**
     * Số cột chia sân. Không cố định vì màn dọc hẹp chia nhiều cột thì mỗi cột không đủ chỗ
     * cho một viên gạch: số cột = bề rộng sân chia minColumnPx, kẹp trong [min, max].
     */
    spawnColumns: { min: number; max: number; minColumnPx: number };
  };
  blanks: {
    ratioLow: { start: number; end: number };
    ratioHigh: { start: number; end: number };
    boss: [number, number];
  };
  words: { newRatio: number };
  hearts: {
    max: number;
    lossPerMiss: number;
    comboReward: number[]; // thưởng ngẫu nhiên một trong các giá trị
    combo: { perWord: number; min: number; max: number };
  };
}

export const GAME_RULES: GameRules = {
  pace: {
    fallFactor: 10.5,
    fallDurationClampSec: [18, 67.5],
    avgWordLength: 6,
    failSlowdown: { perFail: 1.08, maxFails: 5, maxFactor: 1.4 },
    concurrent: { easy: [3, 5], medium: [6, 10], hard: [11, 15], boss: 15 },
    refillMinGapMs: 400,
    spawnColumns: { min: 4, max: 12, minColumnPx: 110 },
  },
  blanks: {
    ratioLow: { start: 0.25, end: 0.65 },
    ratioHigh: { start: 0.35, end: 0.8 },
    boss: [0.7, 0.85],
  },
  words: { newRatio: 0.6 },
  hearts: {
    max: 3,
    lossPerMiss: 0.5,
    comboReward: [0.5, 1],
    combo: { perWord: 0.2, min: 4, max: 10 },
  },
};

export interface TypingProfile {
  reactionMs: number; // từ lúc gạch thành mục tiêu đến phím đầu
  msPerChar: number; // trung bình giữa hai phím đúng
}

/** Giá trị khởi đầu theo thiết bị (mục 1d); chưa kiểm chứng, sẽ thay bằng số liệu nghiên cứu. */
export const DEFAULT_TYPING_PROFILE: Record<'keyboard' | 'touch', TypingProfile> = {
  keyboard: { reactionMs: 1200, msPerChar: 600 },
  touch: { reactionMs: 1200, msPerChar: 900 },
};

export const PROFILE_SAMPLE_WINDOW = 20;
export const PROFILE_CLAMP: [number, number] = [0.4, 3];
