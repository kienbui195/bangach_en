import type { Request } from 'express';

const isPrivate = (ip: string) => {
  const v = ip.replace(/^::ffff:/, '');
  return v === '::1' || v.startsWith('127.') || v.startsWith('10.') || v.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(v) || v.startsWith('fc') || v.startsWith('fd');
};

/**
 * IP khách. Chỉ tin `CF-Connecting-IP` khi kết nối tới từ địa chỉ riêng tư (Caddy/cloudflared trên cùng máy);
 * cổng chỉ bind 127.0.0.1 nên người ngoài không giả được.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const remote = req.socket.remoteAddress ?? '0.0.0.0';
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && isPrivate(remote)) return cf.trim();
  return remote.replace(/^::ffff:/, '');
}
