import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HUB_ENV, type HubEnv } from '../config/env.js';

@Injectable()
export class CryptoService {
  constructor(@Inject(HUB_ENV) private readonly env: HubEnv) {}

  /** AES-256-GCM. Kết quả: iv (12) + tag (16) + dữ liệu mã hóa. */
  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.env.masterKey, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  decrypt(blob: Uint8Array): Buffer {
    const buf = Buffer.from(blob);
    const decipher = createDecipheriv('aes-256-gcm', this.env.masterKey, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  }

  sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  sign(payload: string): string {
    return createHmac('sha256', this.env.masterKey).update(payload).digest('base64url');
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
