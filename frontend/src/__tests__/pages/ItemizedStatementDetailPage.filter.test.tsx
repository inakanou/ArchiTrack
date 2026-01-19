/**
 * @fileoverview 内訳書詳細ページ - フィルタリング機能テスト
 *
 * Task 9: 内訳項目のフィルタリング機能実装
 *
 * Requirements:
 * - 6.1: フィルタ入力エリアを内訳書詳細画面に配置する
 * - 6.2: フィルタは「任意分類」「工種」「名称」「規格」「単位」の全カラムに対応する
 * - 6.3: フィルタに値を入力すると該当カラムで部分一致する項目のみを表示する
 * - 6.4: 複数のフィルタが設定されている場合に全条件をAND結合して絞り込む
 * - 6.5: フィルタ結果が0件の場合に「該当する項目はありません」メッセージを表示する
 * - 6.6: クリアボタンで全フィルタを一括解除できる
 * - 6.7: フィルタが適用されている状態でページネーションを使用する場合、フィルタ結果に対してページネーションを適用する
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
      customCategory: '電気設備',
      workType: '電気工事',
      name: 'ケーブル配線',
      specification: 'VVF2.0-3C',
      unit: 'm',
      quantity: 100.0,
    },
    {
      id: 'item-2',
      customCategory: '電気設備',
      workType: '電気工事',
      name: 'コンセント取付',
      specification: '2口コンセント',
      unit: '個',
      quantity: 50.5,
    },
    {
      id: 'item-3',
      customCategory: '給排水設備',
      workType: '配管工事',
      name: 'パイプ敷設',
      specification: 'VP50',
      unit: '本',
      quantity: 20.0,
    },
    {
      id: 'item-4',
      customCategory: null,
      workType: '塗装工事',
      name: 'ペイント塗布',
      specification: null,
      unit: 'L',
      quantity: 10.25,
    },
    {
      id: 'item-5',
      customCategory: '空調設備',
      workType: null,
      name: 'エアコン設置',
      specification: '壁掛け型',
      unit: '台',
      quantity: 5.0,
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

describe('ItemizedStatementDetailPage - フィルタリング機能', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
      mockStatementDetail
    );
  });

  describe('Requirement 6.1: フィルタ入力エリアを配置', () => {
    it('フィルタ入力エリアが表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      // フィルタエリアが存在する
      expect(screen.getByRole('region', { name: /フィルタ/i })).toBeInTheDocument();
    });
  });

  describe('Requirement 6.2: 全カラムに対応するフィルタ入力フィールド', () => {
    it('任意分類フィルタ入力フィールドが存在する', async () => {
      renderComponent();
      await screen.findByRole('table');

      expect(screen.getByRole('textbox', { name: /任意分類/i })).toBeInTheDocument();
    });

    it('工種フィルタ入力フィールドが存在する', async () => {
      renderComponent();
      await screen.findByRole('table');

      expect(screen.getByRole('textbox', { name: /工種/i })).toBeInTheDocument();
    });

    it('名称フィルタ入力フィールドが存在する', async () => {
      renderComponent();
      await screen.findByRole('table');

      expect(screen.getByRole('textbox', { name: /名称/i })).toBeInTheDocument();
    });

    it('規格フィルタ入力フィールドが存在する', async () => {
      renderComponent();
      await screen.findByRole('table');

      expect(screen.getByRole('textbox', { name: /規格/i })).toBeInTheDocument();
    });

    it('単位フィルタ入力フィールドが存在する', async () => {
      renderComponent();
      await screen.findByRole('table');

      expect(screen.getByRole('textbox', { name: /単位/i })).toBeInTheDocument();
    });
  });

  describe('Requirement 6.3: 部分一致フィルタリング', () => {
    it('任意分類でフィルタリングすると部分一致する項目のみ表示される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 5件
      expect(getTableRows()).toHaveLength(5);

      // 「電気」でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '電気');

      // 「電気設備」のみ表示される (2件)
      const rows = getTableRows();
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.customCategory.includes('電気'))).toBe(true);
    });

    it('工種でフィルタリングすると部分一致する項目のみ表示される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「配管」でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /工種/i });
      await user.type(filterInput, '配管');

      // 「配管工事」のみ表示される (1件)
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.workType).toBe('配管工事');
    });

    it('名称でフィルタリングすると部分一致する項目のみ表示される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「ケーブル」でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /名称/i });
      await user.type(filterInput, 'ケーブル');

      // 「ケーブル配線」のみ表示される (1件)
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('ケーブル配線');
    });

    it('規格でフィルタリングすると部分一致する項目のみ表示される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「VVF」でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /規格/i });
      await user.type(filterInput, 'VVF');

      // 「VVF2.0-3C」のみ表示される (1件)
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.specification).toBe('VVF2.0-3C');
    });

    it('単位でフィルタリングすると部分一致する項目のみ表示される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「個」でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /単位/i });
      await user.type(filterInput, '個');

      // 「個」の単位のみ表示される (1件)
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.unit).toBe('個');
    });

    it('大文字小文字を区別せずにフィルタリングされる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「vvf」（小文字）でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /規格/i });
      await user.type(filterInput, 'vvf');

      // 「VVF2.0-3C」がマッチする (1件)
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.specification).toBe('VVF2.0-3C');
    });
  });

  describe('Requirement 6.4: 複数フィルタのAND結合', () => {
    it('複数のフィルタが設定されている場合、全条件をAND結合して絞り込む', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 任意分類: 「電気」でフィルタ
      const customCategoryInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(customCategoryInput, '電気');

      // この時点で2件（電気設備が2つ）
      expect(getTableRows()).toHaveLength(2);

      // 名称: 「コンセント」でフィルタ
      const nameInput = screen.getByRole('textbox', { name: /名称/i });
      await user.type(nameInput, 'コンセント');

      // AND条件: 電気設備 かつ コンセント -> 1件
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.customCategory).toBe('電気設備');
      expect(rows[0]?.name).toBe('コンセント取付');
    });

    it('3つ以上のフィルタもAND結合される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 任意分類: 「電気」でフィルタ
      const customCategoryInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(customCategoryInput, '電気');

      // 工種: 「電気」でフィルタ
      const workTypeInput = screen.getByRole('textbox', { name: /工種/i });
      await user.type(workTypeInput, '電気');

      // 単位: 「m」でフィルタ
      const unitInput = screen.getByRole('textbox', { name: /単位/i });
      await user.type(unitInput, 'm');

      // AND条件: 電気設備 かつ 電気工事 かつ m -> 1件（ケーブル配線）
      const rows = getTableRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('ケーブル配線');
    });
  });

  describe('Requirement 6.5: フィルタ結果0件時のメッセージ表示', () => {
    it('フィルタ結果が0件の場合「該当する項目はありません」メッセージを表示する', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 存在しない値でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, 'XXXXXXXXX');

      // テーブルの代わりにメッセージが表示される
      expect(screen.getByText('該当する項目はありません')).toBeInTheDocument();
    });

    it('AND条件で結果が0件になる場合もメッセージを表示する', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 電気設備 かつ 配管工事 -> 矛盾するので0件
      const customCategoryInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(customCategoryInput, '電気');

      const workTypeInput = screen.getByRole('textbox', { name: /工種/i });
      await user.type(workTypeInput, '配管');

      expect(screen.getByText('該当する項目はありません')).toBeInTheDocument();
    });
  });

  describe('Requirement 6.6: クリアボタンで全フィルタを一括解除', () => {
    it('クリアボタンが表示される', async () => {
      renderComponent();
      await screen.findByRole('table');

      expect(screen.getByRole('button', { name: /クリア/i })).toBeInTheDocument();
    });

    it('クリアボタンで全フィルタを一括解除できる', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 複数のフィルタを設定
      const customCategoryInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(customCategoryInput, '電気');

      const nameInput = screen.getByRole('textbox', { name: /名称/i });
      await user.type(nameInput, 'コンセント');

      // この時点で1件
      expect(getTableRows()).toHaveLength(1);

      // クリアボタンをクリック
      const clearButton = screen.getByRole('button', { name: /クリア/i });
      await user.click(clearButton);

      // 全件（5件）に戻る
      expect(getTableRows()).toHaveLength(5);

      // 入力フィールドがクリアされている
      expect(customCategoryInput).toHaveValue('');
      expect(nameInput).toHaveValue('');
    });

    it('フィルタが設定されていない状態でクリアボタンを押しても問題ない', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // フィルタなしで5件
      expect(getTableRows()).toHaveLength(5);

      // クリアボタンをクリック
      const clearButton = screen.getByRole('button', { name: /クリア/i });
      await user.click(clearButton);

      // 5件のまま
      expect(getTableRows()).toHaveLength(5);
    });
  });

  describe('Requirement 6.7: フィルタとページネーションの連携', () => {
    it('フィルタ適用後のページネーションはフィルタ結果に対して適用される', async () => {
      // 60件の項目を持つモックデータを作成
      const manyItems = Array.from({ length: 60 }, (_, i) => ({
        id: `item-${i}`,
        customCategory: i < 55 ? '対象分類' : 'その他',
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

      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 60件 -> 2ページ
      expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

      // 「対象分類」でフィルタ -> 55件 -> 2ページ
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '対象');

      // フィルタ後: 55件 -> 2ページ
      expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

      // テーブルの行数は50件（1ページ分）
      expect(getTableRows()).toHaveLength(50);
    });

    it('フィルタによってページ数が減った場合、ページが1に戻る', async () => {
      // 60件の項目を持つモックデータを作成
      const manyItems = Array.from({ length: 60 }, (_, i) => ({
        id: `item-${i}`,
        customCategory: i < 10 ? '少数分類' : 'その他',
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

      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 初期状態: 60件 -> 2ページ
      expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

      // 2ページ目に移動
      const nextButton = screen.getByRole('button', { name: /次へ/i });
      await user.click(nextButton);
      expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();

      // 「少数分類」でフィルタ -> 10件 -> 1ページ（ページネーション非表示）
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '少数');

      // フィルタ後: 10件 -> 1ページ（ページネーション非表示）
      expect(screen.queryByText(/\/.*2/)).not.toBeInTheDocument();

      // テーブルの行数は10件
      expect(getTableRows()).toHaveLength(10);
    });

    it('フィルタとページネーションが正しく連携する（2ページ目の表示）', async () => {
      // 60件の項目を持つモックデータを作成
      const manyItems = Array.from({ length: 60 }, (_, i) => ({
        id: `item-${i}`,
        customCategory: '対象分類',
        workType: '工事',
        name: `項目${String(i).padStart(2, '0')}`,
        specification: '規格',
        unit: '個',
        quantity: i,
      }));

      const manyItemsStatement: ItemizedStatementDetail = {
        ...mockStatementDetail,
        itemCount: 60,
        items: manyItems,
      };

      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
        manyItemsStatement
      );

      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「対象分類」でフィルタ -> 60件全て対象
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '対象');

      // 1ページ目: 50件表示
      expect(getTableRows()).toHaveLength(50);
      expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

      // 2ページ目に移動
      const nextButton = screen.getByRole('button', { name: /次へ/i });
      await user.click(nextButton);

      // 2ページ目: 10件表示
      expect(getTableRows()).toHaveLength(10);
      expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument();
    });
  });

  describe('フィルタとソートの連携', () => {
    it('フィルタ適用後もソートが正常に動作する', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 「電気」でフィルタ -> 2件（電気設備）
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '電気');

      expect(getTableRows()).toHaveLength(2);

      // 数量でソート（昇順）
      const quantityHeader = screen.getByRole('columnheader', { name: /数量/i });
      fireEvent.click(quantityHeader);

      const rows = getTableRows();
      // 50.50（コンセント取付）< 100.00（ケーブル配線）
      expect(rows[0]?.quantity).toBe('50.50');
      expect(rows[1]?.quantity).toBe('100.00');
    });

    it('ソート適用後にフィルタを変更してもソートが維持される', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 数量でソート（昇順）
      const quantityHeader = screen.getByRole('columnheader', { name: /数量/i });
      fireEvent.click(quantityHeader);

      // 「電気」でフィルタ
      const filterInput = screen.getByRole('textbox', { name: /任意分類/i });
      await user.type(filterInput, '電気');

      const rows = getTableRows();
      // ソートが維持されている
      expect(rows[0]?.quantity).toBe('50.50');
      expect(rows[1]?.quantity).toBe('100.00');
    });
  });

  describe('null値のフィルタリング', () => {
    it('null値はフィルタにマッチしない', async () => {
      const user = userEvent.setup();
      renderComponent();
      await screen.findByRole('table');

      // 空調設備の項目はworkTypeがnull
      // 「工事」でフィルタすると、workTypeがnullの項目はマッチしない
      const filterInput = screen.getByRole('textbox', { name: /工種/i });
      await user.type(filterInput, '工事');

      const rows = getTableRows();
      // null値を持つ項目（空調設備）は表示されない
      expect(rows.every((row) => row.workType !== '-')).toBe(true);
    });
  });
});
