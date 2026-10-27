import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { ADMIN_API_TOKEN } from '../src/admin/admin-token.guard.js';
import { BackupsService } from '../src/admin/backups/backups.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TOKEN = 'x'.repeat(40);

/** Sao lưu và khôi phục dữ liệu game từ dashboard. Chạy trên MySQL thật. */
describe('admin-api: sao lưu và khôi phục', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const dir = mkdtempSync(join(tmpdir(), 'wd-backups-'));

  const api = (method: 'get' | 'post' | 'delete', path: string) => request(app.getHttpServer())[method](`/admin-api${path}`).set('Authorization', `Bearer ${TOKEN}`);
  const files = () => readdirSync(dir).filter((n) => n.endsWith('.json.gz'));

  const clean = async () => {
    await prisma.wordReport.deleteMany();
    await prisma.level.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.vocabulary.deleteMany();
    await prisma.gameConfig.deleteMany();
  };

  const seed = async () => {
    const topic = await prisma.topic.create({
      data: {
        slug: 'van-phong',
        title: 'Văn phòng',
        source: 'official',
        visibility: 'approved',
        ownerKey: 'official',
        order: 1,
        reviewedAt: new Date('2026-10-01T03:04:05.678Z'),
        levels: { create: [{ uniqueKey: 'van-phong:1', levelNumber: 1, difficulty: 'easy', targetCount: 10, fallSpeed: 4.5, spawnInterval: 5000 }] },
      },
    });
    await prisma.vocabulary.createMany({
      data: [
        { ownerKey: 'official', headword: 'email', kind: 'word', topicSlug: 'van-phong', levelNumber: 1, meaningVi: 'thư điện tử', length: 5 },
        { ownerKey: 'official', headword: 'task', kind: 'word', topicSlug: 'van-phong', levelNumber: 1, meaningVi: 'nhiệm vụ', length: 4 },
      ],
    });
    await prisma.wordReport.create({ data: { headword: 'email', field: 'meaningVi', suggestedValue: 'thư', reviewStatus: 'approved' } });
    await prisma.gameConfig.create({ data: { rules: { hearts: { max: 3 } }, version: 1 } });
    return topic;
  };

  const state = async () => ({
    topics: await prisma.topic.findMany({ orderBy: { id: 'asc' } }),
    levels: (await prisma.level.findMany({ orderBy: { id: 'asc' } })).map((l) => ({ ...l, fallSpeed: Number(l.fallSpeed) })),
    vocab: await prisma.vocabulary.findMany({ orderBy: { id: 'asc' } }),
    reports: await prisma.wordReport.findMany({ orderBy: { id: 'asc' } }),
    cfg: await prisma.gameConfig.findMany(),
  });

  beforeAll(async () => {
    process.env.BACKUP_DIR = dir;
    process.env.BACKUP_AUTO = 'off';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ADMIN_API_TOKEN).useValue(TOKEN).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    await clean();
  });

  afterAll(async () => {
    await clean();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    delete process.env.BACKUP_AUTO;
  });

  it('meta khai báo tài nguyên backups chỉ đọc, có nút Sao lưu ngay và Khôi phục (có hỏi xác nhận)', async () => {
    const meta = (await api('get', '/meta').expect(200)).body.resources.find((r: { key: string }) => r.key === 'backups');
    expect(meta).toMatchObject({ primaryKey: 'name', allowCreate: false, allowEdit: false, allowExport: false, allowDelete: true });
    expect(meta.actions.map((a: { name: string; target?: string }) => [a.name, a.target ?? 'record'])).toEqual([['backup-now', 'resource'], ['restore', 'record']]);
    expect(meta.actions.find((a: { name: string }) => a.name === 'restore').confirm).toContain('TOÀN BỘ');
  });

  it('cần token như mọi đường quản trị', async () => {
    await request(app.getHttpServer()).get('/admin-api/backups').expect(401);
    await request(app.getHttpServer()).post('/admin-api/backups/actions/backup-now').expect(401);
    await request(app.getHttpServer()).post('/admin-api/backups/wd-20260101-000000-manual.json.gz/actions/restore').expect(401);
  });

  it('Sao lưu ngay tạo file và danh sách hiện đủ số lượng từng bảng', async () => {
    await seed();
    const made = (await api('post', '/backups/actions/backup-now').expect(200)).body;
    expect(made).toMatchObject({ kind: 'manual', topics: 1, levels: 1, vocabularies: 2, wordReports: 1 });
    expect(files()).toEqual([made.name]);
    // tên file theo giờ Việt Nam (+7) để khớp cột "Tạo lúc" trên hub
    const vn = new Date(new Date(made.createdAt).getTime() + 7 * 3_600_000).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    expect(made.name).toBe(`wd-${vn}-manual.json.gz`);
    const list = (await api('get', '/backups').expect(200)).body;
    expect(list).toMatchObject({ total: 1, page: 1 });
    expect(list.items[0]).toMatchObject({ name: made.name, vocabularies: 2 });
  });

  it('khôi phục đưa dữ liệu về đúng như lúc sao lưu (mã, ngày giờ, số thập phân) và tự sao lưu trạng thái trước đó', async () => {
    await seed();
    const before = await state();
    const { name } = (await api('post', '/backups/actions/backup-now').expect(200)).body;

    // làm hỏng dữ liệu: xóa chặng, thêm từ, sửa luật
    await prisma.level.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.vocabulary.create({ data: { ownerKey: 'official', headword: 'extra', kind: 'word', meaningVi: 'thừa', length: 5 } });
    await prisma.gameConfig.updateMany({ data: { rules: { hearts: { max: 99 } } } });
    const damaged = await state();

    const res = (await api('post', `/backups/${name}/actions/restore`).expect(200)).body;
    expect(res).toMatchObject({ ok: true, restored: name, topics: 1, levels: 1, vocabularies: 2 });
    expect(res.message).toContain(name);
    expect(res.message).toContain(res.safetyBackup);
    const after = await state();
    expect(after.topics).toEqual(before.topics);
    expect(after.levels).toEqual(before.levels);
    expect(after.vocab).toEqual(before.vocab);
    expect(after.reports).toEqual(before.reports);
    expect(after.cfg.map((c) => c.rules)).toEqual(before.cfg.map((c) => c.rules));

    // bản "trước khi khôi phục" giữ lại trạng thái hỏng để quay lại được
    const safety = (await api('get', '/backups').expect(200)).body.items.find((b: { kind: string }) => b.kind === 'pre-restore');
    expect(safety).toMatchObject({ vocabularies: 3, topics: 0 });
    await api('post', `/backups/${safety.name}/actions/restore`).expect(200);
    const back = await state();
    expect(back.vocab.map((v) => v.headword)).toEqual(damaged.vocab.map((v) => v.headword));
    expect(back.topics).toEqual([]);
  });

  it('khôi phục lỗi giữa chừng thì dữ liệu hiện tại giữ nguyên (giao dịch)', async () => {
    await seed();
    const { name } = (await api('post', '/backups/actions/backup-now').expect(200)).body;
    // sửa file: thêm một từ trùng (ownerKey, headword) để lần chèn thứ hai vi phạm ràng buộc
    const { gunzipSync } = await import('node:zlib');
    const { readFileSync } = await import('node:fs');
    const snap = JSON.parse(gunzipSync(readFileSync(join(dir, name))).toString());
    snap.tables.vocabulary.push({ ...snap.tables.vocabulary[0], id: 999 });
    writeFileSync(join(dir, name), gzipSync(JSON.stringify(snap)));

    await prisma.vocabulary.deleteMany({ where: { headword: 'task' } });
    const before = await state();
    const res = await api('post', `/backups/${name}/actions/restore`).expect(500);
    expect(res.body.error.code).toBe('restore_failed');
    expect(await state()).toEqual(before);
  });

  it('file hỏng hoặc sai định dạng bị từ chối trước khi đụng dữ liệu; tên lạ hoặc đường dẫn lên thư mục khác là 404', async () => {
    await seed();
    const before = await state();
    writeFileSync(join(dir, 'wd-20260101-000000-manual.json.gz'), 'khong phai gzip');
    writeFileSync(join(dir, 'wd-20260102-000000-manual.json.gz'), gzipSync(JSON.stringify({ format: 1, game: 'khac', tables: {} })));
    await api('post', '/backups/wd-20260101-000000-manual.json.gz/actions/restore').expect(422);
    await api('post', '/backups/wd-20260102-000000-manual.json.gz/actions/restore').expect(422);
    await api('post', '/backups/wd-20250101-000000-manual.json.gz/actions/restore').expect(404);
    await api('post', '/backups/..%2F..%2Fetc%2Fpasswd/actions/restore').expect(404);
    await api('delete', '/backups/..%2Fpackage.json').expect(404);
    expect(await state()).toEqual(before);
    expect(files().some((n) => n.includes('pre-restore'))).toBe(false); // không tạo bản trước-khôi-phục khi từ chối sớm
    expect((await api('get', '/backups').expect(200)).body.total).toBe(0); // file hỏng không làm hỏng danh sách
  });

  it('xóa bản sao lưu; sao lưu tự động chỉ tạo khi bản mới nhất quá 24 giờ', async () => {
    await seed();
    const service = app.get(BackupsService);
    await service.autoBackup();
    expect(files()).toHaveLength(1);
    await service.autoBackup(); // vừa tạo xong, chưa quá 24 giờ
    expect(files()).toHaveLength(1);
    const [only] = files();
    await api('delete', `/backups/${only}`).expect(200);
    expect(files()).toHaveLength(0);
    await api('delete', `/backups/${only}`).expect(404);
  });
});
