/**
 * @fileoverview メールキューのジョブの後始末の統合検証（タスク44.8）
 *
 * 本番と同じ組み立て（createEmailQueue が REDIS_URL で作る Bull キューと、EmailService が登録する
 * 送信の処理・failed の受け手）を実 Redis に対して動かし、送信の完了の後も、再試行の上限での最終の
 * 失敗の後も、宛先とトークンを含むジョブが Redis（`bull:email-queue:*`）に残らないことを確かめる。
 * 差し替えるのは SMTP の送信（nodemailer の transporter）だけである。
 *
 * 試験の backend（tsx watch）も同じ REDIS_URL の論理 DB で `email-queue` の処理を登録しているため、
 * 同じ DB ではジョブを横取りされうる。ここでは接続の情報（ホスト・ポート・認証情報）は REDIS_URL の
 * ままに、論理 DB だけを専用の番号へ替える。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import type { Job, Queue } from 'bull';
import type { Transporter } from 'nodemailer';
import { EmailService, createEmailQueue } from '../../services/email.service.js';
import logger from '../../utils/logger.js';

const QUEUE_KEY_PATTERN = 'bull:email-queue:*';
/** 稼働中の試験の backend のワーカーと混ざらない、この検証の専用の論理 DB */
const ISOLATED_REDIS_DB = 14;
const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };

/**
 * REDIS_URL の論理 DB だけを替えた接続先を作る（未設定なら検証を失敗させる）
 */
function isolatedRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for the email queue integration test');
  }
  const url = new URL(redisUrl);
  url.pathname = `/${ISOLATED_REDIS_DB}`;
  return url.toString();
}

describe('メールキューのジョブの後始末（統合・実 Redis）', () => {
  const redisUrl = isolatedRedisUrl();
  let redis: Redis;
  let queue: Queue;
  let sendMail: ReturnType<typeof vi.fn>;
  let emailService: EmailService;

  /**
   * `bull:email-queue:*` の全てのキーの名前と内容を一つの文字列にする
   */
  async function dumpQueueKeys(): Promise<string> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await redis.scan(cursor, 'MATCH', QUEUE_KEY_PATTERN, 'COUNT', 1000);
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');

    const parts: string[] = [];
    for (const key of keys) {
      const type = await redis.type(key);
      let content: unknown;
      if (type === 'string') {
        content = await redis.get(key);
      } else if (type === 'hash') {
        content = await redis.hgetall(key);
      } else if (type === 'list') {
        content = await redis.lrange(key, 0, -1);
      } else if (type === 'set') {
        content = await redis.smembers(key);
      } else if (type === 'zset') {
        content = await redis.zrange(key, 0, -1, 'WITHSCORES');
      } else {
        content = `<${type}>`;
      }
      parts.push(`${key} ${JSON.stringify(content)}`);
    }
    return parts.join('\n');
  }

  async function deleteQueueKeys(): Promise<void> {
    const keys = await redis.keys(QUEUE_KEY_PATTERN);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  beforeAll(async () => {
    redis = new Redis(redisUrl);
    await deleteQueueKeys();
  });

  afterAll(async () => {
    await deleteQueueKeys();
    await redis.quit();
  });

  /**
   * 本番と同じ組み立てでキューと EmailService を作り、接続の完了を待つ
   * @param settings - 検証からだけ渡すキューの設定（既定は本番と同じ）
   */
  async function startQueue(settings: Parameters<typeof createEmailQueue>[1] = {}): Promise<void> {
    queue = createEmailQueue(redisUrl, settings);
    emailService = new EmailService({ sendMail } as unknown as Transporter, queue);
    await queue.isReady();
  }

  beforeEach(async () => {
    await deleteQueueKeys();
    sendMail = vi.fn();
  });

  afterEach(async () => {
    await queue.close();
    vi.restoreAllMocks();
  });

  /**
   * @requirement user-authentication/REQ-45.2: 送信が完了したジョブの宛先とトークンが Redis に残らない
   */
  it('送信の完了の後、宛先とトークンを含むジョブが Redis に残らない', async () => {
    const recipient = 'complete-recipient@queue-cleanup.example.com';
    const resetToken = 'queue-cleanup-complete-token-7f3a9c';
    let dumpDuringSend = '';
    sendMail.mockImplementation(async () => {
      // 送信の最中（ジョブの処理中）は、ジョブの内容がこの DB にある
      dumpDuringSend = await dumpQueueKeys();
      return { messageId: 'queue-cleanup-complete' };
    });
    await startQueue();
    const completed = new Promise<Job>((resolve) => queue.once('completed', resolve));

    await emailService.sendPasswordResetEmail(recipient, resetToken);
    const job = await completed;

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: recipient }));
    // 走査が実際にジョブを観測できる（この DB に接続している）ことの確認
    expect(dumpDuringSend).toContain(resetToken);
    expect(dumpDuringSend).toContain(recipient);

    expect(await redis.exists(`bull:email-queue:${job.id}`)).toBe(0);
    const dumpAfter = await dumpQueueKeys();
    expect(dumpAfter).not.toContain(resetToken);
    expect(dumpAfter).not.toContain(recipient);
  });

  /**
   * @requirement user-authentication/REQ-45.3: 再試行の上限で失敗したジョブを、トークンを含まない形で記録してから消す
   */
  it('再試行の上限までの失敗の後、失敗をトークンを含まない形で記録し、宛先とトークンを含むジョブが Redis に残らない', async () => {
    const recipient = 'failed-recipient@queue-cleanup.example.org';
    const invitationToken = 'queue-cleanup-failed-token-2b8e41';
    // 前のテストの呼び出しを持ち越さない（同じメソッドへの spyOn は同じ spy を返す）
    const errorLog = vi.spyOn(logger, 'error');
    errorLog.mockClear();
    sendMail.mockRejectedValue(
      new Error(`SMTP 550 rejected ${recipient}: /register?token=${invitationToken}`)
    );

    await startQueue();

    // 再試行の待ち（1分〜6時間）を待たず、遅延に移ったジョブをすぐに再試行へ戻す
    const dumpsWhileRetrying: string[] = [];
    queue.on('failed', (job: Job) => {
      if (job.attemptsMade < (job.opts.attempts ?? 1)) {
        void (async () => {
          dumpsWhileRetrying.push(await dumpQueueKeys());
          await job.promote();
        })();
      }
    });

    await emailService.sendInvitationEmail(recipient, invitationToken);

    await vi.waitFor(() => {
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({ jobType: 'invitation-email' }),
        expect.any(String)
      );
    }, WAIT_OPTIONS);
    await vi.waitFor(async () => {
      expect(await dumpQueueKeys()).not.toContain(invitationToken);
    }, WAIT_OPTIONS);

    // 初回 + 再試行 5 回のすべてで送信を試みた
    expect(sendMail).toHaveBeenCalledTimes(6);
    // 再試行の待ちの間は、ジョブの内容がこの DB にある（走査が観測できることの確認）
    expect(dumpsWhileRetrying).toHaveLength(5);
    expect(dumpsWhileRetrying[0]).toContain(invitationToken);
    expect(dumpsWhileRetrying[0]).toContain(recipient);

    // 失敗の記録は種別・宛先のドメイン・理由だけで、トークンと宛先の全体を含まない
    const finalRecord = errorLog.mock.calls.find(
      ([record]) => (record as { jobType?: string }).jobType === 'invitation-email'
    )?.[0];
    expect(finalRecord).toEqual(
      expect.objectContaining({
        jobType: 'invitation-email',
        recipientDomains: ['queue-cleanup.example.org'],
        attemptsMade: 6,
      })
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(invitationToken);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(recipient);

    const dumpAfter = await dumpQueueKeys();
    expect(dumpAfter).not.toContain(invitationToken);
    expect(dumpAfter).not.toContain(recipient);
  }, 30_000);

  /**
   * @requirement user-authentication/REQ-45.3: 止まったジョブ（stalled）が最終の失敗になったときも、トークンを含まない形で記録してから消す
   */
  it('処理の途中で止まったジョブが失敗へ移った後、記録され、宛先とトークンを含むジョブが Redis に残らない', async () => {
    const recipient = 'stalled-recipient@queue-cleanup.example.net';
    const resetToken = 'queue-cleanup-stalled-token-5d1c07';
    // 前のテストの呼び出しを持ち越さない（同じメソッドへの spyOn は同じ spy を返す）
    const errorLog = vi.spyOn(logger, 'error');
    errorLog.mockClear();
    let dumpDuringSend = '';
    // 送信が戻らない（処理中のワーカーが停止した状態の再現）
    let rejectHangingSend: (reason: Error) => void = () => undefined;
    sendMail.mockImplementation(async () => {
      dumpDuringSend = await dumpQueueKeys();
      return new Promise<never>((_, reject) => {
        rejectHangingSend = reject;
      });
    });
    // ロックを延長させず（lockRenewTime を長く）1 秒で切らし、最初の停止の検出で失敗の集合へ移す
    await startQueue({
      lockDuration: 1000,
      lockRenewTime: 600_000,
      stalledInterval: 300,
      maxStalledCount: 0,
    });

    try {
      await emailService.sendPasswordResetEmail(recipient, resetToken);

      await vi.waitFor(() => {
        expect(errorLog).toHaveBeenCalledWith(
          expect.objectContaining({
            jobType: 'password-reset-email',
            reason: 'job stalled more than allowable limit',
          }),
          'Email job failed after the final attempt'
        );
      }, WAIT_OPTIONS);
      await vi.waitFor(async () => {
        expect(await dumpQueueKeys()).not.toContain(resetToken);
      }, WAIT_OPTIONS);

      expect(sendMail).toHaveBeenCalledTimes(1);
      // 走査が実際にジョブを観測できる（この DB に接続している）ことの確認
      expect(dumpDuringSend).toContain(resetToken);
      expect(dumpDuringSend).toContain(recipient);

      const finalRecord = errorLog.mock.calls.find(
        ([, message]) => message === 'Email job failed after the final attempt'
      )?.[0];
      expect(finalRecord).toEqual(
        expect.objectContaining({
          recipientDomains: ['queue-cleanup.example.net'],
          attemptsMade: 0,
        })
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(resetToken);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(recipient);

      const dumpAfter = await dumpQueueKeys();
      expect(dumpAfter).not.toContain(resetToken);
      expect(dumpAfter).not.toContain(recipient);
    } finally {
      // 止まった処理を終わらせ、afterEach のキューの close が処理中のジョブを待ち続けないようにする
      rejectHangingSend(new Error('worker stopped'));
    }
  }, 30_000);
});
