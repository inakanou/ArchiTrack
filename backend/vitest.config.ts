import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.d.ts',
        'src/types/**/*.ts',
        // ルートファイルは統合テストでテストされるため、単体テストカバレッジから除外
        'src/routes/**/*.ts',
        // エントリーポイントは統合テストでテストされるため除外
        'src/app.ts',
        'src/index.ts',
        // Swagger生成スクリプトは実行時のみ使用されるため除外
        'src/generate-swagger.ts',
        // データベースとRedis接続モジュールは統合テストでテストされるため除外
        'src/db.ts',
        'src/redis.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});
