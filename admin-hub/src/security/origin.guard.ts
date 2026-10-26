import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Request } from 'express';
import { HUB_ENV, type HubEnv } from '../config/env.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * BR44 / E5: lệnh ghi chỉ nhận khi Origin trùng đúng địa chỉ dashboard và nội dung là JSON.
 * Cookie SameSite=Strict là lớp thứ nhất, lớp này là lớp thứ hai.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(HUB_ENV) private readonly env: HubEnv) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;
    if (req.headers.origin !== this.env.origin) throw new ForbiddenException('Origin không hợp lệ');
    if (!req.is('application/json')) throw new UnsupportedMediaTypeException('Chỉ nhận nội dung JSON');
    return true;
  }
}
