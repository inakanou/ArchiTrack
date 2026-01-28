/**
 * @fileoverview 自社情報管理APIルート
 *
 * Requirements (アクセス制御):
 * - 6.1: 認証済みユーザーのみに自社情報ページへのアクセスを許可
 * - 6.4: 未認証ユーザーが自社情報ページにアクセスした場合、ログインページにリダイレクト
 * - 6.7: 自社情報の閲覧に「company_info:read」権限を要求
 * - 6.8: 自社情報の保存に「company_info:update」権限を要求
 * - 6.9: 権限のないユーザーが操作を試みた場合、403 Forbiddenエラーを返却
 *
 * Requirements (API設計):
 * - 9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供
 * - 9.2: 自社情報が登録されている場合、自社情報オブジェクトを返却
 * - 9.3: 自社情報が未登録の場合、空オブジェクト {} とHTTPステータス200 OKを返却
 * - 9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供
 * - 9.5: 自社情報が存在しない状態でPUTリクエストを受信したとき、新規レコードを作成
 * - 9.6: 自社情報が存在する状態でPUTリクエストを受信したとき、既存レコードを更新
 * - 9.7: APIレスポンスに必要なフィールドを含める
 * - 9.8: PUTリクエストのボディにversionフィールドを含め、楽観的排他制御を実行
 * - 9.9: versionが一致しない場合、409 Conflictエラーを返却
 * - 9.10: 自社情報の削除APIを提供しない
 *
 * @module routes/company-info
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { CompanyInfoService } from '../services/company-info.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  updateCompanyInfoSchema,
  type UpdateCompanyInfoInput,
} from '../schemas/company-info.schema.js';
import { CompanyInfoConflictError } from '../errors/companyInfoError.js';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const companyInfoService = new CompanyInfoService({
  prisma,
  auditLogService,
});

/**
 * @swagger
 * /api/company-info:
 *   get:
 *     summary: 自社情報取得
 *     description: 自社情報を取得する。未登録の場合は空オブジェクトを返却
 *     tags:
 *       - CompanyInfo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 自社情報（未登録時は空オブジェクト）
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/CompanyInfoResponse'
 *                 - type: object
 *                   description: 未登録時の空オブジェクト
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('company_info:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const companyInfo = await companyInfoService.getCompanyInfo();

      logger.debug({ userId: req.user?.userId }, 'Company info retrieved');

      // REQ-9.3: 未登録時は空オブジェクトを返却
      if (!companyInfo) {
        res.json({});
        return;
      }

      res.json(companyInfo);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/company-info:
 *   put:
 *     summary: 自社情報作成・更新
 *     description: 自社情報を作成または更新する（楽観的排他制御）
 *     tags:
 *       - CompanyInfo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCompanyInfoRequest'
 *     responses:
 *       200:
 *         description: 自社情報作成・更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanyInfoResponse'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/',
  authenticate,
  requirePermission('company_info:update'),
  validate(updateCompanyInfoSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as UpdateCompanyInfoInput;

      const companyInfo = await companyInfoService.upsertCompanyInfo(validatedBody, actorId);

      logger.info({ userId: actorId, companyInfoId: companyInfo.id }, 'Company info saved');

      res.json(companyInfo);
    } catch (error) {
      if (error instanceof CompanyInfoConflictError) {
        const errorDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: error.problemType,
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: error.code,
          ...(errorDetails ?? {}),
        });
        return;
      }
      next(error);
    }
  }
);

// REQ-9.10: 削除APIは提供しない

export default router;
