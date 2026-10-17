import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

/**
 * 起動の入口（src/index.ts）が本番の前提の欠落で起動を止めることを確かめる
 * （user-authentication タスク44.6、design.md の RuntimeMode の assertProductionPrerequisites）。
 *
 * 環境変数の検証（config/env.ts）と前提の判定（config/runtime-mode.ts）は実物を使い、
 * 接続を伴う部品（app の待ち受け、Redis、DB、ストレージ、Sentry）だけを差し替える。
 */

const listenMock = vi.fn();

vi.mock('dotenv/config', () => ({}));
vi.mock('../../app.js', () => ({ default: { listen: listenMock } }));
vi.mock('../../utils/sentry.js', () => ({ initSentry: vi.fn() }));
vi.mock('../../db.js', () => ({ disconnectPrisma: vi.fn() }));
vi.mock('../../redis.js', () => ({
  default: { disconnect: vi.fn() },
  initRedis: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../storage/index.js', () => ({
  initializeStorage: vi.fn(),
  disconnectStorage: vi.fn(),
  isStorageConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock('../../routes/survey-images.routes.js', () => ({
  initializeStorageServices: vi.fn(),
}));

/** 試験専用の固定の鍵（秘密ではない。本番では使わない） */
const TEST_ONLY_ARCHIVE_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('起動の入口の本番の前提の検査', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: MockInstance;
  let onSpy: MockInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    listenMock.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    // 終了のシグナルの待ち受けを登録させない（テストのプロセスに残さない）
    const originalOn = process.on.bind(process);
    onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: never) => {
      if (event === 'SIGTERM' || event === 'SIGINT') {
        return process;
      }
      return originalOn(event, listener);
    }) as never);

    // 本番の設定（接続はモックする）
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://prod:prod@db.internal:5432/architrack';
    process.env.REDIS_URL = 'redis://redis.internal:6379';
    process.env.TRUST_PROXY_HOPS = '2';
    process.env.ARCHIVE_ENCRYPTION_KEY = TEST_ONLY_ARCHIVE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  /**
   * @requirement user-authentication/REQ-41.3: 本番環境でアーカイブの暗号鍵が設定されていないと、起動時にエラーで停止する
   */
  it('本番の設定で ARCHIVE_ENCRYPTION_KEY が無いと、待ち受けを始めずに終了コード 1 で止まる', async () => {
    delete process.env.ARCHIVE_ENCRYPTION_KEY;

    await import('../../index.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
    expect(listenMock).not.toHaveBeenCalled();
  });

  it('本番の設定で TRUST_PROXY_HOPS が無いと、待ち受けを始めずに終了コード 1 で止まる', async () => {
    delete process.env.TRUST_PROXY_HOPS;

    await import('../../index.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
    expect(listenMock).not.toHaveBeenCalled();
  });

  it('本番の設定で REDIS_URL が無いと、環境変数の検証で起動が止まる', async () => {
    delete process.env.REDIS_URL;

    await expect(import('../../index.js')).rejects.toThrow(
      'Failed to validate environment variables'
    );
    expect(listenMock).not.toHaveBeenCalled();
  });

  it('本番の前提が揃っていれば待ち受けを始める', async () => {
    await import('../../index.js');

    await vi.waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  /**
   * 画面の nginx は backend へプライベートネットワークで中継する（user-authentication
   * タスク44.7、design.md「画面配信」）。Railway のプライベートネットワークは環境によって
   * IPv6 だけになるため、IPv4 だけ（0.0.0.0）で待ち受けると中継先へ届かない。
   */
  it('IPv4 と IPv6 の両方で受ける :: で待ち受ける', async () => {
    await import('../../index.js');

    await vi.waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));
    expect(listenMock.mock.calls[0]?.[1]).toBe('::');
  });
});
