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
   * Test: 戻るリンクが表示されること
   */
  it('戻るリンクが表示されること', async () => {
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
      expect(screen.getByRole('link', { name: /一覧に戻る/i })).toBeInTheDocument();
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
});
