import { ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_ENV, type HubEnv } from '../config/env.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GameClient, GameUnreachableError } from './game-client.js';

const KEY = /^[a-z][a-z0-9_-]{1,49}$/;
const BASE_URL = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

const bad = (message: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ error: { code: 'validation', message } }, status);

export interface GameStatus {
  key: string;
  name: string;
  state: 'ok' | 'unreachable' | 'error';
  version?: string;
  uptimeSec?: number;
  rssMb?: number;
  db?: string;
  message?: string;
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly client: GameClient,
    @Inject(HUB_ENV) private readonly env: HubEnv,
  ) {}

  /**
   * Game tự khai báo bằng file `<khóa>.json` ({ key, name, baseUrl, token }) trong HUB_GAMES_DIR.
   * Game chưa có thì thêm, game có mà địa chỉ/tên/token đổi thì cập nhật; file lỗi hoặc game chưa trả lời thì bỏ qua,
   * lần quét sau thử lại. Không bao giờ xóa game vì file biến mất (gỡ bằng thao tác gỡ của admin).
   */
  async syncManifests(): Promise<void> {
    const dir = this.env.gamesDir;
    if (!dir || !existsSync(dir)) return;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const m = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { key?: string; name?: string; baseUrl?: string; token?: string };
        const gameKey = String(m.key ?? '').trim();
        const name = String(m.name ?? '').trim();
        const baseUrl = String(m.baseUrl ?? '').trim().replace(/\/$/, '');
        const token = String(m.token ?? '');
        if (!KEY.test(gameKey) || !name || name.length > 100 || !BASE_URL.test(baseUrl) || token.length < 32) {
          console.warn(`Bỏ qua file khai báo game không hợp lệ: ${file}`);
          continue;
        }
        const row = await this.prisma.game.findUnique({ where: { gameKey } });
        if (row && row.name === name && row.baseUrl === baseUrl && this.crypto.decrypt(row.tokenEnc).toString() === token) continue;
        const contractVersion = await this.probe(baseUrl, token);
        const data = { name, baseUrl, tokenEnc: new Uint8Array(this.crypto.encrypt(Buffer.from(token))), contractVersion };
        if (row) await this.prisma.game.update({ where: { id: row.id }, data });
        else await this.prisma.game.create({ data: { gameKey, ...data } });
      } catch (e) {
        console.warn(`Chưa nhận được game khai báo ở ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Danh sách game. Không bao giờ trả token (BR34). */
  async list() {
    await this.syncManifests();
    const games = await this.prisma.game.findMany({ orderBy: { id: 'asc' } });
    return games.map((g) => ({ key: g.gameKey, name: g.name, baseUrl: g.baseUrl, contractVersion: g.contractVersion }));
  }

  async find(key: string) {
    const game = await this.prisma.game.findUnique({ where: { gameKey: key } });
    if (!game) throw new NotFoundException({ error: { code: 'not_found', message: `Chưa nối game "${key}"` } });
    return { game, token: this.crypto.decrypt(game.tokenEnc).toString() };
  }

  /** Kiểm token, địa chỉ và phiên bản hợp đồng trước khi lưu (E1, E2 của US-09). Trả về phiên bản hợp đồng. */
  private async probe(baseUrl: string, token: string): Promise<number> {
    let res;
    try {
      res = await this.client.call(baseUrl, token, 'GET', 'meta');
    } catch (e) {
      if (e instanceof GameUnreachableError) throw bad(`${e.message}. Kiểm tra địa chỉ trong mạng Docker.`);
      throw e;
    }
    if (res.status === 401) throw bad('Game từ chối token (sai token)');
    if (res.status !== 200) throw bad(`Game trả lỗi ${res.status} khi đọc hợp đồng`);
    const version = (res.body as { contractVersion?: unknown })?.contractVersion;
    if (typeof version !== 'number' || !this.env.supportedContracts.includes(version)) {
      throw bad(`Phiên bản hợp đồng ${String(version)} chưa được dashboard hỗ trợ (hỗ trợ: ${this.env.supportedContracts.join(', ')})`);
    }
    return version;
  }

  async register(input: { gameKey: string; name: string; baseUrl: string; token: string }) {
    const gameKey = String(input.gameKey ?? '').trim();
    const name = String(input.name ?? '').trim();
    const baseUrl = String(input.baseUrl ?? '').trim().replace(/\/$/, '');
    const token = String(input.token ?? '');
    if (!KEY.test(gameKey)) throw bad('Khóa game gồm chữ thường, số, "-", "_" (2 đến 50 ký tự, bắt đầu bằng chữ)');
    if (!name || name.length > 100) throw bad('Tên hiển thị bắt buộc, tối đa 100 ký tự');
    if (!BASE_URL.test(baseUrl)) throw bad('Địa chỉ phải dạng http://tên-container:cổng (không có đường dẫn)');
    if (token.length < 32) throw bad('Token dịch vụ tối thiểu 32 ký tự');
    if (await this.prisma.game.findUnique({ where: { gameKey } })) throw new ConflictException({ error: { code: 'conflict', message: 'Khóa game đã tồn tại' } });

    const contractVersion = await this.probe(baseUrl, token);
    const row = await this.prisma.game.create({
      data: { gameKey, name, baseUrl, tokenEnc: new Uint8Array(this.crypto.encrypt(Buffer.from(token))), contractVersion },
    });
    return { id: row.id, key: row.gameKey, name: row.name, baseUrl: row.baseUrl, contractVersion };
  }

  /** A1: đổi token; dùng được ngay nếu game chấp nhận token mới. */
  async rotateToken(key: string, token: string) {
    const { game } = await this.find(key);
    if (String(token ?? '').length < 32) throw bad('Token dịch vụ tối thiểu 32 ký tự');
    const contractVersion = await this.probe(game.baseUrl, token);
    await this.prisma.game.update({ where: { id: game.id }, data: { tokenEnc: new Uint8Array(this.crypto.encrypt(Buffer.from(token))), contractVersion } });
    return { ok: true };
  }

  /** A2: gỡ khỏi dashboard, không đụng dữ liệu của game. */
  async unregister(key: string) {
    const { game } = await this.find(key);
    await this.prisma.game.delete({ where: { id: game.id } });
    return { ok: true };
  }

  /** Trạng thái mọi game, gọi song song, mỗi game tối đa `gameTimeoutMs` (BR30). */
  async statusAll(): Promise<{ hub: { db: string }; games: GameStatus[] }> {
    await this.syncManifests();
    const games = await this.prisma.game.findMany({ orderBy: { id: 'asc' } });
    const results = await Promise.all(
      games.map(async (g): Promise<GameStatus> => {
        const base = { key: g.gameKey, name: g.name };
        try {
          const res = await this.client.call(g.baseUrl, this.crypto.decrypt(g.tokenEnc).toString(), 'GET', 'health');
          if (res.status !== 200) return { ...base, state: 'error', message: `Game trả lỗi ${res.status}` };
          const h = res.body as { status?: string; version?: string; uptimeSec?: number; rssMb?: number; db?: string };
          if (h.status !== 'ok') return { ...base, state: 'error', db: h.db, version: h.version, message: h.db === 'down' ? 'Database của game lỗi' : 'Game báo lỗi' };
          return { ...base, state: 'ok', version: h.version, uptimeSec: h.uptimeSec, rssMb: h.rssMb, db: h.db };
        } catch (e) {
          return { ...base, state: 'unreachable', message: e instanceof GameUnreachableError ? e.message : 'Lỗi không xác định' };
        }
      }),
    );
    let db = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { hub: { db }, games: results };
  }
}
