/**
 * @fileoverview メールキューの失敗のジョブの掃除の統合検証（タスク44.12）
 *
 * 実 Redis に対して、定期処理 `failed-email-job-cleanup` の処理の関数（cleanupFailedEmailJobs）を
 * 直接呼び、猶予を過ぎた失敗のジョブ（宛先とトークンを含む）が Redis に残らず、猶予内の失敗の
 * ジョブと、待機中・遅延のジョブが残ることを確かめる。
 *
 * 失敗のジョブは、EmailService の failed の受け手（記録の後に消す）を付けずに、本番と同じ
 * createEmailQueue のキューで処理を失敗させて作る。受け手の判定や記録が例外になり、消されずに
 * 失敗の集合に残った状態の再現である。
 *
 * 試験の backend（tsx watch）は同じ REDIS_URL の論理 DB で `email-queue` の処理を登録しているため、
 * 接続の情報は REDIS_URL のままに、論理 DB だけを専用の番号へ替える。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';
import type { Job, Queue } from 'bull';
import { createEmailQueue } from '../../services/email.service.js';
import {
  FAILED_EMAIL_JOB_GRACE_MS,
  cleanupFailedEmailJobs,
} from '../../jobs/failed-email-job-cleanup.job.js';

const QUEUE_KEY_PATTERN = 'bull:email-queue:*';
/** 稼働中の試験の backend のワーカーと他の検証と混ざらない、この検証の専用の論理 DB */
const ISOLATED_REDIS_DB = 12;
const MINUTE_MS = 60 * 1000;

function isolatedRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for the failed email job cleanup integration test');
  }
  const url = new URL(redisUrl);
  url.pathname = `/${ISOLATED_REDIS_DB}`;
  return url.toString();
}

describe('メールキューの失敗のジョブの掃除（統合・実 Redis）', () => {
  const redisUrl = isolatedRedisUrl();
  let redis: Redis;

  async function deleteQueueKeys(): Promise<void> {
    const keys = await redis.keys(QUEUE_KEY_PATTERN);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * `bull:email-queue:*` の全てのキーの名前と内容を一つの文字列にする
   */
  async function dumpQueueKeys(): Promise<string> {
    const keys = (await redis.keys(QUEUE_KEY_PATTERN)).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const type = await redis.type(key);
      let content: unknown;
      if (type === 'hash') {
        content = await redis.hgetall(key);
      } else if (type === 'list') {
        content = await redis.lrange(key, 0, -1);
      } else if (type === 'zset') {
        content = await redis.zrange(key, 0, -1);
      } else if (type === 'string') {
        content = await redis.get(key);
      } else {
        content = `<${type}>`;
      }
      parts.push(`${key} ${JSON.stringify(content)}`);
    }
    return parts.join('\n');
  }

  /**
   * 本番と同じ組み立てのキューで送信の処理を失敗させ、失敗の集合にジョブを残す
   * （再試行なし。failed の受け手は付けない）
   */
  async function createFailedJobs(
    jobs: ReadonlyArray<{ name: string; data: Record<string, string> }>
  ): Promise<string[]> {
    const worker = createEmailQueue(redisUrl);
    try {
      await worker.isReady();
      let failedCount = 0;
      const allFailed = new Promise<void>((resolve) => {
        worker.on('failed', () => {
          failedCount += 1;
          if (failedCount === jobs.length) {
            resolve();
          }
        });
      });
      for (const name of new Set(jobs.map((job) => job.name))) {
        void worker.process(name, async () => {
          throw new Error('SMTP unavailable');
        });
      }
      const added: Job[] = [];
      for (const job of jobs) {
        added.push(await worker.add(job.name, job.data, { attempts: 1 }));
      }
      await allFailed;
      return added.map((job) => String(job.id));
    } finally {
      await worker.close();
    }
  }

  beforeAll(async () => {
    redis = new Redis(redisUrl);
    await deleteQueueKeys();
  });

  beforeEach(async () => {
    await deleteQueueKeys();
  });

  afterAll(async () => {
    await deleteQueueKeys();
    await redis.quit();
  });

  /**
   * @requirement user-authentication/REQ-45.3: 失敗の受け手の判定や記録が例外になり消されずに残った失敗のジョブも、定期処理で一定期間内に削除する
   */
  it('猶予を過ぎた失敗のジョブは宛先とトークンとともに Redis に残らず、猶予内の失敗のジョブと待機中・遅延のジョブは残る', async () => {
    const staleRecipient = 'stale-recipient@failed-cleanup.example.com';
    const staleToken = 'failed-cleanup-stale-token-91c4e2';
    const recentRecipient = 'recent-recipient@failed-cleanup.example.com';
    const recentToken = 'failed-cleanup-recent-token-3a7d50';
    const [staleId, recentId] = await createFailedJobs([
      { name: 'invitation-email', data: { to: staleRecipient, invitationToken: staleToken } },
      { name: 'password-reset-email', data: { to: recentRecipient, resetToken: recentToken } },
    ]);

    // 片方の失敗の時刻（finishedOn）を、猶予より 1 分前へ戻す
    await redis.hset(
      `bull:email-queue:${staleId}`,
      'finishedOn',
      String(Date.now() - FAILED_EMAIL_JOB_GRACE_MS - MINUTE_MS)
    );

    // 待機中と遅延のジョブは、登録の時刻を猶予より前にしても消さない
    const inspector: Queue = createEmailQueue(redisUrl);
    let waitingId: string;
    let delayedId: string;
    try {
      const waiting = await inspector.add('invitation-email', {
        to: 'waiting@failed-cleanup.example.com',
        invitationToken: 'waiting-token-6e02bb',
      });
      const delayed = await inspector.add(
        'password-reset-email',
        { to: 'delayed@failed-cleanup.example.com', resetToken: 'delayed-token-c81f47' },
        { delay: FAILED_EMAIL_JOB_GRACE_MS }
      );
      waitingId = String(waiting.id);
      delayedId = String(delayed.id);
      const oldTimestamp = String(Date.now() - 2 * FAILED_EMAIL_JOB_GRACE_MS);
      for (const id of [waitingId, delayedId]) {
        await redis.hset(`bull:email-queue:${id}`, 'timestamp', oldTimestamp);
      }

      // 走査が実際にジョブを観測できる（この DB に接続している）ことの確認
      const dumpBefore = await dumpQueueKeys();
      expect(dumpBefore).toContain(staleToken);
      expect(dumpBefore).toContain(staleRecipient);
      expect(await inspector.getFailedCount()).toBe(2);
    } finally {
      await inspector.close();
    }

    const result = await cleanupFailedEmailJobs(() => createEmailQueue(redisUrl));

    expect(result).toEqual({ failedEmailJobsRemoved: 1 });

    // 猶予を過ぎた失敗のジョブは、内容ごと Redis に残らない
    expect(await redis.exists(`bull:email-queue:${staleId}`)).toBe(0);
    expect(await redis.zrange('bull:email-queue:failed', 0, -1)).toEqual([recentId]);
    const dumpAfter = await dumpQueueKeys();
    expect(dumpAfter).not.toContain(staleToken);
    expect(dumpAfter).not.toContain(staleRecipient);

    // 猶予内の失敗のジョブ、待機中のジョブ、遅延のジョブは残る
    expect(dumpAfter).toContain(recentToken);
    expect(await redis.exists(`bull:email-queue:${recentId}`)).toBe(1);
    expect(await redis.lrange('bull:email-queue:wait', 0, -1)).toEqual([waitingId]);
    expect(await redis.zrange('bull:email-queue:delayed', 0, -1)).toEqual([delayedId]);
    expect(await redis.exists(`bull:email-queue:${waitingId}`)).toBe(1);
    expect(await redis.exists(`bull:email-queue:${delayedId}`)).toBe(1);
  });

  it('二度目の実行は、残ったジョブを変えない（冪等）', async () => {
    const [failedId] = await createFailedJobs([
      { name: 'invitation-email', data: { to: 'idem@failed-cleanup.example.com' } },
    ]);
    await redis.hset(
      `bull:email-queue:${failedId}`,
      'finishedOn',
      String(Date.now() - FAILED_EMAIL_JOB_GRACE_MS - MINUTE_MS)
    );

    await expect(cleanupFailedEmailJobs(() => createEmailQueue(redisUrl))).resolves.toEqual({
      failedEmailJobsRemoved: 1,
    });
    const afterFirst = await dumpQueueKeys();

    await expect(cleanupFailedEmailJobs(() => createEmailQueue(redisUrl))).resolves.toEqual({
      failedEmailJobsRemoved: 0,
    });
    expect(await dumpQueueKeys()).toBe(afterFirst);
  });
});
