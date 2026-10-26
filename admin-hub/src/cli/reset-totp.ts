import { NestFactory } from '@nestjs/core';
import QRCode from 'qrcode';
import { AppModule } from '../app.module.js';
import { AuthService } from '../auth/auth.service.js';

/**
 * Đổi điện thoại Authenticator của admin (AC-03.14). Chạy trong container của hub:
 *   docker exec -it admin-hub node dist/cli/reset-totp.js [tên-đăng-nhập]
 * In mã QR và khóa nhập tay; mã cũ hết dùng, mọi phiên đang đăng nhập bị đăng xuất.
 */
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
try {
  const res = await app.get(AuthService).resetTotp(process.argv[2]);
  console.log(await QRCode.toString(res.otpauthUrl, { type: 'terminal', small: true }));
  console.log(`Tài khoản: ${res.username}`);
  console.log(`Khóa nhập tay vào Authenticator: ${res.secret}`);
  console.log('Quét mã QR (hoặc nhập khóa) bằng điện thoại mới rồi đăng nhập bằng mật khẩu + mã mới. Mã của điện thoại cũ đã hết dùng.');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await app.close();
}
