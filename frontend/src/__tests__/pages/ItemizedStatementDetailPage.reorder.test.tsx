/**
 * @fileoverview 内訳書詳細ページ - 並び替え機能テスト
 *
 * Task 24.1: フロントエンド並び替えUIの単体テスト
 *
 * Requirements:
 * - 17.1: 各内訳項目行に上移動ボタン（上向き三角）と下移動ボタン（下向き三角）を表示する
 * - 17.2: リスト先頭の項目の上移動ボタンは無効化（disabled）する
 * - 17.3: リスト末尾の項目の下移動ボタンは無効化（disabled）する
 * - 17.4: 上移動ボタンクリック時は該当項目を1つ上の位置に移動する
 * - 17.5: 下移動ボタンクリック時は該当項目を1つ下の位置に移動する
 * - 17.6: 並び替え操作はローカルState更新のみ行い、APIリクエストは発生しない
 * - 17.7: 並び替え操作が行われた場合に変更フラグをtrueに設定し、保存ボタンを表示する
 * - 17.8: 保存ボタンクリック時にupdateItemOrder APIを呼び出す
 * - 17.9: 保存成功時にトースト通知を表示する
 * - 17.12: 未保存変更がある場合にページ離脱時に確認ダイアログを表示する
 * - 17.13: フィルタやカラムソートが適用されている場合は上下ボタンを非表示にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// APIモック
vi.mock('../../api/itemized-statements');

// useBlockerをモック（データルーターなしでテストするため）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({
      state: 'unblocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    })),
  };
});

// テストデータ: displayOrderが設定済み
const mockStatementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-1',
  project: { id: 'project-1', name: 'テストプロジェクト' },
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
      displayOrder: 0,
    },
    {
      id: 'item-2',
      customCategory: '分類B',
      workType: '工種2',
      name: '名称2',
      specification: '規格2',
      unit: 'm',
      quantity: 20.0,
      displayOrder: 1,
    },
    {
      id: 'item-3',
      customCategory: '分類C',
      workType: '工種3',
      name: '名称3',
      specification: '規格3',
      unit: '個',
      quantity: 5.0,
      displayOrder: 2,
    },
  ],
};

// テストユーティリティ
function renderComponent(statementId: string = 'statement-1') {
  return render(
    <MemoryRouter initialEntries={[`/itemized-statements/${statementId}`]}>
      <Routes>
        <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
        <Route path="/projects/:projectId" element={<div>プロジェクト詳細</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * テーブルの行データを取得
 * 並び替えボタンカラムがある場合は1つオフセットする
 */
function getTableRows() {
  const tbody = screen.getByRole('table').querySelector('tbody');
  if (!tbody) return [];
  const rows = within(tbody).getAllByRole('row');
  return rows.map((row) => {
    const cells = within(row).getAllByRole('cell');
    // SortOrderButtonsカラムがある場合（cellsが7つ）はオフセット1
    const offset = cells.length === 7 ? 1 : 0;
    return {
      customCategory: cells[offset + 0]?.textContent || '',
      workType: cells[offset + 1]?.textContent || '',
      name: cells[offset + 2]?.textContent || '',
      specification: cells[offset + 3]?.textContent || '',
      quantity: cells[offset + 4]?.textContent || '',
      unit: cells[offset + 5]?.textContent || '',
    };
  });
}

describe('ItemizedStatementDetailPage - 並び替え機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
  });

  describe('Requirement 17.1: 各内訳項目行に上下ボタンを表示', () => {
    it('各行にSortOrderButtonsが表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      // 上へ移動ボタンが項目数分存在する
      const upButtons = screen.getAllByRole('button', { name: '上へ移動' });
      expect(upButtons).toHaveLength(3);

      // 下へ移動ボタンが項目数分存在する
      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      expect(downButtons).toHaveLength(3);
    });
  });

  describe('Requirement 17.2: 先頭項目の上移動ボタンが無効化', () => {
    it('先頭の項目の上移動ボタンがdisabledである', async () => {
      renderComponent();
      await screen.findByRole('table');

      const upButtons = screen.getAllByRole('button', { name: '上へ移動' });
      expect(upButtons[0]).toBeDisabled();
    });
  });

  describe('Requirement 17.3: 末尾項目の下移動ボタンが無効化', () => {
    it('末尾の項目の下移動ボタンがdisabledである', async () => {
      renderComponent();
      await screen.findByRole('table');

      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      expect(downButtons[downButtons.length - 1]).toBeDisabled();
    });
  });

  describe('Requirement 17.4: 上移動ボタンクリックで項目が1つ上に移動', () => {
    it('2番目の項目の上移動ボタンをクリックすると1番目に移動する', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 分類A, 分類B, 分類C
      let rows = getTableRows();
      expect(rows[0]?.customCategory).toBe('分類A');
      expect(rows[1]?.customCategory).toBe('分類B');
      expect(rows[2]?.customCategory).toBe('分類C');

      // 2番目の項目（分類B）の上移動ボタンをクリック
      const upButtons = screen.getAllByRole('button', { name: '上へ移動' });
      await user.click(upButtons[1]!);

      // 並び替え後: 分類B, 分類A, 分類C
      rows = getTableRows();
      expect(rows[0]?.customCategory).toBe('分類B');
      expect(rows[1]?.customCategory).toBe('分類A');
      expect(rows[2]?.customCategory).toBe('分類C');
    });
  });

  describe('Requirement 17.5: 下移動ボタンクリックで項目が1つ下に移動', () => {
    it('1番目の項目の下移動ボタンをクリックすると2番目に移動する', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 分類A, 分類B, 分類C
      let rows = getTableRows();
      expect(rows[0]?.customCategory).toBe('分類A');

      // 1番目の項目（分類A）の下移動ボタンをクリック
      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      await user.click(downButtons[0]!);

      // 並び替え後: 分類B, 分類A, 分類C
      rows = getTableRows();
      expect(rows[0]?.customCategory).toBe('分類B');
      expect(rows[1]?.customCategory).toBe('分類A');
      expect(rows[2]?.customCategory).toBe('分類C');
    });
  });

  describe('Requirement 17.7: 並び替え後に保存ボタンを表示', () => {
    it('並び替え操作後に保存ボタンが表示される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 保存ボタンは非表示
      expect(screen.queryByRole('button', { name: /並び順を保存/i })).not.toBeInTheDocument();

      // 並び替え操作を実行
      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      await user.click(downButtons[0]!);

      // 保存ボタンが表示される
      expect(screen.getByRole('button', { name: /並び順を保存/i })).toBeInTheDocument();
    });
  });

  describe('Requirement 17.13: フィルタ・カラムソート適用時に上下ボタンを非表示', () => {
    it('カラムソートが適用されている場合は上下ボタンが非表示になる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 上下ボタンが表示されている
      expect(screen.getAllByRole('button', { name: '上へ移動' })).toHaveLength(3);

      // カラムヘッダーをクリックしてソートを適用
      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      await user.click(header);

      // 上下ボタンが非表示になる
      expect(screen.queryAllByRole('button', { name: '上へ移動' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: '下へ移動' })).toHaveLength(0);
    });

    it('フィルタが適用されている場合は上下ボタンが非表示になる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 上下ボタンが表示されている
      expect(screen.getAllByRole('button', { name: '上へ移動' })).toHaveLength(3);

      // フィルタに値を入力
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '分類A');

      // 上下ボタンが非表示になる
      expect(screen.queryAllByRole('button', { name: '上へ移動' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: '下へ移動' })).toHaveLength(0);
    });
  });

  describe('Requirement 17.8: 保存ボタンクリック時にAPIを呼び出す', () => {
    it('保存ボタンクリック時にupdateItemOrder APIが呼び出される', async () => {
      const user = userEvent.setup();
      vi.mocked(itemizedStatementsApi.updateItemOrder).mockResolvedValue({
        ...mockStatementDetail,
        updatedAt: '2026-01-15T11:00:00.000Z',
      });

      renderComponent();
      await screen.findByRole('table');

      // 並び替え操作
      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      await user.click(downButtons[0]!);

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /並び順を保存/i });
      await user.click(saveButton);

      // APIが呼ばれたことを確認
      await waitFor(() => {
        expect(itemizedStatementsApi.updateItemOrder).toHaveBeenCalledWith(
          'statement-1',
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ id: 'item-2', displayOrder: 0 }),
              expect.objectContaining({ id: 'item-1', displayOrder: 1 }),
              expect.objectContaining({ id: 'item-3', displayOrder: 2 }),
            ]),
            updatedAt: '2026-01-15T10:00:00.000Z',
          })
        );
      });
    });
  });

  describe('Requirement 17.9: 保存成功時にトースト通知を表示', () => {
    it('保存成功時に成功メッセージが表示される', async () => {
      const user = userEvent.setup();
      vi.mocked(itemizedStatementsApi.updateItemOrder).mockResolvedValue({
        ...mockStatementDetail,
        updatedAt: '2026-01-15T11:00:00.000Z',
      });

      renderComponent();
      await screen.findByRole('table');

      // 並び替え操作
      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      await user.click(downButtons[0]!);

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /並び順を保存/i });
      await user.click(saveButton);

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('並び順を保存しました')).toBeInTheDocument();
      });

      // 保存ボタンが非表示になる
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /並び順を保存/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Requirement 17.6: 並び替え操作時にAPIリクエストが発生しない', () => {
    it('上下ボタンクリック時にupdateItemOrder APIが呼ばれない', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 複数回並び替え操作を実行
      const downButtons = screen.getAllByRole('button', { name: '下へ移動' });
      await user.click(downButtons[0]!);

      const upButtons = screen.getAllByRole('button', { name: '上へ移動' });
      await user.click(upButtons[2]!);

      // APIが呼ばれていないことを確認
      expect(itemizedStatementsApi.updateItemOrder).not.toHaveBeenCalled();
    });
  });
});
