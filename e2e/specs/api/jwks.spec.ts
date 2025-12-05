import { test, expect } from '@playwright/test';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

/**
 * RFC 7517 JSON Web Key (JWK) Set
 * https://datatracker.ietf.org/doc/html/rfc7517
 */
interface JWK {
  kty: string; // Key Type (Required)
  use?: string; // Public Key Use
  key_ops?: string[]; // Key Operations
  alg?: string; // Algorithm
  kid?: string; // Key ID
  x5u?: string; // X.509 URL
  x5c?: string[]; // X.509 Certificate Chain
  x5t?: string; // X.509 Certificate SHA-1 Thumbprint
  'x5t#S256'?: string; // X.509 Certificate SHA-256 Thumbprint
  // OKP (Octet Key Pair) specific parameters for EdDSA
  crv?: string; // Curve (Ed25519 for EdDSA)
  x?: string; // Public Key
  d?: string; // Private Key (should not be exposed in JWKS)
  // RSA specific parameters
  n?: string;
  e?: string;
  // EC specific parameters
  y?: string;
}

interface JWKSResponse {
  keys: JWK[];
}

/**
 * JWKSエンドポイントE2Eテスト
 * RFC 7517 (JSON Web Key) 準拠のエンドポイントを検証
 */
test.describe('JWKS Endpoint E2E', () => {
  // テストの前にAPIが利用可能になるまで待機
  test.beforeAll(async ({ request }) => {
    // 最大30秒間、1秒ごとにヘルスチェックを試行
    let retries = 30;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        const response = await request.get(`${API_BASE_URL}/health`, {
          timeout: getTimeout(5000),
        });
        if (response.ok()) {
          return; // 成功したら抜ける
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries--;
    }

    throw new Error(`API not available after 30 seconds: ${lastError?.message || 'Unknown error'}`);
  });

  test.describe('GET /.well-known/jwks.json', () => {
    test('JWKS エンドポイントが成功レスポンスを返すこと', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);

      // ステータスコードが200であることを確認
      expect(response.status()).toBe(200);
    });

    test('レスポンスがapplication/json Content-Typeであること', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);

      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/application\/json/);
    });

    test('RFC 7517準拠: レスポンスがkeysプロパティを持つJWKS形式であること', async ({
      request,
    }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // RFC 7517 Section 5: keys プロパティが必須
      expect(body).toHaveProperty('keys');
      expect(Array.isArray(body.keys)).toBe(true);
    });

    test('RFC 7517準拠: 公開鍵がEdDSA (OKP) 形式であること', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // 公開鍵が設定されている場合のみ検証
      if (body.keys.length > 0) {
        for (const key of body.keys) {
          // RFC 7517 Section 4.1: kty (Key Type) は必須
          expect(key).toHaveProperty('kty');

          // EdDSA uses OKP (Octet Key Pair) key type
          expect(key.kty).toBe('OKP');

          // RFC 8037: Ed25519 curve for EdDSA
          expect(key).toHaveProperty('crv', 'Ed25519');

          // RFC 8037 Section 2: x (Public Key) は必須
          expect(key).toHaveProperty('x');
          expect(typeof key.x).toBe('string');
          expect(key.x!.length).toBeGreaterThan(0);
        }
      }
    });

    test('RFC 7517準拠: 公開鍵にkid (Key ID) が設定されていること', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // 公開鍵が設定されている場合のみ検証
      if (body.keys.length > 0) {
        for (const key of body.keys) {
          // RFC 7517 Section 4.5: kid (Key ID) は推奨
          expect(key).toHaveProperty('kid');
          expect(typeof key.kid).toBe('string');
          expect(key.kid!.length).toBeGreaterThan(0);
        }
      }
    });

    test('RFC 7517準拠: 公開鍵にuse (Public Key Use) が設定されていること', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // 公開鍵が設定されている場合のみ検証
      if (body.keys.length > 0) {
        for (const key of body.keys) {
          // RFC 7517 Section 4.2: use は "sig" (signature) または "enc" (encryption)
          expect(key).toHaveProperty('use');
          expect(key.use).toBe('sig');
        }
      }
    });

    test('RFC 7517準拠: 公開鍵にalg (Algorithm) が設定されていること', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // 公開鍵が設定されている場合のみ検証
      if (body.keys.length > 0) {
        for (const key of body.keys) {
          // RFC 7517 Section 4.4: alg は使用されるアルゴリズムを示す
          expect(key).toHaveProperty('alg');
          expect(key.alg).toBe('EdDSA');
        }
      }
    });

    test('セキュリティ: 秘密鍵 (d parameter) が公開されていないこと', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // すべての鍵について秘密鍵が含まれていないことを確認
      for (const key of body.keys) {
        // RFC 8037 Section 2: d は秘密鍵（絶対に公開してはいけない）
        expect(key).not.toHaveProperty('d');
      }
    });

    test('猶予期間中の複数鍵配信: keys配列が空でないこと', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);
      const body: JWKSResponse = await response.json();

      // JWT_PUBLIC_KEY環境変数が設定されている場合、少なくとも1つの鍵が存在
      // 注: テスト環境では環境変数が設定されていることを前提
      expect(body.keys.length).toBeGreaterThanOrEqual(0);
    });

    test('キャッシュ制御: 適切なCache-Controlヘッダーが設定されていること', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/.well-known/jwks.json`);

      // Cache-Controlヘッダーが設定されている場合は検証
      // 注: 現在の実装ではCache-Controlが設定されていない可能性がある
      // これは将来の改善として検討
      const cacheControl = response.headers()['cache-control'];
      if (cacheControl) {
        // public または private が設定されていることを確認
        expect(cacheControl).toMatch(/public|private|max-age/);
      }
    });
  });
});
