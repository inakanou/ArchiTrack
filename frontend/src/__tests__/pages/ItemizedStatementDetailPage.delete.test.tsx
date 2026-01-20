/**
 * @fileoverview 内訳書詳細ページの削除機能テスト
 *
 * Task 10: 内訳書削除機能の実装
 *
 * Requirements:
 * - 7.1: 内訳書詳細画面で削除ボタンを表示する
 * - 7.2: 削除ボタンクリック時に確認ダイアログを表示する
 * - 7.3: 確認ダイアログで削除を確定した場合に論理削除APIを呼び出す
 * - 7.4: 削除処理中にエラーが発生した場合にエラーメッセージを表示し内訳書を削除しない
 * - 10.2: 削除リクエストを受信すると、システムはリクエストのupdatedAtと現在値を比較する
 * - 10.3: updatedAtが一致しない場合は409 Conflictエラーを返却する
 * - 10.4: 409エラーが返却されると「他のユーザーにより更新されました。画面を再読み込みしてください」メッセージを表示する
 * - 12.3: 削除処理中はローディングインジケーターを表示する
 * - 12.4: ローディング中は操作ボタンを無効化する
 * - 12.5: ローディングが完了したらインジケーターを非表示にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// APIモック
vi.mock('../../api/itemized-statements');

// モックデータ
const mockStatementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-1',
  project: {
    id: 'project-1',
    name: 'テストプロジェクト',
  },
  name: 'テスト内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 3,
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

describe('ItemizedStatementDetailPage - 削除機能', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // テスト用レンダリングヘルパー
  const renderWithRouter = (statementId: string = 'statement-1') => {
    return render(
      <MemoryRouter initialEntries={[`/itemized-statements/${statementId}`]}>
        <Routes>
          <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
          <Route path="/projects" element={<div>プロジェクト一覧</div>} />
          <Route
            path="/projects/:projectId"
            element={<div data-testid="project-detail">プロジェクト詳細</div>}
          />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Req 7.1: 削除ボタンの表示', () => {
    it('内訳書詳細画面に削除ボタンが表示される', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });
    });
  });

  describe('Req 7.2: 確認ダイアログの表示', () => {
    it('削除ボタンクリック時に確認ダイアログを表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('確認ダイアログに内訳書名が表示される', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/テスト内訳書/)).toBeInTheDocument();
      });
    });

    it('確認ダイアログにキャンセルボタンと削除ボタンがある', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });
    });

    it('キャンセルボタンクリックでダイアログを閉じる', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /キャンセル/,
      });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Req 7.3: 削除API呼び出しと画面遷移', () => {
    it('確認ダイアログで削除を確定すると論理削除APIを呼び出す', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      // ダイアログが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // APIが呼び出される
      await waitFor(() => {
        expect(itemizedStatementsApi.deleteItemizedStatement).toHaveBeenCalledWith(
          'statement-1',
          '2026-01-15T10:00:00.000Z'
        );
      });
    });

    it('削除成功後にプロジェクト詳細画面に遷移する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // プロジェクト詳細画面に遷移する
      await waitFor(() => {
        expect(screen.getByTestId('project-detail')).toBeInTheDocument();
      });
    });
  });

  describe('Req 7.4: 削除エラー時の表示', () => {
    it('削除処理中にエラーが発生した場合にエラーメッセージを表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(
        new Error('削除に失敗しました')
      );
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/削除に失敗しました/)).toBeInTheDocument();
      });
    });

    it('エラー発生時は内訳書を削除しない（ダイアログが閉じられる）', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(
        new Error('削除に失敗しました')
      );
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // エラー発生後もまだ内訳書詳細画面にいる
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });
    });
  });

  describe('Req 10.4: 楽観的排他制御エラーの表示', () => {
    it('409エラー時に「他のユーザーにより更新されました」メッセージを表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      // 409 Conflictエラーをシミュレート
      const conflictError = new Error('Conflict');
      Object.assign(conflictError, { status: 409 });
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(conflictError);
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // 楽観的排他制御エラーのメッセージが表示される
      await waitFor(() => {
        expect(
          screen.getByText(/他のユーザーにより更新されました。画面を再読み込みしてください/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Req 12.3, 12.4, 12.5: ローディング表示', () => {
    it('削除処理中はローディングインジケーターを表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      // 遅延するPromiseを設定
      let resolveDelete: () => void;
      const deletePromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockReturnValue(deletePromise);
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // ローディング中は「削除中...」と表示される
      await waitFor(() => {
        expect(screen.getByText(/削除中/)).toBeInTheDocument();
      });

      // Promiseを解決
      resolveDelete!();
    });

    it('ローディング中は操作ボタンを無効化する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        mockStatementDetail
      );
      // 遅延するPromiseを設定
      let resolveDelete: () => void;
      const deletePromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockReturnValue(deletePromise);
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
      });

      // 削除ボタンをクリック
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内の削除ボタンをクリック
      const confirmDeleteButton = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^削除$/,
      });
      await user.click(confirmDeleteButton);

      // ローディング中はボタンが無効化される
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        const cancelButton = within(dialog).getByRole('button', { name: /キャンセル/ });
        const deleteBtn = within(dialog).getByRole('button', { name: /削除中/ });
        expect(cancelButton).toBeDisabled();
        expect(deleteBtn).toBeDisabled();
      });

      // Promiseを解決
      resolveDelete!();
    });
  });
});
