import { Module } from '@nestjs/common';
import { GameConfigService } from './game-config.service.js';

@Module({ providers: [GameConfigService] })
export class GameConfigModule {}
