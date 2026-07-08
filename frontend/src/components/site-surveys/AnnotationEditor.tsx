/**
 * @fileoverview 注釈エディタ基盤コンポーネント
 *
 * Task 13.1: Fabric.js Canvas統合を実装する
 * Task 13.2: ツール切り替えUIを実装する
 * Task 13.3: オブジェクト選択・操作機能を実装する
 *
 * useRef + useEffectによるCanvas初期化、dispose処理の実装（クリーンアップ）、
 * 背景画像の設定、ツールバー統合、オブジェクト選択・移動・リサイズ・削除機能を行うコンポーネントです。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 6.4: 既存の寸法線をクリックすると寸法線を選択状態にして編集可能にする
 * - 6.5: 寸法線の端点をドラッグすると寸法線の位置を調整する
 * - 6.6: 選択中の寸法線を削除すると寸法線を画像から除去する
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 * - 7.7: 既存の図形をクリックすると図形を選択状態にして編集可能にする
 * - 7.8: 選択中の図形をドラッグすると図形の位置を移動する
 * - 7.9: 選択中の図形のハンドルをドラッグすると図形のサイズを変更する
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 *
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-27.2
 * @requirement site-survey/REQ-27.3
 * @requirement site-survey/REQ-27.4
 * @requirement site-survey/REQ-27.5
 * @requirement site-survey/REQ-27.7
 * @requirement site-survey/REQ-27.8
 * @requirement site-survey/REQ-27.9
 * @requirement site-survey/REQ-27.10
 * @requirement site-survey/REQ-29.1
 * @requirement site-survey/REQ-29.2
 * @requirement site-survey/REQ-29.4
 * @requirement site-survey/REQ-29.5
 * @requirement site-survey/REQ-29.7
 * @requirement site-survey/REQ-29.8
 * @requirement site-survey/REQ-30.1
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Canvas as FabricCanvas,
  FabricImage,
  FabricObject,
  PencilBrush,
  Polyline,
  type TPointerEventInfo,
  type TPointerEvent,
} from 'fabric';
import AnnotationToolbar, { type ToolType, type StyleOptions } from './AnnotationToolbar';
import { AnnotationContextMenu, type ContextMenuAction } from './AnnotationContextMenu';
import { AnnotationGuide } from './AnnotationGuide';
import { GUIDE_IDLE_MS, COOLDOWN_MS } from './gestures/gesture-thresholds';
import { createArrow } from './tools/ArrowTool';
import { createCircle } from './tools/CircleTool';
import { createRectangle } from './tools/RectangleTool';
import { PolygonBuilder, createPolygon } from './tools/PolygonTool';
import { PolylineBuilder, createPolyline } from './tools/PolylineTool';
import { DEFAULT_FREEHAND_OPTIONS } from './tools/FreehandTool';
import { createDimensionLine } from './tools/DimensionTool';
import { createTextAnnotation } from './tools/TextTool';
import { UndoManager } from '../../services/UndoManager';
import { useFabricUndoIntegration } from '../../hooks/useFabricUndoIntegration';
import { saveAnnotation, getAnnotation, updateThumbnail } from '../../api/survey-annotations';
import { ApiError } from '../../api/client';
import { exportImage, downloadFile, downloadOriginalImage } from '../../services/ExportService';
import { useToast } from '../../hooks/useToast';
import ImageExportDialog from './ImageExportDialog';
import type { ExportOptions } from './ImageExportDialog';
import type { SurveyImageInfo } from '../../types/site-survey.types';
import { util } from 'fabric';
// カスタムシェイプをFabric.jsクラスレジストリに登録（enlivenObjectsで復元するために必要）
import './tools/registerCustomShapes';
// Task 72.1: タッチジェスチャー統合 (Req 27.1, 27.2, 30.1) とハンドルサイズ設定 (Req 29.4, 29.5)
import { createTouchGestureManager } from './gestures/touchGestureManager';
import type { GesturePayload } from './gestures/touchGestureManager';
import { configureHandleSizes, applyToolCursor } from './annotation-visual-feedback';
// Task 96.1: ビューポート制御（ズーム/パン）の React 橋渡しフックとズーム操作UI (Req 33.9, 34.1, 34.2, 34.8)
import { useCanvasViewport } from '../../hooks/useCanvasViewport';
import type { FabricCanvasLike } from './gestures/canvasViewportController';
import ZoomControls from './ZoomControls';
// Task 101.1 (Req 36.1, 36.2, 36.4): フィット倍率算出の一元化・コンテナ実寸購読・モバイル判定。
// フィット計算は computeFitScale（原寸頭打ち/拡大許容を allowUpscale で制御）へ移行し、
// useElementSize でコンテナ実寸の変化に追従して再フィットする。
import { computeFitScale } from '../../utils/imageFitScale';
import useElementSize from '../../hooks/useElementSize';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';

// windowオブジェクトにFabricキャンバスを公開するための型拡張（E2Eテスト用）
declare global {
  interface Window {
    __fabricCanvas?: FabricCanvas | null;
  }
}

/**
 * ドラッグ状態を管理する型
 */
interface DragState {
  isDragging: boolean;
  startPoint: { x: number; y: number } | null;
}

// ============================================================================
// 型定義
// ============================================================================

/**
 * デフォルトのスタイルオプション
 */
const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  strokeColor: '#ff0000',
  strokeWidth: 2,
  fillColor: '',
  fontSize: 16,
};

/**
 * Task 96.3 (Req 33.8): 空き領域ダブルタップによるズームトグルの拡大倍率。
 * 等倍（フィット）状態でダブルタップした際に当該タップ点を中心へこの倍率で拡大する。
 */
const DOUBLE_TAP_ZOOM_SCALE = 2;

/**
 * Task 96.3 (Req 33.8): ダブルタップズームトグルで「等倍（フィット）相当」とみなす許容差。
 * 現在ズームが `1 + この値` 以下なら拡大、超えていれば fit() で全体表示へ戻す。
 */
const DOUBLE_TAP_ZOOM_EPSILON = 0.01;

/**
 * Task 101.1 (Req 33.7, 36.8): 再フィット時に「等倍表示中（＝初期化状態）」とみなすズーム許容誤差。
 * これを超えるズーム/パン中はユーザーの表示状態を保持し、再フィット（キャンバス寸法の再計算・
 * viewport の恒等リセット）を適用しない。design.md「再フィットフロー」Key decisions を参照。
 */
const REFIT_IDENTITY_ZOOM_EPSILON = 0.01;

/**
 * AnnotationEditorの状態
 */
interface AnnotationEditorState {
  /** 読み込み中フラグ */
  isLoading: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** 現在選択中のツール */
  activeTool: ToolType;
  /** スタイルオプション */
  styleOptions: StyleOptions;
  /** Undo可能かどうか */
  canUndo: boolean;
  /** Redo可能かどうか */
  canRedo: boolean;
  /** 保存中フラグ */
  isSaving: boolean;
  /** 保存成功メッセージ */
  saveSuccess: boolean;
  /** 背景画像の回転角度 */
  imageRotation: 0 | 90 | 180 | 270;
}

/**
 * AnnotationEditorのProps
 */
export interface AnnotationEditorProps {
  /** 表示する画像のURL */
  imageUrl: string;
  /** 画像ID */
  imageId: string;
  /** 調査ID */
  surveyId: string;
  /** 初期ズーム値（REQ-5.6: ビューアとの状態共有用） */
  initialZoom?: number;
  /** 初期回転角度（REQ-5.6: ビューアとの状態共有用） */
  initialRotation?: number;
  /** 初期パン位置（REQ-5.6: ビューアとの状態共有用） */
  initialPan?: { x: number; y: number };
  /** 閲覧専用モード（REQ-9.2: 注釈を表示するが編集は不可） */
  readOnly?: boolean;
  /** 画像情報（ImageExportDialog用、REQ-12.2, 12.3, 12.4） */
  imageInfo?: SurveyImageInfo;
  /** 注釈保存成功時のコールバック（REQ-23.5: サムネイルURL反映用） */
  onAnnotationSaved?: (result: { annotatedThumbnailUrl: string | null }) => void;
  /** 画像一覧の強制再取得コールバック（REQ-23.6: サムネイル再生成失敗時の旧状態残留防止） */
  onRequestRefresh?: () => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
  },
  toolbarContainer: {
    padding: '8px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    zIndex: 20,
  },
  container: {
    position: 'relative' as const,
    flex: 1,
    width: '100%',
    minHeight: '400px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasWrapper: {
    position: 'relative' as const,
    // Task 96.2 (Req 33.5, 30.1): ブラウザ既定のタッチジェスチャー（スクロール/ピンチズーム等）を
    // 抑止し、touchGestureManager の PointerEvent ベース調停にジェスチャーを一本化する。
    touchAction: 'none' as const,
  },
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 10,
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(0, 0, 0, 0.1)',
    borderTop: '4px solid #3b82f6',
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
    zIndex: 10,
  },
  errorMessage: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px 24px',
    color: '#991b1b',
    textAlign: 'center' as const,
    maxWidth: '400px',
  },
  savingOverlay: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    zIndex: 20,
  },
  savingSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(59, 130, 246, 0.3)',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  savingText: {
    fontSize: '14px',
    color: '#374151',
  },
  successMessage: {
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    zIndex: 20,
  },
  successText: {
    fontSize: '14px',
    color: '#065f46',
  },
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 注釈エディタ基盤コンポーネント
 *
 * Fabric.js Canvasを使用して画像上に注釈を描画するための基盤コンポーネントです。
 *
 * Task 13.1: Fabric.js Canvas統合
 * - useRef + useEffectによるCanvas初期化
 * - dispose処理の実装（クリーンアップ）
 * - 背景画像の設定
 *
 * Task 13.2: ツール切り替えUI
 * - ツールバーコンポーネント統合
 * - 選択ツール、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキストの切り替え
 * - アクティブツールの視覚的フィードバック
 *
 * Task 13.3: オブジェクト選択・操作機能
 * - クリックによるオブジェクト選択
 * - 選択オブジェクトのハイライト表示（コントロール、ボーダー）
 * - ドラッグによる移動
 * - ハンドルによるリサイズ
 * - Delete/Backspaceキーによる削除
 * - Escapeキーによる選択解除
 */
function AnnotationEditor({
  imageUrl,
  imageId,
  surveyId,
  initialZoom,
  initialPan,
  readOnly = false,
  imageInfo,
  onAnnotationSaved,
  onRequestRefresh,
}: AnnotationEditorProps): React.JSX.Element {
  // Toast通知フック（REQ-23.6: サムネイル再生成失敗時のエラー通知用）
  const toast = useToast();
  // DOM参照 - Canvas要素を動的に挿入するコンテナ
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fabric.js Canvas参照
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // 背景画像参照
  const backgroundImageRef = useRef<FabricImage | null>(null);

  // Canvas dispose状態を追跡（React StrictModeでの二重マウント対応）
  const isDisposedRef = useRef(false);

  /** 背景画像の累積回転角度を管理するRef (Req 22.1, 22.8) */
  const imageRotationRef = useRef<0 | 90 | 180 | 270>(0);

  // Canvas要素参照（動的に生成）
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  // Task 101.1 (Req 36.1, 36.2, 35.7): モバイル幅ではフィット倍率まで拡大許容（allowUpscale=true）、
  // デスクトップは原寸頭打ち（allowUpscale=false）で現行挙動を維持する。
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  // loadImage（useCallback）と再フィット effect の依存を安定させるため、最新値は ref 経由で参照する。
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  // Task 101.1 (Req 36.4): コンテナ実寸を購読し、アドレスバー伸縮・端末回転・レイアウト変化などの
  // resize に追従して再フィットを発火する（フィット適用は下部の専用 effect が担う）。
  const containerSize = useElementSize(containerRef);

  // 状態管理
  const [state, setState] = useState<AnnotationEditorState>({
    isLoading: true,
    error: null,
    activeTool: 'select',
    styleOptions: DEFAULT_STYLE_OPTIONS,
    canUndo: false,
    canRedo: false,
    isSaving: false,
    saveSuccess: false,
    imageRotation: 0,
  });

  // エクスポートダイアログの状態管理（REQ-12.2, 12.3, 12.4）
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Task 72.2 (Req 27.10): 長押し由来コンテキストメニューの表示状態。
  // 実際の描画は Task 72.3 で AnnotationContextMenu コンポーネントをマウントする際に行う。
  // 本タスクでは state と配線のみを提供する。
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number } | null;
    targetObject: FabricObject | null;
  }>({ visible: false, position: null, targetObject: null });

  // Task 72.4 (Req 29.7, 29.8): AnnotationGuide の表示状態と idle タイマ参照。
  // ツール選択後 GUIDE_IDLE_MS (=3000ms) 間描画操作が無ければ guideVisible=true にし、
  // 描画開始 (mouse:down) もしくは別ツールへの切替で dismiss する。
  const [guideVisible, setGuideVisible] = useState(false);
  const guideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存成功メッセージを 3 秒後に消すための timer 参照（unmount 後の setState を防止）
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UndoManagerインスタンス（コンポーネントのライフサイクル間で維持）
  const undoManagerRef = useRef<UndoManager | null>(null);
  if (!undoManagerRef.current) {
    undoManagerRef.current = new UndoManager(50);
  }
  const undoManager = undoManagerRef.current;

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

  // ドラッグ状態管理（描画ツール用）
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    startPoint: null,
  });

  // 現在のアクティブツールを追跡（イベントハンドラ内でアクセスするため）
  const activeToolRef = useRef<ToolType>('select');

  // 現在のスタイルオプションを追跡（イベントハンドラ内でアクセスするため）
  const styleOptionsRef = useRef<StyleOptions>(DEFAULT_STYLE_OPTIONS);

  // 多角形ビルダー（多角形ツール用）
  const polygonBuilderRef = useRef<PolygonBuilder | null>(null);

  // 折れ線ビルダー（折れ線ツール用）
  const polylineBuilderRef = useRef<PolylineBuilder | null>(null);

  // 編集中のテキスト参照（テキストツールの編集解除用）
  const editingTextRef = useRef<boolean>(false);

  // プレビュー用オブジェクト参照（描画途中のプレビュー表示用）
  const previewShapeRef = useRef<FabricObject | null>(null);

  // Task 72.1: touchGestureManager の detach 関数参照（unmount 時に detach するため）
  const touchGestureDetachRef = useRef<(() => void) | null>(null);

  // Task 96.1: initialZoom/initialPan を canvas ごとに一度だけ適用するためのガード参照。
  const initialViewAppliedRef = useRef(false);

  // Task 96.2 (Req 33.5, 30.1): 2本指ジェスチャー突入時に退避する描画モード（isDrawingMode）。
  // cooldown→idle 復帰時に、退避値と選択中ツールに応じて isDrawingMode を復元する。
  const prevDrawingModeRef = useRef(false);

  // Task 96.2 (Req 33.7): ジェスチャー終了（cooldown→idle）を検出して描画モードを復元するための
  // ポーリングタイマ参照。touchGestureManager は終了コールバックを持たないため、
  // getTouchState() をポーリングして idle 復帰を捉える。
  const gestureRestoreTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fabric.js と UndoManager の連携フック
  // fabricCanvasRef.currentを使用（Canvasがない場合はnull）
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);

  // Task 96.1 (Req 33.9, 34.1-34.4): canvasViewportController と React 状態（現在倍率）を
  // 橋渡しするフック。生成される単一の controller を touchGestureManager（attach の
  // viewportController）と ZoomControls（zoom/zoomIn/zoomOut/fit）で共有する。
  const {
    zoom,
    zoomIn,
    zoomOut,
    fit,
    controller: viewportController,
  } = useCanvasViewport({
    canvas: fabricCanvas as unknown as FabricCanvasLike | null,
  });
  // Task 96.3 (Req 33.8): handleDoubleTap から最新の viewportController を参照するための ref。
  // handleDoubleTap の依存を空に保ち、canvas 初期化 effect の再実行（dispose/再生成）を避ける。
  const viewportControllerRef = useRef(viewportController);
  viewportControllerRef.current = viewportController;
  const { setProgrammaticOperation } = useFabricUndoIntegration({
    canvas: fabricCanvas,
    undoManager,
    enabled: !state.isLoading,
  });
  // プログラム的操作フラグをrefに保存（イベントハンドラ内で使用）
  const setProgrammaticRef = useRef(setProgrammaticOperation);
  setProgrammaticRef.current = setProgrammaticOperation;

  // UndoManager状態変更コールバック設定
  useEffect(() => {
    undoManager.setOnChange((undoState) => {
      setState((prev) => ({
        ...prev,
        canUndo: undoState.canUndo,
        canRedo: undoState.canRedo,
      }));
    });

    return () => {
      undoManager.setOnChange(null);
    };
  }, [undoManager]);

  /**
   * Task 72.3 (Req 27.4): コンテキストメニュー表示中は canvas.skipTargetFind = true にし、
   * 背景画像への新規描画操作（ヒットテスト/選択）を抑止する。メニュー非表示時は false に戻す。
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.skipTargetFind = contextMenu.visible;
  }, [contextMenu.visible]);

  /**
   * Task 72.4 (Req 29.7, 29.8): ツール選択変更時に idle タイマ (GUIDE_IDLE_MS=3000ms) を開始し、
   * 3 秒間描画操作が無い場合に AnnotationGuide を visible にする。
   *
   * - select ツールはガイド対象外（操作ヒント不要）
   * - ツール変更のたびにガイドを一旦非表示にし、新しいタイマを設定する
   * - クリーンアップ時は進行中のタイマを破棄する
   */
  useEffect(() => {
    // ツール変更時にまず非表示へ戻す
    setGuideVisible(false);
    if (guideTimerRef.current) {
      clearTimeout(guideTimerRef.current);
      guideTimerRef.current = null;
    }

    // select は簡易ガイドの対象外
    if (state.activeTool === 'select') {
      return;
    }

    guideTimerRef.current = setTimeout(() => {
      setGuideVisible(true);
      guideTimerRef.current = null;
    }, GUIDE_IDLE_MS);

    return () => {
      if (guideTimerRef.current) {
        clearTimeout(guideTimerRef.current);
        guideTimerRef.current = null;
      }
    };
  }, [state.activeTool]);

  /**
   * Task 72.5 (Req 29.1, 29.2): ツール切替時のカーソル適用連動。
   *
   * - `applyToolCursor(canvas, activeTool)` を呼出して
   *   `defaultCursor` / `hoverCursor` / `freeDrawingCursor` を更新する
   * - `canvas.setCursor(canvas.defaultCursor)` を明示呼出し、
   *   ホバー中のカーソルを即時に反映する（マウスが画像領域上にある状態で
   *   ツールを切替えた直後に現カーソルが残る問題を回避）
   * - マウント初期や unmount 過程で canvas が未確立の場合は何もしない
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }
    applyToolCursor(canvas, state.activeTool);
    if (canvas.defaultCursor) {
      canvas.setCursor(canvas.defaultCursor);
    }
  }, [state.activeTool]);

  /**
   * ツール変更ハンドラ
   *
   * Task 13.3: ツール切り替え時にオブジェクト選択を解除
   * Task 15: 各描画ツールの設定
   */
  const handleToolChange = useCallback((tool: ToolType) => {
    // ツールを変更
    setState((prev) => ({ ...prev, activeTool: tool }));
    activeToolRef.current = tool;

    // Task 13.3: 選択ツール以外に切り替える場合、現在の選択を解除
    if (tool !== 'select' && fabricCanvasRef.current) {
      fabricCanvasRef.current.discardActiveObject();
      fabricCanvasRef.current.renderAll();
    }

    // Task 13.3: Canvasの選択モードを設定
    if (fabricCanvasRef.current) {
      const canvas = fabricCanvasRef.current;
      // selectツールの場合は選択を有効化、それ以外は無効化
      canvas.selection = tool === 'select';

      // すべてのオブジェクトの選択可否を設定（背景画像を除く）
      canvas.getObjects().forEach((obj) => {
        // 背景画像はスキップ
        if (obj === backgroundImageRef.current) return;
        obj.set({
          selectable: tool === 'select',
          evented: tool === 'select',
        });
      });
      canvas.renderAll();

      // フリーハンドモードの設定
      if (tool === 'freehand') {
        // PencilBrushを設定してフリーハンドモードを有効化
        canvas.isDrawingMode = true;
        const brush = new PencilBrush(canvas);
        brush.color = styleOptionsRef.current.strokeColor;
        brush.width = styleOptionsRef.current.strokeWidth;
        brush.decimate = DEFAULT_FREEHAND_OPTIONS.decimate;
        canvas.freeDrawingBrush = brush;
      } else {
        // フリーハンドモードを無効化
        canvas.isDrawingMode = false;
      }
    }

    // 多角形・折れ線ビルダーをリセット
    if (tool !== 'polygon') {
      polygonBuilderRef.current = null;
    }
    if (tool !== 'polyline') {
      polylineBuilderRef.current = null;
    }

    // テキスト編集フラグをリセット
    if (tool !== 'text') {
      editingTextRef.current = false;
    }

    // ドラッグ状態をリセット
    dragStateRef.current = { isDragging: false, startPoint: null };

    // プレビューオブジェクトをクリア
    if (previewShapeRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(previewShapeRef.current);
      previewShapeRef.current = null;
      fabricCanvasRef.current.renderAll();
    }
  }, []);

  /**
   * スタイル変更ハンドラ
   */
  const handleStyleChange = useCallback((options: Partial<StyleOptions>) => {
    setState((prev) => ({
      ...prev,
      styleOptions: { ...prev.styleOptions, ...options },
    }));
    styleOptionsRef.current = { ...styleOptionsRef.current, ...options };

    // フリーハンドモードの場合はブラシの設定も更新
    if (
      fabricCanvasRef.current &&
      activeToolRef.current === 'freehand' &&
      fabricCanvasRef.current.freeDrawingBrush
    ) {
      if (options.strokeColor !== undefined) {
        fabricCanvasRef.current.freeDrawingBrush.color = options.strokeColor;
      }
      if (options.strokeWidth !== undefined) {
        fabricCanvasRef.current.freeDrawingBrush.width = options.strokeWidth;
      }
    }
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

        // 非同期処理後、Canvasがdisposeされていないか確認
        // また、渡されたcanvasインスタンスが現在のcanvasと同じかも確認
        // （React StrictModeで古いcanvasインスタンスのクロージャが実行される可能性がある）
        /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
        if (
          isDisposedRef.current ||
          !fabricCanvasRef.current ||
          fabricCanvasRef.current !== canvas
        ) {
          console.warn('Canvas has been disposed or replaced during image loading');
          return;
        }

        // コンテナサイズを取得
        const containerWidth = containerRef.current?.clientWidth || 800;
        const containerHeight = containerRef.current?.clientHeight || 600;

        // パディングを考慮
        const padding = 48;

        // 画像サイズを計算
        const imgWidth = img.width || 1;
        const imgHeight = img.height || 1;

        // Task 101.1 (Req 36.1, 36.2, 35.7): フィット倍率算出を computeFitScale へ移行。
        // 従来の Math.min(maxW/imgW, maxH/imgH, 1) を一般化し、原寸頭打ち（末尾の 1）を
        // allowUpscale で制御する。モバイル幅では allowUpscale=true とし小画像もフィット倍率まで
        // 拡大（Req 36.2）、デスクトップは allowUpscale=false で原寸頭打ちの現行挙動を維持（Req 35.7）。
        const scale = computeFitScale({
          imageWidth: imgWidth,
          imageHeight: imgHeight,
          containerWidth,
          containerHeight,
          padding,
          allowUpscale: isMobileRef.current,
        });

        // スケールを設定
        img.scale(scale);

        // Canvasサイズを計算
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        // 背景画像として設定する前に選択不可・移動不可に設定。
        // 併せて Fabric v7 で originX/Y の既定値が left/top → center/center に変更されたため、
        // 画像をキャンバス中心に配置して全体表示する。
        img.set({
          selectable: false,
          evented: false,
          originX: 'center',
          originY: 'center',
          left: scaledWidth / 2,
          top: scaledHeight / 2,
        });

        // 再度disposeチェック（React StrictModeでのcanvas置換も考慮）
        /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
        if (
          isDisposedRef.current ||
          !fabricCanvasRef.current ||
          fabricCanvasRef.current !== canvas
        ) {
          console.warn('Canvas has been disposed or replaced during image processing');
          return;
        }

        canvas.setDimensions({ width: scaledWidth, height: scaledHeight });

        // 背景画像として設定（Fabric.js v6 API）
        canvas.backgroundImage = img;
        // 背景画像の参照を保存
        backgroundImageRef.current = img;

        // Task 96.4 (Req 33.11, 33.12): 選択ツールでの初回ロード時もタッチ/クリックで
        // 既存注釈を選択・移動できるよう、canvas.selection を現在のツール状態へ同期する。
        // canvas 生成時は selection:false 固定のため、ここで activeTool/readOnly に基づき是正する
        // （以後のツール切替時は handleToolChange が同期する）。これにより拡大表示中でも
        // Fabric の選択（マーキー）/ object:moving（scenePoint=viewport 考慮）への委譲が成立する。
        canvas.selection = !readOnly && activeToolRef.current === 'select';

        canvas.renderAll();

        // REQ-9.2: 保存された注釈データを復元
        try {
          const annotationData = await getAnnotation(imageId);
          if (annotationData && annotationData.data) {
            // 再度disposeチェック
            /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
            if (
              isDisposedRef.current ||
              !fabricCanvasRef.current ||
              fabricCanvasRef.current !== canvas
            ) {
              console.warn('Canvas has been disposed or replaced during annotation loading');
              return;
            }

            // 回転状態の復元 (Req 22.4, 22.5)
            const savedRotation = (annotationData.data.imageRotation ?? 0) as 0 | 90 | 180 | 270;
            if (savedRotation !== 0 && backgroundImageRef.current) {
              imageRotationRef.current = savedRotation;
              applyImageRotation(canvas, backgroundImageRef.current, savedRotation);
              setState((prev) => ({ ...prev, imageRotation: savedRotation }));
            }

            // 注釈オブジェクトを復元
            const objects = annotationData.data.objects;
            if (objects && objects.length > 0) {
              // Fabric.js v6 の enlivenObjects を使用してオブジェクトを復元
              const enlivenedObjects = await util.enlivenObjects(objects);

              // 再度disposeチェック
              /* istanbul ignore if -- @preserve React StrictModeでの非同期処理キャンセル */
              if (
                isDisposedRef.current ||
                !fabricCanvasRef.current ||
                fabricCanvasRef.current !== canvas
              ) {
                console.warn('Canvas has been disposed or replaced during object restoration');
                return;
              }

              // スケール係数を計算（保存時のキャンバスサイズと現在のキャンバスサイズの比率）
              const savedCanvasWidth = annotationData.data.canvasWidth;
              const savedCanvasHeight = annotationData.data.canvasHeight;
              const currentCanvasWidth = canvas.getWidth();
              const currentCanvasHeight = canvas.getHeight();
              const scaleX =
                savedCanvasWidth && savedCanvasWidth > 0
                  ? currentCanvasWidth / savedCanvasWidth
                  : 1;
              const scaleY =
                savedCanvasHeight && savedCanvasHeight > 0
                  ? currentCanvasHeight / savedCanvasHeight
                  : 1;
              const needsScaling = scaleX !== 1 || scaleY !== 1;

              // 復元したオブジェクトをキャンバスに追加
              enlivenedObjects.forEach((obj) => {
                // FabricObjectであることを確認
                if (obj && typeof obj === 'object' && 'set' in obj && 'type' in obj) {
                  const fabricObj = obj as FabricObject;

                  // スケール変換が必要な場合は適用
                  if (needsScaling) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const objAny = fabricObj as any;
                    const left = objAny.left ?? 0;
                    const top = objAny.top ?? 0;
                    fabricObj.set({
                      left: left * scaleX,
                      top: top * scaleY,
                      scaleX: (objAny.scaleX ?? 1) * scaleX,
                      scaleY: (objAny.scaleY ?? 1) * scaleY,
                    });

                    // ストローク幅もスケール（平均スケールを使用）
                    const avgScale = (scaleX + scaleY) / 2;
                    if (objAny.strokeWidth) {
                      fabricObj.set({ strokeWidth: objAny.strokeWidth * avgScale });
                    }
                  }

                  // readOnlyモードでは選択不可、それ以外は選択ツールの場合のみ選択可能
                  fabricObj.set({
                    selectable: !readOnly && activeToolRef.current === 'select',
                    evented: !readOnly && activeToolRef.current === 'select',
                  });
                  canvas.add(fabricObj);
                }
              });
              canvas.renderAll();
              console.log(
                `Restored ${enlivenedObjects.length} annotation objects` +
                  (needsScaling ? ` (scaled: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)})` : '')
              );
            }
          }
        } catch (annotationErr) {
          // 注釈データの読み込みに失敗してもエラーにはしない（画像は表示する）
          console.warn('注釈データの読み込みに失敗しました:', annotationErr);
        }

        setState((prev) => ({ ...prev, isLoading: false, error: null }));
        /* istanbul ignore next -- @preserve 画像読み込みエラーのキャッチ（ネットワークエラー等） */
      } catch (err) {
        console.error('画像の読み込みに失敗しました:', err);
        // disposeされていない場合のみstate更新
        if (!isDisposedRef.current) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : '画像の読み込みに失敗しました',
          }));
        }
      }
    },
    [imageId, readOnly]
  );

  /**
   * Canvasイベントリスナーを設定
   *
   * Task 13.3: オブジェクト選択・操作機能のイベント
   * Task 15: 各描画ツールのマウスイベント処理
   * - mouse:down/move/up: 描画ツールの操作
   * - mouse:dblclick: 多角形・折れ線の完了
   * - selection:created/updated/cleared: オブジェクト選択の変更
   * - object:moving/modified/scaling: オブジェクトの移動・変更・リサイズ
   */
  /* istanbul ignore next -- @preserve イベントハンドラはFabric.jsコールバック内で実行 */
  const setupEventListeners = useCallback((canvas: FabricCanvas) => {
    // マウスダウンイベント - ドラッグ開始または多角形/折れ線の頂点追加
    canvas.on('mouse:down', (options: TPointerEventInfo<TPointerEvent>) => {
      // Task 72.4 (Req 29.7, 29.8): 描画/操作が開始されたら簡易ガイドを dismiss し、
      // idle タイマも破棄する。描画直前/途中の非侵襲的なガイドが視覚的競合を起こさないため。
      if (guideTimerRef.current) {
        clearTimeout(guideTimerRef.current);
        guideTimerRef.current = null;
      }
      setGuideVisible(false);

      // Fabric.js v7ではoptions.scenePointを使用（キャンバス座標）
      const pointer = options.scenePoint;
      const activeTool = activeToolRef.current;
      if (!pointer) {
        return;
      }

      // 選択ツールまたはフリーハンドの場合は何もしない
      if (activeTool === 'select' || activeTool === 'freehand') {
        return;
      }

      // 注: handleToolChangeで描画ツール選択時にevented: false, selectable: falseを
      // 全オブジェクトに設定済みのため、既存オブジェクト上でも描画操作を実行する。
      // また、handleToolChangeでdiscardActiveObject()を呼び出し済みのため、
      // アクティブオブジェクトのチェックも不要。

      // 多角形ツール - 頂点を追加
      if (activeTool === 'polygon') {
        if (!polygonBuilderRef.current) {
          polygonBuilderRef.current = new PolygonBuilder();
        }
        polygonBuilderRef.current.addVertex({ x: pointer.x, y: pointer.y });
        return;
      }

      // 折れ線ツール - 頂点を追加
      if (activeTool === 'polyline') {
        if (!polylineBuilderRef.current) {
          polylineBuilderRef.current = new PolylineBuilder();
        }
        polylineBuilderRef.current.addPoint({ x: pointer.x, y: pointer.y });
        return;
      }

      // テキストツール - シングルクリックで配置
      if (activeTool === 'text') {
        // 編集中のテキストがある場合は編集を終了するだけで、新しいテキストを作成しない
        // editingTextRefがtrueの場合、前回テキストを作成して編集モードに入っている
        if (editingTextRef.current) {
          // 編集フラグをリセット
          editingTextRef.current = false;
          // Fabric.jsが自動的に編集を終了するので、ここでは何もしない
          // 新しいテキストを作成せずにreturn
          return;
        }

        const currentStyle = styleOptionsRef.current;
        const textAnnotation = createTextAnnotation(
          { x: pointer.x, y: pointer.y },
          {
            initialText: 'テキスト',
            fontSize: currentStyle.fontSize,
            fill: currentStyle.strokeColor,
          }
        );
        canvas.add(textAnnotation);
        // ダブルクリック編集モードを設定
        textAnnotation.setupDoubleClickEditing(canvas);
        canvas.renderAll();
        // テキストを選択状態にして編集モードに入る
        canvas.setActiveObject(textAnnotation);
        textAnnotation.enterEditing();
        textAnnotation.selectAll();
        // 編集モードに入ったことを記録
        editingTextRef.current = true;
        return;
      }

      // その他の描画ツール - ドラッグ開始
      dragStateRef.current = {
        isDragging: true,
        startPoint: { x: pointer.x, y: pointer.y },
      };
    });

    // マウス移動イベント - ドラッグ中のプレビュー表示
    canvas.on('mouse:move', (options: TPointerEventInfo<TPointerEvent>) => {
      const pointer = options.scenePoint;
      const activeTool = activeToolRef.current;
      const dragState = dragStateRef.current;
      const currentStyle = styleOptionsRef.current;

      if (!pointer) {
        return;
      }

      // 選択ツールまたはフリーハンド、テキストの場合はプレビュー不要
      if (activeTool === 'select' || activeTool === 'freehand' || activeTool === 'text') {
        return;
      }

      // 多角形ツールのプレビュー（クリックベース）
      if (activeTool === 'polygon' && polygonBuilderRef.current) {
        const vertices = polygonBuilderRef.current.getVertices();
        const firstVertex = vertices[0];
        if (vertices.length > 0 && firstVertex) {
          // 既存のプレビューを削除（Undo履歴に記録しない）
          if (previewShapeRef.current) {
            setProgrammaticRef.current(true);
            canvas.remove(previewShapeRef.current);
            setProgrammaticRef.current(false);
          }
          // 全ての頂点 + マウス位置を含むPolylineでプレビュー表示
          // 多角形なので最後に始点への線も追加して閉じる
          const previewPoints = [
            ...vertices.map((v) => ({ x: v.x, y: v.y })),
            { x: pointer.x, y: pointer.y },
            { x: firstVertex.x, y: firstVertex.y }, // 始点に戻って閉じる
          ];
          const previewLine = new Polyline(previewPoints, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: 'transparent',
            opacity: 0.5,
            selectable: false,
            evented: false,
          });
          previewShapeRef.current = previewLine;
          setProgrammaticRef.current(true);
          canvas.add(previewLine);
          setProgrammaticRef.current(false);
          canvas.renderAll();
        }
        return;
      }

      // 折れ線ツールのプレビュー（クリックベース）
      if (activeTool === 'polyline' && polylineBuilderRef.current) {
        const points = polylineBuilderRef.current.getPoints();
        if (points.length > 0) {
          // 既存のプレビューを削除（Undo履歴に記録しない）
          if (previewShapeRef.current) {
            setProgrammaticRef.current(true);
            canvas.remove(previewShapeRef.current);
            setProgrammaticRef.current(false);
          }
          // 全てのポイント + マウス位置を含むPolylineでプレビュー表示
          const previewPoints = [
            ...points.map((p) => ({ x: p.x, y: p.y })),
            { x: pointer.x, y: pointer.y },
          ];
          const previewLine = new Polyline(previewPoints, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: 'transparent',
            opacity: 0.5,
            selectable: false,
            evented: false,
          });
          previewShapeRef.current = previewLine;
          setProgrammaticRef.current(true);
          canvas.add(previewLine);
          setProgrammaticRef.current(false);
          canvas.renderAll();
        }
        return;
      }

      // ドラッグ中でなければプレビュー不要
      if (!dragState.isDragging || !dragState.startPoint) {
        return;
      }

      const startPoint = dragState.startPoint;
      const endPoint = { x: pointer.x, y: pointer.y };

      // 既存のプレビューを削除（Undo履歴に記録しない）
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        canvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }

      // ツールに応じてプレビュー図形を作成
      let previewShape: FabricObject | null = null;
      switch (activeTool) {
        case 'arrow':
          previewShape = createArrow(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          break;
        case 'circle':
          previewShape = createCircle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          break;
        case 'rectangle':
          previewShape = createRectangle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          break;
        case 'dimension':
          previewShape = createDimensionLine(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          break;
        default:
          break;
      }

      // プレビュー図形を表示（半透明で表示）
      // プレビュー操作はUndo履歴に記録しない
      if (previewShape) {
        previewShape.set({
          opacity: 0.5,
          selectable: false,
          evented: false,
        });
        previewShapeRef.current = previewShape;
        setProgrammaticRef.current(true);
        canvas.add(previewShape);
        setProgrammaticRef.current(false);
        canvas.renderAll();
      }
    });

    // マウスアップイベント - 図形の作成
    canvas.on('mouse:up', (options: TPointerEventInfo<TPointerEvent>) => {
      const dragState = dragStateRef.current;
      const activeTool = activeToolRef.current;

      // プレビューオブジェクトを削除（Undo履歴に記録しない）
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        canvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }

      // 選択ツールまたはフリーハンドの場合は図形を作成しない
      if (activeTool === 'select' || activeTool === 'freehand') {
        dragStateRef.current = { isDragging: false, startPoint: null };
        return;
      }

      // 注: handleToolChangeで描画ツール選択時にevented: false, selectable: falseを
      // 全オブジェクトに設定済みのため、既存オブジェクト上でも図形作成を実行する。
      const pointer = options.scenePoint;

      // ドラッグ中でなければ何もしない
      if (!dragState.isDragging || !dragState.startPoint) {
        return;
      }

      // pointerがない場合は何もしない（上で既にチェック済みだが念のため）
      if (!pointer) {
        dragStateRef.current = { isDragging: false, startPoint: null };
        return;
      }
      const startPoint = dragState.startPoint;
      const endPoint = { x: pointer.x, y: pointer.y };

      // ドラッグ状態をリセット
      dragStateRef.current = { isDragging: false, startPoint: null };

      // スタイルオプションを取得
      const currentStyle = styleOptionsRef.current;

      // ツールに応じて図形を作成
      let shape = null;
      switch (activeTool) {
        case 'arrow':
          shape = createArrow(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          break;
        case 'circle':
          shape = createCircle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          break;
        case 'rectangle':
          shape = createRectangle(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
            fill: currentStyle.fillColor || 'transparent',
          });
          break;
        case 'dimension':
          shape = createDimensionLine(startPoint, endPoint, {
            stroke: currentStyle.strokeColor,
            strokeWidth: currentStyle.strokeWidth,
          });
          break;
        default:
          // テキストなどは別途実装
          break;
      }

      // 図形が作成されたらCanvasに追加
      if (shape) {
        canvas.add(shape);
        canvas.renderAll();
      }
    });

    // ダブルクリックイベント - 多角形・折れ線の完了
    canvas.on('mouse:dblclick', () => {
      const activeTool = activeToolRef.current;

      // プレビューオブジェクトを削除（Undo履歴に記録しない）
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        canvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }

      // 多角形ツール - 多角形を完了
      if (activeTool === 'polygon' && polygonBuilderRef.current) {
        const currentStyle = styleOptionsRef.current;
        const polygon = createPolygon(polygonBuilderRef.current.getVertices(), {
          stroke: currentStyle.strokeColor,
          strokeWidth: currentStyle.strokeWidth,
          fill: currentStyle.fillColor || 'transparent',
        });
        if (polygon) {
          canvas.add(polygon);
          canvas.renderAll();
        }
        polygonBuilderRef.current = null;
        return;
      }

      // 折れ線ツール - 折れ線を完了
      if (activeTool === 'polyline' && polylineBuilderRef.current) {
        const currentStyle = styleOptionsRef.current;
        const polyline = createPolyline(polylineBuilderRef.current.getPoints(), {
          stroke: currentStyle.strokeColor,
          strokeWidth: currentStyle.strokeWidth,
          fill: 'transparent',
        });
        if (polyline) {
          canvas.add(polyline);
          canvas.renderAll();
        }
        polylineBuilderRef.current = null;
        return;
      }
    });

    // Task 13.3: オブジェクト選択イベント
    canvas.on('selection:created', () => {
      // オブジェクト選択時
    });

    canvas.on('selection:updated', () => {
      // 選択オブジェクト変更時
    });

    canvas.on('selection:cleared', () => {
      // 選択解除時
    });

    // Task 13.3: オブジェクト操作イベント
    canvas.on('object:moving', () => {
      // オブジェクト移動中
    });

    canvas.on('object:scaling', () => {
      // オブジェクトリサイズ中
    });

    canvas.on('object:modified', () => {
      // オブジェクト変更完了（移動・リサイズ完了後）
    });
  }, []);

  /**
   * Canvasイベントリスナーを解除
   */
  /* istanbul ignore next -- @preserve イベントリスナー解除はアンマウント時のみ実行 */
  const removeEventListeners = useCallback((canvas: FabricCanvas) => {
    // 基本マウスイベント
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    canvas.off('mouse:dblclick');

    // Task 13.3: オブジェクト選択イベント
    canvas.off('selection:created');
    canvas.off('selection:updated');
    canvas.off('selection:cleared');

    // Task 13.3: オブジェクト操作イベント
    canvas.off('object:moving');
    canvas.off('object:scaling');
    canvas.off('object:modified');
  }, []);

  /**
   * Task 72.2 / 96.3 (Req 27.1, 33.8): ダブルタップ用途調停ハンドラ
   *
   * touchGestureManager が発火する `custom:dbltap` を受け、ダブルタップ位置の対象によって
   * 用途を排他的に切り替える（design.md「ダブルタップ用途調停」）。
   *   - テキスト注釈上 (`textAnnotation` / `i-text` / `text`) → `enterEditing()` で編集モード
   *     へ遷移（Req 27.1, 27.8 後方互換）。ズームトグルは行わない。
   *   - 空き領域（対象なし）または背景画像 (`image`) 上 → ズーム/全体表示トグル（Req 33.8）。
   *     現在ズームが等倍（≒1）なら当該タップ点を中心に拡大し、拡大中なら fit() で全体表示へ戻す。
   *   - テキスト以外の注釈（rectangle 等）上では編集もズームも行わない（責務分岐表）。
   *
   * controller には新メソッドを足さず、AnnotationEditor 内で `getState().zoom` を見て
   * `zoomToPoint`/`fit` を呼び分ける（境界維持）。マウス環境の `mouse:dblclick` は既存の
   * セットアップで維持される（Req 27.8）。
   */
  const handleDoubleTap = useCallback((payload: GesturePayload) => {
    const canvas = fabricCanvasRef.current;
    if (canvas === null) {
      return;
    }

    // Task 96.3 (round 1 修正): payload.target には依存しない。
    // touchGestureManager の buildPayload は target を設定せず、Fabric の canvas.fire は
    // カスタムイベントに target を付与しないため、本番タッチ dbltap では payload.target が
    // 常に undefined になる。ここでタップ点のクライアント座標から実ヒットテストを行い対象を得る。
    // Fabric v7 の findTarget は clientX/clientY を持つイベント様オブジェクトから
    // getScenePoint 経由で対象を解決し、{ target?, subTargets, ... } を返す。
    const eventLike = {
      clientX: payload.clientX,
      clientY: payload.clientY,
    } as unknown as TPointerEvent;
    const hit = canvas.findTarget(eventLike);
    const target = hit.target as { type?: string; enterEditing?: () => void } | undefined;

    // Req 27.1: テキスト注釈上は従来どおり編集モードへ（後方互換）。ズームはしない。
    // これにより、従来 payload.target=undefined→no-op で実質壊れていたタッチのテキスト編集も
    // 正しく enterEditing へ到達する。
    if (target?.type === 'textAnnotation' || target?.type === 'i-text' || target?.type === 'text') {
      target.enterEditing?.();
      return;
    }

    // Req 33.8: 空き領域（対象なし）または背景画像上のみズームトグルの対象とする。
    // 背景画像は canvas.backgroundImage でありヒットテスト対象外（findTarget は undefined を返す）
    // だが、万一 image オブジェクトがヒットした場合も空き領域扱いとする（防御的）。
    // テキスト以外の注釈の上では編集もズームも行わない。
    const isEmptyArea = target === undefined || target.type === 'image';
    if (!isEmptyArea) {
      return;
    }

    const controller = viewportControllerRef.current;
    if (controller === null) {
      return;
    }

    // controller に新メソッドを足さず、現在ズームを見て拡大↔全体表示を排他に切り替える。
    const tapPoint = { x: payload.clientX, y: payload.clientY };
    if (controller.getState().zoom <= 1 + DOUBLE_TAP_ZOOM_EPSILON) {
      controller.zoomToPoint(tapPoint, DOUBLE_TAP_ZOOM_SCALE);
    } else {
      controller.fit();
    }
  }, []);

  /**
   * Task 72.2 (Req 27.9, 27.10): 長押しハンドラ
   *
   * 選択ツール選択中かつ target がある場合のみコンテキストメニュー state を visible にする。
   * 描画ツール選択中は Req 17 (描画ツール使用中のオブジェクト選択防止) と Req 27.9 に従い
   * コンテキストメニューを表示せず何もしない。
   */
  const handleLongPress = useCallback((payload: GesturePayload) => {
    // Req 27.9 / Req 17: 描画ツール選択中は長押しによるメニュー表示を行わない
    if (activeToolRef.current !== 'select') {
      return;
    }
    // 防御的: target が無い長押しはメニューを開かない
    if (!payload.target) {
      return;
    }
    setContextMenu({
      visible: true,
      position: { x: payload.clientX, y: payload.clientY },
      targetObject: payload.target as FabricObject,
    });
  }, []);

  /**
   * Task 72.3 (Req 27.5): コンテキストメニューを閉じる
   *
   * オーバーレイの外タップ、またはアクション実行直後に呼ばれる。state を初期化する。
   */
  const handleContextMenuClose = useCallback(() => {
    setContextMenu({ visible: false, position: null, targetObject: null });
  }, []);

  /**
   * Task 72.3 (Req 27.3, 27.7): コンテキストメニューのアクション実行
   *
   * - edit: テキスト系オブジェクト（text / i-text / textAnnotation）のみ enterEditing() を呼ぶ
   * - duplicate: Fabric v6 の `clone()` は Promise<FabricObject> を返すため、.then で受けて
   *   `{ left: left+20, top: top+20 }` オフセットを set した後 canvas.add + setActiveObject する
   * - delete: canvas.remove(target) でオブジェクトを削除
   *
   * いずれの操作も `useFabricUndoIntegration` が `object:added` / `object:removed` を
   * 自然に捕捉し、Undo 履歴に載せる（Req 27.7）。
   */
  const handleContextMenuAction = useCallback((action: ContextMenuAction, target: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }
    switch (action) {
      case 'edit': {
        const t = target as unknown as { type?: string; enterEditing?: () => void };
        if (t.type === 'text' || t.type === 'i-text' || t.type === 'textAnnotation') {
          t.enterEditing?.();
        }
        break;
      }
      case 'duplicate': {
        const cloneFn = (target as unknown as { clone?: () => Promise<FabricObject> }).clone;
        if (typeof cloneFn !== 'function') {
          break;
        }
        cloneFn.call(target).then((cloned: FabricObject) => {
          cloned.set({
            left: (target.left ?? 0) + 20,
            top: (target.top ?? 0) + 20,
          });
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
          canvas.requestRenderAll();
        });
        break;
      }
      case 'delete': {
        canvas.remove(target);
        canvas.requestRenderAll();
        break;
      }
    }
    // 実行後はメニューを閉じる
    setContextMenu({ visible: false, position: null, targetObject: null });
  }, []);

  /**
   * Fabric.js Canvasの初期化
   *
   * React StrictModeでの二重マウント対応:
   * Canvas要素を動的に生成することで、dispose後の再初期化問題を回避する。
   * Fabric.jsはdispose時にCanvas要素を内部的に変更するため、
   * 同じDOM要素を再利用するとエラーが発生する。
   */
  useEffect(() => {
    if (!canvasWrapperRef.current) {
      return;
    }

    // dispose状態をリセット
    isDisposedRef.current = false;

    let canvas: FabricCanvas | null = null;
    let canvasElement: HTMLCanvasElement | null = null;

    try {
      // コンテナサイズを取得（初期化時に指定）
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = containerRef.current?.clientHeight || 600;

      // Canvas要素を動的に生成（React StrictMode対応）
      // 既存のCanvas要素をクリア（React StrictModeでの二重マウント対応）
      while (canvasWrapperRef.current.firstChild) {
        canvasWrapperRef.current.removeChild(canvasWrapperRef.current.firstChild);
      }
      canvasElement = document.createElement('canvas');
      canvasWrapperRef.current.appendChild(canvasElement);
      canvasElementRef.current = canvasElement;

      // Canvasを初期化（サイズを初期化時に指定）
      // Task 72.1 / design.md §4611: enablePointerEvents を有効化し、
      // touchGestureManager が PointerEvent ベースで多指ジェスチャーを厳密判定できるようにする
      canvas = new FabricCanvas(canvasElement, {
        selection: false, // 背景画像が選択されないように
        renderOnAddRemove: true,
        width: containerWidth,
        height: containerHeight,
        enablePointerEvents: true,
      });

      fabricCanvasRef.current = canvas;

      // Task 72.1 (Req 29.4, 29.5): タッチ/マウス環境に応じたハンドルサイズを設定
      configureHandleSizes();

      // Task 96.1: 新しい canvas を生成したため、initialZoom/initialPan の適用ガードを解除する。
      // 実際の touchGestureManager アタッチと初期ビュー適用は viewportController が
      // 生成された後（setFabricCanvas による再レンダー後）の専用 effect で行う。
      initialViewAppliedRef.current = false;

      // Task 72.2 (Req 27.1, 27.9, 27.10): touchGestureManager が fire する
      // custom:dbltap / custom:longpress に React 側ハンドラを配線する。
      // 既存の mouse:dblclick は setupEventListeners が登録しており、Req 27.8 の
      // マウス従来挙動は維持される。
      // Fabric の on/off はイベント名に union 型を要求するため、型アサーションで回避する。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).on('custom:dbltap', handleDoubleTap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).on('custom:longpress', handleLongPress);

      // Fabric.js と UndoManager の連携用にCanvasを状態に設定
      setFabricCanvas(canvas);

      // E2Eテスト用にwindowオブジェクトにキャンバスを公開
      if (typeof window !== 'undefined') {
        window.__fabricCanvas = canvas;
      }

      // readOnlyモードでなければイベントリスナーを設定
      if (!readOnly) {
        setupEventListeners(canvas);
      }

      // 画像を読み込み
      if (imageUrl) {
        loadImage(canvas, imageUrl);
        prevImageUrlRef.current = imageUrl;
      }
      /* istanbul ignore next -- @preserve Canvas初期化エラー（DOM関連エラー等） */
    } catch (err) {
      console.error('Failed to initialize Fabric.js canvas:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'キャンバスの初期化に失敗しました',
      }));
    }

    // クリーンアップ（dispose処理）
    /* istanbul ignore next -- @preserve クリーンアップ処理はアンマウント時のみ実行 */
    return () => {
      // dispose状態を設定（非同期処理をキャンセル）
      isDisposedRef.current = true;

      // Task 72.4: idle ガイドタイマを破棄（unmount 後の setState を防止）
      if (guideTimerRef.current) {
        clearTimeout(guideTimerRef.current);
        guideTimerRef.current = null;
      }

      // 保存成功メッセージ用のタイマも破棄（unmount 後の setState を防止）
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current);
        saveSuccessTimerRef.current = null;
      }

      // Task 96.1: touchGestureManager の detach は専用 effect（viewportController 依存）の
      // クリーンアップで行うため、ここでは扱わない。

      if (canvas) {
        try {
          // readOnlyモードでなければイベントリスナーを解除
          if (!readOnly) {
            removeEventListeners(canvas);
          }
          // Task 72.2: custom:dbltap / custom:longpress のリスナーを解除
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (canvas as any).off('custom:dbltap', handleDoubleTap);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (canvas as any).off('custom:longpress', handleLongPress);
          // Canvasをdispose
          canvas.dispose();
        } catch (err) {
          console.warn('Error during canvas cleanup:', err);
        }
      }
      // 動的に生成したCanvas要素をDOMから削除
      if (canvasElement && canvasElement.parentNode) {
        canvasElement.parentNode.removeChild(canvasElement);
      }
      fabricCanvasRef.current = null;
      backgroundImageRef.current = null;
      canvasElementRef.current = null;

      // Fabric.js と UndoManager の連携をクリア
      setFabricCanvas(null);

      // E2Eテスト用のwindowオブジェクトをクリア
      if (typeof window !== 'undefined') {
        window.__fabricCanvas = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageUrlの変更は別のuseEffectで対応
  }, [
    loadImage,
    setupEventListeners,
    removeEventListeners,
    readOnly,
    handleDoubleTap,
    handleLongPress,
  ]);

  /**
   * Task 96.1 (Req 27.1, 27.2, 30.1, 33.2-33.5, 34.7): touchGestureManager を canvas に
   * アタッチする。useCanvasViewport が生成した単一の viewportController を
   * options.viewportController として注入し、2本指ピンチ→中点ズーム / 2本指ドラッグ→パンを
   * 同一コントローラ経由で駆動する（ZoomControls とコントローラを共有）。
   *
   * canvas 初期化（setFabricCanvas）後の再レンダーで viewportController が生成されてから
   * 実行する必要があるため、Canvas 生成 effect とは分離する。
   * touchGestureManager は FabricCanvasLike（最小サーフェス）を要求するため構造的に
   * 満たされる形でキャストして渡す。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas || !viewportController) {
      return;
    }
    const gestureManager = createTouchGestureManager();

    /**
     * Task 96.2 (Req 33.7): ジェスチャー終了（cooldown→idle、全指離脱後の復帰タイミング）を
     * getTouchState() のポーリングで検出し、退避していた描画モードを復元する。
     * touchGestureManager は終了コールバックを公開しないため（境界外・変更不可）、
     * 状態ゲッターをポーリングして idle 復帰を捉える。復元値は「退避した描画モード」と
     * 「現在の選択中ツール」の両方を考慮する（ジェスチャー中にツールが変わった場合の安全策）。
     */
    const stopRestorePolling = (): void => {
      if (gestureRestoreTimerRef.current !== null) {
        clearInterval(gestureRestoreTimerRef.current);
        gestureRestoreTimerRef.current = null;
      }
    };
    const startRestorePolling = (): void => {
      stopRestorePolling();
      gestureRestoreTimerRef.current = setInterval(() => {
        if (gestureManager.getTouchState() !== 'idle') {
          return;
        }
        const currentCanvas = fabricCanvasRef.current;
        if (currentCanvas) {
          // 退避した描画モードかつ現在もフリーハンド選択中の場合のみ描画モードへ復帰する。
          currentCanvas.isDrawingMode =
            prevDrawingModeRef.current && activeToolRef.current === 'freehand';
        }
        stopRestorePolling();
      }, COOLDOWN_MS);
    };

    /**
     * Task 96.2 (Req 33.5, 30.1): 2本目の指が追加され two-finger-pinch-pan へ遷移する瞬間に
     * touchGestureManager から発火されるコールバック。進行中の描画を確定せず中断する:
     *   1. 現在の isDrawingMode を退避し、即座に false 化して以後の描画入力を止める
     *   2. 進行中のフリーハンド・ブラシストロークを破棄（中途半端なパスを残さない）
     *   3. シェイプツールの進行中ドラッグ／プレビューも中断・除去する
     *   4. cooldown→idle 復帰で描画モードを戻すためのポーリングを開始する
     */
    const handleGestureStart = (): void => {
      const currentCanvas = fabricCanvasRef.current;
      if (!currentCanvas) {
        return;
      }

      // 1) 描画モードを退避して即時停止
      prevDrawingModeRef.current = currentCanvas.isDrawingMode;
      currentCanvas.isDrawingMode = false;

      // 2) 進行中のブラシストロークを破棄（Fabric PencilBrush の内部点列・トップコンテキスト）
      const brush = currentCanvas.freeDrawingBrush as { _reset?: () => void } | null | undefined;
      brush?._reset?.();
      const drawingSurface = currentCanvas as unknown as {
        _isCurrentlyDrawing?: boolean;
        contextTop?: CanvasRenderingContext2D | null;
        clearContext?: (ctx: CanvasRenderingContext2D) => void;
      };
      drawingSurface._isCurrentlyDrawing = false;
      if (drawingSurface.contextTop && typeof drawingSurface.clearContext === 'function') {
        drawingSurface.clearContext(drawingSurface.contextTop);
      }

      // 3) シェイプツールの進行中ドラッグ／プレビューを中断（誤コミット防止）
      dragStateRef.current = { isDragging: false, startPoint: null };
      if (previewShapeRef.current) {
        setProgrammaticRef.current(true);
        currentCanvas.remove(previewShapeRef.current);
        setProgrammaticRef.current(false);
        previewShapeRef.current = null;
      }
      currentCanvas.requestRenderAll?.();

      // 4) ジェスチャー終了（cooldown→idle）での描画モード復帰ポーリングを開始
      startRestorePolling();
    };

    const detach = gestureManager.attach(
      canvas as unknown as import('./gestures/touchGestureManager').FabricCanvasLike,
      () => activeToolRef.current,
      { viewportController, onGestureStart: handleGestureStart }
    );
    touchGestureDetachRef.current = detach;

    return () => {
      stopRestorePolling();
      try {
        detach();
      } catch (err) {
        console.warn('Error during touch gesture manager detach:', err);
      }
      touchGestureDetachRef.current = null;
    };
  }, [fabricCanvas, viewportController]);

  /**
   * Task 98.2 (Req 27.1, 33.8, 33.11): Fabric の内部オフセット（_offset）をスクロール時にも
   * 再計算する。
   *
   * Fabric v7 は `calcOffset` を window の "resize" にのみ自動アタッチし、"scroll" には
   * アタッチしない。一方モバイルでは、テキスト注釈編集の隠し textarea フォーカスや
   * アドレスバー伸縮などでページ/ビジュアルビューポートがスクロールすると、canvas 要素の
   * 画面オフセットが変化する。`_offset` が陳腐化したままだと `findTarget`（ダブルタップ調停・
   * タッチ選択のヒットテスト基準）が誤判定し、テキスト上ダブルタップで編集に入れない／
   * 拡大中の注釈をタップ選択できない等の実バグになる。
   *
   * そこで scroll / visualViewport の resize・scroll で `calcOffset()` を呼び直し、
   * 併せて編集突入（canvas 準備完了）時にも一度再計算して、ヒットテスト基準を実レイアウトに
   * 追従させる。E2E ではこの実経路を検証する（テスト側の calcOffset 直接呼び出しの回避を撤去）。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas) {
      return;
    }
    const recalc = (): void => {
      // dispose 済み canvas への呼び出しを防ぐ。calcOffset 非対応（テストのモック等）も防御。
      if (fabricCanvasRef.current === canvas && typeof canvas.calcOffset === 'function') {
        canvas.calcOffset();
      }
    };
    // 編集突入（canvas 準備完了）時の初回再計算
    recalc();
    // scroll / resize / visualViewport 変化での再計算（遅延的な追従）
    window.addEventListener('scroll', recalc, { passive: true });
    window.addEventListener('resize', recalc);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', recalc);
    vv?.addEventListener('scroll', recalc);
    // 操作直前（touchstart / pointerdown）の capture フェーズで必ず再計算する。
    // scroll イベントはスクロール途中の中間値で発火することがあり、findTarget が参照する
    // 直前の `_offset` が陳腐化したままになり得る。Fabric のハンドラ（bubble フェーズ）より
    // 前に capture で calcOffset を呼ぶことで、各タッチ/ポインタ操作のヒットテスト基準を
    // その瞬間の実レイアウトへ確実に同期する（findTarget 誤判定の根治）。
    window.addEventListener('touchstart', recalc, { capture: true, passive: true });
    window.addEventListener('pointerdown', recalc, { capture: true });
    return () => {
      window.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
      vv?.removeEventListener('resize', recalc);
      vv?.removeEventListener('scroll', recalc);
      window.removeEventListener('touchstart', recalc, { capture: true });
      window.removeEventListener('pointerdown', recalc, { capture: true });
    };
  }, [fabricCanvas]);

  /**
   * Task 96.1 (Req 33.9): props の initialZoom / initialPan を初期ビュー状態として
   * canvas 初期化後に viewportController 経由で一度だけ適用する（REQ-5.6 のビュー状態共有）。
   * ズーム範囲は controller.clampZoom（ZOOM_CONSTANTS）に準拠し、パンは等倍時抑止
   * （isPanEnabled, Req 34.7）に従う。initialZoom/initialPan が未指定の場合は何もしない。
   */
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas || !viewportController) {
      return;
    }
    if (initialViewAppliedRef.current) {
      return;
    }
    if (initialZoom === undefined && initialPan === undefined) {
      return;
    }
    initialViewAppliedRef.current = true;

    if (initialZoom !== undefined) {
      // 表示領域中央を基準に初期倍率を適用（clampZoom はコントローラ内で担保）。
      const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 };
      viewportController.zoomToPoint(center, initialZoom);
    }
    if (initialPan) {
      // 原点（等倍時 translate=0）からの平行移動量として適用（等倍時は内部で抑止）。
      viewportController.pan(initialPan.x, initialPan.y);
    }
    // initialZoom/initialPan は「初期」値のため、canvas/controller の確定時のみ適用する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricCanvas, viewportController]);

  /**
   * 画像URLが変更された場合の再読み込み
   */
  useEffect(() => {
    if (!fabricCanvasRef.current) {
      return;
    }

    // 画像URLが変更された場合のみ再読み込み
    if (prevImageUrlRef.current !== imageUrl && imageUrl) {
      loadImage(fabricCanvasRef.current, imageUrl);
      prevImageUrlRef.current = imageUrl;
    }
  }, [imageUrl, loadImage]);

  // surveyIdは将来の機能拡張で使用予定
  void surveyId;

  /**
   * Undo操作ハンドラ
   */
  const handleUndo = useCallback(() => {
    if (undoManager.canUndo()) {
      undoManager.undo();
    }
  }, [undoManager]);

  /**
   * Redo操作ハンドラ
   */
  const handleRedo = useCallback(() => {
    if (undoManager.canRedo()) {
      undoManager.redo();
    }
  }, [undoManager]);

  /**
   * 背景画像に回転を適用し、キャンバスサイズを調整する
   *
   * @param canvas - Fabric.jsキャンバス
   * @param bgImage - 背景画像
   * @param rotation - 適用する回転角度
   *
   * @requirement 22.3
   */
  const applyImageRotation = useCallback(
    (canvas: FabricCanvas, bgImage: FabricImage, rotation: 0 | 90 | 180 | 270): void => {
      // 元画像の自然サイズ（スケール前）
      const naturalWidth = bgImage.width ?? 0;
      const naturalHeight = bgImage.height ?? 0;
      const scale = bgImage.scaleX ?? 1;

      // 90度/270度の場合は幅と高さが入れ替わる
      const isSwapped = rotation === 90 || rotation === 270;
      const canvasWidth = isSwapped ? naturalHeight * scale : naturalWidth * scale;
      const canvasHeight = isSwapped ? naturalWidth * scale : naturalHeight * scale;

      // キャンバスサイズを調整
      canvas.setDimensions({ width: canvasWidth, height: canvasHeight });

      // 背景画像の回転を設定
      bgImage.set({
        angle: rotation,
        originX: 'center',
        originY: 'center',
        left: canvasWidth / 2,
        top: canvasHeight / 2,
      });

      canvas.renderAll();
    },
    []
  );

  /**
   * Task 101.1 (Req 36.1, 36.2, 36.4, 36.8): コンテナ実寸の変化（モバイルブラウザの
   * アドレスバー伸縮・端末回転・レイアウト変化）に追従してキャンバス寸法を再フィットする。
   *
   * design.md「## Requirements 35-36」の「fitの二重性の分離」に従い、本 effect が所有するのは
   * 「画像→コンテナのフィット」＝キャンバス寸法計算（computeFitScale→setDimensions）のみ。
   * viewport の恒等リセット（controller.fit()＝ズーム/パンのリセット）は Req 33-34 が所有し、
   * ここでは呼ぶのみで canvasViewportController の内部実装は変更しない。
   *
   * 再フィットは「等倍表示中または初期化時のみ」適用する。ユーザーがズーム/パン中
   * （controller.getState().zoom が等倍から乖離）は表示状態を保持し再フィットしない
   * （Req 33.7 整合・Req 36.8 非回帰）。
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const bgImage = backgroundImageRef.current;
    // 画像未ロード時（初期化前・dispose 後）は何もしない。
    if (!canvas || !bgImage) {
      return;
    }
    // 実寸未計測（ResizeObserver 非対応環境・初期 0）では再フィットしない。
    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    // ズーム/パン中（等倍でない）はユーザーの表示状態を保持し、再フィットしない（Req 33.7, 36.8）。
    const controller = viewportControllerRef.current;
    const currentZoom = controller ? controller.getState().zoom : 1;
    if (Math.abs(currentZoom - 1) > REFIT_IDENTITY_ZOOM_EPSILON) {
      return;
    }

    // フィット倍率を再算出する（loadImage と同一の padding / allowUpscale 方針）。
    const padding = 48;
    const naturalWidth = bgImage.width || 1;
    const naturalHeight = bgImage.height || 1;
    const scale = computeFitScale({
      imageWidth: naturalWidth,
      imageHeight: naturalHeight,
      containerWidth,
      containerHeight,
      padding,
      allowUpscale: isMobileRef.current,
    });

    // 背景画像のスケールを更新（保存座標は不変。表示のみに作用＝Req 9 後方互換）。
    bgImage.scale(scale);

    // 回転状態を考慮してキャンバス寸法・画像配置を更新する（Req 22 の回転挙動を非回帰）。
    const rotation = imageRotationRef.current;
    if (rotation !== 0) {
      applyImageRotation(canvas, bgImage, rotation);
    } else {
      const scaledWidth = naturalWidth * scale;
      const scaledHeight = naturalHeight * scale;
      bgImage.set({
        originX: 'center',
        originY: 'center',
        left: scaledWidth / 2,
        top: scaledHeight / 2,
      });
      canvas.setDimensions({ width: scaledWidth, height: scaledHeight });
      canvas.renderAll();
    }

    // 等倍/初期化時のみ viewport を恒等へリセットする（Req 33-34 所有の controller.fit を呼ぶのみ）。
    controller?.fit();
  }, [containerSize.width, containerSize.height, applyImageRotation]);

  /**
   * 背景画像を90度時計回りに回転する
   *
   * - 背景画像のangleを90度加算（累積回転）
   * - 90度/270度の場合はキャンバスの幅と高さを入れ替え
   * - 描画済み注釈オブジェクトの位置・サイズは維持（追従しない）
   * - Undo/Redo履歴に回転操作を記録
   *
   * @requirement 22.1, 22.2, 22.3, 22.6, 22.8
   */
  const handleRotate = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const bgImage = backgroundImageRef.current;
    if (!canvas || !bgImage) return;

    // 1. 回転前の状態を保存（Undo用）
    const prevRotation = imageRotationRef.current;

    // 2. 新しい回転角度を計算（0 → 90 → 180 → 270 → 0）
    const newRotation = ((prevRotation + 90) % 360) as 0 | 90 | 180 | 270;
    imageRotationRef.current = newRotation;

    // 3. 背景画像の回転を適用
    applyImageRotation(canvas, bgImage, newRotation);

    // 4. Undo/Redo履歴に記録（pushWithoutExecuteで既に実行済みの操作を記録）
    undoManager.pushWithoutExecute({
      type: 'rotate',
      execute: () => {
        imageRotationRef.current = newRotation;
        applyImageRotation(canvas, bgImage, newRotation);
        setState((prev) => ({ ...prev, imageRotation: newRotation }));
      },
      undo: () => {
        imageRotationRef.current = prevRotation;
        applyImageRotation(canvas, bgImage, prevRotation);
        setState((prev) => ({ ...prev, imageRotation: prevRotation }));
      },
    });

    // 5. 状態を更新
    setState((prev) => ({ ...prev, imageRotation: newRotation }));
  }, [undoManager, applyImageRotation]);

  /**
   * 保存操作ハンドラ
   *
   * REQ-9.1: 全ての注釈データをデータベースに保存する
   * REQ-9.4: 保存中インジケーターを表示する
   * REQ-9.5: エラーメッセージを表示してリトライを促す
   * 注釈保存後、サムネイルも更新する（注釈付き画像をサムネイルに反映）
   */
  const handleSave = useCallback(async () => {
    if (!fabricCanvasRef.current || state.isSaving) return;

    const canvas = fabricCanvasRef.current;

    // 保存中状態に設定
    setState((prev) => ({ ...prev, isSaving: true, error: null, saveSuccess: false }));

    try {
      // Canvasからオブジェクトを取得（背景画像を除く）
      const objects = canvas.getObjects().filter((obj) => obj !== backgroundImageRef.current);

      // 注釈データを構築（キャンバス寸法と回転角度を含める - PDF/サムネイルでのスケール変換・回転用）
      const annotationData = {
        version: '1.0',
        objects: objects.map((obj) => obj.toObject()),
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
        imageRotation: imageRotationRef.current,
      };

      // APIを呼び出して保存
      const saveResponse = await saveAnnotation(imageId, { data: annotationData });

      // REQ-23.5: レスポンスのannotatedThumbnailUrlをコールバックで通知
      if (onAnnotationSaved) {
        onAnnotationSaved({
          annotatedThumbnailUrl: saveResponse.annotatedThumbnailUrl ?? null,
        });
      }

      // サムネイルを更新（注釈付き画像を反映）
      try {
        // キャンバスを画像としてエクスポート（JPEG形式、品質0.9）
        const imageData = canvas.toDataURL({
          format: 'jpeg',
          quality: 0.9,
          multiplier: 1,
        });
        await updateThumbnail(imageId, imageData);
        console.log('Thumbnail updated with annotations');
      } catch (thumbnailErr) {
        // サムネイル更新に失敗しても注釈保存は成功しているので警告のみ
        console.warn('サムネイルの更新に失敗しました:', thumbnailErr);
      }

      // 保存成功
      setState((prev) => ({ ...prev, isSaving: false, saveSuccess: true }));

      // 3秒後に成功メッセージを消す（unmount 後の setState を防ぐため timer 参照を保持）
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current);
      }
      saveSuccessTimerRef.current = setTimeout(() => {
        saveSuccessTimerRef.current = null;
        if (isDisposedRef.current) return;
        setState((prev) => ({ ...prev, saveSuccess: false }));
      }, 3000);
    } catch (err) {
      // REQ-23.6: THUMBNAIL_REGENERATION_FAILED エラーの判定
      // 注釈保存自体は成功しているが、サムネイル再生成のみ失敗したケース
      if (
        err instanceof ApiError &&
        err.response &&
        typeof err.response === 'object' &&
        (err.response as Record<string, unknown>).code === 'THUMBNAIL_REGENERATION_FAILED'
      ) {
        console.warn('サムネイル再生成に失敗しました:', err);

        // 保存中状態を解除（注釈保存自体は成功しているのでエラー状態にしない）
        setState((prev) => ({ ...prev, isSaving: false }));

        // エラー Toast を表示
        toast.error(
          '注釈は保存されましたがサムネイル再生成に失敗しました。画面を再読み込みしてください。',
          { duration: 8000 }
        );

        // onAnnotationSaved を null で通知（サムネイルURLは取得できなかった）
        if (onAnnotationSaved) {
          onAnnotationSaved({ annotatedThumbnailUrl: null });
        }

        // 画像一覧を強制再取得して旧状態残留を防止
        if (onRequestRefresh) {
          onRequestRefresh();
        }

        return;
      }

      console.error('注釈の保存に失敗しました:', err);
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: err instanceof Error ? err.message : '注釈の保存に失敗しました',
      }));
    }
  }, [imageId, state.isSaving, onAnnotationSaved, onRequestRefresh, toast]);

  /**
   * エクスポートダイアログを開く
   *
   * REQ-12.1: 個別画像のエクスポートボタンで注釈をレンダリングした画像を生成
   * REQ-12.2: JPEG、PNG形式でのエクスポートをサポート
   * REQ-12.3: エクスポート画像の解像度（品質）を選択可能
   * REQ-12.4: 注釈なしの元画像もダウンロード可能
   */
  const handleExport = useCallback(() => {
    // imageInfoがある場合はダイアログを開く
    if (imageInfo) {
      setIsExportDialogOpen(true);
      return;
    }

    // imageInfoがない場合は従来通りPNG形式でエクスポート
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;

    try {
      // 画像をエクスポート（PNG形式）
      const dataUrl = exportImage(canvas, { format: 'png', quality: 1.0 });

      // ファイル名を生成
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `annotation_${imageId}_${timestamp}.png`;

      // ダウンロード
      downloadFile(dataUrl, filename);
    } catch (err) {
      console.error('画像のエクスポートに失敗しました:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : '画像のエクスポートに失敗しました',
      }));
    }
  }, [imageId, imageInfo]);

  /**
   * ImageExportDialogからのエクスポート実行
   *
   * REQ-12.2: JPEG、PNG形式でのエクスポートをサポート
   * REQ-12.3: エクスポート画像の解像度（品質）を選択可能
   */
  const handleExportWithOptions = useCallback(
    (options: ExportOptions) => {
      if (!fabricCanvasRef.current) return;

      setIsExporting(true);

      try {
        const canvas = fabricCanvasRef.current;

        // 品質の数値変換
        const qualityMap: Record<string, number> = {
          low: 0.6,
          medium: 0.8,
          high: 1.0,
        };
        const quality = qualityMap[options.quality] || 0.8;

        // 画像をエクスポート
        const dataUrl = exportImage(canvas, {
          format: options.format,
          quality,
          includeAnnotations: options.includeAnnotations,
        });

        // ファイル名を生成
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = imageInfo?.fileName?.replace(/\.[^/.]+$/, '') || 'annotation';
        const filename = `${baseName}_${timestamp}.${options.format}`;

        // ダウンロード
        downloadFile(dataUrl, filename);

        // ダイアログを閉じる
        setIsExportDialogOpen(false);
      } catch (err) {
        console.error('画像のエクスポートに失敗しました:', err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : '画像のエクスポートに失敗しました',
        }));
      } finally {
        setIsExporting(false);
      }
    },
    [imageInfo?.fileName]
  );

  /**
   * 元画像ダウンロード
   *
   * REQ-12.4: 注釈なしの元画像もダウンロード可能
   */
  const handleDownloadOriginal = useCallback(async () => {
    if (!imageInfo?.originalUrl) return;

    setIsDownloading(true);

    try {
      await downloadOriginalImage(imageInfo.originalUrl, {
        filename: imageInfo.fileName,
      });
      setIsExportDialogOpen(false);
    } catch (err) {
      console.error('元画像のダウンロードに失敗しました:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : '元画像のダウンロードに失敗しました',
      }));
    } finally {
      setIsDownloading(false);
    }
  }, [imageInfo?.originalUrl, imageInfo?.fileName]);

  /**
   * エクスポートダイアログを閉じる
   */
  const handleCloseExportDialog = useCallback(() => {
    setIsExportDialogOpen(false);
  }, []);

  /**
   * キーボードイベントハンドラ
   *
   * Task 13.3: Delete/Backspace/Escapeキーによるオブジェクト操作
   * - Delete/Backspace: 選択中のオブジェクトを削除
   * - Escape: 選択を解除
   * - Ctrl+Z: Undo操作
   * - Ctrl+Shift+Z / Ctrl+Y: Redo操作
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!fabricCanvasRef.current) return;

      const canvas = fabricCanvasRef.current;
      const activeObject = canvas.getActiveObject();

      // テキスト編集中の場合はキー入力を処理しない（ITextに任せる）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (activeObject && (activeObject as any).isEditing) {
        return;
      }

      // Ctrl+Z: Undo (Shiftなし)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Shift+Z または Ctrl+Y: Redo
      if (
        (event.ctrlKey || event.metaKey) &&
        ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y')
      ) {
        event.preventDefault();
        handleRedo();
        return;
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          // 選択中のオブジェクトを削除
          if (activeObject) {
            canvas.remove(activeObject);
            canvas.discardActiveObject();
            canvas.renderAll();
          }
          break;

        case 'Escape':
          // 選択を解除
          if (activeObject) {
            canvas.discardActiveObject();
            canvas.renderAll();
          }
          break;

        /* istanbul ignore next -- @preserve 未処理のキーは無視（defensive coding） */
        default:
          break;
      }
    },
    [handleUndo, handleRedo]
  );

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

      {/* 全体ラッパー */}
      <div style={STYLES.wrapper}>
        {/* ツールバー（readOnlyモードでは非表示） */}
        {!readOnly && (
          <div style={STYLES.toolbarContainer}>
            <AnnotationToolbar
              activeTool={state.activeTool}
              onToolChange={handleToolChange}
              disabled={state.isLoading || state.isSaving}
              styleOptions={state.styleOptions}
              onStyleChange={handleStyleChange}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSave={handleSave}
              onExport={handleExport}
              canUndo={state.canUndo}
              canRedo={state.canRedo}
              onRotate={handleRotate}
            />
          </div>
        )}

        {/* コンテナ */}
        <div
          ref={containerRef}
          style={STYLES.container}
          data-testid="annotation-editor-container"
          data-context-menu-visible={contextMenu.visible ? 'true' : 'false'}
          role="application"
          aria-label={readOnly ? '注釈ビューア' : '注釈エディタ'}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={readOnly ? undefined : handleKeyDown}
        >
          {/* Canvas - 動的に生成されるCanvas要素のコンテナ */}
          {/* Task 96.2 (Req 33.5, 30.1): touch-action:none でブラウザ既定ジェスチャーを抑止 */}
          <div
            ref={canvasWrapperRef}
            style={STYLES.canvasWrapper}
            data-testid="annotation-canvas-wrapper"
          />

          {/* ローディング表示 */}
          {state.isLoading && (
            <div style={STYLES.loadingOverlay}>
              <div role="status" aria-label="読み込み中" style={STYLES.spinner} />
            </div>
          )}

          {/* 保存中表示（readOnlyモードでは非表示） */}
          {!readOnly && state.isSaving && (
            <div style={STYLES.savingOverlay} role="status" aria-label="保存中">
              <div style={STYLES.savingSpinner} />
              <span style={STYLES.savingText}>保存中...</span>
            </div>
          )}

          {/* 保存成功表示（readOnlyモードでは非表示） */}
          {!readOnly && state.saveSuccess && (
            <div style={STYLES.successMessage} role="status" aria-label="保存完了">
              <span style={STYLES.successText}>✓ 保存しました</span>
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

          {/* Task 72.4 (Req 29.7, 29.8): ツール選択後の簡易ガイドオーバーレイ。
              - 画像領域（container）内に配置し、非侵襲的に表示する。
              - 表示制御は state.activeTool に連動した useEffect の idle タイマが担う。 */}
          <AnnotationGuide
            visible={guideVisible}
            toolKind={state.activeTool}
            onDismiss={() => setGuideVisible(false)}
          />
        </div>
      </div>

      {/* Task 96.1 (Req 34.1, 34.2, 34.6, 34.8): ズーム操作コントロール。
          - 編集モードでのみ表示（readOnly では非表示）。canvas/画像準備中（isLoading）は非表示。
          - position: fixed の下部オーバーレイで、背景 canvas の描画ヒット領域外に配置し、
            stopPropagation/preventDefault により描画の誤発火を防ぐ（ZoomControls 内で実装）。
          - 片手到達（Req 34.6）はレイアウトビューポート＝デバイス幅であることが前提。
            ホスト画面側でページ水平 overflow を抑止すること（SiteSurveyImageViewerPage の
            breadcrumbContainer.overflowX を参照）。
          - controller 未生成（canvas 初期化前）は disabled とする。 */}
      {!readOnly && !state.isLoading && (
        <ZoomControls
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={fit}
          disabled={!viewportController}
        />
      )}

      {/* エクスポートダイアログ（REQ-12.2, 12.3, 12.4） */}
      {imageInfo && (
        <ImageExportDialog
          open={isExportDialogOpen}
          imageInfo={imageInfo}
          onExport={handleExportWithOptions}
          onClose={handleCloseExportDialog}
          onDownloadOriginal={handleDownloadOriginal}
          exporting={isExporting}
          downloading={isDownloading}
        />
      )}

      {/* 注釈コンテキストメニュー (Task 72.3, Req 27.2-27.5, 27.7) */}
      <AnnotationContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        targetObject={contextMenu.targetObject}
        onAction={handleContextMenuAction}
        onClose={handleContextMenuClose}
      />
    </>
  );
}

export default AnnotationEditor;
