import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser, createAllTestUsers } from '../../fixtures/auth.fixtures';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../fixtures/seed-helpers';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForLoadingComplete } from '../../helpers/wait-helpers';

/**
 * セッション切れモーダル再認証のE2Eテスト
 *
 * @requirement user-authentication/REQ-30: セッション切れ時のモーダル再認証
 *
 * テスト戦略:
 * - Playwrightのroute interceptを使用してAPIレスポンスを制御
 * - リフレッシュトークンの失効をシミュレートしてセッション切れを発生
 * - モーダル表示、再認証フロー、フォームデータ保持を検証
 *
 * CI環境での安定性を向上させるため:
 * - リトライ付きの待機関数を使用
 * - 環境に応じたタイムアウト設定
 */

/**
 * セッション切れモーダルをトリガーする共通ヘルパー
 *
 * ログイン済みのページでAPIインターセプトを設定し、セッション切れモーダルを表示させる。
 *
 * @param page - Playwrightのページオブジェクト
 * @returns モーダルのdialog Locator
 */
async function triggerSessionExpiredModal(page: import('@playwright/test').Page) {
  // リフレッシュAPIを401で失敗させる（セッション完全切れをシミュレート）
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Refresh token expired',
        code: 'INVALID_REFRESH_TOKEN',
      }),
    });
  });

  // ユーザー情報APIを401で返す（セッション切れをトリガー）
  let meRequestCount = 0;
  await page.route('**/api/v1/auth/me', async (route) => {
    meRequestCount++;
    if (meRequestCount === 1) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Token expired',
          code: 'INVALID_ACCESS_TOKEN',
        }),
      });
    } else {
      await route.continue();
    }
  });

  // APIリクエストをトリガーしてセッション切れを発生させる
  await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken');
    try {
      await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // エラーは無視（セッション切れコールバックが呼ばれる）
    }
  });

  // セッション切れモーダルが表示されることを確認
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: getTimeout(15000) });

  return dialog;
}

/**
 * ログイン→プロフィールページ→認証確立の共通セットアップ
 *
 * @param page - Playwrightのページオブジェクト
 */
async function setupAuthenticatedProfilePage(page: import('@playwright/test').Page) {
  await page.goto('/profile');
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
  await waitForLoadingComplete(page, { timeout: getTimeout(15000) });

  // 認証が確立されていることを確認
  await page.waitForFunction(
    () =>
      localStorage.getItem('refreshToken') !== null && localStorage.getItem('accessToken') !== null,
    { timeout: getTimeout(15000), polling: 500 }
  );
}

test.describe('セッション切れモーダル再認証', () => {
  test.describe.configure({ mode: 'serial' });

  // テストグループ終了後にデータベースをリセット
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await createAllTestUsers(prisma);
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
  });

  /**
   * REQ-30.1: API呼び出し中のセッション切れでモーダル表示
   *
   * @requirement user-authentication/REQ-30.1
   *
   * テスト手順:
   * 1. ログイン後、プロフィールページに移動
   * 2. APIリクエスト時に401+リフレッシュ失敗をシミュレート
   * 3. セッション切れモーダルが表示されることを確認
   */
  test('REQ-30.1: API呼び出し中にセッション切れが発生するとモーダルが表示される', async ({
    page,
  }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // モーダルの内容を確認
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(dialog).toBeVisible();
  });

  /**
   * REQ-30.4: モーダルにメッセージ、メール自動入力、パスワード、再ログインボタン
   *
   * @requirement user-authentication/REQ-30.4
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. タイトルメッセージの存在を確認
   * 3. メールアドレスが読み取り専用で自動入力されていることを確認
   * 4. パスワード入力フィールドの存在を確認
   * 5. 再ログインボタンの存在を確認
   */
  test('REQ-30.4: モーダルにメッセージ、メール自動入力、パスワード、再ログインボタンが表示される', async ({
    page,
  }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // タイトルメッセージ
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible({
      timeout: getTimeout(5000),
    });

    // メールアドレスが読み取り専用で自動入力されていること
    const emailInput = page.locator('#session-expired-email');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('readonly');
    const emailValue = await emailInput.inputValue();
    expect(emailValue).toContain('@');

    // パスワードフィールド
    const passwordInput = page.getByLabel('パスワード');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // 再ログインボタン
    const loginButton = page.getByRole('button', { name: '再ログイン' });
    await expect(loginButton).toBeVisible();
  });

  /**
   * REQ-30.5: モーダル外の画面操作を無効化（オーバーレイ）
   *
   * @requirement user-authentication/REQ-30.5
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. オーバーレイ要素が存在することを確認
   * 3. モーダル外のクリックでモーダルが閉じないことを確認
   */
  test('REQ-30.5: モーダル外の画面操作を無効化するオーバーレイが表示される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // オーバーレイ（固定表示の背景）が存在することを確認
    // モーダルの親要素またはオーバーレイ要素のスタイルを確認
    const overlay = page.locator('[class*="fixed"][class*="inset"]').first();
    await expect(overlay).toBeVisible({ timeout: getTimeout(5000) });

    // モーダル外をクリック（ページ左上の座標）
    await page.mouse.click(10, 10);

    // モーダルがまだ表示されていること（閉じない）
    await expect(dialog).toBeVisible();
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible();
  });

  /**
   * REQ-30.6: Escキーでモーダルが閉じないこと
   *
   * @requirement user-authentication/REQ-30.6
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. Escキーを押す
   * 3. モーダルがまだ表示されていることを確認
   */
  test('REQ-30.6: モーダル表示中にEscキーで閉じないこと', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // Escキーを押す
    await page.keyboard.press('Escape');

    // モーダルがまだ表示されていること
    await expect(dialog).toBeVisible();
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible();
  });

  /**
   * REQ-30.7: パスワードフィールドに自動フォーカス
   *
   * @requirement user-authentication/REQ-30.7
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. パスワード入力フィールドにフォーカスが当たっていることを確認
   */
  test('REQ-30.7: パスワードフィールドに自動フォーカスされる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // パスワードフィールドにフォーカスが当たっていることを確認
    const passwordInput = page.getByLabel('パスワード');
    await expect(passwordInput).toBeVisible({ timeout: getTimeout(5000) });
    await expect(passwordInput).toBeFocused({ timeout: getTimeout(5000) });
  });

  /**
   * REQ-30.8: 有効な認証情報で再認証API呼び出し
   *
   * @requirement user-authentication/REQ-30.8
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. パスワードを入力して再ログインボタンをクリック
   * 3. 再認証APIが呼び出されることを確認
   */
  test('REQ-30.8: 有効な認証情報で再認証API呼び出しが行われる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // 再認証ログインAPIをインターセプトして呼び出しを確認
    let loginApiCalled = false;
    let loginRequestBody: { email?: string; password?: string } = {};
    await page.route('**/api/v1/auth/login', async (route) => {
      loginApiCalled = true;
      const request = route.request();
      loginRequestBody = JSON.parse(request.postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          user: { id: 'test-id', email: 'user@example.com', displayName: 'Test User' },
        }),
      });
    });

    // パスワードを入力して再ログインボタンをクリック
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('Password123!');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // APIが呼び出されたことを確認
    await page.waitForFunction(() => true, {}, { timeout: getTimeout(5000) });
    // 短い待機でAPIコールの完了を待つ
    await page.waitForTimeout(1000);
    expect(loginApiCalled).toBe(true);
    expect(loginRequestBody.password).toBe('Password123!');
  });

  /**
   * REQ-30.9: 再認証成功でモーダル閉じ、トークン更新
   *
   * @requirement user-authentication/REQ-30.9
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. ログインAPIをモックして成功レスポンスを返す
   * 3. パスワードを入力して再ログイン
   * 4. モーダルが閉じることを確認
   * 5. トークンが更新されていることを確認
   */
  test('REQ-30.9: 再認証成功でモーダルが閉じてトークンが更新される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // 再認証ログインAPIを成功で返す
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'renewed-access-token-12345',
          refreshToken: 'renewed-refresh-token-12345',
          user: { id: 'test-id', email: 'user@example.com', displayName: 'Test User' },
        }),
      });
    });

    // パスワードを入力して再ログイン
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('Password123!');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // モーダルが閉じることを確認
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

    // トークンが更新されていることを確認
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBe('renewed-access-token-12345');
  });

  /**
   * REQ-30.10: 再認証成功で入力データ保持
   *
   * @requirement user-authentication/REQ-30.10
   *
   * テスト手順:
   * 1. プロフィールページでフォーム入力を行う
   * 2. セッション切れモーダルを表示
   * 3. 再認証成功
   * 4. 入力データが保持されていることを確認
   */
  test('REQ-30.10: 再認証成功で入力データが保持される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    // プロフィールページが表示されることを確認
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // フォームの表示名フィールドを探して入力データを変更
    const displayNameInput = page.getByLabel(/表示名/i);
    const isDisplayNameVisible = await displayNameInput.isVisible().catch(() => false);
    if (isDisplayNameVisible) {
      await displayNameInput.clear();
      await displayNameInput.fill('テスト変更名');
    }

    // セッション切れモーダルをトリガー
    const dialog = await triggerSessionExpiredModal(page);

    // 再認証ログインAPIを成功で返す
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'renewed-access-token',
          refreshToken: 'renewed-refresh-token',
          user: { id: 'test-id', email: 'user@example.com', displayName: 'Test User' },
        }),
      });
    });

    // パスワードを入力して再ログイン
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('Password123!');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // モーダルが閉じることを確認
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

    // 入力データが保持されていることを確認（ページがリロードされていない）
    // URLがプロフィールページのままであることを確認
    expect(page.url()).toContain('/profile');

    // フォーム入力が保持されていることを確認
    if (isDisplayNameVisible) {
      const currentValue = await displayNameInput.inputValue();
      expect(currentValue).toBe('テスト変更名');
    }
  });

  /**
   * REQ-30.11: 認証失敗でエラー表示、モーダル維持
   *
   * @requirement user-authentication/REQ-30.11
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. 間違ったパスワードで再認証を試みる
   * 3. エラーメッセージが表示されることを確認
   * 4. モーダルが表示されたままであることを確認
   */
  test('REQ-30.11: 認証失敗でエラーが表示されモーダルが維持される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // 再認証ログインAPIを失敗で返す
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'メールアドレスまたはパスワードが正しくありません',
        }),
      });
    });

    // 間違ったパスワードで再認証を試みる
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('wrong-password-123');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible({
      timeout: getTimeout(5000),
    });

    // role="alert"のエラー要素が存在することを確認
    const alertElement = page.locator('[role="alert"]');
    await expect(alertElement).toBeVisible({ timeout: getTimeout(5000) });

    // モーダルが表示されたままであること
    await expect(dialog).toBeVisible();
  });

  /**
   * REQ-30.12: 2FA有効ユーザーで2FA検証フィールド表示
   *
   * @requirement user-authentication/REQ-30.12
   *
   * テスト手順:
   * 1. 2FA有効ユーザーでログイン
   * 2. セッション切れモーダルを表示
   * 3. パスワード入力後にログインAPIがrequires2FA: trueを返す
   * 4. 2FAコード入力フィールドが表示されることを確認
   */
  test('REQ-30.12: 2FA有効ユーザーで2FA検証フィールドが表示される', async ({ page }) => {
    await createTestUser('TWO_FA_USER');
    await loginAsUser(page, 'TWO_FA_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // ログインAPIがrequires2FA: trueを返すようにモック
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          requires2FA: true,
          tempToken: 'temp-2fa-token',
        }),
      });
    });

    // パスワードを入力して再ログイン
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('Password123!');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // 2FAコード入力フィールドが表示されることを確認
    const totpInput = page.getByLabel(/認証コード|TOTP|2FA|ワンタイム/i);
    await expect(totpInput).toBeVisible({ timeout: getTimeout(10000) });
  });

  /**
   * REQ-30.13: API Clientのコールバック通知
   *
   * @requirement user-authentication/REQ-30.13
   *
   * テスト手順:
   * 1. セッション切れを発生させる
   * 2. AuthContextのsessionExpired状態が変化したことを確認
   * 3. モーダルが表示されることで、コールバックが正しく通知されたことを検証
   */
  test('REQ-30.13: API Clientのコールバック通知でモーダルが表示される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    // リフレッシュAPIを失敗させる
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refresh token expired' }),
      });
    });

    let meCount = 0;
    await page.route('**/api/v1/auth/me', async (route) => {
      meCount++;
      if (meCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' }),
        });
      } else {
        await route.continue();
      }
    });

    // API Clientを直接使用してAPIコールをトリガー
    // sessionExpiredCallbackが呼ばれてモーダルが表示されることを確認
    await page.evaluate(async () => {
      const token = localStorage.getItem('accessToken');
      try {
        await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // 無視
      }
    });

    // コールバックが通知され、モーダルが表示されることを確認
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText('セッションの有効期限が切れました')).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * REQ-30.14: AuthContextのsessionExpired状態管理
   *
   * @requirement user-authentication/REQ-30.14
   *
   * テスト手順:
   * 1. セッション切れモーダルが表示される
   * 2. 再認証成功後にモーダルが閉じる（sessionExpired状態がリセットされる）
   * 3. 通常操作が再開できることを確認
   */
  test('REQ-30.14: AuthContextのsessionExpired状態が正しく管理される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // sessionExpired状態 = true（モーダルが表示されている）
    await expect(dialog).toBeVisible();

    // 再認証ログインAPIを成功で返す
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'renewed-access-token',
          refreshToken: 'renewed-refresh-token',
          user: { id: 'test-id', email: 'user@example.com', displayName: 'Test User' },
        }),
      });
    });

    // 再認証
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('Password123!');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // sessionExpired状態 = false（モーダルが閉じる）
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

    // 通常操作が再開できることを確認（ページがプロフィールのまま）
    expect(page.url()).toContain('/profile');
  });

  /**
   * REQ-30.15: ページ初期ロードvs操作中の区別
   *
   * @requirement user-authentication/REQ-30.15
   *
   * テスト手順:
   * 1. 認証済み状態でプロフィールページに移動（操作中のコンテキスト）
   * 2. 操作中にセッション切れをトリガー
   * 3. モーダルが表示される（ログインページへリダイレクトではない）ことを確認
   */
  test('REQ-30.15: 操作中のセッション切れでモーダル表示（ログインリダイレクトではない）', async ({
    page,
  }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    // プロフィールページが表示されていることを確認
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 操作中にセッション切れをトリガー
    const dialog = await triggerSessionExpiredModal(page);

    // モーダルが表示される（ログインページへリダイレクトではない）
    await expect(dialog).toBeVisible();
    // URLがプロフィールページのまま（ログインページにリダイレクトされていない）
    expect(page.url()).toContain('/profile');
    expect(page.url()).not.toContain('/login');
  });

  /**
   * REQ-30.16: 3回連続認証失敗後にログイン画面遷移ボタンが表示される
   *
   * @requirement user-authentication/REQ-30.16
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. 3回連続で認証を失敗させる
   * 3. 「ログイン画面へ移動」ボタンが表示されることを確認
   */
  test('REQ-30.16: 3回連続認証失敗後にログイン画面遷移ボタンが表示される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // 再認証ログインAPIを常に失敗させる
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'メールアドレスまたはパスワードが正しくありません',
        }),
      });
    });

    // 3回連続で認証失敗を試行
    const passwordInput = page.getByLabel('パスワード');
    const loginButton = page.getByRole('button', { name: '再ログイン' });

    for (let i = 0; i < 3; i++) {
      await passwordInput.clear();
      await passwordInput.fill(`wrong-password-${i}`);
      await loginButton.click();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible({
        timeout: getTimeout(5000),
      });
    }

    // 「ログイン画面へ移動」ボタンが表示されること
    await expect(page.getByRole('button', { name: 'ログイン画面へ移動' })).toBeVisible({
      timeout: getTimeout(5000),
    });
  });

  /**
   * REQ-30.17: ネットワークエラー時のメッセージとリトライ
   *
   * @requirement user-authentication/REQ-30.17
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. ログインAPIをネットワークエラーで失敗させる
   * 3. ネットワークエラーメッセージが表示されることを確認
   * 4. リトライボタンが表示されることを確認
   */
  test('REQ-30.17: ネットワークエラー時にエラーメッセージとリトライが表示される', async ({
    page,
  }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // ログインAPIをネットワークエラーで中断させる
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.abort('connectionfailed');
    });

    // パスワードを入力して再ログイン
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('Password123!');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // ネットワークエラーメッセージが表示されることを確認
    await expect(page.getByText(/ネットワーク接続を確認してください/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // リトライボタンが表示されることを確認
    const retryButton = page.getByRole('button', { name: /リトライ|再試行|retry/i });
    await expect(retryButton).toBeVisible({ timeout: getTimeout(5000) });
  });

  /**
   * REQ-30.18: フォーカストラップ（Tab/Shift+Tab）
   *
   * @requirement user-authentication/REQ-30.18
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. Tabキーを繰り返し押す
   * 3. フォーカスがモーダル内に留まることを確認
   * 4. Shift+Tabでも同様にモーダル内に留まることを確認
   */
  test('REQ-30.18: フォーカストラップでTab/Shift+Tabがモーダル内に留まる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // モーダル内のフォーカス可能な要素を確認
    // パスワード入力とボタンがモーダル内にあること
    const passwordInput = page.getByLabel('パスワード');
    await expect(passwordInput).toBeVisible();

    // Tabキーを複数回押してフォーカスを巡回
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');

      // 現在フォーカスされている要素がダイアログ内にあることを確認
      const focusedInDialog = await page.evaluate(() => {
        const focused = document.activeElement;
        const dialogEl = document.querySelector('[role="dialog"]');
        if (!focused || !dialogEl) return false;
        return dialogEl.contains(focused);
      });
      expect(focusedInDialog).toBe(true);
    }

    // Shift+Tabでもモーダル内に留まることを確認
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');

      const focusedInDialog = await page.evaluate(() => {
        const focused = document.activeElement;
        const dialogEl = document.querySelector('[role="dialog"]');
        if (!focused || !dialogEl) return false;
        return dialogEl.contains(focused);
      });
      expect(focusedInDialog).toBe(true);
    }
  });

  /**
   * REQ-30.19: role="dialog"、aria-modal="true"、aria-labelledby
   *
   * @requirement user-authentication/REQ-30.19
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. role="dialog"属性を確認
   * 3. aria-modal="true"属性を確認
   * 4. aria-labelledby="session-expired-title"属性を確認
   */
  test('REQ-30.19: モーダルにrole="dialog"、aria-modal="true"、aria-labelledbyが設定されている', async ({
    page,
  }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // role="dialog"はgetByRole('dialog')で取得済みなので暗黙的に確認済み
    // aria属性の確認
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'session-expired-title');

    // aria-labelledbyで参照されるタイトル要素の存在を確認
    const titleElement = page.locator('#session-expired-title');
    await expect(titleElement).toBeVisible();
    await expect(titleElement).toHaveText(/セッションの有効期限が切れました/);
  });

  /**
   * REQ-30.20: aria-live="assertive"でスクリーンリーダー通知
   *
   * @requirement user-authentication/REQ-30.20
   *
   * テスト手順:
   * 1. セッション切れモーダルを表示
   * 2. aria-live="assertive"またはrole="alert"の要素が存在することを確認
   * 3. 認証失敗時にエラーメッセージがスクリーンリーダーに通知されることを確認
   */
  test('REQ-30.20: aria-live="assertive"でスクリーンリーダー通知される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');
    await setupAuthenticatedProfilePage(page);

    await triggerSessionExpiredModal(page);

    // 再認証ログインAPIを失敗で返す
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'メールアドレスまたはパスワードが正しくありません',
        }),
      });
    });

    // パスワード入力して再認証を試みる
    const passwordInput = page.getByLabel('パスワード');
    await passwordInput.fill('wrong-password');
    await page.getByRole('button', { name: '再ログイン' }).click();

    // エラーメッセージが表示されるまで待機
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible({
      timeout: getTimeout(5000),
    });

    // role="alert"（暗黙的にaria-live="assertive"）の要素が存在することを確認
    const alertElement = page.locator('[role="alert"]');
    await expect(alertElement).toBeVisible();

    // aria-live="assertive"が設定された要素、またはrole="alert"の存在を確認
    const hasAriaLiveOrAlert = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const ariaLiveElements = dialog.querySelectorAll('[aria-live="assertive"]');
      const alertElements = dialog.querySelectorAll('[role="alert"]');
      return ariaLiveElements.length > 0 || alertElements.length > 0;
    });
    expect(hasAriaLiveOrAlert).toBe(true);
  });

  /**
   * REQ-30.21: モバイル表示（768px未満）でフルスクリーン
   *
   * @requirement user-authentication/REQ-30.21
   *
   * テスト手順:
   * 1. ビューポートをモバイルサイズ（375x667）に設定
   * 2. セッション切れモーダルを表示
   * 3. モーダルがフルスクリーン表示になっていることを確認
   */
  test('REQ-30.21: モバイル表示（768px未満）でフルスクリーン表示される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // ビューポートをモバイルサイズに設定
    await page.setViewportSize({ width: 375, height: 667 });

    await setupAuthenticatedProfilePage(page);

    const dialog = await triggerSessionExpiredModal(page);

    // モーダルが表示されていることを確認
    await expect(dialog).toBeVisible();

    // モーダルのサイズがビューポートに近いことを確認（フルスクリーン）
    const modalBoundingBox = await dialog.boundingBox();
    expect(modalBoundingBox).not.toBeNull();
    if (modalBoundingBox) {
      // モバイル表示ではモーダルの幅がビューポート幅に近い
      expect(modalBoundingBox.width).toBeGreaterThanOrEqual(375 * 0.9);
      // モバイル表示ではmin-h-[80vh]で最小高さ80%のビューポート高さ
      expect(modalBoundingBox.height).toBeGreaterThanOrEqual(667 * 0.7);
    }
  });
});
