/**
 * @fileoverview 契約書APIクライアントのユニットテスト
 *
 * Requirements:
 * - REQ-1.1, REQ-1.2: GET /api/projects/:projectId/contracts 契約書一覧取得
 * - REQ-5.2, REQ-8.1: GET /api/contracts/:id 契約書詳細取得
 * - REQ-7.1: POST /api/projects/:projectId/contracts 契約書作成
 * - REQ-9.2: PUT /api/contracts/:id 契約書更新
 * - REQ-8.2, REQ-8.3: PATCH /api/contracts/:id/status ステータス更新
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import {
  getContracts,
  getContractDetail,
  createContract,
  updateContract,
  updateContractStatus,
  deleteContract,
  type ContractsResponse,
  type ContractDetail,
  type CreateContractInput,
  type UpdateContractInput,
} from '../../api/contracts';

// モック設定
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// テストデータ
const mockContractDetail: ContractDetail = {
  id: 'contract-1',
  projectId: 'project-1',
  contractType: 'NEW',
  status: 'BEFORE_CONTRACT',
  parentContractId: null,
  estimateId: 'estimate-1',
  contractDate: '2026-01-15',
  constructionStartDate: '2026-02-01',
  constructionEndDate: '2026-06-30',
  deliveryDate: '2026-07-15',
  taxRate: 10,
  paymentTerms: '月末締め翌月払い',
  separateConstruction: '電気工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: 'partner-2',
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
  estimate: { id: 'estimate-1', name: '見積書A' },
  parentContract: null,
  supervisorTradingPartner: { id: 'partner-2', name: '監理事務所A' },
  project: {
    id: 'project-1',
    name: 'テストプロジェクト',
    siteAddress: '東京都千代田区1-1-1',
    tradingPartner: { id: 'partner-1', name: '顧客A' },
  },
  version: 1,
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-10T00:00:00Z',
};

const mockContractsResponse: ContractsResponse = {
  contracts: [
    {
      id: 'contract-1',
      contractType: 'NEW',
      contractDate: '2026-01-15',
      status: 'BEFORE_CONTRACT',
      contractAmount: 11000000,
      estimateName: '見積書A',
      parentContractId: null,
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-01-10T00:00:00Z',
    },
    {
      id: 'contract-2',
      contractType: 'AMENDMENT',
      contractDate: '2026-03-01',
      status: 'CONTRACTED',
      contractAmount: 12000000,
      estimateName: '見積書B',
      parentContractId: 'contract-1',
      createdAt: '2026-02-20T00:00:00Z',
      updatedAt: '2026-02-20T00:00:00Z',
    },
  ],
  total: 2,
};

describe('contracts API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // getContracts - 契約書一覧取得
  // ==========================================================================
  describe('getContracts', () => {
    it('オプションなしで契約書一覧を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockContractsResponse);

      const result = await getContracts('project-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/projects/project-1/contracts');
      expect(result).toEqual(mockContractsResponse);
    });

    it('ページネーションオプション付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockContractsResponse);

      await getContracts('project-1', { page: 2, limit: 10 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/contracts?page=2&limit=10'
      );
    });

    it('ソートオプション付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockContractsResponse);

      await getContracts('project-1', { sortBy: 'contractDate', sortOrder: 'desc' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/contracts?sortBy=contractDate&sortOrder=desc'
      );
    });

    it('全オプション付きで取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockContractsResponse);

      await getContracts('project-1', {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/projects/project-1/contracts?page=1&limit=20&sortBy=createdAt&sortOrder=asc'
      );
    });

    it('APIエラー時に例外をスローする', async () => {
      const mockError = new ApiError(500, 'Internal Server Error', { detail: 'Server error' });
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getContracts('project-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getContractDetail - 契約書詳細取得
  // ==========================================================================
  describe('getContractDetail', () => {
    it('契約書詳細を取得する', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockContractDetail);

      const result = await getContractDetail('contract-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/contracts/contract-1');
      expect(result).toEqual(mockContractDetail);
    });

    it('存在しない契約書IDで404エラーをスローする', async () => {
      const mockError = new ApiError(404, 'Not Found', { detail: 'Contract not found' });
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);

      await expect(getContractDetail('non-existent')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // createContract - 契約書作成
  // ==========================================================================
  describe('createContract', () => {
    const createInput: CreateContractInput = {
      contractType: 'NEW',
      parentContractId: null,
      estimateId: 'estimate-1',
      contractDate: '2026-01-15',
      constructionStartDate: '2026-02-01',
      constructionEndDate: '2026-06-30',
      deliveryDate: '2026-07-15',
      taxRate: 10,
      paymentTerms: '月末締め翌月払い',
      separateConstruction: '電気工事',
      otherNotes: '特記事項なし',
      supervisorTradingPartnerId: null,
      contractAmount: 11000000,
      constructionPrice: 10000000,
      taxAmount: 1000000,
    };

    it('新規契約書を作成する', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockContractDetail);

      const result = await createContract('project-1', createInput);

      expect(apiClient.post).toHaveBeenCalledWith('/api/projects/project-1/contracts', createInput);
      expect(result).toEqual(mockContractDetail);
    });

    it('変更契約を作成する', async () => {
      const amendmentInput: CreateContractInput = {
        ...createInput,
        contractType: 'AMENDMENT',
        parentContractId: 'contract-1',
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        ...mockContractDetail,
        contractType: 'AMENDMENT',
        parentContractId: 'contract-1',
      });

      const result = await createContract('project-1', amendmentInput);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/projects/project-1/contracts',
        amendmentInput
      );
      expect(result.contractType).toBe('AMENDMENT');
    });

    it('バリデーションエラー時に例外をスローする', async () => {
      const mockError = new ApiError(400, 'Bad Request', { detail: 'Validation error' });
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(createContract('project-1', createInput)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateContract - 契約書更新
  // ==========================================================================
  describe('updateContract', () => {
    const updateInput: UpdateContractInput = {
      estimateId: 'estimate-1',
      contractDate: '2026-01-20',
      constructionStartDate: '2026-02-01',
      constructionEndDate: '2026-06-30',
      deliveryDate: '2026-07-15',
      taxRate: 10,
      paymentTerms: '月末締め翌月払い',
      separateConstruction: '電気工事',
      otherNotes: '更新済み',
      supervisorTradingPartnerId: 'partner-2',
      contractAmount: 11000000,
      constructionPrice: 10000000,
      taxAmount: 1000000,
      version: 1,
    };

    it('契約書を更新する', async () => {
      const updatedContract = { ...mockContractDetail, otherNotes: '更新済み', version: 2 };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updatedContract);

      const result = await updateContract('contract-1', updateInput);

      expect(apiClient.put).toHaveBeenCalledWith('/api/contracts/contract-1', updateInput);
      expect(result).toEqual(updatedContract);
    });

    it('楽観ロック競合時にエラーをスローする', async () => {
      const mockError = new ApiError(409, 'Conflict', { detail: 'Version conflict' });
      vi.mocked(apiClient.put).mockRejectedValueOnce(mockError);

      await expect(updateContract('contract-1', updateInput)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateContractStatus - ステータス更新
  // ==========================================================================
  describe('updateContractStatus', () => {
    it('ステータスを「契約済み」に更新する', async () => {
      const updatedContract = { ...mockContractDetail, status: 'CONTRACTED' as const };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedContract);

      const result = await updateContractStatus('contract-1', 'CONTRACTED');

      expect(apiClient.patch).toHaveBeenCalledWith('/api/contracts/contract-1/status', {
        status: 'CONTRACTED',
      });
      expect(result.status).toBe('CONTRACTED');
    });

    it('ステータスを「契約前」に更新する', async () => {
      const updatedContract = { ...mockContractDetail, status: 'BEFORE_CONTRACT' as const };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedContract);

      const result = await updateContractStatus('contract-1', 'BEFORE_CONTRACT');

      expect(apiClient.patch).toHaveBeenCalledWith('/api/contracts/contract-1/status', {
        status: 'BEFORE_CONTRACT',
      });
      expect(result.status).toBe('BEFORE_CONTRACT');
    });

    it('不正なステータス遷移時にエラーをスローする', async () => {
      const mockError = new ApiError(422, 'Unprocessable Entity', {
        detail: 'Invalid status transition',
      });
      vi.mocked(apiClient.patch).mockRejectedValueOnce(mockError);

      await expect(updateContractStatus('contract-1', 'CONTRACTED')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // deleteContract - 契約書削除 (Task 13.1)
  // ==========================================================================
  describe('deleteContract', () => {
    it('契約書を削除する', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteContract('contract-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/contracts/contract-1');
    });

    it('子契約が存在する場合に422エラーをスローする', async () => {
      const mockError = new ApiError(
        422,
        'この契約書は変更契約の基となっているため削除できません',
        {
          message: 'この契約書は変更契約の基となっているため削除できません',
        }
      );
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      try {
        await deleteContract('contract-1');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(422);
      }
    });

    it('契約済ステータスの場合に422エラーをスローする', async () => {
      const mockError = new ApiError(
        422,
        '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください',
        {
          message: '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください',
        }
      );
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteContract('contract-1')).rejects.toThrow(ApiError);
    });

    it('404エラー時に例外をスローする', async () => {
      const mockError = new ApiError(404, 'Not Found');
      vi.mocked(apiClient.delete).mockRejectedValueOnce(mockError);

      await expect(deleteContract('nonexistent')).rejects.toThrow(ApiError);
    });
  });
});
