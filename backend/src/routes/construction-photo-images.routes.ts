/**
 * @fileoverview 工事写真 画像管理エンドポイント
 *
 * 二重マウント（nested `/api/construction-photos/:id/images` ＋
 * flat `/api/construction-photos/images`）で提供する。既存の現場調査画像ルート
 * （survey-images.routes.ts）の実装パターンを踏襲する。
 *
 * 実装済み:
 * - POST /api/construction-photos/:id/images（アップロード, 2.2, multipart images[] ≤10, ≤10MB）
 * - POST /api/construction-photos/:id/images/from-surveys（現調コピー, 2.3）
 * - GET  /api/construction-photos/:id/images（一覧取得＋署名URL一括, 2.4）
 * メタ更新(2.5)・並び替え・削除・印字画像(3.3) は後続タスクで追加する。
 *
 * Requirements:
 * - 4.1, 4.2, 4.3, 4.7: 複数画像を写真項目として登録しサムネ生成、末尾表示順
 * - 4.5, 12.4: 許可されない形式を拒否
 * - 5.1, 5.2: カメラ撮影もサーバ側は同一経路
 * - 7.8, 11.2: 一覧は写真項目＋署名付きURLを1リクエストでまとめて返す（N+1回避）
 * - 11.3: サムネ優先（一覧では原本URLを返さない）
 * - 12.1, 12.2, 12.3: 最大10件/10MBの制約と超過拒否
 * - 12.5: 部分失敗は成功分維持
 * - 13.1, 13.2, 13.3: 認証・認可・プロジェクト境界の検証
 *
 * @module routes/construction-photo-images
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import getPrismaClient from '../db.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import logger from '../utils/logger.js';

import { SurveyImageService } from '../services/survey-image.service.js';
import { ImageProcessorService } from '../services/image-processor.service.js';
import {
  ConstructionPhotoImageService,
  SurveyImageCopyNotAllowedError,
  type ConstructionPhotoUploadFile,
} from '../services/construction-photo-image.service.js';
import { ConstructionPhotoAlbumNotFoundError } from '../services/construction-photo-album.service.js';
import {
  constructionPhotoIdParamSchema,
  addFromSurveyImagesSchema,
  type AddFromSurveyImagesInput,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_SIZE,
  CONSTRUCTION_PHOTO_VALIDATION_MESSAGES,
} from '../schemas/construction-photo.schema.js';

// mergeParams: true でネストされたルート（/:id/images）から id を取得できるようにする
const router = Router({ mergeParams: true });

// Multer設定（メモリストレージ、最大10件/10MB）（Requirements: 12.1, 12.2）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE, // 10MB
    files: MAX_UPLOAD_FILES, // 最大10ファイル
  },
});

const prisma = getPrismaClient();

// ストレージ関連サービス（ストレージが設定されている場合のみ初期化）
let imageService: ConstructionPhotoImageService | null = null;
let servicesInitialized = false;

/**
 * ストレージ依存サービスの初期化。サーバ起動時に呼び出される。
 */
export async function initializeConstructionPhotoImageServices(): Promise<void> {
  if (servicesInitialized) {
    return;
  }

  if (!isStorageConfigured()) {
    logger.warn('Storage is not configured. Construction photo upload feature will be disabled.');
    servicesInitialized = true;
    return;
  }

  const storageProvider = getStorageProvider();
  if (!storageProvider) {
    logger.warn(
      'Storage provider not available. Construction photo upload feature will be disabled.'
    );
    servicesInitialized = true;
    return;
  }

  try {
    const surveyImageService = new SurveyImageService({ prisma, storageProvider });

    // Sharp をダイナミックインポート
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default;
    const imageProcessorService = new ImageProcessorService(((input: Buffer) =>
      sharp(input)) as import('../services/image-processor.service.js').SharpStatic);

    imageService = new ConstructionPhotoImageService({
      prisma,
      storageProvider,
      surveyImageService,
      imageProcessorService,
    });

    logger.info(
      { storageType: storageProvider.type },
      'Construction photo image services initialized successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to initialize construction photo image services');
  }

  servicesInitialized = true;
}

// モジュール読み込み時にも初期化を試みる（非同期）
initializeConstructionPhotoImageServices().catch((error) => {
  logger.error({ error }, 'Failed to initialize construction photo image services on module load');
});

/**
 * multer のアップロードミドルウェアをラップし、制約超過（件数/サイズ）を
 * 適切なHTTPステータスへ変換する（Requirements: 12.3）。
 * - サイズ超過: 413
 * - 件数超過 / 予期しないフィールド: 400
 */
function uploadImages(req: Request, res: Response, next: NextFunction): void {
  upload.array('images', MAX_UPLOAD_FILES)(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            type: 'https://architrack.example.com/problems/file-size-exceeded',
            title: 'File Size Exceeded',
            status: 413,
            detail: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILE_SIZE_EXCEEDED,
            code: 'FILE_SIZE_EXCEEDED',
          });
          return;
        }
        // LIMIT_FILE_COUNT / LIMIT_UNEXPECTED_FILE などファイル数関連
        res.status(400).json({
          type: 'https://architrack.example.com/problems/too-many-files',
          title: 'Too Many Files',
          status: 400,
          detail: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILES_MAX,
          code: 'TOO_MANY_FILES',
        });
        return;
      }
      next(err instanceof Error ? err : new Error('アップロードに失敗しました'));
      return;
    }
    next();
  });
}

/**
 * @swagger
 * /api/construction-photos/{id}/images:
 *   get:
 *     summary: 工事写真一覧取得（署名URL一括）
 *     description: >
 *       アルバム配下の写真項目を displayOrder 昇順で、表示用の署名付きサムネURL同梱で
 *       1リクエストにまとめて返す（写真項目ごとの個別リクエストは発生させない）。
 *     tags:
 *       - Construction Photo Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: アルバムID
 *     responses:
 *       200:
 *         description: 写真項目一覧（署名付きURL同梱）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: アルバムが見つからない、またはアクセス権のないプロジェクト
 *       503:
 *         description: ストレージ未設定
 */
router.get(
  '/',
  authenticate,
  requirePermission('construction_photo:read'),
  validate(constructionPhotoIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: albumId } = req.validatedParams as { id: string };
      const userId = req.user!.userId;

      if (!imageService) {
        res.status(503).json({
          type: 'https://architrack.example.com/problems/storage-not-configured',
          title: 'Storage Not Configured',
          status: 503,
          detail: 'ストレージが設定されていません',
          code: 'STORAGE_NOT_CONFIGURED',
        });
        return;
      }

      const images = await imageService.listWithUrls(albumId, userId);

      logger.debug({ userId, albumId, imageCount: images.length }, 'Construction photos listed');

      res.json(images);
    } catch (error) {
      if (error instanceof ConstructionPhotoAlbumNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/construction-photo-album-not-found',
          title: 'Construction Photo Album Not Found',
          status: 404,
          detail: error.message,
          code: 'CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND',
          albumId: error.albumId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-photos/{id}/images:
 *   post:
 *     summary: 工事写真アップロード
 *     description: アルバムに画像をアップロードして写真項目を追加する（複数ファイル対応、最大10件/10MB）
 *     tags:
 *       - Construction Photo Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: アルバムID
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
 *         description: 全件アップロード成功
 *       207:
 *         description: 一部成功（部分失敗）
 *       400:
 *         description: バリデーションエラー（件数超過・ファイル未指定など）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: アルバムが見つからない
 *       413:
 *         description: ファイルサイズ超過
 *       503:
 *         description: ストレージ未設定
 */
router.post(
  '/',
  authenticate,
  requirePermission('construction_photo:update'),
  validate(constructionPhotoIdParamSchema, 'params'),
  uploadImages,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: albumId } = req.validatedParams as { id: string };
      const files = req.files as Express.Multer.File[] | undefined;

      if (!imageService) {
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
          detail: CONSTRUCTION_PHOTO_VALIDATION_MESSAGES.FILES_MIN,
          code: 'NO_FILES',
        });
        return;
      }

      const uploadFiles: ConstructionPhotoUploadFile[] = files.map((file) => ({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      }));

      const result = await imageService.addFromUpload(albumId, uploadFiles);

      const statusCode = result.failed.length === 0 ? 201 : 207; // 207: Multi-Status（部分失敗）

      logger.info(
        {
          userId: req.user?.userId,
          albumId,
          successCount: result.successful.length,
          failCount: result.failed.length,
        },
        'Construction photos uploaded'
      );

      res.status(statusCode).json(result);
    } catch (error) {
      if (error instanceof ConstructionPhotoAlbumNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/construction-photo-album-not-found',
          title: 'Construction Photo Album Not Found',
          status: 404,
          detail: error.message,
          code: 'CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND',
          albumId: error.albumId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-photos/{id}/images/from-surveys:
 *   post:
 *     summary: 現場調査写真のコピー追加
 *     description: 同一プロジェクトの現場調査写真を独立した写真項目として複製する（storage.copy）
 *     tags:
 *       - Construction Photo Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: アルバムID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               surveyImageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       201:
 *         description: 全件コピー成功
 *       207:
 *         description: 一部成功（部分失敗）
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: アルバムが見つからない、または他プロジェクト/存在しない現調写真を含む
 *       503:
 *         description: ストレージ未設定
 */
router.post(
  '/from-surveys',
  authenticate,
  requirePermission('construction_photo:update'),
  validate(constructionPhotoIdParamSchema, 'params'),
  validate(addFromSurveyImagesSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: albumId } = req.validatedParams as { id: string };
      const { surveyImageIds } = req.validatedBody as AddFromSurveyImagesInput;

      if (!imageService) {
        res.status(503).json({
          type: 'https://architrack.example.com/problems/storage-not-configured',
          title: 'Storage Not Configured',
          status: 503,
          detail: 'ストレージが設定されていません',
          code: 'STORAGE_NOT_CONFIGURED',
        });
        return;
      }

      const result = await imageService.addFromSurveyImage(albumId, surveyImageIds);

      const statusCode = result.failed.length === 0 ? 201 : 207; // 207: Multi-Status（部分失敗）

      logger.info(
        {
          userId: req.user?.userId,
          albumId,
          successCount: result.successful.length,
          failCount: result.failed.length,
        },
        'Construction photos copied from survey images'
      );

      res.status(statusCode).json(result);
    } catch (error) {
      if (error instanceof ConstructionPhotoAlbumNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/construction-photo-album-not-found',
          title: 'Construction Photo Album Not Found',
          status: 404,
          detail: error.message,
          code: 'CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND',
          albumId: error.albumId,
        });
        return;
      }
      if (error instanceof SurveyImageCopyNotAllowedError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/survey-image-not-allowed',
          title: 'Survey Image Not Allowed',
          status: 404,
          detail: error.message,
          code: 'SURVEY_IMAGE_NOT_ALLOWED',
          surveyImageIds: error.surveyImageIds,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
