/**
 * Khách gửi báo lỗi được tải file lên, nhưng chỉ file âm thanh và chỉ vài trăm KB.
 *
 * Quyền upload của role public là quyền chung cho cả plugin upload, nên nếu không chặn thì
 * bất kỳ ai cũng đẩy được ảnh, PDF, text lên máy chủ. Middleware này chỉ soi đường
 * /api/upload (đường của khách); Media Library trong admin đi đường /upload nên không ảnh hưởng.
 */
import type { Core } from '@strapi/strapi';

const PUBLIC_UPLOAD_PATH = '/api/upload';
const MAX_BYTES = 2 * 1024 * 1024;

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const middleware: Core.MiddlewareFactory = () => async (ctx, next) => {
  const isPublicUpload = ctx.method === 'POST' && ctx.path === PUBLIC_UPLOAD_PATH;
  // Người đã đăng nhập admin không bị siết (admin có thể thao tác qua content API khi cần)
  if (!isPublicUpload || ctx.state?.user || ctx.state?.auth?.strategy?.name === 'admin') {
    await next();
    return;
  }

  const files = asArray(ctx.request.files?.files as { mimetype?: string; size?: number } | undefined);
  if (files.length === 0) return ctx.badRequest('Thiếu file.');
  if (files.length > 1) return ctx.badRequest('Mỗi lần chỉ gửi một file.');

  const [file] = files;
  if (!file.mimetype?.startsWith('audio/')) return ctx.badRequest('Chỉ nhận file âm thanh.');
  if ((file.size ?? 0) > MAX_BYTES) return ctx.badRequest('File vượt quá 2MB.');

  await next();
};

export default middleware;
