import { LearnedWordRecord, WordItem } from '../types/game';

const STORAGE_KEYS = {
  UNLOCKED_STAGE: 'wd_unlocked_stage',
  UNLOCKED_LEVEL: 'wd_unlocked_level',
  COMPLETED_LEVELS: 'wd_completed_levels',
  LEARNED_WORDS: 'wd_learned_words',
  PREFERRED_DEVICE: 'wd_preferred_device',
  SHOW_VIRTUAL_KB: 'wd_show_virtual_keyboard',
  SOUND_ENABLED: 'wd_sound_enabled',
  SPEECH_ENABLED: 'wd_speech_enabled',
};

export interface LevelProgress {
  stars: number;
  highAccuracy: number;
  bestWpm: number;
  bestScore?: number;
  completedAt: number;
}

export const loadGameData = () => {
  if (typeof window === 'undefined') {
    return {
      unlockedStage: 1,
      unlockedLevel: 101,
      completedLevels: {} as Record<number, LevelProgress>,
      learnedWords: [] as LearnedWordRecord[],
      preferredDevice: null as 'keyboard' | 'touch' | null,
      showVirtualKeyboard: false,
      soundEnabled: true,
      speechEnabled: true,
    };
  }

  try {
    const unlockedStage = parseInt(localStorage.getItem(STORAGE_KEYS.UNLOCKED_STAGE) || '1', 10);
    const unlockedLevel = parseInt(localStorage.getItem(STORAGE_KEYS.UNLOCKED_LEVEL) || '101', 10);
    const completedLevels = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETED_LEVELS) || '{}');
    const learnedWords = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNED_WORDS) || '[]');
    const preferredDevice = localStorage.getItem(STORAGE_KEYS.PREFERRED_DEVICE) as 'keyboard' | 'touch' | null;
    const showVirtualKeyboard = localStorage.getItem(STORAGE_KEYS.SHOW_VIRTUAL_KB) === 'true';
    const soundEnabled = localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false';
    const speechEnabled = localStorage.getItem(STORAGE_KEYS.SPEECH_ENABLED) !== 'false';

    return {
      unlockedStage,
      unlockedLevel,
      completedLevels,
      learnedWords,
      preferredDevice,
      showVirtualKeyboard,
      soundEnabled,
      speechEnabled,
    };
  } catch (e) {
    console.error('Error reading localStorage', e);
    return {
      unlockedStage: 1,
      unlockedLevel: 101,
      completedLevels: {} as Record<number, LevelProgress>,
      learnedWords: [] as LearnedWordRecord[],
      preferredDevice: null,
      showVirtualKeyboard: false,
      soundEnabled: true,
      speechEnabled: true,
    };
  }
};

/** Số cũ có thể là undefined, chuỗi hoặc rác từ bản lưu cũ; đọc không ra số thì coi như chưa có. */
const bestOf = (prev: unknown, next: number) => {
  const old = typeof prev === 'number' && Number.isFinite(prev) ? prev : 0;
  const cur = Number.isFinite(next) ? next : 0;
  return Math.max(old, cur);
};

/**
 * Mỗi chỉ số giữ KỶ LỤC từ trước tới nay: chơi lại tệ hơn thì bản ghi cũ vẫn nguyên, chơi lại
 * tốt hơn thì đè lên. Trả về bản ghi đã gộp để màn hình cập nhật ngay, khỏi đọc lại localStorage.
 */
export const saveCompletedLevel = (
  levelId: number,
  nextLevelId: number | null,
  stars: number,
  accuracy: number,
  wpm: number,
  score: number
): LevelProgress => {
  const merged: LevelProgress = {
    stars,
    highAccuracy: accuracy,
    bestWpm: wpm,
    bestScore: score,
    completedAt: Date.now(),
  };
  try {
    const currentCompleted = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPLETED_LEVELS) || '{}');
    const raw = currentCompleted[levelId];
    const prev = raw && typeof raw === 'object' ? (raw as Partial<LevelProgress>) : {};
    merged.stars = bestOf(prev.stars, stars);
    merged.highAccuracy = bestOf(prev.highAccuracy, accuracy);
    merged.bestWpm = bestOf(prev.bestWpm, wpm);
    merged.bestScore = bestOf(prev.bestScore, score);
    currentCompleted[levelId] = merged;
    localStorage.setItem(STORAGE_KEYS.COMPLETED_LEVELS, JSON.stringify(currentCompleted));

    if (nextLevelId) {
      const currentUnlocked = parseInt(localStorage.getItem(STORAGE_KEYS.UNLOCKED_LEVEL) || '101', 10);
      if (nextLevelId > currentUnlocked) {
        localStorage.setItem(STORAGE_KEYS.UNLOCKED_LEVEL, nextLevelId.toString());
      }
    }
  } catch (e) {
    console.error('Failed to save level progress', e);
  }
  return merged;
};

export const saveLearnedWords = (newWords: WordItem[]) => {
  try {
    const existing: LearnedWordRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNED_WORDS) || '[]');
    const map = new Map<string, LearnedWordRecord>();
    existing.forEach(item => map.set(item.word.toLowerCase(), item));

    newWords.forEach(w => {
      const key = w.word.toLowerCase();
      if (map.has(key)) {
        const item = map.get(key)!;
        item.timesCorrect += 1;
        item.learnedAt = Date.now();
      } else {
        map.set(key, {
          id: w.id,
          word: w.word,
          meaning: w.meaning,
          phonetic: w.phonetic,
          category: w.category,
          example: w.example,
          learnedAt: Date.now(),
          timesCorrect: 1,
          timesReviewed: 0,
          mastered: false,
        });
      }
    });

    const updated = Array.from(map.values());
    localStorage.setItem(STORAGE_KEYS.LEARNED_WORDS, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save learned words', e);
    return [];
  }
};

export const updateLearnedWordReview = (word: string, isCorrect: boolean) => {
  try {
    const existing: LearnedWordRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNED_WORDS) || '[]');
    const updated = existing.map(item => {
      if (item.word.toLowerCase() === word.toLowerCase()) {
        const timesReviewed = (item.timesReviewed || 0) + 1;
        const timesCorrect = isCorrect ? (item.timesCorrect || 0) + 1 : item.timesCorrect;
        return {
          ...item,
          timesReviewed,
          timesCorrect,
          mastered: timesCorrect >= 3 && timesCorrect / timesReviewed >= 0.75,
        };
      }
      return item;
    });
    localStorage.setItem(STORAGE_KEYS.LEARNED_WORDS, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to update word review', e);
    return [];
  }
};

export const setStoredDevice = (device: 'keyboard' | 'touch', enableVirtualKb: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PREFERRED_DEVICE, device);
    localStorage.setItem(STORAGE_KEYS.SHOW_VIRTUAL_KB, enableVirtualKb ? 'true' : 'false');
  } catch (e) {
    console.error('Failed to set preferred device', e);
  }
};

export const setStoredVirtualKeyboard = (enabled: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEYS.SHOW_VIRTUAL_KB, enabled ? 'true' : 'false');
  } catch (e) {
    console.error('Failed to set virtual kb', e);
  }
};
