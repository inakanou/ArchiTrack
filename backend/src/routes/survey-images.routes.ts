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
import {
  ImageMetadataService,
  ImageNotFoundError as MetadataImageNotFoundError,
  CommentTooLongError,
} from '../services/image-metadata.service.js';

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
const imageMetadataService = new ImageMetadataService({ prisma });

/**
 * 注釈付き（合成済み）サムネイルのストレージ区画
 *
 * Task 115.1: 画像編集画面で合成された画像はこの区画にのみ保存し、
 * 通常サムネイル（`surveys/{surveyId}/...`）と区画で識別できるようにする。
 */
const ANNOTATED_THUMBNAIL_PREFIX = 'annotated-thumbnails';

/**
 * 注釈付きサムネイルの署名付きURL有効期限（秒）
 */
const ANNOTATED_THUMBNAIL_URL_EXPIRES_IN = 900;

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

const thumbnailUpdateBodySchema = z.object({
  imageData: z
    .string()
    .min(1, '画像データが指定されていません')
    .refine(
      (data) => data.startsWith('data:image/'),
      '無効な画像データ形式です。data:image/で始まるBase64形式である必要があります。'
    ),
});

/**
 * 画像メタデータ更新スキーマ
 */
const imageMetadataUpdateBodySchema = z
  .object({
    comment: z.string().max(2000, 'コメントは2000文字以内で入力してください').nullable().optional(),
    includeInReport: z.boolean().optional(),
  })
  .refine((data) => data.comment !== undefined || data.includeInReport !== undefined, {
    message: 'commentまたはincludeInReportのいずれかを指定してください',
  });

/**
 * 画像メタデータ一括更新スキーマ
 *
 * Task 33.1: 写真一覧管理パネルを手動保存方式に変更する
 * Task 38.1: displayOrderサポート追加（連番に正規化される）
 */
const batchImageMetadataUpdateBodySchema = z.object({
  updates: z
    .array(
      z
        .object({
          id: z.string().uuid('無効な画像IDです'),
          comment: z
            .string()
            .max(2000, 'コメントは2000文字以内で入力してください')
            .nullable()
            .optional(),
          includeInReport: z.boolean().optional(),
          displayOrder: z
            .number()
            .int()
            .positive('表示順序は正の整数で指定してください')
            .optional(),
        })
        .refine(
          (data) =>
            data.comment !== undefined ||
            data.includeInReport !== undefined ||
            data.displayOrder !== undefined,
          {
            message: 'comment、includeInReport、displayOrderのいずれかを指定してください',
          }
        )
    )
    .min(1, '更新データが指定されていません'),
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

      // アップロード直後の画像に署名付きURLを付与する。
      // これによりフロントエンドは詳細データを再取得せずに、返却された画像を
      // 一覧へ追記して即座に表示できる（追加のたびに全画像を再取得する遅延を回避）。
      // 新規アップロード画像には注釈が存在しないため hasAnnotations は常に false。
      // 描画された注釈も当然存在しないため hasDrawnAnnotations も false（Task 115.13）。
      const enrichedSuccessful = await Promise.all(
        result.successful.map(async (image) => {
          const [originalUrl, thumbnailUrl] = await Promise.all([
            signedUrlService.generateSignedUrl(image.id, 'original').catch(() => null),
            signedUrlService.generateSignedUrl(image.id, 'thumbnail').catch(() => null),
          ]);

          return {
            ...image,
            originalUrl,
            thumbnailUrl,
            hasAnnotations: false,
            hasDrawnAnnotations: false,
          };
        })
      );

      const responseBody = { successful: enrichedSuccessful, failed: result.failed };

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

      res.status(statusCode).json(responseBody);
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
 * /api/site-surveys/images/batch:
 *   patch:
 *     summary: 画像メタデータ一括更新
 *     description: |
 *       複数の画像のコメント、報告書出力フラグ、表示順序を一括で更新します。
 *       displayOrderが指定された場合、サーバー側で1, 2, 3...の連番に正規化されます。
 *       重複や欠番があっても、相対的な順序を保持して正規化されます。
 *     tags:
 *       - Survey Images
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: 画像ID
 *                     comment:
 *                       type: string
 *                       nullable: true
 *                       maxLength: 2000
 *                       description: 写真コメント（最大2000文字、nullでクリア）
 *                     includeInReport:
 *                       type: boolean
 *                       description: 報告書出力フラグ
 *                     displayOrder:
 *                       type: integer
 *                       minimum: 1
 *                       description: 表示順序（相対的な順序、サーバー側で連番に正規化）
 *     responses:
 *       200:
 *         description: 一括更新成功
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
 *                   comment:
 *                     type: string
 *                     nullable: true
 *                   includeInReport:
 *                     type: boolean
 *                   displayOrder:
 *                     type: integer
 *                     description: 正規化された表示順序（1から始まる連番）
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 */
router.patch(
  '/batch',
  authenticate,
  requirePermission('site_survey:update'),
  validate(batchImageMetadataUpdateBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { updates } = req.validatedBody as {
        updates: Array<{
          id: string;
          comment?: string | null;
          includeInReport?: boolean;
          displayOrder?: number;
        }>;
      };

      const updatedImages = await imageMetadataService.updateMetadataBatch(updates);

      logger.info(
        { userId: req.user!.userId, updateCount: updates.length },
        'Image metadata batch updated'
      );

      res.json(
        updatedImages.map((img) => ({
          id: img.id,
          surveyId: img.surveyId,
          fileName: img.fileName,
          comment: img.comment,
          includeInReport: img.includeInReport,
          displayOrder: img.displayOrder,
        }))
      );
    } catch (error) {
      if (error instanceof MetadataImageNotFoundError) {
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
      if (error instanceof CommentTooLongError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'COMMENT_TOO_LONG',
          length: error.length,
          maxLength: error.maxLength,
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

/**
 * @swagger
 * /api/site-surveys/images/{imageId}:
 *   patch:
 *     summary: 画像メタデータ更新
 *     description: 画像のコメントと報告書出力フラグを更新
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 2000
 *                 description: 写真コメント（最大2000文字、nullでクリア）
 *               includeInReport:
 *                 type: boolean
 *                 description: 報告書出力フラグ
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 comment:
 *                   type: string
 *                   nullable: true
 *                 includeInReport:
 *                   type: boolean
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 */
router.patch(
  '/:imageId',
  authenticate,
  requirePermission('site_survey:update'),
  validate(imageIdParamSchema, 'params'),
  validate(imageMetadataUpdateBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };
      const { comment, includeInReport } = req.validatedBody as {
        comment?: string | null;
        includeInReport?: boolean;
      };

      const updatedImage = await imageMetadataService.updateMetadata(imageId, {
        comment,
        includeInReport,
      });

      logger.info(
        { userId: req.user!.userId, imageId, comment: !!comment, includeInReport },
        'Image metadata updated'
      );

      res.json({
        id: updatedImage.id,
        surveyId: updatedImage.surveyId,
        fileName: updatedImage.fileName,
        comment: updatedImage.comment,
        includeInReport: updatedImage.includeInReport,
        displayOrder: updatedImage.displayOrder,
      });
    } catch (error) {
      if (error instanceof MetadataImageNotFoundError) {
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
      if (error instanceof CommentTooLongError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'COMMENT_TOO_LONG',
          length: error.length,
          maxLength: error.maxLength,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/images/{imageId}/annotated-thumbnail:
 *   patch:
 *     summary: 合成済みサムネイル更新
 *     description: |
 *       画像編集画面で合成した注釈付き画像を受け取り、注釈付きサムネイル
 *       （annotatedThumbnailPath）として保存する。
 *       通常サムネイル（thumbnailPath）はアップロード時の素の画像として不変であり、
 *       本エンドポイントでは一切書き換えない。
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageData
 *             properties:
 *               imageData:
 *                 type: string
 *                 description: Base64エンコードされた画像データ（data:image/...形式）
 *     responses:
 *       200:
 *         description: 合成済みサムネイル更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 annotatedThumbnailPath:
 *                   type: string
 *                   description: 保存された注釈付きサムネイルのストレージキー
 *                 annotatedThumbnailUrl:
 *                   type: string
 *                   nullable: true
 *                   description: 注釈付きサムネイルの署名付きURL
 *       400:
 *         description: 無効な画像データ
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 *       503:
 *         description: ストレージ未設定
 */
router.patch(
  '/:imageId/annotated-thumbnail',
  authenticate,
  requirePermission('site_survey:update'),
  validate(imageIdParamSchema, 'params'),
  validate(thumbnailUpdateBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };
      const { imageData } = req.validatedBody as { imageData: string };

      // 画像の存在確認
      // 注意: thumbnailPath は取得しない。本経路は通常サムネイルを読みも書きもしない。
      const image = await prisma.surveyImage.findUnique({
        where: { id: imageId },
        select: {
          id: true,
          annotatedThumbnailPath: true,
        },
      });

      if (!image) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: `画像が見つかりません: ${imageId}`,
          code: 'IMAGE_NOT_FOUND',
          imageId,
        });
        return;
      }

      // ストレージプロバイダーを取得
      const storageProvider = isStorageConfigured() ? getStorageProvider() : null;
      if (!storageProvider) {
        res.status(503).json({
          type: 'https://architrack.example.com/problems/storage-not-configured',
          title: 'Storage Not Configured',
          status: 503,
          detail: 'ストレージが設定されていません',
          code: 'STORAGE_NOT_CONFIGURED',
        });
        return;
      }

      // Base64データをバッファに変換
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Sharpをダイナミックインポートしてサムネイル生成
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default;
      const imageProcessorService = new ImageProcessorService(((input: Buffer) =>
        sharp(input)) as import('../services/image-processor.service.js').SharpStatic);

      const thumbnailBuffer = await imageProcessorService.generateThumbnail(imageBuffer);

      // 1. 注釈付きサムネイル用の区画へタイムスタンプ付き新キーで保存
      //    通常サムネイル（surveys/{surveyId}/...）とは区画で識別できる
      //    保存に失敗した場合は例外を伝播させ DB は更新しない（旧い表示元を維持）
      const newAnnotatedThumbnailPath = `${ANNOTATED_THUMBNAIL_PREFIX}/${imageId}.${Date.now()}.jpg`;
      await storageProvider.upload(newAnnotatedThumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
      });

      // 2. DB を新キーへ切り替え（annotatedThumbnailPath のみ。thumbnailPath は不変）
      const oldAnnotatedThumbnailPath = image.annotatedThumbnailPath;
      await prisma.surveyImage.update({
        where: { id: imageId },
        data: { annotatedThumbnailPath: newAnnotatedThumbnailPath },
      });

      // 3. 旧い合成済みサムネイルの best-effort 削除（通常サムネイルは削除対象外）
      if (oldAnnotatedThumbnailPath && oldAnnotatedThumbnailPath !== newAnnotatedThumbnailPath) {
        try {
          await storageProvider.delete(oldAnnotatedThumbnailPath);
        } catch (deleteError) {
          logger.warn(
            {
              imageId,
              oldPath: oldAnnotatedThumbnailPath,
              error: deleteError instanceof Error ? deleteError.message : String(deleteError),
            },
            'Failed to delete stale annotated thumbnail (best-effort)'
          );
        }
      }

      // 4. 更新後の表示元を署名付きURLで返す（呼び出し元が追加取得なしに画面へ反映できる）
      let annotatedThumbnailUrl: string | null = null;
      try {
        annotatedThumbnailUrl = await storageProvider.getSignedUrl(newAnnotatedThumbnailPath, {
          expiresIn: ANNOTATED_THUMBNAIL_URL_EXPIRES_IN,
        });
      } catch (urlError) {
        logger.warn(
          {
            imageId,
            path: newAnnotatedThumbnailPath,
            error: urlError instanceof Error ? urlError.message : String(urlError),
          },
          'Failed to generate annotatedThumbnailUrl'
        );
      }

      logger.info(
        { userId: req.user!.userId, imageId, annotatedThumbnailPath: newAnnotatedThumbnailPath },
        'Annotated thumbnail updated from editor composite'
      );

      res.status(200).json({
        success: true,
        annotatedThumbnailPath: newAnnotatedThumbnailPath,
        annotatedThumbnailUrl,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update annotated thumbnail');
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/images/{imageId}/annotated-thumbnail:
 *   delete:
 *     summary: 合成済みサムネイル取り消し
 *     description: |
 *       注釈も回転も無い状態で保存された画像について、合成済みサムネイルが
 *       存在しない状態へ収束させる。annotatedThumbnailPath を空にしたうえで、
 *       残存する実体を後片付けする。
 *       通常サムネイル（thumbnailPath）は読みも書きも削除も行わない。
 *       既に合成済みサムネイルが無い場合も成功を返す（冪等）。
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
 *       200:
 *         description: 合成済みサムネイル取り消し成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 annotatedThumbnailPath:
 *                   type: string
 *                   nullable: true
 *                   description: 取り消し後の保存先（常に null）
 *                 annotatedThumbnailUrl:
 *                   type: string
 *                   nullable: true
 *                   description: 取り消し後の表示元（常に null）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 画像が見つからない
 */
router.delete(
  '/:imageId/annotated-thumbnail',
  authenticate,
  // 画像編集画面の保存操作の一部であるため、更新権限で足りる（削除権限は要求しない）
  requirePermission('site_survey:update'),
  validate(imageIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { imageId } = req.validatedParams as { imageId: string };

      // 注意: thumbnailPath は取得しない。本経路は通常サムネイルを読みも書きもしない。
      const image = await prisma.surveyImage.findUnique({
        where: { id: imageId },
        select: {
          id: true,
          annotatedThumbnailPath: true,
        },
      });

      if (!image) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/image-not-found',
          title: 'Image Not Found',
          status: 404,
          detail: `画像が見つかりません: ${imageId}`,
          code: 'IMAGE_NOT_FOUND',
          imageId,
        });
        return;
      }

      const staleAnnotatedThumbnailPath = image.annotatedThumbnailPath;

      // 既に合成済みサムネイルが無い場合は何も変更しない（Req 23.8: 冪等）
      if (staleAnnotatedThumbnailPath) {
        // 1. 先に項目を空へ切り替える（annotatedThumbnailPath のみ。thumbnailPath は不変）。
        //    実体より先に項目を空にすることで、実体だけが失われた表示元を指す瞬間を作らない。
        //    表示側は空になった時点で素のサムネイルへ退避する。
        await prisma.surveyImage.update({
          where: { id: imageId },
          data: { annotatedThumbnailPath: null },
        });

        // 2. 残存する合成済みサムネイルの実体を best-effort 削除（通常サムネイルは削除対象外）
        const storageProvider = isStorageConfigured() ? getStorageProvider() : null;
        if (storageProvider) {
          try {
            await storageProvider.delete(staleAnnotatedThumbnailPath);
          } catch (deleteError) {
            logger.warn(
              {
                imageId,
                stalePath: staleAnnotatedThumbnailPath,
                error: deleteError instanceof Error ? deleteError.message : String(deleteError),
              },
              'Failed to delete annotated thumbnail object (best-effort)'
            );
          }
        } else {
          logger.warn(
            { imageId, stalePath: staleAnnotatedThumbnailPath },
            'Storage is not configured; annotated thumbnail object left in place'
          );
        }

        logger.info(
          { userId: req.user!.userId, imageId, stalePath: staleAnnotatedThumbnailPath },
          'Annotated thumbnail cleared (no annotations and no rotation)'
        );
      }

      res.status(200).json({
        success: true,
        annotatedThumbnailPath: null,
        annotatedThumbnailUrl: null,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to clear annotated thumbnail');
      next(error);
    }
  }
);

export default router;
