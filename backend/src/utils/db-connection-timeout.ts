/**
 * データベース接続の確立がタイムアウトしたことを示すエラーの判定。
 *
 * 接続の再試行（`db.ts` の RetryingPool、要件24.6）と、再試行を使い切った失敗を
 * 503 へ対応づけるエラーハンドラー（要件24.1）と、その失敗を DATABASE_ERROR へ飲み込まずに
 * 投げ直すサービス層（要件24.1）が同じ判定を使う。
 * `db.ts` は多くの単体検証で丸ごとモックされるため、判定は `db.ts` に依存しないこのモジュールに置く。
 */

import { Prisma } from '../generated/prisma/client.js';

/**
 * 接続の確立（プールからの接続の取得を含む）がタイムアウトしたことを示すエラーかを判定する。
 *
 * - `ETIMEDOUT`: OS の TCP 接続がタイムアウトした
 * - `timeout exceeded when trying to connect`: pg-pool が connectionTimeoutMillis 内に接続を渡せなかった
 * - `Connection terminated due to connection timeout`: pg-pool が接続の確立中に connectionTimeoutMillis を超えた
 */
export function isConnectionTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return true;
  }
  return (
    error.message === 'timeout exceeded when trying to connect' ||
    error.message === 'Connection terminated due to connection timeout'
  );
}

/**
 * データベース接続を確立できずタイムアウトしたことを示すエラーかを判定する（要件24.1）。
 *
 * - 接続の再試行（要件24.6）を使い切った pg-pool のタイムアウトは、Prisma から素の Error
 *   （「Connection terminated due to connection timeout」など、code・meta 無し）として届く
 * - OS の TCP 接続タイムアウト（ETIMEDOUT）は、@prisma/adapter-pg が DriverAdapterError
 *   （kind: SocketTimeout）へ包み、Prisma が P1008 の PrismaClientKnownRequestError へ変換する。
 *   syscall・errno を伴わない ETIMEDOUT はアダプタが包まず、素の Error のまま届く
 */
export function isDatabaseConnectionTimeout(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P1008';
  }
  return isConnectionTimeoutError(error);
}

/**
 * データベース接続のタイムアウトであれば、そのエラーをそのまま投げ直す（要件24.1）。
 *
 * サービス層の catch の先頭で呼ぶ。接続のタイムアウトを `DATABASE_ERROR` の Result へ飲み込むと、
 * ルートが自前の 500 を返し、エラーハンドラーの 503 へ届かないため。
 * それ以外のエラーでは何もせず、呼び出し元の既存の処理（ログと `DATABASE_ERROR`）へ戻す。
 */
export function rethrowIfDatabaseConnectionTimeout(error: unknown): void {
  if (isDatabaseConnectionTimeout(error)) {
    throw error;
  }
}
