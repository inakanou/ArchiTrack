/**
 * @fileoverview 画像ビューアコンポーネント
 *
 * Task 12.1: 基本ビューア機能を実装する
 * Task 12.2: ズーム機能を実装する
 * Task 12.3: 回転機能を実装する
 * Task 12.4: パン機能を実装する
 * Task 12.5: タッチ操作対応を実装する
 * Task 12.6: 表示状態の共有機能を実装する
 * Task 29.3: 画像ビューアへのエクスポートボタン統合
 *
 * モーダル/専用画面での画像表示、Fabric.js Canvasの初期化、
 * 画像の読み込みと表示、ズーム機能、回転機能、パン機能、
 * タッチ操作（ピンチズーム、2本指パン）を提供するコンポーネントです。
 *
 * Requirements:
 * - 5.1: 画像をクリックすると画像ビューアをモーダルまたは専用画面で開く
 * - 5.2: ズームイン/ズームアウト操作で画像を拡大/縮小表示
 * - 5.3: 回転ボタンを押すと画像を90度単位で回転表示
 * - 5.4: パン操作を行うと拡大時の表示領域を移動する
 * - 5.5: ピンチ操作を行う（タッチデバイス）とズームレベルを変更する
 * - 5.6: 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
 * - 12.1: 個別画像のエクスポートオプションダイアログを表示する
 * - 13.2: タッチ操作に最適化された注釈ツールを提供する
 */

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';
import ImageExportDialog from './ImageExportDialog';
import type { ExportOptions } from './ImageExportDialog';
import type { SurveyImageInfo } from '../../types/site-survey.types';
import {
  ZOOM_CONSTANTS,
  ROTATION_CONSTANTS,
  PAN_CONSTANTS,
  TOUCH_CONSTANTS,
  type RotationAngle,
  type ImageViewerViewState,
  type ImageViewerRef,
} from './image-viewer.constants';

// 定数と型の再エクスポート（後方互換性のため）
// eslint-disable-next-line react-refresh/only-export-components
export { ZOOM_CONSTANTS, ROTATION_CONSTANTS, PAN_CONSTANTS, TOUCH_CONSTANTS };
export type { RotationAngle, ImageViewerViewState, ImageViewerRef };

/**
 * ImageViewerの内部状態
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
  /** パン中フラグ */
  isPanning: boolean;
  /** パン位置X */
  panX: number;
  /** パン位置Y */
  panY: number;
  /** タッチ操作中フラグ */
  isTouching: boolean;
}

/**
 * タッチポイントの型
 */
interface TouchPoint {
  /** X座標 */
  x: number;
  /** Y座標 */
  y: number;
  /** タッチ識別子 */
  identifier: number;
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
  /**
   * 表示状態変更時のコールバック（注釈エディタとの同期用）
   * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
   */
  onViewStateChange?: (state: ImageViewerViewState) => void;
  /**
   * 初期表示状態（注釈エディタから復元する際に使用）
   * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
   */
  initialViewState?: ImageViewerViewState;
  /**
   * 画像情報（エクスポート機能を有効にするために必要）
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  imageInfo?: SurveyImageInfo;
  /**
   * エクスポート実行時のコールバック
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  onExport?: (options: ExportOptions) => void;
  /**
   * 元画像ダウンロード時のコールバック
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  onDownloadOriginal?: () => void;
  /**
   * エクスポート処理中フラグ
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  exporting?: boolean;
  /**
   * ダウンロード処理中フラグ
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  downloading?: boolean;
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
  // エクスポートコントロール用スタイル
  exportControls: {
    position: 'absolute' as const,
    bottom: '24px',
    left: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    padding: '8px 16px',
  },
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'background-color 0.2s, border-color 0.2s',
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
 *
 * Task 12.6: forwardRefで表示状態の共有機能を提供
 * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
 */
const ImageViewer = forwardRef<ImageViewerRef, ImageViewerProps>(function ImageViewer(
  {
    imageUrl,
    isOpen,
    onClose,
    imageName,
    onViewStateChange,
    initialViewState,
    imageInfo,
    onExport,
    onDownloadOriginal,
    exporting = false,
    downloading = false,
  },
  ref
) {
  // DOM参照
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fabric.js Canvas参照
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // 初期状態の決定（initialViewStateがあれば使用、なければデフォルト）
  const getInitialState = (): ImageViewerState => ({
    isLoading: true,
    error: null,
    zoom: initialViewState?.zoom ?? 1,
    rotation: initialViewState?.rotation ?? 0,
    isPanning: false,
    panX: initialViewState?.panX ?? 0,
    panY: initialViewState?.panY ?? 0,
    isTouching: false,
  });

  // 状態管理
  const [state, setState] = useState<ImageViewerState>(getInitialState);

  // エクスポートダイアログの開閉状態
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

  // 背景画像への参照
  const backgroundImageRef = useRef<FabricImage | null>(null);

  // パン操作用の参照
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPanPositionRef = useRef<{ x: number; y: number }>({
    x: initialViewState?.panX ?? 0,
    y: initialViewState?.panY ?? 0,
  });

  // タッチ操作用の参照
  const touchStartPointsRef = useRef<TouchPoint[]>([]);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(initialViewState?.zoom ?? 1);
  const touchPanStartRef = useRef<{ x: number; y: number } | null>(null);

  // onViewStateChange参照（useCallbackで最新の値を参照するため）
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;

  // 状態のrefを保持（コールバックで最新の状態を参照するため）
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * 表示状態変更を通知
   * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
   */
  const notifyViewStateChange = useCallback(
    (newState: Partial<ImageViewerViewState>) => {
      if (onViewStateChangeRef.current) {
        // refから最新の状態を取得してマージ
        const currentState = stateRef.current;
        onViewStateChangeRef.current({
          zoom: newState.zoom ?? currentState.zoom,
          rotation: newState.rotation ?? currentState.rotation,
          panX: newState.panX ?? currentState.panX,
          panY: newState.panY ?? currentState.panY,
        });
      }
    },
    [] // 依存配列を空にしてメモ化を安定させる
  );

  /**
   * 外部から表示状態を設定
   * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
   */
  const setViewState = useCallback(
    (newState: Partial<ImageViewerViewState>) => {
      const canvas = fabricCanvasRef.current;
      const img = backgroundImageRef.current;

      // ズームとパン位置を設定
      if (canvas) {
        const newZoom = newState.zoom !== undefined ? clampZoom(newState.zoom) : state.zoom;
        const newPanX = newState.panX ?? state.panX;
        const newPanY = newState.panY ?? state.panY;

        canvas.setViewportTransform([newZoom, 0, 0, newZoom, newPanX, newPanY]);
        lastPanPositionRef.current = { x: newPanX, y: newPanY };
        canvas.renderAll();
      }

      // 回転を設定
      if (img && newState.rotation !== undefined) {
        const newRotation = normalizeRotation(newState.rotation);
        const imgWidth = img.width || 1;
        const imgHeight = img.height || 1;

        img.set({
          angle: newRotation,
          originX: 'center',
          originY: 'center',
          left: (imgWidth * (img.scaleX || 1)) / 2,
          top: (imgHeight * (img.scaleY || 1)) / 2,
        });

        if (canvas) {
          canvas.renderAll();
        }
      }

      // 状態を更新
      setState((prev) => ({
        ...prev,
        zoom: newState.zoom !== undefined ? clampZoom(newState.zoom) : prev.zoom,
        rotation:
          newState.rotation !== undefined ? normalizeRotation(newState.rotation) : prev.rotation,
        panX: newState.panX ?? prev.panX,
        panY: newState.panY ?? prev.panY,
      }));
    },
    [state.zoom, state.panX, state.panY]
  );

  /**
   * 現在の表示状態を取得
   * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
   */
  const getViewState = useCallback((): ImageViewerViewState => {
    return {
      zoom: state.zoom,
      rotation: state.rotation,
      panX: state.panX,
      panY: state.panY,
    };
  }, [state.zoom, state.rotation, state.panX, state.panY]);

  /**
   * refを通じてメソッドを公開
   * Requirements: 5.6 - 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
   */
  useImperativeHandle(
    ref,
    () => ({
      getViewState,
      setViewState,
    }),
    [getViewState, setViewState]
  );

  /**
   * ズームレベルを設定
   */
  const setZoom = useCallback(
    (newZoom: number) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const clampedZoom = clampZoom(newZoom);

      // ズームが1.0以下になったらパン位置もリセット
      if (clampedZoom <= 1) {
        canvas.setViewportTransform([clampedZoom, 0, 0, clampedZoom, 0, 0]);
        lastPanPositionRef.current = { x: 0, y: 0 };
        setState((prev) => ({ ...prev, zoom: clampedZoom, panX: 0, panY: 0 }));
        notifyViewStateChange({ zoom: clampedZoom, panX: 0, panY: 0 });
      } else {
        // ズームが1より大きい場合、現在のパン位置を維持
        const currentPanX = lastPanPositionRef.current.x;
        const currentPanY = lastPanPositionRef.current.y;
        canvas.setViewportTransform([clampedZoom, 0, 0, clampedZoom, currentPanX, currentPanY]);
        setState((prev) => ({ ...prev, zoom: clampedZoom }));
        notifyViewStateChange({ zoom: clampedZoom });
      }
      canvas.renderAll();
    },
    [notifyViewStateChange]
  );

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
  const applyRotation = useCallback(
    (newRotation: RotationAngle) => {
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
      notifyViewStateChange({ rotation: newRotation });
    },
    [notifyViewStateChange]
  );

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

  // ============================================================================
  // パン操作関連
  // ============================================================================

  /**
   * パン操作が有効かどうかをチェック
   */
  const isPanEnabled = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return false;
    return canvas.getZoom() >= PAN_CONSTANTS.MIN_PAN_ZOOM;
  }, []);

  /**
   * ビューポートトランスフォームを適用
   */
  const applyPan = useCallback(
    (deltaX: number, deltaY: number) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas || !isPanEnabled()) return;

      const newPanX = lastPanPositionRef.current.x + deltaX;
      const newPanY = lastPanPositionRef.current.y + deltaY;

      // ビューポートトランスフォームを更新
      // [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const zoom = canvas.getZoom();
      canvas.setViewportTransform([zoom, 0, 0, zoom, newPanX, newPanY]);
      canvas.renderAll();

      lastPanPositionRef.current = { x: newPanX, y: newPanY };
      setState((prev) => ({ ...prev, panX: newPanX, panY: newPanY }));
    },
    [isPanEnabled]
  );

  /**
   * ドラッグによるパン操作開始
   */
  const handlePanStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // 左クリックのみ（button === 0）
      if (event.button !== 0) return;
      if (!isPanEnabled()) return;

      panStartRef.current = { x: event.clientX, y: event.clientY };
      setState((prev) => ({ ...prev, isPanning: true }));
    },
    [isPanEnabled]
  );

  /**
   * ドラッグによるパン操作中
   */
  const handlePanMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!state.isPanning || !panStartRef.current) return;

      const deltaX = event.clientX - panStartRef.current.x;
      const deltaY = event.clientY - panStartRef.current.y;

      // 一時的なパン位置を計算（ドラッグ開始時からの差分 + 保存済みの位置）
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const tempPanX = lastPanPositionRef.current.x + deltaX;
      const tempPanY = lastPanPositionRef.current.y + deltaY;

      const zoom = canvas.getZoom();
      canvas.setViewportTransform([zoom, 0, 0, zoom, tempPanX, tempPanY]);
      canvas.renderAll();
    },
    [state.isPanning]
  );

  /**
   * ドラッグによるパン操作終了
   */
  const handlePanEnd = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!state.isPanning || !panStartRef.current) {
        panStartRef.current = null;
        setState((prev) => ({ ...prev, isPanning: false }));
        return;
      }

      const deltaX = event.clientX - panStartRef.current.x;
      const deltaY = event.clientY - panStartRef.current.y;

      // 最終的なパン位置を保存
      const newPanX = lastPanPositionRef.current.x + deltaX;
      const newPanY = lastPanPositionRef.current.y + deltaY;

      lastPanPositionRef.current = { x: newPanX, y: newPanY };
      panStartRef.current = null;

      setState((prev) => ({ ...prev, isPanning: false, panX: newPanX, panY: newPanY }));
      notifyViewStateChange({ panX: newPanX, panY: newPanY });
    },
    [state.isPanning, notifyViewStateChange]
  );

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
   * キーボードイベントハンドラ（ESC、ズームショートカット、回転ショートカット、パンショートカット含む）
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
        // パンショートカット（矢印キー）
        case 'ArrowUp':
          event.preventDefault();
          applyPan(0, PAN_CONSTANTS.KEYBOARD_PAN_STEP);
          break;
        case 'ArrowDown':
          event.preventDefault();
          applyPan(0, -PAN_CONSTANTS.KEYBOARD_PAN_STEP);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          applyPan(PAN_CONSTANTS.KEYBOARD_PAN_STEP, 0);
          break;
        case 'ArrowRight':
          event.preventDefault();
          applyPan(-PAN_CONSTANTS.KEYBOARD_PAN_STEP, 0);
          break;
      }
    },
    [
      onClose,
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
      handleRotateLeft,
      handleRotateRight,
      applyPan,
    ]
  );

  // ============================================================================
  // タッチ操作関連
  // ============================================================================

  /**
   * 2点間の距離を計算
   */
  const getDistance = useCallback((p1: TouchPoint, p2: TouchPoint): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  /**
   * 2点の中心点を計算
   */
  const getMidpoint = useCallback((p1: TouchPoint, p2: TouchPoint): { x: number; y: number } => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  }, []);

  /**
   * TouchListからTouchPoint配列を生成
   */
  const getTouchPoints = useCallback((touches: React.TouchList): TouchPoint[] => {
    const points: TouchPoint[] = [];
    for (let i = 0; i < touches.length; i++) {
      // 配列インデックスアクセスを使用（テスト環境との互換性のため）
      const touch = touches[i];
      if (touch) {
        points.push({
          x: touch.clientX,
          y: touch.clientY,
          identifier: touch.identifier,
        });
      }
    }
    return points;
  }, []);

  /**
   * ピンチズームを適用
   */
  const applyPinchZoom = useCallback((newZoom: number, centerX: number, centerY: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // ズーム範囲を制限
    const clampedZoom = clampZoom(newZoom);

    // ズームの中心点を基準にビューポートトランスフォームを計算
    const currentPanX = lastPanPositionRef.current.x;
    const currentPanY = lastPanPositionRef.current.y;

    // 新しいパン位置を計算（ズーム中心点を維持）
    const zoomRatio = clampedZoom / initialZoomRef.current;
    const newPanX = centerX - (centerX - currentPanX) * zoomRatio;
    const newPanY = centerY - (centerY - currentPanY) * zoomRatio;

    // ビューポートトランスフォームを適用
    canvas.setViewportTransform([clampedZoom, 0, 0, clampedZoom, newPanX, newPanY]);
    canvas.renderAll();

    lastPanPositionRef.current = { x: newPanX, y: newPanY };
    setState((prev) => ({ ...prev, zoom: clampedZoom, panX: newPanX, panY: newPanY }));
  }, []);

  /**
   * タッチ開始ハンドラ
   */
  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touches = getTouchPoints(event.touches);
      touchStartPointsRef.current = touches;

      if (touches.length === 2) {
        // 2本指：ピンチズームまたはパン操作の開始
        const touch0 = touches[0];
        const touch1 = touches[1];
        if (touch0 && touch1) {
          const distance = getDistance(touch0, touch1);
          const midpoint = getMidpoint(touch0, touch1);

          initialPinchDistanceRef.current = distance;
          initialZoomRef.current = fabricCanvasRef.current?.getZoom() || 1;
          touchPanStartRef.current = midpoint;
        }
      } else if (touches.length === 1) {
        // 1本指：パン操作の開始（ズーム状態の時のみ）
        const touch0 = touches[0];
        if (isPanEnabled() && touch0) {
          touchPanStartRef.current = { x: touch0.x, y: touch0.y };
        }
      }

      setState((prev) => ({ ...prev, isTouching: true }));
    },
    [getTouchPoints, getDistance, getMidpoint, isPanEnabled]
  );

  /**
   * タッチ移動ハンドラ
   */
  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      event.preventDefault();
      const touches = getTouchPoints(event.touches);

      if (touches.length === 2 && initialPinchDistanceRef.current !== null) {
        // 2本指：ピンチズーム処理
        const touch0 = touches[0];
        const touch1 = touches[1];
        if (touch0 && touch1) {
          const currentDistance = getDistance(touch0, touch1);
          const distanceDelta = currentDistance - initialPinchDistanceRef.current;

          // 距離の変化量が閾値を超えた場合のみズーム
          if (Math.abs(distanceDelta) >= TOUCH_CONSTANTS.PINCH_THRESHOLD) {
            const zoomDelta = distanceDelta * TOUCH_CONSTANTS.PINCH_ZOOM_FACTOR;
            const newZoom = initialZoomRef.current + zoomDelta;
            const midpoint = getMidpoint(touch0, touch1);

            applyPinchZoom(newZoom, midpoint.x, midpoint.y);
          }

          // 2本指パン操作（ズーム状態の時）
          if (isPanEnabled() && touchPanStartRef.current) {
            const currentMidpoint = getMidpoint(touch0, touch1);
            const deltaX = currentMidpoint.x - touchPanStartRef.current.x;
            const deltaY = currentMidpoint.y - touchPanStartRef.current.y;

            const canvas = fabricCanvasRef.current;
            if (canvas) {
              const zoom = canvas.getZoom();
              const newPanX = lastPanPositionRef.current.x + deltaX;
              const newPanY = lastPanPositionRef.current.y + deltaY;

              canvas.setViewportTransform([zoom, 0, 0, zoom, newPanX, newPanY]);
              canvas.renderAll();

              // 一時的なパン位置（touchendで確定）
            }
          }
        }
      } else if (touches.length === 1 && isPanEnabled() && touchPanStartRef.current) {
        // 1本指パン操作（ズーム状態の時のみ）
        const touch0 = touches[0];
        if (touch0) {
          const deltaX = touch0.x - touchPanStartRef.current.x;
          const deltaY = touch0.y - touchPanStartRef.current.y;

          const canvas = fabricCanvasRef.current;
          if (canvas) {
            const zoom = canvas.getZoom();
            const newPanX = lastPanPositionRef.current.x + deltaX;
            const newPanY = lastPanPositionRef.current.y + deltaY;

            canvas.setViewportTransform([zoom, 0, 0, zoom, newPanX, newPanY]);
            canvas.renderAll();
          }
        }
      }
    },
    [getTouchPoints, getDistance, getMidpoint, applyPinchZoom, isPanEnabled]
  );

  /**
   * タッチ終了ハンドラ
   */
  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touches = getTouchPoints(event.touches);

      // 最後のパン位置を確定
      if (touchPanStartRef.current && touchStartPointsRef.current.length >= 1) {
        const canvas = fabricCanvasRef.current;
        if (canvas) {
          const vpt = canvas.viewportTransform;
          if (vpt) {
            lastPanPositionRef.current = { x: vpt[4], y: vpt[5] };
            setState((prev) => ({ ...prev, panX: vpt[4], panY: vpt[5] }));
          }
        }
      }

      // タッチがすべて離れた場合はリセット
      if (touches.length === 0) {
        touchStartPointsRef.current = [];
        initialPinchDistanceRef.current = null;
        touchPanStartRef.current = null;
        setState((prev) => ({ ...prev, isTouching: false }));
      } else {
        // まだタッチが残っている場合は更新
        touchStartPointsRef.current = touches;
        if (touches.length === 1) {
          // 1本指に戻った場合、パン開始位置を更新
          const touch0 = touches[0];
          if (touch0) {
            touchPanStartRef.current = { x: touch0.x, y: touch0.y };
          }
          initialPinchDistanceRef.current = null;
        }
      }
    },
    [getTouchPoints]
  );

  /**
   * タッチキャンセルハンドラ
   */
  const handleTouchCancel = useCallback(() => {
    touchStartPointsRef.current = [];
    initialPinchDistanceRef.current = null;
    touchPanStartRef.current = null;
    setState((prev) => ({ ...prev, isTouching: false }));
  }, []);

  // ============================================================================
  // エクスポートダイアログ関連
  // ============================================================================

  /**
   * エクスポートダイアログを開く
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  const handleOpenExportDialog = useCallback(() => {
    setIsExportDialogOpen(true);
  }, []);

  /**
   * エクスポートダイアログを閉じる
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  const handleCloseExportDialog = useCallback(() => {
    setIsExportDialogOpen(false);
  }, []);

  /**
   * エクスポート実行
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  const handleExport = useCallback(
    (options: ExportOptions) => {
      if (onExport) {
        onExport(options);
      }
    },
    [onExport]
  );

  /**
   * 元画像ダウンロード実行
   * Task 29.3: 画像ビューアへのエクスポートボタン統合
   */
  const handleDownloadOriginal = useCallback(() => {
    if (onDownloadOriginal) {
      onDownloadOriginal();
    }
  }, [onDownloadOriginal]);

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
  const loadImage = useCallback(
    async (canvas: FabricCanvas, url: string) => {
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

        // 初期状態を適用（initialViewStateがある場合）
        const initZoom = initialViewState?.zoom ?? 1;
        const initRotation = initialViewState?.rotation ?? 0;
        const initPanX = initialViewState?.panX ?? 0;
        const initPanY = initialViewState?.panY ?? 0;

        // ズームとパン位置を設定
        if (initialViewState) {
          // initialViewStateが指定されている場合のみviewportTransformで設定
          canvas.setViewportTransform([initZoom, 0, 0, initZoom, initPanX, initPanY]);
        } else {
          // デフォルトの場合はsetZoom(1)を使用（既存のテストとの互換性）
          canvas.setZoom(1);
        }

        // 回転を適用
        if (initRotation !== 0) {
          img.set({
            angle: initRotation,
            originX: 'center',
            originY: 'center',
            left: (imgWidth * scale) / 2,
            top: (imgHeight * scale) / 2,
          });
        }

        canvas.renderAll();

        const newState = {
          isLoading: false,
          error: null,
          zoom: initZoom,
          rotation: initRotation,
          isPanning: false,
          panX: initPanX,
          panY: initPanY,
          isTouching: false,
        };
        setState(newState);
        lastPanPositionRef.current = { x: initPanX, y: initPanY };
        touchStartPointsRef.current = [];
        initialPinchDistanceRef.current = null;
        initialZoomRef.current = initZoom;
        touchPanStartRef.current = null;

        // 初期状態を通知
        notifyViewStateChange({
          zoom: initZoom,
          rotation: initRotation,
          panX: initPanX,
          panY: initPanY,
        });
      } catch (err) {
        console.error('画像の読み込みに失敗しました:', err);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : '画像の読み込みに失敗しました',
        }));
      }
    },
    [initialViewState, notifyViewStateChange]
  );

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
            style={{
              ...STYLES.canvasContainer,
              cursor:
                state.isPanning || state.isTouching
                  ? 'grabbing'
                  : state.zoom > 1
                    ? 'grab'
                    : 'default',
              touchAction: 'none', // タッチ操作のデフォルト動作を無効化
            }}
            data-testid="canvas-container"
            onWheel={handleWheel}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
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

            {/* エクスポートボタン - imageInfoが提供されている場合のみ表示 */}
            {!state.isLoading && !state.error && imageInfo && (
              <div style={STYLES.exportControls}>
                <button
                  type="button"
                  style={STYLES.exportButton}
                  onClick={handleOpenExportDialog}
                  aria-label="エクスポート"
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  エクスポート
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* エクスポートダイアログ */}
      {imageInfo && (
        <ImageExportDialog
          open={isExportDialogOpen}
          imageInfo={imageInfo}
          onExport={handleExport}
          onClose={handleCloseExportDialog}
          onDownloadOriginal={onDownloadOriginal ? handleDownloadOriginal : undefined}
          exporting={exporting}
          downloading={downloading}
        />
      )}
    </>
  );
});

export default ImageViewer;
