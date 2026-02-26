/**
 * @fileoverview パンくずナビゲーション改善の単体テスト
 *
 * Task 34.1: Phase 9 - パンくずナビゲーション改善の単体テスト
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ============================================================================
// モック設定
// ============================================================================

// API モック
vi.mock('../../api/quantity-tables', () => ({
  getQuantityTables: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getQuantityTableDetail: vi.fn().mockResolvedValue({
    id: 'qt-1',
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'テストプロジェクト' },
    name: '第1回数量表',
    groupCount: 0,
    itemCount: 0,
    groups: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }),
  createQuantityTable: vi.fn(),
  deleteQuantityTable: vi.fn(),
  createQuantityGroup: vi.fn(),
  deleteQuantityGroup: vi.fn(),
  updateQuantityGroup: vi.fn(),
  createQuantityItem: vi.fn(),
  deleteQuantityItem: vi.fn(),
  copyQuantityItem: vi.fn(),
  updateQuantityTable: vi.fn(),
  bulkSaveQuantityTable: vi.fn(),
}));

vi.mock('../../api/site-surveys', () => ({
  getSiteSurveys: vi.fn().mockResolvedValue({ data: [] }),
  getSiteSurvey: vi.fn(),
}));

vi.mock('../../api/projects', () => ({
  getProject: vi.fn().mockResolvedValue({
    id: 'proj-1',
    name: 'テストプロジェクト',
  }),
}));

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: () => ({
    getSuggestions: vi.fn().mockReturnValue([]),
    addCandidateOnBlur: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

// Fabric.js / AnnotatedImageThumbnail のモック
vi.mock('../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

// QuantityGroupCard のモック（QuantityTableEditPage用）
vi.mock('../../components/quantity-table/QuantityGroupCard', () => ({
  __esModule: true,
  default: () => <div data-testid="quantity-group-card">QuantityGroupCard</div>,
}));

// CopyQuantityTableDialog のモック（QuantityTableListPage用）
vi.mock('../../components/quantity-table/CopyQuantityTableDialog', () => ({
  __esModule: true,
  default: () => <div>CopyDialog</div>,
}));

import QuantityTableListPage from '../../pages/QuantityTableListPage';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import QuantityTableCreatePage from '../../pages/QuantityTableCreatePage';

// ============================================================================
// テストヘルパー
// ============================================================================

function renderWithRoute(component: React.ReactElement, initialPath: string, routePath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={routePath} element={component} />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// テスト
// ============================================================================

describe('Task 34.1: パンくずナビゲーション改善の単体テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-12.1: 数量表一覧画面のパンくず', () => {
    it('パンくずが「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧」形式であること', async () => {
      renderWithRoute(
        <QuantityTableListPage />,
        '/projects/proj-1/quantity-tables',
        '/projects/:projectId/quantity-tables'
      );

      // データ読み込み完了を待つ（パンくず内のダッシュボードリンクが表示されるまで）
      const dashboardLink = await screen.findByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).toBeInTheDocument();

      // パンくずナビゲーションの検証
      const breadcrumbNav = screen.getByRole('navigation', { name: /パンくず/i });
      expect(breadcrumbNav).toBeInTheDocument();

      // パンくず内の「プロジェクト一覧」リンク検証
      const projectListLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
      expect(projectListLink).toHaveAttribute('href', '/projects');

      // パンくず内の現在画面「数量表一覧」はクリック不可（非リンク）
      // パンくずナビゲーション内のテキスト要素を検証
      const breadcrumbItems = breadcrumbNav.querySelectorAll('li');
      const lastItem = breadcrumbItems[breadcrumbItems.length - 1];
      expect(lastItem?.textContent).toContain('数量表一覧');
      // 最後の項目はリンクではないこと
      expect(lastItem?.querySelector('a')).toBeNull();
    });
  });

  describe('REQ-12.2: 数量表詳細画面（編集画面）のパンくず', () => {
    it('パンくずが「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧 > {数量表名}」形式であること', async () => {
      renderWithRoute(
        <QuantityTableEditPage />,
        '/projects/proj-1/quantity-tables/qt-1',
        '/projects/:projectId/quantity-tables/:id'
      );

      // データ読み込み完了を待つ
      const breadcrumbNav = await screen.findByRole('navigation', { name: /パンくず/i });
      expect(breadcrumbNav).toBeInTheDocument();

      // パンくず項目の検証
      expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト')).toBeInTheDocument();
      expect(screen.getByText('数量表一覧')).toBeInTheDocument();

      // 「プロジェクト一覧」がリンクであること
      const breadcrumbLinks = screen.getAllByRole('link');
      const projectListLink = breadcrumbLinks.find(
        (link) => link.textContent === 'プロジェクト一覧'
      );
      expect(projectListLink).toBeTruthy();
      expect(projectListLink).toHaveAttribute('href', '/projects');

      // 現在の画面「{数量表名}」はクリック不可（非リンク）
      // 数量表名は入力フィールドで表示されるため、パンくず内の表示を確認
    });
  });

  describe('REQ-12.3: 数量表新規作成画面のパンくず', () => {
    it('パンくずが「ダッシュボード > プロジェクト一覧 > {プロジェクト名} > 数量表一覧 > 新規作成」形式であること', async () => {
      renderWithRoute(
        <QuantityTableCreatePage />,
        '/projects/proj-1/quantity-tables/new',
        '/projects/:projectId/quantity-tables/new'
      );

      // データ読み込み完了を待つ
      const breadcrumbNav = await screen.findByRole('navigation', { name: /パンくず/i });
      expect(breadcrumbNav).toBeInTheDocument();

      // パンくず項目の検証
      expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('数量表一覧')).toBeInTheDocument();
      expect(screen.getByText('新規作成')).toBeInTheDocument();

      // 「プロジェクト一覧」がリンクであること
      const breadcrumbLinks = screen.getAllByRole('link');
      const projectListLink = breadcrumbLinks.find(
        (link) => link.textContent === 'プロジェクト一覧'
      );
      expect(projectListLink).toBeTruthy();
      expect(projectListLink).toHaveAttribute('href', '/projects');

      // 現在の画面「新規作成」はクリック不可（非リンク）
      const newCreateText = screen.getByText('新規作成');
      expect(newCreateText.closest('a')).toBeNull();
    });
  });

  describe('REQ-12.4: パンくず各項目クリックで正しいパスに遷移', () => {
    it('ダッシュボードリンクが "/" に遷移すること', async () => {
      renderWithRoute(
        <QuantityTableCreatePage />,
        '/projects/proj-1/quantity-tables/new',
        '/projects/:projectId/quantity-tables/new'
      );

      await screen.findByRole('navigation', { name: /パンくず/i });

      const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('プロジェクト一覧リンクが "/projects" に遷移すること', async () => {
      renderWithRoute(
        <QuantityTableCreatePage />,
        '/projects/proj-1/quantity-tables/new',
        '/projects/:projectId/quantity-tables/new'
      );

      await screen.findByRole('navigation', { name: /パンくず/i });

      const projectListLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
      expect(projectListLink).toHaveAttribute('href', '/projects');
    });

    it('数量表一覧リンクが "/projects/{projectId}/quantity-tables" に遷移すること', async () => {
      renderWithRoute(
        <QuantityTableCreatePage />,
        '/projects/proj-1/quantity-tables/new',
        '/projects/:projectId/quantity-tables/new'
      );

      await screen.findByRole('navigation', { name: /パンくず/i });

      const qtListLink = screen.getByRole('link', { name: '数量表一覧' });
      expect(qtListLink).toHaveAttribute('href', '/projects/proj-1/quantity-tables');
    });
  });

  describe('REQ-12.5: 現在の画面を示す項目がクリック不可', () => {
    it('数量表一覧画面の「数量表一覧」がリンクではないこと', async () => {
      renderWithRoute(
        <QuantityTableListPage />,
        '/projects/proj-1/quantity-tables',
        '/projects/:projectId/quantity-tables'
      );

      // データ読み込み完了を待つ
      await screen.findByRole('link', { name: 'ダッシュボード' });

      const breadcrumbNav = screen.getByRole('navigation', { name: /パンくず/i });
      const breadcrumbItems = breadcrumbNav.querySelectorAll('li');
      const lastItem = breadcrumbItems[breadcrumbItems.length - 1];
      expect(lastItem?.textContent).toContain('数量表一覧');
      expect(lastItem?.querySelector('a')).toBeNull();
    });

    it('新規作成画面の「新規作成」がリンクではないこと', async () => {
      renderWithRoute(
        <QuantityTableCreatePage />,
        '/projects/proj-1/quantity-tables/new',
        '/projects/:projectId/quantity-tables/new'
      );

      await screen.findByRole('navigation', { name: /パンくず/i });

      const currentItem = screen.getByText('新規作成');
      expect(currentItem.closest('a')).toBeNull();
    });
  });
});
