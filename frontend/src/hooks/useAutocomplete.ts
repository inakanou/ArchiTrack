/**
 * @fileoverview オートコンプリート用Hook
 *
 * Task 7.1: オートコンプリート入力コンポーネントを実装する
 *
 * Requirements:
 * - 7.1: 入力開始時の候補表示
 * - 7.2: DB保存済み値と未保存入力値の統合
 * - 7.3: 重複除去と50音順ソート
 * - 7.5: 2文字以上入力での候補表示
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiClient } from '../api/client';

// ============================================================================
// 安定したデフォルト値（メモリリーク対策）
// ============================================================================
// 毎レンダーで新しい配列/オブジェクトを作成するとuseCallback/useEffectの
// 依存配列が変化し続け、無限ループやメモリリークを引き起こす
const EMPTY_ARRAY: string[] = [];
const EMPTY_PARAMS: Record<string, string> = {};

// ============================================================================
// 型定義
// ============================================================================

/**
 * useAutocomplete Hook オプション
 */
export interface UseAutocompleteOptions {
  /** APIエンドポイント */
  endpoint: string;
  /** 現在の入力値 */
  inputValue: string;
  /** 未保存の値リスト（画面上で入力された値） */
  unsavedValues?: string[];
  /** 追加のクエリパラメータ（majorCategory, middleCategory等） */
  additionalParams?: Record<string, string>;
  /** デバウンス遅延（ミリ秒）、デフォルト: 300ms */
  debounceMs?: number;
  /** 取得件数上限、デフォルト: 10 */
  limit?: number;
  /** フック有効化フラグ */
  enabled?: boolean;
}

/**
 * useAutocomplete Hook 戻り値
 */
export interface UseAutocompleteResult {
  /** オートコンプリート候補リスト */
  suggestions: string[];
  /** ローディング状態 */
  isLoading: boolean;
  /** エラー */
  error: Error | null;
}

/**
 * APIレスポンス型
 */
interface AutocompleteResponse {
  suggestions: string[];
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 候補リストを生成する
 *
 * 1. APIからの値とunsavedValuesをマージ
 * 2. 重複を除去
 * 3. 空文字をフィルタリング
 * 4. 入力値で前方一致フィルタリング
 * 5. 50音順（日本語対応）でソート
 *
 * Requirements: 7.2, 7.3
 */
export function generateSuggestions(
  apiValues: string[],
  unsavedValues: string[],
  inputText: string
): string[] {
  // 全候補を結合
  const allValues = [...apiValues, ...unsavedValues];

  // 重複除去（大文字小文字を区別）
  const uniqueValues = [...new Set(allValues)];

  // 空文字を除外
  const nonEmptyValues = uniqueValues.filter((v) => v.trim() !== '');

  // 入力テキストでフィルタリング（前方一致、大文字小文字を区別しない）
  const filtered = nonEmptyValues.filter((v) =>
    v.toLowerCase().startsWith(inputText.toLowerCase())
  );

  // 50音順（日本語対応）でソート
  return filtered.sort((a, b) => a.localeCompare(b, 'ja'));
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * オートコンプリート用Hook
 *
 * 入力値に基づいてAPIから候補を取得し、unsavedValuesとマージして
 * 重複除去・ソート済みの候補リストを返す。
 *
 * @param options - Hook オプション
 * @returns オートコンプリート結果
 *
 * @example
 * ```tsx
 * const { suggestions, isLoading, error } = useAutocomplete({
 *   endpoint: '/api/autocomplete/major-categories',
 *   inputValue: '建',
 *   unsavedValues: ['建築工事'],
 * });
 * ```
 */
export function useAutocomplete(options: UseAutocompleteOptions): UseAutocompleteResult {
  const {
    endpoint,
    inputValue,
    unsavedValues = EMPTY_ARRAY,
    additionalParams = EMPTY_PARAMS,
    debounceMs = 300,
    limit = 10,
    enabled = true,
  } = options;

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // APIから取得した値を保持
  const apiValuesRef = useRef<string[]>([]);
  // 最後に検索した入力値
  const lastInputRef = useRef<string>('');
  // デバウンスタイマーID
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新の値をrefで保持（useCallbackの依存配列を安定化するため）
  const unsavedValuesRef = useRef(unsavedValues);
  const additionalParamsRef = useRef(additionalParams);
  // 初回マウントフラグ（初回マウント時のAPIリクエスト抑制用）
  const isInitialMountRef = useRef(true);

  // refを最新の値で更新（レンダーごとに同期）
  unsavedValuesRef.current = unsavedValues;
  additionalParamsRef.current = additionalParams;

  /**
   * APIを呼び出して候補を取得
   * refを使用して依存配列を安定化し、不要な再生成を防ぐ
   */
  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!query || !enabled) {
        apiValuesRef.current = [];
        setSuggestions(generateSuggestions([], unsavedValuesRef.current, query));
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // クエリパラメータを構築
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('limit', String(limit));

        // 追加パラメータを付与（refから最新値を取得）
        Object.entries(additionalParamsRef.current).forEach(([key, value]) => {
          if (value) {
            params.append(key, value);
          }
        });

        const url = `${endpoint}?${params.toString()}`;
        const response = await apiClient.get<AutocompleteResponse>(url);

        apiValuesRef.current = response.suggestions || [];
        lastInputRef.current = query;

        // 候補リストを生成（refから最新値を取得）
        const mergedSuggestions = generateSuggestions(
          apiValuesRef.current,
          unsavedValuesRef.current,
          query
        );
        setSuggestions(mergedSuggestions);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint, limit, enabled]
  );

  /**
   * 入力値変更時にデバウンス付きでAPIを呼び出す
   *
   * 初回マウント時はAPIリクエストを発生させない。
   * これにより、保存済みデータを含む画面を開いた際に
   * 大量のAPIリクエストが同時発生することを防ぐ。
   */
  useEffect(() => {
    // 既存のタイマーをクリア
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // 初回マウント時はAPIリクエストを発生させない
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // 入力値が空の場合は即座にクリア
    if (!inputValue || !enabled) {
      apiValuesRef.current = [];
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    // デバウンス付きでAPIを呼び出す
    timerRef.current = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [inputValue, fetchSuggestions, debounceMs, enabled]);

  /**
   * unsavedValuesが変更された場合、現在の入力値で候補を再生成
   * JSON.stringifyで内容を比較し、参照の違いによる無限ループを防ぐ
   */
  const unsavedValuesKey = useMemo(() => JSON.stringify(unsavedValues), [unsavedValues]);

  useEffect(() => {
    if (inputValue && lastInputRef.current === inputValue) {
      const mergedSuggestions = generateSuggestions(
        apiValuesRef.current,
        unsavedValuesRef.current,
        inputValue
      );
      setSuggestions(mergedSuggestions);
    }
  }, [unsavedValuesKey, inputValue]);

  return {
    suggestions,
    isLoading,
    error,
  };
}
