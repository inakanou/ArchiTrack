import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import {
  cleanDatabase,
  cleanDatabaseAndRestoreTestData,
  getPrismaClient,
} from '../../fixtures/database';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';

/**
 * 管理者としてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'ADMIN_USER');
}

/**
 * 一般ユーザーとしてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsRegularUser(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'REGULAR_USER');
}

/**
 * AppHeader ナビゲーションのE2Eテスト
 *
 * 共通ヘッダーナビゲーション（AppHeader）の機能を検証します。
 * 対象は user-authentication の要件28「画面遷移とナビゲーション」のうち、
 * 共通ヘッダーと管理メニューに関わる受入基準である。
 *
 * ヘッダーでの被覆主張は行わない（Task 115.177）。
 * 従来このヘッダーは REQ-28 および REQ-28.21〜28.25 を機能名なしの記法で列挙していたが、
 * 機能名を欠く記法は被覆検査（scripts/check-requirement-coverage.ts）のいずれのパターンにも合致せず、
 * 本ファイルからの抽出件数は零だった。すなわち「掲げているが数えられていない」状態にあった。
 * 被覆の主張は実際に判定している検証の直上にのみ `@requirement 機能名/REQ-N.M` 形式で置き、
 * 判定していない基準は主張せずその理由をその場に記す。
 */
test.describe('AppHeader ナビゲーション', () => {
  /**
   * テスト開始前にデータベースをクリーンアップし、テストユーザーを再作成
   * 前のテスト（例: profile.spec.tsのパスワード変更テスト）による
   * パスワード変更の影響を防止
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await createAllTestUsers(prisma);
  });

  /**
   * @requirement user-authentication/REQ-28.21: 認証済みユーザーが保護された画面にアクセスしたとき共通ヘッダーナビゲーションを表示する
   * WHEN 認証済みユーザーが保護された画面にアクセスする
   * THEN Frontend UIは共通ヘッダーナビゲーションを表示する
   *
   * 判定根拠: 保護画面 /dashboard で header[role="banner"] と nav[role="navigation"] の
   * 可視を主張しており、共通ヘッダーが表示されなくなれば赤になる。
   */
  test('認証済みユーザーにはヘッダーナビゲーションが表示される', async ({ page }) => {
    await loginAsRegularUser(page);

    // ダッシュボードに移動
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ヘッダーが表示されていることを確認
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeVisible();

    // ナビゲーションが表示されていることを確認
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.22: 共通ヘッダーナビゲーションはダッシュボード・プロフィール・ログアウトを含む
   * WHEN 共通ヘッダーナビゲーションが表示される
   * THEN Frontend UIはダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含む
   *
   * 判定根拠: ダッシュボードリンクと、ユーザーメニュー展開後の user-menu-profile /
   * user-menu-logout の可視をそれぞれ主張しており、いずれかが欠ければ赤になる。
   */
  test('ヘッダーにダッシュボード/プロフィール/ログアウトリンクが表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ダッシュボードリンクが表示されていることを確認
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();

    // ユーザーメニューを開く
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();

    // プロフィールリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-profile')).toBeVisible();

    // ログアウトリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.23（ログイン中のユーザー表示名を表示する）を
   * 掲げていたが、この検証はその規範を判定できない。
   * 実測根拠: ユーザーメニューボタンの中身は
   * frontend/src/components/Navigation/AppHeader.tsx:436-437 で
   * イニシャル用アバター（displayName未設定時は 'U' を返す getInitials）と
   * `{user?.displayName || 'ユーザー'}` の二要素から成る。
   * したがって表示名の取得が壊れてもボタンのテキストは 'Uユーザー' となり空にならず、
   * 下の not.toHaveText('') は緑のままである。「壊れたら赤になるか」を満たさないため主張しない。
   * なお本基準はログインユーザー名を実際に突き合わせる e2e/specs/auth/navigation.spec.ts 側で判定している。
   */
  test('ヘッダーにユーザー表示名が表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューボタンにユーザー名が表示されていることを確認
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await expect(userMenuButton).toBeVisible();
    // ボタンにユーザー名が含まれていることを確認（空でないこと）
    await expect(userMenuButton).not.toHaveText('');
  });

  /**
   * @requirement user-authentication/REQ-28.24: 管理者ユーザーのナビゲーションに「管理メニュー」ドロップダウンを追加表示する
   * WHEN 管理者ユーザーがナビゲーションを表示する
   * THEN Frontend UIは「管理メニュー」ドロップダウンを追加表示する
   *
   * 判定根拠: 管理者でログインした状態で「管理メニュー」ボタンの可視を主張しており、
   * 管理者に追加表示されなくなれば赤になる。
   */
  test('管理者には管理メニューが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていることを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).toBeVisible();
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.24 を掲げていたが、
   * REQ-28.24 の規範は「管理者ユーザーがナビゲーションを表示したとき管理メニューを追加する」であり、
   * 非管理者に表示しないことは規範が述べていない。
   * よって管理メニューが全ユーザーに出るようになってもREQ-28.24自体は破れず、
   * 逆にこの検証が赤になってもREQ-28.24違反を意味しない。規範との対応が成立しないため主張しない。
   * この検証は管理機能の可視性が権限で分岐することを守る回帰検証として残す。
   */
  test('一般ユーザーには管理メニューが表示されない', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていないことを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).not.toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.25: 管理メニュー展開時にユーザー管理・招待管理・ロール管理・権限管理・監査ログへのリンクを表示する
   * WHEN 管理メニューが展開される
   * THEN Frontend UIはユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンクを表示する
   *
   * 判定根拠: 展開後に五つの項目すべての可視を個別に主張しており、
   * いずれか一つでも欠ければ赤になる。
   */
  test('管理メニューにはユーザー管理/招待管理/ロール管理/権限管理/監査ログリンクが表示される', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開く
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await adminMenuButton.click();

    // 各リンクが表示されていることを確認
    await expect(page.getByTestId('admin-menu-users')).toBeVisible();
    await expect(page.getByTestId('admin-menu-invitations')).toBeVisible();
    await expect(page.getByTestId('admin-menu-roles')).toBeVisible();
    await expect(page.getByTestId('admin-menu-permissions')).toBeVisible();
    await expect(page.getByTestId('admin-menu-audit-logs')).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.36: 招待管理リンククリックで招待管理画面へ遷移する
   *
   * 判定根拠: 管理メニューの admin-menu-invitations を実際にクリックし、
   * 遷移後URLが /admin/invitations であることを主張しており、遷移が壊れれば赤になる。
   */
  test('管理メニューから招待管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて招待管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-invitations').click();

    // 招待管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/invitations/);
  });

  /**
   * @requirement user-authentication/REQ-28.37: ユーザー管理リンククリックでユーザー管理画面へ遷移する
   *
   * 判定根拠: admin-menu-users を実際にクリックし、遷移後URLが /admin/users であることを主張している。
   */
  test('管理メニューからユーザー管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてユーザー管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-users').click();

    // ユーザー管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  /**
   * @requirement user-authentication/REQ-28.38: ロール管理リンククリックでロール管理画面へ遷移する
   *
   * 判定根拠: admin-menu-roles を実際にクリックし、遷移後URLが /admin/roles であることを主張している。
   */
  test('管理メニューからロール管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてロール管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-roles').click();

    // ロール管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/roles/);
  });

  /**
   * @requirement user-authentication/REQ-28.39: 権限管理リンククリックで権限管理画面へ遷移する
   *
   * 判定根拠: admin-menu-permissions を実際にクリックし、遷移後URLが /admin/permissions であることを主張している。
   */
  test('管理メニューから権限管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて権限管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-permissions').click();

    // 権限管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/permissions/);
  });

  /**
   * @requirement user-authentication/REQ-28.40: 監査ログリンククリックで監査ログ画面へ遷移する
   *
   * 判定根拠: admin-menu-audit-logs を実際にクリックし、遷移後URLが /admin/audit-logs であることを主張している。
   */
  test('管理メニューから監査ログ画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて監査ログをクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-audit-logs').click();

    // 監査ログ画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
  });

  /**
   * @requirement user-authentication/REQ-28.41: ログアウトボタンクリックでログアウトしログイン画面へ遷移する
   *
   * 判定根拠: ユーザーメニューの user-menu-logout を実際にクリックし、
   * 遷移後URLが /login であることを主張している。ログイン画面へ戻らなくなれば赤になる。
   */
  test('ユーザーメニューからログアウトできる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてログアウトをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-logout').click();

    // ログイン画面に遷移することを確認
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.27 を掲げていたが、
   * REQ-28.27 の契機は「ダッシュボードのプロフィールリンクがクリックされる」であり、
   * 見出し「ダッシュボードからの遷移」の下でREQ-28.26のクイックアクセスリンクと対を成す。
   * 一方この検証が押すのは共通ヘッダーのユーザーメニュー項目 user-menu-profile であり、
   * ダッシュボード本体のクイックアクセスリンク quick-link-profile を一度も通らない。
   * quick-link-profile の遷移が壊れてもこの検証は緑のままであるため主張しない。
   * 本基準はダッシュボードのリンクを押す e2e/specs/auth/navigation.spec.ts 側で判定している。
   * なおヘッダーのユーザーメニューにプロフィール項目が含まれること自体はREQ-28.22で判定済みである。
   */
  test('ユーザーメニューからプロフィール画面に遷移できる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてプロフィールをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-profile').click();

    // プロフィール画面に遷移することを確認
    await expect(page).toHaveURL(/\/profile/);
  });

  /**
   * @requirement user-authentication/REQ-28.26: ダッシュボード画面に主要機能へのクイックアクセスリンクを提供する
   *
   * 判定根拠: ダッシュボード上で quick-link-profile / quick-link-sessions / quick-link-2fa と
   * 管理者向けリンクの可視を個別に主張しており、クイックアクセスが失われれば赤になる。
   */
  test('ダッシュボード画面にクイックアクセスリンクが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // クイックアクセスリンクが表示されていることを確認
    await expect(page.getByTestId('quick-link-profile')).toBeVisible();
    await expect(page.getByTestId('quick-link-sessions')).toBeVisible();
    await expect(page.getByTestId('quick-link-2fa')).toBeVisible();

    // 管理者には管理機能リンクも表示される
    await expect(page.getByTestId('quick-link-admin-users')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-invitations')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-audit')).toBeVisible();
  });

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after app-header tests...');
    await cleanDatabaseAndRestoreTestData();
    console.log('  ✓ Test data restored successfully');
  });
});
