/**
 * @fileoverview 権限APIルート
 *
 * Requirements:
 * - 18: 権限管理
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { PermissionService } from '../services/permission.service.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';

const router = Router();
const prisma = getPrismaClient();
const permissionService = new PermissionService(prisma);

/**
 * @swagger
 * /api/v1/permissions:
 *   get:
 *     summary: 権限一覧取得
 *     description: 全ての権限を取得（リソース・アクション順でソート）
 *     tags:
 *       - Permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 権限一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "permission-1"
 *                   resource:
 *                     type: string
 *                     example: "adr"
 *                   action:
 *                     type: string
 *                     example: "read"
 *                   description:
 *                     type: string
 *                     example: "View ADRs"
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('permission:read'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const permissions = await permissionService.listPermissions();
      res.json(permissions);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
