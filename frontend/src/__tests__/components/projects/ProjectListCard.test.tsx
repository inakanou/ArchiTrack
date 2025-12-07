/**
 * @fileoverview ProjectListCard コンポーネント テスト
 *
 * Task 8.2: プロジェクト一覧カード表示の実装
 *
 * Requirements (project-management):
 * - REQ-15.1: プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応
 * - REQ-15.3: 768px未満でカード形式に切り替えて表示
 * - REQ-15.4: タッチ操作に最適化されたUI（タップターゲット44x44px以上）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ProjectListCard from '../../../components/projects/ProjectListCard';
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
// テスト
// ============================================================================

describe('ProjectListCard', () => {
  describe('カード表示', () => {
    it('カード形式でプロジェクト一覧が表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      // カードリストが存在する
      const cardList = screen.getByTestId('project-card-list');
      expect(cardList).toBeInTheDocument();
    });

    it('各プロジェクトのカードが表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      // カード要素のみを正確にマッチ（header-, status-badge- を除外）
      const cards = screen.getAllByTestId(/^project-card-project-\d+$/);
      expect(cards).toHaveLength(3);
    });

    it('プロジェクトがない場合はカードが表示されない', () => {
      renderWithRouter(<ProjectListCard projects={[]} onCardClick={vi.fn()} />);

      // カード要素のみを正確にマッチ（header-, status-badge- を除外）
      const cards = screen.queryAllByTestId(/^project-card-project-/);
      expect(cards).toHaveLength(0);
    });
  });

  describe('カード内容表示', () => {
    it('プロジェクト名が表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      expect(screen.getByText('テストプロジェクト1')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト2')).toBeInTheDocument();
      expect(screen.getByText('テストプロジェクト3')).toBeInTheDocument();
    });

    it('顧客名が表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      expect(screen.getByText('顧客A株式会社')).toBeInTheDocument();
      expect(screen.getByText('顧客B株式会社')).toBeInTheDocument();
      expect(screen.getByText('顧客C株式会社')).toBeInTheDocument();
    });

    it('ステータスがバッジとして表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      expect(screen.getByText('準備中')).toBeInTheDocument();
      expect(screen.getByText('調査中')).toBeInTheDocument();
      expect(screen.getByText('完了')).toBeInTheDocument();
    });

    it('ステータスバッジが正しいdata属性を持つ', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      expect(screen.getByTestId('project-card-status-badge-project-1')).toHaveAttribute(
        'data-status',
        'PREPARING'
      );
      expect(screen.getByTestId('project-card-status-badge-project-2')).toHaveAttribute(
        'data-status',
        'SURVEYING'
      );
      expect(screen.getByTestId('project-card-status-badge-project-3')).toHaveAttribute(
        'data-status',
        'COMPLETED'
      );
    });

    it('作成日が表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card1 = screen.getByTestId('project-card-project-1');
      expect(within(card1).getByText('2025/01/01')).toBeInTheDocument();
    });

    it('更新日が表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card1 = screen.getByTestId('project-card-project-1');
      // 更新日のラベルとそれに続く日付が存在することを確認
      // UTCからJSTへの変換で日付が変わる可能性があるため、更新ラベルの存在で検証
      expect(within(card1).getByText('更新:')).toBeInTheDocument();
      // 日付セクションには2つの日付が表示される（作成日と更新日）
      const dateElements = within(card1).getAllByText(/^\d{4}\/\d{2}\/\d{2}$/);
      expect(dateElements).toHaveLength(2);
    });
  });

  describe('カードクリック', () => {
    it('カードクリックでonCardClickが呼ばれる', async () => {
      const onCardClick = vi.fn();
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={onCardClick} />);

      const card = screen.getByTestId('project-card-project-1');
      await userEvent.click(card);

      expect(onCardClick).toHaveBeenCalledWith('project-1');
    });

    it('カードにホバースタイルが適用される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      expect(card).toHaveClass('hover:bg-gray-50');
    });
  });

  describe('タップターゲット最適化（project-management/REQ-15.4）', () => {
    it('カードがタップ可能なスタイルを持つ', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      // カーソルポインターでタップ可能を示す
      expect(card).toHaveClass('cursor-pointer');
    });

    it('カードに最小高さが設定されている（44px以上）', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      // min-h-[44px]またはそれ以上のパディングでタップターゲットを確保
      // Tailwindでは min-h-11 = 44px
      expect(card).toHaveClass('min-h-11');
    });

    it('カードのパディングが十分なタップ領域を確保している', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      // p-4 = 16pxのパディング
      expect(card).toHaveClass('p-4');
    });
  });

  describe('アクセシビリティ', () => {
    it('カードにaria-labelが設定される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      expect(card).toHaveAttribute('aria-label', 'プロジェクト: テストプロジェクト1');
    });

    it('カードがキーボードでフォーカス可能', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      expect(card).toHaveAttribute('tabindex', '0');
    });

    it('Enterキーでカードのクリックイベントが発火する', async () => {
      const onCardClick = vi.fn();
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={onCardClick} />);

      const card = screen.getByTestId('project-card-project-1');
      card.focus();
      await userEvent.keyboard('{Enter}');

      expect(onCardClick).toHaveBeenCalledWith('project-1');
    });

    it('Spaceキーでカードのクリックイベントが発火する', async () => {
      const onCardClick = vi.fn();
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={onCardClick} />);

      const card = screen.getByTestId('project-card-project-1');
      card.focus();
      await userEvent.keyboard(' ');

      expect(onCardClick).toHaveBeenCalledWith('project-1');
    });

    it('カードがbutton roleを持つ', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      expect(card).toHaveAttribute('role', 'button');
    });

    it('カードにフォーカス時のスタイルが適用される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      expect(card).toHaveClass('focus:outline-none');
      expect(card).toHaveClass('focus:ring-2');
    });
  });

  describe('レスポンシブ対応（project-management/REQ-15.1, REQ-15.3）', () => {
    it('カードリストがグリッドレイアウトを持つ', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const cardList = screen.getByTestId('project-card-list');
      // モバイルでは1カラム、タブレット以上では複数カラム
      expect(cardList).toHaveClass('grid');
    });

    it('カードに適切なボーダーが設定されている', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('rounded-lg');
    });
  });

  describe('カードのレイアウト', () => {
    it('プロジェクト名が目立つように表示される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      const projectName = within(card).getByText('テストプロジェクト1');
      // font-medium or font-semibold で強調
      expect(projectName).toHaveClass('font-medium');
    });

    it('ステータスバッジがカードヘッダー部分に配置される', () => {
      renderWithRouter(<ProjectListCard projects={mockProjects} onCardClick={vi.fn()} />);

      const card = screen.getByTestId('project-card-project-1');
      const header = within(card).getByTestId('project-card-header-project-1');
      const statusBadge = within(header).getByTestId('project-card-status-badge-project-1');
      expect(statusBadge).toBeInTheDocument();
    });
  });
});
