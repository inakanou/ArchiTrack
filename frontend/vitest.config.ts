import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * CI環境かどうかを判定
 * GitHub ActionsではCI=trueが自動設定される
 */
const isCI = !!process.env.CI;

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
    // 並列実行設定（環境別最適化）
    // ============================================================================
    // ベストプラクティス: 環境に応じた並列実行の制御
    // - CI環境: 十分なリソースがあるため並列実行を有効化
    // - ローカル（WSL2）: メモリ制約のため順序実行を維持
    // ============================================================================
    fileParallelism: isCI,
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
        // CI環境では並列実行を有効化（CPUコア数に応じて自動調整）
        // ローカル（WSL2）ではメモリ制約のため1に制限
        maxForks: isCI ? undefined : 1,
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
