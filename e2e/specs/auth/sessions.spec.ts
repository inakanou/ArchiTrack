import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  waitForSessionDataLoaded,
  waitForLoadingComplete,
  getTimeout,
} from '../../helpers/wait-helpers';

/**
 * セッション管理機能のE2Eテスト
 *
 * @requirement user-authentication/REQ-8 セッション管理
 *
 * CI環境での安定性を向上させるため、以下の対策を実装:
 * - リトライ付きの待機関数を使用
 * - 固定時間待機（waitForTimeout）を廃止
 * - 適切なタイムアウト設定
 */
test.describe('セッション管理機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageとsessionStorageもクリア
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // 認証済みユーザーとしてログイン（グローバルセットアップで作成済み）
    await loginAsUser(page, 'REGULAR_USER');

    // セッション管理ページに移動（リトライ付き）
    const maxNavigationRetries = 3;
    for (let navRetry = 0; navRetry < maxNavigationRetries; navRetry++) {
      await page.goto('/sessions');

      // CI環境での安定性向上のため、ページロード完了を待機
      await page.waitForLoadState('networkidle', { timeout: getTimeout(30000) });

      // 認証が失われてログインページにリダイレクトされた場合は再ログイン
      if (page.url().includes('/login')) {
        await loginAsUser(page, 'REGULAR_USER');
        await page.goto('/sessions');
        await page.waitForLoadState('networkidle', { timeout: getTimeout(30000) });
      }

      // セッション管理ページが表示されるまで明示的に待機
      try {
        await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
          timeout: getTimeout(15000),
        });
        break;
      } catch {
        if (navRetry < maxNavigationRetries - 1) {
          // リトライ前に認証状態を確認して再ログイン
          await loginAsUser(page, 'REGULAR_USER');
        }
      }
    }

    // ローディング完了を待機
    await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

    // セッションデータの読み込み完了を待機（リトライ付き、CI用に増加）
    const sessionDataLoaded = await waitForSessionDataLoaded(page, {
      timeout: getTimeout(30000),
      maxRetries: 7,
    });

    if (!sessionDataLoaded) {
      // ログインページにリダイレクトされた場合、またはAPIエラーが発生している場合は再ログインを試みる
      const isOnLoginPage = page.url().includes('/login');
      const hasError =
        !isOnLoginPage &&
        (await page.getByText(/セッション情報を取得できませんでした/i).isVisible());

      if (isOnLoginPage || hasError) {
        await loginAsUser(page, 'REGULAR_USER');
        await page.goto('/sessions');
        await page.waitForLoadState('networkidle', { timeout: getTimeout(30000) });
        await waitForLoadingComplete(page, { timeout: getTimeout(30000) });
        // 再ログイン後の読み込みも前提である。戻り値を捨てると、前提が崩れたときの失敗は
        // 前提の地点ではなく各テストの操作段階に現れる（Task 115.141）。
        const reloadedAfterRelogin = await waitForSessionDataLoaded(page, {
          timeout: getTimeout(30000),
          maxRetries: 3,
        });
        assertPrepared(reloadedAfterRelogin, '再ログイン後のセッション管理画面の読み込み');
      }
    }

    // 読み込みの成否によらず、セッション管理画面が実際に描けていることを無条件に主張する。
    // 従来は「読み込めなかったときだけ」確認しており、`waitForSessionDataLoaded` が
    // 誤って真を返すと前提の崩れが一切露見せず、各テストの操作段階まで持ち越されていた。
    await expect(
      page
        .getByText(/現在のデバイス/i)
        .or(page.getByText(/全デバイスからログアウト/i))
        .or(page.getByText(/アクティブなセッションがありません/i))
        .first()
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * 要件8.1: セッション情報の永続化
   * 要件8.2: アクティブユーザーのセッション有効期限延長
   * @requirement user-authentication/REQ-8.1 @requirement user-authentication/REQ-8.2
   * @requirement user-authentication/REQ-28.30 セッション管理リンククリック → セッション管理画面遷移
   * @requirement user-authentication/REQ-28.31 プロフィール画面表示 → セッション管理リンク表示
   * @requirement user-authentication/REQ-28.34 セッション管理画面表示 → アクティブセッション一覧と他デバイスログアウトボタン表示
   */
  test('セッション一覧が正しく表示される', async ({ page }) => {
    // セッション一覧のヘッダー（タイムアウト追加）
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 現在のデバイスが表示される（APIレスポンス待機のためタイムアウト追加）
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: getTimeout(15000) });

    // デバイス情報が表示される（複数セッションがある場合は.first()を使用）
    await expect(
      page.getByText(/Chrome on Windows|Safari on iOS|Firefox on Linux/).first()
    ).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement user-authentication/REQ-8.3 デバイス毎の独立セッション管理
   */
  test('個別デバイスログアウトボタンが表示される', async ({ page }) => {
    // 要件8.1: ログインでセッションが永続化されるため、ログイン直後は必ず1件以上のセッションがある。
    // 「表示されなければリロードして再ログインする」復旧は、セッションが1件も返らない欠陥を
    // 黙って埋め合わせてしまうため置かない。`toBeVisible` の待機自体が再試行を担う。
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: getTimeout(30000) });

    // ログアウトボタンが表示される（現在のデバイス以外）
    const logoutButtons = page.getByRole('button', { name: /ログアウト/i });
    await expect(logoutButtons.first()).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * @requirement user-authentication/REQ-8.4 対象デバイスのみのセッション削除
   */
  test('個別デバイスログアウトができる', async ({ page }) => {
    // 要件8.1: ログイン直後は必ずセッションが1件以上あるため、無条件に主張する。
    // 観測して再ログインする復旧は、セッションが返らない欠陥を隠したうえで
    // 「何回目の試行を検証したのか」も読めなくしていた。
    await expect(page.getByText(/現在のデバイス/i)).toBeVisible({ timeout: getTimeout(30000) });

    // 個別デバイスのログアウトボタンが表示されるまで待機
    const logoutButton = page.getByRole('button', { name: /^ログアウト$/i }).first();
    await expect(logoutButton).toBeVisible({ timeout: getTimeout(10000) });

    // 個別デバイスのログアウトボタンをクリック（現在のデバイス以外の最初のセッション）
    await logoutButton.click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/このデバイスをログアウトしますか/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 確認ボタンをクリック（aria-label="はい"のボタン）
    await page.getByRole('button', { name: /^はい$/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/ログアウトしました|デバイスをログアウトしました/i)).toBeVisible({
      timeout: getTimeout(10000),
    });
  });

  /**
   * @requirement user-authentication/REQ-8.5 全デバイスログアウト機能の提供
   */
  test('全デバイスログアウトボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /全デバイスからログアウト/i })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * @requirement user-authentication/REQ-8.5 全デバイスログアウト機能の実行
   * @requirement user-authentication/REQ-28.35 セッション管理画面で戻るリンククリック → プロフィール画面遷移
   * @requirement user-authentication/REQ-28.41 ログアウトボタンクリック → ログアウト処理、ログイン画面遷移
   * @requirement user-authentication/REQ-28.42 ログアウト完了 → メッセージ表示
   * @requirement user-authentication/REQ-28.44 ブラウザ戻るボタン → 前画面表示
   */
  test('全デバイスログアウトができる', async ({ page }) => {
    // beforeEachですでに/sessionsページに移動済み
    // ページをリロードしてセッション状態をリフレッシュ
    await page.reload({ waitUntil: 'networkidle' });

    // リロードで認証が失われないことは要件8.1（セッションの永続化）そのものである。
    // 従来はログインページへ落ちていたら黙って再ログインしていたため、
    // セッションが永続化されていなくても検証は緑のまま通っていた。
    await expect(page).not.toHaveURL(/\/login/);

    // セッション管理ページが表示されるまで待機
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // ローディング完了を待機
    await waitForLoadingComplete(page, { timeout: getTimeout(30000) });

    // セッションデータの読み込み完了を待機
    const sessionDataLoaded = await waitForSessionDataLoaded(page, {
      timeout: getTimeout(30000),
      maxRetries: 7,
    });
    expect(sessionDataLoaded, 'セッション情報を読み込めていない（要件8.1）').toBe(true);

    // 要件8.5: 全デバイスログアウトボタンが提供される。
    // 表示されなければリロードして再ログインする復旧は置かない
    // （ボタンが出ない欠陥をそのまま隠すため）。待機は `toBeVisible` が担う。
    const logoutAllButton = page.getByRole('button', { name: /全デバイスからログアウト/i });
    await expect(logoutAllButton).toBeVisible({ timeout: getTimeout(30000) });

    await logoutAllButton.click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/全てのデバイスからログアウトします/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 確認ボタンをクリック（aria-label="はい、全デバイスからログアウト"のボタン）
    await page.getByRole('button', { name: /はい、全デバイスからログアウト/i }).click();

    // ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(15000) });
  });

  /**
   * @requirement user-authentication/REQ-8.1 セッション情報の永続化と表示（作成日時・有効期限）
   */
  test('セッション作成日時と有効期限が表示される', async ({ page }) => {
    // 作成日時が表示される（複数セッションがある場合は最初の要素を確認）
    await expect(page.getByText(/作成日時:/).first()).toBeVisible({ timeout: getTimeout(10000) });

    // 有効期限が表示される（複数セッションがある場合は最初の要素を確認）
    await expect(page.getByText(/有効期限:/).first()).toBeVisible({ timeout: getTimeout(10000) });
  });
});
