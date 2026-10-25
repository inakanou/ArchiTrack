/**
 * @fileoverview 画面の配信元（frontend の nginx）の応答のセキュリティヘッダーの期待値と主張の補助
 *
 * user-authentication 要件44、design.md の FrontendNginxConfig の節。
 * `e2e/specs/integration/frontend-security-headers.spec.ts`（56.1。配信元へ直接要求した応答）と
 * `e2e/specs/integration/frontend-csp-screens.spec.ts`（56.2。主要画面の操作中にブラウザが受けた応答）が
 * 同じ期待値で主張するために置く。
 *
 * @module e2e/helpers/frontend-security-headers
 */

import { expect } from '@playwright/test';
import { API_BASE_URL } from '../config';

/** 応答のヘッダーの一件（`headersArray()` の要素の形） */
export interface HeaderEntry {
  name: string;
  value: string;
}

/**
 * 試験の画像の保存先のオリジンを backend のポートから組み立てる。
 *
 * 試験・CI の compose は backend の LOCAL_STORAGE_URL を `http://localhost:<backend のポート>/storage`
 * にし、frontend の CSP の img-src・connect-src の追加の取得先に同じオリジンを渡す
 * （試験は 3100、CI は 3000）。ホスト名は `API_BASE_URL` から取らない（CI の `API_BASE_URL` は
 * `127.0.0.1` で、画像の URL は `localhost` のため）。ポートが読めないときは推測せず失敗させる。
 */
export function storageOriginFromApiBaseUrl(apiBaseUrl: string): string {
  const port = new URL(apiBaseUrl).port;
  if (!port) {
    throw new Error(
      `前提: API_BASE_URL（${apiBaseUrl}）に backend のポートが明示されている（試験の画像の保存先のオリジンを組み立てるため）`
    );
  }
  return `http://localhost:${port}`;
}

/** 試験の画像の保存先のオリジン */
export const TEST_STORAGE_ORIGIN = storageOriginFromApiBaseUrl(API_BASE_URL);

/** design の HSTS の値（本番と同じ値を試験の compose が渡す） */
export const EXPECTED_HSTS = 'max-age=31536000; includeSubDomains';

/**
 * design の CSP の指示子（`${CSP_IMG_SRC_EXTRA}`・`${CSP_CONNECT_SRC_EXTRA}` に試験の保存先を入れた形）。
 * 指示子ごとに取得先の集合で比べる（順序や空白の差で赤にしない）
 */
export const EXPECTED_CSP_DIRECTIVES: Record<string, string[]> = {
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
export function parseCsp(value: string): Record<string, string[]> {
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

/** 同じ名前のヘッダーの値を全て返す（重複の検出のため） */
export function headerValues(headers: readonly HeaderEntry[], name: string): string[] {
  return headers
    .filter((header) => header.name.toLowerCase() === name.toLowerCase())
    .map((header) => header.value);
}

/** 画面の配信の応答が要件44.1・44.2 のヘッダーを持つことを主張する */
export function expectSecurityHeaders(headers: readonly HeaderEntry[], label: string): void {
  const csp = headerValues(headers, 'content-security-policy');
  expect(csp, `${label}: Content-Security-Policy が一つある`).toHaveLength(1);
  const directives = parseCsp(csp[0]!);
  expect(Object.keys(directives).sort(), `${label}: CSP の指示子が design と一致する`).toEqual(
    Object.keys(EXPECTED_CSP_DIRECTIVES).sort()
  );
  for (const [name, sources] of Object.entries(EXPECTED_CSP_DIRECTIVES)) {
    expect([...directives[name]!].sort(), `${label}: CSP の ${name}`).toEqual([...sources].sort());
  }

  expect(headerValues(headers, 'strict-transport-security'), `${label}: HSTS`).toEqual([
    EXPECTED_HSTS,
  ]);
  expect(headerValues(headers, 'x-frame-options'), `${label}: X-Frame-Options`).toEqual(['DENY']);
  expect(
    headerValues(headers, 'x-content-type-options'),
    `${label}: X-Content-Type-Options`
  ).toEqual(['nosniff']);
  expect(headerValues(headers, 'referrer-policy'), `${label}: Referrer-Policy`).toEqual([
    'no-referrer',
  ]);
  expect(headerValues(headers, 'x-xss-protection'), `${label}: X-XSS-Protection を外す`).toEqual(
    []
  );
}

/** 応答の Server が配信元の版を含まないことを主張する（要件44.3） */
export function expectServerWithoutVersion(headers: readonly HeaderEntry[], label: string): void {
  const server = headerValues(headers, 'server');
  expect(server, `${label}: Server が一つある`).toHaveLength(1);
  expect(server[0], `${label}: Server が版を含まない`).toBe('nginx');
}
