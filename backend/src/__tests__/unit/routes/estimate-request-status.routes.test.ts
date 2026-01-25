/**
 * @fileoverview 見積依頼ステータス管理ルートのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 12.5, 12.6, 12.7, 12.8: ステータス遷移ボタン制御
 * - 12.9, 12.10: ステータス遷移実行
 * - 12.11: ステータス変更履歴
 *
 * Task 13.3: ステータス管理エンドポイントの実装
 *
 * @module __tests__/unit/routes/estimate-request-status.routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type NextFunction, type Request, type Response } from 'express';

// Use vi.hoisted to create mock functions that are hoisted along with vi.mock
const {
  mockTransitionStatus,
  mockGetStatusHistory,
  mockGetAllowedTransitions,
  mockRequirePermission,
  mockState,
} = vi.hoisted(() => ({
  mockTransitionStatus: vi.fn(),
  mockGetStatusHistory: vi.fn(),
  mockGetAllowedTransitions: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockState: { shouldRejectPermission: false },
}));

// Mock dependencies before importing the routes
vi.mock('../../../db.js', () => ({
  default: vi.fn(() => ({
    $transaction: vi.fn(),
    estimateRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    estimateRequestStatusHistory: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  })),
}));

vi.mock('../../../services/estimate-request-status.service.js', () => ({
  EstimateRequestStatusService: class {
    transitionStatus = mockTransitionStatus;
    getStatusHistory = mockGetStatusHistory;
    getAllowedTransitions = mockGetAllowedTransitions;
  },
}));

vi.mock('../../../services/audit-log.service.js', () => ({
  AuditLogService: class {
    createLog = vi.fn();
  },
}));

// Mock authenticate middleware
vi.mock('../../../middleware/authenticate.middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    req.user = {
      userId: 'test-user-id',
      email: 'test@example.com',
      roles: ['user'],
    };
    next();
  },
}));

// Mock authorize middleware (controlled by mockState.shouldRejectPermission)
vi.mock('../../../middleware/authorize.middleware.js', () => ({
  requirePermission: (permission: string) => {
    return (_req: Request, res: Response, next: NextFunction): void => {
      mockRequirePermission(permission);
      if (mockState.shouldRejectPermission) {
        res.status(403).json({
          type: '/problem/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Permission denied',
          code: 'FORBIDDEN',
        });
        return;
      }
      next();
    };
  },
}));

// Import after mocking
import estimateRequestStatusRoutes from '../../../routes/estimate-request-status.routes.js';
import {
  EstimateRequestStatusNotFoundError,
  InvalidEstimateRequestStatusTransitionError,
} from '../../../errors/estimateRequestStatusError.js';
import { ValidationError } from '../../../errors/apiError.js';

describe('estimate-request-status.routes', () => {
  let app: express.Express;

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  const mockStatusTransitionResult = {
    id: validUUID,
    status: 'REQUESTED' as const,
    updatedAt: new Date('2024-01-02T00:00:00Z'),
  };

  const mockStatusHistory = [
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      estimateRequestId: validUUID,
      fromStatus: 'BEFORE_REQUEST',
      toStatus: 'REQUESTED',
      changedById: 'test-user-id',
      changedAt: new Date('2024-01-02T00:00:00Z'),
      changedBy: {
        id: 'test-user-id',
        displayName: 'テストユーザー',
      },
    },
  ];

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // ステータス管理ルート
    app.use('/api/estimate-requests', estimateRequestStatusRoutes);

    // エラーハンドラー
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof ValidationError) {
        res.status(400).json({
          type: 'https://api.architrack.com/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: err.message,
          code: 'VALIDATION_ERROR',
          errors: err.details,
        });
        return;
      }
      console.error('Test error:', err);
      res.status(500).json({ error: err.message });
    });

    mockState.shouldRejectPermission = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('PATCH /api/estimate-requests/:id/status', () => {
    it('should transition status and return 200', async () => {
      mockTransitionStatus.mockResolvedValue(mockStatusTransitionResult);

      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({ status: 'REQUESTED' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          id: validUUID,
          status: 'REQUESTED',
        })
      );
      expect(mockTransitionStatus).toHaveBeenCalledWith(validUUID, 'REQUESTED', expect.any(String));
    });

    it('should return 400 for invalid status value', async () => {
      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({ status: 'INVALID_STATUS' });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing status', async () => {
      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 when estimate request not found', async () => {
      mockTransitionStatus.mockRejectedValue(new EstimateRequestStatusNotFoundError(validUUID));

      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({ status: 'REQUESTED' });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_STATUS_NOT_FOUND');
    });

    it('should return 400 for invalid status transition', async () => {
      mockTransitionStatus.mockRejectedValue(
        new InvalidEstimateRequestStatusTransitionError('BEFORE_REQUEST', 'QUOTATION_RECEIVED', [
          { status: 'REQUESTED' as const },
        ])
      );

      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({ status: 'QUOTATION_RECEIVED' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should require estimate_request:update permission', async () => {
      mockTransitionStatus.mockResolvedValue(mockStatusTransitionResult);

      await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({ status: 'REQUESTED' });

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:update');
    });

    it('should return 403 when user lacks permission', async () => {
      mockState.shouldRejectPermission = true;

      const response = await request(app)
        .patch(`/api/estimate-requests/${validUUID}/status`)
        .send({ status: 'REQUESTED' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/estimate-requests/:id/status-history', () => {
    it('should return status history', async () => {
      mockGetStatusHistory.mockResolvedValue(mockStatusHistory);

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/status-history`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toEqual(
        expect.objectContaining({
          fromStatus: 'BEFORE_REQUEST',
          toStatus: 'REQUESTED',
          changedBy: expect.objectContaining({
            id: 'test-user-id',
            displayName: 'テストユーザー',
          }),
        })
      );
    });

    it('should return empty array when no history exists', async () => {
      mockGetStatusHistory.mockResolvedValue([]);

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/status-history`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should return 404 when estimate request not found', async () => {
      mockGetStatusHistory.mockRejectedValue(new EstimateRequestStatusNotFoundError(validUUID));

      const response = await request(app).get(`/api/estimate-requests/${validUUID}/status-history`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ESTIMATE_REQUEST_STATUS_NOT_FOUND');
    });

    it('should require estimate_request:read permission', async () => {
      mockGetStatusHistory.mockResolvedValue([]);

      await request(app).get(`/api/estimate-requests/${validUUID}/status-history`);

      expect(mockRequirePermission).toHaveBeenCalledWith('estimate_request:read');
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app).get('/api/estimate-requests/invalid-uuid/status-history');

      expect(response.status).toBe(400);
    });
  });
});
