import { Module } from '@nestjs/common';
import { ADMIN_API_TOKEN, AdminTokenGuard } from './admin-token.guard.js';
import { AdminApiController } from './admin-api.controller.js';
import { BackupsController } from './backups/backups.controller.js';
import { BackupsService } from './backups/backups.service.js';
import { ActionsService } from './actions.service.js';
import { ImportExportService } from './import-export.service.js';
import { ResourcesService } from './resources.service.js';

@Module({
  controllers: [BackupsController, AdminApiController],
  providers: [{ provide: ADMIN_API_TOKEN, useFactory: () => process.env.ADMIN_API_TOKEN }, AdminTokenGuard, ResourcesService, ImportExportService, ActionsService, BackupsService],
})
export class AdminModule {}
