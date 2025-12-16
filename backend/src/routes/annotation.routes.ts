/**
 * @fileoverview 注釈管理エンドポイント
 *
 * Task 6.3: 注釈管理エンドポイントを実装する
 * - GET /api/site-surveys/images/:imageId/annotations（取得）
 * - PUT /api/site-surveys/images/:imageId/annotations（保存）
 * - GET /api/site-surveys/images/:imageId/annotations/export（JSONエクスポート）
 *
 * Requirements:
 * - 9.1: 全ての注釈データをデータベースに保存する
 * - 9.2: 保存された注釈データを復元して表示する
 * - 9.6: 注釈データをJSON形式でエクスポート可能にする
 *
 * @module routes/annotation
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  AnnotationService,
  AnnotationImageNotFoundError,
  AnnotationConflictError,
  InvalidAnnotationDataError,
  AnnotationNotFoundError,
} from '../services/annotation.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  imageIdParamSchema,
  saveAnnotationBodySchema,
  type SaveAnnotationBodyInput,
} from '../schemas/annotation.schema.js';
import type { AnnotationData } from '../services/annotation.service.js';

const router = Router();
const prisma = getPrismaClient();
const annotationService = new AnnotationService({ prisma });

/**
 * @swagger
 * /api/site-surveys/images/{imageId}/annotations:
 *   get:
 *     summary: 注釈データ取得
 *     description: 画像に関連付けられた注釈データを取得する
 *     tags:
 *       - Annotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 画像ID
 *     responses:
 *       200:
 *         description: 注釈データ取得成功（注釈が存在しない場合はdata: nullを返す）
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     imageId:
 *                       type: string
 *                       format: uuid
 *                     data:
 *                       type: object
 *                     version:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: null
 *       400:
 *         description: 無効な画像ID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 */
router.get(
  '/:imageId/annotations',
  authenticate,
  requirePermission('site_survey:read'),
  validate(imageIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };

      const annotation = await annotationService.getAnnotationWithValidation(imageId);

      if (!annotation) {
        logger.debug({ userId: req.user?.userId, imageId }, 'No annotation found for image');
        res.json({ data: null });
        return;
      }

      logger.debug({ userId: req.user?.userId, imageId }, 'Annotation retrieved successfully');

      res.json(annotation);
    } catch (error) {
      if (error instanceof AnnotationImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/annotation-image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          imageId: error.imageId,
        });
        return;
      }
      if (error instanceof InvalidAnnotationDataError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/invalid-annotation-data',
          title: 'Invalid Annotation Data',
          status: 400,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/images/{imageId}/annotations:
 *   put:
 *     summary: 注釈データ保存
 *     description: 画像に注釈データを保存する（新規作成または更新）
 *     tags:
 *       - Annotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 画像ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 required:
 *                   - objects
 *                 properties:
 *                   version:
 *                     type: string
 *                   objects:
 *                     type: array
 *                     items:
 *                       type: object
 *                   background:
 *                     type: string
 *                   viewportTransform:
 *                     type: array
 *                     items:
 *                       type: number
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 楽観的排他制御用の期待される更新日時
 *     responses:
 *       200:
 *         description: 注釈データ保存成功
 *       400:
 *         description: バリデーションエラーまたは無効な注釈データ形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:imageId/annotations',
  authenticate,
  requirePermission('site_survey:update'),
  validate(imageIdParamSchema, 'params'),
  validate(saveAnnotationBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };
      const { data, expectedUpdatedAt } = req.validatedBody as SaveAnnotationBodyInput;

      const annotation = await annotationService.save({
        imageId,
        data: data as AnnotationData,
        expectedUpdatedAt: expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined,
      });

      logger.info({ userId: req.user?.userId, imageId }, 'Annotation saved successfully');

      res.json(annotation);
    } catch (error) {
      if (error instanceof AnnotationImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/annotation-image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          imageId: error.imageId,
        });
        return;
      }
      if (error instanceof InvalidAnnotationDataError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/invalid-annotation-data',
          title: 'Invalid Annotation Data',
          status: 400,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof AnnotationConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/annotation-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: error.code,
          expectedUpdatedAt: error.expectedUpdatedAt,
          actualUpdatedAt: error.actualUpdatedAt,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/images/{imageId}/annotations/export:
 *   get:
 *     summary: 注釈データJSONエクスポート
 *     description: 注釈データをJSONファイルとしてエクスポートする
 *     tags:
 *       - Annotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 画像ID
 *     responses:
 *       200:
 *         description: JSONエクスポート成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: 無効な画像ID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像または注釈データが見つからない
 */
router.get(
  '/:imageId/annotations/export',
  authenticate,
  requirePermission('site_survey:read'),
  validate(imageIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };

      const jsonString = await annotationService.exportAsJson(imageId);

      const filename = `annotation_${imageId}_${new Date().toISOString().split('T')[0]}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      logger.info({ userId: req.user?.userId, imageId }, 'Annotation exported successfully');

      res.send(jsonString);
    } catch (error) {
      if (error instanceof AnnotationImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/annotation-image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          imageId: error.imageId,
        });
        return;
      }
      if (error instanceof AnnotationNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/annotation-not-found',
          title: 'Annotation Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          imageId: error.imageId,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
