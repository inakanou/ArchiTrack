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

/**
 * 接続の取得が常にタイムアウトするとき、pool.connect() が失敗を返すまでの接続の試行の間隔（ミリ秒）を偽の時計で測る。
 * 戻り値の要素数が再試行の回数、各要素が n 回目の再試行までの待ち時間になる。
 * 呼び出し側で偽の時計（vi.useFakeTimers）と pg.Pool.prototype.connect のスパイを用意しておくこと。
 */
async function measureRetryDelays(
  pool: pg.Pool,
  connectSpy: ReturnType<typeof vi.spyOn>
): Promise<{ delays: number[]; error: unknown }> {
  const attemptedAt: number[] = [];
  connectSpy.mockImplementation(() => {
    attemptedAt.push(Date.now());
    return Promise.reject(timeoutError());
  });
  const outcome = pool.connect().then(
    () => 'resolved',
    (error: unknown) => error
  );
  // 10 回・倍々の待ち時間の総和（1023000ms）より十分に長く進める
  await vi.advanceTimersByTimeAsync(4_000_000);
  const error = await outcome;
  return { delays: attemptedAt.slice(1).map((at, i) => at - attemptedAt[i]!), error };
}

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

  /**
   * @requirement user-authentication/REQ-24.6: 再試行回数を指定しなければ条文どおり 1 秒・2 秒・4 秒後の計 3 回になる
   */
  it('retryCount を指定しなければ1000ms・2000ms・4000ms後の計3回だけ再試行する', async () => {
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING });

    const { delays, error } = await measureRetryDelays(pool, connectSpy);

    expect(delays).toEqual([1000, 2000, 4000]);
    expect((error as Error).message).toBe('timeout exceeded when trying to connect');
  });

  /**
   * @requirement user-authentication/REQ-24.6: 再試行回数 0 では接続タイムアウトを再試行せずそのまま失敗を返す
   */
  it('retryCount が0なら接続タイムアウトを再試行せずに失敗を返す', async () => {
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING, retryCount: 0 });

    const { delays, error } = await measureRetryDelays(pool, connectSpy);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
    expect((error as Error).message).toBe('timeout exceeded when trying to connect');
  });

  /**
   * @requirement user-authentication/REQ-24.6: 再試行回数 5 では間隔を倍々に延ばし 1 秒・2 秒・4 秒・8 秒・16 秒後の計 5 回再試行する
   */
  it('retryCount が5なら1000・2000・4000・8000・16000ms後の計5回再試行し、6回目は行わない', async () => {
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING, retryCount: 5 });

    const { delays, error } = await measureRetryDelays(pool, connectSpy);

    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(connectSpy).toHaveBeenCalledTimes(6);
    expect((error as Error).message).toBe('timeout exceeded when trying to connect');
  });

  /**
   * @requirement user-authentication/REQ-24.6: 上限の再試行回数 10 では 10 回目の間隔が 512 秒、待ち時間の総和が 1023 秒になる
   */
  it('retryCount が10なら10回目の再試行は512000ms後で、待ち時間の総和は1023000msになる', async () => {
    const pool = new RetryingPool({ connectionString: CONNECTION_STRING, retryCount: 10 });

    const { delays } = await measureRetryDelays(pool, connectSpy);

    expect(delays).toHaveLength(10);
    expect(delays[9]).toBe(512000);
    expect(delays.reduce((sum, delay) => sum + delay, 0)).toBe(1023000);
  });
});

describe('getPrismaClient（再試行するプールの結線）', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalConnectionTimeout = process.env.DATABASE_CONNECTION_TIMEOUT;
  const originalRetryCount = process.env.DATABASE_RETRY_COUNT;

  beforeEach(async () => {
    await disconnectPrisma();
    prismaPgCtor.mockClear();
    process.env.DATABASE_URL = CONNECTION_STRING;
    delete process.env.DATABASE_CONNECTION_TIMEOUT;
    delete process.env.DATABASE_RETRY_COUNT;
  });

  afterEach(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalConnectionTimeout === undefined) {
      delete process.env.DATABASE_CONNECTION_TIMEOUT;
    } else {
      process.env.DATABASE_CONNECTION_TIMEOUT = originalConnectionTimeout;
    }
    if (originalRetryCount === undefined) {
      delete process.env.DATABASE_RETRY_COUNT;
    } else {
      process.env.DATABASE_RETRY_COUNT = originalRetryCount;
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

  describe('DATABASE_RETRY_COUNT（再試行回数）', () => {
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
     * @requirement user-authentication/REQ-24.6: DATABASE_RETRY_COUNT が未設定なら、生成したプールは 1 秒・2 秒・4 秒後の計 3 回再試行する
     */
    it('DATABASE_RETRY_COUNT が未設定なら生成したプールは1000ms・2000ms・4000ms後の計3回再試行する', async () => {
      getPrismaClient();

      const { delays } = await measureRetryDelays(createdPool(), connectSpy);

      expect(delays).toEqual([1000, 2000, 4000]);
    });

    /**
     * @requirement user-authentication/REQ-24.6: DATABASE_RETRY_COUNT=0 なら、生成したプールは接続タイムアウトを再試行しない
     */
    it('DATABASE_RETRY_COUNT=0 なら生成したプールは再試行しない', async () => {
      process.env.DATABASE_RETRY_COUNT = '0';

      getPrismaClient();

      const { delays } = await measureRetryDelays(createdPool(), connectSpy);

      expect(delays).toEqual([]);
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    /**
     * @requirement user-authentication/REQ-24.6: DATABASE_RETRY_COUNT=5 なら、生成したプールは倍々の間隔で計 5 回再試行する
     */
    it('DATABASE_RETRY_COUNT=5 なら生成したプールは1000・2000・4000・8000・16000ms後の計5回再試行する', async () => {
      process.env.DATABASE_RETRY_COUNT = '5';

      getPrismaClient();

      const { delays } = await measureRetryDelays(createdPool(), connectSpy);

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });

    /**
     * @requirement user-authentication/REQ-24.6: DATABASE_RETRY_COUNT に 0〜10 の整数でない値（範囲外・小数・非数値）を与えるとプールを作らず失敗する
     */
    it.each(['11', '-1', '1.5', 'abc'])(
      'DATABASE_RETRY_COUNT=%s はプールを作らず失敗する',
      (value) => {
        process.env.DATABASE_RETRY_COUNT = value;

        expect(() => getPrismaClient()).toThrow();
        expect(prismaPgCtor).not.toHaveBeenCalled();
      }
    );
  });
});
