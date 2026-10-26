import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthService } from '../src/auth/auth.service.js';
import { Clock } from '../src/clock/clock.js';
import { HUB_ENV, type HubEnv } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ORIGIN = 'https://admin.test';
const PW = 'Tr0ng-Mat#Khau!Bitwarden-2026'; // >= 16 ký tự, có ký tự đặc biệt
const START = new Date('2026-10-26T10:00:00.000Z');

class FakeClock extends Clock {
  t = START.getTime();
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const code = (secret: string, at: Date) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: at.getTime() });

describe('Đăng nhập admin (US-03)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  const clock = new FakeClock();
  let dir: string;
  let env: HubEnv;

  const server = () => app.getHttpServer();
  const post = (path: string, body: object = {}, headers: Record<string, string> = {}) =>
    request(server()).post(path).set('Origin', ORIGIN).set('Content-Type', 'application/json').set(headers).send(body);
  const ipH = (ip: string) => ({ 'CF-Connecting-IP': ip });

  const writeToken = (file: string, token: string) => writeFileSync(file, token, { mode: 0o600 });
  const setupToken = () => readFileSync(env.setupTokenFile, 'utf8').trim();

  /** Thiết lập lần đầu và trả về { secret, cookie }. */
  async function setupAdmin(username = 'chungcake69') {
    await auth.ensureSetupToken(writeToken);
    const begin = await post('/setup/begin', { setupToken: setupToken(), username, password: PW }, ipH('1.1.1.1')).expect(200);
    const secret = begin.body.secret as string;
    const confirm = await post('/setup/confirm', { username, code: code(secret, clock.now()) }, ipH('1.1.1.1')).expect(200);
    return { secret, cookie: confirm.headers['set-cookie'] as unknown as string[] };
  }

  /** Đăng nhập đủ hai bước ở thời điểm hiện tại của đồng hồ giả; trả về cookie. */
  async function login(secret: string, ip = '2.2.2.2') {
    const step1 = await post('/auth/login', { username: 'chungcake69', password: PW }, ipH(ip)).expect(200);
    const step2 = await post('/auth/totp', { challenge: step1.body.challenge, code: code(secret, clock.now()) }, ipH(ip)).expect(200);
    return step2.headers['set-cookie'] as unknown as string[];
  }

  const cookieHeader = (c: string[]) => c.map((x) => x.split(';')[0]).join('; ');

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hub-test-'));
    env = {
      origin: ORIGIN,
      cookieSecure: true,
      masterKey: randomBytes(32),
      setupTokenFile: join(dir, 'hub.setup-token'),
      loginMaxFails: 5,
      loginWindowMs: 15 * 60_000,
      sessionIdleMs: 30 * 60_000,
      sessionMaxMs: 12 * 3_600_000,
      passwordMin: 16,
      passwordMax: 128,
      challengeMs: 5 * 60_000,
      gameTimeoutMs: 3000,
      supportedContracts: [1],
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HUB_ENV)
      .useValue(env)
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  beforeEach(async () => {
    clock.t = START.getTime();
    await prisma.session.deleteMany();
    await prisma.loginAttempt.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.adminUser.deleteMany();
    rmSync(env.setupTokenFile, { force: true });
  });

  afterAll(async () => {
    await prisma.session.deleteMany();
    await prisma.loginAttempt.deleteMany();
    await prisma.adminUser.deleteMany();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('thiết lập lần đầu (A1, BR43, BR45)', () => {
    it('AC-03.10: nhập đúng mã thiết lập, đặt tài khoản, quét QR, nhập mã đầu thì kích hoạt, hủy mã thiết lập và đóng trang vĩnh viễn', async () => {
      expect((await request(server()).get('/auth/status').expect(200)).body).toEqual({ needsSetup: true });
      const { cookie } = await setupAdmin();
      expect(existsSync(env.setupTokenFile)).toBe(false);
      expect((await request(server()).get('/auth/status')).body).toEqual({ needsSetup: false });
      await post('/setup/begin', { setupToken: 'bat-ky', username: 'khac', password: PW }).expect(404);
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(cookie)).expect(200);
      const admin = await prisma.adminUser.findFirstOrThrow();
      expect(admin.activated).toBe(true);
      expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(admin.totpSecretEnc.length).toBeGreaterThan(28); // iv + tag + dữ liệu, không phải chữ rõ
    });

    it('AC-03.12: sai hoặc thiếu mã thiết lập bị từ chối, không tạo gì và tính vào giới hạn thử sai', async () => {
      await auth.ensureSetupToken(writeToken);
      await post('/setup/begin', { setupToken: 'sai', username: 'chungcake69', password: PW }, ipH('9.9.9.9')).expect(403);
      await post('/setup/begin', { username: 'chungcake69', password: PW }, ipH('9.9.9.9')).expect(403);
      expect(await prisma.adminUser.count()).toBe(0);
      expect((await prisma.loginAttempt.findFirstOrThrow({ where: { ipKey: '9.9.9.9' } })).failCount).toBe(2);
    });

    it('AC-03.13: đóng trang giữa chừng thì tài khoản chưa kích hoạt, không đăng nhập được, và làm lại được với mã thiết lập cũ', async () => {
      await auth.ensureSetupToken(writeToken);
      const token = setupToken();
      const begin = await post('/setup/begin', { setupToken: token, username: 'chungcake69', password: PW }).expect(200);
      expect(begin.body.secret).toBeTruthy();
      await post('/auth/login', { username: 'chungcake69', password: PW }).expect(401);
      const again = await post('/setup/begin', { setupToken: token, username: 'chungcake69', password: PW }).expect(200);
      expect(again.body.secret).not.toBe(begin.body.secret);
      expect(existsSync(env.setupTokenFile)).toBe(true);
      await post('/setup/confirm', { username: 'chungcake69', code: '000000' }).expect(401);
      expect((await prisma.adminUser.findFirstOrThrow()).activated).toBe(false);
    });

    it('mật khẩu dưới 16 ký tự bị từ chối ngay ở thiết lập (BR9)', async () => {
      await auth.ensureSetupToken(writeToken);
      await post('/setup/begin', { setupToken: setupToken(), username: 'chungcake69', password: 'ngan-qua-15-kt!' }).expect(422);
    });
  });

  describe('đăng nhập (luồng lõi)', () => {
    it('AC-03.1: đúng tên, mật khẩu và mã thì vào được; cookie có __Host-, HttpOnly, Secure, SameSite=Strict', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      const cookie = await login(secret);
      const raw = cookie.join('; ');
      expect(raw).toContain('__Host-hub_session=');
      expect(raw).toContain('HttpOnly');
      expect(raw).toContain('Secure');
      expect(raw).toContain('SameSite=Strict');
      expect(raw).toContain('Path=/');
      expect(raw).not.toContain('Domain=');
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(cookie)).expect(200).expect({ username: 'chungcake69' });
      // DB chỉ lưu băm của mã phiên
      const stored = await prisma.session.findMany();
      const value = cookie[0].split(';')[0].split('=')[1];
      expect(stored.every((s) => s.id !== value && s.id.length === 64)).toBe(true);
    });

    it('AC-03.4: sai mật khẩu và sai tên đăng nhập nhận cùng một thông báo chung', async () => {
      await setupAdmin();
      const wrongPw = await post('/auth/login', { username: 'chungcake69', password: 'sai-mat-khau-nhung-du-dai!!' }, ipH('3.3.3.3')).expect(401);
      const wrongUser = await post('/auth/login', { username: 'khong-ton-tai', password: PW }, ipH('3.3.3.4')).expect(401);
      expect(wrongPw.body.message).toBe(wrongUser.body.message);
    });

    it('AC-03.7 (BR12): không có cookie thì mọi đường quản trị trả 401', async () => {
      await request(server()).get('/auth/me').expect(401);
      await post('/auth/logout').expect(401);
      await post('/auth/password', { currentPassword: 'a', newPassword: 'b' }).expect(401);
    });

    it('AC-03.3 (A4): đăng xuất rồi dùng lại cookie cũ thì 401', async () => {
      const { cookie } = await setupAdmin();
      await post('/auth/logout', {}, { Cookie: cookieHeader(cookie) }).expect(200);
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(cookie)).expect(401);
    });
  });

  describe('mã Authenticator (E4, BR42)', () => {
    it('AC-03.8: mã sai, mã quá hạn hơn một bước và mã trống đều bị từ chối, không có phiên, mỗi lần tính một lần thử sai', async () => {
      const { secret } = await setupAdmin();
      clock.advance(120_000);
      const step1 = await post('/auth/login', { username: 'chungcake69', password: PW }, ipH('4.4.4.4')).expect(200);
      const old = code(secret, new Date(clock.t - 120_000)); // 4 bước trước
      for (const bad of ['000000', old, '']) {
        await post('/auth/totp', { challenge: step1.body.challenge, code: bad }, ipH('4.4.4.4')).expect(401);
      }
      expect((await prisma.loginAttempt.findFirstOrThrow({ where: { ipKey: '4.4.4.4' } })).failCount).toBe(3);
      expect(await prisma.session.count({ where: { ip: '4.4.4.4' } })).toBe(0);
    });

    it('AC-03.9: mã vừa dùng không dùng lại được trong cùng chu kỳ; mã chu kỳ sau thì được', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      await login(secret, '5.5.5.5'); // dùng mã của bước hiện tại
      const step1 = await post('/auth/login', { username: 'chungcake69', password: PW }, ipH('5.5.5.6')).expect(200);
      await post('/auth/totp', { challenge: step1.body.challenge, code: code(secret, clock.now()) }, ipH('5.5.5.6')).expect(401);
      clock.advance(30_000);
      await post('/auth/totp', { challenge: step1.body.challenge, code: code(secret, clock.now()) }, ipH('5.5.5.6')).expect(200);
    });

    it('thử thách đăng nhập hết hạn sau 5 phút hoặc bị sửa thì không dùng được', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      const step1 = await post('/auth/login', { username: 'chungcake69', password: PW }, ipH('6.6.6.6')).expect(200);
      const forged = step1.body.challenge.replace(/^\d+/, '999');
      await post('/auth/totp', { challenge: forged, code: code(secret, clock.now()) }, ipH('6.6.6.6')).expect(401);
      clock.advance(5 * 60_000 + 1000);
      await post('/auth/totp', { challenge: step1.body.challenge, code: code(secret, clock.now()) }, ipH('6.6.6.6')).expect(401);
    });
  });

  describe('giới hạn thử sai theo IP (E2, BR10)', () => {
    it('AC-03.5: 4 lần sai chưa khóa; lần sai thứ 5 thì khóa 15 phút kể cả nhập đúng; IP khác không bị khóa theo; hết 15 phút thì vào được', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      const bad = { username: 'chungcake69', password: 'sai-mat-khau-nhung-du-dai!!' };
      for (let i = 0; i < 4; i++) await post('/auth/login', bad, ipH('7.7.7.7')).expect(401);
      // sau 4 lần sai, nhập đúng vẫn vào được
      await login(secret, '7.7.7.7');
      await prisma.loginAttempt.deleteMany(); // login thành công đã xóa đếm; dựng lại 5 lần sai
      for (let i = 0; i < 5; i++) await post('/auth/login', bad, ipH('7.7.7.8')).expect(401);
      await post('/auth/login', { username: 'chungcake69', password: PW }, ipH('7.7.7.8')).expect(429);
      await post('/auth/login', { username: 'chungcake69', password: PW }, ipH('7.7.7.9')).expect(200); // IP khác
      clock.advance(15 * 60_000 + 1000);
      await post('/auth/login', { username: 'chungcake69', password: PW }, ipH('7.7.7.8')).expect(200);
    });
  });

  describe('phiên (E3, BR11)', () => {
    it('AC-03.6: im lặng 29 phút còn phiên, 31 phút hết; phiên hoạt động liên tục quá 12 giờ cũng hết', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      const c1 = await login(secret, '8.8.8.1');
      clock.advance(29 * 60_000);
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(c1)).expect(200);
      clock.advance(31 * 60_000);
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(c1)).expect(401);

      clock.advance(31_000);
      const c2 = await login(secret, '8.8.8.2');
      for (let i = 0; i < 24; i++) {
        clock.advance(29 * 60_000);
        await request(server()).get('/auth/me').set('Cookie', cookieHeader(c2)).expect(200);
      } // 11 giờ 36 phút, vẫn hoạt động
      clock.advance(29 * 60_000); // quá 12 giờ kể từ lúc đăng nhập
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(c2)).expect(401);
    });
  });

  describe('đổi mật khẩu (A3, BR9)', () => {
    it('AC-03.2: 15 và 129 ký tự bị từ chối; 16 ký tự gồm nhiều ký tự đặc biệt được nhận; đăng nhập lại được; phiên khác bị hủy', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      const a = await login(secret, '9.1.1.1');
      clock.advance(30_000);
      const b = await login(secret, '9.1.1.2');
      const call = (np: string) => post('/auth/password', { currentPassword: PW, newPassword: np }, { Cookie: cookieHeader(a) });
      await call('a'.repeat(15)).expect(422);
      await call('a'.repeat(129)).expect(422);
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?'.slice(0, 16);
      expect([...special].length).toBe(16);
      await call(special).expect(200);
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(a)).expect(200); // phiên hiện tại giữ
      await request(server()).get('/auth/me').set('Cookie', cookieHeader(b)).expect(401); // phiên khác bị hủy
      clock.advance(30_000);
      const step1 = await post('/auth/login', { username: 'chungcake69', password: special }, ipH('9.1.1.3')).expect(200);
      await post('/auth/totp', { challenge: step1.body.challenge, code: code(secret, clock.now()) }, ipH('9.1.1.3')).expect(200);
    });

    it('mật khẩu Unicode đúng 16 ký tự (nhiều byte hơn 16) được nhận; 128 ký tự được nhận', async () => {
      const { secret } = await setupAdmin();
      clock.advance(31_000);
      const a = await login(secret, '9.2.2.2');
      const call = (np: string) => post('/auth/password', { currentPassword: PW, newPassword: np }, { Cookie: cookieHeader(a) });
      await call('Ấ'.repeat(16)).expect(200);
      // cần mật khẩu hiện tại mới để lần gọi kế tiếp
      const p2 = await post('/auth/password', { currentPassword: 'Ấ'.repeat(16), newPassword: 'x'.repeat(128) }, { Cookie: cookieHeader(a) });
      expect(p2.status).toBe(200);
    });
  });

  describe('Origin và nội dung (E5, BR44)', () => {
    it('AC-03.11: Origin lạ và nội dung không phải JSON bị từ chối; thân vượt 16KB bị từ chối', async () => {
      await request(server()).post('/auth/login').set('Origin', 'https://evil.example').set('Content-Type', 'application/json').send({}).expect(403);
      await request(server()).post('/auth/login').set('Content-Type', 'application/json').send({}).expect(403); // thiếu Origin
      await request(server()).post('/auth/login').set('Origin', ORIGIN).set('Content-Type', 'text/plain').send('x').expect(415);
      const big = { username: 'a', password: 'x'.repeat(17_000) };
      await post('/auth/login', big).expect(413);
    });

    it('thân đúng 16KB được nhận (không bị chặn ở tầng kích thước)', async () => {
      const filler = 'x'.repeat(16 * 1024 - JSON.stringify({ username: 'a', password: '' }).length);
      const body = { username: 'a', password: filler };
      expect(Buffer.byteLength(JSON.stringify(body))).toBe(16 * 1024);
      const res = await post('/auth/login', body, ipH('7.0.0.1'));
      expect(res.status).toBe(401); // qua được giới hạn kích thước, bị từ chối vì sai thông tin
    });
  });
});
