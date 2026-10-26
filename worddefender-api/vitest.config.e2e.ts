import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Các file dùng chung một database và tự dọn dữ liệu của mình, nên chạy tuần tự.
    fileParallelism: false,
  },
});
