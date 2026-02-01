/**
 * @fileoverview プリフェッチ対応オートコンプリートHook
 *
 * AutocompletePrefetchContextからプリフェッチ済みデータを取得し、
 * クライアントサイドでフィルタリングする。
 * Context外で使用された場合は、既存のuseAutocompleteと同じ
 * API呼び出しロジックにフォールバックする。
 */

import { useMemo } from 'react';
import {
  useAutocompletePrefetch,
  type AutocompletePrefetchData,
} from '../contexts/AutocompletePrefetchContext';
import {
  useAutocomplete as useAutocompleteOriginal,
  generateSuggestions,
  type UseAutocompleteOptions,
  type UseAutocompleteResult,
} from './useAutocomplete';

// ============================================================================
// エンドポイント→フィールドマッピング
// ============================================================================

type FieldType =
  | 'majorCategories'
  | 'middleCategories'
  | 'minorCategories'
  | 'workTypes'
  | 'units'
  | 'specifications';

const ENDPOINT_FIELD_MAP: Record<string, FieldType> = {
  '/api/autocomplete/major-categories': 'majorCategories',
  '/api/autocomplete/middle-categories': 'middleCategories',
  '/api/autocomplete/minor-categories': 'minorCategories',
  '/api/autocomplete/work-types': 'workTypes',
  '/api/autocomplete/units': 'units',
  '/api/autocomplete/specifications': 'specifications',
};

// ============================================================================
// 安定したデフォルト値
// ============================================================================

const EMPTY_ARRAY: string[] = [];
const EMPTY_PARAMS: Record<string, string> = {};

// ============================================================================
// プリフェッチデータからの候補抽出
// ============================================================================

/**
 * プリフェッチデータからフィールドに対応する候補値を抽出する。
 * 依存フィールド（中項目・小項目）はadditionalParamsで親カテゴリフィルタを適用する。
 */
function extractValuesFromPrefetchData(
  data: AutocompletePrefetchData,
  fieldType: FieldType,
  additionalParams: Record<string, string>
): string[] {
  switch (fieldType) {
    case 'majorCategories':
      return data.majorCategories;

    case 'middleCategories': {
      const majorCategory = additionalParams.majorCategory;
      if (!majorCategory) {
        return data.middleCategories.map((item) => item.value);
      }
      return data.middleCategories
        .filter((item) => item.majorCategory === majorCategory)
        .map((item) => item.value);
    }

    case 'minorCategories': {
      const major = additionalParams.majorCategory;
      const middle = additionalParams.middleCategory;
      let filtered = data.minorCategories;
      if (major) {
        filtered = filtered.filter((item) => item.majorCategory === major);
      }
      if (middle) {
        filtered = filtered.filter((item) => item.middleCategory === middle);
      }
      return filtered.map((item) => item.value);
    }

    case 'workTypes':
      return data.workTypes;

    case 'units':
      return data.units;

    case 'specifications':
      return data.specifications;

    default:
      return [];
  }
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * プリフェッチ対応オートコンプリートHook
 *
 * AutocompletePrefetchProviderの配下では、プリフェッチ済みデータから
 * クライアントサイドでフィルタリングする（APIリクエスト不要）。
 * Provider外で使用された場合は、従来のAPI呼び出し方式にフォールバック。
 *
 * @param options - useAutocompleteと同じオプション
 * @returns useAutocompleteと同じ戻り値
 */
export function useAutocomplete(options: UseAutocompleteOptions): UseAutocompleteResult {
  const {
    endpoint,
    inputValue,
    unsavedValues = EMPTY_ARRAY,
    additionalParams = EMPTY_PARAMS,
    enabled = true,
  } = options;

  const prefetchContext = useAutocompletePrefetch();
  const hasPrefetchData = prefetchContext?.data !== null && prefetchContext?.data !== undefined;

  // フォールバック: Context外の場合は従来のAPI呼び出し方式
  const fallbackResult = useAutocompleteOriginal({
    ...options,
    enabled: enabled && !hasPrefetchData,
  });

  // プリフェッチデータからのクライアントサイドフィルタリング
  const fieldType = ENDPOINT_FIELD_MAP[endpoint];

  const prefetchedSuggestions = useMemo(() => {
    if (!hasPrefetchData || !fieldType || !inputValue || !enabled) {
      return [];
    }

    const prefetchValues = extractValuesFromPrefetchData(
      prefetchContext!.data!,
      fieldType,
      additionalParams
    );

    return generateSuggestions(prefetchValues, unsavedValues, inputValue);
  }, [
    hasPrefetchData,
    fieldType,
    inputValue,
    enabled,
    prefetchContext,
    additionalParams,
    unsavedValues,
  ]);

  // プリフェッチデータがある場合はクライアントサイド結果を返す
  if (hasPrefetchData && fieldType) {
    return {
      suggestions: prefetchedSuggestions,
      isLoading: prefetchContext!.isLoading,
      error: prefetchContext!.error,
    };
  }

  // フォールバック
  return fallbackResult;
}
