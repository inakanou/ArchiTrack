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
}: AnnotationEditorProps): React.JSX.Element {
  // DOM参照 - Canvas要素を動的に挿入するコンテナ
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fabric.js Canvas参照
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // 背景画像参照
  const backgroundImageRef = useRef<FabricImage | null>(null);

  // Canvas dispose状態を追跡（React StrictModeでの二重マウント対応）
  const isDisposedRef = useRef(false);

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
  });

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
  const loadImage = useCallback(async (canvas: FabricCanvas, url: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // 画像を読み込み
      const img = await FabricImage.fromURL(url, {
        crossOrigin: 'anonymous',
      });

      // 非同期処理後、Canvasがdisposeされていないか確認
      // また、渡されたcanvasインスタンスが現在のcanvasと同じかも確認
      // （React StrictModeで古いcanvasインスタンスのクロージャが実行される可能性がある）
      if (isDisposedRef.current || !fabricCanvasRef.current || fabricCanvasRef.current !== canvas) {
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
      if (isDisposedRef.current || !fabricCanvasRef.current || fabricCanvasRef.current !== canvas) {
        console.warn('Canvas has been disposed or replaced during image processing');
        return;
      }

      canvas.setDimensions({ width: scaledWidth, height: scaledHeight });

      // 背景画像として設定（Fabric.js v6 API）
      canvas.backgroundImage = img;
      // 背景画像の参照を保存
      backgroundImageRef.current = img;

      canvas.renderAll();

      setState((prev) => ({ ...prev, isLoading: false, error: null }));
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
  }, []);

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
  const setupEventListeners = useCallback((canvas: FabricCanvas) => {
    // マウスダウンイベント - ドラッグ開始または多角形/折れ線の頂点追加
    canvas.on('mouse:down', (options: TPointerEventInfo<TPointerEvent>) => {
      // Fabric.js v6ではoptions.pointerを使用（キャンバス座標）
      const pointer = options.pointer;
      const activeTool = activeToolRef.current;
      if (!pointer) {
        return;
      }

      // 選択ツールまたはフリーハンドの場合は何もしない
      if (activeTool === 'select' || activeTool === 'freehand') {
        return;
      }

      // 既存のオブジェクト上でクリックした場合は描画を開始しない
      // これにより、オブジェクト変形中に新規図形が作成されることを防ぐ
      // 注意: evented: falseのオブジェクトではoptions.targetがnullになるため、
      // すべてのオブジェクトの位置を直接チェックする
      const objects = canvas.getObjects();
      for (const obj of objects) {
        // 背景画像はスキップ
        if (obj === backgroundImageRef.current) continue;
        // プレビュー図形はスキップ（多角形・折れ線の描画中プレビュー）
        if (obj === previewShapeRef.current) continue;
        // ポインターがオブジェクトの範囲内にあるかチェック
        if (obj.containsPoint(pointer)) {
          // テキストツールの場合、編集フラグをリセット
          if (activeTool === 'text') {
            editingTextRef.current = false;
          }
          return; // 既存オブジェクト上では描画を開始しない
        }
      }

      // アクティブなオブジェクト（選択中のオブジェクト）がある場合も描画を開始しない
      // これにより、選択状態が残っている場合の意図しない描画を防ぐ
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        // テキストツールの場合、編集フラグをリセット
        if (activeTool === 'text') {
          editingTextRef.current = false;
        }
        return;
      }

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
      const pointer = options.pointer;
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

      // オブジェクト上でマウスアップした場合は図形を作成しない
      // これにより、既存オブジェクトの操作時に新規図形が作成されることを防ぐ
      // 注意: evented: falseのオブジェクトではoptions.targetがnullになるため、
      // すべてのオブジェクトの位置を直接チェックする
      const pointer = options.pointer;
      if (pointer) {
        const objects = canvas.getObjects();
        for (const obj of objects) {
          if (obj === backgroundImageRef.current) continue;
          if (obj.containsPoint(pointer)) {
            dragStateRef.current = { isDragging: false, startPoint: null };
            return; // 既存オブジェクト上では図形を作成しない
          }
        }
      }

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
      canvas = new FabricCanvas(canvasElement, {
        selection: false, // 背景画像が選択されないように
        renderOnAddRemove: true,
        width: containerWidth,
        height: containerHeight,
      });

      fabricCanvasRef.current = canvas;

      // Fabric.js と UndoManager の連携用にCanvasを状態に設定
      setFabricCanvas(canvas);

      // E2Eテスト用にwindowオブジェクトにキャンバスを公開
      if (typeof window !== 'undefined') {
        window.__fabricCanvas = canvas;
      }

      // イベントリスナーを設定
      setupEventListeners(canvas);

      // 画像を読み込み
      if (imageUrl) {
        loadImage(canvas, imageUrl);
        prevImageUrlRef.current = imageUrl;
      }
    } catch (err) {
      console.error('Failed to initialize Fabric.js canvas:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'キャンバスの初期化に失敗しました',
      }));
    }

    // クリーンアップ（dispose処理）
    return () => {
      // dispose状態を設定（非同期処理をキャンセル）
      isDisposedRef.current = true;
      if (canvas) {
        try {
          // イベントリスナーを解除
          removeEventListeners(canvas);
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
  }, [loadImage, setupEventListeners, removeEventListeners]);

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

  // imageIdとsurveyIdは将来の注釈データ保存・取得で使用予定
  // 現時点ではコンポーネントのpropsとして受け取るのみ
  void imageId;
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
        {/* ツールバー */}
        <div style={STYLES.toolbarContainer}>
          <AnnotationToolbar
            activeTool={state.activeTool}
            onToolChange={handleToolChange}
            disabled={state.isLoading}
            styleOptions={state.styleOptions}
            onStyleChange={handleStyleChange}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={state.canUndo}
            canRedo={state.canRedo}
          />
        </div>

        {/* コンテナ */}
        <div
          ref={containerRef}
          style={STYLES.container}
          data-testid="annotation-editor-container"
          role="application"
          aria-label="注釈エディタ"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {/* Canvas - 動的に生成されるCanvas要素のコンテナ */}
          <div ref={canvasWrapperRef} style={STYLES.canvasWrapper} />

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
                画像の読み込みに失敗しました: {state.error}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AnnotationEditor;
