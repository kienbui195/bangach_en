import { All, Body, Controller, Delete, Get, HttpCode, HttpException, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { type AuthedRequest, SessionGuard } from '../security/session.guard.js';
import { GameClient, GameUnreachableError } from './game-client.js';
import { GamesService } from './games.service.js';

/** Từ đường dẫn tới game suy ra tài nguyên, bản ghi và thao tác để ghi nhật ký. */
export function describeWrite(method: string, path: string): { resource: string; recordId: string | null; action: string } {
  const seg = path.split('/').filter(Boolean);
  const resource = seg[0] ?? '';
  if (seg[1] === 'import') return { resource, recordId: null, action: 'import' };
  if (seg[2] === 'actions' && seg[3]) return { resource, recordId: seg[1], action: seg[3] };
  const recordId = seg[1] ?? null;
  return { resource, recordId, action: method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update' };
}

@Controller('games')
@UseGuards(SessionGuard)
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly client: GameClient,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.games.list();
  }

  @Get('status')
  status() {
    return this.games.statusAll();
  }

  @Post()
  register(@Body() body: { gameKey: string; name: string; baseUrl: string; token: string }) {
    return this.games.register(body);
  }

  @Put(':key/token')
  rotate(@Param('key') key: string, @Body() body: { token: string }) {
    return this.games.rotateToken(key, body.token);
  }

  @Delete(':key')
  unregister(@Param('key') key: string) {
    return this.games.unregister(key);
  }

  /**
   * Chuyển lệnh sang /admin-api của game. Lệnh ghi được ghi nhật ký `started` TRƯỚC khi gọi (BR15);
   * không ghi được thì không gọi game. Luật nghiệp vụ do game xử lý, kết quả của game được trả nguyên (BR13).
   */
  @All(':key/admin/*path')
  @HttpCode(200)
  async forward(@Param('key') key: string, @Param('path') pathParts: string[] | string, @Req() req: AuthedRequest & Request, @Res() res: Response) {
    const path = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;
    const { game, token } = await this.games.find(key);
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
    const isWrite = !['GET', 'HEAD'].includes(req.method);

    let auditId: number | null = null;
    if (isWrite) {
      try {
        auditId = await this.audit.start({ adminId: req.admin.adminId, gameId: game.id, ...describeWrite(req.method, path) });
      } catch {
        throw new HttpException({ error: { code: 'audit_failed', message: 'Không ghi được nhật ký nên thao tác không được thực hiện' } }, 500);
      }
    }

    try {
      const hasBody = isWrite && req.body !== undefined && Object.keys(req.body as object).length > 0;
      const result = await this.client.call(game.baseUrl, token, req.method, path, query, hasBody ? req.body : undefined);
      if (auditId !== null) await this.audit.finish(auditId, result.status < 400).catch(() => undefined);
      res.status(result.status).json(result.body);
    } catch (e) {
      if (auditId !== null) await this.audit.finish(auditId, false).catch(() => undefined);
      if (e instanceof GameUnreachableError) {
        res.status(504).json({ error: { code: 'game_unreachable', message: e.message } });
        return;
      }
      throw e;
    }
  }
}
