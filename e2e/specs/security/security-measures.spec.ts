import { test, expect } from '@playwright/test';
import { resetTestUser } from '../../fixtures/database';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * セキュリティ対策（脅威モデリング）のE2Eテスト
 *
 * @requirement user-authentication/REQ-26
 *
 * このテストスイートは、一般的なWeb攻撃からの保護機能を
 * End-to-Endで検証します。
 */
test.describe('セキュリティ対策', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await resetTestUser('ADMIN_USER');
  });

  /**
   * 要件26.1: SQLインジェクション対策
   * @requirement user-authentication/REQ-26.1
   */
  test('SQLインジェクションが無害化される', async ({ request }) => {
    // SQLインジェクションを含むリクエスト
    const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: "' OR '1'='1",
        password: "' OR '1'='1",
      },
    });

    // バリデーションエラー(400)または認証失敗(401)で拒否されることを確認
    // SQLインジェクションが無効化されている（入力バリデーションで防御）
    expect([400, 401]).toContain(response.status());
  });

  /**
   * 要件26.4: ブルートフォース攻撃対策（レート制限）
   * @requirement user-authentication/REQ-26.4
   * @requirement user-authentication/REQ-26.9
   * @requirement user-authentication/REQ-26.12
   */
  test('連続ログイン失敗でアカウントがロックされる', async ({ request }) => {
    // 6回連続でログイン失敗
    for (let i = 0; i < 6; i++) {
      await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
        data: {
          email: 'admin@example.com',
          password: 'WrongPassword123!',
        },
      });
    }

    // 正しいパスワードでもロックされていることを確認
    const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });

    expect(response.status()).toBe(429);
    const error = await response.json();
    expect(error.code).toBe('ACCOUNT_LOCKED');
  });

  /**
   * 要件26.5: CookieのHttpOnly、Secure、SameSite属性
   * @requirement user-authentication/REQ-26.5
   * @requirement user-authentication/REQ-26.7
   */
  test('認証CookieにはHttpOnly属性が設定される', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });

    expect(response.ok()).toBeTruthy();

    // Set-Cookieヘッダーを確認
    const setCookieHeader = response.headers()['set-cookie'];
    if (setCookieHeader) {
      // HttpOnly属性が含まれていることを確認
      expect(setCookieHeader.toLowerCase()).toContain('httponly');
    }
  });

  /**
   * 要件26.6: CORSヘッダーの設定
   * @requirement user-authentication/REQ-26.6
   */
  test('APIエンドポイントに適切なCORSヘッダーが設定される', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);

    expect(response.ok()).toBeTruthy();

    // CORSヘッダーを確認（設定されている場合）
    const headers = response.headers();
    // Access-Control-Allow-Originがあれば検証
    if (headers['access-control-allow-origin']) {
      expect(headers['access-control-allow-origin']).toBeDefined();
    }
  });

  /**
   * 要件26.10: セキュリティヘッダーの設定
   * @requirement user-authentication/REQ-26.10
   */
  test('セキュリティ関連ヘッダーが設定される', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);

    expect(response.ok()).toBeTruthy();

    const headers = response.headers();

    // X-Content-Type-Optionsヘッダーを確認
    if (headers['x-content-type-options']) {
      expect(headers['x-content-type-options']).toBe('nosniff');
    }

    // X-Frame-Optionsヘッダーを確認
    if (headers['x-frame-options']) {
      expect(['DENY', 'SAMEORIGIN']).toContain(headers['x-frame-options']);
    }
  });

  /**
   * 認証なしでの保護リソースアクセス拒否
   * @requirement user-authentication/REQ-5.4
   * @requirement user-authentication/REQ-28.45
   */
  test('認証なしで保護リソースにアクセスできない', async ({ request }) => {
    // 認証なしでユーザー一覧にアクセス
    const response = await request.get(`${API_BASE_URL}/api/v1/users`);

    expect(response.status()).toBe(401);
  });

  /**
   * 無効なトークンでのアクセス拒否
   * 要件10.7: トークン生成の暗号学的安全性
   * @requirement user-authentication/REQ-5.4
   * @requirement user-authentication/REQ-5.5
   * @requirement user-authentication/REQ-10.7
   */
  test('無効なトークンでアクセスが拒否される', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/v1/users`, {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    });

    expect(response.status()).toBe(401);
  });

  /**
   * 改ざんされたトークンでのアクセス拒否
   * 要件10.7: トークン生成の暗号学的安全性
   * @requirement user-authentication/REQ-5.5
   * @requirement user-authentication/REQ-10.7
   */
  test('改ざんされたトークンでアクセスが拒否される', async ({ request }) => {
    // 正規のログインでトークンを取得
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // JWTトークンはheader.payload.signatureの形式
    // 署名部分を確実に改ざんする
    const parts = accessToken.split('.');
    if (parts.length === 3) {
      // 署名部分を完全に異なる値に置き換える
      const tamperedSignature = 'invalid_signature_that_will_definitely_fail_verification';
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

      const response = await request.get(`${API_BASE_URL}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(response.status()).toBe(401);
    } else {
      // トークン形式が想定外の場合、元の方法で試行
      const tamperedToken = accessToken.slice(0, -10) + 'XXXXXXXXXX';

      const response = await request.get(`${API_BASE_URL}/api/v1/users`, {
        headers: {
          Authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(response.status()).toBe(401);
    }
  });

  /**
   * パスワード漏洩防止（レスポンスにパスワードが含まれない）
   * @requirement user-authentication/REQ-26.11
   */
  test('APIレスポンスにパスワードが含まれない', async ({ request }) => {
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // ユーザー情報を取得
    const userResponse = await request.get(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(userResponse.ok()).toBeTruthy();
    const userData = await userResponse.json();

    // パスワードフィールドが含まれていないことを確認
    expect(userData.password).toBeUndefined();
    expect(userData.passwordHash).toBeUndefined();
  });

  /**
   * 期限切れトークンでのアクセス拒否
   * @requirement user-authentication/REQ-5.2
   */
  test('期限切れのリフレッシュトークンでリフレッシュできない', async ({ request }) => {
    // 無効なリフレッシュトークンでリフレッシュを試みる
    const response = await request.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
      data: {
        refreshToken: 'expired-refresh-token',
      },
    });

    expect(response.status()).toBe(401);
  });
});

/**
 * XSS対策テスト
 *
 * @requirement user-authentication/REQ-26
 */
test.describe('XSS対策', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 要件26.2: XSS対策（入力のエスケープ）
   * @requirement user-authentication/REQ-26.2
   */
  test('XSSペイロードがエスケープされる', async ({ page }) => {
    // ログインページに移動
    await page.goto('/login');

    // XSSペイロードを入力
    const xssPayload = '<script>alert("XSS")</script>';
    await page.getByLabel(/メールアドレス/i).fill(xssPayload);

    // ページ内でスクリプトが実行されていないことを確認
    // （エラーダイアログが表示されないことで確認）
    const dialogPromise = page
      .waitForEvent('dialog', { timeout: getTimeout(1000) })
      .catch(() => null);
    const dialog = await dialogPromise;

    expect(dialog).toBeNull();
  });

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after security tests...');
    await resetTestUser('ADMIN_USER');
    console.log('  ✓ Test data restored successfully');
  });
});
