import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // WSL環境でのメモリ不足を防ぐため、並行実行を制限
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        // CSS/スタイルファイルは除外
        'src/**/*.css',
        // indexファイルは除外（re-exportのみ）
        'src/**/index.ts',
      ],
      thresholds: {
        // ===== グローバル閾値（全体平均で満たすべきカバレッジ）=====
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        // ===== カバレッジ低下防止 =====
        // カバレッジが現在値より下がった場合に失敗
        // 注意: 初回実行時は閾値が自動設定される
        // autoUpdate: true,  // 閾値を自動更新（本番では無効推奨）
      },
    },
  },
});
