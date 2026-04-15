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
import { ThumbnailRegenerationError } from '../services/errors.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  imageIdParamSchema,
  saveAnnotationBodySchema,
  batchAnnotationBodySchema,
  type SaveAnnotationBodyInput,
  type BatchAnnotationBodyInput,
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
 *         description: "注釈データ取得成功（注釈が存在しない場合はdata: nullを返す）"
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

      // 注釈付きサムネイルの署名付きURLを生成 (Task 61.1, Requirements 23.5)
      // AnnotationService.save は注釈付きサムネイル再生成を同期実行し、
      // 最新の annotatedThumbnailPath を返す。ここで署名付きURLを付加し
      // フロントエンドが追加API呼び出しなしに最新サムネイルを反映できるようにする。
      let annotatedThumbnailUrl: string | null = null;
      if (annotation.annotatedThumbnailPath && isStorageConfigured()) {
        try {
          const storageProvider = getStorageProvider();
          if (storageProvider) {
            annotatedThumbnailUrl = await storageProvider.getSignedUrl(
              annotation.annotatedThumbnailPath,
              { expiresIn: 900 }
            );
          }
        } catch (urlError) {
          logger.warn(
            {
              userId: req.user?.userId,
              imageId,
              error: urlError instanceof Error ? urlError.message : String(urlError),
            },
            'Failed to generate annotatedThumbnailUrl'
          );
          annotatedThumbnailUrl = null;
        }
      }

      logger.info({ userId: req.user?.userId, imageId }, 'Annotation saved successfully');

      res.json({ ...annotation, annotatedThumbnailUrl });
    } catch (error) {
      if (error instanceof ThumbnailRegenerationError) {
        logger.error(
          {
            userId: req.user?.userId,
            imageId: (req.validatedParams as { imageId?: string } | undefined)?.imageId,
            error: error.message,
          },
          'Annotated thumbnail regeneration failed'
        );
        res.status(500).json({
          type: 'https://architrack.example.com/problems/thumbnail-regeneration-failed',
          title: 'Thumbnail Regeneration Failed',
          status: 500,
          detail: error.message,
          code: error.code,
        });
        return;
      }
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

/**
 * @swagger
 * /api/site-surveys/annotations/batch:
 *   post:
 *     summary: バッチ注釈データ取得
 *     description: 複数画像の注釈データを一括取得する（要件18対応）
 *     tags:
 *       - Annotations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - surveyId
 *               - imageIds
 *             properties:
 *               surveyId:
 *                 type: string
 *                 format: uuid
 *                 description: 現場調査ID（権限検証用）
 *               imageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 minItems: 1
 *                 maxItems: 100
 *                 description: 取得対象の画像ID配列
 *     responses:
 *       200:
 *         description: バッチ注釈データ取得成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 annotations:
 *                   type: object
 *                   additionalProperties:
 *                     oneOf:
 *                       - type: object
 *                       - type: null
 *       400:
 *         description: バリデーションエラー（imageIdsが空配列、100件超過、不正UUID等）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない（surveyに属さないimageId）
 */
router.post(
  '/annotations/batch',
  authenticate,
  requirePermission('site_survey:read'),
  validate(batchAnnotationBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { surveyId, imageIds } = req.validatedBody as BatchAnnotationBodyInput;

      const annotations = await annotationService.findByImageIds(imageIds, surveyId);

      logger.debug(
        { userId: req.user?.userId, surveyId, imageIdCount: imageIds.length },
        'Batch annotations retrieved successfully'
      );

      res.json({ annotations });
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
      next(error);
    }
  }
);

export default router;
