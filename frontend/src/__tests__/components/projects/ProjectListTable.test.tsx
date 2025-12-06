/**
 * @fileoverview ProjectListTable コンポーネント テスト
 *
 * Task 8.1: プロジェクト一覧テーブルコンポーネントの実装
 *
 * Requirements:
 * - 2.2: 各プロジェクトのID、プロジェクト名、顧客名、ステータス、作成日、更新日を一覧に表示
 * - 2.3: プロジェクト行クリックで詳細画面に遷移
 * - 6.1: テーブルヘッダークリックで昇順ソート
 * - 6.2: 同じヘッダー再度クリックで降順ソート切り替え
 * - 6.3: 現在のソート状態をヘッダーにアイコン（昇順: up、降順: down）で表示
 * - 6.4: ソート対象外のカラムヘッダーにはソートアイコンを表示しない
 * - 6.5: ID、プロジェクト名、顧客名、ステータス、作成日、更新日のカラムでソート可能
 * - 20.6: テーブルヘッダーとデータセルの関連付け（アクセシビリティ）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ProjectListTable from '../../../components/projects/ProjectListTable';
import type { ProjectInfo } from '../../../types/project.types';

// ============================================================================
// テストデータ
// ============================================================================

const mockProjects: ProjectInfo[] = [
  {
    id: 'project-1',
    name: 'テストプロジェクト1',
    customerName: '顧客A株式会社',
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
    customerName: '顧客B株式会社',
    salesPerson: { id: 'user-3', displayName: '営業担当2' },
    status: 'SURVEYING',
    statusLabel: '調査中',
    createdAt: '2025-01-02T09:00:00.000Z',
    updatedAt: '2025-01-06T11:00:00.000Z',
  },
  {
    id: 'project-3',
    name: 'テストプロジェクト3',
    customerName: '顧客C株式会社',
    salesPerson: { id: 'user-1', displayName: '営業担当1' },
    status: 'COMPLETED',
    statusLabel: '完了',
    createdAt: '2025-01-03T14:00:00.000Z',
    updatedAt: '2025-01-07T09:00:00.000Z',
  },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

// ============================================================================
// 基本的なレンダリングテスト
// ============================================================================

describe('ProjectListTable', () => {
  describe('テーブル表示', () => {
    it('テーブル形式でプロジェクト一覧が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    it('各プロジェクトの行が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const rows = screen.getAllByRole('row');
      // ヘッダー行 + データ行3つ
      expect(rows).toHaveLength(4);
    });

    it('プロジェクトがない場合は行が表示されない', () => {
      renderWithRouter(
        <ProjectListTable
          projects={[]}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const rows = screen.getAllByRole('row');
      // ヘッダー行のみ
      expect(rows).toHaveLength(1);
    });
  });

  describe('カラム表示（Requirement 2.2）', () => {
    it('ID列が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // ヘッダーにIDが含まれる
      expect(screen.getByRole('columnheader', { name: /ID/i })).toBeInTheDocument();
      // データ行にプロジェクトIDが含まれる（先頭8文字など短縮表示の可能性も考慮）
      expect(screen.getByText(/project-1/i)).toBeInTheDocument();
    });

    it('プロジェクト名列が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /プロジェクト名/i })).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト2')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト3')).toBeInTheDocument();
    });

    it('顧客名列が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /顧客名/i })).toBeInTheDocument();
      expect(screen.getByText('顧客A株式会社')).toBeInTheDocument();
      expect(screen.getByText('顧客B株式会社')).toBeInTheDocument();
      expect(screen.getByText('顧客C株式会社')).toBeInTheDocument();
    });

    it('ステータス列が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /ステータス/i })).toBeInTheDocument();
      expect(screen.getByText('準備中')).toBeInTheDocument();
      expect(screen.getByText('調査中')).toBeInTheDocument();
      expect(screen.getByText('完了')).toBeInTheDocument();
    });

    it('作成日列が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /作成日/i })).toBeInTheDocument();
    });

    it('更新日列が表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /更新日/i })).toBeInTheDocument();
    });

    it('カラムの表示順序が正しい（ID, プロジェクト名, 顧客名, ステータス, 作成日, 更新日）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map((h) => h.textContent);

      // ソートアイコンを含む可能性があるので、部分一致で確認
      expect(headerTexts[0]).toMatch(/ID/i);
      expect(headerTexts[1]).toMatch(/プロジェクト名/i);
      expect(headerTexts[2]).toMatch(/顧客名/i);
      expect(headerTexts[3]).toMatch(/ステータス/i);
      expect(headerTexts[4]).toMatch(/作成日/i);
      expect(headerTexts[5]).toMatch(/更新日/i);
    });
  });

  describe('ステータスバッジのカラー表示', () => {
    it('ステータスがバッジとして色付きで表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // ステータスバッジが存在することを確認
      const statusBadges = screen.getAllByTestId(/^project-status-badge-/);
      expect(statusBadges).toHaveLength(3);

      // 各ステータスバッジが正しいdata属性を持つ
      expect(screen.getByTestId('project-status-badge-project-1')).toHaveAttribute(
        'data-status',
        'PREPARING'
      );
      expect(screen.getByTestId('project-status-badge-project-2')).toHaveAttribute(
        'data-status',
        'SURVEYING'
      );
      expect(screen.getByTestId('project-status-badge-project-3')).toHaveAttribute(
        'data-status',
        'COMPLETED'
      );
    });
  });

  describe('行クリック（Requirement 2.3）', () => {
    it('行クリックでonRowClickが呼ばれる', async () => {
      const onRowClick = vi.fn();
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={onRowClick}
        />
      );

      const row = screen.getByTestId('project-row-project-1');
      await userEvent.click(row);

      expect(onRowClick).toHaveBeenCalledWith('project-1');
    });

    it('行がクリック可能であることを示すスタイル（cursor: pointer）が適用される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('project-row-project-1');
      expect(row).toHaveClass('cursor-pointer');
    });

    it('行にホバースタイルが適用される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('project-row-project-1');
      expect(row).toHaveClass('hover:bg-gray-50');
    });
  });

  describe('ソート機能（Requirements 6.1-6.5）', () => {
    it('ヘッダークリックでonSortが呼ばれる', async () => {
      const onSort = vi.fn();
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      // ヘッダー内のボタンをクリック
      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      const sortButton = within(nameHeader).getByRole('button');
      await userEvent.click(sortButton);

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('各ソート可能カラムでソートできる', async () => {
      const onSort = vi.fn();
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      // IDカラム
      const idHeader = screen.getByRole('columnheader', { name: /ID/i });
      await userEvent.click(within(idHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('id');

      // プロジェクト名カラム
      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      await userEvent.click(within(nameHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('name');

      // 顧客名カラム
      const customerHeader = screen.getByRole('columnheader', { name: /顧客名/i });
      await userEvent.click(within(customerHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('customerName');

      // ステータスカラム
      const statusHeader = screen.getByRole('columnheader', { name: /ステータス/i });
      await userEvent.click(within(statusHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('status');

      // 作成日カラム
      const createdHeader = screen.getByRole('columnheader', { name: /作成日/i });
      await userEvent.click(within(createdHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('createdAt');

      // 更新日カラム
      const updatedHeader = screen.getByRole('columnheader', { name: /更新日/i });
      await userEvent.click(within(updatedHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('updatedAt');
    });

    it('現在のソートカラムに昇順アイコン（上向き）が表示される（昇順時）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="name"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      const sortIcon = within(nameHeader).getByTestId('sort-icon-asc');
      expect(sortIcon).toBeInTheDocument();
    });

    it('現在のソートカラムに降順アイコン（下向き）が表示される（降順時）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="name"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      const sortIcon = within(nameHeader).getByTestId('sort-icon-desc');
      expect(sortIcon).toBeInTheDocument();
    });

    it('ソート対象外のカラムにはソートアイコンが表示されない', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="name"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // 顧客名カラム（ソート対象だがソート中ではない）
      const customerHeader = screen.getByRole('columnheader', { name: /顧客名/i });
      expect(within(customerHeader).queryByTestId('sort-icon-asc')).not.toBeInTheDocument();
      expect(within(customerHeader).queryByTestId('sort-icon-desc')).not.toBeInTheDocument();
    });

    it('ソートヘッダーにaria-sort属性が設定される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="name"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('降順ソート時にaria-sort="descending"が設定される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="name"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    });
  });

  describe('アクセシビリティ（Requirement 20.6）', () => {
    it('テーブルにaria-label属性が設定される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label', 'プロジェクト一覧');
    });

    it('ヘッダーとデータセルが適切に関連付けられる（scope属性）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      headers.forEach((header) => {
        expect(header).toHaveAttribute('scope', 'col');
      });
    });

    it('データ行がキーボードでフォーカス可能', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('project-row-project-1');
      expect(row).toHaveAttribute('tabindex', '0');
    });

    it('Enterキーで行のクリックイベントが発火する', async () => {
      const onRowClick = vi.fn();
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={onRowClick}
        />
      );

      const row = screen.getByTestId('project-row-project-1');
      row.focus();
      await userEvent.keyboard('{Enter}');

      expect(onRowClick).toHaveBeenCalledWith('project-1');
    });

    it('Spaceキーで行のクリックイベントが発火する', async () => {
      const onRowClick = vi.fn();
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={onRowClick}
        />
      );

      const row = screen.getByTestId('project-row-project-1');
      row.focus();
      await userEvent.keyboard(' ');

      expect(onRowClick).toHaveBeenCalledWith('project-1');
    });

    it('ヘッダーにbutton roleが設定される（ソート可能なカラム）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      const button = within(nameHeader).getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('日付フォーマット', () => {
    it('作成日がローカル形式でフォーマットされて表示される', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // 日付がフォーマットされて表示される（例: 2025/01/01）
      // 実際のフォーマットは日本語ロケールに依存
      // 行内に複数の日付があるため、getAllByTextを使用
      const row = screen.getByTestId('project-row-project-1');
      const dateCells = within(row).getAllByText(/2025/);
      // 作成日と更新日の2つがある
      expect(dateCells.length).toBeGreaterThanOrEqual(1);
      // 具体的に作成日2025/01/01が存在することを確認
      expect(within(row).getByText('2025/01/01')).toBeInTheDocument();
    });
  });
});
