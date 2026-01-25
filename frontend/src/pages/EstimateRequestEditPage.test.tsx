/**
 * @fileoverview EstimateRequestEditPage単体テスト
 *
 * Task 6.3: EstimateRequestEditPageの実装
 *
 * Requirements:
 * - 9.3: ユーザーが編集ボタンをクリックしたとき、見積依頼の名前・宛先・内訳書を編集可能にする
 * - 9.6: ユーザーが編集内容を保存したとき、変更を保存し詳細画面を更新する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestEditPage from './EstimateRequestEditPage';

// Mock modules (must be before any mock data because of hoisting)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/estimate-requests', () => ({
  getEstimateRequestDetail: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
  updateEstimateRequest: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
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

describe('EstimateRequestEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test: ページ見出しが表示されること
   * Requirements: 9.3
   */
  it('ページ見出しが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '見積依頼 編集' })).toBeInTheDocument();
    });
  });

  /**
   * Test: パンくずナビゲーションが表示されること
   */
  it('パンくずナビゲーションが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // パンくずに「見積依頼詳細」が含まれる
      expect(screen.getByText(/見積依頼詳細/i)).toBeInTheDocument();
    });
  });

  /**
   * Test: 戻るリンクが表示されること
   */
  it('戻るリンクが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /詳細に戻る/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: 名前フィールドに既存値が入力されていること
   * Requirements: 9.3
   */
  it('名前フィールドに既存値が入力されていること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/名前/) as HTMLInputElement;
      expect(nameInput.value).toBe('テスト見積依頼');
    });
  });

  /**
   * Test: 更新ボタンが表示されること
   */
  it('更新ボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /更新/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: キャンセルボタンが表示されること
   */
  it('キャンセルボタンが表示されること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });
  });

  /**
   * Test: キャンセルクリックで詳細画面に戻ること
   */
  it('キャンセルクリックで詳細画面に戻ること', async () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /キャンセル/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/estimate-requests/er-123');
    });
  });

  /**
   * Test: ローディング状態が表示されること
   */
  it('ローディング状態が表示されること', () => {
    render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
  });
});
