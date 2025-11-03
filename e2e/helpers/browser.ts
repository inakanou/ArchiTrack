import { chromium, LaunchOptions, BrowserContextOptions } from '@playwright/test';

/**
 * Claude Code用ブラウザ操作ヘルパー
 * Claude Codeから直接ブラウザを起動して操作するためのユーティリティ
 */

interface CaptureScreenshotOptions {
  launchOptions?: LaunchOptions;
  contextOptions?: BrowserContextOptions;
}

interface ScreenshotResult {
  success: boolean;
  path?: string;
  error?: string;
}

interface PageInfo {
  title: string;
  url: string;
  content: string;
}

interface PageInfoError {
  error: string;
}

interface ApiResult {
  status: number;
  ok: boolean;
  body: unknown;
}

interface ApiError {
  error: string;
}

/**
 * ブラウザを起動してスクリーンショットを撮影
 * @param url - アクセスするURL
 * @param outputPath - スクリーンショットの保存先
 * @param options - オプション
 */
export async function captureScreenshot(
  url: string,
  outputPath: string = 'screenshot.png',
  options: CaptureScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
    ...options.launchOptions,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...options.contextOptions,
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`スクリーンショット保存: ${outputPath}`);

    return { success: true, path: outputPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', errorMessage);
    return { success: false, error: errorMessage };
  } finally {
    await browser.close();
  }
}

/**
 * ブラウザを起動してページ情報を取得
 * @param url - アクセスするURL
 */
export async function getPageInfo(url: string): Promise<PageInfo | PageInfoError> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    const info: PageInfo = {
      title: await page.title(),
      url: page.url(),
      content: await page.content(),
    };

    console.log('ページ情報:', info);
    return info;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', errorMessage);
    return { error: errorMessage };
  } finally {
    await browser.close();
  }
}

/**
 * APIエンドポイントをテスト
 * @param apiUrl - APIのURL
 */
export async function testAPI(apiUrl: string): Promise<ApiResult | ApiError> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const context = await browser.newContext();

  try {
    const response = await context.request.get(apiUrl);
    const status = response.status();
    const body = await response.text();

    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      // JSON以外のレスポンス
    }

    const result: ApiResult = {
      status,
      ok: response.ok(),
      body: json || body.substring(0, 200),
    };

    console.log('APIレスポンス:', result);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', errorMessage);
    return { error: errorMessage };
  } finally {
    await browser.close();
  }
}

/**
 * Display usage information
 */
function showUsage(): void {
  console.log('Usage:');
  console.log('  node browser.js screenshot <URL> [output-path]');
  console.log('  node browser.js info <URL>');
  console.log('  node browser.js api <API_URL>');
  console.log('');
  console.log('Examples:');
  console.log('  node browser.js screenshot http://localhost:5173 screenshot.png');
  console.log('  node browser.js info http://localhost:5173');
  console.log('  node browser.js api http://localhost:3000/health');
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  if (!command) {
    console.error('Error: No command specified\n');
    showUsage();
    process.exit(1);
  }

  switch (command) {
    case 'screenshot':
      if (!arg1) {
        console.error('Error: URL is required for screenshot command\n');
        showUsage();
        process.exit(1);
      }
      await captureScreenshot(arg1, arg2 || 'screenshot.png');
      break;
    case 'info':
      if (!arg1) {
        console.error('Error: URL is required for info command\n');
        showUsage();
        process.exit(1);
      }
      await getPageInfo(arg1);
      break;
    case 'api':
      if (!arg1) {
        console.error('Error: API URL is required for api command\n');
        showUsage();
        process.exit(1);
      }
      await testAPI(arg1);
      break;
    default:
      console.error(`Error: Unknown command "${command}"\n`);
      showUsage();
      process.exit(1);
  }
}
