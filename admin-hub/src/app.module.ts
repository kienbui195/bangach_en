import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { Clock, SystemClock } from './clock/clock.js';
import { HUB_ENV, readEnv } from './config/env.js';
import { CryptoService } from './crypto/crypto.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OriginGuard } from './security/origin.guard.js';

@Global()
@Module({
  providers: [
    { provide: HUB_ENV, useFactory: () => readEnv(process.env) },
    { provide: Clock, useClass: SystemClock },
    CryptoService,
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
  exports: [HUB_ENV, Clock, CryptoService],
})
class CoreModule {}

@Module({ imports: [CoreModule, PrismaModule, AuthModule] })
export class AppModule {}
