/**
 * @fileoverview 取引先一覧ページのテスト
 *
 * Task 9.4: 一覧画面のエラーハンドリング
 *
 * Requirements (trading-partner-management):
 * - REQ-8.1: ネットワークエラー時のエラーメッセージ表示と再試行ボタン
 * - REQ-8.2: サーバーエラー（5xx）時のメッセージ表示
 * - REQ-8.3: セッション期限切れ時のログインページリダイレクト
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TradingPartnerListPage from '../../pages/TradingPartnerListPage';
import type {
  PaginatedTradingPartners,
  TradingPartnerInfo,
} from '../../types/trading-partner.types';
import { ApiError } from '../../api/client';

// APIモック
vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn(),
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

// テストデータ
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

const mockTradingPartners: TradingPartnerInfo[] = [
  createMockTradingPartner('1'),
  createMockTradingPartner('2', { types: ['SUBCONTRACTOR'] }),
  createMockTradingPartner('3', { types: ['CUSTOMER', 'SUBCONTRACTOR'] }),
];

const mockPaginatedResponse: PaginatedTradingPartners = {
  data: mockTradingPartners,
  pagination: {
    page: 1,
    limit: 20,
    total: 3,
    totalPages: 1,
  },
};

const mockEmptyResponse: PaginatedTradingPartners = {
  data: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

describe('TradingPartnerListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ヘルパー関数
  const renderWithRouter = (initialEntries: string[] = ['/trading-partners']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <TradingPartnerListPage />
      </MemoryRouter>
    );
  };

  describe('初期表示', () => {
    it('ローディング中はローディングインジケータを表示する', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPaginatedResponse), 1000))
      );

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('データ取得後、取引先一覧を表示する', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      expect(screen.getByText('取引先2')).toBeInTheDocument();
      expect(screen.getByText('取引先3')).toBeInTheDocument();
    });

    it('ページタイトルと新規作成ボタンを表示する', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '取引先一覧' })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '新規作成' })).toBeInTheDocument();
    });
  });

  describe('空状態', () => {
    it('取引先がない場合、空状態メッセージを表示する', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockResolvedValue(mockEmptyResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('取引先が登録されていません')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 9.4: 一覧画面のエラーハンドリング
  // ==========================================================================

  describe('エラーハンドリング（Task 9.4 / Requirements 8.1, 8.2, 8.3）', () => {
    describe('ネットワークエラー（REQ-8.1）', () => {
      it('ネットワークエラー時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('通信エラーが発生しました。再試行してください。')
          ).toBeInTheDocument();
        });
      });

      it('ネットワークエラー時、再試行ボタンを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
        });
      });

      it('再試行ボタンをクリックするとデータを再取得する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners)
          .mockRejectedValueOnce(networkError)
          .mockResolvedValueOnce(mockPaginatedResponse);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
        });

        const retryButton = screen.getByRole('button', { name: '再試行' });
        await userEvent.click(retryButton);

        await waitFor(() => {
          expect(screen.getByText('取引先1')).toBeInTheDocument();
        });

        expect(getTradingPartners).toHaveBeenCalledTimes(2);
      });

      it('再試行後、ローディング状態を経て正常データを取得する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners)
          .mockRejectedValueOnce(networkError)
          .mockResolvedValueOnce(mockPaginatedResponse);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
        });

        const retryButton = screen.getByRole('button', { name: '再試行' });
        await userEvent.click(retryButton);

        // 再試行後、データが正常に表示される
        await waitFor(() => {
          expect(screen.getByText('取引先1')).toBeInTheDocument();
        });
      });
    });

    describe('サーバーエラー（REQ-8.2）', () => {
      it('サーバーエラー（500）時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const serverError = new ApiError(500, 'Internal Server Error');
        vi.mocked(getTradingPartners).mockRejectedValue(serverError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('システムエラーが発生しました。しばらくしてからお試しください。')
          ).toBeInTheDocument();
        });
      });

      it('サーバーエラー（502）時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const serverError = new ApiError(502, 'Bad Gateway');
        vi.mocked(getTradingPartners).mockRejectedValue(serverError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('システムエラーが発生しました。しばらくしてからお試しください。')
          ).toBeInTheDocument();
        });
      });

      it('サーバーエラー（503）時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const serverError = new ApiError(503, 'Service Unavailable');
        vi.mocked(getTradingPartners).mockRejectedValue(serverError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('システムエラーが発生しました。しばらくしてからお試しください。')
          ).toBeInTheDocument();
        });
      });

      it('サーバーエラー時、再試行ボタンは表示されない', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const serverError = new ApiError(500, 'Internal Server Error');
        vi.mocked(getTradingPartners).mockRejectedValue(serverError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('システムエラーが発生しました。しばらくしてからお試しください。')
          ).toBeInTheDocument();
        });

        // 再試行ボタンは表示されない（サーバーエラーは即座に再試行しても意味がないため）
        expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
      });
    });

    describe('セッション期限切れ（REQ-8.3）', () => {
      it('セッション期限切れ（401）時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const sessionError = new ApiError(401, 'Unauthorized');
        vi.mocked(getTradingPartners).mockRejectedValue(sessionError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('セッションが期限切れになりました。再度ログインしてください。')
          ).toBeInTheDocument();
        });
      });

      it('セッション期限切れ時、ログインページへボタンを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const sessionError = new ApiError(401, 'Unauthorized');
        vi.mocked(getTradingPartners).mockRejectedValue(sessionError);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'ログインページへ' })).toBeInTheDocument();
        });
      });

      it('ログインページへボタンをクリックするとログインページにリダイレクトする', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const sessionError = new ApiError(401, 'Unauthorized');
        vi.mocked(getTradingPartners).mockRejectedValue(sessionError);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'ログインページへ' })).toBeInTheDocument();
        });

        const loginButton = screen.getByRole('button', { name: 'ログインページへ' });
        await userEvent.click(loginButton);

        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });

      it('セッション期限切れ時、再試行ボタンは表示されない', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const sessionError = new ApiError(401, 'Unauthorized');
        vi.mocked(getTradingPartners).mockRejectedValue(sessionError);

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.getByText('セッションが期限切れになりました。再度ログインしてください。')
          ).toBeInTheDocument();
        });

        expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
      });
    });

    describe('エラー表示のアクセシビリティ', () => {
      it('エラーメッセージにrole="alert"が設定される', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          const alert = screen.getByRole('alert');
          expect(alert).toBeInTheDocument();
        });
      });

      it('エラーメッセージにaria-live="assertive"が設定される', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          const alert = screen.getByRole('alert');
          expect(alert).toHaveAttribute('aria-live', 'assertive');
        });
      });

      it('エラーを閉じるボタンにaria-labelが設定される', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          const dismissButton = screen.getByRole('button', { name: '閉じる' });
          expect(dismissButton).toBeInTheDocument();
        });
      });

      it('エラーを閉じるボタンをクリックするとエラーが非表示になる', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('alert')).toBeInTheDocument();
        });

        const dismissButton = screen.getByRole('button', { name: '閉じる' });
        await userEvent.click(dismissButton);

        await waitFor(() => {
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
      });

      it('Escapeキーでエラーを閉じることができる', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const networkError = new ApiError(0, 'Failed to fetch');
        vi.mocked(getTradingPartners).mockRejectedValue(networkError);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('alert')).toBeInTheDocument();
        });

        await userEvent.keyboard('{Escape}');

        await waitFor(() => {
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
      });
    });

    describe('一般的なエラー', () => {
      it('クライアントエラー（400）時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const clientError = new ApiError(400, 'Bad Request');
        vi.mocked(getTradingPartners).mockRejectedValue(clientError);

        renderWithRouter();

        await waitFor(() => {
          // クライアントエラーはAPIから返されたメッセージを表示
          expect(screen.getByText('Bad Request')).toBeInTheDocument();
        });
      });

      it('権限エラー（403）時、エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        const forbiddenError = new ApiError(403, 'Forbidden');
        vi.mocked(getTradingPartners).mockRejectedValue(forbiddenError);

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByText('Forbidden')).toBeInTheDocument();
        });
      });

      it('不明なエラー時、汎用エラーメッセージを表示する', async () => {
        const { getTradingPartners } = await import('../../api/trading-partners');
        vi.mocked(getTradingPartners).mockRejectedValue(new Error('Unknown error'));

        renderWithRouter();

        await waitFor(() => {
          // 一般的なErrorの場合はエラーメッセージがそのまま表示される
          expect(screen.getByText('Unknown error')).toBeInTheDocument();
        });
      });
    });
  });

  describe('ナビゲーション', () => {
    it('新規作成ボタンをクリックするとフォーム画面へ遷移する', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '新規作成' })).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: '新規作成' });
      await userEvent.click(createButton);

      expect(mockNavigate).toHaveBeenCalledWith('/trading-partners/new');
    });

    it('取引先行をクリックすると詳細ページへ遷移する', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('取引先1')).toBeInTheDocument();
      });

      const row = screen.getByTestId('partner-row-1');
      await userEvent.click(row);

      expect(mockNavigate).toHaveBeenCalledWith('/trading-partners/1');
    });
  });

  describe('アクセシビリティ', () => {
    it('ページ全体にmain要素がある', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockResolvedValue(mockPaginatedResponse);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('ローディング時にaria-busy属性が設定される', async () => {
      const { getTradingPartners } = await import('../../api/trading-partners');
      vi.mocked(getTradingPartners).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPaginatedResponse), 1000))
      );

      renderWithRouter();

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('aria-busy', 'true');
    });
  });
});
