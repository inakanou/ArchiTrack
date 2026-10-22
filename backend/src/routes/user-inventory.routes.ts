/**
 * @fileoverview 管理者向けの利用者の操作のルーター（棚卸し・無効化・再有効化・2FA の再設定）
 *
 * `/api/v1/users` に、既存の user-roles.routes.ts より前にマウントする。後に置くと
 * user-roles.routes.ts の `/:id` 系の経路（`DELETE /:id`、`/:id/roles`）が `inventory` などの
 * 固定の経路を利用者の ID として拾う。
 *
 * - タスク47.8: 管理者による 2FA の再設定（`POST /:id/2fa/reset`）
 * - タスク49.2: 無効化・再有効化（`POST /:id/deactivate`・`POST /:id/reactivate`）
 * - タスク49.5: 棚卸しの一覧と絞り込み（`GET /inventory`）
 *
 * Requirements (user-authentication):
 * - 34.7, 34.9, 34.10: 管理者による 2FA の再設定・自己の再設定の拒否・監査
 * - 36.1, 36.3, 36.4, 36.5: 無効化・再有効化・通知と監査・自己と最後の管理者の保護
 * - 36.10, 36.11, 36.12: 棚卸しの一覧・状態と経過日数の絞り込み・一般ユーザーの拒否
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { TwoFactorService } from '../services/two-factor.service.js';
import {
  AccountStatusService,
  type AccountStatusError,
} from '../services/account-status.service.js';
import { AdminNotificationService } from '../services/admin-notification.service.js';
import { UserInventoryService } from '../services/user-inventory.service.js';
import { EmailService } from '../services/email.service.js';
import { getSharedAuthenticatedUserStateService } from '../services/authenticated-user-state.service.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/apiError.js';
import logger from '../utils/logger.js';

const router = Router();
// 再設定のコミットの後に対象者の状態のキャッシュを無効化する（タスク47.5）。共有のインスタンスは
// 呼び出しの時点で解決する（db.ts の PrismaClient の作り直しに追随する）
const twoFactorService = new TwoFactorService({
  invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
});
// 無効化・再有効化のコミットの後に状態のキャッシュを無効化し、全システム管理者へ通知する（タスク49.2）
const accountStatusService = new AccountStatusService({
  prisma: getPrismaClient(),
  userStateService: {
    invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
  },
  adminNotificationService: new AdminNotificationService(getPrismaClient(), new EmailService()),
});

// 棚卸しの一覧と絞り込み（タスク49.5）
const userInventoryService = new UserInventoryService({ prisma: getPrismaClient() });

/** 棚卸しの 1 ページの件数の上限（他の一覧の API と同じ） */
const USER_INVENTORY_MAX_LIMIT = 100;

/** 棚卸しのクエリ */
const userInventoryQuerySchema = z.object({
  status: z
    .enum(['active', 'inactive'], { message: 'status must be active or inactive' })
    .optional(),
  inactiveDaysAtLeast: z.coerce
    .number({ message: 'inactiveDaysAtLeast must be a number' })
    .int('inactiveDaysAtLeast must be an integer')
    .min(0, 'inactiveDaysAtLeast must be at least 0')
    .max(36500, 'inactiveDaysAtLeast must be at most 36500')
    .optional(),
  page: z.coerce
    .number({ message: 'page must be a number' })
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .default(1),
  limit: z.coerce
    .number({ message: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(USER_INVENTORY_MAX_LIMIT, `limit must be at most ${USER_INVENTORY_MAX_LIMIT}`)
    .default(20),
});

/**
 * @swagger
 * /api/v1/users/inventory:
 *   get:
 *     summary: 利用者の棚卸しの一覧
 *     description: |
 *       全利用者の表示名・メールアドレス・ロール・状態・2FA 登録の有無・最終ログイン日時・作成日時・招待者を返す
 *       （要件36.10）。状態と最終ログインからの経過日数で絞り込める（要件36.11。両方を組み合わせられる）。
 *       ログインの実績が無い利用者の経過日数は作成日時から数える。並び順は、ログインの実績が無い利用者を先に、
 *       続いて最終ログインの古い順、作成日時の古い順、ID の順。権限 user:read を求め、一般ユーザーは 403
 *       （要件36.12）。
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: 状態（有効・無効）で絞り込む
 *       - in: query
 *         name: inactiveDaysAtLeast
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 36500
 *         description: 最終ログイン（実績が無ければ作成日時）からの経過日数がこの値以上の利用者に絞り込む
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: ページ番号
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: 1 ページの件数
 *     responses:
 *       200:
 *         description: 棚卸しの一覧とページ情報
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [data, pagination]
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [id, displayName, email, roles, status, twoFactorEnabled, lastLoginAt, createdAt, invitedBy]
 *                     properties:
 *                       id:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       email:
 *                         type: string
 *                       roles:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: ロール名（優先度の高い順）
 *                       status:
 *                         type: string
 *                         enum: [active, inactive]
 *                       twoFactorEnabled:
 *                         type: boolean
 *                       lastLoginAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       invitedBy:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       400:
 *         description: クエリの不正（code は VALIDATION_ERROR）
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: 権限の不足（user:read）
 */
router.get(
  '/inventory',
  authenticate,
  requirePermission('user:read'),
  validate(userInventoryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.validatedQuery as z.infer<typeof userInventoryQuerySchema>;
      res.json(await userInventoryService.list(query));
    } catch (error) {
      next(error);
    }
  }
);

/** 無効化・再有効化の本文（理由は前後の空白を除いて 1 文字以上） */
const accountStatusChangeSchema = z.object({
  reason: z
    .string({ message: 'reason is required' })
    .trim()
    .min(1, 'reason is required')
    .max(1000, 'reason must be at most 1000 characters'),
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

/** 無効化・再有効化の業務上の失敗を応答へ写す */
function accountStatusErrorToApiError(error: AccountStatusError) {
  switch (error.type) {
    case 'USER_NOT_FOUND':
      return new NotFoundError('User not found', 'USER_NOT_FOUND');
    case 'SELF_DEACTIVATION_FORBIDDEN':
      return new ConflictError('Cannot deactivate your own account', error.type);
    case 'LAST_ACTIVE_ADMIN_PROTECTED':
      return new ConflictError(
        'Cannot deactivate the last active system administrator',
        error.type
      );
    case 'ALREADY_IN_STATE':
      return new ConflictError('User is already in the requested state', error.type);
  }
}

/** 無効化・再有効化の経路の処理 */
function accountStatusHandler(operation: 'deactivate' | 'reactivate') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: targetUserId } = req.params as { id: string };
      const actorId = req.user!.userId;
      const { reason } = req.validatedBody as z.infer<typeof accountStatusChangeSchema>;

      const result = await accountStatusService[operation](actorId, targetUserId, reason, {
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      if (!result.ok) {
        next(accountStatusErrorToApiError(result.error));
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * @swagger
 * /api/v1/users/{id}/deactivate:
 *   post:
 *     summary: 管理者による利用者の無効化
 *     description: |
 *       対象者を無効化し、全てのリフレッシュトークンを失効させる。以後の対象者のリフレッシュと API は
 *       401 ACCOUNT_DISABLED になる（要件36.1）。監査（USER_DEACTIVATED）に実行者・対象・理由を記録し、
 *       全システム管理者へ通知する（要件36.4）。自分自身と最後の有効なシステム管理者の無効化は拒否する（要件36.5）。
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: 無効化の理由
 *     responses:
 *       204:
 *         description: 無効化の完了
 *       400:
 *         description: 理由の欠落（code は VALIDATION_ERROR）
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: 権限の不足（user:manage）
 *       404:
 *         description: 対象者が見つからない（code は USER_NOT_FOUND）
 *       409:
 *         description: 自分自身（SELF_DEACTIVATION_FORBIDDEN）、最後の有効なシステム管理者（LAST_ACTIVE_ADMIN_PROTECTED）、既に無効（ALREADY_IN_STATE）
 */
router.post(
  '/:id/deactivate',
  authenticate,
  requirePermission('user:manage'),
  validate(accountStatusChangeSchema),
  accountStatusHandler('deactivate')
);

/**
 * @swagger
 * /api/v1/users/{id}/reactivate:
 *   post:
 *     summary: 管理者による利用者の再有効化
 *     description: |
 *       無効化された対象者を再有効化し、再びログインできるようにする（要件36.3）。監査（USER_REACTIVATED）に
 *       実行者・対象・理由を記録し、全システム管理者へ通知する（要件36.4）。
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: 再有効化の理由
 *     responses:
 *       204:
 *         description: 再有効化の完了
 *       400:
 *         description: 理由の欠落（code は VALIDATION_ERROR）
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: 権限の不足（user:manage）
 *       404:
 *         description: 対象者が見つからない（code は USER_NOT_FOUND）
 *       409:
 *         description: 既に有効（ALREADY_IN_STATE）
 */
router.post(
  '/:id/reactivate',
  authenticate,
  requirePermission('user:manage'),
  validate(accountStatusChangeSchema),
  accountStatusHandler('reactivate')
);

export default router;
