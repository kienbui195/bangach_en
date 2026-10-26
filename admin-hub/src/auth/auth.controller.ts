import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { HUB_ENV, type HubEnv } from '../config/env.js';
import { clientIp, ipKey } from '../security/client-ip.js';
import { clearSessionCookie, setSessionCookie } from '../security/cookie.js';
import { type AuthedRequest, SessionGuard } from '../security/session.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

const who = (req: Request) => {
  const ip = clientIp(req);
  return { ip, key: ipKey(ip), ua: req.headers['user-agent'] };
};

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    @Inject(HUB_ENV) private readonly env: HubEnv,
  ) {}

  /** Giao diện hỏi để biết hiện trang thiết lập hay trang đăng nhập. */
  @Get('auth/status')
  async status() {
    return { needsSetup: await this.auth.needsSetup() };
  }

  @Post('setup/begin')
  @HttpCode(200)
  setupBegin(@Req() req: Request, @Body() body: { setupToken: string; username: string; password: string }) {
    return this.auth.setupBegin(who(req).key, body);
  }

  @Post('setup/confirm')
  @HttpCode(200)
  async setupConfirm(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { username: string; code: string }) {
    const w = who(req);
    const raw = await this.auth.setupConfirm(w.key, body, w.ip, w.ua);
    setSessionCookie(res, this.env, raw);
    return { ok: true };
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(@Req() req: Request, @Body() body: { username: string; password: string }) {
    return { challenge: await this.auth.login(who(req).key, body) };
  }

  @Post('auth/totp')
  @HttpCode(200)
  async totp(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { challenge: string; code: string }) {
    const w = who(req);
    const raw = await this.auth.loginTotp(w.key, body, w.ip, w.ua);
    setSessionCookie(res, this.env, raw);
    return { ok: true };
  }

  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(req.admin.sessionId);
    clearSessionCookie(res, this.env);
    return { ok: true };
  }

  @Post('auth/password')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async password(@Req() req: AuthedRequest, @Body() body: { currentPassword: string; newPassword: string }) {
    await this.auth.changePassword(req.admin.adminId, req.admin.sessionId, body);
    return { ok: true };
  }

  @Get('auth/me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthedRequest) {
    return { username: req.admin.username };
  }
}
