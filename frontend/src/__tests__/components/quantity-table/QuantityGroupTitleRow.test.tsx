/**
 * @fileoverview 数量グループメインタイトル行コンポーネントのテスト
 *
 * Task 23.1: 数量グループのメインタイトル行コンポーネントを実装する
 * Task 24.1: メインタイトル行コンポーネントの単体テストを実装する
 * Task 51.6: 数量グループタイトル行を新レイアウト前提に整合させる
 *
 * Requirements:
 * - 18.1: メインのタイトル行を数量グループの一番上にのみ表示する
 * - 18.3: 計算用フィールド群の専用タイトル行を別行として表示せず、Requirement 37 に基づき
 *   各計算用フィールドのラベルを当該行内で当該テキストボックスの左側に隣接表示する
 * - 18.4: 計算用フィールド群の項目見出しを行内インラインラベル（Requirement 37 AC 2）として
 *   扱い、メイングループの計算用フィールド専用タイトル行はレイアウトから廃止する
 * - 37.12: 計算用フィールド群の専用タイトル行（別行）を表示しない（REQ-18 AC3/AC4 と整合）
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  /**
   * Task 51.6: 数量グループタイトル行を新レイアウト前提に整合させる
   *
   * 計算用フィールド（面積・体積／ピッチ）は REQ-37 に基づき各数量項目行内に
   * インライン配置される（CalculationFields コンポーネントが行内で
   * 「ラベル → テキストボックス → ラベル → テキストボックス → ...」の順序で描画）。
   * よって QuantityGroupTitleRow には計算用フィールド専用のタイトル列／タイトル行は
   * 一切含まれない。本 describe ブロックはその新レイアウト前提を回帰防止する。
   */
  describe('Task 51.6: REQ-18.3 / REQ-18.4 / REQ-37.12 新レイアウト整合', () => {
    it('REQ-18.4: タイトル行は計算用フィールド専用タイトル列を含まず、メイン列のみで構成される（columnheader 数=12）', () => {
      render(<QuantityGroupTitleRow />);

      // 計算用フィールド（面積・体積／ピッチ）の列タイトルはタイトル行に含まれない
      // タイトル行はメイン列（11列）+ 操作列（1列）= 12列のみ
      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders).toHaveLength(12);
    });

    it('REQ-37.12: 面積・体積計算用フィールド（幅(W)/奥行き(D)/高さ(H)/重量）のヘッダーラベルがタイトル行に存在しない', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');

      // 計算用フィールド（面積・体積）固有のラベルはタイトル行内に描画されない
      expect(within(titleRow).queryByText('幅(W)')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('幅（W）')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('奥行き(D)')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('奥行き（D）')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('高さ(H)')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('高さ（H）')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('重量')).not.toBeInTheDocument();
    });

    it('REQ-37.12: ピッチ計算用フィールド（範囲長/端長1/端長2/ピッチ長/長さ）のヘッダーラベルがタイトル行に存在しない', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');

      // 計算用フィールド（ピッチ）固有のラベルはタイトル行内に描画されない
      expect(within(titleRow).queryByText('範囲長')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('端長1')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('端長2')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('ピッチ長')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('長さ')).not.toBeInTheDocument();
    });

    it('REQ-37.12: 調整係数/丸め設定のヘッダーラベルもタイトル行に存在しない（メイン行外で行内インラインラベルとして描画される）', () => {
      render(<QuantityGroupTitleRow />);

      const titleRow = screen.getByTestId('quantity-group-title-row');

      // 「調整係数」「丸め設定」はメイン行（タイトル行）には現れない。
      // CalculationFields コンポーネント内で行内インラインラベルとして描画される。
      expect(within(titleRow).queryByText('調整係数')).not.toBeInTheDocument();
      expect(within(titleRow).queryByText('丸め設定')).not.toBeInTheDocument();
    });

    it('REQ-18.4: QuantityGroupTitleRow は単一の <div role="row"> のみを描画し、計算用フィールド専用タイトル行（別行）を持たない', () => {
      const { container } = render(<QuantityGroupTitleRow />);

      // QuantityGroupTitleRow は単一の row のみを生成する（計算用フィールド専用の
      // 別 row は描画しない）
      const rows = container.querySelectorAll('[role="row"]');
      expect(rows).toHaveLength(1);

      // testid 経由でも単一であることを保証
      const titleRows = screen.getAllByTestId('quantity-group-title-row');
      expect(titleRows).toHaveLength(1);
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
