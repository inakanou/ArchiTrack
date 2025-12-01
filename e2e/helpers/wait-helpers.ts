/**
 * @fileoverview E2Eテスト用の待機ヘルパー関数
 *
 * CI環境での安定性を向上させるための待機関連ユーティリティを提供します。
 * `waitForTimeout` の使用を避け、明示的な条件に基づく待機を行います。
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * CI環境かどうかを判定
 */
const isCI = !!process.env.CI;

/**
 * CI環境用のタイムアウト倍率
 */
const CI_TIMEOUT_MULTIPLIER = 2;

/**
 * 環境に応じたタイムアウト値を取得
 *
 * @param baseTimeout - 基本タイムアウト値（ミリ秒）
 * @returns 環境に応じたタイムアウト値
 */
export function getTimeout(baseTimeout: number): number {
  return isCI ? baseTimeout * CI_TIMEOUT_MULTIPLIER : baseTimeout;
}

/**
 * ページの完全読み込みを待機
 *
 * networkidleを待機します。
 * `waitForTimeout` の代わりに使用してください。
 *
 * @param page - Playwrightのページオブジェクト
 * @param options - オプション
 */
export async function waitForPageStable(
  page: Page,
  options?: {
    /** タイムアウト（ミリ秒）*/
    timeout?: number;
  }
): Promise<void> {
  const timeout = options?.timeout ?? getTimeout(30000);

  // ネットワークアイドルを待機
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * 認証状態が確立するまで待機
 *
 * localStorageにリフレッシュトークンが保存されるまで待機します。
 * CI環境では複数回リトライします。
 *
 * @param page - Playwrightのページオブジェクト
 * @param options - オプション
 * @returns 認証状態が確立した場合はtrue
 */
export async function waitForAuthState(
  page: Page,
  options?: {
    /** 最大リトライ回数 */
    maxRetries?: number;
    /** リトライ間隔（ミリ秒）*/
    retryInterval?: number;
    /** タイムアウト（ミリ秒）*/
    timeout?: number;
  }
): Promise<boolean> {
  const maxRetries = options?.maxRetries ?? (isCI ? 5 : 3);
  const timeout = options?.timeout ?? getTimeout(10000);

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // ページが閉じられていないか確認
      if (page.isClosed()) {
        return false;
      }

      // ネットワークアイドルを待機
      await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

      // リフレッシュトークンとアクセストークンの両方の存在を確認
      await page.waitForFunction(
        () =>
          localStorage.getItem('refreshToken') !== null &&
          localStorage.getItem('accessToken') !== null,
        {
          timeout,
          polling: 500,
        }
      );

      return true;
    } catch (error) {
      // ページが閉じられた場合は即座に終了
      if (page.isClosed()) {
        return false;
      }

      // ターゲットが閉じられたエラーの場合も終了
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Target page, context or browser has been closed')) {
        return false;
      }

      if (retry < maxRetries - 1) {
        try {
          // ページがまだ開いている場合のみリロード
          if (!page.isClosed()) {
            await page.reload({ waitUntil: 'networkidle' });
          }
        } catch {
          // リロードに失敗した場合は終了
          return false;
        }
      }
    }
  }

  return false;
}

/**
 * 要素が表示されるまでリトライ付きで待機
 *
 * 指定された要素が表示されるまで、ページリロードを含めてリトライします。
 *
 * @param page - Playwrightのページオブジェクト
 * @param locator - 待機対象の要素ロケーター
 * @param options - オプション
 * @returns 要素が表示された場合はtrue
 */
export async function waitForElementWithRetry(
  page: Page,
  locator: Locator,
  options?: {
    /** 最大リトライ回数 */
    maxRetries?: number;
    /** 各リトライのタイムアウト（ミリ秒）*/
    timeout?: number;
    /** リトライ時にページをリロードするかどうか */
    reloadOnRetry?: boolean;
  }
): Promise<boolean> {
  const maxRetries = options?.maxRetries ?? (isCI ? 5 : 3);
  const timeout = options?.timeout ?? getTimeout(10000);
  const reloadOnRetry = options?.reloadOnRetry ?? true;

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // ページが閉じられていないか確認
      if (page.isClosed()) {
        return false;
      }

      await expect(locator).toBeVisible({ timeout });
      return true;
    } catch (error) {
      // ページが閉じられた場合は即座に終了
      if (page.isClosed()) {
        return false;
      }

      // ターゲットが閉じられたエラーの場合も終了
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Target page, context or browser has been closed')) {
        return false;
      }

      if (retry < maxRetries - 1) {
        try {
          if (reloadOnRetry && !page.isClosed()) {
            await page.reload({ waitUntil: 'networkidle' });
          }
          // 短い待機を挟む
          if (!page.isClosed()) {
            await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
          }
        } catch {
          // リロードに失敗した場合は終了
          return false;
        }
      }
    }
  }

  return false;
}

/**
 * APIレスポンスを待機しながらアクションを実行
 *
 * ボタンクリックなどのアクション実行時に、対応するAPIレスポンスを待機します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param action - 実行するアクション（async関数）
 * @param urlPattern - 待機するAPIのURLパターン（正規表現または文字列）
 * @param options - オプション
 */
export async function waitForApiResponse(
  page: Page,
  action: () => Promise<void>,
  urlPattern: string | RegExp,
  options?: {
    /** タイムアウト（ミリ秒）*/
    timeout?: number;
    /** 期待するHTTPステータスコード */
    expectedStatus?: number;
  }
): Promise<void> {
  const timeout = options?.timeout ?? getTimeout(15000);

  const responsePromise = page.waitForResponse(
    (response) => {
      const urlMatch =
        typeof urlPattern === 'string'
          ? response.url().includes(urlPattern)
          : urlPattern.test(response.url());

      if (!urlMatch) return false;

      if (options?.expectedStatus !== undefined) {
        return response.status() === options.expectedStatus;
      }

      return true;
    },
    { timeout }
  );

  await action();
  await responsePromise;
}

/**
 * ローディング完了を待機
 *
 * ローディングインジケーターが非表示になるまで待機します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param options - オプション
 */
export async function waitForLoadingComplete(
  page: Page,
  options?: {
    /** ローディングインジケーターのセレクター（デフォルト: テキスト「読み込み中」） */
    loadingSelector?: string;
    /** タイムアウト（ミリ秒）*/
    timeout?: number;
  }
): Promise<void> {
  const timeout = options?.timeout ?? getTimeout(30000);

  // デフォルトのローディングインジケーター
  const loadingLocator = options?.loadingSelector
    ? page.locator(options.loadingSelector)
    : page.getByText(/読み込み中/i);

  // ローディングインジケーターが存在する場合のみ待機
  const loadingCount = await loadingLocator.count();
  if (loadingCount > 0) {
    await expect(loadingLocator).toBeHidden({ timeout });
  }
}

/**
 * セッションデータの読み込み完了を待機
 *
 * セッション管理ページでセッションデータが読み込まれるまで待機します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param options - オプション
 */
export async function waitForSessionDataLoaded(
  page: Page,
  options?: {
    /** タイムアウト（ミリ秒）*/
    timeout?: number;
    /** 最大リトライ回数 */
    maxRetries?: number;
  }
): Promise<boolean> {
  const timeout = options?.timeout ?? getTimeout(20000);
  const maxRetries = options?.maxRetries ?? (isCI ? 5 : 3);

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // ページが閉じられていないか確認
      if (page.isClosed()) {
        return false;
      }

      // ネットワークアイドルを待機
      await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });

      // ローディング完了を待機
      await waitForLoadingComplete(page, { timeout });

      // セッションデータまたは空状態メッセージのいずれかが表示されるまで待機
      await Promise.race([
        expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout }),
        expect(page.getByText(/全デバイスからログアウト/i)).toBeVisible({ timeout }),
        expect(page.getByText(/アクティブなセッションがありません/i)).toBeVisible({ timeout }),
      ]);

      return true;
    } catch (error) {
      // ページが閉じられた場合は即座に終了
      if (page.isClosed()) {
        return false;
      }

      // ターゲットが閉じられたエラーの場合も終了
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Target page, context or browser has been closed')) {
        return false;
      }

      if (retry < maxRetries - 1) {
        try {
          // ページがまだ開いている場合のみリロード
          if (!page.isClosed()) {
            await page.reload({ waitUntil: 'networkidle' });

            // セッション管理ページのヘッダーが表示されるまで待機
            await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
              timeout: getTimeout(15000),
            });
          }
        } catch {
          // リロードに失敗した場合は終了
          return false;
        }
      }
    }
  }

  return false;
}

/**
 * 認証後のリダイレクト完了を待機
 *
 * ログイン成功後、ダッシュボードへのリダイレクトが完了するまで待機します。
 *
 * @param page - Playwrightのページオブジェクト
 * @param options - オプション
 */
export async function waitForAuthRedirect(
  page: Page,
  options?: {
    /** リダイレクト先のURLパターン（デフォルト: /dashboard または /）*/
    targetUrl?: RegExp;
    /** タイムアウト（ミリ秒）*/
    timeout?: number;
  }
): Promise<void> {
  const targetUrl = options?.targetUrl ?? /\/dashboard|\/$/;
  const timeout = options?.timeout ?? getTimeout(15000);

  // URLが変わるまで待機
  await page.waitForURL(targetUrl, { timeout });

  // ネットワークアイドルを待機
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
}
