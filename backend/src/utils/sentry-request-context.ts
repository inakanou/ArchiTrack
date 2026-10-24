import type { Request } from 'express';

/**
 * エラー監視へ付ける要求の文脈（要件42.4）
 *
 * 経路（クエリを除いたパス）・メソッド・要求識別子・利用者 ID に限り、
 * 要求本文・クエリ・パラメータ・送信元は付けない。
 */
export function sentryRequestContext(req: Request): Record<string, unknown> {
  const url = req.originalUrl ?? req.url ?? '';
  const pathEnd = url.search(/[?#]/);
  return {
    route: pathEnd === -1 ? url : url.slice(0, pathEnd),
    method: req.method,
    requestId: req.id,
    userId: req.user?.userId,
  };
}
