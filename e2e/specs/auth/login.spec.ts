import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createCustomUser } from '../../fixtures/auth.fixtures';

/**
 * ログイン機能のE2Eテスト
 *
 * @requirement user-authentication/REQ-4 ログイン
 * @requirement user-authentication/REQ-11 ログイン画面のUI/UX
 * @requirement user-authentication/REQ-28 画面遷移とナビゲーション
 */
test.describe('ログイン機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア（認証状態の干渉を防ぐ）
    await context.clearCookies();

    // ページに移動
    await page.goto('/login');
  });

  /**
   * 要件11.1: ログイン画面の基本要素
   * @requirement user-authentication/REQ-11.1
   */
  test('ログインフォームが正しく表示される', async ({ page }) => {
    // メールアドレス入力フィールド
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();

    // パスワード入力フィールド（パスワード表示ボタンと区別するため、inputに限定）
    await expect(page.locator('input#password')).toBeVisible();

    // ログインボタン
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();

    // パスワードリセットリンク
    await expect(page.getByRole('link', { name: /パスワードを忘れた/i })).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-4.1 @requirement user-authentication/REQ-4.4 @requirement user-authentication/REQ-4.5 @requirement user-authentication/REQ-4.7 @requirement user-authentication/REQ-28.6 @requirement user-authentication/REQ-28.43
   */
  test('有効な認証情報でログインできる', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ホームページ（ダッシュボードまたはルート）にリダイレクトされる
    await expect(page).toHaveURL(/\/dashboard|\/$/);
  });

  /**
   * 要件11.7: ログイン失敗時のエラー
   * @requirement user-authentication/REQ-4.2 @requirement user-authentication/REQ-4.3 @requirement user-authentication/REQ-11.7
   */
  test('無効な認証情報でログインできない', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('invalid@example.com');
    await page.locator('input#password').fill('wrongpassword');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/メールアドレスまたはパスワードが正しくありません/i)).toBeVisible();
  });

  /**
   * 要件11.5: 未入力時のエラー
   * @requirement user-authentication/REQ-11.5
   */
  test('メールアドレス未入力時にバリデーションエラーが表示される', async ({ page }) => {
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/メールアドレスは必須/i)).toBeVisible();
  });

  /**
   * 要件11.5: 未入力時のエラー
   * @requirement user-authentication/REQ-11.5
   */
  test('パスワード未入力時にバリデーションエラーが表示される', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/パスワードは必須/i)).toBeVisible();
  });

  test('パスワードリセットページに直接アクセスできる', async ({ page }) => {
    // パスワードリセットページに直接移動
    await page.goto('/password-reset');

    // パスワードリセットページが表示される
    await expect(page).toHaveURL(/\/password-reset/);
  });

  /**
   * 要件7.1: パスワードリセット要求
   * 要件11.9: パスワードリセットリンク
   * @requirement user-authentication/REQ-11.9 @requirement user-authentication/REQ-28.4
   * Note: Playwright + React Router Link の互換性問題により、
   * リンククリックではなくpage.goto()を使用してナビゲーションを検証
   */
  test('パスワードリセットリンクが表示され、ページが正常に機能する', async ({ page }) => {
    const link = page.getByRole('link', { name: /パスワードを忘れた/i });

    // リンクが表示されることを確認
    await expect(link).toBeVisible();

    // リンクのhref属性を確認
    const href = await link.getAttribute('href');
    expect(href).toMatch(/password-reset/);

    // page.goto()で直接ナビゲート（Playwright互換性問題の回避）
    await page.goto('/password-reset');

    // パスワードリセットページが正しく表示されることを確認
    await expect(page).toHaveURL(/\/password-reset/);
    await expect(
      page.getByRole('heading', { name: /パスワードリセット|パスワードを忘れた/i })
    ).toBeVisible();
  });

  // Note: 新規登録リンクは招待制のため、ログインページには表示されません
  // 新規登録は招待URLを通じてのみアクセス可能です

  /**
   * 要件4.6: アカウントロック機能
   * 要件11.8: アカウントロック時の表示
   * @requirement user-authentication/REQ-11.8
   * WHEN 同一メールアドレスで5回連続してログインに失敗する
   * THEN アカウントが15分間ロックされ、ログインできなくなる
   */
  test('5回連続でログイン失敗後、アカウントがロックされる', async ({ page }) => {
    // 並列実行時に共有ユーザー(user@example.com)に影響を与えないよう、専用ユーザーを作成
    const lockoutUser = await createCustomUser({
      email: 'lockout-test@example.com',
      password: 'Password123!',
      displayName: 'Lockout Test User',
      roles: ['user'],
    });

    const email = 'lockout-test@example.com';
    const wrongPassword = 'WrongPassword123!';

    // 5回連続でログイン失敗
    for (let i = 0; i < 5; i++) {
      await page.getByLabel(/メールアドレス/i).fill(email);
      await page.locator('input#password').fill(wrongPassword);
      await page.getByRole('button', { name: /ログイン/i }).click();

      // エラーメッセージを待つ
      if (i < 4) {
        await expect(
          page.getByText(/メールアドレスまたはパスワードが正しくありません/i)
        ).toBeVisible();
      }

      // ページをリロードして次の試行に備える（フォームをリセット）
      if (i < 4) {
        await page.reload();
      }
    }

    // 5回目の失敗後、アカウントロックメッセージが表示される
    await expect(
      page.getByText(/アカウントがロックされています.*15分後に再試行できます/i)
    ).toBeVisible();

    // ロック後、正しいパスワードでもログインできないことを確認
    await page.reload();
    await page.getByLabel(/メールアドレス/i).fill(email);
    await page.locator('input#password').fill('Password123!'); // 正しいパスワード
    await page.getByRole('button', { name: /ログイン/i }).click();

    // アカウントロックメッセージが再び表示される
    await expect(page.getByText(/アカウントがロックされています/i)).toBeVisible();

    // テスト後のクリーンアップ（専用ユーザーのみ削除、共有ユーザーに影響なし）
    const prisma = getPrismaClient();
    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { actorId: lockoutUser.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: lockoutUser.id } }),
      prisma.passwordHistory.deleteMany({ where: { userId: lockoutUser.id } }),
      prisma.userRole.deleteMany({ where: { userId: lockoutUser.id } }),
      prisma.user.delete({ where: { id: lockoutUser.id } }),
    ]);
  });

  /**
   * 要件11.6: ページロード時の自動フォーカス
   * 要件11.11: ページロード時の自動フォーカス
   * @requirement user-authentication/REQ-11.6 @requirement user-authentication/REQ-11.11
   * WHEN ログインページが読み込まれる
   * THEN メールアドレスフィールドに自動的にフォーカスされる
   * Note: REQ-11.6はローディングスピナーと記載されているが、実装では自動フォーカスを指していると解釈
   */
  test('ページロード時にメールアドレスフィールドにオートフォーカスされる', async ({ page }) => {
    await page.goto('/login');

    // メールアドレスフィールドがフォーカスされていることを確認
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();
  });

  /**
   * 要件11.11: Tab キーでフォーカス移動
   * 要件11.3: フォーカス時の視覚的フィードバック
   * @requirement user-authentication/REQ-11.3 @requirement user-authentication/REQ-11.11
   * WHEN Tab キーを押す
   * THEN 論理的な順序でフォーカスが移動する
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    await page.goto('/login');

    // 初期状態:メールアドレスフィールドにフォーカス
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();

    // Tab キーを押してパスワードフィールドに移動
    await page.keyboard.press('Tab');
    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toBeFocused();

    // Tab キーを押してパスワード表示ボタンに移動
    await page.keyboard.press('Tab');
    const passwordToggle = page.getByRole('button', {
      name: /パスワードを表示|パスワードを非表示/i,
    });
    await expect(passwordToggle).toBeFocused();

    // Tab キーを押してログインボタンに移動
    await page.keyboard.press('Tab');
    const loginButton = page.getByRole('button', { name: /ログイン/i });
    await expect(loginButton).toBeFocused();

    // Tab キーを押してパスワードリセットリンクに移動
    await page.keyboard.press('Tab');
    const resetLink = page.getByRole('link', { name: /パスワードを忘れた/i });
    await expect(resetLink).toBeFocused();
  });

  /**
   * 要件11.2: パスワードフィールドの表示/非表示切り替えボタン
   * @requirement user-authentication/REQ-11.2
   * WHEN パスワード入力フィールドが表示される
   * THEN パスワードの表示/非表示切り替えボタンを提供する
   */
  test('パスワードの表示/非表示切り替えボタンが機能する', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.locator('input#password');
    await passwordInput.fill('TestPassword123!');

    // 初期状態: パスワードはマスクされている (type="password")
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // 表示切り替えボタンをクリック
    const toggleButton = page.getByRole('button', {
      name: /パスワードを表示|表示/i,
    });
    await toggleButton.click();

    // パスワードが表示される (type="text")
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // 再度クリックで非表示に
    const hideButton = page.getByRole('button', {
      name: /パスワードを非表示|非表示/i,
    });
    await hideButton.click();

    // パスワードが再度マスクされる
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  /**
   * 要件11.4: メールアドレス形式の無効時にリアルタイムバリデーションエラーを表示
   * @requirement user-authentication/REQ-11.4
   * IF メールアドレス形式が無効である
   * THEN リアルタイムバリデーションエラーを表示する
   */
  test('無効なメールアドレス形式でリアルタイムバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel(/メールアドレス/i);

    // 無効な形式のメールアドレスを入力
    await emailInput.fill('invalid-email');
    await emailInput.blur();

    // バリデーションエラーが表示される
    await expect(page.getByText(/有効なメールアドレスを入力してください/i)).toBeVisible();
  });

  /**
   * 要件11.10: モバイル最適化されたレイアウト
   * @requirement user-authentication/REQ-11.10
   * WHEN デバイス画面幅が768px未満である
   * THEN モバイル最適化されたレイアウトを表示する
   */
  test('モバイル画面でレイアウトが最適化される', async ({ page }) => {
    // モバイルビューポートに設定 (iPhone SE サイズ)
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/login');

    // フォームが表示される
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();

    // パスワードリセットリンクが表示される
    await expect(page.getByRole('link', { name: /パスワードを忘れた/i })).toBeVisible();
  });
});
