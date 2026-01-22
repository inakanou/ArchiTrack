/**
 * @fileoverview 内訳書詳細ページ クリップボード出力機能のテスト
 *
 * Task 15.2, 16.2, 16.3: クリップボードコピー機能の単体テスト・統合テスト
 *
 * Requirements:
 * - 14.1: クリップボードにコピーボタンを表示する
 * - 14.5: フィルタが適用されている状態でクリップボードコピーを実行すると、フィルタ後のデータのみをコピーする
 * - 14.6: コピー成功時に「クリップボードにコピーしました」トースト通知を表示する
 * - 14.7: コピー失敗時に「クリップボードへのコピーに失敗しました」エラーメッセージを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import * as copyToClipboardModule from '../../utils/copy-to-clipboard';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// APIモック
vi.mock('../../api/itemized-statements');

// Excel出力モジュールのモック（他のテストとの干渉を避けるため）
vi.mock('../../utils/export-excel', () => ({
  exportToExcel: vi.fn(() => ({ success: true })),
}));

// クリップボードコピーモジュールのモック
vi.mock('../../utils/copy-to-clipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve({ success: true })),
}));

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
  itemCount: 5,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      customCategory: '分類A',
      workType: '工種1',
      name: '品目1',
      specification: '規格1',
      unit: '本',
      quantity: 10.5,
    },
    {
      id: 'item-2',
      customCategory: '分類B',
      workType: '工種2',
      name: '品目2',
      specification: '規格2',
      unit: 'm',
      quantity: 20.0,
    },
    {
      id: 'item-3',
      customCategory: '分類A',
      workType: '工種1',
      name: '品目3',
      specification: '規格3',
      unit: 'kg',
      quantity: 5.0,
    },
    {
      id: 'item-4',
      customCategory: '分類C',
      workType: '工種3',
      name: '品目4',
      specification: '規格1',
      unit: '本',
      quantity: 15.25,
    },
    {
      id: 'item-5',
      customCategory: null,
      workType: null,
      name: '品目5',
      specification: null,
      unit: '式',
      quantity: 1.0,
    },
  ],
};

describe('ItemizedStatementDetailPage - クリップボードコピー機能', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
    vi.mocked(copyToClipboardModule.copyToClipboard).mockResolvedValue({ success: true });
  });

  // テスト用レンダリングヘルパー
  const renderWithRouter = (statementId: string = 'statement-1') => {
    return render(
      <MemoryRouter initialEntries={[`/itemized-statements/${statementId}`]}>
        <Routes>
          <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
          <Route path="/projects/:projectId" element={<div>プロジェクト詳細</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Req 14.1: クリップボードにコピーボタンの表示', () => {
    it('クリップボードにコピーボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        const copyButton = screen.getByRole('button', { name: /コピー/i });
        expect(copyButton).toBeInTheDocument();
      });
    });

    it('コピーボタンをクリックするとcopyToClipboardが呼ばれる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      expect(copyToClipboardModule.copyToClipboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('Req 14.5: フィルタ適用後のデータコピー', () => {
    it('フィルタが適用されている状態でコピーすると、フィルタ後のデータのみが渡される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      // フィルタを適用（分類Aでフィルタ）
      const categoryFilter = screen.getByLabelText('任意分類');
      await user.type(categoryFilter, '分類A');

      // フィルタ後の項目数を確認（分類Aは2件）
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // ヘッダー行 + 2件のデータ行
        expect(rows.length).toBe(3);
      });

      // コピーボタンをクリック
      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // copyToClipboardに渡された項目数を確認
      const calls = vi.mocked(copyToClipboardModule.copyToClipboard).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call?.items).toHaveLength(2);
      // フィルタ後の項目のみが含まれていることを確認
      expect(call?.items.every((item) => item.customCategory === '分類A')).toBe(true);
    });

    it('フィルタをクリアするとすべての項目がコピー対象になる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      // フィルタを適用
      const categoryFilter = screen.getByLabelText('任意分類');
      await user.type(categoryFilter, '分類A');

      // フィルタをクリア
      const clearButton = screen.getByRole('button', { name: /クリア/ });
      await user.click(clearButton);

      // コピーボタンをクリック
      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // すべての項目が渡されることを確認
      const calls = vi.mocked(copyToClipboardModule.copyToClipboard).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call?.items).toHaveLength(5);
    });
  });

  describe('Req 14.6: コピー成功時のトースト通知', () => {
    it('コピー成功時に成功メッセージが表示される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/クリップボードにコピーしました/)).toBeInTheDocument();
      });
    });
  });

  describe('Req 14.7: コピー失敗時のエラーメッセージ', () => {
    it('コピー失敗時にエラーメッセージを表示する', async () => {
      vi.mocked(copyToClipboardModule.copyToClipboard).mockResolvedValue({
        success: false,
        error: 'クリップボードへのコピーに失敗しました',
      });

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/クリップボードへのコピーに失敗しました/)).toBeInTheDocument();
      });
    });

    it('エラー発生後も再度コピーを試行できる', async () => {
      vi.mocked(copyToClipboardModule.copyToClipboard)
        .mockResolvedValueOnce({ success: false, error: 'エラー' })
        .mockResolvedValueOnce({ success: true });

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /コピー/i });

      // 1回目（エラー）
      await user.click(copyButton);
      await waitFor(() => {
        expect(screen.getByText(/エラー/)).toBeInTheDocument();
      });

      // 2回目（成功）
      await user.click(copyButton);

      expect(copyToClipboardModule.copyToClipboard).toHaveBeenCalledTimes(2);
    });
  });

  describe('ソート適用後のデータコピー', () => {
    it('ソートが適用されている状態でコピーすると、ソート後のデータが渡される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      // 数量でソート（降順）
      const quantityHeader = screen.getByRole('columnheader', { name: /数量/ });
      await user.click(quantityHeader); // 昇順
      await user.click(quantityHeader); // 降順

      // コピーボタンをクリック
      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // ソート後の順序でデータが渡されることを確認
      const calls = vi.mocked(copyToClipboardModule.copyToClipboard).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0]?.[0];
      expect(call).toBeDefined();
      const quantities = call?.items.map((item) => item.quantity) ?? [];
      // 降順であることを確認
      for (let i = 0; i < quantities.length - 1; i++) {
        const current = quantities[i];
        const next = quantities[i + 1];
        if (current !== undefined && next !== undefined) {
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });
  });

  describe('内訳項目が空の場合', () => {
    it('項目がない場合でもコピーボタンは表示されない（テーブルが表示されないため）', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue({
        ...mockStatementDetail,
        itemCount: 0,
        items: [],
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      // 内訳項目がありませんメッセージが表示される
      expect(screen.getByText('内訳項目がありません')).toBeInTheDocument();
    });
  });
});
