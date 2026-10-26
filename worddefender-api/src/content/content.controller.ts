import { Controller, Get, Header, HttpException, HttpStatus } from '@nestjs/common';
import { ContentService } from './content.service.js';

@Controller('api')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /**
   * Một lần gọi lấy toàn bộ nội dung và luật chơi. Express tự tính ETag từ thân phản hồi và trả 304 khi
   * `If-None-Match` khớp, nên mã bản chỉ đổi khi nội dung hoặc luật chơi đổi (BR2).
   */
  @Get('content')
  @Header('Cache-Control', 'no-cache')
  async get() {
    try {
      return await this.content.build();
    } catch {
      // AC-11.6: database tạm thời không dùng được thì báo 503 (game dùng bản cache), không phải 500.
      throw new HttpException({ error: { code: 'db_unavailable', message: 'Máy chủ dữ liệu tạm thời không sẵn sàng' } }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
