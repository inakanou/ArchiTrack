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
 * 案件の閲覧範囲（estimate-request の Requirement 42、user-authentication の要件39。タスク103.1）:
 * 全経路で requirePermission の後に estimate-request-project-scope.middleware の判定部品を置き、
 * 受領見積書は親の見積依頼の案件で判定して範囲外は不在と同じ汎用の 404 にする。登録・更新は
 * ファイルの受け取りより前に判定する。プレビューの署名付きURLは範囲内に限って発行する。
 *
 * 経路の引数名（タスク106.1、Requirement 42.12）: 本部品は `/api/estimate-requests/:id/quotations` と
 * `/api/quotations` に二重にマウントされる。受領見積書の経路の引数名を `quotationId` とし、親の見積依頼の
 * 経路の引数名 `id` と分ける（名前が重なると mergeParams で子の値が優先され、経路の見積依頼が読めない）。
 * 見積依頼の配下の経路で受領見積書が経路の見積依頼に属さないときは、判定部品が不在と同じ汎用の 404 にし、
 * 受領見積書の案件が範囲外のときだけ記録する。URL は変わらない。OpenAPI の注釈の経路の引数名も実装に合わせて
 * `/api/quotations/{quotationId}` とした（2026-10-31 の機能検証の指摘）。
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
import {
  requireEstimateRequestProjectScope,
  requireReceivedQuotationProjectScope,
} from '../middleware/estimate-request-project-scope.middleware.js';
import logger from '../utils/logger.js';
import {
  createReceivedQuotationSchema,
  updateReceivedQuotationSchema,
  receivedQuotationIdParamSchema,
  estimateRequestIdForQuotationSchema,
  deleteReceivedQuotationQuerySchema,
  parseLineItemsFromMultipart,
} from '../schemas/received-quotation.schema.js';
import {
  ReceivedQuotationNotFoundError,
  ReceivedQuotationConflictError,
  InvalidContentTypeError,
  InvalidFileTypeError,
  FileSizeLimitExceededError,
  FileOrLineItemsRequiredError,
} from '../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../errors/estimateRequestError.js';

// mergeParams: true を設定してネストされたルートから見積依頼の ID（親の経路の引数 `id`）を取得できるようにする。
// 受領見積書の経路の引数は `quotationId` とし、親の `id` を上書きしない（タスク106.1、42.12）
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
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 受領見積書名
 *               submittedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 提出日
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: ファイル（任意）
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
  // 受領見積書の追加は見積依頼の更新権限を使用（受領見積書は見積依頼の子リソース）
  requirePermission('estimate_request:update'),
  validate(estimateRequestIdForQuotationSchema, 'params'),
  requireEstimateRequestProjectScope('id'),
  upload.single('file'),
  validate(createReceivedQuotationSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: estimateRequestId } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as {
        name: string;
        submittedAt: string;
        netAmount?: number | null;
      };

      // Task 21.3: multipart内のlineItemsフィールド（JSON文字列）をパース・検証
      let lineItems;
      try {
        lineItems = parseLineItemsFromMultipart(req.body?.lineItems as string | undefined);
      } catch (error) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error instanceof Error ? error.message : '明細行データのバリデーションエラー',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const input = {
        estimateRequestId,
        name: validatedBody.name,
        submittedAt: new Date(validatedBody.submittedAt),
        file: req.file
          ? {
              buffer: req.file.buffer,
              originalName: req.file.originalname,
              mimeType: req.file.mimetype,
              size: req.file.size,
            }
          : undefined,
        lineItems,
        netAmount: validatedBody.netAmount,
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
      if (error instanceof FileOrLineItemsRequiredError) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          message: error.message,
          code: 'FILE_OR_LINE_ITEMS_REQUIRED',
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
  // 見積依頼詳細画面で受領見積書一覧を表示するため、estimate_request:read権限でアクセス可能とする
  requirePermission('estimate_request:read'),
  validate(estimateRequestIdForQuotationSchema, 'params'),
  requireEstimateRequestProjectScope('id'),
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
 * /api/quotations/{quotationId}:
 *   get:
 *     summary: 受領見積書詳細取得
 *     description: 受領見積書の詳細情報を取得
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quotationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID（形式が誤っていれば 400 で、details[].path は quotationId）
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
  '/:quotationId',
  authenticate,
  // 受領見積書の閲覧は見積依頼の閲覧権限を使用（受領見積書は見積依頼の子リソース）
  requirePermission('estimate_request:read'),
  validate(receivedQuotationIdParamSchema, 'params'),
  requireReceivedQuotationProjectScope('quotationId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quotationId: id } = req.validatedParams as { quotationId: string };

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
 * /api/quotations/{quotationId}:
 *   put:
 *     summary: 受領見積書更新
 *     description: 受領見積書の情報を更新（楽観的排他制御）
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quotationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID（形式が誤っていれば 400 で、details[].path は quotationId）
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
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: ファイル（任意）
 *               removeFile:
 *                 type: boolean
 *                 description: ファイル削除フラグ
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
  '/:quotationId',
  authenticate,
  // 受領見積書の更新は見積依頼の更新権限を使用（受領見積書は見積依頼の子リソース）
  requirePermission('estimate_request:update'),
  validate(receivedQuotationIdParamSchema, 'params'),
  requireReceivedQuotationProjectScope('quotationId'),
  upload.single('file'),
  validate(updateReceivedQuotationSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quotationId: id } = req.validatedParams as { quotationId: string };
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name?: string;
        submittedAt?: string;
        removeFile?: boolean;
      };

      // Task 21.3: multipart内のlineItemsフィールド（JSON文字列）をパース・検証
      let lineItems;
      try {
        lineItems = parseLineItemsFromMultipart(req.body?.lineItems as string | undefined);
      } catch (error) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error instanceof Error ? error.message : '明細行データのバリデーションエラー',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

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
        lineItems,
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
 * /api/quotations/{quotationId}:
 *   delete:
 *     summary: 受領見積書削除
 *     description: 受領見積書を論理削除（楽観的排他制御、ファイル物理削除）。基準時刻はクエリで受け取り、本文は読まない
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quotationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID（形式が誤っていれば 400 で、details[].path は quotationId）
 *       - in: query
 *         name: updatedAt
 *         required: true
 *         description: 楽観的排他制御の基準時刻（取得した受領見積書の updatedAt）
 *         schema:
 *           type: string
 *           format: date-time
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
  '/:quotationId',
  authenticate,
  // 受領見積書の削除は見積依頼の更新権限を使用（受領見積書は見積依頼の子リソース）
  requirePermission('estimate_request:update'),
  validate(receivedQuotationIdParamSchema, 'params'),
  requireReceivedQuotationProjectScope('quotationId'),
  // 基準時刻はクエリで受け取る（DELETE の本文は中継で落ちうる。2026-10-31 の是正、見積依頼の削除と同じ形）。
  // 範囲の判定の後に検証し、範囲外は 400 より先に 404 にする（判定の順序: 権限 → ID → 案件の範囲 → クエリ）
  validate(deleteReceivedQuotationQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quotationId: id } = req.validatedParams as { quotationId: string };
      const { updatedAt } = req.validatedQuery as { updatedAt: string };

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
 * /api/quotations/{quotationId}/preview:
 *   get:
 *     summary: ファイルプレビューURL取得
 *     description: 受領見積書のファイルプレビュー用署名付きURLを取得
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quotationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 受領見積書ID（形式が誤っていれば 400 で、details[].path は quotationId）
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
  '/:quotationId/preview',
  authenticate,
  // 受領見積書の閲覧は見積依頼の閲覧権限を使用（受領見積書は見積依頼の子リソース）
  requirePermission('estimate_request:read'),
  validate(receivedQuotationIdParamSchema, 'params'),
  requireReceivedQuotationProjectScope('quotationId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { quotationId: id } = req.validatedParams as { quotationId: string };

      const url = await getReceivedQuotationService().getFilePreviewUrl(id, req.user!.userId);

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
