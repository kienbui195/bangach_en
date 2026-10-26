import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type Env = Record<string, string | undefined>;

export interface HubEnv {
  /** Origin duy nhất được phép gửi lệnh ghi, ví dụ https://admin.baodom.xyz (BR44). */
  origin: string;
  cookieSecure: boolean;
  masterKey: Buffer;
  setupTokenFile: string;
  loginMaxFails: number;
  loginWindowMs: number;
  sessionIdleMs: number;
  sessionMaxMs: number;
  passwordMin: number;
  passwordMax: number;
  challengeMs: number;
  /** Hạn chờ một game trả lời (BR30). */
  gameTimeoutMs: number;
  /** Các phiên bản hợp đồng quản trị mà dashboard hiểu (BR33). */
  supportedContracts: number[];
}

const num = (v: string | undefined, def: number) => (v === undefined || v === '' ? def : Number(v));

/** Đọc khóa master (32 byte): HUB_MASTER_KEY (base64) hoặc file HUB_MASTER_KEY_FILE (tự sinh nếu chưa có). */
export function loadMasterKey(env: Env): Buffer {
  if (env.HUB_MASTER_KEY) {
    const key = Buffer.from(env.HUB_MASTER_KEY, 'base64');
    if (key.length !== 32) throw new Error('HUB_MASTER_KEY phải là 32 byte mã hóa base64');
    return key;
  }
  const file = env.HUB_MASTER_KEY_FILE;
  if (!file) throw new Error('Thiếu HUB_MASTER_KEY hoặc HUB_MASTER_KEY_FILE');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  if (key.length !== 32) throw new Error(`Khóa master trong ${file} không hợp lệ (cần 32 byte base64)`);
  return key;
}

export function readEnv(env: Env): HubEnv {
  const origin = env.HUB_ORIGIN;
  if (!origin) throw new Error('Thiếu HUB_ORIGIN (ví dụ https://admin.baodom.xyz)');
  return {
    origin: origin.replace(/\/$/, ''),
    cookieSecure: env.COOKIE_SECURE !== 'false',
    masterKey: loadMasterKey(env),
    setupTokenFile: env.HUB_SETUP_TOKEN_FILE ?? '/srv/secrets/hub.setup-token',
    loginMaxFails: num(env.LOGIN_MAX_FAILS, 5),
    loginWindowMs: num(env.LOGIN_WINDOW_MIN, 15) * 60_000,
    sessionIdleMs: num(env.SESSION_IDLE_MIN, 30) * 60_000,
    sessionMaxMs: num(env.SESSION_MAX_HOURS, 12) * 3_600_000,
    passwordMin: num(env.PASSWORD_MIN, 16),
    passwordMax: num(env.PASSWORD_MAX, 128),
    challengeMs: 5 * 60_000,
    gameTimeoutMs: num(env.GAME_TIMEOUT_MS, 3000),
    supportedContracts: [1],
  };
}

export const HUB_ENV = Symbol('HUB_ENV');
