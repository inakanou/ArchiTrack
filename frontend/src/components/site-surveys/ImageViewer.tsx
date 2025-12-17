/**
 * @fileoverview 画像ビューアコンポーネント
 *
 * Task 12.1: 基本ビューア機能を実装する
 * Task 12.2: ズーム機能を実装する
 * Task 12.3: 回転機能を実装する
 *
 * モーダル/専用画面での画像表示、Fabric.js Canvasの初期化、
 * 画像の読み込みと表示、ズーム機能、回転機能を提供するコンポーネントです。
 *
 * Requirements:
 * - 5.1: 画像をクリックすると画像ビューアをモーダルまたは専用画面で開く
 * - 5.2: ズームイン/ズームアウト操作で画像を拡大/縮小表示
 * - 5.3: 回転ボタンを押すと画像を90度単位で回転表示
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ズーム関連の定数
 * @description ズーム範囲制限（0.1x-10x）とズームステップを定義
 */
export const ZOOM_CONSTANTS = {
  /** 最小ズーム倍率 */
  MIN_ZOOM: 0.1,
  /** 最大ズーム倍率 */
  MAX_ZOOM: 10,
  /** ズームステップ（ボタン・キーボード操作時） */
  ZOOM_STEP: 0.1,
  /** マウスホイールズームの感度 */
  WHEEL_ZOOM_FACTOR: 0.001,
} as const;

/**
 * 回転関連の定数
 * @description 90度単位の回転ステップと許可される回転値を定義
 */
export const ROTATION_CONSTANTS = {
  /** 回転ステップ（度） */
  ROTATION_STEP: 90,
  /** 許可される回転値 */
  ROTATION_VALUES: [0, 90, 180, 270] as const,
} as const;

/** 回転角度の型 */
export type RotationAngle = (typeof ROTATION_CONSTANTS.ROTATION_VALUES)[number];

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
  /** 現在のズーム倍率 */
  zoom: number;
  /** 現在の回転角度（度） */
  rotation: RotationAngle;
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
  // ズームコントロール用スタイル
  zoomControls: {
    position: 'absolute' as const,
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    padding: '8px 16px',
  },
  zoomButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'background-color 0.2s, border-color 0.2s',
    fontSize: '18px',
    fontWeight: 'bold',
  },
  zoomButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  zoomDisplay: {
    minWidth: '60px',
    textAlign: 'center' as const,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
  },
  resetButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'background-color 0.2s, border-color 0.2s',
    fontSize: '12px',
  },
  // 回転コントロール用スタイル
  rotationControls: {
    position: 'absolute' as const,
    bottom: '24px',
    right: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    padding: '8px 16px',
  },
  rotationButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'background-color 0.2s, border-color 0.2s',
    fontSize: '16px',
  },
  rotationDisplay: {
    minWidth: '40px',
    textAlign: 'center' as const,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
  },
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ズーム倍率を範囲内に制限する
 */
function clampZoom(zoom: number): number {
  return Math.max(ZOOM_CONSTANTS.MIN_ZOOM, Math.min(ZOOM_CONSTANTS.MAX_ZOOM, zoom));
}

/**
 * ズーム倍率をパーセント表示に変換
 */
function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * 回転角度を正規化（0-359度の範囲に収める）
 */
function normalizeRotation(angle: number): RotationAngle {
  // 負の角度を正の角度に変換し、360で割った余りを取る
  const normalized = ((angle % 360) + 360) % 360;
  // 許可された値のみを返す
  if (ROTATION_CONSTANTS.ROTATION_VALUES.includes(normalized as RotationAngle)) {
    return normalized as RotationAngle;
  }
  // 念のため最も近い許可値を返す
  return ROTATION_CONSTANTS.ROTATION_VALUES.reduce((prev, curr) =>
    Math.abs(curr - normalized) < Math.abs(prev - normalized) ? curr : prev
  );
}

/**
 * 回転角度を度表示に変換
 */
function formatRotationDegree(rotation: RotationAngle): string {
  return `${rotation}\u00B0`;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 画像ビューアコンポーネント
 *
 * Fabric.js Canvasを使用して画像を表示するモーダルコンポーネントです。
 * ズーム機能（ボタン、マウスホイール、キーボードショートカット）を提供します。
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
    zoom: 1,
    rotation: 0,
  });

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

  // 背景画像への参照
  const backgroundImageRef = useRef<FabricImage | null>(null);

  /**
   * ズームレベルを設定
   */
  const setZoom = useCallback((newZoom: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const clampedZoom = clampZoom(newZoom);
    canvas.setZoom(clampedZoom);
    canvas.renderAll();
    setState((prev) => ({ ...prev, zoom: clampedZoom }));
  }, []);

  /**
   * ズームイン
   */
  const handleZoomIn = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const currentZoom = canvas.getZoom();
    const newZoom = currentZoom + ZOOM_CONSTANTS.ZOOM_STEP;
    setZoom(newZoom);
  }, [setZoom]);

  /**
   * ズームアウト
   */
  const handleZoomOut = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const currentZoom = canvas.getZoom();
    const newZoom = currentZoom - ZOOM_CONSTANTS.ZOOM_STEP;
    setZoom(newZoom);
  }, [setZoom]);

  /**
   * ズームリセット（100%に戻す）
   */
  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, [setZoom]);

  /**
   * 回転を適用
   */
  const applyRotation = useCallback((newRotation: RotationAngle) => {
    const canvas = fabricCanvasRef.current;
    const img = backgroundImageRef.current;
    if (!canvas || !img) return;

    // 画像の中心を基準に回転を設定
    const imgWidth = img.width || 1;
    const imgHeight = img.height || 1;

    img.set({
      angle: newRotation,
      originX: 'center',
      originY: 'center',
      left: (imgWidth * (img.scaleX || 1)) / 2,
      top: (imgHeight * (img.scaleY || 1)) / 2,
    });

    canvas.renderAll();
    setState((prev) => ({ ...prev, rotation: newRotation }));
  }, []);

  /**
   * 右回転（時計回り90度）
   */
  const handleRotateRight = useCallback(() => {
    const newRotation = normalizeRotation(state.rotation + ROTATION_CONSTANTS.ROTATION_STEP);
    applyRotation(newRotation);
  }, [state.rotation, applyRotation]);

  /**
   * 左回転（反時計回り90度）
   */
  const handleRotateLeft = useCallback(() => {
    const newRotation = normalizeRotation(state.rotation - ROTATION_CONSTANTS.ROTATION_STEP);
    applyRotation(newRotation);
  }, [state.rotation, applyRotation]);

  /**
   * 回転リセット（0度に戻す）
   */
  const handleRotationReset = useCallback(() => {
    applyRotation(0);
  }, [applyRotation]);

  /**
   * マウスホイールによるズーム
   */
  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const currentZoom = canvas.getZoom();
      // deltaYが負（上にスクロール）= ズームイン、正（下にスクロール）= ズームアウト
      const delta = -event.deltaY * ZOOM_CONSTANTS.WHEEL_ZOOM_FACTOR;
      const newZoom = currentZoom + delta;
      setZoom(newZoom);
    },
    [setZoom]
  );

  /**
   * キーボードイベントハンドラ（ESC、ズームショートカット、回転ショートカット含む）
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // ズームショートカット
      switch (event.key) {
        case '+':
        case '=': // Shift+= も + として扱う
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleZoomReset();
          break;
        // 回転ショートカット
        case '[':
          handleRotateLeft();
          break;
        case ']':
          handleRotateRight();
          break;
      }
    },
    [onClose, handleZoomIn, handleZoomOut, handleZoomReset, handleRotateLeft, handleRotateRight]
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
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

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
      // 背景画像の参照を保存
      backgroundImageRef.current = img;
      canvas.setZoom(1); // ズームをリセット
      canvas.renderAll();

      setState({ isLoading: false, error: null, zoom: 1, rotation: 0 });
    } catch (err) {
      console.error('画像の読み込みに失敗しました:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : '画像の読み込みに失敗しました',
      }));
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
      backgroundImageRef.current = null;
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

  // ズームボタンの無効化状態
  const isZoomInDisabled = state.zoom >= ZOOM_CONSTANTS.MAX_ZOOM;
  const isZoomOutDisabled = state.zoom <= ZOOM_CONSTANTS.MIN_ZOOM;

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
          <div
            ref={containerRef}
            style={STYLES.canvasContainer}
            data-testid="canvas-container"
            onWheel={handleWheel}
          >
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

            {/* ズームコントロール */}
            {!state.isLoading && !state.error && (
              <div style={STYLES.zoomControls}>
                {/* ズームアウトボタン */}
                <button
                  type="button"
                  style={{
                    ...STYLES.zoomButton,
                    ...(isZoomOutDisabled ? STYLES.zoomButtonDisabled : {}),
                  }}
                  onClick={handleZoomOut}
                  disabled={isZoomOutDisabled}
                  aria-label="ズームアウト"
                  onMouseEnter={(e) => {
                    if (!isZoomOutDisabled) {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  -
                </button>

                {/* ズーム倍率表示 */}
                <span style={STYLES.zoomDisplay} data-testid="zoom-display">
                  {formatZoomPercent(state.zoom)}
                </span>

                {/* ズームインボタン */}
                <button
                  type="button"
                  style={{
                    ...STYLES.zoomButton,
                    ...(isZoomInDisabled ? STYLES.zoomButtonDisabled : {}),
                  }}
                  onClick={handleZoomIn}
                  disabled={isZoomInDisabled}
                  aria-label="ズームイン"
                  onMouseEnter={(e) => {
                    if (!isZoomInDisabled) {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  +
                </button>

                {/* リセットボタン */}
                <button
                  type="button"
                  style={STYLES.resetButton}
                  onClick={handleZoomReset}
                  aria-label="100%"
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  100%
                </button>
              </div>
            )}

            {/* 回転コントロール */}
            {!state.isLoading && !state.error && (
              <div style={STYLES.rotationControls}>
                {/* 左回転ボタン（反時計回り） */}
                <button
                  type="button"
                  style={STYLES.rotationButton}
                  onClick={handleRotateLeft}
                  aria-label="左に回転"
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 2v6h6" />
                    <path d="M2.5 8a10 10 0 1 1 3.1-4.2" />
                  </svg>
                </button>

                {/* 回転角度表示 */}
                <span style={STYLES.rotationDisplay} data-testid="rotation-display">
                  {formatRotationDegree(state.rotation)}
                </span>

                {/* 右回転ボタン（時計回り） */}
                <button
                  type="button"
                  style={STYLES.rotationButton}
                  onClick={handleRotateRight}
                  aria-label="右に回転"
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.5 2v6h-6" />
                    <path d="M21.5 8a10 10 0 1 0-3.1-4.2" />
                  </svg>
                </button>

                {/* 回転リセットボタン */}
                <button
                  type="button"
                  style={STYLES.resetButton}
                  onClick={handleRotationReset}
                  aria-label="回転をリセット"
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  0°
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
