import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';

/**
 * パスワード管理機能のE2Eテスト
 *
 * 要件7: パスワード管理
 *
 * このテストスイートは、パスワードリセット機能をEnd-to-Endで検証します。
 */
test.describe('パスワード管理機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // パスワードリセットページに移動
    await page.goto('/password-reset');
  });

  /**
   * 要件7.1: パスワードリセット要求
   * WHEN ユーザーがパスワードリセットを要求する
   * THEN Authentication Serviceはメールアドレスにリセットトークンを送信する
   */
  test('有効なメールアドレスでパスワードリセットを要求できる', async ({ page }) => {
    // メールアドレスを入力
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByRole('button', { name: /リセットリンクを送信/i }).click();

    // 成功メッセージが表示される
    await expect(
      page.getByText(/パスワードリセットリンクを送信しました.*メールをご確認ください/i)
    ).toBeVisible();

    // データベースにリセットトークンが作成されていることを確認
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
      include: { passwordResetRequests: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    expect(user).toBeTruthy();
    expect(user!.passwordResetRequests).toHaveLength(1);
    expect(user!.passwordResetRequests[0]!.token).toBeTruthy();
    expect(user!.passwordResetRequests[0]!.expiresAt).toBeTruthy();
  });

  /**
   * 要件7.1: 未登録メールアドレスでのパスワードリセット要求
   * WHEN 未登録のメールアドレスでパスワードリセットを要求する
   * THEN エラーメッセージが表示される（セキュリティ上、メールアドレスの存在を明かさない）
   */
  test('未登録メールアドレスでも同じ成功メッセージが表示される', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('nonexistent@example.com');
    await page.getByRole('button', { name: /リセットリンクを送信/i }).click();

    // セキュリティ上、同じ成功メッセージを表示（アカウント列挙攻撃の防止）
    await expect(
      page.getByText(/パスワードリセットリンクを送信しました.*メールをご確認ください/i)
    ).toBeVisible();
  });

  /**
   * 要件7.2: 有効なリセットトークンでパスワードをリセット
   * WHEN ユーザーが有効なリセットトークンと新しいパスワードを提供する
   * THEN Authentication Serviceはパスワードを更新する
   */
  test('有効なリセットトークンでパスワードを変更できる', async ({ page }) => {
    // Step 1: リセットトークンを生成
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    // ランダムな一意トークンを生成（ベストプラクティス: リトライ時の競合を防ぐ）
    const resetToken = `test-reset-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間後
      },
    });

    // Step 2: リセットURLにアクセス
    await page.goto(`/password-reset?token=${resetToken}`);

    // Step 3: 新しいパスワードを入力
    await page.locator('input#newPassword').fill('NewSecurePass123!');
    await page.locator('input#confirmPassword').fill('NewSecurePass123!');
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/パスワードを変更しました/i)).toBeVisible();

    // ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/);

    // 新しいパスワードでログインできることを確認
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('NewSecurePass123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ログイン成功（ダッシュボードへリダイレクト）
    await expect(page).toHaveURL(/\//);
  });

  /**
   * 要件7.3: リセットトークンの有効期限切れ
   * WHEN リセットトークンが24時間の有効期限を超過している
   * THEN Authentication Serviceはトークンを無効として扱う
   */
  test('有効期限切れのリセットトークンではエラーが表示される', async ({ page }) => {
    // Step 1: 有効期限切れのリセットトークンを生成
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const expiredToken = 'expired-reset-token-12345';
    await prisma.passwordResetToken.create({
      data: {
        token: expiredToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() - 1000), // 1秒前に期限切れ
      },
    });

    // Step 2: 期限切れトークンでリセットURLにアクセス
    await page.goto(`/password-reset?token=${expiredToken}`);

    // エラーメッセージが表示される
    await expect(
      page.getByText(/リセットリンクの有効期限が切れています.*再度リセットを要求してください/i)
    ).toBeVisible();

    // パスワード入力フィールドが無効化されている
    await expect(page.locator('input#newPassword')).toBeDisabled();
    await expect(page.locator('input#confirmPassword')).toBeDisabled();
  });

  /**
   * 要件7.2: 無効なリセットトークン
   * WHEN 無効なリセツトークンが提供される
   * THEN エラーメッセージが表示される
   */
  test('無効なリセットトークンではエラーが表示される', async ({ page }) => {
    await page.goto('/password-reset?token=invalid-token-12345');

    // エラーメッセージが表示される
    await expect(
      page.getByText(/無効なリセットリンクです.*再度リセットを要求してください/i)
    ).toBeVisible();

    // パスワード入力フィールドが無効化されている
    await expect(page.locator('input#newPassword')).toBeDisabled();
    await expect(page.locator('input#confirmPassword')).toBeDisabled();
  });

  /**
   * 要件7.5: パスワード変更後の全セッション無効化
   * WHEN パスワードが更新される
   * THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化する
   */
  test('パスワード変更後、全セッションが無効化される', async ({ page, browser }) => {
    // Step 1: 第1タブで通常ログイン（セッション確立）
    await page.goto('/login');
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ダッシュボードにリダイレクトされる
    await expect(page).toHaveURL(/\//);

    // リフレッシュトークンがlocalStorageに保存されていることを確認
    const refreshToken1 = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken1).toBeTruthy();

    // Step 2: 第2タブを開いて別セッションを確立
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    await page2.goto('http://localhost:5173/login');
    await page2.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page2.locator('input#password').fill('Password123!');
    await page2.getByRole('button', { name: /ログイン/i }).click();

    await expect(page2).toHaveURL(/\//);

    const refreshToken2 = await page2.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken2).toBeTruthy();

    // Step 3: リセットトークンを生成してパスワード変更
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'session-invalidation-test-token';
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 第3タブでパスワードリセット
    const context3 = await browser.newContext();
    const page3 = await context3.newPage();

    await page3.goto(`http://localhost:5173/password-reset?token=${resetToken}`);
    await page3.locator('input#newPassword').fill('NewPassword456!');
    await page3.locator('input#confirmPassword').fill('NewPassword456!');
    await page3.getByRole('button', { name: /パスワードをリセット/i }).click();

    // 成功メッセージを待つ
    await expect(page3.getByText(/パスワードを変更しました/i)).toBeVisible();

    // Step 4: 第1タブと第2タブで保護されたリソースにアクセス（セッション無効化を確認）
    await page.goto('/profile');

    // ログインページにリダイレクトされる（セッション無効化）
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await page2.goto('http://localhost:5173/profile');
    await expect(page2).toHaveURL(/\/login/, { timeout: 10000 });

    // クリーンアップ
    await context2.close();
    await context3.close();
  });

  /**
   * 要件7.1: パスワードリセット画面のUI/UX
   * WHEN パスワードリセット画面が表示される
   * THEN 適切なフォームとガイダンスが表示される
   */
  test('パスワードリセット画面が正しく表示される', async ({ page }) => {
    await page.goto('/password-reset');

    // フォーム要素が表示される
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /リセットリンクを送信/i })).toBeVisible();

    // ガイダンステキストが表示される
    await expect(
      page.getByText(/登録されたメールアドレスにパスワードリセットリンクを送信します/i)
    ).toBeVisible();

    // ログインページへのリンクが表示される
    await expect(page.getByRole('link', { name: /ログインページに戻る/i })).toBeVisible();
  });

  /**
   * 要件7.2: パスワードリセットフォームのUI/UX（トークン有効時）
   * WHEN 有効なリセットトークンでアクセスする
   * THEN パスワード入力フォームが表示される
   */
  test('有効なトークンでパスワード入力フォームが表示される', async ({ page }) => {
    // リセットトークンを生成
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'valid-ui-test-token';
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    // パスワード入力フィールドが表示される
    await expect(page.locator('input#newPassword')).toBeVisible();
    await expect(page.locator('input#newPassword')).toBeEnabled();
    await expect(page.locator('input#confirmPassword')).toBeVisible();
    await expect(page.locator('input#confirmPassword')).toBeEnabled();

    // パスワード強度インジケーターが入力時に表示される
    await page.locator('input#newPassword').fill('TestPass123!');
    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();
  });

  /**
   * 要件2.5-2.8: パスワードリセット時の複雑性検証
   * WHEN 複雑性要件を満たさないパスワードを入力する
   * THEN エラーメッセージが表示される
   */
  test('8文字未満のパスワードではエラーが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'complexity-test-token';
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    await page.locator('input#newPassword').fill('Short1!'); // 7文字
    await page.locator('input#confirmPassword').fill('Short1!');
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    await expect(page.getByText(/パスワードは8文字以上である必要があります/i)).toBeVisible();
  });

  test('連続した同一文字を含むパスワードではエラーが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'consecutive-chars-test-token';
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    await page.locator('input#newPassword').fill('Passss123!'); // 'sss'が連続
    await page.locator('input#confirmPassword').fill('Passss123!');
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    await expect(
      page.getByText(/パスワードに3文字以上の連続した同一文字を含めることはできません/i)
    ).toBeVisible();
  });

  /**
   * 要件7.8: パスワードリセット時のHIBP Pwned Passwordsチェック
   * WHEN 漏洩が確認されているパスワードを設定しようとする
   * THEN エラーメッセージが表示される
   */
  test('漏洩パスワードではエラーが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'hibp-test-token';
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    await page.locator('input#newPassword').fill('Password123!'); // 有名な漏洩パスワード
    await page.locator('input#confirmPassword').fill('Password123!');
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    await expect(
      page.getByText(
        /このパスワードは過去に漏洩が確認されています.*別のパスワードを選択してください/i
      )
    ).toBeVisible();
  });

  /**
   * 要件11.11: パスワードリセット画面のキーボードナビゲーション
   * WHEN パスワードリセット画面が読み込まれる
   * THEN メールアドレスフィールドに自動フォーカスされる
   */
  test('ページロード時にメールアドレスフィールドにオートフォーカスされる', async ({ page }) => {
    await page.goto('/password-reset');

    // メールアドレスフィールドがフォーカスされていることを確認
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();
  });

  /**
   * 要件11.11: Tab キーでフォーカス移動
   * WHEN Tab キーを押す
   * THEN 論理的な順序でフォーカスが移動する
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    await page.goto('/password-reset');

    // 初期状態：メールアドレスフィールドにフォーカス
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();

    // Tab キーを押してリセットボタンに移動
    await page.keyboard.press('Tab');
    const resetButton = page.getByRole('button', { name: /リセットリンクを送信/i });
    await expect(resetButton).toBeFocused();

    // Tab キーを押してログインページリンクに移動
    await page.keyboard.press('Tab');
    const loginLink = page.getByRole('link', { name: /ログインページに戻る/i });
    await expect(loginLink).toBeFocused();
  });

  /**
   * 要件15.12: autocomplete属性の適切な設定
   * WHEN パスワードリセットフォームが表示される
   * THEN 適切なautocomplete属性が設定されている
   */
  test('パスワードフィールドに適切なautocomplete属性が設定されている', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'autocomplete-test-token';
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    // autocomplete属性の検証
    const newPasswordInput = page.locator('input#newPassword');
    await expect(newPasswordInput).toHaveAttribute('autocomplete', 'new-password');

    const confirmPasswordInput = page.locator('input#confirmPassword');
    await expect(confirmPasswordInput).toHaveAttribute('autocomplete', 'new-password');
  });

  /**
   * 要件15.4: アクセシビリティ属性の検証
   * WHEN パスワードリセットフォームが表示される
   * THEN 適切なARIA属性が設定されている
   */
  test('パスワードリセットフォームがアクセシビリティ要件を満たす', async ({ page }) => {
    await page.goto('/password-reset');

    // メールアドレスフィールドのラベル関連付け
    const emailInput = page.getByLabel(/メールアドレス/i);
    const emailInputId = await emailInput.getAttribute('id');
    expect(emailInputId).toBeTruthy();

    // フォームのrole属性
    const form = page.locator('form');
    await expect(form).toHaveAttribute('role', 'form');
  });

  /**
   * 要件15.10: トーストメッセージの自動非表示
   * WHEN 成功メッセージが表示される
   * THEN 一定時間後に自動的に非表示になる
   */
  test('成功メッセージが自動的に非表示になる', async ({ page }) => {
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.getByRole('button', { name: /リセットリンクを送信/i }).click();

    // 成功メッセージが表示される
    const successMessage = page.getByText(
      /パスワードリセットリンクを送信しました.*メールをご確認ください/i
    );
    await expect(successMessage).toBeVisible();

    // 5秒後にメッセージが非表示になる
    await page.waitForTimeout(5500);
    await expect(successMessage).not.toBeVisible();
  });

  /**
   * 要件15.1: レスポンシブデザイン（モバイル）
   * WHEN デバイス画面幅が768px未満である
   * THEN モバイル最適化されたレイアウトを表示する
   */
  test('モバイル画面でレイアウトが最適化される', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/password-reset');

    // フォームが表示される
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /リセットリンクを送信/i })).toBeVisible();

    // モバイルレイアウトのクラスが適用されているか確認（実装依存）
    const container = page.locator('[data-testid="password-reset-container"]');
    await expect(container).toBeVisible();
  });
});
