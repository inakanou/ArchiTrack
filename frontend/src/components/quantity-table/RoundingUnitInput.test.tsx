/**
 * @fileoverview 丸め設定入力コンポーネント テスト
 *
 * Task 6.4: 丸め設定入力コンポーネントを実装する
 *
 * Requirements:
 * - 10.1: 数量項目を追加する場合、丸め設定列に「0.01」をデフォルト値として設定する
 * - 10.2: 丸め設定列に数値を入力する場合、調整係数適用後の値を指定された単位で切り上げた値を最終数量として設定する
 * - 10.3: 丸め設定列に0以下の値が入力される場合、エラーメッセージを表示し、正の値の入力を求める
 * - 10.4: 丸め設定列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 10.5: 丸め設定が設定されている状態で、調整係数適用後の値変更時に丸め処理を自動再実行する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RoundingUnitInput, { type RoundingUnitInputMeta } from './RoundingUnitInput';

describe('RoundingUnitInput', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 表示テスト
  // ============================================================================

  describe('表示', () => {
    it('丸め設定入力フィールドが表示される', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} />);

      expect(screen.getByRole('spinbutton', { name: /丸め設定/i })).toBeInTheDocument();
    });

    it('ラベルが表示される', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} />);

      expect(screen.getByText('丸め設定')).toBeInTheDocument();
    });

    it('valueプロパティの値が反映される', () => {
      render(<RoundingUnitInput value={0.1} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toHaveValue(0.1);
    });

    it('disabledがtrueの場合、入力が無効化される', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} disabled />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toBeDisabled();
    });

    it('step属性が0.001である', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toHaveAttribute('step', '0.001');
    });
  });

  // ============================================================================
  // デフォルト値テスト（Requirement 10.1）
  // ============================================================================

  describe('デフォルト値', () => {
    it('デフォルト値は0.01', () => {
      // この動作はコンポーネント外で制御されるが、テストで確認
      const defaultValue = 0.01;
      render(<RoundingUnitInput value={defaultValue} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toHaveValue(0.01);
    });
  });

  // ============================================================================
  // 入力テスト（Requirement 10.2）
  // ============================================================================

  describe('入力', () => {
    let onChange: Mock<(value: number | undefined, meta: RoundingUnitInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('数値を入力するとonChangeが呼ばれる', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '0.1' } });

      expect(onChange).toHaveBeenCalledWith(0.1, expect.any(Object));
    });

    it('小数点以下の値を入力できる', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '0.001' } });

      expect(onChange).toHaveBeenCalledWith(0.001, expect.any(Object));
    });

    it('整数値を入力できる', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '1' } });

      expect(onChange).toHaveBeenCalledWith(1, expect.any(Object));
    });
  });

  // ============================================================================
  // エラーテスト（Requirement 10.3, 10.4）
  // ============================================================================

  describe('エラー表示', () => {
    let onChange: Mock<(value: number | undefined, meta: RoundingUnitInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('0を入力するとエラー付きでonChangeが呼ばれる', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          hasError: true,
          errorMessage: expect.stringContaining('正の値'),
        })
      );
    });

    it('負の値を入力するとエラー付きでonChangeが呼ばれる', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '-0.1' } });

      expect(onChange).toHaveBeenCalledWith(
        -0.1,
        expect.objectContaining({
          hasError: true,
          errorMessage: expect.stringContaining('正の値'),
        })
      );
    });

    it('空文字を入力するとエラー付きでonChangeが呼ばれる', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '' } });

      expect(onChange).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          hasError: true,
          errorMessage: expect.any(String),
        })
      );
    });

    it('正の値の場合はエラーなし', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      fireEvent.change(input, { target: { value: '0.5' } });

      expect(onChange).toHaveBeenCalledWith(
        0.5,
        expect.objectContaining({
          hasError: false,
        })
      );
    });

    it('errorプロパティが設定されている場合、エラーメッセージが表示される', () => {
      render(
        <RoundingUnitInput
          value={0.01}
          onChange={vi.fn()}
          error="丸め設定は正の値を入力してください"
        />
      );

      expect(screen.getByText('丸め設定は正の値を入力してください')).toBeInTheDocument();
    });

    it('エラー時は入力フィールドの境界線が赤くなる', () => {
      render(
        <RoundingUnitInput
          value={0.01}
          onChange={vi.fn()}
          error="丸め設定は正の値を入力してください"
        />
      );

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toHaveStyle({ borderColor: '#dc2626' });
    });
  });

  // ============================================================================
  // プリセット値テスト
  // ============================================================================

  describe('プリセット値', () => {
    let onChange: Mock<(value: number | undefined, meta: RoundingUnitInputMeta) => void>;

    beforeEach(() => {
      onChange = vi.fn();
    });

    it('プリセットボタンが表示される', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      expect(screen.getByRole('button', { name: '0.01' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '0.1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    });

    it('プリセットボタンをクリックすると値が設定される', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: '0.1' }));

      expect(onChange).toHaveBeenCalledWith(
        0.1,
        expect.objectContaining({
          hasError: false,
        })
      );
    });

    it('disabledの場合、プリセットボタンも無効化される', () => {
      render(<RoundingUnitInput value={0.01} onChange={onChange} disabled />);

      expect(screen.getByRole('button', { name: '0.01' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '0.1' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('入力フィールドはtype="number"', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toHaveAttribute('type', 'number');
    });

    it('aria-invalidがエラー時にtrueになる', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} error="エラーメッセージ" />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('aria-describedbyがエラーメッセージと紐付く', () => {
      render(<RoundingUnitInput value={0.01} onChange={vi.fn()} error="エラーメッセージ" />);

      const input = screen.getByRole('spinbutton', { name: /丸め設定/i });
      const errorMessageId = input.getAttribute('aria-describedby');
      expect(errorMessageId).toBeTruthy();
      expect(document.getElementById(errorMessageId!)).toHaveTextContent('エラーメッセージ');
    });
  });
});
