/**
 * @fileoverview プロジェクト単位受領見積書取得ルート
 *
 * 見積書作成時の転記機能で使用する、プロジェクトに紐付く受領見積書一覧取得エンドポイント。
 *
 * Requirements (estimate-creation):
 * - REQ-17.1: 転記ダイアログでプロジェクトに紐付く受領見積書一覧をドロップダウンに表示する
 * - REQ-17.2: バックエンドにプロジェクト単位で受領見積書を取得するAPIエンドポイントを提供する
 *
 * 案件の閲覧範囲（estimate-creation の Requirement 57.6、user-authentication の要件39。タスク62.1）:
 * requirePermission と ID の形式の検査の後に案件の閲覧範囲の判定部品を置き、範囲外のプロジェクトを
 * 指定した一覧は存在しない場合と同じ汎用の 404 にする。
 *
 * 案件の受領見積書の一覧と登録（estimate-request タスク114.1、design の Requirements 43-50 の章の D2・D3・D6）:
 * - 一覧の既定（`include` 無し）は見積依頼に紐づくものだけを返し（転記元を変えない）、`include=all` で
 *   見積依頼の無いものも返す。`include` の値の検証は範囲の判定の後に置く（範囲外は 400 より先に 404）
 * - 見積依頼の無い受領見積書の登録（multipart）は authenticate → requirePermission('estimate_request:update') →
 *   案件 ID の検証 → 案件の範囲 → ファイルの受信 → 本文の検証 の順（範囲外はファイルを受け取る前に 404）。
 *   成功は 201 と `sharedOriginalCount`、同じ原本・同じ区別は 409 `DUPLICATE_ORIGINAL`
 *
 * Task 21.1: プロジェクト単位受領見積書取得APIの実装
 *
 * @module routes/project-quotations
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ReceivedQuotationService } from '../services/received-quotation.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { getStorageProvider } from '../storage/storage-factory.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireProjectParamScope } from '../middleware/estimate-creation-project-scope.middleware.js';
import { projectIdParamSchema } from '../schemas/estimate.schema.js';
import {
  createReceivedQuotationSchema,
  type CreateReceivedQuotationInput as CreateReceivedQuotationBody,
} from '../schemas/received-quotation.schema.js';
import {
  quotationUpload,
  readMultipartLineItems,
  respondQuotationSaveError,
  toCreateQuotationInput,
} from './received-quotation.routes.js';
import logger from '../utils/logger.js';

/** 一覧の対象の指定（D2）。`all` だけを受け、無ければ見積依頼に紐づくものだけ */
const projectQuotationsQuerySchema = z.object({
  include: z.enum(['all']).optional(),
});

const router = Router({ mergeParams: true });
const prisma = getPrismaClient();

let receivedQuotationService: ReceivedQuotationService | null = null;

function getService(): ReceivedQuotationService {
  if (receivedQuotationService) {
    return receivedQuotationService;
  }
  const storageProvider = getStorageProvider();
  if (!storageProvider) {
    throw new Error('Storage provider is not configured.');
  }
  receivedQuotationService = new ReceivedQuotationService({
    prisma,
    storageProvider,
    // 一覧は記録する操作を呼ばないが、必須の依存のため渡す（estimate-request の Requirement 14.7、タスク111.1）
    auditLogService: new AuditLogService({ prisma }),
  });
  return receivedQuotationService;
}

/**
 * @swagger
 * /api/projects/{projectId}/quotations:
 *   get:
 *     summary: 案件の受領見積書の一覧
 *     description: 既定は見積依頼に紐づく受領見積書だけを返す。include=all で見積依頼の無いものも返す
 *     tags:
 *       - Received Quotations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: include
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all]
 *         description: all を指定すると見積依頼の無い受領見積書も返す
 *     responses:
 *       200:
 *         description: 受領見積書の一覧（tradingPartnerName は業者名の値）
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 案件が見つからない（範囲外を含む）
 *
 * Requirements: REQ-17.1, REQ-17.2
 */
router.get(
  '/',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(projectQuotationsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      // 既定の一覧は見積依頼に紐づくものだけ（estimate-request の design の D2）。include=all で全件（タスク114.1）
      const { include } = req.validatedQuery as z.infer<typeof projectQuotationsQuerySchema>;
      const quotations = await getService().findByProjectId(projectId, {
        include: include === 'all' ? 'all' : 'requested',
      });

      logger.debug(
        { projectId, count: quotations.length },
        'Project received quotations list retrieved for estimate transfer'
      );

      res.json(quotations);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/quotations:
 *   post:
 *     summary: 見積依頼に紐づかない受領見積書の登録
 *     description: 案件に属し見積依頼に紐づかない受領見積書を登録する（multipart）。範囲外の案件はファイルを受け取る前に 404
 *     tags:
 *       - Received Quotations
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - submittedAt
 *               - vendorName
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               submittedAt:
 *                 type: string
 *                 format: date-time
 *               vendorName:
 *                 type: string
 *                 maxLength: 200
 *                 description: 業者名
 *               tradingPartnerId:
 *                 type: string
 *                 format: uuid
 *                 description: 選んだ協力業者の取引先（任意）
 *               netAmount:
 *                 type: number
 *               lineItems:
 *                 type: string
 *                 description: 明細行（JSON 文字列）
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: 登録成功（本文は受領見積書と sharedOriginalCount）
 *       400:
 *         description: バリデーションエラー（業者名の未入力を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 案件が見つからない（範囲外を含む）
 *       409:
 *         description: 同じ案件に同じ原本・同じ見積の区別の受領見積書がある（code は DUPLICATE_ORIGINAL、existing に既存の name・vendorName・submittedAt）
 *       413:
 *         description: ファイルサイズ上限超過
 *       415:
 *         description: ファイル形式エラー
 */
router.post(
  '/',
  authenticate,
  requirePermission('estimate_request:update'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  quotationUpload.single('file'),
  validate(createReceivedQuotationSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };

      const parsed = readMultipartLineItems(req, res);
      if (!parsed.ok) {
        return;
      }

      const input = toCreateQuotationInput(
        req.validatedBody as CreateReceivedQuotationBody,
        req.file,
        parsed.lineItems
      );

      // 案件の文脈で作る（業者名の必須〔43.8〕と取引先の照合〔44.5〜44.7〕はサービスが行う）
      const { quotation, sharedOriginalCount } = await getService().create(
        { kind: 'project', projectId },
        input,
        req.user!.userId
      );

      logger.info(
        { quotationId: quotation.id, projectId },
        'Received quotation without estimate request created'
      );

      res.status(201).json({ ...quotation, sharedOriginalCount });
    } catch (error) {
      if (respondQuotationSaveError(error, res)) {
        return;
      }
      next(error);
    }
  }
);

export default router;
