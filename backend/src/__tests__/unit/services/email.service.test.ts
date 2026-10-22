/**
 * @fileoverview メール送信サービスの単体テスト
 *
 * Requirements:
 * - 1.3: 招待トークンが生成されると招待メールを送信
 * - 1.6: 招待URLをメール本文に含める
 * - 7.1: パスワードリセット要求でメール送信
 * - 24.3: メール送信失敗時に最大5回リトライ
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EmailService } from '../../../services/email.service.js';
import type { Queue } from 'bull';
import type { Transporter } from 'nodemailer';
import logger from '../../../utils/logger.js';
import { captureException } from '../../../utils/sentry.js';

// nodemailerのモック
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

// bullのモック
vi.mock('bull', () => ({
  default: vi.fn(),
}));

// Sentry 送信のモック（送った内容を観測する）
vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

// fsのモック
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// handlebarsのモック
vi.mock('handlebars', () => ({
  default: {
    compile: vi.fn(),
  },
}));

describe('EmailService', () => {
  let emailService: EmailService;
  let mockTransporter: Partial<Transporter>;
  let mockQueue: Partial<Queue>;

  beforeEach(() => {
    // Transporterのモック
    mockTransporter = {
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    };

    // Queueのモック
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
      process: vi.fn(),
      on: vi.fn(),
    };

    // EmailServiceのインスタンス作成（モックを注入）
    emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendInvitationEmail', () => {
    /**
     * @requirement user-authentication/REQ-24.3: メール送信をキューに保存し、初回に続けて最大5回まで再送する戦略で投入する
     */
    it('招待メールをキューに追加する', async () => {
      const to = 'newuser@example.com';
      const invitationToken = 'test-invitation-token-123';

      await emailService.sendInvitationEmail(to, invitationToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'invitation-email',
        {
          to,
          invitationToken,
        },
        expect.objectContaining({
          attempts: 6,
          backoff: { type: 'email-retry-schedule' },
        })
      );
    });

    it('招待メールのジョブ名が正しい', async () => {
      const to = 'newuser@example.com';
      const invitationToken = 'test-invitation-token-123';

      await emailService.sendInvitationEmail(to, invitationToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'invitation-email',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    /**
     * @requirement user-authentication/REQ-24.3: メール送信をキューに保存し、初回に続けて最大5回まで再送する戦略で投入する
     */
    it('パスワードリセットメールをキューに追加する', async () => {
      const to = 'user@example.com';
      const resetToken = 'test-reset-token-456';

      await emailService.sendPasswordResetEmail(to, resetToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'password-reset-email',
        {
          to,
          resetToken,
        },
        expect.objectContaining({
          attempts: 6,
          backoff: { type: 'email-retry-schedule' },
        })
      );
    });

    it('パスワードリセットメールのジョブ名が正しい', async () => {
      const to = 'user@example.com';
      const resetToken = 'test-reset-token-456';

      await emailService.sendPasswordResetEmail(to, resetToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'password-reset-email',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('send2FAEnabledEmail', () => {
    /**
     * @requirement user-authentication/REQ-24.3: メール送信をキューに保存し、初回に続けて最大5回まで再送する戦略で投入する
     */
    it('2FA有効化メールをキューに追加する', async () => {
      const to = 'user@example.com';

      await emailService.send2FAEnabledEmail(to);

      expect(mockQueue.add).toHaveBeenCalledWith(
        '2fa-enabled-email',
        {
          to,
        },
        expect.objectContaining({
          attempts: 6,
          backoff: { type: 'email-retry-schedule' },
        })
      );
    });
  });

  describe('sendAdminNotificationEmail', () => {
    /**
     * @requirement user-authentication/REQ-24.3: メール送信をキューに保存し、初回に続けて最大5回まで再送する戦略で投入する
     */
    it('システム管理者への通知メールを宛先ごとのジョブとしてキューに追加する', async () => {
      const lines = ['対象: 対象 太郎 (target@example.com)', '理由: 退職'];

      await emailService.sendAdminNotificationEmail('admin1@example.com', '件名', lines);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'admin-notification-email',
        { to: 'admin1@example.com', subject: '件名', lines },
        expect.objectContaining({
          attempts: 6,
          backoff: { type: 'email-retry-schedule' },
        })
      );
    });
  });

  describe('リトライロジック', () => {
    /**
     * 本番の経路（依存を注入しない生成）で Bull キューへ渡した設定を取り出す
     */
    const createQueueSettings = async () => {
      const Bull = (await import('bull')).default as unknown as ReturnType<typeof vi.fn>;
      Bull.mockImplementation(function () {
        return { add: vi.fn(), process: vi.fn(), on: vi.fn() };
      });
      new EmailService();
      const options = Bull.mock.calls[0]?.at(-1) as {
        settings?: {
          backoffStrategies?: Record<string, (attemptsMade: number, err: Error) => number>;
        };
      };
      return options.settings;
    };

    /**
     * @requirement user-authentication/REQ-24.3: 初回の送信に続けて最大5回までリトライする（試行は計6回）
     */
    it('メール送信失敗時に初回に続けて5回リトライする設定がある', async () => {
      const to = 'user@example.com';
      const invitationToken = 'test-token';

      await emailService.sendInvitationEmail(to, invitationToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 6,
        })
      );
    });

    /**
     * @requirement user-authentication/REQ-24.3: リトライの間隔を1分、5分、15分、1時間、6時間後とする
     */
    it.each([
      [1, 60000],
      [2, 300000],
      [3, 900000],
      [4, 3600000],
      [5, 21600000],
    ])('%i 回目の失敗の後は %i ミリ秒後に再送する', async (attemptsMade, expectedDelay) => {
      const settings = await createQueueSettings();
      const strategy = settings?.backoffStrategies?.['email-retry-schedule'];

      expect(strategy).toBeTypeOf('function');
      expect(strategy!(attemptsMade, new Error('SMTP timeout'))).toBe(expectedDelay);
    });
  });

  describe('キューの接続とジョブの後始末（要件45）', () => {
    type QueueHandler = (...args: unknown[]) => unknown;

    /**
     * 本番の経路（依存を注入しない生成）で Bull キューを作り、生成の引数と登録されたイベントの受け手を取り出す
     */
    const createProductionQueue = async () => {
      const Bull = (await import('bull')).default as unknown as ReturnType<typeof vi.fn>;
      const handlers: Record<string, QueueHandler> = {};
      Bull.mockImplementation(function () {
        return {
          add: vi.fn(),
          process: vi.fn(),
          on: vi.fn((event: string, handler: QueueHandler) => {
            handlers[event] = handler;
          }),
        };
      });
      new EmailService();
      return { args: Bull.mock.calls.at(-1) ?? [], handlers };
    };

    /**
     * キューを注入して EmailService を作り、そのキューに登録されたイベントの受け手を取り出す
     */
    const handlersOf = (queue: Partial<Queue>): Record<string, QueueHandler> => {
      const on = queue.on as ReturnType<typeof vi.fn>;
      on.mockClear();
      new EmailService(mockTransporter as Transporter, queue as Queue);
      const handlers: Record<string, QueueHandler> = {};
      for (const [event, handler] of on.mock.calls) {
        handlers[event as string] = handler as QueueHandler;
      }
      return handlers;
    };

    const failedJob = (overrides: Record<string, unknown> = {}) => ({
      id: 'job-1',
      name: 'password-reset-email',
      data: { to: 'victim@corp.example.com', resetToken: 'secret-reset-token-xyz' },
      opts: { attempts: 6 },
      attemptsMade: 6,
      // 失敗の集合にある（最終の失敗）。再試行の待ちのジョブは遅延の集合にあり false
      isFailed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    beforeEach(() => {
      vi.stubEnv('REDIS_HOST', 'legacy-redis-host');
      vi.stubEnv('REDIS_PORT', '6390');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /**
     * @requirement user-authentication/REQ-45.1: メールキューへキャッシュ基盤と同じ接続情報（認証情報を含む）で接続する
     */
    it('メールキューをキャッシュ基盤と同じ REDIS_URL（認証情報と論理 DB を含む）で接続し、REDIS_HOST・REDIS_PORT を使わない', async () => {
      vi.stubEnv('REDIS_URL', 'redis://default:s3cret@cache.internal:6385/2');

      const { args } = await createProductionQueue();

      expect(args[0]).toBe('email-queue');
      expect(args[1]).toBe('redis://default:s3cret@cache.internal:6385/2');
      expect(JSON.stringify(args[2] ?? {})).not.toContain('legacy-redis-host');
      expect(JSON.stringify(args[2] ?? {})).not.toContain('6390');
    });

    /**
     * @requirement user-authentication/REQ-45.1: TLS の接続先（rediss）でも同じ接続情報で接続する
     */
    it('接続先が rediss のときは TLS で接続する', async () => {
      vi.stubEnv('REDIS_URL', 'rediss://default:s3cret@cache.internal:6385');

      const { args } = await createProductionQueue();

      expect(args[1]).toBe('rediss://default:s3cret@cache.internal:6385');
      expect(args[2]).toEqual(expect.objectContaining({ redis: { tls: {} } }));
    });

    /**
     * @requirement user-authentication/REQ-45.2: 送信が完了したジョブ（宛先とトークンを含む）を消す
     */
    it('ジョブの既定で、完了したジョブを消す', async () => {
      vi.stubEnv('REDIS_URL', 'redis://cache.internal:6379');

      const { args } = await createProductionQueue();

      expect(args[2]).toEqual(
        expect.objectContaining({
          defaultJobOptions: expect.objectContaining({ removeOnComplete: true }),
        })
      );
    });

    /**
     * @requirement user-authentication/REQ-45.3: 再試行の上限で失敗したジョブを、トークンを含まない形で記録してから消す
     */
    it('最終の試行の失敗で、種別・宛先のドメイン・理由だけを記録して Sentry へ送り、ジョブを消す', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);
      const job = failedJob();
      const error = new Error(
        'SMTP rejected https://app.example.com/password-reset?token=secret-reset-token-xyz for victim@corp.example.com'
      );

      await handlers.failed!(job, error);

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledTimes(1);
      const [record] = errorLog.mock.calls[0]!;
      expect(record).toEqual(
        expect.objectContaining({
          jobType: 'password-reset-email',
          recipientDomains: ['corp.example.com'],
          attemptsMade: 6,
        })
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret-reset-token-xyz');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('victim@corp.example.com');

      expect(captureException).toHaveBeenCalledTimes(1);
      const [sentError, context] = vi.mocked(captureException).mock.calls[0]!;
      expect(context).toEqual(
        expect.objectContaining({
          jobType: 'password-reset-email',
          recipientDomains: ['corp.example.com'],
        })
      );
      const sent = JSON.stringify({ message: sentError.message, stack: sentError.stack, context });
      expect(sent).not.toContain('secret-reset-token-xyz');
      expect(sent).not.toContain('victim@corp.example.com');
    });

    /**
     * @requirement user-authentication/REQ-45.3: 招待のトークンも失敗の記録に含めない
     */
    it('招待メールの最終の失敗でも招待のトークンを記録に含めない', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);
      const job = failedJob({
        name: 'invitation-email',
        data: { to: 'invitee@partner.example.org', invitationToken: 'secret-invite-token-abc' },
      });

      await handlers.failed!(job, new Error('Invalid token secret-invite-token-abc'));

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0]![0]).toEqual(
        expect.objectContaining({
          jobType: 'invitation-email',
          recipientDomains: ['partner.example.org'],
        })
      );
      const recorded = JSON.stringify([
        errorLog.mock.calls,
        vi.mocked(captureException).mock.calls,
      ]);
      expect(recorded).not.toContain('secret-invite-token-abc');
      expect(recorded).not.toContain('invitee@partner.example.org');
    });

    /**
     * @requirement user-authentication/REQ-45.3: 再試行の残るジョブは消さず、失敗としても記録しない
     */
    it('再試行が残る失敗では、ジョブを消さず、Sentry へも送らない', async () => {
      const handlers = handlersOf(mockQueue);
      const errorLog = vi.spyOn(logger, 'error');
      const job = failedJob({ attemptsMade: 3, isFailed: vi.fn().mockResolvedValue(false) });

      await handlers.failed!(job, new Error('SMTP timeout'));

      expect(job.remove).not.toHaveBeenCalled();
      expect(captureException).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-45.3: 止まったジョブ（stalled）の最終の失敗も、トークンを含まない形で記録してから消す
     */
    it('止まったジョブが失敗の集合へ移ったとき（試行の回数は増えない）も、記録してから消す', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);
      const job = failedJob({ attemptsMade: 0 });

      await handlers.failed!(job, new Error('job stalled more than allowable limit'));

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(
        {
          jobType: 'password-reset-email',
          recipientDomains: ['corp.example.com'],
          attemptsMade: 0,
          reason: 'job stalled more than allowable limit',
        },
        'Email job failed after the final attempt'
      );
      expect(captureException).toHaveBeenCalledTimes(1);
      const recorded = JSON.stringify([
        errorLog.mock.calls,
        vi.mocked(captureException).mock.calls,
      ]);
      expect(recorded).not.toContain('secret-reset-token-xyz');
      expect(recorded).not.toContain('victim@corp.example.com');
    });

    /**
     * @requirement user-authentication/REQ-45.3: 止まったジョブの通知でジョブを読めなかったとき（null）は何もせず、例外を漏らさない
     */
    it('ジョブが null のときは例外を投げず、記録もしない', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);

      await expect(
        handlers.failed!(null, new Error('job stalled more than allowable limit'))
      ).resolves.toBeUndefined();

      expect(captureException).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-45.3: 失敗の処理そのものが失敗しても例外を漏らさず、トークンと宛先を記録に含めない
     */
    it('失敗の処理で例外が起きても、例外を漏らさず、トークンと宛先を含めずに記録する', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);
      const job = failedJob({
        isFailed: vi
          .fn()
          .mockRejectedValue(new Error('READONLY victim@corp.example.com secret-reset-token-xyz')),
      });

      await expect(handlers.failed!(job, new Error('SMTP timeout'))).resolves.toBeUndefined();

      expect(job.remove).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({ jobType: 'password-reset-email' }),
        'Failed to handle the failed email job'
      );
      const recorded = JSON.stringify([
        errorLog.mock.calls,
        vi.mocked(captureException).mock.calls,
      ]);
      expect(recorded).not.toContain('secret-reset-token-xyz');
      expect(recorded).not.toContain('victim@corp.example.com');
    });

    /**
     * @requirement user-authentication/REQ-45.3: 大文字・小文字を変えた宛先とトークンも失敗の理由から伏せる
     */
    it('大文字・小文字の違う宛先とトークン（正規表現の特殊文字を含む）を理由から伏せる', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);
      const job = failedJob({
        data: { to: 'Victim+tag@Corp.Example.com', resetToken: 'a.b*c(d)Token' },
      });

      await handlers.failed!(
        job,
        new Error('550 VICTIM+TAG@CORP.EXAMPLE.COM rejected; token A.B*C(D)TOKEN; axbxc(d)token')
      );

      const reason = (errorLog.mock.calls[0]![0] as { reason: string }).reason;
      expect(reason.toLowerCase()).not.toContain('victim+tag@corp.example.com');
      expect(reason.toLowerCase()).not.toContain('a.b*c(d)token');
      // 特殊文字を正規表現として解釈しない（似た別の文字列は伏せない）
      expect(reason).toContain('axbxc(d)token');
      expect(reason).toContain('[REDACTED]');
    });

    /**
     * @requirement user-authentication/REQ-45.1: 接続先が未設定のとき（開発のみ。本番は起動前の検査で止まる）は既定の接続先を使い、警告を残す
     */
    it('REDIS_URL が未設定のときは警告を残し、同じジョブの既定でキューを作る', async () => {
      vi.stubEnv('REDIS_URL', '');
      const warnLog = vi.spyOn(logger, 'warn');

      const { args } = await createProductionQueue();

      expect(args).toHaveLength(2);
      expect(args[1]).toEqual(
        expect.objectContaining({
          defaultJobOptions: expect.objectContaining({ removeOnComplete: true }),
        })
      );
      expect(JSON.stringify(args[1])).not.toContain('legacy-redis-host');
      expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL'));
    });

    it('SMTP の認証情報があるときは transporter に渡す', async () => {
      vi.stubEnv('SMTP_USER', 'mailer');
      vi.stubEnv('SMTP_PASS', 'mailer-pass');
      const nodemailer = (await import('nodemailer')).default;

      await createProductionQueue();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: { user: 'mailer', pass: 'mailer-pass' } })
      );
    });

    /**
     * @requirement user-authentication/REQ-45.3: 管理者への通知の最終の失敗は、宛先のドメインだけを記録する
     */
    it('管理者への通知の最終の失敗で、宛先のドメインを重複なく記録し、ジョブを消す', async () => {
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);
      const job = failedJob({
        name: 'admin-role-changed-alert',
        data: {
          adminEmails: ['a@corp.example.com', 'b@Corp.Example.com', 'c@other.example.net'],
          targetUser: { email: 'user@example.com', displayName: 'User' },
        },
        opts: {},
        attemptsMade: 1,
      });

      await handlers.failed!(job, undefined as unknown as Error);

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0]![0]).toEqual({
        jobType: 'admin-role-changed-alert',
        recipientDomains: ['corp.example.com', 'other.example.net'],
        attemptsMade: 1,
        reason: 'Unknown reason',
      });
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('a@corp.example.com');
    });

    /**
     * @requirement user-authentication/REQ-45.3: 失敗したジョブを消せなかったときは、内容を含めずに記録する
     */
    it.each([
      [new Error('Could not remove job job-1'), 'Could not remove job job-1'],
      ['lock is held', 'lock is held'],
    ])(
      'ジョブを消せなかったとき（%s）はその旨をトークンを含めずに記録する',
      async (thrown, reason) => {
        const errorLog = vi.spyOn(logger, 'error');
        const handlers = handlersOf(mockQueue);
        const job = failedJob({ remove: vi.fn().mockRejectedValue(thrown) });

        await handlers.failed!(job, new Error('SMTP timeout'));

        expect(errorLog).toHaveBeenLastCalledWith(
          { jobType: 'password-reset-email', reason },
          'Failed to remove the failed email job'
        );
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret-reset-token-xyz');
      }
    );

    /**
     * @requirement user-authentication/REQ-45.4: 本番でメールキューへ接続できないとき、エラー監視へ通知する
     */
    it('本番でキューの接続のエラーを受けたら Sentry へ送る', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const handlers = handlersOf(mockQueue);
      const error = new Error('connect ECONNREFUSED 10.0.0.5:6379');

      handlers.error!(error);

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ queue: 'email-queue' })
      );
    });

    /**
     * @requirement user-authentication/REQ-45.4: 本番以外ではキューのエラーをエラー監視へ送らず、記録だけを残す
     */
    it('本番以外ではキューのエラーを Sentry へ送らず、エラーログに残す', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      const errorLog = vi.spyOn(logger, 'error');
      const handlers = handlersOf(mockQueue);

      handlers.error!(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

      expect(captureException).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('エラーハンドリング', () => {
    it('メール送信エラーをキャッチする', async () => {
      // Arrange
      const { readFileSync } = await import('fs');
      const Handlebars = await import('handlebars');

      const mockTemplate = vi.fn().mockReturnValue('<html>Email</html>');
      (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>Template</html>');

      const error = new Error('SMTP connection failed');
      (mockTransporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      // キューのprocessコールバックをシミュレート
      let invitationCallback:
        ((job: { data: { to: string; invitationToken: string } }) => Promise<void>) | null = null;
      (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
        if (name === 'invitation-email') {
          invitationCallback = callback;
        }
      });

      emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

      const job = {
        data: { to: 'user@example.com', invitationToken: 'token' },
      };

      // Act & Assert
      expect(invitationCallback).toBeDefined();
      await expect(invitationCallback!(job)).rejects.toThrow('SMTP connection failed');
    });
  });

  describe('processメソッド（実際のメール送信処理）', () => {
    beforeEach(async () => {
      const { readFileSync } = await import('fs');
      const Handlebars = await import('handlebars');

      // fsとHandlebarsのモック設定
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>{{invitationUrl}}</html>');
      (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(
        vi.fn().mockReturnValue('<html>http://localhost:5173/register?token=test</html>')
      );
    });

    describe('processInvitationEmail', () => {
      it('招待メールを実際に送信する', async () => {
        // Arrange
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>Invitation Email</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
          '<html>{{invitationUrl}}</html>'
        );

        let invitationCallback:
          ((job: { data: { to: string; invitationToken: string } }) => Promise<void>) | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === 'invitation-email') {
            invitationCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

        const job = {
          data: { to: 'newuser@example.com', invitationToken: 'test-token-123' },
        };

        // Act
        expect(invitationCallback).toBeDefined();
        await invitationCallback!(job);

        // Assert
        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'newuser@example.com',
            subject: 'ArchiTrackへの招待',
            html: expect.any(String),
          })
        );
        expect(mockTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            invitationUrl: expect.stringContaining('test-token-123'),
          })
        );
      });
    });

    describe('processPasswordResetEmail', () => {
      it('パスワードリセットメールを実際に送信する', async () => {
        // Arrange
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>Password Reset Email</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>{{resetUrl}}</html>');

        let passwordResetCallback:
          ((job: { data: { to: string; resetToken: string } }) => Promise<void>) | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === 'password-reset-email') {
            passwordResetCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

        const job = {
          data: { to: 'user@example.com', resetToken: 'reset-token-456' },
        };

        // Act
        expect(passwordResetCallback).toBeDefined();
        await passwordResetCallback!(job);

        // Assert
        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: 'パスワードリセットのご案内',
            html: expect.any(String),
          })
        );
        expect(mockTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            resetUrl: expect.stringContaining('reset-token-456'),
          })
        );
      });
    });

    describe('process2FAEnabledEmail', () => {
      it('2FA有効化メールを実際に送信する', async () => {
        // Arrange
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>2FA Enabled Email</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>{{frontendUrl}}</html>');

        let twoFactorCallback: ((job: { data: { to: string } }) => Promise<void>) | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === '2fa-enabled-email') {
            twoFactorCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

        const job = {
          data: { to: 'user@example.com' },
        };

        // Act
        expect(twoFactorCallback).toBeDefined();
        await twoFactorCallback!(job);

        // Assert
        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: '二要素認証が有効化されました',
            html: expect.any(String),
          })
        );
        expect(mockTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            frontendUrl: expect.any(String),
          })
        );
      });
    });

    describe('processAdminNotificationEmail', () => {
      it('システム管理者への通知メールを件名と本文の行で送信する', async () => {
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>Admin Notification</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>{{subject}}</html>');

        let notificationCallback:
          | ((job: { data: { to: string; subject: string; lines: string[] } }) => Promise<void>)
          | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === 'admin-notification-email') {
            notificationCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);
        const lines = ['対象: 対象 太郎 (target@example.com)'];

        expect(notificationCallback).toBeDefined();
        await notificationCallback!({
          data: { to: 'admin1@example.com', subject: '利用者が無効化されました', lines },
        });

        expect(readFileSync).toHaveBeenCalledWith(
          expect.stringContaining('admin-notification-email.hbs'),
          'utf-8'
        );
        expect(mockTemplate).toHaveBeenCalledWith(
          expect.objectContaining({ subject: '利用者が無効化されました', lines })
        );
        expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'admin1@example.com',
            subject: '利用者が無効化されました',
            html: '<html>Admin Notification</html>',
          })
        );
      });
    });

    describe('processAdminRoleChangedAlert', () => {
      it('システム管理者ロール付与アラートメールを送信する（action=assigned）', async () => {
        // Arrange
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>Admin Alert Email</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>Alert</html>');

        let adminAlertCallback:
          | ((job: {
              data: {
                adminEmails: string[];
                targetUser: { email: string; displayName: string };
                action: 'assigned' | 'revoked';
                roleName: string;
                performedBy: { email: string; displayName: string };
              };
            }) => Promise<void>)
          | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === 'admin-role-changed-alert') {
            adminAlertCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

        const job = {
          data: {
            adminEmails: ['admin1@example.com'],
            targetUser: { email: 'user@example.com', displayName: 'Test User' },
            action: 'assigned' as const,
            roleName: 'System Administrator',
            performedBy: { email: 'super@example.com', displayName: 'Super Admin' },
          },
        };

        // Act
        expect(adminAlertCallback).toBeDefined();
        await adminAlertCallback!(job);

        // Assert
        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'admin1@example.com',
            subject: expect.stringContaining('Test User'),
            html: expect.any(String),
          })
        );
        expect(mockTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'assigned',
            actionText: '付与',
            roleName: 'System Administrator',
          })
        );
      });

      it('システム管理者ロール剥奪アラートメールを送信する（action=revoked）', async () => {
        // Arrange
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>Admin Alert Email</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>Alert</html>');

        let adminAlertCallback:
          | ((job: {
              data: {
                adminEmails: string[];
                targetUser: { email: string; displayName: string };
                action: 'assigned' | 'revoked';
                roleName: string;
                performedBy: { email: string; displayName: string };
              };
            }) => Promise<void>)
          | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === 'admin-role-changed-alert') {
            adminAlertCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

        const job = {
          data: {
            adminEmails: ['admin1@example.com'],
            targetUser: { email: 'user@example.com', displayName: 'Test User' },
            action: 'revoked' as const,
            roleName: 'System Administrator',
            performedBy: { email: 'super@example.com', displayName: 'Super Admin' },
          },
        };

        // Act
        expect(adminAlertCallback).toBeDefined();
        await adminAlertCallback!(job);

        // Assert
        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'admin1@example.com',
            subject: expect.stringContaining('Test User'),
            html: expect.any(String),
          })
        );
        expect(mockTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'revoked',
            actionText: '剥奪',
            roleName: 'System Administrator',
          })
        );
      });

      it('複数の管理者に順次メールを送信する', async () => {
        // Arrange
        const { readFileSync } = await import('fs');
        const Handlebars = await import('handlebars');

        const mockTemplate = vi.fn().mockReturnValue('<html>Admin Alert Email</html>');
        (Handlebars.default.compile as ReturnType<typeof vi.fn>).mockReturnValue(mockTemplate);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('<html>Alert</html>');

        let adminAlertCallback:
          | ((job: {
              data: {
                adminEmails: string[];
                targetUser: { email: string; displayName: string };
                action: 'assigned' | 'revoked';
                roleName: string;
                performedBy: { email: string; displayName: string };
              };
            }) => Promise<void>)
          | null = null;
        (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((name, callback) => {
          if (name === 'admin-role-changed-alert') {
            adminAlertCallback = callback;
          }
        });

        emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

        const job = {
          data: {
            adminEmails: ['admin1@example.com', 'admin2@example.com', 'admin3@example.com'],
            targetUser: { email: 'user@example.com', displayName: 'Test User' },
            action: 'assigned' as const,
            roleName: 'System Administrator',
            performedBy: { email: 'super@example.com', displayName: 'Super Admin' },
          },
        };

        // Act
        expect(adminAlertCallback).toBeDefined();
        await adminAlertCallback!(job);

        // Assert
        expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
        expect(mockTransporter.sendMail).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ to: 'admin1@example.com' })
        );
        expect(mockTransporter.sendMail).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ to: 'admin2@example.com' })
        );
        expect(mockTransporter.sendMail).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ to: 'admin3@example.com' })
        );
      });
    });
  });
});
