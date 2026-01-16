/**
 * @fileoverview 標準モード数量入力コンポーネント テスト
 *
 * Task 6.5: 標準モードの数量入力を実装する
 *
 * Requirements:
 * - 8.2: 「標準」モードで数量フィールドに直接数値を入力する
 * - 8.3: 数量フィールドに負の値が入力される場合、警告メッセージを表示し、確認を求める
 * - 8.4: 数量フィールドに数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuantityInput, { type QuantityInputMeta } from './QuantityInput';

describe('QuantityInput', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 表示テスト
  // ============================================================================

  describe('表示', () => {
    it('数量入力フィールドが表示される', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} />);

      expect(screen.getByRole('spinbutton', { name: /数量/i })).toBeInTheDocument();
    });

    it('ラベルが表示される', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} />);

      expect(screen.getByText('数量')).toBeInTheDocument();
    });

    it('valueプロパティの値が反映される', () => {
      render(<QuantityInput value={123.45} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveValue(123.45);
    });

    it('disabledがtrueの場合、入力が無効化される', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} disabled />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toBeDisabled();
    });

    it('step属性が0.01である', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveAttribute('step', '0.01');
    });

    it('readOnlyがtrueの場合、計算値として表示される', () => {
      render(<QuantityInput value={100} onChange={vi.fn()} readOnly />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveAttribute('readOnly');
    });
  });

  // ============================================================================
  // 入力テスト（Requirement 8.2）
  // ============================================================================

  describe('入力', () => {
    let onChange: Mock<(value: number | undefined, meta: QuantityInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('数値を入力するとonChangeが呼ばれる', () => {
      render(<QuantityInput value={0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      fireEvent.change(input, { target: { value: '100' } });

      expect(onChange).toHaveBeenCalledWith(100, expect.any(Object));
    });

    it('小数点以下の値を入力できる', () => {
      render(<QuantityInput value={0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      fireEvent.change(input, { target: { value: '123.456' } });

      expect(onChange).toHaveBeenCalledWith(123.456, expect.any(Object));
    });

    it('0を入力できる', () => {
      render(<QuantityInput value={10} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      fireEvent.change(input, { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith(0, expect.any(Object));
    });
  });

  // ============================================================================
  // 警告テスト（Requirement 8.3）
  // ============================================================================

  describe('警告表示', () => {
    let onChange: Mock<(value: number | undefined, meta: QuantityInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('負の値を入力すると警告付きでonChangeが呼ばれる', () => {
      render(<QuantityInput value={0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      fireEvent.change(input, { target: { value: '-10' } });

      expect(onChange).toHaveBeenCalledWith(
        -10,
        expect.objectContaining({
          hasWarning: true,
          warningMessage: expect.stringContaining('負'),
        })
      );
    });

    it('正の値の場合は警告なし', () => {
      render(<QuantityInput value={0} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      fireEvent.change(input, { target: { value: '10' } });

      expect(onChange).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          hasWarning: false,
        })
      );
    });

    it('0の場合は警告なし', () => {
      render(<QuantityInput value={10} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      fireEvent.change(input, { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          hasWarning: false,
        })
      );
    });

    it('hasWarningがtrueの場合、警告アイコンが表示される', () => {
      render(<QuantityInput value={-10} onChange={vi.fn()} hasWarning />);

      expect(screen.getByRole('img', { name: /警告/i })).toBeInTheDocument();
    });

    it('hasWarningがfalseの場合、警告アイコンが表示されない', () => {
      render(<QuantityInput value={10} onChange={vi.fn()} hasWarning={false} />);

      expect(screen.queryByRole('img', { name: /警告/i })).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // エラーテスト（Requirement 8.4）
  // ============================================================================

  describe('エラー表示', () => {
    let onChange: Mock<(value: number | undefined, meta: QuantityInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('空文字を入力するとエラー付きでonChangeが呼ばれる', () => {
      render(<QuantityInput value={10} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
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
      render(<QuantityInput value={0} onChange={vi.fn()} error="数量を入力してください" />);

      expect(screen.getByText('数量を入力してください')).toBeInTheDocument();
    });

    it('エラー時は入力フィールドの境界線が赤くなる', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} error="数量を入力してください" />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveStyle({ borderColor: '#dc2626' });
    });
  });

  // ============================================================================
  // 計算値表示テスト
  // ============================================================================

  describe('計算値表示', () => {
    it('readOnlyモードでは計算値ラベルが表示される', () => {
      render(<QuantityInput value={100} onChange={vi.fn()} readOnly />);

      expect(screen.getByText(/計算結果/i)).toBeInTheDocument();
    });

    it('readOnlyモードでは入力フィールドの背景が灰色になる', () => {
      render(<QuantityInput value={100} onChange={vi.fn()} readOnly />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveStyle({ backgroundColor: '#f3f4f6' });
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('入力フィールドはtype="number"', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveAttribute('type', 'number');
    });

    it('aria-invalidがエラー時にtrueになる', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} error="エラーメッセージ" />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('aria-describedbyがエラーメッセージと紐付く', () => {
      render(<QuantityInput value={0} onChange={vi.fn()} error="エラーメッセージ" />);

      const input = screen.getByRole('spinbutton', { name: /数量/i });
      const errorMessageId = input.getAttribute('aria-describedby');
      expect(errorMessageId).toBeTruthy();
      expect(document.getElementById(errorMessageId!)).toHaveTextContent('エラーメッセージ');
    });
  });
});
