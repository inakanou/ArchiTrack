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
import { FRONTEND_BASE_URL } from '../../config';
import {
  expectSecurityHeaders as expectSecurityHeaderEntries,
  expectServerWithoutVersion as expectServerEntriesWithoutVersion,
  headerValues as headerEntryValues,
} from '../../helpers/frontend-security-headers';

/** 画面のオリジン */
const APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;

/** 応答の同じ名前のヘッダーの値を全て返す（重複の検出のため） */
function headerValues(response: APIResponse, name: string): string[] {
  return headerEntryValues(response.headersArray(), name);
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

/** 画面の配信の応答が要件44.1・44.2 のヘッダーを持つことを主張する */
function expectSecurityHeaders(response: APIResponse, label: string): void {
  expectSecurityHeaderEntries(response.headersArray(), label);
}

/** 応答の Server が配信元の版を含まないことを主張する */
function expectServerWithoutVersion(response: APIResponse, label: string): void {
  expectServerEntriesWithoutVersion(response.headersArray(), label);
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
