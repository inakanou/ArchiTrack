/**
 * @fileoverview 数量グループ遅延読み込み用Hook
 *
 * Task 10.2: パフォーマンス最適化 - 数量グループの遅延読み込み
 *
 * Requirements:
 * - 13.5: 初期表示は最初のNグループのみ読み込み
 * - 13.6: スクロール/展開時に追加グループを読み込み
 *
 * 大量のグループを持つ数量表を効率的に表示するために、
 * 必要に応じてグループを段階的に読み込みます。
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { QuantityGroupDetail } from '../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * useLazyLoadGroupsのオプション
 */
export interface UseLazyLoadGroupsOptions {
  /** 全グループの配列 */
  groups: QuantityGroupDetail[];
  /** 初期読み込みグループ数 */
  initialLoadCount?: number;
  /** 追加読み込み時のグループ数 */
  loadMoreCount?: number;
}

/**
 * useLazyLoadGroupsの戻り値
 */
export interface UseLazyLoadGroupsResult {
  /** 読み込み済みグループ */
  loadedGroups: QuantityGroupDetail[];
  /** 追加読み込み可能かどうか */
  hasMore: boolean;
  /** 読み込み中かどうか */
  isLoading: boolean;
  /** 追加グループを読み込む関数 */
  loadMore: () => void;
  /** 初期状態にリセットする関数 */
  reset: () => void;
  /** Intersection Observer用のref */
  observerRef: React.RefObject<HTMLDivElement>;
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * 数量グループ遅延読み込みHook
 *
 * 大量のグループを持つ数量表を効率的に表示するために、
 * 初期表示では最初のNグループのみを読み込み、
 * スクロールに応じて追加グループを読み込みます。
 *
 * @param options - 遅延読み込みのオプション
 * @returns 遅延読み込みの状態と操作関数
 *
 * @example
 * ```tsx
 * const { loadedGroups, hasMore, loadMore, observerRef } = useLazyLoadGroups({
 *   groups: allGroups,
 *   initialLoadCount: 5,
 *   loadMoreCount: 5,
 * });
 *
 * return (
 *   <div>
 *     {loadedGroups.map((group) => (
 *       <GroupCard key={group.id} group={group} />
 *     ))}
 *     {hasMore && <div ref={observerRef}>Loading...</div>}
 *   </div>
 * );
 * ```
 */
export function useLazyLoadGroups({
  groups,
  initialLoadCount = 5,
  loadMoreCount = 5,
}: UseLazyLoadGroupsOptions): UseLazyLoadGroupsResult {
  // 読み込み済みグループ数
  const [loadedCount, setLoadedCount] = useState(initialLoadCount);
  const [isLoading, setIsLoading] = useState(false);

  // Intersection Observer用のref
  const observerRef = useRef<HTMLDivElement>(null);

  // グループ配列が変更されたらリセット（React推奨パターン: render中の前回値比較）
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const groupsKey = useMemo(() => {
    return groups.map((g) => g.id).join(',');
  }, [groups]);

  const [prevGroupsKey, setPrevGroupsKey] = useState(groupsKey);
  if (groupsKey !== prevGroupsKey) {
    setPrevGroupsKey(groupsKey);
    setLoadedCount(initialLoadCount);
  }

  /**
   * 読み込み済みグループを計算
   */
  const loadedGroups = useMemo(() => {
    return groups.slice(0, Math.min(loadedCount, groups.length));
  }, [groups, loadedCount]);

  /**
   * 追加読み込み可能かどうか
   */
  const hasMore = useMemo(() => {
    return loadedCount < groups.length;
  }, [loadedCount, groups.length]);

  /**
   * 追加グループを読み込む
   */
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;

    setIsLoading(true);

    // 非同期でシミュレート（実際のAPI呼び出しがある場合はここで行う）
    setTimeout(() => {
      setLoadedCount((prev) => Math.min(prev + loadMoreCount, groups.length));
      setIsLoading(false);
    }, 0);
  }, [hasMore, isLoading, loadMoreCount, groups.length]);

  /**
   * 初期状態にリセット
   */
  const reset = useCallback(() => {
    setLoadedCount(initialLoadCount);
    setIsLoading(false);
  }, [initialLoadCount]);

  /**
   * Intersection Observerのセットアップ
   */
  useEffect(() => {
    const element = observerRef.current;
    if (!element || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, loadMore]);

  return {
    loadedGroups,
    hasMore,
    isLoading,
    loadMore,
    reset,
    observerRef: observerRef as React.RefObject<HTMLDivElement>,
  };
}

export default useLazyLoadGroups;
