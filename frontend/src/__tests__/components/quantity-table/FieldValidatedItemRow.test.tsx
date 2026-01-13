/**
 * @fileoverview フィールド仕様統合数量項目行コンポーネントのテスト
 *
 * Task 14.1: FieldValidatedItemRowのテストカバレッジ向上
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldValidatedItemRow from '../../../components/quantity-table/FieldValidatedItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

// モック設定
vi.mock('../../../components/quantity-table/AutocompleteInput', () => ({
  default: ({
    id,
    label,
    value,
    onChange,
    error,
    required,
    placeholder,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    required?: boolean;
    placeholder?: string;
  }) => (
    <div data-testid={`autocomplete-${id}`}>
      <label htmlFor={id}>
        {label}
        {required && <span>*</span>}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!error}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../components/quantity-table/CalculationMethodSelect', () => ({
  default: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (method: string) => void;
  }) => (
    <select
      id={id}
      data-testid={`calculation-method-${id}`}
      value={value}
      onChange={(e) => onChange(e.target.value as 'STANDARD' | 'AREA_VOLUME' | 'PITCH')}
    >
      <option value="STANDARD">直接入力</option>
      <option value="AREA_VOLUME">面積・体積</option>
      <option value="PITCH">ピッチ</option>
    </select>
  ),
}));

vi.mock('../../../components/quantity-table/CalculationFields', () => ({
  default: ({
    method,
    params,
    onChange,
  }: {
    method: string;
    params: Record<string, number>;
    onChange: (params: Record<string, number>) => void;
  }) => (
    <div data-testid="calculation-fields">
      <span data-testid="calc-method">{method}</span>
      <span data-testid="calc-params">{JSON.stringify(params)}</span>
      <button onClick={() => onChange({ width: 10, depth: 5, height: 2 })}>Update Params</button>
    </div>
  ),
}));

vi.mock('../../../utils/calculation-engine', () => ({
  calculate: vi.fn(() => ({
    rawValue: 100,
    adjustedValue: 110,
    finalValue: 110,
  })),
}));

const mockItem: QuantityItemDetail = {
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '共通仮設',
  middleCategory: '直接仮設',
  minorCategory: null,
  customCategory: null,
  workType: '仮設工',
  name: '足場',
  specification: 'ビケ足場',
  unit: 'm2',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 100.5,
  remarks: '安全用',
  displayOrder: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('FieldValidatedItemRow', () => {
  const defaultProps = {
    item: mockItem,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    canMoveUp: true,
    canMoveDown: true,
    showValidation: true,
    onValidationChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本レンダリング', () => {
    it('項目行がレンダリングされる', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByTestId('quantity-item-row')).toBeInTheDocument();
    });

    it('名称フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      expect(nameInput).toBeInTheDocument();
      expect(nameInput).toHaveValue('足場');
    });

    it('数量フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const quantityInput = screen.getByLabelText(/数量/);
      expect(quantityInput).toBeInTheDocument();
      expect(quantityInput).toHaveValue(100.5);
    });

    it('調整係数フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const adjustmentInput = screen.getByLabelText(/調整係数/);
      expect(adjustmentInput).toBeInTheDocument();
      expect(adjustmentInput).toHaveValue(1.0);
    });

    it('丸め設定フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const roundingInput = screen.getByLabelText(/丸め設定/);
      expect(roundingInput).toBeInTheDocument();
      expect(roundingInput).toHaveValue(0.01);
    });

    it('削除ボタンが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('アクションボタンが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'アクション' })).toBeInTheDocument();
    });

    it('備考フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const remarksInput = screen.getByLabelText(/備考/);
      expect(remarksInput).toBeInTheDocument();
      expect(remarksInput).toHaveValue('安全用');
    });
  });

  describe('名称フィールドの編集', () => {
    it('名称を変更するとローカル状態が更新される', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      await user.clear(nameInput);
      await user.type(nameInput, '新しい名称');

      expect(nameInput).toHaveValue('新しい名称');
    });

    it('名称フィールドからフォーカスが外れるとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      await user.clear(nameInput);
      await user.type(nameInput, '新しい足場');
      await user.tab();

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith('item-1', { name: '新しい足場' });
      });
    });

    it('名称が空の場合はバリデーションエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      await user.clear(nameInput);
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText('名称は必須です')).toBeInTheDocument();
      });
    });
  });

  describe('数量フィールドの編集', () => {
    it('数量を変更するとonUpdateが呼ばれる', async () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const quantityInput = screen.getByLabelText(/数量/);
      fireEvent.change(quantityInput, { target: { value: '200' } });

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith('item-1', { quantity: 200 });
      });
    });

    it('負の数量の場合、フィールドにaria-invalid=trueが設定される', async () => {
      const itemWithNegativeQty = { ...mockItem, quantity: -10 };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithNegativeQty} />);

      const quantityInput = screen.getByLabelText(/数量/);
      expect(quantityInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('調整係数フィールドの編集', () => {
    it('調整係数を変更するとonUpdateが呼ばれる', async () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const adjustmentInput = screen.getByLabelText(/調整係数/);
      fireEvent.change(adjustmentInput, { target: { value: '1.5' } });

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ adjustmentFactor: 1.5 })
        );
      });
    });

    it('調整係数が0以下の場合、フィールドにaria-invalid=trueが設定される', async () => {
      const itemWithZeroFactor = { ...mockItem, adjustmentFactor: 0 };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithZeroFactor} />);

      const adjustmentInput = screen.getByLabelText(/調整係数/);
      expect(adjustmentInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('丸め設定フィールドの編集', () => {
    it('丸め設定を変更するとonUpdateが呼ばれる', async () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const roundingInput = screen.getByLabelText(/丸め設定/);
      fireEvent.change(roundingInput, { target: { value: '0.1' } });

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ roundingUnit: 0.1 })
        );
      });
    });

    it('丸め設定が0以下の場合、フィールドにaria-invalid=trueが設定される', async () => {
      const itemWithZeroRounding = { ...mockItem, roundingUnit: 0 };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithZeroRounding} />);

      const roundingInput = screen.getByLabelText(/丸め設定/);
      expect(roundingInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('削除操作', () => {
    it('削除ボタンをクリックするとonDeleteが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '削除' }));

      expect(defaultProps.onDelete).toHaveBeenCalledWith('item-1');
    });
  });

  describe('アクションメニュー', () => {
    it('アクションボタンをクリックするとメニューが表示される', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /コピー/ })).toBeInTheDocument();
    });

    it('コピーをクリックするとonCopyが呼ばれメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /コピー/ }));

      expect(defaultProps.onCopy).toHaveBeenCalledWith('item-1');
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('上に移動ボタンが表示される（canMoveUp=true）', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} canMoveUp={true} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      expect(screen.getByRole('menuitem', { name: /上に移動/ })).toBeInTheDocument();
    });

    it('上に移動をクリックするとonMoveUpが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} canMoveUp={true} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /上に移動/ }));

      expect(defaultProps.onMoveUp).toHaveBeenCalledWith('item-1');
    });

    it('下に移動ボタンが表示される（canMoveDown=true）', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} canMoveDown={true} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      expect(screen.getByRole('menuitem', { name: /下に移動/ })).toBeInTheDocument();
    });

    it('下に移動をクリックするとonMoveDownが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} canMoveDown={true} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /下に移動/ }));

      expect(defaultProps.onMoveDown).toHaveBeenCalledWith('item-1');
    });

    it('canMoveUp=falseの場合、上に移動ボタンが表示されない', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} canMoveUp={false} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      expect(screen.queryByRole('menuitem', { name: /上に移動/ })).not.toBeInTheDocument();
    });

    it('canMoveDown=falseの場合、下に移動ボタンが表示されない', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} canMoveDown={false} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));

      expect(screen.queryByRole('menuitem', { name: /下に移動/ })).not.toBeInTheDocument();
    });

    it('メニューが開いている状態でアクションボタンをクリックするとメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(actionButton);
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('行外をクリックするとメニューが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <button>外部ボタン</button>
          <FieldValidatedItemRow {...defaultProps} />
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(screen.getByText('外部ボタン'));
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('計算方法', () => {
    it('計算方法がSTANDARD以外の場合は計算フィールドが表示される', () => {
      const itemWithCalc = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
      };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithCalc} />);

      expect(screen.getByTestId('calculation-fields')).toBeInTheDocument();
    });

    it('計算方法がSTANDARDの場合は計算フィールドが表示されない', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.queryByTestId('calculation-fields')).not.toBeInTheDocument();
    });

    it('計算方法を変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const methodSelect = screen.getByTestId(
        `calculation-method-${mockItem.id}-calculationMethod`
      );
      await user.selectOptions(methodSelect, 'AREA_VOLUME');

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ calculationMethod: 'AREA_VOLUME' })
        );
      });
    });
  });

  describe('バリデーション変更通知', () => {
    it('初期レンダリング時にonValidationChangeが呼ばれる', async () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      await waitFor(() => {
        expect(defaultProps.onValidationChange).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({
            hasErrors: false,
          })
        );
      });
    });

    it('必須フィールドが空の場合、hasErrors=trueで通知される', async () => {
      const invalidItem = { ...mockItem, name: '', majorCategory: '' };
      render(<FieldValidatedItemRow {...defaultProps} item={invalidItem} />);

      await waitFor(() => {
        expect(defaultProps.onValidationChange).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({
            hasErrors: true,
          })
        );
      });
    });
  });

  describe('Autocompleteフィールド', () => {
    it('大項目フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByTestId(`autocomplete-${mockItem.id}-majorCategory`)).toBeInTheDocument();
    });

    it('中項目フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByTestId(`autocomplete-${mockItem.id}-middleCategory`)).toBeInTheDocument();
    });

    it('小項目フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByTestId(`autocomplete-${mockItem.id}-minorCategory`)).toBeInTheDocument();
    });

    it('工種フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByTestId(`autocomplete-${mockItem.id}-workType`)).toBeInTheDocument();
    });

    it('単位フィールドが表示される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByTestId(`autocomplete-${mockItem.id}-unit`)).toBeInTheDocument();
    });
  });

  describe('備考フィールドの編集', () => {
    it('備考を変更するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const remarksInput = screen.getByLabelText(/備考/);
      await user.clear(remarksInput);
      await user.type(remarksInput, '新しい備考');

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('行にrole="row"が設定されている', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByRole('row')).toBeInTheDocument();
    });

    it('各セルにrole="cell"が設定されている', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const cells = screen.getAllByRole('cell');
      expect(cells.length).toBeGreaterThan(0);
    });

    it('アクションボタンにaria-haspopupが設定されている', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'アクション' })).toHaveAttribute(
        'aria-haspopup',
        'menu'
      );
    });

    it('メニューが開いている時aria-expandedがtrueになる', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const actionButton = screen.getByRole('button', { name: 'アクション' });
      await user.click(actionButton);

      expect(actionButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('必須フィールドにaria-requiredが設定されている', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      expect(nameInput).toHaveAttribute('aria-required');

      const quantityInput = screen.getByLabelText(/数量/);
      expect(quantityInput).toHaveAttribute('aria-required');
    });

    it('エラーがあるフィールドにaria-invalid="true"が設定される', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      await user.clear(nameInput);
      await user.tab();

      await waitFor(() => {
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });

  describe('showValidation=false', () => {
    it('showValidation=falseの場合、必須フィールドのエラーが表示されない', async () => {
      const invalidItem = { ...mockItem, name: '' };
      render(<FieldValidatedItemRow {...defaultProps} item={invalidItem} showValidation={false} />);

      expect(screen.queryByText('名称は必須です')).not.toBeInTheDocument();
    });
  });

  describe('計算方法変更時の再計算', () => {
    it('計算方法変更時に計算パラメータがあれば再計算される', async () => {
      const { calculate } = await import('../../../utils/calculation-engine');
      const itemWithParams = {
        ...mockItem,
        calculationParams: { width: 10, depth: 5, height: 2 },
      };
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithParams} />);

      const methodSelect = screen.getByTestId(
        `calculation-method-${mockItem.id}-calculationMethod`
      );
      await user.selectOptions(methodSelect, 'AREA_VOLUME');

      await waitFor(() => {
        expect(calculate).toHaveBeenCalled();
      });
    });
  });

  describe('計算パラメータの更新', () => {
    it('計算パラメータを更新するとonUpdateが呼ばれる', async () => {
      const user = userEvent.setup();
      const itemWithCalc = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
      };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithCalc} />);

      await user.click(screen.getByText('Update Params'));

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({
            calculationParams: { width: 10, depth: 5, height: 2 },
          })
        );
      });
    });
  });

  describe('調整係数変更時の再計算', () => {
    it('非STANDARD計算方法で調整係数を変更すると再計算される', async () => {
      const { calculate } = await import('../../../utils/calculation-engine');
      const itemWithCalc = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
      };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithCalc} />);

      const adjustmentInput = screen.getByLabelText(/調整係数/);
      fireEvent.change(adjustmentInput, { target: { value: '1.2' } });

      await waitFor(() => {
        expect(calculate).toHaveBeenCalled();
      });
    });
  });

  describe('丸め設定変更時の再計算', () => {
    it('非STANDARD計算方法で丸め設定を変更すると再計算される', async () => {
      const { calculate } = await import('../../../utils/calculation-engine');
      const itemWithCalc = {
        ...mockItem,
        calculationMethod: 'AREA_VOLUME' as const,
        calculationParams: { width: 10, depth: 5, height: 2 },
      };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithCalc} />);

      const roundingInput = screen.getByLabelText(/丸め設定/);
      fireEvent.change(roundingInput, { target: { value: '0.1' } });

      await waitFor(() => {
        expect(calculate).toHaveBeenCalled();
      });
    });
  });

  describe('コールバックなし時の動作', () => {
    it('onUpdateがない場合でもエラーにならない', async () => {
      const user = userEvent.setup();
      const propsWithoutUpdate = { ...defaultProps, onUpdate: undefined };
      render(<FieldValidatedItemRow {...propsWithoutUpdate} />);

      const nameInput = screen.getByLabelText(/名称/);
      await user.clear(nameInput);
      await user.type(nameInput, '新しい名称');
      await user.tab();

      // エラーが発生せず正常に動作する
      expect(nameInput).toBeInTheDocument();
    });

    it('onDeleteがない場合でもエラーにならない', async () => {
      const user = userEvent.setup();
      const propsWithoutDelete = { ...defaultProps, onDelete: undefined };
      render(<FieldValidatedItemRow {...propsWithoutDelete} />);

      await user.click(screen.getByRole('button', { name: '削除' }));

      // エラーが発生しないことを確認
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('onCopyがない場合でもエラーにならない', async () => {
      const user = userEvent.setup();
      const propsWithoutCopy = { ...defaultProps, onCopy: undefined };
      render(<FieldValidatedItemRow {...propsWithoutCopy} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /コピー/ }));

      // エラーが発生しないことを確認
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('onMoveUpがない場合でもエラーにならない', async () => {
      const user = userEvent.setup();
      const propsWithoutMoveUp = { ...defaultProps, onMoveUp: undefined };
      render(<FieldValidatedItemRow {...propsWithoutMoveUp} canMoveUp={true} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /上に移動/ }));

      // エラーが発生しないことを確認
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('onMoveDownがない場合でもエラーにならない', async () => {
      const user = userEvent.setup();
      const propsWithoutMoveDown = { ...defaultProps, onMoveDown: undefined };
      render(<FieldValidatedItemRow {...propsWithoutMoveDown} canMoveDown={true} />);

      await user.click(screen.getByRole('button', { name: 'アクション' }));
      await user.click(screen.getByRole('menuitem', { name: /下に移動/ }));

      // エラーが発生しないことを確認
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('名称のトリミング', () => {
    it('名称がトリミングされて空になる場合はonUpdateが呼ばれない', async () => {
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameInput = screen.getByLabelText(/名称/);
      await user.clear(nameInput);
      await user.type(nameInput, '   ');
      await user.tab();

      // 空の値では更新されない
      await waitFor(() => {
        expect(defaultProps.onUpdate).not.toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ name: '' })
        );
      });
    });
  });

  describe('無効な数値入力', () => {
    it('無効な数量値はonUpdateを呼ばない', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const quantityInput = screen.getByLabelText(/数量/);
      const initialCalls = defaultProps.onUpdate.mock.calls.length;
      fireEvent.change(quantityInput, { target: { value: 'abc' } });

      // parseFloatがNaNを返すため、onUpdateは新しい呼び出しがない
      expect(defaultProps.onUpdate.mock.calls.length).toBe(initialCalls);
    });

    it('無効な調整係数値はonUpdateを呼ばない', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const adjustmentInput = screen.getByLabelText(/調整係数/);
      const initialCalls = defaultProps.onUpdate.mock.calls.length;
      fireEvent.change(adjustmentInput, { target: { value: 'invalid' } });

      expect(defaultProps.onUpdate.mock.calls.length).toBe(initialCalls);
    });

    it('無効な丸め設定値はonUpdateを呼ばない', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const roundingInput = screen.getByLabelText(/丸め設定/);
      const initialCalls = defaultProps.onUpdate.mock.calls.length;
      fireEvent.change(roundingInput, { target: { value: 'invalid' } });

      expect(defaultProps.onUpdate.mock.calls.length).toBe(initialCalls);
    });
  });
});
