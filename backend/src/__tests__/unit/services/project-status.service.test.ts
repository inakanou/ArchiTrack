/**
 * @fileoverview ProjectStatusServiceのユニットテスト
 *
 * TDD方式: テストを先に書き、実装が通るまで繰り返す
 *
 * Requirements:
 * - 10.1: 12種類のプロジェクトステータス
 * - 10.3-10.7: ステータス遷移ルール（順方向・差し戻し・終端）
 * - 10.8: 許可されたステータス遷移の実行
 * - 10.9: 無効なステータス遷移の拒否
 * - 10.10, 10.11: ステータス変更履歴の記録（遷移種別含む）
 * - 10.14: 差し戻し遷移時の理由必須チェック
 * - 12.6: 監査ログ連携（PROJECT_STATUS_CHANGED）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { ProjectStatusService } from '../../../services/project-status.service.js';
import {
  InvalidStatusTransitionError,
  ReasonRequiredError,
  ProjectNotFoundError,
} from '../../../errors/projectError.js';
import type { ProjectStatus } from '../../../types/project.types.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

/**
 * Prismaモック生成
 * $transactionはコールバックに同じモックインスタンスを渡すことで、
 * テストで設定したモックが正しく動作するようにする
 */
const createMockPrisma = () => {
  const mock = {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectStatusHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  // $transactionは同じモックインスタンスをコールバックに渡す
  mock.$transaction.mockImplementation((callback: (tx: typeof mock) => Promise<unknown>) =>
    callback(mock)
  );
  return mock;
};

/**
 * 監査ログサービスモック
 */
const createMockAuditLogService = (): IAuditLogService => ({
  createLog: vi.fn().mockResolvedValue({
    id: 'log-id',
    action: 'PROJECT_STATUS_CHANGED',
    actorId: 'actor-id',
    targetType: 'Project',
    targetId: 'project-id',
    before: null,
    after: null,
    metadata: null,
    createdAt: new Date(),
  }),
  getLogs: vi.fn(),
  exportLogs: vi.fn(),
});

describe('ProjectStatusService', () => {
  let service: ProjectStatusService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLogService: IAuditLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockAuditLogService = createMockAuditLogService();
    service = new ProjectStatusService({
      prisma: mockPrisma as unknown as PrismaClient,
      auditLogService: mockAuditLogService,
    });
  });

  describe('getAllowedTransitions', () => {
    describe('順方向遷移（forward）', () => {
      it('準備中から調査中への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('PREPARING');
        expect(result).toContainEqual({
          status: 'SURVEYING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('調査中から見積中への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('SURVEYING');
        expect(result).toContainEqual({
          status: 'ESTIMATING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('見積中から決裁待ちへの順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('ESTIMATING');
        expect(result).toContainEqual({
          status: 'APPROVING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('決裁待ちから契約中への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('APPROVING');
        expect(result).toContainEqual({
          status: 'CONTRACTING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('契約中から工事中への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('CONTRACTING');
        expect(result).toContainEqual({
          status: 'CONSTRUCTING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('工事中から引渡中への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('CONSTRUCTING');
        expect(result).toContainEqual({
          status: 'DELIVERING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('引渡中から請求中への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('DELIVERING');
        expect(result).toContainEqual({
          status: 'BILLING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('請求中から入金待ちへの順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('BILLING');
        expect(result).toContainEqual({
          status: 'AWAITING',
          type: 'forward',
          requiresReason: false,
        });
      });

      it('入金待ちから完了への順方向遷移が許可されること', () => {
        const result = service.getAllowedTransitions('AWAITING');
        expect(result).toContainEqual({
          status: 'COMPLETED',
          type: 'forward',
          requiresReason: false,
        });
      });
    });

    describe('差し戻し遷移（backward）', () => {
      it('調査中から準備中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('SURVEYING');
        expect(result).toContainEqual({
          status: 'PREPARING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('見積中から調査中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('ESTIMATING');
        expect(result).toContainEqual({
          status: 'SURVEYING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('決裁待ちから見積中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('APPROVING');
        expect(result).toContainEqual({
          status: 'ESTIMATING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('契約中から決裁待ちへの差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('CONTRACTING');
        expect(result).toContainEqual({
          status: 'APPROVING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('工事中から契約中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('CONSTRUCTING');
        expect(result).toContainEqual({
          status: 'CONTRACTING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('引渡中から工事中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('DELIVERING');
        expect(result).toContainEqual({
          status: 'CONSTRUCTING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('請求中から引渡中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('BILLING');
        expect(result).toContainEqual({
          status: 'DELIVERING',
          type: 'backward',
          requiresReason: true,
        });
      });

      it('入金待ちから請求中への差し戻し遷移が許可されること', () => {
        const result = service.getAllowedTransitions('AWAITING');
        expect(result).toContainEqual({
          status: 'BILLING',
          type: 'backward',
          requiresReason: true,
        });
      });
    });

    describe('終端遷移（terminate）', () => {
      it('準備中から中止への終端遷移が許可されること', () => {
        const result = service.getAllowedTransitions('PREPARING');
        expect(result).toContainEqual({
          status: 'CANCELLED',
          type: 'terminate',
          requiresReason: false,
        });
      });

      it('調査中から中止への終端遷移が許可されること', () => {
        const result = service.getAllowedTransitions('SURVEYING');
        expect(result).toContainEqual({
          status: 'CANCELLED',
          type: 'terminate',
          requiresReason: false,
        });
      });

      it('見積中から中止への終端遷移が許可されること', () => {
        const result = service.getAllowedTransitions('ESTIMATING');
        expect(result).toContainEqual({
          status: 'CANCELLED',
          type: 'terminate',
          requiresReason: false,
        });
      });

      it('決裁待ちから失注への終端遷移が許可されること', () => {
        const result = service.getAllowedTransitions('APPROVING');
        expect(result).toContainEqual({
          status: 'LOST',
          type: 'terminate',
          requiresReason: false,
        });
      });

      it('契約中から失注への終端遷移が許可されること', () => {
        const result = service.getAllowedTransitions('CONTRACTING');
        expect(result).toContainEqual({
          status: 'LOST',
          type: 'terminate',
          requiresReason: false,
        });
      });
    });

    describe('終端ステータスからの遷移禁止', () => {
      it('完了からの遷移が空配列であること', () => {
        const result = service.getAllowedTransitions('COMPLETED');
        expect(result).toEqual([]);
      });

      it('中止からの遷移が空配列であること', () => {
        const result = service.getAllowedTransitions('CANCELLED');
        expect(result).toEqual([]);
      });

      it('失注からの遷移が空配列であること', () => {
        const result = service.getAllowedTransitions('LOST');
        expect(result).toEqual([]);
      });
    });
  });

  describe('getTransitionType', () => {
    it('順方向遷移の種別がforwardであること', () => {
      expect(service.getTransitionType('PREPARING', 'SURVEYING')).toBe('forward');
      expect(service.getTransitionType('SURVEYING', 'ESTIMATING')).toBe('forward');
      expect(service.getTransitionType('ESTIMATING', 'APPROVING')).toBe('forward');
      expect(service.getTransitionType('APPROVING', 'CONTRACTING')).toBe('forward');
      expect(service.getTransitionType('CONTRACTING', 'CONSTRUCTING')).toBe('forward');
      expect(service.getTransitionType('CONSTRUCTING', 'DELIVERING')).toBe('forward');
      expect(service.getTransitionType('DELIVERING', 'BILLING')).toBe('forward');
      expect(service.getTransitionType('BILLING', 'AWAITING')).toBe('forward');
      expect(service.getTransitionType('AWAITING', 'COMPLETED')).toBe('forward');
    });

    it('差し戻し遷移の種別がbackwardであること', () => {
      expect(service.getTransitionType('SURVEYING', 'PREPARING')).toBe('backward');
      expect(service.getTransitionType('ESTIMATING', 'SURVEYING')).toBe('backward');
      expect(service.getTransitionType('APPROVING', 'ESTIMATING')).toBe('backward');
      expect(service.getTransitionType('CONTRACTING', 'APPROVING')).toBe('backward');
      expect(service.getTransitionType('CONSTRUCTING', 'CONTRACTING')).toBe('backward');
      expect(service.getTransitionType('DELIVERING', 'CONSTRUCTING')).toBe('backward');
      expect(service.getTransitionType('BILLING', 'DELIVERING')).toBe('backward');
      expect(service.getTransitionType('AWAITING', 'BILLING')).toBe('backward');
    });

    it('終端遷移の種別がterminateであること', () => {
      expect(service.getTransitionType('PREPARING', 'CANCELLED')).toBe('terminate');
      expect(service.getTransitionType('SURVEYING', 'CANCELLED')).toBe('terminate');
      expect(service.getTransitionType('ESTIMATING', 'CANCELLED')).toBe('terminate');
      expect(service.getTransitionType('APPROVING', 'LOST')).toBe('terminate');
      expect(service.getTransitionType('CONTRACTING', 'LOST')).toBe('terminate');
    });

    it('無効な遷移の場合nullを返すこと', () => {
      expect(service.getTransitionType('PREPARING', 'COMPLETED')).toBeNull();
      expect(service.getTransitionType('COMPLETED', 'PREPARING')).toBeNull();
      expect(service.getTransitionType('CANCELLED', 'PREPARING')).toBeNull();
      expect(service.getTransitionType('LOST', 'PREPARING')).toBeNull();
    });
  });

  describe('transitionStatus', () => {
    const mockProject = {
      id: 'project-123',
      name: 'Test Project',
      status: 'PREPARING' as ProjectStatus,
      updatedAt: new Date('2025-12-01'),
    };

    beforeEach(() => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        status: 'SURVEYING',
        updatedAt: new Date(),
      });
      mockPrisma.projectStatusHistory.create.mockResolvedValue({
        id: 'history-123',
        projectId: 'project-123',
        fromStatus: 'PREPARING',
        toStatus: 'SURVEYING',
        transitionType: 'forward',
        reason: null,
        changedById: 'actor-123',
        changedAt: new Date(),
      });
    });

    describe('正常な遷移', () => {
      it('順方向遷移が成功すること', async () => {
        const result = await service.transitionStatus('project-123', 'SURVEYING', 'actor-123');

        expect(result.status).toBe('SURVEYING');
        expect(mockPrisma.project.update).toHaveBeenCalled();
        expect(mockPrisma.projectStatusHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              projectId: 'project-123',
              fromStatus: 'PREPARING',
              toStatus: 'SURVEYING',
              transitionType: 'forward',
              reason: null,
              changedById: 'actor-123',
            }),
          })
        );
      });

      it('差し戻し遷移が理由付きで成功すること', async () => {
        mockPrisma.project.findUnique.mockResolvedValue({
          ...mockProject,
          status: 'SURVEYING',
        });
        mockPrisma.project.update.mockResolvedValue({
          ...mockProject,
          status: 'PREPARING',
          updatedAt: new Date(),
        });

        const result = await service.transitionStatus(
          'project-123',
          'PREPARING',
          'actor-123',
          '調査内容に不備があったため'
        );

        expect(result.status).toBe('PREPARING');
        expect(mockPrisma.projectStatusHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transitionType: 'backward',
              reason: '調査内容に不備があったため',
            }),
          })
        );
      });

      it('終端遷移（中止）が成功すること', async () => {
        mockPrisma.project.update.mockResolvedValue({
          ...mockProject,
          status: 'CANCELLED',
          updatedAt: new Date(),
        });

        const result = await service.transitionStatus('project-123', 'CANCELLED', 'actor-123');

        expect(result.status).toBe('CANCELLED');
        expect(mockPrisma.projectStatusHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transitionType: 'terminate',
            }),
          })
        );
      });

      it('監査ログが記録されること', async () => {
        await service.transitionStatus('project-123', 'SURVEYING', 'actor-123');

        expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'PROJECT_STATUS_CHANGED',
            actorId: 'actor-123',
            targetType: 'Project',
            targetId: 'project-123',
            before: expect.objectContaining({ status: 'PREPARING' }),
            after: expect.objectContaining({ status: 'SURVEYING' }),
            metadata: expect.objectContaining({
              transitionType: 'forward',
            }),
          })
        );
      });
    });

    describe('エラーケース', () => {
      it('プロジェクトが存在しない場合エラーになること', async () => {
        mockPrisma.project.findUnique.mockResolvedValue(null);

        await expect(
          service.transitionStatus('non-existent', 'SURVEYING', 'actor-123')
        ).rejects.toThrow(ProjectNotFoundError);
      });

      it('無効なステータス遷移の場合エラーになること', async () => {
        await expect(
          service.transitionStatus('project-123', 'COMPLETED', 'actor-123')
        ).rejects.toThrow(InvalidStatusTransitionError);
      });

      it('差し戻し遷移で理由がない場合エラーになること', async () => {
        mockPrisma.project.findUnique.mockResolvedValue({
          ...mockProject,
          status: 'SURVEYING',
        });

        await expect(
          service.transitionStatus('project-123', 'PREPARING', 'actor-123')
        ).rejects.toThrow(ReasonRequiredError);
      });

      it('差し戻し遷移で理由が空文字の場合エラーになること', async () => {
        mockPrisma.project.findUnique.mockResolvedValue({
          ...mockProject,
          status: 'SURVEYING',
        });

        await expect(
          service.transitionStatus('project-123', 'PREPARING', 'actor-123', '')
        ).rejects.toThrow(ReasonRequiredError);
      });

      it('差し戻し遷移で理由が空白のみの場合エラーになること', async () => {
        mockPrisma.project.findUnique.mockResolvedValue({
          ...mockProject,
          status: 'SURVEYING',
        });

        await expect(
          service.transitionStatus('project-123', 'PREPARING', 'actor-123', '   ')
        ).rejects.toThrow(ReasonRequiredError);
      });

      it('終端ステータスからの遷移はエラーになること', async () => {
        mockPrisma.project.findUnique.mockResolvedValue({
          ...mockProject,
          status: 'COMPLETED',
        });

        await expect(
          service.transitionStatus('project-123', 'PREPARING', 'actor-123')
        ).rejects.toThrow(InvalidStatusTransitionError);
      });
    });
  });

  describe('getStatusHistory', () => {
    const mockHistory = [
      {
        id: 'history-2',
        projectId: 'project-123',
        fromStatus: 'PREPARING',
        toStatus: 'SURVEYING',
        transitionType: 'forward',
        reason: null,
        changedById: 'actor-123',
        changedAt: new Date('2025-12-02'),
        changedBy: { id: 'actor-123', displayName: 'テストユーザー' },
      },
      {
        id: 'history-1',
        projectId: 'project-123',
        fromStatus: null,
        toStatus: 'PREPARING',
        transitionType: 'initial',
        reason: null,
        changedById: 'actor-123',
        changedAt: new Date('2025-12-01'),
        changedBy: { id: 'actor-123', displayName: 'テストユーザー' },
      },
    ];

    beforeEach(() => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-123' });
      mockPrisma.projectStatusHistory.findMany.mockResolvedValue(mockHistory);
    });

    it('プロジェクトのステータス変更履歴を取得できること', async () => {
      const result = await service.getStatusHistory('project-123');

      expect(result).toHaveLength(2);
      expect(result[0]?.toStatus).toBe('SURVEYING');
      expect(result[0]?.transitionType).toBe('forward');
      expect(result[1]?.fromStatus).toBeNull();
      expect(result[1]?.transitionType).toBe('initial');
    });

    it('履歴が変更日時の降順でソートされていること', async () => {
      const result = await service.getStatusHistory('project-123');

      expect(result[0]).toBeDefined();
      expect(result[1]).toBeDefined();
      expect(new Date(result[0]!.changedAt) > new Date(result[1]!.changedAt)).toBe(true);
    });

    it('プロジェクトが存在しない場合エラーになること', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.getStatusHistory('non-existent')).rejects.toThrow(ProjectNotFoundError);
    });

    it('差し戻し理由が含まれていること', async () => {
      mockPrisma.projectStatusHistory.findMany.mockResolvedValue([
        {
          id: 'history-3',
          projectId: 'project-123',
          fromStatus: 'SURVEYING',
          toStatus: 'PREPARING',
          transitionType: 'backward',
          reason: '調査内容に不備があったため',
          changedById: 'actor-123',
          changedAt: new Date('2025-12-03'),
          changedBy: { id: 'actor-123', displayName: 'テストユーザー' },
        },
      ]);

      const result = await service.getStatusHistory('project-123');

      expect(result[0]?.reason).toBe('調査内容に不備があったため');
      expect(result[0]?.transitionType).toBe('backward');
    });
  });
});
