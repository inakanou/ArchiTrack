/**
 * 定期処理の実行基盤の単体検証（user-authentication タスク44.9、44.12）
 *
 * キュー（Bull）を差し替え、試験の実行環境では繰り返しジョブを登録しないこと、
 * それ以外では同じ識別子で登録し直し、古い定義を消し、最終の失敗だけを記録することを確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Queue } from 'bull';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { createRuntimeMode } from '../../../config/runtime-mode.js';

const bullConstructor = vi.fn();
vi.mock('bull', () => ({
  default: function Bull(...args: unknown[]) {
    bullConstructor(...args);
    return { constructedWith: args };
  },
}));

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const cleanupExpiredTokensMock = vi.fn();
vi.mock('../../../jobs/expired-token-cleanup.job.js', () => ({
  EXPIRED_TOKEN_CLEANUP_JOB_NAME: 'expired-token-cleanup',
  EXPIRED_TOKEN_CLEANUP_CRON: '15 * * * *',
  cleanupExpiredTokens: (...args: unknown[]) => cleanupExpiredTokensMock(...args),
}));

const cleanupFailedEmailJobsMock = vi.fn();
vi.mock('../../../jobs/failed-email-job-cleanup.job.js', () => ({
  FAILED_EMAIL_JOB_CLEANUP_JOB_NAME: 'failed-email-job-cleanup',
  FAILED_EMAIL_JOB_CLEANUP_CRON: '45 * * * *',
  cleanupFailedEmailJobs: (...args: unknown[]) => cleanupFailedEmailJobsMock(...args),
}));

import {
  ScheduledJobRunner,
  createScheduledJobDefinitions,
  createScheduledJobsQueue,
  SCHEDULED_JOBS_QUEUE_NAME,
  SCHEDULED_JOBS_TIMEZONE,
  type ScheduledJobDefinition,
} from '../../../jobs/scheduled-job-runner.js';
import { captureException } from '../../../utils/sentry.js';
import logger from '../../../utils/logger.js';

type Listener = (...args: unknown[]) => unknown;

interface FakeQueue {
  queue: Queue;
  add: ReturnType<typeof vi.fn>;
  process: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  getRepeatableJobs: ReturnType<typeof vi.fn>;
  removeRepeatableByKey: ReturnType<typeof vi.fn>;
  listeners: Map<string, Listener>;
}

function fakeQueue(repeatables: unknown[] = []): FakeQueue {
  const listeners = new Map<string, Listener>();
  const add = vi.fn().mockResolvedValue({});
  const process = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const getRepeatableJobs = vi.fn().mockResolvedValue(repeatables);
  const removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
  const queue = {
    add,
    process,
    close,
    getRepeatableJobs,
    removeRepeatableByKey,
    on: (event: string, listener: Listener) => {
      listeners.set(event, listener);
    },
  } as unknown as Queue;
  return { queue, add, process, close, getRepeatableJobs, removeRepeatableByKey, listeners };
}

const definitions: ScheduledJobDefinition[] = [
  { name: 'expired-token-cleanup', cron: '15 * * * *', run: vi.fn().mockResolvedValue({ n: 1 }) },
  { name: 'another-job', cron: '0 3 * * *', run: vi.fn().mockResolvedValue(undefined) },
];

function modeOf(nodeEnv: string | undefined) {
  return createRuntimeMode({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
}

describe('ScheduledJobRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('試験の実行環境', () => {
    it('NODE_ENV=test では繰り返しジョブを登録せず、キューも作らない', async () => {
      const fake = fakeQueue();
      const createQueue = vi.fn(() => fake.queue);
      const runner = new ScheduledJobRunner(createQueue, definitions, modeOf('test'));

      await expect(runner.start()).resolves.toBe(false);

      expect(createQueue).not.toHaveBeenCalled();
      expect(fake.add).not.toHaveBeenCalled();
      expect(fake.process).not.toHaveBeenCalled();
      // 止めるときも閉じるキューが無い
      await runner.stop();
      expect(fake.close).not.toHaveBeenCalled();
    });
  });

  describe.each(['production', 'development', undefined])('NODE_ENV=%s', (nodeEnv) => {
    it('各定義を同じ識別子・Asia/Tokyo の cron・再試行 3 回で登録し、処理を結び付ける', async () => {
      const fake = fakeQueue();
      const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf(nodeEnv));

      await expect(runner.start()).resolves.toBe(true);

      expect(fake.add).toHaveBeenCalledTimes(2);
      expect(fake.add).toHaveBeenCalledWith(
        'expired-token-cleanup',
        {},
        expect.objectContaining({
          jobId: 'expired-token-cleanup',
          repeat: { cron: '15 * * * *', tz: SCHEDULED_JOBS_TIMEZONE },
          attempts: 4,
          removeOnComplete: true,
        })
      );
      expect(fake.add).toHaveBeenCalledWith(
        'another-job',
        {},
        expect.objectContaining({
          jobId: 'another-job',
          repeat: { cron: '0 3 * * *', tz: 'Asia/Tokyo' },
        })
      );
      expect(fake.process.mock.calls.map((call) => call[0])).toEqual([
        'expired-token-cleanup',
        'another-job',
      ]);
    });
  });

  it('繰り返しジョブの登録を処理の開始より先に行う（直後の停止と競合させない）', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));

    await runner.start();

    const lastAdd = Math.max(...fake.add.mock.invocationCallOrder);
    const firstProcess = Math.min(...fake.process.mock.invocationCallOrder);
    expect(lastAdd).toBeLessThan(firstProcess);
  });

  it('処理は定義の run を呼び、その結果を返す', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));
    await runner.start();

    const handler = fake.process.mock.calls[0]?.[1] as () => Promise<unknown>;
    await expect(handler()).resolves.toEqual({ n: 1 });
    expect(definitions[0]?.run).toHaveBeenCalledTimes(1);
  });

  it('起動のたびに同じ識別子で登録し直し、今の定義と一致する繰り返しの定義は消さない', async () => {
    const fake = fakeQueue([
      {
        key: 'expired-token-cleanup:expired-token-cleanup::Asia/Tokyo:15 * * * *',
        name: 'expired-token-cleanup',
        id: 'expired-token-cleanup',
        tz: 'Asia/Tokyo',
        cron: '15 * * * *',
      },
    ]);
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));

    await runner.start();

    expect(fake.removeRepeatableByKey).not.toHaveBeenCalled();
    expect(fake.add.mock.calls.map((call) => call[2].jobId)).toEqual([
      'expired-token-cleanup',
      'another-job',
    ]);
  });

  it('周期の変わった定義・定義から外れたジョブの古い繰り返しの定義を消してから登録する', async () => {
    const fake = fakeQueue([
      {
        key: 'old-cron-key',
        name: 'expired-token-cleanup',
        id: 'expired-token-cleanup',
        tz: 'Asia/Tokyo',
        cron: '0 * * * *',
      },
      { key: 'old-tz-key', name: 'another-job', id: 'another-job', tz: null, cron: '0 3 * * *' },
      { key: 'removed-job-key', name: 'removed-job', id: 'removed-job', tz: 'Asia/Tokyo' },
    ]);
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));

    await runner.start();

    expect(fake.removeRepeatableByKey.mock.calls.map((call) => call[0])).toEqual([
      'old-cron-key',
      'old-tz-key',
      'removed-job-key',
    ]);
    const removalOrder = fake.removeRepeatableByKey.mock.invocationCallOrder[2] ?? 0;
    const firstAddOrder = fake.add.mock.invocationCallOrder[0] ?? 0;
    expect(removalOrder).toBeLessThan(firstAddOrder);
  });

  it('再試行の後の最終の失敗だけをエラーログと Sentry へ送る', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));
    await runner.start();
    const onFailed = fake.listeners.get('failed');
    expect(onFailed).toBeDefined();

    // 再試行の待ち（失敗の集合にない）
    const retrying = {
      name: 'expired-token-cleanup',
      attemptsMade: 1,
      isFailed: vi.fn().mockResolvedValue(false),
    } as unknown as Job;
    await onFailed?.(retrying, new Error('db unavailable'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(retrying.isFailed).toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    // 最終の失敗
    const finalFailure = {
      name: 'expired-token-cleanup',
      attemptsMade: 4,
      isFailed: vi.fn().mockResolvedValue(true),
    } as unknown as Job;
    const error = new Error('db unavailable');
    await onFailed?.(finalFailure, error);
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ jobName: 'expired-token-cleanup', attemptsMade: 4 })
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobName: 'expired-token-cleanup', reason: 'db unavailable' }),
      'Scheduled job failed after the final attempt'
    );
  });

  it('失敗の通知でジョブを読めないとき・判定が例外になったときも例外を漏らさない', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));
    await runner.start();
    const onFailed = fake.listeners.get('failed');

    expect(() => onFailed?.(null, new Error('stalled'))).not.toThrow();

    const broken = {
      name: 'expired-token-cleanup',
      attemptsMade: 4,
      isFailed: vi.fn().mockRejectedValue(new Error('redis down')),
    } as unknown as Job;
    onFailed?.(broken, undefined);
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ jobName: 'expired-token-cleanup' }),
        'Failed to handle the failed scheduled job'
      )
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('最終の失敗の理由が無いときも Sentry へ送る', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));
    await runner.start();
    const job = {
      name: 'another-job',
      attemptsMade: 4,
      isFailed: vi.fn().mockResolvedValue(true),
    } as unknown as Job;

    fake.listeners.get('failed')?.(job, undefined);

    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ jobName: 'another-job', reason: 'Unknown reason' })
    );
  });

  it('停止の際に処理の繰り返しが拒否されても漏らさず、警告に残す', async () => {
    const fake = fakeQueue();
    const stopped = new Error('Connection is closed.');
    fake.process.mockRejectedValue(stopped);
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));

    await runner.start();

    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        { jobName: 'expired-token-cleanup', err: stopped },
        'Scheduled job processing stopped'
      )
    );
  });

  it('キューのエラーをエラーログへ送る', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));
    await runner.start();
    const error = new Error('connection lost');

    fake.listeners.get('error')?.(error);

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Scheduled jobs queue error');
  });

  it('stop はキューを閉じ、二度目は何もしない', async () => {
    const fake = fakeQueue();
    const runner = new ScheduledJobRunner(() => fake.queue, definitions, modeOf('production'));
    await runner.start();

    await runner.stop();
    await runner.stop();

    expect(fake.close).toHaveBeenCalledTimes(1);
  });
});

describe('createScheduledJobDefinitions', () => {
  it('expired-token-cleanup を毎時 15 分に登録し、処理はトークンの消去を呼ぶ', async () => {
    const prisma = {} as PrismaClient;
    cleanupExpiredTokensMock.mockResolvedValue({ invitationTokensCleared: 1 });

    const jobs = createScheduledJobDefinitions(prisma);

    expect(jobs.map(({ name, cron }) => ({ name, cron }))).toEqual([
      { name: 'expired-token-cleanup', cron: '15 * * * *' },
      { name: 'failed-email-job-cleanup', cron: '45 * * * *' },
    ]);
    await expect(jobs[0]?.run()).resolves.toEqual({ invitationTokensCleared: 1 });
    expect(cleanupExpiredTokensMock).toHaveBeenCalledWith(prisma);
  });

  it('failed-email-job-cleanup を毎時 45 分に登録し、処理はメールキューの失敗のジョブの掃除を既定の猶予で呼ぶ', async () => {
    cleanupFailedEmailJobsMock.mockResolvedValue({ failedEmailJobsRemoved: 2 });

    const jobs = createScheduledJobDefinitions({} as PrismaClient);
    const job = jobs.find(({ name }) => name === 'failed-email-job-cleanup');

    await expect(job?.run()).resolves.toEqual({ failedEmailJobsRemoved: 2 });
    expect(cleanupFailedEmailJobsMock).toHaveBeenCalledWith();
  });
});

describe('createScheduledJobsQueue', () => {
  beforeEach(() => {
    bullConstructor.mockClear();
  });

  it('REDIS_URL で接続する', () => {
    createScheduledJobsQueue('redis://:secret@redis.internal:6379/2');
    expect(bullConstructor).toHaveBeenCalledWith(
      SCHEDULED_JOBS_QUEUE_NAME,
      'redis://:secret@redis.internal:6379/2',
      {}
    );
  });

  it('rediss の接続先では TLS を明示する', () => {
    createScheduledJobsQueue('rediss://:secret@redis.internal:6380');
    expect(bullConstructor).toHaveBeenCalledWith(
      'scheduled-jobs',
      'rediss://:secret@redis.internal:6380',
      { redis: { tls: {} } }
    );
  });

  it('REDIS_URL が無いときは既定の接続先で作り、警告を残す', () => {
    createScheduledJobsQueue('');
    expect(bullConstructor).toHaveBeenCalledWith('scheduled-jobs', {});
    expect(logger.warn).toHaveBeenCalled();
  });
});
