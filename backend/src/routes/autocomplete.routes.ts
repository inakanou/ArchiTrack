/**
 * @fileoverview オートコンプリートAPIルート
 *
 * Requirements:
 * - 7.1: 大項目フィールドで2文字以上入力すると、過去の入力履歴からオートコンプリート候補を表示する
 * - 7.2: 中項目フィールドで2文字以上入力すると、選択中の大項目に紐づく過去の中項目からオートコンプリート候補を表示する
 * - 7.3: 小項目フィールドで2文字以上入力すると、選択中の大項目・中項目に紐づく過去の小項目からオートコンプリート候補を表示する
 *
 * @module routes/autocomplete
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * オートコンプリートクエリスキーマ
 */
const autocompleteQuerySchema = z.object({
  q: z.string().min(1, '検索文字列は必須です'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * 中項目オートコンプリートクエリスキーマ
 */
const middleCategoryQuerySchema = autocompleteQuerySchema.extend({
  majorCategory: z.string().min(1, '大項目は必須です'),
});

/**
 * 小項目オートコンプリートクエリスキーマ
 */
const minorCategoryQuerySchema = middleCategoryQuerySchema.extend({
  middleCategory: z.string().min(1, '中項目は必須です'),
});

/**
 * @swagger
 * /api/autocomplete/major-categories:
 *   get:
 *     summary: 大項目オートコンプリート
 *     description: 過去の入力履歴から大項目の候補を取得
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 検索文字列
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 最大取得件数
 *     responses:
 *       200:
 *         description: オートコンプリート候補
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/major-categories',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(autocompleteQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q, limit } = req.validatedQuery as { q: string; limit: number };

      const results = await prisma.quantityItem.groupBy({
        by: ['majorCategory'],
        where: {
          majorCategory: {
            contains: q,
            mode: 'insensitive',
          },
          quantityGroup: {
            quantityTable: {
              deletedAt: null,
            },
          },
        },
        take: limit,
        orderBy: {
          _count: {
            majorCategory: 'desc',
          },
        },
      });

      const suggestions = results.map((r) => r.majorCategory);

      logger.debug(
        { userId: req.user?.userId, query: q, resultCount: suggestions.length },
        'Major category autocomplete'
      );

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/autocomplete/middle-categories:
 *   get:
 *     summary: 中項目オートコンプリート
 *     description: 指定された大項目に紐づく過去の中項目から候補を取得
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 検索文字列
 *       - in: query
 *         name: majorCategory
 *         required: true
 *         schema:
 *           type: string
 *         description: 大項目
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 最大取得件数
 *     responses:
 *       200:
 *         description: オートコンプリート候補
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/middle-categories',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(middleCategoryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q, majorCategory, limit } = req.validatedQuery as {
        q: string;
        majorCategory: string;
        limit: number;
      };

      const results = await prisma.quantityItem.groupBy({
        by: ['middleCategory'],
        where: {
          majorCategory,
          middleCategory: {
            not: null,
            contains: q,
            mode: 'insensitive',
          },
          quantityGroup: {
            quantityTable: {
              deletedAt: null,
            },
          },
        },
        take: limit,
        orderBy: {
          _count: {
            middleCategory: 'desc',
          },
        },
      });

      const suggestions = results
        .map((r) => r.middleCategory)
        .filter((v): v is string => v !== null);

      logger.debug(
        { userId: req.user?.userId, query: q, majorCategory, resultCount: suggestions.length },
        'Middle category autocomplete'
      );

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/autocomplete/minor-categories:
 *   get:
 *     summary: 小項目オートコンプリート
 *     description: 指定された大項目・中項目に紐づく過去の小項目から候補を取得
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 検索文字列
 *       - in: query
 *         name: majorCategory
 *         required: true
 *         schema:
 *           type: string
 *         description: 大項目
 *       - in: query
 *         name: middleCategory
 *         required: true
 *         schema:
 *           type: string
 *         description: 中項目
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 最大取得件数
 *     responses:
 *       200:
 *         description: オートコンプリート候補
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/minor-categories',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(minorCategoryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q, majorCategory, middleCategory, limit } = req.validatedQuery as {
        q: string;
        majorCategory: string;
        middleCategory: string;
        limit: number;
      };

      const results = await prisma.quantityItem.groupBy({
        by: ['minorCategory'],
        where: {
          majorCategory,
          middleCategory,
          minorCategory: {
            not: null,
            contains: q,
            mode: 'insensitive',
          },
          quantityGroup: {
            quantityTable: {
              deletedAt: null,
            },
          },
        },
        take: limit,
        orderBy: {
          _count: {
            minorCategory: 'desc',
          },
        },
      });

      const suggestions = results
        .map((r) => r.minorCategory)
        .filter((v): v is string => v !== null);

      logger.debug(
        {
          userId: req.user?.userId,
          query: q,
          majorCategory,
          middleCategory,
          resultCount: suggestions.length,
        },
        'Minor category autocomplete'
      );

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/autocomplete/work-types:
 *   get:
 *     summary: 工種オートコンプリート
 *     description: 過去の入力履歴から工種の候補を取得
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 検索文字列
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 最大取得件数
 *     responses:
 *       200:
 *         description: オートコンプリート候補
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/work-types',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(autocompleteQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q, limit } = req.validatedQuery as { q: string; limit: number };

      const results = await prisma.quantityItem.groupBy({
        by: ['workType'],
        where: {
          workType: {
            contains: q,
            mode: 'insensitive',
          },
          quantityGroup: {
            quantityTable: {
              deletedAt: null,
            },
          },
        },
        take: limit,
        orderBy: {
          _count: {
            workType: 'desc',
          },
        },
      });

      const suggestions = results.map((r) => r.workType);

      logger.debug(
        { userId: req.user?.userId, query: q, resultCount: suggestions.length },
        'Work type autocomplete'
      );

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/autocomplete/units:
 *   get:
 *     summary: 単位オートコンプリート
 *     description: 過去の入力履歴から単位の候補を取得
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 検索文字列
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 最大取得件数
 *     responses:
 *       200:
 *         description: オートコンプリート候補
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/units',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(autocompleteQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q, limit } = req.validatedQuery as { q: string; limit: number };

      const results = await prisma.quantityItem.groupBy({
        by: ['unit'],
        where: {
          unit: {
            contains: q,
            mode: 'insensitive',
          },
          quantityGroup: {
            quantityTable: {
              deletedAt: null,
            },
          },
        },
        take: limit,
        orderBy: {
          _count: {
            unit: 'desc',
          },
        },
      });

      const suggestions = results.map((r) => r.unit);

      logger.debug(
        { userId: req.user?.userId, query: q, resultCount: suggestions.length },
        'Unit autocomplete'
      );

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/autocomplete/specifications:
 *   get:
 *     summary: 規格オートコンプリート
 *     description: 過去の入力履歴から規格の候補を取得
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 検索文字列
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 最大取得件数
 *     responses:
 *       200:
 *         description: オートコンプリート候補
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/specifications',
  authenticate,
  requirePermission('quantity_table:read'),
  validate(autocompleteQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q, limit } = req.validatedQuery as { q: string; limit: number };

      const results = await prisma.quantityItem.groupBy({
        by: ['specification'],
        where: {
          specification: {
            not: null,
            contains: q,
            mode: 'insensitive',
          },
          quantityGroup: {
            quantityTable: {
              deletedAt: null,
            },
          },
        },
        take: limit,
        orderBy: {
          _count: {
            specification: 'desc',
          },
        },
      });

      const suggestions = results
        .map((r) => r.specification)
        .filter((v): v is string => v !== null);

      logger.debug(
        { userId: req.user?.userId, query: q, resultCount: suggestions.length },
        'Specification autocomplete'
      );

      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
