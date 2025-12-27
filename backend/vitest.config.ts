import { defineConfig } from 'vitest/config';

/**
 * CI環境かどうかを判定
 * GitHub ActionsではCI=trueが自動設定される
 */
const isCI = !!process.env.CI;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // ============================================================================
    // Reporter設定（進捗表示の改善）
    // ============================================================================
    // ベストプラクティス: 環境に応じた適切なレポーター選択
    // - ローカル: verbose（各テストの詳細と進捗を表示）
    // - CI: default + github-actions（GitHub Actionsとの統合）
    // ============================================================================
    reporter: isCI ? ['default', 'github-actions'] : ['verbose'],
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
        // Prisma生成ファイルはORM自体のテストで担保されるため除外
        'src/generated/**/*.ts',
      ],
      thresholds: {
        // ===== グローバル閾値（全体平均で満たすべきカバレッジ）=====
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        // ===== perFile閾値 =====
        // Vitestのperfile: trueはグローバル閾値を各ファイルに適用するため使用しない
        // 代わりに、coverage:checkスクリプト（check-coverage-gaps.cjs）で
        // 段階的な閾値チェックを実施:
        //   - 緊急対応（≤30%）: CIエラー
        //   - 警告（31-50%）: CI警告
        //   - 目標（≥80%）: 推奨
      },
    },
  },
});
