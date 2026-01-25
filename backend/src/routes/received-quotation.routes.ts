/**
 * @fileoverview 受領見積書APIルート
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.2: 受領見積書登録フォーム
 * - 11.9, 11.12, 11.13: 一覧取得
 * - 11.14: ファイルプレビュー
 * - 11.15, 11.16, 11.17: 編集・削除
 *
 * Task 13.2: 受領見積書エンドポイントの実装
 *
 * @module routes/received-quotation
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { ReceivedQuotationService } from '../services/received-quotation.service.js';
import { getStorageProvider } from '../storage/storage-factory.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createReceivedQuotationSchema,
  updateReceivedQuotationSchema,
  receivedQuotationIdParamSchema,
  estimateRequestIdForQuotationSchema,
  deleteReceivedQuotationBodySchema,
} from '../schemas/received-quotation.schema.js';
import {
  ReceivedQuotationNotFoundError,
  ReceivedQuotationConflictError,
  InvalidContentTypeError,
  InvalidFileTypeError,
  FileSizeLimitExceededError,
} from '../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../errors/estimateRequestError.js';

// mergeParams: true を設定してネストされたルートからestimateRequestIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();

// 遅延初期化: テスト時にストレージが未設定でもルート定義が可能
let receivedQuotationService: ReceivedQuotationService | null = null;

/**
 * サービスインスタンスを取得（遅延初期化）
 * @throws Error ストレージプロバイダーが設定されていない場合
 */
function getReceivedQuotationService(): ReceivedQuotationService {
  if (receivedQuotationService) {
    return receivedQuotationService;
  }

  const storageProvider = getStorageProvider();
  if (!storageProvider) {
    throw new Error('Storage provider is not configured. Check environment settings.');
  }

  receivedQuotationService = new ReceivedQuotationService({
    prisma,
    storageProvider,
  });
  return receivedQuotationService;
}

// multerの設定（メモリストレージ）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * @swagger
 * /api/estimate-requests/{id}/quotations:
 *   post:
 *     summary: 受領見積書作成
 *     description: 見積依頼に紐付く受領見積書を作成
 *     tags:
 *       - Received Quotations
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - submittedAt
 *               - contentType
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 受領見積書名
 *               submittedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 提出日
 *               contentType:
 *                 type: string
 *                 enum: [TEXT, FILE]
 *                 description: コンテンツタイプ
 *               textContent:
 *                 type: string
 *                 description: テキスト内容（contentType=TEXTの場合）
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: ファイル（contentType=FILEの場合）
 *     responses:
 *       201:
 *         description: 受領見積書作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積依頼が見つからない
 *       413:
 *         description: ファイルサイズ上限超過
 *       415:
 *         description: ファイル形式エラー
 *       422:
 *         description: コンテンツタイプの整合性エラー
 */
router.post(
  '/',
  authenticate,
  requirePermission('received_quotation:create'),
  upload.single('file'),
  validate(estimateRequestIdForQuotationSchema, 'params'),
  validate(createReceivedQuotationSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: estimateRequestId } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as {
        name: string;
        submittedAt: string;
        contentType: 'TEXT' | 'FILE';
        textContent?: string;
      };

      const input = {
        estimateRequestId,
        name: validatedBody.name,
        submittedAt: new Date(validatedBody.submittedAt),
        contentType: validatedBody.contentType,
        textContent: validatedBody.textContent,
        file: req.file
          ? {
              buffer: req.file.buffer,
              originalName: req.file.originalname,
              mimeType: req.file.mimetype,
              size: req.file.size,
            }
          : undefined,
      };

      const quotation = await getReceivedQuotationService().create(input);

      logger.info(
        {
          quotationId: quotation.id,
          estimateRequestId,
          name: quotation.name,
        },
        'Received quotation created successfully'
      );

      res.status(201).json(quotation);
    } catch (error) {
      if (error instanceof EstimateRequestNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-request-not-found',
          title: 'Estimate Request Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_REQUEST_NOT_FOUND',
        });
        return;
      }
      if (error instanceof InvalidContentTypeError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/invalid-content-type',
          title: 'Invalid Content Type',
          status: 422,
          detail: error.message,
          code: 'INVALID_CONTENT_TYPE',
        });
        return;
      }
      if (error instanceof InvalidFileTypeError) {
        res.status(415).json({
          type: 'https://architrack.example.com/problems/invalid-file-type',
          title: 'Invalid File Type',
          status: 415,
          detail: error.message,
          code: 'INVALID_FILE_TYPE',
        });
        return;
      }
      if (error instanceof FileSizeLimitExceededError) {
        res.status(413).json({
          type: 'https://architrack.example.com/problems/file-size-limit-exceeded',
          title: 'File Size Limit Exceeded',
          status: 413,
          detail: error.message,
          code: 'FILE_SIZE_LIMIT_EXCEEDED',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimate-requests/{id}/quotations:
 *   get:
 *     summary: 受領見積書一覧取得
 *     description: 見積依頼に紐付く受領見積書の一覧を取得
 *     tags:
 *       - Received Quotations
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
 *         description: 受領見積書一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('received_quotation:read'),
  validate(estimateRequestIdForQuotationSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: estimateRequestId } = req.validatedParams as { id: string };

      const quotations =
        await getReceivedQuotationService().findByEstimateRequestId(estimateRequestId);

      logger.debug(
        {
          estimateRequestId,
          count: quotations.length,
        },
        'Received quotations list retrieved'
      );

      res.json(quotations);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     summary: 受領見積書詳細取得
 *     description: 受領見積書の詳細情報を取得
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID
 *     responses:
 *       200:
 *         description: 受領見積書詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 受領見積書が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('received_quotation:read'),
  validate(receivedQuotationIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const quotation = await getReceivedQuotationService().findById(id);

      if (!quotation) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/received-quotation-not-found',
          title: 'Received Quotation Not Found',
          status: 404,
          detail: `受領見積書が見つかりません: ${id}`,
          code: 'RECEIVED_QUOTATION_NOT_FOUND',
          quotationId: id,
        });
        return;
      }

      logger.debug({ quotationId: id }, 'Received quotation detail retrieved');

      res.json(quotation);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quotations/{id}:
 *   put:
 *     summary: 受領見積書更新
 *     description: 受領見積書の情報を更新（楽観的排他制御）
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - expectedUpdatedAt
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 受領見積書名
 *               submittedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 提出日
 *               contentType:
 *                 type: string
 *                 enum: [TEXT, FILE]
 *                 description: コンテンツタイプ
 *               textContent:
 *                 type: string
 *                 description: テキスト内容
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: ファイル
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 楽観的排他制御用の更新日時
 *     responses:
 *       200:
 *         description: 受領見積書更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 受領見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 *       413:
 *         description: ファイルサイズ上限超過
 *       415:
 *         description: ファイル形式エラー
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('received_quotation:update'),
  upload.single('file'),
  validate(receivedQuotationIdParamSchema, 'params'),
  validate(updateReceivedQuotationSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name?: string;
        submittedAt?: string;
        contentType?: 'TEXT' | 'FILE';
        textContent?: string;
      };

      const input = {
        ...updateData,
        submittedAt: updateData.submittedAt ? new Date(updateData.submittedAt) : undefined,
        file: req.file
          ? {
              buffer: req.file.buffer,
              originalName: req.file.originalname,
              mimeType: req.file.mimetype,
              size: req.file.size,
            }
          : undefined,
      };

      const quotation = await getReceivedQuotationService().update(
        id,
        input,
        new Date(expectedUpdatedAt)
      );

      logger.info({ quotationId: id }, 'Received quotation updated successfully');

      res.json(quotation);
    } catch (error) {
      if (error instanceof ReceivedQuotationNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/received-quotation-not-found',
          title: 'Received Quotation Not Found',
          status: 404,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ReceivedQuotationConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/received-quotation-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_CONFLICT',
        });
        return;
      }
      if (error instanceof InvalidContentTypeError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/invalid-content-type',
          title: 'Invalid Content Type',
          status: 422,
          detail: error.message,
          code: 'INVALID_CONTENT_TYPE',
        });
        return;
      }
      if (error instanceof InvalidFileTypeError) {
        res.status(415).json({
          type: 'https://architrack.example.com/problems/invalid-file-type',
          title: 'Invalid File Type',
          status: 415,
          detail: error.message,
          code: 'INVALID_FILE_TYPE',
        });
        return;
      }
      if (error instanceof FileSizeLimitExceededError) {
        res.status(413).json({
          type: 'https://architrack.example.com/problems/file-size-limit-exceeded',
          title: 'File Size Limit Exceeded',
          status: 413,
          detail: error.message,
          code: 'FILE_SIZE_LIMIT_EXCEEDED',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quotations/{id}:
 *   delete:
 *     summary: 受領見積書削除
 *     description: 受領見積書を論理削除（楽観的排他制御、ファイル物理削除）
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updatedAt
 *             properties:
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 楽観的排他制御用の更新日時
 *     responses:
 *       204:
 *         description: 受領見積書削除成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 受領見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('received_quotation:delete'),
  validate(receivedQuotationIdParamSchema, 'params'),
  validate(deleteReceivedQuotationBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const { updatedAt } = req.validatedBody as { updatedAt: string };

      await getReceivedQuotationService().delete(id, new Date(updatedAt));

      logger.info({ quotationId: id }, 'Received quotation deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof ReceivedQuotationNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/received-quotation-not-found',
          title: 'Received Quotation Not Found',
          status: 404,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ReceivedQuotationConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/received-quotation-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_CONFLICT',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/quotations/{id}/preview:
 *   get:
 *     summary: ファイルプレビューURL取得
 *     description: 受領見積書のファイルプレビュー用署名付きURLを取得
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID
 *     responses:
 *       200:
 *         description: 署名付きURL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *                   description: 署名付きURL
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 受領見積書が見つからない
 *       422:
 *         description: テキストコンテンツの場合（ファイルなし）
 */
router.get(
  '/:id/preview',
  authenticate,
  requirePermission('received_quotation:read'),
  validate(receivedQuotationIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const url = await getReceivedQuotationService().getFilePreviewUrl(id);

      logger.debug({ quotationId: id }, 'Received quotation preview URL generated');

      res.json({ url });
    } catch (error) {
      if (error instanceof ReceivedQuotationNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/received-quotation-not-found',
          title: 'Received Quotation Not Found',
          status: 404,
          detail: error.message,
          code: 'RECEIVED_QUOTATION_NOT_FOUND',
        });
        return;
      }
      if (error instanceof InvalidContentTypeError) {
        res.status(422).json({
          type: 'https://architrack.example.com/problems/invalid-content-type',
          title: 'Invalid Content Type',
          status: 422,
          detail: error.message,
          code: 'INVALID_CONTENT_TYPE',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
