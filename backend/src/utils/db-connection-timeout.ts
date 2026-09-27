/**
 * データベース接続の確立がタイムアウトしたことを示すエラーの判定。
 *
 * 接続の再試行（`db.ts` の RetryingPool、要件24.6）と、再試行を使い切った失敗を
 * 503 へ対応づけるエラーハンドラー（要件24.1）が同じ判定を使う。
 * `db.ts` は多くの単体検証で丸ごとモックされるため、判定は依存の無いこのモジュールに置く。
 */

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
