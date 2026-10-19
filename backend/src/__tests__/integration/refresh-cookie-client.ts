/**
 * @fileoverview 統合テストで、画面と同じ契約（Cookie と CSRF・Origin）でリフレッシュとログアウトを呼ぶ補助（タスク45.5）
 *
 * リフレッシュトークンは応答本文に含まれず（要件33.9）、`Set-Cookie` だけで渡る。リフレッシュと
 * ログアウトは本文を読まず、Cookie `refreshToken` と、CSRF の二重送信（Cookie `csrf-token` と
 * ヘッダー `X-CSRF-Token`）と、`FRONTEND_URL` の `Origin` を要する（要件33.12）。
 */

import type { Express } from 'express';
import request from 'supertest';
import { getEnv } from '../../config/env.js';

/** 応答の Set-Cookie から、指定した名前の Cookie の行を全て返す */
export function setCookieLines(response: request.Response, name: string): string[] {
  const raw = response.headers['set-cookie'] as unknown;
  const lines = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return lines.filter((line) => line.startsWith(`${name}=`));
}

/** Set-Cookie の行から値を取り出す */
export function cookieValue(line: string): string {
  return line.slice(line.indexOf('=') + 1).split(';')[0]!;
}

/** Set-Cookie の行が消去（空の値・過去の期限）かを返す */
export function isClearing(line: string): boolean {
  return cookieValue(line) === '' && /Expires=Thu, 01 Jan 1970/i.test(line);
}

/**
 * 応答の Set-Cookie から発行されたリフレッシュトークンの原文を返す（無ければ失敗させる）
 */
export function issuedRefreshToken(response: request.Response): string {
  const issued = setCookieLines(response, 'refreshToken').filter((line) => !isClearing(line));
  if (issued.length !== 1) {
    throw new Error(`リフレッシュトークンの Cookie が 1 件発行されていない（${issued.length} 件）`);
  }
  return cookieValue(issued[0]!);
}

/** 画面のオリジン（CSRF の Origin の照合で許される値） */
export function frontendOrigin(): string {
  return new URL(getEnv().FRONTEND_URL).origin;
}

/** CSRF トークンを取得する */
export async function fetchCsrfToken(app: Express): Promise<string> {
  const response = await request(app).get('/csrf-token').expect(200);
  return response.body.csrfToken as string;
}

/**
 * Cookie と CSRF・Origin でリフレッシュを呼ぶ（本文は送らない）
 */
export async function refreshWithCookie(
  app: Express,
  refreshToken: string
): Promise<request.Response> {
  const csrf = await fetchCsrfToken(app);
  return request(app)
    .post('/api/v1/auth/refresh')
    .set('Cookie', [`refreshToken=${refreshToken}`, `csrf-token=${csrf}`])
    .set('X-CSRF-Token', csrf)
    .set('Origin', frontendOrigin());
}

/**
 * Cookie と CSRF・Origin でログアウトを呼ぶ（本文は送らない）
 */
export async function logoutWithCookie(
  app: Express,
  accessToken: string,
  refreshToken: string
): Promise<request.Response> {
  const csrf = await fetchCsrfToken(app);
  return request(app)
    .post('/api/v1/auth/logout')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Cookie', [`refreshToken=${refreshToken}`, `csrf-token=${csrf}`])
    .set('X-CSRF-Token', csrf)
    .set('Origin', frontendOrigin());
}
