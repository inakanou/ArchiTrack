/**
 * @fileoverview ユーザーAPIルート
 *
 * Requirements:
 * - 17.3, 17.4, 17.5, 17.11, 17.12: 担当者候補取得API
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * @swagger
 * /api/users/assignable:
 *   get:
 *     summary: 担当者候補一覧取得
 *     description: admin以外の有効なユーザー一覧を取得（id, displayName）
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 担当者候補一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: ユーザーID
 *                     example: "550e8400-e29b-41d4-a716-446655440000"
 *                   displayName:
 *                     type: string
 *                     description: ユーザー表示名
 *                     example: "山田太郎"
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       500:
 *         description: サーバーエラー
 */
router.get(
  '/assignable',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await prisma.user.findMany({
        where: {
          // admin（system-admin）ロールを持つユーザーを除外
          userRoles: {
            none: {
              role: {
                name: 'system-admin',
              },
            },
          },
          // ロックされていないユーザーのみ
          isLocked: false,
        },
        select: {
          id: true,
          displayName: true,
        },
        orderBy: {
          displayName: 'asc',
        },
      });

      logger.debug({ count: users.length }, 'Assignable users retrieved');

      res.json(users);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
