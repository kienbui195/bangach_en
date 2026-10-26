import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AuthService } from './auth/auth.service.js';

async function bootstrap() {
  // bodyParser tắt để tự đặt giới hạn: 16KB cho lệnh thường (BR44).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // Header an toàn cho trang quản trị; API không bao giờ được cache.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Giao diện (React) do chính hub phục vụ; mọi đường không phải /api và không có đuôi file đều trả index.html.
  const webDir = process.env.WEB_DIR ?? join(process.cwd(), 'web-dist');
  if (existsSync(join(webDir, 'index.html'))) {
    app.useStaticAssets(webDir, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || extname(req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
  }

  const created = await app.get(AuthService).ensureSetupToken((file, token) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, token, { mode: 0o600 });
  });
  if (created) console.log('Chưa có tài khoản admin: mã thiết lập nằm ở file HUB_SETUP_TOKEN_FILE');

  await app.listen(process.env.PORT ?? 3200, '0.0.0.0');
}
await bootstrap();
