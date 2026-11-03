/**
 * @fileoverview 送信元 IP の識別（ClientIpResolver）
 *
 * 送信元は、信頼する中継の段数（`TRUST_PROXY_HOPS`）を `trust proxy` に与えた Express の
 * `req.ip` だけで決める。利用者が自由に付けられる `X-Forwarded-For`・`X-Real-IP` を直接読むと、
 * 要求ごとに値を変えて回数制限を回避でき、監査ログの IP も偽装できる（要件35.1、35.2）。
 * 回数制限・監査ログ・セキュリティログは送信元をこのモジュールの `getClientIp` からだけ得る。
 */

import type { Express, Request } from 'express';

/** 中継の段数が未設定のときの既定（開発・試験。中継を一段も信頼しない） */
export const DEFAULT_TRUST_PROXY_HOPS = 0;

/**
 * `trust proxy` を信頼する中継の段数の数値に設定する（全面的な信頼 `true` にしない）
 *
 * 段数 N のとき、`X-Forwarded-For` の末尾から N 段（信頼する中継が付けた値）だけを読み、
 * 利用者が先頭に足した値は送信元にしない。
 *
 * @param app 設定するアプリ
 * @param hops 検証済みの `TRUST_PROXY_HOPS`（未設定なら undefined）
 */
export function configureTrustProxy(app: Express, hops: number | undefined): void {
  app.set('trust proxy', hops ?? DEFAULT_TRUST_PROXY_HOPS);
}

/**
 * 要求の送信元 IP を返す（回数制限の識別、監査ログ・セキュリティログの記録に用いる）
 *
 * @param req Express の要求
 * @returns `req.ip`。得られないときは `unknown`
 */
export function getClientIp(req: Pick<Request, 'ip'>): string {
  return req.ip || 'unknown';
}
