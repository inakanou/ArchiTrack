/**
 * @fileoverview 要素の表示領域到達を判定するフック
 *
 * Task 110.2: 要素が表示領域へ到達したことを判定する共有フックを実装する
 *
 * 表示領域（+先読み余白）へ一度でも入ったかを返す。写真が多数登録された画面で、
 * 表示領域外の画像の取得とクライアントサイド合成を開始させないために用いる。
 *
 * Requirements:
 * - 38.8: 表示領域外の画像は表示領域に入るまで取得しない
 *
 * @module hooks/useInViewport
 */

import { useEffect, useRef, useState } from 'react';

// ============================================================================
// 定数
// ============================================================================

/**
 * 先読み余白の既定値
 *
 * スクロール中に空白が見えることを避けるため、表示領域の少し手前で取得を開始する。
 */
const DEFAULT_ROOT_MARGIN = '50px';

// ============================================================================
// 型定義
// ============================================================================

export interface UseInViewportOptions {
  /** 先読み余白。既定は `'50px'` */
  rootMargin?: string;
  /**
   * 観測を行うか。
   * `false` のときは観測せず、常に到達済みとして扱う。
   * 即時取得が意図される場合や、未読込時に表示領域を確保できず観測が成立しない場合に用いる。
   * 既定は `true`。
   */
  enabled?: boolean;
}

export interface UseInViewportResult<T extends Element> {
  /** 観測対象へ付与する ref */
  ref: React.RefObject<T | null>;
  /** 一度でも表示領域へ入ったか。到達後は `false` へ戻らない */
  isInViewport: boolean;
}

// ============================================================================
// フック実装
// ============================================================================

/**
 * 単一要素の表示領域到達を判定する
 *
 * 返された `ref` を観測したい要素へ付与する。要素が表示領域（+先読み余白）へ入ると
 * `isInViewport` が `true` になり、以後は `false` へ戻らない。到達した時点で観測を解除する。
 *
 * 観測を無効化した場合、および実行環境に観測の仕組みが存在しない場合は、常に到達済みとして
 * 扱う。取得抑止は失われるが表示は成立する（表示破綻より機能劣化を選ぶ）。
 *
 * @param options - 先読み余白と観測の有効・無効
 *
 * @example
 * ```tsx
 * const { ref, isInViewport } = useInViewport<HTMLImageElement>({ enabled: loading === 'lazy' });
 * return <img ref={ref} src={isInViewport ? url : undefined} />;
 * ```
 */
export function useInViewport<T extends Element>(
  options: UseInViewportOptions = {}
): UseInViewportResult<T> {
  const { rootMargin = DEFAULT_ROOT_MARGIN, enabled = true } = options;
  const ref = useRef<T | null>(null);
  const [hasIntersected, setHasIntersected] = useState(false);

  // 観測が成立する条件。無効化されている場合と、実行環境に観測の仕組みが無い場合は
  // 観測を行わない。
  const observable = enabled && typeof IntersectionObserver !== 'undefined';

  useEffect(() => {
    if (!observable || hasIntersected) {
      return;
    }

    const target = ref.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        // 到達後は再判定が不要なため、その場で観測を解除する
        observer.disconnect();
        setHasIntersected(true);
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [observable, hasIntersected, rootMargin]);

  return {
    ref,
    // 観測しない場合は到達済みとして扱う。観測する場合は一度到達したら戻らない。
    isInViewport: observable ? hasIntersected : true,
  };
}

export default useInViewport;
