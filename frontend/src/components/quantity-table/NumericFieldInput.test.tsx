/**
 * @fileoverview 数値フィールド入力コンポーネントのテスト
 *
 * Task 12.2: 数値フィールド表示書式コンポーネントを実装する
 *
 * Requirements:
 * - 14.1: 調整係数・丸め設定・数量フィールドを右寄せで表示する
 * - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常時表示する
 * - 14.5: 全ての数値フィールドを右寄せで表示する
 *
 * @module components/quantity-table/NumericFieldInput.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumericFieldInput from './NumericFieldInput';

describe('NumericFieldInput', () => {
  describe('表示書式（REQ-14.2）', () => {
    it('整数値を小数2桁で表示する（例: 1 → "1.00"）', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1.00');
    });

    it('小数1桁の値を小数2桁で表示する（例: 1.5 → "1.50"）', () => {
      render(
        <NumericFieldInput
          value={1.5}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1.50');
    });

    it('小数2桁の値をそのまま表示する（例: 1.25 → "1.25"）', () => {
      render(
        <NumericFieldInput
          value={1.25}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1.25');
    });

    it('0を "0.00" と表示する', () => {
      render(<NumericFieldInput value={0} onChange={() => {}} fieldType="quantity" label="数量" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('0.00');
    });

    it('負の値も小数2桁で表示する（例: -1.5 → "-1.50"）', () => {
      render(
        <NumericFieldInput
          value={-1.5}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('-1.50');
    });
  });

  describe('右寄せ表示（REQ-14.1, REQ-14.5）', () => {
    it('入力フィールドが右寄せで表示される', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ textAlign: 'right' });
    });

    it('調整係数フィールドが右寄せで表示される', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ textAlign: 'right' });
    });

    it('丸め設定フィールドが右寄せで表示される', () => {
      render(
        <NumericFieldInput
          value={0.01}
          onChange={() => {}}
          fieldType="roundingUnit"
          label="丸め設定"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ textAlign: 'right' });
    });

    it('数量フィールドが右寄せで表示される', () => {
      render(
        <NumericFieldInput value={100} onChange={() => {}} fieldType="quantity" label="数量" />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ textAlign: 'right' });
    });
  });

  describe('入力処理', () => {
    it('有効な数値を入力するとonChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <NumericFieldInput
          value={1}
          onChange={handleChange}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '2.5');
      // blur時に値が確定
      fireEvent.blur(input);

      expect(handleChange).toHaveBeenCalledWith(2.5, expect.any(Object));
    });

    it('空白入力時にデフォルト値が適用される（調整係数）', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <NumericFieldInput
          value={1}
          onChange={handleChange}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      fireEvent.blur(input);

      // デフォルト値1.00が設定される
      expect(handleChange).toHaveBeenCalledWith(1.0, expect.objectContaining({ hasError: false }));
    });

    it('空白入力時にデフォルト値が適用される（丸め設定）', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <NumericFieldInput
          value={0.01}
          onChange={handleChange}
          fieldType="roundingUnit"
          label="丸め設定"
        />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      fireEvent.blur(input);

      // デフォルト値0.01が設定される
      expect(handleChange).toHaveBeenCalledWith(0.01, expect.objectContaining({ hasError: false }));
    });

    it('空白入力時にデフォルト値が適用される（数量）', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <NumericFieldInput value={100} onChange={handleChange} fieldType="quantity" label="数量" />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      fireEvent.blur(input);

      // デフォルト値0が設定される
      expect(handleChange).toHaveBeenCalledWith(0, expect.objectContaining({ hasError: false }));
    });

    it('数値以外の入力は受け付けない', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <NumericFieldInput
          value={1}
          onChange={handleChange}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'abc');
      fireEvent.blur(input);

      // デフォルト値が設定される（無効な入力は空白として扱われる）
      expect(handleChange).toHaveBeenCalledWith(1.0, expect.objectContaining({ hasError: false }));
    });
  });

  describe('フォーカス時の動作', () => {
    it('フォーカス時は入力値をそのまま表示する', async () => {
      const user = userEvent.setup();

      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      await user.click(input);

      // フォーカス中は編集しやすいように表示
      expect(input).toHaveValue('1.00');
    });

    it('フォーカスアウト時に小数2桁表示に戻る', async () => {
      const user = userEvent.setup();
      let currentValue = 1;
      const handleChange = vi.fn((value: number) => {
        currentValue = value;
      });

      const { rerender } = render(
        <NumericFieldInput
          value={currentValue}
          onChange={handleChange}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '2');
      fireEvent.blur(input);

      // onChangeが呼ばれ、親が再レンダリングするシナリオをシミュレート
      rerender(
        <NumericFieldInput
          value={currentValue}
          onChange={handleChange}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      // blur後は小数2桁表示
      expect(input).toHaveValue('2.00');
    });
  });

  describe('フィールドタイプ別デフォルト値', () => {
    it('調整係数のデフォルト値は1.00', () => {
      render(
        <NumericFieldInput
          value={undefined}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1.00');
    });

    it('丸め設定のデフォルト値は0.01', () => {
      render(
        <NumericFieldInput
          value={undefined}
          onChange={() => {}}
          fieldType="roundingUnit"
          label="丸め設定"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('0.01');
    });

    it('数量のデフォルト値は0.00', () => {
      render(
        <NumericFieldInput
          value={undefined}
          onChange={() => {}}
          fieldType="quantity"
          label="数量"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('0.00');
    });
  });

  describe('エラー表示', () => {
    it('エラーがある場合にエラーメッセージを表示する', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
          error="調整係数は-9.99〜9.99の範囲で入力してください"
        />
      );

      expect(screen.getByText('調整係数は-9.99〜9.99の範囲で入力してください')).toBeInTheDocument();
    });

    it('エラーがある場合に入力フィールドが赤枠になる', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
          error="エラー"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveStyle({ borderColor: '#dc2626' });
    });
  });

  describe('無効化状態', () => {
    it('disabledがtrueの場合に入力が無効化される', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
          disabled
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('ラベルと入力フィールドが関連付けられている', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
        />
      );

      const input = screen.getByLabelText('調整係数');
      expect(input).toBeInTheDocument();
    });

    it('エラー時にaria-invalidがtrueになる', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
          error="エラー"
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('必須フィールドにaria-requiredがtrueになる', () => {
      render(
        <NumericFieldInput
          value={1}
          onChange={() => {}}
          fieldType="adjustmentFactor"
          label="調整係数"
          required
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-required', 'true');
    });
  });
});
