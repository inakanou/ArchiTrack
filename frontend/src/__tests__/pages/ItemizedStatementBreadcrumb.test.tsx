/**
 * @fileoverview 内訳書画面パンくずナビゲーション更新テスト
 *
 * Task 20.4: パンくずナビゲーション更新のテスト
 *
 * Requirements:
 * - 9.1: 内訳書一覧画面のパンくず「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 内訳書一覧」
 * - 9.2: 内訳書新規作成画面のパンくず「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 内訳書一覧 > 新規作成」
 * - 9.3: 内訳書詳細画面のパンくず「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 内訳書一覧 > {内訳書名}」
 * - 9.4: 「ダッシュボード」リンクはダッシュボード画面（/）へ遷移する
 * - 9.5: 「プロジェクト一覧」リンクはプロジェクト一覧画面（/projects）へ遷移する
 * - 9.6: 「{プロジェクト名}」リンクはプロジェクト詳細画面（/projects/:projectId）へ遷移する
 * - 9.7: 「内訳書一覧」リンクは内訳書一覧画面（/projects/:projectId/itemized-statements）へ遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ItemizedStatementListPage from '../../pages/ItemizedStatementListPage';
import ItemizedStatementCreatePage from '../../pages/ItemizedStatementCreatePage';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

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

vi.mock('../../api/itemized-statements', () => ({
  getItemizedStatements: vi.fn(),
  getItemizedStatementDetail: vi.fn(),
  deleteItemizedStatement: vi.fn(),
  createItemizedStatement: vi.fn(),
}));

vi.mock('../../api/quantity-tables', () => ({
  getQuantityTables: vi.fn(),
}));

vi.mock('../../api/projects', () => ({
  getProject: vi.fn(),
}));

// ============================================================================
// モックデータ
// ============================================================================

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト用プロジェクト説明',
  status: 'SURVEYING' as const,
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

const mockQuantityTables = {
  data: [
    {
      id: 'qt-1',
      projectId: 'project-123',
      name: '数量表1',
      groupCount: 2,
      itemCount: 10,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

const mockItemizedStatements = {
  data: [
    {
      id: 'statement-1',
      name: 'テスト内訳書1',
      projectId: 'project-123',
      sourceQuantityTableId: 'qt-1',
      sourceQuantityTableName: 'テスト数量表',
      itemCount: 10,
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const mockStatementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-123',
  project: {
    id: 'project-123',
    name: 'テストプロジェクト',
  },
  name: 'テスト内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 1,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      customCategory: '分類A',
      workType: '工種1',
      name: '名称1',
      specification: '規格1',
      unit: '本',
      quantity: 10.5,
    },
  ],
};

// ============================================================================
// テストスイート
// ============================================================================

describe('Task 20.4: パンくずナビゲーション更新テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 20.1: 内訳書一覧画面のパンくずナビゲーション
  // ==========================================================================
  describe('20.1: 内訳書一覧画面のパンくずナビゲーション (REQ-9.1)', () => {
    const renderListPage = async () => {
      const { getItemizedStatements } = await import('../../api/itemized-statements');
      const { getQuantityTables } = await import('../../api/quantity-tables');
      const { getProject } = await import('../../api/projects');

      vi.mocked(getItemizedStatements).mockResolvedValue(mockItemizedStatements);
      vi.mocked(getQuantityTables).mockResolvedValue(mockQuantityTables);
      vi.mocked(getProject).mockResolvedValue(mockProject);

      return render(
        <MemoryRouter initialEntries={['/projects/project-123/itemized-statements']}>
          <Routes>
            <Route
              path="/projects/:projectId/itemized-statements"
              element={<ItemizedStatementListPage />}
            />
          </Routes>
        </MemoryRouter>
      );
    };

    it('パンくずに「ダッシュボード」リンクが表示され、/へのリンクであること (REQ-9.4)', async () => {
      await renderListPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const dashboardLink = within(nav).getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('パンくずに「プロジェクト一覧」リンクが表示され、/projectsへのリンクであること (REQ-9.5)', async () => {
      await renderListPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectsLink = within(nav).getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('パンくずに「{プロジェクト名}」リンクが表示され、/projects/:projectIdへのリンクであること (REQ-9.6)', async () => {
      await renderListPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectLink = within(nav).getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('パンくずの最後に「内訳書一覧」がリンクなしで表示されること (REQ-9.1)', async () => {
      await renderListPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toBeInTheDocument();
      });

      // 「内訳書一覧」はリンクではない（current page）
      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).queryByRole('link', { name: '内訳書一覧' })).not.toBeInTheDocument();
      // テキストとしては存在する
      expect(within(nav).getByText('内訳書一覧')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 20.2: 内訳書新規作成画面のパンくずナビゲーション
  // ==========================================================================
  describe('20.2: 内訳書新規作成画面のパンくずナビゲーション (REQ-9.2)', () => {
    const renderCreatePage = async () => {
      const { getQuantityTables } = await import('../../api/quantity-tables');
      const { getProject } = await import('../../api/projects');

      vi.mocked(getProject).mockResolvedValue(mockProject);
      vi.mocked(getQuantityTables).mockResolvedValue({
        data: mockQuantityTables.data,
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      return render(
        <MemoryRouter initialEntries={['/projects/project-123/itemized-statements/new']}>
          <Routes>
            <Route
              path="/projects/:projectId/itemized-statements/new"
              element={<ItemizedStatementCreatePage />}
            />
          </Routes>
        </MemoryRouter>
      );
    };

    it('パンくずに「ダッシュボード」リンクが表示され、/へのリンクであること (REQ-9.4)', async () => {
      await renderCreatePage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const dashboardLink = within(nav).getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('パンくずに「プロジェクト一覧」リンクが表示され、/projectsへのリンクであること (REQ-9.5)', async () => {
      await renderCreatePage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectsLink = within(nav).getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('パンくずに「{プロジェクト名}」リンクが表示され、/projects/:projectIdへのリンクであること (REQ-9.6)', async () => {
      await renderCreatePage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectLink = within(nav).getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('パンくずに「内訳書一覧」リンクが表示され、/projects/:projectId/itemized-statementsへのリンクであること (REQ-9.7)', async () => {
      await renderCreatePage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const listLink = within(nav).getByRole('link', { name: '内訳書一覧' });
        expect(listLink).toHaveAttribute('href', '/projects/project-123/itemized-statements');
      });
    });

    it('パンくずの最後に「新規作成」がリンクなしで表示されること (REQ-9.2)', async () => {
      await renderCreatePage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).queryByRole('link', { name: '新規作成' })).not.toBeInTheDocument();
      expect(within(nav).getByText('新規作成')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 20.3: 内訳書詳細画面のパンくずナビゲーション
  // ==========================================================================
  describe('20.3: 内訳書詳細画面のパンくずナビゲーション (REQ-9.3)', () => {
    const renderDetailPage = async () => {
      const { getItemizedStatementDetail } = await import('../../api/itemized-statements');

      vi.mocked(getItemizedStatementDetail).mockResolvedValue(mockStatementDetail);

      return render(
        <MemoryRouter initialEntries={['/itemized-statements/statement-1']}>
          <Routes>
            <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    };

    it('パンくずに「ダッシュボード」リンクが表示され、/へのリンクであること (REQ-9.4)', async () => {
      await renderDetailPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const dashboardLink = within(nav).getByRole('link', { name: 'ダッシュボード' });
        expect(dashboardLink).toHaveAttribute('href', '/');
      });
    });

    it('パンくずに「プロジェクト一覧」リンクが表示され、/projectsへのリンクであること (REQ-9.5)', async () => {
      await renderDetailPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectsLink = within(nav).getByRole('link', { name: 'プロジェクト一覧' });
        expect(projectsLink).toHaveAttribute('href', '/projects');
      });
    });

    it('パンくずに「{プロジェクト名}」リンクが表示され、/projects/:projectIdへのリンクであること (REQ-9.6)', async () => {
      await renderDetailPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectLink = within(nav).getByRole('link', { name: 'テストプロジェクト' });
        expect(projectLink).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('パンくずに「内訳書一覧」リンクが表示され、/projects/:projectId/itemized-statementsへのリンクであること (REQ-9.7)', async () => {
      await renderDetailPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const listLink = within(nav).getByRole('link', { name: '内訳書一覧' });
        expect(listLink).toHaveAttribute('href', '/projects/project-123/itemized-statements');
      });
    });

    it('パンくずの最後に「{内訳書名}」がリンクなしで表示されること (REQ-9.3)', async () => {
      await renderDetailPage();

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).queryByRole('link', { name: 'テスト内訳書' })).not.toBeInTheDocument();
      expect(within(nav).getByText('テスト内訳書')).toBeInTheDocument();
    });
  });
});
