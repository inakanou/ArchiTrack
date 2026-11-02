import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

/** 試験専用の 2 要素認証の暗号化鍵（環境変数の検証が必須とする。開発者の .env に頼らない） */
const TEST_ONLY_TWO_FACTOR_KEY = '1a2b3c4d5e6f70811a2b3c4d5e6f70811a2b3c4d5e6f70811a2b3c4d5e6f7081';

/**
 * 起動の入口（src/index.ts）が定期処理の実行基盤を待ち受けの開始の後に始め、
 * graceful shutdown で止めることを確かめる（user-authentication タスク44.9）。
 *
 * 接続を伴う部品（app の待ち受け、Redis、DB、ストレージ、Sentry、定期処理の実行基盤）を差し替える。
 * 試験の実行環境で登録しないことは実行基盤の単体検証（jobs/scheduled-job-runner.test.ts）で確かめる。
 */

const listenMock = vi.fn((_port: number, _host: string, callback?: () => void) => {
  callback?.();
});
const startMock = vi.fn();
const stopMock = vi.fn();
const runnerConstructor = vi.fn();
const definitions = [{ name: 'expired-token-cleanup' }];
const createScheduledJobDefinitionsMock = vi.fn(() => definitions);
const createScheduledJobsQueueMock = vi.fn();
const captureExceptionMock = vi.fn();
const disconnectPrismaMock = vi.fn();
const prismaClient = { marker: 'prisma' };

vi.mock('dotenv/config', () => ({}));
vi.mock('../../app.js', () => ({ default: { listen: listenMock } }));
vi.mock('../../utils/sentry.js', () => ({
  initSentry: vi.fn(),
  captureException: captureExceptionMock,
}));
vi.mock('../../db.js', () => ({
  default: () => prismaClient,
  disconnectPrisma: disconnectPrismaMock,
}));
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
vi.mock('../../jobs/scheduled-job-runner.js', () => ({
  ScheduledJobRunner: function ScheduledJobRunner(...args: unknown[]) {
    runnerConstructor(...args);
    return { start: startMock, stop: stopMock };
  },
  createScheduledJobDefinitions: createScheduledJobDefinitionsMock,
  createScheduledJobsQueue: createScheduledJobsQueueMock,
}));

describe('起動の入口の定期処理', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: MockInstance;
  let onSpy: MockInstance;
  let signalListeners: Map<string, () => Promise<void>>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    vi.clearAllMocks();
    startMock.mockResolvedValue(true);
    stopMock.mockResolvedValue(undefined);
    disconnectPrismaMock.mockResolvedValue(undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    signalListeners = new Map();
    const originalOn = process.on.bind(process);
    onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: never) => {
      if (event === 'SIGTERM' || event === 'SIGINT') {
        signalListeners.set(event, listener);
        return process;
      }
      return originalOn(event, listener);
    }) as never);

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5432/architrack';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.TWO_FACTOR_ENCRYPTION_KEY = TEST_ONLY_TWO_FACTOR_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('待ち受けを始めた後、本番の定義とキューで定期処理の実行基盤を始める', async () => {
    await import('../../index.js');

    await vi.waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(createScheduledJobDefinitionsMock).toHaveBeenCalledWith(prismaClient);
    expect(runnerConstructor).toHaveBeenCalledWith(expect.any(Function), definitions);
    // キューは実行基盤が必要としたときに作る（試験の実行環境では作らない）
    expect(createScheduledJobsQueueMock).not.toHaveBeenCalled();
    const createQueue = runnerConstructor.mock.calls[0]?.[0] as () => unknown;
    createQueue();
    expect(createScheduledJobsQueueMock).toHaveBeenCalledWith();
    expect(listenMock.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      startMock.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('定期処理の登録に失敗しても起動を止めず、エラーログと Sentry へ送る', async () => {
    const error = new Error('redis unavailable');
    startMock.mockRejectedValue(error);

    await import('../../index.js');

    await vi.waitFor(() =>
      expect(captureExceptionMock).toHaveBeenCalledWith(error, {
        component: 'ScheduledJobRunner',
      })
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('文字列で拒否されても Error に包んで送る', async () => {
    startMock.mockRejectedValue('boom');

    await import('../../index.js');

    await vi.waitFor(() => expect(captureExceptionMock).toHaveBeenCalledTimes(1));
    const sent = captureExceptionMock.mock.calls[0]?.[0] as Error;
    expect(sent).toBeInstanceOf(Error);
    expect(sent.message).toBe('boom');
  });

  it('graceful shutdown で、DB の切断より前に定期処理の実行基盤を止める', async () => {
    await import('../../index.js');
    await vi.waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));

    await signalListeners.get('SIGTERM')?.();

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(stopMock.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      disconnectPrismaMock.mock.invocationCallOrder[0] ?? 0
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
