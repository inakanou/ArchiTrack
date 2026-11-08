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
 * Task 21.1: プロジェクト単位受領見積書取得APIの実装
 *
 * @module routes/project-quotations
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ReceivedQuotationService } from '../services/received-quotation.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { getStorageProvider } from '../storage/storage-factory.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireProjectParamScope } from '../middleware/estimate-creation-project-scope.middleware.js';
import { projectIdParamSchema } from '../schemas/estimate.schema.js';
import logger from '../utils/logger.js';

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
 * GET /api/projects/:projectId/quotations
 * プロジェクトに紐付く受領見積書一覧を取得
 *
 * Requirements: REQ-17.1, REQ-17.2
 */
router.get(
  '/',
  authenticate,
  requirePermission('estimate_request:read'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      // 既定の一覧は見積依頼に紐づくものだけ（estimate-request の design の D2。全件の指定はタスク114.1 で足す）
      const quotations = await getService().findByProjectId(projectId, { include: 'requested' });

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

export default router;
