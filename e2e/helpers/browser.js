import { chromium } from '@playwright/test';

/**
 * Claude Code用ブラウザ操作ヘルパー
 * Claude Codeから直接ブラウザを起動して操作するためのユーティリティ
 */

/**
 * ブラウザを起動してスクリーンショットを撮影
 * @param {string} url - アクセスするURL
 * @param {string} outputPath - スクリーンショットの保存先
 * @param {Object} options - オプション
 */
export async function captureScreenshot(url, outputPath = 'screenshot.png', options = {}) {
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
    console.error('エラー:', error);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

/**
 * ブラウザを起動してページ情報を取得
 * @param {string} url - アクセスするURL
 */
export async function getPageInfo(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    const info = {
      title: await page.title(),
      url: page.url(),
      content: await page.content(),
    };

    console.log('ページ情報:', info);
    return info;
  } catch (error) {
    console.error('エラー:', error);
    return { error: error.message };
  } finally {
    await browser.close();
  }
}

/**
 * APIエンドポイントをテスト
 * @param {string} apiUrl - APIのURL
 */
export async function testAPI(apiUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const context = await browser.newContext();

  try {
    const response = await context.request.get(apiUrl);
    const status = response.status();
    const body = await response.text();

    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      // JSON以外のレスポンス
    }

    const result = {
      status,
      ok: response.ok(),
      body: json || body.substring(0, 200),
    };

    console.log('APIレスポンス:', result);
    return result;
  } catch (error) {
    console.error('エラー:', error);
    return { error: error.message };
  } finally {
    await browser.close();
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  switch (command) {
    case 'screenshot':
      await captureScreenshot(arg1, arg2 || 'screenshot.png');
      break;
    case 'info':
      await getPageInfo(arg1);
      break;
    case 'api':
      await testAPI(arg1);
      break;
    default:
      console.log('使い方:');
      console.log('  node browser.js screenshot <URL> [出力パス]');
      console.log('  node browser.js info <URL>');
      console.log('  node browser.js api <API_URL>');
  }
}
