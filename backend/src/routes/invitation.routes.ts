/**
 * @fileoverview 招待関連APIルート
 *
 * Requirements:
 * - 1.1-1.8: 管理者によるユーザー招待（招待作成、一覧取得、取り消し、検証）
 * - TDD: GREEN phase - 最小限のコードでテストをパス
 *
 * @swagger
 * tags:
 *   name: Invitations
 *   description: 招待管理API
 */

import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client.js';
import { InvitationService } from '../services/invitation.service.js';
import { InvitationStatus } from '../types/invitation.types.js';
import { validateMultiple } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { invitationLimiter } from '../middleware/rateLimit.middleware.js';

// Zodバリデーションスキーマ
const createInvitationSchema = {
  body: z.object({
    email: z.string().email('Invalid email format'),
  }),
};

const listInvitationsSchema = {
  query: z.object({
    status: z
      .enum(['pending', 'used', 'expired', 'revoked'])
      .optional()
      .transform((val) => (val ? (val as InvitationStatus) : undefined)),
  }),
};

const verifyInvitationSchema = {
  query: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
};

/**
 * 招待ルート初期化
 *
 * @param prisma - Prisma Clientインスタンス
 * @returns Express Router
 */
export function createInvitationRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const invitationService = new InvitationService(prisma);

  /**
   * @swagger
   * /api/v1/invitations:
   *   post:
   *     summary: 招待を作成
   *     tags: [Invitations]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: newuser@example.com
   *     responses:
   *       201:
   *         description: 招待作成成功
   *       400:
   *         description: バリデーションエラー
   *       403:
   *         description: 権限不足
   *       409:
   *         description: メールアドレスが既に登録済み
   */
  router.post(
    '/',
    authenticate,
    invitationLimiter,
    requirePermission('user:invite'),
    validateMultiple(createInvitationSchema),
    async (req, res) => {
      const { email } = req.body;
      const inviterId = req.user!.userId;

      const result = await invitationService.createInvitation(inviterId, email);

      if (!result.ok) {
        switch (result.error.type) {
          case 'EMAIL_ALREADY_REGISTERED':
            return res.status(409).json({ error: 'Email already registered' });
          default:
            return res.status(500).json({ error: 'Failed to create invitation' });
        }
      }

      return res.status(201).json(result.value);
    }
  );

  /**
   * @swagger
   * /api/v1/invitations:
   *   get:
   *     summary: 招待一覧を取得
   *     tags: [Invitations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, used, expired, revoked]
   *         description: 招待ステータスでフィルタリング
   *     responses:
   *       200:
   *         description: 招待一覧取得成功
   *       403:
   *         description: 権限不足
   */
  router.get(
    '/',
    authenticate,
    requirePermission('user:invite'),
    validateMultiple(listInvitationsSchema),
    async (req, res) => {
      const { status } = req.query as { status?: InvitationStatus | undefined };

      const invitations = await invitationService.listInvitations(status ? { status } : undefined);

      return res.status(200).json(invitations);
    }
  );

  /**
   * @swagger
   * /api/v1/invitations/{id}:
   *   delete:
   *     summary: 招待を取り消す
   *     tags: [Invitations]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: 招待ID
   *     responses:
   *       204:
   *         description: 招待取り消し成功
   *       403:
   *         description: 権限不足
   *       404:
   *         description: 招待が見つかりません
   */
  router.delete('/:id', authenticate, requirePermission('user:invite'), async (req, res) => {
    const id = req.params.id as string;
    const userId = req.user!.userId;

    const result = await invitationService.revokeInvitation(id, userId);

    if (!result.ok) {
      switch (result.error.type) {
        case 'INVITATION_NOT_FOUND':
          return res.status(404).json({ error: 'Invitation not found' });
        case 'UNAUTHORIZED':
          return res.status(403).json({ error: 'Unauthorized to revoke this invitation' });
        case 'USED_TOKEN':
          return res.status(400).json({ error: 'Cannot revoke used invitation' });
        default:
          return res.status(500).json({ error: 'Failed to revoke invitation' });
      }
    }

    return res.status(204).send();
  });

  /**
   * @swagger
   * /api/v1/invitations/verify:
   *   get:
   *     summary: 招待トークンを検証
   *     tags: [Invitations]
   *     parameters:
   *       - in: query
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *         description: 招待トークン
   *     responses:
   *       200:
   *         description: トークン検証成功
   *       400:
   *         description: トークンが無効、期限切れ、または使用済み
   */
  router.get('/verify', validateMultiple(verifyInvitationSchema), async (req, res) => {
    const token = req.query.token as string;

    const result = await invitationService.validateInvitation(token);

    if (!result.ok) {
      switch (result.error.type) {
        case 'INVALID_TOKEN':
          return res.status(400).json({ error: 'Invalid invitation token' });
        case 'EXPIRED_TOKEN':
          return res.status(400).json({ error: 'Invitation token has expired' });
        case 'USED_TOKEN':
          return res.status(400).json({ error: 'Invitation token has already been used' });
        case 'REVOKED_TOKEN':
          return res.status(400).json({ error: 'Invitation has been revoked' });
        default:
          return res.status(500).json({ error: 'Failed to verify invitation' });
      }
    }

    // 招待情報を返す（emailのみ公開）
    return res.status(200).json({
      email: result.value.email,
    });
  });

  return router;
}
