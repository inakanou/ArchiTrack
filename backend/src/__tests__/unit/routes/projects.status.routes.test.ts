/**
 * @fileoverview ステータス遷移API ルートのユニットテスト
 *
 * Task: 4.3 ステータス遷移APIの実装
 * Requirements:
 * - 10.8: 許可されたステータス遷移を実行する
 * - 10.9: 無効なステータス遷移時のエラーレスポンス（422）
 * - 10.13: ステータス変更履歴をプロジェクト詳細画面で閲覧可能にする
 * - 10.14: 差し戻し遷移時の理由必須バリデーション
 * - 14.7: すべてのAPIエンドポイントをOpenAPI仕様書に文書化
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { ZodError } from 'zod';
import {
  ProjectNotFoundError,
  InvalidStatusTransitionError,
  ReasonRequiredError,
} from '../../../errors/projectError.js';
import { ValidationError } from '../../../errors/apiError.js';

// Hoisted mock functions
const { mockTransitionStatus, mockGetStatusHistory, mockGetAllowedTransitions } = vi.hoisted(
  () => ({
    mockTransitionStatus: vi.fn(),
    mockGetStatusHistory: vi.fn(),
    mockGetAllowedTransitions: vi.fn(),
  })
);

// Mock modules before importing the router
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectStatusHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  })),
}));

vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: vi.fn((req, _res, next) => {
    req.user = { userId: 'test-user-id' };
    next();
  }),
}));

vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class MockAuditLogService {
    createLog = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../services/project-status.service.js', () => ({
  ProjectStatusService: class MockProjectStatusService {
    transitionStatus = mockTransitionStatus;
    getStatusHistory = mockGetStatusHistory;
    getAllowedTransitions = mockGetAllowedTransitions;
  },
}));

vi.mock('../../../services/project.service.js', () => ({
  ProjectService: class MockProjectService {
    createProject = vi.fn();
    getProjects = vi.fn();
    getProject = vi.fn();
    updateProject = vi.fn();
    deleteProject = vi.fn();
  },
}));

// Import after mocking
import projectsRouter from '../../../routes/projects.routes.js';

describe('Projects Status Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);

    // Add error handler for tests
    app.use(
      (
        err: Error,
        _req: express.Request,
        res: express.Response,

        _next: express.NextFunction
      ): void => {
        if (err instanceof ZodError) {
          res.status(400).json({
            type: 'validation_error',
            title: 'Validation Error',
            status: 400,
            errors: err.issues,
          });
          return;
        }
        if (err instanceof ValidationError) {
          res.status(400).json({
            type: err.problemType,
            title: 'Validation Error',
            status: 400,
            detail: err.message,
            code: err.code,
            errors: err.details,
          });
          return;
        }
        if (err instanceof ProjectNotFoundError) {
          res.status(404).json({
            type: err.problemType,
            title: 'Project Not Found',
            status: 404,
            detail: err.message,
            code: err.code,
          });
          return;
        }
        if (err instanceof InvalidStatusTransitionError) {
          res.status(422).json({
            type: err.problemType,
            title: 'Invalid Status Transition',
            status: 422,
            detail: err.message,
            code: err.code,
            fromStatus: err.fromStatus,
            toStatus: err.toStatus,
            allowed: err.allowed,
          });
          return;
        }
        if (err instanceof ReasonRequiredError) {
          res.status(422).json({
            type: err.problemType,
            title: 'Reason Required',
            status: 422,
            detail: err.message,
            code: err.code,
          });
          return;
        }
        res.status(500).json({ error: err.message });
      }
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('PATCH /api/projects/:id/status', () => {
    const validProjectId = '123e4567-e89b-12d3-a456-426614174000';

    describe('正常系', () => {
      it('順方向遷移が成功した場合、200とプロジェクト情報を返す', async () => {
        const updatedProject = {
          id: validProjectId,
          name: 'Test Project',
          status: 'SURVEYING',
          updatedAt: new Date(),
        };

        mockTransitionStatus.mockResolvedValueOnce(updatedProject);

        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({ status: 'SURVEYING' })
          .expect(200);

        expect(response.body.id).toBe(validProjectId);
        expect(response.body.status).toBe('SURVEYING');
        expect(mockTransitionStatus).toHaveBeenCalledWith(
          validProjectId,
          'SURVEYING',
          'test-user-id',
          undefined
        );
      });

      it('差し戻し遷移が理由付きで成功した場合、200とプロジェクト情報を返す', async () => {
        const updatedProject = {
          id: validProjectId,
          name: 'Test Project',
          status: 'PREPARING',
          updatedAt: new Date(),
        };

        mockTransitionStatus.mockResolvedValueOnce(updatedProject);

        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({
            status: 'PREPARING',
            reason: '追加調査が必要なため',
          })
          .expect(200);

        expect(response.body.status).toBe('PREPARING');
        expect(mockTransitionStatus).toHaveBeenCalledWith(
          validProjectId,
          'PREPARING',
          'test-user-id',
          '追加調査が必要なため'
        );
      });

      it('終端遷移（完了）が成功した場合、200を返す', async () => {
        const updatedProject = {
          id: validProjectId,
          name: 'Test Project',
          status: 'COMPLETED',
          updatedAt: new Date(),
        };

        mockTransitionStatus.mockResolvedValueOnce(updatedProject);

        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({ status: 'COMPLETED' })
          .expect(200);

        expect(response.body.status).toBe('COMPLETED');
      });
    });

    describe('異常系', () => {
      it('プロジェクトが存在しない場合、404を返す', async () => {
        mockTransitionStatus.mockRejectedValueOnce(new ProjectNotFoundError(validProjectId));

        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({ status: 'SURVEYING' })
          .expect(404);

        expect(response.body.code).toBe('PROJECT_NOT_FOUND');
      });

      it('無効なステータス遷移の場合、422を返す', async () => {
        const allowedTransitions: import('../../../errors/projectError.js').AllowedTransition[] = [
          { status: 'SURVEYING', type: 'forward' },
          { status: 'CANCELLED', type: 'terminate' },
        ];

        mockTransitionStatus.mockRejectedValueOnce(
          new InvalidStatusTransitionError('PREPARING', 'COMPLETED', allowedTransitions)
        );

        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({ status: 'COMPLETED' })
          .expect(422);

        expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
        expect(response.body.fromStatus).toBe('PREPARING');
        expect(response.body.toStatus).toBe('COMPLETED');
        expect(response.body.allowed).toEqual(allowedTransitions);
      });

      it('差し戻し遷移で理由がない場合、422を返す', async () => {
        mockTransitionStatus.mockRejectedValueOnce(new ReasonRequiredError());

        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({ status: 'PREPARING' })
          .expect(422);

        expect(response.body.code).toBe('REASON_REQUIRED');
      });

      it('無効なプロジェクトID形式の場合、400を返す', async () => {
        const response = await request(app)
          .patch('/api/projects/invalid-id/status')
          .send({ status: 'SURVEYING' })
          .expect(400);

        expect(response.body).toBeDefined();
      });

      it('無効なステータス値の場合、400を返す', async () => {
        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({ status: 'INVALID_STATUS' })
          .expect(400);

        expect(response.body).toBeDefined();
      });

      it('ステータスが指定されていない場合、400を返す', async () => {
        const response = await request(app)
          .patch(`/api/projects/${validProjectId}/status`)
          .send({})
          .expect(400);

        expect(response.body).toBeDefined();
      });
    });
  });

  describe('GET /api/projects/:id/status-history', () => {
    const validProjectId = '123e4567-e89b-12d3-a456-426614174000';

    describe('正常系', () => {
      it('ステータス変更履歴を取得できる', async () => {
        const histories = [
          {
            id: 'history-1',
            projectId: validProjectId,
            fromStatus: 'PREPARING',
            toStatus: 'SURVEYING',
            transitionType: 'forward',
            reason: null,
            changedById: 'user-1',
            changedAt: new Date('2025-12-01'),
            changedBy: {
              id: 'user-1',
              displayName: 'Test User',
            },
          },
          {
            id: 'history-2',
            projectId: validProjectId,
            fromStatus: null,
            toStatus: 'PREPARING',
            transitionType: 'initial',
            reason: null,
            changedById: 'user-1',
            changedAt: new Date('2025-11-30'),
            changedBy: {
              id: 'user-1',
              displayName: 'Test User',
            },
          },
        ];

        mockGetStatusHistory.mockResolvedValueOnce(histories);

        const response = await request(app)
          .get(`/api/projects/${validProjectId}/status-history`)
          .expect(200);

        expect(response.body).toHaveLength(2);
        expect(response.body[0].fromStatus).toBe('PREPARING');
        expect(response.body[0].toStatus).toBe('SURVEYING');
        expect(response.body[0].transitionType).toBe('forward');
        expect(response.body[1].fromStatus).toBeNull();
        expect(response.body[1].transitionType).toBe('initial');
      });

      it('差し戻し理由を含む履歴を取得できる', async () => {
        const histories = [
          {
            id: 'history-1',
            projectId: validProjectId,
            fromStatus: 'SURVEYING',
            toStatus: 'PREPARING',
            transitionType: 'backward',
            reason: '追加調査が必要なため',
            changedById: 'user-1',
            changedAt: new Date('2025-12-01'),
            changedBy: {
              id: 'user-1',
              displayName: 'Test User',
            },
          },
        ];

        mockGetStatusHistory.mockResolvedValueOnce(histories);

        const response = await request(app)
          .get(`/api/projects/${validProjectId}/status-history`)
          .expect(200);

        expect(response.body[0].reason).toBe('追加調査が必要なため');
        expect(response.body[0].transitionType).toBe('backward');
      });

      it('履歴がない場合、空配列を返す', async () => {
        mockGetStatusHistory.mockResolvedValueOnce([]);

        const response = await request(app)
          .get(`/api/projects/${validProjectId}/status-history`)
          .expect(200);

        expect(response.body).toEqual([]);
      });
    });

    describe('異常系', () => {
      it('プロジェクトが存在しない場合、404を返す', async () => {
        mockGetStatusHistory.mockRejectedValueOnce(new ProjectNotFoundError(validProjectId));

        const response = await request(app)
          .get(`/api/projects/${validProjectId}/status-history`)
          .expect(404);

        expect(response.body.code).toBe('PROJECT_NOT_FOUND');
      });

      it('無効なプロジェクトID形式の場合、400を返す', async () => {
        const response = await request(app)
          .get('/api/projects/invalid-id/status-history')
          .expect(400);

        expect(response.body).toBeDefined();
      });
    });
  });
});
