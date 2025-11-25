import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createInvitation } from '../../fixtures/auth.fixtures';
import { TEST_USERS } from '../../helpers/test-users';

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

    // グローバルセットアップで作成された管理者ユーザーを取得
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: TEST_USERS.ADMIN_USER.email },
    });
    if (!admin) {
      throw new Error('Admin user not found from global setup');
    }

    // テスト用ユーザーが既に存在する場合は削除（テスト間の干渉を防ぐ）
    await prisma.user.deleteMany({
      where: { email: 'newuser@example.com' },
    });

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

  /**
   * 要件1.4: 招待メールアドレスが既に登録済みの場合はエラーメッセージを返す
   */
  test('既に登録済みのメールアドレスではエラーが表示される', async ({ page }) => {
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
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/このメールアドレスは既に登録されています/i)).toBeVisible();
  });

  /**
   * 要件2.5: パスワード長の検証（12文字以上）
   * WHEN 12文字未満のパスワードを入力する
   * THEN エラーメッセージが表示される
   */
  test('12文字未満のパスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#password').fill('Pass123!'); // 8文字（12文字未満）
    await page.locator('input#passwordConfirm').fill('Pass123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    // バリデーションエラーが表示される
    await expect(page.getByText(/パスワードは12文字以上である必要があります/i)).toBeVisible();
  });

  /**
   * 要件2.6: パスワード複雑性の検証（大文字・小文字・数字・記号を各1文字以上）
   * WHEN 必要な文字種を含まないパスワードを入力する
   * THEN エラーメッセージが表示される
   */
  test('大文字を含まないパスワードではエラーが表示される', async ({ page }) => {
    // 2種類のみ（小文字+数字）: 大文字なし、記号なし
    // バックエンドは3種類以上を要求するため、2種類のみでエラーになる
    await page.locator('input#password').fill('xyzuniqtest12');
    await page.locator('input#passwordConfirm').fill('xyzuniqtest12');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    await expect(page.getByText(/パスワードは大文字を1文字以上含む必要があります/i)).toBeVisible();
  });

  test('小文字を含まないパスワードではエラーが表示される', async ({ page }) => {
    // 2種類のみ（大文字+数字）: 小文字なし、記号なし
    // バックエンドは3種類以上を要求するため、2種類のみでエラーになる
    await page.locator('input#password').fill('XYZUNIQTEST12');
    await page.locator('input#passwordConfirm').fill('XYZUNIQTEST12');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    await expect(page.getByText(/パスワードは小文字を1文字以上含む必要があります/i)).toBeVisible();
  });

  test('数字を含まないパスワードではエラーが表示される', async ({ page }) => {
    // 2種類のみ（小文字+大文字）: 数字なし、記号なし
    // バックエンドは3種類以上を要求するため、2種類のみでエラーになる
    await page.locator('input#password').fill('XyzUniqTestAbc');
    await page.locator('input#passwordConfirm').fill('XyzUniqTestAbc');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    await expect(page.getByText(/パスワードは数字を1文字以上含む必要があります/i)).toBeVisible();
  });

  test('記号を含まないパスワードではエラーが表示される', async ({ page }) => {
    // 2種類のみ（小文字+数字）: 記号なし、大文字なし
    // バックエンドは3種類以上を要求するため、2種類のみでエラーになる
    await page.locator('input#password').fill('xyzuniqtest123');
    await page.locator('input#passwordConfirm').fill('xyzuniqtest123');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    await expect(page.getByText(/パスワードは記号を1文字以上含む必要があります/i)).toBeVisible();
  });

  /**
   * 要件2.7: HIBP Pwned Passwordsチェック
   * WHEN 漏洩が確認されているパスワードを入力する
   * THEN エラーメッセージが表示される
   */
  test('漏洩パスワードではエラーが表示される', async ({ page }) => {
    // 'password123!'は有名な漏洩パスワード (12文字に合わせる)
    await page.locator('input#password').fill('password123!');
    await page.locator('input#passwordConfirm').fill('password123!');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    // HIBP APIチェック結果のエラーメッセージ
    await expect(
      page.getByText(
        /このパスワードは過去に漏洩が確認されています.*別のパスワードを選択してください/i
      )
    ).toBeVisible();
  });

  /**
   * 要件2.8: 連続した同一文字の禁止（3文字以上）
   * WHEN 3文字以上連続した同一文字を含むパスワードを入力する
   * THEN エラーメッセージが表示される
   */
  test('連続した同一文字を含むパスワードではエラーが表示される', async ({ page }) => {
    // ユニークなパスワード: 'sss'が連続、12文字以上
    await page.locator('input#password').fill('XyzPassss12!@');
    await page.locator('input#passwordConfirm').fill('XyzPassss12!@');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    await expect(
      page.getByText(/パスワードに3文字以上の連続した同一文字を含めることはできません/i)
    ).toBeVisible();
  });

  /**
   * 要件14.6: パスワード強度インジケーター（詳細テスト）
   * WHEN 異なる強度のパスワードを入力する
   * THEN インジケーターが適切な強度レベルを表示する
   */
  test('弱いパスワードで「弱」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('Pass123!'); // 8文字（最小）

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが「弱」であることを確認
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/弱/i);

    // 視覚的フィードバック（色やプログレスバー）
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'weak');
  });

  test('中程度のパスワードで「中」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('Password123!'); // 12文字

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが「中」であることを確認
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/中/i);

    // 視覚的フィードバック
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'medium');
  });

  test('強いパスワードで「強」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('SuperSecure!Pass123@Word'); // 24文字、複雑

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが「強」であることを確認
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/強/i);

    // 視覚的フィードバック
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'strong');
  });

  /**
   * 要件14.6: パスワード強度インジケーターのアクセシビリティ
   * WHEN パスワード強度インジケーターが表示される
   * THEN ARIA属性が適切に設定されている
   */
  test('パスワード強度インジケーターがアクセシビリティ要件を満たす', async ({ page }) => {
    await page.locator('input#password').fill('Password123!');

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // ARIA属性の検証
    await expect(indicator).toHaveAttribute('role', 'status');
    await expect(indicator).toHaveAttribute('aria-live', 'polite');
    await expect(indicator).toHaveAttribute('aria-atomic', 'true');

    // スクリーンリーダー用のテキストが存在することを確認
    const ariaLabel = await indicator.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/パスワード強度/i);
  });

  /**
   * 要件11.11: 新規登録ページのオートフォーカス
   * WHEN 新規登録ページが読み込まれる
   * THEN 表示名フィールドに自動的にフォーカスされる（メールは事前入力済み）
   */
  test('ページロード時に表示名フィールドにオートフォーカスされる', async ({ page }) => {
    // 表示名フィールドがフォーカスされていることを確認
    // （メールアドレスは招待トークンから事前入力され無効化されているため）
    const displayNameInput = page.getByLabel(/表示名/i);
    await expect(displayNameInput).toBeFocused();
  });

  /**
   * 要件11.11: Tab キーでフォーカス移動
   * WHEN Tab キーを押す
   * THEN 論理的な順序でフォーカスが移動する
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    // 初期状態：表示名フィールドにフォーカス
    const displayNameInput = page.getByLabel(/表示名/i);
    await expect(displayNameInput).toBeFocused();

    // Tab キーを押してメールアドレスフィールドに移動（無効化されているがフォーカス可能）
    await page.keyboard.press('Tab');
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

    // Tab キーを押してパスワード確認フィールドに移動
    await page.keyboard.press('Tab');
    const passwordConfirmInput = page.locator('input#passwordConfirm');
    await expect(passwordConfirmInput).toBeFocused();
  });
});
