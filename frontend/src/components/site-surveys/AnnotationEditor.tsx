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
import { Canvas as FabricCanvas, FabricImage } from 'fabric';
import AnnotationToolbar, { type ToolType } from './AnnotationToolbar';

// ============================================================================
// 型定義
// ============================================================================

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
  });

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

  /**
   * ツール変更ハンドラ
   *
   * Task 13.3: ツール切り替え時にオブジェクト選択を解除
   */
  const handleToolChange = useCallback((tool: ToolType) => {
    // ツールを変更
    setState((prev) => ({ ...prev, activeTool: tool }));

    // Task 13.3: 選択ツール以外に切り替える場合、現在の選択を解除
    if (tool !== 'select' && fabricCanvasRef.current) {
      fabricCanvasRef.current.discardActiveObject();
      fabricCanvasRef.current.renderAll();
    }

    // Task 13.3: Canvasの選択モードを設定
    if (fabricCanvasRef.current) {
      // selectツールの場合は選択を有効化、それ以外は無効化
      fabricCanvasRef.current.selection = tool === 'select';
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
   * - selection:created/updated/cleared: オブジェクト選択の変更
   * - object:moving/modified/scaling: オブジェクトの移動・変更・リサイズ
   */
  const setupEventListeners = useCallback((canvas: FabricCanvas) => {
    // 基本的なマウスイベント
    canvas.on('mouse:down', () => {
      // マウスダウンイベント
    });

    canvas.on('mouse:move', () => {
      // マウス移動イベント
    });

    canvas.on('mouse:up', () => {
      // マウスアップイベント
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
   * キーボードイベントハンドラ
   *
   * Task 13.3: Delete/Backspace/Escapeキーによるオブジェクト操作
   * - Delete/Backspace: 選択中のオブジェクトを削除
   * - Escape: 選択を解除
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const activeObject = canvas.getActiveObject();

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
  }, []);

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
