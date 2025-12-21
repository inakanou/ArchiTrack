/**
 * @fileoverview 現場調査CRUDエンドポイント
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.2: 現場調査の基本情報と関連する画像一覧を表示する
 * - 1.3: 楽観的排他制御を用いて現場調査レコードを更新する
 * - 1.4: 現場調査と関連する画像データを論理削除する
 * - 1.5: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
 * - 1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
 * - 3.1: プロジェクト単位でのページネーション
 * - 3.2: キーワード検索（名前・メモの部分一致）
 * - 3.3: 調査日によるフィルタリング
 * - 3.4: ソート機能（調査日・作成日・更新日）
 * - 12.1, 12.2, 12.3: 認証・認可ミドルウェア適用
 *
 * @module routes/site-surveys
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { SiteSurveyService } from '../services/site-survey.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createSiteSurveySchema,
  updateSiteSurveySchema,
  siteSurveyIdParamSchema,
  projectIdParamSchema,
  siteSurveyListQuerySchema,
  type SiteSurveySortableField,
} from '../schemas/site-survey.schema.js';
import {
  SiteSurveyNotFoundError,
  SiteSurveyConflictError,
  ProjectNotFoundForSurveyError,
} from '../errors/siteSurveyError.js';
import { ImageListService } from '../services/image-list.service.js';
import { SignedUrlService } from '../services/signed-url.service.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const auditLogService = new AuditLogService({ prisma });
const siteSurveyService = new SiteSurveyService({
  prisma,
  auditLogService,
});
const signedUrlService = new SignedUrlService({ prisma });
const imageListService = new ImageListService({ prisma, signedUrlService });

/**
 * 更新リクエストボディ用スキーマ（expectedUpdatedAt必須）
 */
const updateSiteSurveyRequestSchema = updateSiteSurveySchema.extend({
  expectedUpdatedAt: z.string().datetime({ message: '日時の形式が不正です' }),
});

/**
 * 作成時のリクエストボディ用スキーマ（projectIdはURLパラメータから取得するため除外）
 */
const createSiteSurveyBodySchema = createSiteSurveySchema.omit({ projectId: true });

/**
 * @swagger
 * /api/projects/{projectId}/site-surveys:
 *   post:
 *     summary: 現場調査作成
 *     description: 新しい現場調査を作成
 *     tags:
 *       - Site Surveys
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
 *               - surveyDate
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               surveyDate:
 *                 type: string
 *                 format: date
 *               memo:
 *                 type: string
 *                 maxLength: 2000
 *                 nullable: true
 *     responses:
 *       201:
 *         description: 現場調査作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.post(
  '/',
  authenticate,
  requirePermission('site_survey:create'),
  validate(projectIdParamSchema, 'params'),
  validate(createSiteSurveyBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const actorId = req.user!.userId;
      const validatedBody = req.validatedBody as {
        name: string;
        surveyDate: string;
        memo?: string | null;
      };

      // projectIdをボディに追加してサービスに渡す
      const input = {
        ...validatedBody,
        projectId,
      };

      const siteSurvey = await siteSurveyService.createSiteSurvey(input, actorId);

      logger.info(
        { userId: actorId, siteSurveyId: siteSurvey.id, projectId, name: siteSurvey.name },
        'Site survey created successfully'
      );

      res.status(201).json(siteSurvey);
    } catch (error) {
      if (error instanceof ProjectNotFoundForSurveyError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: error.message,
          code: 'PROJECT_NOT_FOUND',
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
 * /api/projects/{projectId}/site-surveys:
 *   get:
 *     summary: 現場調査一覧取得
 *     description: プロジェクトに紐付く現場調査の一覧を取得（ページネーション、検索、フィルタリング、ソート対応）
 *     tags:
 *       - Site Surveys
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
 *         description: 検索キーワード（名前・メモの部分一致、2文字以上）
 *       - in: query
 *         name: surveyDateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: 調査日開始（YYYY-MM-DD形式）
 *       - in: query
 *         name: surveyDateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: 調査日終了（YYYY-MM-DD形式）
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [surveyDate, createdAt, updatedAt]
 *           default: surveyDate
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
 *         description: 現場調査一覧
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
  requirePermission('site_survey:read'),
  validate(projectIdParamSchema, 'params'),
  validate(siteSurveyListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedQuery = req.validatedQuery as {
        page: number;
        limit: number;
        sort: SiteSurveySortableField;
        order: 'asc' | 'desc';
        search?: string;
        surveyDateFrom?: string;
        surveyDateTo?: string;
      };

      const { page, limit, sort, order, search, surveyDateFrom, surveyDateTo } = validatedQuery;

      const result = await siteSurveyService.findByProjectId(
        projectId,
        {
          search,
          surveyDateFrom,
          surveyDateTo,
        },
        { page, limit },
        { sort, order }
      );

      // thumbnailUrlを署名付きURLまたは公開URLに変換
      let enrichedData = result.data;
      if (isStorageConfigured()) {
        const storageProvider = getStorageProvider();
        if (storageProvider) {
          enrichedData = await Promise.all(
            result.data.map(async (survey) => {
              if (survey.thumbnailUrl) {
                try {
                  // thumbnailUrlはthumbnailPathが入っているので、署名付きURLに変換
                  const signedUrl = await storageProvider.getSignedUrl(survey.thumbnailUrl);
                  return { ...survey, thumbnailUrl: signedUrl };
                } catch (error) {
                  logger.warn(
                    { surveyId: survey.id, thumbnailPath: survey.thumbnailUrl, error },
                    'Failed to generate signed URL for thumbnail'
                  );
                  return { ...survey, thumbnailUrl: null };
                }
              }
              return survey;
            })
          );
        }
      }

      logger.debug(
        { userId: req.user?.userId, projectId, page, limit, total: result.pagination.total },
        'Site surveys list retrieved'
      );

      res.json({ ...result, data: enrichedData });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/{id}:
 *   get:
 *     summary: 現場調査詳細取得
 *     description: 現場調査の基本情報と関連する画像一覧を取得
 *     tags:
 *       - Site Surveys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 現場調査ID
 *     responses:
 *       200:
 *         description: 現場調査詳細
 *       400:
 *         description: 無効な現場調査ID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 現場調査が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('site_survey:read'),
  validate(siteSurveyIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const userId = req.user!.userId;

      const siteSurvey = await siteSurveyService.findById(id);

      if (!siteSurvey) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/site-survey-not-found',
          title: 'Site Survey Not Found',
          status: 404,
          detail: `Site survey not found: ${id}`,
          code: 'SITE_SURVEY_NOT_FOUND',
          surveyId: id,
        });
        return;
      }

      // 署名付きURL付きの画像一覧を取得してマージ
      const imagesWithUrls = await imageListService.findBySurveyIdWithUrls(id, userId);

      // 画像情報にURLを追加
      const imagesMap = new Map(imagesWithUrls.map((img) => [img.id, img]));
      const enrichedImages = siteSurvey.images.map((img) => {
        const withUrls = imagesMap.get(img.id);
        return {
          ...img,
          originalUrl: withUrls?.originalUrl ?? null,
          thumbnailUrl: withUrls?.thumbnailUrl ?? null,
        };
      });

      const response = {
        ...siteSurvey,
        images: enrichedImages,
      };

      logger.debug({ userId: req.user?.userId, siteSurveyId: id }, 'Site survey detail retrieved');

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/{id}:
 *   put:
 *     summary: 現場調査更新
 *     description: 既存の現場調査情報を更新（楽観的排他制御）
 *     tags:
 *       - Site Surveys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 現場調査ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedUpdatedAt
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               surveyDate:
 *                 type: string
 *                 format: date
 *               memo:
 *                 type: string
 *                 maxLength: 2000
 *                 nullable: true
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: 現場調査更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 現場調査が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('site_survey:update'),
  validate(siteSurveyIdParamSchema, 'params'),
  validate(updateSiteSurveyRequestSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;
      const { expectedUpdatedAt, ...updateData } = req.validatedBody as {
        expectedUpdatedAt: string;
        name?: string;
        surveyDate?: string;
        memo?: string | null;
      };

      const siteSurvey = await siteSurveyService.updateSiteSurvey(
        id,
        updateData,
        actorId,
        new Date(expectedUpdatedAt)
      );

      logger.info({ userId: actorId, siteSurveyId: id }, 'Site survey updated successfully');

      res.json(siteSurvey);
    } catch (error) {
      if (error instanceof SiteSurveyNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/site-survey-not-found',
          title: 'Site Survey Not Found',
          status: 404,
          detail: error.message,
          code: 'SITE_SURVEY_NOT_FOUND',
        });
        return;
      }
      if (error instanceof SiteSurveyConflictError) {
        const conflictDetails = error.details as Record<string, unknown> | undefined;
        res.status(409).json({
          type: 'https://architrack.example.com/problems/site-survey-conflict',
          title: 'Conflict',
          status: 409,
          detail: error.message,
          code: 'SITE_SURVEY_CONFLICT',
          ...(conflictDetails ?? {}),
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/site-surveys/{id}:
 *   delete:
 *     summary: 現場調査削除
 *     description: 現場調査と関連する画像データを論理削除
 *     tags:
 *       - Site Surveys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 現場調査ID
 *     responses:
 *       204:
 *         description: 現場調査削除成功
 *       400:
 *         description: 無効な現場調査ID形式
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 現場調査が見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('site_survey:delete'),
  validate(siteSurveyIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const actorId = req.user!.userId;

      await siteSurveyService.deleteSiteSurvey(id, actorId);

      logger.info({ userId: actorId, siteSurveyId: id }, 'Site survey deleted successfully');

      res.status(204).send();
    } catch (error) {
      if (error instanceof SiteSurveyNotFoundError) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/site-survey-not-found',
          title: 'Site Survey Not Found',
          status: 404,
          detail: error.message,
          code: 'SITE_SURVEY_NOT_FOUND',
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
