/**
 * @fileoverview 計算用フィールドコンポーネント テスト
 *
 * Task 6.2: 計算用フィールドコンポーネントを実装する
 *
 * Requirements:
 * - 8.5: 「面積・体積」モードで計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.6: 「面積・体積」モードで計算用列に1つ以上の値が入力される場合、入力された項目のみを掛け算して計算結果を数量として自動設定する
 * - 8.8: 「ピッチ」モードで計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.9: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）に値が入力される場合、ピッチ計算式に基づいて本数を算出する
 * - 8.11: 計算用列の値変更時に数量を自動再計算する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalculationFields from './CalculationFields';
import type { AreaVolumeParams, PitchParams } from '../../utils/calculation-engine';
import type { CalculationParams } from '../../types/quantity-edit.types';

describe('CalculationFields', () => {
  // ============================================================================
  // 面積・体積モード表示テスト（Requirement 8.5）
  // ============================================================================

  describe('面積・体積モード - 表示', () => {
    it('面積・体積モードで4つの入力フィールドが表示される', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByLabelText(/幅/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/奥行き/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/高さ/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/重量/i)).toBeInTheDocument();
    });

    it('面積・体積モードで各フィールドのラベルが正しく表示される', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByText('幅（W）')).toBeInTheDocument();
      expect(screen.getByText('奥行き（D）')).toBeInTheDocument();
      expect(screen.getByText('高さ（H）')).toBeInTheDocument();
      expect(screen.getByText('重量')).toBeInTheDocument();
    });

    it('paramsの値が入力フィールドに反映される', () => {
      const params: AreaVolumeParams = {
        width: 10,
        depth: 20,
        height: 5,
        weight: 2.5,
      };

      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={params}
          onChange={vi.fn()}
          disabled={false}
        />
      );

      expect(screen.getByLabelText(/幅/i)).toHaveValue(10);
      expect(screen.getByLabelText(/奥行き/i)).toHaveValue(20);
      expect(screen.getByLabelText(/高さ/i)).toHaveValue(5);
      expect(screen.getByLabelText(/重量/i)).toHaveValue(2.5);
    });

    it('disabledがtrueの場合、全てのフィールドが無効化される', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={true} />
      );

      expect(screen.getByLabelText(/幅/i)).toBeDisabled();
      expect(screen.getByLabelText(/奥行き/i)).toBeDisabled();
      expect(screen.getByLabelText(/高さ/i)).toBeDisabled();
      expect(screen.getByLabelText(/重量/i)).toBeDisabled();
    });
  });

  // ============================================================================
  // 面積・体積モード入力テスト（Requirement 8.6）
  // ============================================================================

  describe('面積・体積モード - 入力', () => {
    let onChange: Mock<(params: CalculationParams) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('幅を入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const widthInput = screen.getByLabelText(/幅/i);
      fireEvent.change(widthInput, { target: { value: '10' } });

      expect(onChange).toHaveBeenCalledWith({ width: 10 });
    });

    it('奥行きを入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const depthInput = screen.getByLabelText(/奥行き/i);
      fireEvent.change(depthInput, { target: { value: '20' } });

      expect(onChange).toHaveBeenCalledWith({ depth: 20 });
    });

    it('高さを入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const heightInput = screen.getByLabelText(/高さ/i);
      fireEvent.change(heightInput, { target: { value: '5' } });

      expect(onChange).toHaveBeenCalledWith({ height: 5 });
    });

    it('重量を入力するとonChangeが呼ばれる', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={onChange} disabled={false} />
      );

      const weightInput = screen.getByLabelText(/重量/i);
      fireEvent.change(weightInput, { target: { value: '2.5' } });

      expect(onChange).toHaveBeenCalledWith({ weight: 2.5 });
    });

    it('既存の値がある場合、新しい値とマージされる', () => {
      const params: AreaVolumeParams = { width: 10 };

      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={params}
          onChange={onChange}
          disabled={false}
        />
      );

      const depthInput = screen.getByLabelText(/奥行き/i);
      fireEvent.change(depthInput, { target: { value: '20' } });

      expect(onChange).toHaveBeenCalledWith({ width: 10, depth: 20 });
    });

    it('空文字を入力するとundefinedになる', () => {
      const params: AreaVolumeParams = { width: 10 };

      render(
        <CalculationFields
          method="AREA_VOLUME"
          params={params}
          onChange={onChange}
          disabled={false}
        />
      );

      const widthInput = screen.getByLabelText(/幅/i);
      fireEvent.change(widthInput, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith({ width: undefined });
    });
  });

  // ============================================================================
  // ピッチモード表示テスト（Requirement 8.8）
  // ============================================================================

  describe('ピッチモード - 表示', () => {
    it('ピッチモードで6つの入力フィールドが表示される', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />);

      expect(screen.getByLabelText(/範囲長/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/端長1/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/端長2/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ピッチ長/i)).toBeInTheDocument();
      expect(screen.getByLabelText('長さ')).toBeInTheDocument();
      expect(screen.getByLabelText(/重量/i)).toBeInTheDocument();
    });

    it('ピッチモードで必須フィールドにマークが表示される', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />);

      // 必須フィールドに*マークがある
      expect(screen.getByText(/範囲長/i).parentElement?.textContent).toContain('*');
      expect(screen.getByText(/端長1/i).parentElement?.textContent).toContain('*');
      expect(screen.getByText(/端長2/i).parentElement?.textContent).toContain('*');
      expect(screen.getByText(/ピッチ長/i).parentElement?.textContent).toContain('*');
    });

    it('paramsの値が入力フィールドに反映される', () => {
      const params: PitchParams = {
        rangeLength: 1000,
        endLength1: 50,
        endLength2: 50,
        pitchLength: 200,
        length: 6,
        weight: 1.2,
      };

      render(
        <CalculationFields method="PITCH" params={params} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByLabelText(/範囲長/i)).toHaveValue(1000);
      expect(screen.getByLabelText(/端長1/i)).toHaveValue(50);
      expect(screen.getByLabelText(/端長2/i)).toHaveValue(50);
      expect(screen.getByLabelText(/ピッチ長/i)).toHaveValue(200);
      expect(screen.getByLabelText('長さ')).toHaveValue(6);
      expect(screen.getByLabelText(/重量/i)).toHaveValue(1.2);
    });

    it('disabledがtrueの場合、全てのフィールドが無効化される', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={true} />);

      expect(screen.getByLabelText(/範囲長/i)).toBeDisabled();
      expect(screen.getByLabelText(/端長1/i)).toBeDisabled();
      expect(screen.getByLabelText(/端長2/i)).toBeDisabled();
      expect(screen.getByLabelText(/ピッチ長/i)).toBeDisabled();
      expect(screen.getByLabelText('長さ')).toBeDisabled();
      expect(screen.getByLabelText(/重量/i)).toBeDisabled();
    });
  });

  // ============================================================================
  // ピッチモード入力テスト（Requirement 8.9）
  // ============================================================================

  describe('ピッチモード - 入力', () => {
    let onChange: Mock<(params: CalculationParams) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('範囲長を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/範囲長/i);
      fireEvent.change(input, { target: { value: '1000' } });

      expect(onChange).toHaveBeenCalledWith({ rangeLength: 1000 });
    });

    it('端長1を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/端長1/i);
      fireEvent.change(input, { target: { value: '50' } });

      expect(onChange).toHaveBeenCalledWith({ endLength1: 50 });
    });

    it('端長2を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/端長2/i);
      fireEvent.change(input, { target: { value: '50' } });

      expect(onChange).toHaveBeenCalledWith({ endLength2: 50 });
    });

    it('ピッチ長を入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText(/ピッチ長/i);
      fireEvent.change(input, { target: { value: '200' } });

      expect(onChange).toHaveBeenCalledWith({ pitchLength: 200 });
    });

    it('長さを入力するとonChangeが呼ばれる', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={onChange} disabled={false} />);

      const input = screen.getByLabelText('長さ');
      fireEvent.change(input, { target: { value: '6' } });

      expect(onChange).toHaveBeenCalledWith({ length: 6 });
    });

    it('既存の値がある場合、新しい値とマージされる', () => {
      const params: PitchParams = { rangeLength: 1000 };

      render(
        <CalculationFields method="PITCH" params={params} onChange={onChange} disabled={false} />
      );

      const input = screen.getByLabelText(/端長1/i);
      fireEvent.change(input, { target: { value: '50' } });

      expect(onChange).toHaveBeenCalledWith({ rangeLength: 1000, endLength1: 50 });
    });
  });

  // ============================================================================
  // 標準モード表示テスト
  // ============================================================================

  describe('標準モード', () => {
    it('標準モードではフィールドが表示されない', () => {
      render(
        <CalculationFields method="STANDARD" params={{}} onChange={vi.fn()} disabled={false} />
      );

      // 標準モードでは計算用フィールドは表示されない
      expect(screen.queryByLabelText(/幅/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/範囲長/i)).not.toBeInTheDocument();
    });

    it('標準モードではメッセージが表示される', () => {
      render(
        <CalculationFields method="STANDARD" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByText(/直接数量を入力/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('面積・体積モードの各入力フィールドはtype="number"', () => {
      render(
        <CalculationFields method="AREA_VOLUME" params={{}} onChange={vi.fn()} disabled={false} />
      );

      expect(screen.getByLabelText(/幅/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/奥行き/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/高さ/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/重量/i)).toHaveAttribute('type', 'number');
    });

    it('ピッチモードの各入力フィールドはtype="number"', () => {
      render(<CalculationFields method="PITCH" params={{}} onChange={vi.fn()} disabled={false} />);

      expect(screen.getByLabelText(/範囲長/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/端長1/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/端長2/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/ピッチ長/i)).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText('長さ')).toHaveAttribute('type', 'number');
      expect(screen.getByLabelText(/重量/i)).toHaveAttribute('type', 'number');
    });
  });
});
