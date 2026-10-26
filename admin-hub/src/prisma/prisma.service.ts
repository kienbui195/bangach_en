import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';

type Env = Record<string, string | undefined>;

export function readDatabaseConfig(env: Env) {
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
  if (missing.length > 0) throw new Error(`Thiếu cấu hình database: ${missing.join(', ')} (hoặc đặt DATABASE_URL)`);
  return {
    host: env.DATABASE_HOST!,
    port: Number(env.DATABASE_PORT ?? 3306),
    user: env.DATABASE_USERNAME!,
    password: env.DATABASE_PASSWORD!,
    database: env.DATABASE_NAME!,
    connectionLimit,
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaMariaDb(readDatabaseConfig(process.env)) });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
