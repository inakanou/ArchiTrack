/**
 * @fileoverview 内訳書一覧ページテスト
 *
 * Requirements:
 * - 3.2: 内訳書セクションは作成済み内訳書を作成日時の降順で一覧表示する
 * - 3.3: 内訳書が存在しない場合「内訳書はまだ作成されていません」メッセージを表示する
 * - 3.4: 内訳書一覧の各行は内訳書名、作成日時、集計元数量表名、合計項目数を表示する
 * - 3.5: ユーザーが内訳書行をクリックすると内訳書詳細画面に遷移する
 * - 11.5: 内訳書セクションは一覧画面へのリンクを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ItemizedStatementListPage from '../../pages/ItemizedStatementListPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import * as quantityTablesApi from '../../api/quantity-tables';

// APIモック
vi.mock('../../api/itemized-statements');
vi.mock('../../api/quantity-tables');

// モックデータ
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
    {
      id: 'statement-2',
      name: 'テスト内訳書2',
      projectId: 'project-123',
      sourceQuantityTableId: 'qt-2',
      sourceQuantityTableName: '別の数量表',
      itemCount: 5,
      createdAt: '2024-01-10T00:00:00.000Z',
      updatedAt: '2024-01-10T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  },
};

const mockEmptyStatements = {
  data: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

// 数量表モックデータ
const mockQuantityTables = {
  data: [
    {
      id: 'qt-1',
      name: 'テスト数量表',
      projectId: 'project-123',
      itemCount: 10,
      groupCount: 2,
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 100,
    total: 1,
    totalPages: 1,
  },
};

// テストヘルパー
const renderWithRouter = (initialEntry: string) => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:projectId/itemized-statements"
          element={<ItemizedStatementListPage />}
        />
      </Routes>
    </MemoryRouter>
  );
};

// projectIdなしでレンダリングするヘルパー
const renderWithoutProjectId = () => {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ItemizedStatementListPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ItemizedStatementListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue(
      mockItemizedStatements
    );
    vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockResolvedValue(undefined);
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
  });

  describe('projectIdがない場合', () => {
    it('projectIdがない場合はAPIが呼び出されないこと', async () => {
      renderWithoutProjectId();

      // APIが呼び出されないことを確認
      await waitFor(() => {
        expect(itemizedStatementsApi.getItemizedStatements).not.toHaveBeenCalled();
      });
    });
  });

  describe('ローディング状態', () => {
    it('データ取得中はローディング表示されること', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter('/projects/project-123/itemized-statements');

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('内訳書取得エラー時にエラーメッセージが表示されること', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockRejectedValue(
        new Error('取得に失敗しました')
      );

      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('内訳書の取得に失敗しました')).toBeInTheDocument();
      });
    });

    it('再試行ボタンをクリックするとAPIが再呼び出しされること', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements)
        .mockRejectedValueOnce(new Error('取得に失敗しました'))
        .mockResolvedValueOnce(mockItemizedStatements);

      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '再試行' }));

      await waitFor(() => {
        expect(itemizedStatementsApi.getItemizedStatements).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('空状態表示 (Requirement 3.3)', () => {
    it('内訳書が存在しない場合「内訳書はまだ作成されていません」メッセージが表示されること', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue(mockEmptyStatements);

      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.getByText('内訳書はまだ作成されていません')).toBeInTheDocument();
      });
    });

    it('空状態時にプロジェクト詳細へのリンクが表示されること', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue(mockEmptyStatements);

      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /プロジェクト詳細で作成/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/projects/project-123');
      });
    });
  });

  describe('一覧表示 (Requirements 3.2, 3.4)', () => {
    it('内訳書一覧が表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('statement-list')).toBeInTheDocument();
      });
    });

    it('内訳書カードに内訳書名が表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByText('テスト内訳書1')).toBeInTheDocument();
        expect(screen.getByText('テスト内訳書2')).toBeInTheDocument();
      });
    });

    it('内訳書カードに作成日時が表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByText(/2024年1月15日/i)).toBeInTheDocument();
        expect(screen.getByText(/2024年1月10日/i)).toBeInTheDocument();
      });
    });

    it('内訳書カードに集計元数量表名が表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByText(/テスト数量表/i)).toBeInTheDocument();
        expect(screen.getByText(/別の数量表/i)).toBeInTheDocument();
      });
    });

    it('内訳書カードに合計項目数が表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByText(/10項目/i)).toBeInTheDocument();
        expect(screen.getByText(/5項目/i)).toBeInTheDocument();
      });
    });

    it('APIが作成日時降順で呼び出されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(itemizedStatementsApi.getItemizedStatements).toHaveBeenCalledWith('project-123', {
          sort: 'createdAt',
          order: 'desc',
        });
      });
    });

    it('合計件数が表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByText('全2件')).toBeInTheDocument();
      });
    });
  });

  describe('内訳書詳細への遷移 (Requirement 3.5)', () => {
    it('内訳書カードに詳細画面へのリンクがあること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /テスト内訳書1の内訳書詳細を見る/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/itemized-statements/statement-1');
      });
    });
  });

  describe('削除機能', () => {
    it('削除ボタンをクリックすると確認ダイアログが表示されること', async () => {
      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('statement-card-statement-1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('内訳書を削除')).toBeInTheDocument();
        expect(
          screen.getByText('この内訳書を削除しますか？この操作は取り消せません。')
        ).toBeInTheDocument();
      });
    });

    it('キャンセルボタンをクリックするとダイアログが閉じること', async () => {
      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('statement-card-statement-1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('削除確定ボタンをクリックすると削除APIが呼び出されること', async () => {
      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('statement-card-statement-1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック（確認ダイアログ内のボタン）
      const dialog = screen.getByRole('dialog');
      const confirmDeleteButton = dialog.querySelector('button:last-child') as HTMLButtonElement;
      await user.click(confirmDeleteButton);

      await waitFor(() => {
        expect(itemizedStatementsApi.deleteItemizedStatement).toHaveBeenCalledWith(
          'statement-1',
          '2024-01-15T00:00:00.000Z'
        );
      });
    });

    it('削除成功後にリストから該当項目が削除されること', async () => {
      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByText('テスト内訳書1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック（確認ダイアログ内のボタン）
      const dialog = screen.getByRole('dialog');
      const confirmDeleteButton = dialog.querySelector('button:last-child') as HTMLButtonElement;
      await user.click(confirmDeleteButton);

      await waitFor(() => {
        expect(screen.queryByText('テスト内訳書1')).not.toBeInTheDocument();
        expect(screen.getByText('テスト内訳書2')).toBeInTheDocument();
      });
    });

    it('削除エラー時にエラーメッセージが表示されること', async () => {
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(
        new Error('削除に失敗しました')
      );

      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('statement-card-statement-1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック（確認ダイアログ内のボタン）
      const dialog = screen.getByRole('dialog');
      const confirmDeleteButton = dialog.querySelector('button:last-child') as HTMLButtonElement;
      await user.click(confirmDeleteButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('削除に失敗しました')).toBeInTheDocument();
      });
    });

    it('削除処理中は「削除中...」と表示されボタンが無効化されること', async () => {
      // 削除が遅延するようにモック
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      const user = userEvent.setup();
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByTestId('statement-card-statement-1')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      expect(deleteButtons[0]).toBeDefined();
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const dialog = screen.getByRole('dialog');
      const confirmDeleteButton = dialog.querySelector('button:last-child') as HTMLButtonElement;
      await user.click(confirmDeleteButton);

      // 削除中のテキストとボタンの無効化を確認
      await waitFor(() => {
        expect(screen.getByText('削除中...')).toBeInTheDocument();
      });

      const buttons = dialog.querySelectorAll('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('パンくずナビゲーション', () => {
    it('パンくずナビゲーションが表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(
          screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
        ).toBeInTheDocument();
      });
    });

    it('プロジェクト一覧へのリンクが表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'プロジェクト一覧' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/projects');
      });
    });

    it('プロジェクト詳細へのリンクが表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'プロジェクト詳細' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/projects/project-123');
      });
    });

    it('現在のページ「内訳書一覧」がリンクなしで表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        expect(nav).toBeInTheDocument();
      });

      // 現在のページはリンクではない
      expect(screen.queryByRole('link', { name: '内訳書一覧' })).not.toBeInTheDocument();
    });
  });

  describe('ヘッダー表示', () => {
    it('ページタイトルが表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書一覧' })).toBeInTheDocument();
      });
    });

    it('プロジェクト詳細に戻るリンクが表示されること', async () => {
      renderWithRouter('/projects/project-123/itemized-statements');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'プロジェクト詳細に戻る' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/projects/project-123');
      });
    });
  });
});
