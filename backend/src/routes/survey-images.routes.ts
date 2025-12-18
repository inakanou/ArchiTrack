/**
 * @fileoverview 画像管理エンドポイント
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - POST /api/site-surveys/:id/images（アップロード、multipart/form-data）
 * - GET /api/site-surveys/:id/images（一覧）
 * - PUT /api/site-surveys/:id/images/order（順序変更）
 * - DELETE /api/site-surveys/images/:imageId（削除）
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し現場調査に紐付ける
 * - 4.2: バッチアップロードを実行する
 * - 4.7: ユーザーが画像を削除すると、画像と関連する注釈データを削除する
 * - 4.9: 画像一覧を固定の表示順序で表示する
 * - 4.10: ユーザーが画像をドラッグアンドドロップすると、画像の表示順序を変更して保存する
 * - 12.1, 12.2, 12.3: 認証・認可ミドルウェア適用
 *
 * @module routes/survey-images
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import getPrismaClient from '../db.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import logger from '../utils/logger.js';

// Services
import { SiteSurveyService } from '../services/site-survey.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { ImageListService } from '../services/image-list.service.js';
import {
  ImageUploadService,
  SurveyNotFoundError,
  MaxImagesExceededError,
} from '../services/image-upload.service.js';
import { ImageOrderService, ImageOrderError } from '../services/image-order.service.js';
import { ImageDeleteService, ImageNotFoundError } from '../services/image-delete.service.js';
import { SurveyImageService } from '../services/survey-image.service.js';
import { ImageProcessorService } from '../services/image-processor.service.js';
import { SignedUrlService } from '../services/signed-url.service.js';

// mergeParams: true を設定して親ルーターからパラメータを引き継ぐ
const router = Router({ mergeParams: true });

// Multer設定（メモリストレージ）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10, // 一度に最大10ファイル
  },
});

// 依存関係の初期化
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const siteSurveyService = new SiteSurveyService({ prisma, auditLogService });
const signedUrlService = new SignedUrlService({ prisma });
const imageListService = new ImageListService({ prisma, signedUrlService });

// ストレージ関連サービス（ストレージが設定されている場合のみ初期化）
let imageUploadService: ImageUploadService | null = null;
let imageDeleteService: ImageDeleteService | null = null;
let servicesInitialized = false;

/**
 * ストレージサービスの初期化を行う
 * サーバー起動時に呼び出される
 */
export async function initializeStorageServices(): Promise<void> {
  if (servicesInitialized) {
    return;
  }

  if (!isStorageConfigured()) {
    logger.warn('Storage is not configured. Image upload/delete features will be disabled.');
    servicesInitialized = true;
    return;
  }

  const storageProvider = getStorageProvider();
  if (!storageProvider) {
    logger.warn('Storage provider not available. Image upload/delete features will be disabled.');
    servicesInitialized = true;
    return;
  }

  try {
    const surveyImageService = new SurveyImageService({ prisma, storageProvider });

    // Sharp をダイナミックインポート
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default;

    // SharpStaticインターフェースにキャスト
    const imageProcessorService = new ImageProcessorService(((input: Buffer) =>
      sharp(input)) as import('../services/image-processor.service.js').SharpStatic);

    imageUploadService = new ImageUploadService({
      prisma,
      storageProvider,
      surveyImageService,
      imageProcessorService,
    });

    imageDeleteService = new ImageDeleteService({
      prisma,
      storageProvider,
    });

    logger.info({ storageType: storageProvider.type }, 'Storage services initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize storage services');
  }

  servicesInitialized = true;
}

// 後方互換性のため、モジュール読み込み時にも初期化を試みる（非同期）
initializeStorageServices().catch((error) => {
  logger.error({ error }, 'Failed to initialize storage services on module load');
});

const imageOrderService = new ImageOrderService({ prisma });

/**
 * バリデーションスキーマ
 */
const surveyIdParamSchema = z.object({
  id: z.string().uuid('無効な現場調査IDです'),
});

const imageIdParamSchema = z.object({
  imageId: z.string().uuid('無効な画像IDです'),
});

const imageOrderBodySchema = z.object({
  orders: z
    .array(
      z.object({
        id: z.string().uuid('無効な画像IDです'),
        order: z.number().int().min(1, '順序は1以上の整数である必要があります'),
      })
    )
    .min(1, '順序情報が指定されていません'),
});

/**
 * @swagger
 * /api/site-surveys/{id}/images:
 *   get:
 *     summary: 画像一覧取得
 *     description: 現場調査に紐付く画像の一覧を表示順序でソートして取得
 *     tags:
 *       - Survey Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 現場調査ID
 *     responses:
 *       200:
 *         description: 画像一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 現場調査が見つからない
 */
router.get(
  '/',
  authenticate,
  requirePermission('site_survey:read'),
  validate(surveyIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: surveyId } = req.validatedParams as { id: string };
      const userId = req.user!.userId;

      // 現場調査の存在確認
      const survey = await siteSurveyService.findById(surveyId);

      if (!survey) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/site-survey-not-found',
          title: 'Site Survey Not Found',
          status: 404,
          detail: `Site survey not found: ${surveyId}`,
          code: 'SITE_SURVEY_NOT_FOUND',
          surveyId,
        });
        return;
      }

      // 署名付きURL付きの画像一覧を取得
      const images = await imageListService.findBySurveyIdWithUrls(surveyId, userId);

      logger.debug({ userId, surveyId, imageCount: images.length }, 'Survey images list retrieved');

      res.json(images);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/{id}/images:
 *   post:
 *     summary: 画像アップロード
 *     description: 現場調査に画像をアップロード（複数ファイル対応）
 *     tags:
 *       - Survey Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 現場調査ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: アップロード成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 現場調査が見つからない
 *       413:
 *         description: ファイルサイズ超過
 */
router.post(
  '/',
  authenticate,
  requirePermission('site_survey:update'),
  validate(surveyIdParamSchema, 'params'),
  upload.array('images', 10),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: surveyId } = req.validatedParams as { id: string };
      const files = req.files as Express.Multer.File[];

      if (!imageUploadService) {
        res.status(503).json({
          type: 'https://architrack.example.com/problems/storage-not-configured',
          title: 'Storage Not Configured',
          status: 503,
          detail: 'ストレージが設定されていません',
          code: 'STORAGE_NOT_CONFIGURED',
        });
        return;
      }

      if (!files || files.length === 0) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'アップロードするファイルが指定されていません',
          code: 'NO_FILES',
        });
        return;
      }

      // ファイルをUploadFile形式に変換
      const uploadFiles = files.map((file) => ({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      }));

      // バッチアップロード実行
      const result = await imageUploadService.uploadBatch(surveyId, uploadFiles);

      const statusCode = result.failed.length === 0 ? 201 : 207; // 207: Multi-Status

      logger.info(
        {
          userId: req.user!.userId,
          surveyId,
          successCount: result.successful.length,
          failCount: result.failed.length,
        },
        'Images uploaded'
      );

      res.status(statusCode).json(result);
    } catch (error) {
      if (error instanceof SurveyNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/site-survey-not-found',
          title: 'Site Survey Not Found',
          status: 404,
          detail: error.message,
          code: 'SITE_SURVEY_NOT_FOUND',
          surveyId: error.surveyId,
        });
        return;
      }
      if (error instanceof MaxImagesExceededError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/max-images-exceeded',
          title: 'Max Images Exceeded',
          status: 400,
          detail: error.message,
          code: 'MAX_IMAGES_EXCEEDED',
          currentCount: error.currentCount,
          maxCount: error.maxCount,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/{id}/images/order:
 *   put:
 *     summary: 画像順序変更
 *     description: 画像の表示順序を一括変更
 *     tags:
 *       - Survey Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 現場調査ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orders
 *             properties:
 *               orders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - order
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order:
 *                       type: integer
 *                       minimum: 1
 *     responses:
 *       204:
 *         description: 順序変更成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 現場調査または画像が見つからない
 */
router.put(
  '/order',
  authenticate,
  requirePermission('site_survey:update'),
  validate(surveyIdParamSchema, 'params'),
  validate(imageOrderBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: surveyId } = req.validatedParams as { id: string };
      const { orders } = req.validatedBody as { orders: Array<{ id: string; order: number }> };

      await imageOrderService.updateImageOrder(surveyId, orders);

      logger.info(
        { userId: req.user!.userId, surveyId, orderCount: orders.length },
        'Image order updated'
      );

      res.status(204).send();
    } catch (error) {
      if (error instanceof ImageOrderError) {
        const statusCode =
          error.code === 'SURVEY_NOT_FOUND' || error.code === 'IMAGE_NOT_FOUND'
            ? 404
            : error.code === 'SURVEY_DELETED'
              ? 410
              : 400;

        res.status(statusCode).json({
          type: `https://architrack.example.com/problems/${error.code.toLowerCase().replace(/_/g, '-')}`,
          title: error.code.replace(/_/g, ' '),
          status: statusCode,
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
 * /api/site-surveys/images/{imageId}:
 *   delete:
 *     summary: 画像削除
 *     description: 画像と関連する注釈データを削除
 *     tags:
 *       - Survey Images
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
 *       204:
 *         description: 削除成功
 *       400:
 *         description: 無効な画像ID
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 */
router.delete(
  '/:imageId',
  authenticate,
  requirePermission('site_survey:delete'),
  validate(imageIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };

      if (!imageDeleteService) {
        res.status(503).json({
          type: 'https://architrack.example.com/problems/storage-not-configured',
          title: 'Storage Not Configured',
          status: 503,
          detail: 'ストレージが設定されていません',
          code: 'STORAGE_NOT_CONFIGURED',
        });
        return;
      }

      await imageDeleteService.delete(imageId);

      logger.info({ userId: req.user!.userId, imageId }, 'Image deleted');

      res.status(204).send();
    } catch (error) {
      if (error instanceof ImageNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: error.message,
          code: 'IMAGE_NOT_FOUND',
          imageId: error.imageId,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
