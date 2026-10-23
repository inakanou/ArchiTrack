/**
 * @fileoverview 招待関連APIルート
 *
 * Requirements:
 * - 1.1-1.8: 管理者によるユーザー招待（招待作成、一覧取得、取り消し、検証）
 * - TDD: GREEN phase - 最小限のコードでテストをパス
 *
 * タスク50.1 で、再送信の経路を加え、作成と再送信の応答をサーバーが組み立てた招待 URL に改め、
 * 取り消しを作成者に限らない形にした（user-authentication の要件37・40 の招待の項）。
 *
 * @swagger
 * tags:
 *   name: Invitations
 *   description: 招待管理API
 */

import { Router, type Request } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  InvitationService,
  type InvitationEmailSender,
  type IssuedInvitation,
} from '../services/invitation.service.js';
import { EmailService } from '../services/email.service.js';
import { InvitationStatus } from '../types/invitation.types.js';
import { validateMultiple } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { invitationLimiter } from '../middleware/rateLimit.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import type { RequestContext } from '../types/auth.types.js';

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

/** 監査に載せる送信元（要件40.5） */
function requestContext(req: Request): RequestContext {
  return { ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] };
}

/**
 * 作成・再送信の応答の本文（招待の要約と、サーバーが組み立てた招待 URL。トークンそのものは載せない）
 */
function issuedInvitationBody(issued: IssuedInvitation) {
  return { ...issued.invitation, invitationUrl: issued.invitationUrl };
}

/**
 * 招待ルート初期化
 *
 * @param prisma - Prisma Clientインスタンス
 * @param emailSender - 招待メールの送信口（省略時は EmailService。テストでは差し替える）
 * @returns Express Router
 */
export function createInvitationRoutes(
  prisma: PrismaClient,
  emailSender: InvitationEmailSender = new EmailService()
): Router {
  const router = Router();
  const invitationService = new InvitationService(prisma, emailSender);

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
   *         description: 招待作成成功。招待の要約（id, email, status, expiresAt, createdAt, inviter）と、サーバーが組み立てた招待 URL（invitationUrl）を返す。招待 URL はこの応答と再送信の応答にだけ現れ、トークンは原文の SHA-256 だけを保存する
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

      const result = await invitationService.createInvitation(
        inviterId,
        email,
        requestContext(req)
      );

      if (!result.ok) {
        switch (result.error.type) {
          case 'EMAIL_ALREADY_REGISTERED':
            return res.status(409).json({ error: 'Email already registered' });
          default:
            return res.status(500).json({ error: 'Failed to create invitation' });
        }
      }

      return res.status(201).json(issuedInvitationBody(result.value));
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
   *         description: 招待一覧取得成功。各招待は id, email, status, expiresAt, createdAt, inviter（id, displayName）だけを持ち、招待トークンと招待 URL を含まない
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
   *     description: 招待の権限（user:invite）を持つ利用者なら、招待の作成者でなくても取り消せる
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
   *       400:
   *         description: 使用済みの招待は取り消せない
   *       403:
   *         description: 権限不足
   *       404:
   *         description: 招待が見つかりません
   */
  router.delete('/:id', authenticate, requirePermission('user:invite'), async (req, res) => {
    const id = req.params.id as string;
    const actorId = req.user!.userId;

    const result = await invitationService.revokeInvitation(id, actorId, requestContext(req));

    if (!result.ok) {
      switch (result.error.type) {
        case 'INVITATION_NOT_FOUND':
          return res.status(404).json({ error: 'Invitation not found' });
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
   * /api/v1/invitations/{id}/resend:
   *   post:
   *     summary: 招待を再送信する
   *     description: 新しいトークンを発行して同じ招待の行のトークンのハッシュと有効期限（7 日）を置き換え、古いトークンを失効させ、招待メールを送り直す。定期処理でトークンが消された期限切れの招待も再送信できる
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
   *       200:
   *         description: 再送信成功。招待の要約（id, email, status, expiresAt, createdAt, inviter）と、新しいトークンの招待 URL（invitationUrl）を返す
   *       400:
   *         description: 使用済み・取り消し済みの招待は再送信できない
   *       403:
   *         description: 権限不足
   *       404:
   *         description: 招待が見つかりません
   *       409:
   *         description: メールアドレスが既に登録済み
   */
  router.post(
    '/:id/resend',
    authenticate,
    invitationLimiter,
    requirePermission('user:invite'),
    async (req, res) => {
      const id = req.params.id as string;
      const actorId = req.user!.userId;

      const result = await invitationService.resendInvitation(id, actorId, requestContext(req));

      if (!result.ok) {
        switch (result.error.type) {
          case 'INVITATION_NOT_FOUND':
            return res.status(404).json({ error: 'Invitation not found' });
          case 'USED_TOKEN':
            return res.status(400).json({ error: 'Cannot resend used invitation' });
          case 'REVOKED_TOKEN':
            return res.status(400).json({ error: 'Cannot resend revoked invitation' });
          case 'EMAIL_ALREADY_REGISTERED':
            return res.status(409).json({ error: 'Email already registered' });
          default:
            return res.status(500).json({ error: 'Failed to resend invitation' });
        }
      }

      return res.status(200).json(issuedInvitationBody(result.value));
    }
  );

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
