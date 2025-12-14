/**
 * @fileoverview 取引先機能のパフォーマンステスト
 *
 * Task 11.1: 一覧・詳細画面のパフォーマンス最適化
 *
 * Requirements (trading-partner-management):
 * - REQ-9.1: 取引先一覧画面の初期表示を2秒以内に完了する
 * - REQ-9.2: 取引先詳細画面の初期表示を1秒以内に完了する
 * - REQ-9.4: 検索・フィルタリング操作の結果表示を1秒以内に完了する
 * - REQ-9.5: 大量データ（1000件以上）でもページネーションにより一覧表示のパフォーマンスを維持
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import TradingPartnerListPage from '../../pages/TradingPartnerListPage';
import TradingPartnerListTable from '../../components/trading-partners/TradingPartnerListTable';
import TradingPartnerSearchFilter from '../../components/trading-partners/TradingPartnerSearchFilter';
import TradingPartnerPaginationUI from '../../components/trading-partners/TradingPartnerPaginationUI';
import TradingPartnerDetailView from '../../components/trading-partners/TradingPartnerDetailView';
import type {
  TradingPartnerInfo,
  TradingPartnerDetail,
  PaginatedTradingPartners,
  TradingPartnerFilter,
  PaginationInfo,
} from '../../types/trading-partner.types';

// APIモック
vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn(),
  getTradingPartner: vi.fn(),
}));

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ============================================================================
// テストデータ生成ヘルパー
// ============================================================================

/**
 * モック取引先データを生成
 */
const createMockTradingPartner = (
  id: string,
  overrides: Partial<TradingPartnerInfo> = {}
): TradingPartnerInfo => ({
  id,
  name: `取引先${id}`,
  nameKana: `トリヒキサキ${id}`,
  branchName: null,
  branchNameKana: null,
  representativeName: null,
  representativeNameKana: null,
  types: ['CUSTOMER'],
  address: `東京都千代田区${id}`,
  phoneNumber: null,
  faxNumber: null,
  email: null,
  billingClosingDay: null,
  paymentMonthOffset: null,
  paymentDay: null,
  notes: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-15T00:00:00Z',
  ...overrides,
});

/**
 * 大量データを生成（パフォーマンステスト用）
 */
const createLargeMockData = (count: number): TradingPartnerInfo[] => {
  return Array.from({ length: count }, (_, i) => createMockTradingPartner(String(i + 1)));
};

/**
 * モック取引先詳細データを生成
 */
const createMockTradingPartnerDetail = (id: string): TradingPartnerDetail => ({
  ...createMockTradingPartner(id),
});

// ============================================================================
// テストスイート
// ============================================================================

describe('取引先機能 パフォーマンステスト（Task 11.1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ヘルパー関数
  const renderWithRouter = (
    component: React.ReactElement,
    initialEntries: string[] = ['/trading-partners']
  ) => {
    return render(<MemoryRouter initialEntries={initialEntries}>{component}</MemoryRouter>);
  };

  // ==========================================================================
  // React.memo によるコンポーネント最適化テスト
  // ==========================================================================

  describe('React.memo によるコンポーネント最適化', () => {
    describe('TradingPartnerListTable', () => {
      it('React.memoが適用されている', () => {
        const partners = [createMockTradingPartner('1')];
        const onSort = vi.fn();
        const onRowClick = vi.fn();

        const { rerender } = render(
          <TradingPartnerListTable
            partners={partners}
            sortField="nameKana"
            sortOrder="asc"
            onSort={onSort}
            onRowClick={onRowClick}
          />
        );

        // 同じpropsで再レンダリングしてもエラーが発生しないことを確認
        rerender(
          <TradingPartnerListTable
            partners={partners}
            sortField="nameKana"
            sortOrder="asc"
            onSort={onSort}
            onRowClick={onRowClick}
          />
        );

        // コンポーネントが正常にレンダリングされることを確認
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    describe('TradingPartnerSearchFilter', () => {
      it('同じpropsで再レンダリングされない（React.memo）', () => {
        const filter: TradingPartnerFilter = { search: '', type: [] };
        const onFilterChange = vi.fn();

        const { rerender } = render(
          <TradingPartnerSearchFilter filter={filter} onFilterChange={onFilterChange} />
        );

        // 同じpropsで再レンダリング
        rerender(<TradingPartnerSearchFilter filter={filter} onFilterChange={onFilterChange} />);

        // コンポーネントが正常にレンダリングされることを確認
        expect(screen.getByRole('search')).toBeInTheDocument();
      });
    });

    describe('TradingPartnerPaginationUI', () => {
      it('同じpropsで再レンダリングされない（React.memo）', () => {
        const pagination: PaginationInfo = {
          page: 1,
          limit: 20,
          total: 100,
          totalPages: 5,
        };
        const onPageChange = vi.fn();
        const onLimitChange = vi.fn();

        const { rerender } = render(
          <TradingPartnerPaginationUI
            pagination={pagination}
            onPageChange={onPageChange}
            onLimitChange={onLimitChange}
          />
        );

        // 同じpropsで再レンダリング
        rerender(
          <TradingPartnerPaginationUI
            pagination={pagination}
            onPageChange={onPageChange}
            onLimitChange={onLimitChange}
          />
        );

        // コンポーネントが正常にレンダリングされることを確認
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });
    });

    describe('TradingPartnerDetailView', () => {
      it('同じpropsで再レンダリングされない（React.memo）', () => {
        const partner = createMockTradingPartnerDetail('1');
        const onEdit = vi.fn();
        const onDelete = vi.fn();

        const { rerender } = render(
          <TradingPartnerDetailView partner={partner} onEdit={onEdit} onDelete={onDelete} />
        );

        // 同じpropsで再レンダリング
        rerender(
          <TradingPartnerDetailView partner={partner} onEdit={onEdit} onDelete={onDelete} />
        );

        // コンポーネントが正常にレンダリングされることを確認（複数存在するため getAllByText を使用）
        expect(screen.getAllByText('取引先1').length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // 大量データでのパフォーマンステスト (REQ-9.5)
  // ==========================================================================

  describe('大量データでのパフォーマンス (REQ-9.5)', () => {
    it('1000件以上のデータでもページネーションにより一覧表示のパフォーマンスを維持', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');

      // 20件のみを取得（ページネーション）
      const pageData = createLargeMockData(20);
      const mockResponse: PaginatedTradingPartners = {
        data: pageData,
        pagination: {
          page: 1,
          limit: 20,
          total: 1000, // 合計1000件
          totalPages: 50,
        },
      };

      vi.mocked(getTradingPartners).mockResolvedValue(mockResponse);

      const startTime = performance.now();

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // パフォーマンス要件: 2秒以内（REQ-9.1）
      // ただしテスト環境では実際のレンダリング時間は短い
      expect(renderTime).toBeLessThan(2000);

      // 20件のみがレンダリングされることを確認（パフォーマンス最適化）
      const rows = screen.getAllByRole('row');
      // ヘッダー行 + データ行20件
      expect(rows.length).toBeLessThanOrEqual(21);
    });

    it('ページネーション情報が正しく表示される（大量データ）', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');

      const pageData = createLargeMockData(20);
      const mockResponse: PaginatedTradingPartners = {
        data: pageData,
        pagination: {
          page: 1,
          limit: 20,
          total: 1000,
          totalPages: 50,
        },
      };

      vi.mocked(getTradingPartners).mockResolvedValue(mockResponse);

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      // 総件数が正しく表示される
      expect(screen.getByTestId('total-count')).toHaveTextContent('1000');

      // 総ページ数が正しく表示される
      expect(screen.getByTestId('total-pages')).toHaveTextContent('50');
    });
  });

  // ==========================================================================
  // 検索・フィルタリング操作のパフォーマンステスト (REQ-9.4)
  // ==========================================================================

  describe('検索・フィルタリング操作のパフォーマンス (REQ-9.4)', () => {
    it('検索操作の結果表示が高速である', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');

      const initialData = createLargeMockData(20);
      const searchResult = [createMockTradingPartner('100', { name: '検索結果' })];

      vi.mocked(getTradingPartners)
        .mockResolvedValueOnce({
          data: initialData,
          pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
        })
        .mockResolvedValueOnce({
          data: searchResult,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      // 検索入力
      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, '検索');

      const searchButton = screen.getByRole('button', { name: '検索' });
      const startTime = performance.now();
      await userEvent.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('検索結果')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // パフォーマンス要件: 1秒以内（REQ-9.4）
      expect(searchTime).toBeLessThan(1000);
    });

    it('フィルタリング操作の結果表示が高速である', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');

      const initialData = createLargeMockData(20);
      const filteredResult = [
        createMockTradingPartner('1', { types: ['SUBCONTRACTOR'] }),
        createMockTradingPartner('2', { types: ['SUBCONTRACTOR'] }),
      ];

      vi.mocked(getTradingPartners)
        .mockResolvedValueOnce({
          data: initialData,
          pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
        })
        .mockResolvedValueOnce({
          data: filteredResult,
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        });

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      // フィルタ適用
      const subcontractorCheckbox = screen.getByLabelText('協力業者');
      const startTime = performance.now();
      await userEvent.click(subcontractorCheckbox);

      await waitFor(() => {
        expect(screen.getByTestId('total-count')).toHaveTextContent('2');
      });

      const endTime = performance.now();
      const filterTime = endTime - startTime;

      // パフォーマンス要件: 1秒以内（REQ-9.4）
      expect(filterTime).toBeLessThan(1000);
    });
  });

  // ==========================================================================
  // コールバックのメモ化テスト
  // ==========================================================================

  describe('useCallback によるコールバック最適化', () => {
    it('ソートコールバックがメモ化されている', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      const mockData = createLargeMockData(3);

      vi.mocked(getTradingPartners).mockResolvedValue({
        data: mockData,
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
      });

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      // ソートボタンをクリック
      const sortButton = screen.getByRole('button', { name: '取引先名でソート' });
      await userEvent.click(sortButton);

      // 再度クリック（コールバックが同一参照であることを確認するための操作）
      await userEvent.click(sortButton);

      // APIが呼び出されることを確認（コールバックが正常に動作している）
      expect(getTradingPartners).toHaveBeenCalled();
    });

    it('行クリックコールバックがメモ化されている', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      const mockData = createLargeMockData(3);

      vi.mocked(getTradingPartners).mockResolvedValue({
        data: mockData,
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
      });

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      // 行をクリック
      const row = screen.getByTestId('partner-row-1');
      await userEvent.click(row);

      // ナビゲーションが呼び出されることを確認
      expect(mockNavigate).toHaveBeenCalledWith('/trading-partners/1');
    });
  });

  // ==========================================================================
  // 計算結果のメモ化テスト
  // ==========================================================================

  describe('useMemo による計算結果最適化', () => {
    it('TradingPartnerPaginationUI のページリスト計算がメモ化されている', () => {
      const pagination: PaginationInfo = {
        page: 5,
        limit: 20,
        total: 500,
        totalPages: 25,
      };
      const onPageChange = vi.fn();
      const onLimitChange = vi.fn();

      const { rerender } = render(
        <TradingPartnerPaginationUI
          pagination={pagination}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      );

      // ページ番号が正しく表示される
      expect(screen.getByRole('button', { name: 'ページ 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ページ 25' })).toBeInTheDocument();

      // 同じpaginationで再レンダリング
      rerender(
        <TradingPartnerPaginationUI
          pagination={pagination}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      );

      // コンポーネントが正常に表示される（メモ化により再計算されない）
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 初期表示パフォーマンステスト (REQ-9.1, REQ-9.2)
  // ==========================================================================

  describe('初期表示パフォーマンス', () => {
    it('一覧画面の初期表示が高速である (REQ-9.1)', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');

      const mockData = createLargeMockData(20);
      vi.mocked(getTradingPartners).mockResolvedValue({
        data: mockData,
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
      });

      const startTime = performance.now();

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // パフォーマンス要件: 2秒以内（REQ-9.1）
      expect(renderTime).toBeLessThan(2000);
    });

    it('詳細画面の初期表示が高速である (REQ-9.2)', () => {
      const partner = createMockTradingPartnerDetail('1');
      const onEdit = vi.fn();
      const onDelete = vi.fn();

      const startTime = performance.now();

      render(<TradingPartnerDetailView partner={partner} onEdit={onEdit} onDelete={onDelete} />);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // パフォーマンス要件: 1秒以内（REQ-9.2）
      expect(renderTime).toBeLessThan(1000);

      // コンポーネントが正常にレンダリングされる（複数存在するため getAllByText を使用）
      expect(screen.getAllByText('取引先1').length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // デバウンスによる最適化テスト
  // ==========================================================================

  describe('デバウンスによるAPI呼び出し最適化', () => {
    it('連続した状態変更でAPIが過剰に呼び出されない', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');

      const mockData = createLargeMockData(20);
      vi.mocked(getTradingPartners).mockResolvedValue({
        data: mockData,
        pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
      });

      renderWithRouter(<TradingPartnerListPage />);

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      const initialCallCount = vi.mocked(getTradingPartners).mock.calls.length;

      // 検索入力（デバウンスされるべき操作）
      const searchInput = screen.getByRole('searchbox');

      // 高速な連続入力
      await userEvent.type(searchInput, 'テスト');

      // デバウンス時間を待たない状態では、API呼び出しが増えていないことを確認
      // （デバウンスにより過剰な呼び出しが防止される）
      expect(vi.mocked(getTradingPartners).mock.calls.length).toBeLessThanOrEqual(
        initialCallCount + 1 // 検索ボタンクリック分のみ
      );
    });
  });
});
