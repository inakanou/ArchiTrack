/**
 * @fileoverview 計算用数値フィールド入力コンポーネントのテスト
 *
 * Task 12.3: 寸法・ピッチフィールドの条件付き書式を実装する
 *
 * Requirements:
 * - 14.3: 寸法・ピッチフィールドは数値入力時のみ小数2桁で表示し、空白時は表示しない
 * - 14.4: 寸法・ピッチフィールドの入力フォーカス時は編集可能な形式で表示し、フォーカスアウト時は書式適用表示に切り替える
 *
 * @module components/quantity-table/CalculationNumericInput.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalculationNumericInput from './CalculationNumericInput';

describe('CalculationNumericInput', () => {
  describe('表示書式（REQ-14.3）', () => {
    it('数値入力時は小数2桁で表示する（例: 1.5 → "1.50"）', () => {
      render(<CalculationNumericInput value={1.5} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1.50');
    });

    it('整数入力時も小数2桁で表示する（例: 10 → "10.00"）', () => {
      render(<CalculationNumericInput value={10} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('10.00');
    });

    it('undefinedの場合は空白を表示する', () => {
      render(<CalculationNumericInput value={undefined} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('');
    });

    it('0の場合は "0.00" と表示する', () => {
      render(<CalculationNumericInput value={0} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('0.00');
    });
  });

  describe('フォーカス時の動作（REQ-14.4）', () => {
    it('フォーカス時は編集可能な形式で表示する', async () => {
      const user = userEvent.setup();

      render(<CalculationNumericInput value={1.5} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      // フォーカス中は編集可能
      expect(input).toHaveValue('1.50');
    });

    it('空白状態でフォーカスすると空のまま表示される', async () => {
      const user = userEvent.setup();

      render(<CalculationNumericInput value={undefined} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      expect(input).toHaveValue('');
    });

    it('フォーカスアウト時に小数2桁表示に変換される', async () => {
      const user = userEvent.setup();
      let currentValue: number | undefined = undefined;
      const handleChange = vi.fn((value: number | undefined) => {
        currentValue = value;
      });

      const { rerender } = render(
        <CalculationNumericInput value={currentValue} onChange={handleChange} label="幅（W）" />
      );

      const input = screen.getByRole('textbox');
      await user.type(input, '2');
      fireEvent.blur(input);

      // onChangeが呼ばれ、親が再レンダリングするシナリオをシミュレート
      rerender(
        <CalculationNumericInput value={currentValue} onChange={handleChange} label="幅（W）" />
      );

      expect(input).toHaveValue('2.00');
    });

    it('フォーカスアウト時に空白のままにすると空白表示', async () => {
      const user = userEvent.setup();
      let currentValue: number | undefined = 1;
      const handleChange = vi.fn((value: number | undefined) => {
        currentValue = value;
      });

      const { rerender } = render(
        <CalculationNumericInput value={currentValue} onChange={handleChange} label="幅（W）" />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      fireEvent.blur(input);

      // onChangeが呼ばれ、親が再レンダリングするシナリオをシミュレート
      rerender(
        <CalculationNumericInput value={currentValue} onChange={handleChange} label="幅（W）" />
      );

      expect(input).toHaveValue('');
    });
  });

  describe('入力処理', () => {
    it('有効な数値を入力するとonChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<CalculationNumericInput value={undefined} onChange={handleChange} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      await user.type(input, '5.5');
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(5.5);
    });

    it('空白を入力するとonChangeがundefinedで呼ばれる', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<CalculationNumericInput value={1} onChange={handleChange} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      await user.clear(input);
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(undefined);
    });

    it('数値以外の入力はundefinedとして扱われる', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<CalculationNumericInput value={undefined} onChange={handleChange} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'abc');
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(undefined);
    });
  });

  describe('右寄せ表示', () => {
    it('入力フィールドが右寄せで表示される', () => {
      render(<CalculationNumericInput value={1} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ textAlign: 'right' });
    });
  });

  describe('無効化状態', () => {
    it('disabledがtrueの場合に入力が無効化される', () => {
      render(<CalculationNumericInput value={1} onChange={() => {}} label="幅（W）" disabled />);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });
  });

  describe('必須フィールド', () => {
    it('requiredがtrueの場合にマークが表示される', () => {
      render(<CalculationNumericInput value={1} onChange={() => {}} label="範囲長" required />);

      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('requiredがfalseの場合にマークが表示されない', () => {
      render(
        <CalculationNumericInput value={1} onChange={() => {}} label="幅（W）" required={false} />
      );

      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('ラベルと入力フィールドが関連付けられている', () => {
      render(<CalculationNumericInput value={1} onChange={() => {}} label="幅（W）" />);

      const input = screen.getByLabelText('幅（W）');
      expect(input).toBeInTheDocument();
    });

    it('必須フィールドにaria-requiredがtrueになる', () => {
      render(<CalculationNumericInput value={1} onChange={() => {}} label="範囲長" required />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-required', 'true');
    });
  });
});
