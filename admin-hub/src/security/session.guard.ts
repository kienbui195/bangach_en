import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionsService } from '../auth/sessions.service.js';
import { sessionCookieName } from './cookie.js';
import { Inject } from '@nestjs/common';
import { HUB_ENV, type HubEnv } from '../config/env.js';

export interface AuthedRequest extends Request {
  admin: { adminId: number; sessionId: string; username: string };
}

/** BR12: mọi đường quản trị đều đòi phiên hợp lệ. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    @Inject(HUB_ENV) private readonly env: HubEnv,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const raw = (req.cookies as Record<string, string> | undefined)?.[sessionCookieName(this.env)];
    const admin = await this.sessions.validate(raw);
    if (!admin) throw new UnauthorizedException('Chưa đăng nhập hoặc phiên đã hết hạn');
    req.admin = admin;
    return true;
  }
}
