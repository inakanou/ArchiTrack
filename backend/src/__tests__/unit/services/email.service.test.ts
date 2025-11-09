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
import { EmailService } from '../../../services/email.service';
import type { Queue } from 'bull';
import type { Transporter } from 'nodemailer';

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
    };

    // EmailServiceのインスタンス作成（モックを注入）
    emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendInvitationEmail', () => {
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
          attempts: 5,
          backoff: expect.objectContaining({
            type: 'exponential',
          }),
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
          attempts: 5,
          backoff: expect.objectContaining({
            type: 'exponential',
          }),
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
    it('2FA有効化メールをキューに追加する', async () => {
      const to = 'user@example.com';

      await emailService.send2FAEnabledEmail(to);

      expect(mockQueue.add).toHaveBeenCalledWith(
        '2fa-enabled-email',
        {
          to,
        },
        expect.objectContaining({
          attempts: 5,
          backoff: expect.objectContaining({
            type: 'exponential',
          }),
        })
      );
    });
  });

  describe('リトライロジック', () => {
    it('メール送信失敗時に5回リトライする設定がある', async () => {
      const to = 'user@example.com';
      const invitationToken = 'test-token';

      await emailService.sendInvitationEmail(to, invitationToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
        })
      );
    });

    it('エクスポネンシャルバックオフでリトライする', async () => {
      const to = 'user@example.com';
      const invitationToken = 'test-token';

      await emailService.sendInvitationEmail(to, invitationToken);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: expect.objectContaining({
            type: 'exponential',
            delay: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('メール送信エラーをキャッチする', async () => {
      const error = new Error('SMTP connection failed');
      (mockTransporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      // キューのprocessコールバックをシミュレート
      const processCallback = vi.fn();
      (mockQueue.process as ReturnType<typeof vi.fn>).mockImplementation((_name, callback) => {
        processCallback.mockImplementation(callback);
      });

      emailService = new EmailService(mockTransporter as Transporter, mockQueue as Queue);

      const job = {
        data: { to: 'user@example.com', invitationToken: 'token' },
      };

      await expect(processCallback(job)).rejects.toThrow('SMTP connection failed');
    });
  });
});
