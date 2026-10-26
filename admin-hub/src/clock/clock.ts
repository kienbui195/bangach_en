/** Đồng hồ có thể thay trong test (hạn phiên, khóa đăng nhập, bước TOTP). */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now() {
    return new Date();
  }
}
