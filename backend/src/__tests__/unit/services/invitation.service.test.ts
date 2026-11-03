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
 *
 * タスク50.1 のトークンのハッシュ保存・一覧・取り消し・再送信・監査は、各試験の `@requirement` の印で名乗る。
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InvitationService,
  hashInvitationToken,
  buildInvitationUrl,
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

const INVITER = { id: 'admin-user-id', displayName: 'Admin' };

// Prisma Clientのモック（$transaction は同じクライアントで本体を実行する）
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
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
} as unknown as PrismaClient;

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 作成・再送信の select の結果を模した行（inviterId と要約の列） */
function selectedRow(data: { email: string; inviterId: string; expiresAt: Date }) {
  return {
    id: 'invitation-1',
    email: data.email,
    status: InvitationStatus.PENDING,
    expiresAt: data.expiresAt,
    createdAt: new Date(),
    inviterId: data.inviterId,
    inviter: INVITER,
  };
}

function invitationRow(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invitation-1',
    email: 'user@example.com',
    tokenHash: 'stored-hash',
    inviterId: INVITER.id,
    status: InvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    usedAt: null,
    userId: null,
    ...overrides,
  };
}

describe('InvitationService', () => {
  let invitationService: InvitationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocked(mockPrismaClient.$transaction).mockImplementation(
      async (fn: (tx: PrismaClient) => Promise<unknown>) => fn(mockPrismaClient)
    );
    mocked(mockPrismaClient.user.findUnique).mockImplementation(
      async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id ? { email: 'actor@example.com', displayName: 'Actor' } : null
    );
    mocked(mockPrismaClient.invitation.create).mockImplementation(
      async ({ data }: { data: { email: string; inviterId: string; expiresAt: Date } }) =>
        selectedRow(data)
    );
    invitationService = new InvitationService(mockPrismaClient);
  });

  describe('hashInvitationToken / buildInvitationUrl', () => {
    /**
     * @requirement user-authentication/REQ-37.1
     */
    it('保存する値は原文の SHA-256 の 16 進で、原文とは異なる', () => {
      expect(hashInvitationToken('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
      expect(hashInvitationToken('abc')).not.toBe('abc');
    });

    /**
     * @requirement user-authentication/REQ-37.3: 招待 URL はトークンをフラグメントに置き、サーバーへ送られるクエリに載せない
     */
    it('招待 URL は画面のオリジンの登録画面にトークンをフラグメントで渡す', () => {
      const url = buildInvitationUrl('t0k3n', 'https://app.example.com');
      expect(url).toBe('https://app.example.com/register#token=t0k3n');
      expect(new URL(url).search).toBe('');
    });
  });

  describe('createInvitation', () => {
    /**
     * @requirement user-authentication/REQ-37.1
     */
    it('一意の招待トークンを生成し、保存はそのハッシュだけで原文を保存しない', async () => {
      const result = await invitationService.createInvitation(INVITER.id, 'new@example.com');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.token).toMatch(/^[0-9a-f]{64}$/);
      const { data } = mocked(mockPrismaClient.invitation.create).mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(data.tokenHash).toBe(sha256Hex(result.value.token));
      expect(data).not.toHaveProperty('token');
      expect(Object.values(data)).not.toContain(result.value.token);
    });

    it('7日間の有効期限を設定する', async () => {
      const now = Date.now();

      const result = await invitationService.createInvitation(INVITER.id, 'new@example.com');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedExpiry = now + 7 * 24 * 60 * 60 * 1000;
      expect(Math.abs(result.value.invitation.expiresAt.getTime() - expectedExpiry)).toBeLessThan(
        1000
      );
    });

    it('既存メールアドレスの場合はエラーを返し、招待も監査も作らない', async () => {
      mocked(mockPrismaClient.user.findUnique).mockResolvedValue({ id: 'existing-user-id' });

      const result = await invitationService.createInvitation(INVITER.id, 'existing@example.com');

      expect(result).toEqual({ ok: false, error: { type: 'EMAIL_ALREADY_REGISTERED' } });
      expect(mockPrismaClient.invitation.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-37.2
     */
    it('戻り値の招待はトークンのハッシュと作成者の ID を持たず、招待 URL はトークンから組み立てる', async () => {
      const result = await invitationService.createInvitation(INVITER.id, 'new@example.com');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value.invitation).sort()).toEqual(
        ['createdAt', 'email', 'expiresAt', 'id', 'inviter', 'status'].sort()
      );
      expect(result.value.invitation.inviter).toEqual(INVITER);
      expect(result.value.invitationUrl).toBe(buildInvitationUrl(result.value.token));
    });

    /**
     * @requirement user-authentication/REQ-40.5
     */
    it('作成を同じトランザクションで実行者と対象のメールアドレスとともに監査する', async () => {
      const result = await invitationService.createInvitation(INVITER.id, 'new@example.com', {
        ipAddress: '192.0.2.1',
        userAgent: 'vitest',
      });

      expect(result.ok).toBe(true);
      expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'INVITATION_CREATED',
          actorId: INVITER.id,
          actorEmail: 'actor@example.com',
          actorDisplayName: 'Actor',
          targetType: 'Invitation',
          targetId: 'invitation-1',
          metadata: {
            email: 'new@example.com',
            inviterId: INVITER.id,
            ipAddress: '192.0.2.1',
            userAgent: 'vitest',
          },
        },
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
    const email = 'invitee@example.com';
    let sendInvitationEmail: ReturnType<typeof vi.fn>;
    let serviceWithEmail: InvitationService;

    beforeEach(() => {
      sendInvitationEmail = vi.fn();
      const emailSender: InvitationEmailSender = {
        sendInvitationEmail: sendInvitationEmail as InvitationEmailSender['sendInvitationEmail'],
      };
      serviceWithEmail = new InvitationService(mockPrismaClient, emailSender);
    });

    /**
     * @requirement user-authentication/REQ-1.3
     */
    it('作成した招待のトークンで招待メールを対象メールアドレスへ1回投入する', async () => {
      sendInvitationEmail.mockResolvedValue(undefined);

      const result = await serviceWithEmail.createInvitation(INVITER.id, email);

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

      const result = await serviceWithEmail.createInvitation(INVITER.id, email);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.invitation.id).toBe('invitation-1');
      expect(result.value.invitation.email).toBe(email);
      expect(result.value.invitation.status).toBe(InvitationStatus.PENDING);
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
        serviceWithEmail.createInvitation(INVITER.id, email),
        new Promise<'TIMED_OUT'>((resolve) => setTimeout(() => resolve('TIMED_OUT'), 1000)),
      ]);

      expect(outcome).not.toBe('TIMED_OUT');
      expect(outcome).toMatchObject({ ok: true, value: { invitation: { id: 'invitation-1' } } });
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    });

    it('送信口が無い構成では招待を作成し、未送信を警告ログに残す', async () => {
      const result = await invitationService.createInvitation(INVITER.id, email);

      expect(result.ok).toBe(true);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { invitationId: 'invitation-1' },
        'Invitation email sender is not configured; invitation email was not queued'
      );
    });
  });

  describe('validateInvitation', () => {
    /**
     * @requirement user-authentication/REQ-37.1
     */
    it('提示された原文のハッシュで招待を引き、有効な招待を返す', async () => {
      const invitation = invitationRow();
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(invitation);

      const result = await invitationService.validateInvitation('valid-token-123');

      expect(result).toEqual({ ok: true, value: invitation });
      expect(mockPrismaClient.invitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256Hex('valid-token-123') },
      });
    });

    it('無効なトークンの場合はエラーを返す', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(null);

      const result = await invitationService.validateInvitation('invalid-token');

      expect(result).toEqual({ ok: false, error: { type: 'INVALID_TOKEN' } });
    });

    it('期限切れトークンの場合はエラーを返す', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(
        invitationRow({ expiresAt: new Date(Date.now() - 1000) })
      );

      const result = await invitationService.validateInvitation('expired-token');

      expect(result).toEqual({ ok: false, error: { type: 'EXPIRED_TOKEN' } });
    });

    it('使用済みトークンの場合はエラーを返す', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(
        invitationRow({ status: InvitationStatus.USED, usedAt: new Date() })
      );

      const result = await invitationService.validateInvitation('used-token');

      expect(result).toEqual({ ok: false, error: { type: 'USED_TOKEN' } });
    });

    it('取り消し済みトークンの場合はエラーを返す', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(
        invitationRow({ status: InvitationStatus.REVOKED })
      );

      const result = await invitationService.validateInvitation('revoked-token');

      expect(result).toEqual({ ok: false, error: { type: 'REVOKED_TOKEN' } });
    });
  });

  describe('revokeInvitation', () => {
    /**
     * @requirement user-authentication/REQ-37.5
     * @requirement user-authentication/REQ-40.5
     */
    it('作成者でない管理者も未使用の招待を取り消せ、取り消しを監査する', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        inviterId: 'creator-admin-id',
        status: InvitationStatus.PENDING,
      });

      const result = await invitationService.revokeInvitation('invitation-1', 'other-admin-id');

      expect(result).toEqual({ ok: true, value: undefined });
      expect(mockPrismaClient.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: InvitationStatus.REVOKED },
      });
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'INVITATION_REVOKED',
          actorId: 'other-admin-id',
          targetType: 'Invitation',
          targetId: 'invitation-1',
          metadata: { email: 'user@example.com', inviterId: 'creator-admin-id' },
        }),
      });
    });

    it('招待が見つからない場合はエラーを返し、監査しない', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(null);

      const result = await invitationService.revokeInvitation('nonexistent', INVITER.id);

      expect(result).toEqual({ ok: false, error: { type: 'INVITATION_NOT_FOUND' } });
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });

    it('既に使用済みの招待は取り消せず、監査しない', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        inviterId: INVITER.id,
        status: InvitationStatus.USED,
      });

      const result = await invitationService.revokeInvitation('invitation-1', INVITER.id);

      expect(result).toEqual({ ok: false, error: { type: 'USED_TOKEN' } });
      expect(mockPrismaClient.invitation.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('resendInvitation', () => {
    const current = {
      id: 'invitation-1',
      email: 'user@example.com',
      inviterId: 'creator-admin-id',
      status: InvitationStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 1000),
    };

    beforeEach(() => {
      mocked(mockPrismaClient.invitation.update).mockImplementation(
        async ({ data }: { data: { expiresAt: Date } }) =>
          selectedRow({
            email: current.email,
            inviterId: current.inviterId,
            expiresAt: data.expiresAt,
          })
      );
    });

    /**
     * @requirement user-authentication/REQ-37.1
     * @requirement user-authentication/REQ-40.5
     */
    it('同じ行のハッシュと期限を新しいトークンのもので置き換え、メールを送り直し、再送信を監査する', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(current);
      const sendInvitationEmail = vi.fn().mockResolvedValue(undefined);
      const service = new InvitationService(mockPrismaClient, {
        sendInvitationEmail: sendInvitationEmail as InvitationEmailSender['sendInvitationEmail'],
      });
      const now = Date.now();

      const result = await service.resendInvitation('invitation-1', 'other-admin-id');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { where, data } = mocked(mockPrismaClient.invitation.update).mock.calls[0]![0] as {
        where: { id: string };
        data: { tokenHash: string; expiresAt: Date; status: string };
      };
      expect(where).toEqual({ id: 'invitation-1' });
      expect(data.tokenHash).toBe(sha256Hex(result.value.token));
      expect(data.status).toBe(InvitationStatus.PENDING);
      expect(Math.abs(data.expiresAt.getTime() - (now + 7 * 24 * 60 * 60 * 1000))).toBeLessThan(
        1000
      );
      expect(result.value.invitationUrl).toBe(buildInvitationUrl(result.value.token));
      expect(sendInvitationEmail).toHaveBeenCalledWith('user@example.com', result.value.token);
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'INVITATION_RESENT',
          actorId: 'other-admin-id',
          targetType: 'Invitation',
          targetId: 'invitation-1',
          metadata: { email: 'user@example.com', inviterId: 'creator-admin-id' },
        }),
      });
    });

    it.each([
      [InvitationStatus.USED, 'USED_TOKEN'],
      [InvitationStatus.REVOKED, 'REVOKED_TOKEN'],
    ])('状態が %s の招待は再送信せず %s を返す', async (status, errorType) => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue({ ...current, status });

      const result = await invitationService.resendInvitation('invitation-1', INVITER.id);

      expect(result).toEqual({ ok: false, error: { type: errorType } });
      expect(mockPrismaClient.invitation.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });

    it('招待が見つからない場合は INVITATION_NOT_FOUND を返す', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(null);

      const result = await invitationService.resendInvitation('nonexistent', INVITER.id);

      expect(result).toEqual({ ok: false, error: { type: 'INVITATION_NOT_FOUND' } });
      expect(mockPrismaClient.invitation.update).not.toHaveBeenCalled();
    });

    it('招待の後に登録済みになったメールアドレスへは再送信しない', async () => {
      mocked(mockPrismaClient.invitation.findUnique).mockResolvedValue(current);
      mocked(mockPrismaClient.user.findUnique).mockResolvedValue({ id: 'registered-user' });

      const result = await invitationService.resendInvitation('invitation-1', INVITER.id);

      expect(result).toEqual({ ok: false, error: { type: 'EMAIL_ALREADY_REGISTERED' } });
      expect(mockPrismaClient.invitation.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('listInvitations', () => {
    /**
     * @requirement user-authentication/REQ-37.2
     */
    it('トークンのハッシュを読まずに招待の要約と作成者を返す', async () => {
      const rows = [
        {
          ...selectedRow({ email: 'a@example.com', inviterId: INVITER.id, expiresAt: new Date() }),
        },
      ];
      mocked(mockPrismaClient.invitation.findMany).mockResolvedValue(rows);

      const result = await invitationService.listInvitations();

      expect(result).toBe(rows);
      const args = mocked(mockPrismaClient.invitation.findMany).mock.calls[0]![0] as {
        select: Record<string, unknown>;
      };
      expect(args.select).toEqual({
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        inviter: { select: { id: true, displayName: true } },
      });
    });

    it('ステータス別にフィルタリングでき、作成日時の降順で並べる', async () => {
      mocked(mockPrismaClient.invitation.findMany).mockResolvedValue([]);

      await invitationService.listInvitations({ status: InvitationStatus.PENDING });
      await invitationService.listInvitations();

      expect(mockPrismaClient.invitation.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { status: InvitationStatus.PENDING },
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(mockPrismaClient.invitation.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: {}, orderBy: { createdAt: 'desc' } })
      );
    });
  });
});
