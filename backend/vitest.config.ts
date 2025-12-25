import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Argon2ハッシュなど計算コストの高い処理に対応するため、タイムアウトを延長
    testTimeout: 15000,
    // Global setup: 全てのテストの前に一度だけ実行される
    // JWT keys, 環境変数などの初期化を行う
    globalSetup: ['./vitest.global-setup.ts'],
    // Setup files: 各テストファイルの前に実行される
    // 環境変数の検証などを行う
    setupFiles: ['./vitest.setup.ts'],
    // Integration tests use shared database, run sequentially to avoid data conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
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
        // ストレージプロバイダーはS3/ローカル統合のため、統合テストでテストされる
        'src/storage/**/*.ts',
        // シードヘルパーは開発/テスト用ツールであり、本番コードではない
        'src/utils/seed-helpers.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
