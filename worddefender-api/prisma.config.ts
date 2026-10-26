import { defineConfig } from 'prisma/config';

/**
 * Địa chỉ MySQL cho migration: ưu tiên DATABASE_URL, sau đó bộ DATABASE_* (do `vps db-create` ghi ở /srv/secrets).
 * Chỉ khi không đặt gì và không phải production mới dùng database dev trên máy local.
 */
function databaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.DATABASE_HOST && env.DATABASE_NAME && env.DATABASE_USERNAME && env.DATABASE_PASSWORD) {
    const auth = `${encodeURIComponent(env.DATABASE_USERNAME)}:${encodeURIComponent(env.DATABASE_PASSWORD)}`;
    return `mysql://${auth}@${env.DATABASE_HOST}:${env.DATABASE_PORT ?? 3306}/${env.DATABASE_NAME}`;
  }
  if (env.NODE_ENV === 'production') throw new Error('Thiếu cấu hình database (DATABASE_URL hoặc DATABASE_HOST/NAME/USERNAME/PASSWORD)');
  return 'mysql://root:devroot@127.0.0.1:33061/worddefender_dev';
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl(process.env) },
});
