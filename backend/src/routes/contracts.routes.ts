/**
 * @fileoverview 契約書APIルート
 *
 * 契約書のCRUD操作、ステータス遷移のエンドポイントを提供します。
 *
 * Requirements:
 * - 1.1, 1.2: 契約書リスト表示
 * - 3.4: 見積書選択UI（API経由）
 * - 5.1: 変更契約時のparentContractId検証
 * - 7.1: 契約書作成
 * - 8.1: 契約書詳細表示
 * - 8.2, 8.3: ステータス双方向遷移
 * - 9.2: 契約書更新（楽観的排他制御）
 *
 * Design Reference: design.md - contracts.routes セクション
 *
 * @module routes/contracts
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ContractService } from '../services/contract.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import logger from '../utils/logger.js';
import {
  createContractSchema,
  updateContractSchema,
  contractListQuerySchema,
  updateContractStatusSchema,
  type CreateContractInput,
  type UpdateContractInput,
  type ContractListQuery,
  type UpdateContractStatusInput,
} from '../schemas/contract.schema.js';
import {
  ContractNotFoundError,
  ContractConflictError,
  ContractValidationError,
} from '../errors/contractError.js';

// mergeParams: true を設定してネストされたルートからprojectIdを取得できるようにする
const router = Router({ mergeParams: true });
const prisma = getPrismaClient();
const contractService = new ContractService({ prisma });

// ==========================================
// 契約書一覧取得 GET /api/projects/:projectId/contracts
// ==========================================

/**
 * @swagger
 * /api/projects/{projectId}/contracts:
 *   get:
 *     summary: 契約書一覧取得
 *     description: プロジェクトに紐付く契約書の一覧を取得する
 *     tags:
 *       - Contracts
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
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [contractDate, createdAt]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: 契約書一覧
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 */
router.get(
  '/',
  authenticate,
  requirePermission('contract:read'),
  validate(contractListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          detail: 'プロジェクトIDが必要です',
        });
        return;
      }

      const query = req.validatedQuery as ContractListQuery;

      const result = await contractService.findByProject(projectId, query);

      logger.debug({ projectId, total: result.total }, 'Contract list retrieved');

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 契約書詳細取得 GET /api/contracts/:id
// ==========================================

/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: 契約書詳細取得
 *     description: 契約書の詳細情報を取得する
 *     tags:
 *       - Contracts
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
 *         description: 契約書詳細
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('contract:read'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;

      const contract = await contractService.findById(id);

      if (!contract) {
        res.status(404).json({
          status: 404,
          detail: '契約書が見つかりません',
        });
        return;
      }

      logger.debug({ contractId: id }, 'Contract detail retrieved');

      res.json(contract);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// 契約書作成 POST /api/projects/:projectId/contracts
// ==========================================

/**
 * @swagger
 * /api/projects/{projectId}/contracts:
 *   post:
 *     summary: 契約書作成
 *     description: プロジェクトに紐付く契約書を作成する
 *     tags:
 *       - Contracts
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
 *             $ref: '#/components/schemas/CreateContractInput'
 *     responses:
 *       201:
 *         description: 契約書作成成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       422:
 *         description: ビジネスロジックエラー
 */
router.post(
  '/',
  authenticate,
  requirePermission('contract:create'),
  validate(createContractSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          detail: 'プロジェクトIDが必要です',
        });
        return;
      }

      const data = req.validatedBody as CreateContractInput;

      const contract = await contractService.create(projectId, data);

      logger.info(
        { projectId, contractId: contract.id, userId: req.user?.userId },
        'Contract created'
      );

      res.status(201).json(contract);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        res.status(422).json({
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

// ==========================================
// 契約書更新 PUT /api/contracts/:id
// ==========================================

/**
 * @swagger
 * /api/contracts/{id}:
 *   put:
 *     summary: 契約書更新
 *     description: 契約書を更新する（楽観的排他制御）
 *     tags:
 *       - Contracts
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
 *             $ref: '#/components/schemas/UpdateContractInput'
 *     responses:
 *       200:
 *         description: 契約書更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('contract:update'),
  validate(updateContractSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = req.validatedBody as UpdateContractInput;

      const contract = await contractService.update(id, data);

      logger.info({ contractId: id, userId: req.user?.userId }, 'Contract updated');

      res.json(contract);
    } catch (error) {
      if (error instanceof ContractNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      if (error instanceof ContractConflictError) {
        res.status(409).json({
          status: 409,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// ステータス更新 PATCH /api/contracts/:id/status
// ==========================================

/**
 * @swagger
 * /api/contracts/{id}/status:
 *   patch:
 *     summary: 契約書ステータス更新
 *     description: 契約書のステータスを遷移する（BEFORE_CONTRACT <-> CONTRACTED）
 *     tags:
 *       - Contracts
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [BEFORE_CONTRACT, CONTRACTED]
 *     responses:
 *       200:
 *         description: ステータス更新成功
 *       400:
 *         description: バリデーションエラー
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('contract:update'),
  validate(updateContractStatusSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { status } = req.validatedBody as UpdateContractStatusInput;

      const contract = await contractService.updateStatus(id, status);

      logger.info(
        { contractId: id, newStatus: status, userId: req.user?.userId },
        'Contract status updated'
      );

      res.json(contract);
    } catch (error) {
      if (error instanceof ContractNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

// ==========================================
// 契約書論理削除 DELETE /api/contracts/:id
// ==========================================

/**
 * @swagger
 * /api/contracts/{id}:
 *   delete:
 *     summary: 契約書論理削除
 *     description: 契約書を論理削除する
 *     tags:
 *       - Contracts
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
 *         description: 削除成功
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('contract:delete'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;

      await contractService.delete(id);

      logger.info({ contractId: id, userId: req.user?.userId }, 'Contract soft-deleted');

      res.status(204).end();
    } catch (error) {
      if (error instanceof ContractNotFoundError) {
        res.status(404).json({
          status: 404,
          detail: error.message,
          code: error.code,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
