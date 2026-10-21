/**
 * @fileoverview 管理者向けの利用者の操作のルーター（棚卸し・無効化・再有効化・2FA の再設定）
 *
 * `/api/v1/users` に、既存の user-roles.routes.ts より前にマウントする。後に置くと
 * user-roles.routes.ts の `/:id` 系の経路（`DELETE /:id`、`/:id/roles`）が `inventory` などの
 * 固定の経路を利用者の ID として拾う。
 *
 * - タスク47.8: 管理者による 2FA の再設定（`POST /:id/2fa/reset`）
 * - タスク49.2・49.5 が無効化・再有効化と棚卸しの経路をここへ足す
 *
 * Requirements (user-authentication):
 * - 34.7, 34.9, 34.10: 管理者による 2FA の再設定・自己の再設定の拒否・監査
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { TwoFactorService } from '../services/two-factor.service.js';
import { getSharedAuthenticatedUserStateService } from '../services/authenticated-user-state.service.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import { ForbiddenError, NotFoundError } from '../errors/apiError.js';
import logger from '../utils/logger.js';

const router = Router();
// 再設定のコミットの後に対象者の状態のキャッシュを無効化する（タスク47.5）。共有のインスタンスは
// 呼び出しの時点で解決する（db.ts の PrismaClient の作り直しに追随する）
const twoFactorService = new TwoFactorService({
  invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
});

/**
 * @swagger
 * /api/v1/users/{id}/2fa/reset:
 *   post:
 *     summary: 管理者による 2FA の再設定
 *     description: |
 *       対象者の 2FA の秘密鍵とバックアップコードを消して未登録にし、全てのリフレッシュトークンを失効させる
 *       （要件34.7）。監査（TWO_FACTOR_RESET_BY_ADMIN）に実行者と対象者を記録する（要件34.10）。
 *       対象者は次の要求から 2FA の設定だけを行える。自分自身の再設定は拒否する（要件34.9）。
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
 *         description: 対象者のユーザーID
 *     responses:
 *       204:
 *         description: 再設定の完了
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: 権限の不足（user:manage）、または自分自身の再設定（code は SELF_RESET_FORBIDDEN）
 *       404:
 *         description: 対象者が見つからない（code は USER_NOT_FOUND）
 */
router.post(
  '/:id/2fa/reset',
  authenticate,
  requirePermission('user:manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: targetUserId } = req.params as { id: string };
      const actorId = req.user!.userId;

      const result = await twoFactorService.resetByAdmin(actorId, targetUserId, {
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      if (!result.ok) {
        if (result.error.type === 'SELF_RESET_FORBIDDEN') {
          next(
            new ForbiddenError(
              'Cannot reset your own two-factor authentication',
              'SELF_RESET_FORBIDDEN'
            )
          );
          return;
        }
        next(new NotFoundError('User not found', 'USER_NOT_FOUND'));
        return;
      }

      logger.info({ actorId, targetUserId }, '2FA reset by admin');
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
