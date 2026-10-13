/**
 * @fileoverview 内訳書詳細ページ - ソート機能テスト
 *
 * Task 8: 内訳項目のソート機能実装
 * Task 26.4: 列見出しの中のソートボタンをキーボード（Tab・Enter・Space）で操作できるようにする
 *
 * Requirements:
 * - 5.1: 各カラムヘッダーにソートボタンを表示する
 * - 5.2: カラムヘッダークリック時に該当カラムで昇順ソートを適用する
 * - 5.3: 同じカラムヘッダーを再度クリックした場合に降順ソートに切り替える
 * - 5.4: ソートが適用されているカラムヘッダーに現在のソート方向を示すアイコンを表示する
 * - 5.5: デフォルトのソート順として任意分類・工種・名称・規格の優先度で昇順を適用する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// API モック
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

// テストデータ
const mockStatementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-1',
  project: { id: 'project-1', name: 'テストプロジェクト' },
  name: 'テスト内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 5,
  createdAt: '2026-01-19T10:00:00.000Z',
  updatedAt: '2026-01-19T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      customCategory: 'B分類',
      workType: '電気工事',
      name: 'ケーブル',
      specification: '100m',
      unit: 'm',
      quantity: 100.0,
      displayOrder: 0,
    },
    {
      id: 'item-2',
      customCategory: 'A分類',
      workType: '配管工事',
      name: 'パイプ',
      specification: '50mm',
      unit: '本',
      quantity: 50.5,
      displayOrder: 1,
    },
    {
      id: 'item-3',
      customCategory: 'A分類',
      workType: '電気工事',
      name: 'コンセント',
      specification: '2口',
      unit: '個',
      quantity: 20.0,
      displayOrder: 2,
    },
    {
      id: 'item-4',
      customCategory: null,
      workType: '塗装工事',
      name: 'ペイント',
      specification: null,
      unit: 'L',
      quantity: 10.25,
      displayOrder: 3,
    },
    {
      id: 'item-5',
      customCategory: 'C分類',
      workType: null,
      name: 'ボルト',
      specification: 'M10',
      unit: '個',
      quantity: 200.0,
      displayOrder: 4,
    },
  ],
};

// テストユーティリティ
function renderComponent(statementId: string = 'statement-1') {
  return render(
    <MemoryRouter initialEntries={[`/itemized-statements/${statementId}`]}>
      <Routes>
        <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * テーブルの行データ型
 */
interface RowData {
  customCategory: string;
  workType: string;
  name: string;
  specification: string;
  quantity: string;
  unit: string;
}

/**
 * テーブルの行データを取得
 */
function getTableRows(): RowData[] {
  const tbody = screen.getByRole('table').querySelector('tbody');
  if (!tbody) return [];
  const rows = within(tbody).getAllByRole('row');
  return rows.map((row) => {
    const cells = within(row).getAllByRole('cell');
    // 並び替えボタン列が先頭にある場合（セルが7つ）はオフセット1を適用
    const offset = cells.length === 7 ? 1 : 0;
    return {
      customCategory: cells[offset]?.textContent || '',
      workType: cells[offset + 1]?.textContent || '',
      name: cells[offset + 2]?.textContent || '',
      specification: cells[offset + 3]?.textContent || '',
      quantity: cells[offset + 4]?.textContent || '',
      unit: cells[offset + 5]?.textContent || '',
    };
  });
}

/**
 * 指定したインデックスの行データを取得（非nullアサーション）
 */
function getRow(rows: RowData[], index: number): RowData {
  const row = rows[index];
  if (!row) {
    throw new Error(`Row at index ${index} not found`);
  }
  return row;
}

/**
 * 列見出しの中のソートボタンを取得（並べ替えは見出しのセルではなく中のボタンが受ける）
 */
function sortButtonOf(header: HTMLElement): HTMLElement {
  return within(header).getByRole('button');
}

describe('ItemizedStatementDetailPage - ソート機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
  });

  describe('Requirement 5.1: 各カラムヘッダーにソートボタンを表示', () => {
    it.each(['任意分類', '工種', '名称', '規格', '数量', '単位'])(
      '%sカラムヘッダーの中にソートボタン（type="button"）が置かれている',
      async (label) => {
        renderComponent();
        const header = await screen.findByRole('columnheader', { name: new RegExp(label) });
        // 見出しのセル自身はクリックの受け口にせず、中のボタンがクリックとキー操作を受ける
        const button = within(header).getByRole('button', { name: label });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveStyle({ cursor: 'pointer' });
        // ボタンは見出しの中に一つだけで、aria-sort は見出しのセル（th）が持つ
        expect(within(header).getAllByRole('button')).toHaveLength(1);
        expect(header.tagName).toBe('TH');
        expect(header).toHaveAttribute('aria-sort', 'none');
        expect(button).not.toHaveAttribute('aria-sort');
      }
    );

    it('ソートボタンはインラインで outline を打ち消さない（共通の :focus-visible の輪に任せる）', async () => {
      renderComponent();
      await screen.findByRole('table');
      const headers = screen.getAllByRole('columnheader').filter((h) => h.textContent !== '');
      expect(headers).toHaveLength(6);
      for (const header of headers) {
        const button = within(header).getByRole('button');
        expect(button.style.outline).toBe('');
        expect(button.style.outlineStyle).toBe('');
        expect(button.style.outlineWidth).toBe('');
      }
    });
  });

  describe('Requirement 5.1〜5.3: ソートボタンのキーボード操作', () => {
    it('フィルタの最後の欄から Tab で先頭の列見出しのソートボタンへ進み、以降の Tab で列見出しを順に巡る', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      screen.getByRole('textbox', { name: '単位' }).focus();
      const expected = ['任意分類', '工種', '名称', '規格', '数量', '単位'];
      for (const label of expected) {
        await user.tab();
        const header = screen.getByRole('columnheader', { name: new RegExp(label) });
        expect(document.activeElement).toBe(within(header).getByRole('button'));
      }
    });

    it('ソートボタンで Enter を押すと昇順、もう一度 Enter を押すと降順に切り替わる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /数量/ });
      within(header).getByRole('button').focus();

      await user.keyboard('{Enter}');
      expect(header).toHaveAttribute('aria-sort', 'ascending');
      expect(getTableRows().map((row) => row.quantity)).toEqual([
        '10.25',
        '20.00',
        '50.50',
        '100.00',
        '200.00',
      ]);

      await user.keyboard('{Enter}');
      expect(header).toHaveAttribute('aria-sort', 'descending');
      expect(getTableRows().map((row) => row.quantity)).toEqual([
        '200.00',
        '100.00',
        '50.50',
        '20.00',
        '10.25',
      ]);
    });

    it('ソートボタンで Space を押すと昇順、もう一度 Space を押すと降順に切り替わる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /名称/ });
      within(header).getByRole('button').focus();

      await user.keyboard(' ');
      expect(header).toHaveAttribute('aria-sort', 'ascending');
      expect(getTableRows().map((row) => row.name)).toEqual([
        'ケーブル',
        'コンセント',
        'パイプ',
        'ペイント',
        'ボルト',
      ]);

      await user.keyboard(' ');
      expect(header).toHaveAttribute('aria-sort', 'descending');
      expect(getTableRows().map((row) => row.name)).toEqual([
        'ボルト',
        'ペイント',
        'パイプ',
        'コンセント',
        'ケーブル',
      ]);
    });
  });

  describe('Requirement 5.2: カラムヘッダークリック時に昇順ソートを適用', () => {
    it('任意分類カラムをクリックすると昇順ソートが適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(header));

      const rows = getTableRows();
      // null値は末尾に配置される
      expect(getRow(rows, 0).customCategory).toBe('A分類');
      expect(getRow(rows, 1).customCategory).toBe('A分類');
      expect(getRow(rows, 2).customCategory).toBe('B分類');
      expect(getRow(rows, 3).customCategory).toBe('C分類');
      expect(getRow(rows, 4).customCategory).toBe('-'); // null値
    });

    it('工種カラムをクリックすると昇順ソートが適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /工種/i });
      fireEvent.click(sortButtonOf(header));

      const rows = getTableRows();
      // 昇順でソート（日本語localeCompareの順序: 電気工事 < 塗装工事 < 配管工事）
      expect(getRow(rows, 0).workType).toBe('電気工事');
      expect(getRow(rows, 1).workType).toBe('電気工事');
      expect(getRow(rows, 2).workType).toBe('塗装工事');
      expect(getRow(rows, 3).workType).toBe('配管工事');
      expect(getRow(rows, 4).workType).toBe('-'); // null値
    });

    it('名称カラムをクリックすると昇順ソートが適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /名称/i });
      fireEvent.click(sortButtonOf(header));

      const rows = getTableRows();
      // 昇順でソート
      expect(getRow(rows, 0).name).toBe('ケーブル');
      expect(getRow(rows, 1).name).toBe('コンセント');
      expect(getRow(rows, 2).name).toBe('パイプ');
      expect(getRow(rows, 3).name).toBe('ペイント');
      expect(getRow(rows, 4).name).toBe('ボルト');
    });

    it('数量カラムをクリックすると昇順ソートが適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /数量/i });
      fireEvent.click(sortButtonOf(header));

      const rows = getTableRows();
      // 数値の昇順でソート
      expect(getRow(rows, 0).quantity).toBe('10.25');
      expect(getRow(rows, 1).quantity).toBe('20.00');
      expect(getRow(rows, 2).quantity).toBe('50.50');
      expect(getRow(rows, 3).quantity).toBe('100.00');
      expect(getRow(rows, 4).quantity).toBe('200.00');
    });
  });

  describe('Requirement 5.3: 同じカラムヘッダー再クリックで降順ソートに切り替え', () => {
    it('任意分類カラムを2回クリックすると降順ソートに切り替わる', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });

      // 1回目クリック: 昇順
      fireEvent.click(sortButtonOf(header));
      // 2回目クリック: 降順
      fireEvent.click(sortButtonOf(header));

      const rows = getTableRows();
      // null値は末尾に配置される（降順でも）
      expect(getRow(rows, 0).customCategory).toBe('C分類');
      expect(getRow(rows, 1).customCategory).toBe('B分類');
      expect(getRow(rows, 2).customCategory).toBe('A分類');
      expect(getRow(rows, 3).customCategory).toBe('A分類');
      expect(getRow(rows, 4).customCategory).toBe('-'); // null値
    });

    it('数量カラムを2回クリックすると降順ソートに切り替わる', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /数量/i });

      // 1回目クリック: 昇順
      fireEvent.click(sortButtonOf(header));
      // 2回目クリック: 降順
      fireEvent.click(sortButtonOf(header));

      const rows = getTableRows();
      // 数値の降順でソート
      expect(getRow(rows, 0).quantity).toBe('200.00');
      expect(getRow(rows, 1).quantity).toBe('100.00');
      expect(getRow(rows, 2).quantity).toBe('50.50');
      expect(getRow(rows, 3).quantity).toBe('20.00');
      expect(getRow(rows, 4).quantity).toBe('10.25');
    });

    it('異なるカラムをクリックすると新しいカラムの昇順ソートが適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      // 任意分類で昇順ソート
      const customCategoryHeader = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(customCategoryHeader));

      // 名称カラムをクリック（新しいカラムでの昇順ソート）
      const nameHeader = screen.getByRole('columnheader', { name: /名称/i });
      fireEvent.click(sortButtonOf(nameHeader));

      const rows = getTableRows();
      // 名称の昇順でソート
      expect(getRow(rows, 0).name).toBe('ケーブル');
      expect(getRow(rows, 1).name).toBe('コンセント');
      expect(getRow(rows, 2).name).toBe('パイプ');
      expect(getRow(rows, 3).name).toBe('ペイント');
      expect(getRow(rows, 4).name).toBe('ボルト');
    });
  });

  describe('Requirement 5.4: ソートが適用されているカラムにアイコンを表示', () => {
    it('昇順ソート時に昇順アイコンが表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(header));

      // 昇順アイコン（上向き矢印）が表示される
      expect(within(header).getByText('▲')).toBeInTheDocument();
    });

    it('降順ソート時に降順アイコンが表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(header)); // 昇順
      fireEvent.click(sortButtonOf(header)); // 降順

      // 降順アイコン（下向き矢印）が表示される
      expect(within(header).getByText('▼')).toBeInTheDocument();
    });

    it('ソートが適用されていないカラムにはアイコンが表示されない', async () => {
      renderComponent();
      await screen.findByRole('table');

      // 任意分類でソート
      const customCategoryHeader = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(customCategoryHeader));

      // 他のカラムにはアイコンが表示されない
      const workTypeHeader = screen.getByRole('columnheader', { name: /工種/i });
      expect(within(workTypeHeader).queryByText('▲')).not.toBeInTheDocument();
      expect(within(workTypeHeader).queryByText('▼')).not.toBeInTheDocument();
    });

    it('別のカラムをクリックすると前のカラムのアイコンが消える', async () => {
      renderComponent();
      await screen.findByRole('table');

      // 任意分類でソート
      const customCategoryHeader = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(customCategoryHeader));
      expect(within(customCategoryHeader).getByText('▲')).toBeInTheDocument();

      // 名称でソート
      const nameHeader = screen.getByRole('columnheader', { name: /名称/i });
      fireEvent.click(sortButtonOf(nameHeader));

      // 任意分類のアイコンが消える
      expect(within(customCategoryHeader).queryByText('▲')).not.toBeInTheDocument();
      expect(within(customCategoryHeader).queryByText('▼')).not.toBeInTheDocument();

      // 名称のアイコンが表示される
      expect(within(nameHeader).getByText('▲')).toBeInTheDocument();
    });
  });

  describe('Requirement 5.5: デフォルトソート順', () => {
    it('初期表示時はdisplayOrder順（並び順）で表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const rows = getTableRows();

      // デフォルトソート: displayOrder昇順
      // displayOrder 0: B分類, 電気工事, ケーブル
      // displayOrder 1: A分類, 配管工事, パイプ
      // displayOrder 2: A分類, 電気工事, コンセント
      // displayOrder 3: null(-), 塗装工事, ペイント
      // displayOrder 4: C分類, null(-), ボルト
      expect(getRow(rows, 0).customCategory).toBe('B分類');
      expect(getRow(rows, 0).workType).toBe('電気工事');
      expect(getRow(rows, 0).name).toBe('ケーブル');

      expect(getRow(rows, 1).customCategory).toBe('A分類');
      expect(getRow(rows, 1).workType).toBe('配管工事');
      expect(getRow(rows, 1).name).toBe('パイプ');

      expect(getRow(rows, 2).customCategory).toBe('A分類');
      expect(getRow(rows, 2).workType).toBe('電気工事');
      expect(getRow(rows, 2).name).toBe('コンセント');

      expect(getRow(rows, 3).customCategory).toBe('-'); // null
      expect(getRow(rows, 3).workType).toBe('塗装工事');
      expect(getRow(rows, 3).name).toBe('ペイント');

      expect(getRow(rows, 4).customCategory).toBe('C分類');
      expect(getRow(rows, 4).workType).toBe('-'); // null
      expect(getRow(rows, 4).name).toBe('ボルト');
    });
  });

  describe('ソートとページネーションの連携', () => {
    it('ソートを変更してもページネーション状態が維持される', async () => {
      // 60件以上の項目を持つモックデータ（2ページ分）
      const manyItems = Array.from({ length: 60 }, (_, i) => ({
        id: `item-${i}`,
        customCategory: `分類${String(i).padStart(2, '0')}`,
        workType: '工事',
        name: `項目${String(i).padStart(2, '0')}`,
        specification: '規格',
        unit: '個',
        quantity: i * 10,
        displayOrder: i,
      }));

      const manyItemsStatement: ItemizedStatementDetail = {
        ...mockStatementDetail,
        itemCount: 60,
        items: manyItems,
      };

      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        manyItemsStatement
      );

      renderComponent();
      await screen.findByRole('table');

      // ページネーションが表示されていることを確認
      expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

      // 数量でソート
      const header = screen.getByRole('columnheader', { name: /数量/i });
      fireEvent.click(sortButtonOf(header));

      // ソート後も1ページ目の表示が維持される
      expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

      // 最小の数量が先頭に表示される（昇順）
      const rows = getTableRows();
      expect(getRow(rows, 0).quantity).toBe('0.00');
    });
  });

  describe('null値の取り扱い', () => {
    it('昇順ソート時にnull値は末尾に配置される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(header)); // 昇順

      const rows = getTableRows();
      // null値（表示: -）は末尾
      const lastRow = rows[rows.length - 1];
      expect(lastRow?.customCategory).toBe('-');
    });

    it('降順ソート時にもnull値は末尾に配置される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(sortButtonOf(header)); // 昇順
      fireEvent.click(sortButtonOf(header)); // 降順

      const rows = getTableRows();
      // null値（表示: -）は末尾
      const lastRow = rows[rows.length - 1];
      expect(lastRow?.customCategory).toBe('-');
    });
  });
});
