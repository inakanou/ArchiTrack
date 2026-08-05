/**
 * @fileoverview 見積書APIルート
 *
 * 見積書のCRUD操作、見積項目の参照と一括保存、書き込みを伴わない計算のエンドポイントを提供します。
 *
 * 明細の追加・削除・複写・一括更新・並び替え・階層移動は `PUT /:id/save` へ統合済み
 * （旧6経路は Task 53.12 で撤去、REQ-42.1）。
 *
 * 受領見積書転記・NET金額案分・利益率適用・諸経費行追加・値引き行追加の5経路も
 * Task 55.7 で撤去済み。これらはクライアントの `estimateCalculations` と
 * `estimateEditReducer` で編集状態に反映され、`PUT /:id/save` で確定する（REQ-49.3）。
 * 撤去に伴い、これらの経路が `Estimate.updatedAt` を進めていた処理も消滅したため、
 * 反映後の保存が楽観的排他で競合しなくなった（REQ-49.5）。
 * 書き込みを伴わない `POST /:id/calculate-overhead` は維持対象（REQ-7.2-9.2）。
 *
 * 見積書出力 `GET /:id/export` も Task 56.10 で撤去済み。帳票（PDF）と表計算（Excel）は
 * クライアントの `EstimatePdfExportService` / `EstimateExcelExportService` が編集中の
 * ツリーから生成するため、出力にサーバーは関与しない（REQ-10.1, REQ-10.2）。
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.4: 確認ダイアログを表示後に削除を実行する
 * - REQ-11.5: 見積書に見積名称を設定可能とする
 * - REQ-11.6: 楽観的排他制御により競合を検出する
 * - REQ-1.1-1.6: 見積書基本構造
 * - REQ-2.1-2.6: 見積項目ネスト構造
 * - REQ-7.2-9.2: 諸経費自動計算（書き込みを伴わない計算のみ）
 * - REQ-10.1, REQ-10.2: 見積書の帳票・表計算はクライアントで生成する（サーバー経路なし）
 * - REQ-42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - REQ-49.3: 転記・案分・利益率・諸経費行追加・値引き行追加はデータベースへ書き込まない
 * - REQ-49.5: これらの操作の実行後の保存で競合エラーを発生させない
 *
 * Task 4.1: 見積書CRUD APIエンドポイントの実装
 * Task 4.2: 見積項目CRUD APIエンドポイントの実装
 * Task 55.7: 転記系エンドポイントの撤去
 * Task 56.10: 出力エンドポイントの撤去
 *
 * @module routes/estimates
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { EstimateService } from '../services/estimate.service.js';
import { EstimateItemService } from '../services/estimate-item.service.js';
import {
  EstimateDraftService,
  type SavedEstimateItemNode,
} from '../services/estimate-draft.service.js';
import { OverheadCostService, OverheadCostType } from '../services/overhead-cost.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  projectIdParamSchema,
  estimateIdParamSchema,
  createEstimateSchema,
  updateEstimateSchema,
  deleteEstimateSchema,
  estimateListQuerySchema,
  calculateOverheadSchema,
  getItemsQuerySchema,
  saveEstimateDraftSchema,
} from '../schemas/estimate.schema.js';
import { ValidationError } from '../errors/apiError.js';
import {
  EstimateNotFoundError,
  EstimateConflictError,
  EstimateDraftValidationError,
  DuplicateEstimateNameError,
  ItemizedStatementNotFoundForEstimateError,
} from '../errors/estimateError.js';
import { ProjectNotFoundError } from '../errors/projectError.js';
import Decimal from 'decimal.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const estimateService = new EstimateService({
  prisma,
  auditLogService,
});
const estimateItemService = new EstimateItemService({ prisma });
const estimateDraftService = new EstimateDraftService({ prisma });
const overheadCostService = new OverheadCostService();

// ==========================================
// 見積書CRUD API (Task 4.1)
// ==========================================

/**
 * @swagger
 * /api/projects/{projectId}/estimates:
 *   post:
 *     summary: 見積書作成
 *     description: プロジェクトに紐付く見積書を作成
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 description: 見積書名
 *               sourceItemizedStatementId:
 *                 type: string
 *                 format: uuid
 *                 description: 参照する内訳書ID（任意）
 *     responses:
 *       201:
 *         description: 見積書作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトまたは内訳書が見つからない
 *       409:
 *         description: 同名の見積書が存在
 */
router.post(
  '/',
  authenticate,
  requirePermission('estimate:create'),
  validate(projectIdParamSchema, 'params'),
  validate(createEstimateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as {
        name: string;
        sourceItemizedStatementId?: string;
      };

      const input = {
        projectId,
        name: validatedBody.name,
        sourceItemizedStatementId: validatedBody.sourceItemizedStatementId,
      };

      const estimate = await estimateService.create(input, actorId);

      logger.info(
        {
          userId: actorId,
          estimateId: estimate.id,
          projectId,
          name: estimate.name,
        },
        'Estimate created successfully'
      );

      res.status(201).json(estimate);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: 'PROJECT_NOT_FOUND',
        });
        return;
      }
      if (error instanceof ItemizedStatementNotFoundForEstimateError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/itemized-statement-not-found',
          title: 'Itemized Statement Not Found',
          status: 404,
          detail: error.message,
          code: 'ITEMIZED_STATEMENT_NOT_FOUND',
        });
        return;
      }
      if (error instanceof DuplicateEstimateNameError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/duplicate-estimate-name',
          title: 'Duplicate Estimate Name',
          status: 409,
          detail: error.message,
          code: 'DUPLICATE_ESTIMATE_NAME',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/estimates:
 *   get:
 *     summary: 見積書一覧取得
 *     description: プロジェクトに紐付く見積書の一覧を取得（ページネーション対応）
 *     tags:
 *       - Estimates
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
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, name]
 *           default: createdAt
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: 見積書一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('estimate:read'),
  validate(projectIdParamSchema, 'params'),
  validate(estimateListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedQuery = req.validatedQuery as {
        page: number;
        limit: number;
        search?: string;
        sort: 'createdAt' | 'name';
        order: 'asc' | 'desc';
      };

      const result = await estimateService.findByProjectId(
        projectId,
        { search: validatedQuery.search },
        { page: validatedQuery.page, limit: validatedQuery.limit },
        { sort: validatedQuery.sort, order: validatedQuery.order }
      );

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          page: validatedQuery.page,
          total: result.pagination.total,
        },
        'Estimates list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/estimates/latest:
 *   get:
 *     summary: 直近の見積書一覧と総数を取得
 *     description: プロジェクト詳細画面の見積書セクション用に、直近N件の見積書と総数を取得
 *     tags:
 *       - Estimates
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 2
 *           minimum: 1
 *           maximum: 10
 *     responses:
 *       200:
 *         description: 見積書サマリー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/latest',
  authenticate,
  requirePermission('estimate:read'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 2;

      const result = await estimateService.findLatestByProjectId(projectId, limit);

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          limit,
          totalCount: result.totalCount,
        },
        'Latest estimates retrieved'
      );

      res.json({
        totalCount: result.totalCount,
        latestEstimates: result.estimates,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}:
 *   get:
 *     summary: 見積書詳細取得
 *     description: 見積書の詳細情報（見積項目含む）を取得
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 見積書詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('estimate:read'),
  validate(estimateIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const estimate = await estimateService.findById(id);

      if (!estimate) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: `見積書が見つかりません: ${id}`,
          code: 'ESTIMATE_NOT_FOUND',
          estimateId: id,
        });
        return;
      }

      logger.debug({ userId: req.user?.userId, estimateId: id }, 'Estimate detail retrieved');

      res.json(estimate);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}:
 *   put:
 *     summary: 見積書更新
 *     description: 見積書の情報を更新（楽観的排他制御）
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - expectedUpdatedAt
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 見積書更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラーまたは同名の見積書が存在
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(updateEstimateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name: string;
      };

      const estimate = await estimateService.update(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, estimateId: id }, 'Estimate updated successfully');

      res.json(estimate);
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_CONFLICT',
        });
        return;
      }
      if (error instanceof DuplicateEstimateNameError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/duplicate-estimate-name',
          title: 'Duplicate Estimate Name',
          status: 409,
          detail: error.message,
          code: 'DUPLICATE_ESTIMATE_NAME',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/estimates/{id}:
 *   delete:
 *     summary: 見積書削除
 *     description: 見積書を論理削除（楽観的排他制御）
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *     responses:
 *       204:
 *         description: 見積書削除成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('estimate:delete'),
  validate(estimateIdParamSchema, 'params'),
  validate(deleteEstimateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { updatedAt } = req.validatedBody as { updatedAt: string };

      await estimateService.delete(id, actorId, new Date(updatedAt));

      logger.info({ userId: actorId, estimateId: id }, 'Estimate deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateConflictError) {
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_CONFLICT',
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 見積明細の一括保存API (Task 52.8)
// ==========================================

/**
 * 保存後の明細ツリーに含まれる見積項目の総数を数える
 *
 * `GET /api/estimates/:id` の `itemCount`（平坦な見積項目の件数）と同じ意味になるよう、
 * 子孫を含めた総数を返す。
 *
 * @param nodes - 保存後の明細ツリー（ルート項目の配列）
 * @returns 子孫を含む見積項目の総数
 */
function countSavedEstimateItems(nodes: readonly SavedEstimateItemNode[]): number {
  let total = 0;
  const stack: SavedEstimateItemNode[] = [...nodes];

  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    total += 1;
    stack.push(...node.children);
  }

  return total;
}

/**
 * 提出日をリクエストと同じ `YYYY-MM-DD` 形式へ整形する
 *
 * `Estimate.submissionDate` は `DATE` 型（UTC 0時）で保持しているため、
 * ISO 日時のまま返すとクライアントが再送する際に形式変換を強いられる。
 * 保存結果をそのまま次のリクエストへ載せられるよう、日付部分のみを返す（54.8）。
 *
 * @param submissionDate - 保存後の提出日（未入力は null）
 * @returns `YYYY-MM-DD` 形式の文字列（未入力は null）
 */
function formatSubmissionDate(submissionDate: Date | null): string | null {
  return submissionDate === null ? null : submissionDate.toISOString().slice(0, 10);
}

/**
 * @swagger
 * /api/estimates/{id}/save:
 *   put:
 *     summary: 見積明細の一括保存（フル状態同期）
 *     description: >-
 *       編集画面の状態（明細ツリー全体・帳票用の追加入力項目）を受領し、DB現状との差分を
 *       単一トランザクションで確定する（追加・更新・削除・並び順・階層の変更を1回で確定）。
 *       楽観的排他制御は expectedUpdatedAt で行う。応答は保存後の見積書情報と最新の明細ツリーを
 *       含むため、呼び出し元は保存後の再取得を必要としない。
 *     tags:
 *       - Estimates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 見積書ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedUpdatedAt
 *               - reportFields
 *               - items
 *             properties:
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *               reportFields:
 *                 type: object
 *                 properties:
 *                   submissionDate:
 *                     type: string
 *                     format: date
 *                     nullable: true
 *                   validityPeriod:
 *                     type: string
 *                     maxLength: 100
 *                     nullable: true
 *                   separateWorks:
 *                     type: array
 *                     maxItems: 5
 *                     items:
 *                       type: string
 *               items:
 *                 type: array
 *                 description: 明細ツリー（各ノードは id/tempId/itemType/lines/children を省略なく指定する）
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: 保存成功（保存後の見積書情報と最新の明細ツリー）
 *       400:
 *         description: リクエスト形式が不正
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 *       422:
 *         description: 明細ツリーの検証エラー（書き込みゼロ）
 *       500:
 *         description: >
 *           保存処理エラー（全ロールバック）。トランザクションが制限時間を超えた場合は
 *           code=ESTIMATE_SAVE_TIMEOUT で、変更が保存されていないことと件数を減らす回避策を返す
 */
router.put(
  '/:id/save',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      // ボディ検証はミドルウェアに委ねず、ここで 400 と 422 を切り分ける。
      // - 形式不正（キー欠落・型違い・長さ・書式・列挙値）は 400
      // - ツリー構造の検証NG（循環参照・重複配置・識別子なし・種別ごとの構造制約・件数上限）は 422
      //   これらは `saveEstimateDraftSchema` の superRefine が `code: 'custom'` で報告する唯一の集合で、
      //   design.md「Error Handling」の「保存前の検証NG（必須項目・循環参照・孤児ノード・件数上限）」に対応する
      const parsed = saveEstimateDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));

        if (parsed.error.issues.every((issue) => issue.code === 'custom')) {
          throw new EstimateDraftValidationError(issues);
        }

        throw new ValidationError(
          parsed.error.issues[0]?.message ?? 'Validation failed',
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }))
        );
      }

      const result = await estimateDraftService.saveDraft(id, parsed.data);

      // `saveDraft` の戻り値は見積書サマリ（id / updatedAt / 帳票用入力項目）のため、
      // `GET /api/estimates/:id` と同じ詳細レスポンスへ揃えるべく残りを合成する。
      // 明細は `result.items`（保存後の最新ツリー）を用いるので、ここでは明細を読み直さない。
      const estimate = await prisma.estimate.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          sourceItemizedStatementId: true,
          sourceItemizedStatementName: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
        },
      });

      if (!estimate) {
        throw new EstimateNotFoundError(id);
      }

      const itemCount = countSavedEstimateItems(result.items);

      logger.info(
        {
          userId: actorId,
          estimateId: id,
          itemCount,
          createdCount: result.createdItemIds.length,
          updatedCount: result.updatedItemIds.length,
          deletedCount: result.deletedItemIds.length,
        },
        'Estimate draft saved successfully'
      );

      res.json({
        id: estimate.id,
        projectId: estimate.projectId,
        project: estimate.project,
        name: estimate.name,
        sourceItemizedStatementId: estimate.sourceItemizedStatementId,
        sourceItemizedStatementName: estimate.sourceItemizedStatementName,
        createdAt: estimate.createdAt,
        updatedAt: result.estimate.updatedAt,
        itemCount,
        reportFields: {
          submissionDate: formatSubmissionDate(result.estimate.reportFields.submissionDate),
          validityPeriod: result.estimate.reportFields.validityPeriod,
          separateWorks: result.estimate.reportFields.separateWorks,
        },
        items: result.items,
      });
    } catch (error) {
      if (error instanceof EstimateNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/estimate-not-found',
          title: 'Estimate Not Found',
          status: 404,
          detail: error.message,
          code: 'ESTIMATE_NOT_FOUND',
        });
        return;
      }
      if (error instanceof EstimateConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: 'https://architrack.example.com/problems/estimate-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'ESTIMATE_CONFLICT',
          ...(conflictDetails ?? {}),
        });
        return;
      }
      // 検証NG（422）・形式不正（400）は ApiError としてエラーハンドラが problem details 化する。
      // トランザクション途中の失敗（並行削除による中断を含む）は 500 のまま扱う（42.3）。
      // 制限時間超過はサービスが EstimateSaveTimeoutError（500・ApiError）へ変換済みのため、
      // ここでも同じ経路でエラーハンドラに委ね、原因の分かる problem details として返す。
      next(error);
    }
  }
);

// ==========================================
// 見積項目API (Task 4.2)
// ==========================================
//
// 明細操作系の6経路（`POST /:id/items`、`DELETE /:id/items/:itemId`、
// `POST /:id/items/:itemId/duplicate`、`PUT /:id/items/batch`、
// `PUT /:id/items/reorder`、`PATCH /:id/items/:itemId/move`）は
// `PUT /:id/save`（一括保存）へ統合したため撤去済み（REQ-42.1、Task 53.12）。
// 追加・削除・更新・並び順の変更・階層の変更は保存1回でまとめて確定する。
// 参照系の `GET /:id/items` は維持する。
//
// 転記系5経路（`POST /:id/transfer-quotation` ほか）は段階3（Task 55.7）、
// 出力の `GET /:id/export` は段階4（Task 56.10）で撤去済み。

/**
 * @swagger
 * /api/estimates/{id}/items:
 *   get:
 *     summary: 見積項目一覧取得
 *     description: 見積書の見積項目一覧を取得（階層構造オプション）
 *     tags:
 *       - Estimate Items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: hierarchy
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: 見積項目一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 見積書が見つからない
 */
router.get(
  '/:id/items',
  authenticate,
  requirePermission('estimate:read'),
  validate(estimateIdParamSchema, 'params'),
  validate(getItemsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const items = await estimateItemService.getHierarchy(id);

      logger.debug({ userId: req.user?.userId, estimateId: id }, 'Estimate items retrieved');

      res.json(items);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 計算API（書き込みなし, Task 4.3 / 55.7）
// ==========================================

/**
 * @swagger
 * /api/estimates/{id}/calculate-overhead:
 *   post:
 *     summary: 諸経費計算
 *     description: 国土交通省基準に準じた諸経費（共通仮設費・現場管理費・一般管理費）を計算
 *     tags:
 *       - Estimate Calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - costType
 *               - directCost
 *             properties:
 *               costType:
 *                 type: string
 *                 enum: [COMMON_TEMPORARY, SITE_MANAGEMENT, GENERAL_ADMIN]
 *               directCost:
 *                 type: string
 *                 description: 直接工事費（千円単位）
 *               constructionPeriod:
 *                 type: integer
 *                 description: 工期（月）
 *               pureConstructionCost:
 *                 type: string
 *                 description: 純工事費（千円単位）
 *               constructionCost:
 *                 type: string
 *                 description: 工事原価（千円単位）
 *               isRenovation:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: 計算成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.post(
  '/:id/calculate-overhead',
  authenticate,
  requirePermission('estimate:update'),
  validate(estimateIdParamSchema, 'params'),
  validate(calculateOverheadSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedBody = req.validatedBody as {
        costType: 'COMMON_TEMPORARY' | 'SITE_MANAGEMENT' | 'GENERAL_ADMIN';
        directCost: string;
        constructionPeriod?: number;
        pureConstructionCost?: string;
        constructionCost?: string;
        isRenovation: boolean;
      };

      let result;
      const costType = validatedBody.costType as OverheadCostType;

      switch (costType) {
        case OverheadCostType.COMMON_TEMPORARY:
          if (!validatedBody.constructionPeriod) {
            res.status(400).json({
              type: 'https://architrack.example.com/problems/validation-error',
              title: 'Validation Error',
              status: 400,
              detail: '共通仮設費の計算には工期が必要です',
              code: 'VALIDATION_ERROR',
            });
            return;
          }
          result = overheadCostService.calculateCommonTemporaryCost({
            directCost: new Decimal(validatedBody.directCost),
            constructionPeriod: validatedBody.constructionPeriod,
            isRenovation: validatedBody.isRenovation,
          });
          break;

        case OverheadCostType.SITE_MANAGEMENT:
          if (!validatedBody.pureConstructionCost) {
            res.status(400).json({
              type: 'https://architrack.example.com/problems/validation-error',
              title: 'Validation Error',
              status: 400,
              detail: '現場管理費の計算には純工事費が必要です',
              code: 'VALIDATION_ERROR',
            });
            return;
          }
          result = overheadCostService.calculateSiteManagementCost({
            pureConstructionCost: new Decimal(validatedBody.pureConstructionCost),
            isRenovation: validatedBody.isRenovation,
          });
          break;

        case OverheadCostType.GENERAL_ADMIN:
          if (!validatedBody.constructionCost) {
            res.status(400).json({
              type: 'https://architrack.example.com/problems/validation-error',
              title: 'Validation Error',
              status: 400,
              detail: '一般管理費の計算には工事原価が必要です',
              code: 'VALIDATION_ERROR',
            });
            return;
          }
          result = overheadCostService.calculateGeneralAdminCost({
            constructionCost: new Decimal(validatedBody.constructionCost),
            isRenovation: validatedBody.isRenovation,
          });
          break;

        default:
          res.status(400).json({
            type: 'https://architrack.example.com/problems/validation-error',
            title: 'Validation Error',
            status: 400,
            detail: '不明な諸経費種別です',
            code: 'VALIDATION_ERROR',
          });
          return;
      }

      // Decimalを文字列に変換
      const response = {
        costType: result.costType,
        rate: result.rate.toString(),
        amount: result.amount.toString(),
        formula: result.formula,
      };

      logger.info(
        { userId: req.user?.userId, costType: validatedBody.costType },
        'Overhead cost calculated'
      );

      res.json(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('0より大きい値')) {
        res.status(400).json({
          type: 'https://architrack.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: 'VALIDATION_ERROR',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
