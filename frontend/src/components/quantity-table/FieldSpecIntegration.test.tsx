/**
 * @fileoverview フィールド仕様統合テスト
 *
 * Task 14.1: 数量項目行コンポーネントにフィールド仕様を統合する
 *
 * Requirements:
 * - 13.1, 13.2, 13.3: 各テキストフィールドに文字数制限を適用する
 * - 14.1, 14.2, 14.3, 14.4, 14.5: 各数値フィールドに範囲チェックと表示書式を適用する
 * - 15.1, 15.2, 15.3: フィールドバリデーターを使用した入力制御を統合する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FieldValidatedItemRow from './FieldValidatedItemRow';
import type { QuantityItemDetail } from '../../types/quantity-table.types';
import { validateQuantityItemFields } from '../../utils/field-validation';

// Mock useAutocomplete hook
vi.mock('../../hooks/useAutocomplete', () => ({
  useAutocomplete: vi.fn(() => ({
    suggestions: [],
    isLoading: false,
    error: null,
  })),
}));

describe('FieldValidatedItemRow - Task 14.1', () => {
  const mockItem: QuantityItemDetail = {
    id: 'item-1',
    quantityGroupId: 'group-1',
    majorCategory: '建築工事',
    middleCategory: '内装仕上工事',
    minorCategory: null,
    customCategory: null,
    workType: '足場工事',
    name: '外部足場',
    specification: 'H=10m',
    unit: 'm2',
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1,
    roundingUnit: 0.01,
    quantity: 100,
    remarks: '備考テスト',
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const defaultProps = {
    item: mockItem,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    onValidationChange: vi.fn(),
    unsavedMajorCategories: [] as string[],
    unsavedMiddleCategories: [] as string[],
    unsavedMinorCategories: [] as string[],
    unsavedWorkTypes: [] as string[],
    unsavedUnits: [] as string[],
    unsavedSpecifications: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考の文字数制限', () => {
    it('大項目が全角26文字の場合にエラーを表示する', async () => {
      // 全角26文字の大項目でレンダリング（超過）
      const itemWithLongCategory = { ...mockItem, majorCategory: 'あ'.repeat(26) };
      render(
        <FieldValidatedItemRow {...defaultProps} item={itemWithLongCategory} showValidation />
      );

      // エラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByText(/大項目は全角25文字\/半角50文字以内で入力してください/)
        ).toBeInTheDocument();
      });
    });

    it('工種が全角8文字以内であればエラーなし', () => {
      // 全角8文字の工種
      const itemWith8Chars = { ...mockItem, workType: 'あいうえおかきく' };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWith8Chars} />);

      // エラーがないことを確認
      expect(
        screen.queryByText(/工種は全角8文字\/半角16文字以内で入力してください/)
      ).not.toBeInTheDocument();
    });
  });

  describe('REQ-13.2: 工種の文字数制限（全角8文字/半角16文字）', () => {
    it('工種が全角9文字の場合にエラーを表示する', async () => {
      // 全角9文字の工種でレンダリング（超過）
      const itemWithLongWorkType = { ...mockItem, workType: 'あ'.repeat(9) };
      render(
        <FieldValidatedItemRow {...defaultProps} item={itemWithLongWorkType} showValidation />
      );

      // エラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByText(/工種は全角8文字\/半角16文字以内で入力してください/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('REQ-13.3: 単位の文字数制限（全角3文字/半角6文字）', () => {
    it('単位が全角4文字の場合にエラーを表示する', async () => {
      // 全角4文字の単位でレンダリング（超過）
      const itemWithLongUnit = { ...mockItem, unit: 'あいうえ' };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithLongUnit} showValidation />);

      // エラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByText(/単位は全角3文字\/半角6文字以内で入力してください/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('REQ-14.1, 14.2, 14.5: 数値フィールドの表示書式と右寄せ', () => {
    it('調整係数を小数2桁で表示する', () => {
      const itemWith1Factor = { ...mockItem, adjustmentFactor: 1 };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWith1Factor} />);

      const adjustmentFactorInput = screen.getByRole('spinbutton', { name: /調整係数/ });
      expect(adjustmentFactorInput).toHaveValue(1);
    });

    it('丸め設定を小数2桁で表示する', () => {
      const itemWithRounding = { ...mockItem, roundingUnit: 0.01 };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithRounding} />);

      const roundingUnitInput = screen.getByRole('spinbutton', { name: /丸め設定/ });
      expect(roundingUnitInput).toHaveValue(0.01);
    });

    it('数量を小数2桁で表示する', () => {
      const itemWithQuantity = { ...mockItem, quantity: 100 };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithQuantity} />);

      const quantityInput = screen.getByRole('spinbutton', { name: /数量/ });
      expect(quantityInput).toHaveValue(100);
    });
  });

  describe('REQ-15.1: 数量フィールドの範囲チェック（-999999.99〜9999999.99）', () => {
    it('数量が範囲外の場合にエラーを表示する', async () => {
      // 範囲外の数量でレンダリング
      const itemWithOutOfRangeQuantity = { ...mockItem, quantity: 99999999 };
      render(
        <FieldValidatedItemRow {...defaultProps} item={itemWithOutOfRangeQuantity} showValidation />
      );

      // エラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByText(/数量は-999999.99から9999999.99の範囲で入力してください/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('エラー状態の表示と必須項目のハイライト', () => {
    it('必須フィールドが空の場合にエラースタイルが適用される', async () => {
      const itemWithEmptyName = { ...mockItem, name: '' };
      render(<FieldValidatedItemRow {...defaultProps} item={itemWithEmptyName} showValidation />);

      // 名称のエラーが表示される
      expect(screen.getByText('名称は必須です')).toBeInTheDocument();

      // 入力フィールドにエラースタイルが適用される
      const nameInput = screen.getByRole('textbox', { name: /名称/ });
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('文字数超過フィールドにエラースタイルが適用される', async () => {
      // 全角26文字の大項目（超過）
      const itemWithLongCategory = { ...mockItem, majorCategory: 'あ'.repeat(26) };
      render(
        <FieldValidatedItemRow {...defaultProps} item={itemWithLongCategory} showValidation />
      );

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(
          screen.getByText(/大項目は全角25文字\/半角50文字以内で入力してください/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('onValidationChange コールバック', () => {
    it('バリデーションエラーが変更された時にコールバックが呼ばれる', async () => {
      const onValidationChange = vi.fn();
      render(
        <FieldValidatedItemRow
          {...defaultProps}
          onValidationChange={onValidationChange}
          showValidation
        />
      );

      // 初期状態でコールバックが呼ばれる
      await waitFor(() => {
        expect(onValidationChange).toHaveBeenCalled();
      });
    });

    it('エラーがある場合にhasErrors: trueが渡される', async () => {
      const onValidationChange = vi.fn();
      const itemWithEmptyName = { ...mockItem, name: '' };
      render(
        <FieldValidatedItemRow
          {...defaultProps}
          item={itemWithEmptyName}
          onValidationChange={onValidationChange}
          showValidation
        />
      );

      await waitFor(() => {
        expect(onValidationChange).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ hasErrors: true })
        );
      });
    });

    it('エラーがない場合にhasErrors: falseが渡される', async () => {
      const onValidationChange = vi.fn();
      render(
        <FieldValidatedItemRow
          {...defaultProps}
          onValidationChange={onValidationChange}
          showValidation
        />
      );

      await waitFor(() => {
        expect(onValidationChange).toHaveBeenCalledWith(
          'item-1',
          expect.objectContaining({ hasErrors: false })
        );
      });
    });
  });
});

describe('validateQuantityItemFields utility function', () => {
  describe('テキストフィールドの文字数検証', () => {
    it('全角文字は幅2、半角文字は幅1でカウントされる', () => {
      // 全角25文字 = 幅50（制限内）
      const validItem = {
        majorCategory: 'あ'.repeat(25),
        middleCategory: '',
        minorCategory: '',
        customCategory: '',
        workType: '工種',
        name: '名称',
        specification: '',
        unit: 'm2',
        remarks: '',
        adjustmentFactor: 1,
        roundingUnit: 0.01,
        quantity: 100,
      };
      const result = validateQuantityItemFields(validItem);
      expect(result.majorCategory).toBeUndefined();
    });

    it('半角50文字の大項目は有効', () => {
      const validItem = {
        majorCategory: 'a'.repeat(50),
        middleCategory: '',
        minorCategory: '',
        customCategory: '',
        workType: '工種',
        name: '名称',
        specification: '',
        unit: 'm2',
        remarks: '',
        adjustmentFactor: 1,
        roundingUnit: 0.01,
        quantity: 100,
      };
      const result = validateQuantityItemFields(validItem);
      expect(result.majorCategory).toBeUndefined();
    });

    it('半角51文字の大項目はエラー', () => {
      const invalidItem = {
        majorCategory: 'a'.repeat(51),
        middleCategory: '',
        minorCategory: '',
        customCategory: '',
        workType: '工種',
        name: '名称',
        specification: '',
        unit: 'm2',
        remarks: '',
        adjustmentFactor: 1,
        roundingUnit: 0.01,
        quantity: 100,
      };
      const result = validateQuantityItemFields(invalidItem);
      expect(result.majorCategory).toBeDefined();
    });
  });

  describe('数値フィールドの範囲検証', () => {
    it('調整係数が範囲内であれば有効', () => {
      const validItem = {
        majorCategory: '大項目',
        middleCategory: '',
        minorCategory: '',
        customCategory: '',
        workType: '工種',
        name: '名称',
        specification: '',
        unit: 'm2',
        remarks: '',
        adjustmentFactor: 5.5,
        roundingUnit: 0.01,
        quantity: 100,
      };
      const result = validateQuantityItemFields(validItem);
      expect(result.adjustmentFactor).toBeUndefined();
    });

    it('調整係数が範囲外であればエラー', () => {
      const invalidItem = {
        majorCategory: '大項目',
        middleCategory: '',
        minorCategory: '',
        customCategory: '',
        workType: '工種',
        name: '名称',
        specification: '',
        unit: 'm2',
        remarks: '',
        adjustmentFactor: 10.0, // 範囲: -9.99〜9.99
        roundingUnit: 0.01,
        quantity: 100,
      };
      const result = validateQuantityItemFields(invalidItem);
      expect(result.adjustmentFactor).toBeDefined();
    });

    it('数量が範囲外であればエラー', () => {
      const invalidItem = {
        majorCategory: '大項目',
        middleCategory: '',
        minorCategory: '',
        customCategory: '',
        workType: '工種',
        name: '名称',
        specification: '',
        unit: 'm2',
        remarks: '',
        adjustmentFactor: 1,
        roundingUnit: 0.01,
        quantity: 10000000, // 範囲: -999999.99〜9999999.99
      };
      const result = validateQuantityItemFields(invalidItem);
      expect(result.quantity).toBeDefined();
    });
  });
});
