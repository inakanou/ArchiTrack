/**
 * @fileoverview オートコンプリート候補ストアのカスタムフック
 *
 * Task 16.1: オートコンプリート候補ストアのカスタムフックを実装する
 * Task 25.1: getSuggestionsで空入力時に全候補を返すよう修正
 *
 * Requirements:
 * - 7.1: 初回表示時に候補値を一括取得
 * - 7.2: APIリクエストは初回表示時の1回のみ
 * - 7.3: クライアントサイドでのフィルタリング表示（フォーカス時に全候補表示）
 * - 7.3a: 空フィールドへのフォーカス時に全候補をドロップダウン表示
 * - 7.5: blur時にクライアントサイドで候補追加
 * - 7.6: blur時の候補追加はAPIリクエスト不要
 * - 7.7: 候補を50音順に表示
 *
 * @module hooks/useAutocompleteCandidateStore
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '../api/client';

// ============================================================================
// 型定義
// ============================================================================

/**
 * オートコンプリート対象フィールド名
 */
export type AutocompleteFieldName =
  | 'majorCategory'
  | 'middleCategory'
  | 'minorCategory'
  | 'customCategory'
  | 'workType'
  | 'name'
  | 'specification'
  | 'unit'
  | 'remarks';

/**
 * オートコンプリート候補一括取得レスポンス
 */
interface AutocompleteCandidatesResponse {
  candidates: Record<AutocompleteFieldName, string[]>;
}

/**
 * useAutocompleteCandidateStoreのオプション
 */
export interface UseAutocompleteCandidateStoreOptions {
  /** プロジェクトID */
  projectId: string;
}

/**
 * useAutocompleteCandidateStoreの戻り値
 */
export interface UseAutocompleteCandidateStoreResult {
  /** 候補の読み込み状態 */
  isLoading: boolean;
  /** 読み込みエラー */
  error: Error | null;

  /**
   * 指定フィールドの候補を入力値でフィルタリングして返す
   * @param field 対象フィールド名
   * @param inputText 入力中のテキスト
   * @returns フィルタリング済み候補リスト（50音順）
   */
  getSuggestions: (field: AutocompleteFieldName, inputText: string) => string[];

  /**
   * blur時に確定値をフィールドの候補リストに追加する
   * 既に存在する値の場合は重複追加しない。APIリクエストは発行しない。
   * @param field 対象フィールド名
   * @param value 確定された入力値
   */
  addCandidateOnBlur: (field: AutocompleteFieldName, value: string) => void;
}

// ============================================================================
// 初期値
// ============================================================================

/**
 * 空の候補マップ
 */
function createEmptyCandidates(): Record<AutocompleteFieldName, string[]> {
  return {
    majorCategory: [],
    middleCategory: [],
    minorCategory: [],
    customCategory: [],
    workType: [],
    name: [],
    specification: [],
    unit: [],
    remarks: [],
  };
}

// ============================================================================
// フィルタリングロジック
// ============================================================================

/**
 * クライアントサイドでの候補フィルタリング
 *
 * 1. 空文字を除外
 * 2. 入力テキストが空またはホワイトスペースのみの場合は全候補を返す
 * 3. 入力テキストがある場合は前方一致で候補を抽出
 * 4. 完全一致する入力値自体は候補から除外（入力中の値を重複表示しない）
 * 5. 50音順（locale: 'ja'）でソート
 */
function filterCandidates(candidates: string[], inputText: string): string[] {
  const trimmedInput = (inputText ?? '').trim();

  let filtered = candidates.filter((v) => v.trim() !== '');

  if (trimmedInput) {
    filtered = filtered.filter((v) => v.toLowerCase().startsWith(trimmedInput.toLowerCase()));
  }

  filtered = filtered.filter((v) => v !== inputText);

  return filtered.sort((a, b) => a.localeCompare(b, 'ja'));
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * オートコンプリート候補ストアのカスタムフック
 *
 * 初回マウント時にAPIから候補を一括取得し、以降はクライアントサイドで管理する。
 * テキスト入力時のフィルタリングとblur時の候補追加はすべてクライアントサイドで実行。
 *
 * @param options - フックオプション
 * @returns オートコンプリート候補ストアの操作インターフェース
 */
export function useAutocompleteCandidateStore(
  options: UseAutocompleteCandidateStoreOptions
): UseAutocompleteCandidateStoreResult {
  const { projectId } = options;

  const [candidates, setCandidates] =
    useState<Record<AutocompleteFieldName, string[]>>(createEmptyCandidates);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Prevent double-fetch on strict mode
  const fetchedRef = useRef(false);

  /**
   * 初回マウント時にAPIから候補値を一括取得
   * projectIdが空の場合はフェッチをスキップし、有効なIDが渡された時点でフェッチする
   */
  useEffect(() => {
    if (!projectId) return; // projectIdが空の場合はフェッチしない（fetchedRefも設定しない）
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;

    async function fetchCandidates() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await apiClient.get<AutocompleteCandidatesResponse>(
          `/api/projects/${projectId}/quantity-items/autocomplete-candidates`
        );

        if (!cancelled) {
          setCandidates(response.candidates);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchCandidates();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /**
   * 指定フィールドの候補を入力値でフィルタリングして返す
   *
   * useMemoではなくuseCallbackで関数を返し、呼び出し元でフィルタリングを実行。
   * これにより、candidatesの変更時に全フィールドの再計算を避ける。
   */
  const getSuggestions = useCallback(
    (field: AutocompleteFieldName, inputText: string): string[] => {
      const fieldCandidates = candidates[field] || [];
      return filterCandidates(fieldCandidates, inputText);
    },
    [candidates]
  );

  /**
   * blur時に確定値をフィールドの候補リストに追加する
   * APIリクエストは一切発行しない（クライアントサイドのみの操作）
   */
  const addCandidateOnBlur = useCallback((field: AutocompleteFieldName, value: string): void => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    setCandidates((prev) => {
      const fieldCandidates = prev[field];
      // 既に存在する値の場合は重複追加しない
      if (fieldCandidates.includes(trimmedValue)) return prev;

      return {
        ...prev,
        [field]: [...fieldCandidates, trimmedValue],
      };
    });
  }, []);

  return useMemo(
    () => ({
      isLoading,
      error,
      getSuggestions,
      addCandidateOnBlur,
    }),
    [isLoading, error, getSuggestions, addCandidateOnBlur]
  );
}
