import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';

/**
 * トークンリフレッシュ機能のE2Eテスト
 *
 * 要件カバレッジ:
 * - 要件5.1: アクセストークン期限切れ時のリフレッシュトークンでの新トークン発行
 * - 要件16.10: 複数APIリクエストが同時に401エラーを受信した場合、単一リフレッシュPromise共有
 * - 要件16.11: マルチタブ環境でBroadcast Channel APIを使用したトークン更新通知
 * - 要件16.12: リフレッシュ処理中、他のリクエストをキューに保持
 * - 要件16.13: リフレッシュ完了後、キューの全リクエストを新トークンで再実行
 * - 要件24.4: トークンリフレッシュ中に複数APIリクエストが発生した場合のRace Condition対策
 */

test.describe('トークンリフレッシュ機能', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
  });

  /**
   * 要件5.1: アクセストークン期限切れ時にリフレッシュトークンで新しいアクセストークンを発行
   */
  test('アクセストークン期限切れ時に自動的にリフレッシュされる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // ダッシュボードに移動
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard|\/$/);

    // 現在のアクセストークンを取得
    const initialAccessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(initialAccessToken).toBeTruthy();

    // アクセストークンの有効期限を強制的に切らす（localStorageを直接操作）
    // Note: 本来は時間経過を待つが、テスト時間短縮のためモック
    await page.evaluate(() => {
      // 期限切れのトークンをセット（expクレームを過去に設定）
      const expiredToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDk0NTkyMDB9.invalid';
      localStorage.setItem('accessToken', expiredToken);
    });

    // 保護されたAPIを呼び出す（401エラーが発生してリフレッシュが走る）
    await page.goto('/profile');

    // リフレッシュが成功し、新しいトークンが発行される
    const newAccessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(newAccessToken).toBeTruthy();
    expect(newAccessToken).not.toBe(initialAccessToken);

    // プロフィールページが正常に表示される（リフレッシュ成功の証）
    await expect(page.getByText(/プロフィール/i)).toBeVisible();
  });

  /**
   * 要件16.10: 複数APIリクエストが同時に401エラーを受信した場合、単一のリフレッシュPromiseを共有
   * 要件16.12: リフレッシュ処理中、他のリクエストをキューに保持
   * 要件16.13: リフレッシュ完了後、キューの全リクエストを新トークンで再実行
   * 要件24.4: Race Condition対策
   */
  test('複数の同時APIリクエストでリフレッシュが1回のみ実行される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // リフレッシュトークンAPIの呼び出し回数をカウント
    let refreshCallCount = 0;
    await page.route('**/api/v1/auth/refresh', async (route) => {
      refreshCallCount++;
      // リフレッシュAPIを実際に実行
      await route.continue();
    });

    // アクセストークンを期限切れに設定
    await page.evaluate(() => {
      const expiredToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDk0NTkyMDB9.invalid';
      localStorage.setItem('accessToken', expiredToken);
    });

    // 複数のAPIリクエストを同時に発行
    const promises = [
      page.goto('/profile'),
      page.evaluate(() => fetch('/api/v1/auth/me')),
      page.evaluate(() => fetch('/api/v1/auth/me')),
      page.evaluate(() => fetch('/api/v1/auth/me')),
    ];

    await Promise.all(promises);

    // 要件16.10: リフレッシュAPIが1回のみ呼ばれることを確認
    expect(refreshCallCount).toBe(1);

    // 要件16.13: すべてのリクエストが新しいトークンで成功することを確認
    await expect(page.getByText(/プロフィール/i)).toBeVisible();
  });

  /**
   * 要件16.11: マルチタブ環境でBroadcast Channel APIを使用してトークン更新を通知
   */
  test('マルチタブ環境でトークン更新が全タブに同期される', async ({ context }) => {
    await createTestUser('REGULAR_USER');

    // タブ1を作成してログイン
    const page1 = await context.newPage();
    await loginAsUser(page1, 'REGULAR_USER');
    await page1.goto('/dashboard');

    // タブ2を作成（同じセッション）
    const page2 = await context.newPage();
    await page2.goto('/dashboard');

    // タブ1でアクセストークンを期限切れに設定
    await page1.evaluate(() => {
      const expiredToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDk0NTkyMDB9.invalid';
      localStorage.setItem('accessToken', expiredToken);
    });

    // タブ1でプロフィールページに移動（リフレッシュが走る）
    await page1.goto('/profile');

    // リフレッシュ完了を待機
    await expect(page1.getByText(/プロフィール/i)).toBeVisible();

    // タブ1の新しいアクセストークンを取得
    const newTokenTab1 = await page1.evaluate(() => localStorage.getItem('accessToken'));

    // 少し待機してBroadcast Channel APIの伝播を確認
    await page2.waitForTimeout(500);

    // 要件16.11: タブ2も同じトークンに更新されていることを確認
    const newTokenTab2 = await page2.evaluate(() => localStorage.getItem('accessToken'));
    expect(newTokenTab2).toBe(newTokenTab1);

    // タブ2でも新しいトークンで認証が通ることを確認
    await page2.goto('/profile');
    await expect(page2.getByText(/プロフィール/i)).toBeVisible();

    await page1.close();
    await page2.close();
  });

  /**
   * 要件5.2: リフレッシュトークンが無効または期限切れの場合に再ログインを要求
   * 要件24.5: トークンリフレッシュが連続で失敗した場合、ログイン画面へリダイレクト
   */
  test('リフレッシュトークンが無効な場合ログイン画面にリダイレクトされる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // アクセストークンとリフレッシュトークンを両方無効化
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'invalid.access.token');
      localStorage.setItem('refreshToken', 'invalid.refresh.token');
    });

    // 保護されたページにアクセス
    await page.goto('/profile');

    // 要件5.2: ログイン画面にリダイレクトされる
    await expect(page).toHaveURL(/\/login/);

    // 要件16.8: セッション有効期限切れメッセージが表示される
    await expect(page.getByText(/セッションの有効期限が切れました/i)).toBeVisible();
  });

  /**
   * 要件16.16: アクセストークンが有効期限切れに近づいた時、バックグラウンドで自動リフレッシュ
   */
  test('アクセストークン有効期限の5分前に自動リフレッシュされる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // リフレッシュAPIの呼び出しを監視
    let backgroundRefreshCalled = false;
    await page.route('**/api/v1/auth/refresh', async (route) => {
      backgroundRefreshCalled = true;
      await route.continue();
    });

    // 有効期限まで残り4分のトークンをセット（5分前の閾値を超える）
    await page.evaluate(() => {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = 4 * 60; // 4分後
      // Note: 実際の実装ではJWTペイロードに正しいexpクレームが必要
      const almostExpiredToken = `eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.${btoa(
        JSON.stringify({ exp: now + expiresIn })
      )}.signature`;
      localStorage.setItem('accessToken', almostExpiredToken);
    });

    // ダッシュボードにアクセス（バックグラウンドリフレッシュが走る）
    await page.goto('/dashboard');

    // バックグラウンドリフレッシュが実行されたことを確認
    await page.waitForTimeout(2000); // リフレッシュ処理の完了を待機
    expect(backgroundRefreshCalled).toBe(true);
  });

  /**
   * 要件16.19: 401エラー検知時にlocalStorageからアクセストークンを削除、Cookieからリフレッシュトークンを削除
   */
  test('401エラー時にトークンがクリアされる', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // 両方のトークンを無効化（リフレッシュも失敗する状況）
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'invalid.access.token');
      localStorage.setItem('refreshToken', 'invalid.refresh.token');
    });

    // Cookieにもリフレッシュトークンをセット（テスト用）
    await page.context().addCookies([
      {
        name: 'refreshToken',
        value: 'invalid.refresh.token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 保護されたページにアクセス
    await page.goto('/profile');

    // ログイン画面にリダイレクト
    await expect(page).toHaveURL(/\/login/);

    // 要件16.19: localStorageからトークンが削除されている
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();

    // Cookieからもリフレッシュトークンが削除されている
    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeUndefined();
  });

  /**
   * 要件16.7: ログイン画面へリダイレクト時に現在のページURLをクエリパラメータ（redirectUrl）として保存
   * 要件16.9: 再ログイン成功後、保存されたURLへ自動リダイレクト
   */
  test('セッション期限切れ後の再ログインで元のページに戻る', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // プロフィールページに移動
    await page.goto('/profile');
    await expect(page.getByText(/プロフィール/i)).toBeVisible();

    // セッションを無効化
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'invalid.access.token');
      localStorage.setItem('refreshToken', 'invalid.refresh.token');
    });

    // ページをリロード（401エラーが発生）
    await page.reload();

    // 要件16.7: ログイン画面にリダイレクトされ、redirectUrlパラメータが含まれる
    await expect(page).toHaveURL(/\/login.*redirectUrl=/);

    // redirectUrlパラメータを確認
    const url = new URL(page.url());
    const redirectUrl = url.searchParams.get('redirectUrl');
    expect(redirectUrl).toContain('/profile');

    // 再ログイン
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // 要件16.9: 元のページ（プロフィール）にリダイレクトされる
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText(/プロフィール/i)).toBeVisible();
  });

  /**
   * 要件16.14: ユーザーが明示的にログアウトする場合、redirectUrlパラメータを設定しない
   */
  test('明示的なログアウト時はredirectUrlパラメータが設定されない', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // ダッシュボードに移動
    await page.goto('/dashboard');

    // ログアウトボタンをクリック
    await page.getByRole('button', { name: /ログアウト/i }).click();

    // ログイン画面にリダイレクト
    await expect(page).toHaveURL(/\/login/);

    // 要件16.14: redirectUrlパラメータが含まれていない
    const url = new URL(page.url());
    expect(url.searchParams.has('redirectUrl')).toBe(false);
  });

  /**
   * 要件16.21: 開発環境ではトークン有効期限切れをコンソールにログ出力
   */
  test('開発環境でトークン期限切れがコンソールログに記録される', async ({ page }) => {
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // コンソールログを監視
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' || msg.type() === 'warning') {
        consoleLogs.push(msg.text());
      }
    });

    // アクセストークンを期限切れに設定
    await page.evaluate(() => {
      const expiredToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDk0NTkyMDB9.invalid';
      localStorage.setItem('accessToken', expiredToken);
    });

    // 保護されたページにアクセス
    await page.goto('/profile');

    // リフレッシュ処理を待機
    await page.waitForTimeout(2000);

    // 要件16.21: コンソールログにトークン期限切れが記録されている
    const hasTokenExpiredLog = consoleLogs.some(
      (log) =>
        log.includes('token') &&
        (log.includes('expired') || log.includes('期限切れ') || log.includes('refresh'))
    );

    expect(hasTokenExpiredLog).toBe(true);
  });

  /**
   * 要件16.18: Authentication Serviceが401レスポンスを返す際に、
   * WWW-Authenticate: Bearer realm="ArchiTrack", error="invalid_token"ヘッダーを含める
   */
  test('401レスポンスに正しいWWW-Authenticateヘッダーが含まれる', async ({ page }) => {
    await createTestUser('REGULAR_USER');

    // 無効なトークンでAPIリクエストを送信
    const response = await page.request.get('/api/v1/auth/me', {
      headers: {
        Authorization: 'Bearer invalid.token',
      },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);

    // 要件16.18: WWW-Authenticateヘッダーの検証
    const wwwAuth = response.headers()['www-authenticate'];
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('realm="ArchiTrack"');
    expect(wwwAuth).toContain('error="invalid_token"');
  });

  /**
   * リフレッシュトークンのHTTPOnly Cookie検証
   * 要件26.5: トークンをCookieに保存する際にHttpOnly、Secure、SameSite=Strict属性を設定
   */
  test('リフレッシュトークンがHTTPOnly Cookieで送信される', async ({ page }) => {
    await createTestUser('REGULAR_USER');

    // ログイン
    await page.goto('/login');
    await page.getByLabel(/メールアドレス/i).fill('user@example.com');
    await page.locator('input#password').fill('Password123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ログイン成功を確認
    await expect(page).toHaveURL(/\/dashboard|\/$/);

    // Cookieを取得
    const cookies = await page.context().cookies();
    const refreshTokenCookie = cookies.find((c) => c.name === 'refreshToken');

    // 要件26.5: HTTPOnly Cookie属性の検証
    expect(refreshTokenCookie).toBeTruthy();
    expect(refreshTokenCookie?.httpOnly).toBe(true);
    expect(refreshTokenCookie?.secure).toBe(true); // HTTPS環境
    expect(refreshTokenCookie?.sameSite).toBe('Strict');
  });
});

/**
 * トークンリフレッシュのパフォーマンステスト
 * 要件23.6: トークンリフレッシュAPIが95パーセンタイルで300ms以内にレスポンス
 */
test.describe('トークンリフレッシュパフォーマンス', () => {
  test('トークンリフレッシュが300ms以内に完了する', async ({ page }) => {
    await cleanDatabase();
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // リフレッシュトークンを取得
    const refreshToken = await page.evaluate(() => localStorage.getItem('refreshToken'));
    expect(refreshToken).toBeTruthy();

    // リフレッシュAPIのパフォーマンスを測定（10回実行）
    const responseTimes: number[] = [];

    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();

      await page.request.post('/api/v1/auth/refresh', {
        data: { refreshToken },
      });

      const endTime = Date.now();
      responseTimes.push(endTime - startTime);

      // レート制限を避けるため少し待機
      await page.waitForTimeout(100);
    }

    // 95パーセンタイルを計算
    responseTimes.sort((a, b) => a - b);
    const p95Index = Math.ceil(responseTimes.length * 0.95) - 1;
    const p95ResponseTime = responseTimes[p95Index]!;

    // 要件23.6: 95パーセンタイルで300ms以内
    expect(p95ResponseTime).toBeLessThanOrEqual(300);

    console.log(`Token Refresh P95: ${p95ResponseTime}ms`);
  });
});
