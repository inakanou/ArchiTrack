/**
 * @fileoverview LineItemEditorコンポーネントの単体テスト
 *
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
 *
 * @module __tests__/components/estimate-requests/LineItemEditor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  LineItemEditor,
  createEmptyLineItem,
  calculateAmount,
  calculateTotalAmount,
  type LineItemFormData,
} from '../../../components/estimate-requests/LineItemEditor';

describe('LineItemEditor', () => {
  const mockOnLineItemsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('ヘルパー関数のテスト', () => {
    describe('calculateAmount', () => {
      it('数量と単価から金額を計算する', () => {
        expect(calculateAmount('10', '1000')).toBe(10000);
        expect(calculateAmount('5.5', '2000')).toBe(11000);
        expect(calculateAmount('100', '99.99')).toBe(9999);
      });

      it('数量または単価が無効な場合はnullを返す', () => {
        expect(calculateAmount('', '1000')).toBeNull();
        expect(calculateAmount('10', '')).toBeNull();
        expect(calculateAmount('abc', '1000')).toBeNull();
        expect(calculateAmount('10', 'xyz')).toBeNull();
      });

      it('小数点以下を四捨五入して整数にする', () => {
        // 10 * 100.5 = 1005 -> 四捨五入
        expect(calculateAmount('10', '100.5')).toBe(1005);
        // 3 * 33.33 = 99.99 -> 四捨五入で100
        expect(calculateAmount('3', '33.33')).toBe(100);
      });
    });

    describe('calculateTotalAmount', () => {
      it('全明細行の金額合計を計算する', () => {
        const items: LineItemFormData[] = [
          {
            id: '1',
            customCategory: '',
            workType: '',
            name: '項目1',
            specification: '',
            unit: '',
            quantity: '',
            unitPrice: '',
            amount: 10000,
            remarks: '',
          },
          {
            id: '2',
            customCategory: '',
            workType: '',
            name: '項目2',
            specification: '',
            unit: '',
            quantity: '',
            unitPrice: '',
            amount: 20000,
            remarks: '',
          },
          {
            id: '3',
            customCategory: '',
            workType: '',
            name: '項目3',
            specification: '',
            unit: '',
            quantity: '',
            unitPrice: '',
            amount: 30000,
            remarks: '',
          },
        ];
        expect(calculateTotalAmount(items)).toBe(60000);
      });

      it('金額がnullの項目は0として扱う', () => {
        const items: LineItemFormData[] = [
          {
            id: '1',
            customCategory: '',
            workType: '',
            name: '項目1',
            specification: '',
            unit: '',
            quantity: '',
            unitPrice: '',
            amount: 10000,
            remarks: '',
          },
          {
            id: '2',
            customCategory: '',
            workType: '',
            name: '項目2',
            specification: '',
            unit: '',
            quantity: '',
            unitPrice: '',
            amount: null,
            remarks: '',
          },
        ];
        expect(calculateTotalAmount(items)).toBe(10000);
      });

      it('空配列の場合は0を返す', () => {
        expect(calculateTotalAmount([])).toBe(0);
      });
    });

    describe('createEmptyLineItem', () => {
      it('空の明細行データを生成する', () => {
        const item = createEmptyLineItem();
        expect(item.id).toBeTruthy();
        expect(item.name).toBe('');
        expect(item.specification).toBe('');
        expect(item.unit).toBe('');
        expect(item.quantity).toBe('');
        expect(item.unitPrice).toBe('');
        expect(item.amount).toBeNull();
        expect(item.remarks).toBe('');
      });

      it('生成されるIDはユニーク', () => {
        const item1 = createEmptyLineItem();
        const item2 = createEmptyLineItem();
        expect(item1.id).not.toBe(item2.id);
      });
    });
  });

  describe('初期表示テスト', () => {
    it('初期表示時に1行の空明細行が表示される（Requirements: 11.13）', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      // テーブルが表示される
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      // 1行のデータ行が存在する
      const rows = screen.getAllByRole('row');
      // ヘッダー行 + データ行1つ = 2
      expect(rows).toHaveLength(2);
    });

    it('ヘッダー行に必要な列が表示される', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

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

    it('追加ボタンが表示される（Requirements: 11.14）', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      const addButton = screen.getByRole('button', { name: '行を追加' });
      expect(addButton).toBeInTheDocument();
    });

    it('合計金額が表示される（Requirements: 11.12）', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      expect(screen.getByText('合計')).toBeInTheDocument();
      expect(screen.getByTestId('total-amount')).toBeInTheDocument();
    });
  });

  describe('明細行追加テスト（Requirements: 11.15）', () => {
    it('追加ボタンクリックで新しい空の明細行を末尾に追加する', async () => {
      const user = userEvent.setup();
      const emptyLineItem = createEmptyLineItem();

      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      const addButton = screen.getByRole('button', { name: '行を追加' });
      await user.click(addButton);

      expect(mockOnLineItemsChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[] | undefined;
      expect(newItems).toHaveLength(2);
      expect(newItems?.[1]?.name).toBe('');
    });
  });

  describe('明細行削除テスト（Requirements: 11.16, 11.17, 11.18）', () => {
    it('各明細行に削除ボタンが表示される（Requirements: 11.16）', () => {
      const lineItems: LineItemFormData[] = [
        {
          id: '1',
          customCategory: '',
          workType: '',
          name: '項目1',
          specification: '',
          unit: '',
          quantity: '10',
          unitPrice: '1000',
          amount: 10000,
          remarks: '',
        },
        {
          id: '2',
          customCategory: '',
          workType: '',
          name: '項目2',
          specification: '',
          unit: '',
          quantity: '5',
          unitPrice: '2000',
          amount: 10000,
          remarks: '',
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      expect(deleteButtons).toHaveLength(2);
    });

    it('削除ボタンクリックで該当行を削除する（Requirements: 11.17）', async () => {
      const user = userEvent.setup();
      const lineItems: LineItemFormData[] = [
        {
          id: '1',
          customCategory: '',
          workType: '',
          name: '項目1',
          specification: '',
          unit: '',
          quantity: '10',
          unitPrice: '1000',
          amount: 10000,
          remarks: '',
        },
        {
          id: '2',
          customCategory: '',
          workType: '',
          name: '項目2',
          specification: '',
          unit: '',
          quantity: '5',
          unitPrice: '2000',
          amount: 10000,
          remarks: '',
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      // 1行目の削除ボタンをクリック
      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      const firstDeleteButton = deleteButtons[0];
      expect(firstDeleteButton).toBeDefined();
      await user.click(firstDeleteButton!);

      expect(mockOnLineItemsChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[] | undefined;
      expect(newItems).toHaveLength(1);
      expect(newItems?.[0]?.id).toBe('2');
    });

    it('明細行が1行のみの場合は削除ボタンが非活性になる（Requirements: 11.18）', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      const deleteButton = screen.getByRole('button', { name: /削除/ });
      expect(deleteButton).toBeDisabled();
    });

    it('明細行が2行以上の場合は削除ボタンが活性になる', () => {
      const lineItems: LineItemFormData[] = [
        {
          id: '1',
          customCategory: '',
          workType: '',
          name: '項目1',
          specification: '',
          unit: '',
          quantity: '',
          unitPrice: '',
          amount: null,
          remarks: '',
        },
        {
          id: '2',
          customCategory: '',
          workType: '',
          name: '項目2',
          specification: '',
          unit: '',
          quantity: '',
          unitPrice: '',
          amount: null,
          remarks: '',
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/ });
      deleteButtons.forEach((btn) => {
        expect(btn).not.toBeDisabled();
      });
    });
  });

  describe('金額自動再計算テスト（Requirements: 11.10, 11.11）', () => {
    it('数量変更時に金額が自動再計算される', async () => {
      // 初期状態: quantity='', unitPrice='1000' -> amount=null（数量未入力）
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '項目1',
        specification: '',
        unit: '',
        quantity: '',
        unitPrice: '1000',
        amount: null,
        remarks: '',
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // 数量フィールドに '5' を入力（fireEventで直接変更イベントを発火）
      const quantityInput = screen.getByPlaceholderText('数量') as HTMLInputElement;
      fireEvent.change(quantityInput, { target: { value: '5' } });

      // onLineItemsChangeが呼ばれ、金額が再計算される
      await waitFor(() => {
        expect(mockOnLineItemsChange).toHaveBeenCalled();
      });

      // 呼び出しで金額が更新されていることを確認
      const lastCall =
        mockOnLineItemsChange.mock.calls[mockOnLineItemsChange.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      const updatedItems = lastCall![0] as LineItemFormData[];
      // 5 * 1000 = 5000
      expect(updatedItems[0]?.amount).toBe(5000);
    });

    it('単価変更時に金額が自動再計算される', async () => {
      // 初期状態: quantity='10', unitPrice='' -> amount=null（単価未入力）
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '項目1',
        specification: '',
        unit: '',
        quantity: '10',
        unitPrice: '',
        amount: null,
        remarks: '',
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // 単価フィールドに '500' を入力（fireEventで直接変更イベントを発火）
      const unitPriceInput = screen.getByPlaceholderText('単価') as HTMLInputElement;
      fireEvent.change(unitPriceInput, { target: { value: '500' } });

      await waitFor(() => {
        expect(mockOnLineItemsChange).toHaveBeenCalled();
      });

      // 呼び出しで金額が更新されていることを確認
      const lastCall =
        mockOnLineItemsChange.mock.calls[mockOnLineItemsChange.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      const updatedItems = lastCall![0] as LineItemFormData[];
      // 10 * 500 = 5000
      expect(updatedItems[0]?.amount).toBe(5000);
    });
  });

  describe('合計金額の自動計算テスト（Requirements: 11.12）', () => {
    it('複数行の金額合計が正しく表示される', () => {
      const lineItems: LineItemFormData[] = [
        {
          id: '1',
          customCategory: '',
          workType: '',
          name: '項目1',
          specification: '',
          unit: '',
          quantity: '10',
          unitPrice: '1000',
          amount: 10000,
          remarks: '',
        },
        {
          id: '2',
          customCategory: '',
          workType: '',
          name: '項目2',
          specification: '',
          unit: '',
          quantity: '5',
          unitPrice: '5000',
          amount: 25000,
          remarks: '',
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      // 合計金額が35,000と表示される
      const totalAmount = screen.getByTestId('total-amount');
      expect(totalAmount).toHaveTextContent('35,000');
    });

    it('金額がnullの行は合計に含まれない', () => {
      const lineItems: LineItemFormData[] = [
        {
          id: '1',
          customCategory: '',
          workType: '',
          name: '項目1',
          specification: '',
          unit: '',
          quantity: '10',
          unitPrice: '1000',
          amount: 10000,
          remarks: '',
        },
        {
          id: '2',
          customCategory: '',
          workType: '',
          name: '項目2',
          specification: '',
          unit: '',
          quantity: '',
          unitPrice: '',
          amount: null,
          remarks: '',
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      const totalAmount = screen.getByTestId('total-amount');
      expect(totalAmount).toHaveTextContent('10,000');
    });
  });

  describe('金額フィールドの読み取り専用テスト（Requirements: 11.21）', () => {
    it('金額フィールドは入力不可（読み取り専用）である', () => {
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '項目1',
        specification: '',
        unit: '',
        quantity: '10',
        unitPrice: '1000',
        amount: 10000,
        remarks: '',
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // 金額セルは入力フィールドではなくテキスト表示
      const amountCell = screen.getByTestId('line-item-amount');
      expect(amountCell).toHaveTextContent('10,000');

      // 金額フィールドにinput要素がないことを確認
      const amountInputs = screen
        .queryAllByRole('textbox')
        .filter((input) => (input as HTMLInputElement).placeholder === '金額');
      expect(amountInputs).toHaveLength(0);
    });
  });

  describe('Tabキーフォーカス移動テスト（Requirements: 11.19, 11.20）', () => {
    it('フィールド間をTabキーで順次移動できる', async () => {
      const user = userEvent.setup();
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '',
        specification: '',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: null,
        remarks: '',
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // 任意分類フィールドにフォーカス（フィールド順序: 任意分類 -> 工種 -> 名称 -> 規格 -> ...）
      const customCategoryInput = screen.getByPlaceholderText('任意分類');
      await user.click(customCategoryInput);
      expect(document.activeElement).toBe(customCategoryInput);

      // Tabキーで次のフィールド（工種）に移動
      await user.tab();
      const workTypeInput = screen.getByPlaceholderText('工種');
      expect(document.activeElement).toBe(workTypeInput);

      // Tabキーで次のフィールド（名称）に移動
      await user.tab();
      const nameInput = screen.getByPlaceholderText('名称');
      expect(document.activeElement).toBe(nameInput);

      // Tabキーで次のフィールド（規格）に移動
      await user.tab();
      const specInput = screen.getByPlaceholderText('規格');
      expect(document.activeElement).toBe(specInput);
    });

    it('最終フィールドでTabキーを押すと次の明細行の最初のフィールドへフォーカスが移動する', async () => {
      const user = userEvent.setup();
      const lineItems: LineItemFormData[] = [
        {
          id: '1',
          customCategory: '',
          workType: '',
          name: '項目1',
          specification: '',
          unit: '',
          quantity: '',
          unitPrice: '',
          amount: null,
          remarks: '',
        },
        {
          id: '2',
          customCategory: '',
          workType: '',
          name: '',
          specification: '',
          unit: '',
          quantity: '',
          unitPrice: '',
          amount: null,
          remarks: '',
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      // 1行目の備考フィールド（最終フィールド）にフォーカス
      const remarksInputs = screen.getAllByPlaceholderText('備考');
      const firstRemarksInput = remarksInputs[0];
      expect(firstRemarksInput).toBeDefined();
      await user.click(firstRemarksInput!);

      // Tabキーを押す
      await user.tab();

      // 2行目の任意分類フィールド（最初のフィールド）にフォーカスが移動していることを確認
      const customCategoryInputs = screen.getAllByPlaceholderText('任意分類');
      expect(document.activeElement).toBe(customCategoryInputs[1]);
    });
  });

  describe('disabled状態テスト', () => {
    it('disabled=trueの場合、すべての入力フィールドが非活性になる', () => {
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '項目1',
        specification: '',
        unit: '',
        quantity: '10',
        unitPrice: '1000',
        amount: 10000,
        remarks: '',
      };

      render(
        <LineItemEditor
          lineItems={[lineItem]}
          onLineItemsChange={mockOnLineItemsChange}
          disabled={true}
        />
      );

      // すべての入力フィールドがdisabled
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });

      // 追加ボタンもdisabled
      const addButton = screen.getByRole('button', { name: '行を追加' });
      expect(addButton).toBeDisabled();

      // 削除ボタンもdisabled
      const deleteButton = screen.getByRole('button', { name: /削除/ });
      expect(deleteButton).toBeDisabled();
    });
  });

  // ==========================================================================
  // Task 36.2: 任意分類・工種列テスト (Requirements: 11.10)
  // ==========================================================================
  describe('任意分類・工種列テスト (Task 36.2)', () => {
    it('ヘッダー行に任意分類列と工種列が表示される', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      expect(screen.getByText('任意分類')).toBeInTheDocument();
      expect(screen.getByText('工種')).toBeInTheDocument();
    });

    it('任意分類フィールドへの入力が正常に動作する', async () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      const customCategoryInput = screen.getByPlaceholderText('任意分類');
      fireEvent.change(customCategoryInput, { target: { value: '躯体工事' } });

      await waitFor(() => {
        expect(mockOnLineItemsChange).toHaveBeenCalled();
      });

      const lastCall =
        mockOnLineItemsChange.mock.calls[mockOnLineItemsChange.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      const updatedItems = lastCall![0] as LineItemFormData[];
      expect(updatedItems[0]?.customCategory).toBe('躯体工事');
    });

    it('工種フィールドへの入力が正常に動作する', async () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      const workTypeInput = screen.getByPlaceholderText('工種');
      fireEvent.change(workTypeInput, { target: { value: '鉄筋工事' } });

      await waitFor(() => {
        expect(mockOnLineItemsChange).toHaveBeenCalled();
      });

      const lastCall =
        mockOnLineItemsChange.mock.calls[mockOnLineItemsChange.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      const updatedItems = lastCall![0] as LineItemFormData[];
      expect(updatedItems[0]?.workType).toBe('鉄筋工事');
    });

    it('createEmptyLineItemで任意分類と工種が空文字列で初期化される', () => {
      const item = createEmptyLineItem();
      expect(item.customCategory).toBe('');
      expect(item.workType).toBe('');
    });

    it('Tabキーフォーカス移動順序が任意分類、工種、名称、規格、単位、数量、単価、備考になっている', async () => {
      const user = userEvent.setup();
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '',
        specification: '',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: null,
        remarks: '',
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // 任意分類にフォーカス
      const customCategoryInput = screen.getByPlaceholderText('任意分類');
      await user.click(customCategoryInput);
      expect(document.activeElement).toBe(customCategoryInput);

      // Tab: 工種
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('工種'));

      // Tab: 名称
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('名称'));

      // Tab: 規格
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('規格'));

      // Tab: 単位
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('単位'));

      // Tab: 数量
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('数量'));

      // Tab: 単価
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('単価'));

      // Tab: 備考
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('備考'));
    });
  });
});
