/**
 * Mô hình dữ liệu cho phiên bản online (Strapi 5 + MySQL).
 * Mỗi interface tương ứng một Content Type trong CMS; tên trường giữ khớp schema.json.
 * Strapi 5 định danh bản ghi bằng `documentId` (chuỗi), không dùng `id` số trong REST.
 * Kiểu runtime của màn chơi (FallingBrick, Particle...) vẫn nằm ở `game.ts`.
 */

export type DocumentId = string;
export type ISODateString = string;

export interface StrapiEntity {
  documentId: DocumentId;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  publishedAt?: ISODateString | null;
}

/** Bao quanh response của Strapi REST (`GET /api/...`). */
export interface StrapiList<T> {
  data: T[];
  meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
}
export interface StrapiOne<T> {
  data: T;
}

// ---------- Nội dung (do CMS quản lý, chỉ đọc với người chơi) ----------

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'pronoun' | 'conjunction' | 'phrase';
export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'boss';

/** Từ thường, thuật ngữ chuyên ngành, hoặc từ viết tắt. */
export type VocabularyKind = 'word' | 'term' | 'abbreviation';

/** Trạng thái chia sẻ của một bộ từ do người chơi tạo. Bộ chính thức luôn là 'approved'. */
export type SetVisibility = 'private' | 'pending' | 'approved' | 'rejected';

/** Từ vựng. Một từ có thể thuộc nhiều màn/chặng. */
export interface Vocabulary extends StrapiEntity {
  /**
   * Dạng người chơi gõ: chỉ gồm a-z, lowercase, 2-16 ký tự (game chỉ nhận chữ cái).
   * "op-amp" lưu thành "opamp"; hiển thị lại bằng `displayForm`.
   */
  headword: string;
  displayForm: string; // dạng gốc để hiển thị: "op-amp", "ESD"
  kind: VocabularyKind;
  /** null = từ chính thức của hệ thống; có giá trị = từ riêng của người chơi đó. */
  owner?: Player | null;
  /** Khóa phi chuẩn hóa: 'official' hoặc documentId của owner. Unique cùng headword. */
  ownerKey: string;
  note?: string; // ghi chú thêm (diễn giải từ viết tắt...)
  meaningVi: string; // "môn bóng đá"
  phonetic: string; // "/ˈsɑːkər/"
  partOfSpeech: PartOfSpeech;
  cefr: CefrLevel;
  example?: string;
  exampleVi?: string;
  audio?: MediaFile | null; // thiếu thì client dùng speechSynthesis
  category?: string; // nhãn chủ đề phụ dạng chuỗi: "Thể thao", "Ăn uống"...
  /**
   * Thiết kế phẳng để import JSON hàng loạt: từ tự mang vị trí của nó thay vì quan hệ n-n.
   * Pool từ của một màn = các từ có (topicSlug, levelNumber) trùng với màn đó.
   */
  topicSlug: string;
  levelNumber: number;
  orderIndex: number; // thứ tự trong màn
  length: number; // = headword.length, lưu sẵn để lọc theo độ dài
}

/**
 * Chặng = một chủ đề lớn. Chặng chính thức do biên tập viên soạn; chặng 'custom' là bộ từ
 * do người chơi import từ CSV, các màn được sinh tự động từ danh sách từ.
 */
export interface Topic extends StrapiEntity {
  source: 'official' | 'custom';
  owner?: Player | null; // tác giả của bộ từ custom
  visibility: SetVisibility;
  ownerKey: string; // 'official' hoặc documentId của tác giả; lọc "bộ của tôi" không cần join
  domain?: string; // chuyên ngành: "Điện tử viễn thông", "May mặc"...
  /** Bộ đã được admin duyệt thì có bảng xếp hạng toàn hệ thống; bộ private chỉ có lịch sử cá nhân. */
  reviewedBy?: string | null;
  reviewedAt?: ISODateString | null;
  rejectReason?: string | null;
  slug: string;
  title: string; // "Đời Sống & Cơ Bản"
  description: string;
  themeColor: string;
  order: number;
  cefr: CefrLevel;
  levels?: Level[];
}

/** Màn chơi. Cấu hình độ khó nằm trong data nên chỉnh được không cần deploy lại client. */
export interface Level extends StrapiEntity {
  topic?: Topic;
  /** topic.documentId + ':' + levelNumber. Unique. */
  uniqueKey: string;
  levelNumber: number; // 1..N trong chặng
  title: string;
  subtitle: string;
  difficulty: DifficultyTier;
  isBoss: boolean;
  targetCount: number; // số từ phải hoàn thành (10-50), gồm 60% từ mới và 40% từ ôn
  reviewRatio: number; // 0.4: tỉ lệ từ ôn lấy từ bộ sưu tập của người chơi trong chủ đề
  /** Tỉ lệ chữ bị ẩn của một từ, mỗi từ bốc ngẫu nhiên trong khoảng này (luôn giữ >= 1 chữ hiện, >= 1 chữ ẩn). */
  missingRatioMin: number;
  missingRatioMax: number;
  /**
   * Nhịp thích ứng theo hồ sơ gõ của người chơi (T = thời gian xử lý một từ):
   * spawnInterval = clamp(T * spawnHeadroom, minSpawnMs, maxSpawnMs)
   * fallDuration  = clamp(T * maxConcurrent * fallSafety, minFallSec, maxFallSec)
   */
  spawnHeadroom: number; // k: 2.2 (màn đầu) -> 1.3 -> 1.25 (màn cuối)
  fallSafety: number; // s: 2.0 -> 1.3
  maxConcurrent: number; // 2 -> 8
  minSpawnMs: number; // 1800
  maxSpawnMs: number; // 8000
  minFallSec: number; // 8
  maxFallSec: number; // 40
  isGenerated: boolean; // true với màn sinh tự động từ bộ từ custom
}

/** Một lần người chơi import file CSV. Lưu lại để báo lỗi từng dòng và truy vết. */
export interface ImportJob extends StrapiEntity {
  player?: Player;
  topic?: Topic | null; // bộ từ được tạo ra khi import thành công
  fileName: string;
  status: 'processing' | 'succeeded' | 'failed';
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  errors: { row: number; field: string; message: string }[];
}

export interface MediaFile {
  url: string;
  mime: string;
}

// ---------- Người chơi ----------

export type DeviceKind = 'keyboard' | 'touch';
export type ThemeMode = 'light' | 'dark';

export interface TypingProfile {
  reactionMs: number; // từ lúc gạch thành mục tiêu đến phím đầu tiên (trung vị 20 từ gần nhất)
  msPerChar: number; // thời gian trung bình giữa hai phím đúng
  sampleCount: number;
  updatedAt: ISODateString | null;
}

export interface PlayerSettings {
  preferredDevice: DeviceKind | null;
  showVirtualKeyboard: boolean;
  soundEnabled: boolean;
  speechEnabled: boolean;
  theme: ThemeMode;
}

/**
 * Hồ sơ game, tách khỏi bảng user của users-permissions (liên kết 1-1) để việc mở rộng
 * hoặc đổi cách đăng nhập về sau không kéo theo đổi dữ liệu game. Tạo tự động khi đăng ký.
 */
export interface Player extends StrapiEntity {
  userId: number; // id số của user trong users-permissions
  displayName: string; // hiện trên bảng xếp hạng, với vai trò tác giả của kết quả
  avatarUrl?: string;
  settings: PlayerSettings;
  /** Hồ sơ gõ của chính người chơi, dùng để tính nhịp của màn (không so với người khác). */
  typingProfile: TypingProfile;
  totalStars: number;
  totalScore: number; // tổng bestScore của các màn
}

/** Tiến độ cao nhất của người chơi trên từng màn. */
export interface PlayerLevelProgress extends StrapiEntity {
  /** player.documentId + ':' + level.documentId. Unique, thay cho unique kép (player, level). */
  uniqueKey: string;
  playerKey: string; // documentId người chơi (phi chuẩn hóa để đánh index)
  player?: Player;
  level?: Level;
  stars: 0 | 1 | 2 | 3;
  bestAccuracy: number; // 0-100
  bestWpm: number;
  bestScore: number; // điểm cao nhất, dùng xếp hạng trong màn
  /** Số lần thất bại liên tiếp trên màn này; tăng hệ số nhịp, về 0 khi vượt màn. */
  failedAttempts: number;
  attempts: number;
  firstClearedAt: ISODateString | null;
}

/**
 * Nhật ký mỗi lần vượt màn (chỉ ghi khi thắng). Nguồn của bảng xếp hạng và lịch sử cá nhân.
 * Bảng này được phi chuẩn hóa có chủ ý (levelKey, topicKey) để truy vấn xếp hạng không cần join.
 */
export interface LevelClear extends StrapiEntity {
  playerKey: string; // documentId người chơi (phi chuẩn hóa để đánh index)
  player?: Player;
  topic?: Topic;
  level?: Level;
  match?: MatchResult;
  topicKey: string; // documentId của topic (phi chuẩn hóa)
  levelKey: string; // documentId của level (phi chuẩn hóa)
  score: number;
  stars: 0 | 1 | 2 | 3;
  accuracy: number;
  wpm: number;
  heartsRemaining: number;
  durationSeconds: number; // thời gian chơi để vượt màn
  /** Hệ số nhịp hỗ trợ đã áp dụng (1 = không hỗ trợ). Có thể loại lượt > 1 khỏi bảng chung (Q14). */
  paceFactor: number;
  playedAt: ISODateString; // lúc bắt đầu ván (giờ client)
  clearedAt: ISODateString; // lúc server ghi nhận
  /**
   * false với lịch sử đẩy lên từ localStorage (server không kiểm chứng được điểm)
   * hoặc bộ từ private: không được đưa vào xếp hạng chung.
   */
  rankEligible: boolean;
}

/** Bộ sưu tập từ đã học + trạng thái ôn tập. */
export interface PlayerWord extends StrapiEntity {
  /** player.documentId + ':' + vocabulary.documentId. Unique. */
  uniqueKey: string;
  playerKey: string;
  player?: Player;
  vocabulary?: Vocabulary;
  firstLearnedAt: ISODateString;
  timesCorrect: number;
  timesWrong: number;
  timesReviewed: number;
  mastered: boolean;
  /** Hộp Leitner 1-5 cho lịch ôn cách quãng. */
  box: 1 | 2 | 3 | 4 | 5;
  nextReviewAt: ISODateString | null;
}

/** Một trận chơi (lịch sử, bất biến sau khi ghi). */
export interface MatchResult extends StrapiEntity {
  playerKey: string;
  player?: Player;
  level?: Level;
  mode: MatchMode;
  isVictory: boolean;
  startedAt: ISODateString;
  durationSeconds: number;
  totalSpawned: number;
  totalDestroyed: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  accuracy: number;
  wpm: number;
  cpm: number;
  heartsRemaining: number;
  score: number; // do server tính lại từ words, không lấy từ client
  clientVersion: string;
  /** UUID do client sinh, server dùng để bỏ qua bản gửi trùng khi sync lại. */
  idempotencyKey: string;
  words?: MatchWordResult[];
}

export type MatchMode = 'solo' | 'versus' | 'daily';

/** Kết quả từng từ trong một trận; nguồn để cập nhật PlayerWord. */
export interface MatchWordResult extends StrapiEntity {
  match?: MatchResult;
  vocabulary?: Vocabulary;
  solved: boolean;
  mistakes: number;
  timeMs: number;
  score: number;
}

/**
 * Một dòng bảng xếp hạng của một màn. Mỗi lượt vượt màn là một dòng (level-clear là log),
 * xếp theo điểm giảm dần, hòa điểm thì ai vượt màn nhanh hơn (durationSeconds nhỏ hơn) đứng trước.
 */
export interface LevelLeaderboardEntry {
  rank: number;
  playerDocumentId: DocumentId;
  author: string; // displayName của người chơi
  score: number;
  durationSeconds: number; // thời gian pass màn
  clearedAt: ISODateString; // thời điểm ghi nhận kết quả
}

/** `scope: 'personal'` khi bộ từ private hoặc người chơi chưa đăng nhập (chỉ có lịch sử của chính mình). */
export interface LevelLeaderboard {
  levelDocumentId: DocumentId;
  scope: 'global' | 'personal';
  top: LevelLeaderboardEntry[]; // tối đa 10 lượt tốt nhất
  /**
   * Chỉ có khi lượt tốt nhất của người xem nằm ngoài top 10: dòng cuối bảng cho biết điểm,
   * hạng trong bảng tổng và đã vượt bao nhiêu % tổng số lượt chơi (của mọi người, kể cả của họ).
   */
  myRow: LevelLeaderboardMyRow | null;
}

export interface LevelLeaderboardMyRow {
  score: number;
  rank: number; // 1 + số lượt có điểm cao hơn
  totalPlays: number;
  surpassedPercent: number; // lượt có điểm thấp hơn / totalPlays * 100
}

// ---------- Payload client gửi lên ----------

export interface SubmitMatchPayload {
  idempotencyKey: string;
  levelDocumentId: DocumentId;
  mode: MatchMode;
  isVictory: boolean;
  startedAt: ISODateString;
  durationSeconds: number;
  stats: {
    totalSpawned: number;
    totalDestroyed: number;
    totalKeystrokes: number;
    correctKeystrokes: number;
    heartsRemaining: number;
  };
  words: {
    vocabularyDocumentId: DocumentId;
    solved: boolean;
    mistakes: number;
    timeMs: number;
    /** Số giây gạch đã rơi tới lúc vỡ, đầu vào để server tính điểm tốc độ. */
    elapsedSec: number;
    reactionMs: number; // cập nhật hồ sơ gõ
    isReview: boolean; // từ lấy từ bộ sưu tập (40%) hay từ mới (60%)
  }[];
  clientVersion: string;
}

/** Server tính accuracy/wpm/stars lại từ `stats`, không tin giá trị client tự báo. */
export interface SubmitMatchResponse {
  match: MatchResult;
  progress: PlayerLevelProgress;
  unlockedLevelDocumentId: DocumentId | null;
  leaderboard: LevelLeaderboard;
  newWords: PlayerWord[];
}
