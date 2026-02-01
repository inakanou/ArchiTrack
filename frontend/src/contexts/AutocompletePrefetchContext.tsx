/**
 * @fileoverview オートコンプリート候補プリフェッチContext
 *
 * 画面ロード時に1回だけ全候補を取得し、以降はクライアントサイドで
 * フィルタリングするためのデータを保持する。
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

export interface MiddleCategorySuggestion {
  value: string;
  majorCategory: string;
}

export interface MinorCategorySuggestion {
  value: string;
  majorCategory: string;
  middleCategory: string;
}

export interface AutocompletePrefetchData {
  majorCategories: string[];
  middleCategories: MiddleCategorySuggestion[];
  minorCategories: MinorCategorySuggestion[];
  workTypes: string[];
  units: string[];
  specifications: string[];
}

export interface AutocompletePrefetchContextValue {
  /** プリフェッチ済みデータ（ロード前はnull） */
  data: AutocompletePrefetchData | null;
  /** ロード中フラグ */
  isLoading: boolean;
  /** エラー */
  error: Error | null;
}

// ============================================================================
// Context
// ============================================================================

const AutocompletePrefetchContext = createContext<AutocompletePrefetchContextValue | null>(null);

/**
 * プリフェッチContextの値を取得する
 * Context外で呼ばれた場合はnullを返す（フォールバック用）
 */
export function useAutocompletePrefetch(): AutocompletePrefetchContextValue | null {
  return useContext(AutocompletePrefetchContext);
}

// ============================================================================
// Provider
// ============================================================================

interface AutocompletePrefetchProviderProps {
  children: React.ReactNode;
}

/**
 * オートコンプリート候補プリフェッチProvider
 *
 * マウント時に/api/autocomplete/all-suggestionsを1回だけ呼び出し、
 * 全フィールドの候補データをContext経由で配信する。
 */
export function AutocompletePrefetchProvider({ children }: AutocompletePrefetchProviderProps) {
  const [data, setData] = useState<AutocompletePrefetchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchedRef = useRef(false);

  const fetchAllSuggestions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.get<AutocompletePrefetchData>(
        '/api/autocomplete/all-suggestions'
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to prefetch suggestions'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAllSuggestions();
  }, [fetchAllSuggestions]);

  return (
    <AutocompletePrefetchContext.Provider value={{ data, isLoading, error }}>
      {children}
    </AutocompletePrefetchContext.Provider>
  );
}
