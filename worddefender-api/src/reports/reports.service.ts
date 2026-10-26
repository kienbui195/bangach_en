import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HEADWORD_PATTERN } from '../admin/resources/definitions.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** BR8: tối đa 10 báo lỗi mỗi giờ mỗi IP (giá trị chỉnh được bằng cấu hình). */
const RATE_LIMIT = Number(process.env.REPORT_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = 60 * 60_000;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // BR6: 2MB = 2.097.152 byte

/** BR26: các trường người chơi được báo lỗi. */
const REPORT_FIELDS = ['headword', 'displayForm', 'meaningVi', 'phonetic', 'example', 'audio'] as const;
type ReportField = (typeof REPORT_FIELDS)[number];
const MAX_LEN: Record<Exclude<ReportField, 'audio'>, number> = { headword: 16, displayForm: 100, meaningVi: 500, phonetic: 100, example: 2000 };

/** Chỉ nhận các định dạng âm thanh phổ biến; đuôi file do máy chủ chọn, không lấy từ tên file người dùng gửi. */
const AUDIO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

export interface UploadedAudio {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const uploadDir = () => process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: Record<string, unknown>, file: UploadedAudio | undefined, ip: string) {
    // BR8: giới hạn theo IP (băm), tính ngay từ đầu để người gửi nhiều không tốn thêm tài nguyên.
    const reporterKey = createHash('sha256').update(ip).digest('hex').slice(0, 32);
    const recent = await this.prisma.wordReport.count({ where: { reporterKey, createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) } } });
    if (recent >= RATE_LIMIT) {
      throw new HttpException({ error: { code: 'rate_limited', message: 'Bạn đã gửi quá nhiều báo lỗi, vui lòng thử lại sau' } }, HttpStatus.TOO_MANY_REQUESTS);
    }

    // BR7: chuẩn hóa từ trước khi so khớp và lưu.
    const headword = typeof body.headword === 'string' ? body.headword.trim().toLowerCase() : '';
    const field = body.field as ReportField;
    const errors: { name: string; message: string }[] = [];
    if (!headword || headword.length > 16) errors.push({ name: 'headword', message: 'Thiếu từ hoặc quá dài' });
    if (!REPORT_FIELDS.includes(field)) errors.push({ name: 'field', message: `Trường phải là một trong: ${REPORT_FIELDS.join(', ')}` });
    const suggested = typeof body.suggestedValue === 'string' ? body.suggestedValue.trim() : '';
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 1000) errors.push({ name: 'note', message: 'Ghi chú tối đa 1000 ký tự' });

    let ext: string | undefined;
    if (field === 'audio') {
      if (!file) errors.push({ name: 'file', message: 'Báo lỗi file đọc cần đính kèm một file âm thanh' });
    } else if (REPORT_FIELDS.includes(field)) {
      if (!suggested) errors.push({ name: 'suggestedValue', message: 'Thiếu giá trị đề nghị' });
      else if (suggested.length > MAX_LEN[field]) errors.push({ name: 'suggestedValue', message: `Tối đa ${MAX_LEN[field]} ký tự` });
      else if (field === 'headword' && !HEADWORD_PATTERN.test(suggested.toLowerCase())) errors.push({ name: 'suggestedValue', message: 'Từ chỉ gồm chữ a-z, dài 2 đến 16 ký tự' });
      if (file) errors.push({ name: 'file', message: 'Chỉ báo lỗi file đọc mới đính kèm file' });
    }
    if (file) {
      ext = AUDIO_EXT[file.mimetype];
      if (!file.mimetype.startsWith('audio/')) errors.push({ name: 'file', message: 'Chỉ nhận file âm thanh' });
      else if (!ext) errors.push({ name: 'file', message: 'Định dạng âm thanh chưa được hỗ trợ (mp3, wav, ogg, webm, m4a, aac)' });
      else if (file.size > MAX_AUDIO_BYTES) errors.push({ name: 'file', message: 'File vượt quá 2MB' });
    }
    if (errors.length > 0) throw new BadRequestException({ error: { code: 'validation', message: 'Dữ liệu không hợp lệ', fields: errors } });

    // E3: từ phải có trong bộ chính thức.
    const word = await this.prisma.vocabulary.findFirst({ where: { ownerKey: 'official', headword } });
    if (!word) throw new NotFoundException({ error: { code: 'not_found', message: `Không có từ "${headword}" trong bộ từ vựng` } });

    let audioPath: string | undefined;
    if (file && ext) {
      await mkdir(join(uploadDir(), 'audio'), { recursive: true });
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      await writeFile(join(uploadDir(), 'audio', name), file.buffer, { mode: 0o644 });
      audioPath = `audio/${name}`;
    }
    try {
      const current = field === 'audio' ? word.audioPath : (word[field as Exclude<ReportField, 'audio'>] as string | null);
      // BR4: luôn pending, applied_at rỗng, bất kể yêu cầu có tự đặt giá trị khác.
      const row = await this.prisma.wordReport.create({
        data: {
          headword,
          field,
          currentValue: current ?? null,
          suggestedValue: field === 'audio' ? null : suggested,
          suggestedAudioPath: audioPath ?? null,
          note: note || null,
          reporterKey,
          reviewStatus: 'pending',
          appliedAt: null,
        },
      });
      return { id: row.id };
    } catch (e) {
      if (audioPath) await unlink(join(uploadDir(), audioPath)).catch(() => undefined); // không để lại file mồ côi
      throw e;
    }
  }
}
