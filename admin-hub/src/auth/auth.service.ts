import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import QRCode from 'qrcode';
import { Clock } from '../clock/clock.js';
import { HUB_ENV, type HubEnv } from '../config/env.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AttemptsService } from './attempts.service.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';
import { TotpService } from './totp.service.js';

const GENERIC_LOGIN_ERROR = 'Sai thông tin đăng nhập';

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly attempts: AttemptsService,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
    @Inject(HUB_ENV) private readonly env: HubEnv,
  ) {}

  async needsSetup(): Promise<boolean> {
    return (await this.prisma.adminUser.count({ where: { activated: true } })) === 0;
  }

  private async assertNotLocked(ipKey: string) {
    if (await this.attempts.isLocked(ipKey)) {
      throw new HttpException('Thử sai quá nhiều lần, vui lòng thử lại sau', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async fail(ipKey: string, error: Error): Promise<never> {
    await this.attempts.recordFailure(ipKey);
    throw error;
  }

  // ---------------------------------------------------------------- thiết lập lần đầu (US-03 A1)

  private readSetupToken(): string | null {
    return existsSync(this.env.setupTokenFile) ? readFileSync(this.env.setupTokenFile, 'utf8').trim() : null;
  }

  /** Sinh mã thiết lập một lần nếu chưa có tài khoản nào hoạt động (BR43). Gọi khi khởi động. */
  async ensureSetupToken(write: (file: string, token: string) => void): Promise<boolean> {
    if (!(await this.needsSetup())) return false;
    if (this.readSetupToken()) return true;
    write(this.env.setupTokenFile, this.crypto.randomToken(32));
    return true;
  }

  async setupBegin(ipKey: string, input: { setupToken: string; username: string; password: string }) {
    if (!(await this.needsSetup())) throw new NotFoundException();
    await this.assertNotLocked(ipKey);
    const expected = this.readSetupToken();
    if (!expected || !this.crypto.safeEqual(input.setupToken ?? '', expected)) {
      return this.fail(ipKey, new ForbiddenException('Mã thiết lập không đúng'));
    }
    const username = (input.username ?? '').trim();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
      throw new HttpException('Tên đăng nhập gồm 3 đến 64 ký tự chữ, số, ".", "_", "-"', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const weak = this.passwords.validate(input.password ?? '');
    if (weak) throw new HttpException(weak, HttpStatus.UNPROCESSABLE_ENTITY);

    const secret = this.totp.newSecret();
    const data = {
      username,
      passwordHash: await this.passwords.hash(input.password),
      totpSecretEnc: new Uint8Array(this.crypto.encrypt(Buffer.from(secret.base32))),
      lastTotpStep: null,
      activated: false,
    };
    // Làm lại thiết lập: tài khoản chưa kích hoạt cũ bị thay (E7).
    await this.prisma.adminUser.deleteMany({ where: { activated: false } });
    await this.prisma.adminUser.create({ data });
    const otpauthUrl = this.totp.uri(secret.base32, username);
    return { otpauthUrl, secret: secret.base32, qr: await QRCode.toDataURL(otpauthUrl) };
  }

  /**
   * AC-03.14 (A2, BR42): đổi sang điện thoại mới. Chỉ chạy được bằng lệnh trong container (admin:reset-totp), không có đường HTTP.
   * Bí mật cũ bị thay nên mã của điện thoại cũ hết dùng được; mọi phiên đăng nhập đang mở bị thu hồi.
   */
  async resetTotp(username?: string) {
    const admins = await this.prisma.adminUser.findMany({ where: { activated: true, ...(username ? { username } : {}) } });
    if (admins.length === 0) throw new NotFoundException('Không có tài khoản admin nào đã kích hoạt');
    if (admins.length > 1) throw new HttpException('Có nhiều tài khoản, hãy chỉ định tên đăng nhập', HttpStatus.UNPROCESSABLE_ENTITY);
    const admin = admins[0];
    const secret = this.totp.newSecret();
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecretEnc: new Uint8Array(this.crypto.encrypt(Buffer.from(secret.base32))), lastTotpStep: null },
    });
    await this.sessions.revokeAll(admin.id);
    const otpauthUrl = this.totp.uri(secret.base32, admin.username);
    return { username: admin.username, otpauthUrl, secret: secret.base32 };
  }

  async setupConfirm(ipKey: string, input: { username: string; code: string }, ip: string, userAgent?: string) {
    if (!(await this.needsSetup())) throw new NotFoundException();
    await this.assertNotLocked(ipKey);
    const admin = await this.prisma.adminUser.findFirst({ where: { username: (input.username ?? '').trim(), activated: false } });
    if (!admin) return this.fail(ipKey, new UnauthorizedException('Mã xác thực không đúng'));
    const secret = this.crypto.decrypt(admin.totpSecretEnc).toString();
    const step = this.totp.verify(secret, String(input.code ?? ''), null, this.clock.now());
    if (step === null) return this.fail(ipKey, new UnauthorizedException('Mã xác thực không đúng'));

    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { activated: true, lastTotpStep: step } });
    if (existsSync(this.env.setupTokenFile)) unlinkSync(this.env.setupTokenFile);
    await this.attempts.reset(ipKey);
    return this.sessions.create(admin.id, ip, userAgent);
  }

  // ---------------------------------------------------------------- đăng nhập hai bước

  private async verifyPasswordConstantTime(hash: string | null, password: string): Promise<boolean> {
    // Luôn chạy một lần băm để thời gian trả lời không lộ tên đăng nhập có tồn tại hay không.
    if (!hash) {
      this.dummyHash ??= this.passwords.hash('dummy-password-for-timing');
      await this.passwords.verify(await this.dummyHash, password);
      return false;
    }
    return this.passwords.verify(hash, password);
  }

  /** Bước 1: tên + mật khẩu. Đúng thì trả về mã thử thách có chữ ký, hạn 5 phút. */
  async login(ipKey: string, input: { username: string; password: string }): Promise<string> {
    await this.assertNotLocked(ipKey);
    const admin = await this.prisma.adminUser.findFirst({ where: { username: (input.username ?? '').trim(), activated: true } });
    const ok = await this.verifyPasswordConstantTime(admin?.passwordHash ?? null, input.password ?? '');
    if (!admin || !ok) return this.fail(ipKey, new UnauthorizedException(GENERIC_LOGIN_ERROR));
    const exp = this.clock.now().getTime() + this.env.challengeMs;
    const payload = `${admin.id}.${exp}`;
    return `${payload}.${this.crypto.sign(payload)}`;
  }

  /** Bước 2: mã Authenticator. Đúng và chưa dùng thì tạo phiên. */
  async loginTotp(ipKey: string, input: { challenge: string; code: string }, ip: string, userAgent?: string): Promise<string> {
    await this.assertNotLocked(ipKey);
    const [id, exp, sig] = String(input.challenge ?? '').split('.');
    const payload = `${id}.${exp}`;
    if (!id || !exp || !sig || !this.crypto.safeEqual(sig, this.crypto.sign(payload)) || Number(exp) < this.clock.now().getTime()) {
      return this.fail(ipKey, new UnauthorizedException(GENERIC_LOGIN_ERROR));
    }
    const admin = await this.prisma.adminUser.findFirst({ where: { id: Number(id), activated: true } });
    if (!admin) return this.fail(ipKey, new UnauthorizedException(GENERIC_LOGIN_ERROR));
    const secret = this.crypto.decrypt(admin.totpSecretEnc).toString();
    const step = this.totp.verify(secret, String(input.code ?? ''), admin.lastTotpStep, this.clock.now());
    if (step === null) return this.fail(ipKey, new UnauthorizedException('Mã xác thực không đúng'));

    // Ghi bước đã dùng có điều kiện để hai yêu cầu cùng mã không cùng thành công.
    const claimed = await this.prisma.adminUser.updateMany({
      where: { id: admin.id, OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }] },
      data: { lastTotpStep: step },
    });
    if (claimed.count === 0) return this.fail(ipKey, new UnauthorizedException('Mã xác thực không đúng'));
    await this.attempts.reset(ipKey);
    return this.sessions.create(admin.id, ip, userAgent);
  }

  async changePassword(adminId: number, sessionId: string, input: { currentPassword: string; newPassword: string }) {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!(await this.passwords.verify(admin.passwordHash, input.currentPassword ?? ''))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }
    const weak = this.passwords.validate(input.newPassword ?? '');
    if (weak) throw new HttpException(weak, HttpStatus.UNPROCESSABLE_ENTITY);
    await this.prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash: await this.passwords.hash(input.newPassword) } });
    await this.sessions.revokeOthers(adminId, sessionId);
  }
}
