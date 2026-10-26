import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DEFAULT_GAME_RULES } from '../game-config/default-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FieldError } from './contract.js';
import type { Delegate } from './resources/definition.js';
import { RESOURCES } from './resources/definitions.js';
import { notFound, parseId, unprocessable } from './errors.js';
import { ResourcesService } from './resources.service.js';

/** Thao tác riêng của game, khai báo trong hợp đồng (`actions`). */
@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourcesService,
  ) {}

  /** `id` rỗng khi thao tác áp dụng cho cả tài nguyên (target = resource). */
  async run(resourceKey: string, id: string | null, name: string, body: Record<string, unknown>) {
    const key = `${resourceKey}:${name}`;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    switch (key) {
      case 'word-reports:approve':
        return this.approve(parseId(id), note);
      case 'word-reports:reject':
        return this.reject(parseId(id), note);
      case 'game-config:reset-defaults':
        return this.resetDefaults(body);
      default:
        throw notFound(`Không có thao tác "${name}" cho "${resourceKey}"`);
    }
  }

  /** Khóa dòng báo lỗi trong giao dịch để hai admin bấm cùng lúc chỉ có một người áp dụng (BR25). */
  private async lockPending(tx: Pick<PrismaService, 'wordReport' | '$queryRaw'>, id: number) {
    await tx.$queryRaw`SELECT id FROM word_reports WHERE id = ${id} FOR UPDATE`;
    const report = await tx.wordReport.findUnique({ where: { id } });
    if (!report) throw notFound('Không tìm thấy báo lỗi');
    if (report.appliedAt || report.reviewStatus !== 'pending') {
      const label = report.reviewStatus === 'approved' ? 'duyệt' : 'từ chối';
      throw new ConflictException({ error: { code: 'already_processed', message: `Báo lỗi đã được ${label}` } });
    }
    return report;
  }

  /** US-07: ghi đề xuất vào từ vựng qua cùng đường kiểm luật khi sửa tay (BR27), cùng thành công hoặc cùng không xảy ra (BR28). */
  private approve(id: number, note: string) {
    const vocabDef = RESOURCES.find((r) => r.meta.key === 'vocabularies')!;
    return this.prisma.$transaction(
      async (tx) => {
        const report = await this.lockPending(tx, id);
        const word = await tx.vocabulary.findFirst({ where: { ownerKey: 'official', headword: report.headword } });
        if (!word) throw unprocessable([{ name: 'headword', message: `Không tìm thấy từ "${report.headword}" trong bộ từ vựng` }], 'Không duyệt được báo lỗi này');

        const data: Record<string, unknown> = {};
        const errors: FieldError[] = [];
        if (report.field === 'audio') {
          if (!report.suggestedAudioPath) errors.push({ name: 'suggestedAudioPath', message: 'Báo lỗi file đọc nhưng chưa có file âm thanh đính kèm' });
          else data.audioPath = report.suggestedAudioPath;
        } else {
          const value = (report.suggestedValue ?? '').trim();
          const meta = vocabDef.meta.fields.find((f) => f.name === report.field);
          if (!value) errors.push({ name: 'suggestedValue', message: 'Chưa có nội dung đề xuất để ghi vào từ vựng' });
          else if (!meta) errors.push({ name: 'field', message: `Không hỗ trợ sửa trường "${report.field}"` });
          else if (meta.maxLength && [...value].length > meta.maxLength) errors.push({ name: 'suggestedValue', message: `Tối đa ${meta.maxLength} ký tự` });
          else data[report.field] = value;
        }
        if (errors.length === 0 && vocabDef.validate) errors.push(...(await vocabDef.validate({ data, existing: word, delegate: tx.vocabulary as unknown as Delegate })));
        if (errors.length > 0) throw unprocessable(errors, 'Không duyệt được báo lỗi này');

        await tx.vocabulary.update({ where: { id: word.id }, data });
        return tx.wordReport.update({ where: { id }, data: { reviewStatus: 'approved', appliedAt: new Date(), reviewNote: note || report.reviewNote } });
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  }

  private reject(id: number, note: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id);
      return tx.wordReport.update({ where: { id }, data: { reviewStatus: 'rejected', reviewNote: note || null } });
    });
  }

  /** A1 của US-06: đặt lại một nhóm (hoặc toàn bộ) luật chơi về mặc định, giữ các nhóm khác. Dùng cùng đường sửa nên kiểm xung đột và tăng phiên bản. */
  private async resetDefaults(body: Record<string, unknown>) {
    const def = this.resources.find('game-config');
    const current = (await this.resources.list(def, {})) as { rules: Record<string, unknown> };
    const option = typeof body?.option === 'string' ? body.option : '';
    const defaults = DEFAULT_GAME_RULES as unknown as Record<string, unknown>;
    if (option && !(option in defaults)) {
      throw unprocessable([], `Nhóm luật "${option}" không có trong bộ mặc định`);
    }
    const rules = option ? { ...current.rules, [option]: structuredClone(defaults[option]) } : structuredClone(defaults);
    return this.resources.update(def, null, { updatedAt: body?.updatedAt, rules });
  }
}
