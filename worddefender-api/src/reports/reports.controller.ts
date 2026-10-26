import { BadRequestException, Body, Controller, ExceptionFilter, Catch, HttpCode, PayloadTooLargeException, Post, Req, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { clientIp } from '../security/client-ip.js';
import { MAX_AUDIO_BYTES, ReportsService, type UploadedAudio } from './reports.service.js';

/** File quá lớn: trả 400 (không phải 413) theo thiết kế, kèm lý do. */
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(400).json({ error: { code: 'validation', message: 'File vượt quá 2MB', fields: [{ name: 'file', message: 'File vượt quá 2MB' }] } });
  }
}

/** Giao diện công khai duy nhất để người chơi ghi dữ liệu (BR5): gửi báo lỗi, tối đa một file âm thanh ≤ 2MB. */
@Controller('api/word-reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(201)
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 10 } }))
  create(@Req() req: Request, @Body() body: Record<string, unknown>, @UploadedFile() file?: UploadedAudio) {
    if (body === undefined || body === null || typeof body !== 'object') throw new BadRequestException({ error: { code: 'validation', message: 'Thiếu nội dung' } });
    return this.reports.create(body, file, clientIp(req));
  }
}
