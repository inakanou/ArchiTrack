/**
 * @fileoverview 内訳書詳細ページ - ソート機能テスト
 *
 * Task 8: 内訳項目のソート機能実装
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
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// API モック
vi.mock('../../api/itemized-statements');

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
    },
    {
      id: 'item-2',
      customCategory: 'A分類',
      workType: '配管工事',
      name: 'パイプ',
      specification: '50mm',
      unit: '本',
      quantity: 50.5,
    },
    {
      id: 'item-3',
      customCategory: 'A分類',
      workType: '電気工事',
      name: 'コンセント',
      specification: '2口',
      unit: '個',
      quantity: 20.0,
    },
    {
      id: 'item-4',
      customCategory: null,
      workType: '塗装工事',
      name: 'ペイント',
      specification: null,
      unit: 'L',
      quantity: 10.25,
    },
    {
      id: 'item-5',
      customCategory: 'C分類',
      workType: null,
      name: 'ボルト',
      specification: 'M10',
      unit: '個',
      quantity: 200.0,
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
    return {
      customCategory: cells[0]?.textContent || '',
      workType: cells[1]?.textContent || '',
      name: cells[2]?.textContent || '',
      specification: cells[3]?.textContent || '',
      quantity: cells[4]?.textContent || '',
      unit: cells[5]?.textContent || '',
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

describe('ItemizedStatementDetailPage - ソート機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
  });

  describe('Requirement 5.1: 各カラムヘッダーにソートボタンを表示', () => {
    it('任意分類カラムヘッダーがクリック可能である', async () => {
      renderComponent();
      const header = await screen.findByRole('columnheader', { name: /任意分類/i });
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ cursor: 'pointer' });
    });

    it('工種カラムヘッダーがクリック可能である', async () => {
      renderComponent();
      const header = await screen.findByRole('columnheader', { name: /工種/i });
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ cursor: 'pointer' });
    });

    it('名称カラムヘッダーがクリック可能である', async () => {
      renderComponent();
      const header = await screen.findByRole('columnheader', { name: /名称/i });
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ cursor: 'pointer' });
    });

    it('規格カラムヘッダーがクリック可能である', async () => {
      renderComponent();
      const header = await screen.findByRole('columnheader', { name: /規格/i });
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ cursor: 'pointer' });
    });

    it('数量カラムヘッダーがクリック可能である', async () => {
      renderComponent();
      const header = await screen.findByRole('columnheader', { name: /数量/i });
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ cursor: 'pointer' });
    });

    it('単位カラムヘッダーがクリック可能である', async () => {
      renderComponent();
      const header = await screen.findByRole('columnheader', { name: /単位/i });
      expect(header).toBeInTheDocument();
      expect(header).toHaveStyle({ cursor: 'pointer' });
    });
  });

  describe('Requirement 5.2: カラムヘッダークリック時に昇順ソートを適用', () => {
    it('任意分類カラムをクリックすると昇順ソートが適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(header);

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
      fireEvent.click(header);

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
      fireEvent.click(header);

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
      fireEvent.click(header);

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
      fireEvent.click(header);
      // 2回目クリック: 降順
      fireEvent.click(header);

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
      fireEvent.click(header);
      // 2回目クリック: 降順
      fireEvent.click(header);

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
      fireEvent.click(customCategoryHeader);

      // 名称カラムをクリック（新しいカラムでの昇順ソート）
      const nameHeader = screen.getByRole('columnheader', { name: /名称/i });
      fireEvent.click(nameHeader);

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
      fireEvent.click(header);

      // 昇順アイコン（上向き矢印）が表示される
      expect(within(header).getByText('▲')).toBeInTheDocument();
    });

    it('降順ソート時に降順アイコンが表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(header); // 昇順
      fireEvent.click(header); // 降順

      // 降順アイコン（下向き矢印）が表示される
      expect(within(header).getByText('▼')).toBeInTheDocument();
    });

    it('ソートが適用されていないカラムにはアイコンが表示されない', async () => {
      renderComponent();
      await screen.findByRole('table');

      // 任意分類でソート
      const customCategoryHeader = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(customCategoryHeader);

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
      fireEvent.click(customCategoryHeader);
      expect(within(customCategoryHeader).getByText('▲')).toBeInTheDocument();

      // 名称でソート
      const nameHeader = screen.getByRole('columnheader', { name: /名称/i });
      fireEvent.click(nameHeader);

      // 任意分類のアイコンが消える
      expect(within(customCategoryHeader).queryByText('▲')).not.toBeInTheDocument();
      expect(within(customCategoryHeader).queryByText('▼')).not.toBeInTheDocument();

      // 名称のアイコンが表示される
      expect(within(nameHeader).getByText('▲')).toBeInTheDocument();
    });
  });

  describe('Requirement 5.5: デフォルトソート順', () => {
    it('初期表示時はデフォルトソート順（任意分類・工種・名称・規格の優先度で昇順）が適用される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const rows = getTableRows();

      // デフォルトソート: 任意分類 > 工種 > 名称 > 規格 の優先度で昇順
      // A分類 → 電気工事 → コンセント → 2口
      // A分類 → 配管工事 → パイプ → 50mm
      // B分類 → 電気工事 → ケーブル → 100m
      // C分類 → null → ボルト → M10
      // null → 塗装工事 → ペイント → null
      expect(getRow(rows, 0).customCategory).toBe('A分類');
      expect(getRow(rows, 0).workType).toBe('電気工事');
      expect(getRow(rows, 0).name).toBe('コンセント');

      expect(getRow(rows, 1).customCategory).toBe('A分類');
      expect(getRow(rows, 1).workType).toBe('配管工事');
      expect(getRow(rows, 1).name).toBe('パイプ');

      expect(getRow(rows, 2).customCategory).toBe('B分類');
      expect(getRow(rows, 2).workType).toBe('電気工事');
      expect(getRow(rows, 2).name).toBe('ケーブル');

      expect(getRow(rows, 3).customCategory).toBe('C分類');
      expect(getRow(rows, 3).workType).toBe('-'); // null
      expect(getRow(rows, 3).name).toBe('ボルト');

      expect(getRow(rows, 4).customCategory).toBe('-'); // null
      expect(getRow(rows, 4).workType).toBe('塗装工事');
      expect(getRow(rows, 4).name).toBe('ペイント');
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
      fireEvent.click(header);

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
      fireEvent.click(header); // 昇順

      const rows = getTableRows();
      // null値（表示: -）は末尾
      const lastRow = rows[rows.length - 1];
      expect(lastRow?.customCategory).toBe('-');
    });

    it('降順ソート時にもnull値は末尾に配置される', async () => {
      renderComponent();
      await screen.findByRole('table');

      const header = screen.getByRole('columnheader', { name: /任意分類/i });
      fireEvent.click(header); // 昇順
      fireEvent.click(header); // 降順

      const rows = getTableRows();
      // null値（表示: -）は末尾
      const lastRow = rows[rows.length - 1];
      expect(lastRow?.customCategory).toBe('-');
    });
  });
});
