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
  LineItemActionMenu,
  createEmptyLineItem,
  calculateAmount,
  calculateTotalAmount,
  reassignSortOrder,
  sortBySortOrder,
  ensureSortOrders,
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
            // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
            sortOrder: 0,
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
            // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
            sortOrder: 0,
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
            // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
            sortOrder: 0,
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
            // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
            sortOrder: 0,
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
            // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
            sortOrder: 0,
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
    // task 78.3 改訂4: 行内の独立した削除ボタンは LineItemActionMenu の
    // メニュー項目（role="menuitem"）に統合された。各テストは「操作メニュー
    // トグルを開いてからメニュー内の削除を取得する」フローへ最小修正している。
    // 削除メニュー項目の disabled 制御は LineItemEditor の deleteDisabled prop
    // を介して行うため、Req 11 AC 19（1 行のみのとき削除非活性）の挙動は維持。
    it('各明細行に削除ボタンが表示される（Requirements: 11.16）', async () => {
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 1,
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      // 各行のアクションメニュートグルが行末に存在する（=各行に削除導線がある）
      const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
      expect(toggles).toHaveLength(2);

      // メニューを開けば「削除」menuitem が露出することを確認
      await user.click(toggles[0]!);
      const deleteItem = screen.getByRole('menuitem', { name: '削除' });
      expect(deleteItem).toBeInTheDocument();
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 1,
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      // 1行目の操作メニューを開いて「削除」メニュー項目をクリック
      const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
      await user.click(toggles[0]!);
      const deleteItem = screen.getByRole('menuitem', { name: '削除' });
      await user.click(deleteItem);

      expect(mockOnLineItemsChange).toHaveBeenCalledTimes(1);
      const newItems = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[] | undefined;
      expect(newItems).toHaveLength(1);
      expect(newItems?.[0]?.id).toBe('2');
    });

    it('明細行が1行のみの場合は削除ボタンが非活性になる（Requirements: 11.18）', async () => {
      const user = userEvent.setup();
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      // メニューを開いて「削除」menuitem の disabled 状態を確認
      const toggle = screen.getByRole('button', { name: /の操作メニュー$/ });
      await user.click(toggle);
      const deleteItem = screen.getByRole('menuitem', { name: '削除' });
      expect(deleteItem).toBeDisabled();
    });

    it('明細行が2行以上の場合は削除ボタンが活性になる', async () => {
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 1,
        },
      ];

      render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

      // 各行ごとにメニューを開いて、削除メニュー項目が活性であることを確認
      const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
      for (const toggle of toggles) {
        await user.click(toggle);
        const deleteItem = screen.getByRole('menuitem', { name: '削除' });
        expect(deleteItem).not.toBeDisabled();
        // メニューを閉じてから次の行を検証する
        await user.keyboard('{Escape}');
      }
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
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
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
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
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
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
          // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
          sortOrder: 0,
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
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
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

      // 操作メニューのトグルボタンもdisabled（task 78.3 改訂4: 削除導線は
      // LineItemActionMenu に統合され、disabled 時はメニュー全体が非活性化される）
      const toggle = screen.getByRole('button', { name: /の操作メニュー$/ });
      expect(toggle).toBeDisabled();
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

    it('Tabキーフォーカス移動順序が任意分類、工種、名称、規格、単位、数量、単価、備考になっている（Task 62.1: NET金額列削除済み）', async () => {
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
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
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

      // Tab: 備考（NET金額は削除済み）
      await user.tab();
      expect(document.activeElement).toBe(screen.getByPlaceholderText('備考'));
    });
  });

  // ================================================================
  // Task 65.2: LineItemEditorのNET金額列削除確認テスト
  // Requirements: 28.5 (明細行にNET金額列を含めない)
  // ================================================================
  describe('NET金額列の不在確認テスト (Task 65.2)', () => {
    it('明細行テーブルのヘッダーにNET金額列が存在しないこと (Requirements: 28.5)', () => {
      const emptyLineItem = createEmptyLineItem();
      render(
        <LineItemEditor lineItems={[emptyLineItem]} onLineItemsChange={mockOnLineItemsChange} />
      );

      // 存在すべき列ヘッダーが表示されること
      expect(screen.getByText('No')).toBeInTheDocument();
      expect(screen.getByText('名称')).toBeInTheDocument();
      expect(screen.getByText('規格')).toBeInTheDocument();
      expect(screen.getByText('単位')).toBeInTheDocument();
      expect(screen.getByText('数量')).toBeInTheDocument();
      expect(screen.getByText('単価')).toBeInTheDocument();
      expect(screen.getByText('金額')).toBeInTheDocument();
      expect(screen.getByText('備考')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();

      // NET金額列が存在しないこと
      expect(screen.queryByText('NET金額')).not.toBeInTheDocument();
    });

    it('明細行の入力フィールドにNET金額フィールドが存在しないこと (Requirements: 28.5)', () => {
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '工事A',
        specification: '',
        unit: '',
        quantity: '10',
        unitPrice: '1000',
        amount: 10000,
        remarks: '',
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // NET金額のaria-label入力フィールドが存在しないこと
      expect(screen.queryByLabelText(/NET金額/)).not.toBeInTheDocument();
      // NET金額のプレースホルダー入力フィールドが存在しないこと
      expect(screen.queryByPlaceholderText(/NET金額/)).not.toBeInTheDocument();
    });

    it('LineItemFormDataインターフェースにnetAmountプロパティが存在しないこと (Requirements: 28.5)', () => {
      const emptyItem = createEmptyLineItem();

      // createEmptyLineItem()で生成されるオブジェクトにnetAmountが含まれないこと
      expect('netAmount' in emptyItem).toBe(false);

      // 明示的にプロパティの存在を確認
      const keys = Object.keys(emptyItem);
      expect(keys).not.toContain('netAmount');

      // 期待されるフィールドのみが存在すること
      expect(keys).toContain('id');
      expect(keys).toContain('customCategory');
      expect(keys).toContain('workType');
      expect(keys).toContain('name');
      expect(keys).toContain('specification');
      expect(keys).toContain('unit');
      expect(keys).toContain('quantity');
      expect(keys).toContain('unitPrice');
      expect(keys).toContain('amount');
      expect(keys).toContain('remarks');
    });

    it('合計金額エリアにNET金額合計が表示されないこと (Requirements: 28.5)', () => {
      const lineItem: LineItemFormData = {
        id: '1',
        customCategory: '',
        workType: '',
        name: '工事A',
        specification: '',
        unit: '',
        quantity: '10',
        unitPrice: '1000',
        amount: 10000,
        remarks: '',
        // task 78.1 暫定: 後続 task 79.3 で reassignSortOrder 適用に置換予定
        sortOrder: 0,
      };

      render(<LineItemEditor lineItems={[lineItem]} onLineItemsChange={mockOnLineItemsChange} />);

      // 合計金額は表示されること
      expect(screen.getByTestId('total-amount')).toBeInTheDocument();

      // NET金額合計は明細行レベルでは表示されないこと
      expect(screen.queryByTestId('total-net-amount')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 81.2: LineItemActionMenu と LineItemEditor 並び順機能のユニットテスト
  // Requirements: 37.1, 37.2, 37.3, 37.4, 37.5, 37.6, 37.7, 37.8, 37.9, 37.10,
  //               37.11, 37.15, 37.16, 37.17
  // ==========================================================================
  describe('Task 81.2: ヘルパー関数の単体テスト', () => {
    describe('reassignSortOrder (Requirements: 37.16)', () => {
      it('順序を保持しつつ sortOrder を 0,1,2,... の連続値に再採番する', () => {
        const items: LineItemFormData[] = [
          { ...createEmptyLineItem(10), id: 'a' },
          { ...createEmptyLineItem(20), id: 'b' },
          { ...createEmptyLineItem(30), id: 'c' },
        ];

        const result = reassignSortOrder(items);

        expect(result).toHaveLength(3);
        expect(result[0]?.id).toBe('a');
        expect(result[0]?.sortOrder).toBe(0);
        expect(result[1]?.id).toBe('b');
        expect(result[1]?.sortOrder).toBe(1);
        expect(result[2]?.id).toBe('c');
        expect(result[2]?.sortOrder).toBe(2);
      });

      it('入力配列を変更せず新しい配列を返す（イミュータブル）', () => {
        const items: LineItemFormData[] = [
          { ...createEmptyLineItem(5), id: 'a' },
          { ...createEmptyLineItem(7), id: 'b' },
        ];
        const original = items.map((item) => ({ ...item }));

        const result = reassignSortOrder(items);

        expect(result).not.toBe(items);
        expect(items[0]?.sortOrder).toBe(original[0]?.sortOrder);
        expect(items[1]?.sortOrder).toBe(original[1]?.sortOrder);
      });

      it('空配列に対しては空配列を返す', () => {
        expect(reassignSortOrder([])).toEqual([]);
      });
    });

    describe('sortBySortOrder (Requirements: 37.2, 37.3)', () => {
      it('sortOrder 昇順にソートした新しい配列を返す', () => {
        const items: LineItemFormData[] = [
          { ...createEmptyLineItem(2), id: 'c' },
          { ...createEmptyLineItem(0), id: 'a' },
          { ...createEmptyLineItem(1), id: 'b' },
        ];

        const result = sortBySortOrder(items);

        expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
      });

      it('入力配列を変更しない（破壊的でない）', () => {
        const items: LineItemFormData[] = [
          { ...createEmptyLineItem(2), id: 'c' },
          { ...createEmptyLineItem(0), id: 'a' },
        ];
        const originalOrder = items.map((item) => item.id);

        sortBySortOrder(items);

        expect(items.map((item) => item.id)).toEqual(originalOrder);
      });

      it('既に昇順の配列でも安定して結果を返す', () => {
        const items: LineItemFormData[] = [
          { ...createEmptyLineItem(0), id: 'a' },
          { ...createEmptyLineItem(1), id: 'b' },
          { ...createEmptyLineItem(2), id: 'c' },
        ];

        expect(sortBySortOrder(items).map((item) => item.id)).toEqual(['a', 'b', 'c']);
      });
    });

    describe('createEmptyLineItem (Requirements: 37.1, 37.15)', () => {
      it('引数省略時は sortOrder=0 で生成する', () => {
        const item = createEmptyLineItem();
        expect(item.sortOrder).toBe(0);
      });

      it('明示的に渡した sortOrder を保持する', () => {
        const item = createEmptyLineItem(7);
        expect(item.sortOrder).toBe(7);
      });

      it('生成された明細行は全フィールドが既定値で初期化されている', () => {
        const item = createEmptyLineItem(3);
        expect(item.id).toBeTruthy();
        expect(item.sortOrder).toBe(3);
        expect(item.customCategory).toBe('');
        expect(item.workType).toBe('');
        expect(item.name).toBe('');
        expect(item.specification).toBe('');
        expect(item.unit).toBe('');
        expect(item.quantity).toBe('');
        expect(item.unitPrice).toBe('');
        expect(item.amount).toBeNull();
        expect(item.remarks).toBe('');
      });
    });

    describe('ensureSortOrders (Requirements: 37.16, design.md 4722)', () => {
      it('全件 sortOrder=null の場合に配列インデックス値を割り当てる', () => {
        const incoming = [
          { ...createEmptyLineItem(0), id: 'a', sortOrder: null as number | null },
          { ...createEmptyLineItem(0), id: 'b', sortOrder: null as number | null },
          { ...createEmptyLineItem(0), id: 'c', sortOrder: null as number | null },
        ];

        const result = ensureSortOrders(incoming);

        expect(result[0]?.sortOrder).toBe(0);
        expect(result[1]?.sortOrder).toBe(1);
        expect(result[2]?.sortOrder).toBe(2);
      });

      it('一部の sortOrder が undefined の場合のみ配列インデックスで補完する', () => {
        // index=0 は値あり(5)、index=1 は undefined → 1 で補完、index=2 は値あり(8)
        const incoming = [
          { ...createEmptyLineItem(0), id: 'a', sortOrder: 5 },
          { ...createEmptyLineItem(0), id: 'b', sortOrder: undefined as number | undefined },
          { ...createEmptyLineItem(0), id: 'c', sortOrder: 8 },
        ];

        const result = ensureSortOrders(incoming);

        expect(result[0]?.sortOrder).toBe(5);
        expect(result[1]?.sortOrder).toBe(1);
        expect(result[2]?.sortOrder).toBe(8);
      });

      it('既に有効な sortOrder を持つ配列はそのまま保持する', () => {
        const incoming = [
          { ...createEmptyLineItem(0), id: 'a', sortOrder: 10 },
          { ...createEmptyLineItem(0), id: 'b', sortOrder: 20 },
        ];

        const result = ensureSortOrders(incoming);

        expect(result[0]?.sortOrder).toBe(10);
        expect(result[1]?.sortOrder).toBe(20);
      });
    });
  });

  describe('Task 81.2: LineItemActionMenu サブコンポーネントのテスト', () => {
    /** メニュー操作テスト用ヘルパー（共通プロップスを生成） */
    const buildMenuProps = (overrides: Partial<Parameters<typeof LineItemActionMenu>[0]> = {}) => ({
      isFirst: false,
      isLast: false,
      isOnly: false,
      onMoveUp: vi.fn(),
      onMoveDown: vi.fn(),
      onDelete: vi.fn(),
      ariaLabel: 'テスト行の操作メニュー',
      ...overrides,
    });

    describe('トグル開閉 (Requirements: 37.4, 37.5)', () => {
      it('初期状態ではメニューが閉じている（menuitem が存在しない）', () => {
        const props = buildMenuProps();
        render(<LineItemActionMenu {...props} />);

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
      });

      it('トグルクリックで 3 つのメニュー項目（上に移動・下に移動・削除）が表示される', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps();
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems).toHaveLength(3);
        expect(screen.getByRole('menuitem', { name: '上に移動' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: '下に移動' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: '削除' })).toBeInTheDocument();
      });

      it('もう一度トグルをクリックするとメニューが閉じる', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps();
        render(<LineItemActionMenu {...props} />);

        const toggle = screen.getByRole('button', { name: 'テスト行の操作メニュー' });
        await user.click(toggle);
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.click(toggle);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });

      it('メニュー項目クリック時に対応するコールバックが実行され、メニューが自動で閉じる', async () => {
        const user = userEvent.setup();
        const onMoveUp = vi.fn();
        const props = buildMenuProps({ onMoveUp });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));
        await user.click(screen.getByRole('menuitem', { name: '上に移動' }));

        expect(onMoveUp).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    describe('disabled 制御 (Requirements: 37.9, 37.10, 37.11)', () => {
      it('isFirst=true のとき「上に移動」のみ非活性化する (Req 37.9)', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps({ isFirst: true });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        expect(screen.getByRole('menuitem', { name: '上に移動' })).toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '下に移動' })).not.toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '削除' })).not.toBeDisabled();
      });

      it('isLast=true のとき「下に移動」のみ非活性化する (Req 37.10)', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps({ isLast: true });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        expect(screen.getByRole('menuitem', { name: '上に移動' })).not.toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '下に移動' })).toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '削除' })).not.toBeDisabled();
      });

      it('isOnly=true のとき「上に移動」「下に移動」を非活性化する (Req 37.11)', async () => {
        const user = userEvent.setup();
        // 削除は LineItemEditor 側で deleteDisabled を介して制御するため、
        // LineItemActionMenu 単体では isOnly のみでは削除は非活性化されない仕様（task 78.2 / 78.3）。
        const props = buildMenuProps({ isOnly: true });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        expect(screen.getByRole('menuitem', { name: '上に移動' })).toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '下に移動' })).toBeDisabled();
      });

      it('deleteDisabled=true のとき「削除」のみ非活性化する (Req 11 AC 19 と Req 37.11 の整合)', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps({ deleteDisabled: true });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        expect(screen.getByRole('menuitem', { name: '削除' })).toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '上に移動' })).not.toBeDisabled();
        expect(screen.getByRole('menuitem', { name: '下に移動' })).not.toBeDisabled();
      });

      it('disabled=true ではトグルボタン自体が非活性化されメニューを開けない', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps({ disabled: true });
        render(<LineItemActionMenu {...props} />);

        const toggle = screen.getByRole('button', { name: 'テスト行の操作メニュー' });
        expect(toggle).toBeDisabled();

        await user.click(toggle);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    describe('外側クリック・Escape クローズ (Requirements: 37.4 補強)', () => {
      it('メニュー外をクリックするとメニューが閉じる', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps();
        // 外側クリック対象として別 DOM ノードを用意する
        render(
          <div>
            <button type="button" data-testid="outside-target">
              外側
            </button>
            <LineItemActionMenu {...props} />
          </div>
        );

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        // mousedown が outside-target に到達することで close される
        fireEvent.mouseDown(screen.getByTestId('outside-target'));

        await waitFor(() => {
          expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        });
      });

      it('Escape キーでメニューが閉じ、トグルボタンへフォーカスが戻る', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps();
        render(<LineItemActionMenu {...props} />);

        const toggle = screen.getByRole('button', { name: 'テスト行の操作メニュー' });
        await user.click(toggle);
        expect(screen.getByRole('menu')).toBeInTheDocument();

        // Escape を発火
        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => {
          expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        });
        await waitFor(() => {
          expect(document.activeElement).toBe(toggle);
        });
      });
    });

    describe('フォーカス制御 (Requirements: 37.4 / design.md 4609)', () => {
      it('メニュー展開時に最初の有効項目（上に移動）にフォーカスが移る', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps();
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        await waitFor(() => {
          expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '上に移動' }));
        });
      });

      it('isFirst=true のときは「下に移動」が最初の有効項目としてフォーカスされる', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps({ isFirst: true });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        await waitFor(() => {
          expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '下に移動' }));
        });
      });

      it('isOnly=true のときは「削除」が最初の有効項目としてフォーカスされる', async () => {
        const user = userEvent.setup();
        const props = buildMenuProps({ isOnly: true });
        render(<LineItemActionMenu {...props} />);

        await user.click(screen.getByRole('button', { name: 'テスト行の操作メニュー' }));

        await waitFor(() => {
          expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '削除' }));
        });
      });
    });
  });

  describe('Task 81.2: LineItemEditor の並び順機能テスト', () => {
    /** sortOrder を明示した最小限の明細行ファクトリ */
    const buildLineItem = (
      id: string,
      sortOrder: number,
      overrides: Partial<LineItemFormData> = {}
    ): LineItemFormData => ({
      id,
      sortOrder,
      customCategory: '',
      workType: '',
      name: '',
      specification: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      amount: null,
      remarks: '',
      ...overrides,
    });

    describe('表示順は sortBySortOrder 適用 (Requirements: 37.2, 37.3)', () => {
      it('lineItems が sortOrder の降順で渡されても画面には昇順で表示される', () => {
        const lineItems: LineItemFormData[] = [
          buildLineItem('c', 2, { name: 'C行' }),
          buildLineItem('a', 0, { name: 'A行' }),
          buildLineItem('b', 1, { name: 'B行' }),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // 名称フィールドは表示順に並ぶ（DOM 順 = sortOrder 昇順）
        const nameInputs = screen.getAllByPlaceholderText('名称') as HTMLInputElement[];
        expect(nameInputs.map((input) => input.value)).toEqual(['A行', 'B行', 'C行']);
      });
    });

    describe('handleMoveUp / handleMoveDown 後の sortOrder 連続性 (Requirements: 37.7, 37.8, 37.16)', () => {
      it('「上に移動」操作後、隣接行とスワップされ sortOrder が 0,1,2,... に再採番される', async () => {
        const user = userEvent.setup();
        const lineItems: LineItemFormData[] = [
          buildLineItem('a', 0, { name: 'A行' }),
          buildLineItem('b', 1, { name: 'B行' }),
          buildLineItem('c', 2, { name: 'C行' }),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // 2行目（B）の操作メニューを開いて「上に移動」をクリック
        const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
        await user.click(toggles[1]!);
        await user.click(screen.getByRole('menuitem', { name: '上に移動' }));

        expect(mockOnLineItemsChange).toHaveBeenCalledTimes(1);
        const updated = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[];
        // 並び順: B, A, C となる
        expect(updated.map((item) => item.id)).toEqual(['b', 'a', 'c']);
        // sortOrder が 0,1,2 に再採番されている
        expect(updated.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
      });

      it('「下に移動」操作後、隣接行とスワップされ sortOrder が 0,1,2,... に再採番される', async () => {
        const user = userEvent.setup();
        const lineItems: LineItemFormData[] = [
          buildLineItem('a', 0, { name: 'A行' }),
          buildLineItem('b', 1, { name: 'B行' }),
          buildLineItem('c', 2, { name: 'C行' }),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // 1行目（A）の操作メニューを開いて「下に移動」をクリック
        const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
        await user.click(toggles[0]!);
        await user.click(screen.getByRole('menuitem', { name: '下に移動' }));

        expect(mockOnLineItemsChange).toHaveBeenCalledTimes(1);
        const updated = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[];
        // 並び順: B, A, C となる
        expect(updated.map((item) => item.id)).toEqual(['b', 'a', 'c']);
        expect(updated.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
      });

      it('lineItems が乱れた sortOrder で渡されても、表示順を基準に「上に移動」が動作する (Req 37.17 整合)', async () => {
        const user = userEvent.setup();
        // sortOrder は 0,1,2 だが配列順はバラバラ → 表示順は a,b,c
        const lineItems: LineItemFormData[] = [
          buildLineItem('c', 2, { name: 'C行' }),
          buildLineItem('a', 0, { name: 'A行' }),
          buildLineItem('b', 1, { name: 'B行' }),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // 表示順 2行目（B）に対する「上に移動」 → 結果は b,a,c の順
        const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
        await user.click(toggles[1]!);
        await user.click(screen.getByRole('menuitem', { name: '上に移動' }));

        const updated = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[];
        expect(updated.map((item) => item.id)).toEqual(['b', 'a', 'c']);
        expect(updated.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
      });
    });

    describe('handleAddRow の末尾連続割当 (Requirements: 37.15)', () => {
      it('追加した行に既存最大 sortOrder + 1 が割り当てられる', async () => {
        const user = userEvent.setup();
        const lineItems: LineItemFormData[] = [
          buildLineItem('a', 0),
          buildLineItem('b', 1),
          buildLineItem('c', 2),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        await user.click(screen.getByRole('button', { name: '行を追加' }));

        const updated = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[];
        expect(updated).toHaveLength(4);
        // 末尾の新規行は sortOrder=3
        expect(updated[3]?.sortOrder).toBe(3);
      });

      it('既存 sortOrder が連続でない場合でも最大値+1 が新規行に割り当てられる', async () => {
        const user = userEvent.setup();
        // 意図的に sortOrder=10 の項目を末尾に置く
        const lineItems: LineItemFormData[] = [buildLineItem('a', 0), buildLineItem('b', 10)];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        await user.click(screen.getByRole('button', { name: '行を追加' }));

        const updated = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[];
        // 新規行の sortOrder は max(0, 10) + 1 = 11
        const added = updated[updated.length - 1];
        expect(added?.sortOrder).toBe(11);
      });
    });

    describe('handleDeleteRow 後の連続性 (Requirements: 37.16)', () => {
      it('中間行を削除しても残行の sortOrder が 0,1,2,... に再採番される', async () => {
        const user = userEvent.setup();
        const lineItems: LineItemFormData[] = [
          buildLineItem('a', 0, { name: 'A行' }),
          buildLineItem('b', 1, { name: 'B行' }),
          buildLineItem('c', 2, { name: 'C行' }),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // 2行目（B）の削除メニュー項目をクリック
        const toggles = screen.getAllByRole('button', { name: /の操作メニュー$/ });
        await user.click(toggles[1]!);
        await user.click(screen.getByRole('menuitem', { name: '削除' }));

        const updated = mockOnLineItemsChange.mock.calls[0]?.[0] as LineItemFormData[];
        expect(updated.map((item) => item.id)).toEqual(['a', 'c']);
        expect(updated.map((item) => item.sortOrder)).toEqual([0, 1]);
      });
    });

    describe('行内旧削除ボタンの非存在 (Requirements: 37.6)', () => {
      it('旧実装の行内独立した削除ボタン（ラベル「削除」のbutton）が直接行内に存在しない', () => {
        const lineItems: LineItemFormData[] = [buildLineItem('a', 0), buildLineItem('b', 1)];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // メニューを開く前は「削除」ボタンが表示されてはいけない（旧 row-button が削除済み）
        const visibleDeleteButtons = screen.queryAllByRole('button', { name: '削除' });
        expect(visibleDeleteButtons).toHaveLength(0);

        // role="menuitem" としての「削除」も、メニューが閉じている状態では存在しない
        const visibleDeleteMenuItems = screen.queryAllByRole('menuitem', { name: '削除' });
        expect(visibleDeleteMenuItems).toHaveLength(0);
      });
    });

    describe('Tab キーが表示順に追従する (Requirements: 37.17)', () => {
      it('lineItems が降順で渡されても、表示順1行目→表示順2行目へ Tab で移動する', async () => {
        const user = userEvent.setup();
        // 配列順は降順、表示順は a,b
        const lineItems: LineItemFormData[] = [
          buildLineItem('b', 1, { name: 'B行' }),
          buildLineItem('a', 0, { name: 'A行' }),
        ];

        render(<LineItemEditor lineItems={lineItems} onLineItemsChange={mockOnLineItemsChange} />);

        // 表示順1行目（A行）の備考フィールドにフォーカス
        const remarksInputs = screen.getAllByPlaceholderText('備考');
        // 表示順1行目=A行が remarksInputs[0]
        await user.click(remarksInputs[0]!);

        await user.tab();

        // 表示順2行目（B行）の任意分類にフォーカスが移る
        const customCategoryInputs = screen.getAllByPlaceholderText('任意分類');
        expect(document.activeElement).toBe(customCategoryInputs[1]);
      });
    });

    describe('サーバー応答に sortOrder NULL を含むケース (Requirements: 37.16, design.md 4722)', () => {
      it('ensureSortOrders → sortBySortOrder の組み合わせで全行が表示順を確定できる', () => {
        // バックエンドから受け取った想定の生データ。1件は sortOrder=null
        const incoming = [
          { ...createEmptyLineItem(0), id: 'a', sortOrder: null as number | null, name: 'A行' },
          { ...createEmptyLineItem(0), id: 'b', sortOrder: 5, name: 'B行' },
          { ...createEmptyLineItem(0), id: 'c', sortOrder: null as number | null, name: 'C行' },
        ];

        // 防御的補完
        const ensured = ensureSortOrders(incoming);
        // a=0, b=5, c=2 になる（a/c は配列インデックス、b は値保持）
        expect(ensured.find((item) => item.id === 'a')?.sortOrder).toBe(0);
        expect(ensured.find((item) => item.id === 'b')?.sortOrder).toBe(5);
        expect(ensured.find((item) => item.id === 'c')?.sortOrder).toBe(2);

        // sortBySortOrder で表示順を確定
        const sorted = sortBySortOrder(ensured);
        expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'b']);

        // 補完済み sortOrder 列で LineItemEditor を描画しても破綻しないこと
        render(<LineItemEditor lineItems={sorted} onLineItemsChange={mockOnLineItemsChange} />);
        const nameInputs = screen.getAllByPlaceholderText('名称') as HTMLInputElement[];
        expect(nameInputs.map((input) => input.value)).toEqual(['A行', 'C行', 'B行']);
      });
    });
  });
});
