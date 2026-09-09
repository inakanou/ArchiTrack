/**
 * @fileoverview 現場調査CRUDエンドポイント
 *
 * Requirements:
 * - 1.2: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.3: 現場調査の基本情報と関連する画像一覧を表示する
 * - 1.4: 楽観的排他制御を用いて現場調査レコードを更新する
 * - 1.5: 現場調査と関連する画像データを論理削除する
 * - 1.6: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
 * - 1.7: プロジェクトが存在しない場合、現場調査の作成を許可しない
 * - 3.1: プロジェクト単位でのページネーション
 * - 3.2: キーワード検索（名前・メモの部分一致）
 * - 3.3: 調査日によるフィルタリング
 * - 3.4: ソート機能（調査日・作成日・更新日）
 * - 14.1, 14.2, 14.3: 認証・認可ミドルウェア適用
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
  ProjectSurveyImagesAccessDeniedError,
} from '../errors/siteSurveyError.js';
import {
  ImageListService,
  PROJECT_SURVEY_IMAGE_DEFAULT_LIMIT,
  PROJECT_SURVEY_IMAGE_MAX_LIMIT,
} from '../services/image-list.service.js';
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
 * 直近N件取得のクエリパラメータスキーマ
 * Task 31.1: 現場調査直近N件取得APIエンドポイント
 */
const latestSurveysQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(2),
});

/**
 * @swagger
 * /api/projects/{projectId}/site-surveys/latest:
 *   get:
 *     summary: 現場調査直近N件取得
 *     description: プロジェクトに紐付く直近の現場調査と総数を取得
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 2
 *           minimum: 1
 *           maximum: 10
 *         description: 取得件数（デフォルト2、最大10）
 *     responses:
 *       200:
 *         description: 直近N件の現場調査と総数
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCount:
 *                   type: integer
 *                 latestSurveys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SiteSurveyInfo'
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/latest',
  authenticate,
  requirePermission('site_survey:read'),
  validate(projectIdParamSchema, 'params'),
  validate(latestSurveysQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const { limit } = req.validatedQuery as { limit: number };

      const result = await siteSurveyService.findLatestByProjectId(projectId, limit);

      // thumbnailUrl・thumbnailOriginalUrl・annotatedThumbnailUrl を署名付きURLに変換
      let enrichedSurveys = result.latestSurveys.map((survey) => ({
        ...survey,
        thumbnailOriginalUrl: null as string | null,
        annotatedThumbnailUrl: null as string | null,
      }));
      if (isStorageConfigured()) {
        const storageProvider = getStorageProvider();
        if (storageProvider) {
          enrichedSurveys = await Promise.all(
            result.latestSurveys.map(async (survey) => {
              let thumbnailUrl: string | null = null;
              let thumbnailOriginalUrl: string | null = null;
              let annotatedThumbnailUrl: string | null = null;

              // サムネイルURLを生成
              if (survey.thumbnailUrl) {
                try {
                  thumbnailUrl = await storageProvider.getSignedUrl(survey.thumbnailUrl);
                } catch (error) {
                  logger.warn(
                    { surveyId: survey.id, thumbnailPath: survey.thumbnailUrl, error },
                    'Failed to generate signed URL for thumbnail'
                  );
                }
              }

              // 元画像URLを生成（注釈レンダリング用）
              if (survey.thumbnailOriginalPath) {
                try {
                  thumbnailOriginalUrl = await storageProvider.getSignedUrl(
                    survey.thumbnailOriginalPath
                  );
                } catch (error) {
                  logger.warn(
                    { surveyId: survey.id, originalPath: survey.thumbnailOriginalPath, error },
                    'Failed to generate signed URL for original image'
                  );
                }
              }

              // 合成済みサムネイルURLを生成（Requirements: 20.3, 38.2, 38.7）
              // 供給しないと表示側は常にクライアント側の合成へ落ち、注釈取得が写真数に比例する
              if (survey.annotatedThumbnailPath) {
                try {
                  annotatedThumbnailUrl = await storageProvider.getSignedUrl(
                    survey.annotatedThumbnailPath
                  );
                } catch (error) {
                  logger.warn(
                    {
                      surveyId: survey.id,
                      annotatedThumbnailPath: survey.annotatedThumbnailPath,
                      error,
                    },
                    'Failed to generate signed URL for annotated thumbnail'
                  );
                }
              }

              return {
                ...survey,
                thumbnailUrl,
                thumbnailOriginalUrl,
                annotatedThumbnailUrl,
              };
            })
          );
        }
      }

      logger.debug(
        { userId: req.user?.userId, projectId, limit, totalCount: result.totalCount },
        'Latest site surveys retrieved'
      );

      res.json({ totalCount: result.totalCount, latestSurveys: enrichedSurveys });
    } catch (error) {
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

      // thumbnailUrl・thumbnailOriginalUrl・annotatedThumbnailUrl を署名付きURLに変換
      let enrichedData = result.data.map((survey) => ({
        ...survey,
        thumbnailOriginalUrl: null as string | null,
        annotatedThumbnailUrl: null as string | null,
      }));
      if (isStorageConfigured()) {
        const storageProvider = getStorageProvider();
        if (storageProvider) {
          enrichedData = await Promise.all(
            result.data.map(async (survey) => {
              let thumbnailUrl: string | null = null;
              let thumbnailOriginalUrl: string | null = null;
              let annotatedThumbnailUrl: string | null = null;

              // サムネイルURLを生成
              if (survey.thumbnailUrl) {
                try {
                  thumbnailUrl = await storageProvider.getSignedUrl(survey.thumbnailUrl);
                } catch (error) {
                  logger.warn(
                    { surveyId: survey.id, thumbnailPath: survey.thumbnailUrl, error },
                    'Failed to generate signed URL for thumbnail'
                  );
                }
              }

              // 元画像URLを生成（注釈レンダリング用）
              if (survey.thumbnailOriginalPath) {
                try {
                  thumbnailOriginalUrl = await storageProvider.getSignedUrl(
                    survey.thumbnailOriginalPath
                  );
                } catch (error) {
                  logger.warn(
                    { surveyId: survey.id, originalPath: survey.thumbnailOriginalPath, error },
                    'Failed to generate signed URL for original image'
                  );
                }
              }

              // 合成済みサムネイルURLを生成（Requirements: 20.3, 38.2, 38.7）
              // 供給しないと表示側は常にクライアント側の合成へ落ち、注釈取得が写真数に比例する
              if (survey.annotatedThumbnailPath) {
                try {
                  annotatedThumbnailUrl = await storageProvider.getSignedUrl(
                    survey.annotatedThumbnailPath
                  );
                } catch (error) {
                  logger.warn(
                    {
                      surveyId: survey.id,
                      annotatedThumbnailPath: survey.annotatedThumbnailPath,
                      error,
                    },
                    'Failed to generate signed URL for annotated thumbnail'
                  );
                }
              }

              return {
                ...survey,
                thumbnailUrl,
                thumbnailOriginalUrl,
                annotatedThumbnailUrl,
              };
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
          // Requirements: 38.2, 38.5 - 合成済みサムネイルの表示元URLを詳細応答へ引き渡す
          // 得られない画像でも項目を欠落させず null として現れるようにする
          annotatedThumbnailUrl: withUrls?.annotatedThumbnailUrl ?? null,
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

/**
 * プロジェクト配下の写真一覧エンドポイント用ルーター
 *
 * `GET /api/projects/:projectId/survey-images` として `app.ts` から装着する。
 * 現場調査CRUDのルーターは `/api/projects/:projectId/site-surveys` および
 * `/api/site-surveys` に装着されており、装着先が異なるため別のルーターとして公開する。
 *
 * Requirements (quantity-table-generation): 49.9
 */
export const projectSurveyImagesRouter = Router({ mergeParams: true });

/**
 * プロジェクト写真一覧のクエリスキーマ
 *
 * 上限を超える指定・1未満の指定・整数でない指定はいずれも 400 で拒否する。
 * サービス側の 1〜上限への丸めは既定値の解決のための縮退であり、クエリ検証の代わりには
 * ならない。丸めで応えると、利用者は要求した件数と異なる結果を要求どおりと誤解する。
 *
 * Requirements (quantity-table-generation): 49.9
 */
const projectSurveyImagesQuerySchema = z.object({
  limit: z.coerce
    .number({ message: '取得件数は数値で指定してください' })
    .int('取得件数は整数で指定してください')
    .min(1, '取得件数は1以上で指定してください')
    .max(
      PROJECT_SURVEY_IMAGE_MAX_LIMIT,
      `取得件数は${PROJECT_SURVEY_IMAGE_MAX_LIMIT}以下で指定してください`
    )
    .default(PROJECT_SURVEY_IMAGE_DEFAULT_LIMIT),
});

/**
 * @swagger
 * /api/projects/{projectId}/survey-images:
 *   get:
 *     summary: プロジェクト写真一覧取得
 *     description: |
 *       プロジェクトに紐付く現場調査のうち、注釈が存在する写真の一覧をまとめて取得する。
 *       写真選択・変更ダイアログが現場調査ごとの個別リクエストを発生させないための入口。
 *       表示用の署名付きURLは1件あたり1本（displayUrl）に限る。
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *           minimum: 1
 *           maximum: 500
 *         description: 取得件数（デフォルト200、最大500）
 *     responses:
 *       200:
 *         description: 注釈付き写真の一覧
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 images:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       surveyId:
 *                         type: string
 *                       surveyName:
 *                         type: string
 *                       fileName:
 *                         type: string
 *                       displayUrl:
 *                         type: string
 *                         nullable: true
 *                       originalUrl:
 *                         type: string
 *                         nullable: true
 *                       comment:
 *                         type: string
 *                         nullable: true
 *                       width:
 *                         type: integer
 *                       height:
 *                         type: integer
 *                       displayOrder:
 *                         type: integer
 *                 hasMore:
 *                   type: boolean
 *                   description: 上限に達して切り捨てが発生したか
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
projectSurveyImagesRouter.get(
  '/',
  authenticate,
  requirePermission('site_survey:read'),
  validate(projectIdParamSchema, 'params'),
  validate(projectSurveyImagesQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { projectId } = req.validatedParams as { projectId: string };

    try {
      const { limit } = req.validatedQuery as { limit: number };
      const userId = req.user!.userId;

      const result = await imageListService.findAnnotatedByProjectIdWithUrls(projectId, userId, {
        limit,
      });

      logger.debug(
        { userId, projectId, imageCount: result.images.length, hasMore: result.hasMore },
        'Project survey images list retrieved'
      );

      res.json(result);
    } catch (error) {
      if (error instanceof ProjectSurveyImagesAccessDeniedError) {
        // 拒否の理由を切り分ける。`validateProjectAccess` は「不在・論理削除」でも
        // 「権限なし」でも false を返すため、サービスの拒否だけでは 404 と 403 を
        // 区別できない。存在確認は**この拒否の経路でのみ**行う。正常な経路へ足すと、
        // プロジェクト単位の問い合わせ回数が1回増える。
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { id: true, deletedAt: true },
        });

        if (!project || project.deletedAt !== null) {
          res.status(404).json({
            type: 'https://architrack.example.com/problems/project-not-found',
            title: 'Project Not Found',
            status: 404,
            detail: `Project not found: ${projectId}`,
            code: 'PROJECT_NOT_FOUND',
            projectId,
          });
          return;
        }
        // プロジェクトは存在する。すなわち権限不足であり、既定の403へ委ねる。
      }
      next(error);
    }
  }
);

export default router;
