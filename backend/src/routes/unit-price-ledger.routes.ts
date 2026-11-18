/**
 * @fileoverview 単価台帳の API の経路（unit-price-ledger タスク3.1）
 *
 * `/api/unit-price-ledger` にマウントする。
 *
 * 権限（Requirement 10.1・10.2・10.4）:
 * - 一覧・詳細・修正・印の更新・削除・取り込み・書き出しは `unit_price_ledger:manage`
 * - 似た単価の問い合わせは `estimate:update`
 * - どの経路も authenticate と requirePermission を最初に置き、本文の検証・ファイルの受け取りより前に
 *   拒む（権限の無い利用者の取り込みで、サーバーにファイルを受けさせない）。拒否は 403 で内容を返さない
 *
 * 取り込み（design.md の unit-price-ledger.routes）:
 * - multer の memoryStorage で受け、1 ファイル 50 MB・2000 ファイルまでとする。multer の上限の超過も、
 *   読み取りの上限の超過（LedgerImportTooLargeError）と同じく 413 `LEDGER_IMPORT_TOO_LARGE` で返す
 * - DB へつながらないなど、カードの中身に依らない誤りは 500 `LEDGER_IMPORT_FAILED` で返す（タスク2.4 の申し送り）
 *
 * 誤りの応答（design.md の Error Handling）:
 * - 409 `LEDGER_CONFLICT`（排他の不一致）・409 `LEDGER_PROJECT_QUOTATION_READ_ONLY`（案件の受領見積書の修正・削除）
 * - 400 `LEDGER_EXPORT_EMPTY`（書き出しの結果が 0 件）・400 `LEDGER_EXPORT_TOO_MANY`（書き出しの見積の数が上限を
 *   超える。Requirement 6.6）・500 `EXPORT_RECORD_FAILED`（出力の記録の失敗）
 * - 404（見積が無い・論理削除済み）。いずれもサービスの誤りをエラーハンドラーの Problem Details で返す
 *
 * 似た単価の候補の単位と数量は、DB で空を許すため `string | null` のまま返す
 *
 * @module routes/unit-price-ledger
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { getClientIp } from '../middleware/client-ip.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { ExportAuditService } from '../services/export-audit.service.js';
import { getSharedProjectScopeService } from '../services/project-scope.service.js';
import { LedgerQueryService } from '../services/unit-price-ledger/ledger-query.service.js';
import { LedgerEditService } from '../services/unit-price-ledger/ledger-edit.service.js';
import { LedgerImportService } from '../services/unit-price-ledger/ledger-import.service.js';
import { LedgerExportService } from '../services/unit-price-ledger/ledger-export.service.js';
import { SimilarPriceService } from '../services/unit-price-ledger/similar-price.service.js';
import {
  LEDGER_IMPORT_LIMITS,
  type LedgerUploadFile,
} from '../services/unit-price-ledger/ledger-card-parser.js';
import {
  ledgerFilterSchema,
  ledgerListQuerySchema,
  ledgerMarksUpdateSchema,
  ledgerQuotationDeleteQuerySchema,
  ledgerQuotationIdParamSchema,
  ledgerQuotationUpdateSchema,
  similarPriceQuerySchema,
  type LedgerFilter,
  type LedgerListQuery,
  type LedgerMarksUpdateInput,
  type LedgerQuotationDeleteQuery,
  type LedgerQuotationIdParam,
  type LedgerQuotationUpdateInput,
  type SimilarPriceQuery,
} from '../schemas/unit-price-ledger.schema.js';
import { LedgerImportTooLargeError } from '../errors/unitPriceLedgerError.js';
import { ReceivedQuotationNotFoundError } from '../errors/receivedQuotationError.js';
import { ApiError, InternalServerError } from '../errors/apiError.js';
import type { RequestContext } from '../types/auth.types.js';
import logger from '../utils/logger.js';

/** 台帳の管理の権限（10.1） */
export const UNIT_PRICE_LEDGER_MANAGE_PERMISSION = 'unit_price_ledger:manage';
/** 似た単価の問い合わせの権限（見積の編集。10.2） */
export const SIMILAR_PRICE_PERMISSION = 'estimate:update';

/** 取り込みの 1 ファイルの大きさの上限（zip の大きさの上限と同じ 50 MB） */
export const LEDGER_UPLOAD_MAX_FILE_SIZE = LEDGER_IMPORT_LIMITS.zipSize;
/** 取り込みの 1 要求のファイルの数の上限（2000 個） */
export const LEDGER_UPLOAD_MAX_FILES = LEDGER_IMPORT_LIMITS.fileCount;
/** 取り込みのファイルの欄の名前 */
export const LEDGER_UPLOAD_FIELD = 'files';

/** 取り込みの途中で、カードの中身に依らない誤りが起きたときの文言 */
export const LEDGER_IMPORT_FAILED_MESSAGE =
  '取り込みを最後まで行えませんでした。時間をおいてもう一度取り込んでください';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const queryService = new LedgerQueryService({ prisma });
const editService = new LedgerEditService({ prisma, auditLogService });
const importService = new LedgerImportService({ prisma, auditLogService });
const exportService = new LedgerExportService({
  prisma,
  exportAuditService: new ExportAuditService({
    auditLogService,
    // 共有のインスタンスは要求のたびに取り直す（PrismaClient・RBACService の作り直しに追従する）
    scopeService: {
      evaluateProjectAccess: (userId, projectId) =>
        getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
    },
  }),
});
const similarPriceService = new SimilarPriceService({ prisma });

/** 取り込みのファイルの受け取り（メモリに受ける。ファイル名は UTF-8 として読む） */
const ledgerUpload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: {
    fileSize: LEDGER_UPLOAD_MAX_FILE_SIZE,
    files: LEDGER_UPLOAD_MAX_FILES,
  },
});

/**
 * 取り込みのファイルを受け取る。multer の大きさ・数の上限の超過は 413 `LEDGER_IMPORT_TOO_LARGE` にする
 */
function receiveLedgerFiles(req: Request, res: Response, next: NextFunction): void {
  ledgerUpload.array(LEDGER_UPLOAD_FIELD, LEDGER_UPLOAD_MAX_FILES)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new LedgerImportTooLargeError('ZIP_SIZE', LEDGER_UPLOAD_MAX_FILE_SIZE));
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        next(new LedgerImportTooLargeError('FILE_COUNT', LEDGER_UPLOAD_MAX_FILES));
        return;
      }
    }
    next(err);
  });
}

/** 受け取ったファイルを、読み取りの入力の形にする */
const toUploadFiles = (files: Request['files']): LedgerUploadFile[] =>
  (Array.isArray(files) ? files : []).map((file) => ({
    originalName: file.originalname,
    buffer: file.buffer,
    mimeType: file.mimetype,
  }));

/** 出力の記録に書く、要求の送信元 */
const requestContext = (req: Request): RequestContext => ({
  ipAddress: getClientIp(req),
  userAgent: req.get('user-agent'),
});

/**
 * @swagger
 * /api/unit-price-ledger/quotations:
 *   get:
 *     summary: 単価台帳の一覧
 *     description: 論理削除されていない受領見積書を絞り込み、見積日の新しい順に 1 ページ 50 件で返す。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema: { type: string, maxLength: 200 }
 *         description: 業者名・案件名・明細行の名称の部分一致
 *       - in: query
 *         name: submittedFrom
 *         schema: { type: string, format: date }
 *         description: 見積日の期間の始め（YYYY-MM-DD、含む）
 *       - in: query
 *         name: submittedTo
 *         schema: { type: string, format: date }
 *         description: 見積日の期間の終わり（YYYY-MM-DD、含む）
 *       - in: query
 *         name: hasProject
 *         schema: { type: boolean }
 *         description: 案件の有無
 *       - in: query
 *         name: adoption
 *         schema: { type: string, enum: [ADOPTED, REJECTED, UNKNOWN] }
 *       - in: query
 *         name: readingStatus
 *         schema: { type: string, enum: [UNCONFIRMED, CONFIRMED] }
 *       - in: query
 *         name: constructionKind
 *         schema: { type: string, enum: [RENOVATION, NEW_CONSTRUCTION] }
 *       - in: query
 *         name: needsReview
 *         schema: { type: boolean }
 *         description: 参考の印のある明細行を持つ見積だけ
 *       - in: query
 *         name: missingClassificationKey
 *         schema: { type: boolean }
 *         description: 直接工事・産廃で分類キーの無い明細行を持つ見積だけ
 *       - in: query
 *         name: excludeDeletedProjects
 *         schema: { type: boolean }
 *         description: true のとき、論理削除された案件の受領見積書を除く（Requirement 4.9）
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *     responses:
 *       200:
 *         description: 一覧（data は見積の要約の配列、pagination は page・limit・total・totalPages）。要約の projectDeleted は、案件が論理削除されていれば true（Requirement 4.8）
 *       400:
 *         description: 問い合わせの検証の失敗
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（内容を返さない）
 */
router.get(
  '/quotations',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  validate(ledgerListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await queryService.list(req.validatedQuery as LedgerListQuery);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/unit-price-ledger/quotations/{id}:
 *   get:
 *     summary: 単価台帳の見積の詳細
 *     description: 見積の情報・台帳の情報・すべての明細行を返す。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: 受領見積書の ID
 *     responses:
 *       200:
 *         description: 詳細（updatedAt を修正・印の更新・削除の排他に使う。projectDeleted は案件が論理削除されていれば true）
 *       400:
 *         description: ID の形式の誤り
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（内容を返さない）
 *       404:
 *         description: 見積が無い、または論理削除済み
 *   put:
 *     summary: 案件の無い見積の修正
 *     description: 業者名・見積日・見積の情報・案件名・原本のパス・明細行の全体を修正する。業者名か見積日が変わるときは、受領見積書の名前を取り込みと同じ形（業者名_見積日）で作り直す（Requirement 5.8）。案件の受領見積書は修正できない。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vendorName, submittedAt, lineItems, expectedUpdatedAt]
 *             properties:
 *               vendorName: { type: string }
 *               submittedAt: { type: string, format: date-time }
 *               ledgerProjectName: { type: string, nullable: true, maxLength: 255 }
 *               ledgerSourcePath: { type: string, nullable: true, maxLength: 1000 }
 *               lineItems:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: object }
 *                 description: 明細行（受領見積書の明細行と同じ形）
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: 開いたときの updatedAt（楽観的排他制御）
 *     responses:
 *       200:
 *         description: 保存後の詳細
 *       400:
 *         description: 検証の失敗
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（内容を返さない）
 *       404:
 *         description: 見積が無い、または論理削除済み
 *       409:
 *         description: 排他の不一致（code は LEDGER_CONFLICT）、または案件の受領見積書（code は LEDGER_PROJECT_QUOTATION_READ_ONLY）
 *   delete:
 *     summary: 案件の無い見積の削除
 *     description: 案件の無い受領見積書を論理削除する。案件の受領見積書は削除できない。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: updatedAt
 *         required: true
 *         schema: { type: string, format: date-time }
 *         description: 開いたときの updatedAt（楽観的排他制御）
 *     responses:
 *       204:
 *         description: 削除した
 *       400:
 *         description: 検証の失敗
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（内容を返さない）
 *       404:
 *         description: 見積が無い、または論理削除済み
 *       409:
 *         description: 排他の不一致（code は LEDGER_CONFLICT）、または案件の受領見積書（code は LEDGER_PROJECT_QUOTATION_READ_ONLY）
 */
router.get(
  '/quotations/:id',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  validate(ledgerQuotationIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as LedgerQuotationIdParam;
      const detail = await queryService.findById(id);
      if (!detail) {
        throw new ReceivedQuotationNotFoundError(id);
      }
      res.json(detail);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/quotations/:id',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  validate(ledgerQuotationIdParamSchema, 'params'),
  validate(ledgerQuotationUpdateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as LedgerQuotationIdParam;
      const detail = await editService.updateQuotation(
        id,
        req.validatedBody as LedgerQuotationUpdateInput,
        req.user!.userId
      );
      res.json(detail);
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/quotations/:id',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  validate(ledgerQuotationIdParamSchema, 'params'),
  validate(ledgerQuotationDeleteQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as LedgerQuotationIdParam;
      const { updatedAt } = req.validatedQuery as LedgerQuotationDeleteQuery;
      await editService.deleteQuotation(id, new Date(updatedAt), req.user!.userId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/unit-price-ledger/quotations/{id}/marks:
 *   patch:
 *     summary: 見積の印の更新
 *     description: 読取の確認と、明細行ごとの参考の印と理由・分類キーだけを更新する（案件の受領見積書にも使える）。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lineItems, expectedUpdatedAt]
 *             properties:
 *               readingStatus: { type: string, enum: [UNCONFIRMED, CONFIRMED] }
 *               lineItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id]
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     isReference: { type: boolean }
 *                     referenceReason: { type: string, nullable: true, maxLength: 200 }
 *                     classificationKey: { type: string, nullable: true, maxLength: 50 }
 *               expectedUpdatedAt: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: 保存後の詳細
 *       400:
 *         description: 検証の失敗
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（内容を返さない）
 *       404:
 *         description: 見積が無い、または論理削除済み
 *       409:
 *         description: 排他の不一致（code は LEDGER_CONFLICT）
 */
router.patch(
  '/quotations/:id/marks',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  validate(ledgerQuotationIdParamSchema, 'params'),
  validate(ledgerMarksUpdateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as LedgerQuotationIdParam;
      const detail = await editService.updateMarks(
        id,
        req.validatedBody as LedgerMarksUpdateInput,
        req.user!.userId
      );
      res.json(detail);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/unit-price-ledger/imports:
 *   post:
 *     summary: 見積カードの取り込み
 *     description: 見積カードの JSON または zip を受け、1 枚ずつ案件の無い受領見積書として登録する。カードごとの失敗は結果の failed に入れる。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 maxItems: 2000
 *                 items: { type: string, format: binary }
 *                 description: 見積カードの JSON（1 個 1 MB まで）または zip（50 MB まで）
 *     responses:
 *       200:
 *         description: 取り込みの結果（importedCount・skipped・failed・truncated・referenceMarkedCount）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（ファイルを受け取らず、内容を返さない）
 *       413:
 *         description: 取り込みの上限の超過（code は LEDGER_IMPORT_TOO_LARGE。何も登録しない）
 *       500:
 *         description: DB へつながらないなど、取り込みを最後まで行えなかった（code は LEDGER_IMPORT_FAILED）
 */
router.post(
  '/imports',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  receiveLedgerFiles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await importService.importCards(toUploadFiles(req.files), req.user!.userId);
      res.json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      logger.error(
        { errorName: error instanceof Error ? error.name : typeof error },
        '単価台帳の見積カードの取り込みを最後まで行えませんでした'
      );
      next(new InternalServerError(LEDGER_IMPORT_FAILED_MESSAGE, 'LEDGER_IMPORT_FAILED'));
    }
  }
);

/**
 * @swagger
 * /api/unit-price-ledger/exports:
 *   post:
 *     summary: 単価台帳の Excel の書き出し
 *     description: 絞り込みの結果を「見積」「明細行」「要確認」の 3 つのシートの Excel にする。作る前に出力を記録し、記録に失敗したらファイルを作らない。台帳の管理の権限（unit_price_ledger:manage）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: 一覧の絞り込みと同じ欄（page を除く。絞り込まないときは空のオブジェクト）
 *             properties:
 *               keyword: { type: string, maxLength: 200 }
 *               submittedFrom: { type: string, format: date }
 *               submittedTo: { type: string, format: date }
 *               hasProject: { type: boolean }
 *               adoption: { type: string, enum: [ADOPTED, REJECTED, UNKNOWN] }
 *               readingStatus: { type: string, enum: [UNCONFIRMED, CONFIRMED] }
 *               constructionKind: { type: string, enum: [RENOVATION, NEW_CONSTRUCTION] }
 *               needsReview: { type: boolean }
 *               missingClassificationKey: { type: boolean }
 *               excludeDeletedProjects: { type: boolean }
 *     responses:
 *       200:
 *         description: Excel のファイル（ファイル名は「単価台帳_YYYYMMDD.xlsx」）
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: 検証の失敗、結果が 0 件（code は LEDGER_EXPORT_EMPTY）、または見積の数が上限（3,000 件）を超える（code は LEDGER_EXPORT_TOO_MANY。記録もファイルも作らない）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（内容を返さない）
 *       500:
 *         description: 出力の記録の失敗（code は EXPORT_RECORD_FAILED。ファイルを作らない）
 */
router.post(
  '/exports',
  authenticate,
  requirePermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION),
  validate(ledgerFilterSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await exportService.export(
        req.validatedBody as LedgerFilter,
        req.user!.userId,
        requestContext(req)
      );
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`
      );
      res.send(result.buffer);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/unit-price-ledger/similar-prices:
 *   post:
 *     summary: 似た過去の単価の検索
 *     description: 分類キーの一致を先に、名称の一致・近さで似た明細行を最大 20 件返す。閲覧範囲の外の案件は案件名を「他案件」とし、案件の ID・受領見積書の ID・原本のパス・参考の理由の文を返さない（参考の印は返す）。単価を決められない行は、按分の内訳の 4 つの金額を null、allocationStatus を UNIT_PRICE_UNDETERMINED で返す。按分の内訳の unrounded に、整数に丸める前の 4 つの値を小数点以下 10 桁までの十進の文字（ROUND_HALF_UP、末尾の 0 を除く、指数の表記なし）で返す（単価を決められない行は null）。見積の編集の権限（estimate:update）が要る
 *     tags:
 *       - Unit Price Ledger
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 200 }
 *               specification: { type: string, maxLength: 200 }
 *               unit: { type: string, maxLength: 50 }
 *               classificationKey: { type: string, maxLength: 50 }
 *               workType: { type: string, maxLength: 500 }
 *               constructionKind: { type: string, enum: [RENOVATION, NEW_CONSTRUCTION] }
 *               siteLocation: { type: string, maxLength: 100 }
 *     responses:
 *       200:
 *         description: 候補
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 candidates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       lineItemId: { type: string, format: uuid }
 *                       vendorName: { type: string }
 *                       submittedAt: { type: string, format: date }
 *                       projectName: { type: string, nullable: true, description: 範囲外は「他案件」 }
 *                       projectId: { type: string, format: uuid, nullable: true }
 *                       receivedQuotationId: { type: string, format: uuid, nullable: true }
 *                       ledgerSourcePath: { type: string, nullable: true }
 *                       name: { type: string }
 *                       specification: { type: string, nullable: true }
 *                       unit: { type: string, nullable: true, description: 換算のある行は換算の単位。DB で空を許す }
 *                       quantity: { type: string, nullable: true, description: 換算のある行は換算の数量。DB で空を許す }
 *                       category: { type: string, enum: [DIRECT, WASTE] }
 *                       classificationKeyMatched: { type: boolean }
 *                       adoption: { type: string, enum: [ADOPTED, REJECTED, UNKNOWN] }
 *                       readingStatus: { type: string, enum: [UNCONFIRMED, CONFIRMED] }
 *                       isReference: { type: boolean }
 *                       referenceReason: { type: string, nullable: true, description: 範囲外の案件の候補は null（参考の印は isReference で返す） }
 *                       allocation:
 *                         type: object
 *                         required: [allocationStatus, unitPrice, overheadAllocation, discountAllocation, appliedUnitPrice, allocatable, applicable, unrounded]
 *                         properties:
 *                           allocationStatus:
 *                             type: string
 *                             enum: [ALLOCATED, BASE_NOT_POSITIVE, UNIT_PRICE_UNDETERMINED]
 *                             description: ALLOCATED は按分できた、BASE_NOT_POSITIVE は按分の基準が 0 以下、UNIT_PRICE_UNDETERMINED は単価を決められない
 *                           unitPrice: { type: string, nullable: true, description: 整数の文字。単価を決められない行は null }
 *                           overheadAllocation: { type: string, nullable: true, description: 単価を決められない行は null }
 *                           discountAllocation: { type: string, nullable: true, description: 単価を決められない行は null }
 *                           appliedUnitPrice: { type: string, nullable: true, description: 単価を決められない行は null }
 *                           allocatable: { type: boolean, description: 按分の基準が 0 より大きい（単価を決められない行は false） }
 *                           applicable: { type: boolean, description: 反映する単価が 0 以上（単価を決められない行は false） }
 *                           unrounded:
 *                             type: object
 *                             nullable: true
 *                             description: 整数に丸める前の 4 つの値。小数点以下 10 桁までの十進の文字（ROUND_HALF_UP、末尾の 0 を除く、指数の表記なし、-0 は "0"）。反映する単価は丸める前の 3 つの値の和を 10 桁に丸める。単価を決められない行は null
 *                             required: [unitPrice, overheadAllocation, discountAllocation, appliedUnitPrice]
 *                             properties:
 *                               unitPrice: { type: string, example: '3333.3333333333' }
 *                               overheadAllocation: { type: string, example: '416.6666666667' }
 *                               discountAllocation: { type: string, example: '-166.6666666667' }
 *                               appliedUnitPrice: { type: string, example: '3583.3333333333' }
 *       400:
 *         description: 検証の失敗（名称が空、上限の超過）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足（候補を返さない）
 */
router.post(
  '/similar-prices',
  authenticate,
  requirePermission(SIMILAR_PRICE_PERMISSION),
  validate(similarPriceQuerySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidates = await similarPriceService.search(
        req.validatedBody as SimilarPriceQuery,
        req.user!.userId
      );
      res.json({ candidates });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
