import { LevelConfig } from '../types/game';
import { GAME_STAGES } from '../data/stages';
import {
  DEFAULT_TYPING_PROFILE,
  GAME_RULES,
  PROFILE_CLAMP,
  PROFILE_SAMPLE_WINDOW,
  TypingProfile,
} from '../config/gameRules';

const KEYS = {
  PROFILE_SAMPLES: 'wd_typing_samples',
  FAILED_ATTEMPTS: 'wd_failed_attempts',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface TypingSamples {
  reaction: number[];
  perChar: number[];
}

const readSamples = (): TypingSamples => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.PROFILE_SAMPLES) || 'null');
    if (raw && Array.isArray(raw.reaction) && Array.isArray(raw.perChar)) return raw;
  } catch {
    /* dùng mặc định */
  }
  return { reaction: [], perChar: [] };
};

/** Hồ sơ gõ = trung vị mẫu gần nhất, giới hạn quanh giá trị mặc định để một ván bất thường không làm lệch. */
export const loadTypingProfile = (device: 'keyboard' | 'touch'): TypingProfile => {
  const base = DEFAULT_TYPING_PROFILE[device];
  const samples = readSamples();
  const fit = (xs: number[], def: number) =>
    xs.length ? clamp(median(xs), def * PROFILE_CLAMP[0], def * PROFILE_CLAMP[1]) : def;
  return { reactionMs: fit(samples.reaction, base.reactionMs), msPerChar: fit(samples.perChar, base.msPerChar) };
};

export const recordTypingSamples = (reaction: number[], perChar: number[]) => {
  try {
    const cur = readSamples();
    const next: TypingSamples = {
      reaction: [...cur.reaction, ...reaction].slice(-PROFILE_SAMPLE_WINDOW),
      perChar: [...cur.perChar, ...perChar].slice(-PROFILE_SAMPLE_WINDOW),
    };
    localStorage.setItem(KEYS.PROFILE_SAMPLES, JSON.stringify(next));
  } catch (e) {
    console.error('Failed to save typing samples', e);
  }
};

const readFails = (): Record<number, number> => {
  try {
    return JSON.parse(localStorage.getItem(KEYS.FAILED_ATTEMPTS) || '{}');
  } catch {
    return {};
  }
};

export const getFailedAttempts = (levelId: number) => readFails()[levelId] || 0;

export const recordLevelResult = (levelId: number, isVictory: boolean) => {
  try {
    const fails = readFails();
    if (isVictory) delete fails[levelId];
    else fails[levelId] = (fails[levelId] || 0) + 1;
    localStorage.setItem(KEYS.FAILED_ATTEMPTS, JSON.stringify(fails));
  } catch (e) {
    console.error('Failed to save attempts', e);
  }
};

/** Vị trí màn trong toàn bộ hành trình, 0 (đầu) đến 1 (cuối). */
export const levelProgress = (level: LevelConfig) => {
  const all = GAME_STAGES.flatMap((s) => s.levels); // đọc mỗi lần vì danh sách có thể được thay bằng dữ liệu CMS
  const i = all.findIndex((l) => l.id === level.id);
  return all.length > 1 && i >= 0 ? i / (all.length - 1) : 0;
};

export interface LevelPace {
  fallDurationSec: number; // đã nhân hệ số hỗ trợ: thời gian rơi thật
  stdFallDurationSec: number; // chuẩn, dùng tính điểm tốc độ để điểm còn so sánh được (Q14)
  maxConcurrent: number;
  paceFactor: number;
  blankRatio: [number, number];
}

/**
 * Số gạch rơi cùng lúc của một màn: lấy khoảng của mức khó rồi rải đều cho các màn cùng mức
 * trong chặng đó. Ví dụ mức dễ có 3 màn, khoảng [3,5] → màn đầu 3, màn giữa 4, màn cuối 5.
 */
export const concurrentForLevel = (level: LevelConfig): number => {
  const c = GAME_RULES.pace.concurrent;
  if (level.difficulty === 'boss') return c.boss;
  const [lo, hi] = c[level.difficulty];

  const stage = GAME_STAGES.find((s) => s.id === level.stageId);
  const sameTier = (stage?.levels ?? [])
    .filter((l) => l.difficulty === level.difficulty)
    .sort((a, b) => a.levelNumber - b.levelNumber);
  const i = sameTier.findIndex((l) => l.id === level.id);
  if (sameTier.length <= 1 || i < 0) return lo;
  return Math.round(lerp(lo, hi, i / (sameTier.length - 1)));
};

export const computeLevelPace = (
  level: LevelConfig,
  profile: TypingProfile,
  failedAttempts: number
): LevelPace => {
  const r = GAME_RULES;
  const t = levelProgress(level);
  const boss = level.difficulty === 'boss';
  const blankRatio: [number, number] = boss
    ? r.blanks.boss
    : [lerp(r.blanks.ratioLow.start, r.blanks.ratioLow.end, t), lerp(r.blanks.ratioHigh.start, r.blanks.ratioHigh.end, t)];

  // T: thời gian ước tính để gõ xong một từ của màn này theo hồ sơ gõ của người chơi.
  // Độ dài từ lấy từ chính bộ từ của màn (màn cuối toàn từ dài hơn màn đầu rất nhiều), chỉ khi
  // màn chưa có từ mới dùng hằng số dự phòng trong config.
  const letters = level.wordPool.map((w) => (w.word.match(/[a-z]/gi) ?? []).length).filter((n) => n > 0);
  const avgLen = letters.length ? letters.reduce((a, b) => a + b, 0) / letters.length : r.pace.avgWordLength;
  const avgBlanks = ((blankRatio[0] + blankRatio[1]) / 2) * avgLen;
  const T = profile.reactionMs / 1000 + (avgBlanks * profile.msPerChar) / 1000;
  const [fLo, fHi] = r.pace.fallDurationClampSec;
  const f = r.pace.failSlowdown;
  const paceFactor = Math.min(f.maxFactor, Math.pow(f.perFail, Math.min(failedAttempts, f.maxFails)));
  // Tốc độ rơi như nhau ở mọi màn; màn khó hơn chỉ vì nhiều gạch cùng lúc hơn.
  const std = clamp(T * r.pace.fallFactor, fLo, fHi);

  return {
    fallDurationSec: std * paceFactor,
    stdFallDurationSec: std,
    maxConcurrent: concurrentForLevel(level),
    paceFactor,
    blankRatio,
  };
};

export const comboLength = (targetCount: number) => {
  const c = GAME_RULES.hearts.combo;
  return clamp(Math.round(targetCount * c.perWord), c.min, c.max);
};

/**
 * Số cột chia sân theo bề rộng thật của sân chơi (px). Màn ngang rộng vẫn 12 cột như cũ;
 * màn dọc hẹp giảm xuống để mỗi cột còn đủ chỗ cho một viên gạch, nếu không gạch mới
 * luôn đụng cột đã có và bị hoãn.
 */
export const spawnColumnCount = (fieldWidthPx: number) => {
  const c = GAME_RULES.pace.spawnColumns;
  return clamp(Math.floor(fieldWidthPx / c.minColumnPx), c.min, c.max);
};
