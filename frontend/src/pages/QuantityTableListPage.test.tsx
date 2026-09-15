/**
 * @fileoverview 数量表一覧画面のテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 4.2: 数量表一覧画面を実装する
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 一覧画面で数量表名を編集し、変更を即座に保存する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableListPage from './QuantityTableListPage';
import * as quantityTablesApi from '../api/quantity-tables';
import { ApiError } from '../api/client';
import * as projectsApi from '../api/projects';

// APIモック
vi.mock('../api/quantity-tables');
vi.mock('../api/projects');

// テスト用モックデータ
const mockQuantityTables = {
  data: [
    {
      id: 'table-1',
      name: '第1回見積数量表',
      groupCount: 3,
      itemCount: 25,
      projectId: 'project-123',
      createdAt: '2024-05-15T00:00:00.000Z',
      updatedAt: '2024-05-15T00:00:00.000Z',
    },
    {
      id: 'table-2',
      name: '第2回見積数量表',
      groupCount: 5,
      itemCount: 40,
      projectId: 'project-123',
      createdAt: '2024-04-15T00:00:00.000Z',
      updatedAt: '2024-04-15T00:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  },
};

// ルーター付きレンダリングヘルパー
const renderWithRouter = (projectId: string = 'project-123') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/quantity-tables`]}>
      <Routes>
        <Route path="/projects/:projectId/quantity-tables" element={<QuantityTableListPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('QuantityTableListPage', () => {
  beforeEach(() => {
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: 'project-123',
      name: 'テストプロジェクト',
      tradingPartnerId: null,
      tradingPartner: null,
      salesPerson: { id: 'user-1', displayName: '担当者' },
      status: 'PREPARING',
      statusLabel: '進行中',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('ページタイトル「数量表一覧」を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '数量表一覧' })).toBeInTheDocument();
      });
    });

    it('数量表一覧を表示する（Requirements: 2.3）', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
        expect(screen.getByText('第2回見積数量表')).toBeInTheDocument();
      });
    });

    it('グループ数と項目数を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/3グループ/)).toBeInTheDocument();
        expect(screen.getByText(/25項目/)).toBeInTheDocument();
      });
    });

    it('作成日を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
        expect(screen.getByText(/2024年4月15日/)).toBeInTheDocument();
      });
    });
  });

  describe('新規作成', () => {
    it('新規作成ボタンを表示する（Requirements: 2.1）', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /新規作成/ })).toBeInTheDocument();
      });
    });

    it('新規作成ボタンが正しいパスにリンクする', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter('project-123');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /新規作成/ });
        expect(link).toHaveAttribute('href', '/projects/project-123/quantity-tables/new');
      });
    });
  });

  describe('空状態', () => {
    it('数量表が0件の場合はメッセージを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/数量表はまだありません/)).toBeInTheDocument();
      });
    });

    it('空状態でも新規作成リンクを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /新規作成/ })).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスピナーを表示する', async () => {
      // 解決しないPromiseでローディング状態を維持
      vi.mocked(quantityTablesApi.getQuantityTables).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時はエラーメッセージを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('エラー時は再試行ボタンを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
      });
    });
  });

  describe('ナビゲーション', () => {
    it('数量表カードが詳細画面へのリンクを持つ', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter('project-123');

      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /数量表詳細を見る/ });
        expect(links[0]).toHaveAttribute('href', '/projects/project-123/quantity-tables/table-1');
      });
    });

    it('「戻る」リンクがプロジェクト詳細画面へ遷移する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter('project-123');

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /プロジェクト詳細に戻る/ });
        expect(backLink).toHaveAttribute('href', '/projects/project-123');
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('メイン要素を持つ', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('見出し要素を持つ', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });

    it('パンくずナビゲーションを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /パンくず/ })).toBeInTheDocument();
      });
    });
  });

  describe('削除機能 (Requirements: 2.4)', () => {
    it('削除ボタンをクリックすると確認ダイアログが表示される', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByRole('heading')).toHaveTextContent(/削除/);
      });
    });

    it('確認ダイアログでキャンセルするとダイアログが閉じる', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('確認ダイアログで削除を実行すると数量表が削除される', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
      vi.mocked(quantityTablesApi.deleteQuantityTable).mockResolvedValue();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(quantityTablesApi.deleteQuantityTable).toHaveBeenCalledWith('table-1');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('削除に失敗した場合はエラーメッセージが表示される', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
      vi.mocked(quantityTablesApi.deleteQuantityTable).mockRejectedValue(
        new Error('Delete failed')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/削除に失敗しました/)).toBeInTheDocument();
      });
    });

    it('削除中はボタンが無効化される', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
      // 削除を遅延させる
      vi.mocked(quantityTablesApi.deleteQuantityTable).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: '削除' });
      await user.click(deleteButtons[0]!);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      // 削除中の状態を確認
      await waitFor(() => {
        expect(screen.getByText('削除中...')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // コピー機能 (Task 21.3)
  // Requirements: 17.1, 17.3
  // ==========================================================================
  describe('コピー機能 (Requirements: 17.1, 17.3)', () => {
    it('各数量表カードにコピーボタンが表示される', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        const copyButtons = screen.getAllByRole('button', { name: 'コピー' });
        expect(copyButtons).toHaveLength(2);
      });
    });

    it('コピーボタンクリック時にコピーダイアログが表示される', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole('button', { name: 'コピー' });
      await user.click(copyButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText('数量表をコピー')).toBeInTheDocument();
      });
    });

    it('コピーダイアログにデフォルト名「{元の数量表名}のコピー」が設定される', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole('button', { name: 'コピー' });
      await user.click(copyButtons[0]!);

      await waitFor(() => {
        const input = screen.getByLabelText('数量表名') as HTMLInputElement;
        expect(input.value).toBe('第1回見積数量表のコピー');
      });
    });

    it('コピーダイアログのキャンセルでダイアログが閉じる', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole('button', { name: 'コピー' });
      await user.click(copyButtons[0]!);

      await waitFor(() => {
        expect(screen.getByText('数量表をコピー')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('数量表をコピー')).not.toBeInTheDocument();
      });
    });
  });

  describe('リトライ機能', () => {
    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /再試行/ });
      await user.click(retryButton);

      await waitFor(() => {
        expect(quantityTablesApi.getQuantityTables).toHaveBeenCalledTimes(2);
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });
    });
  });

  /**
   * 一覧画面での数量表名の編集と即時保存
   *
   * Requirements (quantity-table-generation):
   * @requirement quantity-table-generation/REQ-2.5
   *
   * 一覧画面で名称を確定した時点で PUT /api/quantity-tables/:id を1回発行し、
   * 保存操作（保存ボタン）を待たずに永続化する。編集画面の明示保存（Requirement 42）は
   * 編集画面の規定であり、一覧画面には及ばない。
   */
  describe('数量表名の編集 (Requirements: 2.5)', () => {
    const renamedTable = {
      ...mockQuantityTables.data[0]!,
      name: '改名後の数量表',
      updatedAt: '2024-06-01T00:00:00.000Z',
    };

    const setup = async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      });
      return user;
    };

    const openEditorForFirstCard = async (user: Awaited<ReturnType<typeof setup>>) => {
      const editButtons = screen.getAllByRole('button', { name: '名前を編集' });
      await user.click(editButtons[0]!);
      return screen.getByRole('textbox', { name: '数量表名を編集' });
    };

    it('各数量表カードに名前の編集ボタンが表示される', async () => {
      await setup();

      expect(screen.getAllByRole('button', { name: '名前を編集' })).toHaveLength(2);
    });

    it('編集ボタンを押すと現在の名前を持つ入力欄がフォーカスされて表示される', async () => {
      const user = await setup();

      const input = await openEditorForFirstCard(user);

      expect(input).toHaveValue('第1回見積数量表');
      expect(input).toHaveFocus();
    });

    it('Enterで確定すると即座に更新APIを呼び、一覧の名前が変わる', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockResolvedValue(renamedTable);

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '改名後の数量表{Enter}');

      await waitFor(() => {
        expect(screen.getByText('改名後の数量表')).toBeInTheDocument();
      });
      expect(quantityTablesApi.updateQuantityTable).toHaveBeenCalledTimes(1);
      expect(quantityTablesApi.updateQuantityTable).toHaveBeenCalledWith(
        'table-1',
        { name: '改名後の数量表' },
        '2024-05-15T00:00:00.000Z'
      );
      expect(screen.queryByRole('textbox', { name: '数量表名を編集' })).not.toBeInTheDocument();
      expect(screen.queryByText('第1回見積数量表')).not.toBeInTheDocument();
      // 保存操作を待つ導線（保存ボタン）は一覧画面に存在しない
      expect(screen.queryByRole('button', { name: /^保存$/ })).not.toBeInTheDocument();
    });

    it('フォーカスを外すと即座に保存する', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockResolvedValue(renamedTable);

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '改名後の数量表');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('改名後の数量表')).toBeInTheDocument();
      });
      expect(quantityTablesApi.updateQuantityTable).toHaveBeenCalledWith(
        'table-1',
        { name: '改名後の数量表' },
        '2024-05-15T00:00:00.000Z'
      );
    });

    it('前後の空白を除いた名前を送信する', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockResolvedValue(renamedTable);

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '  改名後の数量表  {Enter}');

      await waitFor(() => {
        expect(quantityTablesApi.updateQuantityTable).toHaveBeenCalledWith(
          'table-1',
          { name: '改名後の数量表' },
          '2024-05-15T00:00:00.000Z'
        );
      });
    });

    it('Enterの確定に続いてフォーカスが外れても、保存は1回だけ行う', async () => {
      const user = await setup();
      let resolveUpdate: (value: typeof renamedTable) => void = () => {};
      vi.mocked(quantityTablesApi.updateQuantityTable).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = resolve;
          })
      );

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '改名後の数量表{Enter}');
      await user.tab();
      resolveUpdate(renamedTable);

      await waitFor(() => {
        expect(screen.getByText('改名後の数量表')).toBeInTheDocument();
      });
      expect(quantityTablesApi.updateQuantityTable).toHaveBeenCalledTimes(1);
    });

    it('Escapeで取り消すと更新APIを呼ばず元の名前に戻る', async () => {
      const user = await setup();

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '取り消す名前{Escape}');

      expect(screen.queryByRole('textbox', { name: '数量表名を編集' })).not.toBeInTheDocument();
      expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      expect(quantityTablesApi.updateQuantityTable).not.toHaveBeenCalled();
    });

    it('名前を変えずに確定した場合は更新APIを呼ばない', async () => {
      const user = await setup();

      const input = await openEditorForFirstCard(user);
      await user.type(input, '{Enter}');

      expect(screen.queryByRole('textbox', { name: '数量表名を編集' })).not.toBeInTheDocument();
      expect(quantityTablesApi.updateQuantityTable).not.toHaveBeenCalled();
    });

    it('空の名前では確定せずエラーを表示する', async () => {
      const user = await setup();

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '   {Enter}');

      expect(screen.getByRole('alert')).toHaveTextContent('数量表名を入力してください');
      expect(screen.getByRole('textbox', { name: '数量表名を編集' })).toBeInTheDocument();
      expect(quantityTablesApi.updateQuantityTable).not.toHaveBeenCalled();
    });

    it('200文字を超える名前では確定せずエラーを表示する', async () => {
      const user = await setup();

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.click(input);
      await user.paste('あ'.repeat(201));
      await user.keyboard('{Enter}');

      expect(screen.getByRole('alert')).toHaveTextContent(
        '数量表名は200文字以内で入力してください'
      );
      expect(quantityTablesApi.updateQuantityTable).not.toHaveBeenCalled();
    });

    it('200文字の名前は保存する', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockResolvedValue({
        ...renamedTable,
        name: 'あ'.repeat(200),
      });

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.click(input);
      await user.paste('あ'.repeat(200));
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(quantityTablesApi.updateQuantityTable).toHaveBeenCalledWith(
          'table-1',
          { name: 'あ'.repeat(200) },
          '2024-05-15T00:00:00.000Z'
        );
      });
    });

    it('日本語入力の変換中のEnterでは保存しない', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockResolvedValue(renamedTable);

      const input = await openEditorForFirstCard(user);
      fireEvent.compositionStart(input);
      fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

      expect(quantityTablesApi.updateQuantityTable).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: '数量表名を編集' })).toBeInTheDocument();
    });

    it('競合（409）で失敗した場合は競合メッセージを表示し、入力を保持する', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockRejectedValue(
        new ApiError(409, 'Conflict')
      );

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '改名後の数量表{Enter}');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '他のユーザーによって更新されました。ページを再読み込みして最新データを確認してください。'
        );
      });
      expect(screen.getByRole('textbox', { name: '数量表名を編集' })).toHaveValue('改名後の数量表');
      // 一覧そのものは失われない
      expect(screen.getByText('第2回見積数量表')).toBeInTheDocument();
    });

    it('その他のエラーで失敗した場合は保存失敗のメッセージを表示し、入力を保持する', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockRejectedValue(
        new ApiError(500, 'Internal Server Error')
      );

      const input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '改名後の数量表{Enter}');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('数量表名の保存に失敗しました');
      });
      expect(screen.getByRole('textbox', { name: '数量表名を編集' })).toHaveValue('改名後の数量表');
      expect(screen.getByText('第2回見積数量表')).toBeInTheDocument();
    });

    it('保存後の更新日時を次の保存の楽観ロックに用いる', async () => {
      const user = await setup();
      vi.mocked(quantityTablesApi.updateQuantityTable)
        .mockResolvedValueOnce(renamedTable)
        .mockResolvedValueOnce({
          ...renamedTable,
          name: '再改名',
          updatedAt: '2024-06-02T00:00:00.000Z',
        });

      let input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '改名後の数量表{Enter}');
      await waitFor(() => {
        expect(screen.getByText('改名後の数量表')).toBeInTheDocument();
      });

      input = await openEditorForFirstCard(user);
      await user.clear(input);
      await user.type(input, '再改名{Enter}');

      await waitFor(() => {
        expect(quantityTablesApi.updateQuantityTable).toHaveBeenLastCalledWith(
          'table-1',
          { name: '再改名' },
          '2024-06-01T00:00:00.000Z'
        );
      });
    });
  });
});
