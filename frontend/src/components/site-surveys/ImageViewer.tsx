/**
 * @fileoverview 画像ビューアコンポーネント
 *
 * Task 12.1: 基本ビューア機能を実装する
 *
 * モーダル/専用画面での画像表示、Fabric.js Canvasの初期化、
 * 画像の読み込みと表示を行うコンポーネントです。
 *
 * Requirements:
 * - 5.1: 画像をクリックすると画像ビューアをモーダルまたは専用画面で開く
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ImageViewerの状態
 */
interface ImageViewerState {
  /** 読み込み中フラグ */
  isLoading: boolean;
  /** エラーメッセージ */
  error: string | null;
}

/**
 * ImageViewerのProps
 */
export interface ImageViewerProps {
  /** 表示する画像のURL */
  imageUrl: string;
  /** モーダルの開閉状態 */
  isOpen: boolean;
  /** モーダルを閉じる時のコールバック */
  onClose: () => void;
  /** 画像名（タイトル表示用、省略時はデフォルトタイトル） */
  imageName?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    maxWidth: '100vw',
    maxHeight: '100vh',
    position: 'relative' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#ffffff',
  },
  title: {
    fontSize: '16px',
    fontWeight: '500',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'background-color 0.2s',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    display: 'block',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderTop: '4px solid #ffffff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorContainer: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  errorMessage: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px 24px',
    color: '#991b1b',
    textAlign: 'center' as const,
  },
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 画像ビューアコンポーネント
 *
 * Fabric.js Canvasを使用して画像を表示するモーダルコンポーネントです。
 * 将来的にズーム、回転、パン機能を追加予定です（Task 12.2-12.6）。
 */
export default function ImageViewer({ imageUrl, isOpen, onClose, imageName }: ImageViewerProps) {
  // DOM参照
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fabric.js Canvas参照
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // 状態管理
  const [state, setState] = useState<ImageViewerState>({
    isLoading: true,
    error: null,
  });

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

  /**
   * キーボードイベントハンドラ
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * オーバーレイクリックハンドラ
   */
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // オーバーレイ直接クリック時のみ閉じる
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * コンテンツクリックハンドラ（イベント伝播を止める）
   */
  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  /**
   * 画像を読み込んでCanvasに表示
   */
  const loadImage = useCallback(async (canvas: FabricCanvas, url: string) => {
    setState({ isLoading: true, error: null });

    try {
      // 画像を読み込み
      const img = await FabricImage.fromURL(url, {
        crossOrigin: 'anonymous',
      });

      // コンテナサイズを取得
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = containerRef.current?.clientHeight || 600;

      // パディングを考慮
      const padding = 48;
      const maxWidth = containerWidth - padding;
      const maxHeight = containerHeight - padding;

      // 画像サイズを計算
      const imgWidth = img.width || 1;
      const imgHeight = img.height || 1;
      const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

      // スケールを設定
      img.scale(scale);

      // Canvasサイズを設定
      const scaledWidth = imgWidth * scale;
      const scaledHeight = imgHeight * scale;
      canvas.setWidth(scaledWidth);
      canvas.setHeight(scaledHeight);

      // 背景画像として設定（Fabric.js v6 API）
      canvas.backgroundImage = img;
      canvas.renderAll();

      setState({ isLoading: false, error: null });
    } catch (err) {
      console.error('画像の読み込みに失敗しました:', err);
      setState({
        isLoading: false,
        error: err instanceof Error ? err.message : '画像の読み込みに失敗しました',
      });
    }
  }, []);

  /**
   * Fabric.js Canvasの初期化
   */
  useEffect(() => {
    if (!isOpen || !canvasRef.current) {
      return;
    }

    // Canvasを初期化
    const canvas = new FabricCanvas(canvasRef.current, {
      selection: false,
      renderOnAddRemove: true,
    });

    fabricCanvasRef.current = canvas;

    // 初期サイズを設定
    const containerWidth = containerRef.current?.clientWidth || 800;
    const containerHeight = containerRef.current?.clientHeight || 600;
    canvas.setWidth(containerWidth);
    canvas.setHeight(containerHeight);

    // 画像を読み込み
    if (imageUrl) {
      loadImage(canvas, imageUrl);
      prevImageUrlRef.current = imageUrl;
    }

    // クリーンアップ
    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageUrlの変更は別のuseEffectで対応
  }, [isOpen, loadImage]);

  /**
   * 画像URLが変更された場合の再読み込み
   */
  useEffect(() => {
    if (!isOpen || !fabricCanvasRef.current) {
      return;
    }

    // 画像URLが変更された場合のみ再読み込み
    if (prevImageUrlRef.current !== imageUrl && imageUrl) {
      loadImage(fabricCanvasRef.current, imageUrl);
      prevImageUrlRef.current = imageUrl;
    }
  }, [isOpen, imageUrl, loadImage]);

  /**
   * キーボードイベントのリスナー設定
   */
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, [isOpen, handleKeyDown]);

  // モーダルが閉じている場合は何も表示しない
  if (!isOpen) {
    return null;
  }

  // 表示タイトル
  const displayTitle = imageName || '画像ビューア';
  const titleId = 'image-viewer-title';

  return (
    <>
      {/* スピナーアニメーション用CSS */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* モーダルオーバーレイ */}
      <div
        style={STYLES.overlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="image-viewer-overlay"
        onClick={handleOverlayClick}
      >
        {/* コンテンツコンテナ */}
        <div style={STYLES.content} data-testid="image-viewer-content" onClick={handleContentClick}>
          {/* ヘッダー */}
          <div style={STYLES.header}>
            <h2 id={titleId} style={STYLES.title}>
              {displayTitle}
            </h2>
            <button
              type="button"
              style={STYLES.closeButton}
              onClick={onClose}
              aria-label="閉じる"
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Canvasコンテナ */}
          <div ref={containerRef} style={STYLES.canvasContainer}>
            <canvas ref={canvasRef} style={STYLES.canvas} />

            {/* ローディング表示 */}
            {state.isLoading && (
              <div style={STYLES.loadingOverlay}>
                <div role="status" aria-label="読み込み中" style={STYLES.spinner} />
              </div>
            )}

            {/* エラー表示 */}
            {state.error && (
              <div style={STYLES.errorContainer}>
                <div role="alert" style={STYLES.errorMessage}>
                  {state.error}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
