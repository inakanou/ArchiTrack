/**
 * @fileoverview ContractService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 1.1, 1.2: 契約書一覧取得
 * - 7.1: 契約書作成
 * - 8.1: 契約書詳細取得
 * - 8.2, 8.3: ステータス双方向遷移
 * - 9.2: 契約書更新（楽観的排他制御）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContractService,
  type ContractServiceDependencies,
} from '../../../services/contract.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  ContractNotFoundError,
  ContractConflictError,
  ContractValidationError,
} from '../../../errors/contractError.js';

// Prismaモック
function createMockPrisma() {
  return {
    contract: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        contract: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
        },
      })
    ),
  } as unknown as PrismaClient;
}

// テスト用サンプルデータ
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const contractId = '550e8400-e29b-41d4-a716-446655440010';
const estimateId = '550e8400-e29b-41d4-a716-446655440001';
const parentContractId = '550e8400-e29b-41d4-a716-446655440020';

const mockContractRecord = {
  id: contractId,
  projectId,
  contractType: 'NEW',
  status: 'BEFORE_CONTRACT',
  parentContractId: null,
  estimateId,
  contractDate: new Date('2026-04-01'),
  constructionStartDate: new Date('2026-05-01'),
  constructionEndDate: new Date('2026-12-31'),
  deliveryDate: new Date('2027-01-15'),
  taxRate: { toNumber: () => 0.1 },
  paymentTerms: '着手時30%',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: null,
  contractAmount: { toNumber: () => 11000000 },
  constructionPrice: { toNumber: () => 10000000 },
  taxAmount: { toNumber: () => 1000000 },
  version: 0,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
  deletedAt: null,
  estimate: { id: estimateId, name: 'テスト見積書' },
  parentContract: null,
  supervisorTradingPartner: null,
  project: {
    id: projectId,
    name: 'テストプロジェクト',
    siteAddress: '東京都渋谷区',
    tradingPartner: { id: 'tp-1', name: 'テスト顧客' },
  },
};

const createInput = {
  contractType: 'NEW' as const,
  parentContractId: null,
  estimateId,
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '着手時30%',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: null,
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
};

describe('ContractService', () => {
  let service: ContractService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const deps: ContractServiceDependencies = {
      prisma: mockPrisma,
    };
    service = new ContractService(deps);
  });

  describe('findByProject', () => {
    it('プロジェクトの契約書一覧を取得できること', async () => {
      const mockContracts = [
        {
          ...mockContractRecord,
          estimate: { id: estimateId, name: 'テスト見積書' },
        },
      ];

      // $transactionを使わない直接呼び出しパターンの場合
      (mockPrisma.contract.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockContracts);
      (mockPrisma.contract.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await service.findByProject(projectId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.contracts).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('論理削除された契約書を除外すること', async () => {
      (mockPrisma.contract.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPrisma.contract.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await service.findByProject(projectId, {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      const findManyCall = (mockPrisma.contract.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(findManyCall.where.deletedAt).toBeNull();
    });

    it('ページネーションが正しく適用されること', async () => {
      (mockPrisma.contract.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPrisma.contract.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await service.findByProject(projectId, {
        page: 2,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      const findManyCall = (mockPrisma.contract.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(10);
    });
  });

  describe('findById', () => {
    it('契約書詳細を取得できること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContractRecord
      );

      const result = await service.findById(contractId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(contractId);
      expect(result!.projectId).toBe(projectId);
    });

    it('論理削除された契約書はnullを返すこと', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        deletedAt: new Date(),
      });

      const result = await service.findById(contractId);

      expect(result).toBeNull();
    });

    it('存在しない契約書はnullを返すこと', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.findById(contractId);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('新規契約を作成できること', async () => {
      (mockPrisma.contract.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContractRecord
      );

      const result = await service.create(projectId, createInput);

      expect(result.id).toBe(contractId);
      expect(result.status).toBe('BEFORE_CONTRACT');
    });

    it('作成時にステータスがBEFORE_CONTRACTで初期化されること', async () => {
      (mockPrisma.contract.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContractRecord
      );

      await service.create(projectId, createInput);

      const createCall = (mockPrisma.contract.create as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(createCall.data.status).toBe('BEFORE_CONTRACT');
    });

    it('変更契約のparentContractIdが同プロジェクトでない場合エラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        id: parentContractId,
        projectId: 'different-project-id',
      });

      const amendmentInput = {
        ...createInput,
        contractType: 'AMENDMENT' as const,
        parentContractId,
      };

      await expect(service.create(projectId, amendmentInput)).rejects.toThrow(
        ContractValidationError
      );
    });

    it('変更契約のparentContractIdが同プロジェクトの場合は作成できること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        id: parentContractId,
        projectId,
      });
      (mockPrisma.contract.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        contractType: 'AMENDMENT',
        parentContractId,
      });

      const amendmentInput = {
        ...createInput,
        contractType: 'AMENDMENT' as const,
        parentContractId,
      };

      const result = await service.create(projectId, amendmentInput);

      expect(result.contractType).toBe('AMENDMENT');
    });
  });

  describe('update', () => {
    it('契約書を更新できること', async () => {
      const updatedRecord = {
        ...mockContractRecord,
        version: 1,
        paymentTerms: '更新後の支払条件',
      };

      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContractRecord
      );
      (mockPrisma.contract.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedRecord);

      const updateInput = {
        estimateId,
        contractDate: '2026-04-01',
        constructionStartDate: '2026-05-01',
        constructionEndDate: '2026-12-31',
        deliveryDate: '2027-01-15',
        taxRate: 0.1,
        paymentTerms: '更新後の支払条件',
        separateConstruction: '電気設備工事',
        otherNotes: '特記事項なし',
        supervisorTradingPartnerId: null,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        version: 0,
      };

      const result = await service.update(contractId, updateInput);

      expect(result.paymentTerms).toBe('更新後の支払条件');
    });

    it('存在しない契約書の更新はエラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const updateInput = {
        estimateId,
        contractDate: '2026-04-01',
        constructionStartDate: '2026-05-01',
        constructionEndDate: '2026-12-31',
        deliveryDate: '2027-01-15',
        taxRate: 0.1,
        paymentTerms: '支払条件',
        separateConstruction: '',
        otherNotes: '',
        supervisorTradingPartnerId: null,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        version: 0,
      };

      await expect(service.update(contractId, updateInput)).rejects.toThrow(ContractNotFoundError);
    });

    it('versionが一致しない場合は競合エラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        version: 2,
      });

      const updateInput = {
        estimateId,
        contractDate: '2026-04-01',
        constructionStartDate: '2026-05-01',
        constructionEndDate: '2026-12-31',
        deliveryDate: '2027-01-15',
        taxRate: 0.1,
        paymentTerms: '支払条件',
        separateConstruction: '',
        otherNotes: '',
        supervisorTradingPartnerId: null,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        version: 0,
      };

      await expect(service.update(contractId, updateInput)).rejects.toThrow(ContractConflictError);
    });

    it('論理削除済みの契約書の更新はエラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        deletedAt: new Date(),
      });

      const updateInput = {
        estimateId,
        contractDate: '2026-04-01',
        constructionStartDate: '2026-05-01',
        constructionEndDate: '2026-12-31',
        deliveryDate: '2027-01-15',
        taxRate: 0.1,
        paymentTerms: '支払条件',
        separateConstruction: '',
        otherNotes: '',
        supervisorTradingPartnerId: null,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        version: 0,
      };

      await expect(service.update(contractId, updateInput)).rejects.toThrow(ContractNotFoundError);
    });
  });

  describe('updateStatus', () => {
    it('BEFORE_CONTRACTからCONTRACTEDに遷移できること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockContractRecord)
        .mockResolvedValueOnce({
          ...mockContractRecord,
          status: 'CONTRACTED',
        });
      (mockPrisma.contract.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        status: 'CONTRACTED',
      });

      const result = await service.updateStatus(contractId, 'CONTRACTED');

      expect(result.status).toBe('CONTRACTED');
    });

    it('CONTRACTEDからBEFORE_CONTRACTに遷移できること', async () => {
      const contractedRecord = {
        ...mockContractRecord,
        status: 'CONTRACTED',
      };
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(contractedRecord)
        .mockResolvedValueOnce({
          ...contractedRecord,
          status: 'BEFORE_CONTRACT',
        });
      (mockPrisma.contract.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...contractedRecord,
        status: 'BEFORE_CONTRACT',
      });

      const result = await service.updateStatus(contractId, 'BEFORE_CONTRACT');

      expect(result.status).toBe('BEFORE_CONTRACT');
    });

    it('存在しない契約書のステータス更新はエラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.updateStatus(contractId, 'CONTRACTED')).rejects.toThrow(
        ContractNotFoundError
      );
    });

    it('ステータス更新後に契約書詳細を返却すること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockContractRecord)
        .mockResolvedValueOnce({
          ...mockContractRecord,
          status: 'CONTRACTED',
        });
      (mockPrisma.contract.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        status: 'CONTRACTED',
      });

      const result = await service.updateStatus(contractId, 'CONTRACTED');

      expect(result.id).toBe(contractId);
      expect(result.projectId).toBe(projectId);
      expect(result.status).toBe('CONTRACTED');
    });
  });

  describe('delete', () => {
    it('契約書を論理削除できること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContractRecord
      );
      (mockPrisma.contract.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        deletedAt: new Date(),
      });

      await expect(service.delete(contractId)).resolves.not.toThrow();
    });

    it('存在しない契約書の削除はエラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.delete(contractId)).rejects.toThrow(ContractNotFoundError);
    });

    it('既に論理削除済みの契約書の削除はエラーになること', async () => {
      (mockPrisma.contract.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockContractRecord,
        deletedAt: new Date(),
      });

      await expect(service.delete(contractId)).rejects.toThrow(ContractNotFoundError);
    });
  });
});
