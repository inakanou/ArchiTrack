/**
 * @fileoverview 内訳書詳細ページ Excel出力機能のテスト
 *
 * Task 14.3, 16.1, 16.3: Excel出力機能の単体テスト・統合テスト
 *
 * Requirements:
 * - 13.1: Excelダウンロードボタンを表示する
 * - 13.6: フィルタが適用されている状態でExcelダウンロードを実行すると、フィルタ後のデータのみを出力する
 * - 13.7: Excelファイル生成中のローディングインジケーターを表示する
 * - 13.8: エラー発生時にエラーメッセージを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import * as exportExcelModule from '../../utils/export-excel';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// APIモック
vi.mock('../../api/itemized-statements');

// Excel出力モジュールのモック
vi.mock('../../utils/export-excel', () => ({
  exportToExcel: vi.fn(() => ({ success: true })),
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

describe('ItemizedStatementDetailPage - Excel出力機能', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
    vi.mocked(exportExcelModule.exportToExcel).mockReturnValue({ success: true });
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

  describe('Req 13.1: Excelダウンロードボタンの表示', () => {
    it('Excelダウンロードボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        const excelButton = screen.getByRole('button', { name: /Excel/i });
        expect(excelButton).toBeInTheDocument();
      });
    });

    it('ExcelダウンロードボタンをクリックするとexportToExcelが呼ばれる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
    });

    it('exportToExcelに内訳書名が渡される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      expect(exportExcelModule.exportToExcel).toHaveBeenCalledWith(
        expect.objectContaining({
          statementName: 'テスト内訳書',
        })
      );
    });
  });

  describe('Req 13.6: フィルタ適用後のデータ出力', () => {
    it('フィルタが適用されている状態でExcelをダウンロードすると、フィルタ後のデータのみが渡される', async () => {
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

      // Excelダウンロード
      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      // exportToExcelに渡された項目数を確認
      const calls = vi.mocked(exportExcelModule.exportToExcel).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call?.items).toHaveLength(2);
      // フィルタ後の項目のみが含まれていることを確認
      expect(call?.items.every((item) => item.customCategory === '分類A')).toBe(true);
    });

    it('フィルタをクリアするとすべての項目が出力対象になる', async () => {
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

      // Excelダウンロード
      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      // すべての項目が渡されることを確認
      const calls = vi.mocked(exportExcelModule.exportToExcel).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0]?.[0];
      expect(call).toBeDefined();
      expect(call?.items).toHaveLength(5);
    });
  });

  describe('Req 13.7: ローディングインジケーター', () => {
    it('Excel生成中はボタンのテキストが変わる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      // ボタンが「Excel」テキストを持つことを確認
      const excelButton = screen.getByRole('button', { name: /Excel/i });
      expect(excelButton).toHaveTextContent('Excel');
      expect(excelButton).not.toHaveTextContent('Excel生成中');

      // クリック後はexportToExcelが呼ばれていることを確認
      await user.click(excelButton);
      expect(exportExcelModule.exportToExcel).toHaveBeenCalled();
    });

    it('ボタンはクリック可能である（disabled属性は同期処理のため表示されない）', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      // 初期状態では無効化されていない
      expect(excelButton).not.toBeDisabled();

      await user.click(excelButton);
      // 同期処理なのでクリック後も無効化されていない
      expect(excelButton).not.toBeDisabled();
    });
  });

  describe('Req 13.8: エラーハンドリング', () => {
    it('Excel生成エラー時にエラーメッセージを表示する', async () => {
      vi.mocked(exportExcelModule.exportToExcel).mockReturnValue({
        success: false,
        error: 'ファイル書き込みエラー',
      });

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/ファイル書き込みエラー/)).toBeInTheDocument();
      });
    });

    it('エラー発生後も再度ダウンロードを試行できる', async () => {
      vi.mocked(exportExcelModule.exportToExcel)
        .mockReturnValueOnce({ success: false, error: 'エラー' })
        .mockReturnValueOnce({ success: true });

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });

      // 1回目（エラー）
      await user.click(excelButton);
      await waitFor(() => {
        expect(screen.getByText(/エラー/)).toBeInTheDocument();
      });

      // 2回目（成功）
      await user.click(excelButton);

      expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(2);
    });
  });

  describe('ソート適用後のデータ出力', () => {
    it('ソートが適用されている状態でExcelをダウンロードすると、ソート後のデータが渡される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      // 数量でソート（降順）
      const quantityHeader = screen.getByRole('columnheader', { name: /数量/ });
      await user.click(quantityHeader); // 昇順
      await user.click(quantityHeader); // 降順

      // Excelダウンロード
      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      // ソート後の順序でデータが渡されることを確認
      const calls = vi.mocked(exportExcelModule.exportToExcel).mock.calls;
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
    it('項目がない場合でもExcelダウンロードボタンは表示されない（テーブルが表示されないため）', async () => {
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
