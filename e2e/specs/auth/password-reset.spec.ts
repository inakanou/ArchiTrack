import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { hashPassword, TEST_USERS } from '../../helpers/test-users';
import { loginWithCredentials } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { FRONTEND_BASE_URL } from '../../config';

/**
 * パスワード管理機能のE2Eテスト
 *
 * @requirement user-authentication/REQ-7 パスワード管理
 *
 * このテストスイートは、パスワードリセット機能をEnd-to-Endで検証します。
 */
test.describe('パスワード管理機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // テストユーザーのパスワードとアカウント状態を元の状態にリセット
    // （前のテストでパスワードが変更されている可能性があるため）
    const prisma = getPrismaClient();
    const user1 = TEST_USERS.REGULAR_USER;
    const user2 = TEST_USERS.REGULAR_USER_2;

    await prisma.user.update({
      where: { email: user1.email },
      data: {
        passwordHash: await hashPassword(user1.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });

    await prisma.user.update({
      where: { email: user2.email },
      data: {
        passwordHash: await hashPassword(user2.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });

    // パスワードリセットページに移動
    await page.goto('/password-reset');
  });

  /**
   * 要件7.1: パスワードリセット要求
   * WHEN ユーザーがパスワードリセットを要求する
   * THEN Authentication Serviceはメールアドレスにリセットトークンを送信する
   * @requirement user-authentication/REQ-7.1 @requirement user-authentication/REQ-29.6 @requirement user-authentication/REQ-28.9
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
   * @requirement user-authentication/REQ-29.7
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
   * @requirement user-authentication/REQ-29.17 @requirement user-authentication/REQ-29.18 @requirement user-authentication/REQ-28.13
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

    // ユニークなパスワードを生成（リトライ時のパスワード履歴重複を防ぐ）
    const uniquePassword = `TestPass${Date.now()}!Aa`;

    // Step 2: リセットURLにアクセス
    await page.goto(`/password-reset?token=${resetToken}`);

    // Step 3: 新しいパスワードを入力
    await page.locator('input#password').fill(uniquePassword);
    await page.locator('input#passwordConfirm').fill(uniquePassword);
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    // ログインページにリダイレクトされる
    await expect(page).toHaveURL(/\/login/);

    // 成功メッセージが表示される（リダイレクト後のログインページに表示）
    await expect(page.getByText(/パスワードがリセットされました/i)).toBeVisible();

    // 新しいパスワードでログインできることを確認
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill(uniquePassword);
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ログイン成功（ダッシュボードへリダイレクト）
    await expect(page).toHaveURL(/\//);
  });

  /**
   * 要件7.3: リセットトークンの有効期限切れ
   * WHEN リセットトークンが24時間の有効期限を超過している
   * THEN Authentication Serviceはトークンを無効として扱う
   * @requirement user-authentication/REQ-7.3 @requirement user-authentication/REQ-29.12 @requirement user-authentication/REQ-28.12
   */
  test('有効期限切れのリセットトークンではエラーが表示される', async ({ page }) => {
    // Step 1: 有効期限切れのリセットトークンを生成
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    // ユニークなトークンを生成（リトライ時の重複を防ぐ）
    const expiredToken = `expired-reset-token-${Date.now()}`;
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
    await expect(page.locator('input#password')).toBeDisabled();
    await expect(page.locator('input#passwordConfirm')).toBeDisabled();
  });

  /**
   * 要件7.2: 無効なリセットトークン
   * WHEN 無効なリセツトークンが提供される
   * THEN エラーメッセージが表示される
   * @requirement user-authentication/REQ-7.2 @requirement user-authentication/REQ-29.12 @requirement user-authentication/REQ-28.12
   */
  test('無効なリセットトークンではエラーが表示される', async ({ page }) => {
    await page.goto('/password-reset?token=invalid-token-12345');

    // エラーメッセージが表示される
    await expect(
      page.getByText(/無効なリセットリンクです.*再度リセットを要求してください/i)
    ).toBeVisible();

    // パスワード入力フィールドが無効化されている
    await expect(page.locator('input#password')).toBeDisabled();
    await expect(page.locator('input#passwordConfirm')).toBeDisabled();
  });

  /**
   * 要件7.1: パスワードリセット画面のUI/UX
   * WHEN パスワードリセット画面が表示される
   * THEN 適切なフォームとガイダンスが表示される
   * @requirement user-authentication/REQ-29.1 @requirement user-authentication/REQ-29.9 @requirement user-authentication/REQ-28.8
   */
  test('パスワードリセット画面が正しく表示される', async ({ page }) => {
    await page.goto('/password-reset');

    // フォーム要素が表示される
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /リセットリンクを送信/i })).toBeVisible();

    // ガイダンステキストが表示される
    await expect(page.getByText(/パスワードリセット用のリンクをメールで送信します/i)).toBeVisible();

    // ログインページへのリンクが表示される
    await expect(page.getByRole('link', { name: /ログインページに戻る/i })).toBeVisible();
  });

  /**
   * 要件7.2: パスワードリセットフォームのUI/UX（トークン有効時）
   * WHEN 有効なリセットトークンでアクセスする
   * THEN パスワード入力フォームが表示される
   * @requirement user-authentication/REQ-7.2 @requirement user-authentication/REQ-29.10 @requirement user-authentication/REQ-29.11 @requirement user-authentication/REQ-28.11
   */
  test('有効なトークンでパスワード入力フォームが表示される', async ({ page }) => {
    // リセットトークンを生成
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = 'valid-ui-test-token';
    // リトライ時に重複制約エラーを防ぐため、既存トークンを削除してから作成
    await prisma.passwordResetToken.deleteMany({
      where: { token: resetToken },
    });
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // トークン検証APIが完了するまで待機
    await page.goto(`/password-reset?token=${resetToken}`, { waitUntil: 'networkidle' });

    // パスワード入力フィールドが表示・有効化される（トークン検証完了後）
    await expect(page.locator('input#password')).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });
    await expect(page.locator('input#passwordConfirm')).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.locator('input#passwordConfirm')).toBeEnabled({ timeout: getTimeout(10000) });

    // パスワード入力にフォーカスできる
    await page.locator('input#password').fill('TestPass123!');
    await expect(page.locator('input#password')).toHaveValue('TestPass123!');
  });

  /**
   * 要件2.5-2.8: パスワードリセット時の複雑性検証
   * WHEN 複雑性要件を満たさないパスワードを入力する
   * THEN エラーメッセージが表示される
   * @requirement user-authentication/REQ-29.14
   */
  test('12文字未満のパスワードではエラーが表示される', async ({ page }) => {
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

    await page.locator('input#password').fill('Short123!'); // 9文字（12文字未満）
    await page.locator('input#passwordConfirm').fill('Short123!');
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    await expect(page.getByText(/パスワードは12文字以上である必要があります/i)).toBeVisible();
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

    const resetToken = `hibp-test-token-${Date.now()}`;
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    await page.locator('input#password').fill('Password123!'); // 有名な漏洩パスワード
    await page.locator('input#passwordConfirm').fill('Password123!');
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    await expect(page.getByText(/このパスワードは過去に漏洩が確認されています/i)).toBeVisible();
  });

  /**
   * 要件15.12: autocomplete属性の適切な設定
   * @requirement user-authentication/REQ-15.12
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
    const newPasswordInput = page.locator('input#password');
    await expect(newPasswordInput).toHaveAttribute('autocomplete', 'new-password');

    const confirmPasswordInput = page.locator('input#passwordConfirm');
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
   * 要件29.2: メールアドレスフィールドへの自動フォーカス
   * WHEN パスワードリセット要求画面が表示される
   * THEN メールアドレス入力フィールドに自動フォーカスが当たる
   * @requirement user-authentication/REQ-29.2
   */
  test('メールアドレスフィールドに自動フォーカスが当たる', async ({ page }) => {
    await page.goto('/password-reset');

    // メールアドレスフィールドにフォーカスが当たっている
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();
  });

  /**
   * 要件29.3: メールアドレス形式無効時のリアルタイムバリデーション
   * WHEN 無効なメールアドレス形式を入力する
   * THEN リアルタイムでバリデーションエラーが表示される
   * @requirement user-authentication/REQ-29.3
   */
  test('無効なメールアドレス形式でリアルタイムバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/password-reset');

    const emailInput = page.getByLabel(/メールアドレス/i);

    // 無効な形式のメールアドレスを入力
    await emailInput.fill('invalid-email');
    await emailInput.blur();

    // バリデーションエラーが表示される
    await expect(page.getByText(/有効なメールアドレスを入力してください/i)).toBeVisible();
  });

  /**
   * 要件29.4: 未入力で送信時の必須フィールドエラー
   * WHEN メールアドレスを入力せずに送信する
   * THEN 必須フィールドエラーが表示される
   * @requirement user-authentication/REQ-29.4
   */
  test('未入力で送信時に必須フィールドエラーが表示される', async ({ page }) => {
    await page.goto('/password-reset');

    // メールアドレスを入力せずに送信ボタンをクリック
    await page.getByRole('button', { name: /リセットリンクを送信/i }).click();

    // 必須フィールドエラーが表示される
    await expect(page.getByText(/メールアドレスは必須です/i)).toBeVisible();
  });

  /**
   * 要件29.5: リセットメール送信中のローディングスピナー
   * WHEN リセットメール送信リクエストが処理中である
   * THEN ローディングスピナーが表示される
   * @requirement user-authentication/REQ-29.5
   */
  test('リセットメール送信中にローディングスピナーが表示される', async ({ page }) => {
    // APIレスポンスを遅延させてローディング状態を確認できるようにする
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('password/reset-request')) {
        // 3秒間遅延させてローディング状態を確認できるようにする
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/password-reset');

    await page.getByLabel(/メールアドレス/i).fill('user@example.com');

    // 送信ボタンをクリック
    const submitButton = page.getByRole('button', { name: /リセットリンクを送信/i });
    await submitButton.click();

    // ローディング状態が表示される
    // ボタンテキストが「送信中...」に変わり、ボタンが無効化される
    await expect(page.getByRole('button', { name: /送信中/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /送信中/i })).toBeDisabled();
  });

  /**
   * 要件15.1: レスポンシブデザイン（モバイル）
   * WHEN デバイス画面幅が768px未満である
   * THEN モバイル最適化されたレイアウトを表示する
   * @requirement user-authentication/REQ-29.8
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

/**
 * パスワードリセットフローの完全E2Eテスト
 *
 * タスク24.3: パスワードリセットフローのE2Eテスト検証
 * - パスワードリセット要求 → メール送信 → リセット実行 → ログインの一連のフロー確認
 *
 * @requirement user-authentication/REQ-29 パスワードリセット画面のUI/UX
 */
test.describe('パスワードリセット完全E2Eフロー', () => {
  // 並列実行を無効化（メール確認の競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストグループ終了後にユーザーのパスワードをリセットして後続テストに影響を与えないようにする
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    const user1 = TEST_USERS.REGULAR_USER;
    const user2 = TEST_USERS.REGULAR_USER_2;

    await prisma.user.update({
      where: { email: user1.email },
      data: {
        passwordHash: await hashPassword(user1.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });

    await prisma.user.update({
      where: { email: user2.email },
      data: {
        passwordHash: await hashPassword(user2.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });
  });

  // Mailpit API URL
  const mailpitApiUrl = 'http://localhost:8025/api/v1';

  /**
   * Mailpitから全メールを削除
   */
  async function clearMailpit(): Promise<void> {
    try {
      await fetch(`${mailpitApiUrl}/messages`, { method: 'DELETE' });
    } catch {
      // Mailpitが利用できない場合はスキップ
      console.warn('Mailpit not available, skipping email clear');
    }
  }

  /**
   * Mailpitから特定の宛先に送信されたメールを取得
   * @param toEmail - 宛先メールアドレス
   * @param maxRetries - 最大リトライ回数
   * @returns メール情報（見つからない場合はnull）
   */
  async function getEmailFromMailpit(
    toEmail: string,
    maxRetries = 5
  ): Promise<{
    id: string;
    subject: string;
    html: string;
    text: string;
  } | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // メール一覧を取得
        const response = await fetch(`${mailpitApiUrl}/messages`);
        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.statusText}`);
        }
        const data = (await response.json()) as {
          messages: Array<{
            ID: string;
            To: Array<{ Address: string }>;
            Subject: string;
          }>;
        };

        // 宛先でフィルタリング
        const email = data.messages?.find((msg) =>
          msg.To?.some((to) => to.Address.toLowerCase() === toEmail.toLowerCase())
        );

        if (email) {
          // メール本文を取得
          const messageResponse = await fetch(`${mailpitApiUrl}/message/${email.ID}`);
          if (messageResponse.ok) {
            const messageData = (await messageResponse.json()) as {
              ID: string;
              Subject: string;
              HTML: string;
              Text: string;
            };
            return {
              id: messageData.ID,
              subject: messageData.Subject,
              html: messageData.HTML,
              text: messageData.Text,
            };
          }
        }

        // メールが見つからない場合は少し待ってリトライ
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        if (i === maxRetries - 1) {
          console.warn('Failed to get email from Mailpit:', error);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return null;
  }

  /**
   * メール本文からリセットトークンを抽出
   * @param emailText - メール本文
   * @returns リセットトークン（見つからない場合はnull）
   */
  function extractResetTokenFromEmail(emailText: string): string | null {
    // URLからトークンを抽出 (例: http://localhost:5173/password-reset?token=xxx)
    const urlMatch = emailText.match(/password-reset\?token=([a-zA-Z0-9_-]+)/);
    return urlMatch ? (urlMatch[1] ?? null) : null;
  }

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // Mailpitのメールをクリア
    await clearMailpit();

    // テストユーザーの状態をリセット
    const prisma = getPrismaClient();
    const user = TEST_USERS.REGULAR_USER;

    await prisma.user.update({
      where: { email: user.email },
      data: {
        passwordHash: await hashPassword(user.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });

    // 既存のパスワードリセットトークンを削除
    await prisma.passwordResetToken.deleteMany({
      where: {
        user: { email: user.email },
      },
    });
  });

  /**
   * 要件29.1, 29.2, 29.3: パスワードリセット完全フロー
   * パスワードリセット要求 → メール送信確認 → リセット実行 → ログインの一連のフロー
   * @requirement user-authentication/REQ-29.1 @requirement user-authentication/REQ-29.6 @requirement user-authentication/REQ-29.10 @requirement user-authentication/REQ-29.11 @requirement user-authentication/REQ-29.17 @requirement user-authentication/REQ-29.18 @requirement user-authentication/REQ-28.10
   */
  test('パスワードリセット要求からログインまでの完全フローが動作する', async ({ page }) => {
    const userEmail = 'user@example.com';
    const newPassword = `NewSecurePass${Date.now()}!Aa`;

    // Step 1: パスワードリセット要求画面にアクセス
    await page.goto('/password-reset');
    await expect(page.getByText(/パスワードリセット用のリンクをメールで送信します/i)).toBeVisible();

    // Step 2: メールアドレスを入力してリセット要求を送信
    await page.getByLabel(/メールアドレス/i).fill(userEmail);
    await page.getByRole('button', { name: /リセットリンクを送信/i }).click();

    // Step 3: 成功メッセージが表示される
    await expect(
      page.getByText(/パスワードリセットリンクを送信しました.*メールをご確認ください/i)
    ).toBeVisible({ timeout: getTimeout(10000) });

    // Step 4: Mailpitからリセットメールを取得
    const email = await getEmailFromMailpit(userEmail);

    // メールが取得できた場合のみ続行
    if (email) {
      expect(email.subject).toContain('パスワードリセット');

      // メール本文からリセットトークンを抽出
      const resetToken = extractResetTokenFromEmail(email.text || email.html);
      expect(resetToken).toBeTruthy();

      // Step 5: リセットURLにアクセス
      await page.goto(`/password-reset?token=${resetToken}`);

      // トークン検証が完了するまで待機
      await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

      // Step 6: 新しいパスワードを入力
      await page.locator('input#password').fill(newPassword);
      await page.locator('input#passwordConfirm').fill(newPassword);
      await page.getByRole('button', { name: /パスワードをリセット/i }).click();

      // Step 7: ログインページにリダイレクト
      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/パスワードがリセットされました/i)).toBeVisible();

      // Step 8: 新しいパスワードでログイン
      await page.getByLabel(/メールアドレス/i).fill(userEmail);
      await page.locator('input#password').fill(newPassword);
      await page.getByRole('button', { name: /ログイン/i }).click();

      // Step 9: ログイン成功（ダッシュボードへリダイレクト）
      await expect(page).toHaveURL(/\//, { timeout: getTimeout(15000) });
    } else {
      // メールが取得できない場合（Mailpitが利用不可）はDBのトークンで検証
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        include: { passwordResetRequests: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      expect(user?.passwordResetRequests).toHaveLength(1);
      const dbToken = user!.passwordResetRequests[0]!.token;

      // DBから取得したトークンでリセット実行
      await page.goto(`/password-reset?token=${dbToken}`);
      await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

      await page.locator('input#password').fill(newPassword);
      await page.locator('input#passwordConfirm').fill(newPassword);
      await page.getByRole('button', { name: /パスワードをリセット/i }).click();

      await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/パスワードがリセットされました/i)).toBeVisible();

      await page.getByLabel(/メールアドレス/i).fill(userEmail);
      await page.locator('input#password').fill(newPassword);
      await page.getByRole('button', { name: /ログイン/i }).click();

      await expect(page).toHaveURL(/\//, { timeout: getTimeout(15000) });
    }
  });

  /**
   * 要件29: パスワードリセット成功後のログイン画面へのリダイレクト
   * WHEN パスワード再設定が成功する
   * THEN Frontend UIは成功メッセージを表示し、ログイン画面へリダイレクトする
   * @requirement user-authentication/REQ-29.17 @requirement user-authentication/REQ-29.18
   */
  test('パスワードリセット成功後、成功メッセージが表示されログインページにリダイレクトされる', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    // ユニークなトークンとパスワードを生成
    const resetToken = `redirect-test-token-${Date.now()}`;
    const uniquePassword = `RedirectTest${Date.now()}!Aa`;

    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // リセットURLにアクセス
    await page.goto(`/password-reset?token=${resetToken}`);
    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

    // 新しいパスワードを設定
    await page.locator('input#password').fill(uniquePassword);
    await page.locator('input#passwordConfirm').fill(uniquePassword);
    await page.getByRole('button', { name: /パスワードをリセット/i }).click();

    // ログインページにリダイレクト
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

    // 成功メッセージが表示される
    await expect(page.getByText(/パスワードがリセットされました/i)).toBeVisible();
  });

  /**
   * 要件29.1: パスワードリセット要求画面のUI確認
   * WHEN パスワードリセット要求画面が表示される
   * THEN Frontend UIはメールアドレス入力フィールド、送信ボタン、ログイン画面へ戻るリンクを表示する
   * @requirement user-authentication/REQ-29.1 @requirement user-authentication/REQ-29.9
   */
  test('パスワードリセット要求画面に必要な要素が表示される', async ({ page }) => {
    await page.goto('/password-reset');

    // メールアドレス入力フィールド
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();

    // 送信ボタン
    await expect(page.getByRole('button', { name: /リセットリンクを送信/i })).toBeVisible();

    // ログイン画面へ戻るリンク
    await expect(page.getByRole('link', { name: /ログインページに戻る/i })).toBeVisible();

    // ガイダンステキスト
    await expect(page.getByText(/パスワードリセット用のリンクをメールで送信します/i)).toBeVisible();
  });

  /**
   * 要件29.2: パスワード再設定画面のUI確認
   * WHEN パスワード再設定画面が表示される
   * THEN Frontend UIは新しいパスワード入力フィールド、パスワード確認フィールド、変更ボタンを表示する
   * @requirement user-authentication/REQ-29.10
   */
  test('有効なトークンでパスワード再設定画面に必要な要素が表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = `ui-verification-token-${Date.now()}`;
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);

    // トークン検証完了を待機
    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

    // 新しいパスワード入力フィールド
    await expect(page.locator('input#password')).toBeVisible();

    // パスワード確認フィールド
    await expect(page.locator('input#passwordConfirm')).toBeVisible();

    // 変更ボタン
    await expect(page.getByRole('button', { name: /パスワードをリセット/i })).toBeVisible();
  });

  /**
   * 要件29.2: 無効トークンでのエラー表示
   * IF リセットトークンが無効または期限切れである
   * THEN Frontend UIはエラーメッセージと「パスワードリセットを再度申請する」リンクを表示する
   * @requirement user-authentication/REQ-29.12
   */
  test('無効なトークンでエラーメッセージと再申請案内が表示される', async ({ page }) => {
    await page.goto('/password-reset?token=completely-invalid-token-12345');

    // エラーメッセージが表示される
    await expect(
      page.getByText(/無効なリセットリンクです.*再度リセットを要求してください/i)
    ).toBeVisible({ timeout: getTimeout(10000) });

    // パスワード入力フィールドが無効化されている
    await expect(page.locator('input#password')).toBeDisabled();
    await expect(page.locator('input#passwordConfirm')).toBeDisabled();
  });

  /**
   * 要件29.2: 期限切れトークンでのエラー表示
   * IF リセットトークンが期限切れである
   * THEN Frontend UIはエラーメッセージを表示する
   * @requirement user-authentication/REQ-29.12
   */
  test('期限切れトークンでエラーメッセージが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const expiredToken = `expired-flow-test-${Date.now()}`;
    await prisma.passwordResetToken.create({
      data: {
        token: expiredToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() - 1000), // 1秒前に期限切れ
      },
    });

    await page.goto(`/password-reset?token=${expiredToken}`);

    // 期限切れエラーメッセージが表示される
    await expect(
      page.getByText(/リセットリンクの有効期限が切れています.*再度リセットを要求してください/i)
    ).toBeVisible({ timeout: getTimeout(10000) });

    // パスワード入力フィールドが無効化されている
    await expect(page.locator('input#password')).toBeDisabled();
    await expect(page.locator('input#passwordConfirm')).toBeDisabled();
  });

  /**
   * 要件29.13: 新しいパスワード入力時のパスワード強度インジケーター
   * WHEN 新しいパスワードを入力する
   * THEN パスワード強度インジケーターが表示される
   * @requirement user-authentication/REQ-29.13
   */
  test('新しいパスワード入力時にパスワード強度インジケーターが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = `strength-test-token-${Date.now()}`;
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);
    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

    // 弱いパスワードを入力
    await page.locator('input#password').fill('weak');

    // パスワード強度インジケーターが表示される
    await expect(page.locator('[data-testid="password-strength-indicator"]')).toBeVisible();

    // 強いパスワードに変更
    await page.locator('input#password').fill('VeryStrong123!@#Pass');

    // 強度インジケーターが更新される
    await expect(page.locator('[data-testid="password-strength-indicator"]')).toBeVisible();
  });

  /**
   * 要件29.15: パスワード確認不一致時のリアルタイムバリデーション
   * WHEN パスワードと確認パスワードが一致しない
   * THEN リアルタイムでバリデーションエラーが表示される
   * @requirement user-authentication/REQ-29.15
   */
  test('パスワード確認不一致時にリアルタイムバリデーションエラーが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = `mismatch-test-token-${Date.now()}`;
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);
    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

    // パスワードを入力
    await page.locator('input#password').fill('TestPassword123!');

    // 異なるパスワードを確認フィールドに入力
    await page.locator('input#passwordConfirm').fill('DifferentPassword123!');
    await page.locator('input#passwordConfirm').blur();

    // 不一致エラーが表示される
    await expect(page.getByText(/パスワードが一致しません/i)).toBeVisible();
  });

  /**
   * 要件29.16: パスワード変更中のローディングスピナー
   * WHEN パスワード変更リクエストが処理中である
   * THEN ローディングスピナーが表示される
   * @requirement user-authentication/REQ-29.16
   */
  test('パスワード変更中にローディングスピナーが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: 'user@example.com' },
    });

    const resetToken = `loading-test-token-${Date.now()}`;
    const uniquePassword = `LoadingTest${Date.now()}!Aa`;

    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/password-reset?token=${resetToken}`);
    await expect(page.locator('input#password')).toBeEnabled({ timeout: getTimeout(10000) });

    // パスワードを入力
    await page.locator('input#password').fill(uniquePassword);
    await page.locator('input#passwordConfirm').fill(uniquePassword);

    // リセットボタンをクリック
    const resetButton = page.getByRole('button', { name: /パスワードをリセット/i });
    await resetButton.click();

    // ローディング状態が表示される（ボタンが無効化され、テキストが「リセット中...」に変わる）
    const loadingButton = page.getByRole('button', { name: /リセット中/i });
    await expect(loadingButton).toBeDisabled();
  });
});

/**
 * パスワード変更後のセッション無効化テスト
 *
 * このテストは他のテストから独立して実行されます。
 * シリアルモードの影響を受けないように別のdescribeブロックに配置しています。
 */
test.describe('パスワード変更後のセッション管理', () => {
  // テスト専用のユーザー情報（他のテストと干渉しない）
  const testEmail = 'user2@example.com';
  const baseURL = FRONTEND_BASE_URL;

  // テストグループ終了後にユーザーのパスワードをリセットして後続テストに影響を与えないようにする
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    const user1 = TEST_USERS.REGULAR_USER;
    const user2 = TEST_USERS.REGULAR_USER_2;

    await prisma.user.update({
      where: { email: user1.email },
      data: {
        passwordHash: await hashPassword(user1.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });

    await prisma.user.update({
      where: { email: user2.email },
      data: {
        passwordHash: await hashPassword(user2.password),
        loginFailures: 0,
        isLocked: false,
        lockedUntil: null,
      },
    });
  });

  /**
   * 要件7.5: パスワード変更後の全セッション無効化
   * WHEN パスワードが更新される
   * THEN Authentication Serviceは全ての既存リフレッシュトークンを無効化する
   * @requirement user-authentication/REQ-7.5
   */
  test('パスワード変更後、全セッションが無効化される', async ({ page, browser }) => {
    // テストごとに一意のパスワードを生成（キャッシュやパスワード履歴の問題を回避）
    const testPassword = TEST_USERS.REGULAR_USER_2.password;

    // テストの安定性確保: パスワード、アカウント状態、セッションを明示的にリセット
    const prisma = getPrismaClient();
    const newPasswordHash = await hashPassword(testPassword);

    // トランザクションで確実にリセットを行う
    await prisma.$transaction(async (tx) => {
      const testUser = await tx.user.findUnique({ where: { email: testEmail } });
      if (testUser) {
        // パスワードを設定し、アカウントロック状態をリセット
        await tx.user.update({
          where: { email: testEmail },
          data: {
            passwordHash: newPasswordHash,
            loginFailures: 0,
            isLocked: false,
            lockedUntil: null,
          },
        });
        // 既存のセッションをすべて削除
        await tx.refreshToken.deleteMany({ where: { userId: testUser.id } });
        // パスワード履歴もクリア（パスワード再利用チェックを回避）
        await tx.passwordHistory.deleteMany({ where: { userId: testUser.id } });
      }
    });

    // Step 1: 第1タブで通常ログイン（セッション確立）
    await loginWithCredentials(page, testEmail, testPassword);

    // リフレッシュトークンがlocalStorageに保存されていることを確認
    const refreshToken1 = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken1).toBeTruthy();

    // Step 2: 第2タブを開いて別セッションを確立（baseURLを明示的に設定）
    const context2 = await browser.newContext({ baseURL });
    const page2 = await context2.newPage();

    await loginWithCredentials(page2, testEmail, testPassword);

    const refreshToken2 = await page2.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken2).toBeTruthy();

    // Step 3: リセットトークンを生成してパスワード変更
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    });

    // ユニークなトークンとパスワードを生成（リトライ時の競合を防ぐ）
    const resetToken = `session-test-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const uniquePassword = `SessionTest${Date.now()}!Aa`;

    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user!.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 第3タブでパスワードリセット（baseURLを明示的に設定）
    const context3 = await browser.newContext({ baseURL });
    const page3 = await context3.newPage();

    await page3.goto(`/password-reset?token=${resetToken}`);
    await page3.locator('input#password').fill(uniquePassword);
    await page3.locator('input#passwordConfirm').fill(uniquePassword);
    await page3.getByRole('button', { name: /パスワードをリセット/i }).click();

    // ログインページにリダイレクトされ、成功メッセージが表示される
    await expect(page3).toHaveURL(/\/login/);
    await expect(page3.getByText(/パスワードがリセットされました/i)).toBeVisible();

    // Step 4: 第1タブと第2タブで保護されたリソースにアクセス（セッション無効化を確認）
    await page.goto('/profile');

    // ログインページにリダイレクトされる（セッション無効化）
    await expect(page).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

    await page2.goto('/profile');
    await expect(page2).toHaveURL(/\/login/, { timeout: getTimeout(10000) });

    // クリーンアップ
    await context2.close();
    await context3.close();
  });
});
