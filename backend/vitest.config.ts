import { defineConfig, configDefaults } from 'vitest/config';

/**
 * CI環境かどうかを判定
 * GitHub ActionsではCI=trueが自動設定される
 */
const isCI = !!process.env.CI;

/**
 * 検証ファイルの全体。統合検証を含む。
 * 既定の実行は「全体から統合検証を除いたもの」であり、include を狭めては**いない**。
 * こうしておくと、`src/` のどこに検証ファイルを置いても既定の実行から漏れない。
 */
export const ALL_TEST_FILE_GLOB = 'src/**/*.{test,spec}.ts';

/**
 * 統合検証の置き場所。
 *
 * 統合検証は実データベース（ローカルでは `localhost:5433/architrack_test`）と実 Redis へ
 * 書き込む。E2E が同じデータベースを使っている最中に既定の実行が混ざると、E2E を壊す。
 * そのため既定の実行からは**構成として**外し、統合検証は
 * `vitest.integration.config.ts` を明示した実行でのみ選ぶ。
 *
 * 実行時の環境変数による切り替えは使わない。理由は二つある。
 * 1. 設定しても何も変わらない環境変数（かつての `RUN_INTEGRATION_TESTS`）は、
 *    読み手に分離を誤信させる分だけ無いより悪い。
 * 2. 前提条件で検証を自動的に無効化する構成（`describe.skipIf(...)` の類）は、
 *    本プロジェクトの運用原則が禁じている。無効化ではなく**選択**で分ける。
 *
 * この分離が壊れていないことは
 * `src/__tests__/unit/config/vitest-suite-separation.test.ts` が見張る。
 */
export const INTEGRATION_TEST_FILE_GLOB = 'src/__tests__/integration/**/*.{test,spec}.ts';

/** 既定・統合のどちらの実行でも共通して除く物（node_modules / dist など vitest の既定） */
export const SHARED_TEST_EXCLUDE: readonly string[] = configDefaults.exclude;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [ALL_TEST_FILE_GLOB],
    // 統合検証は既定の実行から外す（分離の実体はここ。実行時の環境変数ではない）
    exclude: [...SHARED_TEST_EXCLUDE, INTEGRATION_TEST_FILE_GLOB],
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
    // Vitest 4: poolOptions は廃止、トップレベルオプションに移行
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    execArgv: ['--max-old-space-size=512'],
    // フック（beforeAll/afterAll等）のタイムアウト
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // clean: false - npmスクリプト側で手動クリーンアップを実施
      // vitestのデフォルトclean(true)はcoverage/ディレクトリを削除する際に
      // .tmpサブディレクトリも消してしまい、forkワーカーの書き込みがENOENTになるため無効化
      clean: false,
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
