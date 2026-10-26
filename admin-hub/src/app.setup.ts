import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';

/** Nhập hàng loạt gửi nội dung file (tối đa 5MB) trong JSON qua đường này; mọi đường khác giữ 16KB (BR44). */
const IMPORT_PATH = /\/games\/[^/]+\/admin\/[^/]+\/import$/;

/** Cấu hình dùng chung cho main.ts và test: giới hạn thân 16KB cho lệnh thường (BR44), đọc cookie. */
export function configureApp(app: NestExpressApplication) {
  app.disable('x-powered-by');
  const bigJson = json({ limit: '7mb' });
  app.use((req: Request, res: Response, next: NextFunction) => (req.method === 'POST' && IMPORT_PATH.test(req.path) ? bigJson(req, res, next) : next()));
  app.useBodyParser('json', { limit: '16kb' });
  app.use(cookieParser());
}
