import { HttpException, HttpStatus, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PrismaService } from '../../prisma/prisma.service.js';
import { apiError, notFound as notFoundError } from '../errors.js';

export type BackupKind = 'manual' | 'auto' | 'pre-restore';

const NAME = /^wd-\d{8}-\d{6}-(manual|auto|pre-restore)\.json\.gz$/;
const FORMAT = 1;
const MAX_FILES = 60;
const KEEP_AUTO = 14;
const DAY_MS = 24 * 3_600_000;
/** Bảng theo thứ tự xóa (con trước cha); chèn theo thứ tự ngược lại. */
const TABLES = ['wordReport', 'level', 'topic', 'vocabulary', 'gameConfig'] as const;
type Table = (typeof TABLES)[number];
const DATE_KEY = /At$/;

interface Snapshot {
  format: number;
  game: string;
  createdAt: string;
  kind: BackupKind;
  tables: Record<Table, Record<string, unknown>[]>;
}

export interface BackupRow {
  name: string;
  kind: BackupKind;
  createdAt: string;
  sizeKb: number;
  topics: number;
  levels: number;
  vocabularies: number;
  wordReports: number;
}

export const backupDir = () => process.env.BACKUP_DIR ?? join(process.cwd(), 'backups');
const bad = (message: string, status = HttpStatus.UNPROCESSABLE_ENTITY, code = 'validation') => apiError(status, code, message);
const notFound = () => notFoundError('Không tìm thấy bản sao lưu');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

@Injectable()
export class BackupsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(BackupsService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  private readonly cache = new Map<string, BackupRow>();

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.BACKUP_AUTO === 'off') return;
    const tick = () => void this.autoBackup().catch((e: unknown) => this.log.error(`Sao lưu tự động lỗi: ${e instanceof Error ? e.message : String(e)}`));
    setTimeout(tick, 30_000).unref();
    this.timer = setInterval(tick, 6 * 3_600_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sao lưu tự động: bản mới nhất (loại nào cũng tính) quá 24 giờ thì tạo thêm; giữ 14 bản tự động gần nhất. */
  async autoBackup(): Promise<void> {
    const rows = await this.list();
    if (rows.length > 0 && Date.now() - new Date(rows[0].createdAt).getTime() < DAY_MS) return;
    const created = await this.create('auto');
    const autos = [created, ...rows].filter((r) => r.kind === 'auto').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const old of autos.slice(KEEP_AUTO)) await this.remove(old.name);
  }

  private path(name: string) {
    if (!NAME.test(name)) throw notFound(); // chặn tên lạ, kể cả đường dẫn lên thư mục khác
    return join(backupDir(), name);
  }

  private async snapshot(kind: BackupKind): Promise<Snapshot> {
    const p = this.prisma as unknown as Record<Table, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>;
    // Một lô giao dịch: các bảng đọc cùng một thời điểm (nhất quán) và gửi cùng lúc.
    const results = (await this.prisma.$transaction(TABLES.map((name) => p[name].findMany({ orderBy: { id: 'asc' } }) as never))) as Record<string, unknown>[][];
    const tables = Object.fromEntries(TABLES.map((name, i) => [name, results[i]])) as Snapshot['tables'];
    return { format: FORMAT, game: 'worddefender', createdAt: new Date().toISOString(), kind, tables };
  }

  async create(kind: BackupKind): Promise<BackupRow> {
    await mkdir(backupDir(), { recursive: true });
    if ((await readdir(backupDir())).filter((n) => NAME.test(n)).length >= MAX_FILES) {
      throw bad(`Đã có ${MAX_FILES} bản sao lưu, hãy xóa bớt bản cũ trước`, HttpStatus.CONFLICT, 'conflict');
    }
    const snap = await this.snapshot(kind);
    const name = `wd-${stamp(new Date(snap.createdAt))}-${kind}.json.gz`;
    const file = join(backupDir(), name);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, gzipSync(JSON.stringify(snap)), { mode: 0o600 });
    await rename(tmp, file); // ghi xong mới đổi tên: không bao giờ có file dở dang trong danh sách
    return this.describe(name, snap);
  }

  private async describe(name: string, snap?: Snapshot): Promise<BackupRow> {
    const file = join(backupDir(), name);
    const st = await stat(file);
    const key = `${name}:${st.size}:${st.mtimeMs}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const s = snap ?? this.parse(await readFile(file));
    const row: BackupRow = {
      name,
      kind: s.kind,
      createdAt: s.createdAt,
      sizeKb: Math.max(1, Math.round(st.size / 1024)),
      topics: s.tables.topic.length,
      levels: s.tables.level.length,
      vocabularies: s.tables.vocabulary.length,
      wordReports: s.tables.wordReport.length,
    };
    this.cache.set(key, row);
    return row;
  }

  private parse(buf: Buffer): Snapshot {
    let s: Snapshot;
    try {
      s = JSON.parse(gunzipSync(buf).toString('utf8')) as Snapshot;
    } catch {
      throw bad('File sao lưu hỏng hoặc không đọc được');
    }
    if (s?.format !== FORMAT || s.game !== 'worddefender' || !s.tables || TABLES.some((t) => !Array.isArray(s.tables[t]))) {
      throw bad('File sao lưu không đúng định dạng của WordDefender');
    }
    return s;
  }

  async list(): Promise<BackupRow[]> {
    let names: string[] = [];
    try {
      names = (await readdir(backupDir())).filter((n) => NAME.test(n));
    } catch {
      /* chưa có thư mục = chưa có bản nào */
    }
    // File hỏng bị bỏ qua, không làm hỏng cả danh sách.
    const rows = (await Promise.all(names.map((n) => this.describe(n).catch(() => null)))).filter((r): r is BackupRow => r !== null);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows;
  }

  async get(name: string): Promise<BackupRow> {
    this.path(name);
    try {
      return await this.describe(name);
    } catch {
      throw notFound();
    }
  }

  async remove(name: string) {
    try {
      await unlink(this.path(name));
      for (const key of this.cache.keys()) if (key.startsWith(`${name}:`)) this.cache.delete(key);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw notFound();
    }
    return { ok: true };
  }

  /** Thay toàn bộ dữ liệu bằng nội dung bản sao lưu, trong một giao dịch; lỗi giữa chừng thì dữ liệu hiện tại giữ nguyên. */
  async restore(name: string) {
    const file = this.path(name);
    let buf: Buffer;
    try {
      buf = await readFile(file);
    } catch {
      throw notFound();
    }
    const snap = this.parse(buf); // kiểm file TRƯỚC khi đụng vào dữ liệu
    if (this.busy) throw bad('Đang có một thao tác sao lưu/khôi phục khác, thử lại sau', HttpStatus.CONFLICT, 'conflict');
    this.busy = true;
    try {
      const safety = await this.create('pre-restore');
      const toDate = (row: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, DATE_KEY.test(k) && typeof v === 'string' ? new Date(v) : v]));
      await this.prisma.$transaction(
        async (tx) => {
          const t = tx as unknown as Record<Table, { deleteMany(a?: unknown): Promise<unknown>; createMany(a: unknown): Promise<unknown> }>;
          for (const table of TABLES) await t[table].deleteMany({});
          for (const table of [...TABLES].reverse()) {
            const rows = snap.tables[table].map(toDate);
            if (rows.length > 0) await t[table].createMany({ data: rows });
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      this.cache.clear();
      return { ok: true, restored: name, safetyBackup: safety.name, topics: snap.tables.topic.length, levels: snap.tables.level.length, vocabularies: snap.tables.vocabulary.length };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.log.error(`Khôi phục ${name} lỗi: ${e instanceof Error ? e.message : String(e)}`);
      throw bad('Khôi phục thất bại, dữ liệu hiện tại không bị đổi. Xem log của máy chủ game.', HttpStatus.INTERNAL_SERVER_ERROR, 'restore_failed');
    } finally {
      this.busy = false;
    }
  }
}

