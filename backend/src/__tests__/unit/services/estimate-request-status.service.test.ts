/**
 * @fileoverview EstimateRequestStatusService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 12.2: ステータスは「依頼前」「依頼済」「見積受領済」の3種類
 * - 12.5: 依頼前のとき「依頼済にする」ボタン
 * - 12.6: 依頼済のとき「見積受領済にする」ボタン
 * - 12.7: 依頼済のとき「依頼前に戻す」ボタンは表示しない
 * - 12.8: 見積受領済のとき「依頼済に戻す」ボタン
 * - 12.9, 12.10: ステータス遷移の実行
 * - 12.11: ステータス変更履歴を記録
 *
 * Task 12.2: EstimateRequestStatusServiceの実装
 *
 * @module tests/unit/services/estimate-request-status.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EstimateRequestStatusService } from '../../../services/estimate-request-status.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import {
  InvalidEstimateRequestStatusTransitionError,
  EstimateRequestStatusNotFoundError,
} from '../../../errors/estimateRequestStatusError.js';

// PrismaClientモック
const createMockPrisma = () => {
  return {
    estimateRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    estimateRequestStatusHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        estimateRequest: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        estimateRequestStatusHistory: {
          create: vi.fn(),
          findMany: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
};

// AuditLogServiceモック
const createMockAuditLogService = (): IAuditLogService => ({
  createLog: vi.fn().mockResolvedValue(undefined),
  getLogs: vi.fn(),
  exportLogs: vi.fn(),
});

describe('EstimateRequestStatusService', () => {
  let service: EstimateRequestStatusService;
  let mockPrisma: PrismaClient;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();
    service = new EstimateRequestStatusService({
      prisma: mockPrisma,
      auditLogService: mockAuditLogService,
    });
  });

  describe('getAllowedTransitions', () => {
    it('依頼前からは依頼済への遷移が可能（Requirements: 12.5）', () => {
      // Act
      const transitions = service.getAllowedTransitions('BEFORE_REQUEST');

      // Assert
      expect(transitions).toHaveLength(1);
      expect(transitions[0]!.status).toBe('REQUESTED');
    });

    it('依頼済からは見積受領済への遷移が可能（Requirements: 12.6）', () => {
      // Act
      const transitions = service.getAllowedTransitions('REQUESTED');

      // Assert
      expect(transitions).toHaveLength(1);
      expect(transitions[0]!.status).toBe('QUOTATION_RECEIVED');
    });

    it('依頼済から依頼前への遷移は不可（Requirements: 12.7）', () => {
      // Act
      const transitions = service.getAllowedTransitions('REQUESTED');

      // Assert
      expect(transitions).not.toContainEqual(expect.objectContaining({ status: 'BEFORE_REQUEST' }));
    });

    it('見積受領済からは依頼済への遷移が可能（Requirements: 12.8）', () => {
      // Act
      const transitions = service.getAllowedTransitions('QUOTATION_RECEIVED');

      // Assert
      expect(transitions).toHaveLength(1);
      expect(transitions[0]!.status).toBe('REQUESTED');
    });
  });

  describe('getTransitionType', () => {
    it('依頼前から依頼済への遷移は有効', () => {
      // Act
      const isValid = service.isValidTransition('BEFORE_REQUEST', 'REQUESTED');

      // Assert
      expect(isValid).toBe(true);
    });

    it('依頼済から見積受領済への遷移は有効', () => {
      // Act
      const isValid = service.isValidTransition('REQUESTED', 'QUOTATION_RECEIVED');

      // Assert
      expect(isValid).toBe(true);
    });

    it('見積受領済から依頼済への遷移は有効', () => {
      // Act
      const isValid = service.isValidTransition('QUOTATION_RECEIVED', 'REQUESTED');

      // Assert
      expect(isValid).toBe(true);
    });

    it('依頼済から依頼前への遷移は無効', () => {
      // Act
      const isValid = service.isValidTransition('REQUESTED', 'BEFORE_REQUEST');

      // Assert
      expect(isValid).toBe(false);
    });

    it('見積受領済から依頼前への遷移は無効', () => {
      // Act
      const isValid = service.isValidTransition('QUOTATION_RECEIVED', 'BEFORE_REQUEST');

      // Assert
      expect(isValid).toBe(false);
    });

    it('依頼前から見積受領済への遷移は無効', () => {
      // Act
      const isValid = service.isValidTransition('BEFORE_REQUEST', 'QUOTATION_RECEIVED');

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('transitionStatus', () => {
    it('依頼前から依頼済へ遷移する（Requirements: 12.9, 12.10）', async () => {
      // Arrange
      const estimateRequestId = 'er-001';
      const newStatus = 'REQUESTED' as const;
      const actorId = 'user-001';

      const mockEstimateRequest = {
        id: 'er-001',
        status: 'BEFORE_REQUEST',
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      const mockUpdatedRequest = {
        id: 'er-001',
        status: 'REQUESTED',
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            update: vi.fn().mockResolvedValue(mockUpdatedRequest),
          },
          estimateRequestStatusHistory: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.transitionStatus(estimateRequestId, newStatus, actorId);

      // Assert
      expect(result.id).toBe('er-001');
      expect(result.status).toBe('REQUESTED');
      expect(mockAuditLogService.createLog).toHaveBeenCalled();
    });

    it('依頼済から見積受領済へ遷移する', async () => {
      // Arrange
      const estimateRequestId = 'er-001';
      const newStatus = 'QUOTATION_RECEIVED' as const;
      const actorId = 'user-001';

      const mockEstimateRequest = {
        id: 'er-001',
        status: 'REQUESTED',
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      const mockUpdatedRequest = {
        id: 'er-001',
        status: 'QUOTATION_RECEIVED',
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            update: vi.fn().mockResolvedValue(mockUpdatedRequest),
          },
          estimateRequestStatusHistory: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.transitionStatus(estimateRequestId, newStatus, actorId);

      // Assert
      expect(result.status).toBe('QUOTATION_RECEIVED');
    });

    it('見積受領済から依頼済へ遷移する', async () => {
      // Arrange
      const estimateRequestId = 'er-001';
      const newStatus = 'REQUESTED' as const;
      const actorId = 'user-001';

      const mockEstimateRequest = {
        id: 'er-001',
        status: 'QUOTATION_RECEIVED',
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      const mockUpdatedRequest = {
        id: 'er-001',
        status: 'REQUESTED',
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            update: vi.fn().mockResolvedValue(mockUpdatedRequest),
          },
          estimateRequestStatusHistory: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      const result = await service.transitionStatus(estimateRequestId, newStatus, actorId);

      // Assert
      expect(result.status).toBe('REQUESTED');
    });

    it('見積依頼が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.transitionStatus('er-nonexistent', 'REQUESTED', 'user-001')
      ).rejects.toThrow(EstimateRequestStatusNotFoundError);
    });

    it('論理削除された見積依頼の場合、エラーを発生させる', async () => {
      // Arrange
      const mockEstimateRequest = {
        id: 'er-001',
        status: 'BEFORE_REQUEST',
        updatedAt: new Date(),
        deletedAt: new Date(), // 論理削除済み
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(service.transitionStatus('er-001', 'REQUESTED', 'user-001')).rejects.toThrow(
        EstimateRequestStatusNotFoundError
      );
    });

    it('無効なステータス遷移の場合、エラーを発生させる', async () => {
      // Arrange
      const mockEstimateRequest = {
        id: 'er-001',
        status: 'REQUESTED',
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act & Assert
      await expect(
        service.transitionStatus('er-001', 'BEFORE_REQUEST', 'user-001')
      ).rejects.toThrow(InvalidEstimateRequestStatusTransitionError);
    });

    it('ステータス変更履歴を記録する（Requirements: 12.11）', async () => {
      // Arrange
      const estimateRequestId = 'er-001';
      const newStatus = 'REQUESTED' as const;
      const actorId = 'user-001';

      const mockEstimateRequest = {
        id: 'er-001',
        status: 'BEFORE_REQUEST',
        updatedAt: new Date('2026-01-23T00:00:00Z'),
        deletedAt: null,
      };

      const mockUpdatedRequest = {
        id: 'er-001',
        status: 'REQUESTED',
        updatedAt: new Date('2026-01-23T01:00:00Z'),
      };

      let historyCreated = false;
      vi.mocked(mockPrisma.$transaction).mockImplementation(async (fn) => {
        const txClient = {
          estimateRequest: {
            findUnique: vi.fn().mockResolvedValue(mockEstimateRequest),
            update: vi.fn().mockResolvedValue(mockUpdatedRequest),
          },
          estimateRequestStatusHistory: {
            create: vi.fn().mockImplementation((data) => {
              historyCreated = true;
              expect(data.data.fromStatus).toBe('BEFORE_REQUEST');
              expect(data.data.toStatus).toBe('REQUESTED');
              expect(data.data.changedById).toBe('user-001');
              return Promise.resolve({});
            }),
          },
        };
        return fn(txClient as unknown as PrismaClient);
      });

      // Act
      await service.transitionStatus(estimateRequestId, newStatus, actorId);

      // Assert
      expect(historyCreated).toBe(true);
    });
  });

  describe('getStatusHistory', () => {
    it('ステータス変更履歴を取得する（Requirements: 12.11）', async () => {
      // Arrange
      const estimateRequestId = 'er-001';
      const mockHistories = [
        {
          id: 'history-002',
          estimateRequestId: 'er-001',
          fromStatus: 'BEFORE_REQUEST',
          toStatus: 'REQUESTED',
          changedById: 'user-001',
          changedAt: new Date('2026-01-23T01:00:00Z'),
          changedBy: {
            id: 'user-001',
            displayName: 'テストユーザー',
          },
        },
        {
          id: 'history-001',
          estimateRequestId: 'er-001',
          fromStatus: null,
          toStatus: 'BEFORE_REQUEST',
          changedById: 'user-001',
          changedAt: new Date('2026-01-23T00:00:00Z'),
          changedBy: {
            id: 'user-001',
            displayName: 'テストユーザー',
          },
        },
      ];

      const mockEstimateRequest = {
        id: 'er-001',
        deletedAt: null,
      };

      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(
        mockEstimateRequest as never
      );
      vi.mocked(mockPrisma.estimateRequestStatusHistory.findMany).mockResolvedValue(
        mockHistories as never
      );

      // Act
      const result = await service.getStatusHistory(estimateRequestId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.toStatus).toBe('REQUESTED');
      expect(result[0]!.changedBy?.displayName).toBe('テストユーザー');
    });

    it('見積依頼が存在しない場合、エラーを発生させる', async () => {
      // Arrange
      vi.mocked(mockPrisma.estimateRequest.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getStatusHistory('er-nonexistent')).rejects.toThrow(
        EstimateRequestStatusNotFoundError
      );
    });
  });
});
