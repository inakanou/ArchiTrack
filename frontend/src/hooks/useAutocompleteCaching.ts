/**
 * @fileoverview オートコンプリート候補キャッシュ用Hook
 *
 * Task 10.2: パフォーマンス最適化 - オートコンプリート候補のキャッシュ
 *
 * Requirements:
 * - 13.7: API呼び出し結果をキャッシュ
 * - 13.8: 同一クエリでの再リクエストを防止
 * - 13.9: キャッシュの有効期限管理
 *
 * オートコンプリート候補のAPI呼び出し結果をキャッシュし、
 * 同一クエリでの不必要なリクエストを防止します。
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * キャッシュエントリ
 */
interface CacheEntry {
  /** キャッシュされた候補 */
  suggestions: string[];
  /** キャッシュ作成時刻 */
  timestamp: number;
}

/**
 * useAutocompleteCachingのオプション
 */
export interface UseAutocompleteCachingOptions {
  /** APIエンドポイント */
  endpoint: string;
  /** 検索クエリ */
  query: string;
  /** 追加のクエリパラメータ */
  additionalParams?: Record<string, string>;
  /** キャッシュ有効期限（ミリ秒）、デフォルト: 5分 */
  cacheTimeMs?: number;
  /** デバウンス遅延（ミリ秒）、デフォルト: 300ms */
  debounceMs?: number;
  /** 取得件数上限、デフォルト: 10 */
  limit?: number;
}

/**
 * useAutocompleteCachingの戻り値
 */
export interface UseAutocompleteCachingResult {
  /** オートコンプリート候補 */
  suggestions: string[];
  /** ローディング状態 */
  isLoading: boolean;
  /** エラー */
  error: Error | null;
  /** キャッシュ有効期限（参照用） */
  cacheTimeMs: number;
}

/**
 * APIレスポンス型
 */
interface AutocompleteResponse {
  suggestions: string[];
}

// ============================================================================
// キャッシュ管理
// ============================================================================

// グローバルキャッシュ
const cache = new Map<string, CacheEntry>();

/**
 * キャッシュキーを生成
 */
function getCacheKey(
  endpoint: string,
  query: string,
  additionalParams?: Record<string, string>
): string {
  const paramsString = additionalParams
    ? Object.entries(additionalParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
    : '';
  return `${endpoint}|${query}|${paramsString}`;
}

/**
 * キャッシュからエントリを取得
 */
function getFromCache(key: string, maxAge: number): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > maxAge) {
    cache.delete(key);
    return null;
  }

  return entry;
}

/**
 * キャッシュにエントリを保存
 */
function setInCache(key: string, suggestions: string[]): void {
  cache.set(key, {
    suggestions,
    timestamp: Date.now(),
  });
}

/**
 * キャッシュを全てクリア
 */
export function clearAutocompleteCache(): void {
  cache.clear();
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * オートコンプリート候補キャッシュHook
 *
 * API呼び出し結果をキャッシュし、同一クエリでの再リクエストを防止します。
 * キャッシュには有効期限があり、期限切れの場合は再取得します。
 *
 * @param options - Hook オプション
 * @returns オートコンプリート結果
 *
 * @example
 * ```tsx
 * const { suggestions, isLoading, error } = useAutocompleteCaching({
 *   endpoint: '/api/autocomplete/major-categories',
 *   query: '建築',
 *   cacheTimeMs: 300000, // 5分
 * });
 * ```
 */
export function useAutocompleteCaching(
  options: UseAutocompleteCachingOptions
): UseAutocompleteCachingResult {
  const {
    endpoint,
    query,
    additionalParams = {},
    cacheTimeMs = 300000, // 5分
    debounceMs = 300,
    limit = 10,
  } = options;

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // デバウンスタイマー
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最後のクエリ
  const lastQueryRef = useRef<string>('');

  /**
   * APIを呼び出して候補を取得
   */
  const fetchSuggestions = useCallback(
    async (searchQuery: string) => {
      const cacheKey = getCacheKey(endpoint, searchQuery, additionalParams);

      // キャッシュをチェック
      const cachedEntry = getFromCache(cacheKey, cacheTimeMs);
      if (cachedEntry) {
        setSuggestions(cachedEntry.suggestions);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // クエリパラメータを構築
        const params = new URLSearchParams();
        params.append('q', searchQuery);
        params.append('limit', String(limit));

        Object.entries(additionalParams).forEach(([key, value]) => {
          if (value) {
            params.append(key, value);
          }
        });

        const url = `${endpoint}?${params.toString()}`;
        const response = await apiClient.get<AutocompleteResponse>(url);

        const fetchedSuggestions = response.suggestions || [];

        // キャッシュに保存
        setInCache(cacheKey, fetchedSuggestions);

        setSuggestions(fetchedSuggestions);
        lastQueryRef.current = searchQuery;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint, additionalParams, cacheTimeMs, limit]
  );

  /**
   * クエリ変更時の処理
   */
  useEffect(() => {
    // 既存のタイマーをクリア
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // 空のクエリは即座にクリア
    if (!query) {
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // キャッシュをチェック（デバウンス前に）
    const cacheKey = getCacheKey(endpoint, query, additionalParams);
    const cachedEntry = getFromCache(cacheKey, cacheTimeMs);
    if (cachedEntry) {
      setSuggestions(cachedEntry.suggestions);
      setIsLoading(false);
      return;
    }

    // デバウンス付きでAPIを呼び出す
    timerRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query, endpoint, additionalParams, cacheTimeMs, debounceMs, fetchSuggestions]);

  return {
    suggestions,
    isLoading,
    error,
    cacheTimeMs,
  };
}

export default useAutocompleteCaching;
