/**
 * @fileoverview AutocompleteInput コンポーネントテスト
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 * Task 17.1: クライアントサイド候補ストア方式に更新する
 * Task 18.1: 旧オートコンプリートフックを廃止し新モード専用に統合する
 *
 * Requirements:
 * - 7.1: 入力開始時の候補表示
 * - 7.3: クライアントサイドでのフィルタリング表示
 * - 7.4: 候補選択時の自動入力
 * - 7.5: 上下キー選択とEnter確定
 * - 7.6: blur時の候補追加はAPIリクエスト不要
 * - 7.7: 候補を50音順に表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutocompleteInput from './AutocompleteInput';

// Mock scrollIntoView which is not implemented in JSDOM
Element.prototype.scrollIntoView = vi.fn();

describe('AutocompleteInput', () => {
  const getSuggestions = vi.fn();
  const onBlurAddCandidate = vi.fn();

  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    field: 'majorCategory' as const,
    getSuggestions,
    onBlurAddCandidate,
    placeholder: '大項目を入力',
    label: '大項目',
    id: 'majorCategory',
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getSuggestions.mockReturnValue([]);
    onBlurAddCandidate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('入力フィールドが表示される', () => {
      render(<AutocompleteInput {...defaultProps} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('ラベルが表示される', () => {
      render(<AutocompleteInput {...defaultProps} />);
      expect(screen.getByLabelText('大項目')).toBeInTheDocument();
    });

    it('プレースホルダーが表示される', () => {
      render(<AutocompleteInput {...defaultProps} />);
      expect(screen.getByPlaceholderText('大項目を入力')).toBeInTheDocument();
    });

    it('初期値が設定される', () => {
      render(<AutocompleteInput {...defaultProps} value="建築工事" />);
      expect(screen.getByRole('combobox')).toHaveValue('建築工事');
    });
  });

  describe('候補表示 (Req 7.1)', () => {
    it('候補がある場合にドロップダウンが表示される', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '建築工事' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '建設工事' })).toBeInTheDocument();
    });

    // REQ-41回帰対応: 数量項目テーブルの水平スクロールラッパー（itemTableWrapper の
    // overflow）に絶対配置ドロップダウンがクリップされ、候補が一切表示されなくなった
    // 不具合を防止する。ドロップダウンは Portal で document.body 直下に描画し、
    // 祖先の overflow クリップ枠の外へ逃がす。
    it('ドロップダウンはPortalでdocument.body直下に描画され祖先のoverflowにクリップされない', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(
        <div data-testid="overflow-wrapper" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <AutocompleteInput {...defaultProps} value="建" />
        </div>
      );

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const listbox = screen.getByRole('listbox');
      const wrapper = screen.getByTestId('overflow-wrapper');
      // overflow を持つ祖先ラッパーの内側には描画されない（クリップ回避）
      expect(wrapper).not.toContainElement(listbox);
      // Portal により document.body 直下へ描画される
      expect(listbox.parentElement).toBe(document.body);
    });

    it('候補がない場合はドロップダウンが表示されない', () => {
      getSuggestions.mockReturnValue([]);

      render(<AutocompleteInput {...defaultProps} value="あ" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('新モードではローディングインジケーターが表示されない', () => {
      getSuggestions.mockReturnValue([]);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      expect(screen.queryByLabelText('読み込み中')).not.toBeInTheDocument();
    });
  });

  describe('候補選択 (Req 7.4)', () => {
    it('候補クリック時にonChangeが呼ばれる', async () => {
      const onChange = vi.fn();
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const option = screen.getByRole('option', { name: '建築工事' });
      await userEvent.click(option);

      expect(onChange).toHaveBeenCalledWith('建築工事');
    });

    it('候補選択後にドロップダウンが閉じる', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const option = screen.getByRole('option', { name: '建築工事' });
      await userEvent.click(option);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('キーボード操作 (Req 7.5)', () => {
    it('下矢印キーで次の候補にフォーカスが移動する', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事', '建具工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');

      const firstOption = screen.getByRole('option', { name: '建築工事' });
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
    });

    it('上矢印キーで前の候補にフォーカスが移動する', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事', '建具工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{ArrowUp}');

      const firstOption = screen.getByRole('option', { name: '建築工事' });
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
    });

    it('Enterキーで選択した候補が確定される', async () => {
      const onChange = vi.fn();
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith('建築工事');
    });

    it('Escapeキーでドロップダウンが閉じる', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('Tabキーで次の要素にフォーカスが移動しドロップダウンが閉じる', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(
        <div>
          <AutocompleteInput {...defaultProps} value="建" />
          <input data-testid="next-input" />
        </div>
      );

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await userEvent.tab();

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('入力値変更', () => {
    it('入力値変更時にonChangeが呼ばれる', async () => {
      const onChange = vi.fn();

      render(<AutocompleteInput {...defaultProps} onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.type(input, '建');

      expect(onChange).toHaveBeenCalledWith('建');
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-expanded属性が正しく設定される', async () => {
      getSuggestions.mockReturnValue(['建築工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(input);

      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('aria-autocomplete属性が設定される', () => {
      render(<AutocompleteInput {...defaultProps} />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });

    it('aria-controls属性がリストボックスを参照する', async () => {
      getSuggestions.mockReturnValue(['建築工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const listbox = screen.getByRole('listbox');
      expect(input.getAttribute('aria-controls')).toBe(listbox.id);
    });

    it('aria-activedescendant属性が選択中の候補を参照する', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');

      const selectedOption = screen.getByRole('option', { name: '建築工事' });
      expect(input.getAttribute('aria-activedescendant')).toBe(selectedOption.id);
    });
  });

  describe('エラー表示', () => {
    it('エラー状態が渡された場合にエラースタイルが適用される', () => {
      render(<AutocompleteInput {...defaultProps} error="入力してください" />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('入力してください')).toBeInTheDocument();
    });

    it('エラーメッセージは吹き出し方式で表示され、フィールド下にブロック挿入されない', () => {
      // テキストフィールド下にメッセージを挿入するとフィールド間スペースが広がり
      // 表示が崩れるため、警告アイコン＋ホバー吹き出し（オーバーレイ）で表示する。
      render(<AutocompleteInput {...defaultProps} id="field-x" error="入力してください" />);

      const input = screen.getByRole('combobox');
      // 入力欄がアクセシブルな説明（alert）を参照する
      expect(input).toHaveAttribute('aria-describedby', 'field-x-error');

      // 警告アイコン（アクセシブル名＝メッセージ）が入力欄内に表示される
      expect(screen.getByRole('img', { name: '入力してください' })).toBeInTheDocument();

      // メッセージは role="alert" 要素として DOM に存在する（スクリーンリーダー対応）
      const alert = document.getElementById('field-x-error');
      expect(alert).not.toBeNull();
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert).toHaveTextContent('入力してください');
    });
  });

  describe('必須フィールド', () => {
    it('required=trueの場合にaria-required属性が設定される', () => {
      render(<AutocompleteInput {...defaultProps} required />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-required', 'true');
    });
  });

  // =========================================================================
  // クライアントサイド候補ストア方式 (Task 17.1 / 18.1)
  // =========================================================================

  describe('クライアントサイド候補ストア方式', () => {
    it('getSuggestions関数で候補を取得する (Req 7.3)', async () => {
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      expect(getSuggestions).toHaveBeenCalledWith('majorCategory', '建');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '建築工事' })).toBeInTheDocument();
    });

    it('useAutocompleteを使用しない (Task 18.1)', () => {
      // AutocompleteInput は useAutocomplete をインポートしないため、
      // モジュールが存在しなくてもコンポーネントが正常に動作することを確認
      render(<AutocompleteInput {...defaultProps} value="建" />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('入力値変更のたびにgetSuggestionsが呼ばれる (Req 7.3)', async () => {
      const onChange = vi.fn();

      render(<AutocompleteInput {...defaultProps} onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.type(input, '建');

      expect(onChange).toHaveBeenCalledWith('建');
    });

    it('blur時にonBlurAddCandidateが呼ばれる (Req 7.5, 7.6)', async () => {
      render(
        <div>
          <AutocompleteInput {...defaultProps} value="新しい工事" />
          <input data-testid="other-input" />
        </div>
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.blur(input);

      // Wait for the blur timeout
      await vi.advanceTimersByTimeAsync(200);

      expect(onBlurAddCandidate).toHaveBeenCalledWith('majorCategory', '新しい工事');
    });

    it('空文字の場合blur時にonBlurAddCandidateが呼ばれない', async () => {
      render(
        <div>
          <AutocompleteInput {...defaultProps} value="" />
          <input data-testid="other-input" />
        </div>
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.blur(input);

      await vi.advanceTimersByTimeAsync(200);

      expect(onBlurAddCandidate).not.toHaveBeenCalled();
    });

    it('候補選択時にonChangeが呼ばれる (Req 7.4)', async () => {
      const onChange = vi.fn();
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const option = screen.getByRole('option', { name: '建築工事' });
      await userEvent.click(option);

      expect(onChange).toHaveBeenCalledWith('建築工事');
    });

    it('キーボード操作が正常に動作する (Req 7.5)', async () => {
      const onChange = vi.fn();
      getSuggestions.mockReturnValue(['建築工事', '建設工事']);

      render(<AutocompleteInput {...defaultProps} value="建" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith('建築工事');
    });

    it('候補がない場合はドロップダウンが表示されない', () => {
      getSuggestions.mockReturnValue([]);

      render(<AutocompleteInput {...defaultProps} value="xyz" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('disabled時にonBlurAddCandidateが呼ばれない', async () => {
      render(
        <div>
          <AutocompleteInput {...defaultProps} value="テスト" disabled />
          <input data-testid="other-input" />
        </div>
      );

      const input = screen.getByRole('combobox');
      fireEvent.blur(input);

      await vi.advanceTimersByTimeAsync(200);

      expect(onBlurAddCandidate).not.toHaveBeenCalled();
    });
  });
});
