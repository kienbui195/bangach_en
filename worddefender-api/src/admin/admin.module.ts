import { Module } from '@nestjs/common';
import { ADMIN_API_TOKEN, AdminTokenGuard } from './admin-token.guard.js';
import { AdminApiController } from './admin-api.controller.js';
import { ResourcesService } from './resources.service.js';

@Module({
  controllers: [AdminApiController],
  providers: [{ provide: ADMIN_API_TOKEN, useFactory: () => process.env.ADMIN_API_TOKEN }, AdminTokenGuard, ResourcesService],
})
export class AdminModule {}
