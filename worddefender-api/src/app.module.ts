import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { ContentModule } from './content/content.module.js';
import { GameConfigModule } from './game-config/game-config.module.js';
import { HealthController } from './health/health.controller.js';
import { ReportsModule } from './reports/reports.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, GameConfigModule, ContentModule, AdminModule, ReportsModule],
  controllers: [HealthController],
})
export class AppModule {}
