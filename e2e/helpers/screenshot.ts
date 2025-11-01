import { Page, TestInfo } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * タイムスタンプ付きディレクトリ名を生成
 * 形式: YYYYMMDD-HHMMSS
 */
function getTimestampedDir(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * テストケース名をファイル名に安全な形式に変換
 */
function sanitizeTestName(testName: string): string {
  return testName
    .replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\s-]/g, '') // 英数字、日本語、スペース、ハイフン以外を削除
    .replace(/\s+/g, '-') // スペースをハイフンに変換
    .toLowerCase();
}

/**
 * スクリーンショットを撮影してタイムスタンプ付きフォルダに保存
 *
 * @param page - Playwrightのページオブジェクト
 * @param testInfo - Playwrightのテスト情報
 * @param name - スクリーンショットの名前（省略時はテストケース名を使用）
 * @param options - スクリーンショットオプション
 * @returns スクリーンショットのパス
 *
 * @example
 * ```typescript
 * await takeScreenshot(page, testInfo, 'login-page');
 * // → playwright-report/screenshots/20251102-073000/homepage/chromium/login-page.png
 * ```
 */
export async function takeScreenshot(
  page: Page,
  testInfo: TestInfo,
  name?: string,
  options?: {
    fullPage?: boolean;
  }
): Promise<string> {
  // タイムスタンプディレクトリを取得（テスト実行開始時のタイムスタンプ）
  const timestamp = process.env.PLAYWRIGHT_TIMESTAMP || getTimestampedDir();
  if (!process.env.PLAYWRIGHT_TIMESTAMP) {
    process.env.PLAYWRIGHT_TIMESTAMP = timestamp;
  }

  // テストファイル名からスイート名を取得
  const testFile = testInfo.file.split('/').pop()?.replace('.spec.ts', '') || 'unknown';
  const suiteName = sanitizeTestName(testFile);

  // スクリーンショット名を生成
  const screenshotName = name || sanitizeTestName(testInfo.title);

  // プロジェクト名（ブラウザ名）
  const projectName = testInfo.project.name || 'default';

  // スクリーンショットのパスを生成
  // 形式: playwright-report/screenshots/{timestamp}/{suite}/{project}/{name}.png
  const screenshotPath = `playwright-report/screenshots/${timestamp}/${suiteName}/${projectName}/${screenshotName}.png`;

  // ディレクトリが存在しない場合は作成
  try {
    await mkdir(dirname(screenshotPath), { recursive: true });
  } catch (error) {
    // ディレクトリが既に存在する場合は無視
  }

  // スクリーンショットを撮影
  await page.screenshot({
    path: screenshotPath,
    fullPage: options?.fullPage ?? true,
  });

  // testInfoにスクリーンショットを添付（HTMLレポートに表示されるようにする）
  await testInfo.attach(screenshotName, {
    path: screenshotPath,
    contentType: 'image/png',
  });

  return screenshotPath;
}

/**
 * 失敗時のスクリーンショットを自動撮影
 * テストのafterEachフックで使用
 *
 * @param page - Playwrightのページオブジェクト
 * @param testInfo - Playwrightのテスト情報
 *
 * @example
 * ```typescript
 * test.afterEach(async ({ page }, testInfo) => {
 *   await takeScreenshotOnFailure(page, testInfo);
 * });
 * ```
 */
export async function takeScreenshotOnFailure(page: Page, testInfo: TestInfo): Promise<void> {
  // テストが失敗した場合のみスクリーンショットを撮影
  if (testInfo.status !== testInfo.expectedStatus) {
    await takeScreenshot(page, testInfo, `${sanitizeTestName(testInfo.title)}-failure`);
  }
}
