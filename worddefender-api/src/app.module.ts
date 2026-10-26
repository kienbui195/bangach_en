import { Module } from '@nestjs/common';
import { ContentModule } from './content/content.module.js';
import { GameConfigModule } from './game-config/game-config.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, GameConfigModule, ContentModule],
  controllers: [HealthController],
})
export class AppModule {}
