/**
 * @fileoverview 仮想スクロール用Hook
 *
 * Task 10.2: パフォーマンス最適化 - 大量項目での仮想スクロール実装
 *
 * Requirements:
 * - 13.1: 500項目超でのパフォーマンス最適化
 * - 13.2: スムーズなスクロール体験の維持
 *
 * 大量のアイテムを効率的にレンダリングするために、
 * 表示領域内のアイテムのみをDOMに追加する仮想スクロールを提供します。
 */

import { useState, useMemo, useCallback } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 仮想スクロール用のアイテムインターフェース
 */
export interface VirtualizedItem<T> {
  /** 元のアイテムデータ */
  data: T;
  /** 元の配列でのインデックス */
  index: number;
  /** アイテムのスタイル情報 */
  style: {
    /** アイテムの高さ */
    height: number;
    /** 上端からの位置 */
    top: number;
    /** 位置指定方法 */
    position: 'absolute';
    /** 幅 */
    width: string;
  };
}

/**
 * useVirtualizedListのオプション
 */
export interface UseVirtualizedListOptions<T> {
  /** アイテムの配列 */
  items: T[];
  /** コンテナの高さ（px） */
  containerHeight: number;
  /** 各アイテムの高さ（px） */
  itemHeight: number;
  /** 表示領域外に追加でレンダリングするアイテム数（上下それぞれ） */
  overscan?: number;
}

/**
 * useVirtualizedListの戻り値
 */
export interface UseVirtualizedListResult<T> {
  /** 表示対象のアイテム（スタイル情報付き） */
  visibleItems: VirtualizedItem<T>[];
  /** 全体の高さ（px） */
  totalHeight: number;
  /** 現在のスクロール位置 */
  scrollOffset: number;
  /** 表示アイテムの上部オフセット位置 */
  offsetTop: number;
  /** スクロールハンドラ */
  onScroll: (scrollTop: number) => void;
}

// ============================================================================
// Hook実装
// ============================================================================

/**
 * 仮想スクロール用Hook
 *
 * 大量のアイテムを効率的にレンダリングするために、
 * 表示領域内のアイテムのみを計算して返します。
 *
 * @param options - 仮想スクロールのオプション
 * @returns 仮想スクロールの状態と操作関数
 *
 * @example
 * ```tsx
 * const { visibleItems, totalHeight, onScroll } = useVirtualizedList({
 *   items: data,
 *   containerHeight: 400,
 *   itemHeight: 50,
 *   overscan: 5,
 * });
 *
 * return (
 *   <div
 *     style={{ height: containerHeight, overflow: 'auto' }}
 *     onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
 *   >
 *     <div style={{ height: totalHeight, position: 'relative' }}>
 *       {visibleItems.map((item) => (
 *         <div key={item.index} style={item.style}>
 *           {item.data.name}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualizedList<T>({
  items,
  containerHeight,
  itemHeight,
  overscan = 3,
}: UseVirtualizedListOptions<T>): UseVirtualizedListResult<T> {
  const [scrollOffset, setScrollOffset] = useState(0);

  /**
   * 全体の高さを計算
   */
  const totalHeight = useMemo(() => {
    return items.length * itemHeight;
  }, [items.length, itemHeight]);

  /**
   * 表示範囲のアイテムを計算
   */
  const { visibleItems, offsetTop } = useMemo(() => {
    if (items.length === 0) {
      return { visibleItems: [], offsetTop: 0 };
    }

    // 表示領域内に収まるアイテム数
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    // スクロール位置に基づく開始インデックス
    const startIndex = Math.max(0, Math.floor(scrollOffset / itemHeight) - overscan);

    // 終了インデックス（オーバースキャンを含む）
    const endIndex = Math.min(
      items.length,
      Math.floor(scrollOffset / itemHeight) + visibleCount + overscan
    );

    // 表示アイテムの上部オフセット
    const offset = startIndex * itemHeight;

    // 表示対象のアイテムを生成
    const visible: VirtualizedItem<T>[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      if (item !== undefined) {
        visible.push({
          data: item,
          index: i,
          style: {
            height: itemHeight,
            top: i * itemHeight,
            position: 'absolute',
            width: '100%',
          },
        });
      }
    }

    return { visibleItems: visible, offsetTop: offset };
  }, [items, containerHeight, itemHeight, scrollOffset, overscan]);

  /**
   * スクロールハンドラ
   */
  const onScroll = useCallback((scrollTop: number) => {
    setScrollOffset(scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    scrollOffset,
    offsetTop,
    onScroll,
  };
}

export default useVirtualizedList;
