import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** Cấu hình dùng chung cho main.ts và test: giới hạn thân 16KB cho lệnh thường (BR44), đọc cookie. */
export function configureApp(app: NestExpressApplication) {
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '16kb' });
  app.use(cookieParser());
}
