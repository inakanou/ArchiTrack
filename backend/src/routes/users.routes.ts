/**
 * @fileoverview ユーザーAPIルート
 *
 * Requirements:
 * - 17.3, 17.4, 17.5, 17.11, 17.12: 担当者候補取得API
 *
 * タスク49.7（user-authentication の要件38.5）: 担当者候補は有効なユーザーの ID と表示名だけを返す
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
 *     description: admin以外の有効な（無効化・ロックされていない）ユーザー一覧を取得（id, displayName のみ）
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
          // adminロールを持つユーザーを除外
          userRoles: {
            none: {
              role: {
                name: 'admin',
              },
            },
          },
          // ロックされていないユーザーのみ
          isLocked: false,
          // 無効化されていないユーザーのみ（要件38.5）
          isActive: true,
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

      // 応答は ID と表示名だけに限る（メールアドレス・ロールを含めない。要件38.5）
      res.json(users.map(({ id, displayName }) => ({ id, displayName })));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
