#!/usr/bin/env node
// Chuyển dữ liệu Strapi (đọc qua API công khai, chỉ GET) sang SQL cho MySQL của worddefender-api (US-10).
// Không ghi gì vào Strapi (BR35). Dòng sai luật mới được liệt kê trong báo cáo, không bỏ lặng lẽ.
//
//   node scripts/migrate-strapi.mjs --strapi http://127.0.0.1:45240 --out <thư mục>
//
// Ra: <out>/strapi-snapshot.json, <out>/migrate.sql (một giao dịch), <out>/report.json
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const BASE = (args.strapi ?? 'http://127.0.0.1:45240').replace(/\/$/, '');
const OUT = args.out;
if (!OUT) throw new Error('Thiếu --out <thư mục>');
mkdirSync(OUT, { recursive: true });

const HEADWORD = /^[a-z]{2,16}$/;

async function getAll(path, extra = '') {
  const items = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${BASE}/api/${path}?pagination[page]=${page}&pagination[pageSize]=100${extra}`);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    const json = await res.json();
    items.push(...json.data);
    if (page >= json.meta.pagination.pageCount) return { items, total: json.meta.pagination.total };
  }
}

const topicsRes = await getAll('topics', '&populate=levels');
const vocabRes = await getAll('vocabularies', '&populate=audio');
const cfgRes = await fetch(`${BASE}/api/game-config`);
if (!cfgRes.ok) throw new Error(`game-config: HTTP ${cfgRes.status}`);
const cfg = (await cfgRes.json()).data;

writeFileSync(join(OUT, 'strapi-snapshot.json'), JSON.stringify({ takenAt: new Date().toISOString(), topics: topicsRes.items, vocabularies: vocabRes.items, gameConfig: cfg }, null, 2));

// ---- chuyển và kiểm
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
const dt = (iso) => (iso ? q(new Date(iso).toISOString().replace('T', ' ').replace('Z', '')) : 'NULL');
const rejected = [];
const sql = ['SET NAMES utf8mb4;', 'START TRANSACTION;'];
const levelRows = [];
const topicRows = [];

for (const t of topicsRes.items) {
  topicRows.push(t);
  for (const l of t.levels ?? []) levelRows.push({ ...l, topicSlug: t.slug });
}

// kiểm tra tham chiếu
const slugs = new Set(topicRows.map((t) => t.slug));
const vocabOk = [];
const seen = new Set();
for (const v of vocabRes.items) {
  const problems = [];
  if (!HEADWORD.test(v.headword)) problems.push(`headword "${v.headword}" không phải a-z 2–16 ký tự`);
  const key = `${v.ownerKey}|${v.headword}`;
  if (seen.has(key)) problems.push(`trùng (ownerKey, headword) = ${key}`);
  if (v.topicSlug && !slugs.has(v.topicSlug)) problems.push(`topicSlug "${v.topicSlug}" không có chặng`);
  if (v.audio) problems.push('có file âm thanh (script chưa tải file)');
  if (problems.length) rejected.push({ id: v.id, headword: v.headword, problems });
  else {
    seen.add(key);
    vocabOk.push(v);
  }
}

for (const t of topicRows) {
  sql.push(
    `INSERT INTO topics (slug,title,source,visibility,owner_key,domain,\`order\`,cefr,description,theme_color,reviewed_by,reviewed_at,created_at,updated_at) VALUES (${[
      q(t.slug), q(t.title), q(t.source), q(t.visibility), q(t.ownerKey), q(t.domain), q(t.order), q(t.cefr), q(t.description), q(t.themeColor), q(t.reviewedBy), dt(t.reviewedAt), dt(t.createdAt), dt(t.updatedAt),
    ].join(',')});`,
  );
}
for (const l of levelRows) {
  sql.push(
    `INSERT INTO levels (topic_id,unique_key,level_number,title,subtitle,difficulty,is_boss,target_count,min_missing,max_missing,fall_speed,spawn_interval,max_concurrent,is_generated,created_at,updated_at) VALUES ((SELECT id FROM topics WHERE slug=${q(l.topicSlug)}),${[
      q(l.uniqueKey), q(l.levelNumber), q(l.title), q(l.subtitle), q(l.difficulty), q(!!l.isBoss), q(l.targetCount), q(l.minMissing), q(l.maxMissing), q(l.fallSpeed), q(l.spawnInterval), q(l.maxConcurrent), q(!!l.isGenerated), dt(l.createdAt), dt(l.updatedAt),
    ].join(',')});`,
  );
}
for (const v of vocabOk) {
  sql.push(
    `INSERT INTO vocabularies (owner_key,headword,display_form,kind,topic_slug,level_number,order_index,category,meaning_vi,phonetic,part_of_speech,example,cefr,length,audio_path,created_at,updated_at) VALUES (${[
      q(v.ownerKey), q(v.headword), q(v.displayForm), q(v.kind), q(v.topicSlug), q(v.levelNumber), q(v.orderIndex), q(v.category), q(v.meaningVi), q(v.phonetic), q(v.partOfSpeech), q(v.example), q(v.cefr), q(v.headword.length), 'NULL', dt(v.createdAt), dt(v.updatedAt),
    ].join(',')});`,
  );
}
// luật chơi: đúng một dòng
sql.push(
  'DELETE FROM game_config;',
  `INSERT INTO game_config (id,rules,version,updated_at) VALUES (1,${q(JSON.stringify(cfg.rules))},1,${dt(cfg.updatedAt)});`,
);
sql.push('COMMIT;');
writeFileSync(join(OUT, 'migrate.sql'), sql.join('\n') + '\n');

// tổng kiểm nguồn để đối chiếu với DB đích (cùng công thức trong verify.sql)
const sum = (rows, f) => createHash('sha256').update(rows.map(f).sort().join('\n')).digest('hex');
const report = {
  source: { topics: topicRows.length, levels: levelRows.length, vocabularies: vocabRes.total, vocabulariesFetched: vocabRes.items.length, withAudio: vocabRes.items.filter((v) => v.audio).length },
  willMigrate: { topics: topicRows.length, levels: levelRows.length, vocabularies: vocabOk.length },
  rejected,
  checksums: {
    vocabularies: sum(vocabOk, (v) => [v.ownerKey, v.headword, v.displayForm ?? '', v.kind, v.topicSlug ?? '', v.levelNumber ?? '', v.orderIndex ?? '', v.category ?? '', v.meaningVi, v.phonetic ?? '', v.partOfSpeech ?? '', v.example ?? '', v.cefr ?? ''].join('|')),
    levels: sum(levelRows, (l) => [l.uniqueKey, l.levelNumber, l.difficulty, l.targetCount, l.minMissing ?? '', l.maxMissing ?? '', Number(l.fallSpeed ?? 0), l.spawnInterval ?? '', l.maxConcurrent ?? ''].join('|')),
    rules: createHash('sha256').update(JSON.stringify(cfg.rules)).digest('hex'),
  },
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ source: report.source, willMigrate: report.willMigrate, rejected: rejected.length }, null, 2));
