import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/**
 * デバウンス値フック
 * ユーザー入力などの頻繁な更新を遅延させる
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 * useEffect(() => {
 *   // debouncedSearchTermが変更されたときのみAPIコール
 *   fetchResults(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * スロットル関数フック
 * 関数の実行頻度を制限する
 *
 * @example
 * const handleScroll = useThrottle(() => {
 *   console.log('Scrolled!');
 * }, 200);
 *
 * <div onScroll={handleScroll}>...</div>
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastRan = useRef<number>(Date.now());
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    ((...args) => {
      const now = Date.now();
      if (now - lastRan.current >= delay) {
        callbackRef.current(...args);
        lastRan.current = now;
      }
    }) as T,
    [delay]
  );
}

/**
 * 前回の値を保持するフック
 *
 * @example
 * const [count, setCount] = useState(0);
 * const prevCount = usePrevious(count);
 *
 * console.log(`Current: ${count}, Previous: ${prevCount}`);
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * コンポーネントのマウント状態を追跡するフック
 * メモリリーク防止に有用
 *
 * @example
 * const isMounted = useIsMounted();
 *
 * const fetchData = async () => {
 *   const data = await api.get('/data');
 *   if (isMounted()) {
 *     setData(data);
 *   }
 * };
 */
export function useIsMounted(): () => boolean {
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return useCallback(() => isMounted.current, []);
}

/**
 * インターセクションオブザーバーフック（レイジーローディング用）
 *
 * @example
 * const [ref, isVisible] = useIntersectionObserver({ threshold: 0.5 });
 *
 * return (
 *   <div ref={ref}>
 *     {isVisible && <ExpensiveComponent />}
 *   </div>
 * );
 */
export function useIntersectionObserver(
  options?: IntersectionObserverInit
): [React.RefCallback<Element>, boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [node, setNode] = useState<Element | null>(null);

  const observer = useMemo(
    () =>
      new IntersectionObserver(([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      }, options),
    [options]
  );

  useEffect(() => {
    if (node) {
      observer.observe(node);
      return () => observer.disconnect();
    }
  }, [node, observer]);

  return [setNode, isIntersecting];
}

/**
 * 非同期関数の実行状態を管理するフック
 *
 * @example
 * const { execute, loading, error, data } = useAsync(fetchUserData);
 *
 * return (
 *   <>
 *     <button onClick={() => execute(userId)} disabled={loading}>
 *       Load User
 *     </button>
 *     {loading && <Spinner />}
 *     {error && <Error message={error.message} />}
 *     {data && <UserProfile user={data} />}
 *   </>
 * );
 */
export function useAsync<T, Args extends unknown[]>(
  asyncFunction: (...args: Args) => Promise<T>
): {
  execute: (...args: Args) => Promise<void>;
  loading: boolean;
  error: Error | null;
  data: T | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);
  const isMounted = useIsMounted();

  const execute = useCallback(
    async (...args: Args) => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFunction(...args);
        if (isMounted()) {
          setData(result);
        }
      } catch (err) {
        if (isMounted()) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted()) {
          setLoading(false);
        }
      }
    },
    [asyncFunction, isMounted]
  );

  return { execute, loading, error, data };
}

/**
 * ローカルストレージと同期するステートフック
 *
 * @example
 * const [theme, setTheme] = useLocalStorage('theme', 'light');
 *
 * <button onClick={() => setTheme('dark')}>
 *   Switch to Dark Mode
 * </button>
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * パフォーマンス測定ユーティリティ
 * 開発環境でのみコンソールに出力
 *
 * @example
 * function MyComponent() {
 *   measurePerformance('MyComponent render');
 *
 *   // ... コンポーネントロジック
 * }
 */
export function measurePerformance(label: string): void {
  if (import.meta.env.DEV) {
    performance.mark(`${label}-start`);

    requestIdleCallback(() => {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);

      const measure = performance.getEntriesByName(label)[0];
      if (measure) {
        console.debug(`[Performance] ${label}: ${measure.duration.toFixed(2)}ms`);
      }

      performance.clearMarks(`${label}-start`);
      performance.clearMarks(`${label}-end`);
      performance.clearMeasures(label);
    });
  }
}

/**
 * レンダリング回数をカウントするフック（デバッグ用）
 *
 * @example
 * function MyComponent() {
 *   useRenderCount('MyComponent');
 *   // ...
 * }
 */
export function useRenderCount(componentName: string): void {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
    if (import.meta.env.DEV) {
      console.debug(`[Render Count] ${componentName}: ${renderCount.current}`);
    }
  });
}

/**
 * Why-did-you-render風のフック
 * どのpropsが変更されたかを追跡
 *
 * @example
 * function MyComponent(props) {
 *   useWhyDidYouUpdate('MyComponent', props);
 *   // ...
 * }
 */
export function useWhyDidYouUpdate(name: string, props: Record<string, unknown>): void {
  const previousProps = useRef<Record<string, unknown>>();

  useEffect(() => {
    if (previousProps.current && import.meta.env.DEV) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, { from: unknown; to: unknown }> = {};

      allKeys.forEach((key) => {
        if (previousProps.current?.[key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current?.[key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length > 0) {
        console.debug(`[Why Did Update] ${name}:`, changedProps);
      }
    }

    previousProps.current = props;
  });
}
