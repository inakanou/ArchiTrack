/**
 * @fileoverview 許可するアプリが無い環境の app.ts の統合検証（user-authentication タスク 73.2）
 *
 * 認可の窓口を一切載せず、既存の応答を変えないことを確かめる。
 *
 * @requirement user-authentication/REQ-46.4
 */

import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OAUTH_KEYS = [
  'OAUTH_ALLOWED_CLIENTS',
  'OAUTH_ISSUER',
  'OAUTH_RESOURCE_URL',
  'OAUTH_JWKS',
  'OAUTH_COOKIE_KEYS',
  'OAUTH_TOKEN_HMAC_KEY',
] as const;

describe('app.ts への搭載（設定なし）', () => {
  let app: Express;
  const saved = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const key of OAUTH_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    ({ default: app } = await import('../../app.js'));
  });

  afterAll(() => {
    for (const [key, value] of saved) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  it.each([
    ['get', '/.well-known/oauth-authorization-server'],
    ['get', '/oauth/authorize'],
    ['get', '/oauth/authorize/abc'],
    ['post', '/oauth/token'],
    ['get', '/oauth/jwks'],
    ['get', `/oauth/interaction/${'a'.repeat(43)}`],
    ['get', `/oauth/interaction/${'a'.repeat(43)}/details`],
    ['post', `/oauth/interaction/${'a'.repeat(43)}/second-factor`],
    ['post', `/oauth/interaction/${'a'.repeat(43)}/approve`],
    ['post', `/oauth/interaction/${'a'.repeat(43)}/deny`],
    // 外部アプリ用の窓口の確認用の経路（タスク75.2）も載せない
    ['get', '/oauth/resource/whoami'],
    ['get', '/oauth/resource/whoami/write-access'],
  ] as const)('%s %s は 404 のまま', async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(404);
  });

  it('外部アプリ用の窓口は Bearer を付けても 404 で、挑戦を返さない（タスク75.2）', async () => {
    const response = await request(app)
      .get('/oauth/resource/whoami')
      .set('Authorization', 'Bearer some-token');
    expect(response.status).toBe(404);
    expect(response.headers['www-authenticate']).toBeUndefined();
  });

  // 接続の一覧と取り消し（タスク77.1）は、既にある接続を利用者と管理者が確かめて止められるよう、
  // 認可サーバーの有無にかかわらず載せる（認証を求める 401 で、404 ではない）
  it.each([
    ['get', '/api/v1/external-app-connections'],
    [
      'delete',
      `/api/v1/external-app-connections/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`,
    ],
    ['get', '/api/v1/admin/external-app-connections'],
    [
      'delete',
      `/api/v1/admin/external-app-connections/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`,
    ],
  ] as const)('接続の API の %s %s は載っていて、認証が無ければ 401', async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
  });

  it('既存の /.well-known/jwks.json は動く', async () => {
    const response = await request(app).get('/.well-known/jwks.json');
    expect(response.status).toBe(200);
  });
});
