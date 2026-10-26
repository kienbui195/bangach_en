export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

type Env = Record<string, string | undefined>;

/**
 * Đọc cấu hình kết nối MySQL từ biến môi trường. Ưu tiên `DATABASE_URL`; nếu không có thì dùng bộ
 * `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD` do `vps db-create` ghi ở `/srv/secrets/<game>.db.env`.
 */
export function readDatabaseConfig(env: Env): DatabaseConfig {
  const connectionLimit = Number(env.DATABASE_POOL ?? 5);
  if (env.DATABASE_URL) {
    const u = new URL(env.DATABASE_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
      connectionLimit,
    };
  }
  const missing = ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USERNAME', 'DATABASE_PASSWORD'].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Thiếu cấu hình database: ${missing.join(', ')} (hoặc đặt DATABASE_URL)`);
  }
  return {
    host: env.DATABASE_HOST!,
    port: Number(env.DATABASE_PORT ?? 3306),
    user: env.DATABASE_USERNAME!,
    password: env.DATABASE_PASSWORD!,
    database: env.DATABASE_NAME!,
    connectionLimit,
  };
}
