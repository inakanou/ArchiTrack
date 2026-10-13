/**
 * @fileoverview 編集可能項目行の名称・備考フィールドのオートコンプリート単体テスト
 *
 * Task 27.1: 名称・備考フィールドのオートコンプリート単体テストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-7.1: 対象フィールド（名称・備考）でオートコンプリート候補を表示
 * - REQ-7.3: クライアントサイドでのフィルタリング表示（フォーカス時に候補表示）
 *
 * タスク 89.1 で本番の経路から到達しない `FieldValidatedItemRow` を撤去した際、
 * 同部品と本番の行 `EditableQuantityItemRow` の両方を検証していた旧ファイル
 * `FieldValidatedItemRow.autocomplete.test.tsx` から、本番の行を検証する部分だけを
 * 移した（検証の本体は移す前と同一）。REQ-7.6（blur 時の候補追加）は旧ファイルでは
 * 撤去した部品に対してだけ検証していたため、本ファイルでは名乗らない。
 *
 * @module __tests__/components/quantity-table/EditableQuantityItemRow.autocomplete.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// 範囲の正典（numeric-range-validation）が箇所数の上下限を calculation-engine から
// 取るため、部分モックにして実体の定数を残す（Task 80.1。値の二重定義を避ける）
vi.mock('../../../utils/calculation-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/calculation-engine')>()),
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
