/**
 * @fileoverview EstimateItemRow テスト
 *
 * Task 37.2: 親項目制御のテスト
 *
 * Requirements:
 * - REQ-29.1: 子項目を持つ親項目の単価フィールドを編集不可にする
 * - REQ-29.2: 子項目の金額合計を親項目の金額として表示する
 * - REQ-29.3: 名称・規格・単位・備考のみ手動編集可能にする
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstimateItemRow } from '../../../components/estimate/EstimateItemRow';
import type { EstimateItemLineEdit } from '../../../hooks/useEstimateEditor';

const createMockLines = (): EstimateItemLineEdit[] => [
  {
    id: 'line-e',
    estimateItemId: 'item-1',
    lineType: 'ESTIMATE',
    name: '外壁塗装',
    specification: '仕様A',
    unit: '式',
    quantity: '1',
    unitPrice: '100000',
    amount: '100000',
    remarks: null,
  },
  {
    id: 'line-x',
    estimateItemId: 'item-1',
    lineType: 'EXECUTION',
    name: '外壁塗装',
    specification: '仕様A',
    unit: '式',
    quantity: '1',
    unitPrice: '90000',
    amount: '90000',
    remarks: null,
  },
  {
    id: 'line-v',
    estimateItemId: 'item-1',
    lineType: 'VENDOR',
    name: '外壁塗装',
    specification: '仕様A',
    unit: '式',
    quantity: '1',
    unitPrice: '80000',
    amount: '80000',
    remarks: null,
    sourceVendorName: '業者A',
  },
];

describe('EstimateItemRow', () => {
  const defaultProps = {
    itemId: 'item-1',
    lines: createMockLines(),
    onLineChange: vi.fn(),
  };

  // ==========================================================================
  // 基本レンダリング
  // ==========================================================================
  describe('基本レンダリング', () => {
    it('3行1セット（見積/実行/業者）が表示されること', () => {
      render(<EstimateItemRow {...defaultProps} />);

      expect(screen.getByTestId('line-type-ESTIMATE')).toBeInTheDocument();
      expect(screen.getByTestId('line-type-EXECUTION')).toBeInTheDocument();
      expect(screen.getByTestId('line-type-VENDOR')).toBeInTheDocument();
    });

    it('visibleLineTypesでフィルタリングされること (REQ-28)', () => {
      const visibleLineTypes = new Set<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>(['ESTIMATE']);
      render(<EstimateItemRow {...defaultProps} visibleLineTypes={visibleLineTypes} />);

      expect(screen.getByTestId('line-type-ESTIMATE')).toBeInTheDocument();
      expect(screen.queryByTestId('line-type-EXECUTION')).not.toBeInTheDocument();
      expect(screen.queryByTestId('line-type-VENDOR')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-29: hasChildren - 親項目の単価自動計算制御
  // ==========================================================================
  describe('親項目の単価制御 (REQ-29)', () => {
    it('hasChildren=falseの場合、単価フィールドがinputとして表示されること', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={false} />);

      // 単価フィールドはinputであるべき
      const unitPriceInputs = screen.getAllByLabelText('単価');
      unitPriceInputs.forEach((el) => {
        expect(el.tagName.toLowerCase()).toBe('input');
      });
    });

    it('hasChildren=trueの場合、単価フィールドが読み取り専用（div）で表示されること (REQ-29.1)', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={true} />);

      // 単価フィールドはdiv（読み取り専用）であるべき
      const unitPriceFields = screen.getAllByLabelText('単価');
      unitPriceFields.forEach((el) => {
        expect(el.tagName.toLowerCase()).toBe('div');
      });
    });

    it('hasChildren=trueでも名称フィールドは編集可能であること (REQ-29.3)', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={true} />);

      const nameInputs = screen.getAllByLabelText('名称');
      nameInputs.forEach((el) => {
        expect(el.tagName.toLowerCase()).toBe('input');
      });
    });

    it('hasChildren=trueでも規格フィールドは編集可能であること (REQ-29.3)', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={true} />);

      const specInputs = screen.getAllByLabelText('規格');
      specInputs.forEach((el) => {
        expect(el.tagName.toLowerCase()).toBe('input');
      });
    });

    it('hasChildren=trueでも単位フィールドは編集可能であること (REQ-29.3)', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={true} />);

      const unitInputs = screen.getAllByLabelText('単位');
      unitInputs.forEach((el) => {
        expect(el.tagName.toLowerCase()).toBe('input');
      });
    });

    it('hasChildren=trueでも備考フィールドは編集可能であること (REQ-29.3)', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={true} />);

      const remarkInputs = screen.getAllByLabelText('備考');
      remarkInputs.forEach((el) => {
        expect(el.tagName.toLowerCase()).toBe('input');
      });
    });

    it('hasChildren=trueの場合、金額フィールドが表示されること (REQ-29.2)', () => {
      render(<EstimateItemRow {...defaultProps} hasChildren={true} />);

      const amountFields = screen.getAllByTestId('amount-field');
      expect(amountFields).toHaveLength(3); // 3行分
      // 金額値が表示されている
      expect(amountFields[0]).toHaveTextContent('100,000');
    });
  });
});
