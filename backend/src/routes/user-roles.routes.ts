/**
 * @fileoverview ユーザーロールAPIルート
 *
 * Requirements:
 * - 20: ユーザーへのロール割り当て（マルチロール対応）
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { UserRoleService } from '../services/user-role.service.js';
import { RBACService } from '../services/rbac.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { EmailService } from '../services/email.service.js';
import getPrismaClient from '../db.js';
import getRedisClient from '../redis.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
const redisClient = getRedisClient.getClient() ?? undefined;
const rbacService = new RBACService(prisma, redisClient);
const auditLogService = new AuditLogService({ prisma });
const emailService = new EmailService();
const userRoleService = new UserRoleService(prisma, rbacService, auditLogService, emailService);

// Zodバリデーションスキーマ
const addRoleSchema = z.object({
  roleId: z.string().min(1, 'Role ID is required'),
});

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: ユーザー一覧取得
 *     description: 全てのユーザーとそのロールを取得
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ユーザー一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('user:read'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  priority: true,
                  isSystem: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // フォーマット変換（userRolesをrolesに変換）
      const formattedUsers = users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
        roles: user.userRoles.map((ur) => ur.role),
      }));

      res.json(formattedUsers);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/users/{id}/roles:
 *   post:
 *     summary: ユーザーにロール追加
 *     description: 既存のユーザーにロールを追加
 *     tags:
 *       - User Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ユーザーID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleId
 *             properties:
 *               roleId:
 *                 type: string
 *                 example: "role-1"
 *     responses:
 *       204:
 *         description: ロール追加成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ユーザーまたはロールが見つからない
 */
router.post(
  '/:id/roles',
  authenticate,
  requirePermission('user:update'),
  validate(addRoleSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: userId } = req.params as { id: string };
      const { roleId } = req.body;
      const actorId = req.user!.userId;
      const performedBy = req.user
        ? { email: req.user.email, displayName: req.user.email }
        : undefined;

      const result = await userRoleService.addRoleToUser(userId, roleId, actorId, performedBy);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND' || error.type === 'ROLE_NOT_FOUND') {
          res.status(404).json({ error: 'User or role not found', code: error.type });
          return;
        }
        res.status(500).json({ error: 'Failed to add role to user', details: error });
        return;
      }

      logger.info({ userId, roleId, actorId }, 'Role added to user successfully');

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/users/{id}/roles/{roleId}:
 *   delete:
 *     summary: ユーザーからロール削除
 *     description: ユーザーからロールを削除（最後の管理者ロールは削除不可）
 *     tags:
 *       - User Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ユーザーID
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *         description: ロールID
 *     responses:
 *       204:
 *         description: ロール削除成功
 *       400:
 *         description: 最後の管理者ロール
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ユーザーまたはロール割り当てが見つからない
 */
router.delete(
  '/:id/roles/:roleId',
  authenticate,
  requirePermission('user:update'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: userId, roleId } = req.params as { id: string; roleId: string };

      const result = await userRoleService.removeRoleFromUser(userId, roleId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
          return;
        }
        if (error.type === 'ASSIGNMENT_NOT_FOUND') {
          res.status(404).json({
            error: 'Role assignment not found',
            code: 'ASSIGNMENT_NOT_FOUND',
          });
          return;
        }
        if (error.type === 'LAST_ADMIN_PROTECTED') {
          res.status(400).json({
            error: 'Cannot remove last admin role',
            code: 'LAST_ADMIN_PROTECTED',
          });
          return;
        }
        res.status(500).json({ error: 'Failed to remove role from user', details: error });
        return;
      }

      logger.info(
        { userId, roleId, actorId: req.user?.userId },
        'Role removed from user successfully'
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
