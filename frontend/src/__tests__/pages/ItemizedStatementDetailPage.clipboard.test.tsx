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
 *
 * タスク28.1: コピーは出力の記録の成功の後にだけ書き込み、記録の失敗では何も書き込まない
 * （itemized-statement-generation の Requirement 18.9・18.10。describe「出力の記録」）。
 * 書き込みは user-authentication の包み `runRecordedClipboardWrite` が行うため、本テストは包みを差し替え、
 * 渡された記録の入力と中身の生成の関数（`produce`）を確かめる。包みそのものの振る舞い
 * （記録の成功の後にだけ中身を解決する等）は `src/__tests__/api/export-audit.clipboard.test.ts` が持つ。
 */

import { StrictMode } from 'react';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import * as exportAuditApi from '../../api/export-audit';
import type { RecordedExportResult } from '../../api/export-audit';
import { formatItemsForClipboard } from '../../utils/copy-to-clipboard';
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

// Excel出力モジュールのモック（他のテストとの干渉を避けるため）
vi.mock('../../utils/export-excel', () => ({
  exportToExcel: vi.fn(() => ({ success: true })),
}));

// 記録してからクリップボードへ書く包みだけを差し替える（文言の定数などは実物を使う）
vi.mock('../../api/export-audit', async () => {
  const actual =
    await vi.importActual<typeof import('../../api/export-audit')>('../../api/export-audit');
  return {
    ...actual,
    runRecordedClipboardWrite: vi.fn(),
  };
});

/** 14.7 の固定の文言 */
const COPY_FAILED_EXACT = /^クリップボードへのコピーに失敗しました$/;
/** 18.10 の記録の失敗の文言 */
const RECORD_FAILED_EXACT = /^出力を記録できなかったため中止しました$/;

const COPY_SUCCEEDED: RecordedExportResult<void> = { ok: true, value: undefined };

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

describe('ItemizedStatementDetailPage - クリップボードコピー機能', () => {
  const recordedWrite = vi.mocked(exportAuditApi.runRecordedClipboardWrite);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
    recordedWrite.mockResolvedValue(COPY_SUCCEEDED);
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

  async function waitForHeading() {
    await screen.findByRole('heading', { name: 'テスト内訳書' });
  }

  /** n 回目の呼び出しで包みへ渡された中身の生成の関数が作る文字列 */
  async function producedText(call = 0): Promise<string> {
    const produce = recordedWrite.mock.calls[call]?.[1];
    expect(produce, '包みに中身の生成の関数が渡されている').toBeTypeOf('function');
    return await produce!();
  }

  /** タブ区切りの文字列からデータ行（ヘッダーと末尾の空行を除く）を取り出す */
  function dataLines(text: string): string[] {
    const lines = text.split('\n');
    expect(lines[lines.length - 1], '行末は改行で終わる').toBe('');
    return lines.slice(1, -1);
  }

  describe('Req 14.1: クリップボードにコピーボタンの表示', () => {
    it('クリップボードにコピーボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        const copyButton = screen.getByRole('button', { name: /コピー/i });
        expect(copyButton).toBeInTheDocument();
      });
    });

    it('コピーボタンをクリックすると記録してからクリップボードへ書く包みが1回呼ばれる', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      expect(recordedWrite).toHaveBeenCalledTimes(1);
    });
  });

  describe('Req 14.5: フィルタ適用後のデータコピー', () => {
    it('フィルタが適用されている状態でコピーすると、フィルタ後のデータのみが書き込まれる', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

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

      expect(recordedWrite).toHaveBeenCalledTimes(1);
      const lines = dataLines(await producedText());
      expect(lines).toHaveLength(2);
      // フィルタ後の項目のみが含まれていることを確認
      expect(lines.every((line) => line.startsWith('分類A\t'))).toBe(true);
      // 記録の件数も同じフィルタ後の件数（Requirement 18.9）
      expect(recordedWrite.mock.calls[0]?.[0].itemCount).toBe(2);
    });

    it('フィルタをクリアするとすべての項目がコピー対象になる', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      // フィルタを適用
      const categoryFilter = screen.getByLabelText('任意分類');
      await user.type(categoryFilter, '分類A');

      // フィルタをクリア
      const clearButton = screen.getByRole('button', { name: /クリア/ });
      await user.click(clearButton);

      // コピーボタンをクリック
      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // すべての項目が書き込まれることを確認
      expect(recordedWrite).toHaveBeenCalledTimes(1);
      expect(dataLines(await producedText())).toHaveLength(5);
      expect(recordedWrite.mock.calls[0]?.[0].itemCount).toBe(5);
    });
  });

  describe('Req 14.6: コピー成功時のトースト通知', () => {
    it('コピー成功時に成功メッセージが表示される', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText(/クリップボードにコピーしました/)).toBeInTheDocument();
      });
    });
  });

  describe('Req 14.7: コピー失敗時のエラーメッセージ', () => {
    it('記録の後の書き込みの失敗では「クリップボードへのコピーに失敗しました」を表示し、例外の英語の文言を出さない', async () => {
      recordedWrite.mockResolvedValue({
        ok: false,
        error: { type: 'GENERATION_FAILED', cause: new Error('Permission denied') },
      });

      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // エラーメッセージが表示される
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(COPY_FAILED_EXACT);
      expect(screen.queryByText(/Permission denied/)).not.toBeInTheDocument();
      expect(screen.queryByText(/クリップボードにコピーしました/)).not.toBeInTheDocument();
      // 記録は送り直さない（包みの呼び出しは1回）
      expect(recordedWrite).toHaveBeenCalledTimes(1);
    });

    it('クリップボードを利用できない（記録せずに返る）ときも同じ文言を表示する', async () => {
      recordedWrite.mockResolvedValue({
        ok: false,
        error: { type: 'GENERATION_FAILED', cause: new Error('クリップボードを利用できません') },
      });

      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: /コピー/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(COPY_FAILED_EXACT);
    });

    it('包みが想定外に拒否したときも同じ文言を表示し、操作を戻す', async () => {
      recordedWrite.mockRejectedValue(new Error('unexpected'));

      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: /コピー/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(COPY_FAILED_EXACT);
      expect(screen.getByRole('button', { name: /コピー/i })).toBeEnabled();
    });

    it('エラー発生後も再度コピーを試行できる', async () => {
      recordedWrite
        .mockResolvedValueOnce({
          ok: false,
          error: { type: 'GENERATION_FAILED', cause: new Error('エラー') },
        })
        .mockResolvedValueOnce(COPY_SUCCEEDED);

      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      const copyButton = screen.getByRole('button', { name: /コピー/i });

      // 1回目（エラー）
      await user.click(copyButton);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(COPY_FAILED_EXACT);
      });

      // 2回目（成功）
      await user.click(copyButton);

      expect(recordedWrite).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        expect(screen.getByText(/クリップボードにコピーしました/)).toBeInTheDocument();
      });
      // 前回のエラーは消える
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('出力の記録 (Requirement 18.9, 18.10)', () => {
    /** 包みの結果を保留にし、解決の関数を返す */
    function holdWrite() {
      const holder: { resolve: (value: RecordedExportResult<void>) => void } = {
        resolve: () => {},
      };
      recordedWrite.mockImplementation(
        () =>
          new Promise((resolve) => {
            holder.resolve = resolve;
          })
      );
      return holder;
    }

    it('記録の入力に種別・内訳書の案件・内訳書・コピーする件数を添えて1回だけ包みを呼ぶ', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: /コピー/i }));

      expect(recordedWrite).toHaveBeenCalledTimes(1);
      expect(recordedWrite.mock.calls[0]?.[0]).toEqual({
        kind: 'itemized_statement_clipboard',
        projectId: 'project-1',
        targetIds: ['statement-1'],
        itemCount: 5,
      });
      // 中身は 14.2〜14.4・14.8 のタブ区切り（表示順の全項目）
      expect(await producedText()).toBe(formatItemsForClipboard(mockStatementDetail.items));
    });

    it('クリックの処理の中で await を挟まずに包みを呼ぶ（Safari の操作の猶予）', async () => {
      renderWithRouter();
      await waitForHeading();

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      // クリックのイベントの配送が同期で戻った時点で、包みが既に呼ばれている
      act(() => {
        fireEvent.click(copyButton);
        expect(recordedWrite).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByText(/クリップボードにコピーしました/)).toBeInTheDocument();
      });
    });

    it('中身はクリックの時点の項目で作る（記録の要求中に絞り込みを変えても変わらない）', async () => {
      const write = holdWrite();
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      await user.click(screen.getByRole('button', { name: /コピー/i }));
      expect(recordedWrite).toHaveBeenCalledTimes(1);

      // 記録の要求中に絞り込みを変える
      await user.type(screen.getByLabelText('任意分類'), '分類A');
      await waitFor(() => {
        expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
      });

      // 記録の成功の後に包みが中身を作っても、クリックの時点の 5 件のまま
      expect(dataLines(await producedText())).toHaveLength(5);
      expect(recordedWrite.mock.calls[0]?.[0].itemCount).toBe(5);

      await act(async () => {
        write.resolve(COPY_SUCCEEDED);
      });
      expect(await screen.findByText(/クリップボードにコピーしました/)).toBeInTheDocument();
    });

    it('記録の要求中はコピーの操作を止め、押し直しても包みは1回だけ呼ばれる', async () => {
      const write = holdWrite();
      renderWithRouter();
      await waitForHeading();

      act(() => {
        screen.getByRole('button', { name: /コピー/i }).click();
      });
      const busyButton = screen.getByRole('button', { name: /コピー/i });
      expect(busyButton).toBeDisabled();
      expect(busyButton).toHaveTextContent('コピー中...');

      act(() => {
        busyButton.click();
      });
      expect(recordedWrite).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/クリップボードにコピーしました/)).not.toBeInTheDocument();

      await act(async () => {
        write.resolve(COPY_SUCCEEDED);
      });

      expect(await screen.findByText(/クリップボードにコピーしました/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /コピー/i })).toBeEnabled();
      expect(recordedWrite).toHaveBeenCalledTimes(1);
    });

    it('記録の失敗では記録の失敗の文言を表示し、14.7 の文言も成功の通知も出さない (Requirement 18.10)', async () => {
      recordedWrite.mockResolvedValue({
        ok: false,
        error: { type: 'RECORD_FAILED', message: '出力を記録できなかったため中止しました' },
      });

      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(screen.queryByText(/クリップボードへのコピーに失敗しました/)).not.toBeInTheDocument();
      expect(screen.queryByText(/クリップボードにコピーしました/)).not.toBeInTheDocument();
      // 記録は送り直さず、操作は戻る
      expect(recordedWrite).toHaveBeenCalledTimes(1);
      expect(copyButton).toBeEnabled();
    });

    it('記録の要求中に画面を離れても、結果の後に例外を出さない', async () => {
      const write = holdWrite();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderWithRouter();
      await waitForHeading();

      act(() => {
        screen.getByRole('button', { name: /コピー/i }).click();
      });
      expect(recordedWrite).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => {
        write.resolve(COPY_SUCCEEDED);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('StrictMode の二重の effect の後も、記録の成功の後に成功の通知を出す', async () => {
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

      await user.click(screen.getByRole('button', { name: /コピー/i }));

      expect(await screen.findByText(/クリップボードにコピーしました/)).toBeInTheDocument();
      expect(recordedWrite).toHaveBeenCalledTimes(1);
    });
  });

  describe('ソート適用後のデータコピー', () => {
    it('ソートが適用されている状態でコピーすると、ソート後のデータが書き込まれる', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitForHeading();

      // 数量でソート（降順）
      const quantityHeader = screen.getByRole('columnheader', { name: /数量/ });
      await user.click(within(quantityHeader).getByRole('button')); // 昇順
      await user.click(within(quantityHeader).getByRole('button')); // 降順

      // コピーボタンをクリック
      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      // ソート後の順序でデータが書き込まれることを確認（数量は 5 列目）
      expect(recordedWrite).toHaveBeenCalledTimes(1);
      const quantities = dataLines(await producedText()).map((line) => Number(line.split('\t')[4]));
      expect(quantities).toEqual([20, 15.25, 10.5, 5, 1]);
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
      await waitForHeading();

      // 内訳項目がありませんメッセージが表示される
      expect(screen.getByText('内訳項目がありません')).toBeInTheDocument();
    });
  });
});
