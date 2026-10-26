import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { CONTRACT_VERSION, type GameMeta } from './contract.js';
import { RESOURCES } from './resources/definitions.js';
import { type ListQuery, ResourcesService } from './resources.service.js';

type Body = Record<string, unknown>;

/** Hợp đồng quản trị phiên bản 1 (tài liệu 02, mục 3). Chỉ nghe trong mạng Docker, cần token dịch vụ. */
@Controller('admin-api')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  constructor(
    private readonly resources: ResourcesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('meta')
  meta(): GameMeta {
    return {
      game: { key: 'worddefender', name: 'WordDefender', version: process.env.APP_VERSION ?? '0.0.1' },
      contractVersion: CONTRACT_VERSION,
      resources: RESOURCES.map((r) => r.meta),
    };
  }

  @Get('health')
  async health() {
    let db = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'error',
      version: process.env.APP_VERSION ?? '0.0.1',
      contractVersion: CONTRACT_VERSION,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      db,
    };
  }

  @Get(':resource')
  list(@Param('resource') key: string, @Query() query: ListQuery) {
    return this.resources.list(this.resources.find(key), query);
  }

  @Post(':resource')
  create(@Param('resource') key: string, @Body() body: Body) {
    return this.resources.create(this.resources.find(key), body);
  }

  /** Tài nguyên singleton (luật chơi) sửa thẳng trên đường của tài nguyên. */
  @Put(':resource')
  updateSingleton(@Param('resource') key: string, @Body() body: Body) {
    return this.resources.update(this.resources.find(key), null, body);
  }

  @Get(':resource/:id')
  get(@Param('resource') key: string, @Param('id') id: string) {
    return this.resources.get(this.resources.find(key), id);
  }

  @Put(':resource/:id')
  update(@Param('resource') key: string, @Param('id') id: string, @Body() body: Body) {
    return this.resources.update(this.resources.find(key), id, body);
  }

  @Delete(':resource/:id')
  remove(@Param('resource') key: string, @Param('id') id: string) {
    return this.resources.remove(this.resources.find(key), id);
  }
}
