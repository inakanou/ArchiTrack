import { test, expect } from '@playwright/test';
import { cleanDatabase, cleanDatabaseAndRestoreTestData } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { getTimeout, nullWhenTimedOut } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
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
    await cleanDatabase();
    await createTestUser('ADMIN_USER');
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

    // 要件26.5: トークンを Cookie に保存する際は HttpOnly を設定する。
    // Cookie の有無で包むと、発行そのものが失われても検証が一件も実行されず緑になる。
    const setCookieHeader = response.headers()['set-cookie'];
    assertPrepared(setCookieHeader, 'REQ-26.5: ログイン応答の Set-Cookie ヘッダー');

    // HttpOnly属性が含まれていることを確認
    expect(setCookieHeader.toLowerCase()).toContain('httponly');
  });

  /**
   * 要件26.6: CORSヘッダーの設定
   * @requirement user-authentication/REQ-26.6
   */
  test('APIエンドポイントに適切なCORSヘッダーが設定される', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);

    expect(response.ok()).toBeTruthy();

    // 要件26.6: APIエンドポイントには適切な CORS ヘッダーを設定する。
    // 従来は「あれば検証」で包んだうえに、その中身も `toBeDefined()` という恒真だった。
    // 設定の有無そのものを主張し、値が CORS の許可元として成立していることまで確かめる。
    const headers = response.headers();
    const allowOrigin = headers['access-control-allow-origin'];
    expect(allowOrigin, 'REQ-26.6: Access-Control-Allow-Origin が設定されていない').toBeTruthy();
    expect(allowOrigin).toMatch(/^(\*|https?:\/\/\S+)$/);
  });

  /**
   * 要件26.10: セキュリティヘッダーの設定
   * @requirement user-authentication/REQ-26.10
   */
  test('セキュリティ関連ヘッダーが設定される', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/health`);

    expect(response.ok()).toBeTruthy();

    const headers = response.headers();

    // 要件26.10: セキュリティ関連ヘッダーは設定されていなければならない。
    // 「設定されていれば検証する」形は、設定が失われた瞬間に検証ごと消える。
    // X-Content-Type-Optionsヘッダーを確認
    expect(headers['x-content-type-options']).toBe('nosniff');

    // X-Frame-Optionsヘッダーを確認
    expect(['DENY', 'SAMEORIGIN']).toContain(headers['x-frame-options']);
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
   *
   * タスク 115.188 の是正: 従前は REQ-10.7 を名乗っていたが、受入基準10.7 の原文は「WHEN 招待トークンまたはリセットトークンを生成する
   * THEN Authentication Serviceは暗号学的に安全なランダム文字列を使用しなければならない」
   * である。本区間の表題・本文が述べる内容に対応するのは受入基準5.5（「IF アクセストークンが改ざんされている THEN Authentication
   * Serviceはリクエストを拒否しなければならない」）である。
   */
  test('改ざんされたトークンでアクセスが拒否される', async ({ request }) => {
    // 正規のログインでトークンを取得
    const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: {
        email: 'admin@example.com',
        password: 'AdminPass123!',
      },
    });
    expect(loginResponse.status()).toBe(200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    assertPrepared(accessToken, '正規ログインで取得したアクセストークン');

    // 要件5.8: アクセストークンは EdDSA 署名の JWT であり、必ず
    // header.payload.signature の3部構成になる。形式は観測して分岐する対象ではなく、
    // 崩れていればこの地点で失敗させるべき前提である。
    // 従来の `if (parts.length === 3) { … } else { … }` は、
    // 「トークンが JWT ですらない」欠陥を別経路の検証で埋め合わせて緑にしていた。
    const parts = accessToken.split('.');
    expect(parts, 'アクセストークンが header.payload.signature の3部構成でない').toHaveLength(3);

    // 署名部分を完全に異なる値に置き換える
    const tamperedSignature = 'invalid_signature_that_will_definitely_fail_verification';
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    // 要件5.5: 改ざんされたトークンによるアクセスは拒否される
    const response = await request.get(`${API_BASE_URL}/api/v1/users`, {
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
      },
    });

    expect(response.status()).toBe(401);
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
    // 事象待ちを素手の `catch` で畳むと、待機切れ以外の失敗（述語の送出・切断・
    // 本体終了による中断）まで「ダイアログは出なかった」に化ける。直下の主張は
    // 不在を求めているため、その化けは**そのまま合格になる**。
    // 待機切れのみを畳み、それ以外は送出する共有の補助を通す。
    const dialog = await nullWhenTimedOut(
      page.waitForEvent('dialog', { timeout: getTimeout(1000) })
    );

    expect(dialog).toBeNull();
  });

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after security tests...');
    await cleanDatabaseAndRestoreTestData();
    console.log('  ✓ Test data restored successfully');
  });
});
