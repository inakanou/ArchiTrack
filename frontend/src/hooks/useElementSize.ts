import { useState, useEffect, type RefObject } from 'react';

/**
 * 要素の実寸（width / height）
 */
export interface ElementSize {
  /** コンテンツ矩形の幅（px） */
  width: number;
  /** コンテンツ矩形の高さ（px） */
  height: number;
}

/**
 * コンテナ要素の実寸を ResizeObserver で購読するカスタムフック
 *
 * 渡された ref が指す要素のコンテンツ矩形（width / height）を購読し、
 * リサイズ（モバイルブラウザのアドレスバー伸縮・端末回転・レイアウト変化など）が
 * 発生するたびに最新の寸法へ state を更新する。
 *
 * 本フックは「実寸を返すのみ」で、フィット倍率の算出やビューポートへの
 * フィット適用は行わない（呼び出し側の責務）。
 *
 * - SSR / ResizeObserver 非対応環境では購読を行わず、例外も出さない。
 * - アンマウント時に ResizeObserver を disconnect してクリーンアップする。
 *
 * @param ref - 実寸を購読したい要素への RefObject
 * @returns 要素の実寸 `{ width, height }`（未計測時は `{ width: 0, height: 0 }`）
 *
 * @example
 * ```tsx
 * function CanvasContainer() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { width, height } = useElementSize(containerRef);
 *   // width / height を元にフィット倍率を算出（フィット適用は呼び出し側）
 *   return <div ref={containerRef} />;
 * }
 * ```
 *
 * @see requirements.md 要件 36.4（表示領域高さの可変UI追従・再フィット発火）
 */
function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;

    // 対象要素が未確定の場合は何もしない
    if (!element) {
      return;
    }

    // ResizeObserver 非対応環境（SSR / 古いブラウザ）では購読しない
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    // 購読開始時点の実寸を初期反映（初回フィットのため）
    setSize({ width: element.clientWidth, height: element.clientHeight });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    observer.observe(element);

    // アンマウント時にクリーンアップ
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return size;
}

export default useElementSize;
