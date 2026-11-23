/**
 * @fileoverview 実際の app.ts への認可サーバーの搭載の統合検証（設定あり。user-authentication タスク 73.2）
 *
 * 本文の解析と CORS より前に載り、既存の経路を変えないことを確かめる。
 *
 * @requirement user-authentication/REQ-46.1
 */

import { generateKeyPairSync, randomBytes } from 'crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ISSUER = 'http://localhost:5174';
const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;

describe('app.ts への搭載（設定あり）', () => {
  let app: Express;
  const saved = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const key of OAUTH_KEYS) {
      saved.set(key, process.env[key]);
    }
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.OAUTH_ALLOWED_CLIENTS = JSON.stringify([
      {
        clientId: 'test-oauth732-app-client',
        clientSecret: randomBytes(24).toString('hex'),
        displayName: 'Test App',
        redirectUris: ['https://client.example/callback'],
      },
    ]);
    process.env.OAUTH_ISSUER = ISSUER;
    process.env.OAUTH_RESOURCE_URL = `${ISSUER}/mcp`;
    process.env.OAUTH_JWKS = JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'app-k1', use: 'sig', alg: 'RS256' }],
    });
    process.env.OAUTH_COOKIE_KEYS = JSON.stringify([randomBytes(32).toString('hex')]);
    process.env.OAUTH_TOKEN_HMAC_KEY = randomBytes(32).toString('hex');
    ({ default: app } = await import('../../app.js'));
  });

  afterAll(() => {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('メタデータが発行者のオリジンで返る', async () => {
    const response = await request(app)
      .get('/.well-known/oauth-authorization-server')
      .set('Host', 'evil.example');
    expect(response.status).toBe(200);
    expect(response.body.issuer).toBe(ISSUER);
    expect(response.body.token_endpoint).toBe(`${ISSUER}/oauth/token`);
  });

  it('既存の /.well-known/jwks.json は画面用の鍵のまま変わらない', async () => {
    const response = await request(app).get('/.well-known/jwks.json');
    expect(response.status).toBe(200);
    const kids = (response.body.keys as { kid?: string }[]).map((key) => key.kid);
    expect(kids).not.toContain('app-k1');
  });

  it('本文の解析より前に載る（フォームの本文をライブラリが読める）', async () => {
    const response = await request(app)
      .post('/oauth/token')
      .type('form')
      .set('Accept', 'application/json')
      .send({ grant_type: 'refresh_token', client_id: 'test-oauth732-app-client' });
    // 本文が読めていれば client_id を解釈して、クライアント認証の失敗になる
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid_client');
  });

  it('CORS より前に載る（アプリの CORS の許可が窓口へ付かない）', async () => {
    const response = await request(app)
      .post('/oauth/token')
      .type('form')
      .set('Origin', process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .send({ grant_type: 'refresh_token' });
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('担当でない経路は既存の処理へ渡る', async () => {
    const csrf = await request(app).get('/csrf-token');
    expect(csrf.status).toBe(200);
    const unknown = await request(app).get('/oauth/unknown');
    expect(unknown.status).toBe(404);
    const openid = await request(app).get('/.well-known/openid-configuration');
    expect(openid.status).toBe(404);
    const endSession = await request(app).post('/session/end/confirm');
    expect(endSession.status).toBe(404);
  });
});
