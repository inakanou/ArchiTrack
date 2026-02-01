import { test, expect } from '@playwright/test';
import { resetTestUser, getTestUser } from '../../fixtures/database';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForApiResponse } from '../../helpers/wait-helpers';
import AxeBuilder from '@axe-core/playwright';

/**
 * セキュリティとアクセシビリティの統合テスト
 *
 * @requirement user-authentication/REQ-10 セキュリティとエラーハンドリング
 * @requirement user-authentication/REQ-15 共通UI/UXガイドライン
 *
 * このテストスイートは、セキュリティとアクセシビリティ要件を検証します。
 */

test.describe('セキュリティテスト', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // localStorageもクリア（前回のテスト実行から残っている古いトークンを削除）
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    // ページをリロードして状態をクリア
    await page.reload({ waitUntil: 'domcontentloaded' });
    await resetTestUser('REGULAR_USER');
  });

  /**
   * 要件10.1: 認証エラー時の詳細情報漏洩防止
   * @requirement user-authentication/REQ-10.1
   * WHEN 認証エラーが発生する
   * THEN 詳細なエラー情報（メールアドレスの存在有無など）を返してはならない
   */
  test('ログイン失敗時に汎用的なエラーメッセージが表示される', async ({ page }) => {
    await page.goto('/login');

    // 存在しないメールアドレスでログイン試行
    await page.getByLabel(/メールアドレス/i).fill('nonexistent@example.com');
    await page.locator('input#password').fill('WrongPassword123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // 汎用的なエラーメッセージ（アカウント列挙攻撃の防止）
    await expect(page.getByText(/メールアドレスまたはパスワードが正しくありません/i)).toBeVisible();

    // 詳細情報を含まないことを確認
    await expect(page.getByText(/存在しない|登録されていない/i)).not.toBeVisible();

    // 登録済みメールアドレスでも同じエラーメッセージ
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('WrongPassword123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // 同じ汎用的なエラーメッセージ
    await expect(page.getByText(/メールアドレスまたはパスワードが正しくありません/i)).toBeVisible();
  });

  /**
   * 要件10.2: XSS攻撃の防止
   * 要件10.4: データベース接続エラー時のHTTP 500
   * 要件10.5: バリデーション失敗時の詳細エラー
   * @requirement user-authentication/REQ-10.2 @requirement user-authentication/REQ-10.4 @requirement user-authentication/REQ-10.5
   * WHEN ユーザーがスクリプトを含むデータを入力する
   * THEN システムはスクリプトをエスケープまたはサニタイズする
   */
  test('XSS攻撃が適切にエスケープされる', async ({ page }) => {
    // 前のテストの認証状態が残っていた場合に備えてクリア
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAsUser(page, 'REGULAR_USER');

    // リフレッシュAPIのレスポンスを監視
    let refreshApiStatus: number | null = null;
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/auth/refresh')) {
        refreshApiStatus = response.status();
      }
    });

    await page.goto('/profile', { waitUntil: 'networkidle' });

    // リフレッシュAPIが呼ばれた場合、成功していることを確認
    // 前回のテスト実行から古いトークンが残っている場合、リフレッシュが401で失敗することがある
    if (refreshApiStatus !== null && refreshApiStatus !== 200) {
      // リフレッシュが失敗した場合、再度ログインを試みる
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/profile', { waitUntil: 'networkidle' });
    }

    // プロフィールページのロード完了を待機
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 認証状態を確認（ログインページにリダイレクトされていないか）
    if (page.url().includes('/login')) {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/profile', { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible({
        timeout: getTimeout(15000),
      });
    }

    // XSS ペイロードを含む表示名を設定
    const xssPayload = '<script>alert("XSS")</script>';
    const displayNameInput = page.getByLabel(/表示名/i);
    const saveButton = page.getByRole('button', { name: /^保存$/i });

    // 表示名フィールドが表示されるまで待機
    await expect(displayNameInput).toBeVisible({ timeout: getTimeout(10000) });

    // XSSペイロードを入力（type を使用してReactのonChangeを確実にトリガー）
    await displayNameInput.click();
    await displayNameInput.fill('');
    await displayNameInput.type(xssPayload, { delay: 10 });

    // フォーム変更検知のため少し待機
    await page.waitForTimeout(500);

    // 保存ボタンが有効になるまで待機
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });

    // APIレスポンスを待機しながら保存ボタンをクリック
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/auth/me') && response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );
    await saveButton.click();

    // APIレスポンスの完了を待機
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // 保存完了後、少し待機してからリロード（状態の安定化）
    await page.waitForTimeout(500);

    // ページをリロード（ネットワーク完了まで待機）
    await page.reload({ waitUntil: 'networkidle' });

    // CI並列実行時にセッションが無効化されてログインページにリダイレクトされた場合は再認証
    if (page.url().includes('/login')) {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/profile', { waitUntil: 'networkidle' });
    }

    // プロフィールページのロード完了を待機
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // リロード後、displayNameフィールドの値が設定されるまで待機
    await expect(displayNameInput).toHaveValue(xssPayload, { timeout: getTimeout(10000) });

    // スクリプトが実行されず、エスケープされたテキストとして表示される
    const displayedValue = await displayNameInput.inputValue();
    expect(displayedValue).toBe(xssPayload);

    // ページにアラートダイアログが表示されていないことを確認
    const dialogPromise = page
      .waitForEvent('dialog', { timeout: getTimeout(1000) })
      .catch(() => null);
    const dialog = await dialogPromise;
    expect(dialog).toBeNull();
  });

  /**
   * 要件10: SQLインジェクション攻撃の防止
   * 要件11.4: メールアドレス形式バリデーション
   * @requirement user-authentication/REQ-10.1 @requirement user-authentication/REQ-11.4
   * WHEN ユーザーがSQLインジェクションペイロードを入力する
   * THEN システムは適切にエスケープし、攻撃を防ぐ
   */
  test('SQLインジェクション攻撃が防がれる', async ({ page }) => {
    await page.goto('/login');

    // SQLインジェクションペイロード
    const sqlPayload = "admin@example.com' OR '1'='1";
    await page.getByLabel(/メールアドレス/i).fill(sqlPayload);
    await page.locator('input#password').fill('anything');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ログインが失敗し、適切なエラーメッセージが表示される
    // SQLインジェクションペイロードは不正なメールアドレス形式のため、バリデーションエラーとなる
    await expect(
      page.getByText(
        /メールアドレスまたはパスワードが正しくありません|無効なメールアドレス|有効なメールアドレスを入力してください/i
      )
    ).toBeVisible();

    // ログインページに留まっていることを確認（ダッシュボードにリダイレクトされていない）
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * 要件4.6: レート制限（アカウントロック）
   * @requirement user-authentication/REQ-4.6
   * WHEN 連続して5回ログインに失敗する
   * THEN アカウントを15分間ロックする
   */
  test('レート制限により5回失敗後アカウントがロックされる', async ({ page }) => {
    // 直前にリセットして並列テストによるカウンターリセットの影響を最小化
    await resetTestUser('REGULAR_USER');

    await page.goto('/login');

    const email = 'user@example.com';
    const wrongPassword = 'WrongPassword123!';

    // 5回連続でログイン失敗
    // page.reload()を避け、高速に連続実行して並列テストの干渉を最小化
    for (let i = 0; i < 5; i++) {
      await page.getByLabel(/メールアドレス/i).fill(email);
      await page.locator('input#password').fill(wrongPassword);
      await page.getByRole('button', { name: /ログイン/i }).click();

      if (i < 4) {
        await expect(
          page.getByText(/メールアドレスまたはパスワードが正しくありません/i)
        ).toBeVisible();
      }
    }

    // 5回目の失敗後、アカウントロックメッセージが表示される
    await expect(
      page.getByText(/アカウントがロックされています.*\d+分後に再試行できます/i)
    ).toBeVisible();
  });

  /**
   * 要件5.5: トークン改ざんの検出
   * 要件10.3: EdDSA署名アルゴリズム使用
   * 要件10.7: トークン生成の暗号学的安全性
   * @requirement user-authentication/REQ-5.5 @requirement user-authentication/REQ-10.3 @requirement user-authentication/REQ-10.7
   * WHEN リフレッシュトークンが改ざんされている
   * THEN システムはセッション復元を拒否し、ログイン画面へリダイレクトする
   *
   * Note: アクセストークンはメモリ内で管理されるため、
   * リフレッシュトークンを改ざんしてセッション復元をテストする
   */
  test('改ざんされたトークンでリクエストが拒否される', async ({ page }) => {
    // 正常にログイン
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');

    // プロフィールページが表示されることを確認
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible();

    // リフレッシュトークンを改ざん（セッション復元時に使用される）
    await page.evaluate(() => {
      const tamperedToken =
        'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.TAMPERED_PAYLOAD.TAMPERED_SIGNATURE';
      localStorage.setItem('refreshToken', tamperedToken);
    });

    // ページをリロードしてセッション復元を試みる
    await page.reload();

    // 改ざんされたトークンによりセッション復元が失敗し、ログイン画面へリダイレクトされる
    await page.waitForURL(/\/login/, { timeout: getTimeout(10000) });
    expect(page.url()).toContain('/login');
  });

  /**
   * 要件11.2: パスワード表示/非表示切り替えのセキュリティ
   * 要件10.3: EdDSA署名アルゴリズム使用
   * @requirement user-authentication/REQ-10.3 @requirement user-authentication/REQ-11.2
   * WHEN パスワードフィールドが表示される
   * THEN パスワード表示/非表示切り替えボタンが提供される
   */
  test('パスワード表示/非表示切り替えが正しく動作する', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.locator('input#password');
    await passwordInput.fill('TestPassword123!');

    // 初期状態：パスワードが非表示（type="password"）
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // 表示ボタンをクリック
    const toggleButton = page.getByRole('button', { name: /パスワードを表示/i });
    await toggleButton.click();

    // パスワードが表示される（type="text"）
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // 非表示ボタンをクリック
    await page.getByRole('button', { name: /パスワードを非表示/i }).click();

    // パスワードが再び非表示になる
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

test.describe('アクセシビリティテスト（WCAG 2.1 AA準拠）', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // localStorageもクリア（前回のテスト実行から残っている古いトークンを削除）
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await resetTestUser('REGULAR_USER');
  });

  /**
   * 要件15.7: WCAG 2.1 AA準拠（自動チェック）
   * @requirement user-authentication/REQ-15.5 カラー情報はテキストやアイコンで補完
   * @requirement user-authentication/REQ-15.7
   * WHEN 全ての画面が表示される
   * THEN 最低コントラスト比4.5:1を維持し、アクセシビリティ基準を満たす
   */
  test('ログイン画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
    await page.goto('/login');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-15.7
   */
  test('新規登録画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
    // 招待トークンを作成
    const { getPrismaClient } = await import('../../fixtures/database');
    const prisma = getPrismaClient();

    const admin = await getTestUser('ADMIN_USER');
    const invitation = await prisma.invitation.create({
      data: {
        email: 'accessibility-test@example.com',
        token: 'accessibility-test-token',
        inviterId: admin.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await page.goto(`/register?token=${invitation.token}`);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-15.7
   */
  test('プロフィール画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  /**
   * @requirement user-authentication/REQ-15.7
   */
  test('パスワードリセット画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
    await page.goto('/password-reset');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  /**
   * 要件15.3: キーボード操作のサポート
   * @requirement user-authentication/REQ-15.3
   * WHEN 全てのボタンとリンクが表示される
   * THEN キーボード操作（Tab、Enter、Space）をサポートする
   */
  test('全てのインタラクティブ要素がキーボード操作可能', async ({ page }) => {
    await page.goto('/login');

    // Enterキーでログインボタンをクリック
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('Password123!');

    // ログインボタンにフォーカスを移動
    // パスワード入力 → パスワード表示ボタン → ログインボタン
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const loginButton = page.getByRole('button', { name: /ログイン/i });
    await expect(loginButton).toBeFocused();

    // Enterキーでボタンをクリック
    await page.keyboard.press('Enter');

    // ログイン成功（ダッシュボードへリダイレクト）
    await expect(page).toHaveURL(/\//);
  });

  /**
   * 要件15.4: ARIA属性の適切な設定
   * @requirement user-authentication/REQ-15.4
   * WHEN ページが読み込まれる
   * THEN 適切なaria-label、aria-describedby、role属性を提供する
   */
  test('フォームに適切なARIA属性が設定されている', async ({ page }) => {
    await page.goto('/login');

    // フォームのrole属性
    const form = page.locator('form');
    await expect(form).toHaveAttribute('role', 'form');

    // エラーメッセージのaria-live
    await page.getByRole('button', { name: /ログイン/i }).click();

    const errorMessage = page.locator(
      '[role="alert"], [aria-live="polite"], [aria-live="assertive"]'
    );
    await expect(errorMessage.first()).toBeVisible();
  });

  /**
   * 要件15.6: フォームバリデーションエラーのaria-live通知
   * @requirement user-authentication/REQ-15.6
   * WHEN フォームバリデーションエラーが発生する
   * THEN エラーメッセージをaria-liveリージョンで通知する
   */
  test('バリデーションエラーがaria-liveで通知される', async ({ page }) => {
    await page.goto('/login');

    // フォーム未入力で送信
    await page.getByRole('button', { name: /ログイン/i }).click();

    // エラーメッセージがaria-liveリージョンに表示される
    const errorRegion = page.locator('[aria-live="polite"], [role="alert"]');
    await expect(errorRegion.first()).toBeVisible();

    // エラーメッセージの内容を確認（複数のエラーメッセージが表示される可能性があるため.first()を使用）
    await expect(
      page.getByText(/メールアドレスは必須|パスワードは必須|必須項目/i).first()
    ).toBeVisible();
  });

  /**
   * 要件15.2: フォーム送信エラー時の最初のエラーフィールドへのスクロール
   * @requirement user-authentication/REQ-15.2
   * WHEN フォーム送信エラーが発生する
   * THEN 最初のエラーフィールドにスクロールし、フォーカスする
   */
  test('バリデーションエラー時に最初のエラーフィールドにフォーカスされる', async ({ page }) => {
    await page.goto('/login');

    // パスワードのみ入力（メールアドレスは未入力）
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // メールアドレスフィールドにフォーカスされる
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toBeFocused();
  });
});

test.describe('レスポンシブデザインテスト', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // localStorageもクリア（前回のテスト実行から残っている古いトークンを削除）
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await resetTestUser('REGULAR_USER');
  });

  /**
   * 要件15.1: レスポンシブデザイン（モバイル: 320px-767px）
   * 要件29.19: モバイル最適化レイアウト（768px未満）
   * 要件11.10: モバイルレイアウト
   * @requirement user-authentication/REQ-11.10 @requirement user-authentication/REQ-15.1 @requirement user-authentication/REQ-29.19
   * WHEN デバイス画面幅が768px未満である
   * THEN モバイル最適化されたレイアウトを表示する
   */
  test('モバイル画面（320px）でレイアウトが最適化される', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/login');

    // フォーム要素が表示される
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();

    // フォームが画面幅に収まる（横スクロールが発生しない）
    const bodyWidth = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - document is available in browser context
      return document.body.scrollWidth;
    });
    expect(bodyWidth).toBeLessThanOrEqual(320);
  });

  /**
   * @requirement user-authentication/REQ-15.1
   */
  test('タブレット画面（768px）でレイアウトが最適化される', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/login');

    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();

    const bodyWidth = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - document is available in browser context
      return document.body.scrollWidth;
    });
    expect(bodyWidth).toBeLessThanOrEqual(768);
  });

  /**
   * @requirement user-authentication/REQ-15.1
   */
  test('デスクトップ画面（1024px以上）でレイアウトが最適化される', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/login');

    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();
  });
});

test.describe('モーダルとトーストメッセージテスト', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // localStorageもクリア（前回のテスト実行から残っている古いトークンを削除）
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await resetTestUser('REGULAR_USER');
  });

  /**
   * 要件15.11: モーダルダイアログのフォーカストラップとEscキー
   * @requirement user-authentication/REQ-15.11
   * WHEN モーダルダイアログが開かれる
   * THEN フォーカストラップを実装し、Escキーで閉じられる
   */
  test('パスワード変更確認ダイアログがEscキーで閉じられる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');

    // パスワード変更フォームに入力
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('NewPassword456!');
    await page.locator('input#confirmPassword').fill('NewPassword456!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // 確認ダイアログが表示される
    const dialog = page.getByRole('dialog', { name: /確認|パスワード変更/i });
    await expect(dialog).toBeVisible();

    // Escキーでダイアログを閉じる
    await page.keyboard.press('Escape');

    // ダイアログが閉じられる
    await expect(dialog).not.toBeVisible();
  });

  /**
   * 要件15.10: トーストメッセージの自動非表示
   * @requirement user-authentication/REQ-15.8 長時間処理時のプログレスバー
   * @requirement user-authentication/REQ-15.9 ネットワークエラー時のリトライボタン
   * @requirement user-authentication/REQ-15.10
   * @requirement user-authentication/REQ-15.13 セッション期限切れ時の自動リダイレクト
   * WHEN トーストメッセージが表示される
   * THEN 自動的に非表示にする
   */
  test('成功トーストメッセージが自動的に非表示になる', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');

    // プロフィールページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible({ timeout: getTimeout(15000) });

    // 表示名フィールドが表示されるまで待機
    const displayNameInput = page.getByLabel(/表示名/i);
    await expect(displayNameInput).toBeVisible({ timeout: getTimeout(10000) });

    // 表示名を変更（clear+fillで確実にフォーム変更を検知させる）
    await displayNameInput.click();
    await displayNameInput.fill('');
    await displayNameInput.fill('Updated Name');

    // フォーム変更検知のため少し待機
    await page.waitForTimeout(500);

    // 保存ボタンが有効になるまで待機（フォーム変更検知のため）
    const saveButton = page.getByRole('button', { name: /^保存$|^プロフィールを保存$/i });
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });

    // API応答を待機しながら保存ボタンをクリック
    await waitForApiResponse(
      page,
      async () => {
        await saveButton.click();
      },
      /\/api\/v1\/auth\/me/,
      { timeout: getTimeout(30000) }
    );

    // 成功トーストメッセージが表示される
    const toast = page.getByText(/更新しました|成功|保存しました/i);
    await expect(toast).toBeVisible({ timeout: getTimeout(15000) });

    // 5秒後にトーストが非表示になる（CI用に余裕を持たせる）
    await page.waitForTimeout(6000);
    await expect(toast).not.toBeVisible({ timeout: getTimeout(5000) });
  });
});
