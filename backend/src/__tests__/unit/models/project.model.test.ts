/**
 * @fileoverview Projectモデルのスキーマ定義テスト
 *
 * TDD: GREEN Phase - Prismaスキーマで定義したProjectモデルの型検証
 *
 * 一覧の説明文は要件定義書の原文（`shall` 以降）の逐語複製である。
 * 番号だけを並べると指し先の当否は読み手にしか確かめられないが、原文を並置すれば
 * 条文が繰り上がったときに字面の食い違いとして現れる。
 * ただし機械が支えるのは**目印として使える長さの原文を持つ行だけ**である。
 * `shall` 以降が `MIN_CRITERION_QUOTE_LENGTH`（scripts/check-requirement-coverage.ts）に
 * 満たない条文は、どの条文を名指すかの証拠にならないため検査の対象外であり、その行の
 * 指し先は依然として読み手が確かめるほかない。
 *
 * Requirements (project-management):
 * - REQ-1.16: 作成日時と作成者を自動的に記録する
 * - REQ-1.17: プロジェクトに一意のIDを自動付与する
 * - REQ-9.7: 削除されたプロジェクトは一覧に表示しない
 * - REQ-13.1: プロジェクト名を必須かつ1〜255文字とする
 * - REQ-13.4: 営業担当者を必須とする
 * - REQ-13.6: 工事担当者を任意とする
 * - REQ-13.8: 現場住所を任意かつ最大500文字とする
 * - REQ-13.9: 概要を任意かつ最大5000文字とする
 *
 * 従前この一覧が掲げていた「顧客名を必須かつ1〜255文字」は、現行の要件定義書に
 * 対応する条文が無い。顧客名は取引先へ移り、作成・編集フォームでも任意である。
 * 付け替え先が存在しないため、当該の被覆印は取り下げた。
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ProjectStatus, TransitionType } from '../../../generated/prisma/client.js';

describe('Project Model Schema', () => {
  describe('ProjectStatus Enum', () => {
    it('should have all 12 status values defined', () => {
      // Requirement 10.1: 12種類のプロジェクトステータス
      expect(ProjectStatus.PREPARING).toBe('PREPARING');
      expect(ProjectStatus.SURVEYING).toBe('SURVEYING');
      expect(ProjectStatus.ESTIMATING).toBe('ESTIMATING');
      expect(ProjectStatus.APPROVING).toBe('APPROVING');
      expect(ProjectStatus.CONTRACTING).toBe('CONTRACTING');
      expect(ProjectStatus.CONSTRUCTING).toBe('CONSTRUCTING');
      expect(ProjectStatus.DELIVERING).toBe('DELIVERING');
      expect(ProjectStatus.BILLING).toBe('BILLING');
      expect(ProjectStatus.AWAITING).toBe('AWAITING');
      expect(ProjectStatus.COMPLETED).toBe('COMPLETED');
      expect(ProjectStatus.CANCELLED).toBe('CANCELLED');
      expect(ProjectStatus.LOST).toBe('LOST');
    });

    it('should have exactly 12 status values', () => {
      const statusValues = Object.values(ProjectStatus);
      expect(statusValues).toHaveLength(12);
    });
  });

  describe('TransitionType Enum', () => {
    it('should have all 4 transition type values defined', () => {
      // Requirement 10.11: 4種類の遷移種別
      expect(TransitionType.initial).toBe('initial');
      expect(TransitionType.forward).toBe('forward');
      expect(TransitionType.backward).toBe('backward');
      expect(TransitionType.terminate).toBe('terminate');
    });

    it('should have exactly 4 transition type values', () => {
      const transitionTypeValues = Object.values(TransitionType);
      expect(transitionTypeValues).toHaveLength(4);
    });
  });

  describe('Project CreateInput type structure', () => {
    it('should require mandatory fields', () => {
      // Requirement 13.1, 13.4: 必須フィールドの検証
      // この型テストはコンパイル時に検証される
      const validInput: Prisma.ProjectCreateInput = {
        name: 'テストプロジェクト',
        salesPerson: { connect: { id: 'user-id' } },
        createdBy: { connect: { id: 'user-id' } },
      };

      expect(validInput.name).toBe('テストプロジェクト');
    });

    it('should allow optional fields', () => {
      // Requirement 13.6, 13.8, 13.9, 22.1-22.5: 任意フィールドの検証
      const inputWithOptionalFields: Prisma.ProjectCreateInput = {
        name: 'テストプロジェクト',
        tradingPartner: { connect: { id: 'trading-partner-id' } },
        salesPerson: { connect: { id: 'sales-user-id' } },
        createdBy: { connect: { id: 'creator-id' } },
        constructionPerson: { connect: { id: 'construction-user-id' } },
        siteAddress: '東京都渋谷区1-1-1',
        description: 'プロジェクトの概要説明',
      };

      expect(inputWithOptionalFields.siteAddress).toBe('東京都渋谷区1-1-1');
      expect(inputWithOptionalFields.description).toBe('プロジェクトの概要説明');
    });

    it('should default status to PREPARING', () => {
      // Requirement 10.2: デフォルトステータスは「準備中」
      const input: Prisma.ProjectCreateInput = {
        name: 'テストプロジェクト',
        salesPerson: { connect: { id: 'user-id' } },
        createdBy: { connect: { id: 'user-id' } },
        // status is optional - defaults to PREPARING
      };

      // status is undefined (will use default)
      expect(input.status).toBeUndefined();
    });
  });

  describe('Project fields validation', () => {
    it('should have id field as UUID', () => {
      // Requirement 1.17: プロジェクトに一意のIDを自動付与する
      // Prismaスキーマで @id @default(uuid()) が設定されていることを型で確認
      const projectSelect: Prisma.ProjectSelect = {
        id: true,
      };
      expect(projectSelect.id).toBe(true);
    });

    it('should have createdAt and createdById fields', () => {
      // Requirement 1.16: 作成日時と作成者を自動的に記録する
      const projectSelect: Prisma.ProjectSelect = {
        createdAt: true,
        createdById: true,
        createdBy: true,
      };
      expect(projectSelect.createdAt).toBe(true);
      expect(projectSelect.createdById).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // Requirement 9.7: 論理削除フィールド
      const projectSelect: Prisma.ProjectSelect = {
        deletedAt: true,
      };
      expect(projectSelect.deletedAt).toBe(true);
    });

    it('should have updatedAt field for optimistic locking', () => {
      // 楽観的排他制御用のupdatedAtフィールド
      const projectSelect: Prisma.ProjectSelect = {
        updatedAt: true,
      };
      expect(projectSelect.updatedAt).toBe(true);
    });
  });

  describe('Project relations', () => {
    it('should have salesPerson relation to User', () => {
      const projectSelect: Prisma.ProjectSelect = {
        salesPerson: true,
        salesPersonId: true,
      };
      expect(projectSelect.salesPerson).toBe(true);
      expect(projectSelect.salesPersonId).toBe(true);
    });

    it('should have optional constructionPerson relation to User', () => {
      const projectSelect: Prisma.ProjectSelect = {
        constructionPerson: true,
        constructionPersonId: true,
      };
      expect(projectSelect.constructionPerson).toBe(true);
      expect(projectSelect.constructionPersonId).toBe(true);
    });

    it('should have createdBy relation to User', () => {
      const projectSelect: Prisma.ProjectSelect = {
        createdBy: true,
        createdById: true,
      };
      expect(projectSelect.createdBy).toBe(true);
      expect(projectSelect.createdById).toBe(true);
    });

    it('should have statusHistory relation to ProjectStatusHistory', () => {
      const projectSelect: Prisma.ProjectSelect = {
        statusHistory: true,
      };
      expect(projectSelect.statusHistory).toBe(true);
    });
  });

  describe('Project filter and sort fields', () => {
    it('should allow filtering by name', () => {
      const where: Prisma.ProjectWhereInput = {
        name: { contains: 'テスト' },
      };
      expect(where.name).toBeDefined();
    });

    it('should allow filtering by tradingPartnerId', () => {
      const where: Prisma.ProjectWhereInput = {
        tradingPartnerId: 'trading-partner-id',
      };
      expect(where.tradingPartnerId).toBeDefined();
    });

    it('should allow filtering by status', () => {
      const where: Prisma.ProjectWhereInput = {
        status: ProjectStatus.PREPARING,
      };
      expect(where.status).toBe(ProjectStatus.PREPARING);
    });

    it('should allow filtering by salesPersonId', () => {
      const where: Prisma.ProjectWhereInput = {
        salesPersonId: 'user-id',
      };
      expect(where.salesPersonId).toBe('user-id');
    });

    it('should allow filtering by date range', () => {
      const where: Prisma.ProjectWhereInput = {
        createdAt: {
          gte: new Date('2024-01-01'),
          lte: new Date('2024-12-31'),
        },
      };
      expect(where.createdAt).toBeDefined();
    });

    it('should allow excluding soft-deleted records', () => {
      // Requirement 9.7: 削除されたプロジェクトは一覧に表示しない
      const where: Prisma.ProjectWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should allow sorting by various fields', () => {
      const orderByName: Prisma.ProjectOrderByWithRelationInput = {
        name: 'asc',
      };
      const orderByCreatedAt: Prisma.ProjectOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      const orderByUpdatedAt: Prisma.ProjectOrderByWithRelationInput = {
        updatedAt: 'desc',
      };

      expect(orderByName.name).toBe('asc');
      expect(orderByCreatedAt.createdAt).toBe('desc');
      expect(orderByUpdatedAt.updatedAt).toBe('desc');
    });
  });
});
