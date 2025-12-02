// backend/src/__tests__/unit/routes/jwks.routes.test.ts
import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll } from 'vitest';
import * as jose from 'jose';
import jwksRouter from '../../../routes/jwks.routes.js';

describe('JWKS Endpoint', () => {
  let app: express.Application;

  beforeAll(async () => {
    // テスト用EdDSA鍵ペアを生成
    const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA');
    const publicJWK = await jose.exportJWK(publicKey);
    const privateJWK = await jose.exportJWK(privateKey);

    // Key ID設定
    const kid = 'test-eddsa-key';
    publicJWK.kid = kid;
    privateJWK.kid = kid;
    publicJWK.use = 'sig';
    publicJWK.alg = 'EdDSA';

    // 環境変数に設定
    const publicKeyBase64 = Buffer.from(JSON.stringify(publicJWK)).toString('base64');
    process.env.JWT_PUBLIC_KEY = publicKeyBase64;

    // Expressアプリケーション設定
    app = express();
    app.use('/.well-known', jwksRouter);
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/.well-known/jwks.json');
      expect(response.status).toBe(200);
    });

    it('should return JSON with keys array', async () => {
      const response = await request(app).get('/.well-known/jwks.json');
      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
    });

    it('should include public key in JWK format', async () => {
      const response = await request(app).get('/.well-known/jwks.json');
      const { keys } = response.body;

      expect(keys.length).toBeGreaterThan(0);

      const publicKey = keys[0];
      expect(publicKey).toHaveProperty('kty', 'OKP'); // EdDSA uses OKP (Octet Key Pair)
      expect(publicKey).toHaveProperty('use', 'sig'); // Signature use
      expect(publicKey).toHaveProperty('alg', 'EdDSA'); // EdDSA algorithm
      expect(publicKey).toHaveProperty('kid'); // Key ID
      expect(publicKey).toHaveProperty('crv', 'Ed25519'); // Ed25519 curve
      expect(publicKey).toHaveProperty('x'); // Public key coordinate
    });

    it('should not include private key (d parameter)', async () => {
      const response = await request(app).get('/.well-known/jwks.json');
      const { keys } = response.body;

      keys.forEach((key: jose.JWK) => {
        expect(key).not.toHaveProperty('d'); // Private key must not be exposed
      });
    });

    it('should set correct Content-Type header', async () => {
      const response = await request(app).get('/.well-known/jwks.json');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should include old public key when JWT_PUBLIC_KEY_OLD is set', async () => {
      // 旧公開鍵を設定
      const { publicKey: oldPublicKey } = await jose.generateKeyPair('EdDSA');
      const oldPublicJWK = await jose.exportJWK(oldPublicKey);
      oldPublicJWK.kid = 'old-eddsa-key';
      oldPublicJWK.use = 'sig';
      oldPublicJWK.alg = 'EdDSA';

      const oldPublicKeyBase64 = Buffer.from(JSON.stringify(oldPublicJWK)).toString('base64');
      process.env.JWT_PUBLIC_KEY_OLD = oldPublicKeyBase64;

      const response = await request(app).get('/.well-known/jwks.json');
      const { keys } = response.body;

      // 現在の鍵と旧鍵の両方が含まれていることを確認
      expect(keys.length).toBe(2);
      expect(keys[0].kid).toBe('test-eddsa-key'); // 現在の鍵
      expect(keys[1].kid).toBe('old-eddsa-key'); // 旧鍵

      // クリーンアップ
      delete process.env.JWT_PUBLIC_KEY_OLD;
    });

    it('should return 500 error when JWT_PUBLIC_KEY is invalid', async () => {
      // 無効なBase64文字列を設定してエラーを発生させる
      const originalKey = process.env.JWT_PUBLIC_KEY;
      process.env.JWT_PUBLIC_KEY = 'invalid-base64-!!@@##';

      // 新しいアプリケーションインスタンスを作成（エラーをトリガーするため）
      const testApp = express();
      testApp.use('/.well-known', jwksRouter);

      const response = await request(testApp).get('/.well-known/jwks.json');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal server error');

      // 元の値に戻す
      process.env.JWT_PUBLIC_KEY = originalKey;
    });

    it('should return empty keys array when JWT_PUBLIC_KEY is not set', async () => {
      // JWT_PUBLIC_KEYを削除
      const originalKey = process.env.JWT_PUBLIC_KEY;
      delete process.env.JWT_PUBLIC_KEY;

      // 新しいアプリケーションインスタンスを作成
      const testApp = express();
      testApp.use('/.well-known', jwksRouter);

      const response = await request(testApp).get('/.well-known/jwks.json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('keys');
      expect(response.body.keys).toEqual([]); // 空の配列

      // 元の値に戻す
      process.env.JWT_PUBLIC_KEY = originalKey;
    });
  });
});
