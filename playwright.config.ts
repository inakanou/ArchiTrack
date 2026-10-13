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
 * - 再試行で回復した実行は failOnFlakyTests により失敗として扱う（間欠失敗を隠さない）
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
  // 再試行は環境由来の揺らぎ（コンテナの起動直後の遅延など）を吸収するために置いている。
  // ただし再試行は実装や検証の欠陥まで吸収してしまうため、下の failOnFlakyTests と対で使う。
  // 再試行は「回復させて緑にする」ためではなく、「何回中何回落ちたか」を記録するために残している。
  retries: isCI ? 3 : 1,

  // 再試行で回復した実行（flaky）を失敗として扱う
  // ------------------------------------------------------------------------
  // 「緑であること」と「一度で緑になること」は別の主張である。
  // 再試行のみで回復した実行は後者を満たしていないため、総合判定を failed とし
  // 終了コード 1 で返す（Playwright 1.52+ の組み込み機能）。
  // これにより pre-push（CI=true npx playwright test の終了コードで合否を判定）と
  // GitHub Actions（Run E2E tests ステップの終了コード）の双方で間欠失敗が表面化する。
  // 詳細（採否の根拠と実測）は
  // .kiro/specs/site-survey/e2e-assertion-guard-reduction-plan.md §6.3 を参照。
  // 内訳の可視化は e2e/reporters/progress-reporter.ts が担う。
  // 注: `test.fail()` の期待された失敗は outcome が expected であり flaky にはならない。
  failOnFlakyTests: true,

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
