import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditService } from '../src/audit/audit.service.js';
import { SessionsService } from '../src/auth/sessions.service.js';
import { HUB_ENV, type HubEnv } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ORIGIN = 'https://admin.test';
const TOKEN = 'a'.repeat(40);
const TOKEN2 = 'b'.repeat(40);

interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  body: string;
}

/** Game giả theo hợp đồng quản trị v1: ghi lại mọi yêu cầu nhận được. */
class FakeGame {
  server: Server;
  port = 0;
  token = TOKEN;
  contractVersion = 1;
  delayMs = 0;
  dbUp = true;
  seen: Seen[] = [];

  constructor() {
    this.server = createServer((req, res) => void this.handle(req, res));
  }

  async start() {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as AddressInfo).port;
  }
  stop() {
    this.server.closeAllConnections();
    return new Promise<void>((r) => this.server.close(() => r()));
  }
  get baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    this.seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization, body: Buffer.concat(chunks).toString() });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${this.token}`) return json(401, { error: { code: 'unauthorized' } });
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/admin-api/meta') return json(200, { game: { key: 'fake', name: 'Fake', version: '1.0.0' }, contractVersion: this.contractVersion, resources: [] });
    if (url.pathname === '/admin-api/health') return json(200, { status: this.dbUp ? 'ok' : 'error', version: '1.0.0', uptimeSec: 42, rssMb: 100, db: this.dbUp ? 'up' : 'down' });
    if (url.pathname === '/admin-api/vocabularies' && req.method === 'POST') return json(422, { error: { code: 'validation', message: 'Dữ liệu không hợp lệ', fields: [{ name: 'headword', message: 'trùng' }] } });
    if (url.pathname.startsWith('/admin-api/vocabularies')) return json(200, { echo: url.pathname + url.search, method: req.method });
    return json(404, { error: { code: 'not_found' } });
  }
}

describe('Nối game và chuyển lệnh (US-04, 08, 09)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let env: HubEnv;
  let cookie: string;
  const game = new FakeGame();
  const gamesDir = mkdtempSync(join(tmpdir(), 'hub-games-'));
  const manifest = (name: string, body: object) => writeFileSync(join(gamesDir, name), JSON.stringify(body));

  const server = () => app.getHttpServer();
  const get = (path: string) => request(server()).get(path).set('Cookie', cookie);
  const send = (method: 'post' | 'put' | 'delete', path: string, body: object = {}) =>
    request(server())[method](path).set('Cookie', cookie).set('Origin', ORIGIN).set('Content-Type', 'application/json').send(body);
  const register = (over: Partial<{ gameKey: string; name: string; baseUrl: string; token: string }> = {}) =>
    send('post', '/games', { gameKey: 'fake', name: 'Fake', baseUrl: game.baseUrl, token: TOKEN, ...over });

  beforeAll(async () => {
    await game.start();
    env = {
      origin: ORIGIN,
      cookieSecure: true,
      masterKey: randomBytes(32),
      setupTokenFile: '/tmp/none',
      loginMaxFails: 5,
      loginWindowMs: 900_000,
      sessionIdleMs: 1_800_000,
      sessionMaxMs: 43_200_000,
      passwordMin: 16,
      passwordMax: 128,
      challengeMs: 300_000,
      gameTimeoutMs: 400,
      supportedContracts: [1],
      gamesDir,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(HUB_ENV).useValue(env).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    game.token = TOKEN;
    game.contractVersion = 1;
    game.delayMs = 0;
    game.dbUp = true;
    game.seen = [];
    rmSync(gamesDir, { recursive: true, force: true });
    mkdirSync(gamesDir);
    await prisma.auditLog.deleteMany();
    await prisma.game.deleteMany();
    await prisma.session.deleteMany();
    await prisma.adminUser.deleteMany();
    const admin = await prisma.adminUser.create({ data: { username: 'chungcake69', passwordHash: 'x', totpSecretEnc: new Uint8Array(40), activated: true } });
    const raw = await app.get(SessionsService).create(admin.id, '127.0.0.1', 'test');
    cookie = `__Host-hub_session=${raw}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.game.deleteMany();
    await prisma.session.deleteMany();
    await prisma.adminUser.deleteMany();
    await app.close();
    await game.stop();
    rmSync(gamesDir, { recursive: true, force: true });
  });

  describe('game tự khai báo bằng file', () => {
    it('thả file <khóa>.json vào thư mục thì game tự hiện trong danh sách, không lộ token', async () => {
      manifest('fake.json', { key: 'fake', name: 'Fake', baseUrl: game.baseUrl, token: TOKEN });
      const list = await get('/games').expect(200);
      expect(list.body).toEqual([{ key: 'fake', name: 'Fake', baseUrl: game.baseUrl, contractVersion: 1 }]);
      expect(JSON.stringify(list.body)).not.toContain(TOKEN);
      const row = await prisma.game.findFirstOrThrow();
      expect(Buffer.from(row.tokenEnc).includes(Buffer.from(TOKEN))).toBe(false);
    });

    it('đổi token trong file thì lần sau dùng token mới; quét lại khi không đổi thì không gọi game nữa', async () => {
      manifest('fake.json', { key: 'fake', name: 'Fake', baseUrl: game.baseUrl, token: TOKEN });
      await get('/games').expect(200);
      game.seen = [];
      await get('/games').expect(200);
      expect(game.seen).toHaveLength(0);
      game.token = TOKEN2;
      manifest('fake.json', { key: 'fake', name: 'Fake 2', baseUrl: game.baseUrl, token: TOKEN2 });
      const list = await get('/games').expect(200);
      expect(list.body[0].name).toBe('Fake 2');
      expect((await get('/games/status')).body.games[0].state).toBe('ok');
    });

    it('file sai token, file hỏng, hoặc game chưa trả lời thì bỏ qua, không làm hỏng danh sách; file biến mất không xóa game', async () => {
      manifest('bad.json', { key: 'bad', name: 'Bad', baseUrl: game.baseUrl, token: 'c'.repeat(40) });
      writeFileSync(join(gamesDir, 'broken.json'), '{không phải json');
      manifest('short.json', { key: 'short', name: 'Short', baseUrl: game.baseUrl, token: 'ngan' });
      expect((await get('/games').expect(200)).body).toEqual([]);
      manifest('fake.json', { key: 'fake', name: 'Fake', baseUrl: game.baseUrl, token: TOKEN });
      expect((await get('/games').expect(200)).body).toHaveLength(1);
      rmSync(join(gamesDir, 'fake.json'));
      expect((await get('/games').expect(200)).body).toHaveLength(1);
    });
  });

  describe('đăng ký game (US-09)', () => {
    it('AC-09.1: khai báo đúng thì game xuất hiện trong danh sách; token lưu mã hóa và không bao giờ trả ra', async () => {
      const res = await register().expect(201);
      expect(JSON.stringify(res.body)).not.toContain(TOKEN);
      const list = await get('/games').expect(200);
      expect(list.body).toEqual([{ key: 'fake', name: 'Fake', baseUrl: game.baseUrl, contractVersion: 1 }]);
      expect(JSON.stringify(list.body)).not.toContain(TOKEN);
      const row = await prisma.game.findFirstOrThrow();
      expect(Buffer.from(row.tokenEnc).includes(Buffer.from(TOKEN))).toBe(false); // không lưu chữ rõ
    });

    it('AC-09.4 (E1, BR32): sai token thì không lưu khai báo; hub chưa đăng nhập thì 401', async () => {
      const res = await register({ token: 'c'.repeat(40) }).expect(422);
      expect(res.body.error.message).toContain('sai token');
      expect(await prisma.game.count()).toBe(0);
      await register({ token: 'ngan' }).expect(422);
      await request(server()).get('/games').expect(401);
    });

    it('AC-09.5 (E2, BR33): địa chỉ không với tới được và hợp đồng sai phiên bản bị từ chối với lý do khác nhau', async () => {
      const unreachable = await register({ baseUrl: 'http://127.0.0.1:1' }).expect(422);
      game.contractVersion = 99;
      const wrongVersion = await register().expect(422);
      expect(unreachable.body.error.message).not.toBe(wrongVersion.body.error.message);
      expect(unreachable.body.error.message).toContain('Không nối được');
      expect(wrongVersion.body.error.message).toContain('99');
      expect(await prisma.game.count()).toBe(0);
    });

    it('địa chỉ có đường dẫn hoặc khóa game sai định dạng bị từ chối; khóa trùng bị 409', async () => {
      await register({ baseUrl: `${game.baseUrl}/admin-api` }).expect(422);
      await register({ gameKey: 'Fake Game' }).expect(422);
      await register().expect(201);
      await register().expect(409);
    });

    it('AC-09.2 (A1, BR34): đổi token thì dùng được ngay, token cũ hết tác dụng, token không lộ ở phản hồi hay nhật ký', async () => {
      await register().expect(201);
      game.token = TOKEN2;
      const failed = await send('put', '/games/fake/token', { token: 'd'.repeat(40) }).expect(422); // game không chấp nhận
      expect(JSON.stringify(failed.body)).not.toContain('d'.repeat(40));
      const rotated = await send('put', '/games/fake/token', { token: TOKEN2 }).expect(200);
      expect(JSON.stringify(rotated.body)).not.toContain(TOKEN2);
      game.seen = [];
      await get('/games/fake/admin/vocabularies').expect(200);
      expect(game.seen[0].auth).toBe(`Bearer ${TOKEN2}`);
    });

    it('AC-09.3 (A2): gỡ game khỏi dashboard chỉ xóa khai báo, game không bị gọi thêm lệnh nào', async () => {
      await register().expect(201);
      game.seen = [];
      await send('delete', '/games/fake').expect(200);
      expect((await get('/games').expect(200)).body).toEqual([]);
      expect(game.seen).toHaveLength(0);
      await get('/games/fake/admin/meta').expect(404);
    });
  });

  describe('trạng thái các game (US-08)', () => {
    it('AC-08.1: thẻ game có trạng thái, phiên bản, thời gian chạy và RAM; MySQL của hub báo up', async () => {
      await register().expect(201);
      const res = await get('/games/status').expect(200);
      expect(res.body.hub).toEqual({ db: 'up' });
      expect(res.body.games[0]).toMatchObject({ key: 'fake', state: 'ok', version: '1.0.0', uptimeSec: 42, rssMb: 100, db: 'up' });
    });

    it('AC-08.3 (E1, BR30): một game treo thì thẻ đó "không phản hồi", trang trả đủ trong khoảng hạn chờ; game khác bình thường', async () => {
      const slow = new FakeGame();
      await slow.start();
      await register().expect(201);
      await register({ gameKey: 'slow', name: 'Slow', baseUrl: slow.baseUrl }).expect(201);
      slow.delayMs = 3000;
      const t0 = Date.now();
      const res = await get('/games/status').expect(200);
      const took = Date.now() - t0;
      expect(took).toBeLessThan(1500);
      expect(res.body.games.find((g: { key: string }) => g.key === 'slow').state).toBe('unreachable');
      expect(res.body.games.find((g: { key: string }) => g.key === 'fake').state).toBe('ok');
      await slow.stop();
    });

    it('AC-08.4 (E2): database của game lỗi thì thẻ ghi "error" kèm lý do ngắn', async () => {
      await register().expect(201);
      game.dbUp = false;
      const res = await get('/games/status').expect(200);
      expect(res.body.games[0]).toMatchObject({ state: 'error', db: 'down' });
      expect(res.body.games[0].message).toContain('Database');
    });
  });

  describe('chuyển lệnh sang game và nhật ký (US-04, BR13, BR15)', () => {
    beforeEach(async () => {
      await register().expect(201);
      game.seen = [];
    });

    it('đọc: chuyển đường dẫn và chuỗi truy vấn nguyên vẹn, kèm token; không ghi nhật ký cho lệnh đọc', async () => {
      const res = await get('/games/fake/admin/vocabularies?page=2&filter[topicSlug]=a').expect(200);
      expect(res.body.echo).toBe('/admin-api/vocabularies?page=2&filter[topicSlug]=a');
      expect(game.seen[0].auth).toBe(`Bearer ${TOKEN}`);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('AC-04.3: lệnh sửa được ghi nhật ký started rồi succeeded, đúng admin, game, bảng, mã bản ghi, thao tác', async () => {
      await send('put', '/games/fake/admin/vocabularies/7', { meaningVi: 'x' }).expect(200);
      const log = await prisma.auditLog.findFirstOrThrow({ include: { admin: true, game: true } });
      expect(log).toMatchObject({ resource: 'vocabularies', recordId: '7', action: 'update', status: 'succeeded' });
      expect(log.admin.username).toBe('chungcake69');
      expect(log.game?.gameKey).toBe('fake');
      expect(game.seen[0].body).toBe(JSON.stringify({ meaningVi: 'x' }));
    });

    it('AC-04.7 (E2, BR13): luật của game từ chối (422) thì dashboard trả nguyên lỗi theo trường và nhật ký ghi failed', async () => {
      const res = await send('post', '/games/fake/admin/vocabularies', { headword: 'ball' }).expect(422);
      expect(res.body.error.fields).toEqual([{ name: 'headword', message: 'trùng' }]);
      expect((await prisma.auditLog.findFirstOrThrow()).status).toBe('failed');
    });

    it('A1: lệnh xóa được ghi nhật ký thao tác delete', async () => {
      await send('delete', '/games/fake/admin/vocabularies/7').expect(200);
      expect(await prisma.auditLog.findFirstOrThrow()).toMatchObject({ action: 'delete', recordId: '7' });
    });

    it('AC-04.6 (E1): game tắt thì trả 504 "không phản hồi" trong hạn chờ, nhật ký ghi failed, game khác không ảnh hưởng', async () => {
      game.delayMs = 3000;
      const t0 = Date.now();
      const res = await send('put', '/games/fake/admin/vocabularies/7', { meaningVi: 'x' }).expect(504);
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(res.body.error.code).toBe('game_unreachable');
      expect((await prisma.auditLog.findFirstOrThrow()).status).toBe('failed');
    });

    it('AC-04.12 (BR15): không ghi được nhật ký thì từ chối và game KHÔNG bị gọi', async () => {
      const spy = vi.spyOn(app.get(AuditService), 'start').mockRejectedValueOnce(new Error('db down'));
      const res = await send('put', '/games/fake/admin/vocabularies/7', { meaningVi: 'x' }).expect(500);
      expect(res.body.error.code).toBe('audit_failed');
      expect(game.seen).toHaveLength(0);
      spy.mockRestore();
    });

    it('BR44: đường nhập nhận thân JSON lớn (1MB) và chuyển nguyên vẹn; mọi đường khác vẫn giới hạn 16KB', async () => {
      const content = 'x'.repeat(1024 * 1024);
      await send('post', '/games/fake/admin/vocabularies/import?dryRun=true', { format: 'csv', content }).expect(200);
      expect(game.seen[0].body.length).toBeGreaterThan(1024 * 1024);
      const log = await prisma.auditLog.findFirstOrThrow();
      expect(log).toMatchObject({ resource: 'vocabularies', action: 'import', recordId: null });
      await send('put', '/games/fake/admin/vocabularies/7', { meaningVi: 'x'.repeat(20_000) }).expect(413);
      await send('post', '/games/fake/admin/vocabularies/import?dryRun=true', { format: 'csv', content: 'x'.repeat(8 * 1024 * 1024) }).expect(413);
    });

    it('thao tác riêng được ghi nhật ký đúng: duyệt báo lỗi (có mã bản ghi) và đặt lại luật (cả tài nguyên, không mã)', async () => {
      await send('post', '/games/fake/admin/vocabularies/5/actions/approve', {}).expect(200);
      await send('post', '/games/fake/admin/vocabularies/actions/reset-defaults', { option: 'hearts' }).expect(200);
      const logs = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
      expect(logs.map((l) => [l.action, l.recordId])).toEqual([['approve', '5'], ['reset-defaults', null]]);
    });

    it('chưa đăng nhập hoặc game chưa nối thì không chuyển được', async () => {
      await request(server()).get('/games/fake/admin/vocabularies').expect(401);
      await get('/games/khong-co/admin/vocabularies').expect(404);
    });
  });
});
