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

  describe('sendAdminRoleChangedAlert', () => {
    it('システム管理者ロール変更アラートメールをキューに追加する', async () => {
      const adminEmails = ['admin1@example.com', 'admin2@example.com'];
      const targetUser = {
        email: 'user@example.com',
        displayName: 'Test User',
      };
      const action = 'assigned' as const;
      const roleName = 'System Administrator';
      const performedBy = {
        email: 'superadmin@example.com',
        displayName: 'Super Admin',
      };

      await emailService.sendAdminRoleChangedAlert(
        adminEmails,
        targetUser,
        action,
        roleName,
        performedBy
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'admin-role-changed-alert',
        {
          adminEmails,
          targetUser,
          action,
          roleName,
          performedBy,
        },
        expect.objectContaining({
          attempts: 5,
          backoff: expect.objectContaining({
            type: 'exponential',
          }),
        })
      );
    });

    it('複数の管理者にアラートメールを送信する', async () => {
      const adminEmails = ['admin1@example.com', 'admin2@example.com', 'admin3@example.com'];
      const targetUser = {
        email: 'user@example.com',
        displayName: 'Test User',
      };
      const action = 'revoked' as const;
      const roleName = 'System Administrator';
      const performedBy = {
        email: 'superadmin@example.com',
        displayName: 'Super Admin',
      };

      await emailService.sendAdminRoleChangedAlert(
        adminEmails,
        targetUser,
        action,
        roleName,
        performedBy
      );

      expect(mockQueue.add).toHaveBeenCalled();
      const callArgs = (mockQueue.add as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1].adminEmails).toHaveLength(3);
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
        | ((job: { data: { to: string; invitationToken: string } }) => Promise<void>)
        | null = null;
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
          | ((job: { data: { to: string; invitationToken: string } }) => Promise<void>)
          | null = null;
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
          | ((job: { data: { to: string; resetToken: string } }) => Promise<void>)
          | null = null;
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
