import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';

/**
 * プロフィール管理機能のE2Eテスト
 *
 * 要件14: プロフィール画面のUI/UX
 */
test.describe('プロフィール管理機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // テストデータをクリーンアップして、テストユーザーを作成
    await cleanDatabase();
    await createTestUser('REGULAR_USER');

    // 認証済みユーザーとしてログイン
    await loginAsUser(page, 'REGULAR_USER');

    // プロフィールページに移動
    await page.goto('/profile');
  });

  test('プロフィール画面が正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible();
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByText(/ロール/i)).toBeVisible();
  });

  test('表示名を変更できる', async ({ page }) => {
    // 表示名を変更
    const displayNameInput = page.getByLabel(/表示名/i);
    await displayNameInput.clear();
    await displayNameInput.fill('Updated Name');

    // 保存ボタンをクリック
    await page.getByRole('button', { name: /保存/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/更新しました/i)).toBeVisible();
  });

  test('パスワード変更フォームが表示される', async ({ page }) => {
    await expect(page.locator('input#currentPassword')).toBeVisible();
    await expect(page.locator('input#newPassword')).toBeVisible();
    await expect(page.locator('input#confirmPassword')).toBeVisible();
  });

  test('パスワードを変更できる', async ({ page }) => {
    // パスワードフィールドに入力
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('SecureTest123!@#');
    await page.locator('input#confirmPassword').fill('SecureTest123!@#');

    // パスワード変更ボタンをクリック
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // 確認ダイアログが表示される
    await expect(page.getByText(/全デバイスからログアウトされます/i)).toBeVisible();

    // 確認ボタンをクリック
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/パスワードを変更しました/i)).toBeVisible();

    // ログインページにリダイレクトされる（2秒後）
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip('管理者ユーザーには「ユーザー管理」リンクが表示される', async ({ page }) => {
    // 管理者ユーザーを作成
    await cleanDatabase();
    await createTestUser('ADMIN_USER');

    // 管理者ユーザーでログインしてプロフィールページに移動
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto('/profile');

    // プロフィールページが表示されるまで待機
    await expect(page.locator('h1')).toContainText('プロフィール');

    // ユーザー管理リンクが表示される
    await expect(page.getByRole('link', { name: /ユーザー管理/i })).toBeVisible();
  });

  /**
   * 要件7.6-7.7: パスワード履歴検証（過去3回のパスワード再利用防止）
   * WHEN 過去3回に使用したパスワードを設定しようとする
   * THEN エラーメッセージが表示される
   */
  test('過去3回に使用したパスワードは再利用できない', async ({ page }) => {
    // 現在のパスワード: Password123!

    // 1回目のパスワード変更: NewPassword1!
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('NewPassword1!');
    await page.locator('input#confirmPassword').fill('NewPassword1!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // ログインページにリダイレクトされるのを待つ
    await page.waitForURL(/\/login/, { timeout: 5000 });

    // 新しいパスワードで再ログイン
    await page.goto('/login');
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('NewPassword1!');
    await page.getByRole('button', { name: /ログイン/i }).click();
    await page.waitForURL(/\//, { timeout: 5000 });
    await page.goto('/profile');

    // 2回目のパスワード変更: NewPassword2!
    await page.locator('input#currentPassword').fill('NewPassword1!');
    await page.locator('input#newPassword').fill('NewPassword2!');
    await page.locator('input#confirmPassword').fill('NewPassword2!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // 再ログイン
    await page.waitForURL(/\/login/, { timeout: 5000 });
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('NewPassword2!');
    await page.getByRole('button', { name: /ログイン/i }).click();
    await page.waitForURL(/\//, { timeout: 5000 });
    await page.goto('/profile');

    // 3回目のパスワード変更: NewPassword3!
    await page.locator('input#currentPassword').fill('NewPassword2!');
    await page.locator('input#newPassword').fill('NewPassword3!');
    await page.locator('input#confirmPassword').fill('NewPassword3!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // 再ログイン
    await page.waitForURL(/\/login/, { timeout: 5000 });
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('NewPassword3!');
    await page.getByRole('button', { name: /ログイン/i }).click();
    await page.waitForURL(/\//, { timeout: 5000 });
    await page.goto('/profile');

    // 4回目のパスワード変更: 過去のパスワード（NewPassword1!）を再利用しようとする
    await page.locator('input#currentPassword').fill('NewPassword3!');
    await page.locator('input#newPassword').fill('NewPassword1!');
    await page.locator('input#confirmPassword').fill('NewPassword1!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // エラーメッセージが表示される
    await expect(
      page.getByText(/このパスワードは過去に使用されています.*別のパスワードを選択してください/i)
    ).toBeVisible();
  });

  /**
   * 要件7.6-7.7: パスワード履歴検証（4回前のパスワードは再利用可能）
   * WHEN 過去4回前のパスワードを設定しようとする
   * THEN パスワード変更が成功する
   */
  test('過去4回前のパスワードは再利用できる', async ({ page }) => {
    // 現在のパスワード: Password123!

    // パスワードを3回変更（NewPassword1! → NewPassword2! → NewPassword3!）
    const passwords = ['NewPassword1!', 'NewPassword2!', 'NewPassword3!'];
    let currentPassword = 'Password123!';

    for (const newPassword of passwords) {
      await page.locator('input#currentPassword').fill(currentPassword);
      await page.locator('input#newPassword').fill(newPassword);
      await page.locator('input#confirmPassword').fill(newPassword);
      await page.getByRole('button', { name: /パスワードを変更/i }).click();
      await page.getByRole('button', { name: /はい、変更する/i }).click();

      // 再ログイン
      await page.waitForURL(/\/login/, { timeout: 5000 });
      await page.getByLabel(/メールアドレス/i).fill('user@example.com');
      await page.locator('input#password').fill(newPassword);
      await page.getByRole('button', { name: /ログイン/i }).click();
      await page.waitForURL(/\//, { timeout: 5000 });
      await page.goto('/profile');

      currentPassword = newPassword;
    }

    // 4回目のパスワード変更: 最初のパスワード（Password123!）を再利用
    await page.locator('input#currentPassword').fill(currentPassword);
    await page.locator('input#newPassword').fill('Password123!');
    await page.locator('input#confirmPassword').fill('Password123!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/パスワードを変更しました/i)).toBeVisible();
  });

  /**
   * 要件7.8: パスワード変更時のHIBP Pwned Passwordsチェック
   * WHEN 漏洩が確認されているパスワードに変更しようとする
   * THEN エラーメッセージが表示される
   */
  test('漏洩パスワードには変更できない', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Qwerty123!'); // 有名な漏洩パスワード
    await page.locator('input#confirmPassword').fill('Qwerty123!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // エラーメッセージが表示される
    await expect(
      page.getByText(
        /このパスワードは過去に漏洩が確認されています.*別のパスワードを選択してください/i
      )
    ).toBeVisible();
  });

  /**
   * 要件14.6: パスワード変更時の強度インジケーター表示
   * WHEN 新しいパスワードを入力する
   * THEN パスワード強度インジケーターが表示される
   */
  test('新パスワード入力時に強度インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('WeakPass1!'); // 弱いパスワード

    // 強度インジケーターが表示される
    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが表示される
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toBeVisible();
  });

  /**
   * 要件14.6: パスワード強度インジケーター（弱・中・強）
   * WHEN 異なる強度のパスワードを入力する
   * THEN インジケーターが適切に反応する
   */
  test('弱いパスワードで「弱」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Weak123!'); // 8文字（最小）

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/弱/i);

    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'weak');
  });

  test('中程度のパスワードで「中」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('MediumPass123!'); // 14文字

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/中/i);

    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'medium');
  });

  test('強いパスワードで「強」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('VeryStrong!Password123@XYZ'); // 25文字、複雑

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/強/i);

    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'strong');
  });

  /**
   * 要件2.5-2.8: パスワード変更時の複雑性検証
   * WHEN 複雑性要件を満たさないパスワードを入力する
   * THEN エラーメッセージが表示される
   */
  test('8文字未満の新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Short1!'); // 7文字
    await page.locator('input#confirmPassword').fill('Short1!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(page.getByText(/パスワードは8文字以上である必要があります/i)).toBeVisible();
  });

  test('大文字を含まない新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('newpassword123!'); // 大文字なし
    await page.locator('input#confirmPassword').fill('newpassword123!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(page.getByText(/パスワードは大文字を1文字以上含む必要があります/i)).toBeVisible();
  });

  test('連続した同一文字を含む新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Newww123!'); // 'www'が連続
    await page.locator('input#confirmPassword').fill('Newww123!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(
      page.getByText(/パスワードに3文字以上の連続した同一文字を含めることはできません/i)
    ).toBeVisible();
  });

  /**
   * 要件11.11: プロフィールページのキーボードナビゲーション
   * WHEN Tab キーを押す
   * THEN 論理的な順序でフォーカスが移動する
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    // 表示名フィールドにフォーカスを移動
    await page.getByLabel(/表示名/i).focus();
    await expect(page.getByLabel(/表示名/i)).toBeFocused();

    // Tab キーを押して保存ボタンに移動
    await page.keyboard.press('Tab');
    const saveButton = page.getByRole('button', { name: /保存/i });
    await expect(saveButton).toBeFocused();

    // Tab キーを押して現在のパスワードフィールドに移動
    await page.keyboard.press('Tab');
    const currentPasswordInput = page.locator('input#currentPassword');
    await expect(currentPasswordInput).toBeFocused();

    // Tab キーを押して新しいパスワードフィールドに移動
    await page.keyboard.press('Tab');
    const newPasswordInput = page.locator('input#newPassword');
    await expect(newPasswordInput).toBeFocused();

    // Tab キーを押してパスワード確認フィールドに移動
    await page.keyboard.press('Tab');
    const confirmPasswordInput = page.locator('input#confirmPassword');
    await expect(confirmPasswordInput).toBeFocused();

    // Tab キーを押してパスワード変更ボタンに移動
    await page.keyboard.press('Tab');
    const changePasswordButton = page.getByRole('button', { name: /パスワードを変更/i });
    await expect(changePasswordButton).toBeFocused();
  });
});
