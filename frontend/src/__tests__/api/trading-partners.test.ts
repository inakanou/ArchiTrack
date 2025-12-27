/**
 * @fileoverview 取引先APIクライアントのユニットテスト
 *
 * Task 8.2: フォーム送信とエラーハンドリングの実装
 * Task 18.1: 取引先オートコンプリートAPI連携の実装
 *
 * テスト対象:
 * - 作成・更新APIの呼び出し
 * - バリデーションエラー、重複エラー、競合エラーの処理
 * - ネットワークエラー処理
 * - オートコンプリート用検索API（searchTradingPartners, searchTradingPartnersForAutocomplete）
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
 * - 22.1: 顧客種別を持つ取引先をオートコンプリート候補として表示
 * - 22.3: 入力文字列で取引先名・フリガナの部分一致検索
 * - 16.4: 空の検索結果を正しく処理する
 * - 16.5: 候補は最大10件まで表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../../api/client';
import type {
  TradingPartnerInfo,
  CreateTradingPartnerInput,
  TradingPartnerSearchResult,
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
  getTradingPartners,
  deleteTradingPartner,
  searchTradingPartners,
  searchTradingPartnersForAutocomplete,
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
      const duplicateError = new ApiError(
        409,
        'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
        {
          error: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
          code: 'DUPLICATE_PARTNER_NAME',
          name: '株式会社テスト',
          branchName: '東京支店',
        }
      );
      vi.mocked(apiClient.post).mockRejectedValueOnce(duplicateError);

      await expect(createTradingPartner(createInput)).rejects.toThrow(
        'この取引先名と部課/支店/支社名の組み合わせは既に登録されています'
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
      const duplicateError = new ApiError(
        409,
        'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
        {
          error: 'この取引先名と部課/支店/支社名の組み合わせは既に登録されています',
          code: 'DUPLICATE_PARTNER_NAME',
          name: '株式会社テスト更新',
          branchName: null,
        }
      );
      vi.mocked(apiClient.put).mockRejectedValueOnce(duplicateError);

      await expect(
        updateTradingPartner(mockTradingPartner.id, updateInput, expectedUpdatedAt)
      ).rejects.toThrow('この取引先名と部課/支店/支社名の組み合わせは既に登録されています');
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
  // 取引先一覧取得テスト
  // ============================================================================
  describe('getTradingPartners', () => {
    const mockPaginatedResponse = {
      items: [mockTradingPartner],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    it('デフォルトオプションで取引先一覧を取得できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      const result = await getTradingPartners();

      expect(apiClient.get).toHaveBeenCalledWith('/api/trading-partners');
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('ページネーションパラメータを指定できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      await getTradingPartners({ page: 2, limit: 10 });

      expect(apiClient.get).toHaveBeenCalledWith('/api/trading-partners?page=2&limit=10');
    });

    it('検索フィルタを指定できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      await getTradingPartners({ filter: { search: 'テスト' } });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners?search=%E3%83%86%E3%82%B9%E3%83%88'
      );
    });

    it('取引先種別フィルタを指定できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      await getTradingPartners({ filter: { type: ['CUSTOMER', 'SUBCONTRACTOR'] } });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners?type=CUSTOMER%2CSUBCONTRACTOR'
      );
    });

    it('空の取引先種別フィルタは無視される', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      await getTradingPartners({ filter: { type: [] } });

      expect(apiClient.get).toHaveBeenCalledWith('/api/trading-partners');
    });

    it('ソートオプションを指定できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      await getTradingPartners({ sort: 'name', order: 'asc' });

      expect(apiClient.get).toHaveBeenCalledWith('/api/trading-partners?sort=name&order=asc');
    });

    it('全てのオプションを組み合わせて指定できる', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockPaginatedResponse);

      await getTradingPartners({
        page: 1,
        limit: 20,
        filter: { search: 'テスト', type: ['CUSTOMER'] },
        sort: 'nameKana',
        order: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners?page=1&limit=20&search=%E3%83%86%E3%82%B9%E3%83%88&type=CUSTOMER&sort=nameKana&order=desc'
      );
    });
  });

  // ============================================================================
  // 取引先詳細取得テスト
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

  // ============================================================================
  // 取引先検索テスト（オートコンプリート用）
  // Task 18.1: 取引先オートコンプリートAPI連携の実装
  // ============================================================================
  describe('searchTradingPartners', () => {
    const mockSearchResults: TradingPartnerSearchResult[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        types: ['CUSTOMER'],
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174002',
        name: '株式会社テスト2',
        nameKana: 'カブシキガイシャテストニ',
        types: ['CUSTOMER', 'SUBCONTRACTOR'],
      },
    ];

    it('正常に取引先を検索できる (Requirement 22.3)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSearchResults);

      const result = await searchTradingPartners('テスト');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners/search?q=%E3%83%86%E3%82%B9%E3%83%88&limit=10'
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('取引先種別でフィルタリングできる (Requirement 22.1)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([mockSearchResults[0]]);

      const result = await searchTradingPartners('テスト', ['CUSTOMER']);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners/search?q=%E3%83%86%E3%82%B9%E3%83%88&type=CUSTOMER&limit=10'
      );
      expect(result).toHaveLength(1);
    });

    it('件数制限を指定できる (Requirement 22.4)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSearchResults.slice(0, 1));

      await searchTradingPartners('テスト', undefined, 5);

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners/search?q=%E3%83%86%E3%82%B9%E3%83%88&limit=5'
      );
    });

    it('空の検索結果を正しく処理する (Requirement 16.4)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce([]);

      const result = await searchTradingPartners('存在しない');

      expect(result).toEqual([]);
    });

    it('ネットワークエラー（0）を正しく処理する', async () => {
      const networkError = new ApiError(0, 'Network error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(networkError);

      await expect(searchTradingPartners('テスト')).rejects.toThrow('Network error');
    });

    it('サーバーエラー（500）を正しく処理する', async () => {
      const serverError = new ApiError(500, 'Internal Server Error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(serverError);

      await expect(searchTradingPartners('テスト')).rejects.toThrow('Internal Server Error');
    });
  });

  // ============================================================================
  // プロジェクト顧客選択用オートコンプリートテスト
  // Task 18.1: 取引先オートコンプリートAPI連携の実装
  // ============================================================================
  describe('searchTradingPartnersForAutocomplete', () => {
    const mockSearchResults: TradingPartnerSearchResult[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        types: ['CUSTOMER'],
      },
    ];

    it('顧客種別を含む取引先を検索できる (Requirement 22.1)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSearchResults);

      const result = await searchTradingPartnersForAutocomplete('テスト');

      // CUSTOMERタイプでフィルタリングされることを確認
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners/search?q=%E3%83%86%E3%82%B9%E3%83%88&type=CUSTOMER&limit=10'
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('フリガナでも検索できる (Requirement 22.3)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSearchResults);

      await searchTradingPartnersForAutocomplete('カブシキ');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/trading-partners/search?q=%E3%82%AB%E3%83%96%E3%82%B7%E3%82%AD&type=CUSTOMER&limit=10'
      );
    });

    it('最大10件まで取得する (Requirement 16.5)', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSearchResults);

      await searchTradingPartnersForAutocomplete('テスト');

      // limit=10が設定されていることを確認
      const calls = vi.mocked(apiClient.get).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]![0]).toContain('limit=10');
    });

    it('取引先管理機能未実装時はエラーを返す（フォールバック対応）', async () => {
      // 404エラーは取引先管理機能が未実装であることを示す
      const notFoundError = new ApiError(404, 'Not Found');
      vi.mocked(apiClient.get).mockRejectedValueOnce(notFoundError);

      await expect(searchTradingPartnersForAutocomplete('テスト')).rejects.toThrow('Not Found');
    });
  });
});
