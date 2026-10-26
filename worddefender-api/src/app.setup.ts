import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type NextFunction, type Request, type Response } from 'express';

const IMPORT_PATH = /^\/admin-api\/[^/]+\/import$/;

/** Dùng chung cho main.ts và test. Express 5 mặc định không đọc `filter[trường]=giá_trị`, nên bật bộ đọc mở rộng. */
export function configureApp(app: NestExpressApplication) {
  app.disable('x-powered-by');
  app.set('query parser', 'extended');
  // Nhập hàng loạt gửi nội dung file trong JSON (tối đa 5MB + phần bao): chỉ đường nhập được nới giới hạn thân,
  // mọi đường khác giữ 100KB. Gọi sau khi tạo app với { bodyParser: false }.
  const bigJson = json({ limit: '7mb' });
  app.use((req: Request, res: Response, next: NextFunction) => (req.method === 'POST' && IMPORT_PATH.test(req.path) ? bigJson(req, res, next) : next()));
  app.useBodyParser('json', { limit: '100kb' });
}
