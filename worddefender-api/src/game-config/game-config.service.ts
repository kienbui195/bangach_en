import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_GAME_RULES } from './default-rules.js';
import { fillMissing } from './fill-missing.js';

/** Bảo đảm luôn có đúng một dòng luật chơi và bổ sung khóa còn thiếu khi khởi động. */
@Injectable()
export class GameConfigService implements OnApplicationBootstrap {
  private readonly log = new Logger(GameConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.ensureDefaults();
  }

  async ensureDefaults() {
    const existing = await this.prisma.gameConfig.findFirst();
    if (!existing) {
      await this.prisma.gameConfig.create({ data: { rules: DEFAULT_GAME_RULES as object, version: 1 } });
      this.log.log('Đã khởi tạo luật chơi mặc định');
      return;
    }
    const rules = structuredClone(existing.rules) as Record<string, unknown>;
    const added = fillMissing(rules, DEFAULT_GAME_RULES as unknown as Record<string, unknown>);
    if (added > 0) {
      await this.prisma.gameConfig.update({ where: { id: existing.id }, data: { rules: rules as object } });
      this.log.log(`Luật chơi: bổ sung ${added} khóa còn thiếu (giữ nguyên giá trị đã chỉnh)`);
    }
  }
}
