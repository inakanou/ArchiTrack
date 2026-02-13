/**
 * @fileoverview プロジェクトCRUD APIルート
 *
 * Requirements:
 * - 14.1: GET /api/projects プロジェクト一覧取得
 * - 14.2: GET /api/projects/:id プロジェクト詳細取得
 * - 14.3: POST /api/projects プロジェクト作成
 * - 14.4: PUT /api/projects/:id プロジェクト更新
 * - 14.5: DELETE /api/projects/:id プロジェクト削除
 * - 14.6: 一覧取得APIでページネーション、検索、フィルタリング、ソートのクエリパラメータをサポート
 * - 14.7: ステータス遷移API（PATCH /:id/status, GET /:id/status-history）
 * - 10.8: 許可されたステータス遷移の実行
 * - 10.9: 無効なステータス遷移時のエラーレスポンス（422）
 * - 10.13: ステータス変更履歴取得
 * - 10.14: 差し戻し遷移時の理由必須バリデーション
 * - 12.1, 12.2, 12.3: 認証・認可ミドルウェア適用
 * - 29.1-29.6: プロジェクト詳細一括取得API（detail-summary）
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ProjectService } from '../services/project.service.js';
import { ProjectStatusService } from '../services/project-status.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { SiteSurveyService } from '../services/site-survey.service.js';
import { QuantityTableService } from '../services/quantity-table.service.js';
import { ItemizedStatementService } from '../services/itemized-statement.service.js';
import { ItemizedStatementPivotService } from '../services/itemized-statement-pivot.service.js';
import { EstimateRequestService } from '../services/estimate-request.service.js';
import { EstimateService } from '../services/estimate.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createProjectSchema,
  updateProjectSchema,
  projectListQuerySchema,
  projectIdParamSchema,
  statusChangeSchema,
} from '../schemas/project.schema.js';
import {
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectConflictError,
  InvalidStatusTransitionError,
  ReasonRequiredError,
  DuplicateProjectNameError,
} from '../errors/projectError.js';
import {
  PROJECT_STATUS_LABELS,
  TRANSITION_TYPE_LABELS,
  type ProjectStatus,
  type TransitionType,
} from '../types/project.types.js';
import { z } from 'zod';

const router = Router();
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const projectService = new ProjectService({
  prisma,
  auditLogService,
});
const projectStatusService = new ProjectStatusService({
  prisma,
  auditLogService,
});
const siteSurveyService = new SiteSurveyService({ prisma, auditLogService });
const quantityTableService = new QuantityTableService({ prisma, auditLogService });
const pivotService = new ItemizedStatementPivotService({ prisma });
const itemizedStatementService = new ItemizedStatementService({
  prisma,
  auditLogService,
  pivotService,
});
const estimateRequestService = new EstimateRequestService({ prisma, auditLogService });
const estimateService = new EstimateService({ prisma, auditLogService });

/**
 * 更新リクエストボディ用スキーマ（expectedUpdatedAt必須）
 */
const updateProjectRequestSchema = updateProjectSchema.extend({
  expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
});

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: プロジェクト一覧取得
 *     description: ページネーション、検索、フィルタリング、ソートに対応したプロジェクト一覧を取得
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: ページ番号（1以上）
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: 1ページあたりの表示件数（1〜100）
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 検索キーワード（プロジェクト名・取引先名の部分一致、2文字以上）
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: ステータスフィルタ（カンマ区切りで複数指定可）
 *       - in: query
 *         name: createdFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: 作成日開始（ISO8601形式）
 *       - in: query
 *         name: createdTo
 *         schema:
 *           type: string
 *           format: date
 *         description: 作成日終了（ISO8601形式）
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [id, name, tradingPartnerId, status, createdAt, updatedAt]
 *           default: updatedAt
 *         description: ソートフィールド
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: ソート順序
 *     responses:
 *       200:
 *         description: プロジェクト一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProjectInfo'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('project:read'),
  validate(projectListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // validatedQuery にはバリデーション後の型変換済みデータが格納される
      const validatedQuery = req.validatedQuery as {
        page: number;
        limit: number;
        sort: import('../schemas/project.schema.js').SortableField;
        order: 'asc' | 'desc';
        search?: string;
        status?: import('../types/project.types.js').ProjectStatus[];
        createdFrom?: string;
        createdTo?: string;
        excludeTerminalStatuses?: boolean;
      };

      const {
        page,
        limit,
        sort,
        order,
        search,
        status,
        createdFrom,
        createdTo,
        excludeTerminalStatuses,
      } = validatedQuery;

      const result = await projectService.getProjects(
        {
          search,
          status,
          createdFrom,
          createdTo,
          excludeTerminalStatuses,
        },
        { page, limit },
        { sort, order }
      );

      logger.debug(
        { userId: req.user?.userId, page, limit, total: result.pagination.total },
        'Projects list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/status-counts:
 *   get:
 *     summary: ステータス別プロジェクト件数取得
 *     description: 全プロジェクト（論理削除を除く）のステータス別件数を取得。検索条件・フィルタ条件は適用しない。
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ステータス別件数
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 counts:
 *                   type: object
 *                   description: 全12ステータスの件数
 *                 total:
 *                   type: integer
 *                   description: 全ステータス合計件数
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *
 * Requirements: 23.1-23.6
 * 注意: このルートは/api/projects/:idより前に定義する必要がある
 * （Expressのルートマッチング順序により、:idパラメータとの競合を回避）
 */
router.get(
  '/status-counts',
  authenticate,
  requirePermission('project:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await projectService.getStatusCounts();

      logger.debug({ userId: req.user?.userId }, 'Project status counts retrieved');

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * getProjectSections - 5つのセクションサマリーをPromise.allSettled()で並列取得
 *
 * Task 46.2: getProjectSectionsヘルパー関数の実装
 * Requirements: 29.1, 29.4
 *
 * 個別セクションの取得エラー時はデフォルト値にフォールバックし、
 * 他セクションの正常返却を妨げない。
 */
async function getProjectSections(projectId: string) {
  const results = await Promise.allSettled([
    siteSurveyService.findLatestByProjectId(projectId),
    quantityTableService.findLatestByProjectId(projectId),
    itemizedStatementService.findLatestByProjectId(projectId),
    estimateRequestService.findLatestByProjectId(projectId),
    estimateService.findLatestByProjectId(projectId),
  ]);

  return {
    siteSurveys:
      results[0].status === 'fulfilled' ? results[0].value : { totalCount: 0, latestSurveys: [] },
    quantityTables:
      results[1].status === 'fulfilled' ? results[1].value : { totalCount: 0, latestTables: [] },
    itemizedStatements:
      results[2].status === 'fulfilled'
        ? results[2].value
        : { totalCount: 0, latestStatements: [] },
    estimateRequests:
      results[3].status === 'fulfilled' ? results[3].value : { totalCount: 0, latestRequests: [] },
    estimates:
      results[4].status === 'fulfilled'
        ? {
            totalCount: results[4].value.totalCount,
            latestEstimates: results[4].value.estimates,
          }
        : { totalCount: 0, latestEstimates: [] },
  };
}

/**
 * @swagger
 * /api/projects/{id}/detail-summary:
 *   get:
 *     summary: プロジェクト詳細一括取得
 *     description: プロジェクト基本情報、ステータス変更履歴、5つのセクションサマリーを一括取得
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *     responses:
 *       200:
 *         description: プロジェクト詳細サマリー
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   $ref: '#/components/schemas/ProjectDetail'
 *                 statusHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                 sections:
 *                   type: object
 *       400:
 *         description: 無効なプロジェクトID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 *
 * Task 46.3: GET /api/projects/:id/detail-summary エンドポイントの実装
 * Requirements: 29.1, 29.2, 29.3, 29.5
 */
router.get(
  '/:id/detail-summary',
  authenticate,
  requirePermission('project:read'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      // プロジェクト基本情報とステータス履歴を並列取得（必須データ）
      const [projectData, historyData] = await Promise.all([
        projectService.getProject(id),
        projectStatusService.getStatusHistory(id),
      ]);

      // ステータス履歴にラベルを追加
      const historiesWithLabels = historyData.map((h) => ({
        ...h,
        fromStatusLabel: h.fromStatus ? PROJECT_STATUS_LABELS[h.fromStatus as ProjectStatus] : null,
        toStatusLabel: PROJECT_STATUS_LABELS[h.toStatus as ProjectStatus],
        transitionTypeLabel: TRANSITION_TYPE_LABELS[h.transitionType as TransitionType],
      }));

      // 5セクションサマリーを並列取得（個別エラーはフォールバック）
      const sections = await getProjectSections(id);

      logger.debug({ userId: req.user?.userId, projectId: id }, 'Project detail summary retrieved');

      res.json({
        project: projectData,
        statusHistory: historiesWithLabels,
        sections,
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          projectId: error.projectId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: プロジェクト詳細取得
 *     description: 指定されたIDのプロジェクト詳細を取得
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *     responses:
 *       200:
 *         description: プロジェクト詳細
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectDetail'
 *       400:
 *         description: 無効なプロジェクトID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('project:read'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const project = await projectService.getProject(id);

      logger.debug({ userId: req.user?.userId, projectId: id }, 'Project detail retrieved');

      res.json(project);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          projectId: error.projectId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: プロジェクト作成
 *     description: 新しいプロジェクトを作成
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProjectRequest'
 *     responses:
 *       201:
 *         description: プロジェクト作成成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.post(
  '/',
  authenticate,
  requirePermission('project:create'),
  validate(createProjectSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.userId;
      const validatedBody =
        req.validatedBody as import('../schemas/project.schema.js').CreateProjectInput;

      const project = await projectService.createProject(validatedBody, actorId);

      logger.info(
        { userId: actorId, projectId: project.id, name: project.name },
        'Project created successfully'
      );

      res.status(201).json(project);
    } catch (error) {
      if (error instanceof ProjectValidationError) {
        res.status(400).json({
          type: error.problemType,
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: error.code,
          errors: error.validationErrors,
        });
        return;
      }
      /**
       * Task 21.6: POST /api/projectsハンドラでDuplicateProjectNameErrorをキャッチ
       * Requirements: 1.15, 8.7
       * RFC 7807形式のエラーレスポンスを返却
       */
      if (error instanceof DuplicateProjectNameError) {
        res.status(409).json({
          type: error.problemType,
          title: 'Duplicate Project Name',
          status: 409,
          detail: error.message,
          code: error.code,
          projectName: error.projectName,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: プロジェクト更新
 *     description: 既存のプロジェクト情報を更新（楽観的排他制御）
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             $ref: '#/components/schemas/UpdateProjectRequest'
 *     responses:
 *       200:
 *         description: プロジェクト更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('project:update'),
  validate(projectIdParamSchema, 'params'),
  validate(updateProjectRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
      } & import('../schemas/project.schema.js').UpdateProjectInput;

      const project = await projectService.updateProject(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, projectId: id }, 'Project updated successfully');

      res.json(project);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          projectId: error.projectId,
        });
        return;
      }
      if (error instanceof ProjectValidationError) {
        res.status(400).json({
          type: error.problemType,
          title: 'Validation Error',
          status: 400,
          detail: error.message,
          code: error.code,
          errors: error.validationErrors,
        });
        return;
      }
      if (error instanceof ProjectConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: error.problemType,
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: error.code,
          ...(conflictDetails ?? {}),
        });
        return;
      }
      /**
       * Task 21.6: PUT /api/projects/:idハンドラでDuplicateProjectNameErrorをキャッチ
       * Requirements: 1.15, 8.7
       * RFC 7807形式のエラーレスポンスを返却
       */
      if (error instanceof DuplicateProjectNameError) {
        res.status(409).json({
          type: error.problemType,
          title: 'Duplicate Project Name',
          status: 409,
          detail: error.message,
          code: error.code,
          projectName: error.projectName,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: プロジェクト削除
 *     description: プロジェクトを論理削除
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *     responses:
 *       204:
 *         description: プロジェクト削除成功
 *       400:
 *         description: 無効なプロジェクトID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('project:delete'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      await projectService.deleteProject(id, actorId);

      logger.info({ userId: actorId, projectId: id }, 'Project deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          projectId: error.projectId,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}/status:
 *   patch:
 *     summary: プロジェクトステータス変更
 *     description: プロジェクトのステータスを変更（遷移ルールに従う）
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PREPARING, SURVEYING, ESTIMATING, APPROVING, CONTRACTING, CONSTRUCTING, DELIVERING, BILLING, AWAITING, COMPLETED, CANCELLED, LOST]
 *                 description: 新しいステータス
 *               reason:
 *                 type: string
 *                 description: 差し戻し理由（backward遷移時は必須）
 *     responses:
 *       200:
 *         description: ステータス変更成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 status:
 *                   type: string
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 *       422:
 *         description: 無効なステータス遷移または差し戻し理由未入力
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('project:update'),
  validate(projectIdParamSchema, 'params'),
  validate(statusChangeSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { status, reason } = req.validatedBody as {
        status: import('../types/project.types.js').ProjectStatus;
        reason?: string | null;
      };

      const project = await projectStatusService.transitionStatus(
        id,
        status,
        actorId,
        reason ?? undefined
      );

      logger.info(
        { userId: actorId, projectId: id, newStatus: status },
        'Project status changed successfully'
      );

      res.json(project);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          projectId: error.projectId,
        });
        return;
      }
      if (error instanceof InvalidStatusTransitionError) {
        res.status(422).json({
          type: error.problemType,
          title: 'Invalid Status Transition',
          status: 422,
          detail: error.message,
          code: error.code,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus,
          allowed: error.allowed,
        });
        return;
      }
      if (error instanceof ReasonRequiredError) {
        res.status(422).json({
          type: error.problemType,
          title: 'Reason Required',
          status: 422,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{id}/status-history:
 *   get:
 *     summary: ステータス変更履歴取得
 *     description: プロジェクトのステータス変更履歴を取得
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: プロジェクトID
 *     responses:
 *       200:
 *         description: ステータス変更履歴
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   projectId:
 *                     type: string
 *                     format: uuid
 *                   fromStatus:
 *                     type: string
 *                     nullable: true
 *                   toStatus:
 *                     type: string
 *                   transitionType:
 *                     type: string
 *                     enum: [initial, forward, backward, terminate]
 *                   reason:
 *                     type: string
 *                     nullable: true
 *                   changedById:
 *                     type: string
 *                     format: uuid
 *                   changedAt:
 *                     type: string
 *                     format: date-time
 *                   changedBy:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       displayName:
 *                         type: string
 *       400:
 *         description: 無効なプロジェクトID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.get(
  '/:id/status-history',
  authenticate,
  requirePermission('project:read'),
  validate(projectIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      const histories = await projectStatusService.getStatusHistory(id);

      logger.debug(
        { userId: req.user?.userId, projectId: id, historyCount: histories.length },
        'Status history retrieved'
      );

      // ラベルを追加してレスポンスを返す
      const historiesWithLabels = histories.map((h) => ({
        ...h,
        fromStatusLabel: h.fromStatus ? PROJECT_STATUS_LABELS[h.fromStatus as ProjectStatus] : null,
        toStatusLabel: PROJECT_STATUS_LABELS[h.toStatus as ProjectStatus],
        transitionTypeLabel: TRANSITION_TYPE_LABELS[h.transitionType as TransitionType],
      }));

      res.json(historiesWithLabels);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          type: error.problemType,
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: error.code,
          projectId: error.projectId,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
