/**
 * @fileoverview 見積依頼ステータス管理APIルート
 *
 * Requirements:
 * - 12.5, 12.6, 12.7, 12.8: ステータス遷移ボタン制御
 * - 12.9, 12.10: ステータス遷移実行
 * - 12.11: ステータス変更履歴
 *
 * Task 13.3: ステータス管理エンドポイントの実装
 *
 * @module routes/estimate-request-status
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { EstimateRequestStatusService } from '../services/estimate-request-status.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import { statusTransitionSchema } from '../schemas/received-quotation.schema.js';
import { estimateRequestIdParamSchema } from '../schemas/estimate-request.schema.js';
import {
  EstimateRequestStatusNotFoundError,
  InvalidEstimateRequestStatusTransitionError,
} from '../errors/estimateRequestStatusError.js';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const estimateRequestStatusService = new EstimateRequestStatusService({
  prisma,
  auditLogService,
});

/**
 * @swagger
 * /api/estimate-requests/{id}/status:
 *   patch:
 *     summary: ステータス遷移
 *     description: 見積依頼のステータスを遷移させる
 *     tags:
 *       - Estimate Request Status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [BEFORE_REQUEST, REQUESTED, QUOTATION_RECEIVED]
 *                 description: 遷移先ステータス
 *     responses:
 *       200:
 *         description: ステータス遷移成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [BEFORE_REQUEST, REQUESTED, QUOTATION_RECEIVED]
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 無効なステータス遷移
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('estimate_request:update'),
  validate(estimateRequestIdParamSchema, 'params'),
  validate(statusTransitionSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { status } = req.validatedBody as {
        status: 'BEFORE_REQUEST' | 'REQUESTED' | 'QUOTATION_RECEIVED';
      };
      const actorId = req.user!.userId;

      const result = await estimateRequestStatusService.transitionStatus(id, status, actorId);

      logger.info(
        {
          estimateRequestId: id,
          newStatus: status,
          actorId,
        },
        'Estimate request status transitioned successfully'
      );

      res.json(result);
    } catch (error) {
      if (error instanceof EstimateRequestStatusNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-status-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_STATUS_NOT_FOUND',
        });
        return;
      }
      if (error instanceof InvalidEstimateRequestStatusTransitionError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/invalid-status-transition',
          title: 'Invalid Status Transition',
          status: 400,
          detail: error.message,
          code: 'INVALID_STATUS_TRANSITION',
          details: error.details,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}/status-history:
 *   get:
 *     summary: ステータス変更履歴取得
 *     description: 見積依頼のステータス変更履歴を取得
 *     tags:
 *       - Estimate Request Status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積依頼ID
 *     responses:
 *       200:
 *         description: ステータス変更履歴
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   estimateRequestId:
 *                     type: string
 *                     format: uuid
 *                   fromStatus:
 *                     type: string
 *                     enum: [BEFORE_REQUEST, REQUESTED, QUOTATION_RECEIVED]
 *                     nullable: true
 *                   toStatus:
 *                     type: string
 *                     enum: [BEFORE_REQUEST, REQUESTED, QUOTATION_RECEIVED]
 *                   changedById:
 *                     type: string
 *                     format: uuid
 *                   changedAt:
 *                     type: string
 *                     format: date-time
 *                   changedBy:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       displayName:
 *                         type: string
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 */
router.get(
  '/:id/status-history',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(estimateRequestIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const history = await estimateRequestStatusService.getStatusHistory(id);

      logger.debug(
        {
          estimateRequestId: id,
          historyCount: history.length,
        },
        'Estimate request status history retrieved'
      );

      res.json(history);
    } catch (error) {
      if (error instanceof EstimateRequestStatusNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-status-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_STATUS_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
