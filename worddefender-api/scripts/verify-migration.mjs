#!/usr/bin/env node
// Đối chiếu DB đích với report.json do migrate-strapi.mjs sinh ra: số lượng + tổng kiểm.
// Dữ liệu đích đọc từ mysql -B -N qua stdin: truyền ba file --vocab --levels --rules (xem verify-migration.sh).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const report = JSON.parse(readFileSync(args.report, 'utf8'));
const unesc = (s) => (s === 'NULL' ? '' : s.replace(/\\(t|n|\\)/g, (_, c) => (c === 't' ? '\t' : c === 'n' ? '\n' : '\\')));
const rows = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t').map(unesc));
const sum = (lines) => createHash('sha256').update(lines.sort().join('\n')).digest('hex');

const vocab = rows(args.vocab);
const levels = rows(args.levels);
const rules = unesc(readFileSync(args.rules, 'utf8').replace(/\n$/, ''));
const got = {
  vocabularies: sum(vocab.map((r) => r.join('|'))),
  levels: sum(levels.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], Number(r[6] || 0), r[7], r[8]].join('|'))),
  rules: createHash('sha256').update(JSON.stringify(JSON.parse(rules))).digest('hex'),
};
const checks = [
  ['số từ', vocab.length, report.willMigrate.vocabularies],
  ['số màn', levels.length, report.willMigrate.levels],
  ['tổng kiểm từ', got.vocabularies, report.checksums.vocabularies],
  ['tổng kiểm màn', got.levels, report.checksums.levels],
  ['tổng kiểm luật', got.rules, report.checksums.rules],
];
let bad = 0;
for (const [name, a, b] of checks) {
  const ok = a === b;
  if (!ok) bad++;
  console.log(`${ok ? 'KHỚP ' : 'LỆCH '} ${name}: đích=${a} nguồn=${b}`);
}
process.exit(bad ? 1 : 0);
