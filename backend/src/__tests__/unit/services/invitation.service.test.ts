/**
 * @fileoverview 招待管理サービスの単体テスト
 *
 * Requirements:
 * - 1.1: 管理者が有効なメールアドレスを提供すると一意の招待トークンを生成
 * - 1.2: 招待トークンが生成されると7日間の有効期限を設定
 * - 1.4: 招待メールアドレスが既に登録済みの場合はエラーメッセージを返す
 * - 1.7: 管理者が招待一覧を取得すると招待ステータスを返す
 * - 1.8: 管理者が未使用の招待を取り消すと招待を無効化
 * - 2.2: 招待トークンが無効または存在しない場合はエラーメッセージを返す
 * - 2.3: 招待トークンが期限切れの場合はエラーメッセージを返す
 * - 2.4: 招待トークンが既に使用済みの場合はエラーメッセージを返す
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InvitationService,
  type InvitationEmailSender,
} from '../../../services/invitation.service.js';
import { InvitationStatus } from '../../../types/invitation.types.js';
import type { PrismaClient, Invitation } from '../../../generated/prisma/client.js';
import logger from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Prisma Clientのモック
const mockPrismaClient = {
  invitation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
} as unknown as PrismaClient;

describe('InvitationService', () => {
  let invitationService: InvitationService;

  beforeEach(() => {
    vi.clearAllMocks();
    invitationService = new InvitationService(mockPrismaClient);
  });

  describe('createInvitation', () => {
    it('一意の招待トークンを生成する', async () => {
      const inviterId = 'admin-user-id';
      const email = 'newuser@example.com';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email,
        token: 'unique-token-123',
        inviterId,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      });

      const result = await invitationService.createInvitation(inviterId, email);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.token).toBeDefined();
        expect(result.value.token.length).toBeGreaterThan(0);
      }
    });

    it('7日間の有効期限を設定する', async () => {
      const inviterId = 'admin-user-id';
      const email = 'newuser@example.com';
      const now = Date.now();

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email,
        token: 'unique-token-123',
        inviterId,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      });

      const result = await invitationService.createInvitation(inviterId, email);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expiresAt = result.value.expiresAt.getTime();
        const expectedExpiry = now + 7 * 24 * 60 * 60 * 1000;
        // 許容誤差: 1秒
        expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(1000);
      }
    });

    it('既存メールアドレスの場合はエラーを返す', async () => {
      const inviterId = 'admin-user-id';
      const email = 'existing@example.com';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-user-id',
        email,
      });

      const result = await invitationService.createInvitation(inviterId, email);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('EMAIL_ALREADY_REGISTERED');
      }
    });

    it('招待データをデータベースに保存する', async () => {
      const inviterId = 'admin-user-id';
      const email = 'newuser@example.com';

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email,
        token: 'unique-token-123',
        inviterId,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      });

      await invitationService.createInvitation(inviterId, email);

      expect(mockPrismaClient.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email,
          inviterId,
          status: InvitationStatus.PENDING,
        }),
      });
    });
  });

  /**
   * 招待メールの結線（タスク35.4）
   *
   * 招待の作成は招待メールをキューへ投入し（要件1.3）、
   * メール送信（キュー投入）が利用できなくても招待の作成は成功する（要件24.8）。
   */
  describe('createInvitation の招待メール', () => {
    const inviterId = 'admin-user-id';
    const email = 'invitee@example.com';
    let sendInvitationEmail: ReturnType<typeof vi.fn>;
    let serviceWithEmail: InvitationService;

    beforeEach(() => {
      sendInvitationEmail = vi.fn();
      const emailSender: InvitationEmailSender = {
        sendInvitationEmail: sendInvitationEmail as InvitationEmailSender['sendInvitationEmail'],
      };
      serviceWithEmail = new InvitationService(mockPrismaClient, emailSender);

      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.create as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: { data: Pick<Invitation, 'email' | 'token' | 'inviterId'> }) => ({
          id: 'invitation-1',
          ...data,
          status: InvitationStatus.PENDING,
          createdAt: new Date(),
          usedAt: null,
          userId: null,
        })
      );
    });

    /**
     * @requirement user-authentication/REQ-1.3
     */
    it('作成した招待のトークンで招待メールを対象メールアドレスへ1回投入する', async () => {
      sendInvitationEmail.mockResolvedValue(undefined);

      const result = await serviceWithEmail.createInvitation(inviterId, email);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.token).toMatch(/^[0-9a-f]{64}$/);
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
      expect(sendInvitationEmail).toHaveBeenCalledWith(email, result.value.token);
    });

    /**
     * @requirement user-authentication/REQ-24.8
     */
    it('キュー投入が失敗しても招待の作成は Ok を返し、警告ログを1回残す', async () => {
      const queueError = new Error('Redis connection refused');
      sendInvitationEmail.mockRejectedValue(queueError);

      const result = await serviceWithEmail.createInvitation(inviterId, email);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe('invitation-1');
      expect(result.value.email).toBe(email);
      expect(result.value.status).toBe(InvitationStatus.PENDING);
      expect(mockPrismaClient.invitation.create).toHaveBeenCalledTimes(1);
      expect(sendInvitationEmail).toHaveBeenCalledWith(email, result.value.token);
      await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
      expect(logger.warn).toHaveBeenCalledWith(
        { err: queueError, invitationId: 'invitation-1' },
        'Failed to queue invitation email; invitation was created'
      );
    });

    /**
     * @requirement user-authentication/REQ-24.8
     */
    it('キュー投入が応答しなくても招待の作成は投入の完了を待たずに Ok を返す', async () => {
      sendInvitationEmail.mockReturnValue(new Promise<void>(() => {}));

      const outcome = await Promise.race([
        serviceWithEmail.createInvitation(inviterId, email),
        new Promise<'TIMED_OUT'>((resolve) => setTimeout(() => resolve('TIMED_OUT'), 1000)),
      ]);

      expect(outcome).not.toBe('TIMED_OUT');
      expect(outcome).toMatchObject({ ok: true, value: { id: 'invitation-1', email } });
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    });

    it('送信口が無い構成では招待を作成し、未送信を警告ログに残す', async () => {
      const result = await invitationService.createInvitation(inviterId, email);

      expect(result.ok).toBe(true);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { invitationId: 'invitation-1' },
        'Invitation email sender is not configured; invitation email was not queued'
      );
    });
  });

  describe('validateInvitation', () => {
    it('有効な招待トークンの検証に成功する', async () => {
      const token = 'valid-token-123';
      const invitation: Invitation = {
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-id',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1日後
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );

      const result = await invitationService.validateInvitation(token);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(invitation.id);
        expect(result.value.email).toBe(invitation.email);
      }
    });

    it('無効なトークンの場合はエラーを返す', async () => {
      const token = 'invalid-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await invitationService.validateInvitation(token);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVALID_TOKEN');
      }
    });

    it('期限切れトークンの場合はエラーを返す', async () => {
      const token = 'expired-token';
      const invitation: Invitation = {
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-id',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1日前
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );

      const result = await invitationService.validateInvitation(token);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('EXPIRED_TOKEN');
      }
    });

    it('使用済みトークンの場合はエラーを返す', async () => {
      const token = 'used-token';
      const invitation: Invitation = {
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-id',
        status: InvitationStatus.USED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: new Date(),
        userId: 'user-id',
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );

      const result = await invitationService.validateInvitation(token);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USED_TOKEN');
      }
    });

    it('取り消し済みトークンの場合はエラーを返す', async () => {
      const token = 'revoked-token';
      const invitation: Invitation = {
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-id',
        status: InvitationStatus.REVOKED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );

      const result = await invitationService.validateInvitation(token);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('REVOKED_TOKEN');
      }
    });
  });

  describe('revokeInvitation', () => {
    it('未使用の招待を取り消す', async () => {
      const invitationId = 'invitation-1';
      const userId = 'admin-id';
      const invitation: Invitation = {
        id: invitationId,
        email: 'user@example.com',
        token: 'token-123',
        inviterId: userId,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );
      (mockPrismaClient.invitation.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...invitation,
        status: InvitationStatus.REVOKED,
      });

      const result = await invitationService.revokeInvitation(invitationId, userId);

      expect(result.ok).toBe(true);
      expect(mockPrismaClient.invitation.update).toHaveBeenCalledWith({
        where: { id: invitationId },
        data: { status: InvitationStatus.REVOKED },
      });
    });

    it('招待が見つからない場合はエラーを返す', async () => {
      const invitationId = 'non-existent-id';
      const userId = 'admin-id';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await invitationService.revokeInvitation(invitationId, userId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('他の管理者が作成した招待は取り消せない', async () => {
      const invitationId = 'invitation-1';
      const userId = 'admin-1';
      const invitation: Invitation = {
        id: invitationId,
        email: 'user@example.com',
        token: 'token-123',
        inviterId: 'admin-2', // 別の管理者
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: null,
        userId: null,
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );

      const result = await invitationService.revokeInvitation(invitationId, userId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('UNAUTHORIZED');
      }
    });

    it('既に使用済みの招待は取り消せない', async () => {
      const invitationId = 'invitation-1';
      const userId = 'admin-id';
      const invitation: Invitation = {
        id: invitationId,
        email: 'user@example.com',
        token: 'token-123',
        inviterId: userId,
        status: InvitationStatus.USED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        usedAt: new Date(),
        userId: 'user-id',
      };

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitation
      );

      const result = await invitationService.revokeInvitation(invitationId, userId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('USED_TOKEN');
      }
    });
  });

  describe('listInvitations', () => {
    it('全ての招待を取得する', async () => {
      const invitations: Invitation[] = [
        {
          id: 'invitation-1',
          email: 'user1@example.com',
          token: 'token-1',
          inviterId: 'admin-id',
          status: InvitationStatus.PENDING,
          expiresAt: new Date(),
          createdAt: new Date(),
          usedAt: null,
          userId: null,
        },
        {
          id: 'invitation-2',
          email: 'user2@example.com',
          token: 'token-2',
          inviterId: 'admin-id',
          status: InvitationStatus.USED,
          expiresAt: new Date(),
          createdAt: new Date(),
          usedAt: new Date(),
          userId: 'user-id',
        },
      ];

      (mockPrismaClient.invitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        invitations
      );

      const result = await invitationService.listInvitations();

      expect(result).toHaveLength(2);
      expect(result[0]!.email).toBe('user1@example.com');
      expect(result[1]!.email).toBe('user2@example.com');
    });

    it('ステータス別にフィルタリングできる', async () => {
      const pendingInvitations: Invitation[] = [
        {
          id: 'invitation-1',
          email: 'user1@example.com',
          token: 'token-1',
          inviterId: 'admin-id',
          status: InvitationStatus.PENDING,
          expiresAt: new Date(),
          createdAt: new Date(),
          usedAt: null,
          userId: null,
        },
      ];

      (mockPrismaClient.invitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        pendingInvitations
      );

      const result = await invitationService.listInvitations({
        status: InvitationStatus.PENDING,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe(InvitationStatus.PENDING);
      expect(mockPrismaClient.invitation.findMany).toHaveBeenCalledWith({
        where: { status: InvitationStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('作成日時の降順でソートされる', async () => {
      await invitationService.listInvitations();

      expect(mockPrismaClient.invitation.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
