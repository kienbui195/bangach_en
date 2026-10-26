import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { HUB_ENV, type HubEnv } from '../config/env.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly clock: Clock,
    @Inject(HUB_ENV) private readonly env: HubEnv,
  ) {}

  /** Tạo phiên; trả về mã phiên gốc (chỉ đặt vào cookie, DB chỉ lưu băm). */
  async create(adminId: number, ip: string, userAgent: string | undefined): Promise<string> {
    const raw = this.crypto.randomToken(32);
    const now = this.clock.now();
    await this.prisma.session.create({
      data: { id: this.crypto.sha256Hex(raw), adminId, createdAt: now, lastSeenAt: now, ip, userAgent: userAgent?.slice(0, 255) },
    });
    return raw;
  }

  /** BR11: nhàn rỗi tối đa 30 phút, tối đa 12 giờ kể từ lúc đăng nhập. Phiên hợp lệ được gia hạn nhàn rỗi. */
  async validate(raw: string | undefined): Promise<{ adminId: number; sessionId: string; username: string } | null> {
    if (!raw) return null;
    const id = this.crypto.sha256Hex(raw);
    const s = await this.prisma.session.findUnique({ where: { id }, include: { admin: true } });
    if (!s || !s.admin.activated) return null;
    const now = this.clock.now().getTime();
    if (now - s.createdAt.getTime() > this.env.sessionMaxMs || now - s.lastSeenAt.getTime() > this.env.sessionIdleMs) {
      await this.prisma.session.delete({ where: { id } }).catch(() => undefined);
      return null;
    }
    await this.prisma.session.update({ where: { id }, data: { lastSeenAt: this.clock.now() } });
    return { adminId: s.adminId, sessionId: id, username: s.admin.username };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeOthers(adminId: number, keepSessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { adminId, NOT: { id: keepSessionId } } });
  }

  async revokeAll(adminId: number): Promise<void> {
    await this.prisma.session.deleteMany({ where: { adminId } });
  }
}
