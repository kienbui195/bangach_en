/**
 * Xuất dữ liệu chặng/màn/từ vựng hiện tại (src/data/stages.ts) sang JSON cho CMS.
 * Chạy: npx tsx scripts/export-stages.ts ../worddefender-cms/seed/stages.json
 * Mỗi từ thuộc màn đầu tiên nó xuất hiện (màn "học từ mới"); các màn sau chỉ ôn lại từ đó.
 */
import { writeFileSync } from 'node:fs';
import { GAME_STAGES } from '../src/data/stages';

const SLUGS: Record<number, string> = { 1: 'doi-song-co-ban', 2: 'thien-nhien-hoang-da', 3: 'vu-tru-phieu-luu' };
const stripPrefix = (t: string) => t.replace(/^Chặng \d+:\s*/, '');

const seen = new Set<string>();
const topics = GAME_STAGES.map((s) => ({
  slug: SLUGS[s.id],
  title: stripPrefix(s.title),
  description: s.description,
  themeColor: s.themeColor,
  order: s.id,
  levels: s.levels.map((l) => ({
    levelNumber: l.levelNumber,
    title: l.title,
    subtitle: l.subtitle,
    difficulty: l.difficulty,
    isBoss: l.difficulty === 'boss',
    targetCount: l.targetCount,
    minMissing: l.minMissing,
    maxMissing: l.maxMissing,
    fallSpeed: l.fallSpeed,
    spawnInterval: l.spawnInterval,
    maxConcurrent: l.maxConcurrent,
  })),
}));

const vocabulary: Record<string, unknown>[] = [];
for (const s of GAME_STAGES) {
  for (const l of s.levels) {
    let orderIndex = 0;
    for (const w of l.wordPool) {
      const headword = w.word.toLowerCase();
      if (seen.has(headword)) continue;
      seen.add(headword);
      vocabulary.push({
        headword,
        displayForm: w.word,
        kind: 'word',
        ownerKey: 'official',
        topicSlug: SLUGS[s.id],
        levelNumber: l.levelNumber,
        orderIndex: ++orderIndex,
        category: w.category,
        meaningVi: w.meaning,
        phonetic: w.phonetic,
        partOfSpeech: w.partOfSpeech ?? 'noun',
        example: w.example,
        length: headword.length,
      });
    }
  }
}

const out = process.argv[2];
if (!out) throw new Error('Thiếu đường dẫn file JSON đầu ra');
writeFileSync(out, JSON.stringify({ topics, vocabulary }, null, 2) + '\n');
console.log(`Đã xuất ${topics.length} chặng, ${topics.reduce((n, t) => n + t.levels.length, 0)} màn, ${vocabulary.length} từ -> ${out}`);
