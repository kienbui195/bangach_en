import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { HUB_ENV, type HubEnv } from '../config/env.js';

/** BR9: argon2id, tối thiểu 16 ký tự, nhận mọi ký tự, không ép quy tắc thành phần, tối đa 128 và không cắt bớt. */
@Injectable()
export class PasswordService {
  constructor(@Inject(HUB_ENV) private readonly env: HubEnv) {}

  /** Trả về lý do nếu mật khẩu không hợp lệ, null nếu hợp lệ. Đếm theo ký tự (code point), không theo byte. */
  validate(password: string): string | null {
    const len = [...password].length;
    if (len < this.env.passwordMin) return `Mật khẩu cần tối thiểu ${this.env.passwordMin} ký tự`;
    if (len > this.env.passwordMax) return `Mật khẩu tối đa ${this.env.passwordMax} ký tự`;
    return null;
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password).catch(() => false);
  }
}
