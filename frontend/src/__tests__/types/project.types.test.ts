/**
 * @fileoverview プロジェクト管理機能 型定義のユニットテスト
 *
 * TDD: RED Phase - テストを先に作成
 *
 * Requirements:
 * - 10.1: プロジェクトステータスとして12種類を提供
 * - 10.11: 遷移種別として4種類を定義（initial, forward, backward, terminate）
 */

import { describe, it, expect } from 'vitest';
import {
  PROJECT_STATUSES,
  TRANSITION_TYPES,
  PROJECT_STATUS_LABELS,
  TRANSITION_TYPE_LABELS,
  isProjectStatus,
  isTransitionType,
  getProjectStatusLabel,
  getTransitionTypeLabel,
  type ProjectStatus,
  type TransitionType,
  type UserSummary,
  type ProjectInfo,
  type ProjectDetail,
  type PaginatedProjects,
  type PaginationInfo,
  type StatusHistoryResponse,
  type AllowedTransition,
  type AssignableUser,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectFilter,
  type StatusChangeInput,
} from '../../types/project.types';

describe('Project Types', () => {
  describe('PROJECT_STATUSES', () => {
    it('should have exactly 12 statuses', () => {
      expect(PROJECT_STATUSES).toHaveLength(12);
    });

    it('should contain all required statuses in workflow order', () => {
      const expectedStatuses = [
        'PREPARING', // 準備中
        'SURVEYING', // 調査中
        'ESTIMATING', // 見積中
        'APPROVING', // 決裁待ち
        'CONTRACTING', // 契約中
        'CONSTRUCTING', // 工事中
        'DELIVERING', // 引渡中
        'BILLING', // 請求中
        'AWAITING', // 入金待ち
        'COMPLETED', // 完了
        'CANCELLED', // 中止
        'LOST', // 失注
      ];
      expect(PROJECT_STATUSES).toEqual(expectedStatuses);
    });

    it('should be readonly', () => {
      // TypeScript compile-time check, but we verify it's an array
      expect(Array.isArray(PROJECT_STATUSES)).toBe(true);
    });
  });

  describe('TRANSITION_TYPES', () => {
    it('should have exactly 4 transition types', () => {
      expect(TRANSITION_TYPES).toHaveLength(4);
    });

    it('should contain all required transition types', () => {
      const expectedTypes = ['initial', 'forward', 'backward', 'terminate'];
      expect(TRANSITION_TYPES).toEqual(expectedTypes);
    });
  });

  describe('PROJECT_STATUS_LABELS', () => {
    it('should have labels for all 12 statuses', () => {
      expect(Object.keys(PROJECT_STATUS_LABELS)).toHaveLength(12);
    });

    it('should have correct Japanese labels', () => {
      expect(PROJECT_STATUS_LABELS.PREPARING).toBe('準備中');
      expect(PROJECT_STATUS_LABELS.SURVEYING).toBe('調査中');
      expect(PROJECT_STATUS_LABELS.ESTIMATING).toBe('見積中');
      expect(PROJECT_STATUS_LABELS.APPROVING).toBe('決裁待ち');
      expect(PROJECT_STATUS_LABELS.CONTRACTING).toBe('契約中');
      expect(PROJECT_STATUS_LABELS.CONSTRUCTING).toBe('工事中');
      expect(PROJECT_STATUS_LABELS.DELIVERING).toBe('引渡中');
      expect(PROJECT_STATUS_LABELS.BILLING).toBe('請求中');
      expect(PROJECT_STATUS_LABELS.AWAITING).toBe('入金待ち');
      expect(PROJECT_STATUS_LABELS.COMPLETED).toBe('完了');
      expect(PROJECT_STATUS_LABELS.CANCELLED).toBe('中止');
      expect(PROJECT_STATUS_LABELS.LOST).toBe('失注');
    });
  });

  describe('TRANSITION_TYPE_LABELS', () => {
    it('should have labels for all 4 transition types', () => {
      expect(Object.keys(TRANSITION_TYPE_LABELS)).toHaveLength(4);
    });

    it('should have correct Japanese labels', () => {
      expect(TRANSITION_TYPE_LABELS.initial).toBe('初期遷移');
      expect(TRANSITION_TYPE_LABELS.forward).toBe('順方向遷移');
      expect(TRANSITION_TYPE_LABELS.backward).toBe('差し戻し遷移');
      expect(TRANSITION_TYPE_LABELS.terminate).toBe('終端遷移');
    });
  });

  describe('isProjectStatus', () => {
    it('should return true for valid project statuses', () => {
      PROJECT_STATUSES.forEach((status) => {
        expect(isProjectStatus(status)).toBe(true);
      });
    });

    it('should return false for invalid values', () => {
      expect(isProjectStatus('INVALID')).toBe(false);
      expect(isProjectStatus('')).toBe(false);
      expect(isProjectStatus(null)).toBe(false);
      expect(isProjectStatus(undefined)).toBe(false);
      expect(isProjectStatus(123)).toBe(false);
      expect(isProjectStatus({})).toBe(false);
    });

    it('should return false for similar but incorrect strings', () => {
      expect(isProjectStatus('preparing')).toBe(false); // lowercase
      expect(isProjectStatus('Preparing')).toBe(false); // mixed case
      expect(isProjectStatus('PREPARE')).toBe(false); // typo
    });
  });

  describe('isTransitionType', () => {
    it('should return true for valid transition types', () => {
      TRANSITION_TYPES.forEach((type) => {
        expect(isTransitionType(type)).toBe(true);
      });
    });

    it('should return false for invalid values', () => {
      expect(isTransitionType('INVALID')).toBe(false);
      expect(isTransitionType('')).toBe(false);
      expect(isTransitionType(null)).toBe(false);
      expect(isTransitionType(undefined)).toBe(false);
      expect(isTransitionType(123)).toBe(false);
      expect(isTransitionType({})).toBe(false);
    });

    it('should return false for similar but incorrect strings', () => {
      expect(isTransitionType('FORWARD')).toBe(false); // uppercase
      expect(isTransitionType('Forward')).toBe(false); // mixed case
      expect(isTransitionType('forwards')).toBe(false); // typo
    });
  });

  describe('getProjectStatusLabel', () => {
    it('should return correct Japanese label for valid status', () => {
      expect(getProjectStatusLabel('PREPARING')).toBe('準備中');
      expect(getProjectStatusLabel('COMPLETED')).toBe('完了');
      expect(getProjectStatusLabel('LOST')).toBe('失注');
    });

    it('should return undefined for invalid status', () => {
      expect(getProjectStatusLabel('INVALID' as ProjectStatus)).toBeUndefined();
    });
  });

  describe('getTransitionTypeLabel', () => {
    it('should return correct Japanese label for valid transition type', () => {
      expect(getTransitionTypeLabel('initial')).toBe('初期遷移');
      expect(getTransitionTypeLabel('forward')).toBe('順方向遷移');
      expect(getTransitionTypeLabel('backward')).toBe('差し戻し遷移');
      expect(getTransitionTypeLabel('terminate')).toBe('終端遷移');
    });

    it('should return undefined for invalid transition type', () => {
      expect(getTransitionTypeLabel('INVALID' as TransitionType)).toBeUndefined();
    });
  });

  describe('Type definitions', () => {
    describe('UserSummary', () => {
      it('should have correct structure', () => {
        const user: UserSummary = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          displayName: 'テストユーザー',
        };
        expect(user.id).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(user.displayName).toBe('テストユーザー');
      });
    });

    describe('ProjectInfo', () => {
      it('should have correct structure for list view', () => {
        const project: ProjectInfo = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テストプロジェクト',
          customerName: 'テスト株式会社',
          salesPerson: {
            id: '123e4567-e89b-12d3-a456-426614174002',
            displayName: '営業太郎',
          },
          status: 'PREPARING',
          statusLabel: '準備中',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        };
        expect(project.id).toBeDefined();
        expect(project.name).toBeDefined();
        expect(project.customerName).toBeDefined();
        expect(project.salesPerson).toBeDefined();
        expect(project.status).toBeDefined();
        expect(project.statusLabel).toBeDefined();
        expect(project.createdAt).toBeDefined();
        expect(project.updatedAt).toBeDefined();
      });

      it('should allow optional constructionPerson', () => {
        const projectWithConstructionPerson: ProjectInfo = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テストプロジェクト',
          customerName: 'テスト株式会社',
          salesPerson: {
            id: '123e4567-e89b-12d3-a456-426614174002',
            displayName: '営業太郎',
          },
          constructionPerson: {
            id: '123e4567-e89b-12d3-a456-426614174003',
            displayName: '工事次郎',
          },
          status: 'PREPARING',
          statusLabel: '準備中',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        };
        expect(projectWithConstructionPerson.constructionPerson).toBeDefined();
      });
    });

    describe('ProjectDetail', () => {
      it('should extend ProjectInfo with additional fields', () => {
        const projectDetail: ProjectDetail = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テストプロジェクト',
          customerName: 'テスト株式会社',
          salesPerson: {
            id: '123e4567-e89b-12d3-a456-426614174002',
            displayName: '営業太郎',
          },
          status: 'PREPARING',
          statusLabel: '準備中',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
          siteAddress: '東京都千代田区丸の内1-1-1',
          description: 'プロジェクトの詳細説明',
        };
        expect(projectDetail.siteAddress).toBe('東京都千代田区丸の内1-1-1');
        expect(projectDetail.description).toBe('プロジェクトの詳細説明');
      });

      it('should allow optional siteAddress and description', () => {
        const projectDetailMinimal: ProjectDetail = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'テストプロジェクト',
          customerName: 'テスト株式会社',
          salesPerson: {
            id: '123e4567-e89b-12d3-a456-426614174002',
            displayName: '営業太郎',
          },
          status: 'PREPARING',
          statusLabel: '準備中',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
        };
        expect(projectDetailMinimal.siteAddress).toBeUndefined();
        expect(projectDetailMinimal.description).toBeUndefined();
      });
    });

    describe('PaginatedProjects', () => {
      it('should have correct structure', () => {
        const paginated: PaginatedProjects = {
          data: [],
          pagination: {
            page: 1,
            limit: 20,
            total: 100,
            totalPages: 5,
          },
        };
        expect(paginated.data).toEqual([]);
        expect(paginated.pagination.page).toBe(1);
        expect(paginated.pagination.limit).toBe(20);
        expect(paginated.pagination.total).toBe(100);
        expect(paginated.pagination.totalPages).toBe(5);
      });
    });

    describe('PaginationInfo', () => {
      it('should have required fields', () => {
        const pagination: PaginationInfo = {
          page: 2,
          limit: 10,
          total: 50,
          totalPages: 5,
        };
        expect(pagination.page).toBe(2);
        expect(pagination.limit).toBe(10);
        expect(pagination.total).toBe(50);
        expect(pagination.totalPages).toBe(5);
      });
    });

    describe('StatusHistoryResponse', () => {
      it('should have correct structure', () => {
        const history: StatusHistoryResponse = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          fromStatus: 'PREPARING',
          fromStatusLabel: '準備中',
          toStatus: 'SURVEYING',
          toStatusLabel: '調査中',
          transitionType: 'forward',
          transitionTypeLabel: '順方向遷移',
          reason: null,
          changedBy: {
            id: '123e4567-e89b-12d3-a456-426614174001',
            displayName: 'テストユーザー',
          },
          changedAt: '2025-01-01T00:00:00Z',
        };
        expect(history.id).toBeDefined();
        expect(history.fromStatus).toBe('PREPARING');
        expect(history.toStatus).toBe('SURVEYING');
        expect(history.transitionType).toBe('forward');
        expect(history.reason).toBeNull();
        expect(history.changedBy).toBeDefined();
        expect(history.changedAt).toBeDefined();
      });

      it('should allow null fromStatus for initial transition', () => {
        const history: StatusHistoryResponse = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          fromStatus: null,
          fromStatusLabel: null,
          toStatus: 'PREPARING',
          toStatusLabel: '準備中',
          transitionType: 'initial',
          transitionTypeLabel: '初期遷移',
          reason: null,
          changedBy: {
            id: '123e4567-e89b-12d3-a456-426614174001',
            displayName: 'テストユーザー',
          },
          changedAt: '2025-01-01T00:00:00Z',
        };
        expect(history.fromStatus).toBeNull();
        expect(history.fromStatusLabel).toBeNull();
        expect(history.transitionType).toBe('initial');
      });

      it('should allow reason for backward transition', () => {
        const history: StatusHistoryResponse = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          fromStatus: 'SURVEYING',
          fromStatusLabel: '調査中',
          toStatus: 'PREPARING',
          toStatusLabel: '準備中',
          transitionType: 'backward',
          transitionTypeLabel: '差し戻し遷移',
          reason: '追加調査が必要なため',
          changedBy: {
            id: '123e4567-e89b-12d3-a456-426614174001',
            displayName: 'テストユーザー',
          },
          changedAt: '2025-01-01T00:00:00Z',
        };
        expect(history.reason).toBe('追加調査が必要なため');
        expect(history.transitionType).toBe('backward');
      });
    });

    describe('AllowedTransition', () => {
      it('should have correct structure', () => {
        const transition: AllowedTransition = {
          status: 'SURVEYING',
          type: 'forward',
          requiresReason: false,
        };
        expect(transition.status).toBe('SURVEYING');
        expect(transition.type).toBe('forward');
        expect(transition.requiresReason).toBe(false);
      });

      it('should indicate reason required for backward transition', () => {
        const transition: AllowedTransition = {
          status: 'PREPARING',
          type: 'backward',
          requiresReason: true,
        };
        expect(transition.type).toBe('backward');
        expect(transition.requiresReason).toBe(true);
      });
    });

    describe('AssignableUser', () => {
      it('should have correct structure', () => {
        const user: AssignableUser = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          displayName: '担当者太郎',
        };
        expect(user.id).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(user.displayName).toBe('担当者太郎');
      });
    });

    describe('CreateProjectInput', () => {
      it('should have required fields', () => {
        const input: CreateProjectInput = {
          name: '新規プロジェクト',
          customerName: '株式会社テスト',
          salesPersonId: '123e4567-e89b-12d3-a456-426614174000',
        };
        expect(input.name).toBe('新規プロジェクト');
        expect(input.customerName).toBe('株式会社テスト');
        expect(input.salesPersonId).toBe('123e4567-e89b-12d3-a456-426614174000');
      });

      it('should allow optional fields', () => {
        const input: CreateProjectInput = {
          name: '新規プロジェクト',
          customerName: '株式会社テスト',
          salesPersonId: '123e4567-e89b-12d3-a456-426614174000',
          constructionPersonId: '123e4567-e89b-12d3-a456-426614174001',
          siteAddress: '東京都渋谷区1-1-1',
          description: 'プロジェクト概要',
        };
        expect(input.constructionPersonId).toBe('123e4567-e89b-12d3-a456-426614174001');
        expect(input.siteAddress).toBe('東京都渋谷区1-1-1');
        expect(input.description).toBe('プロジェクト概要');
      });
    });

    describe('UpdateProjectInput', () => {
      it('should allow partial updates', () => {
        const input: UpdateProjectInput = {
          name: '更新されたプロジェクト名',
        };
        expect(input.name).toBe('更新されたプロジェクト名');
        expect(input.customerName).toBeUndefined();
      });

      it('should allow all fields to be updated', () => {
        const input: UpdateProjectInput = {
          name: '更新プロジェクト',
          customerName: '株式会社更新',
          salesPersonId: '123e4567-e89b-12d3-a456-426614174000',
          constructionPersonId: '123e4567-e89b-12d3-a456-426614174001',
          siteAddress: '大阪府大阪市1-1-1',
          description: '更新された概要',
        };
        expect(input.name).toBeDefined();
        expect(input.customerName).toBeDefined();
        expect(input.salesPersonId).toBeDefined();
        expect(input.constructionPersonId).toBeDefined();
        expect(input.siteAddress).toBeDefined();
        expect(input.description).toBeDefined();
      });
    });

    describe('ProjectFilter', () => {
      it('should allow empty filter', () => {
        const filter: ProjectFilter = {};
        expect(Object.keys(filter)).toHaveLength(0);
      });

      it('should allow search filter', () => {
        const filter: ProjectFilter = {
          search: 'テスト',
        };
        expect(filter.search).toBe('テスト');
      });

      it('should allow status filter with multiple values', () => {
        const filter: ProjectFilter = {
          status: ['PREPARING', 'SURVEYING'],
        };
        expect(filter.status).toEqual(['PREPARING', 'SURVEYING']);
      });

      it('should allow date range filter', () => {
        const filter: ProjectFilter = {
          createdFrom: '2025-01-01',
          createdTo: '2025-12-31',
        };
        expect(filter.createdFrom).toBe('2025-01-01');
        expect(filter.createdTo).toBe('2025-12-31');
      });

      it('should allow combined filters', () => {
        const filter: ProjectFilter = {
          search: 'テスト',
          status: ['PREPARING'],
          createdFrom: '2025-01-01',
          createdTo: '2025-12-31',
        };
        expect(filter.search).toBe('テスト');
        expect(filter.status).toEqual(['PREPARING']);
        expect(filter.createdFrom).toBe('2025-01-01');
        expect(filter.createdTo).toBe('2025-12-31');
      });
    });

    describe('StatusChangeInput', () => {
      it('should have status field', () => {
        const input: StatusChangeInput = {
          status: 'SURVEYING',
        };
        expect(input.status).toBe('SURVEYING');
        expect(input.reason).toBeUndefined();
      });

      it('should allow reason for backward transition', () => {
        const input: StatusChangeInput = {
          status: 'PREPARING',
          reason: '追加調査が必要',
        };
        expect(input.status).toBe('PREPARING');
        expect(input.reason).toBe('追加調査が必要');
      });
    });
  });
});
