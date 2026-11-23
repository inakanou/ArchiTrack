/**
 * @fileoverview 公開オリジンから認可サーバーへ届く中継の E2E テスト
 *
 * user-authentication タスク73.4。design.md「Requirements 46-51」の Existing Architecture Analysis と
 * OAuthProviderHost の節。試験環境の実際の nginx と backend へ要求し、中継の設定そのものを観測する。
 *
 * Requirements coverage (user-authentication):
 * - REQ-46.1: 許可したアプリが公開オリジンの認可の経路（メタデータ・認可・トークン）へ届く
 *
 * 観測の方針:
 * - 応答の差し替えは用いない。
 * - `node:http` で送る。Playwright の要求は URL の `..` を正規化し、Host の偽装も確かめにくいため。
 * - 遷移は追わない（`Location` の値そのものが検証の対象）。
 */

import { test, expect } from '@playwright/test';
import http from 'node:http';
import { FRONTEND_BASE_URL } from '../../config';
import {
  expectSecurityHeaders,
  expectServerWithoutVersion,
  headerValues,
  type HeaderEntry,
} from '../../helpers/frontend-security-headers';

const APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;
const METADATA_PATH = '/.well-known/oauth-authorization-server';

/** docker-compose.test.yml・docker-compose.ci.yml の試験用のアプリ */
const CLIENT_ID = 'architrack-test-client';
const REDIRECT_URI = 'http://127.0.0.1:4999/oauth/callback';
const RESOURCE_URL = `${APP_ORIGIN}/mcp`;
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

/** nginx の本文の上限（64KB）を超える大きさ */
const OVERSIZED_BODY_BYTES = 70 * 1024;
/** 中継の既定の応答ヘッダーの緩衝（4KB）を超える `state` の長さ */
const LONG_STATE_LENGTH = 6000;

interface RawResponse {
  status: number;
  headers: HeaderEntry[];
  body: string;
}

/** パスを正規化せずに画面の配信元へ送り、遷移を追わずに応答を返す */
function send(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {}
): Promise<RawResponse> {
  const origin = new URL(APP_ORIGIN);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: origin.hostname,
        port: origin.port,
        method,
        path,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const headers: HeaderEntry[] = [];
          for (let i = 0; i < response.rawHeaders.length; i += 2) {
            headers.push({ name: response.rawHeaders[i]!, value: response.rawHeaders[i + 1]! });
          }
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    request.on('error', reject);
    request.end(options.body);
  });
}

function header(response: RawResponse, name: string): string {
  const values = headerValues(response.headers, name);
  expect(values, `${name} が一つある`).toHaveLength(1);
  return values[0]!;
}

function authorizePath(overrides: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  const entries: Record<string, string | undefined> = {
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'read',
    state: 'state-value',
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    resource: RESOURCE_URL,
    ...overrides,
  };
  for (const [name, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(name, value);
  }
  return `/oauth/authorize?${params.toString()}`;
}

function tokenBody(): string {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code: 'not-a-real-code',
    client_id: CLIENT_ID,
    client_secret: 'wrong-secret',
    redirect_uri: REDIRECT_URI,
    code_verifier: 'not-a-real-verifier-not-a-real-verifier-0000',
  }).toString();
}

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

test.describe('公開オリジンから認可の経路への中継（user-authentication 73.4）', () => {
  /** @requirement user-authentication/REQ-46.1 */
  test('メタデータの発行者とエンドポイントが公開オリジンになり、偽の Host と転送ヘッダーで変わらない', async () => {
    const expected = {
      issuer: APP_ORIGIN,
      authorization_endpoint: `${APP_ORIGIN}/oauth/authorize`,
      token_endpoint: `${APP_ORIGIN}/oauth/token`,
      jwks_uri: `${APP_ORIGIN}/oauth/jwks`,
    };

    const plain = await send('GET', METADATA_PATH);
    expect(plain.status).toBe(200);
    expect(header(plain, 'content-type')).toContain('application/json');
    expect(JSON.parse(plain.body)).toMatchObject(expected);
    expectSecurityHeaders(plain.headers, METADATA_PATH);
    expectServerWithoutVersion(plain.headers, METADATA_PATH);

    const forged = await send('GET', METADATA_PATH, {
      headers: {
        Host: 'attacker.example',
        'X-Forwarded-Host': 'attacker.example',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Port': '8443',
        'X-Forwarded-Prefix': '/evil',
        Forwarded: 'host=attacker.example;proto=https',
      },
    });
    expect(forged.status).toBe(200);
    expect(JSON.parse(forged.body)).toMatchObject(expected);
    expect(forged.body).not.toContain('attacker.example');
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('認可の要求が認可サーバーへ届き、同意の URL が公開オリジンのまま Cookie の属性も保たれる', async () => {
    const response = await send('GET', authorizePath());
    expect(response.status).toBe(303);

    const location = new URL(header(response, 'location'), APP_ORIGIN);
    expect(location.origin).toBe(APP_ORIGIN);
    const uid = location.pathname.match(/^\/oauth\/interaction\/([A-Za-z0-9_-]+)$/)?.[1];
    expect(uid, '同意の URL が /oauth/interaction/:uid である').toBeTruthy();

    const cookies = headerValues(response.headers, 'set-cookie');
    const interaction = cookies.find((cookie) => cookie.startsWith('_interaction='));
    const resume = cookies.find((cookie) => cookie.startsWith('_interaction_resume='));
    expect(interaction, '手続きの Cookie').toBeDefined();
    expect(resume, '再開の Cookie').toBeDefined();
    expect(interaction!.toLowerCase()).toContain(`path=/oauth/interaction/${uid}`.toLowerCase());
    expect(resume!.toLowerCase()).toContain(`path=/oauth/authorize/${uid}`.toLowerCase());
    for (const cookie of [interaction!, resume!]) {
      expect(cookie.toLowerCase()).toContain('httponly');
      expect(cookie.toLowerCase()).toContain('samesite=lax');
      expect(cookie.toLowerCase()).not.toContain('domain=');
    }
    expectSecurityHeaders(response.headers, '/oauth/authorize');
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('アプリの戻り先への遷移を書き換えず、長い state でも中継が失敗しない', async () => {
    // `..` を含める: パスの検査がクエリの値を対象にしないことも確かめる
    const state = 'a..'.repeat(LONG_STATE_LENGTH / 3);
    const response = await send(
      'GET',
      authorizePath({ code_challenge: undefined, code_challenge_method: undefined, state })
    );
    expect(response.status).toBe(303);

    const location = new URL(header(response, 'location'));
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('state')).toBe(state);
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('不正なアプリの要求は認可サーバーのエラー画面になり、値を反映しない', async () => {
    const response = await send('GET', authorizePath({ client_id: 'unknown<script>' }));
    expect(response.status).toBe(400);
    expect(response.body).toContain('接続できませんでした');
    expect(response.body).not.toContain('unknown');
    expect(headerValues(response.headers, 'location')).toEqual([]);
    expectSecurityHeaders(response.headers, '/oauth/authorize のエラー');
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('トークンの要求が認可サーバーへ届き、応答が保存されない', async () => {
    const response = await send('POST', '/oauth/token', {
      headers: FORM_HEADERS,
      body: tokenBody(),
    });
    expect(response.status).toBe(401);
    expect(header(response, 'content-type')).toContain('application/json');
    expect(JSON.parse(response.body)).toMatchObject({ error: 'invalid_client' });
    expect(headerValues(response.headers, 'cache-control')).toEqual(['no-store']);
    expectSecurityHeaders(response.headers, '/oauth/token');
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('トークンの要求の本文の上限を超えると backend へ渡さない', async () => {
    const response = await send('POST', '/oauth/token', {
      headers: FORM_HEADERS,
      body: `${tokenBody()}&padding=${'a'.repeat(OVERSIZED_BODY_BYTES)}`,
    });
    expect(response.status).toBe(413);
    expectServerWithoutVersion(response.headers, '/oauth/token の 413');
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('担当でない /oauth/ の経路は SPA や静的ファイルにならず backend が 404 を返す', async () => {
    const index = await send('GET', '/');
    for (const [method, path] of [
      ['GET', '/oauth/not-a-route'],
      ['GET', '/oauth/not-a-route.js'],
      ['POST', '/oauth/authorize'],
    ] as const) {
      const response = await send(method, path);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(response.body, `${method} ${path} が SPA でない`).not.toBe(index.body);
      expect(header(response, 'content-type'), `${method} ${path}`).toContain('application/json');
    }

    // 同意の URL（タスク74）は backend の経路なので、SPA へ振り替えない
    const interaction = await send('GET', '/oauth/interaction/abc');
    expect(interaction.body).not.toBe(index.body);
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('正規化で /oauth/ に入るパスを、元の形のまま backend の別の経路へ渡さない', async () => {
    for (const path of [
      '/docs/../oauth/authorize',
      '/health/../oauth/token',
      '/%6fauth/authorize',
      '//oauth/authorize',
      '/oauth/authorize/../token',
      '/oauth/%2e%2e/oauth/token',
    ]) {
      const response = await send('GET', path);
      expect(response.status, path).toBe(400);
    }

    // メタデータは固定のパスで中継するので、元の形が backend へ届かない
    const dotted = await send('GET', `/docs/..${METADATA_PATH}`);
    expect(dotted.status).toBe(200);
    expect(JSON.parse(dotted.body)).toMatchObject({ issuer: APP_ORIGIN });
  });

  /** @requirement user-authentication/REQ-46.1 */
  test('メタデータ以外の /.well-known/ は中継せず、jwks.json と SPA・静的ファイルの配信が変わらない', async () => {
    const index = await send('GET', '/');
    expect(index.status).toBe(200);
    expect(header(index, 'content-type')).toContain('text/html');

    for (const path of [
      '/.well-known/jwks.json',
      '/.well-known/openid-configuration',
      `${METADATA_PATH}/`,
      `${METADATA_PATH}/extra`,
      '/dashboard',
    ]) {
      const response = await send('GET', path);
      expect(response.status, path).toBe(200);
      expect(header(response, 'content-type'), path).toContain('text/html');
      expect(response.body, `${path} が SPA の index.html である`).toBe(index.body);
      expectSecurityHeaders(response.headers, path);
    }

    const asset = await send('GET', '/favicon.svg');
    expect(asset.status).toBe(200);
    expect(header(asset, 'content-type')).toContain('image/svg+xml');
    expect(headerValues(asset.headers, 'cache-control')).toContain('public, immutable');
  });
});
