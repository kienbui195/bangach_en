import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AuthService } from './auth/auth.service.js';

async function bootstrap() {
  // bodyParser tắt để tự đặt giới hạn: 16KB cho lệnh thường (BR44).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();

  const created = await app.get(AuthService).ensureSetupToken((file, token) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, token, { mode: 0o600 });
  });
  if (created) console.log('Chưa có tài khoản admin: mã thiết lập nằm ở file HUB_SETUP_TOKEN_FILE');

  await app.listen(process.env.PORT ?? 3200, '0.0.0.0');
}
await bootstrap();
