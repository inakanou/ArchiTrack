/**
 * @fileoverview テキストフィールド入力コンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 *
 * Task 12.1: テキストフィールド入力制御コンポーネントを実装する
 *
 * @module components/quantity-table/TextFieldInput.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextFieldInput from './TextFieldInput';

describe('TextFieldInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    fieldName: 'majorCategory' as const,
    label: '大項目',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本レンダリング', () => {
    it('ラベルが表示される', () => {
      render(<TextFieldInput {...defaultProps} />);
      expect(screen.getByLabelText('大項目')).toBeInTheDocument();
    });

    it('入力フィールドが表示される', () => {
      render(<TextFieldInput {...defaultProps} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('値が入力フィールドに反映される', () => {
      render(<TextFieldInput {...defaultProps} value="テスト" />);
      expect(screen.getByRole('textbox')).toHaveValue('テスト');
    });

    it('プレースホルダーが表示される', () => {
      render(<TextFieldInput {...defaultProps} placeholder="入力してください" />);
      expect(screen.getByPlaceholderText('入力してください')).toBeInTheDocument();
    });

    it('必須マークが表示される', () => {
      render(<TextFieldInput {...defaultProps} required />);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('無効化されたフィールドが表示される', () => {
      render(<TextFieldInput {...defaultProps} disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  describe('残り文字数表示', () => {
    it('空の場合、最大幅が表示される', () => {
      render(<TextFieldInput {...defaultProps} showCharacterCount />);
      expect(screen.getByText('残り50')).toBeInTheDocument();
    });

    it('半角10文字入力時、残り40が表示される', () => {
      render(<TextFieldInput {...defaultProps} value="aaaaaaaaaa" showCharacterCount />);
      expect(screen.getByText('残り40')).toBeInTheDocument();
    });

    it('全角10文字入力時、残り30が表示される', () => {
      render(<TextFieldInput {...defaultProps} value="あいうえおかきくけこ" showCharacterCount />);
      expect(screen.getByText('残り30')).toBeInTheDocument();
    });

    it('単位フィールドで空の場合、残り6が表示される', () => {
      render(<TextFieldInput {...defaultProps} fieldName="unit" label="単位" showCharacterCount />);
      expect(screen.getByText('残り6')).toBeInTheDocument();
    });

    it('最大幅に達した場合、残り0が表示される', () => {
      const value = 'a'.repeat(50);
      render(<TextFieldInput {...defaultProps} value={value} showCharacterCount />);
      expect(screen.getByText('残り0')).toBeInTheDocument();
    });

    it('最大幅を超えた場合、超過数が表示される', () => {
      const value = 'a'.repeat(52);
      render(<TextFieldInput {...defaultProps} value={value} showCharacterCount />);
      expect(screen.getByText('-2超過')).toBeInTheDocument();
    });

    it('showCharacterCount=falseの場合、残り文字数は表示されない', () => {
      render(<TextFieldInput {...defaultProps} value="test" />);
      expect(screen.queryByText(/残り/)).not.toBeInTheDocument();
    });
  });

  describe('入力制限', () => {
    it('最大幅を超えない入力は許可される', async () => {
      const onChange = vi.fn();
      render(<TextFieldInput {...defaultProps} onChange={onChange} value="" />);

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'テスト');

      // 各文字ごとにonChangeが呼ばれる
      expect(onChange).toHaveBeenCalled();
    });

    it('入力値が変更されるとonChangeが呼ばれる', async () => {
      const onChange = vi.fn();
      render(<TextFieldInput {...defaultProps} onChange={onChange} value="" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'abc' } });

      expect(onChange).toHaveBeenCalledWith('abc');
    });
  });

  describe('エラー表示', () => {
    it('errorプロパティがある場合、エラーメッセージが表示される', () => {
      render(
        <TextFieldInput
          {...defaultProps}
          error="大項目は全角25文字/半角50文字以内で入力してください"
        />
      );
      expect(
        screen.getByText('大項目は全角25文字/半角50文字以内で入力してください')
      ).toBeInTheDocument();
    });

    it('最大幅を超えた場合、入力フィールドにエラースタイルが適用される', () => {
      render(<TextFieldInput {...defaultProps} error="エラー" showCharacterCount />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('視覚的フィードバック', () => {
    it('残り幅が少ない場合（10以下）、警告色で表示される', () => {
      const value = 'a'.repeat(42); // 残り8
      render(<TextFieldInput {...defaultProps} value={value} showCharacterCount />);
      const counter = screen.getByText('残り8');
      expect(counter).toHaveStyle({ color: '#d97706' });
    });

    it('残り幅が0の場合、エラー色で表示される', () => {
      const value = 'a'.repeat(50); // 残り0
      render(<TextFieldInput {...defaultProps} value={value} showCharacterCount />);
      const counter = screen.getByText('残り0');
      expect(counter).toHaveStyle({ color: '#dc2626' });
    });

    it('超過した場合、エラー色で表示される', () => {
      const value = 'a'.repeat(52); // 超過
      render(<TextFieldInput {...defaultProps} value={value} showCharacterCount />);
      const counter = screen.getByText('-2超過');
      expect(counter).toHaveStyle({ color: '#dc2626' });
    });

    it('残り幅が十分な場合、通常色で表示される', () => {
      const value = 'a'.repeat(10); // 残り40
      render(<TextFieldInput {...defaultProps} value={value} showCharacterCount />);
      const counter = screen.getByText('残り40');
      expect(counter).toHaveStyle({ color: '#6b7280' });
    });
  });

  describe('アクセシビリティ', () => {
    it('ラベルとinputが関連付けられている', () => {
      render(<TextFieldInput {...defaultProps} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAccessibleName('大項目');
    });

    it('エラー時にaria-invalidがtrueになる', () => {
      render(<TextFieldInput {...defaultProps} error="エラー" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('エラー時にaria-describedbyでエラーメッセージと関連付けられる', () => {
      render(<TextFieldInput {...defaultProps} error="エラー" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby');
    });

    it('必須フィールドにaria-requiredが設定される', () => {
      render(<TextFieldInput {...defaultProps} required />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('フィールドタイプ別', () => {
    it('工種フィールドは最大幅16', () => {
      render(
        <TextFieldInput
          {...defaultProps}
          fieldName="workType"
          label="工種"
          value=""
          showCharacterCount
        />
      );
      expect(screen.getByText('残り16')).toBeInTheDocument();
    });

    it('単位フィールドは最大幅6', () => {
      render(
        <TextFieldInput
          {...defaultProps}
          fieldName="unit"
          label="単位"
          value=""
          showCharacterCount
        />
      );
      expect(screen.getByText('残り6')).toBeInTheDocument();
    });

    it('備考フィールドは最大幅50', () => {
      render(
        <TextFieldInput
          {...defaultProps}
          fieldName="remarks"
          label="備考"
          value=""
          showCharacterCount
        />
      );
      expect(screen.getByText('残り50')).toBeInTheDocument();
    });
  });
});
