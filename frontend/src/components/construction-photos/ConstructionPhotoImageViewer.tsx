/**
 * @fileoverview 工事写真 閲覧専用画像ビューア
 *
 * Task 11.2: 閲覧専用画像ビューア＋ビューアページ＋ルート
 *
 * 現場調査（site-survey）の画像ビューア基盤を合成した閲覧専用ビューア。注釈編集ツールは
 * 持たない。表示元は非合成原本（呼び出し側が `getConstructionPhotoOriginalImage` で取得した
 * Blob の object URL）を `imageUrl` props として受け取るのみで、取得タイミングの制御
 * （必要時にのみ取得, R14.6）はページ側（`ConstructionPhotoImageViewerPage`）が担う。
 *
 * 合成する既存基盤（design.md「追加機能ファイル（Req 14〜19）」）:
 *   - `hooks/useCanvasViewport` + `components/site-surveys/gestures/canvasViewportController`
 *     （中点ズーム/パン/クランプの算術）。Fabric Canvas を持たないため、同フックが要求する
 *     `FabricCanvasLike` 最小サーフェスを満たす軽量アダプタ（scene = フィット後の画像サイズ）を
 *     このコンポーネント内に生成して橋渡しする。
 *   - `components/site-surveys/ZoomControls`（ズームイン/アウト/全体表示ボタン+倍率バッジ）。
 *   - `utils/imageFitScale`（`computeFitScale`）で表示コンテナに収まるフィット倍率を算出する。
 *   - `components/site-surveys/image-viewer.constants`（`ZOOM_CONSTANTS`/`ROTATION_CONSTANTS`/
 *     `PAN_CONSTANTS`/`RotationAngle`）。回転の正規化（`normalizeRotation`）は ImageViewer.tsx が
 *     未exportのため、90度刻みの小さな純関数として本ファイルに自前実装する。
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 * @see design.md - 「画像ビューア（閲覧専用）」System Flow / ConstructionPhotoViewerState
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useCanvasViewport } from '../../hooks/useCanvasViewport';
import type {
  FabricCanvasLike,
  ViewportPoint,
  ViewportTransform,
} from '../site-surveys/gestures/canvasViewportController';
import ZoomControls from '../site-surveys/ZoomControls';
import { computeFitScale } from '../../utils/imageFitScale';
import { ROTATION_CONSTANTS, type RotationAngle } from '../site-surveys/image-viewer.constants';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ビューア表示状態（design.md Data Contracts の `ConstructionPhotoViewerState` に対応）。
 */
export interface ConstructionPhotoViewerState {
  zoom: number;
  rotation: RotationAngle;
  panX: number;
  panY: number;
}

export interface ConstructionPhotoImageViewerProps {
  /** 表示する原本画像の object URL。未取得（読み込み中/エラー）時は null。 */
  imageUrl: string | null;
  /** タイトル・alt に用いる画像名（ファイル名など）。 */
  imageName?: string;
  /** 原本取得中フラグ（R14.6: 必要時にのみ取得するため、取得完了までローディング表示）。 */
  isLoading?: boolean;
  /** 原本取得エラーメッセージ。 */
  error?: string | null;
  /** 閉じる操作のコールバック（呼び出し側が詳細画面へのナビゲーションを行う, R14.5）。 */
  onClose: () => void;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 回転角度を 0/90/180/270 のいずれかへ正規化する純関数。
 * ImageViewer.tsx の `normalizeRotation`（未export）を複製せず、90度刻みの小さな
 * 独立実装として本ビューアに持たせる（タスク指示に基づく選択）。
 */
function normalizeRotation(angle: number): RotationAngle {
  const normalized = ((angle % 360) + 360) % 360;
  if (ROTATION_CONSTANTS.ROTATION_VALUES.includes(normalized as RotationAngle)) {
    return normalized as RotationAngle;
  }
  return ROTATION_CONSTANTS.ROTATION_VALUES.reduce((prev, curr) =>
    Math.abs(curr - normalized) < Math.abs(prev - normalized) ? curr : prev
  );
}

/**
 * 回転角度を度表示へ変換する。
 */
function formatRotationDegree(rotation: RotationAngle): string {
  return `${rotation}°`;
}

/**
 * `useCanvasViewport`/`canvasViewportController`（Fabric Canvas 前提）が要求する
 * `FabricCanvasLike` 最小サーフェスを満たす軽量アダプタを生成する。
 *
 * 本ビューアは Fabric Canvas を持たないため、scene 寸法（zoom=1 時の表示領域＝
 * フィット後の画像サイズ）を可変 ref から読み、viewportTransform を素の配列として
 * 保持するだけの純粋な状態オブジェクトで代替する。中点ズーム/パン/クランプの算術は
 * `canvasViewportController` 側にそのまま委譲され、二重実装しない。
 */
function createViewportCanvasAdapter(
  sizeRef: RefObject<{ width: number; height: number }>
): FabricCanvasLike {
  let viewportTransform: ViewportTransform = [1, 0, 0, 1, 0, 0];

  return {
    get viewportTransform(): ViewportTransform {
      return viewportTransform;
    },
    getZoom(): number {
      return viewportTransform[0];
    },
    getWidth(): number {
      return sizeRef.current.width;
    },
    getHeight(): number {
      return sizeRef.current.height;
    },
    setViewportTransform(transform: ViewportTransform): void {
      viewportTransform = transform;
    },
    zoomToPoint(point: ViewportPoint, value: number): void {
      const oldZoom = viewportTransform[0];
      const sceneX = (point.x - viewportTransform[4]) / oldZoom;
      const sceneY = (point.y - viewportTransform[5]) / oldZoom;
      viewportTransform = [value, 0, 0, value, point.x - sceneX * value, point.y - sceneY * value];
    },
    requestRenderAll(): void {
      // React state（zoom/pan）が再描画を駆動するため no-op。
    },
  };
}

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
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
    position: 'relative' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#ffffff',
    zIndex: 10,
  },
  title: {
    fontSize: '16px',
    fontWeight: 500,
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
  },
  stageContainer: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: '#ffffff',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderTop: '4px solid #ffffff',
    borderRadius: '50%',
    animation: 'construction-photo-viewer-spin 1s linear infinite',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px 24px',
    color: '#991b1b',
    textAlign: 'center' as const,
  },
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
    zIndex: 20,
  },
  rotationButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '44px',
    minHeight: '44px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#ffffff',
    fontSize: '16px',
  },
  rotationDisplay: {
    minWidth: '40px',
    textAlign: 'center' as const,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
  },
};

// フォールバック寸法（ImageViewer.tsx と同様、コンテナ実寸が未計測=0のjsdom/初期描画時でも
// パン/ズーム算術が意味を持つように用いる）。
const FALLBACK_CONTAINER_WIDTH = 800;
const FALLBACK_CONTAINER_HEIGHT = 600;
const STAGE_PADDING = 48;

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真 閲覧専用画像ビューア。
 *
 * ズームイン/アウト・90度単位回転・拡大時ドラッグパンを提供する（R14.2, 14.3, 14.4）。
 * 注釈編集ツールは持たず、閉じる操作は呼び出し側へ委譲する（R14.5）。
 */
function ConstructionPhotoImageViewer({
  imageUrl,
  imageName,
  isLoading = false,
  error = null,
  onClose,
}: ConstructionPhotoImageViewerProps) {
  const stageOuterRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: FALLBACK_CONTAINER_WIDTH, height: FALLBACK_CONTAINER_HEIGHT });

  // 画像の原寸（onLoad で確定するまでは null。フィット倍率計算はフォールバック寸法を用いる）。
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // 回転状態（design.md ConstructionPhotoViewerState.rotation）。
  const [rotation, setRotation] = useState<RotationAngle>(0);

  // パン位置（design.md ConstructionPhotoViewerState.panX/panY）。
  // useCanvasViewport はズーム倍率のみを購読するため、パンはコントローラ操作後に
  // controller.getState() から明示的に同期する（ImageViewer.tsx と同一方針）。
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // 軽量な FabricCanvasLike アダプタ（scene寸法 = フィット後の画像サイズ）。
  // Fabric Canvas を持たないため、コンポーネントの生存期間で単一インスタンスを保持する。
  const canvasAdapter = useMemo<FabricCanvasLike>(() => createViewportCanvasAdapter(sizeRef), []);

  const { zoom, zoomIn, zoomOut, fit, controller } = useCanvasViewport({ canvas: canvasAdapter });

  // フィット倍率算出（Req 14.1: フルスクリーン表示。utils/imageFitScale を合成）。
  const containerWidth = stageOuterRef.current?.clientWidth || FALLBACK_CONTAINER_WIDTH;
  const containerHeight = stageOuterRef.current?.clientHeight || FALLBACK_CONTAINER_HEIGHT;
  const fitScale = naturalSize
    ? computeFitScale({
        imageWidth: naturalSize.width,
        imageHeight: naturalSize.height,
        containerWidth,
        containerHeight,
        padding: STAGE_PADDING,
        allowUpscale: false,
      })
    : 1;
  const stageWidth = naturalSize ? naturalSize.width * fitScale : containerWidth;
  const stageHeight = naturalSize ? naturalSize.height * fitScale : containerHeight;

  // アダプタが参照する scene 寸法を毎レンダー最新化する（zoomToPoint の中点算出に使用）。
  sizeRef.current = { width: stageWidth, height: stageHeight };

  /**
   * 画像読み込み完了時に原寸を確定する。
   */
  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    setNaturalSize({
      width: img.naturalWidth || FALLBACK_CONTAINER_WIDTH,
      height: img.naturalHeight || FALLBACK_CONTAINER_HEIGHT,
    });
  }, []);

  /**
   * 全体表示（フィット）操作: 等倍へ戻しパン位置を初期化する。
   */
  const handleFit = useCallback(() => {
    fit();
    setPan({ x: 0, y: 0 });
  }, [fit]);

  /**
   * ズームイン/アウト（中点ズーム, Req 14.2）。
   *
   * `useCanvasViewport` の zoomIn/zoomOut は倍率 state のみを購読するが、中点ズームは
   * viewportTransform の並行移動成分（パン位置）も変化させる（表示領域中央を基準に
   * 拡大/縮小するため）。パン位置は本コンポーネントが独自に保持する state のため、
   * 操作直後に `controller.getState()` から明示的に同期しないと表示が実際の
   * viewportTransform と乖離する。
   */
  const handleZoomIn = useCallback(() => {
    zoomIn();
    const next = controller?.getState();
    if (next) setPan({ x: next.panX, y: next.panY });
  }, [zoomIn, controller]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
    const next = controller?.getState();
    if (next) setPan({ x: next.panX, y: next.panY });
  }, [zoomOut, controller]);

  /**
   * 回転操作（Req 14.3: 90度単位）。
   */
  const handleRotateRight = useCallback(() => {
    setRotation((prev) => normalizeRotation(prev + ROTATION_CONSTANTS.ROTATION_STEP));
  }, []);
  const handleRotateLeft = useCallback(() => {
    setRotation((prev) => normalizeRotation(prev - ROTATION_CONSTANTS.ROTATION_STEP));
  }, []);

  // ============================================================================
  // パン操作（マウスドラッグ, Req 14.4: 拡大時のみ有効）
  // ============================================================================

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (!controller?.isPanEnabled()) return;
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      setIsPanning(true);
    },
    [controller]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStartRef.current || !controller) return;
      const dx = event.clientX - dragStartRef.current.x;
      const dy = event.clientY - dragStartRef.current.y;
      controller.pan(dx, dy);
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      const next = controller.getState();
      setPan({ x: next.panX, y: next.panY });
    },
    [controller]
  );

  const handleMouseUp = useCallback(() => {
    dragStartRef.current = null;
    setIsPanning(false);
  }, []);

  // ============================================================================
  // タッチ操作（1本指パン/2本指ピンチズーム, Req 14.2/14.4）
  // ============================================================================

  const pinchStateRef = useRef<{ distance: number; zoom: number } | null>(null);
  const touchPanStartRef = useRef<{ x: number; y: number } | null>(null);

  const getTouchDistance = (t0: React.Touch, t1: React.Touch): number => {
    const dx = t1.clientX - t0.clientX;
    const dy = t1.clientY - t0.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const getTouchMidpoint = (t0: React.Touch, t1: React.Touch): { x: number; y: number } => ({
    x: (t0.clientX + t1.clientX) / 2,
    y: (t0.clientY + t1.clientY) / 2,
  });

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!controller) return;
      const touches = event.touches;
      if (touches.length === 2) {
        const t0 = touches[0];
        const t1 = touches[1];
        if (t0 && t1) {
          pinchStateRef.current = {
            distance: getTouchDistance(t0, t1),
            zoom: controller.getState().zoom,
          };
          touchPanStartRef.current = getTouchMidpoint(t0, t1);
        }
      } else if (touches.length === 1 && controller.isPanEnabled()) {
        const t0 = touches[0];
        if (t0) {
          touchPanStartRef.current = { x: t0.clientX, y: t0.clientY };
        }
      }
    },
    [controller]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!controller) return;
      const touches = event.touches;
      if (touches.length === 2 && pinchStateRef.current) {
        const t0 = touches[0];
        const t1 = touches[1];
        if (t0 && t1) {
          const distance = getTouchDistance(t0, t1);
          const midpoint = getTouchMidpoint(t0, t1);
          const scaleFactor = distance / (pinchStateRef.current.distance || 1);
          controller.zoomToPoint(midpoint, pinchStateRef.current.zoom * scaleFactor);
          const next = controller.getState();
          setPan({ x: next.panX, y: next.panY });
        }
      } else if (touches.length === 1 && touchPanStartRef.current) {
        const t0 = touches[0];
        if (t0) {
          const dx = t0.clientX - touchPanStartRef.current.x;
          const dy = t0.clientY - touchPanStartRef.current.y;
          controller.pan(dx, dy);
          touchPanStartRef.current = { x: t0.clientX, y: t0.clientY };
          const next = controller.getState();
          setPan({ x: next.panX, y: next.panY });
        }
      }
    },
    [controller]
  );

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) {
      pinchStateRef.current = null;
      touchPanStartRef.current = null;
    }
  }, []);

  // ============================================================================
  // マウスホイールズーム
  // ============================================================================

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!controller) return;
      event.preventDefault();
      const currentZoom = controller.getState().zoom;
      const delta = -event.deltaY * 0.001;
      const center = { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 };
      controller.zoomToPoint(center, currentZoom + delta);
      const next = controller.getState();
      setPan({ x: next.panX, y: next.panY });
    },
    [controller]
  );

  // ============================================================================
  // キーボード操作（Escapeで閉じる, Req 14.5）
  // ============================================================================

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const displayTitle = imageName || '画像ビューア';
  const titleId = 'construction-photo-viewer-title';
  const canShowImage = !isLoading && !error && imageUrl;

  const imageTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`;

  return (
    <div
      style={STYLES.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="construction-photo-viewer-overlay"
      onClick={handleOverlayClick}
    >
      <style>
        {`
          @keyframes construction-photo-viewer-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={STYLES.content} onClick={handleContentClick}>
        <div style={STYLES.header}>
          <h2 id={titleId} style={STYLES.title}>
            {displayTitle}
          </h2>
          <button type="button" style={STYLES.closeButton} onClick={onClose} aria-label="閉じる">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div
          ref={stageOuterRef}
          style={{
            ...STYLES.stageContainer,
            cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
          }}
          data-testid="construction-photo-viewer-stage"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onWheel={handleWheel}
        >
          {isLoading && (
            <div style={STYLES.loadingContainer}>
              <div role="status" aria-label="読み込み中" style={STYLES.spinner} />
              <p>読み込み中...</p>
            </div>
          )}

          {!isLoading && error && (
            <div role="alert" style={STYLES.errorContainer}>
              {error}
            </div>
          )}

          {canShowImage && (
            <div
              style={{
                width: `${stageWidth}px`,
                height: `${stageHeight}px`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <img
                src={imageUrl}
                alt={displayTitle}
                onLoad={handleImageLoad}
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: 'contain',
                  transformOrigin: 'center center',
                  transform: imageTransform,
                }}
              />
            </div>
          )}

          {canShowImage && (
            <>
              <ZoomControls
                zoom={zoom}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onFit={handleFit}
              />

              <div style={STYLES.rotationControls}>
                <button
                  type="button"
                  style={STYLES.rotationButton}
                  onClick={handleRotateLeft}
                  aria-label="左に回転"
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
                    aria-hidden="true"
                  >
                    <path d="M2.5 2v6h6" />
                    <path d="M2.5 8a10 10 0 1 1 3.1-4.2" />
                  </svg>
                </button>
                <span data-testid="rotation-display" style={STYLES.rotationDisplay}>
                  {formatRotationDegree(rotation)}
                </span>
                <button
                  type="button"
                  style={STYLES.rotationButton}
                  onClick={handleRotateRight}
                  aria-label="右に回転"
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
                    aria-hidden="true"
                  >
                    <path d="M21.5 2v6h-6" />
                    <path d="M21.5 8a10 10 0 1 0-3.1-4.2" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConstructionPhotoImageViewer;
