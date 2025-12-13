/**
 * @fileoverview ProjectListTable コンポーネント テスト
 *
 * Task 8.1: プロジェクト一覧テーブルコンポーネントの実装
 * Task 22.1: SortField型定義の更新（ID列削除、営業担当者・工事担当者列追加）
 *
 * Requirements (project-management):
 * - REQ-2.2: 各プロジェクトのプロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日を一覧に表示
 * - REQ-2.3: プロジェクト行クリックで詳細画面に遷移
 * - REQ-6.1: テーブルヘッダークリックで昇順ソート
 * - REQ-6.2: 同じヘッダー再度クリックで降順ソート切り替え
 * - REQ-6.3: 現在のソート状態をヘッダーにアイコン（昇順: up、降順: down）で表示
 * - REQ-6.4: ソート対象外のカラムヘッダーにはソートアイコンを表示しない
 * - REQ-6.5: プロジェクト名、顧客名、営業担当者、工事担当者、ステータス、作成日、更新日のカラムでソート可能
 * - REQ-20.6: テーブルヘッダーとデータセルの関連付け（アクセシビリティ）
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
  {
    id: 'project-3',
    name: 'テストプロジェクト3',
    tradingPartnerId: 'partner-c',
    tradingPartner: {
      id: 'partner-c',
      name: '顧客C株式会社',
      nameKana: 'コキャクシーカブシキガイシャ',
    },
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

  describe('カラム表示（project-management/REQ-2.2）', () => {
    it('ID列は表示されない（Task 22.1で削除）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // ヘッダーにIDが含まれないことを確認
      expect(screen.queryByRole('columnheader', { name: /^ID$/i })).not.toBeInTheDocument();
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

    it('営業担当者列が表示される（Task 22.1で追加）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /営業担当者/i })).toBeInTheDocument();
      // データ行に営業担当者名が表示される（複数回表示される場合があるためgetAllByTextを使用）
      const salesPerson1Elements = screen.getAllByText('営業担当1');
      expect(salesPerson1Elements.length).toBeGreaterThan(0);
      expect(screen.getByText('営業担当2')).toBeInTheDocument();
    });

    it('工事担当者列が表示される（Task 22.1で追加）', () => {
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /工事担当者/i })).toBeInTheDocument();
      // データ行に工事担当者名が表示される（存在する場合）
      expect(screen.getByText('工事担当1')).toBeInTheDocument();
    });

    it('カラムの表示順序が正しい（プロジェクト名, 顧客名, 営業担当者, 工事担当者, ステータス, 作成日, 更新日）（Task 22.1で更新）', () => {
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
      expect(headerTexts[0]).toMatch(/プロジェクト名/i);
      expect(headerTexts[1]).toMatch(/顧客名/i);
      expect(headerTexts[2]).toMatch(/営業担当者/i);
      expect(headerTexts[3]).toMatch(/工事担当者/i);
      expect(headerTexts[4]).toMatch(/ステータス/i);
      expect(headerTexts[5]).toMatch(/作成日/i);
      expect(headerTexts[6]).toMatch(/更新日/i);
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

  describe('行クリック（project-management/REQ-2.3）', () => {
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
      expect(row).toHaveClass('hover:bg-blue-50/60');
    });
  });

  describe('ソート機能（project-management/REQ-6.1-REQ-6.5）', () => {
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

    it('各ソート可能カラムでソートできる（Task 22.1で更新）', async () => {
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

      // プロジェクト名カラム
      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      await userEvent.click(within(nameHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('name');

      // 顧客名カラム
      const customerHeader = screen.getByRole('columnheader', { name: /顧客名/i });
      await userEvent.click(within(customerHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('customerName');

      // 営業担当者カラム（Task 22.1で追加）
      const salesPersonHeader = screen.getByRole('columnheader', { name: /営業担当者/i });
      await userEvent.click(within(salesPersonHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('salesPersonName');

      // 工事担当者カラム（Task 22.1で追加）
      const constructionPersonHeader = screen.getByRole('columnheader', {
        name: /工事担当者/i,
      });
      await userEvent.click(within(constructionPersonHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('constructionPersonName');

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

  describe('アクセシビリティ（project-management/REQ-20.6）', () => {
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

  describe('キーボードナビゲーション（Task 12.1, project-management/REQ-20.1, REQ-20.4）', () => {
    it('Tabキーでテーブル行間を移動できる', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <ProjectListTable
          projects={mockProjects}
          sortField="updatedAt"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row1 = screen.getByTestId('project-row-project-1');
      const row2 = screen.getByTestId('project-row-project-2');

      row1.focus();
      expect(row1).toHaveFocus();

      await user.tab();
      expect(row2).toHaveFocus();
    });

    it('行にフォーカスが当たるとフォーカススタイルが適用される', () => {
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
      expect(row).toHaveClass('focus:ring-2');
      expect(row).toHaveClass('focus:ring-blue-500');
    });

    it('ソートボタンにEnterキーでソートを実行できる', async () => {
      const user = userEvent.setup();
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

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      const sortButton = within(nameHeader).getByRole('button');
      sortButton.focus();

      await user.keyboard('{Enter}');

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('ソートボタンにSpaceキーでソートを実行できる', async () => {
      const user = userEvent.setup();
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

      const nameHeader = screen.getByRole('columnheader', { name: /プロジェクト名/i });
      const sortButton = within(nameHeader).getByRole('button');
      sortButton.focus();

      await user.keyboard(' ');

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('ソートボタンにフォーカスリングが表示される', () => {
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
      const sortButton = within(nameHeader).getByRole('button');
      expect(sortButton).toHaveClass('focus:ring-2');
      expect(sortButton).toHaveClass('focus:ring-blue-500');
    });
  });
});
