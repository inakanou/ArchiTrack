/**
 * @fileoverview Canvas描画最適化フック
 *
 * Task 23.2: Canvas描画最適化を実装する
 *
 * - オブジェクトキャッシングの有効化
 * - 不要な再描画の抑制
 * - 大量オブジェクト時の描画パフォーマンス確保
 *
 * Requirements: 14.2 - 注釈の描画・編集操作を60fps以上で応答する
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';

// ============================================================================
// 型定義
// ============================================================================

/**
 * Canvas最適化設定
 */
export interface CanvasOptimizationConfig {
  /** オブジェクトキャッシングを有効化するか */
  enableObjectCaching: boolean;
  /** statefulCacheを有効化するか（オブジェクトの状態変化を検出してキャッシュを更新） */
  enableStatefulCache: boolean;
  /** バッチレンダリングの閾値（この数以上のオブジェクトをまとめて追加する場合にバッチ処理） */
  batchRenderThreshold: number;
  /** 描画デバウンスの時間（ミリ秒）- 60fps = ~16ms */
  renderDebounceMs: number;
  /** 大量オブジェクト時にRetina対応を無効化するか */
  disableRetinaOnManyObjects: boolean;
  /** 大量オブジェクトとみなす閾値 */
  manyObjectsThreshold: number;
}

/**
 * useCanvasOptimizationの戻り値
 */
export interface UseCanvasOptimizationReturn {
  /** 最適化されたレンダリング関数（debounce付き） */
  optimizedRender: () => void;
  /** オブジェクトに最適化設定を適用する関数 */
  applyOptimization: (obj: FabricObject) => void;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * デフォルトの最適化設定
 *
 * Requirements: 14.2 - 注釈の描画・編集操作を60fps以上で応答する
 */
export const DEFAULT_OPTIMIZATION_CONFIG: CanvasOptimizationConfig = {
  enableObjectCaching: true,
  enableStatefulCache: false,
  batchRenderThreshold: 50,
  renderDebounceMs: 16, // ~60fps (1000ms / 60 ≈ 16.67ms)
  disableRetinaOnManyObjects: true,
  manyObjectsThreshold: 100,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * オブジェクトにキャッシング設定を適用する
 *
 * Fabric.jsのオブジェクトキャッシングを有効化し、再描画パフォーマンスを向上させます。
 * キャッシュが有効な場合、オブジェクトは一度オフスクリーンキャンバスにレンダリングされ、
 * その後の描画ではキャッシュ画像が使用されます。
 *
 * @param obj - Fabric.jsオブジェクト
 * @param config - 最適化設定（省略時はデフォルト設定）
 */
export function applyObjectCaching(
  obj: FabricObject,
  config: Partial<CanvasOptimizationConfig> = {}
): void {
  const mergedConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

  obj.set({
    objectCaching: mergedConfig.enableObjectCaching,
    statefullCache: mergedConfig.enableStatefulCache,
  });

  // キャッシュを再構築するためにdirtyフラグを設定
  obj.dirty = true;
}

/**
 * オブジェクトのキャッシングを無効化する
 *
 * クリーンアップ時やキャッシュが不要な場合に使用します。
 *
 * @param obj - Fabric.jsオブジェクト
 */
export function disableObjectCaching(obj: FabricObject): void {
  obj.set({
    objectCaching: false,
    statefullCache: false,
  });
  obj.dirty = true;
}

/**
 * 複数オブジェクトをバッチで追加する
 *
 * renderOnAddRemoveを一時的に無効化し、複数オブジェクトを追加した後に
 * 1回だけrenderAllを呼び出すことで、パフォーマンスを向上させます。
 *
 * @param canvas - Fabric.jsキャンバス
 * @param objects - 追加するオブジェクトの配列
 * @param config - 最適化設定（省略時はデフォルト設定）
 */
export function batchRenderObjects(
  canvas: FabricCanvas,
  objects: FabricObject[],
  config: Partial<CanvasOptimizationConfig> = {}
): void {
  if (objects.length === 0) {
    return;
  }

  // 元の設定を保存
  const originalRenderOnAddRemove = canvas.renderOnAddRemove;

  try {
    // 一時的にrenderOnAddRemoveを無効化
    canvas.renderOnAddRemove = false;

    // オブジェクトを追加（各オブジェクトにキャッシング設定を適用）
    for (const obj of objects) {
      applyObjectCaching(obj, config);
      canvas.add(obj);
    }

    // 最後に1回だけレンダリング
    canvas.renderAll();
  } finally {
    // 設定を復元
    canvas.renderOnAddRemove = originalRenderOnAddRemove;
  }
}

/**
 * 大量オブジェクト時のCanvas最適化を適用する
 *
 * オブジェクト数が閾値を超えた場合、以下の最適化を適用します：
 * - renderOnAddRemove: false（オブジェクト追加時の自動再描画を無効化）
 * - skipTargetFind: true（マウスイベントでのターゲット検索をスキップ）
 * - enableRetinaScaling: false（Retina対応を無効化）
 *
 * @param canvas - Fabric.jsキャンバス
 * @param config - 最適化設定（省略時はデフォルト設定）
 * @returns クリーンアップ関数（元の設定に戻す）
 */
export function optimizeCanvasForManyObjects(
  canvas: FabricCanvas,
  config: Partial<CanvasOptimizationConfig> = {}
): () => void {
  const mergedConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
  const objectCount = canvas.getObjects().length;

  // オブジェクト数が閾値以下の場合は何もしない
  if (objectCount <= mergedConfig.manyObjectsThreshold) {
    return () => {
      // 何もしないクリーンアップ関数
    };
  }

  // 元の設定を保存
  const originalSettings = {
    renderOnAddRemove: canvas.renderOnAddRemove,
    skipTargetFind: canvas.skipTargetFind,
    enableRetinaScaling: canvas.enableRetinaScaling,
  };

  // 最適化設定を適用
  canvas.renderOnAddRemove = false;
  canvas.skipTargetFind = true;

  if (mergedConfig.disableRetinaOnManyObjects) {
    canvas.enableRetinaScaling = false;
  }

  // クリーンアップ関数を返す
  return () => {
    canvas.renderOnAddRemove = originalSettings.renderOnAddRemove;
    canvas.skipTargetFind = originalSettings.skipTargetFind;
    canvas.enableRetinaScaling = originalSettings.enableRetinaScaling;
  };
}

/**
 * Canvas最適化のクリーンアップを行う
 *
 * すべてのオブジェクトのキャッシングを無効化します。
 *
 * @param canvas - Fabric.jsキャンバス
 */
export function cleanupCanvasOptimization(canvas: FabricCanvas): void {
  const objects = canvas.getObjects();
  for (const obj of objects) {
    disableObjectCaching(obj);
  }
}

// ============================================================================
// フック
// ============================================================================

/**
 * Canvas描画最適化フック
 *
 * Fabric.js Canvasの描画パフォーマンスを最適化するためのカスタムフックです。
 *
 * Requirements: 14.2 - 注釈の描画・編集操作を60fps以上で応答する
 *
 * @param canvas - Fabric.jsキャンバス（nullの場合は何もしない）
 * @param config - 最適化設定（省略時はデフォルト設定）
 * @returns 最適化されたレンダリング関数とオブジェクト最適化関数
 *
 * @example
 * ```tsx
 * const { optimizedRender, applyOptimization } = useCanvasOptimization(fabricCanvas);
 *
 * // 新しいオブジェクトを追加する際に最適化を適用
 * const rect = new Rect({ ... });
 * applyOptimization(rect);
 * canvas.add(rect);
 *
 * // 複数回の変更後にまとめてレンダリング
 * optimizedRender();
 * ```
 */
export function useCanvasOptimization(
  canvas: FabricCanvas | null,
  config: Partial<CanvasOptimizationConfig> = {}
): UseCanvasOptimizationReturn {
  const mergedConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

  // debounce用のタイマー参照
  const debounceTimerRef = useRef<number | null>(null);

  // 設定の参照（コールバック内で最新の値を参照するため）
  const configRef = useRef(mergedConfig);

  // useEffectでconfigRefを更新（レンダリング中のref更新を避ける）
  useEffect(() => {
    configRef.current = mergedConfig;
  });

  /**
   * 最適化されたレンダリング関数
   *
   * 複数回呼び出されてもdebounce時間内は1回だけrenderAllを実行します。
   */
  const optimizedRender = useCallback(() => {
    if (!canvas) {
      return;
    }

    // 既存のタイマーをクリア
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    // debounce付きでレンダリング
    debounceTimerRef.current = window.setTimeout(() => {
      canvas.requestRenderAll();
      debounceTimerRef.current = null;
    }, configRef.current.renderDebounceMs);
  }, [canvas]);

  /**
   * オブジェクトに最適化設定を適用する関数
   */
  const applyOptimization = useCallback(
    (obj: FabricObject) => {
      applyObjectCaching(obj, configRef.current);
    },
    [] // configRef経由で最新の設定を参照するため依存配列は空
  );

  /**
   * クリーンアップ
   *
   * コンポーネントがアンマウントされる際に、タイマーをクリアし、
   * キャッシングを無効化します。
   */
  useEffect(() => {
    return () => {
      // タイマーをクリア
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // キャッシングを無効化
      if (canvas) {
        cleanupCanvasOptimization(canvas);
      }
    };
  }, [canvas]);

  return {
    optimizedRender,
    applyOptimization,
  };
}

export default useCanvasOptimization;
