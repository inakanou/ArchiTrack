/**
 * @fileoverview オートコンプリートAPIルート
 *
 * Task 18.1: 旧個別エンドポイントを廃止し、一括取得エンドポイントのみを保持
 *
 * Requirements:
 * - 7.1-7.7: オートコンプリート候補の表示・フィルタリング・選択
 *
 * @module routes/autocomplete
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();

// ============================================================================
// オートコンプリート候補一括取得エンドポイント（Phase 3: 初回一括読み込み方式）
// ============================================================================

/**
 * オートコンプリート対象フィールド名
 */
type AutocompleteFieldName =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'unit'
  | 'remarks';

/**
 * オートコンプリート対象フィールド一覧
 *
 * NULLを許容するフィールド（nullable）はgroupByの結果からnull値を除外する必要がある
 */
const AUTOCOMPLETE_FIELDS: { field: AutocompleteFieldName; nullable: boolean }[] = [
  { field: 'majorCategory', nullable: false },
  { field: 'middleCategory', nullable: true },
  { field: 'minorCategory', nullable: true },
  { field: 'customCategory', nullable: true },
  { field: 'workType', nullable: false },
  { field: 'name', nullable: false },
  { field: 'specification', nullable: true },
  { field: 'unit', nullable: false },
  { field: 'remarks', nullable: true },
];

/**
 * @swagger
 * /api/projects/{projectId}/quantity-items/autocomplete-candidates:
 *   get:
 *     summary: オートコンプリート候補一括取得
 *     description: |
 *       プロジェクト単位で対象9フィールドのオートコンプリート候補値を一括取得する。
 *       各フィールドに対してGROUP BYで重複排除した候補値の配列を返す。
 *       各配列は50音順（locale: 'ja'）でソート済み。
 *     tags:
 *       - Autocomplete
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: プロジェクトID
 *     responses:
 *       200:
 *         description: オートコンプリート候補一括取得成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 candidates:
 *                   type: object
 *                   properties:
 *                     majorCategory:
 *                       type: array
 *                       items:
 *                         type: string
 *                     middleCategory:
 *                       type: array
 *                       items:
 *                         type: string
 *                     minorCategory:
 *                       type: array
 *                       items:
 *                         type: string
 *                     customCategory:
 *                       type: array
 *                       items:
 *                         type: string
 *                     workType:
 *                       type: array
 *                       items:
 *                         type: string
 *                     name:
 *                       type: array
 *                       items:
 *                         type: string
 *                     specification:
 *                       type: array
 *                       items:
 *                         type: string
 *                     unit:
 *                       type: array
 *                       items:
 *                         type: string
 *                     remarks:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない
 */
router.get(
  '/autocomplete-candidates',
  authenticate,
  requirePermission('quantity_table:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;

      // プロジェクトの存在チェック
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!project) {
        res.status(404).json({
          type: 'https://architrack.example.com/problems/project-not-found',
          title: 'Project Not Found',
          status: 404,
          detail: `プロジェクト（ID: ${projectId}）が見つかりません`,
          code: 'PROJECT_NOT_FOUND',
          projectId,
        });
        return;
      }

      // 9フィールドのgroupByをPromise.allで並列実行
      const fieldResults = await Promise.all(
        AUTOCOMPLETE_FIELDS.map(async ({ field, nullable }) => {
          // WHERE条件: プロジェクトスコープ、論理削除除外、NULL/空文字除外
          const whereCondition: Record<string, unknown> = {
            quantityGroup: {
              quantityTable: {
                projectId,
                deletedAt: null,
              },
            },
          };

          // NULLableフィールドはNOT NULLフィルタを追加
          if (nullable) {
            whereCondition[field] = { not: null };
          }

          const results = await prisma.quantityItem.groupBy({
            by: [field],
            where: whereCondition,
          });

          // 値を抽出し、null/空文字を除外、50音順ソート
          const values = results
            .map((r: Record<string, unknown>) => r[field] as string | null)
            .filter((v): v is string => v !== null && v !== undefined && v.trim() !== '')
            .sort((a: string, b: string) => a.localeCompare(b, 'ja'));

          return { field, values };
        })
      );

      // フィールド別候補マップを構築
      const candidates: Record<AutocompleteFieldName, string[]> = {
        majorCategory: [],
        middleCategory: [],
        minorCategory: [],
        customCategory: [],
        workType: [],
        name: [],
        specification: [],
        unit: [],
        remarks: [],
      };

      for (const { field, values } of fieldResults) {
        candidates[field] = values;
      }

      logger.debug(
        {
          userId: req.user?.userId,
          projectId,
          fieldCounts: Object.fromEntries(
            Object.entries(candidates).map(([k, v]) => [k, v.length])
          ),
        },
        'Autocomplete candidates bulk fetch'
      );

      res.json({ candidates });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
