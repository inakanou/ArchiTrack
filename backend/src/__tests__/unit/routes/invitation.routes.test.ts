/**
 * @fileoverview 招待ルートのテスト（簡略版）
 *
 * 主要機能と、作成・再送信の応答の形（要件37.1・37.2）を確かめる。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { InvitationStatus } from '../../../types/invitation.types.js';
import { createInvitationRoutes } from '../../../routes/invitation.routes.js';

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
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
} as unknown as PrismaClient;

// モック: 認証・認可ミドルウェア（簡略版）
vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'admin-user-id',
      email: 'admin@example.com',
      roles: ['admin'],
    };
    next();
  },
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

describe('Invitation Routes', () => {
  let app: Application;
  const sendInvitationEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (mockPrismaClient.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: PrismaClient) => Promise<unknown>) => fn(mockPrismaClient)
    );

    app = express();
    app.use(express.json());

    const invitationRoutes = createInvitationRoutes(mockPrismaClient, { sendInvitationEmail });
    app.use('/api/v1/invitations', invitationRoutes);
  });

  describe('POST /api/v1/invitations/verify (認証不要・トークンは本文)', () => {
    it('should verify valid invitation token', async () => {
      const token = 'valid-token-123';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        tokenHash: 'stored-hash',
        inviterId: 'admin-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).post('/api/v1/invitations/verify').send({ token });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('user@example.com');
    });

    it('should return 400 for invalid token', async () => {
      const token = 'invalid-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await request(app).post('/api/v1/invitations/verify').send({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });

    it('should return 400 for expired token', async () => {
      const token = 'expired-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        tokenHash: 'stored-hash',
        inviterId: 'admin-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7日前
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).post('/api/v1/invitations/verify').send({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('expired');
    });

    it('should return 400 for used token', async () => {
      const token = 'used-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        tokenHash: 'stored-hash',
        inviterId: 'admin-1',
        status: InvitationStatus.USED,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).post('/api/v1/invitations/verify').send({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('used');
    });

    /**
     * @requirement user-authentication/REQ-37.3: 検証は本文で受け、トークンを URL に載せるクエリの検証の経路を置かない
     */
    it('クエリでトークンを渡す検証の経路（GET）は無く、招待を引かない', async () => {
      const response = await request(app)
        .get('/api/v1/invitations/verify')
        .query({ token: 'query-token' });

      expect(response.status).toBe(404);
      expect(mockPrismaClient.invitation.findUnique).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-37.3
     */
    it('本文にトークンが無ければ 400 を返し、招待を引かない', async () => {
      const response = await request(app).post('/api/v1/invitations/verify').send({});

      expect(response.status).toBe(400);
      expect(mockPrismaClient.invitation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/invitations のメール送信からの切り離し', () => {
    /**
     * @requirement user-authentication/REQ-24.8
     */
    it('招待メールのキュー投入が失敗しても 201 で招待を返す', async () => {
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.create as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: { data: { email: string; inviterId: string; expiresAt: Date } }) => ({
          id: 'invitation-1',
          email: data.email,
          status: InvitationStatus.PENDING,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          inviterId: data.inviterId,
          inviter: { id: data.inviterId, displayName: 'Admin' },
        })
      );
      sendInvitationEmail.mockRejectedValue(new Error('Redis connection refused'));

      const response = await request(app)
        .post('/api/v1/invitations')
        .send({ email: 'invitee@example.com' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'invitation-1',
        email: 'invitee@example.com',
        inviter: { id: 'admin-user-id', displayName: 'Admin' },
        status: InvitationStatus.PENDING,
      });
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
      const [, sentToken] = sendInvitationEmail.mock.calls[0]!;
      // 応答はトークンそのものを載せず、メールと同じトークンの招待 URL だけを載せる（要件37.1・37.2）
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('tokenHash');
      expect(response.body.invitationUrl).toMatch(new RegExp(`/register#token=${sentToken}$`));
    });
  });
  describe('POST /api/v1/invitations/:id/resend', () => {
    /**
     * @requirement user-authentication/REQ-37.1
     */
    it('同じ招待の要約と新しいトークンの招待 URL を 200 で返し、トークンそのものは載せない', async () => {
      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'invitee@example.com',
        inviterId: 'creator-id',
        status: InvitationStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 1000),
      });
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.update as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: { data: { expiresAt: Date; status: string } }) => ({
          id: 'invitation-1',
          email: 'invitee@example.com',
          status: data.status,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          inviterId: 'creator-id',
          inviter: { id: 'creator-id', displayName: 'Creator' },
        })
      );
      sendInvitationEmail.mockResolvedValue(undefined);

      const response = await request(app).post('/api/v1/invitations/invitation-1/resend');

      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(
        ['createdAt', 'email', 'expiresAt', 'id', 'invitationUrl', 'inviter', 'status'].sort()
      );
      expect(response.body).toMatchObject({ id: 'invitation-1', status: InvitationStatus.PENDING });
      const [, sentToken] = sendInvitationEmail.mock.calls[0]!;
      expect(response.body.invitationUrl).toMatch(new RegExp(`/register#token=${sentToken}$`));
    });

    it.each([
      [InvitationStatus.USED, 400],
      [InvitationStatus.REVOKED, 400],
    ])('状態が %s の招待は %d を返す', async (status, code) => {
      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'invitee@example.com',
        inviterId: 'creator-id',
        status,
        expiresAt: new Date(),
      });

      const response = await request(app).post('/api/v1/invitations/invitation-1/resend');

      expect(response.status).toBe(code);
    });

    it('存在しない招待は 404 を返す', async () => {
      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await request(app).post('/api/v1/invitations/missing/resend');

      expect(response.status).toBe(404);
    });
  });
});
