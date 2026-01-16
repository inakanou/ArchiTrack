/**
 * @fileoverview useAutocomplete Hook テスト
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 *
 * Requirements:
 * - 7.1: 入力開始時の候補表示
 * - 7.2: DB保存済み値と未保存入力値の統合
 * - 7.3: 重複除去と50音順ソート
 * - 7.4: 候補選択時の自動入力
 * - 7.5: 2文字以上入力での候補表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutocomplete } from './useAutocomplete';
import { apiClient } from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockApiGet = vi.mocked(apiClient.get);

describe('useAutocomplete', () => {
  // テスト間で安定した参照を使用（OOM対策）
  // renderHook内で毎回新しい配列を作成すると、
  // useCallbackの依存配列が変化し続けてメモリリークを引き起こす
  const unsavedValuesWithDuplicate = ['建築工事', '建設仮設工事'];
  const unsavedValuesWithEmpty = ['', '建設工事'];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('基本動作', () => {
    it('初期状態では空の候補リストを返す', () => {
      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '',
        })
      );

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('入力値が空の場合はAPIを呼び出さない', async () => {
      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '',
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('入力値が1文字の場合でもAPIを呼び出す (Req 7.1)', async () => {
      mockApiGet.mockResolvedValue({ suggestions: ['建築工事'] });

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // URLSearchParamsが自動的にエンコードするため、部分一致で確認
      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/autocomplete/major-categories?q=')
      );
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('limit=10'));
      expect(result.current.suggestions).toContain('建築工事');
    });
  });

  describe('デバウンス動作', () => {
    it('デバウンス遅延中はAPIを呼び出さない', async () => {
      mockApiGet.mockResolvedValue({ suggestions: [] });

      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建築',
          debounceMs: 300,
        })
      );

      // デバウンス時間の半分だけ進める
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('デバウンス時間経過後にAPIを呼び出す', async () => {
      mockApiGet.mockResolvedValue({ suggestions: ['建築工事'] });

      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建築',
          debounceMs: 300,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockApiGet).toHaveBeenCalled();
    });
  });

  describe('候補のマージとソート (Req 7.2, 7.3)', () => {
    it('API結果とunsavedValuesをマージして重複を除去する', async () => {
      mockApiGet.mockResolvedValue({ suggestions: ['建築工事', '建設工事'] });

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          unsavedValues: unsavedValuesWithDuplicate,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.suggestions).toHaveLength(3);
      expect(result.current.suggestions).toContain('建築工事');
      expect(result.current.suggestions).toContain('建設工事');
      expect(result.current.suggestions).toContain('建設仮設工事');
    });

    it('50音順（日本語対応）でソートする', async () => {
      mockApiGet.mockResolvedValue({
        suggestions: ['コンクリート工事', '足場工事', '仮設工事'],
      });

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/work-types',
          inputValue: '工事',
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const suggestions = result.current.suggestions;
      // 50音順でソートされることを確認
      expect(suggestions).toEqual([...suggestions].sort((a, b) => a.localeCompare(b, 'ja')));
    });

    it('空文字列をフィルタリングする', async () => {
      mockApiGet.mockResolvedValue({ suggestions: ['建築工事', ''] });

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          unsavedValues: unsavedValuesWithEmpty,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.suggestions).not.toContain('');
    });
  });

  describe('フィルタリング', () => {
    it('入力値で前方一致フィルタリングする', async () => {
      mockApiGet.mockResolvedValue({
        suggestions: ['建築工事', '建設工事', '電気工事'],
      });

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.suggestions).toContain('建築工事');
      expect(result.current.suggestions).toContain('建設工事');
      expect(result.current.suggestions).not.toContain('電気工事');
    });

    it('大文字小文字を区別せずにフィルタリングする', async () => {
      mockApiGet.mockResolvedValue({
        suggestions: ['m2', 'M3', 'kg'],
      });

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/units',
          inputValue: 'm',
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.suggestions).toContain('m2');
      expect(result.current.suggestions).toContain('M3');
      expect(result.current.suggestions).not.toContain('kg');
    });
  });

  describe('追加パラメータ (Req 7.2, 7.3)', () => {
    // 安定した参照のadditionalParamsを使用
    const additionalParamsSingle = { majorCategory: '建築工事' };
    const additionalParamsMultiple = {
      majorCategory: '建築工事',
      middleCategory: '内装仕上工事',
    };

    it('majorCategoryパラメータをクエリに含める', async () => {
      mockApiGet.mockResolvedValue({ suggestions: ['内装仕上工事'] });

      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/middle-categories',
          inputValue: '内',
          additionalParams: additionalParamsSingle,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('majorCategory='));
    });

    it('複数の追加パラメータをクエリに含める', async () => {
      mockApiGet.mockResolvedValue({ suggestions: ['塗装工事'] });

      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/minor-categories',
          inputValue: '塗',
          additionalParams: additionalParamsMultiple,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const calls = mockApiGet.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const call = calls[0]?.[0] as string | undefined;
      expect(call).toBeDefined();
      expect(call).toContain('majorCategory=');
      expect(call).toContain('middleCategory=');
    });
  });

  describe('エラーハンドリング', () => {
    it('API呼び出し失敗時にエラー状態を設定する', async () => {
      const error = new Error('Network error');
      mockApiGet.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.suggestions).toEqual([]);
    });
  });

  describe('ローディング状態', () => {
    it('API呼び出し中にisLoadingがtrueになる', async () => {
      let resolvePromise: ((value: { suggestions: string[] }) => void) | undefined;
      mockApiGet.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );

      const { result } = renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
        })
      );

      // タイマーを進めてAPIコールを発火
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // ローディング中
      expect(result.current.isLoading).toBe(true);

      // レスポンスを返す
      await act(async () => {
        if (resolvePromise) {
          resolvePromise({ suggestions: ['建築工事'] });
        }
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('limit設定', () => {
    it('limitパラメータをクエリに含める', async () => {
      mockApiGet.mockResolvedValue({ suggestions: [] });

      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          limit: 20,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('limit=20'));
    });
  });

  describe('enabled制御', () => {
    it('enabled=falseの場合はAPIを呼び出さない', async () => {
      renderHook(() =>
        useAutocomplete({
          endpoint: '/api/autocomplete/major-categories',
          inputValue: '建',
          enabled: false,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockApiGet).not.toHaveBeenCalled();
    });
  });
});
