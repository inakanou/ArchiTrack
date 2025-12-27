import { defineConfig, devices } from '@playwright/test';

/**
 * タイムスタンプ付きディレクトリ名を生成
 * 形式: YYYYMMDD-HHMMSS
 */
function getTimestampedDir(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  if (!timestamp) {
    throw new Error('Failed to generate timestamp');
  }
  return timestamp;
}

const timestamp = getTimestampedDir();

/**
 * CI環境かどうかを判定
 * GitHub ActionsではCI=trueが自動設定される
 */
const isCI = !!process.env.CI;

/**
 * Playwright E2E Test Configuration for ArchiTrack
 * @see https://playwright.dev/docs/test-configuration
 *
 * CI環境での安定性を重視した設定:
 * - CI環境ではタイムアウトを2倍に延長
 * - リトライ回数を増加（CI: 3回、ローカル: 1回）
 * - 各アクション間の安定待機を追加
 */
export default defineConfig({
  // テストファイルのパス
  testDir: './e2e/specs',

  // グローバルセットアップ（テスト実行前に一度だけ実行）
  // マスターデータ（Role, Permission, RolePermission）を初期化
  globalSetup: './e2e/global-setup.ts',

  // テスト結果の出力ディレクトリ（タイムスタンプ付き）
  outputDir: `test-results/${timestamp}`,

  // 並列実行の設定
  // データベースクリーンアップの競合を防ぐため無効化
  fullyParallel: false,

  // CI環境では3回、ローカルでは1回リトライ
  // CI環境での不安定性を吸収するためリトライ回数を増加
  retries: isCI ? 3 : 1,

  // ワーカー数の設定（シリアル実行のため1に固定）
  workers: 1,

  // ============================================================================
  // レポーター設定（進捗表示の改善）
  // ============================================================================
  // ベストプラクティス: 環境に応じた適切なレポーター選択
  // - カスタム進捗レポーター: 正確なテスト数、経過時間、推定残り時間を表示
  // - HTMLレポーター: 詳細な結果をファイルに保存
  // - CI環境: GitHub Actionsとの統合
  // ============================================================================
  reporter: [
    ['./e2e/reporters/progress-reporter.ts'],
    ['html', { outputFolder: `playwright-report/${timestamp}`, open: 'never' }],
    ...(isCI ? [['github'] as const] : []),
  ],

  // すべてのテストで共通の設定
  use: {
    // ベースURL（環境変数で上書き可能）
    // テスト環境のデフォルトポートは5174（開発環境5173と分離）
    baseURL: process.env.BASE_URL || 'http://localhost:5174',

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

    // トレース設定（CI環境ではリトライ時に有効化）
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',

    // タイムアウト設定（CI環境では延長）
    actionTimeout: isCI ? 30000 : 15000, // CI: 30秒, ローカル: 15秒
    navigationTimeout: isCI ? 90000 : 45000, // CI: 90秒, ローカル: 45秒
  },

  // テスト全体のタイムアウト設定（CI環境では延長）
  timeout: isCI ? 120000 : 60000, // CI: 120秒, ローカル: 60秒

  // expect のタイムアウト（CI環境では延長）
  expect: {
    timeout: isCI ? 20000 : 10000, // CI: 20秒, ローカル: 10秒
  },

  // テストプロジェクト（ブラウザ設定）
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // WSL2環境用のメモリ最適化設定
        // 参考: https://playwright.dev/docs/best-practices
        launchOptions: {
          args: [
            // 基本的なWSL2/Docker対応
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            // メモリ使用量削減オプション
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            // V8ヒープサイズ制限（512MB）
            '--js-flags=--max-old-space-size=512',
            // 追加のメモリ最適化
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-default-apps',
          ],
        },
      },
    },
  ],

  // Webサーバーの設定（ローカルテスト用のみ）
  // CI環境ではワークフローで明示的にDocker Composeを管理
  // テスト環境: ポート5174（開発環境5173と分離）
  webServer: process.env.CI
    ? undefined
    : {
        command:
          'docker compose -p architrack-test -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up',
        url: 'http://localhost:5174',
        timeout: 120000,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
