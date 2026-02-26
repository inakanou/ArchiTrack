/**
 * @fileoverview EstimateRequestCreatePage単体テスト
 *
 * Task 6.1: EstimateRequestCreatePageの実装
 *
 * Requirements:
 * - 3.6: ユーザーが必須項目を入力して保存したとき、見積依頼を作成し詳細画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestCreatePage from './EstimateRequestCreatePage';

// Mock modules
vi.mock('../api/estimate-requests', () => ({
  createEstimateRequest: vi.fn(),
}));

vi.mock('../api/projects', () => ({
  getProject: vi.fn().mockResolvedValue({ name: 'テストプロジェクト' }),
}));

vi.mock('../api/trading-partners', () => ({
  getTradingPartners: vi.fn().mockResolvedValue({
    data: [
      { id: 'tp-1', name: '協力業者A', types: ['SUBCONTRACTOR'] },
      { id: 'tp-2', name: '協力業者B', types: ['SUBCONTRACTOR'] },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  }),
}));

vi.mock('../api/itemized-statements', () => ({
  getItemizedStatements: vi.fn().mockResolvedValue({
    data: [
      { id: 'is-1', name: '内訳書1', itemCount: 10 },
      { id: 'is-2', name: '内訳書2', itemCount: 5 },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  }),
}));

import { getProject } from '../api/projects';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('EstimateRequestCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test: ページ見出しが表示されること
   * Requirements: 3.6
   */
  it('ページ見出しが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-123/estimate-requests/new']}>
        <Routes>
          <Route
            path="/projects/:projectId/estimate-requests/new"
            element={<EstimateRequestCreatePage />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '見積依頼 新規作成' })).toBeInTheDocument();
    });
  });

  /**
   * Test: パンくずナビゲーションが表示されること
   */
  it('パンくずナビゲーションが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-123/estimate-requests/new']}>
        <Routes>
          <Route
            path="/projects/:projectId/estimate-requests/new"
            element={<EstimateRequestCreatePage />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // パンくずに「見積依頼一覧」が含まれる
      expect(screen.getByText('見積依頼一覧')).toBeInTheDocument();
    });
  });

  /**
   * Test: EstimateRequestFormが表示されること
   */
  it('EstimateRequestFormが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-123/estimate-requests/new']}>
        <Routes>
          <Route
            path="/projects/:projectId/estimate-requests/new"
            element={<EstimateRequestCreatePage />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // フォームの存在を確認（見積依頼名入力フィールド）
      expect(screen.getByLabelText(/見積依頼名/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 67.2: パンくずナビゲーション改善テスト (Requirements: 29.6-29.12)
  // ==========================================================================
  describe('パンくずナビゲーション改善 (Task 67.2)', () => {
    const renderPage = () => {
      return render(
        <MemoryRouter initialEntries={['/projects/project-123/estimate-requests/new']}>
          <Routes>
            <Route
              path="/projects/:projectId/estimate-requests/new"
              element={<EstimateRequestCreatePage />}
            />
          </Routes>
        </MemoryRouter>
      );
    };

    it('パンくず先頭に「ダッシュボード」リンク（/）が表示される（Requirements: 29.6, 29.7）', async () => {
      renderPage();

      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toBeInTheDocument();
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('パンくずに「プロジェクト一覧」リンク（/projects）が表示される（Requirements: 29.8）', async () => {
      renderPage();

      await waitFor(() => {
        const projectsLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toBeInTheDocument();
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('パンくずにプロジェクト名がプロジェクト詳細へのリンクとして表示される（Requirements: 29.9）', async () => {
      renderPage();

      await waitFor(() => {
        const projectLink = screen.getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toBeInTheDocument();
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('パンくずに「見積依頼一覧」が見積依頼一覧画面へのリンクとして表示される（Requirements: 29.10）', async () => {
      renderPage();

      await waitFor(() => {
        const listLink = screen.getByRole('link', { name: '見積依頼一覧' });
        expect(listLink).toBeInTheDocument();
        expect(listLink).toHaveAttribute('href', '/projects/project-123/estimate-requests');
      });
    });

    it('パンくずの最後に「新規作成」がリンクなしで表示される（Requirements: 29.11）', async () => {
      renderPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toHaveTextContent('新規作成');
        // 「新規作成」はリンクではない
        const links = nav.querySelectorAll('a');
        const createLink = Array.from(links).find((link) => link.textContent === '新規作成');
        expect(createLink).toBeUndefined();
      });
    });

    it('「← 一覧に戻る」リンクが存在しない（Requirements: 29.12）', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '見積依頼 新規作成' })).toBeInTheDocument();
      });

      // 「← 一覧に戻る」リンクが存在しないことを確認
      expect(screen.queryByRole('link', { name: /一覧に戻る/i })).not.toBeInTheDocument();
    });

    it('getProject APIが呼び出される', async () => {
      renderPage();

      await waitFor(() => {
        expect(getProject).toHaveBeenCalledWith('project-123');
      });
    });
  });
});
