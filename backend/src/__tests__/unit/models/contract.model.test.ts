/**
 * @fileoverview Contract（契約書）モデルのスキーマ定義テスト
 *
 * TDD: RED Phase - Prismaスキーマで定義するContractモデルの型検証
 *
 * Requirements (contract-management):
 * - REQ-3.1: 新規契約入力フィールド（見積書選択、契約日、工期、引渡日、消費税率、支払条件、別途工事、その他、監理者）
 * - REQ-5.1: 変更契約の基となる契約書選択（自己参照リレーション）
 * - REQ-5.3: 変更契約入力フィールド（新規契約と同一の入力フィールド構成）
 * - REQ-8.3: ステータス双方向遷移（BEFORE_CONTRACT <-> CONTRACTED）
 *
 * Task 1.1 Specification:
 * - ContractType Enum: NEW, AMENDMENT
 * - ContractStatus Enum: BEFORE_CONTRACT, CONTRACTED
 * - Contractモデル: 全フィールド定義（契約日、工期、引渡日、消費税率、支払条件、別途工事、その他、金額スナップショット等）
 * - Project、Estimate、TradingPartner、Contract自己参照のリレーション
 * - 既存モデル（Project、Estimate、TradingPartner）への逆リレーション追加
 * - 論理削除（deletedAt）、楽観的排他制御（version）、インデックス定義
 */

import { describe, it, expect } from 'vitest';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ContractType, ContractStatus } from '../../../generated/prisma/client.js';

describe('Contract Model Schema', () => {
  describe('ContractType Enum', () => {
    it('should have NEW value', () => {
      // 新規契約
      expect(ContractType.NEW).toBe('NEW');
    });

    it('should have AMENDMENT value', () => {
      // 変更契約
      expect(ContractType.AMENDMENT).toBe('AMENDMENT');
    });

    it('should have exactly 2 values', () => {
      const values = Object.values(ContractType);
      expect(values).toHaveLength(2);
    });
  });

  describe('ContractStatus Enum', () => {
    it('should have BEFORE_CONTRACT value', () => {
      // 契約前
      expect(ContractStatus.BEFORE_CONTRACT).toBe('BEFORE_CONTRACT');
    });

    it('should have CONTRACTED value', () => {
      // 契約済
      expect(ContractStatus.CONTRACTED).toBe('CONTRACTED');
    });

    it('should have exactly 2 values', () => {
      // REQ-8.3: 2つのステータスのみ
      const values = Object.values(ContractStatus);
      expect(values).toHaveLength(2);
    });
  });

  describe('Contract CreateInput type structure', () => {
    it('should require mandatory fields for new contract', () => {
      // REQ-3.1: 新規契約の必須フィールド
      const validInput: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        project: { connect: { id: 'project-id' } },
      };

      expect(validInput.contractType).toBe('NEW');
      expect(validInput.contractDate).toBeInstanceOf(Date);
      expect(validInput.constructionStartDate).toBeInstanceOf(Date);
      expect(validInput.constructionEndDate).toBeInstanceOf(Date);
      expect(validInput.deliveryDate).toBeInstanceOf(Date);
    });

    it('should allow optional text fields', () => {
      // REQ-3.1: 支払条件、別途工事、その他
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        paymentTerms: '毎月末締め翌月末払い',
        separateConstruction: '電気工事は別途',
        otherNotes: 'その他の条件',
        project: { connect: { id: 'project-id' } },
      };

      expect(input.paymentTerms).toBe('毎月末締め翌月末払い');
      expect(input.separateConstruction).toBe('電気工事は別途');
      expect(input.otherNotes).toBe('その他の条件');
    });

    it('should allow taxRate field with decimal', () => {
      // REQ-3.1: 消費税率（デフォルト0.10）
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        taxRate: 0.1,
        project: { connect: { id: 'project-id' } },
      };

      expect(input.taxRate).toBe(0.1);
    });

    it('should allow amount snapshot fields', () => {
      // 金額スナップショットフィールド
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        project: { connect: { id: 'project-id' } },
      };

      expect(input.contractAmount).toBe(11000000);
      expect(input.constructionPrice).toBe(10000000);
      expect(input.taxAmount).toBe(1000000);
    });

    it('should allow estimate relation', () => {
      // REQ-3.1: 見積書選択リレーション
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        estimate: { connect: { id: 'estimate-id' } },
        project: { connect: { id: 'project-id' } },
      };

      expect(input.estimate).toBeDefined();
    });

    it('should allow parentContract self-reference for amendment', () => {
      // REQ-5.1: 変更契約の基となる契約書選択（自己参照）
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.AMENDMENT,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        parentContract: { connect: { id: 'parent-contract-id' } },
        project: { connect: { id: 'project-id' } },
      };

      expect(input.parentContract).toBeDefined();
      expect(input.contractType).toBe('AMENDMENT');
    });

    it('should allow supervisorTradingPartner relation', () => {
      // REQ-3.1: 監理者取引先リレーション
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        supervisorTradingPartner: { connect: { id: 'trading-partner-id' } },
        project: { connect: { id: 'project-id' } },
      };

      expect(input.supervisorTradingPartner).toBeDefined();
    });

    it('should allow version field for optimistic locking', () => {
      // 楽観的排他制御
      const input: Prisma.ContractCreateInput = {
        contractType: ContractType.NEW,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        version: 0,
        project: { connect: { id: 'project-id' } },
      };

      expect(input.version).toBe(0);
    });
  });

  describe('Contract fields validation via Select', () => {
    it('should have id field', () => {
      const select: Prisma.ContractSelect = { id: true };
      expect(select.id).toBe(true);
    });

    it('should have contractType field', () => {
      const select: Prisma.ContractSelect = { contractType: true };
      expect(select.contractType).toBe(true);
    });

    it('should have status field', () => {
      // REQ-8.3: ステータスフィールド
      const select: Prisma.ContractSelect = { status: true };
      expect(select.status).toBe(true);
    });

    it('should have date fields', () => {
      // REQ-3.1: 契約日、工期、引渡日
      const select: Prisma.ContractSelect = {
        contractDate: true,
        constructionStartDate: true,
        constructionEndDate: true,
        deliveryDate: true,
      };
      expect(select.contractDate).toBe(true);
      expect(select.constructionStartDate).toBe(true);
      expect(select.constructionEndDate).toBe(true);
      expect(select.deliveryDate).toBe(true);
    });

    it('should have taxRate field', () => {
      const select: Prisma.ContractSelect = { taxRate: true };
      expect(select.taxRate).toBe(true);
    });

    it('should have text fields', () => {
      // REQ-3.1: 支払条件、別途工事、その他
      const select: Prisma.ContractSelect = {
        paymentTerms: true,
        separateConstruction: true,
        otherNotes: true,
      };
      expect(select.paymentTerms).toBe(true);
      expect(select.separateConstruction).toBe(true);
      expect(select.otherNotes).toBe(true);
    });

    it('should have amount snapshot fields', () => {
      // 金額スナップショット
      const select: Prisma.ContractSelect = {
        contractAmount: true,
        constructionPrice: true,
        taxAmount: true,
      };
      expect(select.contractAmount).toBe(true);
      expect(select.constructionPrice).toBe(true);
      expect(select.taxAmount).toBe(true);
    });

    it('should have version field', () => {
      // 楽観的排他制御
      const select: Prisma.ContractSelect = { version: true };
      expect(select.version).toBe(true);
    });

    it('should have timestamp fields', () => {
      const select: Prisma.ContractSelect = {
        createdAt: true,
        updatedAt: true,
      };
      expect(select.createdAt).toBe(true);
      expect(select.updatedAt).toBe(true);
    });

    it('should have deletedAt field for soft delete', () => {
      // 論理削除
      const select: Prisma.ContractSelect = { deletedAt: true };
      expect(select.deletedAt).toBe(true);
    });

    it('should have foreign key fields', () => {
      // リレーション外部キー
      const select: Prisma.ContractSelect = {
        projectId: true,
        parentContractId: true,
        estimateId: true,
        supervisorTradingPartnerId: true,
      };
      expect(select.projectId).toBe(true);
      expect(select.parentContractId).toBe(true);
      expect(select.estimateId).toBe(true);
      expect(select.supervisorTradingPartnerId).toBe(true);
    });
  });

  describe('Contract relations', () => {
    it('should have project relation', () => {
      const select: Prisma.ContractSelect = {
        project: true,
      };
      expect(select.project).toBe(true);
    });

    it('should have estimate relation', () => {
      // REQ-3.1: 見積書リレーション
      const select: Prisma.ContractSelect = {
        estimate: true,
      };
      expect(select.estimate).toBe(true);
    });

    it('should have parentContract self-reference relation', () => {
      // REQ-5.1: 変更契約の基となる契約書（自己参照）
      const select: Prisma.ContractSelect = {
        parentContract: true,
      };
      expect(select.parentContract).toBe(true);
    });

    it('should have childContracts reverse relation', () => {
      // 子契約書（自己参照の逆リレーション）
      const select: Prisma.ContractSelect = {
        childContracts: true,
      };
      expect(select.childContracts).toBe(true);
    });

    it('should have supervisorTradingPartner relation', () => {
      // REQ-3.1: 監理者取引先リレーション
      const select: Prisma.ContractSelect = {
        supervisorTradingPartner: true,
      };
      expect(select.supervisorTradingPartner).toBe(true);
    });
  });

  describe('Contract WhereInput for index-based queries', () => {
    it('should support filtering by projectId', () => {
      const where: Prisma.ContractWhereInput = {
        projectId: 'project-id',
      };
      expect(where.projectId).toBe('project-id');
    });

    it('should support filtering by status', () => {
      // REQ-8.3: ステータスフィルタリング
      const where: Prisma.ContractWhereInput = {
        status: ContractStatus.BEFORE_CONTRACT,
      };
      expect(where.status).toBe('BEFORE_CONTRACT');
    });

    it('should support filtering by contractDate', () => {
      const where: Prisma.ContractWhereInput = {
        contractDate: new Date('2026-04-01'),
      };
      expect(where.contractDate).toBeDefined();
    });

    it('should support filtering by deletedAt for soft delete', () => {
      // 論理削除フィルタリング
      const where: Prisma.ContractWhereInput = {
        deletedAt: null,
      };
      expect(where.deletedAt).toBeNull();
    });

    it('should support filtering by parentContractId', () => {
      // REQ-5.1: 変更契約の基契約書でフィルタリング
      const where: Prisma.ContractWhereInput = {
        parentContractId: 'parent-id',
      };
      expect(where.parentContractId).toBe('parent-id');
    });

    it('should support filtering by estimateId', () => {
      const where: Prisma.ContractWhereInput = {
        estimateId: 'estimate-id',
      };
      expect(where.estimateId).toBe('estimate-id');
    });
  });

  describe('Existing models reverse relations', () => {
    it('should allow contracts relation in Project select', () => {
      // Projectモデルへの逆リレーション追加
      const select: Prisma.ProjectSelect = {
        contracts: true,
      };
      expect(select.contracts).toBe(true);
    });

    it('should allow contracts relation in Estimate select', () => {
      // Estimateモデルへの逆リレーション追加
      const select: Prisma.EstimateSelect = {
        contracts: true,
      };
      expect(select.contracts).toBe(true);
    });

    it('should allow supervisorContracts relation in TradingPartner select', () => {
      // TradingPartnerモデルへの逆リレーション追加
      const select: Prisma.TradingPartnerSelect = {
        supervisorContracts: true,
      };
      expect(select.supervisorContracts).toBe(true);
    });
  });

  describe('Contract UpdateInput type structure', () => {
    it('should allow updating status', () => {
      // REQ-8.3: ステータス更新
      const input: Prisma.ContractUpdateInput = {
        status: ContractStatus.CONTRACTED,
      };
      expect(input.status).toBe('CONTRACTED');
    });

    it('should allow updating version for optimistic locking', () => {
      // 楽観的排他制御
      const input: Prisma.ContractUpdateInput = {
        version: { increment: 1 },
      };
      expect(input.version).toBeDefined();
    });

    it('should allow soft delete via deletedAt', () => {
      // 論理削除
      const input: Prisma.ContractUpdateInput = {
        deletedAt: new Date(),
      };
      expect(input.deletedAt).toBeDefined();
    });
  });

  describe('Contract OrderBy for sorting', () => {
    it('should support sorting by contractDate', () => {
      const orderBy: Prisma.ContractOrderByWithRelationInput = {
        contractDate: 'desc',
      };
      expect(orderBy.contractDate).toBe('desc');
    });

    it('should support sorting by createdAt', () => {
      const orderBy: Prisma.ContractOrderByWithRelationInput = {
        createdAt: 'desc',
      };
      expect(orderBy.createdAt).toBe('desc');
    });
  });
});
