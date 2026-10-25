/**
 * @fileoverview 画面と静的ファイルの応答のセキュリティヘッダーの E2E テスト
 *
 * user-authentication タスク56.1。design.md の FrontendNginxConfig の節。試験環境の画面の配信元
 * （本番と同じ nginx のイメージ）へ実際に要求し、HTML・JS・画像の各応答のヘッダーを観測する。
 * 試験の compose は `NGINX_HSTS_VALUE` を本番と同じ値にするため、HSTS もここで観測できる
 * （HTTP の応答の HSTS はブラウザが無視するので試験の動作に影響しない）。
 * 主要画面の CSP の違反の有無は 56.2 で主張する。
 *
 * Requirements (user-authentication):
 * - REQ-44.1: 画面（HTML）・JS・画像の各応答が、読み込み元を本システムと必要な外部サービスに限る
 *   Content-Security-Policy（design の指示子と、試験の画像の保存先を足した img-src・connect-src）を持つ
 * - REQ-44.2: 同じ各応答が Strict-Transport-Security・X-Frame-Options・X-Content-Type-Options・
 *   Referrer-Policy を design の値で一つずつ持つ
 * - REQ-44.3: 同じ各応答と API の中継の応答の `Server` が配信元の版を含まない
 *
 * 観測の方針:
 * - 応答の差し替え（`page.route`）は用いない。nginx の設定そのものを検証するため、実際の応答を観測する。
 * - 静的ファイルは nginx の location ごとに付け方が異なる（`add_header` を持つ location はサーバーの
 *   階層のヘッダーを継承しない）ため、location の異なる応答を一つずつ対象にする: HTML（`/`）、
 *   SPA の経路（`/dashboard`。index.html への振り替え）、JS（`.js`）、`.mjs`（pdf.js の worker）、画像（`.svg`）。
 * - JS と `.mjs` のパスは配信された index.html と JS の本文から読む（ビルドのたびにハッシュが変わるため）。
 */

import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { API_BASE_URL, FRONTEND_BASE_URL } from '../../config';

/** 画面のオリジン */
const APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;

/**
 * 試験の画像の保存先のオリジンを backend のポートから組み立てる。
 *
 * 試験・CI の compose は backend の LOCAL_STORAGE_URL を `http://localhost:<backend のポート>/storage`
 * にし、frontend の CSP の img-src・connect-src の追加の取得先に同じオリジンを渡す
 * （試験は 3100、CI は 3000）。ホスト名は `API_BASE_URL` から取らない（CI の `API_BASE_URL` は
 * `127.0.0.1` で、画像の URL は `localhost` のため）。ポートが読めないときは推測せず失敗させる。
 */
function storageOriginFromApiBaseUrl(apiBaseUrl: string): string {
  const port = new URL(apiBaseUrl).port;
  if (!port) {
    throw new Error(
      `前提: API_BASE_URL（${apiBaseUrl}）に backend のポートが明示されている（試験の画像の保存先のオリジンを組み立てるため）`
    );
  }
  return `http://localhost:${port}`;
}

const TEST_STORAGE_ORIGIN = storageOriginFromApiBaseUrl(API_BASE_URL);

/** design の HSTS の値（本番と同じ値を試験の compose が渡す） */
const EXPECTED_HSTS = 'max-age=31536000; includeSubDomains';

/**
 * design の CSP の指示子（`${CSP_IMG_SRC_EXTRA}`・`${CSP_CONNECT_SRC_EXTRA}` に試験の保存先を入れた形）。
 * 指示子ごとに取得先の集合で比べる（順序や空白の差で赤にしない）
 */
const EXPECTED_CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:', TEST_STORAGE_ORIGIN],
  'connect-src': [
    "'self'",
    'blob:',
    'data:',
    'https://cdn.jsdelivr.net',
    'https://tessdata.projectnaptha.com',
    TEST_STORAGE_ORIGIN,
  ],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

/** CSP の値を指示子ごとの取得先の配列にする */
function parseCsp(value: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift();
    if (!name) continue;
    expect(directives[name], `CSP の指示子 ${name} が重複していない`).toBeUndefined();
    directives[name] = tokens;
  }
  return directives;
}

/** 応答の同じ名前のヘッダーの値を全て返す（重複の検出のため） */
function headerValues(response: APIResponse, name: string): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === name.toLowerCase())
    .map((header) => header.value);
}

/** 画面の配信元から取得し、200 であることを確かめる */
async function fetchFromFrontend(request: APIRequestContext, path: string): Promise<APIResponse> {
  const response = await request.get(`${APP_ORIGIN}${path}`, { maxRedirects: 0 });
  expect(response.status(), `${path} の応答が 200 である`).toBe(200);
  return response;
}

/** 配信された index.html から JS のエントリのパスを読む */
async function readEntryScriptPath(request: APIRequestContext): Promise<string> {
  const html = await (await fetchFromFrontend(request, '/')).text();
  const match = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/);
  expect(match, '前提: index.html が /assets/ の JS を読み込む').not.toBeNull();
  return match![1]!;
}

/** 配信された JS から pdf.js の worker（.mjs）のパスを読む */
async function readWorkerModulePath(request: APIRequestContext): Promise<string> {
  const entryPath = await readEntryScriptPath(request);
  const entry = await (await fetchFromFrontend(request, entryPath)).text();
  // worker の参照はエントリか遅延読み込みの塊にあるため、エントリが読み込む塊も順に探す
  const candidates = [entry];
  for (const chunk of entry.matchAll(/assets\/[A-Za-z0-9_.-]+\.js/g)) {
    candidates.push(await (await fetchFromFrontend(request, `/${chunk[0]}`)).text());
  }
  for (const source of candidates) {
    const worker = source.match(/assets\/pdf\.worker[A-Za-z0-9_.-]*\.mjs/);
    if (worker) return `/${worker[0]}`;
  }
  throw new Error('前提: 配信された JS が pdf.js の worker（.mjs）を参照する');
}

/** 画面の配信の応答が要件44.1〜44.3 のヘッダーを持つことを主張する */
function expectSecurityHeaders(response: APIResponse, label: string): void {
  const csp = headerValues(response, 'content-security-policy');
  expect(csp, `${label}: Content-Security-Policy が一つある`).toHaveLength(1);
  const directives = parseCsp(csp[0]!);
  expect(Object.keys(directives).sort(), `${label}: CSP の指示子が design と一致する`).toEqual(
    Object.keys(EXPECTED_CSP_DIRECTIVES).sort()
  );
  for (const [name, sources] of Object.entries(EXPECTED_CSP_DIRECTIVES)) {
    expect([...directives[name]!].sort(), `${label}: CSP の ${name}`).toEqual([...sources].sort());
  }

  expect(headerValues(response, 'strict-transport-security'), `${label}: HSTS`).toEqual([
    EXPECTED_HSTS,
  ]);
  expect(headerValues(response, 'x-frame-options'), `${label}: X-Frame-Options`).toEqual(['DENY']);
  expect(
    headerValues(response, 'x-content-type-options'),
    `${label}: X-Content-Type-Options`
  ).toEqual(['nosniff']);
  expect(headerValues(response, 'referrer-policy'), `${label}: Referrer-Policy`).toEqual([
    'no-referrer',
  ]);
  expect(headerValues(response, 'x-xss-protection'), `${label}: X-XSS-Protection を外す`).toEqual(
    []
  );
}

/** 応答の Server が配信元の版を含まないことを主張する */
function expectServerWithoutVersion(response: APIResponse, label: string): void {
  const server = headerValues(response, 'server');
  expect(server, `${label}: Server が一つある`).toHaveLength(1);
  expect(server[0], `${label}: Server が版を含まない`).toBe('nginx');
}

test.describe('画面と静的ファイルの応答のセキュリティヘッダー（user-authentication 56.1）', () => {
  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   */
  test('HTML の応答（/ と SPA の経路）が CSP・HSTS・枠の拒否・型の固定・参照元の抑止を持ち、版を出さない', async ({
    request,
  }) => {
    for (const path of ['/', '/dashboard']) {
      const response = await fetchFromFrontend(request, path);
      expect(response.headers()['content-type'], `前提: ${path} が HTML である`).toContain(
        'text/html'
      );
      expectSecurityHeaders(response, path);
      expectServerWithoutVersion(response, path);
    }
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   */
  test('JS の応答（.js と pdf.js の worker の .mjs）が同じヘッダーを持ち、キャッシュの指定も残る', async ({
    request,
  }) => {
    const entryPath = await readEntryScriptPath(request);
    const workerPath = await readWorkerModulePath(request);
    for (const path of [entryPath, workerPath]) {
      const response = await fetchFromFrontend(request, path);
      expect(response.headers()['content-type'], `前提: ${path} が JS である`).toContain(
        'javascript'
      );
      expectSecurityHeaders(response, path);
      expectServerWithoutVersion(response, path);
      // 静的ファイルの location の add_header（長期キャッシュ）がヘッダーの取り込みで失われていない
      // （expires の max-age と add_header の public, immutable の二つの Cache-Control が付く）
      expect(headerValues(response, 'cache-control'), `${path}: Cache-Control`).toContain(
        'public, immutable'
      );
    }
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   */
  test('画像の応答（/favicon.svg）が同じヘッダーを持ち、版を出さない', async ({ request }) => {
    const response = await fetchFromFrontend(request, '/favicon.svg');
    expect(response.headers()['content-type'], '前提: 画像である').toContain('image/svg+xml');
    expectSecurityHeaders(response, '/favicon.svg');
    expectServerWithoutVersion(response, '/favicon.svg');
  });

  /**
   * @requirement user-authentication/REQ-44.3
   */
  test('API の中継の応答（/csrf-token）の Server も版を含まず、ヘッダーが重複しない', async ({
    request,
  }) => {
    const response = await fetchFromFrontend(request, '/csrf-token');
    expect(response.headers()['content-type'], '前提: backend の JSON である').toContain(
      'application/json'
    );
    expectServerWithoutVersion(response, '/csrf-token');
    // backend（helmet）と nginx の両方が付けると同じ名前のヘッダーが二つになる
    for (const name of [
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'strict-transport-security',
    ]) {
      expect(headerValues(response, name), `/csrf-token: ${name} が一つだけある`).toHaveLength(1);
    }
  });

  test('可視化の統計（stats.html）を配信しない', async ({ request }) => {
    const response = await request.get(`${APP_ORIGIN}/stats.html`, { maxRedirects: 0 });
    // SPA の振り替えで index.html が返るか 404 になる。どちらでも統計の本文は含まない
    const body = await response.text();
    expect(body, '統計（rollup-plugin-visualizer の出力）の本文を含まない').not.toContain(
      '<title>Rollup Visualizer</title>'
    );
  });
});
