/**
 * メールキューの失敗のジョブの掃除の単体検証（user-authentication タスク44.12）
 *
 * キュー（Bull）を差し替え、失敗の集合だけを猶予（1 時間）で掃除し、成否に関わらずキューを
 * 閉じることを確かめる。実 Redis での結果は統合検証
 * （integration/failed-email-job-cleanup.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Queue } from 'bull';

const createEmailQueueMock = vi.fn();
vi.mock('../../../services/email.service.js', () => ({
  createEmailQueue: (...args: unknown[]) => createEmailQueueMock(...args),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  FAILED_EMAIL_JOB_CLEANUP_CRON,
  FAILED_EMAIL_JOB_CLEANUP_JOB_NAME,
  FAILED_EMAIL_JOB_GRACE_MS,
  cleanupFailedEmailJobs,
} from '../../../jobs/failed-email-job-cleanup.job.js';
import logger from '../../../utils/logger.js';

type Listener = (...args: unknown[]) => unknown;

function fakeQueue(clean: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, Listener>();
  const close = vi.fn().mockResolvedValue(undefined);
  const queue = {
    clean,
    close,
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
    }),
  } as unknown as Queue;
  return { queue, close, listeners };
}

describe('cleanupFailedEmailJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ジョブ名と周期（毎時 45 分）と猶予（1 時間）を持つ', () => {
    expect(FAILED_EMAIL_JOB_CLEANUP_JOB_NAME).toBe('failed-email-job-cleanup');
    expect(FAILED_EMAIL_JOB_CLEANUP_CRON).toBe('45 * * * *');
    expect(FAILED_EMAIL_JOB_GRACE_MS).toBe(60 * 60 * 1000);
  });

  it('既定では本番のメールキューを作り、失敗の集合だけを 1 時間の猶予で掃除して閉じる', async () => {
    const fake = fakeQueue(vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]));
    createEmailQueueMock.mockReturnValue(fake.queue);

    await expect(cleanupFailedEmailJobs()).resolves.toEqual({ failedEmailJobsRemoved: 2 });

    expect(createEmailQueueMock).toHaveBeenCalledWith();
    expect(fake.queue.clean).toHaveBeenCalledTimes(1);
    expect(fake.queue.clean).toHaveBeenCalledWith(60 * 60 * 1000, 'failed');
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('掃除が失敗してもキューを閉じ、失敗を呼び出し元（再試行と記録）へ返す', async () => {
    const failure = new Error('redis unavailable');
    const fake = fakeQueue(vi.fn().mockRejectedValue(failure));

    await expect(cleanupFailedEmailJobs(() => fake.queue, 5000)).rejects.toBe(failure);

    expect(fake.queue.clean).toHaveBeenCalledWith(5000, 'failed');
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(createEmailQueueMock).not.toHaveBeenCalled();
  });

  it('キューのエラーの通知を受けて警告に残す（未処理のエラーにしない）', async () => {
    const fake = fakeQueue(vi.fn().mockResolvedValue([]));
    await cleanupFailedEmailJobs(() => fake.queue);

    const connectionError = new Error('connection lost');
    fake.listeners.get('error')?.(connectionError);

    expect(logger.warn).toHaveBeenCalledWith(
      { err: connectionError },
      'Email queue error during the failed job cleanup'
    );
  });
});
