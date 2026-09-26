/**
 * @fileoverview 招待ルートのテスト（簡略版）
 *
 * TDD: GREEN phase - 主要機能のみテスト
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

    app = express();
    app.use(express.json());

    const invitationRoutes = createInvitationRoutes(mockPrismaClient, { sendInvitationEmail });
    app.use('/api/v1/invitations', invitationRoutes);
  });

  describe('GET /api/v1/invitations/verify (認証不要)', () => {
    it('should verify valid invitation token', async () => {
      const token = 'valid-token-123';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).get('/api/v1/invitations/verify').query({ token });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('user@example.com');
    });

    it('should return 400 for invalid token', async () => {
      const token = 'invalid-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await request(app).get('/api/v1/invitations/verify').query({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });

    it('should return 400 for expired token', async () => {
      const token = 'expired-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-1',
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7日前
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).get('/api/v1/invitations/verify').query({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('expired');
    });

    it('should return 400 for used token', async () => {
      const token = 'used-token';

      (mockPrismaClient.invitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'invitation-1',
        email: 'user@example.com',
        token,
        inviterId: 'admin-1',
        status: InvitationStatus.USED,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).get('/api/v1/invitations/verify').query({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('used');
    });
  });

  describe('POST /api/v1/invitations のメール送信からの切り離し', () => {
    /**
     * @requirement user-authentication/REQ-24.8
     */
    it('招待メールのキュー投入が失敗しても 201 で招待を返す', async () => {
      (mockPrismaClient.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockPrismaClient.invitation.create as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: { data: { email: string; token: string; inviterId: string } }) => ({
          id: 'invitation-1',
          ...data,
          status: InvitationStatus.PENDING,
          createdAt: new Date(),
          usedAt: null,
          userId: null,
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
        inviterId: 'admin-user-id',
        status: InvitationStatus.PENDING,
      });
      expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
      expect(sendInvitationEmail).toHaveBeenCalledWith('invitee@example.com', response.body.token);
    });
  });
});
