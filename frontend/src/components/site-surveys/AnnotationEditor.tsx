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
import { GUIDE_IDLE_MS } from './gestures/gesture-thresholds';
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

  // Fabric.js と UndoManager の連携フック
  // fabricCanvasRef.currentを使用（Canvasがない場合はnull）
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
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
        const maxWidth = containerWidth - padding;
        const maxHeight = containerHeight - padding;

        // 画像サイズを計算
        const imgWidth = img.width || 1;
        const imgHeight = img.height || 1;
        const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

        // スケールを設定
        img.scale(scale);

        // 背景画像として設定する前に選択不可・移動不可に設定
        img.set({
          selectable: false,
          evented: false,
        });

        // Canvasサイズを設定（Fabric.js v6互換）
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

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
   * Task 72.2 (Req 27.1): ダブルタップハンドラ
   *
   * touchGestureManager が発火する `custom:dbltap` を受け、target が TextAnnotation 系
   * (`textAnnotation` / `i-text` / `text`) であれば `enterEditing()` を呼んで編集モードに
   * 遷移させる。マウス環境の `mouse:dblclick` は既存のセットアップで維持されている
   * （Req 27.8 後方互換）。
   */
  const handleDoubleTap = useCallback((payload: GesturePayload) => {
    const target = payload.target as { type?: string; enterEditing?: () => void } | undefined;
    if (!target) {
      return;
    }
    if (target.type === 'textAnnotation' || target.type === 'i-text' || target.type === 'text') {
      target.enterEditing?.();
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

      // Task 72.1 (Req 27.1, 27.2, 30.1): touchGestureManager を canvas にアタッチ
      // getCurrentTool は activeToolRef.current を返し、ハンドラ側で Req 17 調停に使う。
      // touchGestureManager は FabricCanvasLike（fire/getElement の最小サーフェス）を要求する。
      // Fabric の Canvas.fire はイベント名に union 型を要求するため、
      // custom:dbltap / custom:longpress など拡張イベントを扱う本 manager へは構造的に
      // 満たされる形でキャストして渡す。
      const gestureManager = createTouchGestureManager();
      touchGestureDetachRef.current = gestureManager.attach(
        canvas as unknown as import('./gestures/touchGestureManager').FabricCanvasLike,
        () => activeToolRef.current
      );

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

      // Task 72.1: touchGestureManager を detach（canvas dispose 前にリスナーを解除）
      if (touchGestureDetachRef.current) {
        try {
          touchGestureDetachRef.current();
        } catch (err) {
          console.warn('Error during touch gesture manager detach:', err);
        }
        touchGestureDetachRef.current = null;
      }

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

      // 3秒後に成功メッセージを消す
      setTimeout(() => {
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
          <div ref={canvasWrapperRef} style={STYLES.canvasWrapper} />

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
