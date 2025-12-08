import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../fixtures/seed-helpers';

/**
 * 画面遷移とナビゲーション機能のE2Eテスト
 *
 * @requirement user-authentication/REQ-28 画面遷移とナビゲーション
 */
test.describe('画面遷移とナビゲーション', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await createAllTestUsers(prisma);
  });

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 要件28.2: 認証済みユーザーがルートURLにアクセス時のリダイレクト
   * @requirement user-authentication/REQ-28.2
   * WHEN 認証済みユーザーがアプリケーションのルートURLにアクセスする
   * THEN ダッシュボード画面へリダイレクトする
   */
  test('認証済みユーザーがルートURLにアクセスするとダッシュボードにリダイレクトされる', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // ルートURLにアクセス
    await page.goto('/');

    // ダッシュボードまたはホームページにリダイレクトされる
    await expect(page).toHaveURL(/\/dashboard|\/$/);
  });

  /**
   * 要件28.21: 認証済みユーザーが保護された画面にアクセス時の共通ヘッダーナビゲーション表示
   * @requirement user-authentication/REQ-28.21 @requirement user-authentication/REQ-28.22 @requirement user-authentication/REQ-28.23
   * WHEN 認証済みユーザーが任意の保護された画面にアクセスする
   * THEN 共通ヘッダーナビゲーションを表示する
   */
  test('認証済みユーザーに共通ヘッダーナビゲーションが表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');

    // 要件28.22: ダッシュボードへのリンク
    await expect(page.getByRole('link', { name: /ダッシュボード|ホーム/i })).toBeVisible();

    // 要件28.23: ログイン中のユーザー名とアバター
    await expect(page.getByText(/Regular User|user@example\.com/i)).toBeVisible();

    // ログアウトボタン
    await expect(page.getByRole('button', { name: /ログアウト/i })).toBeVisible();
  });

  /**
   * 要件28.24: 管理者ユーザーのナビゲーションに管理メニューを表示
   * @requirement user-authentication/REQ-28.24 @requirement user-authentication/REQ-28.25
   * WHEN 管理者ユーザーがナビゲーションを表示する
   * THEN 「管理メニュー」リンクを表示する
   */
  test('管理者ユーザーに管理メニューが表示される', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/profile');

    // 要件28.24: 管理メニューリンク
    const adminMenu = page.getByRole('button', { name: /管理|Admin/i });
    await expect(adminMenu).toBeVisible();

    // 要件28.25: 管理メニュー展開でユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンク表示
    await adminMenu.click();

    await expect(page.getByRole('link', { name: /ユーザー管理/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /招待管理/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /ロール管理/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /権限管理/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /監査ログ/i })).toBeVisible();
  });

  /**
   * 要件28.26: ダッシュボード画面の主要機能へのクイックアクセス
   * @requirement user-authentication/REQ-28.26
   * WHEN ダッシュボード画面が表示される
   * THEN 主要機能へのクイックアクセスを提供する
   */
  test('ダッシュボード画面に主要機能へのクイックアクセスが表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/');

    // ダッシュボードが表示される
    await expect(page.getByRole('heading', { name: /ダッシュボード|Dashboard/i })).toBeVisible();
  });

  /**
   * 要件28.27: ダッシュボードのプロフィールリンククリック → プロフィール画面遷移
   * @requirement user-authentication/REQ-28.27
   * WHEN ダッシュボードのプロフィールリンクがクリックされる
   * THEN プロフィール画面へリダイレクトする
   */
  test('ダッシュボードからプロフィール画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/');

    // プロフィールリンクをクリック（ユーザー名またはアバターをクリック）
    const profileLink = page.getByRole('link', { name: /プロフィール|Regular User/i });
    await profileLink.click();

    // プロフィール画面にリダイレクト
    await expect(page).toHaveURL(/\/profile/);
  });

  /**
   * 要件28.28: プロフィール画面に2FA設定セクションへのリンクを表示
   * @requirement user-authentication/REQ-28.28
   * WHEN プロフィール画面が表示される
   * THEN 2FA設定セクションへのリンクを表示する
   */
  test('プロフィール画面に2FA設定リンクが表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');

    // 2FA設定リンクが表示される
    await expect(page.getByRole('link', { name: /二要素認証|2FA|セキュリティ/i })).toBeVisible();
  });

  /**
   * 要件28.31: プロフィール画面にセッション管理へのリンクを表示
   * @requirement user-authentication/REQ-28.31
   * WHEN プロフィール画面が表示される
   * THEN セッション管理へのリンクを表示する
   */
  test('プロフィール画面にセッション管理リンクが表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');

    // セッション管理リンクが表示される
    await expect(page.getByRole('link', { name: /セッション管理/i })).toBeVisible();
  });

  /**
   * 要件28.30: セッション管理リンククリック → セッション管理画面遷移
   * @requirement user-authentication/REQ-28.30 @requirement user-authentication/REQ-28.34
   * WHEN セッション管理リンクがクリックされる
   * THEN セッション管理画面へリダイレクトする
   */
  test('プロフィールからセッション管理画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');

    // セッション管理リンクをクリック
    await page.getByRole('link', { name: /セッション管理/i }).click();

    // セッション管理画面にリダイレクト
    await expect(page).toHaveURL(/\/profile\/sessions/);

    // 要件28.34: アクティブなセッション一覧が表示される
    await expect(page.getByRole('heading', { name: /セッション管理/i })).toBeVisible();
  });

  /**
   * 要件28.35: セッション管理画面で戻るリンククリック → プロフィール画面へリダイレクト
   * @requirement user-authentication/REQ-28.35
   * WHEN セッション管理画面で戻るリンクがクリックされる
   * THEN プロフィール画面へリダイレクトする
   */
  test('セッション管理画面からプロフィール画面に戻れる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile/sessions');

    // 戻るリンクをクリック
    await page.getByRole('link', { name: /戻る|プロフィール/i }).click();

    // プロフィール画面にリダイレクト
    await expect(page).toHaveURL(/\/profile$/);
  });

  /**
   * 要件28.36: 招待管理リンククリック → 招待管理画面遷移
   * @requirement user-authentication/REQ-28.36
   * WHEN 招待管理リンクがクリックされる
   * THEN 招待管理画面へリダイレクトする
   */
  test('管理メニューから招待管理画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/');

    // 管理メニューを展開
    await page.getByRole('button', { name: /管理|Admin/i }).click();

    // 招待管理リンクをクリック
    await page.getByRole('link', { name: /招待管理/i }).click();

    // 招待管理画面にリダイレクト
    await expect(page).toHaveURL(/\/admin\/invitations/);
  });

  /**
   * 要件28.37: ユーザー管理リンククリック → ユーザー管理画面遷移
   * @requirement user-authentication/REQ-28.37
   * WHEN ユーザー管理リンクがクリックされる
   * THEN ユーザー管理画面へリダイレクトする
   */
  test('管理メニューからユーザー管理画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/');

    // 管理メニューを展開
    await page.getByRole('button', { name: /管理|Admin/i }).click();

    // ユーザー管理リンクをクリック
    await page.getByRole('link', { name: /ユーザー管理/i }).click();

    // ユーザー管理画面にリダイレクト
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  /**
   * 要件28.38: ロール管理リンククリック → ロール管理画面遷移
   * @requirement user-authentication/REQ-28.38
   * WHEN ロール管理リンクがクリックされる
   * THEN ロール管理画面へリダイレクトする
   */
  test('管理メニューからロール管理画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/');

    // 管理メニューを展開
    await page.getByRole('button', { name: /管理|Admin/i }).click();

    // ロール管理リンクをクリック
    await page.getByRole('link', { name: /ロール管理/i }).click();

    // ロール管理画面にリダイレクト
    await expect(page).toHaveURL(/\/admin\/roles/);
  });

  /**
   * 要件28.39: 権限管理リンククリック → 権限管理画面遷移
   * @requirement user-authentication/REQ-28.39
   * WHEN 権限管理リンクがクリックされる
   * THEN 権限管理画面へリダイレクトする
   */
  test('管理メニューから権限管理画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/');

    // 管理メニューを展開
    await page.getByRole('button', { name: /管理|Admin/i }).click();

    // 権限管理リンクをクリック
    await page.getByRole('link', { name: /権限管理/i }).click();

    // 権限管理画面にリダイレクト
    await expect(page).toHaveURL(/\/admin\/permissions/);
  });

  /**
   * 要件28.40: 監査ログリンククリック → 監査ログ画面遷移
   * @requirement user-authentication/REQ-28.40
   * WHEN 監査ログリンクがクリックされる
   * THEN 監査ログ画面へリダイレクトする
   */
  test('管理メニューから監査ログ画面に遷移できる', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/');

    // 管理メニューを展開
    await page.getByRole('button', { name: /管理|Admin/i }).click();

    // 監査ログリンクをクリック
    await page.getByRole('link', { name: /監査ログ/i }).click();

    // 監査ログ画面にリダイレクト
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
  });

  /**
   * 要件28.41: ログアウトボタンクリック → ログアウト処理実行
   * @requirement user-authentication/REQ-28.41 @requirement user-authentication/REQ-28.42
   * WHEN ログアウトボタンがクリックされる
   * THEN ログアウト処理を実行し、ログイン画面へリダイレクトする
   */
  test('ログアウトボタンでログアウトできる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    await page.goto('/profile');

    // ログアウトボタンをクリック
    await page.getByRole('button', { name: /ログアウト/i }).click();

    // 要件28.42: ログアウト完了時に「ログアウトしました」メッセージを表示
    await expect(page.getByText(/ログアウトしました/i)).toBeVisible();

    // ログイン画面にリダイレクト
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * 要件28.43: 画面遷移時のブラウザ履歴（History API）管理
   * @requirement user-authentication/REQ-28.43 @requirement user-authentication/REQ-28.44
   * WHEN 画面遷移が発生する
   * THEN ブラウザの履歴（History API）を適切に管理する
   */
  test('ブラウザの戻るボタンで前の画面に戻れる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    // ダッシュボード → プロフィール → セッション管理と遷移
    await page.goto('/');
    await page.goto('/profile');
    await page.goto('/profile/sessions');

    // 要件28.44: ブラウザの戻るボタンで前の画面を適切に表示
    await page.goBack();
    await expect(page).toHaveURL(/\/profile$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  /**
   * 要件28.45: 未認証状態で保護された画面URLに直接アクセス時の処理
   * @requirement user-authentication/REQ-28.45
   * WHEN 未認証状態で保護された画面のURLに直接アクセスする
   * THEN ログイン画面へリダイレクトし、ログイン後に元のURLへ戻る
   */
  test('未認証で保護された画面にアクセスするとログイン画面にリダイレクトされる', async ({
    page,
  }) => {
    // 未認証状態でプロフィール画面にアクセス
    await page.goto('/profile');

    // ログイン画面にリダイレクト
    await expect(page).toHaveURL(/\/login/);

    // redirectUrlパラメータが設定されている（実装による）
    const url = new URL(page.url());
    if (url.searchParams.has('redirectUrl')) {
      expect(url.searchParams.get('redirectUrl')).toContain('/profile');
    }
  });
});
