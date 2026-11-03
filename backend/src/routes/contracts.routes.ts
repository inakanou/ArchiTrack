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
 * 案件の閲覧範囲（contract-management の Requirement 13.1・13.2・13.4、14.1〜14.7、user-authentication の
 * 要件39。タスク19.1）: 全経路で requirePermission と経路の ID の形式の検査の後に
 * contract-management-project-scope.middleware の判定部品を置き、範囲外は不在と同じ汎用の 404 にする。
 * `/:id` 配下は経路の projectId でなく契約書が属する案件で判定し、二重マウントで経路の projectId と
 * 契約書の案件が食い違えば不在と同じ 404 にする（14.4）。作成・更新の要求が指す見積書と、変更契約の
 * 作成の要求が指す基となる契約書の所属の照合（14.5・14.6）は ContractService が行う。
 *
 * @module routes/contracts
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ContractService } from '../services/contract.service.js';
import getPrismaClient from '../db.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { projectScopeDenialContextOf } from '../middleware/project-scope.middleware.js';
import {
  requireProjectParamScope,
  requireContractProjectScope,
} from '../middleware/contract-management-project-scope.middleware.js';
import logger from '../utils/logger.js';
import {
  createContractSchema,
  updateContractSchema,
  contractListQuerySchema,
  updateContractStatusSchema,
  contractIdParamSchema,
  projectIdParamSchema,
  type CreateContractInput,
  type UpdateContractInput,
  type ContractListQuery,
  type UpdateContractStatusInput,
} from '../schemas/contract.schema.js';
import {
  ContractNotFoundError,
  ContractConflictError,
  ContractValidationError,
  ContractDeletionConstraintError,
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
 *       400:
 *         description: バリデーションエラー（projectId の形式不正、クエリの不正）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない（閲覧範囲外を含む）
 */
router.get(
  '/',
  authenticate,
  requirePermission('contract:read'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(contractListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 経路のプロジェクト ID は形式の検査（projectIdParamSchema）を通っている。`/api/contracts` のマウント
      // から届く要求は経路にプロジェクト ID が無く、その検査の 400 で終わる（タスク19.1）
      const { projectId } = req.validatedParams as { projectId: string };

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
 *       400:
 *         description: 契約書IDの形式不正
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない（閲覧範囲外・論理削除済み・経路のプロジェクトに属さない契約書を含む）
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('contract:read'),
  validate(contractIdParamSchema, 'params'),
  requireContractProjectScope('id'),
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
 *         description: バリデーションエラー（projectId の形式不正を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: プロジェクトが見つからない（閲覧範囲外を含む）、または見積書が見つからない（経路のプロジェクトに属さない見積書を含む。本文は同一）
 *       422:
 *         description: 基となる契約書が見つからない・同じプロジェクトに属さない（本文は同一）、または同じプロジェクトの論理削除済みの見積書
 */
router.post(
  '/',
  authenticate,
  requirePermission('contract:create'),
  validate(projectIdParamSchema, 'params'),
  requireProjectParamScope('projectId'),
  validate(createContractSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 経路のプロジェクト ID は形式の検査（projectIdParamSchema）を通っている。`/api/contracts` のマウント
      // から届く要求は経路にプロジェクト ID が無く、その検査の 400 で終わる（タスク19.1）
      const { projectId } = req.validatedParams as { projectId: string };

      const data = req.validatedBody as CreateContractInput;

      const contract = await contractService.create(
        projectId,
        data,
        req.user?.userId,
        projectScopeDenialContextOf(req)
      );

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
 *         description: バリデーションエラー（契約書IDの形式不正を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない（閲覧範囲外・論理削除済み・経路のプロジェクトに属さない契約書を含む）、または見積書が見つからない（契約書のプロジェクトに属さない見積書を含む。本文は同一）
 *       409:
 *         description: 楽観的排他制御エラー（競合）
 *       422:
 *         description: 同じプロジェクトの論理削除済みの見積書
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('contract:update'),
  validate(contractIdParamSchema, 'params'),
  requireContractProjectScope('id'),
  validate(updateContractSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const data = req.validatedBody as UpdateContractInput;

      const contract = await contractService.update(
        id,
        data,
        req.user?.userId,
        projectScopeDenialContextOf(req)
      );

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
 *         description: バリデーションエラー（契約書IDの形式不正を含む）
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない（閲覧範囲外・論理削除済み・経路のプロジェクトに属さない契約書を含む）
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('contract:update'),
  validate(contractIdParamSchema, 'params'),
  requireContractProjectScope('id'),
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
 *       400:
 *         description: 契約書IDの形式不正
 *       401:
 *         description: 認証エラー
 *       403:
 *         description: 権限不足
 *       404:
 *         description: 契約書が見つからない（閲覧範囲外・論理削除済み・経路のプロジェクトに属さない契約書を含む）
 *       422:
 *         description: 削除制約エラー（子契約存在・契約済ステータス）
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('contract:delete'),
  validate(contractIdParamSchema, 'params'),
  requireContractProjectScope('id'),
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
      if (error instanceof ContractDeletionConstraintError) {
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

export default router;
