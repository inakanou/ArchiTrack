/**
 * @fileoverview ユーザーロールAPIルート
 *
 * Requirements:
 * - 20: ユーザーへのロール割り当て（マルチロール対応）
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { UserRoleService } from '../services/user-role.service.js';
import { getSharedRBACService } from '../services/rbac.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { EmailService } from '../services/email.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
// 権限の確認（requirePermission）と同じインスタンスで権限キャッシュを無効化する（タスク36.2）。
// モジュールの読み込みの時点では Redis は未初期化のため、クライアントは呼び出しの時点で解決される
const rbacService = getSharedRBACService();
const auditLogService = new AuditLogService({ prisma });
const emailService = new EmailService();
const userRoleService = new UserRoleService(prisma, rbacService, auditLogService, emailService);

// Zodバリデーションスキーマ
const addRolesSchema = z.object({
  roleIds: z.array(z.string().min(1)).min(1, 'At least one role ID is required'),
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
 *     description: 既存のユーザーにロールを追加（複数ロールの一括割り当てに対応）
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
 *               - roleIds
 *             properties:
 *               roleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["role-1", "role-2"]
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
  validate(addRolesSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: userId } = req.params as { id: string };
      const { roleIds } = req.body;
      const actorId = req.user!.userId;

      const performedBy = req.user
        ? { email: req.user.email, displayName: req.user.email }
        : undefined;

      // 全ロールを一つのトランザクションで追加（監査ログとアラート対応）。
      // 1件でも失敗すれば、先に追加したロールも残らない
      const result = await userRoleService.addRolesToUser(userId, roleIds, actorId, performedBy);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND' || error.type === 'ROLE_NOT_FOUND') {
          res.status(404).json({ error: 'User or role not found', code: error.type });
          return;
        }
        res.status(500).json({ error: 'Failed to add role to user', details: error });
        return;
      }

      logger.info({ userId, roleIds, actorId }, 'Roles added to user successfully');

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/users/{id}/roles:
 *   get:
 *     summary: ユーザーのロール一覧取得
 *     description: 特定ユーザーに割り当てられたロール一覧を取得
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
 *     responses:
 *       200:
 *         description: ロール一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ユーザーが見つからない
 */
router.get(
  '/:id/roles',
  authenticate,
  requirePermission('user:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: userId } = req.params as { id: string };

      const result = await userRoleService.getUserRoles(userId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'USER_NOT_FOUND') {
          res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
          return;
        }
        res.status(500).json({ error: 'Failed to get user roles', details: error });
        return;
      }

      // roleIdをidに変換してフロントエンド互換形式で返す
      const roles = result.value.map((role) => ({
        id: role.roleId,
        name: role.name,
        description: role.description,
        priority: role.priority,
        isSystem: role.isSystem,
        assignedAt: role.assignedAt,
      }));

      res.json(roles);
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

      // 監査ログ（USER_ROLE_REVOKED）は紐付けの削除と同じトランザクションで記録される（タスク36.4）
      const result = await userRoleService.removeRoleFromUser(userId, roleId, req.user?.userId);

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

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: ユーザー削除
 *     description: ユーザーと関連データを削除（自分自身と最後の管理者は削除不可）
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ユーザーID
 *     responses:
 *       204:
 *         description: ユーザー削除成功
 *       400:
 *         description: 自分自身または最後の管理者の削除は不可
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ユーザーが見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('user:delete'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: userId } = req.params as { id: string };
      const actorId = req.user!.userId;

      // 自分自身を削除しようとしていないかチェック
      if (userId === actorId) {
        res.status(400).json({
          error: 'Cannot delete yourself',
          code: 'CANNOT_DELETE_SELF',
        });
        return;
      }

      // 最後の管理者の確認と削除を一つのトランザクションで行う（並行する削除とも直列化される）
      // データベースの例外は deleteUser が投げ、下の catch からエラーハンドラーへ渡る
      const result = await userRoleService.deleteUser(userId);
      if (!result.ok) {
        if (result.error.type === 'USER_NOT_FOUND') {
          res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          });
          return;
        }
        // 残る業務上の失敗は LAST_ADMIN_PROTECTED のみ
        res.status(400).json({
          error: 'Cannot delete the last admin user',
          code: 'LAST_ADMIN_PROTECTED',
        });
        return;
      }
      const user = result.value;

      logger.info({ userId, actorId, deletedUserEmail: user.email }, 'User deleted successfully');

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
