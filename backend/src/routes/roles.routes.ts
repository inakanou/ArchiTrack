/**
 * @fileoverview ロールAPIルート
 *
 * Requirements:
 * - 17: 動的ロール管理
 * - 19: ロールへの権限割り当て
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { RoleService } from '../services/role.service.js';
import { RolePermissionService } from '../services/role-permission.service.js';
import { RBACService } from '../services/rbac.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
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
const roleService = new RoleService(prisma);
const rolePermissionService = new RolePermissionService(prisma, rbacService, auditLogService);

// Zodバリデーションスキーマ
const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  priority: z.number().int().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  description: z.string().optional(),
  priority: z.number().int().optional(),
});

const addPermissionSchema = z.object({
  permissionId: z.string().min(1, 'Permission ID is required'),
});

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     summary: ロール一覧取得
 *     description: 全てのロールを取得（統計情報含む）
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ロール一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('role:read'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roles = await roleService.listRoles();
      res.json(roles);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/roles:
 *   post:
 *     summary: ロール作成
 *     description: 新しいロールを作成
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Project Manager"
 *               description:
 *                 type: string
 *                 example: "Manages projects"
 *               priority:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       201:
 *         description: ロール作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       409:
 *         description: ロール名の重複
 */
router.post(
  '/',
  authenticate,
  requirePermission('role:create'),
  validate(createRoleSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description, priority } = req.body;

      const result = await roleService.createRole({
        name,
        description,
        priority,
      });

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'ROLE_NAME_CONFLICT') {
          res.status(409).json({
            error: `Role with name '${error.name}' already exists`,
            code: 'ROLE_NAME_CONFLICT',
          });
          return;
        }
        res.status(500).json({ error: 'Failed to create role', details: error });
        return;
      }

      logger.info(
        { roleId: result.value.id, name: result.value.name, userId: req.user?.userId },
        'Role created successfully'
      );

      res.status(201).json(result.value);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   patch:
 *     summary: ロール更新
 *     description: 既存のロール情報を更新
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ロールID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: ロール更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ロールが見つからない
 *       409:
 *         description: ロール名の重複
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('role:update'),
  validate(updateRoleSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: roleId } = req.params as { id: string };
      const { name, description, priority } = req.body;

      const result = await roleService.updateRole(roleId, {
        name,
        description,
        priority,
      });

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'ROLE_NOT_FOUND') {
          res.status(404).json({ error: 'Role not found', code: 'ROLE_NOT_FOUND' });
          return;
        }
        if (error.type === 'ROLE_NAME_CONFLICT') {
          res.status(409).json({
            error: `Role with name '${error.name}' already exists`,
            code: 'ROLE_NAME_CONFLICT',
          });
          return;
        }
        res.status(500).json({ error: 'Failed to update role', details: error });
        return;
      }

      logger.info(
        { roleId: result.value.id, name: result.value.name, userId: req.user?.userId },
        'Role updated successfully'
      );

      res.json(result.value);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   delete:
 *     summary: ロール削除
 *     description: ロールを削除（システムロールと使用中のロールは削除不可）
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ロールID
 *     responses:
 *       204:
 *         description: ロール削除成功
 *       400:
 *         description: システムロールまたは使用中のロール
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ロールが見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('role:delete'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: roleId } = req.params as { id: string };

      const result = await roleService.deleteRole(roleId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'ROLE_NOT_FOUND') {
          res.status(404).json({ error: 'Role not found', code: 'ROLE_NOT_FOUND' });
          return;
        }
        if (error.type === 'SYSTEM_ROLE_PROTECTED') {
          res.status(400).json({
            error: 'Cannot delete system role',
            code: 'SYSTEM_ROLE_PROTECTED',
          });
          return;
        }
        if (error.type === 'ROLE_IN_USE') {
          res.status(400).json({
            error: `Role is in use by ${error.userCount} user(s)`,
            code: 'ROLE_IN_USE',
            details: { userCount: error.userCount },
          });
          return;
        }
        res.status(500).json({ error: 'Failed to delete role', details: error });
        return;
      }

      logger.info({ roleId, userId: req.user?.userId }, 'Role deleted successfully');

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions:
 *   post:
 *     summary: ロールに権限追加
 *     description: 既存のロールに権限を追加
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ロールID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permissionId
 *             properties:
 *               permissionId:
 *                 type: string
 *                 example: "permission-1"
 *     responses:
 *       204:
 *         description: 権限追加成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ロールまたは権限が見つからない
 */
router.post(
  '/:id/permissions',
  authenticate,
  requirePermission('role:update'),
  validate(addPermissionSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: roleId } = req.params as { id: string };
      const { permissionId } = req.body;
      const actorId = req.user!.userId;

      const result = await rolePermissionService.addPermissionToRole(roleId, permissionId, actorId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'ROLE_NOT_FOUND' || error.type === 'PERMISSION_NOT_FOUND') {
          res.status(404).json({ error: 'Role or permission not found', code: error.type });
          return;
        }
        res.status(500).json({ error: 'Failed to add permission to role', details: error });
        return;
      }

      logger.info(
        { roleId, permissionId, userId: actorId },
        'Permission added to role successfully'
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/roles/{id}/permissions/{permissionId}:
 *   delete:
 *     summary: ロールから権限削除
 *     description: ロールから権限を削除（システムロールの必須権限は削除不可）
 *     tags:
 *       - Roles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ロールID
 *       - in: path
 *         name: permissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: 権限ID
 *     responses:
 *       204:
 *         description: 権限削除成功
 *       400:
 *         description: システムロールの必須権限
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: ロールまたは権限が見つからない
 */
router.delete(
  '/:id/permissions/:permissionId',
  authenticate,
  requirePermission('role:update'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: roleId, permissionId } = req.params as { id: string; permissionId: string };

      const result = await rolePermissionService.removePermissionFromRole(roleId, permissionId);

      if (!result.ok) {
        const error = result.error;
        if (error.type === 'ROLE_NOT_FOUND') {
          res.status(404).json({ error: 'Role not found', code: 'ROLE_NOT_FOUND' });
          return;
        }
        if (error.type === 'ASSIGNMENT_NOT_FOUND') {
          res.status(404).json({
            error: 'Permission assignment not found',
            code: 'ASSIGNMENT_NOT_FOUND',
          });
          return;
        }
        if (error.type === 'ADMIN_WILDCARD_PROTECTED') {
          res.status(400).json({
            error: 'Cannot remove admin wildcard permission',
            code: 'ADMIN_WILDCARD_PROTECTED',
          });
          return;
        }
        res.status(500).json({ error: 'Failed to remove permission from role', details: error });
        return;
      }

      logger.info(
        { roleId, permissionId, userId: req.user?.userId },
        'Permission removed from role successfully'
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
