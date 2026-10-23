/**
 * Sinh lại hằng số `src/data/stages.ts` từ nội dung đang có trong CMS.
 * Chiều ngược của `export-stages.ts` (stages.ts -> seed JSON cho CMS).
 *
 *   npx tsx scripts/cms-to-stages.ts                      # đọc http://127.0.0.1:1341
 *   npx tsx scripts/cms-to-stages.ts http://127.0.0.1:45240
 *
 * Hằng số này là dữ liệu dự phòng khi chưa cấu hình VITE_CMS_URL hoặc CMS lỗi, nên cách gom
 * pool phải khớp đúng `src/config/remoteContent.ts`: pool của màn = từ mới của màn đó cộng
 * từ mới của màn liền trước; màn boss lấy cả chặng.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:1341').replace(/\/$/, '');
const OUT = process.env.OUT ?? join(import.meta.dirname, '..', 'src', 'data', 'stages.ts');
const PAGE_SIZE = 100;

interface CmsLevel {
  levelNumber: number;
  title?: string;
  subtitle?: string;
  difficulty: string;
  targetCount: number;
  minMissing: number;
  maxMissing: number;
  fallSpeed?: number;
  spawnInterval?: number;
  maxConcurrent?: number;
}
interface CmsTopic {
  slug: string;
  title: string;
  description?: string;
  themeColor?: string;
  order: number;
  levels?: CmsLevel[];
}
interface CmsWord {
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
}

const getJson = async (path: string) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const getAll = async <T>(path: string): Promise<T[]> => {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const json = await getJson(`${path}${sep}pagination[page]=${page}&pagination[pageSize]=${PAGE_SIZE}`);
    out.push(...(json.data as T[]));
    if (page >= (json.meta?.pagination?.pageCount ?? 1)) return out;
  }
};

const q = (s: string | undefined) => JSON.stringify(s ?? '');

const main = async () => {
  const topics = await getAll<CmsTopic>('/api/topics?populate[levels][sort]=levelNumber&sort=order');
  const words = await getAll<CmsWord>(
    '/api/vocabularies?filters[ownerKey][$eq]=official&sort[0]=topicSlug&sort[1]=levelNumber&sort[2]=orderIndex'
  );
  if (!topics.length || !words.length) throw new Error('CMS chưa có chặng hoặc từ vựng');

  // Khóa trong hằng số WORDS: headword, đã là duy nhất trong bộ official.
  const seen = new Set<string>();
  const wordLines: string[] = [];
  for (const w of words) {
    if (seen.has(w.headword)) continue;
    seen.add(w.headword);
    wordLines.push(
      `  ${JSON.stringify(w.headword)}: { id: ${q(w.headword)}, word: ${q(w.displayForm || w.headword)}, ` +
        `meaning: ${q(w.meaningVi)}, phonetic: ${q(w.phonetic)}, partOfSpeech: ${q(w.partOfSpeech)}, ` +
        `category: ${q(w.category)}, example: ${q(w.example)} },`
    );
  }

  const stageLines: string[] = [];
  for (const t of [...topics].sort((a, b) => a.order - b.order)) {
    const mine = words.filter((w) => w.topicSlug === t.slug);
    const levels = [...(t.levels ?? [])].sort((a, b) => a.levelNumber - b.levelNumber);
    const levelLines = levels.map((l) => {
      const pool =
        l.difficulty === 'boss'
          ? mine
          : mine.filter((w) => w.levelNumber === l.levelNumber || w.levelNumber === l.levelNumber - 1);
      const ids = pool.map((w) => JSON.stringify(w.headword)).join(', ');
      return (
        `      {\n` +
        `        id: ${t.order * 100 + l.levelNumber}, stageId: ${t.order}, levelNumber: ${l.levelNumber},\n` +
        `        title: ${q(l.title ?? `Màn ${l.levelNumber}`)}, subtitle: ${q(l.subtitle)},\n` +
        `        targetCount: ${l.targetCount}, difficulty: ${q(l.difficulty)} as DifficultyLevel,\n` +
        `        minMissing: ${l.minMissing}, maxMissing: ${l.maxMissing},\n` +
        `        fallSpeed: ${l.fallSpeed ?? 5}, spawnInterval: ${l.spawnInterval ?? 5000}, maxConcurrent: ${l.maxConcurrent ?? 3},\n` +
        `        wordPool: pool(${ids}),\n` +
        `      },`
      );
    });
    stageLines.push(
      `  {\n` +
        `    id: ${t.order},\n` +
        `    title: ${q(`Chặng ${t.order}: ${t.title}`)},\n` +
        `    description: ${q(t.description)},\n` +
        `    themeColor: ${q(t.themeColor ?? '#3b82f6')},\n` +
        `    levels: [\n${levelLines.join('\n')}\n    ],\n` +
        `  },`
    );
  }

  const file = `import { DifficultyLevel, StageConfig, WordItem } from '../types/game';

/**
 * SINH TỰ ĐỘNG bằng \`npx tsx scripts/cms-to-stages.ts\` — đừng sửa tay.
 * Đây là bản chụp nội dung CMS, dùng khi chưa cấu hình VITE_CMS_URL hoặc CMS lỗi
 * (xem src/config/remoteContent.ts). Muốn đổi nội dung thì sửa trong CMS rồi chạy lại script.
 *
 * ${topics.length} chặng · ${topics.reduce((n, t) => n + (t.levels?.length ?? 0), 0)} màn · ${seen.size} từ.
 */
const WORDS: Record<string, WordItem> = {
${wordLines.join('\n')}
};

/** Pool của một màn: tra theo headword để không nhân bản dữ liệu từ. */
const pool = (...ids: string[]): WordItem[] => ids.map((id) => WORDS[id]);

export const GAME_STAGES: StageConfig[] = [
${stageLines.join('\n')}
];
`;

  writeFileSync(OUT, file);
  console.log(
    `Đã sinh ${OUT}: ${topics.length} chặng, ` +
      `${topics.reduce((n, t) => n + (t.levels?.length ?? 0), 0)} màn, ${seen.size} từ`
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
