import { Inject, Injectable } from '@nestjs/common';
import { HUB_ENV, type HubEnv } from '../config/env.js';

export interface GameCallResult {
  status: number;
  body: unknown;
}

export class GameUnreachableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Gọi giao diện quản trị của một game bằng token dịch vụ. Token không bao giờ ghi log hay trả ra ngoài (BR34). */
@Injectable()
export class GameClient {
  constructor(@Inject(HUB_ENV) private readonly env: HubEnv) {}

  async call(baseUrl: string, token: string, method: string, path: string, query = '', body?: unknown, timeoutMs?: number): Promise<GameCallResult> {
    const url = `${baseUrl.replace(/\/$/, '')}/admin-api/${path.replace(/^\//, '')}${query ? `?${query}` : ''}`;
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs ?? this.env.gameTimeoutMs),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { error: { code: 'bad_response', message: 'Game trả về nội dung không phải JSON' } };
      }
      return { status: res.status, body: parsed };
    } catch (e) {
      const name = (e as Error).name;
      throw new GameUnreachableError(name === 'TimeoutError' ? 'Game không phản hồi (quá hạn chờ)' : 'Không nối được tới game');
    }
  }
}
