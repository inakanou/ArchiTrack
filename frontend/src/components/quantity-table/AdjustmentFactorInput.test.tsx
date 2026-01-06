/**
 * @fileoverview 調整係数入力コンポーネント テスト
 *
 * Task 6.3: 調整係数入力コンポーネントを実装する
 *
 * Requirements:
 * - 9.1: 数量項目を追加する場合、調整係数列に「1.00」をデフォルト値として設定する
 * - 9.2: 調整係数列に数値を入力する場合、計算結果に調整係数を乗算した値を数量として設定する
 * - 9.3: 調整係数列に0以下の値が入力される場合、警告メッセージを表示し、確認を求める
 * - 9.4: 調整係数列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 9.5: 調整係数が設定されている状態で、計算元の値変更時に調整係数を適用した数量を自動再計算する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdjustmentFactorInput, { type AdjustmentFactorInputMeta } from './AdjustmentFactorInput';

describe('AdjustmentFactorInput', () => {
  // ============================================================================
  // 表示テスト
  // ============================================================================

  describe('表示', () => {
    it('調整係数入力フィールドが表示される', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} />);

      expect(screen.getByRole('spinbutton', { name: /調整係数/i })).toBeInTheDocument();
    });

    it('ラベルが表示される', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} />);

      expect(screen.getByText('調整係数')).toBeInTheDocument();
    });

    it('valueプロパティの値が反映される', () => {
      render(<AdjustmentFactorInput value={1.25} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toHaveValue(1.25);
    });

    it('disabledがtrueの場合、入力が無効化される', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} disabled />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toBeDisabled();
    });

    it('step属性が0.01である', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toHaveAttribute('step', '0.01');
    });
  });

  // ============================================================================
  // デフォルト値テスト（Requirement 9.1）
  // ============================================================================

  describe('デフォルト値', () => {
    it('デフォルト値は1.00', () => {
      // この動作はコンポーネント外で制御されるが、テストで確認
      const defaultValue = 1.0;
      render(<AdjustmentFactorInput value={defaultValue} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toHaveValue(1.0);
    });
  });

  // ============================================================================
  // 入力テスト（Requirement 9.2）
  // ============================================================================

  describe('入力', () => {
    let onChange: Mock<(value: number | undefined, meta: AdjustmentFactorInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('数値を入力するとonChangeが呼ばれる', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      fireEvent.change(input, { target: { value: '1.25' } });

      expect(onChange).toHaveBeenCalledWith(1.25, expect.any(Object));
    });

    it('小数点以下の値を入力できる', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      fireEvent.change(input, { target: { value: '1.5' } });

      expect(onChange).toHaveBeenCalledWith(1.5, expect.any(Object));
    });
  });

  // ============================================================================
  // 警告テスト（Requirement 9.3）
  // ============================================================================

  describe('警告表示', () => {
    let onChange: Mock<(value: number | undefined, meta: AdjustmentFactorInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('0以下の値を入力すると警告付きでonChangeが呼ばれる', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      fireEvent.change(input, { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          hasWarning: true,
          warningMessage: expect.stringContaining('0以下'),
        })
      );
    });

    it('負の値を入力すると警告付きでonChangeが呼ばれる', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      fireEvent.change(input, { target: { value: '-0.5' } });

      expect(onChange).toHaveBeenCalledWith(
        -0.5,
        expect.objectContaining({
          hasWarning: true,
        })
      );
    });

    it('0より大きい値の場合は警告なし', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      fireEvent.change(input, { target: { value: '0.5' } });

      expect(onChange).toHaveBeenCalledWith(
        0.5,
        expect.objectContaining({
          hasWarning: false,
        })
      );
    });

    it('hasWarningがtrueの場合、警告アイコンが表示される', () => {
      render(<AdjustmentFactorInput value={0} onChange={vi.fn()} hasWarning />);

      expect(screen.getByRole('img', { name: /警告/i })).toBeInTheDocument();
    });

    it('hasWarningがfalseの場合、警告アイコンが表示されない', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} hasWarning={false} />);

      expect(screen.queryByRole('img', { name: /警告/i })).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // エラーテスト（Requirement 9.4）
  // ============================================================================

  describe('エラー表示', () => {
    let onChange: Mock<(value: number | undefined, meta: AdjustmentFactorInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('空文字を入力するとエラー付きでonChangeが呼ばれる', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      fireEvent.change(input, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          hasError: true,
          errorMessage: expect.any(String),
        })
      );
    });

    it('errorプロパティが設定されている場合、エラーメッセージが表示される', () => {
      render(
        <AdjustmentFactorInput value={1.0} onChange={vi.fn()} error="調整係数を入力してください" />
      );

      expect(screen.getByText('調整係数を入力してください')).toBeInTheDocument();
    });

    it('エラー時は入力フィールドの境界線が赤くなる', () => {
      render(
        <AdjustmentFactorInput value={1.0} onChange={vi.fn()} error="調整係数を入力してください" />
      );

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toHaveStyle({ borderColor: '#dc2626' });
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('入力フィールドはtype="number"', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toHaveAttribute('type', 'number');
    });

    it('aria-invalidがエラー時にtrueになる', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} error="エラーメッセージ" />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('aria-describedbyがエラーメッセージと紐付く', () => {
      render(<AdjustmentFactorInput value={1.0} onChange={vi.fn()} error="エラーメッセージ" />);

      const input = screen.getByRole('spinbutton', { name: /調整係数/i });
      const errorMessageId = input.getAttribute('aria-describedby');
      expect(errorMessageId).toBeTruthy();
      expect(document.getElementById(errorMessageId!)).toHaveTextContent('エラーメッセージ');
    });
  });
});
