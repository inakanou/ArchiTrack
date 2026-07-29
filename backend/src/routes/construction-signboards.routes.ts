/**
 * @fileoverview 工事看板マスタCRUD・一覧エンドポイント
 *
 * 二重マウント（nested `/api/projects/:projectId/construction-signboards` ＋
 * flat `/api/construction-signboards`）で提供する。既存の工事写真アルバムルート
 * （construction-photos.routes.ts）の実装パターンを踏襲する。
 *
 * Requirements:
 * - 8.1: 当該プロジェクトに紐付く工事看板レコードを作成する
 * - 8.2, 8.3, 8.4: 標準項目・自由項目・固定テキストを保持する
 * - 8.6: 工事看板を編集して保存する（楽観的排他制御）
 * - 8.7: 工事看板を削除する（論理削除）
 * - 8.8: 使用中の看板削除で使用件数（inUseCount）を返す
 * - 8.9: 当該プロジェクト配下でのみ選択・参照可能とする
 * - 8.10: 当該プロジェクトに登録済みの工事看板を一覧表示する
 * - 13.1, 13.3: 認証・認可ミドルウェア適用（construction_signboard:*）
 * - 13.2: 取得・更新・削除は対象が要求プロジェクト配下であることを検証する
 *
 * @module routes/construction-signboards
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ConstructionSignboardService,
  type CreateSignboardInput,
  type UpdateSignboardInput,
} from '../services/construction-signboard.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createConstructionSignboardSchema,
  updateConstructionSignboardSchema,
  constructionSignboardIdParamSchema,
  constructionSignboardProjectIdParamSchema,
} from '../schemas/construction-signboard.schema.js';
import type { SignboardFreeItem } from '../types/construction-photo.types.js';

// mergeParams: true でネストされたルートから projectId を取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const signboardService = new ConstructionSignboardService({ prisma });

/**
 * @swagger
 * /api/projects/{projectId}/construction-signboards:
 *   post:
 *     summary: 工事看板作成
 *     description: プロジェクトに紐付く新規工事看板を作成する
 *     tags:
 *       - Construction Signboards
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workName
 *               - workLocation
 *             properties:
 *               workName:
 *                 type: string
 *                 maxLength: 200
 *               workLocation:
 *                 type: string
 *                 maxLength: 200
 *               freeItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     label:
 *                       type: string
 *                     value:
 *                       type: string
 *               footerText:
 *                 type: string
 *                 maxLength: 2000
 *                 nullable: true
 *     responses:
 *       201:
 *         description: 看板作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.post(
  '/',
  authenticate,
  requirePermission('construction_signboard:create'),
  validate(constructionSignboardProjectIdParamSchema, 'params'),
  validate(createConstructionSignboardSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedBody = req.validatedBody as {
        workName: string;
        workLocation: string;
        freeItems: SignboardFreeItem[];
        footerText?: string | null;
      };

      const input: CreateSignboardInput = { ...validatedBody, projectId };
      const signboard = await signboardService.create(input);

      logger.info(
        { userId: req.user?.userId, signboardId: signboard.id, projectId },
        'Construction signboard created successfully'
      );

      res.status(201).json(signboard);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/construction-signboards:
 *   get:
 *     summary: 工事看板一覧取得
 *     description: プロジェクトに登録済みの工事看板一覧を取得する
 *     tags:
 *       - Construction Signboards
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 看板一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('construction_signboard:read'),
  validate(constructionSignboardProjectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };

      const signboards = await signboardService.findByProject(projectId);

      logger.debug(
        { userId: req.user?.userId, projectId, count: signboards.length },
        'Construction signboards list retrieved'
      );

      res.json(signboards);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-signboards/{id}:
 *   patch:
 *     summary: 工事看板更新
 *     description: 工事看板を更新する（楽観的排他制御）
 *     tags:
 *       - Construction Signboards
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updatedAt
 *             properties:
 *               workName:
 *                 type: string
 *                 maxLength: 200
 *               workLocation:
 *                 type: string
 *                 maxLength: 200
 *               freeItems:
 *                 type: array
 *                 items:
 *                   type: object
 *               footerText:
 *                 type: string
 *                 maxLength: 2000
 *                 nullable: true
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 看板更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 看板が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('construction_signboard:update'),
  validate(constructionSignboardIdParamSchema, 'params'),
  validate(updateConstructionSignboardSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as UpdateSignboardInput;
      // nested マウント時は projectId が付与されるため、配下検証に用いる（Requirements: 13.2）
      const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;

      const signboard = await signboardService.update(id, validatedBody, projectId);

      logger.info({ userId: req.user?.userId, signboardId: id }, 'Construction signboard updated');

      res.json(signboard);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-signboards/{id}:
 *   delete:
 *     summary: 工事看板削除
 *     description: 工事看板を論理削除し、当該看板を使用している写真項目の件数（inUseCount）を返す
 *     tags:
 *       - Construction Signboards
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 看板削除成功（使用件数を返す）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inUseCount:
 *                   type: integer
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 看板が見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('construction_signboard:delete'),
  validate(constructionSignboardIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      // nested マウント時は projectId が付与されるため、配下検証に用いる（Requirements: 13.2）
      const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;

      const result = await signboardService.delete(id, projectId);

      logger.info(
        { userId: req.user?.userId, signboardId: id, inUseCount: result.inUseCount },
        'Construction signboard deleted'
      );

      // 使用件数（inUseCount>0 は使用中）を返す（Requirements: 8.8）
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
