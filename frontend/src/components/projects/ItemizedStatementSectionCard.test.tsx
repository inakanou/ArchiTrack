/**
 * @fileoverview 内訳書セクションカードコンポーネントのテスト
 *
 * Task 6: 内訳書セクションカードの実装
 *
 * Requirements:
 * - 3.1: プロジェクト詳細画面に数量表セクションの下に内訳書セクションを表示する
 * - 3.2: 作成済み内訳書を作成日時の降順で一覧表示する
 * - 3.3: 内訳書が存在しない場合は「内訳書はまだ作成されていません」メッセージを表示する
 * - 3.4: 各行に内訳書名、作成日時、集計元数量表名、合計項目数を表示する
 * - 3.5: 内訳書行をクリックで詳細画面に遷移する
 * - 11.1: プロジェクト詳細画面に数量表セクションの下に内訳書セクションを配置する
 * - 11.2: 数量表セクションと同様のカードレイアウトを使用する
 * - 11.3: 新規作成ボタンを表示する
 * - 11.4: 作成済み内訳書へのリンクをリスト表示する
 * - 11.5: 一覧画面へのリンクを表示する
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ItemizedStatementSectionCard } from './ItemizedStatementSectionCard';
import type { ItemizedStatementInfo } from '../../types/itemized-statement.types';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

// ============================================================================
// テストデータ
// ============================================================================

const mockQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-1',
    name: '数量表A',
    groupCount: 2,
    itemCount: 10,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-1',
    name: '数量表B',
    groupCount: 3,
    itemCount: 15,
    createdAt: '2026-01-14T10:00:00.000Z',
    updatedAt: '2026-01-14T10:00:00.000Z',
  },
];

const mockStatements: ItemizedStatementInfo[] = [
  {
    id: 'is-1',
    projectId: 'project-1',
    name: '第1回内訳書',
    sourceQuantityTableId: 'qt-1',
    sourceQuantityTableName: '数量表A',
    itemCount: 25,
    createdAt: '2026-01-19T10:00:00.000Z',
    updatedAt: '2026-01-19T10:00:00.000Z',
  },
  {
    id: 'is-2',
    projectId: 'project-1',
    name: '第2回内訳書',
    sourceQuantityTableId: 'qt-2',
    sourceQuantityTableName: '数量表B',
    itemCount: 30,
    createdAt: '2026-01-18T10:00:00.000Z',
    updatedAt: '2026-01-18T10:00:00.000Z',
  },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

const renderWithRouter = (ui: React.ReactNode) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// ============================================================================
// テストスイート
// ============================================================================

describe('ItemizedStatementSectionCard', () => {
  const defaultProps = {
    projectId: 'project-1',
    totalCount: 2,
    latestStatements: mockStatements,
    quantityTables: mockQuantityTables,
    isLoading: false,
  };

  describe('セクション表示（Requirements 3.1, 11.1, 11.2）', () => {
    it('セクションタイトル「内訳書」を表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByRole('region')).toBeInTheDocument();
      expect(screen.getByText('内訳書')).toBeInTheDocument();
    });

    it('内訳書の総数を表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByText('全2件')).toBeInTheDocument();
    });

    it('適切なaria-labelを持つ', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      const section = screen.getByRole('region');
      expect(section).toHaveAttribute('aria-labelledby', 'itemized-statement-section-title');
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} isLoading={true} />);

      expect(screen.getByTestId('itemized-statement-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数を表示しない', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} isLoading={true} />);

      expect(screen.queryByText('全2件')).not.toBeInTheDocument();
    });
  });

  describe('内訳書一覧表示（Requirements 3.2, 3.4, 11.4）', () => {
    it('内訳書の名前を表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByText('第1回内訳書')).toBeInTheDocument();
      expect(screen.getByText('第2回内訳書')).toBeInTheDocument();
    });

    it('内訳書の作成日時を表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      // 日付は日本語形式で表示される
      expect(screen.getByText(/2026年1月19日/)).toBeInTheDocument();
    });

    it('集計元数量表名を表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByText(/数量表A/)).toBeInTheDocument();
      expect(screen.getByText(/数量表B/)).toBeInTheDocument();
    });

    it('項目数を表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByText(/25項目/)).toBeInTheDocument();
      expect(screen.getByText(/30項目/)).toBeInTheDocument();
    });

    it('各内訳書行に詳細画面へのリンクがある（Requirement 3.5）', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      const links = screen.getAllByRole('link', { name: /の内訳書詳細を見る/ });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', '/projects/project-1/itemized-statements/is-1');
      expect(links[1]).toHaveAttribute('href', '/projects/project-1/itemized-statements/is-2');
    });
  });

  describe('空状態表示（Requirement 3.3）', () => {
    it('内訳書が0件の場合に空状態メッセージを表示する', () => {
      renderWithRouter(
        <ItemizedStatementSectionCard {...defaultProps} totalCount={0} latestStatements={[]} />
      );

      expect(screen.getByText('内訳書はまだ作成されていません')).toBeInTheDocument();
    });

    it('空状態でも新規作成ボタンを表示する', () => {
      renderWithRouter(
        <ItemizedStatementSectionCard {...defaultProps} totalCount={0} latestStatements={[]} />
      );

      // 空状態の場合はボタンとして表示される
      expect(screen.getByRole('button', { name: /新規作成/ })).toBeInTheDocument();
    });
  });

  describe('新規作成ボタン（Requirement 11.3）', () => {
    it('新規作成ボタンを表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: /新規作成/ })).toBeInTheDocument();
    });

    it('数量表が存在しない場合は新規作成ボタンを無効化する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} quantityTables={[]} />);

      const button = screen.getByRole('button', { name: /新規作成/ });
      expect(button).toBeDisabled();
    });

    it('数量表が存在する場合は新規作成ボタンを有効化する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      const button = screen.getByRole('button', { name: /新規作成/ });
      expect(button).not.toBeDisabled();
    });
  });

  describe('一覧画面へのリンク（Requirement 11.5）', () => {
    it('「すべて見る」リンクを表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      const link = screen.getByRole('link', { name: 'すべて見る' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/projects/project-1/itemized-statements');
    });

    it('内訳書が0件の場合は「すべて見る」リンクを表示しない', () => {
      renderWithRouter(
        <ItemizedStatementSectionCard {...defaultProps} totalCount={0} latestStatements={[]} />
      );

      expect(screen.queryByRole('link', { name: 'すべて見る' })).not.toBeInTheDocument();
    });
  });

  describe('作成フォーム表示', () => {
    it('新規作成ボタンをクリックすると作成フォームを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      const button = screen.getByRole('button', { name: /新規作成/ });
      await user.click(button);

      // フォームが表示される
      expect(screen.getByLabelText(/内訳書名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/数量表/)).toBeInTheDocument();
    });

    it('キャンセルボタンをクリックするとフォームを非表示にする', async () => {
      const user = userEvent.setup();
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      // フォームを開く
      const createButton = screen.getByRole('button', { name: /新規作成/ });
      await user.click(createButton);

      // キャンセル
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      // フォームが非表示になる
      expect(screen.queryByLabelText(/内訳書名/)).not.toBeInTheDocument();
    });
  });

  describe('作成成功時の動作', () => {
    it('作成成功時にonSuccessコールバックを呼び出す', async () => {
      const user = userEvent.setup();
      const mockOnSuccess = vi.fn();
      const mockStatement: ItemizedStatementInfo = {
        id: 'is-new',
        projectId: 'project-1',
        name: '新規内訳書',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '数量表A',
        itemCount: 20,
        createdAt: '2026-01-19T12:00:00.000Z',
        updatedAt: '2026-01-19T12:00:00.000Z',
      };

      const mockSubmit = vi.fn().mockResolvedValue(mockStatement);

      renderWithRouter(
        <ItemizedStatementSectionCard
          {...defaultProps}
          onSuccess={mockOnSuccess}
          mockSubmit={mockSubmit}
        />
      );

      // フォームを開く
      const createButton = screen.getByRole('button', { name: /新規作成/ });
      await user.click(createButton);

      // フォームに入力
      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, '新規内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      // 送信
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(mockStatement);
      });
    });
  });

  describe('アイコン表示', () => {
    it('内訳書アイコンを表示する', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getAllByTestId('itemized-statement-icon')).toHaveLength(2);
    });
  });

  describe('data-testid', () => {
    it('セクションにdata-testidを持つ', () => {
      renderWithRouter(<ItemizedStatementSectionCard {...defaultProps} />);

      expect(screen.getByTestId('itemized-statement-section')).toBeInTheDocument();
    });
  });
});
