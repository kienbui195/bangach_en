import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ADMIN_API_TOKEN } from '../src/admin/admin-token.guard.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TOKEN = 'x'.repeat(40);

/** Hợp đồng quản trị của WordDefender (US-04, US-06, US-09). Chạy trên MySQL thật. */
describe('admin-api', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    request(app.getHttpServer())[method](`/admin-api${path}`).set('Authorization', `Bearer ${TOKEN}`);

  const clean = async () => {
    await prisma.level.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.vocabulary.deleteMany();
    await prisma.wordReport.deleteMany();
    await prisma.gameConfig.deleteMany();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ADMIN_API_TOKEN)
      .useValue(TOKEN)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await clean();
    const { GameConfigService } = await import('../src/game-config/game-config.service.js');
    await app.get(GameConfigService).ensureDefaults();
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe('xác thực (BR31, BR32, AC-09.4)', () => {
    it('thiếu token, sai token hoặc yêu cầu đi qua proxy ngoài đều bị 401, không lộ dữ liệu', async () => {
      const http = () => request(app.getHttpServer());
      await http().get('/admin-api/meta').expect(401);
      await http().get('/admin-api/meta').set('Authorization', 'Bearer sai-token').expect(401);
      await http().get('/admin-api/vocabularies').set('Authorization', `Bearer ${TOKEN.slice(0, 39)}y`).expect(401);
      await http().get('/admin-api/meta').set('Authorization', `Bearer ${TOKEN}`).set('CF-Connecting-IP', '1.2.3.4').expect(401);
      await http().get('/admin-api/meta').set('Authorization', `Bearer ${TOKEN}`).set('X-Forwarded-For', '1.2.3.4').expect(401);
    });

    it('chưa cấu hình token thì từ chối hết', async () => {
      const m = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ADMIN_API_TOKEN).useValue(undefined).compile();
      const a = m.createNestApplication<NestExpressApplication>();
      await a.init();
      await request(a.getHttpServer()).get('/admin-api/meta').set('Authorization', 'Bearer undefined').expect(401);
      await a.close();
    });
  });

  describe('meta và health (AC-04.1, AC-08.1)', () => {
    it('meta nêu phiên bản hợp đồng và năm tài nguyên có trường đủ để dựng bảng', async () => {
      const res = await api('get', '/meta').expect(200);
      expect(res.body.contractVersion).toBe(1);
      expect(res.body.game.key).toBe('worddefender');
      expect(res.body.resources.map((r: { key: string }) => r.key)).toEqual(['topics', 'levels', 'vocabularies', 'game-config', 'word-reports']);
      const vocab = res.body.resources.find((r: { key: string }) => r.key === 'vocabularies');
      expect(vocab.import).toEqual({ formats: ['csv', 'json'], matchKey: 'headword' });
      expect(vocab.fields.find((f: { name: string }) => f.name === 'headword')).toMatchObject({ required: true, type: 'string' });
    });

    it('health trả trạng thái, phiên bản, RAM tiến trình và tình trạng DB', async () => {
      const res = await api('get', '/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'up', contractVersion: 1 });
      expect(res.body.rssMb).toBeGreaterThan(0);
    });
  });

  describe('từ vựng: xem danh sách (US-04 luồng lõi)', () => {
    beforeEach(async () => {
      await prisma.vocabulary.createMany({
        data: Array.from({ length: 120 }, (_, i) => ({
          ownerKey: 'official',
          headword: `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`.replace(/[^a-z]/g, 'q'),
          kind: 'word' as const,
          topicSlug: i % 2 === 0 ? 'a' : 'b',
          levelNumber: i % 5,
          meaningVi: `nghĩa ${i}`,
        })),
        skipDuplicates: true,
      });
    });

    it('AC-04.1: mặc định 25 dòng đầu kèm tổng số', async () => {
      const total = await prisma.vocabulary.count();
      const res = await api('get', '/vocabularies').expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 25, total });
      expect(res.body.items).toHaveLength(25);
    });

    it('AC-04.11 (BR14): pageSize 100 trả đủ 100 dòng, 101 chỉ trả 100', async () => {
      expect((await api('get', '/vocabularies?pageSize=100').expect(200)).body.items).toHaveLength(100);
      const res = await api('get', '/vocabularies?pageSize=101').expect(200);
      expect(res.body.pageSize).toBe(100);
      expect(res.body.items).toHaveLength(100);
    });

    it('AC-04.2: tìm kiếm, lọc theo chặng, sắp xếp và phân trang cho kết quả đúng', async () => {
      const searched = await api('get', '/vocabularies?q=' + encodeURIComponent('nghĩa 7')).expect(200);
      expect(searched.body.items.length).toBeGreaterThan(0);
      expect(searched.body.items.every((x: { meaningVi: string }) => x.meaningVi.includes('nghĩa 7'))).toBe(true);

      const filtered = await api('get', '/vocabularies?filter[topicSlug]=a&filter[levelNumber]=0&pageSize=100').expect(200);
      expect(filtered.body.items.every((x: { topicSlug: string; levelNumber: number }) => x.topicSlug === 'a' && x.levelNumber === 0)).toBe(true);

      const sorted = await api('get', '/vocabularies?sort=headword:desc&pageSize=10').expect(200);
      const words = sorted.body.items.map((x: { headword: string }) => x.headword);
      expect(words).toEqual([...words].sort().reverse());

      const p2 = await api('get', '/vocabularies?page=2&pageSize=10&sort=id:asc').expect(200);
      const p1 = await api('get', '/vocabularies?page=1&pageSize=10&sort=id:asc').expect(200);
      expect(p2.body.items[0].id).toBeGreaterThan(p1.body.items[9].id);
    });

    it('lọc theo trường không cho lọc bị từ chối 422', async () => {
      await api('get', '/vocabularies?filter[meaningVi]=x').expect(422);
    });
  });

  describe('từ vựng: thêm, sửa, xóa và luật của game (BR16, BR13)', () => {
    const base = { kind: 'word', meaningVi: 'quả bóng' };

    it('AC-04.3: thêm từ hợp lệ, chuẩn hóa chữ thường và bỏ khoảng trắng, tính độ dài, mặc định bộ chính thức', async () => {
      const res = await api('post', '/vocabularies').send({ ...base, headword: '  Ball ' }).expect(201);
      expect(res.body).toMatchObject({ headword: 'ball', length: 4, ownerKey: 'official' });
      expect(await prisma.vocabulary.count({ where: { headword: 'ball' } })).toBe(1);
    });

    it('AC-04.7 (E2): trùng từ, quá ngắn, quá dài đều bị 422 nêu đúng trường; DB không đổi', async () => {
      await api('post', '/vocabularies').send({ ...base, headword: 'ball' }).expect(201);
      const dup = await api('post', '/vocabularies').send({ ...base, headword: 'Ball' }).expect(422);
      expect(dup.body.error.fields[0]).toMatchObject({ name: 'headword' });
      expect(dup.body.error.fields[0].message).toContain('đã có');
      await api('post', '/vocabularies').send({ ...base, headword: 'a' }).expect(422);
      await api('post', '/vocabularies').send({ ...base, headword: 'abcdefghijklmnopq' }).expect(422);
      await api('post', '/vocabularies').send({ ...base, headword: 'op-amp' }).expect(422);
      expect(await prisma.vocabulary.count()).toBe(1);
    });

    it('AC-04.8: từ đúng 2 ký tự và đúng 16 ký tự được nhận', async () => {
      await api('post', '/vocabularies').send({ ...base, headword: 'ab' }).expect(201);
      await api('post', '/vocabularies').send({ ...base, headword: 'abcdefghijklmnop' }).expect(201);
    });

    it('thiếu trường bắt buộc: 422 liệt kê từng trường', async () => {
      const res = await api('post', '/vocabularies').send({ headword: 'ball' }).expect(422);
      expect(res.body.error.fields.map((f: { name: string }) => f.name).sort()).toEqual(['kind', 'meaningVi']);
    });

    it('AC-04.9 (E3): sửa với updatedAt đã cũ thì 409, bản của người sửa trước không bị đè; updatedAt mới thì được', async () => {
      const created = (await api('post', '/vocabularies').send({ ...base, headword: 'ball' }).expect(201)).body;
      await new Promise((r) => setTimeout(r, 15));
      const first = await api('put', `/vocabularies/${created.id}`).send({ updatedAt: created.updatedAt, meaningVi: 'trái bóng' }).expect(200);
      const stale = await api('put', `/vocabularies/${created.id}`).send({ updatedAt: created.updatedAt, meaningVi: 'bóng tròn' }).expect(409);
      expect(stale.body.error.code).toBe('conflict');
      expect((await api('get', `/vocabularies/${created.id}`).expect(200)).body.meaningVi).toBe('trái bóng');
      await api('put', `/vocabularies/${created.id}`).send({ updatedAt: first.body.updatedAt, meaningVi: 'bóng tròn' }).expect(200);
    });

    it('sửa một từ không tự báo trùng với chính nó, nhưng đổi sang từ đã có thì 422', async () => {
      const a = (await api('post', '/vocabularies').send({ ...base, headword: 'ball' }).expect(201)).body;
      await api('post', '/vocabularies').send({ ...base, headword: 'desk' }).expect(201);
      const same = await api('put', `/vocabularies/${a.id}`).send({ updatedAt: a.updatedAt, headword: 'ball' }).expect(200);
      await api('put', `/vocabularies/${a.id}`).send({ updatedAt: same.body.updatedAt, headword: 'desk' }).expect(422);
    });

    it('AC-04.4 (A1): xóa một từ thì biến mất; xóa lại báo 404', async () => {
      const a = (await api('post', '/vocabularies').send({ ...base, headword: 'ball' }).expect(201)).body;
      await api('delete', `/vocabularies/${a.id}`).expect(200);
      await api('get', `/vocabularies/${a.id}`).expect(404);
      await api('delete', `/vocabularies/${a.id}`).expect(404);
    });

    it('trường chỉ đọc (length, createdAt) gửi lên bị bỏ qua, không ghi đè', async () => {
      const res = await api('post', '/vocabularies').send({ ...base, headword: 'ball', length: 99, createdAt: '2000-01-01T00:00:00Z' }).expect(201);
      expect(res.body.length).toBe(4);
      expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThan(2000);
    });
  });

  describe('chặng và màn', () => {
    it('thêm chặng rồi màn; màn trỏ tới chặng không tồn tại bị 422; slug trùng bị 422', async () => {
      const topic = (await api('post', '/topics').send({ slug: 'van-phong', title: 'Văn phòng', source: 'official', visibility: 'approved', ownerKey: 'official' }).expect(201)).body;
      await api('post', '/topics').send({ slug: 'van-phong', title: 'Khác', source: 'official', visibility: 'approved', ownerKey: 'official' }).expect(422);
      const lv = await api('post', '/levels').send({ topicId: topic.id, uniqueKey: 'vp:1', levelNumber: 1, difficulty: 'easy', targetCount: 10, fallSpeed: 5.5 }).expect(201);
      expect(lv.body.fallSpeed).toBe(5.5);
      await api('post', '/levels').send({ topicId: 999999, uniqueKey: 'vp:9', levelNumber: 9, difficulty: 'easy', targetCount: 10 }).expect(422);
      await api('post', '/levels').send({ topicId: topic.id, uniqueKey: 'vp:1', levelNumber: 2, difficulty: 'easy', targetCount: 10 }).expect(422);
    });
  });

  describe('luật chơi (US-06)', () => {
    const current = async () => (await api('get', '/game-config').expect(200)).body;

    it('AC-04.5 (A2): tài nguyên một bản ghi trả thẳng bản ghi, không có danh sách; không cho thêm hay xóa', async () => {
      const cfg = await current();
      expect(cfg.rules.hearts.max).toBe(3);
      await api('post', '/game-config').send({ rules: {} }).expect(405);
      await api('delete', `/game-config/${cfg.id}`).expect(405);
    });

    it('AC-06.1: đổi số tim tối đa thì lưu, phiên bản tăng 1 và /api/content có luật mới', async () => {
      const cfg = await current();
      const rules = structuredClone(cfg.rules);
      rules.hearts.max = 5;
      const res = await api('put', '/game-config').send({ updatedAt: cfg.updatedAt, rules }).expect(200);
      expect(res.body.version).toBe(cfg.version + 1);
      const content = await request(app.getHttpServer()).get('/api/content').expect(200);
      expect(content.body.rules.hearts.max).toBe(5);
    });

    it('AC-06.3 (E1, BR23): khóa lạ, sai kiểu và mảng sai độ dài đều bị 422 nêu đúng khóa; luật không đổi', async () => {
      const cfg = await current();
      const bad = async (mutate: (r: Record<string, any>) => void) => {
        const rules = structuredClone(cfg.rules);
        mutate(rules);
        return api('put', '/game-config').send({ updatedAt: cfg.updatedAt, rules }).expect(422);
      };
      expect((await bad((r) => (r.hearts.khongCo = 1))).body.error.fields[0].name).toBe('rules.hearts.khongCo');
      expect((await bad((r) => (r.hearts.max = 'ba'))).body.error.fields[0].name).toBe('rules.hearts.max');
      expect((await bad((r) => (r.pace.fallDurationClampSec = [12]))).body.error.fields[0].name).toBe('rules.pace.fallDurationClampSec');
      expect((await current()).version).toBe(cfg.version);
    });

    it('AC-06.4 (E2): hai admin sửa cùng lúc thì người sau nhận 409', async () => {
      const cfg = await current();
      const rules = structuredClone(cfg.rules);
      rules.hearts.max = 4;
      await api('put', '/game-config').send({ updatedAt: cfg.updatedAt, rules }).expect(200);
      await api('put', '/game-config').send({ updatedAt: cfg.updatedAt, rules }).expect(409);
    });
  });
});
