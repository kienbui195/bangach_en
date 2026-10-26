import type { Request } from 'express';

const isPrivate = (ip: string) => {
  const v = ip.replace(/^::ffff:/, '');
  return (
    v === '::1' ||
    v.startsWith('127.') ||
    v.startsWith('10.') ||
    v.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
    v.startsWith('fc') ||
    v.startsWith('fd')
  );
};

/**
 * IP khách. Chỉ tin `CF-Connecting-IP` khi kết nối tới từ địa chỉ riêng tư (cloudflared/Caddy trên cùng máy);
 * cổng chỉ bind 127.0.0.1 nên người ngoài không giả được.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const remote = req.socket.remoteAddress ?? '0.0.0.0';
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && isPrivate(remote)) return cf.trim();
  return remote.replace(/^::ffff:/, '');
}

/** Khóa đếm thử sai: IPv4 giữ nguyên, IPv6 gộp theo /64 (BR10). */
export function ipKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const full = expandV6(ip);
  return full.split(':').slice(0, 4).join(':') + '::/64';
}

function expandV6(ip: string): string {
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = tail === undefined ? [] : Array(Math.max(0, 8 - h.length - t.length)).fill('0');
  return [...h, ...fill, ...t].map((x) => x.padStart(4, '0')).join(':');
}
