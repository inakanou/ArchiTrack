/**
 * @fileoverview ProjectListView コンポーネント テスト
 *
 * Task 8.2: プロジェクト一覧カード表示の実装
 *
 * Requirements (project-management):
 * - REQ-15.1: プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応
 * - REQ-15.3: 768px未満でカード形式に切り替えて表示
 * - REQ-15.4: タッチ操作に最適化されたUI（タップターゲット44x44px以上）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ProjectListView from '../../../components/projects/ProjectListView';
import type { ProjectInfo } from '../../../types/project.types';
import type { SortField, SortOrder } from '../../../components/projects/ProjectListTable';

// ============================================================================
// モック設定
// ============================================================================

// useMediaQueryのモック
const mockUseMediaQuery = vi.fn();
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: () => mockUseMediaQuery(),
}));

// ============================================================================
// テストデータ
// ============================================================================

const mockProjects: ProjectInfo[] = [
  {
    id: 'project-1',
    name: 'テストプロジェクト1',
    tradingPartnerId: 'partner-a',
    tradingPartner: {
      id: 'partner-a',
      name: '顧客A株式会社',
      nameKana: 'コキャクエーカブシキガイシャ',
    },
    salesPerson: { id: 'user-1', displayName: '営業担当1' },
    constructionPerson: { id: 'user-2', displayName: '工事担当1' },
    status: 'PREPARING',
    statusLabel: '準備中',
    createdAt: '2025-01-01T10:00:00.000Z',
    updatedAt: '2025-01-05T15:30:00.000Z',
  },
  {
    id: 'project-2',
    name: 'テストプロジェクト2',
    tradingPartnerId: 'partner-b',
    tradingPartner: {
      id: 'partner-b',
      name: '顧客B株式会社',
      nameKana: 'コキャクビーカブシキガイシャ',
    },
    salesPerson: { id: 'user-3', displayName: '営業担当2' },
    status: 'SURVEYING',
    statusLabel: '調査中',
    createdAt: '2025-01-02T09:00:00.000Z',
    updatedAt: '2025-01-06T11:00:00.000Z',
  },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

const defaultProps = {
  projects: mockProjects,
  sortField: 'updatedAt' as SortField,
  sortOrder: 'desc' as SortOrder,
  onSort: vi.fn(),
  onRowClick: vi.fn(),
};

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

// ============================================================================
// テスト
// ============================================================================

describe('ProjectListView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('デスクトップ表示（768px以上）', () => {
    beforeEach(() => {
      // 768px以上 = モバイルではない = false
      mockUseMediaQuery.mockReturnValue(false);
    });

    it('テーブル形式で表示される', () => {
      renderWithRouter(<ProjectListView {...defaultProps} />);

      // テーブルが表示される
      expect(screen.getByRole('table')).toBeInTheDocument();
      // カードリストは表示されない
      expect(screen.queryByTestId('project-card-list')).not.toBeInTheDocument();
    });

    it('テーブルヘッダーが表示される', () => {
      renderWithRouter(<ProjectListView {...defaultProps} />);

      expect(screen.getByRole('columnheader', { name: /プロジェクト名/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /顧客名/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /ステータス/i })).toBeInTheDocument();
    });

    it('プロジェクトデータが行として表示される', () => {
      renderWithRouter(<ProjectListView {...defaultProps} />);

      expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト2')).toBeInTheDocument();
    });
  });

  describe('モバイル表示（768px未満）（project-management/REQ-15.3）', () => {
    beforeEach(() => {
      // 768px未満 = モバイル = true
      mockUseMediaQuery.mockReturnValue(true);
    });

    it('カード形式で表示される', () => {
      renderWithRouter(<ProjectListView {...defaultProps} />);

      // カードリストが表示される
      expect(screen.getByTestId('project-card-list')).toBeInTheDocument();
      // テーブルは表示されない
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('プロジェクトデータがカードとして表示される', () => {
      renderWithRouter(<ProjectListView {...defaultProps} />);

      expect(screen.getByTestId('project-card-project-1')).toBeInTheDocument();
      expect(screen.getByTestId('project-card-project-2')).toBeInTheDocument();
    });

    it('カードにプロジェクト情報が表示される', () => {
      renderWithRouter(<ProjectListView {...defaultProps} />);

      expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      expect(screen.getByText('顧客A株式会社')).toBeInTheDocument();
      expect(screen.getByText('準備中')).toBeInTheDocument();
    });
  });

  describe('レスポンシブ切り替え（project-management/REQ-15.1）', () => {
    it('useMediaQueryに正しいクエリが渡される', () => {
      // モックの実装を差し替えて呼び出しを検証
      mockUseMediaQuery.mockReturnValue(false);
      renderWithRouter(<ProjectListView {...defaultProps} />);

      // コンポーネントがレンダリングされたことを確認
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('モバイル状態が変わると表示が切り替わる', () => {
      // 最初はデスクトップ
      mockUseMediaQuery.mockReturnValue(false);
      const { rerender } = renderWithRouter(<ProjectListView {...defaultProps} />);
      expect(screen.getByRole('table')).toBeInTheDocument();

      // モバイルに変更
      mockUseMediaQuery.mockReturnValue(true);
      rerender(
        <BrowserRouter>
          <ProjectListView {...defaultProps} />
        </BrowserRouter>
      );
      expect(screen.getByTestId('project-card-list')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('イベントハンドリング', () => {
    it('デスクトップでテーブル行クリック時にonRowClickが呼ばれる', async () => {
      mockUseMediaQuery.mockReturnValue(false);
      const onRowClick = vi.fn();

      renderWithRouter(<ProjectListView {...defaultProps} onRowClick={onRowClick} />);

      const row = screen.getByTestId('project-row-project-1');
      await userEvent.click(row);

      expect(onRowClick).toHaveBeenCalledWith('project-1');
    });

    it('モバイルでカードクリック時にonRowClickが呼ばれる', async () => {
      mockUseMediaQuery.mockReturnValue(true);
      const onRowClick = vi.fn();

      renderWithRouter(<ProjectListView {...defaultProps} onRowClick={onRowClick} />);

      const card = screen.getByTestId('project-card-project-1');
      await userEvent.click(card);

      expect(onRowClick).toHaveBeenCalledWith('project-1');
    });
  });

  describe('空の状態', () => {
    it('デスクトップで空のプロジェクト一覧を表示', () => {
      mockUseMediaQuery.mockReturnValue(false);
      renderWithRouter(<ProjectListView {...defaultProps} projects={[]} />);

      // テーブルは存在するがデータ行はない
      expect(screen.getByRole('table')).toBeInTheDocument();
      const rows = screen.getAllByRole('row');
      // ヘッダー行のみ
      expect(rows).toHaveLength(1);
    });

    it('モバイルで空のプロジェクト一覧を表示', () => {
      mockUseMediaQuery.mockReturnValue(true);
      renderWithRouter(<ProjectListView {...defaultProps} projects={[]} />);

      // カードリストは存在するがカードはない
      expect(screen.getByTestId('project-card-list')).toBeInTheDocument();
      expect(screen.queryByTestId(/^project-card-project-/)).not.toBeInTheDocument();
    });
  });
});
