/**
 * @fileoverview 内訳書新規作成ページのテスト
 *
 * Task 17.1: 内訳書新規作成ページの実装
 * Task 19.1: ItemizedStatementCreatePageの単体テスト
 *
 * Requirements:
 * - 15.1: 内訳書新規作成画面を独立したページとして提供する
 * - 15.2: プロジェクト詳細画面に戻るリンクを表示する
 * - 15.3: 内訳書名入力フィールドを表示する
 * - 15.4: 内訳書名フィールドのデフォルト値として「内訳書」を設定する
 * - 15.5: 数量表選択リストを表示する
 * - 15.6: 作成成功時に内訳書詳細画面へ遷移する
 * - 15.7: キャンセル時にプロジェクト詳細画面に遷移する
 * - 9.5: パンくずナビゲーションを表示する
 * - 9.6: パンくず「プロジェクト一覧 > {プロジェクト名} > 内訳書 > 新規作成」形式
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ItemizedStatementCreatePage from '../../pages/ItemizedStatementCreatePage';
import type { ProjectDetail } from '../../types/project.types';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

// ============================================================================
// モックデータ
// ============================================================================

const mockProject: ProjectDetail = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト用プロジェクト説明',
  status: 'SURVEYING',
  statusLabel: '調査中',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'partner-1',
  tradingPartner: {
    id: 'partner-1',
    name: 'テスト取引先',
    nameKana: 'テストトリヒキサキ',
  },
  salesPerson: {
    id: 'user-1',
    displayName: 'テスト担当者',
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-123',
    name: '数量表1',
    groupCount: 2,
    itemCount: 10,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-123',
    name: '数量表2',
    groupCount: 1,
    itemCount: 5,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

// ============================================================================
// モック設定
// ============================================================================

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../api/projects', () => ({
  getProject: vi.fn(),
}));

vi.mock('../../api/quantity-tables', () => ({
  getQuantityTables: vi.fn(),
}));

vi.mock('../../api/itemized-statements', () => ({
  createItemizedStatement: vi.fn(),
}));

// ============================================================================
// テストヘルパー
// ============================================================================

function renderWithRouter(projectId: string = 'project-123', locationState?: { from?: string }) {
  const initialPath = `/projects/${projectId}/itemized-statements/new`;
  const state = locationState ?? undefined;

  return render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
      <Routes>
        <Route
          path="/projects/:projectId/itemized-statements/new"
          element={<ItemizedStatementCreatePage />}
        />
        <Route path="/projects/:id" element={<div>プロジェクト詳細</div>} />
        <Route path="/projects/:projectId/itemized-statements" element={<div>内訳書一覧</div>} />
        <Route path="/itemized-statements/:id" element={<div>内訳書詳細</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// テストスイート
// ============================================================================

describe('ItemizedStatementCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  describe('初期表示', () => {
    it('ローディング状態を表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockImplementation(
        () => new Promise(() => {}) // 永遠に解決しない
      );
      vi.mocked(getQuantityTables).mockImplementation(() => new Promise(() => {}));

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('プロジェクト情報と数量表一覧を取得して表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      // フォームが表示される
      expect(screen.getByLabelText(/内訳書名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/数量表/)).toBeInTheDocument();
    });

    it('プロジェクト取得エラー時にエラーメッセージを表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockRejectedValue(new Error('Network error'));
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/プロジェクトの取得に失敗しました/)).toBeInTheDocument();
    });
  });

  describe('パンくずナビゲーション（REQ-9.5, REQ-9.6）', () => {
    it('「プロジェクト一覧 > {プロジェクト名} > 内訳書 > 新規作成」形式で表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument();
      });

      // パンくずの各要素を確認
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
      expect(screen.getByText('内訳書')).toBeInTheDocument();
      expect(screen.getByText('新規作成')).toBeInTheDocument();
    });
  });

  describe('戻るリンク（REQ-15.2）', () => {
    it('プロジェクト詳細画面へのリンクを表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: /プロジェクト詳細に戻る/ });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/projects/project-123');
    });
  });

  describe('デフォルト名（REQ-15.4、Task 17.3）', () => {
    it('内訳書名フィールドにデフォルト値「内訳書」が設定されている', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/内訳書名/) as HTMLInputElement;
      expect(nameInput.value).toBe('内訳書');
    });
  });

  describe('作成成功時の遷移（REQ-15.6）', () => {
    it('作成成功時に内訳書詳細画面へ遷移する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');
      const { createItemizedStatement } = await import('../../api/itemized-statements');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });
      vi.mocked(createItemizedStatement).mockResolvedValue({
        id: 'is-new-123',
        projectId: 'project-123',
        name: '内訳書',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '数量表1',
        itemCount: 5,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      // 数量表を選択
      const selectElement = screen.getByLabelText(/数量表/) as HTMLSelectElement;
      await user.selectOptions(selectElement, 'qt-1');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/itemized-statements/is-new-123');
      });
    });
  });

  describe('キャンセル時の遷移（REQ-15.7）', () => {
    it('キャンセル時にプロジェクト詳細画面へ遷移する（デフォルト）', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-123');
    });

    it('内訳書一覧画面から遷移した場合、キャンセル時に内訳書一覧画面へ遷移する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      const user = userEvent.setup();
      renderWithRouter('project-123', { from: 'list' });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-123/itemized-statements');
    });
  });

  describe('数量表一覧（REQ-15.5）', () => {
    it('数量表選択リストを表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables,
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      const selectElement = screen.getByLabelText(/数量表/) as HTMLSelectElement;
      expect(selectElement).toBeInTheDocument();

      // 数量表の選択肢を確認
      expect(screen.getByRole('option', { name: '数量表を選択してください' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '数量表1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '数量表2' })).toBeInTheDocument();
    });

    it('数量表がない場合はメッセージを表示する', async () => {
      const { getProject } = await import('../../api/projects');
      const { getQuantityTables } = await import('../../api/quantity-tables');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書を新規作成' })).toBeInTheDocument();
      });

      expect(screen.getByText(/数量表がありません/)).toBeInTheDocument();
    });
  });
});
