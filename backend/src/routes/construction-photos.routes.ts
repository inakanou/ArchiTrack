/**
 * @fileoverview 工事写真アルバムCRUD・一覧エンドポイント
 *
 * 二重マウント（nested `/api/projects/:projectId/construction-photos` ＋
 * flat `/api/construction-photos`）で提供する。既存の現場調査ルート
 * （site-surveys.routes.ts）の実装パターンを踏襲する。
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規アルバムレコードを作成する
 * - 1.2: アルバムの基本情報を取得する
 * - 1.3: 楽観的排他制御を用いてアルバムレコードを更新する
 * - 1.4: アルバムを論理削除する
 * - 1.5: 同時編集による競合エラーを返す
 * - 1.6: プロジェクトが存在しない場合、アルバムの作成を許可しない
 * - 3.1: プロジェクト単位でのページネーション
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: ソート機能（作成日・更新日）
 * - 11.1: 一覧は最大50件のページネーション
 * - 13.1, 13.3: 認証・認可ミドルウェア適用
 * - 13.2: 取得系は対象が要求プロジェクト配下であることを検証する
 *
 * @module routes/construction-photos
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ConstructionPhotoAlbumService } from '../services/construction-photo-album.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import logger from '../utils/logger.js';
import {
  createConstructionPhotoAlbumSchema,
  updateConstructionPhotoAlbumSchema,
  constructionPhotoAlbumListQuerySchema,
  constructionPhotoIdParamSchema,
  constructionPhotoProjectIdParamSchema,
  type ConstructionPhotoAlbumSortableField,
} from '../schemas/construction-photo.schema.js';

// mergeParams: true でネストされたルートから projectId を取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const albumService = new ConstructionPhotoAlbumService({ prisma });

/**
 * 代表サムネイルの署名付きURL有効期限（秒）。Requirements: 11.3, 11.6
 */
const SIGNED_URL_EXPIRES_IN = 900;

/**
 * @swagger
 * /api/projects/{projectId}/construction-photos:
 *   post:
 *     summary: 工事写真アルバム作成
 *     description: プロジェクトに紐付く新規アルバムを作成する
 *     tags:
 *       - Construction Photos
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
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               memo:
 *                 type: string
 *                 maxLength: 2000
 *                 nullable: true
 *     responses:
 *       201:
 *         description: アルバム作成成功
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
  requirePermission('construction_photo:create'),
  validate(constructionPhotoProjectIdParamSchema, 'params'),
  validate(createConstructionPhotoAlbumSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const validatedBody = req.validatedBody as { name: string; memo?: string | null };

      const album = await albumService.create({ ...validatedBody, projectId });

      logger.info(
        { userId: req.user?.userId, albumId: album.id, projectId, name: album.name },
        'Construction photo album created successfully'
      );

      res.status(201).json(album);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/construction-photos:
 *   get:
 *     summary: 工事写真アルバム一覧取得
 *     description: プロジェクトに紐付くアルバム一覧を取得する（ページネーション・検索・ソート対応）
 *     tags:
 *       - Construction Photos
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
 *           default: 50
 *           maximum: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt]
 *           default: createdAt
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: アルバム一覧
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
  requirePermission('construction_photo:read'),
  validate(constructionPhotoProjectIdParamSchema, 'params'),
  validate(constructionPhotoAlbumListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.validatedParams as { projectId: string };
      const { page, limit, search, sort, order } = req.validatedQuery as {
        page: number;
        limit: number;
        search?: string;
        sort: ConstructionPhotoAlbumSortableField;
        order: 'asc' | 'desc';
      };

      const result = await albumService.findByProject(projectId, {
        page,
        limit,
        filter: { search },
        sort,
        order,
      });

      // 代表サムネのストレージパスをTTL900sの署名付きURLへ変換する（Requirements: 3.5, 11.3）。
      // detail-summary（projects.routes.ts）の署名パターンに倣う。ストレージ未設定・署名失敗・
      // 代表写真なしのときは null にし、原パスを露出しない。
      const storageProvider = isStorageConfigured() ? getStorageProvider() : null;
      result.data = await Promise.all(
        result.data.map(async (album) => {
          const thumbnailPath = album.thumbnailUrl;
          if (!thumbnailPath || !storageProvider) {
            return { ...album, thumbnailUrl: null };
          }
          try {
            const signedUrl = await storageProvider.getSignedUrl(thumbnailPath, {
              expiresIn: SIGNED_URL_EXPIRES_IN,
            });
            return { ...album, thumbnailUrl: signedUrl };
          } catch (error) {
            logger.warn(
              { albumId: album.id, thumbnailPath, error },
              'Failed to generate signed URL for construction photo album thumbnail'
            );
            return { ...album, thumbnailUrl: null };
          }
        })
      );

      logger.debug(
        { userId: req.user?.userId, projectId, page, limit, total: result.pagination.total },
        'Construction photo albums list retrieved'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-photos/{id}:
 *   get:
 *     summary: 工事写真アルバム詳細取得
 *     tags:
 *       - Construction Photos
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
 *         description: アルバム詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: アルバムが見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('construction_photo:read'),
  validate(constructionPhotoIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      // nested マウント時は projectId が付与されるため、配下検証に用いる（Requirements: 13.2）
      const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : undefined;

      const album = await albumService.findById(id, projectId);

      logger.debug({ userId: req.user?.userId, albumId: id }, 'Construction photo album retrieved');

      res.json(album);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-photos/{id}:
 *   patch:
 *     summary: 工事写真アルバム更新
 *     description: アルバム情報を更新する（楽観的排他制御）
 *     tags:
 *       - Construction Photos
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
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               memo:
 *                 type: string
 *                 maxLength: 2000
 *                 nullable: true
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: アルバム更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: アルバムが見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.patch(
  '/:id',
  authenticate,
  requirePermission('construction_photo:update'),
  validate(constructionPhotoIdParamSchema, 'params'),
  validate(updateConstructionPhotoAlbumSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };
      const validatedBody = req.validatedBody as {
        name?: string;
        memo?: string | null;
        updatedAt: string;
      };

      const album = await albumService.update(id, validatedBody);

      logger.info({ userId: req.user?.userId, albumId: id }, 'Construction photo album updated');

      res.json(album);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/construction-photos/{id}:
 *   delete:
 *     summary: 工事写真アルバム削除
 *     description: アルバムと関連する写真項目・看板配置データを論理削除する
 *     tags:
 *       - Construction Photos
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
 *       204:
 *         description: アルバム削除成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: アルバムが見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('construction_photo:delete'),
  validate(constructionPhotoIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.validatedParams as { id: string };

      await albumService.softDelete(id);

      logger.info({ userId: req.user?.userId, albumId: id }, 'Construction photo album deleted');

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
