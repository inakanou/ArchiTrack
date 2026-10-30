/**
 * @fileoverview 監査ログAPIルート
 *
 * Requirements:
 * - 22: 監査ログとコンプライアンス
 * - user-authentication 40.9: データ出力の記録の API（POST /exports）と、監査ログの JSON 出力の記録
 * - user-authentication 41.5: アーカイブの復元の API（POST /archives/restore）
 */

import { once } from 'events';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuditLogService, serializeAuditLogExport } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import type { AuditLogFilter } from '../types/audit-log.types.js';
import type { RequestContext } from '../types/auth.types.js';
import { ExportAuditService, type ExportRecordInput } from '../services/export-audit.service.js';
import { getSharedProjectScopeService } from '../services/project-scope.service.js';
import { exportRecordSchema } from '../schemas/export-audit.schema.js';
import {
  archiveRestoreSchema,
  type ArchiveRestoreRequest,
} from '../schemas/audit-log-archive-restore.schema.js';
import { ApiError, InternalServerError, NotFoundError } from '../errors/apiError.js';
import { PROBLEM_TYPES } from '../types/problem-details.js';
import { ARCHIVE_TARGET_TYPE } from '../services/audit-log-archive.service.js';
import { createAuditLogArchiveServiceForJob } from '../jobs/audit-log-archive.job.js';
import type { ArchiveError, IAuditLogArchiveService } from '../types/audit-log-archive.types.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const exportAuditService = new ExportAuditService({
  auditLogService,
  // 共有のインスタンスは要求のたびに取り直す（PrismaClient・RBACService の作り直しに追従する）
  scopeService: {
    evaluateProjectAccess: (userId, projectId) =>
      getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
  },
});

/**
 * アーカイブの復元に使う部品（最初の要求のときに一度だけ作る。保存先と暗号鍵は定期処理と同じ）
 */
let archiveService: Pick<IAuditLogArchiveService, 'restore'> | null = null;
function getArchiveService(): Pick<IAuditLogArchiveService, 'restore'> {
  archiveService ??= createAuditLogArchiveServiceForJob(prisma);
  return archiveService;
}

/** 復元の失敗を応答の誤りにする（保存先の原因の詳細は応答に出さない） */
function archiveRestoreError(error: ArchiveError): ApiError {
  switch (error.type) {
    case 'KEY_MISSING':
      return new InternalServerError(
        'アーカイブの暗号鍵が設定されていないため復元できません',
        'ARCHIVE_KEY_MISSING'
      );
    case 'STORAGE_FAILED':
      return new ApiError(
        503,
        'アーカイブの保存先を読み取れなかったため復元できません',
        'ARCHIVE_STORAGE_FAILED',
        undefined,
        PROBLEM_TYPES.INTERNAL_SERVER_ERROR
      );
    case 'INTEGRITY_FAILED':
      return new ApiError(
        500,
        'アーカイブの照合に失敗しました（改ざんまたは破損の可能性があります）',
        'ARCHIVE_INTEGRITY_FAILED',
        { month: error.month },
        PROBLEM_TYPES.INTERNAL_SERVER_ERROR
      );
  }
}

/** 監査に書く要求の送信元（長さを切り詰める） */
function requestAuditMetadata(req: Request): Record<string, string | boolean> {
  const ctx = requestContext(req);
  const metadata: Record<string, string | boolean> = {};
  if (ctx.ipAddress !== undefined) {
    metadata.ipAddress = boundAuditText(ctx.ipAddress, AUDIT_IP_ADDRESS_MAX_LENGTH).value;
  }
  if (ctx.userAgent !== undefined) {
    const userAgent = boundAuditText(ctx.userAgent, AUDIT_USER_AGENT_MAX_LENGTH);
    metadata.userAgent = userAgent.value;
    if (userAgent.truncated) {
      metadata.userAgentTruncated = true;
    }
  }
  return metadata;
}

/** 監査の記録に使う要求の送信元 */
function requestContext(req: Request): RequestContext {
  return { ipAddress: getClientIp(req), userAgent: req.get('user-agent') };
}

/** 出力を記録できなかったときの応答（出力は返さない） */
function exportRecordFailedError(): InternalServerError {
  return new InternalServerError('出力を記録できなかったため中止しました', 'EXPORT_RECORD_FAILED');
}

/**
 * @swagger
 * /api/v1/audit-logs:
 *   get:
 *     summary: 監査ログ取得
 *     description: 監査ログを取得（フィルタリング対応）
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: 実行者ユーザーID
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: 対象リソースID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: アクション種別
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 開始日時（ISO 8601形式）
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 終了日時（ISO 8601形式）
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: スキップ数
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *         description: 取得件数
 *     responses:
 *       200:
 *         description: 監査ログ一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('audit:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: AuditLogFilter = {};

      // クエリパラメータからフィルタを構築
      if (req.query.actorId) {
        filter.actorId = req.query.actorId as string;
      }
      if (req.query.targetId) {
        filter.targetId = req.query.targetId as string;
      }
      if (req.query.action) {
        filter.action = req.query.action as AuditLogFilter['action'];
      }
      if (req.query.startDate) {
        filter.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filter.endDate = req.query.endDate as string;
      }
      if (req.query.skip) {
        filter.skip = parseInt(req.query.skip as string, 10);
      }
      if (req.query.take) {
        filter.take = parseInt(req.query.take as string, 10);
      }

      const logs = await auditLogService.getLogs(filter);

      logger.info(
        {
          userId: req.user?.userId,
          filterCount: Object.keys(filter).length,
          resultCount: logs.length,
        },
        'Audit logs retrieved'
      );

      res.json(logs);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/audit-logs/export:
 *   get:
 *     summary: 監査ログエクスポート
 *     description: 監査ログをJSON形式でエクスポート
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: 実行者ユーザーID
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: 対象リソースID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: アクション種別
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 開始日時（ISO 8601形式）
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 終了日時（ISO 8601形式）
 *     responses:
 *       200:
 *         description: JSON形式の監査ログ
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       500:
 *         description: 出力の記録の失敗（出力は返さない）
 */
router.get(
  '/export',
  authenticate,
  requirePermission('audit:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: AuditLogFilter = {};

      // クエリパラメータからフィルタを構築
      if (req.query.actorId) {
        filter.actorId = req.query.actorId as string;
      }
      if (req.query.targetId) {
        filter.targetId = req.query.targetId as string;
      }
      if (req.query.action) {
        filter.action = req.query.action as AuditLogFilter['action'];
      }
      if (req.query.startDate) {
        filter.startDate = req.query.startDate as string;
      }
      if (req.query.endDate) {
        filter.endDate = req.query.endDate as string;
      }

      const logs = await auditLogService.getLogs(filter);

      // 出力を返す前に記録する。記録できなければ出力を返さない（要件40.9）
      const recorded = await exportAuditService.record(
        req.user!.userId,
        {
          kind: 'audit_log_json',
          projectId: null,
          targetIds: logs.map((log) => log.id),
          itemCount: logs.length,
        },
        requestContext(req)
      );
      if (!recorded.ok) {
        next(exportRecordFailedError());
        return;
      }

      const jsonExport = serializeAuditLogExport(logs);

      // ファイル名にタイムスタンプを含める
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-logs-${timestamp}.json`;

      logger.info(
        { userId: req.user?.userId, filterCount: Object.keys(filter).length, filename },
        'Audit logs exported'
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(jsonExport);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/audit-logs/exports:
 *   post:
 *     summary: データ出力の記録
 *     description: |
 *       データの出力・一括ダウンロードを監査ログ（DATA_EXPORTED）に記録する。認証済みの全利用者が呼べる。
 *       ブラウザで生成する出力は、生成を始める前にこの記録を要求し、失敗したときは出力を中止する。
 *       案件を指定したときは閲覧範囲で判定し、範囲外の案件は存在しない案件と同じ 404 を返す。
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [kind, projectId, targetIds, itemCount]
 *             properties:
 *               kind:
 *                 type: string
 *                 enum:
 *                   - site_survey_report_pdf
 *                   - site_survey_images_zip
 *                   - quantity_table_pdf
 *                   - itemized_statement_xlsx
 *                   - itemized_statement_clipboard
 *                   - estimate_request_xlsx
 *                   - estimate_request_text_clipboard
 *                   - estimate_request_items_clipboard
 *                   - estimate_request_text_mail
 *                   - estimate_pdf
 *                   - estimate_xlsx
 *                   - schedule_export
 *                   - order_export
 *                   - progress_export
 *                   - construction_photo_ledger_pdf
 *                   - construction_photos_zip
 *                   - annotated_image
 *                   - audit_log_json
 *                 description: 出力の種別
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: 対象の案件（案件に属する出力は必須、audit_log_json は null）
 *               targetIds:
 *                 type: array
 *                 maxItems: 10000
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 256
 *                 description: 出力の対象のデータの ID
 *               itemCount:
 *                 type: integer
 *                 minimum: 0
 *                 description: 出力した件数
 *     responses:
 *       201:
 *         description: 記録した監査ログの ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordId:
 *                   type: string
 *       400:
 *         description: 入力の検証エラー
 *       401:
 *         description: 認証エラー
 *       404:
 *         description: 案件が存在しない、または閲覧範囲外
 *       500:
 *         description: 記録の失敗
 */
router.post(
  '/exports',
  authenticate,
  validate(exportRecordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.validatedBody as ExportRecordInput;
      const result = await exportAuditService.record(req.user!.userId, input, requestContext(req));
      if (!result.ok) {
        next(
          result.error.type === 'PROJECT_OUT_OF_SCOPE'
            ? new NotFoundError()
            : exportRecordFailedError()
        );
        return;
      }
      res.status(201).json({ recordId: result.value.recordId });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/audit-logs/archives/restore:
 *   post:
 *     summary: 監査ログのアーカイブの復元
 *     description: |
 *       指定期間（両端を含む）に重なる月のアーカイブを復号し、目録（件数・SHA-256・HMAC）と照合した後に、
 *       期間の監査ログを JSON Lines で返す。アーカイブの無い月は飛ばし、本文だけがあり目録の無い月は照合の失敗とする。照合に失敗した月があれば行を返さず
 *       ARCHIVE_INTEGRITY_FAILED を返す。成否を監査（AUDIT_ARCHIVE_RESTORED）に記録し、記録できないときは
 *       行を返さない。復元した行はアクティブな監査ログへ戻さない。
 *     tags:
 *       - Audit Logs
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [from, to]
 *             properties:
 *               from:
 *                 type: string
 *                 format: date-time
 *                 description: 期間の始まり（時差を含む ISO 8601）
 *               to:
 *                 type: string
 *                 format: date-time
 *                 description: 期間の終わり（時差を含む ISO 8601。始まり以降、重なる月は 120 か月以内）
 *     responses:
 *       200:
 *         description: 期間の監査ログ（1 行に 1 件の JSON）
 *         content:
 *           application/x-ndjson:
 *             schema:
 *               type: string
 *       400:
 *         description: 入力の検証エラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       500:
 *         description: 照合の失敗（ARCHIVE_INTEGRITY_FAILED、details.month に月）、暗号鍵の未設定、または復元の記録の失敗
 *       503:
 *         description: 保存先を読み取れない
 */
router.post(
  '/archives/restore',
  authenticate,
  requirePermission('audit:read'),
  validate(archiveRestoreSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.validatedBody as ArchiveRestoreRequest;
      const from = new Date(body.from);
      const to = new Date(body.to);
      const period = { from: from.toISOString(), to: to.toISOString() };

      const result = await getArchiveService().restore(from, to);

      // 行を返す前に復元を記録する。記録できなければ行を返さない
      try {
        await auditLogService.createLog({
          action: 'AUDIT_ARCHIVE_RESTORED',
          actorId: req.user!.userId,
          targetType: ARCHIVE_TARGET_TYPE,
          targetId: `${period.from}/${period.to}`,
          metadata: {
            ...period,
            ...(result.ok
              ? {
                  outcome: 'succeeded',
                  months: result.value.months,
                  recordCount: result.value.recordCount,
                }
              : { outcome: 'failed', error: result.error }),
            ...requestAuditMetadata(req),
          },
        });
      } catch (error) {
        logger.error({ err: error, ...period }, 'Failed to record the audit log archive restore');
        next(
          new InternalServerError(
            '復元を記録できなかったため中止しました',
            'ARCHIVE_RESTORE_RECORD_FAILED'
          )
        );
        return;
      }

      if (!result.ok) {
        next(archiveRestoreError(result.error));
        return;
      }

      logger.info(
        {
          userId: req.user?.userId,
          ...period,
          months: result.value.months,
          recordCount: result.value.recordCount,
        },
        'Audit log archives restored'
      );

      const filename = `audit-logs-restored-${period.from}-${period.to}.jsonl`.replace(
        /[:.]/g,
        '-'
      );
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      try {
        for await (const record of result.value) {
          if (!res.write(`${JSON.stringify(record)}\n`)) {
            // 受け手が切断したときは待ち続けない
            await Promise.race([once(res, 'drain'), once(res, 'close')]);
            if (res.destroyed) {
              return;
            }
          }
        }
      } catch (error) {
        // 照合を済ませた後の読み直しで失敗した: 不完全な本文を正常な終わりにしない
        logger.error({ err: error, ...period }, 'Audit log archive restore failed while streaming');
        res.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      res.end();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
