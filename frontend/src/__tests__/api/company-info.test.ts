/**
 * @fileoverview 自社情報APIクライアントのユニットテスト
 *
 * Task 5.1: APIクライアントの実装
 *
 * テスト対象:
 * - getCompanyInfo関数（GET /api/company-info）
 * - updateCompanyInfo関数（PUT /api/company-info）
 * - エラーハンドリング（401、403、409、ネットワークエラー）
 *
 * Requirements:
 * - 9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供
 * - 9.2: 登録済みデータを返却
 * - 9.3: 未登録時に空オブジェクトを返却
 * - 9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供
 * - 9.5: 未存在時の新規作成
 * - 9.6: 存在時の更新
 * - 9.8: versionによる楽観的排他制御
 * - 9.9: version不一致時の409 Conflict
 * - 7.1: ネットワークエラー時のエラー処理
 * - 7.2: サーバーエラー（5xx）時のエラー処理
 * - 7.3: セッション期限切れ時のリダイレクト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import type { CompanyInfo, UpdateCompanyInfoInput } from '../../types/company-info.types';

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

// 自社情報APIクライアント
import { getCompanyInfo, updateCompanyInfo } from '../../api/company-info';

describe('Company Info API Client', () => {
  // ============================================================================
  // テストデータ
  // ============================================================================
  const mockCompanyInfo: CompanyInfo = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    companyName: '株式会社テスト',
    address: '東京都渋谷区1-1-1',
    representative: '代表 太郎',
    phone: '03-1234-5678',
    fax: '03-1234-5679',
    email: 'test@example.com',
    invoiceRegistrationNumber: 'T1234567890123',
    version: 1,
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
  // 自社情報取得テスト
  // ============================================================================
  describe('getCompanyInfo', () => {
    it('正常に自社情報を取得できる (Requirement 9.1, 9.2)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockCompanyInfo);

      const result = await getCompanyInfo();

      expect(apiClient.get).toHaveBeenCalledWith('/api/company-info');
      expect(result).toEqual(mockCompanyInfo);
    });

    it('未登録時に空オブジェクトを返却する (Requirement 9.3)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({});

      const result = await getCompanyInfo();

      expect(apiClient.get).toHaveBeenCalledWith('/api/company-info');
      expect(result).toEqual({});
    });

    it('認証エラー（401）を正しく処理する (Requirement 7.3)', async () => {
      const authError = new ApiError(401, '認証が必要です', {
        error: '認証が必要です',
        code: 'UNAUTHORIZED',
      });
      vi.mocked(apiClient.get).mockRejectedValueOnce(authError);

      await expect(getCompanyInfo()).rejects.toThrow('認証が必要です');
    });

    it('権限エラー（403）を正しく処理する', async () => {
      const forbiddenError = new ApiError(403, '権限がありません', {
        error: '権限がありません',
        code: 'FORBIDDEN',
      });
      vi.mocked(apiClient.get).mockRejectedValueOnce(forbiddenError);

      await expect(getCompanyInfo()).rejects.toThrow('権限がありません');
    });

    it('ネットワークエラー（0）を正しく処理する (Requirement 7.1)', async () => {
      const networkError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(networkError);

      await expect(getCompanyInfo()).rejects.toThrow('Network error');
    });

    it('サーバーエラー（500）を正しく処理する (Requirement 7.2)', async () => {
      const serverError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(serverError);

      await expect(getCompanyInfo()).rejects.toThrow('Internal Server Error');
    });
  });

  // ============================================================================
  // 自社情報保存テスト
  // ============================================================================
  describe('updateCompanyInfo', () => {
    const updateInput: UpdateCompanyInfoInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '代表 太郎',
      phone: '03-1234-5678',
      fax: '03-1234-5679',
      email: 'test@example.com',
      invoiceRegistrationNumber: 'T1234567890123',
    };

    it('新規作成時に正常に自社情報を作成できる (Requirement 9.4, 9.5)', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockCompanyInfo);

      const result = await updateCompanyInfo(updateInput);

      expect(apiClient.put).toHaveBeenCalledWith('/api/company-info', updateInput);
      expect(result).toEqual(mockCompanyInfo);
    });

    it('更新時にversionを含めて送信する (Requirement 9.6, 9.8)', async () => {
      const inputWithVersion: UpdateCompanyInfoInput = {
        ...updateInput,
        version: 1,
      };
      const updatedCompanyInfo = { ...mockCompanyInfo, version: 2 };
      vi.mocked(apiClient.put).mockResolvedValueOnce(updatedCompanyInfo);

      const result = await updateCompanyInfo(inputWithVersion);

      expect(apiClient.put).toHaveBeenCalledWith('/api/company-info', inputWithVersion);
      expect(result).toEqual(updatedCompanyInfo);
    });

    it('楽観的排他制御で競合が発生した場合、409エラーを返す (Requirement 9.9)', async () => {
      const inputWithVersion: UpdateCompanyInfoInput = {
        ...updateInput,
        version: 1,
      };
      const conflictError = new ApiError(
        409,
        '他のユーザーによって更新されました。画面を更新してください',
        {
          error: '他のユーザーによって更新されました。画面を更新してください',
          code: 'CONFLICT',
        }
      );
      vi.mocked(apiClient.put).mockRejectedValueOnce(conflictError);

      await expect(updateCompanyInfo(inputWithVersion)).rejects.toThrow(
        '他のユーザーによって更新されました。画面を更新してください'
      );
    });

    it('バリデーションエラー（400）を正しく処理する', async () => {
      const validationError = new ApiError(400, '会社名は必須です', {
        error: '会社名は必須です',
        code: 'VALIDATION_ERROR',
      });
      vi.mocked(apiClient.put).mockRejectedValueOnce(validationError);

      await expect(updateCompanyInfo(updateInput)).rejects.toThrow('会社名は必須です');
    });

    it('認証エラー（401）を正しく処理する (Requirement 7.3)', async () => {
      const authError = new ApiError(401, '認証が必要です', {
        error: '認証が必要です',
        code: 'UNAUTHORIZED',
      });
      vi.mocked(apiClient.put).mockRejectedValueOnce(authError);

      await expect(updateCompanyInfo(updateInput)).rejects.toThrow('認証が必要です');
    });

    it('権限エラー（403）を正しく処理する', async () => {
      const forbiddenError = new ApiError(403, '権限がありません', {
        error: '権限がありません',
        code: 'FORBIDDEN',
      });
      vi.mocked(apiClient.put).mockRejectedValueOnce(forbiddenError);

      await expect(updateCompanyInfo(updateInput)).rejects.toThrow('権限がありません');
    });

    it('ネットワークエラー（0）を正しく処理する (Requirement 7.1)', async () => {
      const networkError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.put).mockRejectedValueOnce(networkError);

      await expect(updateCompanyInfo(updateInput)).rejects.toThrow('Network error');
    });

    it('サーバーエラー（500）を正しく処理する (Requirement 7.2)', async () => {
      const serverError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.put).mockRejectedValueOnce(serverError);

      await expect(updateCompanyInfo(updateInput)).rejects.toThrow('Internal Server Error');
    });

    it('任意フィールドがnullでも正常に送信できる', async () => {
      const minimalInput: UpdateCompanyInfoInput = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '代表 太郎',
        phone: null,
        fax: null,
        email: null,
        invoiceRegistrationNumber: null,
      };
      vi.mocked(apiClient.put).mockResolvedValueOnce({
        ...mockCompanyInfo,
        phone: null,
        fax: null,
        email: null,
        invoiceRegistrationNumber: null,
      });

      const result = await updateCompanyInfo(minimalInput);

      expect(apiClient.put).toHaveBeenCalledWith('/api/company-info', minimalInput);
      expect(result).toBeDefined();
    });
  });
});
