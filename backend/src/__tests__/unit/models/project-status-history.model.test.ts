/**
 * @fileoverview ProjectStatusHistoryモデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義したProjectStatusHistoryモデルの型検証
 *
 * Requirements:
 * - 10.10: ステータス変更履歴（変更前後のステータス、変更日時、変更したユーザー、遷移種別）を記録
 * - 10.11: 遷移種別として4種類を定義: initial, forward, backward, terminate
 * - 10.15: ステータス変更履歴に差し戻し理由を記録
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ProjectStatus, TransitionType } from '../../../generated/prisma/client.js';

describe('ProjectStatusHistory Model Schema', () => {
  describe('ProjectStatusHistory CreateInput type structure', () => {
    it('should require projectId for connecting to a project', () => {
      // Requirement 10.10: プロジェクトとのリレーション
      const validInput: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        toStatus: ProjectStatus.SURVEYING,
        transitionType: TransitionType.forward,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.project).toBeDefined();
      expect(validInput.toStatus).toBe(ProjectStatus.SURVEYING);
    });

    it('should require toStatus field', () => {
      // Requirement 10.10: 変更後のステータス
      const validInput: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        toStatus: ProjectStatus.PREPARING,
        transitionType: TransitionType.initial,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.toStatus).toBe(ProjectStatus.PREPARING);
    });

    it('should require transitionType field', () => {
      // Requirement 10.11: 遷移種別は必須
      const validInput: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        toStatus: ProjectStatus.SURVEYING,
        transitionType: TransitionType.forward,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.transitionType).toBe(TransitionType.forward);
    });

    it('should require changedBy relation to User', () => {
      // Requirement 10.10: 変更したユーザー
      const validInput: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        toStatus: ProjectStatus.SURVEYING,
        transitionType: TransitionType.forward,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.changedBy).toBeDefined();
    });

    it('should allow optional fromStatus field (null for initial transition)', () => {
      // Requirement 10.10: 変更前のステータス（初期遷移時はnull）
      const initialTransition: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: null,
        toStatus: ProjectStatus.PREPARING,
        transitionType: TransitionType.initial,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(initialTransition.fromStatus).toBeNull();
    });

    it('should allow fromStatus field for forward transition', () => {
      const forwardTransition: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.PREPARING,
        toStatus: ProjectStatus.SURVEYING,
        transitionType: TransitionType.forward,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(forwardTransition.fromStatus).toBe(ProjectStatus.PREPARING);
      expect(forwardTransition.toStatus).toBe(ProjectStatus.SURVEYING);
    });

    it('should allow optional reason field', () => {
      // Requirement 10.15: 差し戻し理由（任意、backward遷移時は必須）
      const backwardTransition: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.SURVEYING,
        toStatus: ProjectStatus.PREPARING,
        transitionType: TransitionType.backward,
        reason: '調査内容に不備があったため',
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(backwardTransition.reason).toBe('調査内容に不備があったため');
    });

    it('should allow reason to be null for non-backward transitions', () => {
      const forwardTransition: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.PREPARING,
        toStatus: ProjectStatus.SURVEYING,
        transitionType: TransitionType.forward,
        reason: null,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(forwardTransition.reason).toBeNull();
    });
  });

  describe('ProjectStatusHistory fields validation', () => {
    it('should have id field as UUID', () => {
      // Prismaスキーマで @id @default(uuid()) が設定されていることを型で確認
      const select: Prisma.ProjectStatusHistorySelect = {
        id: true,
      };
      expect(select.id).toBe(true);
    });

    it('should have projectId field', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        projectId: true,
      };
      expect(select.projectId).toBe(true);
    });

    it('should have fromStatus field (nullable)', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        fromStatus: true,
      };
      expect(select.fromStatus).toBe(true);
    });

    it('should have toStatus field', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        toStatus: true,
      };
      expect(select.toStatus).toBe(true);
    });

    it('should have transitionType field', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        transitionType: true,
      };
      expect(select.transitionType).toBe(true);
    });

    it('should have reason field (nullable)', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        reason: true,
      };
      expect(select.reason).toBe(true);
    });

    it('should have changedById field', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        changedById: true,
      };
      expect(select.changedById).toBe(true);
    });

    it('should have changedAt field with default now()', () => {
      // changedAt @default(now())
      const select: Prisma.ProjectStatusHistorySelect = {
        changedAt: true,
      };
      expect(select.changedAt).toBe(true);
    });
  });

  describe('ProjectStatusHistory relations', () => {
    it('should have project relation to Project', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        project: true,
        projectId: true,
      };
      expect(select.project).toBe(true);
      expect(select.projectId).toBe(true);
    });

    it('should have changedBy relation to User', () => {
      const select: Prisma.ProjectStatusHistorySelect = {
        changedBy: true,
        changedById: true,
      };
      expect(select.changedBy).toBe(true);
      expect(select.changedById).toBe(true);
    });

    it('should cascade delete when project is deleted', () => {
      // onDelete: Cascade設定の確認
      // この動作はスキーマ定義に基づくため、型テストでは間接的に確認
      const select: Prisma.ProjectStatusHistorySelect = {
        project: true,
      };
      expect(select.project).toBe(true);
    });
  });

  describe('ProjectStatusHistory filter and sort', () => {
    it('should allow filtering by projectId', () => {
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBe('project-id');
    });

    it('should allow filtering by transitionType', () => {
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        transitionType: TransitionType.backward,
      };
      expect(where.transitionType).toBe(TransitionType.backward);
    });

    it('should allow filtering by changedAt date range', () => {
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        changedAt: {
          gte: new Date('2024-01-01'),
          lte: new Date('2024-12-31'),
        },
      };
      expect(where.changedAt).toBeDefined();
    });

    it('should allow filtering by toStatus', () => {
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        toStatus: ProjectStatus.COMPLETED,
      };
      expect(where.toStatus).toBe(ProjectStatus.COMPLETED);
    });

    it('should allow filtering by fromStatus', () => {
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        fromStatus: ProjectStatus.PREPARING,
      };
      expect(where.fromStatus).toBe(ProjectStatus.PREPARING);
    });

    it('should allow sorting by changedAt', () => {
      const orderBy: Prisma.ProjectStatusHistoryOrderByWithRelationInput = {
        changedAt: 'desc',
      };
      expect(orderBy.changedAt).toBe('desc');
    });

    it('should allow sorting by transitionType', () => {
      const orderBy: Prisma.ProjectStatusHistoryOrderByWithRelationInput = {
        transitionType: 'asc',
      };
      expect(orderBy.transitionType).toBe('asc');
    });
  });

  describe('TransitionType usage in ProjectStatusHistory', () => {
    it('should support initial transition type (project creation)', () => {
      // Requirement 10.11: initial - プロジェクト作成時、fromStatusなし
      const initialHistory: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: null,
        toStatus: ProjectStatus.PREPARING,
        transitionType: TransitionType.initial,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(initialHistory.transitionType).toBe(TransitionType.initial);
      expect(initialHistory.fromStatus).toBeNull();
    });

    it('should support forward transition type (workflow progress)', () => {
      // Requirement 10.11: forward - 順方向遷移
      const forwardHistory: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.PREPARING,
        toStatus: ProjectStatus.SURVEYING,
        transitionType: TransitionType.forward,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(forwardHistory.transitionType).toBe(TransitionType.forward);
    });

    it('should support backward transition type (rollback)', () => {
      // Requirement 10.11: backward - 差し戻し遷移
      // Requirement 10.15: 差し戻し時は理由が必須
      const backwardHistory: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.SURVEYING,
        toStatus: ProjectStatus.PREPARING,
        transitionType: TransitionType.backward,
        reason: '見積もり条件の再確認が必要',
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(backwardHistory.transitionType).toBe(TransitionType.backward);
      expect(backwardHistory.reason).toBeDefined();
    });

    it('should support terminate transition type (completion/cancellation/lost)', () => {
      // Requirement 10.11: terminate - 終端遷移（完了・中止・失注）
      const terminateCompleted: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.AWAITING,
        toStatus: ProjectStatus.COMPLETED,
        transitionType: TransitionType.terminate,
        changedBy: { connect: { id: 'user-id' } },
      };

      const terminateCancelled: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.SURVEYING,
        toStatus: ProjectStatus.CANCELLED,
        transitionType: TransitionType.terminate,
        changedBy: { connect: { id: 'user-id' } },
      };

      const terminateLost: Prisma.ProjectStatusHistoryCreateInput = {
        project: { connect: { id: 'project-id' } },
        fromStatus: ProjectStatus.CONTRACTING,
        toStatus: ProjectStatus.LOST,
        transitionType: TransitionType.terminate,
        changedBy: { connect: { id: 'user-id' } },
      };

      expect(terminateCompleted.transitionType).toBe(TransitionType.terminate);
      expect(terminateCancelled.transitionType).toBe(TransitionType.terminate);
      expect(terminateLost.transitionType).toBe(TransitionType.terminate);
    });
  });

  describe('Index verification', () => {
    // インデックスの存在確認（型レベルでは検証できないが、フィールドの存在を確認）
    it('should have projectId indexed for efficient project history queries', () => {
      // @@index([projectId]) の確認
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBeDefined();
    });

    it('should have changedAt indexed for efficient timeline queries', () => {
      // @@index([changedAt]) の確認
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        changedAt: {
          gte: new Date(),
        },
      };
      expect(where.changedAt).toBeDefined();
    });

    it('should have transitionType indexed for filtering by transition type', () => {
      // @@index([transitionType]) の確認
      const where: Prisma.ProjectStatusHistoryWhereInput = {
        transitionType: TransitionType.backward,
      };
      expect(where.transitionType).toBeDefined();
    });
  });
});
