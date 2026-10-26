import { Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../admin-token.guard.js';
import { notFound, parsePaging } from '../errors.js';
import { BackupsService } from './backups.service.js';

/** Đăng ký TRƯỚC AdminApiController để các đường /admin-api/backups… không rơi vào đường chung `:resource`. */
@Controller('admin-api/backups')
@UseGuards(AdminTokenGuard)
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const paging = parsePaging(page, pageSize);
    const rows = await this.backups.list();
    return { items: rows.slice((paging.page - 1) * paging.pageSize, paging.page * paging.pageSize), total: rows.length, ...paging };
  }

  @Post('actions/backup-now')
  @HttpCode(200)
  backupNow() {
    return this.backups.create('manual');
  }

  @Get('export')
  noExport(): never {
    throw notFound('Sao lưu không hỗ trợ xuất');
  }

  @Get(':name')
  get(@Param('name') name: string) {
    return this.backups.get(name);
  }

  @Post(':name/actions/restore')
  @HttpCode(200)
  restore(@Param('name') name: string) {
    return this.backups.restore(name);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.backups.remove(name);
  }
}
