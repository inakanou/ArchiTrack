/**
 * @fileoverview LazyImage コンポーネント
 *
 * Task 23.1: 画像遅延読み込みを実装する
 *
 * Requirements:
 * - 14.1: 画像一覧の初期表示を2秒以内に完了する
 *
 * 機能:
 * - IntersectionObserverによる遅延読み込み
 * - サムネイル優先表示
 * - ローディングプレースホルダー
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * LazyImage コンポーネントの Props
 */
export interface LazyImageProps {
  /** オリジナル画像のURL */
  src: string;
  /** サムネイル画像のURL（オプション） */
  thumbnailSrc?: string;
  /** 画像の代替テキスト */
  alt: string;
  /** 画像の幅 */
  width: number;
  /** 画像の高さ */
  height: number;
  /** IntersectionObserverのrootMargin（事前読み込み用） */
  rootMargin?: string;
  /** カスタムクラス名 */
  className?: string;
  /** 画像のオブジェクトフィット */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  /** ボーダーの角丸 */
  borderRadius?: string;
  /** 画像読み込み完了時のコールバック */
  onLoadComplete?: () => void;
  /** エラー時のコールバック */
  onError?: (error: Error) => void;
}

/**
 * 画像読み込み状態
 */
type ImageLoadState = 'idle' | 'loading-thumbnail' | 'loading-original' | 'loaded' | 'error';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  image: {
    width: '100%',
    height: '100%',
    display: 'block',
    transition: 'opacity 0.3s ease',
  } as React.CSSProperties,
  placeholder: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  loading: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  } as React.CSSProperties,
  error: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  } as React.CSSProperties,
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'lazy-image-spin 1s linear infinite',
  } as React.CSSProperties,
  imageIcon: {
    width: '32px',
    height: '32px',
    color: '#9ca3af',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * LazyImage コンポーネント
 *
 * IntersectionObserverを使用して画像を遅延読み込みし、
 * サムネイル優先表示でユーザー体験を向上させます。
 *
 * @example
 * ```tsx
 * <LazyImage
 *   src="https://example.com/original.jpg"
 *   thumbnailSrc="https://example.com/thumbnail.jpg"
 *   alt="説明文"
 *   width={300}
 *   height={200}
 * />
 * ```
 */
export function LazyImage({
  src,
  thumbnailSrc,
  alt,
  width,
  height,
  rootMargin = '50px',
  className = '',
  objectFit = 'cover',
  borderRadius,
  onLoadComplete,
  onError,
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<ImageLoadState>('idle');
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const isInViewRef = useRef(false);

  // IntersectionObserver設定 - ビューポートに入ったら画像読み込み開始
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !isInViewRef.current) {
          isInViewRef.current = true;
          // IntersectionObserverコールバック内で直接読み込み開始
          if (thumbnailSrc) {
            setLoadState('loading-thumbnail');
            setCurrentSrc(thumbnailSrc);
          } else {
            setLoadState('loading-original');
            setCurrentSrc(src);
          }
        }
      },
      {
        rootMargin,
        threshold: 0,
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, thumbnailSrc, src]);

  // 画像読み込み完了ハンドラ
  const handleLoad = useCallback(() => {
    if (loadState === 'loading-thumbnail') {
      // サムネイル読み込み完了、オリジナルに切り替え
      setLoadState('loading-original');
      setCurrentSrc(src);
    } else if (loadState === 'loading-original') {
      // オリジナル読み込み完了
      setLoadState('loaded');
      onLoadComplete?.();
    }
  }, [loadState, src, onLoadComplete]);

  // 画像読み込みエラーハンドラ
  const handleError = useCallback(() => {
    setLoadState('error');
    onError?.(new Error(`Failed to load image: ${currentSrc}`));
  }, [currentSrc, onError]);

  // 読み込み中かどうか
  const isLoading = loadState === 'loading-thumbnail' || loadState === 'loading-original';

  // コンテナスタイル
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    width: `${width}px`,
    height: `${height}px`,
    ...(borderRadius ? { borderRadius } : {}),
  };

  // 画像スタイル
  const imageStyle: React.CSSProperties = {
    ...styles.image,
    objectFit,
    opacity: loadState === 'loaded' ? 1 : 0.5,
  };

  return (
    <div
      ref={containerRef}
      data-testid="lazy-image-container"
      role="img"
      aria-label={alt}
      aria-busy={isLoading ? 'true' : 'false'}
      className={className}
      style={containerStyle}
    >
      {/* プレースホルダー（アイドル状態で表示） */}
      {loadState === 'idle' && (
        <div data-testid="lazy-image-placeholder" style={styles.placeholder}>
          <svg
            style={styles.imageIcon}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      {/* 画像 */}
      {currentSrc && loadState !== 'error' && (
        <img
          src={currentSrc}
          alt={alt}
          style={imageStyle}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* ローディングスピナー */}
      {isLoading && (
        <div data-testid="lazy-image-loading" style={styles.loading}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* エラー表示 */}
      {loadState === 'error' && (
        <div data-testid="lazy-image-error" style={styles.error}>
          <svg
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
      )}

      {/* CSSアニメーション用スタイル */}
      <style>{`
        @keyframes lazy-image-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// デフォルトエクスポート
export default LazyImage;
