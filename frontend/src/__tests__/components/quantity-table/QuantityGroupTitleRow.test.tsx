/**
 * @fileoverview 数量グループメインタイトル行コンポーネントのテスト
 *
 * Task 23.1: 数量グループのメインタイトル行コンポーネントを実装する
 * Task 24.1: メインタイトル行コンポーネントの単体テストを実装する
 *
 * Requirements:
 * - 18.1: メインのタイトル行を数量グループの一番上にのみ表示する
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuantityGroupTitleRow from '../../../components/quantity-table/QuantityGroupTitleRow';
import { QUANTITY_ITEM_GRID_COLUMNS } from '../../../components/quantity-table/gridConstants';

describe('QuantityGroupTitleRow', () => {
  describe('基本レンダリング', () => {
    it('メインタイトル行の全12列が正しいテキストで表示される', () => {
      render(<QuantityGroupTitleRow />);

      // 全11列のタイトルテキスト + 操作列 = 12列
      expect(screen.getByText('大項目')).toBeInTheDocument();
      expect(screen.getByText('中項目')).toBeInTheDocument();
      expect(screen.getByText('小項目')).toBeInTheDocument();
      expect(screen.getByText('任意分類')).toBeInTheDocument();
      expect(screen.getByText('工種')).toBeInTheDocument();
      expect(screen.getByText('名称')).toBeInTheDocument();
      expect(screen.getByText('規格')).toBeInTheDocument();
      expect(screen.getByText('計算方法')).toBeInTheDocument();
      expect(screen.getByText('数量')).toBeInTheDocument();
      expect(screen.getByText('単位')).toBeInTheDocument();
      expect(screen.getByText('備考')).toBeInTheDocument();
      expect(screen.getByText('並替 / 操作')).toBeInTheDocument();
    });

    it('data-testidが設定されている', () => {
      render(<QuantityGroupTitleRow />);

      expect(screen.getByTestId('quantity-group-title-row')).toBeInTheDocument();
    });

    it('roleがrowに設定されている', () => {
      render(<QuantityGroupTitleRow />);

      expect(screen.getByRole('row')).toBeInTheDocument();
    });

    it('各列がcolumnheaderロールを持つ', () => {
      render(<QuantityGroupTitleRow />);

      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders).toHaveLength(12);
    });
  });

  describe('グリッドレイアウト', () => {
    it('EditableQuantityItemRowと同一のgridTemplateColumnsを使用する', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.gridTemplateColumns).toBe(QUANTITY_ITEM_GRID_COLUMNS);
    });

    it('displayがgridに設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.display).toBe('grid');
    });
  });

  /**
   * Task 24.1: メインタイトル行コンポーネントの単体テスト
   */
  describe('Task 24.1: メインタイトル行の全11列テキスト検証', () => {
    it('メインフィールドの11列が要件順序通りに表示される（大項目〜備考）', () => {
      render(<QuantityGroupTitleRow />);

      const columnHeaders = screen.getAllByRole('columnheader');
      // 要件: 大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考（+操作列 = 12列）
      const expectedOrder = [
        '大項目',
        '中項目',
        '小項目',
        '任意分類',
        '工種',
        '名称',
        '規格',
        '計算方法',
        '数量',
        '単位',
        '備考',
        '並替 / 操作',
      ];

      expectedOrder.forEach((expectedText, index) => {
        expect(columnHeaders[index]!.textContent).toBe(expectedText);
      });
    });

    it('メインフィールド11列のテキストのみが含まれる（操作列を除く）', () => {
      render(<QuantityGroupTitleRow />);

      const columnHeaders = screen.getAllByRole('columnheader');
      // 操作列を除いた11列のテキストを検証
      const mainFieldTexts = columnHeaders
        .map((h) => h.textContent)
        .filter((t) => t !== '並替 / 操作');
      expect(mainFieldTexts).toHaveLength(11);
      expect(mainFieldTexts).toEqual([
        '大項目',
        '中項目',
        '小項目',
        '任意分類',
        '工種',
        '名称',
        '規格',
        '計算方法',
        '数量',
        '単位',
        '備考',
      ]);
    });
  });

  describe('Task 24.1: グリッドレイアウトが数量項目行と一致することの検証', () => {
    it('QUANTITY_ITEM_GRID_COLUMNSのカラム数とタイトル列数が一致する', () => {
      render(<QuantityGroupTitleRow />);

      // gridTemplateColumnsの列数を検証
      const columnCount = QUANTITY_ITEM_GRID_COLUMNS.split(' ').length;
      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders).toHaveLength(columnCount);
    });

    it('gapが2pxに設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.gap).toBe('2px');
    });

    it('alignItemsがcenterに設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.alignItems).toBe('center');
    });
  });

  describe('スタイル仕様', () => {
    it('背景色が#f3f4f6に設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.backgroundColor).toBe('rgb(243, 244, 246)');
    });

    it('フォントサイズが11pxに設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.fontSize).toBe('11px');
    });

    it('フォントウエイトが600に設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.fontWeight).toBe('600');
    });

    it('下線が1px solid #d1d5dbに設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      // jsdomはカラーをrgb形式に変換する
      expect(titleRow.style.borderBottom).toBe('1px solid rgb(209, 213, 219)');
    });

    it('テキスト色が#374151に設定されている', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');
      expect(titleRow.style.color).toBe('rgb(55, 65, 81)');
    });
  });
});
