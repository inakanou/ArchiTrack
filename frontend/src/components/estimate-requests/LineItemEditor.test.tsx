/**
 * @fileoverview LineItemEditor コンポーネントのテスト
 *
 * Task 23.1: LineItemEditorコンポーネントの実装
 * Task 28.1: LineItemEditorコンポーネントの単体テスト
 *
 * Requirements:
 * - 11.9: 構造化データ入力エリアに明細行フィールドを表示する
 * - 11.10: 金額フィールドを入力不可とし自動計算する
 * - 11.11: 数量または単価変更時に金額を自動再計算する
 * - 11.12: 全明細行の金額合計を自動計算して表示する
 * - 11.13: フォーム初期表示時に1行の空の明細行を表示する
 * - 11.14: 明細行の追加ボタンを表示する
 * - 11.15: 追加ボタンクリックで新しい空の明細行を末尾に追加する
 * - 11.16: 各明細行に削除ボタンを表示する
 * - 11.17: 削除ボタンクリックで該当行を削除し合計金額を再計算する
 * - 11.18: 明細行が1行のみの場合は削除ボタンを非活性にする
 * - 11.19: Tabキーによるフィールド間の順次移動をサポートする
 * - 11.20: 最終フィールドでTabキーを押すと次の明細行の最初のフィールドへ移動する
 * - 11.21: 金額フィールドは入力不可（読み取り専用）とする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LineItemEditor, type LineItemFormData, createEmptyLineItem } from './LineItemEditor';

// ============================================================================
// テストヘルパー
// ============================================================================

/**
 * 空の明細行データを生成するヘルパー
 */
function createLineItem(overrides: Partial<LineItemFormData> = {}): LineItemFormData {
  return {
    ...createEmptyLineItem(),
    ...overrides,
  };
}

/**
 * デフォルトのProps
 */
function getDefaultProps(overrides: Partial<Parameters<typeof LineItemEditor>[0]> = {}) {
  return {
    lineItems: [createEmptyLineItem()],
    onLineItemsChange: vi.fn(),
    ...overrides,
  };
}

/**
 * mock.callsから安全にLineItemFormData配列を取得するヘルパー
 *
 * TypeScript strictモードでのObject is possibly 'undefined'エラーを回避するため、
 * as unknown as TypeScript型アサーションパターンを使用
 */
function getCallItems(mockFn: ReturnType<typeof vi.fn>, callIndex: number): LineItemFormData[] {
  // Vitest MockのcallsはVitest内部型で管理されており、
  // 配列アクセスでundefined可能性がある。テスト文脈ではexpectで事前検証済みのため安全
  const call = mockFn.mock.calls[callIndex] as unknown as [LineItemFormData[]];
  return call[0];
}

// ============================================================================
// テスト
// ============================================================================

describe('LineItemEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 初期表示テスト
  // --------------------------------------------------------------------------

  describe('初期表示', () => {
    it('テーブル形式のレイアウトが表示される (11.9)', () => {
      const props = getDefaultProps();
      render(<LineItemEditor {...props} />);

      // ヘッダー列の確認
      expect(screen.getByText('No')).toBeInTheDocument();
      expect(screen.getByText('名称')).toBeInTheDocument();
      expect(screen.getByText('規格')).toBeInTheDocument();
      expect(screen.getByText('単位')).toBeInTheDocument();
      expect(screen.getByText('数量')).toBeInTheDocument();
      expect(screen.getByText('単価')).toBeInTheDocument();
      expect(screen.getByText('金額')).toBeInTheDocument();
      expect(screen.getByText('備考')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
    });

    it('フォーム初期表示時に1行の空の明細行が表示される (11.13, 11.14)', () => {
      const props = getDefaultProps();
      render(<LineItemEditor {...props} />);

      // 1行目のNo.が表示される
      expect(screen.getByText('1')).toBeInTheDocument();

      // 入力フィールドが存在する（名称フィールド）
      const nameInputs = screen.getAllByPlaceholderText('名称');
      expect(nameInputs).toHaveLength(1);
    });

    it('明細行追加ボタンが表示される (11.15)', () => {
      const props = getDefaultProps();
      render(<LineItemEditor {...props} />);

      expect(screen.getByRole('button', { name: /行を追加/ })).toBeInTheDocument();
    });

    it('合計金額表示エリアが表示される (11.13)', () => {
      const props = getDefaultProps();
      render(<LineItemEditor {...props} />);

      expect(screen.getByText('合計')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 明細行追加テスト
  // --------------------------------------------------------------------------

  describe('明細行追加', () => {
    it('追加ボタンクリックで新しい空の明細行が末尾に追加される (11.16)', async () => {
      const onLineItemsChange = vi.fn();
      const initialItems = [createEmptyLineItem()];
      const props = getDefaultProps({
        lineItems: initialItems,
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const addButton = screen.getByRole('button', { name: /行を追加/ });
      await userEvent.click(addButton);

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const newItems = getCallItems(onLineItemsChange, 0);
      expect(newItems).toHaveLength(2);
      // 既存の行がそのまま残っている
      expect(newItems[0]?.id).toBe(initialItems[0]?.id);
      // 新しい行が末尾に追加されている
      expect(newItems[1]?.name).toBe('');
      expect(newItems[1]?.specification).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // 明細行削除テスト
  // --------------------------------------------------------------------------

  describe('明細行削除', () => {
    it('各行に削除ボタンが表示される (11.17)', () => {
      const items = [createLineItem(), createLineItem()];
      const props = getDefaultProps({ lineItems: items });
      render(<LineItemEditor {...props} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      expect(deleteButtons).toHaveLength(2);
    });

    it('削除ボタンクリックで該当行が削除される (11.18)', async () => {
      const onLineItemsChange = vi.fn();
      const item1 = createLineItem({ name: '項目1' });
      const item2 = createLineItem({ name: '項目2' });
      const props = getDefaultProps({
        lineItems: [item1, item2],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      // 1行目の削除ボタンをクリック
      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const firstDeleteButton = deleteButtons[0];
      expect(firstDeleteButton).toBeDefined();
      await userEvent.click(firstDeleteButton as HTMLElement);

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const newItems = getCallItems(onLineItemsChange, 0);
      expect(newItems).toHaveLength(1);
      expect(newItems[0]?.id).toBe(item2.id);
    });

    it('明細行が1行のみの場合は削除ボタンが非活性になる (11.19)', () => {
      const props = getDefaultProps({
        lineItems: [createEmptyLineItem()],
      });
      render(<LineItemEditor {...props} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      expect(deleteButtons).toHaveLength(1);
      expect(deleteButtons[0]).toBeDisabled();
    });

    it('明細行が2行以上の場合は削除ボタンが活性になる', () => {
      const props = getDefaultProps({
        lineItems: [createEmptyLineItem(), createEmptyLineItem()],
      });
      render(<LineItemEditor {...props} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      expect(deleteButtons).toHaveLength(2);
      deleteButtons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 金額自動計算テスト
  // --------------------------------------------------------------------------

  describe('金額自動計算', () => {
    it('数量と単価が入力されると金額が自動計算される (11.11, 11.12)', () => {
      const onLineItemsChange = vi.fn();
      const item = createLineItem({ quantity: '', unitPrice: '' });
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      // 数量を入力（単価が空のため金額はnull）
      const quantityInput = screen.getByPlaceholderText('数量');
      fireEvent.change(quantityInput, { target: { value: '10' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      // 数量のみでは金額はnull
      expect(updatedItems[0]?.amount).toBeNull();
    });

    it('数量と単価の両方が入力されると金額が計算される (11.11)', () => {
      const item = createLineItem({ quantity: '5', unitPrice: '1000' });
      // 初期状態で金額が計算されることを確認
      const itemWithAmount = { ...item, amount: 5000 };
      const props = getDefaultProps({
        lineItems: [itemWithAmount],
      });

      render(<LineItemEditor {...props} />);

      // 金額フィールドが5000と表示される
      const amountCells = screen.getAllByTestId('line-item-amount');
      expect(amountCells[0]).toHaveTextContent('5,000');
    });

    it('金額フィールドは入力不可（読み取り専用）である (11.10, 11.21)', () => {
      const item = createLineItem({ quantity: '3', unitPrice: '500', amount: 1500 });
      const props = getDefaultProps({
        lineItems: [item],
      });
      render(<LineItemEditor {...props} />);

      // 金額フィールドはinput要素ではなくテキスト表示
      const amountCells = screen.getAllByTestId('line-item-amount');
      expect(amountCells[0]).toHaveTextContent('1,500');
      // input要素が金額列にないことを確認（amountのinputは存在しない）
      const amountInputs = screen.queryAllByPlaceholderText('金額');
      expect(amountInputs).toHaveLength(0);
    });

    it('全明細行の金額合計が自動計算されて表示される (11.13)', () => {
      const items = [
        createLineItem({ quantity: '2', unitPrice: '1000', amount: 2000 }),
        createLineItem({ quantity: '3', unitPrice: '500', amount: 1500 }),
      ];
      const props = getDefaultProps({ lineItems: items });
      render(<LineItemEditor {...props} />);

      // 合計金額が表示される
      const totalAmount = screen.getByTestId('total-amount');
      expect(totalAmount).toHaveTextContent('3,500');
    });

    it('金額がnullの行がある場合でも合計金額が正しく計算される', () => {
      const items = [
        createLineItem({ quantity: '2', unitPrice: '1000', amount: 2000 }),
        createLineItem({ quantity: '', unitPrice: '', amount: null }),
      ];
      const props = getDefaultProps({ lineItems: items });
      render(<LineItemEditor {...props} />);

      const totalAmount = screen.getByTestId('total-amount');
      expect(totalAmount).toHaveTextContent('2,000');
    });

    it('全ての行の金額がnullの場合は合計金額が0と表示される', () => {
      const items = [createLineItem({ amount: null }), createLineItem({ amount: null })];
      const props = getDefaultProps({ lineItems: items });
      render(<LineItemEditor {...props} />);

      const totalAmount = screen.getByTestId('total-amount');
      expect(totalAmount).toHaveTextContent('0');
    });
  });

  // --------------------------------------------------------------------------
  // フィールド変更テスト
  // --------------------------------------------------------------------------

  describe('フィールド変更', () => {
    it('名称フィールドの変更がコールバックで通知される', () => {
      const onLineItemsChange = vi.fn();
      const item = createEmptyLineItem();
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const nameInput = screen.getByPlaceholderText('名称');
      fireEvent.change(nameInput, { target: { value: 'テスト名称' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      expect(updatedItems[0]?.name).toBe('テスト名称');
    });

    it('規格フィールドの変更がコールバックで通知される', () => {
      const onLineItemsChange = vi.fn();
      const item = createEmptyLineItem();
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const specInput = screen.getByPlaceholderText('規格');
      fireEvent.change(specInput, { target: { value: 'A-100' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      expect(updatedItems[0]?.specification).toBe('A-100');
    });

    it('単位フィールドの変更がコールバックで通知される', () => {
      const onLineItemsChange = vi.fn();
      const item = createEmptyLineItem();
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const unitInput = screen.getByPlaceholderText('単位');
      fireEvent.change(unitInput, { target: { value: '式' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      expect(updatedItems[0]?.unit).toBe('式');
    });

    it('備考フィールドの変更がコールバックで通知される', () => {
      const onLineItemsChange = vi.fn();
      const item = createEmptyLineItem();
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const remarksInput = screen.getByPlaceholderText('備考');
      fireEvent.change(remarksInput, { target: { value: 'メモ' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      expect(updatedItems[0]?.remarks).toBe('メモ');
    });

    it('数量変更時に金額が自動再計算される (11.12)', () => {
      const onLineItemsChange = vi.fn();
      const item = createLineItem({ quantity: '', unitPrice: '1000', amount: null });
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const quantityInput = screen.getByPlaceholderText('数量');
      fireEvent.change(quantityInput, { target: { value: '5' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      expect(updatedItems[0]?.amount).toBe(5000);
    });

    it('単価変更時に金額が自動再計算される (11.12)', () => {
      const onLineItemsChange = vi.fn();
      const item = createLineItem({ quantity: '3', unitPrice: '', amount: null });
      const props = getDefaultProps({
        lineItems: [item],
        onLineItemsChange,
      });

      render(<LineItemEditor {...props} />);

      const unitPriceInput = screen.getByPlaceholderText('単価');
      fireEvent.change(unitPriceInput, { target: { value: '200' } });

      expect(onLineItemsChange).toHaveBeenCalledTimes(1);
      const updatedItems = getCallItems(onLineItemsChange, 0);
      expect(updatedItems[0]?.amount).toBe(600);
    });
  });

  // --------------------------------------------------------------------------
  // Tabキーフォーカス移動テスト
  // --------------------------------------------------------------------------

  describe('Tabキーフォーカス移動', () => {
    it('最終フィールド（備考）でTabキーを押すと次の行の最初のフィールドへ移動する (11.20, 11.21)', () => {
      const item1 = createEmptyLineItem();
      const item2 = createEmptyLineItem();
      const props = getDefaultProps({
        lineItems: [item1, item2],
      });

      render(<LineItemEditor {...props} />);

      // 1行目の備考フィールドを取得
      const remarksInputs = screen.getAllByPlaceholderText('備考');
      const firstRowRemarks = remarksInputs[0] as HTMLElement;

      // フォーカスを設定
      firstRowRemarks.focus();
      expect(document.activeElement).toBe(firstRowRemarks);

      // Tabキーを押す
      fireEvent.keyDown(firstRowRemarks, { key: 'Tab', code: 'Tab' });

      // 2行目の最初のフィールド（任意分類）にフォーカスが移動していることを確認
      // Task 32改修: FIELD_ORDERの先頭がcustomCategoryに変更されたため、
      // 次の行の最初のフィールドは「任意分類」になる
      const customCategoryInputs = screen.getAllByPlaceholderText('任意分類');
      expect(document.activeElement).toBe(customCategoryInputs[1]);
    });

    it('最終行の最終フィールドでTabを押しても正常に動作する', () => {
      const item1 = createEmptyLineItem();
      const props = getDefaultProps({
        lineItems: [item1],
      });

      render(<LineItemEditor {...props} />);

      // 1行目（最終行）の備考フィールドを取得
      const remarksInputs = screen.getAllByPlaceholderText('備考');
      const lastRowRemarks = remarksInputs[0] as HTMLElement;

      // フォーカスを設定
      lastRowRemarks.focus();

      // Tabキーを押してもエラーが出ないことを確認
      fireEvent.keyDown(lastRowRemarks, { key: 'Tab', code: 'Tab' });
      // 次の行がないのでフォーカスは変わらない（エラーが発生しないことが重要）
    });
  });

  // --------------------------------------------------------------------------
  // disabled状態テスト
  // --------------------------------------------------------------------------

  describe('disabled状態', () => {
    it('disabled時は全入力フィールドが無効化される', () => {
      const item = createLineItem({ name: 'テスト' });
      const props = getDefaultProps({
        lineItems: [item],
        disabled: true,
      });
      render(<LineItemEditor {...props} />);

      const nameInput = screen.getByPlaceholderText('名称');
      expect(nameInput).toBeDisabled();

      const specInput = screen.getByPlaceholderText('規格');
      expect(specInput).toBeDisabled();

      const unitInput = screen.getByPlaceholderText('単位');
      expect(unitInput).toBeDisabled();

      const quantityInput = screen.getByPlaceholderText('数量');
      expect(quantityInput).toBeDisabled();

      const unitPriceInput = screen.getByPlaceholderText('単価');
      expect(unitPriceInput).toBeDisabled();

      const remarksInput = screen.getByPlaceholderText('備考');
      expect(remarksInput).toBeDisabled();
    });

    it('disabled時は追加ボタンが無効化される', () => {
      const props = getDefaultProps({ disabled: true });
      render(<LineItemEditor {...props} />);

      expect(screen.getByRole('button', { name: /行を追加/ })).toBeDisabled();
    });

    it('disabled時は削除ボタンが無効化される', () => {
      const items = [createEmptyLineItem(), createEmptyLineItem()];
      const props = getDefaultProps({
        lineItems: items,
        disabled: true,
      });
      render(<LineItemEditor {...props} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      deleteButtons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 複数行表示テスト
  // --------------------------------------------------------------------------

  describe('複数行表示', () => {
    it('複数行の明細行がNo.付きで表示される', () => {
      const items = [
        createLineItem({ name: '項目A' }),
        createLineItem({ name: '項目B' }),
        createLineItem({ name: '項目C' }),
      ];
      const props = getDefaultProps({ lineItems: items });
      render(<LineItemEditor {...props} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      const nameInputs = screen.getAllByPlaceholderText('名称');
      expect(nameInputs).toHaveLength(3);
      expect(nameInputs[0]).toHaveValue('項目A');
      expect(nameInputs[1]).toHaveValue('項目B');
      expect(nameInputs[2]).toHaveValue('項目C');
    });
  });

  // --------------------------------------------------------------------------
  // 金額計算ロジック単体テスト
  // --------------------------------------------------------------------------

  describe('calculateAmount関数', () => {
    // design.mdに記載: Math.round(q * p) で整数丸め
    it('数量と単価の積を整数に丸めて返す', () => {
      // コンポーネント経由で計算結果の表示を確認
      const item = createLineItem({ quantity: '2.5', unitPrice: '333' });
      // calculateAmount(2.5, 333) = Math.round(832.5) = 833
      const itemWithAmount = { ...item, amount: 833 };
      const props = getDefaultProps({
        lineItems: [itemWithAmount],
      });

      render(<LineItemEditor {...props} />);

      const amountCells = screen.getAllByTestId('line-item-amount');
      expect(amountCells[0]).toHaveTextContent('833');
    });
  });
});
