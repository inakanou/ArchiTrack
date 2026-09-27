import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { parseDatabaseConnectionTimeout } from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';
import { isConnectionTimeoutError } from './utils/db-connection-timeout.js';
import logger from './utils/logger.js';

/**
 * データベース接続がタイムアウトしたときの再試行の待ち時間（ミリ秒）。
 * n 回目の再試行は n 回目の失敗から DB_CONNECT_RETRY_DELAYS_MS[n - 1] 後に行う。
 * 要素数が最大の再試行回数（3 回）を決める。
 */
export const DB_CONNECT_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

// 接続タイムアウトの判定は依存の無いモジュールに置き（エラーハンドラーも使う）、ここから再輸出する
export { isConnectionTimeoutError };

type PoolConnectCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: unknown) => void
) => void;

/**
 * 接続の確立がタイムアウトしたとき、1 秒・2 秒・4 秒の間隔で最大 3 回まで再試行する pg のプール。
 *
 * 再試行するのは接続の取得（connect）だけで、SQL の実行は再試行しない。
 * 接続が得られる前は SQL が送られていないため、書き込みを二重に実行することはない。
 * `pool.query` と Prisma の対話型トランザクション（startTransaction）はどちらも connect を経由する。
 */
export class RetryingPool extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: PoolConnectCallback): void;
  override connect(callback?: PoolConnectCallback): Promise<pg.PoolClient> | void {
    const connecting = this.connectWithRetry();
    if (!callback) {
      return connecting;
    }
    connecting.then(
      (client) =>
        callback(undefined, client, (release?: unknown) => client.release(release as Error)),
      (error: Error) => callback(error, undefined, () => {})
    );
  }

  private async connectWithRetry(): Promise<pg.PoolClient> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await super.connect();
      } catch (error) {
        const delay = DB_CONNECT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isConnectionTimeoutError(error)) {
          throw error;
        }
        logger.warn(
          { err: error, retry: attempt + 1, delayMs: delay },
          'Database connection timed out, retrying'
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

// Singleton Prisma Client instance
// https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prismaclient-in-long-running-applications
let prisma: PrismaClient | null = null;

// Lazy initialization - only create client when DATABASE_URL is available
function getPrismaClient(): PrismaClient {
  if (!prisma && process.env.DATABASE_URL) {
    const connectionString = process.env.DATABASE_URL;
    // 接続タイムアウト（既定 5000ms）。pg の既定 0 は無制限で、タイムアウトが起きず再試行に至らない
    const connectionTimeoutMillis = parseDatabaseConnectionTimeout(
      process.env.DATABASE_CONNECTION_TIMEOUT
    );
    // 接続タイムアウトを再試行するプールを渡し、$disconnect 時にそのプールも閉じさせる
    const adapter = new PrismaPg(new RetryingPool({ connectionString, connectionTimeoutMillis }), {
      disposeExternalPool: true,
    });

    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    logger.info(
      {
        databaseUrl: connectionString.replace(/:[^:@]+@/, ':***@'), // パスワードをマスク
      },
      'Prisma Client initialized'
    );
  }

  if (!prisma) {
    throw new Error('DATABASE_URL not configured');
  }

  return prisma;
}

// Export singleton instance getter
export default getPrismaClient;

// Graceful shutdown helper
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Prisma Client disconnected');
    prisma = null;
  }
}
