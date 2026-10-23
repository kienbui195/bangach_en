import { GAME_RULES, GameRules } from './gameRules';
import { GAME_STAGES } from '../data/stages';
import { DifficultyLevel, LevelConfig, StageConfig, WordItem } from '../types/game';

/**
 * Nội dung và luật chơi từ CMS (Strapi). Chưa cấu hình VITE_CMS_URL hoặc CMS lỗi thì game dùng
 * dữ liệu có sẵn trong code (data/stages.ts, config/gameRules.ts). Bản tải gần nhất lưu ở localStorage:
 * có cache thì áp dụng ngay và làm mới nền cho lần mở sau, chưa có cache thì chờ tối đa FETCH_TIMEOUT_MS.
 */
const CMS_URL = ((import.meta.env.VITE_CMS_URL as string | undefined) ?? '').replace(/\/$/, '');
const CACHE_KEY = 'wd_remote_content';
const FETCH_TIMEOUT_MS = 4000;
const PAGE_SIZE = 100;

interface CmsTopic {
  slug: string;
  title: string;
  description?: string;
  themeColor?: string;
  order: number;
  levels?: CmsLevel[];
}
interface CmsLevel {
  levelNumber: number;
  title?: string;
  subtitle?: string;
  difficulty: DifficultyLevel;
  targetCount: number;
  minMissing: number;
  maxMissing: number;
  fallSpeed?: number;
  spawnInterval?: number;
  maxConcurrent?: number;
}
interface CmsVocabulary {
  headword: string;
  displayForm?: string;
  topicSlug: string;
  levelNumber: number;
  orderIndex?: number;
  category?: string;
  meaningVi: string;
  phonetic?: string;
  partOfSpeech?: string;
  example?: string;
  audio?: { url?: string } | null;
}
interface RemoteContent {
  rules: Partial<GameRules> | null;
  stages: StageConfig[];
}

const getJson = async (path: string) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${CMS_URL}${path}`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const getAll = async <T,>(path: string): Promise<T[]> => {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const json = await getJson(`${path}${path.includes('?') ? '&' : '?'}pagination[page]=${page}&pagination[pageSize]=${PAGE_SIZE}`);
    out.push(...(json.data as T[]));
    if (page >= (json.meta?.pagination?.pageCount ?? 1)) return out;
  }
};

const toWord = (v: CmsVocabulary): WordItem => ({
  id: v.headword,
  word: v.displayForm || v.headword,
  meaning: v.meaningVi,
  phonetic: v.phonetic ?? '',
  partOfSpeech: v.partOfSpeech,
  example: v.example,
  category: v.category ?? '',
  // Strapi trả đường dẫn tương đối khi lưu file trên chính máy chủ CMS
  audioUrl: v.audio?.url ? (v.audio.url.startsWith('http') ? v.audio.url : `${CMS_URL}${v.audio.url}`) : undefined,
});

/**
 * Pool từ của màn: từ mới của màn đó cộng từ mới của màn liền trước (để có từ ôn); màn boss lấy cả chặng.
 * Từ trong CMS chỉ thuộc một màn (màn đầu tiên nó xuất hiện).
 */
export const buildStages = (topics: CmsTopic[], vocabulary: CmsVocabulary[]): StageConfig[] =>
  [...topics]
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const words = vocabulary
        .filter((v) => v.topicSlug === t.slug)
        .sort((a, b) => a.levelNumber - b.levelNumber || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      const levels: LevelConfig[] = [...(t.levels ?? [])]
        .sort((a, b) => a.levelNumber - b.levelNumber)
        .map((l) => ({
          id: t.order * 100 + l.levelNumber,
          stageId: t.order,
          levelNumber: l.levelNumber,
          title: l.title ?? `Màn ${l.levelNumber}`,
          subtitle: l.subtitle ?? '',
          targetCount: l.targetCount,
          difficulty: l.difficulty,
          minMissing: l.minMissing,
          maxMissing: l.maxMissing,
          fallSpeed: l.fallSpeed ?? 5,
          spawnInterval: l.spawnInterval ?? 5000,
          maxConcurrent: l.maxConcurrent ?? 3,
          wordPool: words
            .filter((w) => l.difficulty === 'boss' || w.levelNumber === l.levelNumber || w.levelNumber === l.levelNumber - 1)
            .map(toWord),
        }));
      return {
        id: t.order,
        title: `Chặng ${t.order}: ${t.title}`,
        description: t.description ?? '',
        themeColor: t.themeColor ?? '#3b82f6',
        levels,
      };
    })
    .filter((s) => s.levels.length > 0 && s.levels.every((l) => l.wordPool.length > 0));

/** Gộp luật từ CMS vào GAME_RULES tại chỗ: chỉ nhận khóa đã có, cùng kiểu; bỏ qua desc và khóa lạ. */
const mergeRules = (target: Record<string, unknown>, src: Record<string, unknown>) => {
  for (const key of Object.keys(target)) {
    const t = target[key];
    const s = src[key];
    if (s === undefined || s === null) continue;
    if (t && typeof t === 'object' && !Array.isArray(t)) {
      if (typeof s === 'object' && !Array.isArray(s)) mergeRules(t as Record<string, unknown>, s as Record<string, unknown>);
    } else if (Array.isArray(t)) {
      if (Array.isArray(s) && s.length === t.length && s.every((x) => typeof x === 'number')) target[key] = s;
    } else if (typeof t === typeof s) {
      target[key] = s;
    }
  }
};

const apply = (content: RemoteContent) => {
  if (content.rules) mergeRules(GAME_RULES as unknown as Record<string, unknown>, content.rules as Record<string, unknown>);
  if (content.stages.length > 0) GAME_STAGES.splice(0, GAME_STAGES.length, ...content.stages);
};

const readCache = (): RemoteContent | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return raw && Array.isArray(raw.stages) ? raw : null;
  } catch {
    return null;
  }
};

const fetchRemote = async (): Promise<RemoteContent> => {
  const [config, topics, vocabulary] = await Promise.all([
    getJson('/api/game-config'),
    getAll<CmsTopic>('/api/topics?populate[levels][sort]=levelNumber&sort=order'),
    getAll<CmsVocabulary>('/api/vocabularies?filters[ownerKey][$eq]=official&populate=audio&sort[0]=levelNumber&sort[1]=orderIndex'),
  ]);
  const content: RemoteContent = { rules: config?.data?.rules ?? null, stages: buildStages(topics, vocabulary) };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(content));
  } catch {
    /* không có cache cũng không sao */
  }
  return content;
};

/** Gọi trước khi dựng giao diện. Không bao giờ ném lỗi: thất bại thì giữ dữ liệu có sẵn trong code. */
export const loadRemoteContent = async (): Promise<void> => {
  if (!CMS_URL) return;
  const cached = readCache();
  if (cached) {
    apply(cached);
    fetchRemote().catch((e) => console.warn('Làm mới nội dung CMS thất bại', e));
    return;
  }
  try {
    apply(await fetchRemote());
  } catch (e) {
    console.warn('Không tải được nội dung CMS, dùng dữ liệu có sẵn', e);
  }
};
