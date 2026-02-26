/**
 * @fileoverview EstimateListPage テスト
 *
 * Task 11.1: EstimateListPageの実装
 *
 * Requirements (estimate-creation):
 * - REQ-11.1: プロジェクトに紐付く見積書の一覧を表示する
 * - REQ-14.1: 見積書一覧画面を提供する
 * - REQ-14.2: 見積書の一覧をカード形式で表示する
 * - REQ-14.3: 見積書名、作成日時、合計金額を表示する
 * - REQ-14.4: 見積書カードクリックで詳細画面へ遷移
 * - REQ-14.5: 新規作成ボタンを提供する
 * - REQ-14.6: ページネーションを提供する
 * - REQ-14.7: 見積書が存在しない場合のメッセージ表示
 * - REQ-15.1-15.3: パンくずナビゲーション
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateListPage from './EstimateListPage';
import * as estimatesApi from '../api/estimates';

// モック
vi.mock('../api/estimates');

const mockEstimates = [
  {
    id: 'est-001',
    projectId: 'proj-001',
    name: 'テスト見積書1',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 'est-002',
    projectId: 'proj-001',
    name: 'テスト見積書2',
    sourceItemizedStatementId: 'is-001',
    sourceItemizedStatementName: '内訳書A',
    createdAt: '2024-01-16T10:00:00.000Z',
    updatedAt: '2024-01-16T10:00:00.000Z',
  },
];

const mockPagination = {
  page: 1,
  limit: 20,
  total: 2,
  totalPages: 1,
};

describe('EstimateListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * REQ-14.1: 見積書一覧画面を提供する
   */
  it('見積書一覧画面が正しくレンダリングされる', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-list-page')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: '見積書一覧' })).toBeInTheDocument();
  });

  /**
   * REQ-14.2: 見積書の一覧をカード形式で表示する
   */
  it('見積書一覧をカード形式で表示する', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-card-est-001')).toBeInTheDocument();
      expect(screen.getByTestId('estimate-card-est-002')).toBeInTheDocument();
    });
  });

  /**
   * REQ-14.3: 見積書名、作成日時、合計金額を表示する
   */
  it('見積書名と作成日時を表示する', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('テスト見積書1')).toBeInTheDocument();
      expect(screen.getByText('テスト見積書2')).toBeInTheDocument();
    });

    // 日付形式の確認
    expect(screen.getByText(/2024年1月15日/)).toBeInTheDocument();
  });

  /**
   * REQ-14.4: 見積書カードクリックで詳細画面へ遷移
   */
  it('見積書カードにリンクが設定されている', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const card = screen.getByTestId('estimate-card-est-001');
      expect(card).toHaveAttribute('href', '/estimates/est-001');
    });
  });

  /**
   * REQ-14.5: 新規作成ボタンを提供する
   */
  it('新規作成ボタンが表示される', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveAttribute('href', '/projects/proj-001/estimates/new');
    });
  });

  /**
   * REQ-14.6: ページネーションを提供する
   */
  it('ページネーションが表示される', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: { ...mockPagination, total: 50, totalPages: 3 },
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // PaginationUIコンポーネントが表示されることを確認
      expect(screen.getByText('全50件')).toBeInTheDocument();
    });
  });

  /**
   * REQ-14.7: 見積書が存在しない場合のメッセージ表示
   */
  it('見積書が存在しない場合、空状態メッセージを表示する', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('見積書はまだありません')).toBeInTheDocument();
    });

    // 空状態では複数の新規作成リンクがある（ヘッダーとEmptyState内）
    const createButtons = screen.getAllByRole('link', { name: /新規作成/i });
    expect(createButtons.length).toBeGreaterThan(0);
  });

  /**
   * REQ-15.1-15.4, REQ-15.11, REQ-15.12: パンくずナビゲーション（Task 43.1更新）
   * パンくず: ダッシュボード > プロジェクト一覧 > プロジェクト > 見積書一覧
   */
  it('パンくずナビゲーションを「ダッシュボード > プロジェクト一覧 > プロジェクト > 見積書一覧」形式で表示する', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    // ローディングが完了するまで待機
    await waitFor(() => {
      expect(screen.getByTestId('estimate-list-page')).toBeInTheDocument();
    });

    // パンくずナビゲーションが存在すること
    const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    expect(breadcrumb).toBeInTheDocument();

    // パンくずアイテムの確認（ダッシュボード起点）
    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
    // 「プロジェクト」はexactマッチで確認（「プロジェクト一覧」と区別）
    const breadcrumbItems = breadcrumb.querySelectorAll('li');
    const labels = Array.from(breadcrumbItems).map((li) =>
      li.textContent?.replace(/^>\s*/, '').trim()
    );
    expect(labels).toContain('プロジェクト');
    // 見積書一覧は現在ページなのでaria-current="page"の要素として表示される
    expect(labels).toContain('見積書一覧');

    // 「プロジェクト詳細」ラベルが存在しないこと
    expect(labels).not.toContain('プロジェクト詳細');
  });

  /**
   * REQ-15.12: 「← プロジェクト詳細に戻る」リンクが存在しないこと（Task 43.1）
   */
  it('「← プロジェクト詳細に戻る」リンクが存在しない', async () => {
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: mockEstimates,
      pagination: mockPagination,
    });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-list-page')).toBeInTheDocument();
    });

    // 「← プロジェクト詳細に戻る」リンクが存在しないこと
    expect(screen.queryByText('← プロジェクト詳細に戻る')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('プロジェクト詳細に戻る')).not.toBeInTheDocument();
  });

  /**
   * ローディング状態のテスト
   */
  it('ローディング中はスピナーを表示する', async () => {
    vi.mocked(estimatesApi.getEstimates).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * エラー状態のテスト
   */
  it('エラー時はエラーメッセージと再試行ボタンを表示する', async () => {
    vi.mocked(estimatesApi.getEstimates).mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('見積書の取得に失敗しました')).toBeInTheDocument();
    });

    // 再試行ボタン
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  /**
   * 再試行機能のテスト
   */
  it('再試行ボタンクリックでAPIを再呼び出しする', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.getEstimates)
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        data: mockEstimates,
        pagination: mockPagination,
      });

    render(
      <MemoryRouter initialEntries={['/projects/proj-001/estimates']}>
        <Routes>
          <Route path="/projects/:projectId/estimates" element={<EstimateListPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: '再試行' });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('テスト見積書1')).toBeInTheDocument();
    });

    expect(estimatesApi.getEstimates).toHaveBeenCalledTimes(2);
  });
});
