import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Chạy trên MySQL thật (DATABASE_URL trỏ database test). Mỗi test dọn sạch dữ liệu của nó (BR, độc lập). */
describe('GET /api/content (US-01)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const clean = async () => {
    await prisma.level.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.vocabulary.deleteMany();
    await prisma.wordReport.deleteMany();
    await prisma.gameConfig.deleteMany();
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await clean();
    await prisma.topic.create({
      data: {
        slug: 'van-phong',
        title: 'Văn phòng',
        source: 'official',
        visibility: 'approved',
        ownerKey: 'official',
        order: 1,
        themeColor: '#3b82f6',
        levels: {
          create: [
            { uniqueKey: 'van-phong:2', levelNumber: 2, difficulty: 'medium', targetCount: 10, fallSpeed: 5.5 },
            { uniqueKey: 'van-phong:1', levelNumber: 1, difficulty: 'easy', targetCount: 8 },
          ],
        },
      },
    });
    await prisma.vocabulary.createMany({
      data: [
        { ownerKey: 'official', headword: 'ball', kind: 'word', topicSlug: 'van-phong', levelNumber: 1, orderIndex: 1, meaningVi: 'quả bóng', audioPath: 'audio/ball.mp3' },
        { ownerKey: 'official', headword: 'desk', kind: 'word', topicSlug: 'van-phong', levelNumber: 1, orderIndex: 2, meaningVi: 'bàn làm việc' },
        { ownerKey: 'player-123', headword: 'secret', kind: 'word', topicSlug: 'van-phong', levelNumber: 1, meaningVi: 'bí mật' },
      ],
    });
    await app.get(PrismaService).gameConfig.create({ data: { rules: { hearts: { max: 3 } }, version: 1 } });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  it('AC-01.1: trả đủ luật chơi, chặng, màn (xếp theo số màn), từ vựng và ETag trong một lần gọi', async () => {
    const res = await request(app.getHttpServer()).get('/api/content').expect(200);
    expect(res.headers.etag).toBeTruthy();
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body.rules).toEqual({ hearts: { max: 3 } });
    expect(res.body.topics).toHaveLength(1);
    expect(res.body.topics[0].levels.map((l: { levelNumber: number }) => l.levelNumber)).toEqual([1, 2]);
    expect(res.body.topics[0].levels[1].fallSpeed).toBe(5.5);
    expect(res.body.vocabulary.map((v: { headword: string }) => v.headword)).toEqual(['ball', 'desk']);
    expect(res.body.vocabulary[0].audio).toEqual({ url: '/uploads/audio/ball.mp3' });
    expect(res.body.vocabulary[1].audio).toBeNull();
  });

  it('AC-01.7 (BR1): từ của bộ riêng người chơi không có trong gói', async () => {
    const res = await request(app.getHttpServer()).get('/api/content').expect(200);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('AC-01.2 và AC-01.8 (BR2): gọi lại với If-None-Match thì 304, và hai lần gọi cùng nội dung cho cùng ETag', async () => {
    const first = await request(app.getHttpServer()).get('/api/content').expect(200);
    const again = await request(app.getHttpServer()).get('/api/content').expect(200);
    expect(again.headers.etag).toBe(first.headers.etag);
    const res = await request(app.getHttpServer()).get('/api/content').set('If-None-Match', first.headers.etag).expect(304);
    expect(res.text).toBe('');
  });

  it('AC-01.3 (A2): sửa nghĩa một từ thì ETag đổi và nghĩa mới xuất hiện ở lần gọi kế tiếp', async () => {
    const first = await request(app.getHttpServer()).get('/api/content').expect(200);
    await prisma.vocabulary.update({ where: { ownerKey_headword: { ownerKey: 'official', headword: 'ball' } }, data: { meaningVi: 'trái bóng' } });
    const res = await request(app.getHttpServer()).get('/api/content').set('If-None-Match', first.headers.etag).expect(200);
    expect(res.headers.etag).not.toBe(first.headers.etag);
    expect(res.body.vocabulary[0].meaningVi).toBe('trái bóng');
  });

  it('AC-06.5 (BR24): khởi động lại bổ sung khóa luật còn thiếu mà không ghi đè giá trị đã chỉnh', async () => {
    await prisma.gameConfig.update({ where: { id: (await prisma.gameConfig.findFirstOrThrow()).id }, data: { rules: { hearts: { max: 9 } } } });
    const { GameConfigService } = await import('../src/game-config/game-config.service.js');
    await app.get(GameConfigService).ensureDefaults();
    const rules = (await prisma.gameConfig.findFirstOrThrow()).rules as { hearts: { max: number; lossPerMiss: number }; pace: object };
    expect(rules.hearts.max).toBe(9);
    expect(rules.hearts.lossPerMiss).toBe(0.5);
    expect(rules.pace).toBeDefined();
  });

  it('AC-11.6: database không dùng được thì /api/content trả 503 (game dùng bản cache), không phải 500; có lại thì trả bình thường', async () => {
    const spy = vi.spyOn(prisma.topic, 'findMany').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await request(app.getHttpServer()).get('/api/content').expect(503);
    expect(res.body.error.code).toBe('db_unavailable');
    spy.mockRestore();
    await request(app.getHttpServer()).get('/api/content').expect(200);
  });

  describe('CORS cho game ở domain khác', () => {
    const GAME = 'https://game.test';
    beforeEach(() => {
      process.env.CORS_ORIGINS = `${GAME}, http://localhost:5173`;
    });
    afterEach(() => {
      delete process.env.CORS_ORIGINS;
    });

    it('domain trong danh sách đọc được nội dung và thấy ETag; preflight trả 204', async () => {
      const res = await request(app.getHttpServer()).get('/api/content').set('Origin', GAME).expect(200);
      expect(res.headers['access-control-allow-origin']).toBe(GAME);
      expect(res.headers['access-control-expose-headers']).toContain('ETag');
      const pre = await request(app.getHttpServer()).options('/api/word-reports').set('Origin', GAME).set('Access-Control-Request-Method', 'POST').expect(204);
      expect(pre.headers['access-control-allow-methods']).toContain('POST');
    });

    it('domain lạ không được cấp quyền; cổng quản trị không bao giờ có CORS', async () => {
      const res = await request(app.getHttpServer()).get('/api/content').set('Origin', 'https://evil.test').expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      const admin = await request(app.getHttpServer()).get('/admin-api/meta').set('Origin', GAME);
      expect(admin.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('chưa cấu hình CORS_ORIGINS thì không cấp quyền cho ai', async () => {
      delete process.env.CORS_ORIGINS;
      const res = await request(app.getHttpServer()).get('/api/content').set('Origin', GAME).expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
