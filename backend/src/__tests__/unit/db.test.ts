/**
 * データベース接続タイムアウト時の再試行（backend/src/db.ts）の単体検証
 *
 * pg のプールの接続取得（pg.Pool.prototype.connect）を模擬し、偽の時計で再試行の回数と間隔を測る。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pg from 'pg';

vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const prismaPgCtor = vi.fn();
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(function (this: unknown, ...args: unknown[]) {
    prismaPgCtor(...args);
  }),
}));

vi.mock('../../generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(function () {
    return { $disconnect: vi.fn().mockResolvedValue(undefined) };
  }),
}));

import getPrismaClient, { RetryingPool, disconnectPrisma } from '../../db.js';

const CONNECTION_STRING = 'postgresql://test:test@127.0.0.1:5432/test';

/** pg-pool が connectionTimeoutMillis を超えたときに返すエラー */
const timeoutError = () => new Error('timeout exceeded when trying to connect');

describe('RetryingPool（データベース接続タイムアウト時の再試行）', () => {
  let connectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    connectSpy = vi.spyOn(pg.Pool.prototype, 'connect');
  });

  afterEach(() => {
    connectSpy.mockRestore();
    vi.useRealTimers();
  });

  /**
   * @requirement user-authentication/REQ-24.6: 接続がタイムアウトし続けると 1 秒・2 秒・4 秒後に計 3 回だけ再試行し、4 回目は行わず失敗を返す
   */
  it('接続がタイムアウトし続けると1000ms・2000ms・4000ms後に計3回再試行し、4回目は行わず失敗を返す', async () => {
    connectSpy.mockImplementation(() => Promise.reject(timeoutError()));
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING });

    const outcome = pool.connect().then(
      () => 'resolved',
      (error: Error) => error
    );

    // 初回の試行
    await vi.advanceTimersByTimeAsync(0);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    // 1 回目の再試行: 1000ms 後
    await vi.advanceTimersByTimeAsync(999);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(2);

    // 2 回目の再試行: さらに 2000ms 後
    await vi.advanceTimersByTimeAsync(1999);
    expect(connectSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(3);

    // 3 回目の再試行: さらに 4000ms 後
    await vi.advanceTimersByTimeAsync(3999);
    expect(connectSpy).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(4);

    // 4 回目の再試行は行わない
    await vi.advanceTimersByTimeAsync(60000);
    expect(connectSpy).toHaveBeenCalledTimes(4);

    const result = await outcome;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('timeout exceeded when trying to connect');
  });

  /**
   * @requirement user-authentication/REQ-24.6: OS の TCP 接続タイムアウト（ETIMEDOUT）も 1 秒・2 秒・4 秒後に計 3 回だけ再試行する
   */
  it('ETIMEDOUT の接続エラーを1000ms・2000ms・4000ms後に計3回再試行し、4回目は行わず失敗を返す', async () => {
    connectSpy.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('connect ETIMEDOUT 10.255.255.1:5432'), { code: 'ETIMEDOUT' })
      )
    );
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING });

    const outcome = pool.connect().then(
      () => 'resolved',
      (error: NodeJS.ErrnoException) => error
    );

    await vi.advanceTimersByTimeAsync(999);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(connectSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3999);
    expect(connectSpy).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(connectSpy).toHaveBeenCalledTimes(4);

    expect(((await outcome) as NodeJS.ErrnoException).code).toBe('ETIMEDOUT');
  });

  /**
   * @requirement user-authentication/REQ-24.6: 再試行の途中で接続できればその接続を返す
   */
  it('2回タイムアウトした後の2回目の再試行で接続できればその接続を返す', async () => {
    const client = { release: vi.fn() } as unknown as pg.PoolClient;
    connectSpy
      .mockImplementationOnce(() => Promise.reject(timeoutError()))
      .mockImplementationOnce(() => Promise.reject(timeoutError()))
      .mockImplementationOnce(() => Promise.resolve(client));
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING });

    const connecting = pool.connect();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(connecting).resolves.toBe(client);
    expect(connectSpy).toHaveBeenCalledTimes(3);
  });

  /**
   * @requirement user-authentication/REQ-24.6: 再試行するのは接続のタイムアウトだけで、他の接続エラーは再試行しない
   */
  it('タイムアウト以外の接続エラーは再試行せずそのまま返す', async () => {
    connectSpy.mockImplementation(() =>
      Promise.reject(new Error('password authentication failed for user "test"'))
    );
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING });

    const outcome = pool.connect().then(
      () => 'resolved',
      (error: Error) => error
    );
    await vi.advanceTimersByTimeAsync(60000);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect((await outcome) as Error).toBeInstanceOf(Error);
  });

  /**
   * @requirement user-authentication/REQ-24.6: Prisma が使う pool.query の経路でも 1 秒・2 秒・4 秒後に計 3 回だけ再試行する
   */
  it('pool.query の経路でも接続タイムアウトを1000ms・2000ms・4000ms後に計3回再試行し、その後は失敗を返す', async () => {
    connectSpy.mockImplementation(() => Promise.reject(timeoutError()));
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING });

    const outcome = pool.query('SELECT 1').then(
      () => 'resolved',
      (error: Error) => error
    );

    await vi.advanceTimersByTimeAsync(999);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(connectSpy).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(connectSpy).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(connectSpy).toHaveBeenCalledTimes(4);

    const result = await outcome;
    expect((result as Error).message).toBe('timeout exceeded when trying to connect');
  });
});

describe('getPrismaClient（再試行するプールの結線）', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalConnectionTimeout = process.env.DATABASE_CONNECTION_TIMEOUT;

  beforeEach(async () => {
    await disconnectPrisma();
    prismaPgCtor.mockClear();
    process.env.DATABASE_URL = CONNECTION_STRING;
    delete process.env.DATABASE_CONNECTION_TIMEOUT;
  });

  afterEach(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalConnectionTimeout === undefined) {
      delete process.env.DATABASE_CONNECTION_TIMEOUT;
    } else {
      process.env.DATABASE_CONNECTION_TIMEOUT = originalConnectionTimeout;
    }
  });

  /** getPrismaClient が PrismaPg へ渡したプール */
  const createdPool = () => (prismaPgCtor.mock.calls[0] as [RetryingPool, unknown])[0];

  /**
   * @requirement user-authentication/REQ-24.6: 接続タイムアウトが既定で 5000ms に設定される（pg の既定 0 = 無制限ではタイムアウトが起きず再試行に至らない）
   */
  it('DATABASE_CONNECTION_TIMEOUT が未設定なら接続タイムアウトを5000msにする', () => {
    getPrismaClient();

    expect(createdPool().options.connectionTimeoutMillis).toBe(5000);
  });

  /**
   * @requirement user-authentication/REQ-24.6: 接続タイムアウトを環境変数 DATABASE_CONNECTION_TIMEOUT で上書きできる
   */
  it('DATABASE_CONNECTION_TIMEOUT=1500 なら接続タイムアウトを1500msにする', () => {
    process.env.DATABASE_CONNECTION_TIMEOUT = '1500';

    getPrismaClient();

    expect(createdPool().options.connectionTimeoutMillis).toBe(1500);
  });

  /**
   * @requirement user-authentication/REQ-24.6: 接続タイムアウトを単位 ms 付きの表記（要件の表の既定値 5000ms と同じ書き方）でも与えられる
   */
  it('DATABASE_CONNECTION_TIMEOUT=5000ms なら接続タイムアウトを5000msにする', () => {
    process.env.DATABASE_CONNECTION_TIMEOUT = '5000ms';

    getPrismaClient();

    expect(createdPool().options.connectionTimeoutMillis).toBe(5000);
  });

  /**
   * @requirement user-authentication/REQ-24.6: 接続タイムアウトに ms 以外の単位（5s）を受け付けない
   */
  it('DATABASE_CONNECTION_TIMEOUT=5s はプールを作らず失敗する', () => {
    process.env.DATABASE_CONNECTION_TIMEOUT = '5s';

    expect(() => getPrismaClient()).toThrow();
    expect(prismaPgCtor).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-24.6: 接続タイムアウトに正の整数でない値（0 = 無制限を含む）を受け付けない
   */
  it('DATABASE_CONNECTION_TIMEOUT=0 はプールを作らず失敗する', () => {
    process.env.DATABASE_CONNECTION_TIMEOUT = '0';

    expect(() => getPrismaClient()).toThrow();
    expect(prismaPgCtor).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-24.6: Prisma のアダプタへ接続タイムアウトを再試行するプールを渡す
   */
  it('Prisma のアダプタへ RetryingPool を渡し、切断時にそのプールを閉じさせる', () => {
    getPrismaClient();

    expect(prismaPgCtor).toHaveBeenCalledTimes(1);
    const [poolArg, options] = prismaPgCtor.mock.calls[0] as [unknown, unknown];
    expect(poolArg).toBeInstanceOf(RetryingPool);
    expect(options).toEqual({ disposeExternalPool: true });
  });
});
