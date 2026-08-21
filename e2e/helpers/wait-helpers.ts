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

  // 存在の有無を条件にしない。`toBeHidden` は要素が存在しない場合も成立するため、
  // 「出ていれば消えるまで待つ」という意味は保ったまま、観測結果による関門だけが消える。
  // 件数で包んでいた従来の形は、観測が偽（描画前・別名）になった瞬間に待機ごと消えていた。
  await expect(loadingLocator).toBeHidden({ timeout });
}

/**
 * セッションデータの読み込み完了を待機
 *
 * セッション管理ページでセッションデータが読み込まれるまで待機します。
 * APIエラーが発生した場合はfalseを返し、再ログインが必要であることを示します。
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

      // ログインページにリダイレクトされていないかチェック
      if (page.url().includes('/login')) {
        // ログインページにリダイレクトされた場合は再認証が必要
        return false;
      }

      // 周回ごとに、セッション管理画面が描けていることを無条件に主張する。
      // 従来はこの主張を「エラーが出ていた場合の再試行の準備」の内側に置いていたため、
      // エラーが出ない周回では一度も確かめられていなかった。
      await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
        timeout: getTimeout(15000),
      });

      // APIエラーが発生していないかチェック
      const hasError = await page.getByText(/セッション情報を取得できませんでした/i).isVisible();
      if (hasError) {
        // 最終周回でエラーが残っているなら、これ以上の再試行は無い
        if (retry === maxRetries - 1) {
          return false;
        }
        // エラー状態の場合はリトライ（再ログインが必要な場合がある）
        await page.reload({ waitUntil: 'networkidle' });
        continue;
      }

      // セッションデータまたは空状態メッセージのいずれかが表示されるまで待機
      // 注意：「アクティブなセッションがありません」はエラー時にも表示されるため、
      // エラーチェック後にのみ成功と判定する
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

      // 最終周回では再試行の準備をしない
      if (retry === maxRetries - 1) {
        return false;
      }
      // ページが閉じていればリロードできない
      if (page.isClosed()) {
        return false;
      }

      try {
        await page.reload({ waitUntil: 'networkidle' });

        // 再試行の前提として、セッション管理画面が描けていることを無条件に主張する
        await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
          timeout: getTimeout(15000),
        });
      } catch {
        // リロードに失敗した場合は終了
        return false;
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

/**
 * 指定した待機時間の内に要素が表示されるかを待ち、真偽で返す
 *
 * `locator.isVisible()` へ渡した待機時間の指定は Playwright に無視され、
 * 呼び出した瞬間の状態が即時に返る。描画が間に合わなければ必ず false になり、
 * その結果で分岐すると検証そのものが飛ぶ。本補助は `waitFor({ state: 'visible' })`
 * を用いるため、**指定した待機時間が実際に効く**。
 *
 * 表示された時点で直ちに解決するため、要素が現れる場合の所要時間は増えない。
 * 現れない場合は `timeout` を待ち切ってから false を返すため、
 * 「無いことを確かめる」用途に長い待機を与えてはならない。
 *
 * 待機切れ以外の失敗（strict mode 違反、ページ切断など）は握り潰さずに送出する。
 * 偽の false を返すことは、この補助が解消しようとしている欠陥そのものであるため。
 *
 * @param locator - 判定対象の要素ロケーター
 * @param timeout - 待機時間（ミリ秒）。CI 環境で伸ばす場合は `getTimeout()` を通すこと
 * @returns 待機時間内に表示されれば true、待機切れなら false
 */
export async function isVisibleWithin(locator: Locator, timeout: number): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return false;
    }
    throw error;
  }
}
