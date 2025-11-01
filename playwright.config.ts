import { defineConfig, devices } from '@playwright/test';

/**
 * タイムスタンプ付きディレクトリ名を生成
 * 形式: YYYYMMDD-HHMMSS
 */
function getTimestampedDir(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  return timestamp;
}

const timestamp = getTimestampedDir();

/**
 * Playwright E2E Test Configuration for ArchiTrack
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // テストファイルのパス
  testDir: './e2e/specs',

  // テスト結果の出力ディレクトリ（タイムスタンプ付き）
  outputDir: `test-results/${timestamp}`,

  // 並列実行の設定
  fullyParallel: true,

  // CI環境でのみリトライを有効化
  retries: process.env.CI ? 2 : 0,

  // ワーカー数の設定
  workers: process.env.CI ? 1 : undefined,

  // レポーター設定
  reporter: [
    ['html', { outputFolder: `playwright-report/${timestamp}` }],
    ['list'],
    process.env.CI ? ['github'] : ['line'],
  ],

  // すべてのテストで共通の設定
  use: {
    // ベースURL（環境変数で上書き可能）
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    // スクリーンショット設定
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true,
    },

    // ビデオ録画設定
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 },
    },

    // トレース設定
    trace: 'on-first-retry',

    // タイムアウト設定
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // テストプロジェクト（ブラウザ設定）
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // WSL2環境用の設定
        launchOptions: {
          args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],

  // Webサーバーの設定（ローカルテスト用のみ）
  // CI環境ではワークフローで明示的にDocker Composeを管理
  webServer: process.env.CI
    ? undefined
    : {
        command: 'docker compose up',
        url: 'http://localhost:5173',
        timeout: 120000,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
