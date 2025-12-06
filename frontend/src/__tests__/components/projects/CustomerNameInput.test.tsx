import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerNameInput from '../../../components/projects/CustomerNameInput';

describe('CustomerNameInput', () => {
  const mockOnChange = vi.fn();
  const mockOnBlur = vi.fn();

  beforeEach(() => {
    mockOnChange.mockReset();
    mockOnBlur.mockReset();
  });

  describe('基本表示', () => {
    it('テキスト入力フィールドが表示されること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('ラベルが表示されること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} />);

      const label = screen.getByText(/顧客名/i);
      expect(label).toBeInTheDocument();
    });

    it('プレースホルダーが表示されること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} placeholder="会社名を入力" />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      expect(input).toHaveAttribute('placeholder', '会社名を入力');
    });

    it('valueプロパティが正しく反映されること', () => {
      render(<CustomerNameInput value="テスト株式会社" onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      expect(input).toHaveValue('テスト株式会社');
    });
  });

  describe('入力操作', () => {
    it('テキスト入力時にonChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<CustomerNameInput value="" onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.type(input, 'ABC会社');

      // 各文字入力ごとにonChangeが呼ばれる
      expect(mockOnChange).toHaveBeenCalled();
      expect(mockOnChange).toHaveBeenCalledWith(expect.any(String));
    });

    it('フォーカスを外したときにonBlurが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<CustomerNameInput value="テスト" onChange={mockOnChange} onBlur={mockOnBlur} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      expect(mockOnBlur).toHaveBeenCalled();
    });
  });

  describe('バリデーション', () => {
    it('必須フィールドで空のときにエラーが表示されること', async () => {
      const user = userEvent.setup();
      render(<CustomerNameInput value="" onChange={mockOnChange} required />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/顧客名は必須です/i)).toBeInTheDocument();
      });
    });

    it('255文字を超える場合にエラーが表示されること', async () => {
      const user = userEvent.setup();
      const longText = 'あ'.repeat(256);

      // controlled componentなので、rerenderで値の変更をシミュレート
      const { rerender } = render(<CustomerNameInput value="" onChange={mockOnChange} />);

      // 長いテキストで再レンダリング
      rerender(<CustomerNameInput value={longText} onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      // blurでバリデーションがトリガーされる
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/顧客名は255文字以内で入力してください/i)).toBeInTheDocument();
      });
    });

    it('255文字以内の場合はエラーが表示されないこと', async () => {
      const user = userEvent.setup();
      const validText = 'あ'.repeat(255);
      render(<CustomerNameInput value={validText} onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      expect(screen.queryByText(/顧客名は255文字以内で入力してください/i)).not.toBeInTheDocument();
    });

    it('errorプロパティでカスタムエラーメッセージが表示されること', () => {
      render(
        <CustomerNameInput value="" onChange={mockOnChange} error="サーバーエラーが発生しました" />
      );

      expect(screen.getByText(/サーバーエラーが発生しました/i)).toBeInTheDocument();
    });

    it('有効な入力値の場合にエラーがクリアされること', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <CustomerNameInput value="" onChange={mockOnChange} required error="顧客名は必須です" />
      );

      // 値が入力される
      rerender(<CustomerNameInput value="テスト株式会社" onChange={mockOnChange} required />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(screen.queryByText(/顧客名は必須です/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-label属性が設定されていること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      expect(input).toHaveAccessibleName();
    });

    it('エラー時にaria-invalid属性がtrueになること', async () => {
      const user = userEvent.setup();
      render(<CustomerNameInput value="" onChange={mockOnChange} required />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('エラーメッセージがaria-describedbyで関連付けられること', async () => {
      const user = userEvent.setup();
      render(<CustomerNameInput value="" onChange={mockOnChange} required />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        const errorElement = screen.getByText(/顧客名は必須です/i);
        expect(input).toHaveAttribute('aria-describedby', errorElement.id);
      });
    });

    it('エラーメッセージがaria-liveで通知されること', async () => {
      const user = userEvent.setup();
      render(<CustomerNameInput value="" onChange={mockOnChange} required />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        const errorElement = screen.getByText(/顧客名は必須です/i);
        expect(errorElement).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('inputとlabelが正しく関連付けられていること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      const label = screen.getByText(/顧客名/i);

      expect(label).toHaveAttribute('for', input.id);
    });
  });

  describe('無効化状態', () => {
    it('disabled時に入力できないこと', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} disabled />);

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      expect(input).toBeDisabled();
    });
  });

  describe('カスタムラベル', () => {
    it('ラベルプロパティでカスタムラベルが設定できること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} label="取引先名" />);

      const input = screen.getByRole('textbox', { name: /取引先名/i });
      expect(input).toBeInTheDocument();
    });
  });

  describe('必須マーク表示', () => {
    it('required時に必須マークが表示されること', () => {
      render(<CustomerNameInput value="" onChange={mockOnChange} required />);

      // アスタリスクまたは「必須」テキストが表示される
      const requiredMark = screen.getByText(/\*/);
      expect(requiredMark).toBeInTheDocument();
    });
  });

  describe('将来拡張性', () => {
    it('onSuggestionSelect プロパティを受け入れること（将来のオートコンプリート用）', () => {
      const mockOnSuggestionSelect = vi.fn();
      // コンパイルエラーが発生しないことを確認
      render(
        <CustomerNameInput
          value=""
          onChange={mockOnChange}
          onSuggestionSelect={mockOnSuggestionSelect}
        />
      );

      const input = screen.getByRole('textbox', { name: /顧客名/i });
      expect(input).toBeInTheDocument();
    });
  });
});
