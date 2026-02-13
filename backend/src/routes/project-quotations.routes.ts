/**
 * @fileoverview プロジェクト単位受領見積書取得ルート
 *
 * 見積書作成時の転記機能で使用する、プロジェクトに紐付く受領見積書一覧取得エンドポイント。
 *
 * Requirements (estimate-creation):
 * - REQ-17.1: 転記ダイアログでプロジェクトに紐付く受領見積書一覧をドロップダウンに表示する
 * - REQ-17.2: バックエンドにプロジェクト単位で受領見積書を取得するAPIエンドポイントを提供する
 *
 * Task 21.1: プロジェクト単位受領見積書取得APIの実装
 *
 * @module routes/project-quotations
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ReceivedQuotationService } from '../services/received-quotation.service.js';
import { getStorageProvider } from '../storage/storage-factory.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const quotations = await getService().findByProjectId(projectId);

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
