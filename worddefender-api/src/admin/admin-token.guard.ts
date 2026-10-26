import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { safeEqual } from '../security/safe-equal.js';

export const ADMIN_API_TOKEN = Symbol('ADMIN_API_TOKEN');

/**
 * BR31, BR32: giao diện quản trị chỉ dành cho dashboard trong mạng Docker.
 * - Phải có `Authorization: Bearer <token dịch vụ>` (token tối thiểu 32 ký tự; chưa cấu hình thì từ chối hết).
 * - Từ chối yêu cầu mang dấu vết đi qua Cloudflare/Caddy (CF-Connecting-IP, X-Forwarded-For): lớp phòng thủ thứ hai
 *   phòng khi có người vô tình định tuyến /admin-api ra ngoài.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(@Inject(ADMIN_API_TOKEN) private readonly token: string | undefined) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) {
      throw new UnauthorizedException({ error: { code: 'unauthorized', message: 'Không hợp lệ' } });
    }
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    const ok =
      !!this.token &&
      this.token.length >= 32 &&
      safeEqual(given, this.token);
    if (!ok) throw new UnauthorizedException({ error: { code: 'unauthorized', message: 'Sai hoặc thiếu token dịch vụ' } });
    return true;
  }
}
