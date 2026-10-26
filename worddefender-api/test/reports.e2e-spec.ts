import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { ADMIN_API_TOKEN } from '../src/admin/admin-token.guard.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TOKEN = 'x'.repeat(40);
const MP3 = Buffer.from('ID3 giả lập để thử, không cần là mp3 thật');

/** Báo lỗi của người chơi (US-02), duyệt/từ chối (US-07), đặt lại luật mặc định (US-06 A1). */
describe('báo lỗi từ vựng', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let dir: string;

  const http = () => request(app.getHttpServer());
  const post = (body: object, ip = '10.1.1.1') => http().post('/api/word-reports').set('CF-Connecting-IP', ip).send(body);
  const admin = (method: 'get' | 'post' | 'put', path: string) => http()[method](`/admin-api${path}`).set('Authorization', `Bearer ${TOKEN}`);
  const files = () => (existsSync(join(dir, 'audio')) ? readdirSync(join(dir, 'audio')) : []);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wd-uploads-'));
    process.env.UPLOAD_DIR = dir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ADMIN_API_TOKEN).useValue(TOKEN).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await prisma.wordReport.deleteMany();
    await prisma.vocabulary.deleteMany();
    await prisma.gameConfig.deleteMany();
    rmSync(join(dir, 'audio'), { recursive: true, force: true });
    const { GameConfigService } = await import('../src/game-config/game-config.service.js');
    await app.get(GameConfigService).ensureDefaults();
    await prisma.vocabulary.createMany({
      data: [
        { ownerKey: 'official', headword: 'ball', length: 4, kind: 'word', meaningVi: 'quả bóng' },
        { ownerKey: 'official', headword: 'desk', length: 4, kind: 'word', meaningVi: 'bàn làm việc' },
      ],
    });
  });
  afterAll(async () => {
    await prisma.wordReport.deleteMany();
    await prisma.vocabulary.deleteMany();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  describe('người chơi gửi báo lỗi (US-02)', () => {
    it('AC-02.1: gửi báo lỗi nghĩa thì nhận 201 kèm mã; DB có một báo lỗi pending, kèm giá trị hiện tại', async () => {
      const res = await post({ headword: 'ball', field: 'meaningVi', suggestedValue: 'trái bóng', note: 'nghe tự nhiên hơn' }).expect(201);
      expect(res.body.id).toBeGreaterThan(0);
      const row = await prisma.wordReport.findFirstOrThrow();
      expect(row).toMatchObject({ headword: 'ball', field: 'meaningVi', suggestedValue: 'trái bóng', currentValue: 'quả bóng', reviewStatus: 'pending', appliedAt: null, note: 'nghe tự nhiên hơn' });
      expect(row.reporterKey).toHaveLength(32);
      expect(row.reporterKey).not.toContain('10.1.1.1'); // chỉ lưu băm IP
    });

    it('AC-02.2 (A1): báo lỗi file đọc kèm một file mp3 nhỏ hợp lệ thì file nằm trong thư mục tải lên và báo lỗi trỏ đúng tới nó', async () => {
      await http().post('/api/word-reports').set('CF-Connecting-IP', '10.1.1.1').field('headword', 'ball').field('field', 'audio').attach('file', MP3, { filename: 'bat-ky.exe', contentType: 'audio/mpeg' }).expect(201);
      const row = await prisma.wordReport.findFirstOrThrow();
      expect(row.suggestedAudioPath).toMatch(/^audio\/[0-9a-f]{32}\.mp3$/); // đuôi do máy chủ chọn, không lấy từ tên file người gửi
      expect(existsSync(join(dir, row.suggestedAudioPath!))).toBe(true);
    });

    it('AC-02.3 (E1): thiếu từ, trường sai không thuộc danh sách, thiếu giá trị đề nghị thì 400 nêu đúng trường; DB không đổi', async () => {
      const a = await post({ field: 'meaningVi', suggestedValue: 'x' }).expect(400);
      expect(a.body.error.fields[0].name).toBe('headword');
      const b = await post({ headword: 'ball', field: 'status', suggestedValue: 'x' }).expect(400);
      expect(b.body.error.fields[0].name).toBe('field');
      await post({ headword: 'ball', field: 'meaningVi' }).expect(400);
      await post({ headword: 'ball', field: 'audio' }).expect(400); // báo file đọc mà không đính kèm
      expect(await prisma.wordReport.count()).toBe(0);
    });

    it('AC-02.4 (E2, BR6): file đúng 2.097.152 byte được nhận, 2.097.153 byte bị 400 và không để lại file; ảnh, hai file, định dạng lạ đều bị 400', async () => {
      const send = (buf: Buffer, type = 'audio/mpeg') => http().post('/api/word-reports').set('CF-Connecting-IP', '10.2.2.2').field('headword', 'ball').field('field', 'audio').attach('file', buf, { filename: 'a.mp3', contentType: type });
      await send(Buffer.alloc(2 * 1024 * 1024)).expect(201);
      expect(files()).toHaveLength(1);
      const big = await send(Buffer.alloc(2 * 1024 * 1024 + 1)).expect(400);
      expect(big.body.error.message).toContain('2MB');
      await send(MP3, 'image/png').expect(400);
      await send(MP3, 'audio/x-khong-ho-tro').expect(400);
      await http().post('/api/word-reports').set('CF-Connecting-IP', '10.2.2.2').field('headword', 'ball').field('field', 'audio').attach('file', MP3, { filename: 'a.mp3', contentType: 'audio/mpeg' }).attach('file', MP3, { filename: 'b.mp3', contentType: 'audio/mpeg' }).expect(400);
      await post({ headword: 'ball', field: 'meaningVi', suggestedValue: 'x' }, '10.2.2.3').expect(201);
      expect(files()).toHaveLength(1); // không có file mồ côi từ các lần bị từ chối
      expect(await prisma.wordReport.count()).toBe(2);
    });

    it('AC-02.5 (E3): từ không có trong bộ chính thức thì 404; từ của bộ riêng người chơi cũng không tính', async () => {
      await prisma.vocabulary.create({ data: { ownerKey: 'player-1', headword: 'secret', kind: 'word', meaningVi: 'bí mật' } });
      await post({ headword: 'zzzzqq', field: 'meaningVi', suggestedValue: 'x' }).expect(404);
      await post({ headword: 'secret', field: 'meaningVi', suggestedValue: 'x' }).expect(404);
      expect(await prisma.wordReport.count()).toBe(0);
    });

    it('AC-02.6 (E4, BR8): IP đã gửi 10 báo lỗi trong giờ thì báo lỗi thứ 11 bị 429 và không lưu; IP khác không bị ảnh hưởng; qua một giờ gửi lại được', async () => {
      for (let i = 0; i < 10; i++) await post({ headword: 'ball', field: 'meaningVi', suggestedValue: `v${i}` }, '10.3.3.3').expect(201);
      await post({ headword: 'ball', field: 'meaningVi', suggestedValue: 'v10' }, '10.3.3.3').expect(429);
      expect(await prisma.wordReport.count()).toBe(10);
      await post({ headword: 'ball', field: 'meaningVi', suggestedValue: 'khác' }, '10.3.3.4').expect(201);
      await prisma.wordReport.updateMany({ where: { reporterKey: { not: undefined } }, data: { createdAt: new Date(Date.now() - 61 * 60_000) } });
      await post({ headword: 'ball', field: 'meaningVi', suggestedValue: 'sau một giờ' }, '10.3.3.3').expect(201);
    });

    it('AC-02.7 (BR4, BR7): yêu cầu tự đặt reviewStatus/appliedAt và từ viết "  Ball " vẫn được lưu pending, appliedAt rỗng, headword = ball', async () => {
      await post({ headword: '  Ball ', field: 'meaningVi', suggestedValue: 'x', reviewStatus: 'approved', appliedAt: '2026-01-01T00:00:00Z', id: 999 }).expect(201);
      const row = await prisma.wordReport.findFirstOrThrow();
      expect(row).toMatchObject({ headword: 'ball', reviewStatus: 'pending', appliedAt: null });
      expect(row.id).not.toBe(999);
    });

    it('AC-02.8 (BR5): khách không đọc, sửa, xóa được báo lỗi hay từ vựng trên giao diện công khai', async () => {
      for (const path of ['/api/word-reports', '/api/vocabularies', '/api/topics']) {
        await http().get(path).expect(404);
        await http().put(path).send({}).expect(404);
        await http().delete(path).expect(404);
      }
      await http().post('/api/vocabularies').send({ headword: 'hack', kind: 'word', meaningVi: 'x' }).expect(404);
      expect(await prisma.vocabulary.count()).toBe(2);
    });

    it('lỗi khi lưu DB thì file vừa ghi bị xóa, không để file mồ côi', async () => {
      const spy = vi.spyOn(prisma.wordReport, 'create').mockRejectedValueOnce(new Error('db down'));
      await http().post('/api/word-reports').set('CF-Connecting-IP', '10.4.4.4').field('headword', 'ball').field('field', 'audio').attach('file', MP3, { filename: 'a.mp3', contentType: 'audio/mpeg' }).expect(500);
      spy.mockRestore();
      expect(files()).toHaveLength(0);
    });
  });

  describe('admin duyệt báo lỗi (US-07)', () => {
    const report = (data: Record<string, unknown>) => prisma.wordReport.create({ data: { headword: 'ball', field: 'meaningVi', reviewStatus: 'pending', ...data } as never });
    const approve = (id: number, body: object = {}) => admin('post', `/word-reports/${id}/actions/approve`).send(body);
    const reject = (id: number, body: object = {}) => admin('post', `/word-reports/${id}/actions/reject`).send(body);
    const ball = () => prisma.vocabulary.findFirstOrThrow({ where: { headword: 'ball' } });

    it('AC-07.1: duyệt báo lỗi nghĩa thì nghĩa của từ đổi đúng như đề nghị, báo lỗi thành approved có appliedAt, và gói nội dung đổi mã bản', async () => {
      const r = await report({ suggestedValue: 'trái bóng' });
      const before = await http().get('/api/content');
      const res = await approve(r.id).expect(201);
      expect(res.body).toMatchObject({ reviewStatus: 'approved' });
      expect(res.body.appliedAt).toBeTruthy();
      expect((await ball()).meaningVi).toBe('trái bóng');
      const after = await http().get('/api/content').expect(200);
      expect(after.headers.etag).not.toBe(before.headers.etag);
      expect(after.body.vocabulary.find((v: { headword: string }) => v.headword === 'ball').meaningVi).toBe('trái bóng');
    });

    it('AC-07.2 (A1): từ chối kèm ghi chú thì báo lỗi thành rejected có ghi chú, từ vựng không đổi', async () => {
      const r = await report({ suggestedValue: 'sai' });
      const res = await reject(r.id, { note: 'không chính xác' }).expect(201);
      expect(res.body).toMatchObject({ reviewStatus: 'rejected', reviewNote: 'không chính xác' });
      expect((await ball()).meaningVi).toBe('quả bóng');
    });

    it('AC-07.3 (A2): duyệt báo lỗi file đọc thì từ nhận file đó và /api/content trả đường dẫn file', async () => {
      const r = await report({ field: 'audio', suggestedAudioPath: 'audio/abc.mp3' });
      await approve(r.id).expect(201);
      expect((await ball()).audioPath).toBe('audio/abc.mp3');
      const content = await http().get('/api/content').expect(200);
      expect(content.body.vocabulary.find((v: { headword: string }) => v.headword === 'ball').audio).toEqual({ url: '/uploads/audio/abc.mp3' });
    });

    it('AC-07.4 (E1): từ trong báo lỗi đã bị xóa thì không duyệt được, báo lỗi giữ pending', async () => {
      const r = await report({ headword: 'gone', suggestedValue: 'x' });
      const res = await approve(r.id).expect(422);
      expect(JSON.stringify(res.body)).toContain('Không tìm thấy từ');
      expect((await prisma.wordReport.findUniqueOrThrow({ where: { id: r.id } })).reviewStatus).toBe('pending');
    });

    it('AC-07.5 (E2, BR26): giá trị đề nghị rỗng, báo lỗi file đọc thiếu file, giá trị vượt độ dài đều bị từ chối và từ vựng không đổi', async () => {
      for (const data of [{ suggestedValue: '   ' }, { suggestedValue: null }, { field: 'audio', suggestedAudioPath: null }, { suggestedValue: 'x'.repeat(501) }]) {
        const r = await report(data);
        await approve(r.id).expect(422);
        expect((await prisma.wordReport.findUniqueOrThrow({ where: { id: r.id } })).reviewStatus).toBe('pending');
      }
      expect(await ball()).toMatchObject({ meaningVi: 'quả bóng', audioPath: null });
    });

    it('AC-07.6 (E3, BR27, BR28): đổi headword thành từ đã có, hoặc thành từ sai định dạng, thì bị từ chối, báo lỗi giữ pending, từ vựng không đổi', async () => {
      const dup = await report({ field: 'headword', suggestedValue: 'desk' });
      const bad = await report({ field: 'headword', suggestedValue: 'ab1' });
      for (const r of [dup, bad]) {
        await approve(r.id).expect(422);
        expect((await prisma.wordReport.findUniqueOrThrow({ where: { id: r.id } })).reviewStatus).toBe('pending');
      }
      expect(await ball()).toMatchObject({ headword: 'ball', meaningVi: 'quả bóng' });
      const ok = await report({ field: 'headword', suggestedValue: 'Balls' });
      await approve(ok.id).expect(201);
      expect(await prisma.vocabulary.findFirstOrThrow({ where: { headword: 'balls' } })).toMatchObject({ length: 5 });
    });

    it('AC-07.7 (E4, BR25): hai admin bấm duyệt cùng lúc chỉ một lần ghi; bấm lại báo "đã được duyệt"; duyệt xong không từ chối được nữa', async () => {
      const r = await report({ suggestedValue: 'trái bóng' });
      const results = await Promise.all([approve(r.id), approve(r.id)]);
      expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
      const loser = results.find((x) => x.status === 409)!;
      expect(loser.body.error.message).toContain('đã được duyệt');
      await approve(r.id).expect(409);
      await reject(r.id).expect(409);
      expect((await ball()).meaningVi).toBe('trái bóng');
      expect((await prisma.wordReport.findUniqueOrThrow({ where: { id: r.id } })).reviewStatus).toBe('approved');
    });

    it('thao tác lạ và báo lỗi không tồn tại bị 404', async () => {
      await admin('post', '/word-reports/999999/actions/approve').send({}).expect(404);
      await admin('post', '/word-reports/1/actions/xoa-het').send({}).expect(404);
    });
  });

  describe('đặt lại luật chơi về mặc định (US-06 A1)', () => {
    const current = async () => (await admin('get', '/game-config').expect(200)).body;

    it('AC-06.2: đặt lại riêng nhóm "hearts" thì nhóm đó về mặc định, các nhóm khác giữ nguyên, phiên bản tăng; đặt lại tất cả thì về hết', async () => {
      const cfg = await current();
      const rules = structuredClone(cfg.rules);
      rules.hearts.max = 9;
      rules.pace.fallFactor = 99;
      const saved = (await admin('put', '/game-config').send({ updatedAt: cfg.updatedAt, rules }).expect(200)).body;
      const reset = await admin('post', '/game-config/actions/reset-defaults').send({ updatedAt: saved.updatedAt, option: 'hearts' }).expect(201);
      expect(reset.body.rules.hearts.max).toBe(3);
      expect(reset.body.rules.pace.fallFactor).toBe(99);
      expect(reset.body.version).toBe(saved.version + 1);
      const all = await admin('post', '/game-config/actions/reset-defaults').send({ updatedAt: reset.body.updatedAt }).expect(201);
      expect(all.body.rules.pace.fallFactor).toBe(7);
    });

    it('đặt lại khi bản ghi đã bị người khác sửa thì 409; nhóm không có trong bộ mặc định thì 422', async () => {
      const cfg = await current();
      await admin('post', '/game-config/actions/reset-defaults').send({ updatedAt: '2000-01-01T00:00:00Z', option: 'hearts' }).expect(409);
      await admin('post', '/game-config/actions/reset-defaults').send({ updatedAt: cfg.updatedAt, option: 'khongco' }).expect(422);
    });
  });
});
