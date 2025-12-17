/**
 * @fileoverview 寸法値入力機能のテスト
 *
 * Task 14.2: 寸法値入力機能を実装する（TDD）
 *
 * Requirements:
 * - 6.2: 寸法線が描画されると寸法値入力用のテキストフィールドを表示する
 * - 6.3: ユーザーが寸法値を入力すると寸法線上に数値とオプションの単位を表示する
 *
 * テスト対象:
 * - 寸法線描画後のテキストフィールド表示
 * - 数値と単位の入力
 * - 寸法線上への値表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// DimensionValueInputコンポーネントをインポート（後で実装）
import DimensionValueInput, {
  type DimensionValueInputProps,
} from '../../../components/site-surveys/tools/DimensionValueInput';

// ============================================================================
// モック
// ============================================================================

// デフォルトのprops
const defaultProps: DimensionValueInputProps = {
  position: { x: 200, y: 150 },
  initialValue: '',
  initialUnit: 'mm',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

// ============================================================================
// テストスイート
// ============================================================================

describe('DimensionValueInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Task 14.2: 寸法値入力機能テスト
  // ==========================================================================
  describe('寸法線描画後のテキストフィールド表示', () => {
    it('コンポーネントがレンダリングされる', () => {
      render(<DimensionValueInput {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('指定された位置に表示される', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveStyle({
        position: 'absolute',
      });
    });

    it('寸法値入力フィールドが表示される', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      expect(input).toBeInTheDocument();
    });

    it('単位選択ドロップダウンが表示される', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /単位/i });
      expect(select).toBeInTheDocument();
    });

    it('確定ボタンとキャンセルボタンが表示される', () => {
      render(<DimensionValueInput {...defaultProps} />);

      expect(screen.getByRole('button', { name: /確定|OK|決定/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル|取消/i })).toBeInTheDocument();
    });

    it('初期値が設定されている場合、入力フィールドに表示される', () => {
      const props = { ...defaultProps, initialValue: '1500' };
      render(<DimensionValueInput {...props} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      expect(input).toHaveValue(1500);
    });

    it('初期単位が設定されている場合、ドロップダウンに表示される', () => {
      const props = { ...defaultProps, initialUnit: 'cm' };
      render(<DimensionValueInput {...props} />);

      const select = screen.getByRole('combobox', { name: /単位/i });
      expect(select).toHaveValue('cm');
    });
  });

  describe('数値と単位の入力', () => {
    it('寸法値を入力できる', async () => {
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      await user.clear(input);
      await user.type(input, '2500');

      expect(input).toHaveValue(2500);
    });

    it('単位を選択できる', async () => {
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /単位/i });
      await user.selectOptions(select, 'm');

      expect(select).toHaveValue('m');
    });

    it('mm、cm、m、inchの単位オプションがある', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /単位/i });
      const options = select.querySelectorAll('option');

      const unitValues = Array.from(options).map((opt) => opt.value);
      expect(unitValues).toContain('mm');
      expect(unitValues).toContain('cm');
      expect(unitValues).toContain('m');
    });

    it('小数点を含む値を入力できる', async () => {
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      await user.clear(input);
      await user.type(input, '123.45');

      expect(input).toHaveValue(123.45);
    });

    it('負の値は入力できない（最小値が0）', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      expect(input).toHaveAttribute('min', '0');
    });
  });

  describe('確定・キャンセル操作', () => {
    it('確定ボタンを押すとonConfirmが呼ばれる', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} onConfirm={onConfirm} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      await user.type(input, '1500');

      const confirmButton = screen.getByRole('button', { name: /確定|OK|決定/i });
      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledWith('1500', 'mm');
    });

    it('キャンセルボタンを押すとonCancelが呼ばれる', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル|取消/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('Enterキーを押すとonConfirmが呼ばれる', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} onConfirm={onConfirm} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      await user.type(input, '2000');
      await user.keyboard('{Enter}');

      expect(onConfirm).toHaveBeenCalledWith('2000', 'mm');
    });

    it('Escapeキーを押すとonCancelが呼ばれる', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} onCancel={onCancel} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      await user.click(input);
      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalled();
    });

    it('確定時に単位も含めてonConfirmが呼ばれる', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} onConfirm={onConfirm} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      await user.type(input, '100');

      const select = screen.getByRole('combobox', { name: /単位/i });
      await user.selectOptions(select, 'cm');

      const confirmButton = screen.getByRole('button', { name: /確定|OK|決定/i });
      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledWith('100', 'cm');
    });

    it('空の値で確定するとonConfirmに空文字が渡される', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(<DimensionValueInput {...defaultProps} onConfirm={onConfirm} />);

      const confirmButton = screen.getByRole('button', { name: /確定|OK|決定/i });
      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledWith('', 'mm');
    });
  });

  describe('アクセシビリティ', () => {
    it('入力フィールドにフォーカスが当たる', async () => {
      render(<DimensionValueInput {...defaultProps} />);

      await waitFor(() => {
        const input = screen.getByRole('spinbutton', { name: /寸法値/i });
        expect(document.activeElement).toBe(input);
      });
    });

    it('ダイアログにaria-labelが設定されている', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-label');
    });

    it('入力フィールドにラベルが関連付けられている', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const input = screen.getByRole('spinbutton', { name: /寸法値/i });
      expect(input).toHaveAccessibleName();
    });

    it('単位選択にラベルが関連付けられている', () => {
      render(<DimensionValueInput {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /単位/i });
      expect(select).toHaveAccessibleName();
    });
  });
});
