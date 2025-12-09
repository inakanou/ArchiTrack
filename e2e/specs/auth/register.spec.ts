import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createInvitation } from '../../fixtures/auth.fixtures';
import { TEST_USERS } from '../../helpers/test-users';

/**
 * 新規登録機能のE2Eテスト
 *
 * @requirement user-authentication/REQ-2 招待を受けたユーザーのアカウント作成
 * @requirement user-authentication/REQ-12 ユーザー登録画面のUI/UX（招待リンク経由）
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

  /**
   * @requirement user-authentication/REQ-12.1 @requirement user-authentication/REQ-12.3 @requirement user-authentication/REQ-28.18
   */
  test('登録フォームが正しく表示される', async ({ page }) => {
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.locator('input#passwordConfirm')).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /登録/i })).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-2.1 @requirement user-authentication/REQ-2.9 @requirement user-authentication/REQ-2.10 @requirement user-authentication/REQ-2.11 @requirement user-authentication/REQ-2.12 @requirement user-authentication/REQ-12.7 @requirement user-authentication/REQ-12.8 @requirement user-authentication/REQ-12.9 @requirement user-authentication/REQ-28.19
   */
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

  /**
   * @requirement user-authentication/REQ-12.4 パスワード強度インジケーター
   */
  test('パスワード入力時に強度インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('weak');

    // 強度インジケーターが表示される
    await expect(page.getByTestId('password-strength-indicator')).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-12.6 パスワード確認不一致
   */
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
   * 要件2.2: 無効な招待トークン
   * IF 招待トークンが無効または存在しない
   * THEN Authentication Serviceはエラーメッセージを返さなければならない
   * @requirement user-authentication/REQ-2.2
   */
  test('無効な招待トークンの処理', async ({ page, context }) => {
    // このテストは独自のナビゲーションを行うため、beforeEachのナビゲーションを上書き
    await context.clearCookies();

    // 存在しない無効なトークンでアクセス
    const invalidToken = 'invalid_nonexistent_token_' + Date.now();
    await page.goto(`/register?token=${invalidToken}`);

    // エラーメッセージが表示されることを確認
    await expect(
      page.getByText(/招待トークンの検証に失敗しました|招待トークンが無効です/i)
    ).toBeVisible();

    // 管理者への連絡案内が表示されることを確認
    await expect(page.getByText(/管理者に連絡してください/i)).toBeVisible();
  });

  /**
   * 要件2.3: 期限切れ招待トークン
   * IF 招待トークンが期限切れである
   * THEN Authentication Serviceはエラーメッセージを返さなければならない
   * @requirement user-authentication/REQ-2.3
   */
  test('期限切れ招待トークンの処理', async ({ page, context }) => {
    // このテストは独自のナビゲーションを行うため、beforeEachのナビゲーションを上書き
    await context.clearCookies();

    // 期限切れの招待トークンを作成
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: TEST_USERS.ADMIN_USER.email },
    });
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // 過去の日時で期限切れの招待を作成
    const expiredInvitation = await createInvitation({
      email: 'expired_test_' + Date.now() + '@example.com',
      inviterId: admin.id,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24時間前（期限切れ）
    });

    // 期限切れトークンでアクセス
    await page.goto(`/register?token=${expiredInvitation.token}`);

    // エラーメッセージが表示されることを確認
    await expect(
      page.getByText(/招待トークンの検証に失敗しました|招待トークンが無効です/i)
    ).toBeVisible();

    // 管理者への連絡案内が表示されることを確認
    await expect(page.getByText(/管理者に連絡してください/i)).toBeVisible();
  });

  /**
   * 要件2.4: 使用済み招待トークン
   * IF 招待トークンが既に使用済みである
   * THEN Authentication Serviceはエラーメッセージを返さなければならない
   * @requirement user-authentication/REQ-2.4
   */
  test('使用済み招待トークンの処理', async ({ page, context }) => {
    // このテストは独自のナビゲーションを行うため、beforeEachのナビゲーションを上書き
    await context.clearCookies();

    // 使用済みの招待トークンを作成
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: TEST_USERS.ADMIN_USER.email },
    });
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // status='used'で使用済みの招待を作成
    const usedInvitation = await createInvitation({
      email: 'used_test_' + Date.now() + '@example.com',
      inviterId: admin.id,
      status: 'used',
    });

    // 使用済みトークンでアクセス
    await page.goto(`/register?token=${usedInvitation.token}`);

    // エラーメッセージが表示されることを確認
    await expect(
      page.getByText(/招待トークンの検証に失敗しました|招待トークンが無効です/i)
    ).toBeVisible();

    // 管理者への連絡案内が表示されることを確認
    await expect(page.getByText(/管理者に連絡してください/i)).toBeVisible();
  });

  /**
   * 要件1.4: 招待メールアドレスが既に登録済みの場合はエラーメッセージを返す
   * @requirement user-authentication/REQ-1.4 @requirement user-authentication/REQ-12.2 @requirement user-authentication/REQ-28.20
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
   * @requirement user-authentication/REQ-2.5 @requirement user-authentication/REQ-12.5
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
   * @requirement user-authentication/REQ-2.6 @requirement user-authentication/REQ-12.5
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

  /**
   * @requirement user-authentication/REQ-2.6 @requirement user-authentication/REQ-12.5
   */
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

  /**
   * @requirement user-authentication/REQ-2.6 @requirement user-authentication/REQ-12.5
   */
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

  /**
   * @requirement user-authentication/REQ-2.6 @requirement user-authentication/REQ-12.5
   */
  test('記号を含まないパスワードではエラーが表示される', async ({ page }) => {
    // 大文字・小文字・数字あり、記号なし（12文字以上）
    await page.locator('input#password').fill('XyzUniqTest123');
    await page.locator('input#passwordConfirm').fill('XyzUniqTest123');
    await page.getByLabel(/表示名/i).fill('Test User');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /登録/i }).click();

    await expect(page.getByText(/パスワードは記号を1文字以上含む必要があります/i)).toBeVisible();
  });

  /**
   * 要件2.7: HIBP Pwned Passwordsチェック
   * WHEN 漏洩が確認されているパスワードを入力する
   * THEN エラーメッセージが表示される
   * @requirement user-authentication/REQ-2.7 @requirement user-authentication/REQ-12.5
   */
  test('漏洩パスワードではエラーが表示される', async ({ page }) => {
    // 複雑性要件を満たしつつ漏洩DBに存在するパスワード（12文字以上、大文字・小文字・数字・記号）
    await page.locator('input#password').fill('Password123!');
    await page.locator('input#passwordConfirm').fill('Password123!');
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
   * @requirement user-authentication/REQ-2.8 @requirement user-authentication/REQ-12.5
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
   * @requirement user-authentication/REQ-12.4 パスワード強度インジケーター
   */
  test('弱いパスワードで「弱」インジケーターが表示される', async ({ page }) => {
    // 2種類の文字種のみ（短く、文字種が少ない = 弱い）
    await page.locator('input#password').fill('weak12'); // 6文字、2種類のみ

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが「弱」であることを確認
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/弱/i);

    // 視覚的フィードバック（色やプログレスバー）
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'weak');
  });

  /**
   * @requirement user-authentication/REQ-12.4 パスワード強度インジケーター
   */
  test('普通のパスワードで「普通」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('lowercaseonly'); // 13文字、小文字のみ（minLengthのみ達成）

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが「普通」であることを確認
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/普通/i);

    // 視覚的フィードバック
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'fair');
  });

  /**
   * @requirement user-authentication/REQ-12.4 パスワード強度インジケーター
   */
  test('強いパスワードで「強」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#password').fill('SuperSecure!Pass123@Word'); // 24文字、複雑

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが「強」であることを確認
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/強/i);

    // 視覚的フィードバック
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', /strong|very-strong/);
  });

  /**
   * 要件14.6: パスワード強度インジケーターのアクセシビリティ
   * WHEN パスワード強度インジケーターが表示される
   * THEN ARIA属性が適切に設定されている
   * @requirement user-authentication/REQ-12.4 パスワード強度インジケーター
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
   * 要件12.10: 登録画面のモバイルレイアウト（レスポンシブ対応の一環として関連）
   * @requirement user-authentication/REQ-11.11 @requirement user-authentication/REQ-12.10
   * WHEN 新規登録ページが読み込まれる
   * THEN 表示名フィールドに自動的にフォーカスされる（メールは事前入力済み）
   * Note: REQ-12.10はモバイルレイアウトを指すが、この画面全体の動作を含む
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

    // Tab キーを押してパスワードフィールドに移動
    // 注: メールアドレスフィールドは disabled のため Tab キーでスキップされる
    await page.keyboard.press('Tab');
    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toBeFocused();

    // Tab キーを押してパスワード確認フィールドに移動
    await page.keyboard.press('Tab');
    const passwordConfirmInput = page.locator('input#passwordConfirm');
    await expect(passwordConfirmInput).toBeFocused();
  });
});
