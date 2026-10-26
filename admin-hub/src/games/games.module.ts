import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { GameClient } from './game-client.js';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [GamesService, GameClient, AuditService],
})
export class GamesModule {}
