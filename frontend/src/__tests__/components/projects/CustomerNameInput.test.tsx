import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerNameInput from '../../../components/projects/CustomerNameInput';

// モック: trading-partners API
vi.mock('../../../api/trading-partners', () => ({
  searchTradingPartnersForAutocomplete: vi.fn(),
}));

import { searchTradingPartnersForAutocomplete } from '../../../api/trading-partners';

// モックAPIレスポンス用のテストデータ
const mockTradingPartners = [
  { id: '1', name: '株式会社テスト', nameKana: 'カブシキガイシャテスト', types: ['CUSTOMER'] },
  { id: '2', name: 'テスト商事', nameKana: 'テストショウジ', types: ['CUSTOMER'] },
  {
    id: '3',
    name: 'テック株式会社',
    nameKana: 'テックカブシキガイシャ',
    types: ['CUSTOMER', 'SUBCONTRACTOR'],
  },
];

describe('CustomerNameInput', () => {
  const mockOnChange = vi.fn();
  const mockOnBlur = vi.fn();
  const mockSearchApi = searchTradingPartnersForAutocomplete as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnChange.mockReset();
    mockOnBlur.mockReset();
    mockSearchApi.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  describe('オートコンプリート機能', () => {
    // enableAutocomplete=true の場合は combobox ロールになる
    const getAutocompleteInput = () => screen.getByRole('combobox', { name: /顧客名/i });

    describe('候補の表示', () => {
      it('入力文字に基づいて取引先候補を非同期取得して表示すること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        // 値の変更をシミュレート
        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        // デバウンス待ち（300ms）
        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(mockSearchApi).toHaveBeenCalledWith('テスト', 10);
        });

        await waitFor(() => {
          expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
          expect(screen.getByText('テスト商事')).toBeInTheDocument();
        });
      });

      it('オートコンプリート候補が最大10件まで表示されること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const manyPartners = Array.from({ length: 15 }, (_, i) => ({
          id: String(i + 1),
          name: `取引先${i + 1}`,
          nameKana: `トリヒキサキ${i + 1}`,
          types: ['CUSTOMER'],
        }));
        mockSearchApi.mockResolvedValue(manyPartners.slice(0, 10));

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, '取引先');

        rerender(<CustomerNameInput value="取引先" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(mockSearchApi).toHaveBeenCalledWith('取引先', 10);
        });
      });

      it('候補がない場合に「該当する取引先がありません」メッセージが表示されること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue([]);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, '存在しない');

        rerender(
          <CustomerNameInput value="存在しない" onChange={mockOnChange} enableAutocomplete />
        );

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('該当する取引先がありません')).toBeInTheDocument();
        });
      });
    });

    describe('ローディング状態', () => {
      it('取引先候補を検索中にローディングインジケータが表示されること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        // 遅延を持たせたPromiseを返す
        mockSearchApi.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(mockTradingPartners), 100))
        );

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByRole('status')).toBeInTheDocument();
        });

        await act(async () => {
          vi.advanceTimersByTime(100);
        });
      });
    });

    describe('キーボード操作', () => {
      it('上下キーで候補を選択できること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
        });

        // 下キーで次の候補を選択
        await user.keyboard('{ArrowDown}');
        await waitFor(() => {
          const options = screen.getAllByRole('option');
          expect(options[0]).toHaveAttribute('aria-selected', 'true');
        });

        // もう一度下キー
        await user.keyboard('{ArrowDown}');
        await waitFor(() => {
          const options = screen.getAllByRole('option');
          expect(options[1]).toHaveAttribute('aria-selected', 'true');
        });

        // 上キーで戻る
        await user.keyboard('{ArrowUp}');
        await waitFor(() => {
          const options = screen.getAllByRole('option');
          expect(options[0]).toHaveAttribute('aria-selected', 'true');
        });
      });

      it('Enterキーで選択した候補を確定できること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
        });

        // 下キーで候補を選択
        await user.keyboard('{ArrowDown}');

        // Enterで確定
        await user.keyboard('{Enter}');

        await waitFor(() => {
          expect(mockOnChange).toHaveBeenCalledWith('株式会社テスト');
        });

        // 候補リストが閉じること
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      it('Escapeキーで候補リストを閉じられること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
        });

        // Escapeで候補リストを閉じる
        await user.keyboard('{Escape}');

        await waitFor(() => {
          expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        });
      });
    });

    describe('マウス操作', () => {
      it('候補をマウスクリックで選択できること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('テスト商事')).toBeInTheDocument();
        });

        // 候補をクリック
        await user.click(screen.getByText('テスト商事'));

        await waitFor(() => {
          expect(mockOnChange).toHaveBeenCalledWith('テスト商事');
        });

        // 候補リストが閉じること
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      it('候補リスト外をクリックすると候補リストが閉じること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <div>
            <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
            <button type="button">外部ボタン</button>
          </div>
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(
          <div>
            <CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />
            <button type="button">外部ボタン</button>
          </div>
        );

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
        });

        // 外部をクリック
        await user.click(screen.getByText('外部ボタン'));

        await waitFor(() => {
          expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        });
      });
    });

    describe('デバウンス処理', () => {
      it('300ミリ秒のデバウンス後にAPIが呼び出されること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テ');

        rerender(<CustomerNameInput value="テ" onChange={mockOnChange} enableAutocomplete />);

        // 100ms経過時点ではAPIは呼ばれない
        await act(async () => {
          vi.advanceTimersByTime(100);
        });
        expect(mockSearchApi).not.toHaveBeenCalled();

        // さらに文字を入力
        await user.type(input, 'ス');
        rerender(<CustomerNameInput value="テス" onChange={mockOnChange} enableAutocomplete />);

        // 200ms経過時点（最初の入力から計算するとまだ300ms経っていない）
        await act(async () => {
          vi.advanceTimersByTime(200);
        });
        expect(mockSearchApi).not.toHaveBeenCalled();

        // 最後の入力から300ms経過
        await act(async () => {
          vi.advanceTimersByTime(100);
        });

        await waitFor(() => {
          expect(mockSearchApi).toHaveBeenCalledWith('テス', 10);
        });
      });
    });

    describe('フリー入力との両立', () => {
      it('取引先候補を選択せずに任意の顧客名を直接入力できること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue([]);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, '新規顧客');

        rerender(<CustomerNameInput value="新規顧客" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        // 候補がなくても入力値は保持される
        expect(mockOnChange).toHaveBeenCalled();
        expect(input).toHaveValue('新規顧客');
      });
    });

    describe('enableAutocomplete フラグ', () => {
      it('enableAutocomplete=falseの場合はオートコンプリートが無効であること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete={false} />
        );

        const input = screen.getByRole('textbox', { name: /顧客名/i });
        await user.type(input, 'テスト');

        rerender(
          <CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete={false} />
        );

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        // APIは呼ばれない
        expect(mockSearchApi).not.toHaveBeenCalled();

        // 候補リストは表示されない
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      it('enableAutocomplete未指定の場合はオートコンプリートが無効であること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(<CustomerNameInput value="" onChange={mockOnChange} />);

        const input = screen.getByRole('textbox', { name: /顧客名/i });
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        // APIは呼ばれない
        expect(mockSearchApi).not.toHaveBeenCalled();
      });
    });

    describe('アクセシビリティ', () => {
      it('オートコンプリートリストがlistbox roleを持つこと', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          const listbox = screen.getByRole('listbox');
          expect(listbox).toBeInTheDocument();
        });
      });

      it('各候補がoption roleを持つこと', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          const options = screen.getAllByRole('option');
          expect(options).toHaveLength(mockTradingPartners.length);
        });
      });

      it('入力フィールドにaria-autocomplete属性が設定されること', async () => {
        render(<CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />);

        const input = getAutocompleteInput();
        expect(input).toHaveAttribute('aria-autocomplete', 'list');
      });

      it('選択中の候補がaria-selectedで示されること', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockResolvedValue(mockTradingPartners);

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
        });

        // 下キーで選択
        await user.keyboard('{ArrowDown}');

        await waitFor(() => {
          const options = screen.getAllByRole('option');
          expect(options[0]).toHaveAttribute('aria-selected', 'true');
          expect(options[1]).toHaveAttribute('aria-selected', 'false');
        });
      });
    });

    describe('エラーハンドリング', () => {
      it('API呼び出しエラー時に候補リストが表示されないこと', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        mockSearchApi.mockRejectedValue(new Error('Network error'));

        const { rerender } = render(
          <CustomerNameInput value="" onChange={mockOnChange} enableAutocomplete />
        );

        const input = getAutocompleteInput();
        await user.type(input, 'テスト');

        rerender(<CustomerNameInput value="テスト" onChange={mockOnChange} enableAutocomplete />);

        await act(async () => {
          vi.advanceTimersByTime(300);
        });

        await waitFor(() => {
          expect(mockSearchApi).toHaveBeenCalled();
        });

        // エラー時は候補リストが表示されない（入力は可能）
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(input).toHaveValue('テスト');
      });
    });
  });
});
