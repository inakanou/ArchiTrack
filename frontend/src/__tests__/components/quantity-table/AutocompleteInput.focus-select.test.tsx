/**
 * @fileoverview AutocompleteInputコンポーネントのフォーカス時全選択テスト
 *
 * Task 19.3: フォーカス時全選択の単体テストを実装する
 *
 * Requirements:
 * - 16.1: AutocompleteInputのフォーカス時にselectメソッドが呼ばれることを検証
 * - 16.12: AutocompleteInputのフォーカス時に全選択とドロップダウン表示が共存することを検証
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutocompleteInput from '../../../components/quantity-table/AutocompleteInput';

describe('AutocompleteInput - フォーカス時全選択', () => {
  const defaultProps = {
    value: 'テスト値',
    onChange: vi.fn(),
    field: 'majorCategory' as const,
    getSuggestions: vi.fn().mockReturnValue([]),
    onBlurAddCandidate: vi.fn(),
    label: '大項目',
    id: 'test-input',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('フォーカス時にinput要素のselectメソッドが呼ばれる', () => {
    render(<AutocompleteInput {...defaultProps} />);

    const input = screen.getByRole('combobox');

    // selectメソッドをスパイ
    const selectSpy = vi.spyOn(input as HTMLInputElement, 'select');

    fireEvent.focus(input);

    expect(selectSpy).toHaveBeenCalledTimes(1);

    selectSpy.mockRestore();
  });

  it('値が空の場合でもフォーカス時にselectメソッドが呼ばれる', () => {
    render(<AutocompleteInput {...defaultProps} value="" />);

    const input = screen.getByRole('combobox');
    const selectSpy = vi.spyOn(input as HTMLInputElement, 'select');

    fireEvent.focus(input);

    expect(selectSpy).toHaveBeenCalledTimes(1);

    selectSpy.mockRestore();
  });

  it('フォーカス時に全選択とドロップダウン表示が共存する', () => {
    const suggestions = ['候補1', '候補2', '候補3'];
    const getSuggestionsWithResults = vi.fn().mockReturnValue(suggestions);

    render(
      <AutocompleteInput
        {...defaultProps}
        value="候補"
        getSuggestions={getSuggestionsWithResults}
      />
    );

    const input = screen.getByRole('combobox');
    const selectSpy = vi.spyOn(input as HTMLInputElement, 'select');

    fireEvent.focus(input);

    // selectが呼ばれたことを確認
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // ドロップダウンが表示されていることを確認
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);

    selectSpy.mockRestore();
  });

  it('disabled状態でもフォーカス時にselectが試行される（入力無効フィールドでの安全性）', () => {
    render(<AutocompleteInput {...defaultProps} disabled />);

    const input = screen.getByRole('combobox');
    const selectSpy = vi.spyOn(input as HTMLInputElement, 'select');

    fireEvent.focus(input);

    // disabled状態でもselectは呼ばれる（ブラウザが適切にハンドルする）
    expect(selectSpy).toHaveBeenCalledTimes(1);

    selectSpy.mockRestore();
  });
});
