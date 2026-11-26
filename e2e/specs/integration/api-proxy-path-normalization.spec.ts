/**
 * @fileoverview 画面の配信元が API と CSRF トークンの発行の要求を、正規化の前後で経路が変わりうる形のまま
 * backend へ中継しないことの E2E テスト
 *
 * user-authentication タスク80.1。design.md「Requirements 35.8・40.13・42.10」の中継のパスの検査。
 * 試験環境の実際の nginx と backend へ要求し、中継の設定そのものを観測する。
 *
 * Requirements coverage (user-authentication):
 * - REQ-42.10: `/api/` と `/csrf-token` の要求のパスが `.`・`..` の区切り、符号化したドット・スラッシュ・
 *   バックスラッシュを含むとき、backend へ中継せず 400 で拒否する
 *
 * 観測の方針:
 * - 応答の差し替えは用いない。
 * - `node:http` で送る。Playwright の要求は URL の `..` を正規化するため。
 * - 拒む形に加え、通る形（通常の API・CSRF トークンの発行・クエリに符号化した文字を含む要求・
 *   パスに他の符号化した文字を含む要求）が backend へ届くことを確かめ、検査が中継そのものを止めて
 *   いないことを示す。
 */

import { test, expect } from '@playwright/test';
import http from 'node:http';
import { FRONTEND_BASE_URL } from '../../config';

const APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;

interface RawResponse {
  status: number;
  contentType: string;
  body: string;
}

/** パスを正規化せずに画面の配信元へ送り、遷移を追わずに応答を返す */
function send(path: string): Promise<RawResponse> {
  const origin = new URL(APP_ORIGIN);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: origin.hostname, port: origin.port, method: 'GET', path },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            contentType: String(response.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    request.on('error', reject);
    request.end();
  });
}

test.describe('API と CSRF トークンの発行の中継のパスの検査（user-authentication 80.1）', () => {
  /** @requirement user-authentication/REQ-42.10 */
  test('正規化で /api/ に入るパスと、区切りや符号化した区切り文字を含む /api/ のパスを中継しない', async () => {
    for (const path of [
      // 別の経路の名前から .. で /api/ に入る（backend では開発用の API ドキュメント画面などに当たる）
      '/docs/../api/v1/auth/me',
      '/health/../api/v1/auth/me',
      // /api/ の中の . と .. の区切り
      '/api/v1/../v1/auth/me',
      '/api/./v1/auth/me',
      '/api/v1/auth/me/..',
      // 符号化したドット・スラッシュ・バックスラッシュ（大文字小文字を問わない）
      '/api/v1/%2e%2e/v1/auth/me',
      '/api/v1/%2E%2E/v1/auth/me',
      '/api/v1%2fauth/me',
      '/api/v1%2Fauth/me',
      '/api/v1/auth%5cme',
      // 字面が /api/ でないが正規化で /api/ になる
      '/%61pi/v1/auth/me',
      '//api/v1/auth/me',
    ]) {
      const response = await send(path);
      expect(response.status, path).toBe(400);
    }
  });

  /** @requirement user-authentication/REQ-42.10 */
  test('正規化で /csrf-token になるパスを中継しない', async () => {
    for (const path of [
      '/docs/../csrf-token',
      '/csrf-token/../csrf-token',
      '/./csrf-token',
      '/%63srf-token',
      '//csrf-token',
    ]) {
      const response = await send(path);
      expect(response.status, path).toBe(400);
    }
  });

  /** @requirement user-authentication/REQ-42.10 */
  test('通常の API と CSRF トークンの発行、クエリや経路の値に符号化した文字を含む要求は backend へ届く', async () => {
    // CSRF トークンの発行（中継が無ければ SPA の index.html になる）
    const csrf = await send('/csrf-token');
    expect(csrf.status).toBe(200);
    expect(csrf.contentType).toContain('application/json');
    expect(JSON.parse(csrf.body)).toHaveProperty('csrfToken');

    // クエリの値は検査の対象にしない
    const csrfWithQuery = await send('/csrf-token?next=%2e%2e%2fapi');
    expect(csrfWithQuery.status).toBe(200);
    expect(csrfWithQuery.contentType).toContain('application/json');

    // 認証の無い API は backend が 401 の JSON を返す（中継が届いている）
    for (const path of [
      '/api/v1/auth/me',
      '/api/v1/auth/me?redirect=..%2F..%2Fdocs',
      // 経路の値の、区切り文字でない符号化した文字は拒まない
      '/api/projects/%E3%81%82',
    ]) {
      const response = await send(path);
      expect(response.status, path).toBe(401);
      expect(response.contentType, path).toContain('application/json');
    }
  });
});
