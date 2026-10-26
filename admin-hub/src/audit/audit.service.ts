import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditTarget {
  adminId: number;
  gameId: number | null;
  resource: string;
  recordId: string | null;
  action: string;
}

/** Nhật ký thao tác (BR15): ghi `started` TRƯỚC khi gọi game; không ghi được thì thao tác không được thực hiện. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async start(t: AuditTarget): Promise<number> {
    const row = await this.prisma.auditLog.create({ data: { ...t, status: 'started' } });
    return row.id;
  }

  async finish(id: number, ok: boolean): Promise<void> {
    await this.prisma.auditLog.update({ where: { id }, data: { status: ok ? 'succeeded' : 'failed' } });
  }
}
