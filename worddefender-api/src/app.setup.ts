import type { NestExpressApplication } from '@nestjs/platform-express';

/** Dùng chung cho main.ts và test. Express 5 mặc định không đọc `filter[trường]=giá_trị`, nên bật bộ đọc mở rộng. */
export function configureApp(app: NestExpressApplication) {
  app.disable('x-powered-by');
  app.set('query parser', 'extended');
}
