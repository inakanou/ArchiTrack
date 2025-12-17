/**
 * @fileoverview 注釈エディタ基盤コンポーネント
 *
 * Task 13.1: Fabric.js Canvas統合を実装する
 *
 * useRef + useEffectによるCanvas初期化、dispose処理の実装（クリーンアップ）、
 * 背景画像の設定を行うコンポーネントです。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';

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
}

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  container: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
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
 */
function AnnotationEditor({
  imageUrl,
  imageId,
  surveyId,
}: AnnotationEditorProps): React.JSX.Element {
  // DOM参照
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fabric.js Canvas参照
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);

  // 背景画像参照
  const backgroundImageRef = useRef<FabricImage | null>(null);

  // 状態管理
  const [state, setState] = useState<AnnotationEditorState>({
    isLoading: true,
    error: null,
  });

  // 前回のimageUrl参照（変更検知用）
  const prevImageUrlRef = useRef<string | null>(null);

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

      // 背景画像として設定する前に選択不可・移動不可に設定
      img.set({
        selectable: false,
        evented: false,
      });

      // Canvasサイズを設定
      const scaledWidth = imgWidth * scale;
      const scaledHeight = imgHeight * scale;
      canvas.setWidth(scaledWidth);
      canvas.setHeight(scaledHeight);

      // 背景画像として設定（Fabric.js v6 API）
      canvas.backgroundImage = img;
      // 背景画像の参照を保存
      backgroundImageRef.current = img;

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
   * Canvasイベントリスナーを設定
   */
  const setupEventListeners = useCallback((canvas: FabricCanvas) => {
    // 基本的なイベントリスナーを設定
    // Task 13.2以降で具体的なツール操作イベントを追加予定
    canvas.on('mouse:down', () => {
      // マウスダウンイベント
    });

    canvas.on('mouse:move', () => {
      // マウス移動イベント
    });

    canvas.on('mouse:up', () => {
      // マウスアップイベント
    });
  }, []);

  /**
   * Canvasイベントリスナーを解除
   */
  const removeEventListeners = useCallback((canvas: FabricCanvas) => {
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
  }, []);

  /**
   * Fabric.js Canvasの初期化
   */
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    // Canvasを初期化
    const canvas = new FabricCanvas(canvasRef.current, {
      selection: false, // 背景画像が選択されないように
      renderOnAddRemove: true,
    });

    fabricCanvasRef.current = canvas;

    // 初期サイズを設定
    const containerWidth = containerRef.current?.clientWidth || 800;
    const containerHeight = containerRef.current?.clientHeight || 600;
    canvas.setWidth(containerWidth);
    canvas.setHeight(containerHeight);

    // イベントリスナーを設定
    setupEventListeners(canvas);

    // 画像を読み込み
    if (imageUrl) {
      loadImage(canvas, imageUrl);
      prevImageUrlRef.current = imageUrl;
    }

    // クリーンアップ（dispose処理）
    return () => {
      // イベントリスナーを解除
      removeEventListeners(canvas);
      // Canvasをdispose
      canvas.dispose();
      fabricCanvasRef.current = null;
      backgroundImageRef.current = null;
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

      {/* コンテナ */}
      <div
        ref={containerRef}
        style={STYLES.container}
        data-testid="annotation-editor-container"
        role="application"
        aria-label="注釈エディタ"
      >
        {/* Canvas */}
        <div style={STYLES.canvasWrapper}>
          <canvas ref={canvasRef} />
        </div>

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
    </>
  );
}

export default AnnotationEditor;
