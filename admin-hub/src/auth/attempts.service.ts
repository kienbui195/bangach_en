import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { HUB_ENV, type HubEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Đếm thử sai theo IP: tối đa N lần mỗi cửa sổ, quá thì khóa đúng một cửa sổ (BR10). Không có khóa toàn cục. */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(HUB_ENV) private readonly env: HubEnv,
  ) {}

  async isLocked(ipKey: string): Promise<boolean> {
    const row = await this.prisma.loginAttempt.findUnique({ where: { ipKey } });
    return !!row?.lockedUntil && row.lockedUntil > this.clock.now();
  }

  async recordFailure(ipKey: string): Promise<void> {
    const now = this.clock.now();
    const row = await this.prisma.loginAttempt.findUnique({ where: { ipKey } });
    const expired = !row || now.getTime() - row.windowStartedAt.getTime() > this.env.loginWindowMs;
    const failCount = expired ? 1 : row.failCount + 1;
    const lockedUntil = failCount >= this.env.loginMaxFails ? new Date(now.getTime() + this.env.loginWindowMs) : null;
    const data = { failCount, windowStartedAt: expired ? now : row.windowStartedAt, lockedUntil };
    await this.prisma.loginAttempt.upsert({ where: { ipKey }, create: { ipKey, ...data }, update: data });
  }

  async reset(ipKey: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { ipKey } });
  }
}
