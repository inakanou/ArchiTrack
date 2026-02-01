/**
 * @fileoverview usePrefetchedAutocomplete Hook テスト
 *
 * プリフェッチデータからのクライアントサイドフィルタリング、
 * 階層依存フィルタ、unsavedValuesマージ、フォールバック動作を検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutocomplete } from './usePrefetchedAutocomplete';
import type { AutocompletePrefetchData } from '../contexts/AutocompletePrefetchContext';

// ============================================================================
// Mocks
// ============================================================================

// AutocompletePrefetchContext mock
const mockContextValue = {
  data: null as AutocompletePrefetchData | null,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../contexts/AutocompletePrefetchContext', () => ({
  useAutocompletePrefetch: vi.fn(() => mockContextValue),
}));

// useAutocomplete (original) mock - フォールバック用
vi.mock('./useAutocomplete', () => ({
  useAutocomplete: vi.fn(() => ({
    suggestions: ['フォールバック候補'],
    isLoading: false,
    error: null,
  })),
  generateSuggestions: vi.fn((apiValues: string[], unsavedValues: string[], inputText: string) => {
    const allValues = [...apiValues, ...unsavedValues];
    const uniqueValues = [...new Set(allValues)];
    const nonEmpty = uniqueValues.filter((v) => v.trim() !== '');
    const filtered = nonEmpty.filter((v) => v.toLowerCase().startsWith(inputText.toLowerCase()));
    return filtered.sort((a, b) => a.localeCompare(b, 'ja'));
  }),
}));

// ============================================================================
// テストデータ
// ============================================================================

const mockPrefetchData: AutocompletePrefetchData = {
  majorCategories: ['建築工事', '土木工事', '電気工事', '設備工事'],
  middleCategories: [
    { value: '躯体工事', majorCategory: '建築工事' },
    { value: '仕上工事', majorCategory: '建築工事' },
    { value: '道路工事', majorCategory: '土木工事' },
    { value: '橋梁工事', majorCategory: '土木工事' },
  ],
  minorCategories: [
    { value: '基礎工事', majorCategory: '建築工事', middleCategory: '躯体工事' },
    { value: '鉄骨工事', majorCategory: '建築工事', middleCategory: '躯体工事' },
    { value: '塗装工事', majorCategory: '建築工事', middleCategory: '仕上工事' },
    { value: '舗装工事', majorCategory: '土木工事', middleCategory: '道路工事' },
  ],
  workTypes: ['コンクリート', '鉄筋', '型枠', '足場'],
  units: ['m', 'm2', 'm3', 'kg', 't', '本'],
  specifications: ['18-8-25', '21-8-25', 'SD295A', 'SD345'],
};

// ============================================================================
// テスト
// ============================================================================

describe('usePrefetchedAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockContextValue.data = null;
    mockContextValue.isLoading = false;
    mockContextValue.error = null;
  });

  describe('プリフェッチデータからのフィルタリング', () => {
    beforeEach(() => {
      mockContextValue.data = mockPrefetchData;
    });

    it('大項目の候補をフィルタリングする', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      expect(result.current.suggestions).toEqual(['建築工事']);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('工種の候補をフィルタリングする', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/work-types',
          inputValue: 'コ',
        })
      );

      expect(result.current.suggestions).toEqual(['コンクリート']);
    });

    it('単位の候補をフィルタリングする', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/units',
          inputValue: 'm',
        })
      );

      expect(result.current.suggestions).toEqual(['m', 'm2', 'm3']);
    });

    it('規格の候補をフィルタリングする', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/specifications',
          inputValue: 'SD',
        })
      );

      expect(result.current.suggestions).toEqual(['SD295A', 'SD345']);
    });

    it('一致する候補がない場合は空配列を返す', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: 'zzz',
        })
      );

      expect(result.current.suggestions).toEqual([]);
    });

    it('入力値が空の場合は空配列を返す', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '',
        })
      );

      expect(result.current.suggestions).toEqual([]);
    });

    it('enabled=falseの場合は空配列を返す', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          enabled: false,
        })
      );

      expect(result.current.suggestions).toEqual([]);
    });
  });

  describe('階層依存フィルタリング', () => {
    beforeEach(() => {
      mockContextValue.data = mockPrefetchData;
    });

    it('中項目がmajorCategoryでフィルタされる', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/middle-categories',
          inputValue: '躯',
          additionalParams: { majorCategory: '建築工事' },
        })
      );

      expect(result.current.suggestions).toEqual(['躯体工事']);
    });

    it('中項目が別のmajorCategoryでフィルタされる', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/middle-categories',
          inputValue: '道',
          additionalParams: { majorCategory: '土木工事' },
        })
      );

      expect(result.current.suggestions).toEqual(['道路工事']);
    });

    it('小項目がmajorCategory + middleCategoryでフィルタされる', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/minor-categories',
          inputValue: '基',
          additionalParams: {
            majorCategory: '建築工事',
            middleCategory: '躯体工事',
          },
        })
      );

      expect(result.current.suggestions).toEqual(['基礎工事']);
    });

    it('小項目が異なる親カテゴリで正しくフィルタされる', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/minor-categories',
          inputValue: '舗',
          additionalParams: {
            majorCategory: '土木工事',
            middleCategory: '道路工事',
          },
        })
      );

      expect(result.current.suggestions).toEqual(['舗装工事']);
    });

    it('該当する親カテゴリがない場合は空配列を返す', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/middle-categories',
          inputValue: '躯',
          additionalParams: { majorCategory: '電気工事' },
        })
      );

      expect(result.current.suggestions).toEqual([]);
    });
  });

  describe('unsavedValuesとのマージ', () => {
    beforeEach(() => {
      mockContextValue.data = mockPrefetchData;
    });

    it('unsavedValuesとプリフェッチデータがマージされる', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          unsavedValues: ['建設仮設工事'],
        })
      );

      expect(result.current.suggestions).toContain('建築工事');
      expect(result.current.suggestions).toContain('建設仮設工事');
    });

    it('重複する値が除去される', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          unsavedValues: ['建築工事'],
        })
      );

      const count = result.current.suggestions.filter((s) => s === '建築工事').length;
      expect(count).toBe(1);
    });
  });

  describe('フォールバック動作', () => {
    it('Context外（data=null）の場合はフォールバックの結果を返す', () => {
      mockContextValue.data = null;

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      expect(result.current.suggestions).toEqual(['フォールバック候補']);
    });

    it('未知のエンドポイントの場合はフォールバックの結果を返す', () => {
      mockContextValue.data = mockPrefetchData;

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/unknown-endpoint',
          inputValue: '建',
        })
      );

      expect(result.current.suggestions).toEqual(['フォールバック候補']);
    });
  });

  describe('ローディング状態', () => {
    it('プリフェッチデータ読み込み中はisLoading=trueを返す', () => {
      mockContextValue.data = mockPrefetchData;
      mockContextValue.isLoading = true;

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('プリフェッチエラー時にerrorを返す', () => {
      mockContextValue.data = mockPrefetchData;
      mockContextValue.error = new Error('Prefetch failed');

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Prefetch failed');
    });
  });
});
