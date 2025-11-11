import { useState, useEffect } from 'react';

/**
 * メディアクエリの状態を監視するカスタムフック
 *
 * @param query - メディアクエリ文字列（例: "(min-width: 768px)"）
 * @returns メディアクエリがマッチしているかどうか
 *
 * @example
 * ```tsx
 * function ResponsiveComponent() {
 *   const isMobile = useMediaQuery('(max-width: 767px)');
 *   const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
 *   const isDesktop = useMediaQuery('(min-width: 1024px)');
 *
 *   return (
 *     <div>
 *       {isMobile && <MobileView />}
 *       {isTablet && <TabletView />}
 *       {isDesktop && <DesktopView />}
 *     </div>
 *   );
 * }
 * ```
 */
function useMediaQuery(query: string): boolean {
  // window.matchMediaが存在しない場合はfalseを返す
  const getMatches = (q: string): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(q).matches;
  };

  const [matches, setMatches] = useState<boolean>(getMatches(query));

  useEffect(() => {
    // window.matchMediaが存在しない場合は何もしない
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(query);

    // メディアクエリの変更を監視
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // イベントリスナーを登録
    // 古いブラウザとの互換性のため、addEventListenerとaddListenerの両方をサポート
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - addListenerは非推奨だがサポート
      mediaQueryList.addListener(handleChange);
    }

    // クリーンアップ
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange);
      } else {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - removeListenerは非推奨だがサポート
        mediaQueryList.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
}

export default useMediaQuery;
