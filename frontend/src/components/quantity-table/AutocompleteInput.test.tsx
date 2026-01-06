/**
 * @fileoverview AutocompleteInput コンポーネントテスト
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 *
 * Requirements:
 * - 7.1: 入力開始時の候補表示
 * - 7.4: 候補選択時の自動入力
 * - 7.5: 上下キー選択とEnter確定
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutocompleteInput from './AutocompleteInput';

// Mock useAutocomplete hook
vi.mock('../../hooks/useAutocomplete', () => ({
  useAutocomplete: vi.fn(() => ({
    suggestions: [],
    isLoading: false,
    error: null,
  })),
}));

import { useAutocomplete } from '../../hooks/useAutocomplete';

const mockUseAutocomplete = vi.mocked(useAutocomplete);

// Mock scrollIntoView which is not implemented in JSDOM
Element.prototype.scrollIntoView = vi.fn();

describe('AutocompleteInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    endpoint: '/api/autocomplete/major-categories',
    placeholder: '大項目を入力',
    label: '大項目',
    id: 'majorCategory',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockUseAutocomplete.mockReturnValue({
      suggestions: [],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '建築工事' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '建設工事' })).toBeInTheDocument();
    });

    it('候補がない場合はドロップダウンが表示されない', () => {
      mockUseAutocomplete.mockReturnValue({
        suggestions: [],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="あ" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('ローディング中にインジケーターが表示される', () => {
      mockUseAutocomplete.mockReturnValue({
        suggestions: [],
        isLoading: true,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      expect(screen.getByLabelText('読み込み中')).toBeInTheDocument();
    });
  });

  describe('候補選択 (Req 7.4)', () => {
    it('候補クリック時にonChangeが呼ばれる', async () => {
      const onChange = vi.fn();
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const option = screen.getByRole('option', { name: '建築工事' });
      await userEvent.click(option);

      expect(onChange).toHaveBeenCalledWith('建築工事');
    });

    it('候補選択後にドロップダウンが閉じる', async () => {
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

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
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事', '建具工事'],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');

      const firstOption = screen.getByRole('option', { name: '建築工事' });
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
    });

    it('上矢印キーで前の候補にフォーカスが移動する', async () => {
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事', '建具工事'],
        isLoading: false,
        error: null,
      });

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
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" onChange={onChange} />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith('建築工事');
    });

    it('Escapeキーでドロップダウンが閉じる', async () => {
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

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
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

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
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事'],
        isLoading: false,
        error: null,
      });

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
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事'],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      const listbox = screen.getByRole('listbox');
      expect(input.getAttribute('aria-controls')).toBe(listbox.id);
    });

    it('aria-activedescendant属性が選択中の候補を参照する', async () => {
      mockUseAutocomplete.mockReturnValue({
        suggestions: ['建築工事', '建設工事'],
        isLoading: false,
        error: null,
      });

      render(<AutocompleteInput {...defaultProps} value="建" />);

      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');

      const selectedOption = screen.getByRole('option', { name: '建築工事' });
      expect(input.getAttribute('aria-activedescendant')).toBe(selectedOption.id);
    });
  });

  describe('unsavedValues prop', () => {
    it('unsavedValuesがuseAutocompleteに渡される', () => {
      const unsavedValues = ['建築工事', '建設仮設工事'];

      render(<AutocompleteInput {...defaultProps} value="建" unsavedValues={unsavedValues} />);

      expect(mockUseAutocomplete).toHaveBeenCalledWith(
        expect.objectContaining({
          unsavedValues,
        })
      );
    });
  });

  describe('エラー表示', () => {
    it('エラー状態が渡された場合にエラースタイルが適用される', () => {
      render(<AutocompleteInput {...defaultProps} error="入力してください" />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('入力してください')).toBeInTheDocument();
    });
  });

  describe('必須フィールド', () => {
    it('required=trueの場合にaria-required属性が設定される', () => {
      render(<AutocompleteInput {...defaultProps} required />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-required', 'true');
    });
  });
});
