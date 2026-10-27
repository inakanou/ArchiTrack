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
 *
 * タスク27.2: 内訳書の Excel の生成の前の出力の記録と、記録の失敗での中止
 * （itemized-statement-generation の Requirement 18.7・18.8。describe「出力の記録」）
 */

import { StrictMode } from 'react';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import * as exportExcelModule from '../../utils/export-excel';
import { ApiError, apiClient } from '../../api/client';
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
      displayOrder: 0,
    },
    {
      id: 'item-2',
      customCategory: '分類B',
      workType: '工種2',
      name: '品目2',
      specification: '規格2',
      unit: 'm',
      quantity: 20.0,
      displayOrder: 1,
    },
    {
      id: 'item-3',
      customCategory: '分類A',
      workType: '工種1',
      name: '品目3',
      specification: '規格3',
      unit: 'kg',
      quantity: 5.0,
      displayOrder: 2,
    },
    {
      id: 'item-4',
      customCategory: '分類C',
      workType: '工種3',
      name: '品目4',
      specification: '規格1',
      unit: '本',
      quantity: 15.25,
      displayOrder: 3,
    },
    {
      id: 'item-5',
      customCategory: null,
      workType: null,
      name: '品目5',
      specification: null,
      unit: '式',
      quantity: 1.0,
      displayOrder: 4,
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
    // 出力の記録（POST /api/v1/audit-logs/exports）は既定で成功させる（Requirement 18.7）
    vi.spyOn(apiClient, 'post').mockResolvedValue({ recordId: 'record-1' });
  });

  afterEach(() => {
    vi.mocked(apiClient.post).mockRestore();
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

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
    });

    it('exportToExcelに内訳書名が渡される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
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
      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
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
      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
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
      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalled();
      });
    });

    it('ボタンはクリック可能で、出力の完了の後は再びクリック可能に戻る', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });

      const excelButton = screen.getByRole('button', { name: /Excel/i });
      // 初期状態では無効化されていない
      expect(excelButton).not.toBeDisabled();

      await user.click(excelButton);
      // 出力の完了の後は無効化されていない（記録の要求中の無効化は「出力の記録」で主張する）
      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(excelButton).not.toBeDisabled();
      });
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
      await waitFor(() => {
        expect(excelButton).toBeEnabled();
      });
      await user.click(excelButton);

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ====================================================================
  // タスク27.2: 出力の事前記録（Requirement 18.7, 18.8。user-authentication の要件40.9〜40.11）
  // ====================================================================

  describe('出力の記録 (Requirement 18.7, 18.8)', () => {
    /** 表示の文言の完全一致（余計な文言が付け足されていないこと） */
    const RECORD_FAILED_EXACT = /^出力を記録できなかったため中止しました$/;

    /** 記録の要求を保留にし、解決の関数を返す */
    function holdRecord() {
      const holder: { resolve: (value: { recordId: string }) => void } = { resolve: () => {} };
      vi.mocked(apiClient.post).mockImplementation(
        () =>
          new Promise((resolve) => {
            holder.resolve = resolve as (value: { recordId: string }) => void;
          })
      );
      return holder;
    }

    async function waitForHeading() {
      await screen.findByRole('heading', { name: 'テスト内訳書' });
    }

    it('生成を始める前に出力の記録を種別・案件・内訳書・件数つきで1回要求する', async () => {
      const user = userEvent.setup();
      const postSpy = vi.mocked(apiClient.post);
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
      // 通信は記録の要求の1本だけ（Excel はブラウザで生成する）
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/v1/audit-logs/exports', {
        kind: 'itemized_statement_xlsx',
        projectId: 'project-1',
        targetIds: ['statement-1'],
        itemCount: 5,
      });
      // 記録の要求が Excel の生成より先に行われている
      expect(postSpy.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(exportExcelModule.exportToExcel).mock.invocationCallOrder[0]!
      );
    });

    it('フィルタが適用されているときは、記録の件数にフィルタ後の件数を添える (Req 13.6)', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      await user.type(screen.getByLabelText('任意分類'), '分類A');
      await waitFor(() => {
        expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
      });

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/audit-logs/exports', {
        kind: 'itemized_statement_xlsx',
        projectId: 'project-1',
        targetIds: ['statement-1'],
        itemCount: 2,
      });
      expect(vi.mocked(exportExcelModule.exportToExcel).mock.calls[0]?.[0].items).toHaveLength(2);
    });

    it('記録の要求が失敗すると Excel を生成せず、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      expect(within(await screen.findByRole('alert')).getByText(RECORD_FAILED_EXACT)).toBeVisible();
      expect(exportExcelModule.exportToExcel).not.toHaveBeenCalled();
      // 生成中の表示は解かれ、出力し直せる (Req 13.7)
      const button = screen.getByRole('button', { name: 'Excelダウンロード' });
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent(/^Excel$/);
    });

    it('記録の応答に記録の ID が無いときも Excel を生成しない', async () => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockResolvedValue({});
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      expect(within(await screen.findByRole('alert')).getByText(RECORD_FAILED_EXACT)).toBeVisible();
      expect(exportExcelModule.exportToExcel).not.toHaveBeenCalled();
    });

    it('記録の後に生成が失敗したときは、従来どおり生成のエラーの文言を表示し、記録は再送しない (Req 13.8)', async () => {
      const user = userEvent.setup();
      vi.mocked(exportExcelModule.exportToExcel).mockReturnValue({
        success: false,
        error: 'ファイル書き込みエラー',
      });
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      expect(
        within(await screen.findByRole('alert')).getByText(/^ファイル書き込みエラー$/)
      ).toBeVisible();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it('記録の後に生成が例外を投げたときも、その文言を表示する (Req 13.8)', async () => {
      const user = userEvent.setup();
      vi.mocked(exportExcelModule.exportToExcel).mockImplementation(() => {
        throw new Error('予期しない生成のエラー');
      });
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      expect(
        within(await screen.findByRole('alert')).getByText(/^予期しない生成のエラー$/)
      ).toBeVisible();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it('記録の要求中は Excel 出力の操作を止め、記録の成功の後に生成を始める', async () => {
      const record = holdRecord();
      renderWithRouter();
      await waitForHeading();

      act(() => {
        screen.getByRole('button', { name: 'Excelダウンロード' }).click();
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledTimes(1);
      });
      const busyButton = screen.getByRole('button', { name: 'Excelダウンロード' });
      expect(busyButton).toBeDisabled();
      expect(busyButton).toHaveTextContent('Excel生成中...');
      // 要求中に押し直しても記録は1回だけで、生成はまだ始まらない
      act(() => {
        busyButton.click();
      });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(exportExcelModule.exportToExcel).not.toHaveBeenCalled();

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Excelダウンロード' })).toBeEnabled();
      });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it('記録の要求中に画面を離れる（破棄される）と、記録の成功の後も Excel を生成しない', async () => {
      const record = holdRecord();
      const { unmount } = renderWithRouter();
      await waitForHeading();

      act(() => {
        screen.getByRole('button', { name: 'Excelダウンロード' }).click();
      });
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledTimes(1);
      });

      unmount();
      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      // 記録の解決の後の非同期の続きを流し切る
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(exportExcelModule.exportToExcel).not.toHaveBeenCalled();
    });

    it('StrictMode の二重の effect の後も、記録の成功の後に Excel を生成する', async () => {
      const user = userEvent.setup();
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/itemized-statements/statement-1']}>
            <Routes>
              <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
            </Routes>
          </MemoryRouter>
        </StrictMode>
      );
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: 'Excelダウンロード' }));

      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
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
      await user.click(within(quantityHeader).getByRole('button')); // 昇順
      await user.click(within(quantityHeader).getByRole('button')); // 降順

      // Excelダウンロード
      const excelButton = screen.getByRole('button', { name: /Excel/i });
      await user.click(excelButton);

      // ソート後の順序でデータが渡されることを確認
      await waitFor(() => {
        expect(exportExcelModule.exportToExcel).toHaveBeenCalledTimes(1);
      });
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
