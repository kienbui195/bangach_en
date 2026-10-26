import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';

const PERIOD = 30;

/** TOTP RFC 6238: 6 số, bước 30 giây, chấp nhận lệch một bước (BR42). */
@Injectable()
export class TotpService {
  newSecret(): OTPAuth.Secret {
    return new OTPAuth.Secret({ size: 20 });
  }

  private totp(secretBase32: string, label = 'admin') {
    return new OTPAuth.TOTP({
      issuer: 'chungcake69 Hub',
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: PERIOD,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
  }

  uri(secretBase32: string, label: string): string {
    return this.totp(secretBase32, label).toString();
  }

  /**
   * Kiểm mã. Trả về bước 30 giây của mã nếu hợp lệ và CHƯA dùng (bước phải lớn hơn bước đã dùng gần nhất),
   * ngược lại null. Mã chỉ gồm đúng 6 chữ số.
   */
  verify(secretBase32: string, token: string, lastStep: bigint | null, now: Date): bigint | null {
    if (!/^\d{6}$/.test(token)) return null;
    const delta = this.totp(secretBase32).validate({ token, window: 1, timestamp: now.getTime() });
    if (delta === null) return null;
    const step = BigInt(Math.floor(now.getTime() / 1000 / PERIOD) + delta);
    if (lastStep !== null && step <= lastStep) return null;
    return step;
  }
}
