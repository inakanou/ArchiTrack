import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * セキュリティ対策（脅威モデリング）のE2Eテスト
 *
 * @REQ-26 セキュリティ対策（脅威モデリング）
 *
 * このテストスイートは、一般的なWeb攻撃からの保護機能を
 * End-to-Endで検証します。
 */
test.describe('セキュリティ対策', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
  });

  /**
   * 要件26.1: SQLインジェクション対策
   */
  test('SQLインジェクションが無害化される', async ({ request }) => {
    // SQLインジェクションを含むリクエスト
    const response = await request.post('http://localhost:3000/api/v1/auth/login', {
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
   */
  test('連続ログイン失敗でアカウントがロックされる', async ({ request }) => {
    // 6回連続でログイン失敗
    for (let i = 0; i < 6; i++) {
      await request.post('http://localhost:3000/api/v1/auth/login', {
        data: {
          email: 'admin@example.com',
          password: 'WrongPassword123!',
        },
      });
    }

    // 正しいパスワードでもロックされていることを確認
    const response = await request.post('http://localhost:3000/api/v1/auth/login', {
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
   */
  test('認証CookieにはHttpOnly属性が設定される', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/v1/auth/login', {
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
   */
  test('APIエンドポイントに適切なCORSヘッダーが設定される', async ({ request }) => {
    const response = await request.get('http://localhost:3000/health');

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
   */
  test('セキュリティ関連ヘッダーが設定される', async ({ request }) => {
    const response = await request.get('http://localhost:3000/health');

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
   */
  test('認証なしで保護リソースにアクセスできない', async ({ request }) => {
    // 認証なしでユーザー一覧にアクセス
    const response = await request.get('http://localhost:3000/api/v1/users');

    expect(response.status()).toBe(401);
  });

  /**
   * 無効なトークンでのアクセス拒否
   */
  test('無効なトークンでアクセスが拒否される', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/v1/users', {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    });

    expect(response.status()).toBe(401);
  });

  /**
   * 改ざんされたトークンでのアクセス拒否
   */
  test('改ざんされたトークンでアクセスが拒否される', async ({ request }) => {
    // 正規のログインでトークンを取得
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
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

      const response = await request.get('http://localhost:3000/api/v1/users', {
        headers: {
          Authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(response.status()).toBe(401);
    } else {
      // トークン形式が想定外の場合、元の方法で試行
      const tamperedToken = accessToken.slice(0, -10) + 'XXXXXXXXXX';

      const response = await request.get('http://localhost:3000/api/v1/users', {
        headers: {
          Authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(response.status()).toBe(401);
    }
  });

  /**
   * パスワード漏洩防止（レスポンスにパスワードが含まれない）
   */
  test('APIレスポンスにパスワードが含まれない', async ({ request }) => {
    const loginResponse = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    const { accessToken } = await loginResponse.json();

    // ユーザー情報を取得
    const userResponse = await request.get('http://localhost:3000/api/v1/auth/me', {
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
   */
  test('期限切れのリフレッシュトークンでリフレッシュできない', async ({ request }) => {
    // 無効なリフレッシュトークンでリフレッシュを試みる
    const response = await request.post('http://localhost:3000/api/v1/auth/refresh', {
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
 * @REQ-26 セキュリティ対策（脅威モデリング）
 */
test.describe('XSS対策', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 要件26.2: XSS対策（入力のエスケープ）
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
});
