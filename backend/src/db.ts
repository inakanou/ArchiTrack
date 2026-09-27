import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  DEFAULT_DATABASE_RETRY_COUNT,
  parseDatabaseConnectionTimeout,
  parseDatabaseRetryCount,
} from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';
import { isConnectionTimeoutError } from './utils/db-connection-timeout.js';
import logger from './utils/logger.js';

/** 1 回目の再試行までの待ち時間（ミリ秒）。n 回目は 1000 × 2^(n−1) ms へ倍々に延ばす */
export const DB_CONNECT_RETRY_BASE_DELAY_MS = 1000 as const;

/**
 * 再試行回数から、各再試行までの待ち時間（ミリ秒）の列を求める。
 * n 回目の再試行は n 回目の失敗から 1000 × 2^(n−1) ms 後に行う（3 回なら 1000 / 2000 / 4000 ms）。
 * @param retryCount 再試行回数（0 なら再試行しない）
 */
export function dbConnectRetryDelaysMs(retryCount: number): number[] {
  return Array.from({ length: retryCount }, (_, i) => DB_CONNECT_RETRY_BASE_DELAY_MS * 2 ** i);
}

/**
 * 既定の再試行回数（3 回）での待ち時間（1000 / 2000 / 4000 ms）。
 */
export const DB_CONNECT_RETRY_DELAYS_MS: readonly number[] = dbConnectRetryDelaysMs(
  DEFAULT_DATABASE_RETRY_COUNT
);

/** RetryingPool の設定。pg のプールの設定に再試行回数を加える */
export interface RetryingPoolConfig extends pg.PoolConfig {
  /** 接続タイムアウト時の再試行回数（省略時は既定の 3 回） */
  retryCount?: number;
}

// 接続タイムアウトの判定は依存の無いモジュールに置き（エラーハンドラーも使う）、ここから再輸出する
export { isConnectionTimeoutError };

type PoolConnectCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: unknown) => void
) => void;

/**
 * 接続の確立がタイムアウトしたとき、1 秒・2 秒・4 秒…と倍々に延ばす間隔で、再試行回数（既定 3 回）まで再試行する pg のプール。
 *
 * 再試行するのは接続の取得（connect）だけで、SQL の実行は再試行しない。
 * 接続が得られる前は SQL が送られていないため、書き込みを二重に実行することはない。
 * `pool.query` と Prisma の対話型トランザクション（startTransaction）はどちらも connect を経由する。
 */
export class RetryingPool extends pg.Pool {
  private readonly retryDelaysMs: readonly number[];

  constructor(config: RetryingPoolConfig = {}) {
    const { retryCount = DEFAULT_DATABASE_RETRY_COUNT, ...poolConfig } = config;
    super(poolConfig);
    this.retryDelaysMs = dbConnectRetryDelaysMs(retryCount);
  }

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
        const delay = this.retryDelaysMs[attempt];
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
    // 接続タイムアウト時の再試行回数（既定 3 回、0〜10。間隔は 1000 × 2^(n−1) ms）
    const retryCount = parseDatabaseRetryCount(process.env.DATABASE_RETRY_COUNT);
    // 接続タイムアウトを再試行するプールを渡し、$disconnect 時にそのプールも閉じさせる
    const adapter = new PrismaPg(
      new RetryingPool({ connectionString, connectionTimeoutMillis, retryCount }),
      { disposeExternalPool: true }
    );

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
