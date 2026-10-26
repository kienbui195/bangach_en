import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** US-10: script chuyển dữ liệu Strapi → MySQL (migrate-strapi.mjs) chạy với một Strapi giả, và script đối chiếu (verify-migration.mjs). */
const execFileAsync = promisify(execFile);

describe('chuyển dữ liệu từ Strapi (US-10)', () => {
  let server: Server;
  let base = '';
  const requests: string[] = [];
  let vocab: Record<string, unknown>[] = [];
  const out = mkdtempSync(join(tmpdir(), 'wd-migrate-'));

  const topic = { id: 1, slug: 'van-phong', title: 'Văn phòng', source: 'official', visibility: 'approved', ownerKey: 'official', order: 1, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', levels: [{ id: 1, uniqueKey: 'van-phong:1', levelNumber: 1, difficulty: 'easy', targetCount: 10, minMissing: 2, maxMissing: 3, fallSpeed: 4.5, spawnInterval: 5000, maxConcurrent: 2, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }] };
  const word = (headword: string, extra: Record<string, unknown> = {}) => ({ id: Math.floor(Math.random() * 1e6), headword, displayForm: headword, kind: 'word', ownerKey: 'official', topicSlug: 'van-phong', levelNumber: 1, orderIndex: 1, meaningVi: `nghĩa của ${headword}`, partOfSpeech: 'noun', cefr: 'A1', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', audio: null, ...extra });

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      const url = new URL(req.url ?? '/', 'http://x');
      const page = (items: unknown[]) => ({ data: items, meta: { pagination: { page: 1, pageSize: 100, pageCount: 1, total: items.length } } });
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/topics') res.end(JSON.stringify(page([topic])));
      else if (url.pathname === '/api/vocabularies') res.end(JSON.stringify(page(vocab)));
      else if (url.pathname === '/api/game-config') res.end(JSON.stringify({ data: { rules: { hearts: { max: 3 } }, updatedAt: '2026-10-01T00:00:00.000Z' } }));
      else res.writeHead(404).end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    rmSync(out, { recursive: true, force: true });
  });
  beforeEach(() => {
    requests.length = 0;
    vocab = [word('email'), word('task')];
  });

  const run = async (dir: string) => {
    mkdirSync(dir, { recursive: true });
    await execFileAsync('node', ['scripts/migrate-strapi.mjs', '--strapi', base, '--out', dir], { cwd: process.cwd() });
    return { sql: readFileSync(join(dir, 'migrate.sql'), 'utf8'), report: JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) };
  };

  it('AC-10.1 (một phần): số chặng, màn, từ, luật ở báo cáo bằng nguồn; SQL chạy trong một giao dịch', async () => {
    const { sql, report } = await run(join(out, 'a'));
    expect(report.source).toMatchObject({ topics: 1, levels: 1, vocabularies: 2, withAudio: 0 });
    expect(report.willMigrate).toEqual({ topics: 1, levels: 1, vocabularies: 2 });
    expect(report.rejected).toEqual([]);
    expect(sql.match(/INSERT INTO vocabularies/g)).toHaveLength(2);
    expect(sql.indexOf('START TRANSACTION')).toBeLessThan(sql.indexOf('INSERT INTO topics'));
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true); // lỗi giữa chừng thì MySQL không COMMIT: không để lại dữ liệu nửa chừng (AC-10.8)
  });

  it('AC-10.5 (BR37): từ sai luật mới (op-amp, quá 16 ký tự, trùng) được liệt kê kèm lý do, không bị bỏ lặng lẽ và không vào SQL', async () => {
    vocab = [word('email'), word('op-amp'), word('abcdefghijklmnopq'), word('email', { id: 777 })];
    const { sql, report } = await run(join(out, 'b'));
    expect(report.rejected.map((r: { headword: string }) => r.headword)).toEqual(['op-amp', 'abcdefghijklmnopq', 'email']);
    expect(report.rejected[0].problems[0]).toContain('a-z');
    expect(report.rejected[2].problems[0]).toContain('trùng');
    expect(report.willMigrate.vocabularies).toBe(1);
    expect(sql).not.toContain("'op-amp'");
  });

  it('AC-10.6: từ có file âm thanh được báo trong danh sách lỗi, không bị bỏ lặng lẽ', async () => {
    vocab = [word('email', { audio: { url: '/uploads/x.mp3' } })];
    expect((await run(join(out, 'c'))).report.rejected[0].problems.join(' ')).toContain('âm thanh');
  });

  it('AC-10.9 (BR35): script chỉ đọc Strapi, không có yêu cầu ghi, sửa, xóa nào', async () => {
    await run(join(out, 'd'));
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.startsWith('GET '))).toBe(true);
  });

  it('AC-10.7 (BR37): đối chiếu báo LỆCH đúng phần sai và thoát mã lỗi khi dữ liệu đích khác nguồn; khớp thì thoát 0', async () => {
    const dir = join(out, 'e');
    const { report } = await run(dir);
    // dựng dữ liệu "đích" từ đúng nguồn rồi sửa tay một nghĩa
    const rows = vocab.map((v) => [v.ownerKey, v.headword, v.displayForm ?? '', v.kind, v.topicSlug ?? '', v.levelNumber ?? '', v.orderIndex ?? '', v.category ?? '', v.meaningVi, v.phonetic ?? '', v.partOfSpeech ?? '', v.example ?? '', v.cefr ?? ''].join('\t'));
    const lvl = topic.levels.map((l) => [l.uniqueKey, l.levelNumber, l.difficulty, l.targetCount, l.minMissing, l.maxMissing, l.fallSpeed, l.spawnInterval, l.maxConcurrent].join('\t'));
    const files = { v: join(dir, 'v.tsv'), l: join(dir, 'l.tsv'), r: join(dir, 'r.json') };
    writeFileSync(files.v, rows.join('\n') + '\n');
    writeFileSync(files.l, lvl.join('\n') + '\n');
    writeFileSync(files.r, JSON.stringify({ hearts: { max: 3 } }) + '\n');
    const verify = () => spawnSync('node', ['scripts/verify-migration.mjs', '--report', join(dir, 'report.json'), '--vocab', files.v, '--levels', files.l, '--rules', files.r], { encoding: 'utf8' });
    const ok = verify();
    expect(ok.status).toBe(0);
    expect(ok.stdout).not.toContain('LỆCH');
    writeFileSync(files.v, rows.join('\n').replace('nghĩa của email', 'sửa tay') + '\n');
    const bad = verify();
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/LỆCH .*tổng kiểm từ/);
    expect(bad.stdout).toMatch(/KHỚP .*tổng kiểm màn/);
    expect(report.checksums.vocabularies).toHaveLength(64);
  });
});
