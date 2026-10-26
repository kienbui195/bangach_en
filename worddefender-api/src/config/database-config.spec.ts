import { readDatabaseConfig } from './database-config.js';

describe('readDatabaseConfig', () => {
  it('đọc từ DATABASE_URL, giải mã ký tự đặc biệt trong mật khẩu', () => {
    const cfg = readDatabaseConfig({ DATABASE_URL: 'mysql://wd:p%40ss%3Aw@mysql:3307/worddefender' });
    expect(cfg).toMatchObject({ host: 'mysql', port: 3307, user: 'wd', password: 'p@ss:w', database: 'worddefender' });
  });

  it('đọc từ bộ DATABASE_* của vps db-create, cổng mặc định 3306', () => {
    const cfg = readDatabaseConfig({
      DATABASE_HOST: 'mysql',
      DATABASE_NAME: 'worddefender',
      DATABASE_USERNAME: 'worddefender',
      DATABASE_PASSWORD: 'abc',
    });
    expect(cfg).toMatchObject({ host: 'mysql', port: 3306, database: 'worddefender', connectionLimit: 5 });
  });

  it('báo rõ khóa còn thiếu', () => {
    expect(() => readDatabaseConfig({ DATABASE_HOST: 'mysql' })).toThrow(/DATABASE_NAME.*DATABASE_USERNAME.*DATABASE_PASSWORD/);
  });
});
