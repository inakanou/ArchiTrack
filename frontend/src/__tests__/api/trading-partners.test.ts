/**
 * @fileoverview 取引先APIクライアントのユニットテスト
 *
 * Task 8.2: フォーム送信とエラーハンドリングの実装
 *
 * テスト対象:
 * - 作成・更新APIの呼び出し
 * - バリデーションエラー、重複エラー、競合エラーの処理
 * - ネットワークエラー処理
 *
 * Requirements:
 * - 2.7: 有効なデータを入力して保存ボタンクリックで新しい取引先レコードを作成
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合のエラー表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 4.8: 別の取引先と重複する取引先名に変更しようとした場合のエラー表示
 * - 8.1: ネットワークエラー時の再試行ボタン表示
 * - 8.2: サーバーエラー（5xx）時のメッセージ表示
 * - 8.4: ToastNotificationでエラー通知
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import type {
  TradingPartnerInfo,
  CreateTradingPartnerInput,
} from '../../types/trading-partner.types';

// モック
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    },
  };
});

// 取引先APIクライアント（テスト用）
// 実装ファイルはこの後作成
import {
  createTradingPartner,
  updateTradingPartner,
  getTradingPartner,
  deleteTradingPartner,
} from '../../api/trading-partners';

describe('Trading Partners API Client', () => {
  const mockTradingPartner: TradingPartnerInfo = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: '株式会社テスト',
    nameKana: 'カブシキガイシャテスト',
    branchName: null,
    branchNameKana: null,
    representativeName: null,
    representativeNameKana: null,
    types: ['CUSTOMER'],
    address: '東京都渋谷区1-1-1',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 取引先作成テスト
  // ============================================================================
  describe('createTradingPartner', () => {
    const createInput: CreateTradingPartnerInput = {
      name: '株式会社テスト',
      nameKana: 'カブシキガイシャテスト',
      types: ['CUSTOMER'],
      address: '東京都渋谷区1-1-1',
    };

    it('正常に取引先を作成できる (Requirement 2.7)', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockTradingPartner);

      const result = await createTradingPartner(createInput);

      expect(apiClient.post).toHaveBeenCalledWith('/api/trading-partners', createInput);
      expect(result).toEqual(mockTradingPartner);
    });

    it('バリデーションエラー（400）を正しく処理する (Requirement 2.11)', async () => {
      const validationError = new ApiError(400, '取引先名は必須です', {
        error: '取引先名は必須です',
        code: 'TRADING_PARTNER_VALIDATION_ERROR',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(validationError);

      await expect(createTradingPartner(createInput)).rejects.toThrow('取引先名は必須です');
    });

    it('重複エラー（409）を正しく処理する (Requirement 2.11)', async () => {
      const duplicateError = new ApiError(409, 'この取引先名は既に登録されています', {
        error: 'この取引先名は既に登録されています',
        code: 'DUPLICATE_PARTNER_NAME',
      });
      vi.mocked(apiClient.post).mockRejectedValueOnce(duplicateError);

      await expect(createTradingPartner(createInput)).rejects.toThrow(
        'この取引先名は既に登録されています'
      );
    });

    it('ネットワークエラー（0）を正しく処理する (Requirement 8.1)', async () => {
      const networkError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.post).mockRejectedValueOnce(networkError);

      await expect(createTradingPartner(createInput)).rejects.toThrow('Network error');
    });

    it('サーバーエラー（500）を正しく処理する (Requirement 8.2)', async () => {
      const serverError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.post).mockRejectedValueOnce(serverError);

      await expect(createTradingPartner(createInput)).rejects.toThrow('Internal Server Error');
    });
  });

  // ============================================================================
  // 取引先更新テスト
  // ============================================================================
  describe('updateTradingPartner', () => {
    const updateInput = {
      name: '株式会社テスト更新',
    };
    const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

    it('正常に取引先を更新できる (Requirement 4.5)', async () => {
      const updatedPartner = { ...mockTradingPartner, name: '株式会社テスト更新' };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updatedPartner);

      const result = await updateTradingPartner(
        mockTradingPartner.id,
        updateInput,
        expectedUpdatedAt
      );

      expect(apiClient.put).toHaveBeenCalledWith(`/api/trading-partners/${mockTradingPartner.id}`, {
        ...updateInput,
        expectedUpdatedAt,
      });
      expect(result).toEqual(updatedPartner);
    });

    it('重複エラー（409）を正しく処理する (Requirement 4.8)', async () => {
      const duplicateError = new ApiError(409, 'この取引先名は既に登録されています', {
        error: 'この取引先名は既に登録されています',
        code: 'DUPLICATE_PARTNER_NAME',
      });
      vi.mocked(apiClient.put).mockRejectedValueOnce(duplicateError);

      await expect(
        updateTradingPartner(mockTradingPartner.id, updateInput, expectedUpdatedAt)
      ).rejects.toThrow('この取引先名は既に登録されています');
    });

    it('競合エラー（409 - 楽観的排他制御）を正しく処理する', async () => {
      const conflictError = new ApiError(
        409,
        '他のユーザーによって更新されました。画面を更新してください',
        {
          error: '他のユーザーによって更新されました。画面を更新してください',
          code: 'TRADING_PARTNER_CONFLICT',
        }
      );
      vi.mocked(apiClient.put).mockRejectedValueOnce(conflictError);

      await expect(
        updateTradingPartner(mockTradingPartner.id, updateInput, expectedUpdatedAt)
      ).rejects.toThrow('他のユーザーによって更新されました。画面を更新してください');
    });

    it('存在しない取引先（404）を正しく処理する', async () => {
      const notFoundError = new ApiError(404, '取引先が見つかりません', {
        error: '取引先が見つかりません',
        code: 'TRADING_PARTNER_NOT_FOUND',
      });
      vi.mocked(apiClient.put).mockRejectedValueOnce(notFoundError);

      await expect(
        updateTradingPartner(mockTradingPartner.id, updateInput, expectedUpdatedAt)
      ).rejects.toThrow('取引先が見つかりません');
    });
  });

  // ============================================================================
  // 取引先取得テスト
  // ============================================================================
  describe('getTradingPartner', () => {
    it('正常に取引先を取得できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTradingPartner);

      const result = await getTradingPartner(mockTradingPartner.id);

      expect(apiClient.get).toHaveBeenCalledWith(`/api/trading-partners/${mockTradingPartner.id}`);
      expect(result).toEqual(mockTradingPartner);
    });

    it('存在しない取引先（404）を正しく処理する', async () => {
      const notFoundError = new ApiError(404, '取引先が見つかりません', {
        error: '取引先が見つかりません',
        code: 'TRADING_PARTNER_NOT_FOUND',
      });
      vi.mocked(apiClient.get).mockRejectedValueOnce(notFoundError);

      await expect(getTradingPartner('non-existent-id')).rejects.toThrow('取引先が見つかりません');
    });
  });

  // ============================================================================
  // 取引先削除テスト
  // ============================================================================
  describe('deleteTradingPartner', () => {
    it('正常に取引先を削除できる', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await deleteTradingPartner(mockTradingPartner.id);

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/trading-partners/${mockTradingPartner.id}`
      );
    });

    it('プロジェクト紐付け中の削除エラー（409）を正しく処理する', async () => {
      const inUseError = new ApiError(
        409,
        'この取引先は現在プロジェクトに使用されているため削除できません',
        {
          error: 'この取引先は現在プロジェクトに使用されているため削除できません',
          code: 'PARTNER_IN_USE',
        }
      );
      vi.mocked(apiClient.delete).mockRejectedValueOnce(inUseError);

      await expect(deleteTradingPartner(mockTradingPartner.id)).rejects.toThrow(
        'この取引先は現在プロジェクトに使用されているため削除できません'
      );
    });
  });
});
