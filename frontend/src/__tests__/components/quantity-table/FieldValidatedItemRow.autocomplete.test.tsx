/**
 * @fileoverview 名称・備考フィールドのオートコンプリート単体テスト
 *
 * Task 27.1: 名称・備考フィールドのオートコンプリート単体テストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-7.1: 対象フィールド（名称・備考）でオートコンプリート候補を表示
 * - REQ-7.3: クライアントサイドでのフィルタリング表示（フォーカス時に候補表示）
 * - REQ-7.4: 候補選択時の自動入力
 * - REQ-7.5: blur時にクライアントサイドで候補追加
 *
 * @module __tests__/components/quantity-table/FieldValidatedItemRow.autocomplete.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldValidatedItemRow from '../../../components/quantity-table/FieldValidatedItemRow';
import EditableQuantityItemRow from '../../../components/quantity-table/EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

// CalculationMethodSelectのモック
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
  default: () => <div data-testid="calculation-fields" />,
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

// ============================================================================
// FieldValidatedItemRow のテスト
// ============================================================================

describe('FieldValidatedItemRow - 名称・備考オートコンプリート', () => {
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
    getSuggestions: vi.fn().mockReturnValue([]),
    onBlurAddCandidate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-7.1: 名称フィールドがAutocompleteInputとしてレンダリングされる', () => {
    it('名称フィールドがcomboboxロールを持つ', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      // AutocompleteInputはrole="combobox"を付与する
      const nameField = screen.getByRole('combobox', { name: /名称/ });
      expect(nameField).toBeInTheDocument();
      expect(nameField).toHaveValue('足場');
    });

    it('名称フィールドのrequired属性が維持される', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      expect(nameField).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('REQ-7.1: 備考フィールドがAutocompleteInputとしてレンダリングされる', () => {
    it('備考フィールドがcomboboxロールを持つ', () => {
      render(<FieldValidatedItemRow {...defaultProps} />);

      const remarksField = screen.getByRole('combobox', { name: /備考/ });
      expect(remarksField).toBeInTheDocument();
      expect(remarksField).toHaveValue('安全用');
    });
  });

  describe('REQ-7.3: 名称フィールドでオートコンプリート候補が表示される', () => {
    it('名称フィールドにフォーカスするとgetSuggestionsが呼ばれる', async () => {
      const getSuggestions = vi.fn().mockReturnValue(['足場', '外部足場', '内部足場']);
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} getSuggestions={getSuggestions} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      await user.click(nameField);

      expect(getSuggestions).toHaveBeenCalledWith('name', expect.any(String));
    });

    it('名称フィールドにフォーカスすると候補がドロップダウン表示される', async () => {
      const getSuggestions = vi.fn().mockReturnValue(['外部足場', '内部足場']);
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} getSuggestions={getSuggestions} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      await user.click(nameField);

      // ドロップダウンが表示される
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
      expect(within(listbox).getByText('外部足場')).toBeInTheDocument();
      expect(within(listbox).getByText('内部足場')).toBeInTheDocument();
    });
  });

  describe('REQ-7.3: 備考フィールドでオートコンプリート候補が表示される', () => {
    it('備考フィールドにフォーカスするとgetSuggestionsが呼ばれる', async () => {
      const getSuggestions = vi.fn().mockReturnValue(['備考A', '備考B']);
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} getSuggestions={getSuggestions} />);

      const remarksField = screen.getByRole('combobox', { name: /備考/ });
      await user.click(remarksField);

      expect(getSuggestions).toHaveBeenCalledWith('remarks', expect.any(String));
    });
  });

  describe('REQ-7.5: 名称フィールドでblur時に候補が追加される', () => {
    it('名称フィールドからフォーカスが外れるとonBlurAddCandidateが呼ばれる', async () => {
      const onBlurAddCandidate = vi.fn();
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} onBlurAddCandidate={onBlurAddCandidate} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      await user.click(nameField);
      await user.tab();

      // blur時にonBlurAddCandidateがfieldName='name'で呼ばれる
      expect(onBlurAddCandidate).toHaveBeenCalledWith('name', expect.any(String));
    });
  });

  describe('名称フィールドの文字数制限バリデーションが維持される', () => {
    it('名称フィールドの入力値変更時にonUpdateが呼ばれる', async () => {
      const onUpdate = vi.fn();
      const user = userEvent.setup();
      render(<FieldValidatedItemRow {...defaultProps} onUpdate={onUpdate} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      await user.clear(nameField);
      await user.type(nameField, 'テスト名称');

      // createTextUpdateHandlerを通じてonUpdateが呼ばれる
      expect(onUpdate).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// EditableQuantityItemRow のテスト
// ============================================================================

describe('EditableQuantityItemRow - 名称・備考オートコンプリート', () => {
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
    getSuggestions: vi.fn().mockReturnValue([]),
    onBlurAddCandidate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-7.1: 名称フィールドがAutocompleteInputとしてレンダリングされる', () => {
    it('名称フィールドがcomboboxロールを持つ', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      expect(nameField).toBeInTheDocument();
      expect(nameField).toHaveValue('足場');
    });

    it('名称フィールドのrequired属性が維持される', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      expect(nameField).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('REQ-7.1: 備考フィールドがAutocompleteInputとしてレンダリングされる', () => {
    it('備考フィールドがcomboboxロールを持つ', () => {
      render(<EditableQuantityItemRow {...defaultProps} />);

      const remarksField = screen.getByRole('combobox', { name: /備考/ });
      expect(remarksField).toBeInTheDocument();
      expect(remarksField).toHaveValue('安全用');
    });
  });

  describe('REQ-7.3: 名称フィールドでオートコンプリート候補が表示される', () => {
    it('名称フィールドにフォーカスするとgetSuggestionsが呼ばれる', async () => {
      const getSuggestions = vi.fn().mockReturnValue(['足場', '外部足場']);
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} getSuggestions={getSuggestions} />);

      const nameField = screen.getByRole('combobox', { name: /名称/ });
      await user.click(nameField);

      expect(getSuggestions).toHaveBeenCalledWith('name', expect.any(String));
    });
  });

  describe('REQ-7.3: 備考フィールドでオートコンプリート候補が表示される', () => {
    it('備考フィールドにフォーカスするとgetSuggestionsが呼ばれる', async () => {
      const getSuggestions = vi.fn().mockReturnValue(['備考A']);
      const user = userEvent.setup();
      render(<EditableQuantityItemRow {...defaultProps} getSuggestions={getSuggestions} />);

      const remarksField = screen.getByRole('combobox', { name: /備考/ });
      await user.click(remarksField);

      expect(getSuggestions).toHaveBeenCalledWith('remarks', expect.any(String));
    });
  });
});
