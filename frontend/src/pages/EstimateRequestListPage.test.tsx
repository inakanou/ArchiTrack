/**
 * @fileoverview EstimateRequestListPageコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.2: EstimateRequestListPageコンポーネントを実装する
 *
 * Requirements:
 * - 2.1: プロジェクトに関連する見積依頼一覧を表示する
 * - 2.2: 見積依頼が存在しない場合「見積依頼はまだありません」メッセージを表示する
 * - 2.3: 見積依頼一覧の各行をクリックすると見積依頼詳細画面に遷移する
 * - 2.4: 一覧に見積依頼の名前、宛先、見積依頼方法、参照内訳書名、作成日時を表示
 * - 2.5: 新規作成ボタンをクリックすると見積依頼作成画面に遷移する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestListPage from './EstimateRequestListPage';
import type { PaginatedEstimateRequests } from '../types/estimate-request.types';

// APIモック
vi.mock('../api/estimate-requests', () => ({
  getEstimateRequests: vi.fn(),
}));

vi.mock('../api/projects', () => ({
  getProject: vi.fn(),
}));

import { getEstimateRequests } from '../api/estimate-requests';
import { getProject } from '../api/projects';

// モックデータ
const mockEstimateRequests: PaginatedEstimateRequests = {
  data: [
    {
      id: 'request-1',
      projectId: 'project-123',
      tradingPartnerId: 'partner-1',
      tradingPartnerName: '株式会社ABC工業',
      itemizedStatementId: 'statement-1',
      itemizedStatementName: '第1回見積内訳書',
      name: '見積依頼#1',
      method: 'EMAIL',
      includeBreakdownInBody: false,
      createdAt: '2024-05-15T00:00:00.000Z',
      updatedAt: '2024-05-15T00:00:00.000Z',
    },
    {
      id: 'request-2',
      projectId: 'project-123',
      tradingPartnerId: 'partner-2',
      tradingPartnerName: '有限会社XYZ建設',
      itemizedStatementId: 'statement-1',
      itemizedStatementName: '第1回見積内訳書',
      name: '見積依頼#2',
      method: 'FAX',
      includeBreakdownInBody: true,
      createdAt: '2024-05-14T00:00:00.000Z',
      updatedAt: '2024-05-14T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  },
};

const emptyMockData: PaginatedEstimateRequests = {
  data: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

// テスト用レンダリングヘルパー
const renderWithRouter = (projectId = 'project-123') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/estimate-requests`]}>
      <Routes>
        <Route
          path="/projects/:projectId/estimate-requests"
          element={<EstimateRequestListPage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

describe('EstimateRequestListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('データ取得と表示', () => {
    it('見積依頼一覧を表示する（Requirements: 2.1）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('見積依頼#1')).toBeInTheDocument();
        expect(screen.getByText('見積依頼#2')).toBeInTheDocument();
      });
    });

    it('取引先名を表示する（Requirements: 2.4）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/株式会社ABC工業/)).toBeInTheDocument();
        expect(screen.getByText(/有限会社XYZ建設/)).toBeInTheDocument();
      });
    });

    it('見積依頼方法を表示する（Requirements: 2.4）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/メール/)).toBeInTheDocument();
        expect(screen.getByText(/FAX/)).toBeInTheDocument();
      });
    });

    it('内訳書名を表示する（Requirements: 2.4）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText(/第1回見積内訳書/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('作成日時を表示する（Requirements: 2.4）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
        expect(screen.getByText(/2024年5月14日/)).toBeInTheDocument();
      });
    });

    it('総件数を表示する', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/全2件/)).toBeInTheDocument();
      });
    });
  });

  describe('空状態', () => {
    it('見積依頼が0件の場合はメッセージを表示する（Requirements: 2.2）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(emptyMockData);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/見積依頼はまだありません/)).toBeInTheDocument();
      });
    });
  });

  describe('ナビゲーション', () => {
    it('見積依頼カードが詳細画面への遷移リンクを持つ（Requirements: 2.3）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        const link = screen.getByLabelText('見積依頼#1の見積依頼詳細を見る');
        expect(link).toHaveAttribute('href', '/estimate-requests/request-1');
      });
    });

    it('新規作成ボタンが見積依頼作成画面へのリンクを持つ（Requirements: 2.5）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /新規作成/ });
        expect(link).toHaveAttribute('href', '/projects/project-123/estimate-requests/new');
      });
    });

    it('プロジェクト詳細への戻るリンクを表示する', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        const link = screen.getByLabelText('プロジェクト詳細に戻る');
        expect(link).toHaveAttribute('href', '/projects/project-123');
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスピナーを表示する', () => {
      vi.mocked(getEstimateRequests).mockImplementation(() => new Promise(() => {})); // never resolves

      renderWithRouter();

      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時はエラーメッセージを表示する', async () => {
      vi.mocked(getEstimateRequests).mockRejectedValue(new Error('Network error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/見積依頼の取得に失敗しました/)).toBeInTheDocument();
      });
    });

    it('エラー時は再試行ボタンを表示する', async () => {
      vi.mocked(getEstimateRequests).mockRejectedValue(new Error('Network error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });
    });
  });

  describe('ページヘッダー', () => {
    it('ページタイトルを表示する', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);
      vi.mocked(getProject).mockResolvedValue({ name: 'テストプロジェクト' } as ReturnType<
        typeof getProject
      > extends Promise<infer T>
        ? T
        : never);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '見積依頼一覧' })).toBeInTheDocument();
      });
    });

    it('パンくずナビゲーションを表示する', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);
      vi.mocked(getProject).mockResolvedValue({ name: 'テストプロジェクト' } as ReturnType<
        typeof getProject
      > extends Promise<infer T>
        ? T
        : never);

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
        ).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 67.1: パンくずナビゲーション改善テスト (Requirements: 29.1-29.5)
  // ==========================================================================
  describe('パンくずナビゲーション改善 (Task 67.1)', () => {
    beforeEach(() => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);
      vi.mocked(getProject).mockResolvedValue({ name: 'テストプロジェクト' } as ReturnType<
        typeof getProject
      > extends Promise<infer T>
        ? T
        : never);
    });

    it('パンくず先頭に「ダッシュボード」リンク（/）が表示される（Requirements: 29.1, 29.2）', async () => {
      renderWithRouter();

      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toBeInTheDocument();
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('パンくずに「プロジェクト一覧」リンク（/projects）が表示される（Requirements: 29.3）', async () => {
      renderWithRouter();

      await waitFor(() => {
        const projectsLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toBeInTheDocument();
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('パンくずにプロジェクト名がプロジェクト詳細へのリンクとして表示される（Requirements: 29.4）', async () => {
      renderWithRouter();

      await waitFor(() => {
        const projectLink = screen.getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toBeInTheDocument();
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('パンくずの最後に「見積依頼一覧」がリンクなしで表示される（Requirements: 29.5）', async () => {
      renderWithRouter();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        // 「見積依頼一覧」がパンくず内に存在する
        expect(nav).toHaveTextContent('見積依頼一覧');
        // 「見積依頼一覧」はリンクではない（現在のページ）
        const links = nav.querySelectorAll('a');
        const estimateListLink = Array.from(links).find(
          (link) => link.textContent === '見積依頼一覧'
        );
        expect(estimateListLink).toBeUndefined();
      });
    });

    it('プロジェクト名取得前はフォールバック「プロジェクト」を表示する（Requirements: 29.4）', async () => {
      vi.mocked(getProject).mockResolvedValue({ name: '' } as ReturnType<
        typeof getProject
      > extends Promise<infer T>
        ? T
        : never);

      renderWithRouter();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toHaveTextContent('プロジェクト');
      });
    });

    it('getProject APIが呼び出される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(getProject).toHaveBeenCalledWith('project-123');
      });
    });
  });

  // ==========================================================================
  // Task 84.2: 内訳書未紐付け（null）時のフォールバック表示 (Requirements: 39.6, 39.12)
  // ==========================================================================
  describe('内訳書未紐付け時のフォールバック表示 (Task 84.2)', () => {
    it('itemizedStatementName が null の場合、参照内訳書名列に「-」を表示する（Requirements: 39.6）', async () => {
      const dataWithNullItemized: PaginatedEstimateRequests = {
        data: [
          {
            id: 'request-null',
            projectId: 'project-123',
            tradingPartnerId: 'partner-1',
            tradingPartnerName: '株式会社ABC工業',
            itemizedStatementId: null,
            itemizedStatementName: null,
            name: '内訳書なし見積依頼',
            method: 'EMAIL',
            includeBreakdownInBody: false,
            createdAt: '2024-05-15T00:00:00.000Z',
            updatedAt: '2024-05-15T00:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      };

      vi.mocked(getEstimateRequests).mockResolvedValue(dataWithNullItemized);

      renderWithRouter();

      await waitFor(() => {
        const card = screen.getByTestId('request-card-request-null');
        // メタ行に「-」が含まれること（参照内訳書名列のフォールバック）
        expect(card).toHaveTextContent(/メール\s*\/\s*-/);
      });
    });

    it('itemizedStatementName が存在する場合は内訳書名を表示し変更しない（Requirements: 39.12）', async () => {
      vi.mocked(getEstimateRequests).mockResolvedValue(mockEstimateRequests);

      renderWithRouter();

      await waitFor(() => {
        // 既存の表示挙動が維持されていること
        expect(screen.getAllByText(/第1回見積内訳書/).length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
