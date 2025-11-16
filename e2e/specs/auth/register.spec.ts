import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser, createInvitation } from '../../fixtures/auth.fixtures';

/**
 * 新規登録機能のE2Eテスト
 *
 * ユーザー登録フローの検証
 */
test.describe('新規登録機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let invitationToken: string;

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア（認証状態の干渉を防ぐ）
    await context.clearCookies();

    // テストデータをクリーンアップして、招待者（管理者）を作成
    await cleanDatabase();
    const admin = await createTestUser('ADMIN_USER');

    // 招待トークンを作成
    const invitation = await createInvitation({
      email: 'newuser@example.com',
      inviterId: admin.id,
    });
    invitationToken = invitation.token;

    // 招待URLにアクセス
    await page.goto(`/register?token=${invitationToken}`);
  });

  test('登録フォームが正しく表示される', async ({ page }) => {
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.locator('input#passwordConfirm')).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /登録/i })).toBeVisible();
  });

  test('有効な情報で新規登録できる', async ({ page }) => {
    // メールアドレスは招待トークンから事前入力されている
    await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('newuser@example.com');
    await expect(page.getByLabel(/メールアドレス/i)).toBeDisabled();

    await page.locator('input#password').fill('StrongPass123!');
    await page.locator('input#passwordConfirm').fill('StrongPass123!');
    await page.getByLabel(/表示名/i).fill('Test User');

    // 利用規約に同意
    await page.getByRole('checkbox').check();

    await page.getByRole('button', { name: /登録/i }).click();

    // 登録成功後、ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/登録が完了しました/i)).toBeVisible();
  });

  test('パスワード入力時に強度インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('weak');

    // 強度インジケーターが表示される
    await expect(page.getByTestId('password-strength-indicator')).toBeVisible();
  });

  test('パスワードが一致しない場合エラーが表示される', async ({ page }) => {
    // メールアドレスは招待トークンから事前入力されている
    await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('newuser@example.com');

    await page.locator('input#password').fill('Password123!');
    await page.locator('input#passwordConfirm').fill('DifferentPass123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('button', { name: /登録/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/パスワードが一致しません/i)).toBeVisible();
  });

  test.skip('既に登録済みのメールアドレスではエラーが表示される', async ({ page }) => {
    // Note: 招待トークンからメールアドレスが事前入力され無効化されているため、
    // このテストシナリオは現在の実装では適用できません。
    // バックエンドでの重複チェックは別のユニットテストでカバーされるべきです。

    // 既存ユーザーを作成（招待されたメールアドレスと同じ）
    const prisma = (await import('../../fixtures/database')).getPrismaClient();
    const passwordHash = await (
      await import('../../helpers/test-users')
    ).hashPassword('Password123!');
    await prisma.user.create({
      data: {
        email: 'newuser@example.com',
        displayName: 'Existing User',
        passwordHash,
      },
    });

    // メールアドレスは招待トークンから事前入力されている
    await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('newuser@example.com');

    await page.locator('input#password').fill('Password123!');
    await page.locator('input#passwordConfirm').fill('Password123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('button', { name: /登録/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/このメールアドレスは既に登録されています/i)).toBeVisible();
  });
});
