import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**'],
    // ============================================================================
    // Reporter設定（進捗表示の改善）
    // ============================================================================
    // ベストプラクティス: 環境に応じた適切なレポーター選択
    // - ローカル: verbose（各テストの詳細と進捗を表示）
    // - CI: default + github-actions（GitHub Actionsとの統合）
    // ============================================================================
    reporter: isCI ? ['default', 'github-actions'] : ['verbose'],
    // ============================================================================
    // 並列実行設定（環境別最適化 - 3段階モード）
    // ============================================================================
    // ベストプラクティス: 環境に応じた並列実行の制御
    // - CI環境: 十分なリソースがあるため完全並列実行（CPUコア数に応じて自動調整）
    // - Pre-Push環境: CI同等の並列実行でバグ検出、フォーク数制限でOOM防止
    // - ローカル（WSL2）: メモリ制約のため順序実行を維持
    // ============================================================================
    fileParallelism: enableParallel,
    // ============================================================================
    // メモリ管理設定（OOM対策）
    // ============================================================================
    // pool: 'forks' により各テストファイルを独立プロセスで実行
    // これによりファイル間でメモリリークが蓄積されることを防ぐ
    // isolate: true により各テストファイル間でモジュールキャッシュを分離
    // ============================================================================
    pool: 'forks',
    poolOptions: {
      forks: {
        // CI環境: ワーカー数を自動調整（CPUコア数）
        // Pre-Push環境: WSL2メモリ制約のためフォーク数を2に制限
        // ローカル: 1に制限
        maxForks: isCI ? undefined : enableParallel ? 2 : 1,
        minForks: isCI ? undefined : 1,
        isolate: true, // 各テストファイルを分離
      },
    },
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
