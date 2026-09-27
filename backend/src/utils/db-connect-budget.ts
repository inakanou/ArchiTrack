/**
 * データベース接続の確立にかかりうる時間（再試行の予算）と、それを踏まえた対話型トランザクションの設定。
 *
 * 接続の再試行（`db.ts` の RetryingPool、要件24.6）と、認証系のサービスの対話型トランザクション（要件24.1）が
 * 同じ間隔の列と予算を使う。`db.ts` は多くの単体検証で丸ごとモックされるため、ここは `db.ts` に依存しない。
 */

import { parseDatabaseConnectionTimeout, parseDatabaseRetryCount } from '../config/env.js';

/** 1 回目の再試行までの待ち時間（ミリ秒）。n 回目は 1000 × 2^(n−1) ms へ倍々に延ばす */
export const DB_CONNECT_RETRY_BASE_DELAY_MS = 1000 as const;

/**
 * Prisma の対話型トランザクションの `maxWait` の既定値（ミリ秒）。
 * 接続がすぐに得られるときに、トランザクションの開始（BEGIN）を待つ時間として使う。
 */
export const PRISMA_DEFAULT_TRANSACTION_MAX_WAIT_MS = 2000 as const;

/**
 * 再試行回数から、各再試行までの待ち時間（ミリ秒）の列を求める。
 * n 回目の再試行は n 回目の失敗から 1000 × 2^(n−1) ms 後に行う（3 回なら 1000 / 2000 / 4000 ms）。
 * @param retryCount 再試行回数（0 なら再試行しない）
 */
export function dbConnectRetryDelaysMs(retryCount: number): number[] {
  return Array.from({ length: retryCount }, (_, i) => DB_CONNECT_RETRY_BASE_DELAY_MS * 2 ** i);
}

/**
 * 接続の取得が失敗を返すまでにかかりうる最長の時間（ミリ秒）。
 * 最初の試行と再試行（計 retryCount + 1 回）がそれぞれ接続タイムアウトまで待ち、その間に再試行の間隔を挟む。
 * 既定（3 回・5000ms）では 1000 + 2000 + 4000 + 5000 × 4 = 27000ms になる。
 * @param retryCount 再試行回数
 * @param connectionTimeoutMs 1 回の試行の接続タイムアウト（ミリ秒）
 */
export function dbConnectBudgetMs(retryCount: number, connectionTimeoutMs: number): number {
  const totalDelayMs = dbConnectRetryDelaysMs(retryCount).reduce((sum, delay) => sum + delay, 0);
  return totalDelayMs + (retryCount + 1) * connectionTimeoutMs;
}

/**
 * 認証系のサービスの対話型トランザクションへ渡す設定（要件24.1）。
 *
 * Prisma の `maxWait`（既定 2000ms）が接続の再試行の予算より短いと、DB に到達できないとき
 * 接続の取得が失敗を返す前に Prisma がトランザクションの開始を打ち切り、P2028
 * （「Unable to start a transaction in the given time.」、原因の情報を持たない）を投げる。
 * `maxWait` を「再試行の予算 + Prisma の既定の 2000ms」とし、接続の取得の失敗
 * （pg-pool の接続タイムアウト）をそのまま呼び出し元へ届かせる。
 *
 * 予算は DB クライアントの生成（`db.ts` の getPrismaClient）と同じ環境変数と解析関数から求める。
 * `timeout`（トランザクションの本体の上限）は変えない。
 */
export function connectBudgetTransactionOptions(env: NodeJS.ProcessEnv = process.env): {
  maxWait: number;
} {
  const retryCount = parseDatabaseRetryCount(env.DATABASE_RETRY_COUNT);
  const connectionTimeoutMs = parseDatabaseConnectionTimeout(env.DATABASE_CONNECTION_TIMEOUT);
  return {
    maxWait:
      dbConnectBudgetMs(retryCount, connectionTimeoutMs) + PRISMA_DEFAULT_TRANSACTION_MAX_WAIT_MS,
  };
}
