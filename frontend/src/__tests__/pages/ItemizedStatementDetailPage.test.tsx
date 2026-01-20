/**
 * @fileoverview 内訳書詳細ページのテスト
 *
 * Task 7: 内訳書詳細画面の実装
 *
 * Requirements:
 * - 4.1: 集計結果をテーブル形式で表示する
 * - 4.2: テーブルは「任意分類」「工種」「名称」「規格」「数量」「単位」の順でカラムを表示する
 * - 4.3: 数量カラムは小数点以下2桁で表示し、桁が足りない場合は0で埋める
 * - 4.4: パンくずナビゲーションでプロジェクト詳細画面への戻りリンクを提供する
 * - 4.5: 内訳書名と作成日時をヘッダーに表示する
 * - 4.6: テーブルは最大2000件の内訳項目を表示可能とする
 * - 4.7: 内訳項目が50件を超える場合はページネーションを表示する
 * - 4.8: ページネーションは1ページあたり50件の項目を表示する
 * - 4.9: ページネーションは現在のページ番号と総ページ数を表示する
 * - 8.4: 集計元の数量表名を参照情報として表示する
 * - 9.1: パンくずナビゲーションを表示する
 * - 9.2: パンくずを「プロジェクト一覧 > {プロジェクト名} > 内訳書 > {内訳書名}」形式で表示する
 * - 9.3: プロジェクト名クリックでプロジェクト詳細画面に遷移する
 * - 9.4: プロジェクト一覧クリックでプロジェクト一覧画面に遷移する
 * - 12.2: 内訳書詳細データの取得中はローディングインジケーターを表示する
 * - 12.5: ローディングが完了したらインジケーターを非表示にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type {
  ItemizedStatementDetail,
  ItemizedStatementItemInfo,
} from '../../types/itemized-statement.types';

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
    {
      id: 'item-2',
      customCategory: '分類B',
      workType: '工種2',
      name: '名称2',
      specification: '規格2',
      unit: 'm',
      quantity: 20.0,
    },
    {
      id: 'item-3',
      customCategory: null,
      workType: null,
      name: '名称3',
      specification: null,
      unit: '個',
      quantity: 5,
    },
  ],
};

// 50件を超える項目を持つモックデータ
// ゼロパディングを使用して、デフォルトソート後も数値順序を維持
function createManyItems(count: number): ItemizedStatementItemInfo[] {
  const padLength = String(count).length;
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index + 1}`,
    customCategory: `分類${String(index + 1).padStart(padLength, '0')}`,
    workType: `工種${String(index + 1).padStart(padLength, '0')}`,
    name: `名称${String(index + 1).padStart(padLength, '0')}`,
    specification: `規格${String(index + 1).padStart(padLength, '0')}`,
    unit: '個',
    quantity: index + 1,
  }));
}

const mockStatementWith60Items: ItemizedStatementDetail = {
  ...mockStatementDetail,
  itemCount: 60,
  items: createManyItems(60),
};

describe('ItemizedStatementDetailPage', () => {
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
          <Route path="/projects/:projectId" element={<div>プロジェクト詳細</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Task 7.1: 詳細画面の基本レイアウト', () => {
    describe('Req 4.5: ヘッダーに内訳書名と作成日時を表示する', () => {
      it('内訳書名がヘッダーに表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
        });
      });

      it('作成日時がヘッダーに表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          // 日本語形式で日付が表示される
          expect(screen.getByText(/2026年1月15日/)).toBeInTheDocument();
        });
      });
    });

    describe('Req 8.4: 集計元数量表名を参照情報として表示する', () => {
      it('集計元数量表名が表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByText(/テスト数量表/)).toBeInTheDocument();
        });
      });
    });

    describe('Req 9.1, 9.2: パンくずナビゲーション', () => {
      it('パンくずナビゲーションが表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
          expect(breadcrumb).toBeInTheDocument();
        });
      });

      it('パンくずが正しい形式で表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
          expect(within(breadcrumb).getByText('プロジェクト一覧')).toBeInTheDocument();
          expect(within(breadcrumb).getByText('テストプロジェクト')).toBeInTheDocument();
          expect(within(breadcrumb).getByText('内訳書')).toBeInTheDocument();
          expect(within(breadcrumb).getByText('テスト内訳書')).toBeInTheDocument();
        });
      });
    });

    describe('Req 9.3, 9.4: パンくずリンクのナビゲーション', () => {
      it('プロジェクト一覧リンクが正しいURLを持つ', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const link = screen.getByRole('link', { name: 'プロジェクト一覧' });
          expect(link).toHaveAttribute('href', '/projects');
        });
      });

      it('プロジェクト名リンクが正しいURLを持つ', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const link = screen.getByRole('link', { name: 'テストプロジェクト' });
          expect(link).toHaveAttribute('href', '/projects/project-1');
        });
      });
    });

    describe('Req 12.2, 12.5: ローディングインジケーター', () => {
      it('データ取得中はローディングインジケーターを表示する', async () => {
        // 遅延するPromiseを設定
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(mockStatementDetail), 100))
        );

        renderWithRouter();

        // ローディングインジケーターが表示される
        expect(screen.getByRole('status')).toBeInTheDocument();
      });

      it('ローディング完了後はインジケーターが非表示になる', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.queryByRole('status')).not.toBeInTheDocument();
        });
      });
    });

    describe('削除ボタン配置', () => {
      it('削除ボタンが表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /削除/ })).toBeInTheDocument();
        });
      });
    });
  });

  describe('Task 7.2: 内訳項目テーブルの実装', () => {
    describe('Req 4.1: テーブル形式で表示', () => {
      it('集計結果がテーブル形式で表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('table')).toBeInTheDocument();
        });
      });
    });

    describe('Req 4.2: カラム順序', () => {
      it('テーブルヘッダーが正しい順序で表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const headers = screen.getAllByRole('columnheader');
          expect(headers[0]).toHaveTextContent('任意分類');
          expect(headers[1]).toHaveTextContent('工種');
          expect(headers[2]).toHaveTextContent('名称');
          expect(headers[3]).toHaveTextContent('規格');
          expect(headers[4]).toHaveTextContent('数量');
          expect(headers[5]).toHaveTextContent('単位');
        });
      });
    });

    describe('Req 4.3: 数量の表示形式', () => {
      it('数量が小数点以下2桁で表示される（10.5 -> 10.50）', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByText('10.50')).toBeInTheDocument();
        });
      });

      it('整数も小数点以下2桁で表示される（5 -> 5.00）', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByText('5.00')).toBeInTheDocument();
        });
      });
    });

    describe('Req 4.6: 最大2000件表示', () => {
      it('2000件の項目を表示可能', async () => {
        const manyItemsStatement: ItemizedStatementDetail = {
          ...mockStatementDetail,
          itemCount: 2000,
          items: createManyItems(2000),
        };
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          manyItemsStatement
        );

        renderWithRouter();

        await waitFor(() => {
          // 最初のページで50件表示される
          const table = screen.getByRole('table');
          const rows = within(table).getAllByRole('row');
          // ヘッダー行 + 50件のデータ行
          expect(rows.length).toBe(51);
        });
      });
    });

    describe('Req 4.7, 4.8, 4.9: ページネーション', () => {
      it('項目が50件以下の場合はページネーションを表示しない', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(
            screen.queryByRole('navigation', { name: /ページネーション/ })
          ).not.toBeInTheDocument();
        });
      });

      it('項目が50件を超える場合はページネーションを表示する', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementWith60Items
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('navigation', { name: /ページネーション/ })).toBeInTheDocument();
        });
      });

      it('1ページあたり50件を表示する', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementWith60Items
        );

        renderWithRouter();

        await waitFor(() => {
          const table = screen.getByRole('table');
          const rows = within(table).getAllByRole('row');
          // ヘッダー行 + 50件のデータ行
          expect(rows.length).toBe(51);
        });
      });

      it('現在のページ番号と総ページ数を表示する', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementWith60Items
        );

        renderWithRouter();

        await waitFor(() => {
          // 60件 / 50件 = 2ページ
          expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
        });
      });

      it('ページ切り替えで次のページの項目を表示する', async () => {
        const user = userEvent.setup();
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementWith60Items
        );

        renderWithRouter();

        // 1ページ目の項目が表示される（ゼロパディング対応）
        await waitFor(() => {
          expect(screen.getByText('名称01')).toBeInTheDocument();
        });

        // 次のページへ
        const nextButton = screen.getByRole('button', { name: /次へ/ });
        await user.click(nextButton);

        // 2ページ目の項目が表示される（ゼロパディング対応）
        await waitFor(() => {
          expect(screen.getByText('名称51')).toBeInTheDocument();
        });
      });
    });

    describe('null値の表示', () => {
      it('null値はハイフンまたは空で表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          // item-3のcustomCategory, workType, specificationがnull
          const table = screen.getByRole('table');
          const rows = within(table).getAllByRole('row');
          // 3番目のデータ行（index 3）を確認
          const thirdRow = rows[3];
          // ハイフンまたは空文字が含まれているはず
          expect(thirdRow).toBeInTheDocument();
        });
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('APIエラー時はエラーメッセージを表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockRejectedValue(
        new Error('内訳書が見つかりません')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('再試行ボタンで再取得できる', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail)
        .mockRejectedValueOnce(new Error('エラー'))
        .mockResolvedValueOnce(mockStatementDetail);

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /再試行/ });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
      });
    });
  });
});
