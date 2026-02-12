/**
 * @fileoverview EstimateItemRowコンポーネントのテスト（TDDテストファースト）
 *
 * Task 9.2: EstimateItemRowコンポーネントの実装
 *
 * 3行1セット（見積/実行/業者金額行）の表示コンポーネントをテストします。
 *
 * Requirements (estimate-creation):
 * - REQ-1.2: 見積項目行を「見積金額行」「実行金額行」「業者金額行」の3行1セットで構成する
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-1.4: 金額フィールドを入力不可として表示する
 * - REQ-1.6: 各見積項目行に名称・規格・単位・数量・単価・備考の入力フィールドを提供する
 *
 * @module components/estimate/EstimateItemRow.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateItemRow } from './EstimateItemRow';
import type { EstimateItemLineEdit } from '../../hooks/useEstimateEditor';

// ============================================================================
// テストデータ
// ============================================================================

/**
 * テスト用の見積項目行データを生成
 */
const createMockLines = (): EstimateItemLineEdit[] => [
  {
    id: 'line-estimate-1',
    estimateItemId: 'item-1',
    lineType: 'ESTIMATE',
    name: '外壁塗装工事',
    specification: 'アクリルシリコン塗装',
    unit: 'm2',
    quantity: '150.5',
    unitPrice: '2500',
    amount: '376250',
    remarks: '見積備考',
  },
  {
    id: 'line-execution-1',
    estimateItemId: 'item-1',
    lineType: 'EXECUTION',
    name: '外壁塗装工事',
    specification: 'アクリルシリコン塗装',
    unit: 'm2',
    quantity: '150.5',
    unitPrice: '2200',
    amount: '331100',
    remarks: '実行備考',
  },
  {
    id: 'line-vendor-1',
    estimateItemId: 'item-1',
    lineType: 'VENDOR',
    name: '外壁塗装工事',
    specification: 'アクリルシリコン塗装',
    unit: 'm2',
    quantity: '150.5',
    unitPrice: '2000',
    amount: '301000',
    remarks: '業者備考',
  },
];

// ============================================================================
// テスト
// ============================================================================

describe('EstimateItemRow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 9.2: EstimateItemRowコンポーネントの実装
  // ====================================================================

  describe('Task 9.2: EstimateItemRowコンポーネント', () => {
    describe('REQ-1.2: 3行1セットの表示', () => {
      it('見積金額行が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        expect(screen.getByTestId('line-type-ESTIMATE')).toBeInTheDocument();
        expect(screen.getByText('見積')).toBeInTheDocument();
      });

      it('実行金額行が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        expect(screen.getByTestId('line-type-EXECUTION')).toBeInTheDocument();
        expect(screen.getByText('実行')).toBeInTheDocument();
      });

      it('業者金額行が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        expect(screen.getByTestId('line-type-VENDOR')).toBeInTheDocument();
        expect(screen.getByText('業者')).toBeInTheDocument();
      });

      it('3行が順序通りに表示される（見積、実行、業者）', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const lineRows = screen.getAllByTestId(/^line-type-/);
        expect(lineRows).toHaveLength(3);
        expect(lineRows[0]).toHaveAttribute('data-testid', 'line-type-ESTIMATE');
        expect(lineRows[1]).toHaveAttribute('data-testid', 'line-type-EXECUTION');
        expect(lineRows[2]).toHaveAttribute('data-testid', 'line-type-VENDOR');
      });
    });

    describe('REQ-1.6: 各フィールドの表示', () => {
      it('名称フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        // 見積行の名称
        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const nameInput = within(estimateRow).getByLabelText('名称');
        expect(nameInput).toHaveValue('外壁塗装工事');
      });

      it('規格フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const specInput = within(estimateRow).getByLabelText('規格');
        expect(specInput).toHaveValue('アクリルシリコン塗装');
      });

      it('単位フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const unitInput = within(estimateRow).getByLabelText('単位');
        expect(unitInput).toHaveValue('m2');
      });

      it('数量フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const quantityInput = within(estimateRow).getByLabelText('数量');
        expect(quantityInput).toHaveValue('150.5');
      });

      it('単価フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const priceInput = within(estimateRow).getByLabelText('単価');
        expect(priceInput).toHaveValue('2500');
      });

      it('備考フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const remarksInput = within(estimateRow).getByLabelText('備考');
        expect(remarksInput).toHaveValue('見積備考');
      });
    });

    describe('REQ-1.3, REQ-1.4: 金額フィールドの自動計算と入力不可', () => {
      it('金額フィールドが表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('376,250');
      });

      it('金額フィールドは入力不可（input要素ではなくテキスト表示）', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        // Note: aria-readonlyは削除された（WCAG準拠のため）
        // 金額フィールドはinput要素ではなく、テキスト表示のdivなので編集不可
        expect(amountField.tagName.toLowerCase()).toBe('div');
        expect(amountField.querySelector('input')).toBeNull();
      });

      it('金額がnullの場合はハイフンが表示される', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('-');
      });
    });

    describe('フィールド入力コールバック', () => {
      it('名称フィールドの変更でonLineChangeが呼ばれる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const nameInput = within(estimateRow).getByLabelText('名称');

        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, '新しい名称');

        expect(onLineChange).toHaveBeenCalled();
        const lastCall = onLineChange.mock.calls[onLineChange.mock.calls.length - 1]!;
        expect(lastCall[0]).toBe('item-1');
        expect(lastCall[1]).toBe('line-estimate-1');
        expect(lastCall[2]).toBe('name');
      });

      it('数量フィールドの変更でonLineChangeが呼ばれる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const quantityInput = within(estimateRow).getByLabelText('数量');

        await userEvent.clear(quantityInput);
        await userEvent.type(quantityInput, '200');

        expect(onLineChange).toHaveBeenCalled();
        const lastCall = onLineChange.mock.calls[onLineChange.mock.calls.length - 1]!;
        expect(lastCall[0]).toBe('item-1');
        expect(lastCall[1]).toBe('line-estimate-1');
        expect(lastCall[2]).toBe('quantity');
      });

      it('単価フィールドの変更でonLineChangeが呼ばれる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const priceInput = within(estimateRow).getByLabelText('単価');

        await userEvent.clear(priceInput);
        await userEvent.type(priceInput, '3000');

        expect(onLineChange).toHaveBeenCalled();
        const lastCall = onLineChange.mock.calls[onLineChange.mock.calls.length - 1]!;
        expect(lastCall[0]).toBe('item-1');
        expect(lastCall[1]).toBe('line-estimate-1');
        expect(lastCall[2]).toBe('unitPrice');
      });
    });

    describe('行タイプラベル', () => {
      it('見積行にラベル「見積」が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        expect(within(estimateRow).getByText('見積')).toBeInTheDocument();
      });

      it('実行行にラベル「実行」が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const executionRow = screen.getByTestId('line-type-EXECUTION');
        expect(within(executionRow).getByText('実行')).toBeInTheDocument();
      });

      it('業者行にラベル「業者」が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const vendorRow = screen.getByTestId('line-type-VENDOR');
        expect(within(vendorRow).getByText('業者')).toBeInTheDocument();
      });
    });

    describe('空の行データ', () => {
      it('行がない場合でもエラーなく表示される', () => {
        render(<EstimateItemRow itemId="item-1" lines={[]} />);

        // コンポーネントが表示されている
        expect(screen.getByTestId('estimate-item-row')).toBeInTheDocument();
      });

      it('nullフィールドの場合は空文字で表示される', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const nameInput = within(estimateRow).getByLabelText('名称');
        expect(nameInput).toHaveValue('');
      });
    });

    describe('アクセシビリティ', () => {
      it('3行分の行（見積/実行/業者）が表示される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        // Note: ARIA rowロールは削除されたが、3行分のline-typeがdata-testidで存在する
        expect(screen.getByTestId('line-type-ESTIMATE')).toBeInTheDocument();
        expect(screen.getByTestId('line-type-EXECUTION')).toBeInTheDocument();
        expect(screen.getByTestId('line-type-VENDOR')).toBeInTheDocument();
      });

      it('入力フィールドにaria-labelが設定される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        expect(screen.getAllByLabelText('名称').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByLabelText('規格').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByLabelText('単位').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByLabelText('数量').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByLabelText('単価').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByLabelText('備考').length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('インデント表示', () => {
      it('インデントレベルが指定された場合、左パディングが適用される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} indentLevel={2} />);

        const container = screen.getByTestId('estimate-item-row');
        // インデントレベル2 = 32px (16px * 2)のパディング
        expect(container).toHaveStyle({ paddingLeft: '32px' });
      });

      it('インデントレベル0の場合、パディングは0', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} indentLevel={0} />);

        const container = screen.getByTestId('estimate-item-row');
        expect(container).toHaveStyle({ paddingLeft: '0px' });
      });
    });

    describe('選択状態', () => {
      it('選択状態の場合、視覚的に区別される', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} isSelected={true} />);

        const container = screen.getByTestId('estimate-item-row');
        expect(container).toHaveAttribute('data-selected', 'true');
      });

      it('非選択状態の場合、data-selected=false', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} isSelected={false} />);

        const container = screen.getByTestId('estimate-item-row');
        expect(container).toHaveAttribute('data-selected', 'false');
      });
    });

    describe('金額のフォーマット', () => {
      it('金額が桁区切り表示される', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: 'テスト',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '12345678',
            amount: '12345678',
            remarks: null,
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('12,345,678');
      });

      it('金額が空文字の場合はハイフンが表示される', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: '',
            remarks: null,
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('-');
      });

      it('金額が不正な値の場合はハイフンが表示される', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: 'abc',
            remarks: null,
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('-');
      });

      it('金額が小数の場合は四捨五入して整数で表示される (REQ-22)', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: 'テスト',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '1000',
            amount: '1234.6',
            remarks: null,
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const amountField = within(estimateRow).getByTestId('amount-field');
        expect(amountField).toHaveTextContent('1,235');
      });
    });

    describe('数量フォーカスアウト時フォーマット (REQ-22.7)', () => {
      it('数量フィールドのフォーカスアウトで小数2桁にフォーマットされる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const quantityInput = within(estimateRow).getByLabelText('数量');

        // フォーカスアウト
        quantityInput.focus();
        quantityInput.blur();

        // EstimateCalculator.formatQuantity('150.5') = '150.50' なので変更が発火
        expect(onLineChange).toHaveBeenCalledWith(
          'item-1',
          'line-estimate-1',
          'quantity',
          '150.50'
        );
      });

      it('数量がnullの場合はフォーマットしない', async () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ];
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const quantityInput = within(estimateRow).getByLabelText('数量');

        quantityInput.focus();
        quantityInput.blur();

        // null量なのでonLineChangeは呼ばれない
        expect(onLineChange).not.toHaveBeenCalled();
      });
    });

    describe('単価フォーカスアウト時フォーマット (REQ-22.8)', () => {
      it('単価フィールドのフォーカスアウトで整数に丸められる', async () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: 'テスト',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '2500.6',
            amount: '2501',
            remarks: null,
          },
        ];
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const priceInput = within(estimateRow).getByLabelText('単価');

        priceInput.focus();
        priceInput.blur();

        // EstimateCalculator.roundUnitPrice('2500.6') = '2501'
        expect(onLineChange).toHaveBeenCalledWith('item-1', 'line-1', 'unitPrice', '2501');
      });

      it('単価がnullの場合はフォーマットしない', async () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: null,
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
          },
        ];
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const priceInput = within(estimateRow).getByLabelText('単価');

        priceInput.focus();
        priceInput.blur();

        expect(onLineChange).not.toHaveBeenCalled();
      });
    });

    describe('業者名表示 (REQ-17.3, REQ-17.4)', () => {
      it('VENDOR行にsourceVendorNameが表示される', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-v-1',
            estimateItemId: 'item-1',
            lineType: 'VENDOR',
            name: '工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '1000',
            amount: '1000',
            remarks: null,
            sourceVendorName: '業者X',
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        expect(screen.getByText('業者X')).toBeInTheDocument();
      });

      it('ESTIMATE行にはsourceVendorNameが表示されない', () => {
        const lines: EstimateItemLineEdit[] = [
          {
            id: 'line-e-1',
            estimateItemId: 'item-1',
            lineType: 'ESTIMATE',
            name: '工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '1000',
            amount: '1000',
            remarks: null,
            sourceVendorName: '業者Y',
          },
        ];
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        expect(screen.queryByText('業者Y')).not.toBeInTheDocument();
      });
    });

    describe('規格・単位・備考フィールドの変更', () => {
      it('規格フィールドの変更でonLineChangeが呼ばれる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const specInput = within(estimateRow).getByLabelText('規格');

        await userEvent.clear(specInput);
        await userEvent.type(specInput, '新規格');

        expect(onLineChange).toHaveBeenCalled();
        const lastCall = onLineChange.mock.calls[onLineChange.mock.calls.length - 1]!;
        expect(lastCall[2]).toBe('specification');
      });

      it('単位フィールドの変更でonLineChangeが呼ばれる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const unitInput = within(estimateRow).getByLabelText('単位');

        await userEvent.clear(unitInput);
        await userEvent.type(unitInput, 'kg');

        expect(onLineChange).toHaveBeenCalled();
        const lastCall = onLineChange.mock.calls[onLineChange.mock.calls.length - 1]!;
        expect(lastCall[2]).toBe('unit');
      });

      it('備考フィールドの変更でonLineChangeが呼ばれる', async () => {
        const lines = createMockLines();
        const onLineChange = vi.fn();
        render(<EstimateItemRow itemId="item-1" lines={lines} onLineChange={onLineChange} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const remarksInput = within(estimateRow).getByLabelText('備考');

        await userEvent.clear(remarksInput);
        await userEvent.type(remarksInput, '新備考');

        expect(onLineChange).toHaveBeenCalled();
        const lastCall = onLineChange.mock.calls[onLineChange.mock.calls.length - 1]!;
        expect(lastCall[2]).toBe('remarks');
      });
    });

    describe('onLineChange未指定時', () => {
      it('onLineChangeなしでもフィールド変更がエラーにならない', async () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const nameInput = within(estimateRow).getByLabelText('名称');

        // onLineChangeなしでもタイプしてエラーにならないこと
        await userEvent.type(nameInput, 'x');

        // コンポーネントがクラッシュしていないこと
        expect(nameInput).toBeInTheDocument();
      });

      it('onLineChangeなしでもblurがエラーにならない', () => {
        const lines = createMockLines();
        render(<EstimateItemRow itemId="item-1" lines={lines} />);

        const estimateRow = screen.getByTestId('line-type-ESTIMATE');
        const quantityInput = within(estimateRow).getByLabelText('数量');

        quantityInput.focus();
        quantityInput.blur();

        // エラーなく動作すること
        expect(quantityInput).toBeInTheDocument();
      });
    });
  });
});
