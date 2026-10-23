export interface WordItem {
  id: string;
  word: string; // e.g. "soccer", "ball"
  meaning: string; // Vietnamese definition e.g. "bóng đá"
  phonetic: string; // e.g. "/ˈsɑːkər/"
  partOfSpeech?: string;
  example?: string;
  category: string;
  audioUrl?: string; // file đọc do admin duyệt từ báo lỗi của người chơi; không có thì dùng giọng máy
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'boss';

export interface LevelConfig {
  id: number;
  stageId: number;
  levelNumber: number; // 1 to 6 (6 is Màn Cuối)
  title: string;
  subtitle: string;
  targetCount: number; // e.g. 8, 12, 15
  difficulty: DifficultyLevel;
  minMissing: number;
  maxMissing: number;
  fallSpeed: number; // percentage per second
  spawnInterval: number; // ms
  maxConcurrent: number;
  wordPool: WordItem[];
}

export interface StageConfig {
  id: number;
  title: string;
  description: string;
  themeColor: string;
  levels: LevelConfig[];
}

export interface BlankSlot {
  char: string; // actual letter
  isBlank: boolean;
  isFilled: boolean;
  userInput?: string;
  hasError?: boolean;
}

export interface FallingBrick {
  id: string;
  wordItem: WordItem;
  x: number; // 5% - 80%
  y: number; // 0% - 85%
  widthPx: number; // chiều rộng theo px, vừa khít từ; đổi sang % theo kích thước sân lúc cần
  cellPx: number; // bề rộng một ô chữ; từ dài trên màn hẹp thì ô co lại để gạch vẫn vừa sân
  height: number; // percentage
  speed: number;
  slots: BlankSlot[];
  currentBlankIndex: number; // index in slots of next blank to fill
  status: 'falling' | 'targeted' | 'completed' | 'landed';
  isNearGround: boolean;
  shakeTime?: number;
  age: number; // giây gạch đã tồn tại (không tính lúc tạm dừng), dùng tính điểm tốc độ
  fallDuration: number; // giây gạch rơi từ trên xuống đất theo tốc độ của nó
  mistakes: number; // số lần gõ sai trên viên gạch này
}

export interface LandedBrick {
  id: string;
  x: number;
  y: number;
  widthPx: number;
  height: number;
  color: string;
}

export interface BulletProjectile {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  char: string;
  progress: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
}

export interface DustCloud {
  id: string;
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

export interface CompletedWordPopup {
  wordItem: WordItem;
  x: number;
  y: number;
  timestamp: number;
}

export interface LearnedWordRecord {
  id: string;
  word: string;
  meaning: string;
  phonetic: string;
  category: string;
  example?: string;
  learnedAt: number;
  timesCorrect: number;
  timesReviewed: number;
  mastered: boolean;
}

export interface MatchStats {
  levelNumber: number;
  stageNumber: number;
  isVictory: boolean;
  totalSpawned: number;
  totalDestroyed: number;
  targetCount: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  accuracy: number;
  durationSeconds: number;
  averageTimePerWord: number;
  wpm: number;
  cpm: number;
  heartsRemaining: number;
  score: number;
  learnedWords: WordItem[];
  newWordIds: string[]; // từ chưa có trong bộ sưu tập trước ván này
}
