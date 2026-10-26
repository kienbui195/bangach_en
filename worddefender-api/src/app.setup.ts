import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type NextFunction, type Request, type Response } from 'express';

const IMPORT_PATH = /^\/admin-api\/[^/]+\/import$/;

/** Chỉ các đường công khai của game (/api/*) cho trình duyệt ở domain khác gọi; cổng quản trị không bao giờ mở CORS. */
export function corsForPublicApi(allowed: () => string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin || !req.path.startsWith('/api/') || !allowed().includes(origin)) return next();
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Dùng chung cho main.ts và test. Express 5 mặc định không đọc `filter[trường]=giá_trị`, nên bật bộ đọc mở rộng. */
export function configureApp(app: NestExpressApplication) {
  app.disable('x-powered-by');
  app.use(corsForPublicApi(() => (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)));
  app.set('query parser', 'extended');
  // Nhập hàng loạt gửi nội dung file trong JSON (tối đa 5MB + phần bao): chỉ đường nhập được nới giới hạn thân,
  // mọi đường khác giữ 100KB. Gọi sau khi tạo app với { bodyParser: false }.
  const bigJson = json({ limit: '7mb' });
  app.use((req: Request, res: Response, next: NextFunction) => (req.method === 'POST' && IMPORT_PATH.test(req.path) ? bigJson(req, res, next) : next()));
  app.useBodyParser('json', { limit: '100kb' });
}
