import { defineConfig } from 'vitest/config';

/**
 * CI環境かどうかを判定
 * GitHub ActionsではCI=trueが自動設定される
 */
const isCI = !!process.env.CI;

/**
 * Pre-Push環境かどうかを判定
 * pre-push hookから実行される場合にPRE_PUSH=trueが設定される
 * CI同等の並列実行を有効化しつつ、WSL2メモリ制約に配慮してフォーク数を制限
 */
const isPrePush = !!process.env.PRE_PUSH;

/**
 * 並列実行を有効化するかどうか
 * CI環境またはPre-Push環境で有効化される
 */
const enableParallel = isCI || isPrePush;

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
    // ============================================================================
    // 並列実行設定（環境別最適化 - 3段階モード）
    // ============================================================================
    // ベストプラクティス: 環境に応じた並列実行の制御
    // - CI環境: 十分なリソースがあるため完全並列実行（CPUコア数に応じて自動調整）
    // - Pre-Push環境: CI同等の並列実行でバグ検出、フォーク数制限でOOM防止
    // - ローカル（WSL2）: メモリ制約のため順序実行を維持
    // ============================================================================
    pool: 'forks',
    poolOptions: {
      forks: {
        // CI/Pre-Push環境では並列実行を有効化
        // ローカルでは共有DB対応のため順序実行
        singleFork: !enableParallel,
        // CI環境: ワーカー数を自動調整（CPUコア数）
        // Pre-Push環境: WSL2メモリ制約のためフォーク数を2に制限
        // ローカル: 1に制限
        ...(isCI
          ? {}
          : enableParallel
            ? { maxForks: 2, minForks: 1 }
            : { maxForks: 1, minForks: 1 }),
      },
    },
    // CI/Pre-Push環境ではファイル並列実行を有効化
    fileParallelism: enableParallel,
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
